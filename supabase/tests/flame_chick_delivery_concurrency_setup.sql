-- One-time fixture setup for the true multi-session concurrency QA workflow.
-- Run only on the disposable local Supabase instance. The workflow tears down
-- the entire stack after testing; these identities are never provisioned remotely.
DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_SETUP_REQUIRES_POSTGRES';
  END IF;
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick-delivery-race-qa')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'qa-delivery-race-%@example.invalid') THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_SETUP_IDENTITY_CONFLICT';
  END IF;
END
$preflight$;

-- A deterministic, test-only clock hook. The migration's production helper
-- remains clock_timestamp(); this override exists only in this disposable DB.
CREATE OR REPLACE FUNCTION app_private.flame_chick_delivery_clock_now()
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path=''
AS $function$
DECLARE
  v_count integer;
  v_sleep_call integer;
  v_delay double precision;
  v_forced timestamptz;
BEGIN
  v_count:=COALESCE(NULLIF(pg_catalog.current_setting('test.delivery.clock_call_count',true),''),'0')::integer+1;
  PERFORM pg_catalog.set_config('test.delivery.clock_call_count',v_count::text,true);
  v_sleep_call:=COALESCE(NULLIF(pg_catalog.current_setting('test.delivery.clock_sleep_on_call',true),''),'0')::integer;
  v_delay:=COALESCE(NULLIF(pg_catalog.current_setting('test.delivery.clock_sleep_seconds',true),''),'0')::double precision;
  IF v_sleep_call=v_count AND v_delay>0 THEN
    PERFORM pg_catalog.pg_sleep(v_delay);
  END IF;
  v_forced:=NULLIF(pg_catalog.current_setting('test.delivery.clock_now',true),'')::timestamptz;
  RETURN COALESCE(v_forced,pg_catalog.clock_timestamp());
END
$function$;

INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
VALUES('b7777777-7777-4777-8777-777777777660','QA Delivery Concurrency','flame-chick-delivery-race-qa','PKR','Asia/Karachi',true);
INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
VALUES('b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777660','qa-race','QA Concurrency Branch',true);
INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
VALUES('b7777777-7777-4777-8777-777777777662','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','QA Race Area',0,true);

INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
VALUES
 ('b7777777-7777-4777-8777-777777777670','authenticated','authenticated','qa-delivery-race-admin@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('b7777777-7777-4777-8777-777777777671','authenticated','authenticated','qa-delivery-race-rider-one@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('b7777777-7777-4777-8777-777777777672','authenticated','authenticated','qa-delivery-race-rider-two@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('b7777777-7777-4777-8777-777777777673','authenticated','authenticated','qa-delivery-race-manager@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('b7777777-7777-4777-8777-777777777674','authenticated','authenticated','qa-delivery-race-rider-three@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('b7777777-7777-4777-8777-777777777675','authenticated','authenticated','qa-delivery-race-rider-four@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false);

INSERT INTO public.user_profiles(user_id,display_name,is_active)
VALUES
 ('b7777777-7777-4777-8777-777777777670','QA Race Admin',true),
 ('b7777777-7777-4777-8777-777777777671','QA Race Rider One',true),
 ('b7777777-7777-4777-8777-777777777672','QA Race Rider Two',true),
 ('b7777777-7777-4777-8777-777777777673','QA Race Manager',true),
 ('b7777777-7777-4777-8777-777777777674','QA Race Rider Three',true),
 ('b7777777-7777-4777-8777-777777777675','QA Race Rider Four',true);

INSERT INTO public.user_roles(restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,
  reason,request_id,assignment_method)
VALUES('b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777670','admin',NULL,true,
  'b7777777-7777-4777-8777-777777777670','Disposable concurrent delivery QA',
  'b7777777-7777-4777-8777-777777777679','initial_bootstrap');

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.role','authenticated',false);
SELECT pg_catalog.set_config('request.jwt.claim.sub','b7777777-7777-4777-8777-777777777670',false);

DO $roles$
DECLARE
  result jsonb;
  v_branch uuid:='b7777777-7777-4777-8777-777777777661';
  v_pair uuid[]:=ARRAY[
    'b7777777-7777-4777-8777-777777777671'::uuid,
    'b7777777-7777-4777-8777-777777777672'::uuid,
    'b7777777-7777-4777-8777-777777777674'::uuid,
    'b7777777-7777-4777-8777-777777777675'::uuid
  ];
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
      'target_user_id',v_pair[v_i],'role_key','rider','branch_ids',pg_catalog.jsonb_build_array(v_branch),
      'request_id',pg_catalog.gen_random_uuid(),'reason','Disposable concurrent delivery QA'));
    IF result->>'ok' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'RACE_FIXTURE_RIDER_ROLE_ASSIGNMENT_FAILED_%: %',v_i,result;
    END IF;
  END LOOP;

  result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
    'target_user_id','b7777777-7777-4777-8777-777777777673','role_key','manager',
    'branch_ids',pg_catalog.jsonb_build_array(v_branch),'request_id',pg_catalog.gen_random_uuid(),
    'reason','Disposable concurrent delivery QA'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'RACE_FIXTURE_MANAGER_ROLE_ASSIGNMENT_FAILED: %',result;
  END IF;
END
$roles$;
RESET ROLE;

INSERT INTO public.rider_profiles(restaurant_id,branch_id,user_id,rider_code,display_name,
  availability_status,accepting_jobs,last_seen_at,is_active)
