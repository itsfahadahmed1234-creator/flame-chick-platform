-- Validation record: this exact DDL was executed successfully inside a disposable
-- transaction on Flame Chick Production as postgres, followed by ROLLBACK.
-- The test fixtures were separate from this candidate and are documented in the
-- Batch 3 acceptance review. No persistent Batch 3 objects or data remain.

-- Flame Chick Production — Batch 3 staff identity and roles candidate
-- STATUS: CANDIDATE ONLY. NOT APPLIED TO PRODUCTION.
-- Target: Supabase PostgreSQL 17.12. Requires applied Batch 1 and Batch 2.
-- All objects are intended to be owned by postgres; run only through the controlled postgres migration identity.
-- No Auth users, role assignments, invitation messages, seed rows, API grants, RLS policies, or Realtime entries are created.
-- All five tables are RLS-enabled and deny-by-default. Application commands are a later reviewed batch.
-- Never expose assignment_method='initial_bootstrap' through an application command.
-- Staff actor identity must be derived from a verified Supabase Auth JWT by the future staff-admin command.
-- Auth invitation + database role setup is a recoverable saga, not one ACID transaction.
-- Do not store invite tokens, magic links, passwords, or raw Auth provider responses.

DO $preflight$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN
  RAISE EXCEPTION 'Batch 3 requires postgres migration identity';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='app_private' AND r.rolname='postgres') THEN
  RAISE EXCEPTION 'app_private missing or wrong owner';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='restaurants')
 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='branches') THEN
  RAISE EXCEPTION 'Batch 2 foundation missing';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname IN ('user_profiles','user_roles','staff_role_audit')) OR (n.nspname='app_private' AND c.relname IN ('staff_invitation_requests','staff_invitation_branch_targets'))) THEN
  RAISE EXCEPTION 'Batch 3 relation name already exists';
 END IF;
END
$preflight$;

