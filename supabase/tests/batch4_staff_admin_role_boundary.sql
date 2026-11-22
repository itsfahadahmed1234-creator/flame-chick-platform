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
  v_now timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_FIXTURE_REQUIRES_POSTGRES';
  END IF;

  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  WHERE slug='flame-chick' AND is_active
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_RESTAURANT_NOT_READY';
  END IF;

  SELECT id INTO v_branch_id
  FROM public.branches
  WHERE restaurant_id=v_restaurant_id AND is_active
  ORDER BY branch_code,id
  LIMIT 1;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_ACTIVE_BRANCH_REQUIRED';
  END IF;

  IF EXISTS(SELECT 1 FROM public.user_roles WHERE restaurant_id=v_restaurant_id) THEN
    RAISE EXCEPTION 'STAFF_ROLE_BOUNDARY_FIXTURE_EXPECTS_EMPTY_LOCAL_STAFF';
  END IF;

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmed_at,is_sso_user,is_anonymous
  ) VALUES
    (v_admin,'authenticated','authenticated','qa-staff-admin-admin@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,v_now,false,false),
    (v_owner,'authenticated','authenticated','qa-staff-admin-owner@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,v_now,false,false),
    (v_manager,'authenticated','authenticated','qa-staff-admin-manager@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,v_now,false,false),
    (v_cashier,'authenticated','authenticated','qa-staff-admin-cashier@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,v_now,false,false),
    (v_rider,'authenticated','authenticated','qa-staff-admin-rider@example.invalid','',v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,v_now,v_now,v_now,false,false);

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
BEGIN
  SELECT id INTO v_restaurant_id FROM public.restaurants
  WHERE slug='flame-chick' AND is_active LIMIT 1;
  SELECT id INTO v_branch_id FROM public.branches
  WHERE restaurant_id=v_restaurant_id AND is_active ORDER BY branch_code,id LIMIT 1;

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
END
$assign$;

-- Admin and Owner may read the private Staff Admin context.
DO $positive$
DECLARE
  v_result jsonb;
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
      ('a5555555-5555-4555-8555-555555555555'::uuid,'rider'::text)
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
