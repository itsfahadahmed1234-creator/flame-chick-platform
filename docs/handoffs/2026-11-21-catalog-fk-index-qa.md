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


## Production application and verification

The migration was applied successfully by GitHub Actions run [44892500555](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44892500555). The workflow dry-run showed exactly one pending migration, `20261121062000_flame_chick_catalog_fk_indexes.sql`, then applied it with Supabase CLI v3.2.0 and verified the remote migration list. Independent Supabase SQL verification confirms all 15 expected indexes exist and are owned by `postgres`. No business rows were inserted and no RLS, policies, grants or Realtime settings were changed.
