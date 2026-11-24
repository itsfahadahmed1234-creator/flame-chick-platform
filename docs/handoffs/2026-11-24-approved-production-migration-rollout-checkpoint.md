## Supabase CLI v3 — exact one-at-a-time migration procedure (approved rollout)

This section supersedes generic `db push` alternatives elsewhere in older notes. Current Supabase CLI v3 is local by default for database commands, so specify the Production target explicitly every time. Official docs:
- [CLI migration up](https://supabase.com/docs/reference/cli/supabase-migration-up)
- [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-remote)
- [CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)

Use `supabase migration up --remote=adkrxfnawdiljhjaavnj --yes`, not `apply_migration` and not direct SQL/manual migration-ledger edits. For each run, keep only the *next* pending migration file in `supabase/migrations`; temporarily move the later pending files outside that directory, run one migration, verify the exact version/name with `supabase migration list --remote=adkrxfnawdiljhjaavnj` and a read-only query, then restore the moved files before proceeding. Use a cleanup/finally block so no source migration file can be left outside its original location. Do not add `--include-all` unless a separate reconciliation proves it is necessary. Do not use `db push` for this controlled sequence because it can also include roles, seed inputs and other push inputs.

CLI v3 unattended/agent runs require `--yes` for hosted migrations; that flag is appropriate here because the user approved this exact seven-migration rollout. Never use `--yes` for any additional Production action outside that approval. CLI v3 database queries must use the SQL as a positional argument and `--read-only`, e.g.:
```powershell
supabase migration list --remote=adkrxfnawdiljhjaavnj
supabase migration up --remote=adkrxfnawdiljhjaavnj --yes
supabase db query "select version,name from supabase_migrations.schema_migrations where version = '20261123160000';" --remote=adkrxfnawdiljhjaavnj --read-only
```
Repeat the final two commands with the exact next migration version only after the previous migration's object, ACL/RLS and smoke checks pass. The one-at-a-time method requires backing up and validating exports first. The active session still has no local shell/CLI execution, so none of these commands has been run.

---

# Approved Production operational migration rollout — 2026-11-24

**Date:** 2026-11-24  
**Approval:** User explicitly approved the seven-migration Production rollout in this conversation.  
**Production project:** `adkrxfnawdiljhjaavnj` — Flame Chick Production, Mumbai, Free plan.  
**GitHub repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Verified source commit before this handoff update:** `cc8ae79eefaae62467c9f3cf7401781722c5dffb`

## Result of approved preflight

- Production is `ACTIVE_HEALTHY`, PostgreSQL 17.12.
- Production ledger is unchanged at 26 migrations; branch source contains 33. All 26 common migration versions/names match. The seven operational migrations listed below remain unapplied.
- The operational objects remain absent: `orders`, `order_items`, `delivery_tasks`, `delivery_task_offers`, `rider_profiles`, and the associated order/delivery/payment RPCs.
- Existing production catalog data is present: 1 restaurant, 1 branch, 8 categories, 25 products, 28 product variants, 6 deals, 6 deal variants and 2 catalog publications. There is also 1 staff profile, 1 staff-role assignment and 1 active Auth user.
- The active Production Edge Function is `flame-chick-staff-admin` v1. It sends authenticated requests through `flame_chick_staff_admin_command`; the Edge Function source does not directly read `user_profiles` or `user_roles`. Current `service_role` SELECT privileges on both tables are already absent. The planned role-projection migration is compatible with that current function path.
- Baseline Supabase advisors currently report 33 INFO-level `RLS Enabled No Policy` findings and 1 WARN for Auth leaked-password protection being disabled. These are baseline findings captured before the pending migrations; compare after rollout rather than claiming zero current findings.

## Seven migrations approved, but not applied

1. `20261123160000_flame_chick_operational_schema_v1`
2. `20261123170000_flame_chick_staff_role_projection_rpc_v1`
3. `20261123171000_flame_chick_delivery_offer_identity_guard_v1`
4. `20261123172000_flame_chick_delivery_commands_v1`
5. `20261123173000_flame_chick_payment_collection_v1`
6. `20261123174000_flame_chick_website_order_create_v1`
7. `20261123174100_flame_chick_website_order_idempotency_lookup_v1`

The first migration creates the operational tables and private helpers; it does not replace existing catalog tables or rows. Later migrations add role projection, delivery identity/command routines, payment collection and website order/idempotency routines. Local disposable QA already replayed all 33 migrations and passed security/role/operational tests, actual Order API → PostgREST → PostgreSQL tests, and delivery/payment concurrency races (GitHub Actions run 45311516506).

## Why no Production SQL was executed after approval

The Supabase MCP `apply_migration` tool does not accept a source migration version. The Management API generates its own timestamp for each call, which would create remote-only migration history entries and desynchronize the checked-in migration files. This is a documented MCP limitation; do not use that tool for these seven source-controlled migrations.

The correct path is Supabase CLI `migration up --remote=<project-ref>` (or `db push --remote=<project-ref>`), which reads the exact checked-in timestamped files and records those versions. In this session no local-shell/CLI execution or GitHub Actions workflow-dispatch action is available. Directly executing the DDL through `execute_sql` and hand-editing `supabase_migrations.schema_migrations` is not an acceptable substitute.

**Therefore no Production migration, SQL write, secret, function deployment, Realtime/Storage change, website-order flag or Vercel deployment occurred.** The project remains at 26 applied migrations.

## Free-plan backup prerequisite

Supabase Free does not provide automatic daily database backups. A manual CLI export is required before the schema rollout. The CLI's default `db dump` is schema-only; a separate `--data-only` export is required to preserve the existing catalog and staff application data. Export custom roles separately when needed. The exports must be stored outside this source repository in the private `flame-chick-backups` repository/location; the connected GitHub search did not surface that separate repository, so do not assume it is connected or commit dumps into this repository.

For current Supabase CLI v3, from the checked-out repo (first confirm `supabase --version` and that `supabase/config.toml` names `adkrxfnawdiljhjaavnj`):
```powershell
supabase link --project-ref adkrxfnawdiljhjaavnj
supabase db dump --remote=adkrxfnawdiljhjaavnj -f "<PRIVATE_BACKUP_DIR>\flame-chick-production-schema-before-operational.sql"
supabase db dump --remote=adkrxfnawdiljhjaavnj --data-only -f "<PRIVATE_BACKUP_DIR>\flame-chick-production-data-before-operational.sql"
supabase db dump --remote=adkrxfnawdiljhjaavnj --role-only -f "<PRIVATE_BACKUP_DIR>\flame-chick-production-roles-before-operational.sql"
Get-FileHash "<PRIVATE_BACKUP_DIR>\flame-chick-production-*.sql" -Algorithm SHA256
supabase migration list --remote=adkrxfnawdiljhjaavnj
```
Use a real private backup directory in place of `<PRIVATE_BACKUP_DIR>`; do not paste database passwords or access tokens into chat. Confirm all exports exist, are non-empty, and are stored privately before migration.

To apply and verify one at a time with CLI, keep the 26 already-applied source files and only the next single pending migration inside `supabase/migrations`; temporarily move later pending files outside that directory, run:
```powershell
supabase migration up --remote=adkrxfnawdiljhjaavnj
supabase db query "select version,name from supabase_migrations.schema_migrations where version = '<EXPECTED_VERSION>';" --remote=adkrxfnawdiljhjaavnj --read-only
```
Verify the exact expected version/name and that migration-specific objects/security checks pass before restoring the next migration file and repeating. Always restore all temporarily moved files in a `finally`/cleanup step. Do not use `migration down` as a rollback plan; use a reviewed forward-fix if a future issue occurs.

The connector can then independently re-check the ledger, objects, grants/RLS and advisors after each applied migration. Do not set secrets or deploy functions as part of this step.

## Scope still excluded

- No Edge Function deployment or secret configuration in this migration step.
- Rider Web Push remains disabled because current Delivery API plaintext push-subscription handling does not match the ciphertext-only schema and supporting trusted hook/config RPCs are absent.
- No website checkout activation or branch ordering enablement; finish V3 cart/checkout and configure delivery areas/default Not Listed fee first.
- Rider marking Delivered is not payment collection; only Cashier collection of the full amount completes the order and moves it to History.
- GST remains deferred; no payment gateway/refunds.

---



## Official Supabase references checked
- [Database migration guide](https://supabase.com/docs/guides/deployment/database-migrations) — remote migration history must match timestamped source files; use CLI migration commands.
- [Supabase CLI reference](https://supabase.com/docs/reference/cli/global-flags) — `migration up`, `db dump`, and remote project targeting.
- [Free plan backup FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups) — Free projects require manual CLI backups; automatic daily backups require a paid plan.
- [Database backups guide](https://supabase.com/docs/guides/platform/backups) — recommends off-site exports for Free projects.

## Stop conditions
Stop before proceeding if the repository branch/ref differs, the Production project ref/region/status differs, migration ledger is not exactly reconciled, any export is missing/empty, a migration fails, its expected ledger row is absent, its expected object/security check fails, or the CLI reports an unexpected target. Never compensate by manually inserting/deleting migration history rows or replaying already-applied catalog migrations.
