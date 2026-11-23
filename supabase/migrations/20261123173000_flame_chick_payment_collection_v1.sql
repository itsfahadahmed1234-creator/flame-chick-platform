-- Flame Chick payment collection V1.
-- Source-only candidate. The trusted Order Edge Function derives actor_user_id
-- from the verified Auth token and invokes this service_role-only transaction.
-- Rider delivery and physical return do not collect payment or complete orders.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'FLAME_CHICK_PAYMENT_COLLECTION_REQUIRES_POSTGRES';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_collect_order_payment(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_PAYMENT_COLLECTION_RPC_ALREADY_EXISTS';
  END IF;
  IF pg_catalog.to_regprocedure('app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_PAYMENT_STAFF_ROLE_HELPER_MISSING';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.flame_chick_collect_order_payment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_order_id uuid;
  v_actor_id uuid;
  v_request_id uuid;
  v_amount numeric(12,2);
  v_method text;
  v_role text;
  v_order public.orders%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment_id uuid;
  v_now timestamptz;
  v_next_paid numeric(12,2);
  v_next_balance numeric(12,2);
  v_complete boolean;
  v_method_summary text;
  v_action text;
  v_reason text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_REQUEST_INVALID','message','A payment collection request is required.'));
  END IF;

  IF COALESCE(p_payload->>'order_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'actor_user_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_payload->>'request_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_IDENTIFIERS_INVALID','message','Order, staff and request identifiers must be valid UUIDs.'));
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_AMOUNT_INVALID','message','Enter a valid numeric payment amount.'));
  END IF;

  BEGIN
    v_order_id := (p_payload->>'order_id')::uuid;
    v_actor_id := (p_payload->>'actor_user_id')::uuid;
    v_request_id := (p_payload->>'request_id')::uuid;
    v_amount := (p_payload->>'amount')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_REQUEST_INVALID','message','The payment request contains an invalid value.'));
  END;

  IF v_amount<=0 OR v_amount<>pg_catalog.round(v_amount,2) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_AMOUNT_INVALID','message','Payment amount must be greater than zero and use at most two decimal places.'));
  END IF;

  v_method := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payload->>'payment_method','')));
  IF v_method NOT IN ('cash','card','bank','wallet','other') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_METHOD_INVALID','message','Choose cash, card, bank, wallet or other.'));
  END IF;

  -- Lock the canonical order first. Competing partial/full collections on one
  -- order serialize here, so no caller can over-collect a stale balance.
  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id=v_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_ORDER_NOT_FOUND','message','The order was not found.'));
  END IF;

  v_role := app_private.flame_chick_delivery_staff_role(
    v_actor_id,v_order.restaurant_id,v_order.branch_id
  );
  IF v_role IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_STAFF_REQUIRED','message','An active Admin, Owner, Manager or Cashier for this branch is required to record payment.'));
  END IF;

  -- A retry with the same request ID returns the original ledger entry. Reuse
  -- of that ID for a different amount/method/actor is an explicit conflict.
  SELECT p.* INTO v_existing
  FROM public.payments p
  WHERE p.restaurant_id=v_order.restaurant_id
    AND p.branch_id=v_order.branch_id
    AND p.order_id=v_order.id
    AND p.idempotency_key=v_request_id::text;
  IF FOUND THEN
    IF v_existing.entry_type<>'collection'
       OR v_existing.status<>'succeeded'
       OR v_existing.amount<>v_amount
       OR v_existing.payment_method<>v_method
       OR v_existing.received_by_user_id<>v_actor_id THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','PAYMENT_IDEMPOTENCY_CONFLICT','message','This payment request ID was already used with different payment details.'));
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,'payment_id',v_existing.id,
      'amount',v_existing.amount,'payment_method',v_existing.payment_method,
      'order_status',v_order.status,'payment_status',v_order.payment_status,
      'paid_amount',v_order.paid_amount,'balance_due',v_order.balance_due,
      'payment_method_summary',v_order.payment_method_summary,
      'completed',v_order.status='completed'
    );
  END IF;

  -- V1 collection is intentionally for delivered delivery orders only.
  -- Returned orders and other fulfillment states cannot be paid through this
  -- action; refunds/return reconciliation remain a separate finance workflow.
  IF v_order.fulfillment_type<>'delivery' OR v_order.status<>'delivered' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_ORDER_STATE_INVALID','message','Payment collection is available only after a delivery is marked Delivered.'));
  END IF;

  IF v_order.balance_due<=0 OR v_order.payment_status='paid' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_ALREADY_SETTLED','message','This order has no outstanding balance.'));
  END IF;

  IF v_amount>v_order.balance_due THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','PAYMENT_AMOUNT_EXCEEDS_BALANCE','message','The collected amount cannot exceed the outstanding balance.'));
  END IF;

  v_now := pg_catalog.clock_timestamp();
  v_next_paid := v_order.paid_amount+v_amount;
  v_next_balance := pg_catalog.greatest(v_order.total-v_next_paid,0::numeric);
  v_complete := v_next_balance=0;
  v_method_summary := CASE
    WHEN v_order.paid_amount=0 THEN v_method
    WHEN v_order.payment_method_summary=v_method THEN v_method
    ELSE 'mixed'
  END;
  v_reason := CASE
    WHEN v_complete THEN 'Outstanding order balance fully collected'
    ELSE 'Partial order payment collected; balance remains due'
  END;
  v_action := CASE
    WHEN v_complete THEN 'payment_collection_completed'
    ELSE 'payment_partially_collected'
  END;

  INSERT INTO public.payments(
    restaurant_id,branch_id,order_id,entry_type,payment_method,amount,
    currency_code,status,idempotency_key,received_by_user_id,reason_code,
    reason_note,occurred_at,created_at
  ) VALUES(
    v_order.restaurant_id,v_order.branch_id,v_order.id,'collection',v_method,v_amount,
    v_order.currency_code,'succeeded',v_request_id::text,v_actor_id,
    CASE WHEN v_complete THEN 'BALANCE_SETTLED' ELSE 'PARTIAL_COLLECTION' END,
    v_reason,v_now,v_now
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET paid_amount=v_next_paid,
      payment_status=CASE WHEN v_complete THEN 'paid' ELSE 'partially_paid' END,
      payment_method_summary=v_method_summary,
      status=CASE WHEN v_complete THEN 'completed' ELSE 'delivered' END,
      completed_at=CASE WHEN v_complete THEN v_now ELSE NULL END,
      last_status_changed_by=v_actor_id,
      last_status_actor_type='staff',
      last_status_change_reason=v_reason,
      updated_at=v_now
  WHERE id=v_order.id AND status='delivered';

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,from_status,to_status,action,
    actor_user_id,actor_type,actor_role,reason_code,reason,
    metadata,request_id,changed_at
  ) VALUES(
    v_order.restaurant_id,v_order.branch_id,v_order.id,'delivered',
    CASE WHEN v_complete THEN 'completed' ELSE 'delivered' END,
    v_action,v_actor_id,'staff',v_role,
    CASE WHEN v_complete THEN 'PAYMENT_BALANCE_SETTLED' ELSE 'PAYMENT_PARTIALLY_COLLECTED' END,
    v_reason,
    pg_catalog.jsonb_build_object(
      'payment_id',v_payment_id,'amount',v_amount,'payment_method',v_method,
      'paid_amount',v_next_paid,'balance_due',v_next_balance
    ),
    v_request_id,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'already_processed',false,'payment_id',v_payment_id,
    'amount',v_amount,'payment_method',v_method,
    'order_status',CASE WHEN v_complete THEN 'completed' ELSE 'delivered' END,
    'payment_status',CASE WHEN v_complete THEN 'paid' ELSE 'partially_paid' END,
    'paid_amount',v_next_paid,'balance_due',v_next_balance,
    'payment_method_summary',v_method_summary,'completed',v_complete,
    'collected_at',v_now
  );
END;
$function$;

ALTER FUNCTION public.flame_chick_collect_order_payment(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_collect_order_payment(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_collect_order_payment(jsonb) TO service_role;

DO $verify$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.flame_chick_collect_order_payment(jsonb)');
BEGIN
  IF v_oid IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid=v_oid
         AND p.prosecdef
         AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
         AND p.proconfig @> ARRAY['search_path=""']
     )
     OR NOT pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_PAYMENT_COLLECTION_RPC_SECURITY_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('service_role','public.orders','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.orders','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.payments','INSERT')
     OR pg_catalog.has_table_privilege('service_role','public.payments','UPDATE')
     OR pg_catalog.has_table_privilege('service_role','public.payments','DELETE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_PAYMENT_COLLECTION_DIRECT_DML_PRESENT';
  END IF;
END;
$verify$;

COMMIT;