CREATE TABLE public.user_profiles(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 display_name text NOT NULL CHECK(display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120),
 phone text NULL CHECK(phone IS NULL OR (phone=btrim(phone) AND char_length(phone) BETWEEN 7 AND 32)),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
COMMENT ON TABLE public.user_profiles IS 'Minimal private staff profile extension for auth.users; email remains in Supabase Auth. No public profile directory.';

CREATE TABLE public.user_roles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 role_key text NOT NULL CHECK(role_key IN ('admin','owner','manager','cashier','rider')),
 branch_id uuid NULL,
 is_active boolean NOT NULL DEFAULT true,
 assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(reason=btrim(reason) AND char_length(reason) BETWEEN 1 AND 500),
 request_id uuid NOT NULL,
 assignment_method text NOT NULL DEFAULT 'staff_command' CHECK(assignment_method IN ('staff_command','initial_bootstrap')),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 disabled_at timestamptz NULL,
 disabled_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 disabled_reason text NULL,
 disabled_request_id uuid NULL,
 CONSTRAINT user_roles_profile_fk FOREIGN KEY(user_id) REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 CONSTRAINT user_roles_assigned_by_profile_fk FOREIGN KEY(assigned_by) REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 CONSTRAINT user_roles_disabled_by_profile_fk FOREIGN KEY(disabled_by) REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 CONSTRAINT user_roles_branch_restaurant_fk FOREIGN KEY(branch_id,restaurant_id) REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
 CONSTRAINT user_roles_scope_check CHECK(
  (role_key IN ('admin','owner') AND branch_id IS NULL)
  OR (role_key IN ('manager','cashier','rider') AND branch_id IS NOT NULL)
 ),
 CONSTRAINT user_roles_disable_state_check CHECK(
  (is_active AND disabled_at IS NULL AND disabled_by IS NULL AND disabled_reason IS NULL AND disabled_request_id IS NULL)
  OR (NOT is_active AND disabled_at IS NOT NULL AND disabled_by IS NOT NULL
   AND disabled_reason IS NOT NULL AND disabled_reason=btrim(disabled_reason)
   AND char_length(disabled_reason) BETWEEN 1 AND 500 AND disabled_request_id IS NOT NULL)
 )
);
COMMENT ON TABLE public.user_roles IS 'Server-controlled assignments. Admin/Owner are restaurant-wide; the same operational role may span branches. No client DML.';
COMMENT ON COLUMN public.user_roles.assignment_method IS 'initial_bootstrap is permitted only from a trusted postgres session for the first restaurant-wide Admin/Owner; never expose through application commands.';
CREATE UNIQUE INDEX user_roles_one_active_restaurant_role_idx ON public.user_roles(restaurant_id,user_id) WHERE is_active AND branch_id IS NULL;
CREATE UNIQUE INDEX user_roles_one_active_branch_role_idx ON public.user_roles(restaurant_id,user_id,branch_id) WHERE is_active AND branch_id IS NOT NULL;
CREATE UNIQUE INDEX user_roles_request_global_uq ON public.user_roles(restaurant_id,user_id,request_id) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX user_roles_request_branch_uq ON public.user_roles(restaurant_id,user_id,request_id,branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX user_roles_active_user_idx ON public.user_roles(user_id,restaurant_id) WHERE is_active;
CREATE INDEX user_roles_active_branch_role_idx ON public.user_roles(restaurant_id,branch_id,role_key) WHERE is_active AND branch_id IS NOT NULL;
CREATE INDEX user_roles_active_restaurant_role_idx ON public.user_roles(restaurant_id,role_key) WHERE is_active AND role_key IN ('admin','owner');

CREATE TABLE public.staff_role_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 branch_id uuid NULL,
 target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 old_role_key text NULL,
 new_role_key text NULL,
 action text NOT NULL CHECK(action IN ('invited','activated','deactivated','role_changed','branch_changed')),
 actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 actor_role_key text NOT NULL CHECK(actor_role_key IN ('admin','owner')),
 reason text NOT NULL CHECK(reason=btrim(reason) AND char_length(reason) BETWEEN 1 AND 500),
 request_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT staff_role_audit_branch_fk FOREIGN KEY(branch_id,restaurant_id) REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT,
 CONSTRAINT staff_role_audit_event_shape_check CHECK(
  (action IN ('invited','activated') AND old_role_key IS NULL AND new_role_key IS NOT NULL)
  OR (action='deactivated' AND old_role_key IS NOT NULL AND new_role_key IS NULL)
  OR (action IN ('role_changed','branch_changed') AND old_role_key IS NOT NULL AND new_role_key IS NOT NULL)
 ),
 CONSTRAINT staff_role_audit_scope_check CHECK(
  CASE WHEN new_role_key IS NOT NULL THEN
   (new_role_key IN ('admin','owner') AND branch_id IS NULL)
   OR (new_role_key IN ('manager','cashier','rider') AND branch_id IS NOT NULL)
  ELSE
   (old_role_key IN ('admin','owner') AND branch_id IS NULL)
   OR (old_role_key IN ('manager','cashier','rider') AND branch_id IS NOT NULL)
  END
 )
);
COMMENT ON TABLE public.staff_role_audit IS 'Append-only role/invitation audit. Actor is a verified staff identity supplied by the trusted server command; never browser-readable.';
CREATE UNIQUE INDEX staff_role_audit_request_global_uq ON public.staff_role_audit(restaurant_id,request_id,target_user_id,action) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX staff_role_audit_request_branch_uq ON public.staff_role_audit(restaurant_id,request_id,target_user_id,action,branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX staff_role_audit_restaurant_time_idx ON public.staff_role_audit(restaurant_id,occurred_at DESC);
CREATE INDEX staff_role_audit_target_time_idx ON public.staff_role_audit(target_user_id,occurred_at DESC);

CREATE TABLE app_private.staff_invitation_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 normalized_email text NOT NULL,
 role_key text NOT NULL CHECK(role_key IN ('admin','owner','manager','cashier','rider')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','accepted','failed','expired','cancelled')),
 request_id uuid NOT NULL UNIQUE,
 auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 failure_code text NULL,
 sent_at timestamptz NULL,
 accepted_at timestamptz NULL,
 failed_at timestamptz NULL,
 expires_at timestamptz NOT NULL,
 expired_at timestamptz NULL,
 cancelled_by uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 cancelled_at timestamptz NULL,
 send_attempts integer NOT NULL DEFAULT 0 CHECK(send_attempts>=0),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 CONSTRAINT staff_invitation_request_id_restaurant_uq UNIQUE(id,restaurant_id),
 CONSTRAINT staff_invitation_email_check CHECK(
  normalized_email=pg_catalog.lower(pg_catalog.btrim(normalized_email))
  AND char_length(normalized_email) BETWEEN 3 AND 254
  AND pg_catalog.strpos(normalized_email,'@')>1
  AND pg_catalog.strpos(normalized_email,'@')<char_length(normalized_email)
  AND normalized_email !~ '[[:space:]]'
 ),
 CONSTRAINT staff_invitation_expiry_check CHECK(expires_at>created_at),
 CONSTRAINT staff_invitation_sent_check CHECK(status NOT IN ('sent','accepted') OR (sent_at IS NOT NULL AND auth_user_id IS NOT NULL)),
 CONSTRAINT staff_invitation_accepted_check CHECK((status='accepted')=(accepted_at IS NOT NULL)),
 CONSTRAINT staff_invitation_failed_check CHECK((failed_at IS NULL)=(failure_code IS NULL)),
 CONSTRAINT staff_invitation_failed_status_check CHECK((status='failed')=(failed_at IS NOT NULL)),
 CONSTRAINT staff_invitation_expired_check CHECK((status='expired')=(expired_at IS NOT NULL)),
 CONSTRAINT staff_invitation_cancelled_pair_check CHECK((cancelled_at IS NULL)=(cancelled_by IS NULL)),
 CONSTRAINT staff_invitation_cancelled_status_check CHECK((status='cancelled')=(cancelled_at IS NOT NULL))
);
COMMENT ON TABLE app_private.staff_invitation_requests IS 'Private recoverable Auth invitation saga state. Never store tokens, magic links, passwords or raw provider responses.';
CREATE UNIQUE INDEX staff_invitation_one_open_email_uq ON app_private.staff_invitation_requests(restaurant_id,normalized_email) WHERE status IN ('pending','sent','failed');
CREATE INDEX staff_invitation_requests_restaurant_status_idx ON app_private.staff_invitation_requests(restaurant_id,status,created_at DESC);
CREATE INDEX staff_invitation_requests_email_idx ON app_private.staff_invitation_requests(restaurant_id,normalized_email,created_at DESC);

CREATE TABLE app_private.staff_invitation_branch_targets(
 invitation_id uuid NOT NULL,
 restaurant_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 CONSTRAINT staff_invitation_branch_targets_pkey PRIMARY KEY(invitation_id,branch_id),
 CONSTRAINT staff_invitation_branch_targets_invite_tenant_fk FOREIGN KEY(invitation_id,restaurant_id) REFERENCES app_private.staff_invitation_requests(id,restaurant_id) ON DELETE RESTRICT,
 CONSTRAINT staff_invitation_branch_targets_branch_tenant_fk FOREIGN KEY(branch_id,restaurant_id) REFERENCES public.branches(id,restaurant_id) ON DELETE RESTRICT
);
CREATE INDEX staff_invitation_branch_targets_branch_idx ON app_private.staff_invitation_branch_targets(restaurant_id,branch_id);

CREATE FUNCTION app_private.enforce_user_profile_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_auth_ok boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STAFF_PROFILE_HARD_DELETE_DENIED' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=NEW.user_id AND u.deleted_at IS NULL) INTO v_auth_ok;
  IF NOT v_auth_ok THEN RAISE EXCEPTION 'STAFF_PROFILE_REQUIRES_LIVE_AUTH_USER' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'STAFF_PROFILE_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.is_active AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=NEW.user_id AND u.deleted_at IS NULL) THEN RAISE EXCEPTION 'STAFF_PROFILE_AUTH_USER_INACTIVE' USING ERRCODE='23514'; END IF;
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=OLD.user_id AND ur.is_active) THEN RAISE EXCEPTION 'STAFF_PROFILE_HAS_ACTIVE_ROLES' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=pg_catalog.clock_timestamp();
 END IF;
 RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.enforce_user_profile_rules() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER user_profiles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION app_private.enforce_user_profile_rules();

