-- Flame Chick order status command V1.
-- Staff-authorized, row-locked transitions for POS kitchen and fulfilment stages.
-- Rider delivery/return and all payment collection remain in their dedicated RPCs.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'FLAME_CHICK_ORDER_STATUS_COMMAND_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regclass('public.orders') IS NULL
     OR pg_catalog.to_regclass('public.order_status_history') IS NULL
     OR pg_catalog.to_regclass('public.delivery_tasks') IS NULL
     OR pg_catalog.to_regclass('public.delivery_task_offers') IS NULL
     OR pg_catalog.to_regclass('public.delivery_task_events') IS NULL
     OR pg_catalog.to_regprocedure('app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_ORDER_STATUS_DEPENDENCY_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_update_order_status(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_ORDER_STATUS_RPC_ALREADY_EXISTS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.orders'::regclass
      AND conname='orders_cancel_audit_check'
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_ORDER_CANCEL_AUDIT_CONSTRAINT_MISSING';
  END IF;
END
$preflight$;

-- Managers may cancel with a reason and actor/time audit. Cashiers may reject
-- new orders, but cannot cancel them. No role receives row deletion permission.
ALTER TABLE public.orders
  DROP CONSTRAINT orders_cancel_audit_check,
  ADD CONSTRAINT orders_cancel_audit_check CHECK (
    (cancelled_at IS NULL AND cancelled_by_type IS NULL AND cancelled_by_user_id IS NULL AND cancellation_reason IS NULL)
    OR
    (cancelled_at IS NOT NULL AND cancelled_by_type IS NOT NULL
      AND cancelled_by_type IN ('admin','owner','manager','system')
      AND cancelled_by_user_id IS NOT NULL
      AND cancellation_reason IS NOT NULL
      AND char_length(btrim(cancellation_reason)) BETWEEN 1 AND 500)
  );

CREATE OR REPLACE FUNCTION public.flame_chick_update_order_status(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_order_id uuid;
  v_actor_id uuid;
  v_request_id uuid;
  v_target text;
  v_reason text;
  v_role text;
  v_order public.orders%ROWTYPE;
  v_probe public.orders%ROWTYPE;
  v_task public.delivery_tasks%ROWTYPE;
  v_history public.order_status_history%ROWTYPE;
  v_now timestamptz:=pg_catalog.transaction_timestamp();
  v_fingerprint text;
  v_action text:='order_status_updated';
  v_previous_status text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_REQUEST_INVALID','message','An order status request is required.'));
  END IF;

  IF COALESCE(p_payload->>'order_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'actor_user_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_IDENTIFIERS_INVALID','message','A valid order and verified staff actor are required.'));
  END IF;

  BEGIN
    v_order_id:=(p_payload->>'order_id')::uuid;
    v_actor_id:=(p_payload->>'actor_user_id')::uuid;
    v_request_id:=CASE
      WHEN COALESCE(p_payload->>'request_id','') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (p_payload->>'request_id')::uuid
      ELSE pg_catalog.gen_random_uuid()
    END;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_IDENTIFIERS_INVALID','message','The order status identifiers are invalid.'));
  END;

  v_target:=pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payload->>'to_status','')));
  v_reason:=NULLIF(pg_catalog.btrim(COALESCE(p_payload->>'reason','')),'');
  IF v_target NOT IN ('accepted','preparing','ready','collected','served','rejected','cancelled') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TARGET_INVALID','message','This status must be handled by the dedicated delivery or payment command.'));
  END IF;
  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason)>500 THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_REASON_TOO_LONG','message','The reason must be 500 characters or fewer.'));
  END IF;
  IF v_target IN ('rejected','cancelled') AND v_reason IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_REASON_REQUIRED','message','A reason is required to reject or cancel an order.'));
  END IF;

  SELECT o.* INTO v_probe
  FROM public.orders o
  WHERE o.id=v_order_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_NOT_FOUND','message','The order could not be found.'));
  END IF;

  -- Keep the same lock order as delivery commands (task, then order) whenever
  -- a cancellation/rejection must close a not-yet-dispatched delivery task.
  IF v_probe.fulfillment_type='delivery' AND v_target IN ('rejected','cancelled') THEN
    SELECT dt.* INTO v_task
    FROM public.delivery_tasks dt
    WHERE dt.order_id=v_order_id
    FOR UPDATE;
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id=v_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_NOT_FOUND','message','The order could not be found.'));
  END IF;

  v_role:=app_private.flame_chick_delivery_staff_role(
    v_actor_id,v_order.restaurant_id,v_order.branch_id
  );
  IF v_role IS NULL OR v_role NOT IN ('admin','owner','manager','cashier') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','STAFF_ROLE_REQUIRED','message','An active authorized Flame Chick POS role for this branch is required.'));
  END IF;

  IF v_target='cancelled' AND v_role NOT IN ('admin','owner','manager') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_CANCEL_ROLE_REQUIRED','message','Only an Admin, Owner or Manager may cancel an order.'));
  END IF;

  v_fingerprint:=pg_catalog.md5(
    v_order_id::text||'|'||v_target||'|'||COALESCE(v_reason,'')
  );

  SELECT h.* INTO v_history
  FROM public.order_status_history h
  WHERE h.order_id=v_order_id AND h.request_id=v_request_id
  LIMIT 1;
  IF FOUND THEN
    IF v_history.action IS DISTINCT FROM v_action
       OR v_history.metadata->>'request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','ORDER_STATUS_IDEMPOTENCY_CONFLICT','message','This status request ID was already used with different details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,'order_id',v_order.id,
      'order_number',v_order.order_number,'status',v_order.status,
      'updated_at',v_order.updated_at,'request_id',v_request_id
    );
  END IF;

  v_previous_status:=v_order.status;

  IF v_order.status=v_target THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,'order_id',v_order.id,
      'order_number',v_order.order_number,'status',v_order.status,
      'updated_at',v_order.updated_at,'request_id',v_request_id
    );
  END IF;

  IF v_target='accepted' AND v_order.status NOT IN ('new','needs_confirmation') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only a new or Needs Confirmation order can be accepted.'));
  ELSIF v_target='preparing' AND v_order.status<>'accepted' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only an accepted order can move to Preparing.'));
  ELSIF v_target='ready' AND v_order.status<>'preparing' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only a Preparing order can move to Ready.'));
  ELSIF v_target='collected' AND (v_order.status<>'ready' OR v_order.fulfillment_type<>'pickup') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only a Ready Takeaway order can be marked Collected.'));
  ELSIF v_target='served' AND (v_order.status<>'ready' OR v_order.fulfillment_type<>'dine_in') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only a Ready Dine-in order can be marked Served.'));
  ELSIF v_target='rejected' AND v_order.status NOT IN ('new','needs_confirmation') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','Only a new or Needs Confirmation order can be rejected.'));
  ELSIF v_target='cancelled' AND v_order.status NOT IN ('new','needs_confirmation','accepted','preparing','ready') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_TRANSITION_INVALID','message','This order has moved too far through fulfilment to be cancelled.'));
  END IF;

  IF v_target IN ('rejected','cancelled') AND
     (v_order.paid_amount>0 OR v_order.payment_status IN ('paid','partially_paid','partially_refunded','refunded')) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','ORDER_STATUS_PAYMENT_REVERSAL_REQUIRED','message','This order has a recorded payment. Use the approved refund/finance workflow instead of cancelling it.'));
  END IF;

  IF v_target IN ('rejected','cancelled') AND v_order.fulfillment_type='delivery' THEN
    IF v_task.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_TASK_NOT_FOUND','message','The delivery task is missing; the order cannot be rejected or cancelled safely.'));
    END IF;
    IF v_task.status NOT IN ('dispatch_pending','offering')
       OR EXISTS(SELECT 1 FROM public.delivery_assignments da WHERE da.delivery_task_id=v_task.id AND da.is_current) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_ALREADY_DISPATCHED','message','A delivery already assigned to a Rider must use the delivery failure and physical return workflow.'));
    END IF;

    UPDATE public.delivery_task_offers o
    SET status='withdrawn',responded_at=v_now,
        response_reason=CASE WHEN v_target='rejected' THEN 'Order rejected by staff' ELSE 'Order cancelled by staff' END
    WHERE o.delivery_task_id=v_task.id AND o.status='offered';

    UPDATE public.delivery_tasks
    SET status='cancelled',updated_at=v_now
    WHERE id=v_task.id AND status IN ('dispatch_pending','offering');

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,event_type,from_status,to_status,
      actor_user_id,actor_type,actor_role,reason_code,reason,metadata,request_id,occurred_at
    ) VALUES(
      v_order.restaurant_id,v_order.branch_id,v_task.id,
      CASE WHEN v_target='rejected' THEN 'order_rejected' ELSE 'order_cancelled' END,
      v_task.status,'cancelled',v_actor_id,'staff',v_role,
      CASE WHEN v_target='rejected' THEN 'ORDER_REJECTED' ELSE 'ORDER_CANCELLED' END,
      v_reason,pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
    );
  END IF;

  UPDATE public.orders o
  SET status=v_target,
      accepted_by=CASE WHEN v_target='accepted' THEN v_actor_id ELSE o.accepted_by END,
      accepted_at=CASE WHEN v_target='accepted' THEN v_now ELSE o.accepted_at END,
      preparing_at=CASE WHEN v_target='preparing' THEN v_now ELSE o.preparing_at END,
      ready_at=CASE WHEN v_target='ready' THEN v_now ELSE o.ready_at END,
      collected_at=CASE WHEN v_target='collected' THEN v_now ELSE o.collected_at END,
      served_at=CASE WHEN v_target='served' THEN v_now ELSE o.served_at END,
      rejected_by=CASE WHEN v_target='rejected' THEN v_actor_id ELSE o.rejected_by END,
      rejected_at=CASE WHEN v_target='rejected' THEN v_now ELSE o.rejected_at END,
      rejection_reason=CASE WHEN v_target='rejected' THEN v_reason ELSE o.rejection_reason END,
      cancelled_at=CASE WHEN v_target='cancelled' THEN v_now ELSE o.cancelled_at END,
      cancelled_by_type=CASE WHEN v_target='cancelled' THEN v_role ELSE o.cancelled_by_type END,
      cancelled_by_user_id=CASE WHEN v_target='cancelled' THEN v_actor_id ELSE o.cancelled_by_user_id END,
      cancellation_reason=CASE WHEN v_target='cancelled' THEN v_reason ELSE o.cancellation_reason END,
      last_status_changed_by=v_actor_id,
      last_status_actor_type='staff',
      last_status_change_reason=v_reason,
      updated_at=v_now
  WHERE o.id=v_order.id
  RETURNING o.* INTO v_order;

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_user_id,actor_type,actor_role,reason_code,reason,metadata,request_id,changed_at
  ) VALUES(
    v_order.restaurant_id,v_order.branch_id,v_order.id,
    v_previous_status,
    v_target,v_action,v_actor_id,'staff',v_role,
    'ORDER_STATUS_'||pg_catalog.upper(v_target),v_reason,
    pg_catalog.jsonb_build_object(
      'request_fingerprint',v_fingerprint,'fulfillment_type',v_order.fulfillment_type,
      'payment_status',v_order.payment_status
    ),v_request_id,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,'order_id',v_order.id,
    'order_number',v_order.order_number,'status',v_order.status,
    'updated_at',v_order.updated_at,'from_status',v_previous_status,
    'to_status',v_order.status,'request_id',v_request_id,'actor_role',v_role
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_update_order_status(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_update_order_status(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_update_order_status(jsonb) TO service_role;

DO $security$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_update_order_status(jsonb)');
BEGIN
  IF v_oid IS NULL
     OR pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc WHERE oid=v_oid))<>'postgres'
     OR NOT pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_ORDER_STATUS_RPC_SECURITY_INVALID';
  END IF;
END
$security$;

COMMENT ON FUNCTION public.flame_chick_update_order_status(jsonb) IS
  'Service-only, row-locked POS status transitions. Accept/preparing/ready/collected/served/reject/cancel only; delivery and payment completion use dedicated RPCs.';

COMMIT;
