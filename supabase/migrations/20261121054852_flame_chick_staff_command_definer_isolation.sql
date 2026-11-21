-- Flame Chick Batch 4: keep SECURITY DEFINER command implementation out of exposed public schema.
-- The public PostgREST endpoint is an invoker wrapper. Only authenticated has USAGE
-- on app_private and EXECUTE on this internal function; the schema is not Data API exposed.
DO $preflight$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'BATCH4_DEFINER_ISOLATION_REQUIRES_POSTGRES'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='flame_chick_staff_admin_command' AND p.prosecdef
  AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'BATCH4_USER_COMMAND_NOT_READY_FOR_ISOLATION'; END IF;
 IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
 OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE') THEN
  RAISE EXCEPTION 'BATCH4_PRIVATE_SCHEMA_ALREADY_EXPOSED_TO_UNTRUSTED_ROLES'; END IF;
END
$preflight$;
ALTER FUNCTION public.flame_chick_staff_admin_command(text,jsonb) SET SCHEMA app_private;
ALTER FUNCTION app_private.flame_chick_staff_admin_command(text,jsonb) RENAME TO flame_chick_staff_admin_command_internal;
REVOKE ALL ON FUNCTION app_private.flame_chick_staff_admin_command_internal(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.flame_chick_staff_admin_command_internal(text,jsonb) TO authenticated;
CREATE FUNCTION public.flame_chick_staff_admin_command(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $wrapper$
 SELECT app_private.flame_chick_staff_admin_command_internal(p_action,p_payload)
$wrapper$;
ALTER FUNCTION public.flame_chick_staff_admin_command(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_staff_admin_command(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_staff_admin_command(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.flame_chick_staff_admin_command(text,jsonb) IS
 'Invoker wrapper for the private staff command. The internal function derives auth.uid() and performs all Admin/Owner authorization.';
DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='flame_chick_staff_admin_command' AND NOT p.prosecdef
  AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
  AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'BATCH4_PUBLIC_WRAPPER_SECURITY_ASSERTION_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app_private' AND p.proname='flame_chick_staff_admin_command_internal'
  AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
  AND p.proconfig @> ARRAY['search_path=""']
  AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'BATCH4_PRIVATE_COMMAND_SECURITY_ASSERTION_FAILED'; END IF;
 IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
 OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE')
 OR NOT pg_catalog.has_schema_privilege('authenticated','app_private','USAGE') THEN
  RAISE EXCEPTION 'BATCH4_PRIVATE_SCHEMA_GRANTS_INVALID'; END IF;
END
$verify$;