CREATE FUNCTION app_private.guard_staff_role_audit_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor_ok boolean; v_bootstrap_ok boolean:=false;
BEGIN
 SELECT EXISTS(
  SELECT 1 FROM public.user_profiles p JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
  JOIN public.user_roles ar ON ar.user_id=p.user_id
  WHERE p.user_id=NEW.actor_user_id AND p.is_active AND ar.restaurant_id=NEW.restaurant_id
   AND ar.is_active AND ar.role_key IN ('admin','owner') AND ar.role_key=NEW.actor_role_key AND ar.branch_id IS NULL
 ) INTO v_actor_ok;
 IF NOT v_actor_ok AND NEW.action='activated' AND NEW.actor_user_id=NEW.target_user_id
  AND NEW.actor_role_key IN ('admin','owner') AND NEW.new_role_key=NEW.actor_role_key
  AND NEW.branch_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.restaurant_id=NEW.restaurant_id) THEN
  v_bootstrap_ok:=true;
 END IF;
 IF NOT v_actor_ok AND NOT v_bootstrap_ok THEN RAISE EXCEPTION 'STAFF_ROLE_AUDIT_ACTOR_INVALID' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.guard_staff_role_audit_insert() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER staff_role_audit_actor_guard BEFORE INSERT ON public.staff_role_audit FOR EACH ROW EXECUTE FUNCTION app_private.guard_staff_role_audit_insert();

