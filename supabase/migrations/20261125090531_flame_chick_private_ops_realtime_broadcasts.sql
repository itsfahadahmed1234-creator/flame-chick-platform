-- Private, tenant-scoped Broadcast delivery for POS and Rider operations.
-- No Postgres row publication is enabled; clients receive event signals only.
BEGIN;

CREATE OR REPLACE FUNCTION app_private.flame_chick_realtime_can_receive(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_branch_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_topic IS NULL OR pg_catalog.length(p_topic)>160 THEN
    RETURN false;
  END IF;

  -- POS subscribers are active Admin/Owner for the restaurant, or active
  -- Manager/Cashier for the exact branch. Riders never receive the POS topic.
  IF p_topic ~ '^fc:branch:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:pos$' THEN
    v_branch_id := (pg_catalog.regexp_match(
      p_topic,
      '^fc:branch:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):pos$'
    ))[1]::uuid;

    RETURN EXISTS (
      SELECT 1
      FROM public.branches b
      JOIN public.user_roles ur
        ON ur.restaurant_id=b.restaurant_id
       AND ur.user_id=v_user_id
       AND ur.is_active
      WHERE b.id=v_branch_id
        AND b.is_active
        AND (
          (ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL)
          OR
          (ur.role_key IN ('manager','cashier') AND ur.branch_id=b.id)
        )
    );
  END IF;

  -- Rider topic is bound to auth.uid(); a rider cannot subscribe as another user.
  IF p_topic = 'fc:rider:'||v_user_id::text||':ops' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.rider_profiles rp
        ON rp.restaurant_id=ur.restaurant_id
       AND rp.branch_id=ur.branch_id
       AND rp.user_id=ur.user_id
       AND rp.is_active
      JOIN public.branches b
        ON b.id=ur.branch_id
       AND b.restaurant_id=ur.restaurant_id
       AND b.is_active
      JOIN public.user_profiles up
        ON up.user_id=ur.user_id
       AND up.is_active
      WHERE ur.user_id=v_user_id
        AND ur.role_key='rider'
        AND ur.is_active
    );
  END IF;

  RETURN false;
END
$function$;

