-- Disposable structural/behavioral QA for Flame Chick operational schema V1.
-- Run only against the local Supabase CI stack. Every fixture is rolled back.

BEGIN;

DO $preflight$
BEGIN
  IF current_database() NOT LIKE '%postgres%' THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_QA_EXPECTED_DISPOSABLE_DATABASE';
  END IF;
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.delivery_tasks') IS NULL
     OR to_regclass('app_private.website_order_success_events') IS NULL THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_TABLES_MISSING';
  END IF;
END;
$preflight$;

DO $structure$
DECLARE
  v_table text;
  v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.delivery_areas','public.branch_delivery_settings','public.orders',
    'public.order_items','public.order_item_components','public.order_item_modifiers',
    'public.order_status_history','public.payments','public.rider_profiles',
    'public.delivery_tasks','public.delivery_task_offers','public.delivery_assignments',
    'public.delivery_task_events','public.rider_push_subscriptions',
    'app_private.website_order_success_events','app_private.order_number_counters',
    'app_private.notification_outbox','app_private.api_rate_limit_buckets'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname||'.'||c.relname=v_table AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'OPERATIONAL_SCHEMA_RLS_MISSING: %',v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated']
    LOOP
      IF has_table_privilege(v_role,v_table,'SELECT')
         OR has_table_privilege(v_role,v_table,'INSERT')
         OR has_table_privilege(v_role,v_table,'UPDATE')
         OR has_table_privilege(v_role,v_table,'DELETE') THEN
        RAISE EXCEPTION 'OPERATIONAL_SCHEMA_BROWSER_PRIVILEGE_PRESENT: % %',v_role,v_table;
      END IF;
    END LOOP;
  END LOOP;

  IF has_schema_privilege('anon','app_private','USAGE')
     OR has_schema_privilege('authenticated','app_private','USAGE')
     OR has_schema_privilege('service_role','app_private','USAGE') THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_PRIVATE_NAMESPACE_EXPOSED';
  END IF;

  IF has_table_privilege('service_role','public.orders','INSERT')
     OR has_table_privilege('service_role','public.orders','UPDATE')
     OR has_table_privilege('service_role','public.orders','DELETE')
     OR has_table_privilege('service_role','public.payments','INSERT') THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_SERVICE_ROLE_HAS_DIRECT_MUTATION';
  END IF;

  IF NOT has_column_privilege('service_role','public.rider_profiles','availability_status','UPDATE')
     OR NOT has_column_privilege('service_role','public.rider_profiles','accepting_jobs','UPDATE')
     OR NOT has_column_privilege('service_role','public.rider_profiles','last_seen_at','UPDATE')
     OR has_table_privilege('service_role','public.rider_profiles','UPDATE') THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_RIDER_PRESENCE_GRANT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename IN ('orders','delivery_tasks','delivery_task_offers','delivery_assignments','rider_profiles')
  ) THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_REALTIME_ENABLED_BEFORE_AUTHORIZATION';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('orders','order_items','payments')
      AND column_name IN ('tax_amount','tax_rate','gst_amount','service_charge','tip_amount')
  ) THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_TAX_OR_DEFERRED_COLUMNS_PRESENT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rider_push_subscriptions'
      AND column_name IN ('endpoint','p256dh','auth')
  ) THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_CLEAR_TEXT_PUSH_SECRET_COLUMN_PRESENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.order_item_components'::regclass
      AND conname='order_item_components_id_order_branch_restaurant_key'
  ) THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_COMPONENT_COMPOSITE_KEY_MISSING';
  END IF;
END;
$structure$;

DO $behavior$
DECLARE
  v_restaurant uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_area uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_fee numeric(12,2);
BEGIN
  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(v_restaurant,'QA Flame Chick','qa-flame-chick-operational-v1','PKR','Asia/Karachi',true);

  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
  VALUES(v_branch,v_restaurant,'qa-main','QA Main',true);

  -- Explicit zero is valid; NULL is not a free-delivery default.
  INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
  VALUES(v_area,v_restaurant,v_branch,'QA Zero Fee',0,true);

  INSERT INTO public.branch_delivery_settings(branch_id,restaurant_id,not_listed_delivery_fee)
  VALUES(v_branch,v_restaurant,NULL);
  SELECT not_listed_delivery_fee INTO v_fee
  FROM public.branch_delivery_settings WHERE branch_id=v_branch;
  IF v_fee IS NOT NULL THEN RAISE EXCEPTION 'NULL_NOT_LISTED_FEE_WAS_COERCED'; END IF;

  UPDATE public.branch_delivery_settings SET not_listed_delivery_fee=0 WHERE branch_id=v_branch;
  SELECT not_listed_delivery_fee INTO v_fee
  FROM public.branch_delivery_settings WHERE branch_id=v_branch;
  IF v_fee IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'EXPLICIT_ZERO_NOT_LISTED_FEE_WAS_LOST'; END IF;

  INSERT INTO public.orders(
    id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,source,
    fulfillment_type,status,customer_name,customer_phone,delivery_area_fee_snapshot,
    subtotal,discount_amount,delivery_fee,total,currency_code,payment_status
  ) VALUES (
    v_order,v_restaurant,v_branch,'QA-0001','qa-operational-key-0001',repeat('a',64),
    'pos','pickup','new','QA Customer','03000000000',0,
    100,0,0,100,'PKR','unpaid'
  );

  INSERT INTO public.order_status_history(
    restaurant_id,branch_id,order_id,to_status,action,actor_type,metadata
  ) VALUES(v_restaurant,v_branch,v_order,'new','created','system','{}'::jsonb);

  -- Ensure no hard-delete or update can mutate financial/status history.
  BEGIN
    UPDATE public.order_status_history SET reason='mutated' WHERE order_id=v_order;
    RAISE EXCEPTION 'ORDER_STATUS_HISTORY_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  -- One delivery task per order and explicit 60-second offer deadline are schema invariants.
  INSERT INTO public.delivery_tasks(
    id,restaurant_id,branch_id,order_id,status,recipient_name_snapshot,
    recipient_phone_snapshot,address_snapshot,area_name_snapshot,
    delivery_selection_type_snapshot,delivery_fee_snapshot
  ) VALUES(
    v_task,v_restaurant,v_branch,v_order,'dispatch_pending','QA Customer',
    '03000000000','QA delivery address','QA Area','listed_area',0
  );
  IF (SELECT count(*) FROM public.delivery_tasks WHERE order_id=v_order)<>1 THEN
    RAISE EXCEPTION 'DELIVERY_TASK_ONE_PER_ORDER_FAILED';
  END IF;

  -- Rejected/expired offers must not be accepted as a current offer without a
  -- server-side command. The schema still preserves each distinct offer round.
  BEGIN
    INSERT INTO public.delivery_task_offers(
      restaurant_id,branch_id,delivery_task_id,rider_user_id,offer_round,status,
      offered_at,expires_at,responded_at
    ) VALUES(
      v_restaurant,v_branch,v_task,gen_random_uuid(),1,'offered',
      transaction_timestamp(),transaction_timestamp()+interval '59 seconds',NULL
    );
    RAISE EXCEPTION 'OFFER_DEADLINE_CONSTRAINT_WAS_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$behavior$;

ROLLBACK;

DO $cleanup$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug='qa-flame-chick-operational-v1') THEN
    RAISE EXCEPTION 'OPERATIONAL_SCHEMA_QA_FIXTURE_NOT_ROLLED_BACK';
  END IF;
END;
$cleanup$;