VALUES
 ('b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777671','qa-race-r1','QA Race Rider One','available',true,clock_timestamp(),true),
 ('b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777672','qa-race-r2','QA Race Rider Two','available',true,clock_timestamp(),true),
 ('b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777674','qa-race-r3','QA Race Rider Three','available',true,clock_timestamp(),true),
 ('b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777675','qa-race-r4','QA Race Rider Four','available',true,clock_timestamp(),true);

INSERT INTO public.orders(id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,source,
  fulfillment_type,status,customer_name,customer_phone,delivery_address,delivery_area_id,
  delivery_area_name_snapshot,delivery_selection_type,delivery_area_fee_snapshot,
  subtotal,discount_amount,delivery_fee,total,currency_code,payment_status)
VALUES
 ('b7777777-7777-4777-8777-777777777680','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','QA-RACE-0001','qa-race-order-0001',repeat('e',64),'pos','delivery','ready','QA Race One','03000000001','201 QA Race Road, Karachi','b7777777-7777-4777-8777-777777777662','QA Race Area','listed_area',0,100,0,0,100,'PKR','unpaid'),
 ('b7777777-7777-4777-8777-777777777681','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','QA-RACE-0002','qa-race-order-0002',repeat('f',64),'pos','delivery','ready','QA Race Two','03000000002','202 QA Race Road, Karachi','b7777777-7777-4777-8777-777777777662','QA Race Area','listed_area',0,150,0,0,150,'PKR','unpaid'),
 ('b7777777-7777-4777-8777-777777777682','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','QA-RACE-0003','qa-race-order-0003',repeat('a',64),'pos','delivery','ready','QA Race Three','03000000003','203 QA Race Road, Karachi','b7777777-7777-4777-8777-777777777662','QA Race Area','listed_area',0,200,0,0,200,'PKR','unpaid'),
 ('b7777777-7777-4777-8777-777777777683','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','QA-RACE-0004','qa-race-order-0004',repeat('d',64),'pos','delivery','ready','QA Race Four','03000000004','204 QA Race Road, Karachi','b7777777-7777-4777-8777-777777777662','QA Race Area','listed_area',0,250,0,0,250,'PKR','unpaid');

INSERT INTO public.delivery_tasks(id,restaurant_id,branch_id,order_id,status,
  recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,
  area_id_snapshot,delivery_selection_type_snapshot,delivery_fee_snapshot)
VALUES
 ('b7777777-7777-4777-8777-777777777690','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777680','dispatch_pending','QA Race One','03000000001','201 QA Race Road, Karachi','QA Race Area','b7777777-7777-4777-8777-777777777662','listed_area',0),
 ('b7777777-7777-4777-8777-777777777691','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777681','dispatch_pending','QA Race Two','03000000002','202 QA Race Road, Karachi','QA Race Area','b7777777-7777-4777-8777-777777777662','listed_area',0),
 ('b7777777-7777-4777-8777-777777777692','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b7777777-7777-4777-8777-777777777682','dispatch_pending','QA Race Three','03000000003','203 QA Race Road, Karachi','QA Race Area','b7777777-7777-4777-8777-777777777662','listed_area',0),
 ('b7777777-7777-4777-8777-777777777693','b7777777-7777-4777-8777-777777777660','b7777777-7777-4777-8777-777777777661','b777777777-7777-4777-8777-777777777683','dispatch_pending','QA Race Four','03000000004','204 QA Race Road, Karachi','QA Race Area','b7777777-7777-4777-8777-777777777662','listed_area',0);

DO $assign_offers$
DECLARE
  v_task uuid[]:=ARRAY[
    'b7777777-7777-4777-8777-777777777690'::uuid,
    'b7777777-7777-4777-8777-777777777691'::uuid,
    'b7777777-7777-4777-8777-777777777692'::uuid,
    'b7777777-7777-4777-8777-777777777693'::uuid
  ];
  v_rider uuid[]:=ARRAY[
    'b7777777-7777-4777-8777-777777777671'::uuid,
    'b7777777-7777-4777-8777-777777777672'::uuid,
    'b7777777-7777-4777-8777-777777777674'::uuid,
    'b7777777-7777-4777-8777-777777777675'::uuid
  ];
  result jsonb;
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    result:=public.flame_chick_manage_delivery(pg_catalog.jsonb_build_object(
      'action','assign','delivery_task_id',v_task[v_i],
      'actor_user_id','b7777777-7777-4777-8777-777777777673',
      'rider_user_id',v_rider[v_i],'request_id',pg_catalog.gen_random_uuid()));
    IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'task_status'<>'offering' THEN
      RAISE EXCEPTION 'RACE_FIXTURE_OFFER_ASSIGNMENT_FAILED_%: %',v_i,result;
    END IF;
  END LOOP;
END
$assign_offers$;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE restaurant_id='b7777777-7777-4777-8777-777777777660' AND is_active)<>6
     OR (SELECT count(*) FROM public.staff_role_audit WHERE restaurant_id='b7777777-7777-4777-8777-777777777660')<>5
     OR (SELECT count(*) FROM public.delivery_task_offers WHERE restaurant_id='b7777777-7777-4777-8777-777777777660' AND status='offered')<>4 THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_FIXTURE_SETUP_INCOMPLETE';
  END IF;
END
$verify$;