CREATE FUNCTION app_private.reject_staff_role_audit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RAISE EXCEPTION 'STAFF_ROLE_AUDIT_APPEND_ONLY' USING ERRCODE='55000'; END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.reject_staff_role_audit_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER staff_role_audit_no_update_delete BEFORE UPDATE OR DELETE ON public.staff_role_audit FOR EACH ROW EXECUTE FUNCTION app_private.reject_staff_role_audit_mutation();
CREATE TRIGGER staff_role_audit_no_truncate BEFORE TRUNCATE ON public.staff_role_audit FOR EACH STATEMENT EXECUTE FUNCTION app_private.reject_staff_role_audit_mutation();

CREATE FUNCTION app_private.enforce_user_role_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_profile_ok boolean; v_actor_role text; v_conflict_role text; v_owner_count integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STAFF_ROLE_HARD_DELETE_DENIED' USING ERRCODE='55000'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('flame-chick:role-restaurant:'||NEW.restaurant_id::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('flame-chick:role-user:'||NEW.restaurant_id::text||':'||NEW.user_id::text,0));
 IF TG_OP='INSERT' THEN
  SELECT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL WHERE p.user_id=NEW.user_id AND p.is_active) INTO v_profile_ok;
  IF NOT v_profile_ok THEN RAISE EXCEPTION 'STAFF_ROLE_TARGET_PROFILE_INACTIVE' USING ERRCODE='23514'; END IF;
  IF NEW.assignment_method='initial_bootstrap' THEN
   IF session_user<>'postgres' OR NEW.role_key NOT IN ('admin','owner') OR NEW.branch_id IS NOT NULL OR NEW.assigned_by<>NEW.user_id OR EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.restaurant_id=NEW.restaurant_id) THEN RAISE EXCEPTION 'INITIAL_STAFF_BOOTSTRAP_RESTRICTED' USING ERRCODE='23514'; END IF;
   v_actor_role:=NEW.role_key;
  ELSE
   IF NEW.assigned_by=NEW.user_id THEN RAISE EXCEPTION 'STAFF_ROLE_SELF_ASSIGNMENT_DENIED' USING ERRCODE='42501'; END IF;
   SELECT ar.role_key INTO v_actor_role FROM public.user_profiles p
    JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
    JOIN public.user_roles ar ON ar.user_id=p.user_id
   WHERE p.user_id=NEW.assigned_by AND p.is_active AND ar.restaurant_id=NEW.restaurant_id
    AND ar.is_active AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_ROLE_ASSIGN_FORBIDDEN' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT ur.role_key INTO v_conflict_role FROM public.user_roles ur
  WHERE ur.restaurant_id=NEW.restaurant_id AND ur.user_id=NEW.user_id AND ur.is_active AND ur.role_key<>NEW.role_key LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'STAFF_ROLE_CONFLICT: active role % exists',v_conflict_role USING ERRCODE='23514'; END IF;
  INSERT INTO public.staff_role_audit(restaurant_id,branch_id,target_user_id,old_role_key,new_role_key,action,actor_user_id,actor_role_key,reason,request_id)
  VALUES(NEW.restaurant_id,NEW.branch_id,NEW.user_id,NULL,NEW.role_key,'activated',NEW.assigned_by,v_actor_role,NEW.reason,NEW.request_id);
  RETURN NEW;
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
  OR NEW.role_key IS DISTINCT FROM OLD.role_key OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
  OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by OR NEW.reason IS DISTINCT FROM OLD.reason
  OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.assignment_method IS DISTINCT FROM OLD.assignment_method
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'STAFF_ROLE_ASSIGNMENT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NOT OLD.is_active OR NEW.is_active OR NEW.disabled_by IS NULL OR NEW.disabled_reason IS NULL OR NEW.disabled_request_id IS NULL THEN RAISE EXCEPTION 'STAFF_ROLE_ONLY_ONE_WAY_DEACTIVATION_ALLOWED' USING ERRCODE='23514'; END IF;
 SELECT ar.role_key INTO v_actor_role FROM public.user_profiles p
  JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
  JOIN public.user_roles ar ON ar.user_id=p.user_id
 WHERE p.user_id=NEW.disabled_by AND p.is_active AND ar.restaurant_id=NEW.restaurant_id
  AND ar.is_active AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_ROLE_DISABLE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF OLD.role_key='owner' THEN
  SELECT count(*) INTO v_owner_count FROM public.user_roles ur
  WHERE ur.restaurant_id=OLD.restaurant_id AND ur.role_key='owner' AND ur.is_active AND ur.id<>OLD.id;
  IF v_owner_count=0 THEN RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.disabled_at:=pg_catalog.clock_timestamp();
 NEW.disabled_reason:=pg_catalog.btrim(NEW.disabled_reason);
 INSERT INTO public.staff_role_audit(restaurant_id,branch_id,target_user_id,old_role_key,new_role_key,action,actor_user_id,actor_role_key,reason,request_id)
 VALUES(OLD.restaurant_id,OLD.branch_id,OLD.user_id,OLD.role_key,NULL,'deactivated',NEW.disabled_by,v_actor_role,NEW.disabled_reason,NEW.disabled_request_id);
 RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.enforce_user_role_rules() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER user_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app_private.enforce_user_role_rules();

