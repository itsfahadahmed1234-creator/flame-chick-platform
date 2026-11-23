-- Flame Chick delivery transactional commands V1.
-- Source-only candidate. Commands are service-role-only, tenant/branch scoped,
-- and derive permissions from the server-verified Auth subject supplied by the Edge Function.
BEGIN;

-- All delivery timing decisions use this private clock entry point. The
-- disposable SQL fixture temporarily replaces this function inside a
-- rollback-only transaction to test exact timestamp boundaries; production
-- always delegates to PostgreSQL's real clock_timestamp().
CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_clock_now()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SET search_path=''
AS $function$
  SELECT pg_catalog.clock_timestamp()
$function$;

ALTER FUNCTION app_private.flame_chick_delivery_clock_now() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_delivery_clock_now()
  FROM PUBLIC,anon,authenticated,service_role;

-- Idempotency for state-change event and order-history append operations.
CREATE UNIQUE INDEX delivery_task_events_request_action_uq
  ON public.delivery_task_events(restaurant_id,branch_id,request_id,event_type)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX order_status_history_request_action_uq
  ON public.order_status_history(restaurant_id,branch_id,request_id,action)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.delivery_tasks
  ADD CONSTRAINT delivery_tasks_return_reported_by_fkey
  FOREIGN KEY(return_reported_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT delivery_tasks_return_confirmed_by_fkey
  FOREIGN KEY(return_confirmed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Private role predicates. These call the restricted staff-role projection;
-- service_role receives no direct SELECT on user_profiles/user_roles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_staff_role(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_branch_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT rr.role_key
  FROM public.flame_chick_get_staff_role_rows(p_user_id) rr
  JOIN public.branches b
    ON b.id=p_branch_id
   AND b.restaurant_id=p_restaurant_id
   AND b.is_active
  WHERE rr.restaurant_id=p_restaurant_id
    AND rr.is_active
    AND (
      (rr.role_key IN ('admin','owner') AND rr.branch_id IS NULL)
      OR
      (rr.role_key IN ('manager','cashier') AND rr.branch_id=p_branch_id)
    )
  ORDER BY CASE rr.role_key
    WHEN 'admin' THEN 1 WHEN 'owner' THEN 2
    WHEN 'manager' THEN 3 WHEN 'cashier' THEN 4 ELSE 99 END
  LIMIT 1
$function$;

ALTER FUNCTION app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_rider_active(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT EXISTS(
    SELECT 1
    FROM public.flame_chick_get_staff_role_rows(p_user_id) rr
    JOIN public.rider_profiles rp
      ON rp.user_id=p_user_id
     AND rp.restaurant_id=p_restaurant_id
     AND rp.branch_id=p_branch_id
     AND rp.is_active
    WHERE rr.restaurant_id=p_restaurant_id
      AND rr.role_key='rider'
      AND rr.branch_id=p_branch_id
      AND rr.is_active
  )
$function$;

ALTER FUNCTION app_private.flame_chick_delivery_rider_active(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_delivery_rider_active(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Rider's own offer response. The task row is always locked before the offer
-- row; expiry, accept and decline therefore serialize against one another.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.flame_chick_respond_delivery_offer(
  p_offer_id uuid,
  p_rider_user_id uuid,
  p_action text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_task_id uuid;
  v_task public.delivery_tasks%ROWTYPE;
  v_offer public.delivery_task_offers%ROWTYPE;
  v_profile public.rider_profiles%ROWTYPE;
  v_assignment public.delivery_assignments%ROWTYPE;
  v_now timestamptz;
  v_assignment_id uuid;
  v_event_type text;
BEGIN
  IF p_action NOT IN ('accept','decline') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_ACTION_INVALID','message','The delivery offer action is invalid.'));
  END IF;
  IF p_offer_id IS NULL OR p_rider_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_ARGUMENT_REQUIRED','message','Offer, Rider and request identifiers are required.'));
  END IF;

  SELECT o.delivery_task_id INTO v_task_id
  FROM public.delivery_task_offers o
  WHERE o.id=p_offer_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_NOT_FOUND','message','This delivery offer no longer exists.'));
  END IF;

  SELECT t.* INTO v_task
  FROM public.delivery_tasks t
  WHERE t.id=v_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_TASK_NOT_FOUND','message','The delivery task no longer exists.'));
  END IF;

  SELECT o.* INTO v_offer
  FROM public.delivery_task_offers o
  WHERE o.id=p_offer_id
  FOR UPDATE;
  IF NOT FOUND OR v_offer.delivery_task_id<>v_task.id THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_NOT_FOUND','message','This delivery offer no longer exists.'));
  END IF;

  IF v_offer.rider_user_id<>p_rider_user_id THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_NOT_ASSIGNED_TO_RIDER','message','This offer is not assigned to your Rider account.'));
  END IF;

  IF NOT app_private.flame_chick_delivery_rider_active(
    p_rider_user_id,v_task.restaurant_id,v_task.branch_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','RIDER_ROLE_REQUIRED','message','An active Rider role and profile for this branch are required.'));
  END IF;

  -- A repeated successful command returns the original assignment without
  -- inserting a second assignment or duplicate event.
  IF p_action='accept' AND v_offer.status='accepted' THEN
    SELECT da.* INTO v_assignment
    FROM public.delivery_assignments da
    WHERE da.offer_id=v_offer.id
      AND da.rider_user_id=p_rider_user_id
    LIMIT 1;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',true,'already_processed',true,'offer_id',v_offer.id,
        'delivery_task_id',v_task.id,'assignment_id',v_assignment.id,
        'task_status',v_task.status,'offer_status',v_offer.status
      );
    END IF;
  END IF;

  IF p_action='decline' AND v_offer.status='rejected' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'already_processed',true,'offer_id',v_offer.id,
      'delivery_task_id',v_task.id,'task_status',v_task.status,'offer_status',v_offer.status
    );
  END IF;

  IF v_offer.status<>'offered' OR v_task.status<>'offering' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_OFFER_ALREADY_RESOLVED','message','This delivery offer has already been resolved.'));
  END IF;

  v_now := app_private.flame_chick_delivery_clock_now();
  IF v_now>=v_offer.expires_at THEN
    UPDATE public.delivery_task_offers
    SET status='expired',responded_at=v_now,response_reason='No response within 60 seconds'
    WHERE id=v_offer.id AND status='offered';

    IF NOT EXISTS(
      SELECT 1 FROM public.delivery_assignments da
      WHERE da.delivery_task_id=v_task.id AND da.is_current
    ) THEN
      UPDATE public.delivery_tasks
      SET status='dispatch_pending',assigned_at=NULL
      WHERE id=v_task.id AND status='offering';
    END IF;

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
      from_status,to_status,actor_type,reason_code,reason,metadata,request_id,occurred_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,'offer_expired',
      'offering','dispatch_pending','system','OFFER_TIMEOUT',
      'No response within 60 seconds',
      pg_catalog.jsonb_build_object('offer_round',v_offer.offer_round),
      v_offer.request_id,v_now
    );
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','OFFER_EXPIRED','message','This offer expired after 60 seconds. Ask POS to assign a rider again.'));
  END IF;

  SELECT rp.* INTO v_profile
  FROM public.rider_profiles rp
  WHERE rp.user_id=p_rider_user_id
    AND rp.restaurant_id=v_task.restaurant_id
    AND rp.branch_id=v_task.branch_id
    AND rp.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','RIDER_PROFILE_REQUIRED','message','Your active Rider profile is not available for this branch.'));
  END IF;

  IF p_action='decline' THEN
    IF p_reason IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_reason))>500 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_REASON_TOO_LONG','message','The reason must be 500 characters or fewer.'));
    END IF;

    UPDATE public.delivery_task_offers
    SET status='rejected',responded_at=v_now,response_reason=NULLIF(pg_catalog.btrim(p_reason),'')
    WHERE id=v_offer.id AND status='offered';

    UPDATE public.delivery_tasks
    SET status='dispatch_pending',assigned_at=NULL
    WHERE id=v_task.id AND status='offering'
      AND NOT EXISTS(
        SELECT 1 FROM public.delivery_assignments da
        WHERE da.delivery_task_id=v_task.id AND da.is_current
      );

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
      from_status,to_status,actor_user_id,actor_type,actor_role,
      reason_code,reason,metadata,request_id,occurred_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,'offer_declined',
      'offering','dispatch_pending',p_rider_user_id,'rider','rider',
      'RIDER_DECLINED',NULLIF(pg_catalog.btrim(p_reason),''),
      pg_catalog.jsonb_build_object('offer_round',v_offer.offer_round),
      p_request_id,v_now
    );

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'offer_id',v_offer.id,'delivery_task_id',v_task.id,
      'offer_status','rejected','task_status','dispatch_pending'
    );
  END IF;

  IF v_profile.availability_status<>'available'
     OR NOT v_profile.accepting_jobs
     OR v_profile.last_seen_at IS NULL
     OR v_profile.last_seen_at<v_now-interval '4 minutes'
     OR v_profile.last_seen_at>v_now+interval '15 seconds'
     OR EXISTS(
       SELECT 1 FROM public.delivery_assignments da
       WHERE da.rider_user_id=p_rider_user_id AND da.is_current
     ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','RIDER_NOT_AVAILABLE','message','Your Rider account is not currently available for another delivery.'));
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.delivery_assignments da
    WHERE da.delivery_task_id=v_task.id AND da.is_current
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_TASK_ALREADY_ASSIGNED','message','This delivery already has a current Rider assignment.'));
  END IF;

  UPDATE public.delivery_task_offers
  SET status='accepted',responded_at=v_now,response_reason=NULL
  WHERE id=v_offer.id AND status='offered';

  INSERT INTO public.delivery_assignments(
    restaurant_id,branch_id,delivery_task_id,rider_user_id,offer_id,status,is_current,
    assigned_at,accepted_at
  ) VALUES(
    v_task.restaurant_id,v_task.branch_id,v_task.id,p_rider_user_id,v_offer.id,'accepted',true,
    v_offer.offered_at,v_now
  )
  RETURNING id INTO v_assignment_id;

  UPDATE public.delivery_tasks
  SET status='accepted',assigned_at=v_now
  WHERE id=v_task.id AND status='offering';

  UPDATE public.rider_profiles
  SET availability_status='busy',last_seen_at=v_now
  WHERE user_id=p_rider_user_id
    AND restaurant_id=v_task.restaurant_id
    AND branch_id=v_task.branch_id
    AND is_active;

  INSERT INTO public.delivery_task_events(
    restaurant_id,branch_id,delivery_task_id,offer_id,assignment_id,event_type,
    from_status,to_status,actor_user_id,actor_type,actor_role,
    reason_code,metadata,request_id,occurred_at
  ) VALUES(
    v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,v_assignment_id,'offer_accepted',
    'offering','accepted',p_rider_user_id,'rider','rider',
    'RIDER_ACCEPTED',pg_catalog.jsonb_build_object('offer_round',v_offer.offer_round),
    p_request_id,v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'offer_id',v_offer.id,'delivery_task_id',v_task.id,
    'assignment_id',v_assignment_id,'offer_status','accepted','task_status','accepted'
  );
END;
$function$;

ALTER FUNCTION app_private.flame_chick_respond_delivery_offer(uuid,uuid,text,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_respond_delivery_offer(uuid,uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Public names are only RPC entry points for the server-side Edge Function.
CREATE OR REPLACE FUNCTION public.flame_chick_accept_delivery_offer(
  p_offer_id uuid,
  p_rider_user_id uuid,
  p_request_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT app_private.flame_chick_respond_delivery_offer(
    p_offer_id,p_rider_user_id,'accept',NULL,p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_accept_delivery_offer(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_accept_delivery_offer(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_accept_delivery_offer(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.flame_chick_decline_delivery_offer(
  p_offer_id uuid,
  p_rider_user_id uuid,
  p_reason text DEFAULT NULL,
  p_request_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT app_private.flame_chick_respond_delivery_offer(
    p_offer_id,p_rider_user_id,'decline',p_reason,p_request_id
  )
$function$;

ALTER FUNCTION public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- General Rider/Staff command handler.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flame_chick_manage_delivery(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_action text;
  v_task_id uuid;
  v_actor_id uuid;
  v_rider_id uuid;
  v_request_id uuid;
  v_reason text;
  v_reason_code text;
  v_actor_role text;
  v_task public.delivery_tasks%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_profile public.rider_profiles%ROWTYPE;
  v_assignment public.delivery_assignments%ROWTYPE;
  v_offer public.delivery_task_offers%ROWTYPE;
  v_now timestamptz;
  v_offer_id uuid;
  v_assignment_id uuid;
  v_offer_round integer;
  v_event_type text;
  v_from_status text;
BEGIN
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_REQUEST_INVALID','message','A delivery command object is required.'));
  END IF;

  v_action := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_payload->>'action','')));
  v_task_id := NULLIF(p_payload->>'delivery_task_id','')::uuid;
  v_actor_id := NULLIF(p_payload->>'actor_user_id','')::uuid;
  v_request_id := COALESCE(NULLIF(p_payload->>'request_id','')::uuid,pg_catalog.gen_random_uuid());
  v_reason := NULLIF(pg_catalog.btrim(COALESCE(p_payload->>'reason','')),'');
  v_reason_code := NULLIF(pg_catalog.btrim(COALESCE(p_payload->>'reason_code','')),'');

  IF v_action NOT IN ('assign','picked_up','delivered','reject','failed','return_reported','confirm_return') THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_ACTION_INVALID','message','The delivery action is not supported.'));
  END IF;
  IF v_actor_id IS NULL OR v_task_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_ARGUMENT_REQUIRED','message','A verified actor and delivery task are required.'));
  END IF;

  SELECT t.* INTO v_task
  FROM public.delivery_tasks t
  WHERE t.id=v_task_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_TASK_NOT_FOUND','message','The delivery task could not be found.'));
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id=v_task.order_id
    AND o.branch_id=v_task.branch_id
    AND o.restaurant_id=v_task.restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR v_order.fulfillment_type<>'delivery' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_ORDER_NOT_FOUND','message','The delivery order could not be found.'));
  END IF;

  v_now := app_private.flame_chick_delivery_clock_now();

  -- Staff dispatch: assignment is always an explicit choice of one Rider.
  IF v_action='assign' THEN
    v_actor_role := app_private.flame_chick_delivery_staff_role(
      v_actor_id,v_task.restaurant_id,v_task.branch_id
    );
    IF v_actor_role IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_STAFF_ROLE_REQUIRED','message','An active Admin, Owner, Manager or Cashier role for this branch is required.'));
    END IF;

    v_rider_id := NULLIF(p_payload->>'rider_user_id','')::uuid;
    IF v_rider_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_ID_REQUIRED','message','Select one Rider for this delivery.'));
    END IF;

    -- A retry with the same request id returns the exact original offer.
    SELECT o.* INTO v_offer
    FROM public.delivery_task_offers o
    WHERE o.restaurant_id=v_task.restaurant_id
      AND o.branch_id=v_task.branch_id
      AND o.request_id=v_request_id;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok',true,'already_processed',true,'offer_id',v_offer.id,
        'delivery_task_id',v_offer.delivery_task_id,'offer_status',v_offer.status,
        'task_status',v_task.status
      );
    END IF;

    IF v_task.status NOT IN ('dispatch_pending','offering') OR v_order.status<>'ready' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_NOT_AWAITING_ASSIGNMENT','message','This order is no longer Ready for rider assignment.'));
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.delivery_assignments da
      WHERE da.delivery_task_id=v_task.id AND da.is_current
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_TASK_ALREADY_ASSIGNED','message','This delivery already has a current Rider.'));
    END IF;

    IF NOT app_private.flame_chick_delivery_rider_active(
      v_rider_id,v_task.restaurant_id,v_task.branch_id
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_NOT_ACTIVE_FOR_BRANCH','message','The selected account is not an active Rider for this branch.'));
    END IF;

    SELECT rp.* INTO v_profile
    FROM public.rider_profiles rp
    WHERE rp.user_id=v_rider_id
      AND rp.restaurant_id=v_task.restaurant_id
      AND rp.branch_id=v_task.branch_id
      AND rp.is_active
    FOR UPDATE;
    IF NOT FOUND
       OR v_profile.availability_status<>'available'
       OR NOT v_profile.accepting_jobs
       OR v_profile.last_seen_at IS NULL
       OR v_profile.last_seen_at<v_now-interval '4 minutes'
       OR v_profile.last_seen_at>v_now+interval '15 seconds'
       OR EXISTS(
         SELECT 1 FROM public.delivery_assignments da
         WHERE da.rider_user_id=v_rider_id AND da.is_current
       ) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_NOT_AVAILABLE','message','The selected Rider is not online and available for a new delivery.'));
    END IF;

    -- A currently pending offer may be withdrawn only because a staff member
    -- explicitly selected a replacement. It is never auto-rotated.
    SELECT o.* INTO v_offer
    FROM public.delivery_task_offers o
    WHERE o.delivery_task_id=v_task.id AND o.status='offered'
    FOR UPDATE;
    IF FOUND THEN
      IF v_offer.expires_at<=v_now THEN
        UPDATE public.delivery_task_offers
        SET status='expired',responded_at=v_now,response_reason='No response within 60 seconds'
        WHERE id=v_offer.id AND status='offered';
        INSERT INTO public.delivery_task_events(
          restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
          from_status,to_status,actor_type,reason_code,reason,metadata,request_id,occurred_at
        ) VALUES(
          v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,'offer_expired',
          'offering','dispatch_pending','system','OFFER_TIMEOUT',
          'No response within 60 seconds',
          pg_catalog.jsonb_build_object('offer_round',v_offer.offer_round),
          v_offer.request_id,v_now
        );
        UPDATE public.delivery_tasks SET status='dispatch_pending',assigned_at=NULL
        WHERE id=v_task.id AND status='offering';
      ELSIF v_offer.rider_user_id=v_rider_id THEN
        RETURN pg_catalog.jsonb_build_object(
          'ok',true,'already_processed',true,'offer_id',v_offer.id,
          'delivery_task_id',v_task.id,'offer_status','offered','task_status','offering'
        );
      ELSE
        UPDATE public.delivery_task_offers
        SET status='withdrawn',responded_at=v_now,response_reason='Staff manually selected a replacement Rider'
        WHERE id=v_offer.id AND status='offered';

        INSERT INTO public.delivery_task_events(
          restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
          from_status,to_status,actor_user_id,actor_type,actor_role,
          reason_code,reason,metadata,request_id,occurred_at
        ) VALUES(
          v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,'offer_withdrawn',
          'offering','dispatch_pending',v_actor_id,'staff',v_actor_role,
          'STAFF_REASSIGNED','Staff manually selected a replacement Rider',
          pg_catalog.jsonb_build_object('replacement_rider_user_id',v_rider_id),
          v_request_id,v_now
        );
        UPDATE public.delivery_tasks SET status='dispatch_pending',assigned_at=NULL
        WHERE id=v_task.id AND status='offering';
      END IF;
    END IF;

    SELECT COALESCE(pg_catalog.max(o.offer_round),0)+1 INTO v_offer_round
    FROM public.delivery_task_offers o
    WHERE o.delivery_task_id=v_task.id;
    IF v_offer_round>1000 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_OFFER_ROUND_LIMIT','message','This delivery has reached its manual reassignment limit.'));
    END IF;

    INSERT INTO public.delivery_task_offers(
      restaurant_id,branch_id,delivery_task_id,rider_user_id,offer_round,status,
      offered_at,expires_at,created_by,request_id
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_rider_id,v_offer_round,'offered',
      v_now,v_now+interval '60 seconds',v_actor_id,v_request_id
    )
    RETURNING id INTO v_offer_id;

    UPDATE public.delivery_tasks
    SET status='offering',assigned_at=NULL
    WHERE id=v_task.id;

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
      from_status,to_status,actor_user_id,actor_type,actor_role,
      reason_code,metadata,request_id,occurred_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer_id,'offer_created',
      'dispatch_pending','offering',v_actor_id,'staff',v_actor_role,
      'RIDER_OFFER_SENT',
      pg_catalog.jsonb_build_object('offer_round',v_offer_round,'rider_user_id',v_rider_id),
      v_request_id,v_now
    );

    INSERT INTO app_private.notification_outbox(
      restaurant_id,branch_id,event_key,event_type,aggregate_type,aggregate_id,
      recipient_user_id,payload_safe,status,next_attempt_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,'delivery-offer:'||v_offer_id::text,
      'delivery_offer_created','delivery_task',v_task.id,v_rider_id,
      pg_catalog.jsonb_build_object('offer_id',v_offer_id,'delivery_task_id',v_task.id),
      'pending',v_now
    ) ON CONFLICT(restaurant_id,event_key) DO NOTHING;

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'offer_id',v_offer_id,'delivery_task_id',v_task.id,
      'offer_round',v_offer_round,'offer_status','offered','task_status','offering',
      'expires_at',v_now+interval '60 seconds'
    );
  END IF;

  -- Rider-only lifecycle commands.
  IF v_action IN ('picked_up','delivered','reject','failed','return_reported') THEN
    IF NOT app_private.flame_chick_delivery_rider_active(
      v_actor_id,v_task.restaurant_id,v_task.branch_id
    ) THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_ROLE_REQUIRED','message','Only the active Rider assigned to this branch can update this delivery.'));
    END IF;

    SELECT rp.* INTO v_profile
    FROM public.rider_profiles rp
    WHERE rp.user_id=v_actor_id
      AND rp.restaurant_id=v_task.restaurant_id
      AND rp.branch_id=v_task.branch_id
      AND rp.is_active
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_PROFILE_REQUIRED','message','Your active Rider profile is not available for this branch.'));
    END IF;

    SELECT da.* INTO v_assignment
    FROM public.delivery_assignments da
    WHERE da.delivery_task_id=v_task.id
      AND da.rider_user_id=v_actor_id
      AND da.is_current
    ORDER BY da.assigned_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Safe retries after terminal actions return success only to the Rider
      -- who actually completed that exact transition.
      IF v_action='delivered' AND EXISTS(
        SELECT 1 FROM public.delivery_assignments da
        WHERE da.delivery_task_id=v_task.id AND da.rider_user_id=v_actor_id
          AND da.status='delivered' AND NOT da.is_current
      ) AND v_task.status='delivered' THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','delivered');
      END IF;
      IF v_action='reject' AND v_task.status='dispatch_pending' AND EXISTS(
        SELECT 1 FROM public.delivery_assignments da
        WHERE da.delivery_task_id=v_task.id AND da.rider_user_id=v_actor_id
          AND da.status='rejected' AND NOT da.is_current
      ) THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','dispatch_pending');
      END IF;
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RIDER_NOT_CURRENTLY_ASSIGNED','message','This delivery is not currently assigned to your Rider account.'));
    END IF;

    IF v_action='picked_up' THEN
      IF v_task.status='out_for_delivery' AND v_assignment.status='out_for_delivery' THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','out_for_delivery');
      END IF;
      IF v_task.status<>'accepted' OR v_assignment.status<>'accepted' OR v_order.status<>'ready' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_PICKUP_STATE_INVALID','message','Pickup is available only after this Rider accepts the offer.'));
      END IF;

      UPDATE public.delivery_tasks
      SET status='out_for_delivery',picked_up_at=v_now,out_for_delivery_at=v_now
      WHERE id=v_task.id AND status='accepted';

      UPDATE public.delivery_assignments
      SET status='out_for_delivery',picked_up_at=v_now
      WHERE id=v_assignment.id AND is_current;

      UPDATE public.orders
      SET status='out_for_delivery',out_for_delivery_at=v_now,
          last_status_changed_by=v_actor_id,last_status_actor_type='rider',
          last_status_change_reason='Rider confirmed pickup',updated_at=v_now
      WHERE id=v_order.id AND status='ready';

      INSERT INTO public.order_status_history(
        restaurant_id,branch_id,order_id,from_status,to_status,action,
        actor_user_id,actor_type,actor_role,reason_code,reason,
        metadata,request_id,changed_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_order.id,'ready','out_for_delivery','delivery_picked_up',
        v_actor_id,'rider','rider','RIDER_PICKED_UP','Rider confirmed pickup',
        pg_catalog.jsonb_build_object('delivery_task_id',v_task.id,'assignment_id',v_assignment.id),
        v_request_id,v_now
      );

      INSERT INTO public.delivery_task_events(
        restaurant_id,branch_id,delivery_task_id,assignment_id,event_type,
        from_status,to_status,actor_user_id,actor_type,actor_role,
        reason_code,metadata,request_id,occurred_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.id,'picked_up',
        'accepted','out_for_delivery',v_actor_id,'rider','rider','RIDER_PICKED_UP',
        pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
      );

      RETURN pg_catalog.jsonb_build_object('ok',true,'task_status','out_for_delivery','order_status','out_for_delivery');
    END IF;

    IF v_action='delivered' THEN
      IF v_task.status<>'out_for_delivery'
         OR v_assignment.status<>'out_for_delivery'
         OR v_order.status<>'out_for_delivery' THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_DELIVERED_STATE_INVALID','message','Mark Delivered only after pickup and while travelling to the customer.'));
      END IF;

      UPDATE public.delivery_tasks
      SET status='delivered',delivered_at=v_now
      WHERE id=v_task.id AND status='out_for_delivery';

      UPDATE public.delivery_assignments
      SET status='delivered',delivered_at=v_now,ended_at=v_now,
          is_current=false,end_reason='Delivered to customer'
      WHERE id=v_assignment.id AND is_current;

      UPDATE public.orders
      SET status='delivered',delivered_at=v_now,
          last_status_changed_by=v_actor_id,last_status_actor_type='rider',
          last_status_change_reason='Delivered to customer',updated_at=v_now
      WHERE id=v_order.id AND status='out_for_delivery';

      UPDATE public.rider_profiles
      SET availability_status=CASE WHEN accepting_jobs THEN 'available' ELSE 'offline' END,
          last_seen_at=v_now
      WHERE user_id=v_actor_id AND branch_id=v_task.branch_id
        AND restaurant_id=v_task.restaurant_id AND is_active;

      INSERT INTO public.order_status_history(
        restaurant_id,branch_id,order_id,from_status,to_status,action,
        actor_user_id,actor_type,actor_role,reason_code,reason,
        metadata,request_id,changed_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_order.id,'out_for_delivery','delivered','delivery_delivered',
        v_actor_id,'rider','rider','DELIVERY_COMPLETED','Delivered to customer',
        pg_catalog.jsonb_build_object('delivery_task_id',v_task.id,'assignment_id',v_assignment.id),
        v_request_id,v_now
      );

      INSERT INTO public.delivery_task_events(
        restaurant_id,branch_id,delivery_task_id,assignment_id,event_type,
        from_status,to_status,actor_user_id,actor_type,actor_role,
        reason_code,metadata,request_id,occurred_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.id,'delivered',
        'out_for_delivery','delivered',v_actor_id,'rider','rider','DELIVERY_COMPLETED',
        pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
      );

      RETURN pg_catalog.jsonb_build_object('ok',true,'task_status','delivered','order_status','delivered');
    END IF;

    IF v_action='reject' THEN
      IF v_task.status='dispatch_pending' AND v_assignment.status='rejected' THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','dispatch_pending');
      END IF;
      IF v_task.status<>'accepted' OR v_assignment.status<>'accepted' OR v_reason IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_REJECT_STATE_INVALID','message','A reason is required to release an accepted delivery before pickup.'));
      END IF;
      IF pg_catalog.char_length(v_reason)>500 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_REASON_TOO_LONG','message','The reason must be 500 characters or fewer.'));
      END IF;

      UPDATE public.delivery_assignments
      SET status='rejected',is_current=false,ended_at=v_now,end_reason=v_reason
      WHERE id=v_assignment.id AND is_current;

      UPDATE public.delivery_tasks
      SET status='dispatch_pending',assigned_at=NULL
      WHERE id=v_task.id AND status='accepted';

      UPDATE public.rider_profiles
      SET availability_status=CASE WHEN accepting_jobs THEN 'available' ELSE 'offline' END,
          last_seen_at=v_now
      WHERE user_id=v_actor_id AND branch_id=v_task.branch_id
        AND restaurant_id=v_task.restaurant_id AND is_active;

      INSERT INTO public.delivery_task_events(
        restaurant_id,branch_id,delivery_task_id,offer_id,assignment_id,event_type,
        from_status,to_status,actor_user_id,actor_type,actor_role,
        reason_code,reason,metadata,request_id,occurred_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.offer_id,v_assignment.id,'assignment_rejected',
        'accepted','dispatch_pending',v_actor_id,'rider','rider',
        COALESCE(v_reason_code,'RIDER_CANNOT_COMPLETE'),v_reason,
        pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
      );

      RETURN pg_catalog.jsonb_build_object('ok',true,'task_status','dispatch_pending','assignment_status','rejected');
    END IF;

    IF v_action='failed' THEN
      IF v_task.status='failed' AND v_assignment.status='failed' THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','failed');
      END IF;
      IF v_task.status<>'out_for_delivery' OR v_assignment.status<>'out_for_delivery' OR v_reason IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_FAILURE_STATE_INVALID','message','A reason is required to report an issue after pickup.'));
      END IF;
      IF pg_catalog.char_length(v_reason)>500 THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_REASON_TOO_LONG','message','The reason must be 500 characters or fewer.'));
      END IF;

      UPDATE public.delivery_tasks
      SET status='failed',failed_at=v_now,failure_reason=v_reason
      WHERE id=v_task.id AND status='out_for_delivery';

      UPDATE public.delivery_assignments
      SET status='failed'
      WHERE id=v_assignment.id AND is_current;

      INSERT INTO public.delivery_task_events(
        restaurant_id,branch_id,delivery_task_id,assignment_id,event_type,
        from_status,to_status,actor_user_id,actor_type,actor_role,
        reason_code,reason,metadata,request_id,occurred_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.id,'delivery_failed',
        'out_for_delivery','failed',v_actor_id,'rider','rider',
        COALESCE(v_reason_code,'DELIVERY_FAILED'),v_reason,
        pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
      );

      RETURN pg_catalog.jsonb_build_object('ok',true,'task_status','failed','return_confirmation_required',true);
    END IF;

    IF v_action='return_reported' THEN
      IF v_task.status='failed' AND v_task.return_reported_at IS NOT NULL
         AND v_task.return_reported_by=v_actor_id THEN
        RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','failed','return_reported_at',v_task.return_reported_at);
      END IF;
      IF v_task.status<>'failed' OR v_assignment.status<>'failed' OR v_task.return_reported_at IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
          'code','DELIVERY_RETURN_REPORT_STATE_INVALID','message','Report the physical return only after a failed delivery and handover to restaurant staff.'));
      END IF;

      UPDATE public.delivery_tasks
      SET return_reported_at=v_now,return_reported_by=v_actor_id
      WHERE id=v_task.id AND status='failed' AND return_reported_at IS NULL;

      INSERT INTO public.delivery_task_events(
        restaurant_id,branch_id,delivery_task_id,assignment_id,event_type,
        from_status,to_status,actor_user_id,actor_type,actor_role,
        reason_code,reason,metadata,request_id,occurred_at
      ) VALUES(
        v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.id,'return_reported',
        'failed','failed',v_actor_id,'rider','rider','RETURN_HANDED_TO_RESTAURANT',
        'Rider reports physically handing the returned food to restaurant staff',
        pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
      );

      RETURN pg_catalog.jsonb_build_object('ok',true,'task_status','failed','return_reported_at',v_now,'awaiting_staff_confirmation',true);
    END IF;
  END IF;

  -- Physical return is confirmed only by authorized staff, never by the Rider.
  IF v_action='confirm_return' THEN
    v_actor_role := app_private.flame_chick_delivery_staff_role(
      v_actor_id,v_task.restaurant_id,v_task.branch_id
    );
    IF v_actor_role IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RETURN_CONFIRMATION_STAFF_REQUIRED','message','Only an Admin, Owner, Manager or Cashier for this branch can confirm physical receipt.'));
    END IF;

    IF v_task.status='returned' AND v_task.return_confirmed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'already_processed',true,'task_status','returned','order_status','returned');
    END IF;

    IF v_task.status<>'failed' OR v_task.return_reported_at IS NULL
       OR v_task.return_confirmed_at IS NOT NULL
       OR v_order.status<>'out_for_delivery' THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RETURN_CONFIRMATION_STATE_INVALID','message','The Rider must report the physical return before staff can confirm it.'));
    END IF;

    SELECT da.* INTO v_assignment
    FROM public.delivery_assignments da
    WHERE da.delivery_task_id=v_task.id
      AND da.is_current
      AND da.status='failed'
    ORDER BY da.assigned_at DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','RETURN_ASSIGNMENT_NOT_FOUND','message','The active failed-delivery Rider assignment could not be found.'));
    END IF;

    v_reason := COALESCE(v_reason,'Physical return verified by authorized staff');
    IF pg_catalog.char_length(v_reason)>500 THEN
      RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
        'code','DELIVERY_REASON_TOO_LONG','message','The reason must be 500 characters or fewer.'));
    END IF;

    UPDATE public.delivery_tasks
    SET status='returned',return_confirmed_at=v_now,
        return_confirmed_by=v_actor_id,return_confirm_reason=v_reason
    WHERE id=v_task.id AND status='failed';

    UPDATE public.delivery_assignments
    SET status='returned',is_current=false,ended_at=v_now,end_reason=v_reason
    WHERE id=v_assignment.id AND is_current;

    UPDATE public.orders
    SET status='returned',returned_at=v_now,
        last_status_changed_by=v_actor_id,last_status_actor_type='staff',
        last_status_change_reason=v_reason,updated_at=v_now
    WHERE id=v_order.id AND status='out_for_delivery';

    UPDATE public.rider_profiles
    SET availability_status=CASE WHEN accepting_jobs THEN 'available' ELSE 'offline' END,
        last_seen_at=v_now
    WHERE user_id=v_assignment.rider_user_id
      AND branch_id=v_task.branch_id
      AND restaurant_id=v_task.restaurant_id
      AND is_active;

    INSERT INTO public.order_status_history(
      restaurant_id,branch_id,order_id,from_status,to_status,action,
      actor_user_id,actor_type,actor_role,reason_code,reason,
      metadata,request_id,changed_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_order.id,'out_for_delivery','returned','delivery_return_confirmed',
      v_actor_id,'staff',v_actor_role,'PHYSICAL_RETURN_CONFIRMED',v_reason,
      pg_catalog.jsonb_build_object('delivery_task_id',v_task.id,'assignment_id',v_assignment.id),
      v_request_id,v_now
    );

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,assignment_id,event_type,
      from_status,to_status,actor_user_id,actor_type,actor_role,
      reason_code,reason,metadata,request_id,occurred_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_assignment.id,'return_confirmed',
      'failed','returned',v_actor_id,'staff',v_actor_role,'PHYSICAL_RETURN_CONFIRMED',v_reason,
      pg_catalog.jsonb_build_object('order_id',v_order.id),v_request_id,v_now
    );

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'task_status','returned','order_status','returned',
      'return_confirmed_at',v_now,'return_confirmed_by',v_actor_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
    'code','DELIVERY_ACTION_INVALID','message','The delivery action is not supported.'));
