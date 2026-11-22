-- Flame Chick Batch 4 — Staff Admin commands and invitation workflow.
-- Canonical source for applied migration 20261121053647_flame_chick_staff_admin_commands.
DO $preflight$ BEGIN IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'BATCH4_REQUIRES_POSTGRES'; END IF; IF EXISTS(SELECT 1 FROM app_private.staff_invitation_requests) THEN RAISE EXCEPTION 'BATCH4_REQUIRES_EMPTY_INVITATION_TABLE'; END IF; END $preflight$;
ALTER TABLE app_private.staff_invitation_requests ADD COLUMN display_name text NOT NULL, ADD COLUMN phone text NULL, ADD CONSTRAINT staff_invitation_display_name_check CHECK(display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120), ADD CONSTRAINT staff_invitation_phone_check CHECK(phone IS NULL OR (phone=btrim(phone) AND char_length(phone) BETWEEN 7 AND 32));
ALTER TABLE app_private.staff_invitation_requests DROP CONSTRAINT staff_invitation_sent_check, ADD CONSTRAINT staff_invitation_sent_check CHECK(status<>'sent' OR (sent_at IS NOT NULL AND auth_user_id IS NOT NULL));
CREATE OR REPLACE FUNCTION app_private.enforce_staff_invitation_request_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_ok boolean;
  v_auth_email text;
  v_auth_confirmed timestamptz;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'STAFF_INVITATION_HARD_DELETE_DENIED' USING ERRCODE='55000';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NEW.auth_user_id IS NOT NULL OR NEW.sent_at IS NOT NULL OR NEW.accepted_at IS NOT NULL
       OR NEW.failed_at IS NOT NULL OR NEW.expired_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL
       OR NEW.cancelled_by IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_MUST_START_PENDING' USING ERRCODE='23514';
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM public.user_profiles p
      JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
      JOIN public.user_roles ar ON ar.user_id=p.user_id
      WHERE p.user_id=NEW.requested_by AND p.is_active
        AND ar.restaurant_id=NEW.restaurant_id AND ar.is_active
        AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL
    ) INTO v_actor_ok;
    IF NOT v_actor_ok THEN
      RAISE EXCEPTION 'STAFF_INVITATION_CREATE_FORBIDDEN' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.normalized_email IS DISTINCT FROM OLD.normalized_email
     OR NEW.role_key IS DISTINCT FROM OLD.role_key
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'STAFF_INVITATION_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
  END IF;

  IF NEW.send_attempts<OLD.send_attempts THEN
    RAISE EXCEPTION 'STAFF_INVITATION_ATTEMPTS_CANNOT_DECREASE' USING ERRCODE='23514';
  END IF;

  IF NOT (
       (OLD.status='pending' AND NEW.status IN ('sent','failed','cancelled','expired','accepted'))
    OR (OLD.status='sent' AND NEW.status IN ('accepted','failed','cancelled','expired'))
    OR (OLD.status='failed' AND NEW.status IN ('sent','cancelled','expired','accepted'))
  ) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;

  IF OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'STAFF_INVITATION_AUTH_ID_IMMUTABLE' USING ERRCODE='23514';
  END IF;

  IF NEW.auth_user_id IS NOT NULL THEN
    SELECT pg_catalog.lower(au.email),au.email_confirmed_at
      INTO v_auth_email,v_auth_confirmed
    FROM auth.users au
    WHERE au.id=NEW.auth_user_id AND au.deleted_at IS NULL;
    IF NOT FOUND OR v_auth_email IS DISTINCT FROM NEW.normalized_email THEN
      RAISE EXCEPTION 'STAFF_INVITATION_AUTH_EMAIL_MISMATCH' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.status='sent' AND (
       NEW.auth_user_id IS NULL OR NEW.sent_at IS NULL OR NEW.send_attempts<=OLD.send_attempts
  ) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_SENT_METADATA_REQUIRED' USING ERRCODE='23514';
  END IF;

  IF NEW.status='accepted' AND (
       NEW.auth_user_id IS NULL OR NEW.accepted_at IS NULL OR v_auth_confirmed IS NULL
       OR OLD.expires_at<=pg_catalog.transaction_timestamp()
  ) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_ACCEPTANCE_NOT_VERIFIED' USING ERRCODE='23514';
  END IF;

  IF NEW.status='failed' AND (
       NEW.failed_at IS NULL OR NEW.failure_code IS NULL
       OR NEW.failure_code<>pg_catalog.btrim(NEW.failure_code)
       OR pg_catalog.char_length(NEW.failure_code) NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_FAILURE_METADATA_REQUIRED' USING ERRCODE='23514';
  END IF;

  IF NEW.status<>'failed' AND (NEW.failed_at IS NOT NULL OR NEW.failure_code IS NOT NULL) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_FAILURE_METADATA_MUST_CLEAR' USING ERRCODE='23514';
  END IF;

  IF NEW.status='cancelled' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_profiles p
      JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
      JOIN public.user_roles ar ON ar.user_id=p.user_id
      WHERE p.user_id=NEW.cancelled_by AND p.is_active
        AND ar.restaurant_id=NEW.restaurant_id AND ar.is_active
        AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL
    ) INTO v_actor_ok;
    IF NOT v_actor_ok OR NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_CANCEL_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NEW.status='expired' AND (
       OLD.expires_at>pg_catalog.transaction_timestamp() OR NEW.expired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STAFF_INVITATION_NOT_EXPIRED' USING ERRCODE='23514';
  END IF;

  NEW.updated_at:=pg_catalog.clock_timestamp();
  RETURN NEW;
END
$function$;

ALTER FUNCTION app_private.enforce_staff_invitation_request_rules() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.enforce_staff_invitation_request_rules() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.flame_chick_staff_admin_command(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_action text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_action,'')));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_restaurant_id uuid;
  v_target uuid;
  v_role text;
  v_reason text;
  v_request_id uuid;
  v_branch_ids uuid[]:=ARRAY[]::uuid[];
  v_branch_id uuid;
  v_branch_count integer;
  v_existing_count integer;
  v_invite app_private.staff_invitation_requests%ROWTYPE;
  v_email text;
  v_display_name text;
  v_phone text;
  v_role_id uuid;
  v_inviter_role text;
  v_auth_email text;
  v_auth_confirmed timestamptz;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.jsonb_typeof(v_payload)<>'object' THEN
    RAISE EXCEPTION 'STAFF_ADMIN_INVALID_PAYLOAD' USING ERRCODE='22023';
  END IF;

  SELECT id INTO v_restaurant_id
  FROM public.restaurants
  WHERE slug='flame-chick' AND is_active
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'FLAME_CHICK_TENANT_NOT_ACTIVE' USING ERRCODE='P0001';
  END IF;

  SELECT ur.role_key INTO v_actor_role
  FROM public.user_profiles up
  JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
  JOIN public.user_roles ur ON ur.user_id=up.user_id
  WHERE up.user_id=v_actor AND up.is_active
    AND ur.restaurant_id=v_restaurant_id AND ur.is_active
    AND ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL
  ORDER BY CASE ur.role_key WHEN 'owner' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_action<>'accept_invitation' AND v_actor_role IS NULL THEN
    RAISE EXCEPTION 'STAFF_ADMIN_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF v_action='list' THEN
    SELECT pg_catalog.jsonb_build_object(
      'ok',true,
      'restaurant_id',v_restaurant_id,
      'branches',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',b.id,'branch_code',b.branch_code,'name',b.name,'is_active',b.is_active
        ) ORDER BY b.name,b.id)
        FROM public.branches b WHERE b.restaurant_id=v_restaurant_id
      ),'[]'::jsonb),
      'staff',coalesce((
        SELECT pg_catalog.jsonb_agg(q.row_data ORDER BY q.display_name,q.role_key,q.branch_id NULLS FIRST)
        FROM (
          SELECT up.display_name,ur.role_key,ur.branch_id,
            pg_catalog.jsonb_build_object(
              'role_id',ur.id,'user_id',ur.user_id,'role_key',ur.role_key,
              'branch_id',ur.branch_id,'is_active',ur.is_active,
              'created_at',ur.created_at,'disabled_at',ur.disabled_at,
              'disabled_by',ur.disabled_by,'disabled_reason',ur.disabled_reason,
              'display_name',up.display_name,'phone',up.phone,'profile_active',up.is_active,
              'email',au.email,'email_confirmed',au.email_confirmed_at IS NOT NULL,
              'last_sign_in_at',au.last_sign_in_at
            ) AS row_data
          FROM public.user_roles ur
          JOIN public.user_profiles up ON up.user_id=ur.user_id
          JOIN auth.users au ON au.id=ur.user_id
          WHERE ur.restaurant_id=v_restaurant_id
          ORDER BY up.display_name,ur.role_key,ur.branch_id NULLS FIRST,ur.created_at DESC
          LIMIT 500
        ) q
      ),'[]'::jsonb),
      'invitations',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',i.id,'email',i.normalized_email,'display_name',i.display_name,'phone',i.phone,
          'role_key',i.role_key,'status',i.status,'send_attempts',i.send_attempts,
          'expires_at',i.expires_at,'created_at',i.created_at,'sent_at',i.sent_at,
          'failed_at',i.failed_at,'failure_code',i.failure_code,
          'auth_user_id',i.auth_user_id,'requested_by',i.requested_by,
          'branches',coalesce((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',t.branch_id,'name',b.name) ORDER BY b.name)
            FROM app_private.staff_invitation_branch_targets t
            JOIN public.branches b ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id
            WHERE t.invitation_id=i.id
          ),'[]'::jsonb)
        ) ORDER BY i.created_at DESC)
        FROM (
          SELECT * FROM app_private.staff_invitation_requests
          WHERE restaurant_id=v_restaurant_id AND status IN ('pending','sent','failed')
          ORDER BY created_at DESC LIMIT 100
        ) i
      ),'[]'::jsonb),
      'audit',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',a.id,'branch_id',a.branch_id,'target_user_id',a.target_user_id,
          'old_role_key',a.old_role_key,'new_role_key',a.new_role_key,
          'action',a.action,'actor_user_id',a.actor_user_id,
          'actor_role_key',a.actor_role_key,'reason',a.reason,
          'request_id',a.request_id,'occurred_at',a.occurred_at
        ) ORDER BY a.occurred_at DESC)
        FROM (
          SELECT * FROM public.staff_role_audit
          WHERE restaurant_id=v_restaurant_id ORDER BY occurred_at DESC LIMIT 200
        ) a
      ),'[]'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  IF v_action='assign_role' THEN
    BEGIN
      v_target:=nullif(v_payload->>'target_user_id','')::uuid;
      v_request_id:=nullif(v_payload->>'request_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVALID_UUID' USING ERRCODE='22023';
    END;
    v_role:=pg_catalog.lower(pg_catalog.btrim(coalesce(v_payload->>'role_key','')));
    v_reason:=pg_catalog.btrim(coalesce(v_payload->>'reason',''));
    IF v_target IS NULL OR v_request_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_ADMIN_TARGET_AND_REQUEST_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF v_target=v_actor THEN
      RAISE EXCEPTION 'STAFF_ROLE_SELF_ASSIGNMENT_DENIED' USING ERRCODE='42501';
    END IF;
    IF v_role NOT IN ('admin','owner','manager','cashier','rider') THEN
      RAISE EXCEPTION 'STAFF_ADMIN_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_REASON_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.user_profiles up
      JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
      WHERE up.user_id=v_target AND up.is_active
    ) THEN
      RAISE EXCEPTION 'STAFF_ADMIN_TARGET_PROFILE_INACTIVE_OR_MISSING' USING ERRCODE='P0001';
    END IF;

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

    SELECT count(*) INTO v_existing_count FROM public.user_roles ur
    WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target AND ur.request_id=v_request_id;
    IF v_existing_count>0 THEN
      IF v_existing_count<>pg_catalog.cardinality(v_branch_ids)
         OR EXISTS(
           SELECT 1 FROM public.user_roles ur
           WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target AND ur.request_id=v_request_id
             AND (ur.role_key<>v_role OR ur.assigned_by<>v_actor OR ur.reason<>v_reason)
         )
         OR (v_role IN ('admin','owner') AND NOT EXISTS(
           SELECT 1 FROM public.user_roles ur WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target
             AND ur.request_id=v_request_id AND ur.branch_id IS NULL
         ))
         OR (v_role NOT IN ('admin','owner') AND EXISTS(
           SELECT 1 FROM public.user_roles ur WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target
             AND ur.request_id=v_request_id AND NOT (ur.branch_id=ANY(v_branch_ids))
         )) THEN
        RAISE EXCEPTION 'STAFF_ADMIN_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
      END IF;
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'request_id',v_request_id);
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target AND ur.is_active
        AND ur.role_key<>v_role
    ) THEN
      RAISE EXCEPTION 'STAFF_ROLE_CONFLICT' USING ERRCODE='23514';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_target AND ur.is_active
        AND ((v_role IN ('admin','owner') AND ur.branch_id IS NULL)
          OR (v_role NOT IN ('admin','owner') AND ur.branch_id=ANY(v_branch_ids)))
    ) THEN
      RAISE EXCEPTION 'STAFF_ROLE_ALREADY_ASSIGNED' USING ERRCODE='23514';
    END IF;

    FOREACH v_branch_id IN ARRAY v_branch_ids LOOP
      INSERT INTO public.user_roles(
        restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id,assignment_method
      ) VALUES (
        v_restaurant_id,v_target,v_role,v_branch_id,true,v_actor,v_reason,v_request_id,'staff_command'
      );
    END LOOP;
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'request_id',v_request_id,'role_key',v_role,'branch_ids',to_jsonb(v_branch_ids));
  END IF;

  IF v_action='deactivate_role' THEN
    BEGIN
      v_role_id:=nullif(v_payload->>'role_id','')::uuid;
      v_request_id:=nullif(v_payload->>'request_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVALID_UUID' USING ERRCODE='22023';
    END;
    v_reason:=pg_catalog.btrim(coalesce(v_payload->>'reason',''));
    IF v_role_id IS NULL OR v_request_id IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_ROLE_ID_REQUEST_AND_REASON_REQUIRED' USING ERRCODE='22023';
    END IF;
    SELECT * INTO STRICT v_invite FROM app_private.staff_invitation_requests WHERE false;
  END IF;

  IF v_action='begin_invitation' THEN
    BEGIN
      v_request_id:=nullif(v_payload->>'request_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVALID_UUID' USING ERRCODE='22023';
    END;
    v_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(v_payload->>'email','')));
    v_display_name:=pg_catalog.btrim(coalesce(v_payload->>'display_name',''));
    v_phone:=nullif(pg_catalog.btrim(coalesce(v_payload->>'phone','')),'');
    v_role:=pg_catalog.lower(pg_catalog.btrim(coalesce(v_payload->>'role_key','')));
    v_reason:=pg_catalog.btrim(coalesce(v_payload->>'reason','Staff invitation'));
    IF v_request_id IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       OR pg_catalog.char_length(v_email)>254 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVITATION_EMAIL_OR_REQUEST_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_DISPLAY_NAME_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF v_phone IS NOT NULL AND pg_catalog.char_length(v_phone) NOT BETWEEN 7 AND 32 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_PHONE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_role NOT IN ('admin','owner','manager','cashier','rider') THEN
      RAISE EXCEPTION 'STAFF_ADMIN_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'STAFF_ADMIN_REASON_INVALID' USING ERRCODE='22023';
    END IF;

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

    SELECT * INTO v_invite FROM app_private.staff_invitation_requests WHERE request_id=v_request_id FOR UPDATE;
    IF FOUND THEN
      IF v_invite.restaurant_id<>v_restaurant_id OR v_invite.requested_by<>v_actor
         OR v_invite.normalized_email<>v_email OR v_invite.role_key<>v_role
         OR v_invite.display_name<>v_display_name OR v_invite.phone IS DISTINCT FROM v_phone THEN
        RAISE EXCEPTION 'STAFF_ADMIN_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
      END IF;
      IF (SELECT count(*) FROM app_private.staff_invitation_branch_targets t WHERE t.invitation_id=v_invite.id)<>pg_catalog.cardinality(v_branch_ids)
         OR EXISTS(
           SELECT 1 FROM app_private.staff_invitation_branch_targets t
           WHERE t.invitation_id=v_invite.id AND NOT (t.branch_id=ANY(v_branch_ids))
         ) THEN
        RAISE EXCEPTION 'STAFF_ADMIN_IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
      END IF;
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'invitation_id',v_invite.id,'email',v_email,'role_key',v_role);
    END IF;

    IF EXISTS(
      SELECT 1 FROM app_private.staff_invitation_requests i
      WHERE i.restaurant_id=v_restaurant_id AND i.normalized_email=v_email
        AND i.status IN ('pending','sent','failed')
    ) THEN
      RAISE EXCEPTION 'STAFF_INVITATION_ALREADY_OPEN' USING ERRCODE='23514';
    END IF;

    INSERT INTO app_private.staff_invitation_requests(
      restaurant_id,requested_by,normalized_email,role_key,status,request_id,
      expires_at,display_name,phone
    ) VALUES (
      v_restaurant_id,v_actor,v_email,v_role,'pending',v_request_id,
      pg_catalog.transaction_timestamp()+interval '7 days',v_display_name,v_phone
    ) RETURNING * INTO v_invite;

    FOREACH v_branch_id IN ARRAY v_branch_ids LOOP
      INSERT INTO app_private.staff_invitation_branch_targets(invitation_id,restaurant_id,branch_id)
      VALUES(v_invite.id,v_restaurant_id,v_branch_id);
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'idempotent',false,'invitation_id',v_invite.id,
      'email',v_email,'display_name',v_display_name,'role_key',v_role,
      'branch_ids',to_jsonb(v_branch_ids),'expires_at',v_invite.expires_at
    );
  END IF;

  IF v_action='cancel_invitation' THEN
    BEGIN
      v_role_id:=nullif(v_payload->>'invitation_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVALID_UUID' USING ERRCODE='22023';
    END;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_ID_REQUIRED' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_invite FROM app_private.staff_invitation_requests
    WHERE id=v_role_id AND restaurant_id=v_restaurant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STAFF_INVITATION_NOT_FOUND' USING ERRCODE='P0001';
    END IF;
    IF v_invite.status='cancelled' AND v_invite.cancelled_by=v_actor THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'invitation_id',v_invite.id,'status','cancelled');
    END IF;
    IF v_invite.status NOT IN ('pending','sent','failed') THEN
      RAISE EXCEPTION 'STAFF_INVITATION_NOT_CANCELLABLE' USING ERRCODE='23514';
    END IF;
    UPDATE app_private.staff_invitation_requests
    SET status='cancelled',cancelled_by=v_actor,cancelled_at=pg_catalog.clock_timestamp(),
        failed_at=NULL,failure_code=NULL
    WHERE id=v_invite.id;
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','cancelled');
  END IF;

  IF v_action='retry_finalize' THEN
    BEGIN
      v_role_id:=nullif(v_payload->>'invitation_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'STAFF_ADMIN_INVALID_UUID' USING ERRCODE='22023';
    END;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_ID_REQUIRED' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_invite FROM app_private.staff_invitation_requests
    WHERE id=v_role_id AND restaurant_id=v_restaurant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STAFF_INVITATION_NOT_FOUND' USING ERRCODE='P0001';
    END IF;
    IF v_invite.status='sent' THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'already_finalized',true,'invitation_id',v_invite.id,'status','sent');
    END IF;
    IF v_invite.status<>'failed' OR v_invite.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_FINALIZE_NOT_AVAILABLE' USING ERRCODE='23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'invitation_id',v_invite.id,'auth_user_id',v_invite.auth_user_id,
      'email',v_invite.normalized_email,'status',v_invite.status
    );
  END IF;

  IF v_action='accept_invitation' THEN
    SELECT pg_catalog.lower(au.email),au.email_confirmed_at
      INTO v_auth_email,v_auth_confirmed
    FROM auth.users au WHERE au.id=v_actor AND au.deleted_at IS NULL;
    IF NOT FOUND OR v_auth_confirmed IS NULL OR v_auth_email IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_CONFIRMED_EMAIL_REQUIRED' USING ERRCODE='42501';
    END IF;

    SELECT * INTO v_invite
    FROM app_private.staff_invitation_requests i
    JOIN public.restaurants r ON r.id=i.restaurant_id
    WHERE r.slug='flame-chick' AND r.is_active
      AND i.normalized_email=v_auth_email AND i.status='accepted'
      AND i.auth_user_id=v_actor
    ORDER BY i.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'invitation_id',v_invite.id,'status','accepted');
    END IF;


    -- Lock the one exact-email invitation; pending and failed cover already-registered accounts.
    SELECT i.* INTO v_invite
    FROM app_private.staff_invitation_requests i
    JOIN public.restaurants r ON r.id=i.restaurant_id
    WHERE r.id=v_restaurant_id AND i.normalized_email=v_auth_email
      AND i.auth_user_id IS NOT DISTINCT FROM NULL OR false;
    SELECT i.* INTO v_invite
    FROM app_private.staff_invitation_requests i
    WHERE i.restaurant_id=v_restaurant_id AND i.normalized_email=v_auth_email
      AND i.status IN ('pending','sent','failed')
      AND (i.auth_user_id IS NULL OR i.auth_user_id=v_actor)
    ORDER BY i.created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STAFF_INVITATION_NOT_FOUND_FOR_CONFIRMED_EMAIL' USING ERRCODE='P0001';
    END IF;
    IF v_invite.expires_at<=pg_catalog.transaction_timestamp() THEN
      RAISE EXCEPTION 'STAFF_INVITATION_EXPIRED' USING ERRCODE='23514';
    END IF;

    SELECT ur.role_key INTO v_inviter_role
    FROM public.user_profiles up
    JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
    JOIN public.user_roles ur ON ur.user_id=up.user_id
    WHERE up.user_id=v_invite.requested_by AND up.is_active
      AND ur.restaurant_id=v_restaurant_id AND ur.is_active
      AND ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL
    ORDER BY CASE ur.role_key WHEN 'owner' THEN 1 ELSE 2 END LIMIT 1;
    IF v_inviter_role IS NULL THEN
      RAISE EXCEPTION 'STAFF_INVITATION_ISSUER_NO_LONGER_ACTIVE' USING ERRCODE='42501';
    END IF;

    IF EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.restaurant_id=v_restaurant_id AND ur.user_id=v_actor AND ur.is_active
        AND ur.role_key<>v_invite.role_key
    ) THEN
      RAISE EXCEPTION 'STAFF_ROLE_CONFLICT' USING ERRCODE='23514';
    END IF;

    INSERT INTO public.user_profiles(user_id,display_name,phone,is_active)
    VALUES(v_actor,v_invite.display_name,v_invite.phone,true)
    ON CONFLICT(user_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.user_id=v_actor AND up.is_active) THEN
      RAISE EXCEPTION 'STAFF_PROFILE_INACTIVE' USING ERRCODE='23514';
    END IF;

    UPDATE app_private.staff_invitation_requests
    SET status='accepted',auth_user_id=v_actor,accepted_at=pg_catalog.clock_timestamp(),
        failed_at=NULL,failure_code=NULL
    WHERE id=v_invite.id;

    IF v_invite.role_key IN ('admin','owner') THEN
      INSERT INTO public.staff_role_audit(
        restaurant_id,branch_id,target_user_id,old_role_key,new_role_key,action,
        actor_user_id,actor_role_key,reason,request_id
      ) VALUES (
        v_restaurant_id,NULL,v_actor,NULL,v_invite.role_key,'invited',
        v_invite.requested_by,v_inviter_role,'Staff invitation accepted',v_invite.request_id
      );
      INSERT INTO public.user_roles(
        restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id,assignment_method
      ) VALUES (
        v_restaurant_id,v_actor,v_invite.role_key,NULL,true,
        v_invite.requested_by,'Accepted staff invitation '||v_invite.id::text,
        v_invite.request_id,'staff_command'
      );
    ELSE
      FOR v_branch_id IN
        SELECT t.branch_id FROM app_private.staff_invitation_branch_targets t
        JOIN public.branches b ON b.id=t.branch_id AND b.restaurant_id=t.restaurant_id AND b.is_active
        WHERE t.invitation_id=v_invite.id AND t.restaurant_id=v_restaurant_id
        ORDER BY t.branch_id
      LOOP
        INSERT INTO public.staff_role_audit(
          restaurant_id,branch_id,target_user_id,old_role_key,new_role_key,action,
          actor_user_id,actor_role_key,reason,request_id
        ) VALUES (
          v_restaurant_id,v_branch_id,v_actor,NULL,v_invite.role_key,'invited',
          v_invite.requested_by,v_inviter_role,'Staff invitation accepted',v_invite.request_id
        );
        INSERT INTO public.user_roles(
          restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id,assignment_method
        ) VALUES (
          v_restaurant_id,v_actor,v_invite.role_key,v_branch_id,true,
          v_invite.requested_by,'Accepted staff invitation '||v_invite.id::text,
          v_invite.request_id,'staff_command'
        );
      END LOOP;
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','accepted','role_key',v_invite.role_key);
  END IF;

  RAISE EXCEPTION 'STAFF_ADMIN_ACTION_INVALID' USING ERRCODE='22023';
