-- Flame Chick Batch 3 follow-up: indexes for all staff foreign keys reported by Supabase advisors.
-- No data changes, grants, policies, RLS changes, functions, or Realtime membership.
DO $preflight$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN
  RAISE EXCEPTION 'Batch 3 FK indexes must run as postgres';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='user_roles')
  OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='staff_role_audit')
  OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' AND c.relname='staff_invitation_requests')
  OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app_private' AND c.relname='staff_invitation_branch_targets') THEN
  RAISE EXCEPTION 'Batch 3 tables missing; FK index migration must not run';
 END IF;
END
$preflight$;

CREATE INDEX user_roles_assigned_by_fk_idx ON public.user_roles (assigned_by);
CREATE INDEX user_roles_disabled_by_fk_idx ON public.user_roles (disabled_by);
CREATE INDEX user_roles_branch_restaurant_fk_idx ON public.user_roles (branch_id, restaurant_id);

CREATE INDEX staff_role_audit_actor_user_fk_idx ON public.staff_role_audit (actor_user_id);
CREATE INDEX staff_role_audit_branch_restaurant_fk_idx ON public.staff_role_audit (branch_id, restaurant_id);

CREATE INDEX staff_invitation_requests_requested_by_fk_idx ON app_private.staff_invitation_requests (requested_by);
CREATE INDEX staff_invitation_requests_auth_user_fk_idx ON app_private.staff_invitation_requests (auth_user_id);
CREATE INDEX staff_invitation_requests_cancelled_by_fk_idx ON app_private.staff_invitation_requests (cancelled_by);

CREATE INDEX staff_invitation_branch_targets_branch_restaurant_fk_idx ON app_private.staff_invitation_branch_targets (branch_id, restaurant_id);
CREATE INDEX staff_invitation_branch_targets_invitation_restaurant_fk_idx ON app_private.staff_invitation_branch_targets (invitation_id, restaurant_id);

DO $verify$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_roles_assigned_by_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_roles_disabled_by_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_roles_branch_restaurant_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='staff_role_audit_actor_user_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='staff_role_audit_branch_restaurant_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app_private' AND indexname='staff_invitation_requests_requested_by_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app_private' AND indexname='staff_invitation_requests_auth_user_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app_private' AND indexname='staff_invitation_requests_cancelled_by_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app_private' AND indexname='staff_invitation_branch_targets_branch_restaurant_fk_idx')
  OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='app_private' AND indexname='staff_invitation_branch_targets_invitation_restaurant_fk_idx') THEN
  RAISE EXCEPTION 'Batch 3 expected FK indexes are missing';
 END IF;
END
$verify$;