END;
$function$;

ALTER FUNCTION public.flame_chick_manage_delivery(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_manage_delivery(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_manage_delivery(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Bounded lazy expiry. The POS/Rider Edge endpoint invokes this only after
-- verifying a staff/Rider identity and deriving the permitted branch.
-- Database time is authoritative; accept never depends on this sweep running.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flame_chick_expire_delivery_offers(
  p_branch_id uuid,
  p_batch_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_limit,100),1),100);
  v_row record;
  v_task public.delivery_tasks%ROWTYPE;
  v_offer public.delivery_task_offers%ROWTYPE;
  v_now timestamptz;
  v_count integer := 0;
BEGIN
  IF p_branch_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.is_active
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error',pg_catalog.jsonb_build_object(
      'code','DELIVERY_BRANCH_NOT_FOUND','message','The dispatch branch is not active.'));
  END IF;

  FOR v_row IN
    SELECT t.id AS task_id,o.id AS offer_id
    FROM public.delivery_tasks t
    JOIN public.delivery_task_offers o
      ON o.delivery_task_id=t.id
     AND o.branch_id=t.branch_id
     AND o.restaurant_id=t.restaurant_id
    WHERE t.branch_id=p_branch_id
      AND t.status='offering'
      AND o.status='offered'
      AND o.expires_at<=app_private.flame_chick_delivery_clock_now()
    ORDER BY o.expires_at,o.id
    LIMIT v_limit
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    SELECT t.* INTO v_task
    FROM public.delivery_tasks t
    WHERE t.id=v_row.task_id
    FOR UPDATE;
    IF NOT FOUND OR v_task.status<>'offering' THEN CONTINUE; END IF;

    SELECT o.* INTO v_offer
    FROM public.delivery_task_offers o
    WHERE o.id=v_row.offer_id
    FOR UPDATE;
    IF NOT FOUND OR v_offer.status<>'offered'
       OR v_offer.expires_at>app_private.flame_chick_delivery_clock_now() THEN
      CONTINUE;
    END IF;

    v_now:=app_private.flame_chick_delivery_clock_now();
    UPDATE public.delivery_task_offers
    SET status='expired',responded_at=v_now,response_reason='No response within 60 seconds'
    WHERE id=v_offer.id AND status='offered';

    IF NOT EXISTS(
      SELECT 1 FROM public.delivery_assignments da
      WHERE da.delivery_task_id=v_task.id AND da.is_current
    ) THEN
      UPDATE public.delivery_tasks
      SET status='dispatch_pending',assigned_at=NULL
      WHERE id=v_task.id AND status='offering';
    END IF;

    INSERT INTO public.delivery_task_events(
      restaurant_id,branch_id,delivery_task_id,offer_id,event_type,
      from_status,to_status,actor_type,reason_code,reason,metadata,request_id,occurred_at
    ) VALUES(
      v_task.restaurant_id,v_task.branch_id,v_task.id,v_offer.id,'offer_expired',
      'offering','dispatch_pending','system','OFFER_TIMEOUT',
      'No response within 60 seconds',
      pg_catalog.jsonb_build_object('offer_round',v_offer.offer_round),
      v_offer.request_id,v_now
    );
    v_count:=v_count+1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('ok',true,'expired_count',v_count,'branch_id',p_branch_id);
