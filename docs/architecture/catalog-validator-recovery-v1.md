# Flame Chick catalog validator recovery V1

Status: **prepared on `work/production-source-audit`; disposable CI rehearsal pending**  
Scope: the two private publication helper function bodies changed by migration `20261122035721_flame_chick_catalog_publication_validation_fixes_v1.sql`.

## Purpose and limits

This is a forward-only compensating migration. It restores the exact helper source bodies from the already-applied `20261122031027_flame_chick_catalog_publish_rollback_v1.sql` migration if the validator fix has already committed and must be reverted.

It does **not**:
- delete, rewrite, or repair an entry in `supabase_migrations.schema_migrations`;
- drop or rebuild tables, indexes, publications, menu data, or business rows;
- change function signatures, owners, ACLs, execution mode, or search path;
- roll back a catalog publication pointer (that is a separate business operation);
- deploy an Edge Function, Website, POS, Admin or Rider app.

The intended production Supabase project is a build environment; the customer-facing Flame Chick platform is not live. This preparation and its CI rehearsal do not connect to or modify that project.

## Files

- Candidate forward migration: `supabase/migrations/20261122035721_flame_chick_catalog_publication_validation_fixes_v1.sql`
- Compensation: `supabase/migrations/20261122050000_flame_chick_catalog_publication_validation_restore_v1.sql`
- Candidate regression fixture: `supabase/tests/catalog_publication_validation_fixes_v1.sql`
- Recovery verification fixture: `supabase/tests/catalog_publication_validation_recovery_v1.sql`

## Guarded function fingerprints

| Helper | Candidate source SHA-256 | Restored source SHA-256 |
| --- | --- | --- |
| `flame_chick_catalog_publication_validate(uuid)` | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` | `018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712` |
| `flame_chick_catalog_compile_snapshot(uuid,timestamptz)` | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` | `b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2` |

The compensation requires the exact candidate hashes, postgres ownership, ACL `{postgres=X/postgres}`, `SECURITY DEFINER`, empty `search_path`, and the expected volatility/strictness/parallel/leakproof/cost/row attributes. Any mismatch aborts before replacement. After replacement, it checks the exact original hashes and the same security metadata. The SQL is transactional; a failed preflight or postflight rolls back the replacement.

## CI rehearsal design

The disposable workflow performs two complementary paths:

1. Replays the **entire ordered migration history**, including the compensation. This proves the complete schema history remains replayable and ends in the restored baseline state.
2. In that throwaway database only, manually replays the candidate migration SQL, runs the existing rollback-only candidate behavior fixture, then manually replays the compensation SQL and runs the recovery fixture. This tests the exact upgrade → regression test → forward compensation sequence without creating/deleting migration-ledger rows.

The test fixture always rolls back. The workflow verifies the fixture tenant is absent and confirms the final helper source hashes and ACL/security attributes. It uses only a disposable local Supabase stack; no remote database credentials are configured.

## Controlled procedure for a future application

### Before the candidate is applied

1. Confirm the intended project ref is `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai, Free). Do not rely on the project display name alone.
2. Confirm branch `work/production-source-audit` has the reviewed candidate and recovery migration, and all required CI checks are green.
3. Inspect remote history and the proposed change target explicitly:
   ```bash
   supabase migration list --remote=adkrxfnawdiljhjaavnj
   supabase db push --dry-run --remote=adkrxfnawdiljhjaavnj
   ```
   The dry run must show **only** the intended candidate migration. If any other migration is pending, stop and reconcile it separately; `db push` applies all pending migrations.
4. Ensure a current export/backup appropriate to the Free plan is available and that the exact pre-apply function hashes/security metadata match the original hashes above. Never treat a dashboard display label as proof of the target.

### Apply candidate — separate approval gate

The candidate is not authorized by this document. Only after a separate explicit approval for the intended production Supabase project, run the normal reviewed migration release command against the exact project ref. With Supabase CLI v3, database commands target local by default; the explicit `--remote=adkrxfnawdiljhjaavnj` target is mandatory. For a non-interactive reviewed release command, the CLI v3 form is `supabase db push --yes --remote=adkrxfnawdiljhjaavnj`.

Immediately re-run `supabase migration list --remote=adkrxfnawdiljhjaavnj` and verify the candidate timestamp is recorded. Inspect both helper hashes and function metadata read-only. Expected candidate hashes are the values in the table above. Also confirm application-role EXECUTE is still denied.

### When compensation is needed after candidate commit

1. Stop any further catalog publish attempt while diagnosing the reason for rollback. The restaurant platform is not currently live, and no live menu/publication exists in the build environment.
2. Confirm the remote ledger shows candidate `20261122035721` applied and compensation `20261122050000` pending.
3. Run `supabase db push --dry-run --remote=adkrxfnawdiljhjaavnj`. It must show **only** `20261122050000_flame_chick_catalog_publication_validation_restore_v1`. If other migrations are pending, stop; do not push a batch unintentionally.
4. Obtain explicit approval for the compensating change. Then apply it using the v3-targeted command: `supabase db push --yes --remote=adkrxfnawdiljhjaavnj`.
5. Verify remote migration history records the compensation and both helper hashes have returned to the restored values. Verify owner, ACL, `SECURITY DEFINER`, empty search path and no EXECUTE for `anon`, `authenticated` or `service_role`.
6. Run Supabase security/performance/health advisors and inspect for unrelated drift. Keep the two migration rows in history.

### Stop conditions

Do **not** run this compensation when:
- either live helper hash differs from the exact candidate hashes;
- helper owner, ACL, SECURITY DEFINER, search path or execution attributes differ;
- the candidate migration did not commit or is absent from the remote ledger;
- the intended project ref is uncertain;
- another migration is also pending in the same push window.

A failed guard is a stop signal, not a reason to weaken/remove the checks. Prepare a new reviewed forward-only recovery migration for any changed helper version. Never use `migration repair` to erase the candidate, edit the migration ledger, or manually paste unreviewed SQL into the remote database.

## Supabase CLI v3 note

Since CLI v3, database commands default to the local stack; hosted-project changes require an explicit `--remote` target and `--yes` for non-interactive execution. The runbook uses this explicit form to avoid accidentally targeting a local database or the wrong linked project. See [Supabase CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3) and [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).
