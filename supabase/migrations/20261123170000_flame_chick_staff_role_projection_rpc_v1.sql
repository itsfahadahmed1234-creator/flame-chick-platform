-- Flame Chick staff role projection RPC V1.
-- Preserves Batch 4's explicit prohibition on service_role direct reads of
-- user_profiles/user_roles while allowing trusted Edge Functions to resolve the
-- authenticated subject's active Flame Chick role rows through a narrow projection.
BEGIN;

REVOKE SELECT ON TABLE public.user_profiles, public.user_roles
  FROM service_role;

CREATE OR REPLACE FUNCTION public.flame_chick_get_staff_role_rows(p_user_id uuid)
RETURNS TABLE(
  restaurant_id uuid,
  role_key text,
  branch_id uuid,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT ur.restaurant_id, ur.role_key, ur.branch_id, ur.is_active
  FROM public.user_roles ur
  JOIN public.user_profiles up
    ON up.user_id=ur.user_id AND up.is_active
  JOIN auth.users au
    ON au.id=ur.user_id AND au.deleted_at IS NULL
  JOIN public.restaurants r
    ON r.id=ur.restaurant_id AND r.slug='flame-chick' AND r.is_active
  WHERE ur.user_id=p_user_id
    AND ur.is_active
    AND ur.role_key IN ('owner','admin','manager','cashier','rider')
  ORDER BY ur.role_key,ur.branch_id NULLS FIRST
$function$;

ALTER FUNCTION public.flame_chick_get_staff_role_rows(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flame_chick_get_staff_role_rows(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.flame_chick_get_staff_role_rows(uuid)
  TO service_role;

DO $verify$
BEGIN
  IF pg_catalog.has_table_privilege('service_role','public.user_profiles','SELECT')
     OR pg_catalog.has_table_privilege('service_role','public.user_roles','SELECT') THEN
    RAISE EXCEPTION 'FLAME_CHICK_STAFF_DIRECT_ROLE_TABLE_READ_STILL_GRANTED';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='flame_chick_get_staff_role_rows'
      AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig @> ARRAY['search_path=""']
      AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'FLAME_CHICK_STAFF_ROLE_PROJECTION_RPC_SECURITY_INVALID';
  END IF;
END;
$verify$;

COMMIT;
