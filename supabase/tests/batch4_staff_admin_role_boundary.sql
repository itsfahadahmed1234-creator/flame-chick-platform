-- Staff Admin runtime authorization boundary test.
-- Disposable local Supabase CI only. All synthetic Auth users, profiles, roles and
-- audit records are created inside this transaction and removed by ROLLBACK.
BEGIN;

DO $setup$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_admin uuid := 'a1111111-1111-4111-8111-111111111111';
  v_owner uuid := 'a2222222-2222-4222-8222-222222222222';
  v_manager uuid := 'a3333333-3333-4333-8333-333333333333';
  v_cashier uuid := 'a4444444-4444-4444-8444-444444444444';
  v_rider uuid := 'a5555555-5555-4555-8555-555555555555';
  v_invited_rider uuid := 'a6666666-6666-4666-8666-666666666666';
  v_now timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_FIXTURE_REQUIRES_POSTGRES';
  END IF;

  -- Migrations intentionally create schema only. Create a tenant and branch
  -- with the canonical Flame Chick slug inside this disposable transaction.
  v_restaurant_id := 'f1111111-1111-4111-8111-111111111111';
  v_branch_id := 'f2222222-2222-4222-8222-222222222222';

  IF EXISTS(SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS(SELECT 1 FROM public.restaurants WHERE id=v_restaurant_id)
     OR EXISTS(SELECT 1 FROM public.branches WHERE id=v_branch_id) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_FIXTURE_TENANT_ID_CONFLICT';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES(v_restaurant_id,'Flame Chick QA','flame-chick','PKR','Asia/Karachi',true);

  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active,timezone)
  VALUES(v_branch_id,v_restaurant_id,'main','Main',true,'Asia/Karachi');

  -- Pass fixture identifiers through transaction-local settings so the
  -- authenticated test never queries private tenant tables directly.
  PERFORM pg_catalog.set_config('test.staff_restaurant_id',v_restaurant_id::text,true);
  PERFORM pg_catalog.set_config('test.staff_branch_id',v_branch_id::text,true);
  PERFORM pg_catalog.set_config('test.staff_invited_rider_id',v_invited_rider::text,true);

  IF EXISTS(SELECT 1 FROM public.user_roles WHERE restaurant_id=v_restaurant_id) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_FIXTURE_EXPECTS_EMPTY_LOCAL_STAFF';
  END IF;

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    is_sso_user,is_anonymous
  ) VALUES
    (v_admin,'authenticated','authenticated','qa-staff-admin-admin@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false),
    (v_owner,'authenticated','authenticated','qa-staff-admin-owner@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false),
    (v_manager,'authenticated','authenticated','qa-staff-admin-manager@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false),
    (v_cashier,'authenticated','authenticated','qa-staff-admin-cashier@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false),
    (v_rider,'authenticated','authenticated','qa-staff-admin-rider@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false),
    (v_invited_rider,'authenticated','authenticated','qa-staff-admin-invited-rider@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,false,false);

  INSERT INTO public.user_profiles(user_id,display_name,is_active)
  VALUES
    (v_admin,'QA Staff Admin',true),
    (v_owner,'QA Staff Owner',true),
    (v_manager,'QA Staff Manager',true),
    (v_cashier,'QA Staff Cashier',true),
    (v_rider,'QA Staff Rider',true);

  -- First restaurant-wide Admin is created only through the trusted bootstrap path.
  INSERT INTO public.user_roles(
    restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,
    reason,request_id,assignment_method
  ) VALUES (
    v_restaurant_id,v_admin,'admin',NULL,true,v_admin,
    'Disposable Staff Admin authorization fixture',
    'b1111111-1111-4111-8111-111111111111','initial_bootstrap'
  );
END
$setup$;

-- Run the real invoker wrapper as the authenticated database role.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
SELECT pg_catalog.set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);

DO $assign$
DECLARE
  v_branch_id uuid;
  v_restaurant_id uuid;
  v_result jsonb;
  v_message text;
BEGIN
  v_restaurant_id:=pg_catalog.current_setting('test.staff_restaurant_id')::uuid;
  v_branch_id:=pg_catalog.current_setting('test.staff_branch_id')::uuid;

  v_result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
    'target_user_id','a2222222-2222-4222-8222-222222222222',
    'role_key','owner','branch_ids','[]'::jsonb,
    'request_id','b2222222-2222-4222-8222-222222222222',
    'reason','Disposable Staff Admin authorization fixture'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_OWNER_ASSIGNMENT_FAILED';
  END IF;

  v_result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
    'target_user_id','a3333333-3333-4333-8333-333333333333',
    'role_key','manager','branch_ids',pg_catalog.jsonb_build_array(v_branch_id),
    'request_id','b3333333-3333-4333-8333-333333333333',
    'reason','Disposable Staff Admin authorization fixture'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_MANAGER_ASSIGNMENT_FAILED';
  END IF;

  v_result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
    'target_user_id','a4444444-4444-4444-8444-444444444444',
    'role_key','cashier','branch_ids',pg_catalog.jsonb_build_array(v_branch_id),
    'request_id','b4444444-4444-4444-8444-444444444444',
    'reason','Disposable Staff Admin authorization fixture'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_CASHIER_ASSIGNMENT_FAILED';
  END IF;

  v_result:=public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
    'target_user_id','a5555555-5555-4555-8555-555555555555',
    'role_key','rider','branch_ids',pg_catalog.jsonb_build_array(v_branch_id),
    'request_id','b5555555-5555-4555-8555-555555555555',
    'reason','Disposable Staff Admin authorization fixture'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_ASSIGNMENT_FAILED';
  END IF;

  -- The server must reject a caller-supplied branch other than Main, even when
  -- an authenticated Admin invokes the role command directly.
  BEGIN
    PERFORM public.flame_chick_staff_admin_command('assign_role',pg_catalog.jsonb_build_object(
      'target_user_id','a3333333-3333-4333-8333-333333333333',
      'role_key','manager','branch_ids',pg_catalog.jsonb_build_array('f3333333-3333-4333-8333-333333333333'),
      'request_id','b6666666-6666-4666-8666-666666666666',
      'reason','Main branch enforcement test'
    ));
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_NON_MAIN_BRANCH_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message IS DISTINCT FROM 'STAFF_MAIN_BRANCH_FIXED' THEN
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_WRONG_NON_MAIN_DENIAL: %',v_message;
    END IF;
  END;

  -- Admin can invite a Rider without supplying a branch. The database resolves
  -- the sole active Main branch and stores it as the invitation's target.
  v_result:=public.flame_chick_staff_admin_command('begin_invitation',pg_catalog.jsonb_build_object(
    'display_name','QA Invited Rider',
    'email','qa-staff-admin-invited-rider@example.invalid',
    'phone',NULL,
    'role_key','rider',
    'branch_ids','[]'::jsonb,
    'request_id','b8888888-8888-4888-8888-888888888888',
    'reason','Disposable automatic Main invitation fixture'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true'
     OR v_result->'branch_ids'<>pg_catalog.jsonb_build_array(v_branch_id::text) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_MAIN_RIDER_INVITATION_FAILED';
  END IF;
END
$assign$;

-- A confirmed invited account accepts by its exact email. This must create both
-- its Rider role row and its Main-branch Rider profile atomically.
SELECT pg_catalog.set_config('request.jwt.claim.sub','a6666666-6666-4666-8666-666666666666',true);
DO $accept_invitation$
DECLARE
  v_result jsonb;
BEGIN
  v_result:=public.flame_chick_staff_admin_command('accept_invitation','{}'::jsonb);
  IF v_result->>'ok' IS DISTINCT FROM 'true'
     OR v_result->>'status' IS DISTINCT FROM 'accepted'
     OR v_result->>'role_key' IS DISTINCT FROM 'rider' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_INVITATION_ACCEPTANCE_FAILED';
  END IF;
END
$accept_invitation$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);

-- Admin and Owner may read the private Staff Admin context.
DO $positive$
DECLARE
  v_result jsonb;
  v_topic text;
  v_visible integer;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
  v_result:=public.flame_chick_staff_admin_command('list','{}'::jsonb);
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR v_result->>'actor_role' IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_ADMIN_ACCESS_FAILED';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
  v_result:=public.flame_chick_staff_admin_command('list','{}'::jsonb);
  IF v_result->>'ok' IS DISTINCT FROM 'true' OR v_result->>'actor_role' IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_OWNER_ACCESS_FAILED';
  END IF;

  v_topic:='fc:branch:'||pg_catalog.current_setting('test.staff_branch_id')||':pos';
  PERFORM pg_catalog.set_config('realtime.topic',v_topic,true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_OWNER_REALTIME_ACCESS_FAILED';
  END IF;
  SELECT count(*) INTO v_visible FROM realtime.messages WHERE topic=v_topic;
  IF v_visible<1 THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_POS_BRANCH_BROADCAST_NOT_VISIBLE';
  END IF;

  -- Manager and Cashier see the same branch POS topic; Rider cannot see it.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','a3333333-3333-4333-8333-333333333333',true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_MANAGER_REALTIME_ACCESS_FAILED';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','a4444444-4444-4444-8444-444444444444',true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_CASHIER_REALTIME_ACCESS_FAILED';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub','a5555555-5555-4555-8555-555555555555',true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_RECEIVED_POS_TOPIC';
  END IF;
  SELECT count(*) INTO v_visible FROM realtime.messages WHERE topic=v_topic;
  IF v_visible<>0 THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_READ_POS_BROADCAST';
  END IF;

  -- A rider can receive only the private topic bound to auth.uid().
  v_topic:='fc:rider:a5555555-5555-4555-8555-555555555555:ops';
  PERFORM pg_catalog.set_config('realtime.topic',v_topic,true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_OWN_TOPIC_DENIED';
  END IF;
  SELECT count(*) INTO v_visible FROM realtime.messages WHERE topic=v_topic;
  IF v_visible<1 THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_BROADCAST_NOT_VISIBLE';
  END IF;

  v_topic:='fc:rider:a6666666-6666-4666-8666-666666666666:ops';
  PERFORM pg_catalog.set_config('realtime.topic',v_topic,true);
  IF app_private.flame_chick_realtime_can_receive(v_topic) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_CROSSTALK_ALLOWED';
  END IF;
  SELECT count(*) INTO v_visible FROM realtime.messages WHERE topic=v_topic;
  IF v_visible<>0 THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_READ_OTHER_RIDER_BROADCAST';
  END IF;

  PERFORM pg_catalog.set_config('realtime.topic',v_topic,true);
  IF EXISTS (
    SELECT 1 FROM realtime.messages
    WHERE topic LIKE 'fc:%'
      AND (payload::text ILIKE '%QA Staff Rider%' OR payload::text ILIKE '%qa-staff-admin-%')
  ) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_REALTIME_PAYLOAD_CONTAINS_PRIVATE_PROFILE_DATA';
  END IF;
END
$positive$;

-- Manager, Cashier and Rider cannot use Staff Admin, even when the request body
-- attempts to spoof an Admin identity or role.
DO $negative$
DECLARE
  v_actor uuid;
  v_role text;
  v_message text;
BEGIN
  FOR v_actor,v_role IN
    SELECT * FROM (VALUES
      ('a3333333-3333-4333-8333-333333333333'::uuid,'manager'::text),
      ('a4444444-4444-4444-8444-444444444444'::uuid,'cashier'::text),
      ('a5555555-5555-4555-8555-555555555555'::uuid,'rider'::text),
      ('a6666666-6666-4666-8666-666666666666'::uuid,'rider'::text)
    ) roles(actor_id,role_key)
  LOOP
    PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_actor::text,true);
    BEGIN
      PERFORM public.flame_chick_staff_admin_command(
        'list',
        pg_catalog.jsonb_build_object(
          'actor_user_id','a1111111-1111-4111-8111-111111111111',
          'actor_role','admin',
          'role_key','admin'
        )
      );
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_%_WAS_GRANTED_ADMIN_ACCESS',pg_catalog.upper(v_role);
    EXCEPTION WHEN SQLSTATE '42501' THEN
      GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'STAFF_ADMIN_FORBIDDEN' THEN
        RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_%_WRONG_DENIAL: %',pg_catalog.upper(v_role),v_message;
      END IF;
    END;

    BEGIN
      PERFORM public.flame_chick_staff_admin_command('assign_role','{}'::jsonb);
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_%_WAS_ALLOWED_TO_ASSIGN_ROLES',pg_catalog.upper(v_role);
    EXCEPTION WHEN SQLSTATE '42501' THEN
      GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
      IF v_message IS DISTINCT FROM 'STAFF_ADMIN_FORBIDDEN' THEN
        RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_%_WRONG_ASSIGN_DENIAL: %',pg_catalog.upper(v_role),v_message;
      END IF;
    END;
  END LOOP;
END
$negative$;

-- An authenticated database role without a user JWT is still unauthenticated.
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $no_identity$
DECLARE v_message text;
BEGIN
  BEGIN
    PERFORM public.flame_chick_staff_admin_command('list','{}'::jsonb);
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_MISSING_JWT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
    IF v_message IS DISTINCT FROM 'STAFF_AUTH_REQUIRED' THEN
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_MISSING_JWT_WRONG_DENIAL: %',v_message;
    END IF;
  END;
END
$no_identity$;

RESET ROLE;

-- Rider assignment creates a branch-matched profile in the same transaction.
DO $rider_profile$
DECLARE
  v_branch_id uuid:=pg_catalog.current_setting('test.staff_branch_id')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rider_profiles rp
    WHERE rp.user_id='a5555555-5555-4555-8555-555555555555'
      AND rp.restaurant_id=pg_catalog.current_setting('test.staff_restaurant_id')::uuid
      AND rp.branch_id=v_branch_id
      AND rp.rider_code='R-A5555555'
      AND rp.display_name='QA Staff Rider'
      AND rp.availability_status='offline'
      AND rp.accepting_jobs
      AND rp.is_active
  ) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_PROFILE_NOT_PROVISIONED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rider_profiles rp
    WHERE rp.user_id='a6666666-6666-4666-8666-666666666666'
      AND rp.restaurant_id=pg_catalog.current_setting('test.staff_restaurant_id')::uuid
      AND rp.branch_id=v_branch_id
      AND rp.rider_code='R-A6666666'
      AND rp.display_name='QA Invited Rider'
      AND rp.availability_status='offline'
      AND rp.accepting_jobs
      AND rp.is_active
  ) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_ACCEPTED_RIDER_PROFILE_NOT_PROVISIONED';
  END IF;
END
$rider_profile$;

-- Rider deactivation synchronizes the delivery profile and turns off offers.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
SELECT pg_catalog.set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
DO $deactivate_rider$
DECLARE
  v_role_id uuid;
  v_result jsonb;
BEGIN
  v_result:=public.flame_chick_staff_admin_command('list','{}'::jsonb);
  SELECT (item->>'role_id')::uuid INTO v_role_id
  FROM pg_catalog.jsonb_array_elements(v_result->'staff') item
  WHERE item->>'user_id'='a5555555-5555-4555-8555-555555555555'
    AND item->>'role_key'='rider'
    AND item->>'is_active'='true';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_ROLE_NOT_FOUND_FOR_DEACTIVATION';
  END IF;
  v_result:=public.flame_chick_staff_admin_command('deactivate_role',pg_catalog.jsonb_build_object(
    'role_id',v_role_id,
    'request_id','b7777777-7777-4777-8777-777777777777',
    'reason','Rider profile deactivation test'
  ));
  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_DEACTIVATION_FAILED';
  END IF;
END
$deactivate_rider$;
RESET ROLE;

DO $rider_profile_disabled$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rider_profiles rp
    WHERE rp.user_id='a5555555-5555-4555-8555-555555555555'
      AND NOT rp.is_active
      AND rp.availability_status='offline'
      AND NOT rp.accepting_jobs
  ) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RIDER_PROFILE_DEACTIVATION_NOT_SYNCED';
  END IF;
END
$rider_profile_disabled$;

-- Structural checks: no direct table access, no anon/staff Admin execute, and
-- no Realtime publication membership for staff identity or audit tables.
DO $grants$
DECLARE
  v_table text;
  v_role text;
  v_privilege text;
BEGIN
  IF pg_catalog.has_function_privilege('anon','public.flame_chick_staff_admin_command(text,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('anon','app_private.flame_chick_staff_admin_command_internal(text,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role','public.flame_chick_staff_admin_command(text,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated','public.flame_chick_staff_admin_system_command(text,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('anon','public.flame_chick_staff_admin_system_command(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RPC_GRANTS_TOO_BROAD';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated','public.flame_chick_staff_admin_command(text,jsonb)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role','public.flame_chick_staff_admin_system_command(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_REQUIRED_RPC_GRANT_MISSING';
  END IF;

  IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
     OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE')
     OR NOT pg_catalog.has_schema_privilege('authenticated','app_private','USAGE') THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_PRIVATE_SCHEMA_GRANTS_INVALID';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.user_profiles','public.user_roles','public.staff_role_audit',
    'app_private.staff_invitation_requests','app_private.staff_invitation_branch_targets'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege(v_role,v_table,v_privilege) THEN
          RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_DIRECT_TABLE_PRIVILEGE: % % %',v_role,v_privilege,v_table;
        END IF;
      END LOOP;
    END LOOP;

    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid=pg_catalog.to_regclass(v_table) AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RLS_DISABLED: %',v_table;
    END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pg_catalog.format('%I.%I',pol.schemaname,pol.tablename)=v_table
    ) THEN
      RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_UNEXPECTED_POLICY: %',v_table;
    END IF;
  END LOOP;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE (schemaname='public' AND tablename IN ('user_profiles','user_roles','staff_role_audit'))
       OR (schemaname='app_private' AND tablename IN ('staff_invitation_requests','staff_invitation_branch_targets'))
  ) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_REALTIME_EXPOSURE';
  END IF;
END
$grants$;

ROLLBACK;