END
$function$;

ALTER FUNCTION public.flame_chick_staff_admin_command(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_staff_admin_command(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_staff_admin_command(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.flame_chick_staff_admin_system_command(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_action text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_action,'')));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_jwt_role text;
  v_invitation_id uuid;
  v_auth_user_id uuid;
  v_failure_code text;
  v_invite app_private.staff_invitation_requests%ROWTYPE;
  v_auth_email text;
BEGIN
  v_jwt_role:=nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'');
  IF v_jwt_role IS NULL THEN
    BEGIN
      v_jwt_role:=nullif((nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'');
    EXCEPTION WHEN invalid_text_representation THEN
      v_jwt_role:=NULL;
    END;
  END IF;
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'STAFF_SYSTEM_COMMAND_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_invitation_id:=nullif(v_payload->>'invitation_id','')::uuid;
    v_auth_user_id:=nullif(v_payload->>'auth_user_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'STAFF_SYSTEM_COMMAND_INVALID_UUID' USING ERRCODE='22023';
  END;
  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'STAFF_SYSTEM_INVITATION_ID_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_invite FROM app_private.staff_invitation_requests
  WHERE id=v_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAFF_INVITATION_NOT_FOUND' USING ERRCODE='P0001';
  END IF;

  IF v_action='complete_invitation' THEN
    IF v_auth_user_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_SYSTEM_AUTH_USER_ID_REQUIRED' USING ERRCODE='22023';
    END IF;
    SELECT pg_catalog.lower(au.email) INTO v_auth_email
    FROM auth.users au WHERE au.id=v_auth_user_id AND au.deleted_at IS NULL;
    IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_invite.normalized_email THEN
      RAISE EXCEPTION 'STAFF_INVITATION_AUTH_EMAIL_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF v_invite.expires_at<=pg_catalog.transaction_timestamp() THEN
      RAISE EXCEPTION 'STAFF_INVITATION_EXPIRED' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.user_profiles up
      JOIN auth.users au ON au.id=up.user_id AND au.deleted_at IS NULL
      JOIN public.user_roles ur ON ur.user_id=up.user_id
      WHERE up.user_id=v_invite.requested_by AND up.is_active
        AND ur.restaurant_id=v_invite.restaurant_id AND ur.is_active
        AND ur.role_key IN ('admin','owner') AND ur.branch_id IS NULL
    ) THEN
      RAISE EXCEPTION 'STAFF_INVITATION_ISSUER_NO_LONGER_ACTIVE' USING ERRCODE='42501';
    END IF;
    IF v_invite.status='sent' AND v_invite.auth_user_id=v_auth_user_id THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'invitation_id',v_invite.id,'status','sent');
    END IF;
    IF v_invite.status NOT IN ('pending','failed') THEN
      RAISE EXCEPTION 'STAFF_INVITATION_FINALIZE_NOT_AVAILABLE' USING ERRCODE='23514';
    END IF;
    IF v_invite.auth_user_id IS NOT NULL AND v_invite.auth_user_id<>v_auth_user_id THEN
      RAISE EXCEPTION 'STAFF_INVITATION_AUTH_ID_MISMATCH' USING ERRCODE='23514';
    END IF;
    UPDATE app_private.staff_invitation_requests
    SET status='sent',auth_user_id=v_auth_user_id,
        sent_at=coalesce(sent_at,pg_catalog.clock_timestamp()),
        send_attempts=send_attempts+1,failed_at=NULL,failure_code=NULL
    WHERE id=v_invite.id;
    RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'invitation_id',v_invite.id,'status','sent');
  END IF;

  IF v_action='fail_invitation' THEN
    v_failure_code:=pg_catalog.upper(pg_catalog.btrim(coalesce(v_payload->>'failure_code','')));
    IF v_failure_code NOT IN ('AUTH_PROVIDER_ERROR','AUTH_USER_ALREADY_EXISTS','AUTH_FINALIZATION_FAILED') THEN
      RAISE EXCEPTION 'STAFF_SYSTEM_FAILURE_CODE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_auth_user_id IS NOT NULL THEN
      SELECT pg_catalog.lower(au.email) INTO v_auth_email
      FROM auth.users au WHERE au.id=v_auth_user_id AND au.deleted_at IS NULL;
      IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_invite.normalized_email THEN
        RAISE EXCEPTION 'STAFF_INVITATION_AUTH_EMAIL_MISMATCH' USING ERRCODE='23514';
      END IF;
      IF v_invite.auth_user_id IS NOT NULL AND v_invite.auth_user_id<>v_auth_user_id THEN
        RAISE EXCEPTION 'STAFF_INVITATION_AUTH_ID_MISMATCH' USING ERRCODE='23514';
      END IF;
    END IF;
    IF v_invite.status='failed' AND v_invite.failure_code=v_failure_code
       AND v_invite.auth_user_id IS NOT DISTINCT FROM v_auth_user_id THEN
      RETURN pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'invitation_id',v_invite.id,'status','failed');
    END IF;
    IF v_invite.status NOT IN ('pending','sent') THEN
      RAISE EXCEPTION 'STAFF_INVITATION_CANNOT_BE_MARKED_FAILED' USING ERRCODE='23514';
    END IF;
    UPDATE app_private.staff_invitation_requests
    SET status='failed',auth_user_id=coalesce(auth_user_id,v_auth_user_id),
        failed_at=pg_catalog.clock_timestamp(),failure_code=v_failure_code
    WHERE id=v_invite.id;
    RETURN pg_catalog.jsonb_build_object('ok',true,'invitation_id',v_invite.id,'status','failed','failure_code',v_failure_code);
  END IF;

  RAISE EXCEPTION 'STAFF_SYSTEM_ACTION_INVALID' USING ERRCODE='22023';
END
$function$;

ALTER FUNCTION public.flame_chick_staff_admin_system_command(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_staff_admin_system_command(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_staff_admin_system_command(text,jsonb) TO service_role;