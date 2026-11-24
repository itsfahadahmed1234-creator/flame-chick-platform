# Flame Chick Production migration reconciliation — read-only

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Verified source checkpoint:** `1ea0b6762d0c16bc2efed3dcc2923cc2626eebea`  
**Disposable QA:** [45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)

## Migration inventory

- Source branch: 33 SQL migrations.
- Production ledger: 26 migrations.
- All 26 shared version/name pairs match exactly.
- No Production-only versions and no migration-name mismatches.
- Seven branch migrations are pending in Production:
  - `20261123160000 flame_chick_operational_schema_v1`
  - `20261123170000 flame_chick_staff_role_projection_rpc_v1`
  - `20261123171000 flame_chick_delivery_offer_identity_guard_v1`
  - `20261123172000 flame_chick_delivery_commands_v1`
  - `20261123173000 flame_chick_payment_collection_v1`
  - `20261123174000 flame_chick_website_order_create_v1`
  - `20261123174100 flame_chick_website_order_idempotency_lookup_v1`

## Corrected function-source hash chain

The previous warning was incorrect: it compared a migration's before-state preflight with the live after-state. Exact source function bodies were hashed using PostgreSQL-compatible UTF-8 and outer newlines. The hashes establish the intended chain:

| Stage | Function prosrc SHA-256 | Result |
|---|---|---|
| Catalog public read before time metadata | `450bb2ea8671bcc5812400f49323efeef2aa3f1d2e6e5c9dbe6c919e4` | Matches 23101105 preflight |
| Catalog public read after time metadata | `110dc450d835d15662a01bc72c7d750933ee145834a0abee75f45ea4700abab2` | Matches live Production |
| Validator after 22105821 fixes | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` | Matches 23101126 preflight |
| Snapshot compiler after 22105821 fixes | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` | Matches 23101126 preflight and live |
| Validator after deal-only pricing | `270133a76cb649e70190945028b87b916b9e946d63e2794550fef31ad3fec86d` | Matches live Production |

Live function ownership/security were also read-only inspected: owner `postgres`, SECURITY DEFINER and empty search path; public catalog read ACL is restricted to `service_role`.

## Live operational schema status

These Production objects remain absent (NULL): `public.orders`, `public.order_items`, `public.delivery_tasks`, `public.delivery_task_offers`, `public.rider_profiles`, website-order create RPC, delivery command RPC and payment collection RPC.

This is not drift: the seven operational migrations are not in the live ledger and are intentionally still source-only.

## Test proof

The full local QA [run 45311516506](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506) passed:
- full 33-migration replay on disposable Supabase;
- role/RLS/security, operational schema and delivery tests;
- actual Order API handler -> local PostgREST -> PostgreSQL quote/create/replay/stale-fee/tamper/conflict checks;
- 4 delivery and 2 payment concurrency races;
- full local stack teardown with `--no-backup`.

## Safety / next step

No Production migration, SQL, secret or deployment was performed. No live ledger editing or migration renumbering is required for the already-applied catalog migrations.

Next: make a read-only final rollout checklist for the seven pending migrations, including sequencing, grants/RLS, role checks, rollback/recovery and deployment dependencies. Do not push any migration, set secrets, deploy functions or enable checkout in this checkpoint.


---

# Flame Chick Production operational migration rollout review

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Source checkpoint:** `1e863653ea9d3ea0bb1adc042080cb1b1fe38598`  
**Disposable QA:** [45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)

## Confirmed database delta

Production ledger is exactly the first 26 migration versions/names in the current branch. No version/name drift exists. Seven source-only pending migrations are:

1. `20261123160000_flame_chick_operational_schema_v1`
2. `20261123170000_flame_chick_staff_role_projection_rpc_v1`
3. `20261123171000_flame_chick_delivery_offer_identity_guard_v1`
4. `20261123172000_flame_chick_delivery_commands_v1`
5. `20261123173000_flame_chick_payment_collection_v1`
6. `20261123174000_flame_chick_website_order_create_v1`
7. `20261123174100_flame_chick_website_order_idempotency_lookup_v1`

Production has none of the order/delivery/payment tables or RPCs yet. The seven migrations replayed successfully in order in a fresh disposable local Supabase stack; the complete local QA passed.

## Reviewed permission model

- New operational public/private tables enable and force RLS.
- `anon` and `authenticated` have no direct CRUD privileges.
- Service role has explicit read grants, narrow rider-presence column update only, and no direct order/payment/delivery DML.
- Transactional write functions are SECURITY DEFINER, postgres-owned, empty search path, revoked from PUBLIC/anon/authenticated, and granted to service_role only.
- No operational tables are added to Supabase Realtime by this schema migration.
- Staff role lookups use a narrow service-role-only role-projection RPC rather than service-role table reads on `user_profiles`/`user_roles`.

## Required secrets and function sequence

Before Order API deployment configure server-only:
- `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` — unpredictable, at least 32 bytes.
- `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` — separate unpredictable secret, at least 32 bytes.

Keep Supabase secret/service-role key server-side. Publishable keys are the only keys allowed in the customer site.

After separately approved migration rollout and server-side secret setup, deploy the catalog read endpoint, then the Order API; deploy Delivery API only after delivery schema/commands are available and its own configuration has been checked. Existing Staff Admin function is currently the only active Production Edge Function.

Website ordering remains disabled until live delivery-area/default-fee configuration and V3 website integration are completed and reviewed. The active homepage still uses V2 catalog code; the V3 preview remains read-only.

## Rider Push is not ready

Schema uses ciphertext-only subscription columns, but Delivery API source still queries/inserts plaintext `endpoint`, `p256dh` and `auth` columns. Encryption/decryption and associated push config/trusted-webhook functions are not present in the seven pending migration set. Do not enable push subscriptions or push notification hooks until a separate schema/API/config security fix has passed tests.

## Local QA evidence

Run 45311516506 passed:
- all 33 branch migrations replayed from scratch;
- RLS/role/operational schema tests;
- website order SQL quota/idempotency tests;
- real Order API handler → local PostgREST → local PostgreSQL quote, stale-fee/tamper rejection, commit, retry and conflict;
- four delivery and two payment concurrency race cases;
- teardown of disposable Supabase with `--no-backup`.

## Approval boundary

This is a review-only plan. No Production migrations/SQL, keys/secrets, Edge deployments, Realtime, Storage, Vercel deployments, catalog publication or order enablement were performed. Do not push the seven migrations until a separate explicit Production rollout approval. GST remains deferred. Rider Delivered still does not collect payment; cashier collection is the only completion path.


---

# APPROVED PRODUCTION MIGRATION ROLLOUT — EXECUTION CHECKPOINT
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



---

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

