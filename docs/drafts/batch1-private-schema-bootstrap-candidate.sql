-- ARCHIVED DRAFT — Flame Chick Batch 1 private schema bootstrap
-- Status: superseded by the applied migration at supabase/migrations/20261120154413_batch1_private_schema_bootstrap.sql.
-- Target: Flame Chick Production PostgreSQL 17.12.
-- Expected execution identity: current_user = postgres AND session_user = postgres.
-- Precondition: Dashboard API settings have been manually checked and app_private is NOT in Exposed schemas.
-- Do not execute this archived draft; use the canonical migration history for reference.

BEGIN;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION
      'STOP: Batch 1 must run as postgres (current_user=%, session_user=%)',
      current_user, session_user;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'app_private'
  ) THEN
    RAISE EXCEPTION
      'STOP: app_private already exists; inspect and reconcile instead of reusing it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION
      'STOP: expected Supabase application roles are missing';
  END IF;
END;
$preflight$;

CREATE SCHEMA app_private AUTHORIZATION postgres;

-- No browser, Data API or service_role direct schema access.
REVOKE ALL ON SCHEMA app_private
  FROM PUBLIC, anon, authenticated, service_role;

-- Default ACLs apply only to future objects created as postgres in app_private.
-- Tables and sequences have no implicit PUBLIC grants, but remove any defaults
-- explicitly so the intended boundary is visible and testable.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

-- Per-schema revokes remove role-specific defaults, but cannot subtract
-- PostgreSQL's implicit global PUBLIC EXECUTE/USAGE defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE USAGE ON TYPES FROM anon, authenticated, service_role;

-- IMPORTANT for every later migration that creates an app_private function:
-- immediately follow CREATE FUNCTION with:
-- REVOKE EXECUTE ON FUNCTION app_private.exact_signature(...)
--   FROM PUBLIC, anon, authenticated, service_role;
--
-- IMPORTANT for every later migration that creates an app_private custom type:
-- immediately follow CREATE TYPE with:
-- REVOKE USAGE ON TYPE app_private.exact_type
--   FROM PUBLIC, anon, authenticated, service_role;
--
-- Do not globally alter postgres function/type defaults here. That would
-- affect future postgres-created objects in unrelated Supabase-managed schemas.

DO $verify$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(nspowner)
    INTO v_owner
    FROM pg_catalog.pg_namespace
   WHERE nspname = 'app_private';

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'Batch 1 verification failed: app_private owner is %', v_owner;
  END IF;

  IF has_schema_privilege('anon', 'app_private', 'USAGE')
     OR has_schema_privilege('authenticated', 'app_private', 'USAGE')
     OR has_schema_privilege('service_role', 'app_private', 'USAGE') THEN
    RAISE EXCEPTION 'Batch 1 verification failed: an application role has app_private USAGE';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app_private'
       AND c.relkind IN ('r','p','v','m','S')
  ) THEN
    RAISE EXCEPTION 'Batch 1 verification failed: unexpected relation exists in new schema';
  END IF;

  RAISE NOTICE 'Batch 1 private schema owner and schema ACL checks passed';
END;
$verify$;

COMMIT;

-- Post-commit manual checks (do not assume SQL alone can prove these):
-- 1. Project Settings -> API -> Exposed schemas: app_private must be absent.
-- 2. Query pg_publication_tables: no app_private objects may be published.
-- 3. Test an API request using Accept-Profile: app_private; it must be rejected
--    as an unexposed schema (e.g. PostgREST PGRST106), not return object metadata.
-- 4. On each later app_private table creation, explicitly ENABLE ROW LEVEL SECURITY.