CREATE FUNCTION app_private.enforce_staff_invitation_request_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor_ok boolean; v_auth_email text; v_auth_confirmed timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STAFF_INVITATION_HARD_DELETE_DENIED' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'pending' OR NEW.auth_user_id IS NOT NULL OR NEW.sent_at IS NOT NULL OR NEW.accepted_at IS NOT NULL
   OR NEW.failed_at IS NOT NULL OR NEW.expired_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL
   OR NEW.cancelled_by IS NOT NULL OR NEW.failure_code IS NOT NULL THEN RAISE EXCEPTION 'STAFF_INVITATION_MUST_START_PENDING' USING ERRCODE='23514'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
   JOIN public.user_roles ar ON ar.user_id=p.user_id WHERE p.user_id=NEW.requested_by AND p.is_active
   AND ar.restaurant_id=NEW.restaurant_id AND ar.is_active AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL) INTO v_actor_ok;
  IF NOT v_actor_ok THEN RAISE EXCEPTION 'STAFF_INVITATION_CREATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
  OR NEW.normalized_email IS DISTINCT FROM OLD.normalized_email OR NEW.role_key IS DISTINCT FROM OLD.role_key
  OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'STAFF_INVITATION_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.send_attempts<OLD.send_attempts THEN RAISE EXCEPTION 'STAFF_INVITATION_ATTEMPTS_CANNOT_DECREASE' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='pending' AND NEW.status IN ('sent','failed','cancelled','expired'))
  OR (OLD.status='sent' AND NEW.status IN ('accepted','failed','cancelled','expired'))
  OR (OLD.status='failed' AND NEW.status IN ('sent','cancelled','expired'))) THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 IF OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN RAISE EXCEPTION 'STAFF_INVITATION_AUTH_ID_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF NEW.auth_user_id IS NOT NULL THEN
  SELECT pg_catalog.lower(au.email),au.email_confirmed_at INTO v_auth_email,v_auth_confirmed
  FROM auth.users au WHERE au.id=NEW.auth_user_id AND au.deleted_at IS NULL;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM NEW.normalized_email THEN RAISE EXCEPTION 'STAFF_INVITATION_AUTH_EMAIL_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='sent' AND (NEW.auth_user_id IS NULL OR NEW.sent_at IS NULL OR NEW.send_attempts<=OLD.send_attempts) THEN RAISE EXCEPTION 'STAFF_INVITATION_SENT_METADATA_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.status='accepted' AND (NEW.auth_user_id IS NULL OR NEW.sent_at IS NULL OR NEW.accepted_at IS NULL OR v_auth_confirmed IS NULL OR OLD.expires_at<=pg_catalog.transaction_timestamp()) THEN RAISE EXCEPTION 'STAFF_INVITATION_ACCEPTANCE_NOT_VERIFIED' USING ERRCODE='23514'; END IF;
 IF NEW.status='failed' AND (NEW.failed_at IS NULL OR NEW.failure_code IS NULL OR NEW.failure_code<>pg_catalog.btrim(NEW.failure_code) OR char_length(NEW.failure_code) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'STAFF_INVITATION_FAILURE_METADATA_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.status<>'failed' AND (NEW.failed_at IS NOT NULL OR NEW.failure_code IS NOT NULL) THEN RAISE EXCEPTION 'STAFF_INVITATION_FAILURE_METADATA_MUST_CLEAR' USING ERRCODE='23514'; END IF;
 IF NEW.status='cancelled' THEN
  SELECT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users au ON au.id=p.user_id AND au.deleted_at IS NULL
   JOIN public.user_roles ar ON ar.user_id=p.user_id WHERE p.user_id=NEW.cancelled_by AND p.is_active
   AND ar.restaurant_id=NEW.restaurant_id AND ar.is_active AND ar.role_key IN ('admin','owner') AND ar.branch_id IS NULL) INTO v_actor_ok;
  IF NOT v_actor_ok OR NEW.cancelled_at IS NULL THEN RAISE EXCEPTION 'STAFF_INVITATION_CANCEL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.status='expired' AND (OLD.expires_at>pg_catalog.transaction_timestamp() OR NEW.expired_at IS NULL) THEN RAISE EXCEPTION 'STAFF_INVITATION_NOT_EXPIRED' USING ERRCODE='23514'; END IF;
 NEW.updated_at:=pg_catalog.clock_timestamp();
 RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.enforce_staff_invitation_request_rules() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER staff_invitation_requests_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.staff_invitation_requests FOR EACH ROW EXECUTE FUNCTION app_private.enforce_staff_invitation_request_rules();