END;
$function$;

ALTER FUNCTION public.flame_chick_expire_delivery_offers(uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_expire_delivery_offers(uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_expire_delivery_offers(uuid,integer) TO service_role;

-- Final security and schema assertions.
DO $verify$
BEGIN
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_manage_delivery(jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','public.flame_chick_manage_delivery(jsonb)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role','public.flame_chick_manage_delivery(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_DELIVERY_COMMAND_GRANTS_INVALID';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_accept_delivery_offer(uuid,uuid,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','public.flame_chick_accept_delivery_offer(uuid,uuid,uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role','public.flame_chick_accept_delivery_offer(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_ACCEPT_OFFER_GRANTS_INVALID';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role','public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_DECLINE_OFFER_GRANTS_INVALID';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_expire_delivery_offers(uuid,integer)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','public.flame_chick_expire_delivery_offers(uuid,integer)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role','public.flame_chick_expire_delivery_offers(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_OFFER_EXPIRY_GRANTS_INVALID';
  END IF;
  IF pg_catalog.has_function_privilege('service_role','app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','app_private.flame_chick_delivery_rider_active(uuid,uuid,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','app_private.flame_chick_respond_delivery_offer(uuid,uuid,text,text,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('anon','app_private.flame_chick_delivery_clock_now()','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','app_private.flame_chick_delivery_clock_now()','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','app_private.flame_chick_delivery_clock_now()','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_PRIVATE_DELIVERY_HELPER_EXPOSED';
  END IF;
  IF pg_catalog.to_regprocedure('public.flame_chick_manage_delivery(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.flame_chick_accept_delivery_offer(uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.flame_chick_decline_delivery_offer(uuid,uuid,text,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.flame_chick_expire_delivery_offers(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_DELIVERY_RPC_MISSING';
  END IF;
END;
$verify$;

NOTIFY pgrst,'reload schema';
COMMIT;