ALTER FUNCTION app_private.flame_chick_realtime_can_receive(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_realtime_can_receive(text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_realtime_can_receive(text)
  TO authenticated;

COMMENT ON FUNCTION app_private.flame_chick_realtime_can_receive(text) IS
  'Authorizes only active Flame Chick Admin/Owner/Manager/Cashier branch POS channels or the authenticated Rider own-ops channel.';

DROP POLICY IF EXISTS flame_chick_private_ops_broadcast_select ON realtime.messages;
CREATE POLICY flame_chick_private_ops_broadcast_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (app_private.flame_chick_realtime_can_receive(realtime.topic()));

CREATE OR REPLACE FUNCTION app_private.flame_chick_emit_ops_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_branch_id uuid;
  v_rider_id uuid;
  v_branch_ids uuid[];
  v_rider_ids uuid[];
  v_record_id text;
  v_delivery_task_id text;
  v_event text;
  v_topic text;
  v_payload jsonb;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new:=pg_catalog.to_jsonb(NEW);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old:=pg_catalog.to_jsonb(OLD);
  END IF;

  -- Avoid Realtime noise for routine updated_at / heartbeat writes. Only
  -- dispatch and operational state changes cause an event.
  IF TG_OP='UPDATE' THEN
    CASE TG_TABLE_NAME
      WHEN 'orders' THEN
        IF ROW(v_old->>'status',v_old->>'payment_status',v_old->>'paid_amount',
               v_old->>'balance_due',v_old->>'total',v_old->>'fulfillment_type')
           IS NOT DISTINCT FROM
           ROW(v_new->>'status',v_new->>'payment_status',v_new->>'paid_amount',
               v_new->>'balance_due',v_new->>'total',v_new->>'fulfillment_type') THEN
          RETURN NULL;
        END IF;
      WHEN 'delivery_tasks' THEN
        IF ROW(v_old->>'status',v_old->>'return_reported_at',v_old->>'return_confirmed_at',
               v_old->>'assigned_at',v_old->>'picked_up_at',v_old->>'out_for_delivery_at',
               v_old->>'delivered_at',v_old->>'failed_at')
           IS NOT DISTINCT FROM
           ROW(v_new->>'status',v_new->>'return_reported_at',v_new->>'return_confirmed_at',
               v_new->>'assigned_at',v_new->>'picked_up_at',v_new->>'out_for_delivery_at',
               v_new->>'delivered_at',v_new->>'failed_at') THEN
          RETURN NULL;
        END IF;
      WHEN 'delivery_task_offers' THEN
        IF ROW(v_old->>'status',v_old->>'expires_at',v_old->>'responded_at',v_old->>'response_reason')
           IS NOT DISTINCT FROM
           ROW(v_new->>'status',v_new->>'expires_at',v_new->>'responded_at',v_new->>'response_reason') THEN
          RETURN NULL;
        END IF;
      WHEN 'delivery_assignments' THEN
        IF ROW(v_old->>'status',v_old->>'is_current',v_old->>'accepted_at',
               v_old->>'picked_up_at',v_old->>'delivered_at',v_old->>'ended_at',v_old->>'end_reason')
           IS NOT DISTINCT FROM
           ROW(v_new->>'status',v_new->>'is_current',v_new->>'accepted_at',
               v_new->>'picked_up_at',v_new->>'delivered_at',v_new->>'ended_at',v_new->>'end_reason') THEN
          RETURN NULL;
        END IF;
      WHEN 'rider_profiles' THEN
        IF ROW(v_old->>'availability_status',v_old->>'accepting_jobs',v_old->>'is_active',
               v_old->>'display_name',v_old->>'phone')
           IS NOT DISTINCT FROM
           ROW(v_new->>'availability_status',v_new->>'accepting_jobs',v_new->>'is_active',
               v_new->>'display_name',v_new->>'phone') THEN
          RETURN NULL;
        END IF;
    END CASE;
  END IF;

  v_record_id:=pg_catalog.coalesce(v_new->>'id',v_old->>'id');
  IF TG_TABLE_NAME='delivery_tasks' THEN
    v_delivery_task_id:=v_record_id;
  ELSE
    v_delivery_task_id:=pg_catalog.coalesce(v_new->>'delivery_task_id',v_old->>'delivery_task_id');
  END IF;

  IF TG_TABLE_NAME='orders' THEN
    v_event:='orders_changed';
  ELSE
    v_event:='delivery_changed';
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.array_agg(x.branch_id),'{}'::uuid[])
    INTO v_branch_ids
  FROM (
    SELECT DISTINCT ((doc.value)->>'branch_id')::uuid AS branch_id
    FROM pg_catalog.unnest(ARRAY[v_old,v_new]) AS doc(value)
    WHERE doc.value ? 'branch_id'
      AND (doc.value->>'branch_id') IS NOT NULL
  ) x;

  FOREACH v_branch_id IN ARRAY v_branch_ids LOOP
    v_topic:='fc:branch:'||v_branch_id::text||':pos';
    v_payload:=pg_catalog.jsonb_build_object(
      'table',TG_TABLE_NAME,
      'record_id',v_record_id,
      'branch_id',v_branch_id::text
    );
    IF TG_TABLE_NAME='orders' THEN
      v_payload:=v_payload||pg_catalog.jsonb_build_object('order_id',v_record_id);
    ELSE
      v_payload:=v_payload||pg_catalog.jsonb_build_object('delivery_task_id',v_delivery_task_id);
    END IF;

    BEGIN
      PERFORM realtime.send(v_payload,v_event,v_topic,true);
    EXCEPTION WHEN OTHERS THEN
      -- Realtime is a notification layer. A disconnected client or missing
      -- daily Realtime partition must never roll back an order/delivery write.
      RAISE WARNING 'Flame Chick Realtime branch broadcast skipped for % [%]: %',
        TG_TABLE_NAME,SQLSTATE,SQLERRM;
    END;
  END LOOP;

  IF TG_TABLE_NAME='rider_profiles' THEN
    SELECT pg_catalog.coalesce(pg_catalog.array_agg(x.rider_id),'{}'::uuid[])
      INTO v_rider_ids
    FROM (
      SELECT DISTINCT (doc.value->>'user_id')::uuid AS rider_id
      FROM pg_catalog.unnest(ARRAY[v_old,v_new]) AS doc(value)
      WHERE doc.value ? 'user_id'
        AND (doc.value->>'user_id') IS NOT NULL
    ) x;
  ELSE
    SELECT pg_catalog.coalesce(pg_catalog.array_agg(x.rider_id),'{}'::uuid[])
      INTO v_rider_ids
    FROM (
      SELECT DISTINCT (doc.value->>'rider_user_id')::uuid AS rider_id
      FROM pg_catalog.unnest(ARRAY[v_old,v_new]) AS doc(value)
      WHERE doc.value ? 'rider_user_id'
        AND (doc.value->>'rider_user_id') IS NOT NULL
    ) x;
  END IF;

  FOREACH v_rider_id IN ARRAY v_rider_ids LOOP
    v_topic:='fc:rider:'||v_rider_id::text||':ops';
    v_payload:=pg_catalog.jsonb_build_object(
      'table',TG_TABLE_NAME,
      'record_id',v_record_id,
      'delivery_task_id',v_delivery_task_id
    );

    BEGIN
      PERFORM realtime.send(v_payload,'delivery_changed',v_topic,true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Flame Chick Realtime rider broadcast skipped for % [%]: %',
        TG_TABLE_NAME,SQLSTATE,SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END
$function$;

ALTER FUNCTION app_private.flame_chick_emit_ops_realtime_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_emit_ops_realtime_event()
  FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS flame_chick_ops_realtime ON public.orders;
CREATE TRIGGER flame_chick_ops_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_emit_ops_realtime_event();

DROP TRIGGER IF EXISTS flame_chick_ops_realtime ON public.delivery_tasks;
CREATE TRIGGER flame_chick_ops_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_tasks
FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_emit_ops_realtime_event();

DROP TRIGGER IF EXISTS flame_chick_ops_realtime ON public.delivery_task_offers;
CREATE TRIGGER flame_chick_ops_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_task_offers
FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_emit_ops_realtime_event();

DROP TRIGGER IF EXISTS flame_chick_ops_realtime ON public.delivery_assignments;
CREATE TRIGGER flame_chick_ops_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_assignments
FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_emit_ops_realtime_event();

DROP TRIGGER IF EXISTS flame_chick_ops_realtime ON public.rider_profiles;
CREATE TRIGGER flame_chick_ops_realtime
AFTER INSERT OR UPDATE OR DELETE ON public.rider_profiles
FOR EACH ROW EXECUTE FUNCTION app_private.flame_chick_emit_ops_realtime_event();

DO $verify$
DECLARE
  v_trigger_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='realtime'
      AND tablename='messages'
      AND policyname='flame_chick_private_ops_broadcast_select'
      AND cmd='SELECT'
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_REALTIME_AUTH_POLICY_MISSING';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal
    AND n.nspname='public'
    AND c.relname IN ('orders','delivery_tasks','delivery_task_offers','delivery_assignments','rider_profiles')
    AND t.tgname='flame_chick_ops_realtime'
    AND t.tgenabled='O';
  IF v_trigger_count<>5 THEN
    RAISE EXCEPTION 'FLAME_CHICK_REALTIME_TRIGGER_COUNT_%',v_trigger_count;
  END IF;

  IF pg_catalog.has_function_privilege('anon','app_private.flame_chick_realtime_can_receive(text)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','app_private.flame_chick_realtime_can_receive(text)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_REALTIME_AUTH_HELPER_OVERGRANTED';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated','app_private.flame_chick_realtime_can_receive(text)','EXECUTE') THEN
    RAISE EXCEPTION 'FLAME_CHICK_REALTIME_AUTH_HELPER_NOT_GRANTED';
  END IF;
END
$verify$;

COMMIT;
