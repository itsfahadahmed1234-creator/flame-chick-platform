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

  INSERT INTO public.rider_profiles(
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
      WHEN NOT public.rider_profiles.is_active THEN 'offline'
      ELSE public.rider_profiles.availability_status
    END,
    accepting_jobs=CASE
      WHEN NOT public.rider_profiles.is_active THEN true
      ELSE public.rider_profiles.accepting_jobs
    END,
    last_seen_at=CASE
      WHEN NOT public.rider_profiles.is_active THEN NULL
      ELSE public.rider_profiles.last_seen_at
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
  v_old text;
  v_new text;
  v_count integer;
BEGIN
  v_def:=pg_catalog.pg_get_functiondef(
    'app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
  );

  -- For every branch-scoped role, derive the one active Main branch on the
  -- server. Accept [] or the same one-element Main ID for older clients only.
  v_old:=$old_assign$
    IF v_role IN ('admin','owner') THEN
      IF coalesce(v_payload->'branch_ids','[]'::jsonb)<>'[]'::jsonb THEN
        RAISE EXCEPTION 'STAFF_ADMIN_GLOBAL_ROLE_MUST_NOT_HAVE_BRANCHES' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[NULL::uuid];
    ELSE
      IF pg_catalog.jsonb_typeof(coalesce(v_payload->'branch_ids','[]'::jsonb))<>'array' THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_IDS_REQUIRED' USING ERRCODE='22023';
      END IF;
      IF pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb)) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_IDS_REQUIRED' USING ERRCODE='22023';
      END IF;
      SELECT coalesce(pg_catalog.array_agg(DISTINCT x.value::uuid ORDER BY x.value::uuid),ARRAY[]::uuid[])
      INTO v_branch_ids
      FROM pg_catalog.jsonb_array_elements_text(v_payload->'branch_ids') x(value);
      IF pg_catalog.cardinality(v_branch_ids)<>pg_catalog.jsonb_array_length(v_payload->'branch_ids') THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_IDS_DUPLICATED' USING ERRCODE='22023';
      END IF;
      SELECT count(*) INTO v_branch_count FROM public.branches b
      WHERE b.restaurant_id=v_restaurant_id AND b.is_active AND b.id=ANY(v_branch_ids);
      IF v_branch_count<>pg_catalog.cardinality(v_branch_ids) THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_INVALID_OR_INACTIVE' USING ERRCODE='22023';
      END IF;
    END IF;
  $old_assign$;
  v_new:=$new_assign$
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
  $new_assign$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ASSIGN_BRANCH_BLOCK_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

  v_old:=$old_invite$
    IF v_role IN ('admin','owner') THEN
      IF coalesce(v_payload->'branch_ids','[]'::jsonb)<>'[]'::jsonb THEN
        RAISE EXCEPTION 'STAFF_ADMIN_GLOBAL_ROLE_MUST_NOT_HAVE_BRANCHES' USING ERRCODE='22023';
      END IF;
      v_branch_ids:=ARRAY[]::uuid[];
    ELSE
      IF pg_catalog.jsonb_typeof(coalesce(v_payload->'branch_ids','[]'::jsonb))<>'array'
         OR pg_catalog.jsonb_array_length(coalesce(v_payload->'branch_ids','[]'::jsonb)) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_IDS_REQUIRED' USING ERRCODE='22023';
      END IF;
      SELECT coalesce(pg_catalog.array_agg(DISTINCT x.value::uuid ORDER BY x.value::uuid),ARRAY[]::uuid[])
        INTO v_branch_ids
      FROM pg_catalog.jsonb_array_elements_text(v_payload->'branch_ids') x(value);
      IF pg_catalog.cardinality(v_branch_ids)<>pg_catalog.jsonb_array_length(v_payload->'branch_ids') THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_IDS_DUPLICATED' USING ERRCODE='22023';
      END IF;
      SELECT count(*) INTO v_branch_count FROM public.branches b
      WHERE b.restaurant_id=v_restaurant_id AND b.is_active AND b.id=ANY(v_branch_ids);
      IF v_branch_count<>pg_catalog.cardinality(v_branch_ids) THEN
        RAISE EXCEPTION 'STAFF_ADMIN_BRANCH_INVALID_OR_INACTIVE' USING ERRCODE='22023';
      END IF;
    END IF;
  $old_invite$;
  v_new:=$new_invite$
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
  $new_invite$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_INVITE_BRANCH_BLOCK_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

  -- Invitation acceptance must refuse stale invitations that target another
  -- branch or more than one branch.
  v_old:=$old_accept_branch$
    IF v_invite.role_key IN ('manager','cashier','rider') THEN
      SELECT count(*) INTO v_branch_count
      FROM app_private.staff_invitation_branch_targets t
      JOIN public.branches b ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id AND b.is_active
      WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id;
      IF v_branch_count=0 OR v_branch_count<>(SELECT count(*) FROM app_private.staff_invitation_branch_targets t WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id) THEN
        RAISE EXCEPTION 'STAFF_INVITATION_BRANCH_UNAVAILABLE' USING ERRCODE='23514';
      END IF;
    END IF;
  $old_accept_branch$;
  v_new:=$new_accept_branch$
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
  $new_accept_branch$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ACCEPT_BRANCH_BLOCK_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

  -- Role-based Rider creation and reactivation are atomic with the role row.
  v_old:=$old_assign_end$
    END LOOP;
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'request_id',v_request_id,'role_key',v_role,'branch_ids',to_jsonb(v_branch_ids));
  $old_assign_end$;
  v_new:=$new_assign_end$
    END LOOP;
    IF v_role='rider' THEN
      PERFORM app_private.flame_chick_ensure_rider_profile(v_restaurant_id,v_branch_ids[1],v_target);
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'request_id',v_request_id,'role_key',v_role,'branch_ids',to_jsonb(v_branch_ids));
  $new_assign_end$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ASSIGN_PROFILE_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

  -- Deactivate a Rider only after all in-progress/failed-return deliveries are
  -- resolved; then stop new offers immediately.
  v_old:=$old_deactivate$
    UPDATE public.user_roles
    SET is_active=false,disabled_by=v_actor,disabled_reason=v_reason,disabled_request_id=v_request_id
    WHERE id=v_role_row.id;
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'role_id',v_role_row.id,'is_active',false);
  $old_deactivate$;
  v_new:=$new_deactivate$
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
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'role_id',v_role_row.id,'is_active',false);
  $new_deactivate$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_DEACTIVATE_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

  -- The only branch in an operational invitation is now the Main branch;
  -- after acceptance the Rider row is provisioned inside the same transaction.
  v_old:=$old_accept_end$
      END LOOP;
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','accepted','role_key',v_invite.role_key);
  $old_accept_end$;
  v_new:=$new_accept_end$
      END LOOP;
    END IF;
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
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','accepted','role_key',v_invite.role_key);
  $new_accept_end$;

  v_count:=(pg_catalog.length(v_def)-pg_catalog.length(pg_catalog.replace(v_def,v_old,'')))/pg_catalog.length(v_old);
  IF v_count<>1 THEN RAISE EXCEPTION 'STAFF_MAIN_PATCH_ACCEPT_PROFILE_COUNT_%',v_count; END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);

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
