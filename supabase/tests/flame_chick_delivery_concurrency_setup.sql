-- Disposable committed fixture for true multi-session delivery race tests.
-- This file runs only in the ephemeral Supabase QA job; that entire local stack
-- is stopped at the end of the workflow. Staff identity/audit tables enforce
-- hard-delete and append-only rules, so the test does not bypass those guards.
BEGIN;

DO $preflight$
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_FIXTURE_REQUIRES_POSTGRES';
  END IF;
  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick-delivery-race-qa')
     OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'qa-delivery-race-%@example.invalid') THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_FIXTURE_IDENTITY_CONFLICT';
  END IF;
END
$preflight$;

INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
VALUES('c6666666-6666-4666-8666-666666666660','QA Delivery Concurrency','flame-chick-delivery-race-qa','PKR','Asia/Karachi',true);
INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active)
VALUES('c6666666-6666-4666-8666-666666666661','c6666666-6666-4666-8666-666666666660','qa-race','QA Concurrency Branch',true);
INSERT INTO public.delivery_areas(id,restaurant_id,branch_id,name,delivery_fee,is_active)
VALUES('c6666666-6666-4666-8666-666666666662','c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661','QA Race Area',0,true);

INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
VALUES
 ('c6666666-6666-4666-8666-666666666670','authenticated','authenticated','qa-delivery-race-admin@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('c6666666-6666-4666-8666-666666666671','authenticated','authenticated','qa-delivery-race-rider-one@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('c6666666-6666-4666-8666-666666666672','authenticated','authenticated','qa-delivery-race-rider-two@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false),
 ('c6666666-6666-4666-8666-666666666673','authenticated','authenticated','qa-delivery-race-manager@example.invalid','',clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp(),false,false);

INSERT INTO public.user_profiles(user_id,display_name,is_active)
VALUES
 ('c6666666-6666-4666-8666-666666666670','QA Delivery Race Admin',true),
 ('c6666666-6666-4666-8666-666666666671','QA Delivery Race Rider One',true),
 ('c6666666-6666-4666-8666-666666666672','QA Delivery Race Rider Two',true),
 ('c6666666-6666-4666-8666-666666666673','QA Delivery Race Manager',true);

-- First restaurant-wide Admin uses the trusted bootstrap-only path.
INSERT INTO public.user_roles(restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,
  reason,request_id,assignment_method)
VALUES('c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666670','admin',NULL,true,
  'c6666666-6666-4666-8666-666666666670','Disposable concurrency fixture',
  'c6666666-6666-4666-8666-666666666679','initial_bootstrap');

-- Operational roles are assigned through the authenticated Staff Admin command.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','c6666666-6666-4666-8666-666666666670',true);

DO $roles$
DECLARE result jsonb; branch_id uuid:='c6666666-6666-4666-8666-666666666661';
BEGIN
  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','c6666666-6666-4666-8666-666666666671','role_key','rider',
    'branch_ids',jsonb_build_array(branch_id),'request_id','c6666666-6666-4666-8666-666666666681',
    'reason','Disposable concurrent delivery QA'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'RACE_FIXTURE_RIDER_ONE_ROLE_FAILED: %',result; END IF;

  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','c6666666-6666-4666-8666-666666666672','role_key','rider',
    'branch_ids',jsonb_build_array(branch_id),'request_id','c6666666-6666-4666-8666-666666666682',
    'reason','Disposable concurrent delivery QA'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'RACE_FIXTURE_RIDER_TWO_ROLE_FAILED: %',result; END IF;

  result:=public.flame_chick_staff_admin_command('assign_role',jsonb_build_object(
    'target_user_id','c6666666-6666-4666-8666-666666666673','role_key','manager',
    'branch_ids',jsonb_build_array(branch_id),'request_id','c6666666-6666-4666-8666-666666666683',
    'reason','Disposable concurrent delivery QA'));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'RACE_FIXTURE_MANAGER_ROLE_FAILED: %',result; END IF;
END
$roles$;
RESET ROLE;

INSERT INTO public.rider_profiles(restaurant_id,branch_id,user_id,rider_code,display_name,
  availability_status,accepting_jobs,last_seen_at,is_active)
VALUES
 ('c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661','c6666666-6666-4666-8666-666666666671',
  'qa-race-r1','QA Race Rider One','available',true,clock_timestamp(),true),
 ('c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661','c6666666-6666-4666-8666-666666666672',
  'qa-race-r2','QA Race Rider Two','available',true,clock_timestamp(),true);

INSERT INTO public.orders(id,restaurant_id,branch_id,order_number,idempotency_key,request_hash,source,
  fulfillment_type,status,customer_name,customer_phone,delivery_address,delivery_area_id,
  delivery_area_name_snapshot,delivery_selection_type,delivery_area_fee_snapshot,
  subtotal,discount_amount,delivery_fee,total,currency_code,payment_status)
VALUES
 ('c6666666-6666-4666-8666-666666666680','c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661',
  'QA-RACE-0001','qa-delivery-race-order-0001',repeat('e',64),'pos','delivery','ready',
  'QA Race Customer One','03000000001','201 QA Race Road, Karachi','c6666666-6666-4666-8666-666666666662',
  'QA Race Area','listed_area',0,100,0,0,100,'PKR','unpaid'),
 ('c6666666-6666-4666-8666-666666666681','c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661',
  'QA-RACE-0002','qa-delivery-race-order-0002',repeat('f',64),'pos','delivery','ready',
  'QA Race Customer Two','03000000002','202 QA Race Road, Karachi','c6666666-6666-4666-8666-666666666662',
  'QA Race Area','listed_area',0,150,0,0,150,'PKR','unpaid');

INSERT INTO public.delivery_tasks(id,restaurant_id,branch_id,order_id,status,
  recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,
  area_id_snapshot,delivery_selection_type_snapshot,delivery_fee_snapshot)
VALUES
 ('c6666666-6666-4666-8666-666666666690','c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661',
  'c6666666-6666-4666-8666-666666666680','dispatch_pending','QA Race Customer One','03000000001',
  '201 QA Race Road, Karachi','QA Race Area','c6666666-6666-4666-8666-666666666662','listed_area',0),
 ('c6666666-6666-4666-8666-666666666691','c6666666-6666-4666-8666-666666666660','c6666666-6666-4666-8666-666666666661',
  'c6666666-6666-4666-8666-666666666681','dispatch_pending','QA Race Customer Two','03000000002',
  '202 QA Race Road, Karachi','QA Race Area','c6666666-6666-4666-8666-666666666662','listed_area',0);

DO $offers$
DECLARE result jsonb;
BEGIN
  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id','c6666666-6666-4666-8666-666666666690',
    'actor_user_id','c6666666-6666-4666-8666-666666666673',
    'rider_user_id','c6666666-6666-4666-8666-666666666671',
    'request_id','c6666666-6666-4666-8666-666666666701'));
  IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'task_status'<>'offering' THEN
    RAISE EXCEPTION 'RACE_FIXTURE_FIRST_OFFER_FAILED: %',result;
  END IF;

  result:=public.flame_chick_manage_delivery(jsonb_build_object(
    'action','assign','delivery_task_id','c6666666-6666-4666-8666-666666666691',
    'actor_user_id','c6666666-6666-4666-8666-666666666673',
    'rider_user_id','c6666666-6666-4666-8666-666666666672',
    'request_id','c6666666-6666-4666-8666-666666666702'));
  IF result->>'ok' IS DISTINCT FROM 'true' OR result->>'task_status'<>'offering' THEN
    RAISE EXCEPTION 'RACE_FIXTURE_SECOND_OFFER_FAILED: %',result;
  END IF;
END
$offers$;

COMMIT;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE restaurant_id='c6666666-6666-4666-8666-666666666660' AND is_active)<>4
     OR (SELECT count(*) FROM public.staff_role_audit WHERE restaurant_id='c6666666-6666-4666-8666-666666666660')<>3
     OR (SELECT count(*) FROM public.delivery_task_offers WHERE restaurant_id='c6666666-6666-4666-8666-666666666660' AND status='offered')<>2 THEN
    RAISE EXCEPTION 'DELIVERY_CONCURRENCY_FIXTURE_SETUP_INCOMPLETE';
  END IF;
END
$verify$;
