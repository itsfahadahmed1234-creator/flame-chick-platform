-- Batch 4 Admin bootstrap context.
-- The private command remains SECURITY DEFINER, postgres-owned, and isolated in app_private.
-- Only the authenticated caller's authorized Admin/Owner role receives this list response.
DO $patch$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  IF current_user<>'postgres' OR session_user<>'postgres' THEN
    RAISE EXCEPTION 'BATCH4_ADMIN_LIST_EXTENSION_REQUIRES_POSTGRES';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid='app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
      AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'BATCH4_PRIVATE_COMMAND_SECURITY_INVALID';
  END IF;

  v_def:=pg_catalog.pg_get_functiondef('app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure);
  IF pg_catalog.strpos(v_def,'''actor_role'',v_actor_role')>0
     OR pg_catalog.strpos(v_def,'''restaurant'',')>0 THEN
    RAISE EXCEPTION 'BATCH4_ADMIN_LIST_EXTENSION_ALREADY_PRESENT';
  END IF;

  v_old:=E'      ''restaurant_id'',v_restaurant_id,\n      ''branches'',';
  v_new:=E'      ''restaurant_id'',v_restaurant_id,\n      ''actor_role'',v_actor_role,\n      ''restaurant'',(\n        SELECT pg_catalog.jsonb_build_object(\n          ''id'',r.id,''name'',r.name,''slug'',r.slug,\n          ''currency_code'',r.currency_code,''timezone'',r.timezone\n        ) FROM public.restaurants r WHERE r.id=v_restaurant_id\n      ),\n      ''branches'',';
  IF pg_catalog.strpos(v_def,v_old)=0 THEN
    RAISE EXCEPTION 'BATCH4_ADMIN_LIST_RESPONSE_ANCHOR_NOT_FOUND';
  END IF;
  v_def:=pg_catalog.replace(v_def,v_old,v_new);
  EXECUTE v_def;
END
$patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  v_def:=pg_catalog.pg_get_functiondef('app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure);
  IF pg_catalog.strpos(v_def,'''actor_role'',v_actor_role')=0
     OR pg_catalog.strpos(v_def,'''restaurant'',')=0
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_proc p
       WHERE p.oid='app_private.flame_chick_staff_admin_command_internal(text,jsonb)'::regprocedure
         AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
         AND p.proconfig @> ARRAY['search_path=""']
     ) THEN
    RAISE EXCEPTION 'BATCH4_ADMIN_LIST_RESPONSE_VERIFY_FAILED';
  END IF;
END
$verify$;
