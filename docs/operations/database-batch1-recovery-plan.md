

## 2026-11-20 — Batch 1 deployment completed

**Status: APPLIED and verified.** User explicitly approved proceeding without an external encrypted schema dump because Production was empty. Do not represent a backup as having been created.

Applied migration:
- Version: `20261120154413`
- Name: `batch1_private_schema_bootstrap`
- Canonical file: `supabase/migrations/20261120154413_batch1_private_schema_bootstrap.sql`

Post-apply read-only verification:
- app_private owner = postgres.
- PUBLIC, anon, authenticated and service_role have no app_private USAGE.
- No app_private relations/functions/types were created by the bootstrap.
- No app_private Realtime publication membership.
- No global postgres default ACL changes.
- Security, Performance and Health Advisors: zero lints each.

A disposable transaction created a test table/sequence/function/enum in app_private, enabled table RLS, applied explicit PUBLIC/client revokes for function/type, and asserted effective privileges. All assertions passed. Transaction rolled back; no probe objects remained.

User confirmed exposed schemas are `graph_ql` and `public`, with app_private absent. API settings were not changed. PostgREST negative request behavior remains an unperformed follow-up test.

If reversal is ever needed, use a new reviewed forward migration with guarded `DROP SCHEMA app_private RESTRICT` only after proving it is empty. Never edit migration history or use CASCADE.
# Flame Chick Batch 1 — Recovery and backup plan

**Date:** 2026-11-20  
**Target:** Flame Chick Production `adkrxfnawdiljhjaavnj`, Free plan, PostgreSQL 17.12  
**Status:** Batch 1 applied and verified on 2026-11-20. The sections below retain the pre-deployment recovery procedure for audit history; do not treat them as current deployment status.

## Scope and risk

Batch 1 creates only an empty `app_private` schema and schema-specific default ACL entries owned by `postgres`. It must not create business tables, user records, functions, types, seed data, Auth users, Storage objects, Edge Functions or Realtime publications.

The current read-only baseline shows no application relations in `public` or `app_private`; `app_private` does not yet exist. Supabase-managed schemas and platform configuration are outside the scope of this migration and must not be altered.

## Free-plan backup limitation

Supabase's current Database Backups documentation says automatic daily database backups are provided for Pro, Team and Enterprise projects. Free-plan projects are advised to export regularly with the Supabase CLI `db dump` command and maintain off-site backups. Do not assume this Free project has a scheduled daily backup or PITR.

Official documentation:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump

Before the first persistent schema migration:
1. On a trusted workstation, install/use the official Supabase CLI and follow its current `supabase db dump --help`.
2. Create a schema-only logical export of the project and store it encrypted outside GitHub and outside the Supabase project. The current Supabase CLI dump filters platform-managed schemas; raw `pg_dump` may include Supabase internals and is not the preferred Supabase-platform export route.
3. Do not put database URLs, passwords, access tokens, API keys or dumps containing sensitive records into GitHub or chat.
4. Retain the export and the exact migration SQL/checksum together in a controlled off-site location.
5. If the CLI/Docker requirement cannot be met, do not pretend a backup exists. Because Batch 1 is an empty-schema-only change, we may still rely on the reviewed transactional/forward-recovery approach only after the owner explicitly accepts that no external backup artifact was created.

At the time of this review, the available execution environment did not have Supabase CLI, Docker or `pg_dump`; no backup file has been created.

## Deployment safeguards

1. Confirm the target ref and project name before execution: `adkrxfnawdiljhjaavnj`, Flame Chick Production, Mumbai.
2. Confirm the Data API exposed-schema list in the correct project Dashboard. `app_private` must not be present. SQL catalog access in the connected tool cannot prove this Dashboard setting.
3. Confirm execution identity immediately before applying: both `current_user` and `session_user` must equal `postgres`.
4. Confirm the only pre-existing application migration remains `20261119125153 flame_chick_postgres_default_privileges_hardening`; never reapply it.
5. Apply only the reviewed Batch 1 candidate, not Batches 2–3. Do not modify global postgres default function/type ACLs; the candidate uses the narrower schema-specific rules and requires per-object PUBLIC revokes for future private functions/types.
6. Use a transaction and stop on any error. Never use `CASCADE`.
7. Verify schema owner, no client schema USAGE, exact default ACL entries, no relations in the schema, no Realtime membership, and the API negative exposure test.
8. Run Security, Performance and Health advisors; zero lints are necessary but not sufficient.

## Failure before commit

If any assertion or SQL statement fails inside the migration transaction, the transaction must roll back. Confirm:
- `app_private` does not exist;
- no schema-specific `pg_default_acl` rows remain for that schema (if the schema is absent, the dependency should be absent too);
- no migration history entry was committed for the failed migration;
- the original hardening migration and its event trigger remain intact.

Do not retry blindly; inspect the actual error and database state first.

## Reversal after a successful commit

Because Batch 1 creates no tables, functions, custom types or data, a dedicated forward rollback can remove the empty schema safely:

```sql
BEGIN;

DO $guard$
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Rollback must run as postgres';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='app_private'
  ) THEN
    RAISE NOTICE 'app_private is already absent; nothing to reverse';
  ELSIF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='app_private'
       AND c.relkind IN ('r','p','v','m','S')
  ) OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='app_private'
  ) OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname='app_private'
       AND t.typtype <> 'p'
       AND t.typname NOT LIKE '\_%'
  ) THEN
    RAISE EXCEPTION 'STOP: app_private contains objects; do not drop it';
  END IF;
END;
$guard$;

-- If schema exists and is empty, RESTRICT refuses to remove any dependency/object.
DROP SCHEMA IF EXISTS app_private RESTRICT;

COMMIT;
```

After reversal, re-run the Batch 0 read-only checks and verify the existing hardening migration/trigger. Never edit migration history manually. If the migration was recorded as applied, keep the original history and record the corrective forward rollback as a new migration after review.

If application tables/functions/types are ever added to `app_private`, this empty-schema rollback is no longer permitted. Use a separately reviewed recovery plan; no cascade drop.

## What this plan does not reverse

This migration must not change project settings, API exposed schemas, Auth, Storage, Realtime configuration, secrets, Edge Functions, Vercel, websites, POS or Rider apps. Those controls remain untouched.



## 2026-11-20 — User-confirmed exposed schemas and candidate rollback rehearsal

The user inspected the correct Flame Chick Production API settings and confirmed exactly two exposed schemas: `graph_ql` and `public`. `app_private` is absent. No API setting was changed.

The exact current candidate SQL was executed against connected Production with only the final `COMMIT;` changed to `ROLLBACK;`. Post-run verification returned:
- current_user/session_user = postgres/postgres
- app_private exists = false
- app_private default ACL rows = 0
- app_private Realtime publication rows = 0
- public application relation count = 0
- no additional application migration history beyond the baseline

This validates transaction execution and rollback of the candidate statements. It does not leave any objects behind and does not constitute a persistent migration.

Persistent Batch 1 remains unapplied. External encrypted schema dump has not been created because the available environment lacks Supabase CLI, Docker and pg_dump. Since the target project has no application data/tables and Batch 1 is only an empty schema plus scoped default ACLs, the remaining decision is whether the user explicitly accepts proceeding without an external dump or wants to arrange a dump first.
