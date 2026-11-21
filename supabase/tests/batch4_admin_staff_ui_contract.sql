-- Batch 4 Admin Staff UI/API contract checks (read-only).
DO $assert$
DECLARE v_def text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure) INTO v_def;
 IF pg_catalog.strpos(v_def,'''actor_role'',v_actor_role')=0
    OR pg_catalog.strpos(v_def,'''restaurant'',')=0
    OR pg_catalog.strpos(v_def,'''staff'',coalesce')=0
    OR pg_catalog.strpos(v_def,'''invitations'',coalesce')=0
    OR pg_catalog.strpos(v_def,'''audit'',coalesce')=0 THEN
  RAISE EXCEPTION 'ADMIN_STAFF_LIST_CONTRACT_INCOMPLETE';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='public.flame_chick_staff_admin_command(text,jsonb)'::regprocedure
    AND NOT p.prosecdef
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'ADMIN_STAFF_WRAPPER_GRANTS_INVALID';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
    AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.proconfig @> ARRAY['search_path=""']) THEN
  RAISE EXCEPTION 'ADMIN_STAFF_PRIVATE_DEFINER_INVALID';
 END IF;
END
$assert$;
