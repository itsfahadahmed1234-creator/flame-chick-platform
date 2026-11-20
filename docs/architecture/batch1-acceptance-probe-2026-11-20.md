# Flame Chick — Batch 1 acceptance probe results

**Date:** 2026-11-20  
**Project:** Flame Chick Production `adkrxfnawdiljhjaavnj`, PostgreSQL 17.12, Free plan  
**Execution identity:** `current_user=postgres`, `session_user=postgres`  
**Status:** Disposable acceptance objects and ACL changes were intentionally rolled back. No persistent application schema or privilege changes.

## Acceptance probe

Created a uniquely named schema and disposable table, sequence, function and enum type. Applied candidate private-schema default ACL restrictions, plus the global `postgres`-creator revokes needed to suppress implicit PUBLIC defaults for functions/types. Enabled RLS on the test table. Then asserted effective privileges for anon, authenticated and service_role, ownership, RLS and Realtime membership.

All assertions passed:
- Client schema USAGE: denied.
- Client table SELECT/INSERT/UPDATE/DELETE: denied.
- Client sequence USAGE/SELECT/UPDATE: denied.
- Client function EXECUTE: denied.
- Client custom type USAGE: denied.
- Schema/table/sequence/function/type owners: postgres.
- Disposable table RLS: enabled.
- Realtime publication membership: false.
- PUBLIC EXECUTE ACL on disposable function: absent.
- PUBLIC USAGE ACL on disposable type: absent.

The probe raised an intentional exception after all assertions passed, rolling back the entire test.

## Rollback verification

Subsequent read-only query confirmed:
- Acceptance probe schema absent.
- Probe relation count zero.
- `app_private` still absent.
- Supabase Realtime publication contains zero tables.
- Application relation count in `public` and `app_private` remains zero.
- No probe default ACLs persisted.

The project has pre-existing default ACLs for `postgres` in `public` and `storage`, and broad internal `supabase_admin` defaults in several Supabase-managed schemas. The proposed global revokes from PUBLIC do not remove explicit schema-specific storage grants to anon/authenticated/service_role. Do not change Supabase-managed defaults or assume application ownership of those schemas.

## Exposure and Realtime checks

- `supabase_realtime` publication is not configured for all tables; it currently contains no tables.
- SQL catalog access does not reveal the Data API's configured exposed-schema list. Supabase documentation confirms custom schemas must be separately added in Project Settings → API → Exposed schemas. Therefore, a manual Dashboard check is a required gate: ensure `app_private` is absent. After schema creation, perform an actual negative PostgREST/API access test.
- Existing `ensure_rls` trigger applies to public schema only; it must not be assumed to cover private schemas. Batch 1 spec now requires explicit RLS enablement on every private table as defense in depth.

## Advisors

After rollback:
- Security Advisor: zero lints.
- Performance Advisor: zero lints.
- Health Advisor: zero lints.

## Conclusion

The database-side Batch 1 privilege boundary passes the disposable acceptance probe. The API exposed-schema setting cannot be proven from SQL-only access and remains a manual configuration verification gate. No persistent migration has been applied. Batch 1 is **not yet approved for persistent deployment** until the exposed-schema setting is manually verified, final SQL reviewed, and the migration has a clean recovery/backup plan.


## Production Batch 1 deployment and post-apply tests (2026-11-20)

Applied migration `20261120154413_batch1_private_schema_bootstrap` after explicit user approval. Verified app_private owner postgres; PUBLIC/anon/authenticated/service_role schema USAGE false; no relations/functions/enums created; no Realtime membership; no global postgres default ACL entries. Security, Performance and Health Advisors each returned zero lints.

A second disposable transaction inside app_private created a test table, sequence, function and enum type. Table RLS was enabled; explicit per-object PUBLIC/client revokes were applied to function/type. Effective-privilege assertions for anon/authenticated/service_role passed for table SELECT, sequence USAGE, function EXECUTE and type USAGE. The transaction rolled back and a follow-up query confirmed no probe objects remained.

User-confirmed exposed schemas: `graph_ql`, `public`; app_private absent. No PostgREST negative request was performed. No external encrypted dump was created; user explicitly approved proceeding without it because Production was empty.