CREATE FUNCTION app_private.enforce_staff_invitation_branch_target_rules() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_status text; v_role text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'STAFF_INVITATION_BRANCH_TARGETS_IMMUTABLE' USING ERRCODE='55000'; END IF;
 SELECT status,role_key INTO v_status,v_role FROM app_private.staff_invitation_requests WHERE id=NEW.invitation_id AND restaurant_id=NEW.restaurant_id;
 IF NOT FOUND OR v_status<>'pending' OR v_role NOT IN ('manager','cashier','rider') THEN RAISE EXCEPTION 'STAFF_INVITATION_BRANCH_TARGET_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.enforce_staff_invitation_branch_target_rules() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER staff_invitation_branch_targets_guard BEFORE INSERT OR UPDATE OR DELETE ON app_private.staff_invitation_branch_targets FOR EACH ROW EXECUTE FUNCTION app_private.enforce_staff_invitation_branch_target_rules();

CREATE FUNCTION app_private.check_staff_invitation_branch_targets() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_role text; v_count bigint;
BEGIN
 IF TG_TABLE_NAME='staff_invitation_requests' THEN v_id:=NEW.id; ELSE v_id:=NEW.invitation_id; END IF;
 SELECT role_key INTO v_role FROM app_private.staff_invitation_requests WHERE id=v_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*) INTO v_count FROM app_private.staff_invitation_branch_targets WHERE invitation_id=v_id;
 IF v_role IN ('admin','owner') AND v_count<>0 THEN RAISE EXCEPTION 'STAFF_INVITATION_RESTAURANT_ROLE_HAS_BRANCH_TARGETS' USING ERRCODE='23514'; END IF;
 IF v_role IN ('manager','cashier','rider') AND v_count=0 THEN RAISE EXCEPTION 'STAFF_INVITATION_BRANCH_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.check_staff_invitation_branch_targets() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER staff_invitation_request_targets_consistency AFTER INSERT OR UPDATE ON app_private.staff_invitation_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_staff_invitation_branch_targets();
CREATE CONSTRAINT TRIGGER staff_invitation_branch_targets_consistency AFTER INSERT ON app_private.staff_invitation_branch_targets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_staff_invitation_branch_targets();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.staff_invitation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.staff_invitation_branch_targets ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON SCHEMA app_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL PRIVILEGES ON TABLE public.staff_role_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL PRIVILEGES ON TABLE app_private.staff_invitation_requests FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL PRIVILEGES ON TABLE app_private.staff_invitation_branch_targets FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.user_profiles OWNER TO postgres;
ALTER TABLE public.user_roles OWNER TO postgres;
ALTER TABLE public.staff_role_audit OWNER TO postgres;
ALTER TABLE app_private.staff_invitation_requests OWNER TO postgres;
ALTER TABLE app_private.staff_invitation_branch_targets OWNER TO postgres;

