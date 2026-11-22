# Flame Chick catalog validator recovery V1

Status: **candidate migration applied and verified; recovery template rehearsed successfully in disposable CI**  
Environment: intended production-build Supabase project `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai `ap-south-1`, Free). The customer-facing Flame Chick platform is not live.

## Applied candidate

- Repository migration: `supabase/migrations/20261122105821_flame_chick_catalog_publication_validation_fixes_v1.sql`
- Supabase migration ledger version: `20261122105821`
- Ledger name: `flame_chick_catalog_publication_validation_fixes_v1`
- The Supabase migration tool generated this ledger timestamp when the reviewed SQL was applied. The repository filename is aligned to that exact version.
- No compensation migration is pending or present in `supabase/migrations`.

The candidate replaces only the bodies of:
- `app_private.flame_chick_catalog_publication_validate(uuid)`
- `app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)`

The candidate body SHA-256 values now verified in the intended project are:

| Helper | Applied source SHA-256 |
| --- | --- |
| Validator | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` |
| Snapshot compiler | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` |

Both functions remain owned by `postgres`, ACL `{postgres=X/postgres}`, `SECURITY DEFINER`, empty `search_path`, VOLATILE, non-strict, PARALLEL UNSAFE, non-leakproof, cost 100, rows 0. `anon`, `authenticated`, and `service_role` have no EXECUTE.

## Recovery template

- SQL template: `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql`
- Recovery fixture: `supabase/tests/catalog_publication_validation_recovery_v1.sql`
- CI workflow: `.github/workflows/qa-catalog-publication-validation-fixes-v1.yml`

The compensation is forward-only and transactional. It refuses to run unless both helper bodies exactly match the applied candidate hashes and the expected owner/ACL/security metadata. It restores the exact function definitions from the prior `20261122031027` migration and verifies original hashes:

| Helper | Restored source SHA-256 |
| --- | --- |
| Validator | `018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712` |
| Snapshot compiler | `b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2` |

**The template deliberately remains outside `supabase/migrations`.** Supabase migration pushes apply every pending migration in that folder. Keeping the reversal outside it prevents an ordinary forward push from applying both the candidate and its compensation.

## CI verification

Latest revised workflow:
[Run 45014790768 — completed / success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45014790768)

It:
1. Replayed the full ordered migration history through the candidate on a disposable local Supabase stack.
2. Ran the candidate regression fixture, which ended in `ROLLBACK`.
3. Manually executed the compensation template and the recovery fixture.
4. Verified the fixture tenant count was zero and the migration ledger still matched the repository migration file count.
5. Stopped the disposable stack successfully.

The workflow used no remote database credentials and did not connect to the intended Supabase project.

## Verified project state after apply

- Migration ledger: 24 entries; latest `20261122105821_flame_chick_catalog_publication_validation_fixes_v1`.
- One restaurant and one branch.
- Zero categories, products, deals, schedule sets or publications.
- Zero QA fixture tenants.
- No menu publication, customer order, or public catalog data was created.
- No Edge Function, Admin/POS/Rider app, Website, Vercel deployment, alias, or DNS setting was changed.

## Controlled recovery procedure — only if needed

A recovery is a separate schema change and requires explicit approval at the time it is needed. Do not run the template directly against the hosted project.

1. Stop catalog publication attempts while investigating the reason for recovery.
2. Reconfirm project ref `adkrxfnawdiljhjaavnj`, then explicitly link the repository:
   ```bash
   supabase link --project-ref adkrxfnawdiljhjaavnj
   supabase migration list
   ```
3. Confirm the remote ledger contains candidate version `20261122105821` and identify the latest remote migration version.
4. Generate a **new migration timestamp newer than the latest remote ledger entry**:
   ```bash
   supabase migration new flame_chick_catalog_publication_validation_restore_v1
   ```
   Copy the reviewed SQL from `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql` into that newly timestamped migration file. Do not rename or delete the already-applied candidate migration.
5. Reconfirm the linked project ref and run:
   ```bash
   supabase migration list
   supabase db push --dry-run
   ```
   The dry run must show **only the new compensation migration**. If any other migration is pending, stop and reconcile it separately.
6. Obtain explicit approval for this compensating change, then run the normal interactive `supabase db push`.
7. Verify the new compensation version is recorded, both helper hashes match the restored values above, and the owner, ACL, SECURITY DEFINER, empty search path and no-EXECUTE restrictions remain intact.
8. Run Supabase security/performance/health advisors and inspect any unrelated drift.

## Stop conditions

Do not apply the compensation if:
- either helper source hash differs from the exact candidate hashes;
- owner, ACL, SECURITY DEFINER, search path or execution metadata differs;
- the candidate migration is absent from the ledger;
- the linked project ref is uncertain;
- another migration is pending in the same push window.

A guard failure is a stop signal. Do not weaken the checks, edit migration history, or use `migration repair` to erase the candidate. Prepare a new reviewed recovery migration if helper code has changed since this template was tested.

