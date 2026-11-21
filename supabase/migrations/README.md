# Production migrations

This directory contains Flame Chick Production migrations only. Historical Demo migrations live under `supabase/demo-reference/migrations/` and must never be deployed automatically.

## Migration history and project state — 2026-11-21

Production project: `adkrxfnawdiljhjaavnj` (Mumbai, PostgreSQL 17.12, Free plan).

The live database already contains:
- Security/default-privilege baseline: `20261119125153`
- Batch 1 private schema: `20261120154413`
- Batch 2 restaurant/branch foundation: `20261120164125`
- Batch 3 staff identity/roles and indexes: `20261121043115`, `20261121043149`
- Batch 4 Staff Admin command/invitation migrations: `20261121053647`, `20261121053712`, `20261121053829`, `20261121054852`, `20261121055722`

The catalog foundation SQL `20261121061000_flame_chick_catalog_authoring_foundation.sql` was run directly as `postgres` and the 11 catalog tables are now present in Production. This bypassed the migration tracker; the live ledger still does not contain version `20261121061000`.

**Required one-time history repair:** after checking the remote migration list and confirming all 11 tables/constraints/indexes/triggers/RLS/grants match the file, run the official Supabase CLI command from a linked local project:

```bash
supabase migration repair --status applied 20261121061000
supabase migration list
```

This command updates migration tracking only; it does not rerun schema DDL. Do not manually insert into `supabase_migrations.schema_migrations`, do not rerun the catalog foundation SQL, and do not run `supabase db push` until the repair is complete and the local/remote migration lists are reconciled.

## Catalog migrations staged after the foundation

- `20261121062000_flame_chick_catalog_fk_indexes.sql` — 15 targeted child-side indexes prepared in response to Performance Advisor foreign-key findings. **Staged only; not applied.** Apply only after the `20261121061000` ledger repair.

## Safety boundary

- Run Production migrations as `current_user = postgres` and `session_user = postgres`; never as `supabase_admin`.
- No Supabase database branches or paid-plan upgrades are permitted without separate approval.
- Catalog tables have RLS enabled, no policies, no direct table privileges for `anon`, `authenticated` or `service_role`, no Realtime entries, and no rows. The `authenticated` role retains schema USAGE on `app_private` specifically for the Batch 4 Staff Admin invoker wrapper; `anon` and `service_role` do not.
- Do not add broad policies just to silence informational `rls_enabled_no_policy` advisor findings. Catalog reads/writes will use reviewed Edge Function/server command paths.
- Do not enable Admin direct PostgREST CRUD or public reads from mutable draft tables.
- GST/tax remains deferred.