DO $verify$
DECLARE s text; t text; r text; p text;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'postgres identity failed'; END IF;
 FOR s,t IN SELECT * FROM (VALUES
  ('public','user_profiles'),('public','user_roles'),('public','staff_role_audit'),
  ('app_private','staff_invitation_requests'),('app_private','staff_invitation_branch_targets')
 ) v(s,t)
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=s AND c.relname=t AND c.relkind='r' AND c.relrowsecurity AND pg_catalog.pg_get_userbyid(c.relowner)='postgres') THEN
   RAISE EXCEPTION 'owner/RLS verification failed for %.%',s,t;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF pg_catalog.has_table_privilege(r,pg_catalog.format('%I.%I',s,t),p) THEN
     RAISE EXCEPTION 'unexpected privilege %/% on %.%',r,p,s,t;
    END IF;
   END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies pol WHERE pol.schemaname=s AND pol.tablename=t) THEN
   RAISE EXCEPTION 'unexpected RLS policy on %.%',s,t;
  END IF;
 END LOOP;
 IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
  OR pg_catalog.has_schema_privilege('authenticated','app_private','USAGE')
  OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE') THEN
  RAISE EXCEPTION 'app_private usage exposed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_publication_tables
  WHERE (schemaname='public' AND tablename IN ('user_profiles','user_roles','staff_role_audit'))
  OR (schemaname='app_private' AND tablename IN ('staff_invitation_requests','staff_invitation_branch_targets'))) THEN
  RAISE EXCEPTION 'unexpected Realtime membership';
 END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app_private'
   AND p.proname IN ('enforce_user_profile_rules','guard_staff_role_audit_insert','reject_staff_role_audit_mutation','enforce_user_role_rules','enforce_staff_invitation_request_rules','enforce_staff_invitation_branch_target_rules','check_staff_invitation_branch_targets')
   AND (pg_catalog.pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef
    OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'))
 ) THEN
  RAISE EXCEPTION 'internal trigger function owner/security/EXECUTE assertion failed';
 END IF;
END
$verify$;


-- Reject TRUNCATE on every Batch 3 relation as an additional retention safeguard.
CREATE FUNCTION app_private.reject_staff_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
 RAISE EXCEPTION 'STAFF_RECORD_TRUNCATE_DENIED' USING ERRCODE='55000';
END
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.reject_staff_truncate() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER user_profiles_no_truncate
 BEFORE TRUNCATE ON public.user_profiles
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.reject_staff_truncate();
CREATE TRIGGER user_roles_no_truncate
 BEFORE TRUNCATE ON public.user_roles
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.reject_staff_truncate();
CREATE TRIGGER staff_invitation_requests_no_truncate
 BEFORE TRUNCATE ON app_private.staff_invitation_requests
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.reject_staff_truncate();
CREATE TRIGGER staff_invitation_branch_targets_no_truncate
 BEFORE TRUNCATE ON app_private.staff_invitation_branch_targets
 FOR EACH STATEMENT EXECUTE FUNCTION app_private.reject_staff_truncate();



DO $final_verify$
DECLARE v_count integer;
BEGIN
 IF pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc WHERE oid='app_private.reject_staff_truncate()'::regprocedure))<>'postgres'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='app_private.reject_staff_truncate()'::regprocedure)
  OR pg_catalog.has_function_privilege('anon','app_private.reject_staff_truncate()','EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated','app_private.reject_staff_truncate()','EXECUTE')
  OR pg_catalog.has_function_privilege('service_role','app_private.reject_staff_truncate()','EXECUTE') THEN
  RAISE EXCEPTION 'Batch 3 truncate guard function security check failed';
 END IF;
 SELECT count(*) INTO v_count FROM pg_catalog.pg_trigger tg
 JOIN pg_catalog.pg_class c ON c.oid=tg.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT tg.tgisinternal
  AND tg.tgname IN ('user_profiles_no_truncate','user_roles_no_truncate','staff_invitation_requests_no_truncate','staff_invitation_branch_targets_no_truncate');
 IF v_count<>4 THEN RAISE EXCEPTION 'Batch 3 expected four added truncate guards, got %',v_count; END IF;
END
$final_verify$;
