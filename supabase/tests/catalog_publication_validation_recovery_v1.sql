-- Read-only verification fixture for the catalog validator forward compensation.
-- Run after the recovery migration on a disposable local Supabase stack.
BEGIN;

DO $test$
DECLARE
  v_validate oid := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_publication_validate(uuid)');
  v_compile oid := pg_catalog.to_regprocedure('app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)');
  v_validate_hash text;
  v_compile_hash text;
BEGIN
  IF v_validate IS NULL OR v_compile IS NULL THEN
    RAISE EXCEPTION 'CATALOG_RECOVERY_HELPER_MISSING';
  END IF;

  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_validate_hash FROM pg_catalog.pg_proc p WHERE p.oid=v_validate;
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    INTO v_compile_hash FROM pg_catalog.pg_proc p WHERE p.oid=v_compile;

  IF v_validate_hash IS DISTINCT FROM '018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712'
     OR v_compile_hash IS DISTINCT FROM 'b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2' THEN
    RAISE EXCEPTION 'CATALOG_RECOVERY_ORIGINAL_SOURCE_HASH_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid IN (v_validate,v_compile)
      AND (
        pg_catalog.pg_get_userbyid(p.proowner)<>'postgres'
        OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
        OR NOT p.prosecdef
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
        OR p.provolatile IS DISTINCT FROM 'v'
        OR p.proisstrict IS DISTINCT FROM false
        OR p.proparallel IS DISTINCT FROM 'u'
        OR p.proleakproof IS DISTINCT FROM false
        OR p.procost IS DISTINCT FROM 100
        OR p.prorows IS DISTINCT FROM 0
        OR p.proretset IS DISTINCT FROM false
        OR p.prokind IS DISTINCT FROM 'f'
        OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'CATALOG_RECOVERY_SECURITY_BASELINE_MISMATCH';
  END IF;
END;
$test$;

ROLLBACK;
