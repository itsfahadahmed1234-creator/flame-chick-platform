# Catalog FK index migration — disposable QA result

Date: 2026-11-21
Target: Flame Chick Production `adkrxfnawdiljhjaavnj`
Branch: `work/production-source-audit`

## Staged file

`supabase/migrations/20261121062000_flame_chick_catalog_fk_indexes.sql`

Contains 15 covering indexes for child-side composite foreign keys reported by Supabase Performance Advisor. No grants, policies, RLS settings, data or Realtime publication changes.

## Test performed

The exact staged SQL was executed as a disposable transaction against Production, with the final `COMMIT` changed to `ROLLBACK`. The migration's preflight, all 15 CREATE INDEX statements and the verification DO block completed successfully. The Supabase SQL tool returned no errors.

A post-test catalog index query confirmed none of the 15 new index names persisted. Follow-up counts confirmed all eleven catalog tables still contain zero rows. Supabase migration history still lists the same previous ten migrations.

## Current status

<badge>Staged only — not applied</badge>

Do not apply this migration until the missing catalog foundation migration version `20261121061000` has been recorded using the official Supabase CLI reconciliation:

```bash
supabase migration repair --status applied 20261121061000
supabase migration list
```

Then apply `20261121062000` using the normal migration workflow and re-run Performance Advisor. No direct write to `supabase_migrations.schema_migrations` is permitted.
