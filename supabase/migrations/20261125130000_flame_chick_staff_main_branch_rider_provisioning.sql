-- Flame Chick staff provisioning: lock branch-scoped roles to Main and
-- create Rider profiles atomically with role activation.
-- Source migration for Production; no customer/order data is rewritten.
BEGIN;

CREATE OR REPLACE FUNCTION app_private.flame_chick_ensure_rider_profile(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_display_name text;
  v_phone text;
  v_profile_active boolean;
BEGIN
  IF p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'RIDER_PROFILE_ARGUMENT_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id=p_branch_id
      AND b.restaurant_id=p_restaurant_id
      AND b.is_active
      AND pg_catalog.lower(pg_catalog.btrim(b.branch_code))='main'
  ) THEN
    RAISE EXCEPTION 'STAFF_MAIN_BRANCH_UNAVAILABLE' USING ERRCODE='23514';
  END IF;

  SELECT up.display_name,up.phone
    INTO v_display_name,v_phone
  FROM public.user_profiles up
  WHERE up.user_id=p_user_id AND up.is_active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RIDER_USER_PROFILE_INACTIVE_OR_MISSING' USING ERRCODE='23514';
  END IF;

  SELECT rp.is_active INTO v_profile_active
  FROM public.rider_profiles rp
  WHERE rp.user_id=p_user_id AND rp.branch_id=p_branch_id
    AND rp.restaurant_id=p_restaurant_id
  FOR UPDATE;

  IF FOUND AND NOT v_profile_active AND EXISTS (
    SELECT 1
    FROM public.delivery_assignments da
    JOIN public.delivery_tasks dt
      ON dt.id=da.delivery_task_id
     AND dt.restaurant_id=da.restaurant_id
     AND dt.branch_id=da.branch_id
    WHERE da.restaurant_id=p_restaurant_id
      AND da.branch_id=p_branch_id
      AND da.rider_user_id=p_user_id
      AND da.is_current
      AND da.status IN ('accepted','out_for_delivery','failed')
      AND dt.status IN ('accepted','out_for_delivery','failed')
      AND dt.return_confirmed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'RIDER_HAS_ACTIVE_DELIVERY' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.rider_profiles AS rp(
    restaurant_id,branch_id,user_id,rider_code,display_name,phone,
    availability_status,accepting_jobs,is_active
  ) VALUES (
    p_restaurant_id,p_branch_id,p_user_id,
    'R-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(p_user_id::text,'-',''),1,8)),
    v_display_name,v_phone,'offline',true,true
  )
  ON CONFLICT(user_id,branch_id) DO UPDATE SET
    display_name=EXCLUDED.display_name,
    phone=EXCLUDED.phone,
    availability_status=CASE
      WHEN NOT rp.is_active THEN 'offline'
      ELSE rp.availability_status
    END,
    accepting_jobs=CASE
      WHEN NOT rp.is_active THEN true
      ELSE rp.accepting_jobs
    END,
    last_seen_at=CASE
      WHEN NOT rp.is_active THEN NULL
      ELSE rp.last_seen_at
    END,
    is_active=true,
    updated_at=pg_catalog.clock_timestamp();
END
$function$;

ALTER FUNCTION app_private.flame_chick_ensure_rider_profile(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.flame_chick_ensure_rider_profile(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE
  v_def text;
  v_action_pos integer;
  v_start integer;
  v_end integer;
  v_marker text;
  v_replacement text;
BEGIN
  v_def:=pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
  );

  -- Main is resolved by the database, not supplied as a trusted branch choice.
  v_action_pos:=pg_catalog.strpos(v_def,'IF v_action=''assign_role'' THEN');
  IF v_action_pos=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ASSIGN_ACTION_NOT_FOUND'; END IF;
  v_start:=v_action_pos+pg_catalog.strpos(pg_catalog.substr(v_def,v_action_pos),'    IF v_role IN (''admin'',''owner'') THEN')-1;
  v_end:=v_start+pg_catalog.strpos(pg_catalog.substr(v_def,v_start),'    SELECT count(*) INTO v_existing_count')-1;
  IF v_start<v_action_pos OR v_end<=v_start THEN
    RAISE EXCEPTION 'STAFF_MAIN_PATCH_ASSIGN_BRANCH_SECTION_NOT_FOUND';
  END IF;
  v_replacement:=$assign_branch$
    IF v_role IN ('admin','owner') THEN
      IF coalesce(v_payload->'branch_ids','[]'::jsonb)<>'[]'::jsonb THEN
        RAISE EXCEPTION 'STAFF_ADMIN_GLOBAL_ROLE_MUST_NOT_HAVE_BRANCHES' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[NULL::uuid];
    ELSE
      IF pg_catalog.jsonb_typeof(coalesce(v_payload->'branch_ids','[]'::jsonb))<>'array'
         OR pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb))>1 THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_FIXED' USING ERRCODE='22023';
      END IF;
      SELECT count(*),(pg_catalog.array_agg(b.id ORDER BY b.id))[1]
        INTO v_branch_count,v_branch_id
      FROM public.branches b
      WHERE b.restaurant_id=v_restaurant_id
        AND b.is_active
        AND pg_catalog.lower(pg_catalog.btrim(b.branch_code))='main';
      IF v_branch_count<>1 OR v_branch_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_UNAVAILABLE' USING ERRCODE='23514';
      END IF;
      IF pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb))=1
         AND (v_payload->'branch_ids'->>0) IS DISTINCT FROM v_branch_id::text THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_FIXED' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[v_branch_id];
    END IF;
  $assign_branch$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||pg_catalog.substr(v_def,v_end);

  -- Invitation creation uses the same fixed Main branch resolution.
  v_action_pos:=pg_catalog.strpos(v_def,'IF v_action=''begin_invitation'' THEN');
  IF v_action_pos=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_INVITE_ACTION_NOT_FOUND'; END IF;
  v_start:=v_action_pos+pg_catalog.strpos(pg_catalog.substr(v_def,v_action_pos),'    IF v_role IN (''admin'',''owner'') THEN')-1;
  v_end:=v_start+pg_catalog.strpos(pg_catalog.substr(v_def,v_start),'    SELECT * INTO v_invite FROM app_private.staff_invitation_requests')-1;
  IF v_start<v_action_pos OR v_end<=v_start THEN
    RAISE EXCEPTION 'STAFF_MAIN_PATCH_INVITE_BRANCH_SECTION_NOT_FOUND';
  END IF;
  v_replacement:=$invite_branch$
    IF v_role IN ('admin','owner') THEN
      IF coalesce(v_payload->'branch_ids','[]'::jsonb)<>'[]'::jsonb THEN
        RAISE EXCEPTION 'STAFF_ADMIN_GLOBAL_ROLE_MUST_NOT_HAVE_BRANCHES' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[]::uuid[];
    ELSE
      IF pg_catalog.jsonb_typeof(coalesce(v_payload->'branch_ids','[]'::jsonb))<>'array'
         OR pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb))>1 THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_FIXED' USING ERRCODE='22023';
      END IF;
      SELECT count(*),(pg_catalog.array_agg(b.id ORDER BY b.id))[1]
        INTO v_branch_count,v_branch_id
      FROM public.branches b
      WHERE b.restaurant_id=v_restaurant_id
        AND b.is_active
        AND pg_catalog.lower(pg_catalog.btrim(b.branch_code))='main';
      IF v_branch_count<>1 OR v_branch_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_UNAVAILABLE' USING ERRCODE='23514';
      END IF;
      IF pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb))=1
         AND (v_payload->'branch_ids'->>0) IS DISTINCT FROM v_branch_id::text THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_FIXED' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[v_branch_id];
    END IF;
  $invite_branch$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||pg_catalog.substr(v_def,v_end);

  -- Reject any previously-created invitation that is not exactly one active Main target.
  v_action_pos:=pg_catalog.strpos(v_def,'IF v_action=''accept_invitation'' THEN');
  IF v_action_pos=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ACCEPT_ACTION_NOT_FOUND'; END IF;
  v_start:=v_action_pos+pg_catalog.strpos(pg_catalog.substr(v_def,v_action_pos),'    IF v_invite.role_key IN (''manager'',''cashier'',''rider'') THEN')-1;
  v_end:=v_start+pg_catalog.strpos(pg_catalog.substr(v_def,v_start),'    INSERT INTO public.user_profiles(user_id,display_name,phone,is_active)')-1;
  IF v_start<v_action_pos OR v_end<=v_start THEN
    RAISE EXCEPTION 'STAFF_MAIN_PATCH_ACCEPT_BRANCH_SECTION_NOT_FOUND';
  END IF;
  v_replacement:=$accept_branch$
    IF v_invite.role_key IN ('manager','cashier','rider') THEN
      SELECT count(*)
        INTO v_branch_count
      FROM app_private.staff_invitation_branch_targets t
      JOIN public.branches b
        ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id AND b.is_active
      WHERE t.invitation_id=v_invite.id
        AND t.restaurant_id=v_restaurant_id
        AND pg_catalog.lower(pg_catalog.btrim(b.branch_code))='main';
      IF v_branch_count<>1
         OR v_branch_count<>(SELECT count(*) FROM app_private.staff_invitation_branch_targets t
                             WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id) THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_FIXED' USING ERRCODE='23514';
      END IF;
    END IF;
  $accept_branch$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||pg_catalog.substr(v_def,v_end);

  -- The direct role-assignment action and accepted invitation action both
  -- provision Rider profiles atomically with their role row.
  v_marker:=$assign_return$
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'request_id',v_request_id,'role_key',v_role,'branch_ids',to_jsonb(v_branch_ids));
  $assign_return$;
  v_start:=pg_catalog.strpos(v_def,v_marker);
  IF v_start=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ASSIGN_RETURN_NOT_FOUND'; END IF;
  v_replacement:=$assign_profile$
    IF v_role='rider' THEN
      PERFORM app_private.flame_chick_ensure_rider_profile(v_restaurant_id,v_branch_ids[1],v_target);
    END IF;
  $assign_profile$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||v_marker||pg_catalog.substr(v_def,v_start+pg_catalog.length(v_marker));

  -- Do not remove a Rider while a delivery or physical return is unresolved.
  v_action_pos:=pg_catalog.strpos(v_def,'IF v_action=''deactivate_role'' THEN');
  IF v_action_pos=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_DEACTIVATE_ACTION_NOT_FOUND'; END IF;
  v_start:=v_action_pos+pg_catalog.strpos(pg_catalog.substr(v_def,v_action_pos),'    UPDATE public.user_roles')-1;
  v_marker:=$deactivate_return$
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'role_id',v_role_row.id,'is_active',false);
  $deactivate_return$;
  v_end:=v_start+pg_catalog.strpos(pg_catalog.substr(v_def,v_start),v_marker)+pg_catalog.length(v_marker)-2;
  IF v_start<v_action_pos OR v_end<=v_start THEN
    RAISE EXCEPTION 'STAFF_MAIN_PATCH_DEACTIVATE_SECTION_NOT_FOUND';
  END IF;
  v_replacement:=$deactivate_block$
    IF v_role_row.role_key='rider' AND EXISTS (
      SELECT 1
      FROM public.delivery_assignments da
      JOIN public.delivery_tasks dt
        ON dt.id=da.delivery_task_id
       AND dt.restaurant_id=da.restaurant_id
       AND dt.branch_id=da.branch_id
      WHERE da.restaurant_id=v_role_row.restaurant_id
        AND da.branch_id=v_role_row.branch_id
        AND da.rider_user_id=v_role_row.user_id
        AND da.is_current
        AND da.status IN ('accepted','out_for_delivery','failed')
        AND dt.status IN ('accepted','out_for_delivery','failed')
        AND dt.return_confirmed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'RIDER_HAS_ACTIVE_DELIVERY' USING ERRCODE='23514';
    END IF;
    UPDATE public.user_roles
    SET is_active=false,disabled_by=v_actor,disabled_reason=v_reason,disabled_request_id=v_request_id
    WHERE id=v_role_row.id;
    IF v_role_row.role_key='rider' THEN
      UPDATE public.rider_profiles
      SET is_active=false,availability_status='offline',accepting_jobs=false,
          updated_at=pg_catalog.clock_timestamp()
      WHERE restaurant_id=v_role_row.restaurant_id
        AND branch_id=v_role_row.branch_id
        AND user_id=v_role_row.user_id;
    END IF;
  $deactivate_block$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||v_marker||pg_catalog.substr(v_def,v_end+1);

  -- Profile creation belongs inside accept_invitation, after the role rows exist.
  v_marker:=$accept_return$
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','accepted','role_key',v_invite.role_key);
  $accept_return$;
  v_start:=pg_catalog.strpos(v_def,v_marker);
  IF v_start=0 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ACCEPT_RETURN_NOT_FOUND'; END IF;
  v_replacement:=$accept_profile$
    IF v_invite.role_key='rider' THEN
      SELECT t.branch_id INTO v_branch_id
      FROM app_private.staff_invitation_branch_targets t
      JOIN public.branches b
        ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id AND b.is_active
      WHERE t.invitation_id=v_invite.id
        AND t.restaurant_id=v_restaurant_id
        AND pg_catalog.lower(pg_catalog.btrim(b.branch_code))='main';
      IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'STAFF_MAIN_BRANCH_UNAVAILABLE' USING ERRCODE='23514';
      END IF;
      PERFORM app_private.flame_chick_ensure_rider_profile(v_restaurant_id,v_branch_id,v_actor);
    END IF;
  $accept_profile$;
  v_def:=pg_catalog.substr(v_def,1,v_start-1)||v_replacement||v_marker||pg_catalog.substr(v_def,v_start+pg_catalog.length(v_marker));

  EXECUTE v_def;
END
$patch$;

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def:=pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
  );
  IF pg_catalog.strpos(v_def,'STAFF_MAIN_BRANCH_FIXED')=0
     OR pg_catalog.strpos(v_def,'flame_chick_ensure_rider_profile')=0
     OR pg_catalog.strpos(v_def,'RIDER_HAS_ACTIVE_DELIVERY')=0 THEN
    RAISE EXCEPTION 'STAFF_MAIN_RIDER_PROVISIONING_VERIFY_FAILED';
  END IF;
  IF pg_catalog.strpos(v_def,'STAFF_ADMIN_BRANCH_IDS_REQUIRED')>0 THEN
    RAISE EXCEPTION 'STAFF_MAIN_OLD_BRANCH_REQUIRED_LOGIC_REMAINS';
  END IF;
END
$verify$;

COMMIT;
