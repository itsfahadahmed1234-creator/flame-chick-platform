-- Disposable structural QA for Flame Chick operational schema V1.
-- Runs only in the local CI Supabase stack; all fixtures are rolled back.
BEGIN;
DO $check$
DECLARE v_table text; v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.delivery_areas','public.branch_delivery_settings','public.orders',
    'public.order_items','public.order_item_components','public.order_item_modifiers',
    'public.order_status_history','public.payments','public.rider_profiles',
    'public.delivery_tasks','public.delivery_task_offers','public.delivery_assignments',
    'public.delivery_task_events','public.rider_push_subscriptions',
    'app_private.website_order_success_events','app_private.order_number_counters',
    'app_private.notification_outbox','app_private.api_rate_limit_buckets'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname||'.'||c.relname=v_table AND c.relrowsecurity AND c.relforcerowsecurity)
    THEN RAISE EXCEPTION 'OPERATIONAL_RLS_MISSING: %',v_table; END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(v_role,v_table,'SELECT')
        OR has_table_privilege(v_role,v_table,'INSERT')
        OR has_table_privilege(v_role,v_table,'UPDATE')
        OR has_table_privilege(v_role,v_table,'DELETE')
      THEN RAISE EXCEPTION 'OPERATIONAL_BROWSER_GRANT_PRESENT: % %',v_role,v_table; END IF;
    END LOOP;
  END LOOP;
  -- authenticated retains only the established Batch 4 schema USAGE needed
  -- by the Staff Admin invoker wrapper; no direct table grants are present.
  IF has_schema_privilege('anon','app_private','USAGE')
     OR has_schema_privilege('service_role','app_private','USAGE')
     OR NOT has_schema_privilege('authenticated','app_private','USAGE')
  THEN RAISE EXCEPTION 'OPERATIONAL_PRIVATE_SCHEMA_GRANTS_INVALID'; END IF;
  IF has_table_privilege('service_role','public.user_profiles','SELECT')
     OR has_table_privilege('service_role','public.user_roles','SELECT')
     OR has_table_privilege('service_role','public.staff_role_audit','SELECT')
     OR has_table_privilege('service_role','public.orders','INSERT')
     OR has_table_privilege('service_role','public.orders','UPDATE')
     OR has_table_privilege('service_role','public.orders','DELETE')
     OR has_table_privilege('service_role','public.payments','INSERT')
  THEN RAISE EXCEPTION 'OPERATIONAL_SERVICE_DIRECT_DML_PRESENT'; END IF;
  IF NOT has_column_privilege('service_role','public.rider_profiles','availability_status','UPDATE')
     OR NOT has_column_privilege('service_role','public.rider_profiles','accepting_jobs','UPDATE')
     OR NOT has_column_privilege('service_role','public.rider_profiles','last_seen_at','UPDATE')
     OR has_table_privilege('service_role','public.rider_profiles','UPDATE')
  THEN RAISE EXCEPTION 'OPERATIONAL_RIDER_PRESENCE_GRANT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename IN('orders','delivery_tasks','delivery_task_offers','delivery_assignments','rider_profiles'))
  THEN RAISE EXCEPTION 'OPERATIONAL_REALTIME_PREMATURE'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN('orders','order_items','payments')
    AND column_name IN('tax_amount','tax_rate','gst_amount','service_charge','tip_amount'))
  THEN RAISE EXCEPTION 'GST_OR_DEFERRED_TAX_FIELDS_PRESENT'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='rider_push_subscriptions' AND column_name IN('endpoint','p256dh','auth'))
  THEN RAISE EXCEPTION 'CLEARTEXT_PUSH_FIELDS_PRESENT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.delivery_tasks'::regclass
      AND conname='delivery_tasks_id_branch_restaurant_key' AND contype='u')
  THEN RAISE EXCEPTION 'DELIVERY_TASK_BRANCH_RESTAURANT_COMPOSITE_KEY_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='delivery_assignments' AND column_name='arrived_at')
  THEN RAISE EXCEPTION 'RETIRED_DELIVERY_ARRIVAL_COLUMN_PRESENT'; END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.delivery_tasks'::regclass
      AND conname='delivery_tasks_status_check'
      AND pg_get_constraintdef(oid) ILIKE '%arrived_at_restaurant%')
  THEN RAISE EXCEPTION 'RETIRED_DELIVERY_ARRIVAL_STATUS_PRESENT'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='delivery_assignments'
      AND column_name='status'
      AND position('accepted' IN column_default)>0
      AND position('assigned' IN column_default)=0
  )
  THEN RAISE EXCEPTION 'DELIVERY_ASSIGNMENT_DEFAULT_NOT_ACCEPTED'; END IF;
END;
$check$;
DO $fixtures$
DECLARE r uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); f numeric;
BEGIN
  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(r,'QA Flame Chick','qa-flame-chick-operational-v1','PKR','Asia/Karachi',true);
  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
  VALUES(b,r,'qa-main','QA Main',true);
  INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
  VALUES(a,r,b,'QA Zero Fee',0,true);
  INSERT INTO public.branch_delivery_settings(branch_id,restaurant_id,not_listed_delivery_fee)
  VALUES(b,r,NULL);
  SELECT not_listed_delivery_fee INTO f FROM public.branch_delivery_settings WHERE branch_id=b;
  IF f IS NOT NULL THEN RAISE EXCEPTION 'NULL_FEE_WAS_COERCED_TO_ZERO'; END IF;
  UPDATE public.branch_delivery_settings SET not_listed_delivery_fee=0 WHERE branch_id=b;
  SELECT not_listed_delivery_fee INTO f FROM public.branch_delivery_settings WHERE branch_id=b;
  IF f IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'EXPLICIT_ZERO_FEE_LOST'; END IF;
  INSERT INTO public.orders(id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,source,
    fulfillment_type,status,customer_name,customer_phone,delivery_area_fee_snapshot,
    subtotal,discount_amount,delivery_fee,total,currency_code,payment_status)
  VALUES(o,r,b,'QA-0001','qa-operational-key-0001',repeat('a',64),'pos','pickup','new',
    'QA Customer','03000000000',0,100,0,0,100,'PKR','unpaid');
  INSERT INTO public.order_status_history(restaurant_id,branch_id,order_id,to_status,action,actor_type,metadata)
  VALUES(r,b,o,'new','created','system','{}'::jsonb);
  BEGIN
    UPDATE public.order_status_history SET reason='mutated' WHERE order_id=o;
    RAISE EXCEPTION 'ORDER_STATUS_HISTORY_UPDATE_ALLOWED';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$fixtures$;
ROLLBACK;
DO $cleanup$
BEGIN
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='qa-flame-chick-operational-v1')
  THEN RAISE EXCEPTION 'OPERATIONAL_QA_FIXTURE_NOT_ROLLED_BACK'; END IF;
END;
$cleanup$;
