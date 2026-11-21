-- Batch 4 Staff Admin read-only security assertions.
DO $assert$
DECLARE v_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='flame_chick_staff_admin_command' AND p.prosecdef
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.proconfig @> ARRAY['search_path=""']
   AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'BATCH4_USER_COMMAND_GRANTS_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='flame_chick_staff_admin_system_command' AND p.prosecdef
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND p.proconfig @> ARRAY['search_path=""']
   AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'BATCH4_SYSTEM_COMMAND_GRANTS_INVALID'; END IF;
 SELECT count(*) INTO v_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE ((n.nspname='public' AND c.relname IN ('user_profiles','user_roles','staff_role_audit'))
 OR (n.nspname='app_private' AND c.relname IN ('staff_invitation_requests','staff_invitation_branch_targets')))
 AND c.relrowsecurity AND pg_catalog.pg_get_userbyid(c.relowner)='postgres';
 IF v_count<>5 THEN RAISE EXCEPTION 'BATCH4_TABLE_RLS_OR_OWNER_INVALID'; END IF;
 IF pg_catalog.has_schema_privilege('anon','app_private','USAGE')
 OR pg_catalog.has_schema_privilege('authenticated','app_private','USAGE')
 OR pg_catalog.has_schema_privilege('service_role','app_private','USAGE') THEN
 RAISE EXCEPTION 'BATCH4_PRIVATE_SCHEMA_USAGE_LEAK'; END IF;
END
$assert$;
