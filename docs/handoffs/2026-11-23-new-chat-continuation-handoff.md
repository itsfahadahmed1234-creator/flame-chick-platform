# PRODUCTION OPERATIONAL MIGRATIONS — APPLIED
**Updated:** 2026-11-24 08:35 PKT
**Production project:** adkrxfnawdiljhjaavnj (Flame Chick Production, ap-south-1, Free)
**Repository:** itsfahadahmed1234-creator/flame-chick-platform
**Branch:** work/production-source-audit

The user clarified that Flame Chick has no live operational system or order records and explicitly approved applying the seven operational migrations without manual backups at this pre-launch stage. The live DB was checked immediately before apply: 0 orders, 0 order items, 0 payments, 0 delivery tasks, 0 delivery offers, 0 rider profiles. Existing catalog/setup records were present and preserved: 1 restaurant, 1 branch, 25 products, 28 variants, 6 deals, 1 Auth user. Do not describe the whole database as empty.

All seven migrations were successfully applied to Production, sequentially, through Supabase MCP `apply_migration`. The tool assigned authoritative migration versions; the source filenames on this work branch were then renamed to match those exact remote versions. No remote migration ledger rows were manually edited. Final applied versions:
1. `20261124033406_flame_chick_operational_schema_v1`
2. `20261124033413_flame_chick_staff_role_projection_rpc_v1`
3. `20261124033417_flame_chick_delivery_offer_identity_guard_v1`
4. `20261124033422_flame_chick_delivery_commands_v1`
5. `20261124033426_flame_chick_payment_collection_v1`
6. `20261124033430_flame_chick_website_order_create_v1`
7. `20261124033433_flame_chick_website_order_idempotency_lookup_v1`

Production now has 33 migrations (26 previous + 7 operational). Post-apply checks verified operational tables exist with RLS enabled; all order/payment/delivery tables have 0 rows; catalog counts remain unchanged. Verified privileged RPCs are owned by postgres, SECURITY DEFINER, configured with empty search_path, executable by service_role, and not executable by anon/authenticated. Existing catalog and staff records remain intact. Security advisor still reports the pre-existing RLS-enabled/no-policy INFO lint class (51 findings) and Auth leaked-password-protection WARN; compare/resolve these in a separate security remediation task, do not claim zero lints.

Manual backups were explicitly deferred by the user until before real customer orders are accepted. Before accepting real orders, introduce and verify Free-plan manual schema/data/roles exports and restore procedure. No orders are currently live, so no business transactions were affected.

Still not done / not authorized by this migration approval: setting Edge Function secrets; deploying or changing Edge Functions; Rider Push implementation (ciphertext schema mismatch remains); enabling Realtime; configuring delivery areas / Not Listed fee; V3 storefront cart/checkout; enabling branch website order flags; catalog publication changes; Vercel deployment. Website ordering remains disabled. GST remains deferred. Rider Delivered still does not mean payment collected; Cashier must collect the full payment before completion/history.

**Important:** The source migration files were renamed to the generated Production version IDs. Do not restore the previous 20261123 filenames or apply them again. Run local full migration replay after this filename alignment before the next code release. Current GitHub update commits include the migration file renames; latest commit will be verified separately.

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

# CURRENT CHECKPOINT — 2026-11-24 — Production Rollout Review COMPLETE (READ ONLY)

**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Verified source checkpoint before this documentation update:** `1e863653ea9d3ea0bb1adc042080cb1b1fe38598`  
**Disposable local QA:** [run 45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)

## End-to-end verification completed

The complete disposable QA run replayed all 33 source migrations into local Supabase, passed all security/role/schema/website-order/delivery checks, ran the actual Order API handler against local PostgREST/PostgreSQL, passed four delivery concurrency and two payment concurrency races, and stopped the disposable stack with `--no-backup`.

The real local HTTP-handler-to-PostgreSQL test verified:
- stale delivery fee rejected after quote issuance;
- altered HMAC signature rejected;
- valid quote committed exactly one order through the real RPC;
- exact retry returned the original committed order;
- same request key with changed facts was rejected;
- persisted state was `new/unpaid/dispatch_pending`, with no payment record.

## Production migration reconciliation

- Branch source: 33 migrations.
- Live Production ledger: 26 migrations.
- All 26 shared versions/names match exactly; no source/live name mismatch and no live-only migration.
- Seven operational/order/delivery/payment migrations are source-only and still unapplied:
  `20261123160000`, `20261123170000`, `20261123171000`, `20261123172000`, `20261123173000`, `20261123174000`, `20261123174100`.
- Production still has no `orders`, `order_items`, `delivery_tasks`, `delivery_task_offers`, `rider_profiles`, website-order create RPC, delivery-command RPC or payment-collection RPC.
- The earlier preflight-hash warning has been corrected: migration preflight hashes are before-state values; source-generated after-state function bodies match current live Production hashes exactly. Do not edit the ledger or replay already-applied catalog migrations `20261123101105` and `20261123101126`.

## Read-only security/dependency review of the seven pending migrations

- Operational tables use RLS and FORCE RLS. `anon` and `authenticated` receive no direct table privileges. Service-role reads are explicit; broad direct DML on orders/payments/delivery is denied, with only the narrow rider-presence column updates granted.
- Internal order/quota/counter/outbox helpers are in `app_private` with RLS/FORCE RLS and no browser table privileges.
- The role projection, delivery command, payment collection, website create and idempotency RPCs verify as server/service-role-only in the migration chain; SECURITY DEFINER routines set an empty search path.
- Operational tables are deliberately not added to Realtime by these migrations.
- The local full-migration and security/role test suites passed.

## Deployment requirements still outstanding

1. Apply the seven pending migrations in chronological order only in a separately approved Production rollout; the local run is not evidence they exist in Production.
2. Configure these server-only Order API secrets before deployment: `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` and `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` (both unpredictable, at least 32 bytes). Never commit or expose them in website config.
3. Ensure the server-side Supabase secret key and publishable key environments are available to Edge Functions. Keep service-role/secret keys out of browsers.
4. Deploy Catalog, Order and Delivery Edge Functions only after database/secret prerequisites and production smoke checks. Production currently has only `flame-chick-staff-admin` active.
5. Configure the real branch delivery areas and Not Listed default fee. Website ordering/delivery/pickup flags remain disabled.
6. The current customer homepage/config still loads the V2 catalog path; the V3 preview is a read-only page, not the live customer cart/checkout. Finish and review the V3 storefront integration before enabling customer checkout.

## Additional Rider Push readiness blocker

The operational migration defines `rider_push_subscriptions` with ciphertext-only columns (`endpoint_hash`, `endpoint_ciphertext`, `p256dh_ciphertext`, `auth_ciphertext`). The current Delivery Edge Function still reads/inserts plaintext `endpoint`, `p256dh`, `auth` column names and does not implement the encryption/decryption expected by that schema. The Delivery function also calls push configuration/webhook RPCs not included in the seven pending migrations reviewed here. Therefore **do not enable Rider Web Push** as part of this rollout. Align the Edge API, encrypted persistence and trusted hook/configuration RPCs in a separate tested change first. Core rider offer polling/acceptance and task commands are covered by local QA independently.

## Business and safety rules retained

- Rider marking Delivered does not mean payment collected. Cashier records collection; only full collection completes the order and sends it to History.
- GST remains deferred. No tax calculation, tax field or checkout tax logic is introduced.
- No Production SQL/migration/secret/function/Realtime/Storage change, no Vercel deployment or domain change occurred. `main` remains untouched. Flame Chick remains pre-launch.

## Next step

Prepare the final Production rollout bundle and operator runbook for the seven source-only migrations (preflight checks, apply order, post-apply verifications, abort/recovery checkpoints, server-secret setup and Edge Function deployment order). Keep the bundle review-only. Do not apply migrations, set secrets, deploy functions, publish catalog changes or enable website orders until that rollout is separately approved.

---

# CURRENT CHECKPOINT — 2026-11-24 — Local Order E2E PASSED; Production Migration Reconciliation COMPLETE (READ ONLY)

**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Source checkpoint before this documentation update:** `1ea0b6762d0c16bc2efed3dcc2923cc2626eebea`  
**Disposable full QA:** [run 45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)  
**Production Supabase project:** `adkrxfnawdiljhjaavnj` (`ap-south-1`, healthy)

## 1. Website Order API → actual local PostgreSQL is green

The full disposable QA run passed. It:
- replayed all 33 source migrations on a fresh local Supabase stack;
- passed RLS/security, Admin/Owner/Manager/Cashier/Rider authorization, operational schema and delivery command tests;
- passed website order create/idempotency and the 3/minute, 3/10-minute and 15/hour quota SQL tests;
- invoked the actual `handleOrderApiRequest(req)` handler against real local Supabase PostgREST/RPC/PostgreSQL, not mocks;
- verified stale delivery-fee and tampered-signature rejection, valid quote/commit, safe idempotent replay and changed-facts conflict rejection;
- confirmed one persisted local website order, one item, one status-history row, one delivery task, one quota event and zero payment rows; its state was `new`, `unpaid`, `dispatch_pending`;
- passed all 4 delivery concurrency races and both payment-collection concurrency races;
- stopped the disposable Supabase stack with `supabase stop --no-backup`.

The local test does not write to or deploy anything to Production.

## 2. Production/source migration reconciliation — exact result

Read-only comparison against Production project `adkrxfnawdiljhjaavnj`:

- Current branch contains **33** SQL migrations.
- Production migration ledger contains **26**.
- All **26/26 shared versions have exactly matching migration names**.
- There are **zero** live-only/unknown Production migrations.
- There are **zero** version/name mismatches.

Seven branch migrations are source-only and are not yet recorded/applied in Production:

1. `20261123160000_flame_chick_operational_schema_v1`
2. `20261123170000_flame_chick_staff_role_projection_rpc_v1`
3. `20261123171000_flame_chick_delivery_offer_identity_guard_v1`
4. `20261123172000_flame_chick_delivery_commands_v1`
5. `20261123173000_flame_chick_payment_collection_v1`
6. `20261123174000_flame_chick_website_order_create_v1`
7. `20261123174100_flame_chick_website_order_idempotency_lookup_v1`

Live Production checks confirm the corresponding operational tables and RPCs remain absent: `orders`, `order_items`, `delivery_tasks`, `delivery_task_offers`, `rider_profiles`, website order create RPC, delivery command RPC and payment collection RPC all resolve to NULL. This is expected at this pre-launch stage.

## 3. Important correction: previous function-hash warning was a false positive

The old warning compared preflight hashes (the expected *before* state of each migration) with the currently live functions (the *after* state). The migration ledger confirms both migrations have already been applied, and the source chain proves the transition:

- Source body from `20261121155900_flame_chick_catalog_public_snapshot_read_v1` hashes to `450bb2ea8671bcc581240c7af2400f49323efeef2aa3f1d2e6e5c9dbe6c919e4`, exactly the baseline required by `20261123101105`.
- The resulting source body from `20261123101105_flame_chick_catalog_database_time_metadata_v1` hashes to `110dc450d835d15662a01bc72c7d750933ee145834a0abee75f45ea4700abab2`, exactly the live Production `public.flame_chick_catalog_public_read(text)` body.
- Source body from `20261122105821_flame_chick_catalog_publication_validation_fixes_v1` gives validator hash `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` and compiler hash `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808), exactly the two baselines required by `20261123101126`.
- The resulting source validator body from `20261123101126_flame_chick_deal_only_variant_pricing_v1` hashes to `270133a76cb649e70190945028b87b916b9e946d63e2794550fef31ad3fec86d`, exactly the live Production validator body; the live compiler remains `1cee9543...`, as expected.
- Both live function definitions remain owned by `postgres`, `SECURITY DEFINER`, with `search_path=""`; the public catalog read is executable only by `service_role`.

**Do not edit the Production migration ledger, renumber these two applied migrations, or replay them.** The before-state preflight hashes are correct and the deployed after-state function bodies match source.

## 4. Deployment / Production boundary

This reconciliation was read-only. No Production SQL, migration, key, secret, Edge Function, Realtime, Storage, branch-ordering, catalog publication, Vercel deployment or domain change occurred. `main` remains untouched.

Still not configured/deployed:
- the seven operational migrations and their tables/RPCs;
- server-only `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET`;
- real delivery-area records and Not Listed default fee;
- Catalog and Order Edge Function deployment;
- V3 customer checkout activation.

Keep website ordering flags disabled. Do not apply the seven migrations or deploy APIs until the operational migration rollout is separately reviewed and explicitly approved. GST remains deferred. Rider marking Delivered still does not collect payment; only Cashier payment collection completes an order and moves it to History.

## 5. Next step

Prepare a final read-only rollout review for the seven source-only operational migrations: dependency/order, grants/RLS, SECURITY DEFINER boundaries, rollback/recovery, server-only secret requirements, function deployment order and post-migration verification. Produce a specific checklist and exact SQL/function versions to be applied, but do not push migrations, configure secrets, deploy functions or enable checkout without a separate explicit approval.

---

# CURRENT CHECKPOINT — 2026-11-24 — Website Order API → Local Postgres E2E PASSED

**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Active branch:** `work/production-source-audit`  
**Verified source head:** `c90e592f6c76ea0769c6c7fc921ab12afd22de1a`  
**Full disposable QA run:** [45311516506 — SUCCESS](`https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506`)

## What passed in the disposable local environment

- Supabase CLI installed and disposable local Supabase stack started.
- Complete repository migration history replayed successfully.
- Staff ACL/RLS baseline and Admin/Owner/Manager/Cashier/Rider boundaries passed.
- Operational schema V1 constraints/security tests passed.
- Delivery offer, accept/reject, pickup, delivered and physical-return command tests passed.
- Website PostgreSQL order-creation, idempotency and all rolling phone-quota SQL tests passed.
- Actual `flame-chick-order-api` request handler was run through local PostgREST into real local PostgreSQL (not mocks):
  - quote issued from the locally published synthetic V3 catalog;
  - live delivery fee changed between quote and create, and the stale quote was rejected;
  - altered HMAC signature was rejected;
  - valid signed quote created one real order through the create RPC;
  - exact retry returned the original order without a second commit;
  - same idempotency key with changed customer data was rejected.
- The SQL verifier confirmed exactly one website order and its expected item, status-history and delivery-task rows; the order was `new`, `unpaid`, `dispatch_pending`, with no payment record.
- All four delivery concurrency races and both payment-collection concurrency races passed, including one-collection-only retry and prevention of over-collection.
- Disposable Supabase stack stopped with `supabase stop --no-backup`; no test database or synthetic rows were retained.

## Exact route-test evidence

The Deno output reported: `ok | 1 passed | 0 failed`. It printed:
`Real local Order API → PostgREST → PostgreSQL: stale fee, tamper, commit, replay and conflict checks passed.`

The PostgreSQL verifier reported:
`Verified one real local website order: new/unpaid, $550 item + $50 delivery, dispatch_pending, no payment.`

The delivery/payment concurrency harness reported:
`all 4 delivery races and 2 payment races produced coherent terminal states and matching ledger/audit records`.

## Important distinction

The earlier HTTP-route test using mocked Supabase responses remains useful unit/integration coverage, but it is no longer the only route test. The latest successful run executed the actual request handler against local PostgREST and PostgreSQL. This is a combined local Edge-handler-to-real-Postgres test using a synthetic catalog/customer and an isolated disposable stack.

## Release blockers — still unchanged

- Production order/delivery/payment tables and RPCs are still absent and must not be inferred from the disposable local run.
- Production migration history/source reconciliation is still required before any database push or hosted migration.
- `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` must be configured as a server-only Edge Function secret before Order API deployment; it has not been set in Production.
- Delivery areas and Not Listed default fee need real business configuration.
- Branch website-ordering flags remain disabled.
- Catalog and Order Edge Functions / V3 customer checkout remain undeployed/disabled.
- No Vercel deployment, Production SQL, secrets, Realtime, Storage or catalog publication change occurred.
- `main` remains untouched. GST remains deferred. Rider marking Delivered still does not collect payment; Cashier collection is the only step that completes the order and moves it to History.

## Next step

Perform read-only source-to-Production migration reconciliation. Compare the exact working-branch migration filenames and source hashes/preflight function-body hashes with the live Production migration ledger and live function bodies. In particular, resolve the previously identified migration timestamp/source mismatch without editing the live ledger, replaying migrations, pushing SQL or mutating Production. Only after a complete, explicit reconciliation should a separate reviewed migration rollout be considered.

---

# CURRENT CHECKPOINT — 2026-11-24 — Website Order API route integration tests PASSED

**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Verified source head:** `a3774b80d0414ec20f71b6f2f5b9046ac28e1251`  
**Edge Function Static Checks:** [run 45309012736 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012736)  
**Admin Static Checks:** [run 45309012932 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012932)

## Website V3 signed quote and route test

- `flame-chick-order-api` now exports `handleOrderApiRequest(req)`; `Deno.serve` starts only under `import.meta.main`, allowing the actual handler to be imported by Deno tests without starting a listener.
- Added `supabase/functions/flame-chick-order-api/index_test.ts` and wired it to Edge Function CI.
- The Deno test uses the real handler, a synthetic V3 published-menu fixture, and in-memory mocked Supabase REST/RPC responses. It never reaches Production.
- Covered: quote issuance/current delivery fee, no raw phone/address in token, stale-fee rejection, tampered-token rejection, exact three-minute expiry rejection, successful 201 create, safe replay after expiry returning the original order without a second commit, and changed-facts idempotency conflict.
- First test attempt revealed a TypeScript control-flow narrowing issue in the test counter. The assertion now reads through a typed accessor and CI passes.

## Verification

- [Edge Function Static Checks run 45309012736](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012736): Deno checks for all Edge Functions passed; the new actual-route integration test passed; existing Edge/RPC/pricing/signed-token tests passed.
- [Admin Static Checks run 45309012932](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012932) passed.
- [Website Static Checks run 45308055860](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45308055860) passed 103/103 core and 25/25 preview tests, including inline script parsing.

## Important test boundary

This is **not yet a single combined HTTP-to-real-Postgres end-to-end test**. The new route test uses mocked Supabase REST/RPC responses. The existing `supabase/tests/flame_chick_website_order_create_v1.sql` independently exercises actual PostgreSQL create, delivery fee checks, idempotency and the 3/minute, 3/10-minute and 15/hour rolling phone quotas on disposable local Supabase. These two passing layers must not be described as one combined Edge-to-Postgres run.

## Release prerequisites

- Configure the server-only `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` (unpredictable value, minimum 32 bytes) before deploying the Order API. Never commit or expose it to the browser.
- Apply the reviewed operational/order/delivery/payment migrations to the target Production project before deploying order/delivery APIs. Production still lacks those operational tables/RPCs.
- Configure delivery areas and Not Listed default fee; branch website-ordering flags remain disabled until readiness is confirmed.
- Complete a combined local Edge-to-Postgres test before considering checkout launch.
- Deploy `flame-chick-catalog`, `flame-chick-order-api` and the V3 website only after schema/secrets/tests are ready and release review is complete.

## Safety boundary

Only source and handoff documentation on `work/production-source-audit` changed. No Production SQL, migration, secret, Edge Function, Realtime, Storage, branch-ordering, catalog-publication, Vercel or domain change occurred. `main` remains untouched. Flame Chick remains pre-launch; GST remains deferred.

## Next step

Run the actual local Order Edge Function against disposable local Supabase PostgREST/RPC after full migration replay. Use a synthetic tenant and roll back fixtures. Verify quote/create/replay, changed fee/publication, token tampering/expiry, quotas, and teardown.

---

# CURRENT CHECKPOINT — 2026-11-24 — Website V3 signed quote protection PASSED SOURCE CI

**Active repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Active branch:** `work/production-source-audit`  
**Verified head:** `520e79e0276bfea205d7a3ebdb2bf6931e947b86`  
**Website Static Checks:** [run 45308055860 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45308055860)  
**Edge Function Static Checks:** [run 45233268331 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45233268331), on parent code commit `38d4501bc8f372eceed0e4316dadd8e7348b4081`; the Edge Function/helper source is unchanged in the current head.

## Website V3 quote and checkout protection

- Added `supabase/functions/_shared/website-order-quote-token.mjs` and six tests in `tests/website-order-quote-token.test.mjs`.
- The Order API now signs a short-lived (3-minute) HMAC-SHA-256 quote token using the server-only `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` environment secret.
- The signed claims contain a quote UUID, DB-issued time, expiry and an HMAC fingerprint of the canonical server-calculated order. Raw customer name, phone, address, cart contents and prices are not embedded in the token.
- On checkout, the Edge Function rebuilds the canonical quote from the current published V3 catalog and live branch/delivery settings, then checks the submitted token against the newly calculated order. Changed/expired/tampered/missing quote tokens fail closed.
- The database create-order RPC still independently rechecks the current publication, branch fulfilment, delivery fee, totals, idempotency and atomic per-phone quotas. The signed token is an additional “customer reviewed this exact quote” control; it does not replace database authority.
- Website V3 now requires the returned token before enabling a checkout submit. It keeps the quote token and exact submit body in memory; only a random retry UUID is saved in sessionStorage. Checkout fails closed if secure UUID generation or sessionStorage write/read is unavailable.
- The legacy homepage cart remains redirected to the separate V3 ordering page; the V2 order payload is still rejected.
- GST remains deferred. This work does not add online payment gateway settlement, refunds, tax calculations or tax fields.

## CI evidence

- Website Static Checks [run 45308055860](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45308055860), exact head `520e79e0276bfea205d7a3ebdb2bf6931e947b86`: passed active JavaScript syntax, **103/103 core website/catalog tests**, **25/25 preview tests**, and inline-script parsing.
- Edge Function Static Checks [run 45233268331](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45233268331), exact code parent `38d4501bc8f372eceed0e4316dadd8e7348b4081`: passed Deno checks for all Edge Functions and **42/42 Edge/RPC/pricing/quote-token tests**. Quote tests cover canonical binding, no raw PII, stale totals, exact expiry boundary, tampering, missing tokens/secrets and invalid DB time.
- The earlier Website Static Checks failure on `31bfc13ec5e50ce4100de9a697d50750867a3d7d` was a bad test regex expecting the old random UUID expression. The assertion was corrected in the current head, and run 45308055860 passed.

## Required before deployment — not yet configured or deployed

1. Configure a separate random `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` (minimum 32 bytes) in Supabase Edge Function secrets. Never commit it or expose it to the browser. The Order API intentionally returns 503 for quote signing until this secret exists.
2. Reconcile and apply the already-tested operational/order/delivery/payment migrations to the target Production project in the separately reviewed rollout stage. Production still lacks operational order/delivery/payment tables/RPCs and the Order API deployment.
3. Complete the website delivery-area/default-fee configuration, enable branch website ordering only after the required operational data is correct, and run the complete Edge HTTP/browser checkout verification before launch.
4. Deploy the Catalog and Order Edge Functions and website only after the preceding prerequisites and explicit release review. No deployment occurred in this checkpoint.

## Safety boundary

This checkpoint is source code plus CI only. No Supabase Production SQL/migration/secret change, Edge Function deploy, Vercel deploy, Realtime activation, branch order enablement, catalog publication or checkout activation occurred. `main` was not changed. Flame Chick remains a pre-launch build, not an operating restaurant system.

## Next step

Build an end-to-end disposable checkout verification harness around the actual Order API routes: quote issuance, stale/expired/tampered quote rejection, idempotent retry, current-publication change, delivery fee revalidation, and the 3/minute, 3/10-minute, 15/hour phone quotas. Keep all test data synthetic and rolled back. Then review deployment prerequisites separately.

---

# CURRENT CHECKPOINT — 2026-11-23 17:55 PKT — delivery command candidate and behavioral QA

**Active branch:** `work/production-source-audit`  
**Latest source commit before this handoff update:** `182e8aa6aa43dda6e73b7ae4e9a1f4396b2aac0d`  
**Production and `main`: untouched.**

## Completed source work

- Delivery schema V1 and offer identity guard are in the migration history.
- Added candidate migration `20261123172000_flame_chick_delivery_commands_v1.sql`:
  - service-only command RPCs for targeted assignment, Rider accept/decline, pickup, delivered, reject-before-pickup, failed delivery, Rider return report, staff physical-return confirmation, and bounded lazy expiry;
  - locks task/offer/profile rows to serialize competing actions;
  - validates active Flame Chick role/profile and branch scope through the restricted staff-role projection;
  - creates exactly one targeted offer with database `offered_at + 60 seconds`;
  - no automatic rider rotation; staff must manually select a new rider;
  - preserves offer/assignment/event/order histories; payment ledger is not changed;
  - delivered completes order/task and releases Rider; failed report leaves order non-delivered; staff confirmation marks order/task returned and releases Rider;
  - RPC EXECUTE grants are service_role-only; helper functions remain private.
- Updated Delivery Edge Function to pass request IDs, map command error envelopes/statuses, and lazily expire due offers when POS dispatch is loaded.
- Added disposable behavioral fixture `supabase/tests/flame_chick_delivery_commands_v1.sql` for:
  - wrong-rider offer rejection;
  - idempotent accept;
  - pickup and delivered;
  - targeted staff assignment;
  - failed delivery and Rider return report;
  - Rider cannot confirm physical return;
  - Manager confirmation and retry;
  - unchanged payment ledger and order/task audit.
- Added this fixture to the Staff Admin/operational QA workflow.

## CI status

- Delivery Edge Function Static Checks: passed on `0d2695c...`.
- Admin Static Checks: passed on `0d2695c...`.
- Full disposable migration/catalog replay and previous structural/role boundary checks passed on `9e87504...`, including the new command migration.
- New behavioral workflow run `45176716756` on `182e8aa...` is in progress. **Do not claim the delivery behavior fixture passes until this run completes.** Inspect the exact failing step/log and repair any fixture or SQL issues before proceeding.

## Next steps

1. Finish/repair run `45176716756`.
2. Re-run the updated workflow on the final migration/fixture commit and verify rollback of synthetic identities and tenant.
3. Add adversarial expiry boundary and concurrent accept-vs-decline/expiry tests.
4. Update POS dispatch UI for return-confirm permissions and returned/cancelled queue behavior only after verifying the current UI handler wiring.
5. Update Rider/Edge API idempotency keys and response handling as needed; keep Rider flow **Accept offer → Picked up → Delivered**. No restaurant-arrival step.
6. Then perform a source integration review of POS/Rider/Order APIs. Production migration, Edge Function deploy, Vercel deploy, Realtime enablement, checkout activation and catalog publication remain gated and have not occurred.

Catalog Publication #2 and Option 1 product/variant-linked deal model remain unchanged. GST remains deferred.
---

## LATEST CHECKPOINT — 2026-11-23: production integration audit completed

**Audit report:** [docs/handoffs/2026-11-23-production-integration-audit.md](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/blob/work/production-source-audit/docs/handoffs/2026-11-23-production-integration-audit.md)

**Result: NO-GO for full production deployment.** The read-only audit is complete. Supabase is healthy and the catalog schema/authoring foundation is applied, but this is not yet an end-to-end live system.

Critical verified blockers:
- Production has no order/delivery/rider tables or required order/delivery RPCs; those APIs are not deployed.
- Production public catalog RPC is the old version without `databaseNow`; repository migration candidate `20261122174500_flame_chick_catalog_database_time_metadata_v1.sql` is not applied. Its exact-source/security preflight SHA matches live Production.
- Only `flame-chick-staff-admin` version 1 is deployed. Repository catalog actions are not in that deployed version.
- Website homepage still loads V2 catalog client and has old hardcoded menu mapping/fallback. V3 is only on the separate synthetic/non-ordering preview page.
- Current POS/Rider clients query old role/table shapes directly; production intentionally has no app-role table grants and uses `user_roles.role_key`, not `role`. Order/delivery data tables do not exist.
- POS has unfiltered delivery offer/assignment Postgres Changes subscriptions; Rider uses Postgres Changes and a two-minute Edge Function heartbeat. No business Realtime tables or private-message policies exist.
- No Storage buckets exist; leaked-password protection is disabled.
- Connected Vercel workspace exposes only HFP team `fahad-7455`, with no Flame Chick projects. Do not deploy Flame Chick there; reauthorize the intended Flame Chick Vercel team.

No production SQL write, migration, seed, Auth change, Storage/Realtime setup, Edge Function deployment, secret change, Vercel deployment, domain/alias change, menu publication or checkout activation was performed. Documentation-only commits were made on `work/production-source-audit`; `main` remains untouched.

**Time expectation:** A safe full-system deployment cannot be completed within three hours from this audited state. The missing order/delivery backend, client migrations, end-to-end tests, new menu input, and release/recovery setup are substantive implementation phases. Do not shortcut them or deploy partial functionality as if it were complete.

**Next action:** proceed with source-only implementation starting at the catalog timestamp/credential contract, then V3 storefront integration and order backend; build delivery/POS/Rider and full release gates afterward. Production changes remain separately gated by explicit approval.

---


## LATEST OVERRIDE — 2026-11-23: newly published menu is now the target catalog

The user has clarified an important change in the restaurant's menu plan:

- Previously, the restaurant had two menus: one already running and a second/upcoming menu.
- The restaurant has now published the previously upcoming menu.
- **The newly published menu is now the authoritative/current menu to implement for Flame Chick.**
- The formerly running/older menu is superseded for operational catalog purposes. Do not import it, use it as a fallback, merge it into the new catalog, or treat its old-only items as products to retain in the target menu.
- The 2026-11-21 current-vs-upcoming comparison and menu reconciliation remain useful historical records of what was known then, but their old distinction ("current menu = compatibility baseline; upcoming menu = future target") is superseded by this update. Do not treat that comparison as the final authoritative content of the now-published menu.
- The user will provide the actual new published catalog/menu material when the project reaches the stage where catalog details must be entered/seeded. Do not ask for it prematurely or reconstruct the target menu from the old menu, historical screenshots, synthetic preview fixture, or legacy hardcoded website data.
- Until the user supplies the new menu, do not seed menu rows, create guessed catalog values, publish a catalog, or enable ordering. Keep the production catalog empty. The V3 schema/preview remains structural work only; its synthetic sample is not restaurant data.
- When menu entry is next required, use only the newly supplied published menu as the source, then reconcile exact names, categories, variants, prices, modifiers, deal choices, schedules and unresolved facts before any controlled data-entry plan. Do not silently carry over assumptions from the older reconciliation.

### Latest CI verification — 2026-11-23

GitHub Actions **Flame Chick Website Static Checks**, run [45116517717](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45116517717), completed with conclusion **success** on branch `work/production-source-audit`, exact head commit `96c44121eececa3d7947a406ad5d21a35f6bbe41`. The `static-checks` job succeeded, including active JavaScript syntax, core catalog regression tests, V3 preview regression tests and website inline-script parsing. This is source CI only; it is not a live catalog integration test or release/deployment approval.

No catalog was added to Supabase, and no production deployment or production write was performed as part of this check or handoff update.

---

**Purpose:** This file is the compact, current entry point for the next ChatGPT conversation. Read it together with the root `PROJECT_HANDOFF.md`, which holds the longer project history, architecture decisions, schema contracts, security posture, and previous approvals. Do not restart the project or ask the user to repeat information already recorded there.

**Current stopping point:** The isolated V3 synthetic catalog preview has passed its full local test suite and the user-facing smoke tests. The agreed next work is a read-only production catalog integration audit. No production deployment or Supabase write was performed in this session.

## 1. Exact source identity — do not guess or abbreviate

- GitHub repository owner: `itsfahadahmed1234-creator`
- Repository: `flame-chick-platform`
- Exact repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Active working branch: `work/production-source-audit`
- Default branch: `main` — **leave it untouched** unless the user explicitly authorizes a change.
- Verified archive/source commit: `95fca5b825ff05d88899b4d13855a95f1e0f850e`
- Commit message: `test: isolate optional and required deal group mappings`
- Source archive link: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/archive/95fca5b825ff05d88899b4d13855a95f1e0f850e.zip
- GitHub Actions run for that exact commit: [Flame Chick Website Static Checks — run 45107009218](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45107009218). GitHub run metadata verified: branch `work/production-source-audit`, head SHA exactly `95fca5b825ff05d88899b4d13855a95f1e0f850e`, status `completed`, conclusion `success`.

**Critical spelling guardrail:** The owner slug contains `itsfahad + ahmed + 1234-creator`. Never use shortened or guessed variants. Before GitHub writes, verify the exact full repository and fetch the current file from the exact working branch; use the returned blob SHA. Do not write to `main`.

## 2. Exact local folder and preview command

The user extracted the verified commit archive into this folder:

```text
C:\Users\fahad\Music\flame-chick-platform-95fca5b825ff05d88899b4d13855a95f1e0f850e\flame-chick-platform-95fca5b825ff05d88899b4d13855a95f1e0f850e
```

The user's Command Prompt was left inside that folder after running the tests. From the repository root, the local-only preview server is started with:

```cmd
node ".\\scripts\\local-catalog-preview-fixture.mjs"
```

Open:

```text
http://127.0.0.1:4179/catalog-preview
```

This is a **local synthetic fixture**, not the live Supabase catalog. The local harness is deliberately bound to IPv4 loopback and uses synthetic fixture data; it does not make production catalog requests, create orders, write to Supabase, or deploy anything. Keep the older Downloads project folder as a backup; do not continue work in the old, out-of-sync extracted folder.

There is no `package.json` at the root. Use Node's built-in test runner directly; do not invent npm scripts or create a package file just to run tests.

## 3. Latest verified results — 2026-11-23

### Full automated test suite

From the new Music-folder archive root, the user ran:

```cmd
node --test
```

Final output:

- `# tests 136`
- `# pass 136`
- `# fail 0`
- `# cancelled 0`
- `# skipped 0`
- Duration approximately 1.66 seconds.

The matching GitHub Actions Website Static Checks workflow also completed successfully on the same commit (run 45107009218). This is the source snapshot to use for continuation.

### Browser smoke tests in the new archive

The user confirmed all of the following in the local synthetic preview:

1. Preview server opened and catalog items displayed.
2. Clicking **Reload catalog** caused the catalog items to appear again; branch/fulfilment selection and preview rendering recovered.
3. **Pickup** displayed the menu items.
4. Burger Meal deal validation succeeded with the Regular variant, Classic Burger — Regular, Cola — 500 ml, and optional Extra Cheese omitted.
5. Successful message: “Deal choices validated locally. No quote was requested and no order was created.”

The deal configurator's required-choice behaviour was also tested: incomplete required selections kept validation disabled. Extra Cheese is optional and can be omitted.

### Important older-folder mismatch

The older Downloads-folder copy produced 125 passes and 10 failures when the user ran `node --test`. Its tests/fixtures were out of sync with the current source snapshot. The user then extracted commit `95fca5b...` into the Music folder and the matching suite passed 136/136. **Do not try to patch the old folder's 10 failures or mix files between the two folders.** Continue only from the Music-folder archive / matching working-branch source.

## 4. What this preview milestone does — and does not — prove

The new standalone page is a non-ordering V3 catalog preview. It renders catalog products/deals from the validated synthetic V3 fixture, supports branch/fulfilment selection and Reload, and validates deal selections locally. It deliberately has no add-to-cart, checkout, quote, or order submission flow and does not compute authoritative totals.

A `noindex` directive is not access control. Do not describe this page as a protected Admin preview or enter secrets into it. Preview deployment was not enabled. The existing customer storefront and its hidden-menu safety gate were not changed by this preview work.

**Do not confuse these successful synthetic tests with a live Supabase integration test, production readiness, or a deployment approval.**

## 5. Project invariants and user-approved decisions to preserve

Read the root `PROJECT_HANDOFF.md` for full evidence and history. These are the critical operating constraints:

- Flame Chick is the active project. Pizza Bite is legacy/reference material only; do not import old Pizza Bite menu/configuration into Flame Chick.
- The operational website menu must be database-driven. Categories, products, variants, prices, modifiers, deals, schedules, branch availability and fulfilment rules must come from the current immutable published V3 catalog. Do not hardcode operational product/menu/pricing data in website source.
- Admin/Owner author draft catalog changes through secure database commands. Publication produces an immutable snapshot. The public website reads only the current published snapshot; no draft-table or legacy/hardcoded fallback.
- Browser-displayed prices are informational only. A trusted server-side quote/order API must independently validate publication/version, stable IDs, branch, fulfilment, availability, schedules, modifiers/deal rules and recalculate every amount. No browser-calculated total is authoritative.
- Never expose the Supabase secret/service key in a browser, website bundle, POS or Rider app. Public clients use only the publishable/anon key as appropriate; privileged operations use authenticated server-side code and database authorization.
- RLS remains deny-by-default. Do not loosen table grants or policies for legacy UI compatibility. Every command must verify actor/tenant/branch/role in the database, use atomic transactions, revision/idempotency protections and audit where specified.
- Admin and Owner are separate restaurant-wide full-authority roles. The user's Admin account is the Admin identity; do not assign Owner to that account. A separate Owner identity is to be added later. Manager, Cashier and Rider remain branch-scoped with their previously defined restrictions. Preserve the detailed matrix in `PROJECT_HANDOFF.md`; never broaden operational-role permissions.
- Keep the Supabase Flame Chick project on Free tier and Mumbai `ap-south-1`. Do not upgrade, create another project, migrate region, or incur paid services without explicit approval.
- GST is deliberately deferred. Do not add GST rules or make assumptions about inclusive/exclusive display without explicit owner confirmation.
- Website order rate limits are a Website-only concern and must be enforced atomically server-side at the approved limits recorded in `PROJECT_HANDOFF.md`. Do not impose those Website limits on POS orders.
- Do not seed guessed menu values or resolve unresolved deal choices, time windows, product attributes, portion/volume facts or TBD prices by assumption. Use the current menu reconciliation documents in `docs/handoffs` and ask only when a genuinely unresolved owner decision blocks the next step.
- Protect production: no migration, seed, Edge Function deploy, Vercel deploy, domain/alias change, menu publication or checkout enablement without a separate review and explicit approval. Do not infer approval from a successful local test or CI run.

## 6. Agreed next task: read-only production catalog integration audit

The conversation stopped immediately before this audit. Start here; do not jump to deploying or wiring checkout.

1. Re-read this handoff and the root `PROJECT_HANDOFF.md`, especially the source/schema reconciliation, V3 public catalog client, catalog Edge Function, publication compiler/validator, current database migration state, security constraints and outstanding menu facts.
2. Verify the exact current branch head and working tree/source snapshot. Use only `work/production-source-audit`; keep `main` untouched. The local Music archive is pinned to commit `95fca5b...`.
3. Audit the complete catalog read path from database to browser: publication tables/current pointer → compiler/hash validation → read RPC → catalog Edge Function → health/catalog metadata → V3 browser client → contract validator → branch/fulfilment selector → product/deal view-models → UI.
4. Read the live intended Flame Chick Supabase project **read-only** to confirm current migration ledger, deployed functions, published catalog pointer and actual schema/security state. Do not perform writes. Do not assume historical handoff values are still current without re-checking.
5. Compare actual request/response DTOs and schema versions end-to-end. Identify exact gaps, stale code or integration risks. Verify that no legacy V2/hardcoded menu fallback can become visible and that errors/unpublished state fail closed.
6. Produce a small evidence-backed findings/gap list and a sequenced implementation plan. Do not start production modifications until the audit is complete and reviewed.

### Upcoming controlled phases after the audit

- **Catalog authoring and publication:** secure Admin/Owner catalog command RPCs, atomic draft mutations, optimistic revision checks, idempotency, audit trail, schedule/deal validation, immutable snapshot compiler, current-publication pointer, role/branch checks and Admin UI integration. Keep catalog editing/publishing disabled until the command path is complete.
- **Public catalog integration:** reconcile the V3 client and Edge Function DTO with the applied schema; connect the existing website to the published catalog behind a disabled-by-default gate; branch/fulfilment selection, dynamic products/variants/modifiers/deals/schedules, media handling and robust fail-closed loading. Do not expose the menu or replace the legacy hidden-menu guard until end-to-end tests and explicit approval.
- **Order and quote API:** server-side authoritative pricing, deal/modifier validation, atomic quote/submit, idempotency, cancellation/audit, and Website-only atomic rate limits. POS must use its own permitted path and not be subject to Website guest limits.
- **POS, delivery and Rider:** implement missing order/delivery/Rider schema and atomic commands; secure rider offer assignment/isolation, return/failure confirmation, and event lifecycle according to the existing architecture. Rider can only access their own assigned offers.
- **Realtime:** private branch-scoped POS topics and private per-rider topics, authenticated authorization, minimal event payloads and client refetch; no unfiltered Postgres Changes or frequent polling. Respect Free-tier message/connection/egress limits.
- **Staging and release:** disposable migration-chain and recovery rehearsal, RLS/ACL/tenant isolation, role-boundary, idempotency/race, DTO contract, browser, reconnect and end-to-end tests; then separately reviewed backup/release plan and explicit approval before any production changes.

## 7. How the next assistant should work

- Treat this file as the latest session state, and the root `PROJECT_HANDOFF.md` as the long-form project source of truth. Older entries are history; apply the newest dated/explicit override where notes differ.
- Do not claim to have inspected or changed the user's local files unless the user provides output or an available tool verifies it. Do not claim a production change happened when only a synthetic preview or static test was run.
- Be meticulous with repository, branch, file paths, source versions and commands. Verify before issuing a copy/replace command. Never give a command with a guessed nested folder path.
- The user prefers concise, step-by-step guidance: one concrete action/command at a time, then wait for the result. Avoid repeating already completed steps, typo-prone commands and unnecessary downloads.
- If a command fails, diagnose the actual path/context first; do not ask the user to repeat details already provided.
- Do not ask the user to re-explain the project. Begin by acknowledging this exact checkpoint and proceed with the read-only catalog integration audit.

**Current status at handoff:** 136/136 local tests passed; GitHub Actions run 45107009218 passed on commit `95fca5b...`; local synthetic Reload/Pickup/deal preview smoke tests passed; production catalog integration audit not yet started; no production/Supabase write or deployment occurred in this session.


## LATEST MENU DECISION OVERRIDE — 2026-11-23


Apply these decisions over any older handoff statements:

- Whole Chicken Broast consists of three **separate products**, not flavour variants: Simple Injected Rs.2,499; Nashville Rs.2,699; Cheetos Butter Rs.2,799.
- GST system is deferred. Do not build tax schema/fields, rates, calculations, rounding or checkout tax logic. The previously requested GST notice under the large MENU heading is display copy only; it does not authorize a GST system.
- Deals: Flame Hour Injector + Rs.120 Cold Drink Rs.699; Flame Hour Quarter Broast + OG Crunch + Rs.120 Cold Drink Rs.1,599; Flame Duo 2 OG Crunch + Quarter Broast + two Rs.120 Cold Drinks Rs.2,099; Flame Feast Half Broast + 3 OG Crunch + restaurant-managed 1L drink Rs.3,599; Mini Flame 6 Classic Nuggets + deal-only Fries + restaurant-managed Juice Rs.399; Little Crunch 6 Classic Nuggets + OG Crunch + deal-only Fries + Rs.120 Cold Drink Rs.999.
- No burger substitution choices in deals. Kids deals use Classic Nuggets. Fries, juice and Flame Feast's 1L drink are deal-only components, not standalone priced products.
- Platter Rs.1,499; leave description blank for restaurant completion. Mini Flame juice and Flame Feast 1L drink details remain restaurant-managed.
- Flame Hour runs daily 3:00–5:00 PM Asia/Karachi. Outside the window keep it visible but grey/disabled, including in its popup; do not hide it.
- The Smash is one product with required popup choice Single Patty Rs.799 or Double Patty Rs.999.
- Preserve production safety: these are catalog design decisions only. Do not write catalog data, publish, deploy, enable ordering or implement GST without separate review and approval.


## CURRENT MENU OVERRIDE — 2026-11-23: approved deal labels, separate broast products, GST deferred

The detailed specification is `docs/handoffs/2026-11-23-newly-published-menu-catalog-spec.md` (commit `e519e42d19978f845fba93d93b992073dcc73902`). It is the menu-preparation source of truth for the newly published menu and supersedes any conflicting earlier menu assumptions.

Latest user decisions:
- Deal descriptions and customer-facing deal component labels must use generic **"Burger"** wherever the deal wording says Burger. Do not replace the printed generic label with "OG Crunch". The fixed internal product mapping remains OG Crunch for Flame Hour's Quarter Broast + Burger, Flame Duo (2 Burgers), and Flame Feast (3 Burgers); there are no selectable burger choices. Little Crunch explicitly names OG Crunch and retains that name. Flame Hour's first deal explicitly uses The Injector.
- Whole Chicken Broast contains three separate products: Simple Injected (Rs. 2,499), Nashville (Rs. 2,699), Cheetos Butter (Rs. 2,799). Do not model them as flavour variants of one product.
- The Smash is one product with required Single Patty (Rs. 799) / Double Patty (Rs. 999) product-popup variant selector.
- GST system is explicitly deferred. Do not add GST schema, calculations, tax inclusion logic or checkout tax processing. No GST work should block menu/catalog preparation.
- Flame Hour runs daily 3 PM–5 PM Asia/Karachi. Outside the schedule it remains visible and greyed out; customers may open read-only details, but all ordering actions are disabled. Trusted backend must independently enforce schedule.
- Kids deals use Classic Nuggets. Mini Flame Juice is restaurant-supplied; Little Crunch drink and Flame Duo drinks are the Rs. 120 Cold Drink. Flame Feast 1L drink is restaurant-supplied and deal-only. Fries and Juice are deal-only; no standalone products/prices or portion selectors.
- Platter remains Rs. 1,499 with blank description until restaurant supplies it.

The V3 deal schema links each component option to an internal product/variant and has a customer-facing `dealComponentGroups.nameEn`. For generic Burger components, keep the fixed OG Crunch product binding and set/display the group label "Burger". The current UI still renders productName + variantLabel and requires manual option selection, and it disables the popup when deal.available=false. These are source implementation gaps to fix and test before the catalog can be entered/published: support fixed preselected/locked deal components, generic group labels, and schedule-closed read-only popup details distinct from orderability. Do not weaken backend validation or use browser clock for schedule enforcement.

No production writes, catalog seed, publication, deployments or checkout activation are authorized by these decisions. Keep Production catalog empty until the supplied menu is converted into a reviewed import plan and a separate write approval is given.


## Latest source checkpoint — fixed deal preview rules implemented (2026-11-23)

Detailed menu rules and source changes: `docs/handoffs/2026-11-23-newly-published-menu-catalog-spec.md`.

- Customer-facing generic deal wording remains **Burger**. For Flame Hour Quarter Broast + Burger, Flame Duo (2 Burgers), and Flame Feast (3 Burgers), the published component group label is "Burger" while the exact component option is internally bound to OG Crunch. No burger substitutions or choices. Little Crunch explicitly says OG Crunch and stays named OG Crunch.
- Three Whole Chicken Broast products are separate products, not flavours/variants. The Smash is one product with required Single/Double Patty variants.
- GST system deferred entirely.
- V3 deal view now separates branch eligibility from orderability. A scheduled deal remains visible and grey when out of schedule; its details can open read-only while ordering actions remain disabled. Fixed one-option deal component groups are preselected/locked; generic single-option display uses the customer-facing group label.
- Regression tests cover the new behaviour.

CI [run 45124549443](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45124549443) passed on exact commit `9b3698f0e03f00f5999bf1090d662c70db53b42b` (syntax, core catalog tests, preview tests, inline script parsing).

These changes affect only source and the isolated non-ordering preview. The live customer storefront remains V2/legacy, Production catalog remains empty, and no database write, migration, publication, deployment or checkout enablement occurred. Next: verify required product-popup variant selection and manually smoke-test the preview before any menu import preparation.


## Additional catalog blockers discovered — 2026-11-23

The catalog specification identifies a schema/validator mismatch for deal-only items. Production table constraints allow nullable `product_variants.price`, but the V3 snapshot validator requires every variant price to be non-null and publication validation rejects any active variant with NULL price. Fries, Juice, Flame Feast's restaurant-supplied 1L drink and the 6-piece Classic Nuggets deal portion have no standalone menu prices. Do not invent a zero price. Before catalog entry, make a narrowly scoped source/migration change: allow NULL only for non-standalone variants referenced exclusively by active deal component mappings with INCLUDED pricing; keep standalone variants price-required and reject unreferenced/surcharge/standalone null-price variants. Update validator, publication validation and preview mapping, with tests. No Production migration has been applied.

The current V3 preview displays product variant selection inline on cards, not in a product popup. The required Smash Single/Double popup selection is therefore not yet implemented. Build/test the accessible product detail popup (or approved equivalent) before storefront cutover. The full menu specification records this.

Latest source CI remains run 45124549443 success on `9b3698f0e03f00f5999bf1090d662c70db53b42b`. Documentation commits after that do not change runtime code. Production remains untouched.

## Latest user decision — retain linked deal products (2026-11-23)

**Decision:** Do not use the proposed text-only included-content model. Retain the existing V3 product/variant-linked deal architecture. Any item that appears in a deal but is not a standalone item on the newly published menu must be represented as a **deal-only product** and linked through the existing `deal_component_options` product/variant references.

This is the user's chosen simpler operational model. It supersedes the earlier conversational proposal for a separate text-only included-content structure. Do not create a new text-only deal-content table for this menu.

### Deal-only product rules

- Deal-only items are real internal catalog product/variant records, but they are **not independently sellable** and must never appear as standalone menu cards, standalone search results or customer-selectable products.
- Keep the existing fixed deal component mappings and `pricingTreatment = INCLUDED`. The deal's printed fixed price is the only amount charged. Component prices must not be added to the deal, exposed as individual charges, or used to calculate a second total.
- Do not invent standalone prices or insert Rs. 0 merely to satisfy validation. A deal-only included variant may have a NULL price only after a narrowly scoped, tested source/migration change proves it is non-standalone and referenced exclusively by valid included deal mappings. Standalone variants remain price-required. Reject orphaned NULL-price variants and NULL-price variants used for standalone/surcharge treatment.
- Fixed bundle contents remain preselected and locked. No substitutions or customer-facing component selectors are introduced.
- Keep immutable order snapshots of the resolved component product/variant IDs, customer-facing names and quantities when the future order API is implemented. Do not rely on a live catalog join to reconstruct historical order contents.
- Generic deal wording is not evidence of a specific standalone product. Do not map a generic Burger to OG Crunch just to satisfy the foreign key; create the deal-only Burger product below.
- Deal-only products should be shared across deals only where the restaurant wording and operational identity are the same. Do not guess recipes, brands, flavours or further composition.

### Required mapping for the published offers

**Existing standalone products/variants reused as deal components:**
- The Injector — Flame Hour first offer.
- Cold Drink, the exact menu entry priced Rs. 120 — Flame Hour both offers, Flame Duo and Little Crunch.
- Quarter Broast — Flame Hour second offer and Flame Duo.
- Half Broast — Flame Feast.
- OG Crunch — Little Crunch only, because that deal explicitly names OG Crunch.

**Create deal-only product/variant records (non-standalone):**
- **Burger** — generic burger component for Flame Hour's Quarter Broast + Burger offer, Flame Duo (quantity 2), and Flame Feast (quantity 3). Do not map this product to OG Crunch.
- **Classic Nuggets (6 pcs)** — the six-piece included portion in Mini Flame and Little Crunch. Keep it separate from the standalone Classic Nuggets 12-piece pack; do not represent six pieces as six 12-piece packs.
- **Fries** — included component in Mini Flame and Little Crunch. No size/portion selector.
- **Juice** — included component in Mini Flame. Restaurant decides what is supplied; do not invent a brand/flavour.
- **1L Drink** — included component in Flame Feast. Restaurant decides what is supplied; do not create a standalone drink entry or selectable choice.

The deal quantities stay as printed: Flame Hour first offer (1 The Injector + 1 Rs.120 Cold Drink); Flame Hour second offer (1 Quarter Broast + 1 Burger + 1 Rs.120 Cold Drink); Flame Duo (2 Burgers + 1 Quarter Broast + 2 Rs.120 Cold Drinks); Flame Feast (1 Half Broast + 3 Burgers + 1 1L Drink); Mini Flame (6-piece Classic Nuggets portion + Fries + Juice); Little Crunch (6-piece Classic Nuggets portion + 1 OG Crunch + Fries + 1 Rs.120 Cold Drink).

### Required source/schema work before catalog entry

1. Inspect the actual current migrations, product/variant fields, deal component constraints, catalog write commands, publication validator, compiled snapshot, V3 snapshot validator, view models and preview renderer. Follow the existing architecture; do not invent a parallel model.
2. Confirm the product/variant non-standalone field semantics and ensure deal-only records are excluded from all standalone product surfaces, while remaining resolvable through deal component mappings.
3. Implement the narrow NULL-price rule for deal-only variants with INCLUDED treatment only, consistently in SQL publication validation and the TypeScript snapshot validator. Standalone, orphaned, and surcharge-priced NULL variants must fail closed. Preserve all existing RLS, grants and immutable snapshot guarantees.
4. Keep deal component presentation fixed and customer-friendly. Generic Burger displays as Burger; the Little Crunch component displays as OG Crunch. Included deal components must not show separate component prices or a browser-calculated deal total.
5. Add synthetic fixtures and regression tests for all six offers, checking product IDs, variant IDs, quantities, included treatment, standalone exclusion, NULL-price acceptance/rejection, generic Burger versus OG Crunch identity, and the exact fixed deal prices.
6. No Production SQL, migration application, seed/import, catalog publication, Edge Function deployment, website deployment, or checkout activation is authorized by this decision. These remain separate explicit approval gates. GST remains deferred.

**Current safe boundary:** documentation decision only. The live Production catalog remains empty and unpublished. No database, deployment, or checkout changes were made for this decision.

## Latest pricing and future deal-selector clarification — 2026-11-23

This clarification supersedes any earlier wording that limited nullable deal-only component variants to `INCLUDED` mappings or implied that deal components must always remain fixed forever.

### Core pricing rule

A deal has its own authoritative base selling price. **A component product's normal standalone price is never automatically added to a deal.** The deal variant's component mapping explicitly controls the pricing treatment:

- `INCLUDED`: component is part of the deal at no additional charge, regardless of whether its product variant has a standalone price.
- `SURCHARGE`: add the explicit `unit_surcharge` configured for that option in that deal variant. This surcharge is deal-specific and is not derived from the component product's standalone price.
- `STANDALONE`: use the component variant's own price only where the deal pricing mode permits it (the current validation disallows STANDALONE options in `FIXED_BUNDLE`). Do not use this treatment implicitly.

Therefore, a regular standalone product can keep its ordinary menu price and still be included in a deal at zero extra charge, or have a deal-specific upgrade surcharge. A deal-only product/variant can have no standalone price.

### Product and variant price optionality

- Standalone-sellable active variants must have a price.
- Non-standalone deal-only active variants may have a NULL price (or an optional stored price if a future operational need is established); their product price is not used by `INCLUDED` or `SURCHARGE` deal mappings.
- Publication must fail closed if a NULL-priced active variant is not non-standalone and referenced by an active deal component option with a valid active deal-variant mapping using `INCLUDED` or `SURCHARGE`.
- A NULL-priced variant must never be allowed for a `STANDALONE` mapping. A variant marked standalone-sellable must remain price-required even if it is also used in a deal.
- Do not create fake zero prices. Keep the product editor's optional price input semantics, but implement the narrow matching SQL publication validation and V3 snapshot validator rules. Snapshot schema should accept `price: null` where the database publication rules permit it.
- The customer storefront must exclude non-standalone variants from standalone product cards, while deal component mappings can still reference and render them.

### Current menu versus future configurable selectors

The newly published menu's current deal compositions remain fixed as already approved. Do not add selector choices or surcharges to the current offers unless the restaurant publishes them or the user separately instructs it.

The catalog model must nevertheless support a future Admin-configurable deal selector without a schema redesign. Use the existing deal component group, component option, and per-deal-variant option mapping model:

- Configure a group with quantity bounds for required or optional selection.
- Add the exact allowed product/variant options for that deal only.
- Configure each option's treatment and (where applicable) explicit per-unit surcharge on its deal-variant mapping.
- The Admin can later enable/disable choices, make a group optional/required, and set the upgrade amounts for each deal.

**Illustrative future burger selector** (example only; not current menu authorization):
- OG Crunch — `INCLUDED`, Rs. 0 extra.
- The Injector — `SURCHARGE`, Rs. 50 extra.
- Nashville Fire — `SURCHARGE`, Rs. 100 extra.

In that example, the deal's own base price remains unchanged. The normal standalone prices of OG Crunch, The Injector and Nashville Fire are not used to calculate the bundle; only the explicit deal mapping surcharge applies. The server quote/order API must validate the current publication, selected IDs, quantities, pricing treatments and surcharge amounts, then calculate the authoritative amount. The browser configurator may collect IDs and quantities but must not become a pricing authority.

### Current scope and future work

1. Keep all six currently published offers fixed exactly as approved, with deal-only products where required and existing standalone products reused where explicitly named.
2. Update the publication validator and snapshot validator to allow NULL only for eligible non-standalone variants; allow valid `SURCHARGE` mappings as well as `INCLUDED` mappings for those deal-only variants. Keep the stronger prohibition on NULL-priced `STANDALONE` options.
3. Verify component pricing treatment is preserved in the immutable publication snapshot and is resolved by the trusted server quote/order path. No product variant price should leak into a fixed deal total unless the selected mapping explicitly says `STANDALONE`.
4. Add regression tests covering standalone product reused as INCLUDED, standalone product used with deal-specific SURCHARGE, null-priced deal-only INCLUDED, null-priced deal-only SURCHARGE, and rejected null-priced STANDALONE/orphan/standalone-sellable variants.
5. Add future-selector tests for one required selection and an optional group, including the illustrative burger upgrade mapping. Keep the present menu offers fixed in current catalog data.
6. No Production migration/write, product seed/import, catalog publication, Edge Function deployment, storefront deployment or checkout activation is authorized by this clarification. GST remains deferred.

**Decision meaning:** deal contents remain trackable product/variant references. Product standalone pricing is independent from deal pricing. Future deal-specific choices and surcharges are supported through the existing deal builder, not by adding a second product-pricing system.

## Deal-only product pricing implementation — verified 2026-11-23

The requested source implementation is now complete and passed both website CI and the full disposable Supabase migration-chain QA.

### User-approved current behaviour

- Keep all six deals as fixed, pre-priced bundles with fixed component quantities. The deal variant `base_price` is the bundle price.
- Current component mappings are `INCLUDED`; normal product/variant prices are never added to the fixed deal price.
- No selectable burger/flavour/product alternatives, no optional upgrade controls and no +price choices are enabled now.
- Active standalone-sellable variants must have a price.
- Active non-standalone deal-only variants may have `price = NULL`, but must be referenced by an active deal component and active deal-variant mapping.
- Future explicit `SURCHARGE` is supported by the existing model only as a future capability. It must use its deal-specific `unit_surcharge`, never infer the surcharge from the component's standalone price. The only surcharge use in the current SQL fixture is rolled back during QA; it is not current menu data or a customer-facing selector.
- Generic **Burger** is a separate deal-only product, not OG Crunch. OG Crunch is used only where the published menu explicitly names it (Little Crunch).

### Verified source changes

- `supabase/migrations/20261123150000_flame_chick_deal_only_variant_pricing_v1.sql`: append-only candidate; source guard pins validator/compiler baseline `f179cc3b...` / `1cee9543...`, preserves and verifies SECURITY DEFINER ownership, empty search_path and ACLs, requires standalone prices and active deal mappings for non-standalone variants.
- `apps/flame-chick-website/js/catalog-v3.js`: snapshot `price` is `nullableMoney`; standalone NULL price is rejected; non-standalone variants need a valid active `INCLUDED` or future explicit `SURCHARGE` mapping; `STANDALONE` cannot be used for null-priced/non-standalone variants.
- `supabase/tests/catalog_publication_validation_fixes_v1.sql`: rollback-only fixture proves deal-only NULL-price acceptance, standalone NULL-price rejection, future surcharge compatibility, snapshot null serialization, and rejection when the active deal mapping is removed.
- `tests/catalog-v3-contract.test.mjs`, `tests/catalog-v3-view.test.mjs`, `tests/catalog-v3-deal-view.test.mjs`: cover snapshot constraints, standalone menu exclusion, inclusion price independence and deal popup resolution of null-priced deal-only components.
- `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql` and `.github/workflows/qa-catalog-publication-validation-fixes-v1.yml`: recovery guard updated to recognize the candidate validator source; recovery still verifies the exact original helper baseline after compensation.

### Passing CI evidence

- [Website Static Checks — run 45128810592](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128810592), success. Syntax, catalog contract/client/view/deal tests, preview tests and inline scripts passed.
- [Disposable migration-chain QA — run 45128650772](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128650772), success. Full local migration replay, rollback-only catalog fixture, forward compensation, helper source/security verification, zero residual test tenant, migration ledger count and local stack shutdown all passed.

### Safe boundary and remaining phases

No Production migration was applied. No Production products, variants, deals or publication data were inserted. No catalog was published; no Edge Function or website deployment occurred; checkout remains disabled.

The V3 catalog authoring UI and reviewed data-entry package for the real published menu have not yet been completed. The existing `apps/flame-chick-admin/app.js` still references legacy `deal_components` / `bundle_price` paths and requires product prices; do not use that legacy surface as the V3 deal-only authoring editor. The next safe phase is to integrate the secured V3 catalog command API with the Admin panel, then prepare a synthetic, reviewed draft for all standalone items and six fixed deals. The draft must include deal-only Burger, Classic Nuggets (6 pcs), Fries, Juice and 1L Drink; keep every current deal group fixed with `INCLUDED` mapping. The Smash's required Single/Double popup remains a separate website UI blocker before storefront cutover.

GST remains deferred. Production changes and publication remain separate explicit approval gates.
## Published menu V3 review draft — validated 2026-11-23

A source-only, review-only catalog draft and a synthetic snapshot test suite have been added. **No Production rows have been written.**

### Draft file

ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json

- Status: REVIEW_ONLY_NOT_IMPORTED
- 8 categories (7 menu categories + Deals).
- 25 product records: 20 standalone menu products + 5 deal-only products.
- 28 product variants: 23 standalone variants + 5 deal-only variants.
- 6 fixed-price offers across 6 deal records.
- 18 fixed deal component groups/options/mappings.
- All current deal component mappings are INCLUDED, surcharge = 0.
- The draft uses stable natural keys, not generated database UUIDs. No product or deal is seeded from this file automatically.

Deal-only products: Burger, Classic Nuggets (6 pcs), Fries, Juice, 1L Drink. Their variants are standaloneSellable=false and price=null; each is linked into the appropriate fixed deal. Generic Burger never maps to OG Crunch. Little Crunch maps to the named OG Crunch standalone product.

### Flame Hour model detail

The two printed Flame Hour packages are represented as two separate deal entries under the same deals collection and the same daily Asia/Karachi 15:00–17:00 schedule:
- Flame Hour — The Injector + Cold Drink, Rs. 699.
- Flame Hour — Quarter Broast + Burger + Cold Drink, Rs. 1,599.

Reason: V3 component groups belong to a deal record, not to an individual deal variant. Putting both packages as variants of one deal record would make each variant have to satisfy both package component groups. Separate deal records keep each fixed composition independently valid and orderable, with the same schedule. This creates two clearly named offer cards; it does not introduce a selector.

### Synthetic full-menu validation

- tests/fixtures/flame-chick-published-menu-v3-fixture.cjs creates a deterministic V3 snapshot from the review JSON draft without mutating the draft.
- tests/published-menu-v3-draft.test.mjs verifies the full V3 snapshot contract, 20 visible standalone products vs five hidden deal-only products, standalone prices and variants (including The Smash pricing data), all six exact offer prices and fixed contents, Burger vs OG Crunch product identity, Flame Hour daily schedule and after-hours read-only configurator behavior.
- CI is wired to run the new tests and include the draft/fixture in the path filter.

**Passing CI:** [Flame Chick Website Static Checks run 45129861610](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45129861610), head 9b568bcf98fb7bd55eaca43e744dda142782bc4c, success. All 96 core catalog/preview checks passed, including the new end-to-end published-menu draft suite.

### Current implementation boundary and next phase

The pricing contract and full published-menu review draft are source-tested. The next source implementation phase is to connect the Admin panel to the secured V3 catalog command API. The current apps/flame-chick-admin/app.js still uses legacy deal_components / bundle_price REST paths and product-price-required UI; it must not be used to enter this V3 draft. Inspect the V3 command functions and role checks first, then build an Admin V3 editor that supports:
- standalone products with required prices;
- non-standalone deal-only products with optional NULL prices;
- fixed deal variants with fixed component groups/mappings using INCLUDED only for these six current offers;
- no current selectable +price or product/flavour upgrade options.

After the Admin V3 authoring UI and draft review are complete, add a source-only command/preview test for all six real offers. The Smash's required product popup remains a separate storefront UI blocker. No Production migration, catalog import, publication, Edge Function deployment, website deployment or checkout activation has been performed or authorized. GST remains deferred.

## Catalog V3 Admin authoring workspace — source implemented and CI verified (2026-11-23)

A dedicated V3 authoring page has been added to the Admin source on this branch. It uses only the existing authenticated Staff Admin Edge Function and its finite catalog command allow-list. It does not perform direct PostgREST table writes, use service-role keys in the browser, or expose publish/rollback actions.

### Added source files

- `apps/flame-chick-admin/catalog-v3-admin.js` — product/category/fixed-deal authoring workspace and validation helpers.
- `apps/flame-chick-admin/catalog-v3-admin.css` — responsive workspace styling.
- `tests/catalog-v3-admin.test.mjs` — validation and API-contract regression tests.

### Existing Admin files updated

- `apps/flame-chick-admin/index.html`: Catalog V3 navigation entry, page root, stylesheet and module links.
- `apps/flame-chick-admin/app.js`: Catalog V3 workspace is mounted through the existing signed-in Staff Admin API request path, with current draft revision and per-mutation request IDs.
- `.github/workflows/ci-admin-static.yml`: syntax checks, Catalog V3 tests, static asset and page-wiring checks.

### Security and role boundaries

- Catalog V3 navigation is enabled only after the existing authenticated context returns `actor_role` of `admin` or `owner`. Manager/Cashier/Rider cannot access this screen.
- The workspace's action names are finite and match the allow-listed actions in `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs`.
- Every mutation goes through the existing Staff Admin Edge Function, carrying `expected_revision` and a request ID. The database command functions remain actor-scoped, role-checked, revision-checked, idempotent and audited.
- No generic RPC/table proxy, browser service-role credential, publish action or rollback action has been added.
- The legacy menu/deal REST editors remain separate and must not be used for the V3 draft.

### Current Admin V3 authoring behavior

- Product form supports standalone variants with required prices and deal-only variants with `is_standalone_sellable=false` and optional NULL price. Pack metadata is validated.
- Fixed-deal form supports a deal-owned base price and fixed components linked to exact product variant IDs. Component quantity is fixed in min/max bounds; each component has exactly one option.
- Mapping creation is intentionally fixed to `INCLUDED` with zero surcharge. It does not create selectable alternatives, product/flavour selectors, optional upgrade choices or +price controls.
- Flame Hour checkbox creates/reuses a seven-day Asia/Karachi 15:00–17:00 schedule and assigns it to the new deal.
- A new deal is initially saved inactive. Before activation, the workspace re-reads and verifies the exact deal price, component names/quantities/variant IDs, all active INCLUDED mappings with zero surcharge, and Flame Hour schedule assignment. It then activates the deal and reads it back once more to verify activation. A failure leaves the deal inactive and exposes its ID to prevent blind duplicate creation.
- Deal inspection reads the database's actual `product_name_en` and `variant_label` detail DTO fields.
- This is an initial create/edit product + create fixed deal workspace. It does not yet provide an automated import of the review JSON draft, a deal-edit workflow, or a browser-driven end-to-end smoke test. Use the review-only JSON draft as the source of truth; do not infer content.

### Verification

**Admin Static Checks passed:** [run 45132136238](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45132136238), head `489d42fd5e9627ba2c65a8b8e9a6bd3e1ed5cc02`.
- JavaScript syntax check passed.
- Catalog V3 Admin unit tests passed (nullable deal-only prices, standalone price requirement, pack metadata, fixed groups, INCLUDED-only mapping builder, exact action allow-list and DTO contract, Admin/Owner-only navigation, read-back/activation verification).
- Static asset and navigation/script/style wiring checks passed.

### Crucial deployment limitation and next work

The production/deployed `flame-chick-staff-admin` Edge Function is still version 1, and the Admin app is not deployed with these source changes. This branch work does not make the live Admin page available. Do not attempt to use the new UI against the live site until the updated Edge Function source has a separate review, QA, deployment approval and deployment; then deploy the Admin website only after that review. The current V3 catalog remains unseeded and unpublished in Production.

Next safe source phase: implement a reviewed, idempotent draft-import/authoring workflow for `ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json` using the same finite command API, with preflight/reference checks, safe staged writes, complete read-back and no auto-publication. Keep the six current offers fixed and INCLUDED. Then add a source-only end-to-end synthetic workflow. The Smash popup remains a separate storefront blocker. No Production migration, catalog import, publication, Edge Function deployment, Admin website deployment or checkout activation has been performed or approved. GST remains deferred.

## Resumable published-menu importer — source implementation and Admin CI verified (2026-11-23)

A confirmed, review-only Catalog V3 menu importer is now linked to the Admin V3 workspace. **It has not been executed against Production or any database.**

### Source files

- `apps/flame-chick-admin/catalog-v3-importer.js` — validates the authoritative review JSON, preflights existing identities/conflicts, imports sequentially through finite secured catalog commands, and performs read-back verification.
- `apps/flame-chick-admin/flame-chick-published-menu-2026-11-23.v3-draft.json` — Admin-served copy of the authoritative review draft.
- `tests/catalog-v3-importer.test.mjs` — review draft validation, price/standalone rules, stable identity rules, fixed INCLUDED mapping validation, staged/active deal read-back validation, and a full mocked catalog command API import/resume simulation.
- `apps/flame-chick-admin/catalog-v3-admin.js` — adds the deliberate "Import published menu draft" Admin action, a confirmation prompt, progress feedback and interruption guidance.
- `apps/flame-chick-admin/index.html` — loads the importer before the Admin V3 workspace.
- `.github/workflows/ci-admin-static.yml` — syntax/tests/static asset verification and byte-for-byte comparison of the Admin-served menu JSON against the authoritative draft. Its path filter now includes both Catalog V3 Admin and importer test files.

### Importer safety behavior

1. Validates the exact approved V3 draft (PKR, Asia/Karachi, 8 categories, 25 products, 28 variants, 6 offers, 18 fixed components).
2. Performs read-only preflight of category/product identities, product variant details, target Deals collection and its existing deal identities, and the Flame Hour daily schedule. It stops on unrelated records, duplicate identities, conflicting names, unexpected schedules or mismatched existing product/deal data.
3. Uses stable `legacy_id` values scoped to this published-menu draft for category, product, variant and deal records. Retrying after an interruption re-reads those stable identities instead of blindly creating duplicates.
4. Writes sequentially through only the existing authenticated Staff Admin catalog command allow-list. Every mutation carries the current draft revision and a fresh request ID. No browser direct table writes, service-role key, generic RPC proxy, publication action or rollback action is used.
5. Deal records and their variants are initially inactive. It writes fixed component groups and exact product variant links, writes only `INCLUDED` mappings with zero surcharge, and sets the Flame Hour schedule where needed.
6. It reads the deal back and verifies exact bundle price, variant identity, component names, fixed quantities, linked variant IDs, active mappings, zero surcharge and schedule assignment. Only then does it activate the deal and its fixed-price variant together, then read them back again.
7. An already-active deal on retry is accepted only if it fully matches the approved fixed deal and is order-available. Any unexpected or ambiguous state halts for manual inspection.
8. The Admin button requires explicit user confirmation and describes that the operation writes only to the unpublished catalog draft. It does not publish, deploy, enable checkout or create selectable +price upgrades.

### Verification

**Admin Static Checks passed:** [run 45136997505](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45136997505), head `2a2dca9e2078d88d553b2b0af968beabe4c881f8`.
- JavaScript syntax checks passed.
- All **51 tests passed; 0 failed**.
- The full mock command-API import test passed: creates 8 categories, 25 products, 28 variants, one Deals collection, one daily Flame Hour schedule, six deals/offers and fixed INCLUDED component mappings; a second complete importer pass makes no additional writes and produces no duplicates.
- Static Admin page asset checks passed.
- Admin-served menu JSON matched the authoritative `ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json` byte-for-byte.
- [Admin Preview workflow](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45136997508) was **skipped**; no Admin deployment occurred.

### Current safe boundary

The importer test is a deterministic mock of the finite catalog command API. It is not a live or disposable-Postgres integration test of the complete catalog write sequence. The next verification step before deployment should exercise the actual finite catalog commands against a fresh local/disposable Supabase stack using the full migration chain, run the importer against that isolated database, verify the resulting compiled snapshot and publication validation, and run the importer a second time to confirm database-level idempotent resume. This QA must not connect to Production.

The Production catalog remains empty/unpublished and checkout remains disabled. No migration was applied to Production, no Production catalog data was written, and no Edge Function, Admin website, or customer website was deployed. The current deployed Edge Function/Admin site must not be assumed to contain these branch-only changes. Their deployment requires separate code review, disposable QA and explicit approval. GST remains deferred; the six current deals remain fixed and use INCLUDED/zero surcharge only.

## Real local Supabase Catalog V3 importer integration — passed (2026-11-23)

The review-only menu importer has now passed a real PostgreSQL integration run using the complete migration chain and the actual finite Staff Admin catalog RPC map. This was executed only against the workflow's disposable local Supabase stack.

**Passing run:** [QA Flame Chick Catalog V3 Menu Importer run 45138765293](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45138765293), head `7b6c84218e81c8b24f369c8b1acc92385acf8d08`, conclusion success.

### What the run actually did

- Started a fresh local Supabase stack, installed the hosted-only helper compatibility stub used by previous local QA, and applied the complete migration history with `supabase migration up --local`.
- Created a disposable local tenant and synthetic Admin identity. Each read/write was routed through `buildCatalogRpcCall` from `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs` and invoked as Postgres role `authenticated` with transaction-local JWT subject/role claims. No service-role shortcut was used for catalog commands.
- Ran the importer end-to-end through all 39 progress steps: 8 categories, 25 products (23 standalone variants + 5 deal-only variants; 28 variants total), one Deals collection, one Flame Hour schedule, and six fixed deals/offers with 18 component groups/options/mappings.
- Read back every product and deal and confirmed the six deals and six deal variants were active only after exact component and price verification.
- Verified the generic Burger product and Little Crunch's explicitly named OG Crunch link separately.
- Confirmed 5 nullable, non-standalone deal-only variants and 0 nullable standalone variants.
- Confirmed 2 Flame Hour schedule assignments and 7 daily schedule windows.
- Confirmed 0 non-INCLUDED/surcharge component mappings, 0 publication rows, and no catalog current-publication pointer was changed.
- Compiled the catalog from the database and validated the V3 schema after adding a QA-only publication envelope in memory (checksum is generated by Postgres using the same canonical `jsonb::text` SHA-256 procedure as the publish path; the synthetic publication UUID/number are not written to the database).
- The V3 snapshot contract returned `ok: true`.
- Ran the importer a second time: **0 additional mutations**, unchanged draft revision and row counts. The command idempotency table stayed at 61 records from the first 61 mutations.
- Discarded the local Supabase stack with `supabase stop --no-backup`; cleanup step passed.

### Logged database counts from the passing run

- Categories: 8
- Products: 25
- Product variants: 28
- Deals / deal variants: 6 / 6
- Component groups / options / mappings: 18 / 18 / 18
- Deal-only NULL-price variants: 5
- Standalone NULL-price variants: 0
- Active deals / active deal variants: 6 / 6
- Schedule sets / windows / assignments: 1 / 7 / 2
- Included-surcharge violations: 0
- Publication rows: 0
- First-run catalog writes / reads: 61 / 95
- Second-run mutation count: 0

### Final strict publication-validation gate — passed

The follow-up [local Supabase QA run 45139264349](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45139264349), head `37bd8557be42a6c1e6bfd70896742a24c508d085`, completed successfully.
- Full migration replay passed.
- Real authenticated importer and deal read-back passed.
- Compiled database snapshot passed the V3 snapshot contract.
- SQL publication validator returned `ok: true` with **zero errors**.
- Second full import made **zero mutations** and did not increment the draft revision.
- No publication rows were created.
- Disposable local Supabase stack stopped successfully.

The earlier `45139118409` attempt failed only at the QA script syntax check due a literal escaped-newline formatting typo; the source was corrected before the successful run.

### Safe boundary remains unchanged

This successful real-DB integration was local/disposable only. No Production migration, product/category/deal writes, catalog publication, Edge Function deployment, Admin website deployment, customer website deployment or checkout activation occurred. Production catalog remains empty and unpublished. The Admin import button is source-only and not available in the deployed version until separate review and approval. GST remains deferred; current deals remain fixed and use INCLUDED/zero surcharge only.


## Admin menu-import action integration QA — 2026-11-23

### What was added

- Extended `scripts/qa-catalog-v3-importer-db.mjs` to load the actual `apps/flame-chick-admin/catalog-v3-admin.js` workspace module and invoke its registered Import button handler.
- The test serves the exact review-only JSON draft through a same-origin fetch stub and uses the normal authenticated catalog RPC request handler against disposable local Supabase.
- First interaction dismisses the confirmation; the test asserts **zero catalog mutation RPCs** were issued.
- Second interaction confirms and runs the import through the Admin workspace's actual `importPublishedMenuDraft()` path. Assertions require successful read-back, explicit unpublished state, and confirmation copy stating that publication and selectable +price upgrades are not performed.
- Existing follow-up assertions continue to validate the compiled snapshot, strict SQL publication validator, zero validation errors, exact menu/deal mappings, and retry idempotency.
- The importer QA workflow now includes `catalog-v3-admin.js` as a trigger and verifies the workspace module and `createWorkspace` test hook are present.

### Verification

- Run **45140258871** passed on script commit `2afcb6a3c03e9ccc25a5a2811b44ebce0d6aaaac`. Full migration replay, Admin workspace cancellation/confirmation path, actual authenticated importer, database snapshot validation, strict SQL publication validation, retry idempotency and local stack cleanup all passed.
- The run again observed transient Docker image-registry `toomanyrequests` messages during startup; it recovered and the run passed. This is runner infrastructure rate limiting, not an application/database failure.
- Latest workflow-only commit `afc1540e9ad41738c9d837bc79a4ca4098831d28` passed in run **45140263708**. The complete migration replay, Admin workspace action integration, authenticated importer, snapshot contract, strict SQL publication validation (zero errors), idempotent retry and disposable-stack cleanup all passed. The only later commits are documentation updates.
- This is a **module-level workspace interaction test with a mocked root element and same-origin draft fetch**, not a full Chromium/real-browser E2E test. Browser rendering/navigation and a real authenticated Admin session remain separate QA work.

### Current safe boundary

All Admin action and database integration checks above target disposable local Supabase. No Production catalog writes, Production migration, publication/current-pointer change, Edge Function deployment, Admin or customer Website deployment, Vercel domain change, or checkout activation occurred. The only Git writes were to `work/production-source-audit`; `main` was not written. Current deals remain fixed-price with INCLUDED/zero-surcharge mappings; selectable product/flavour upgrades and +price charges remain future-only. GST remains deferred.


## Catalog V3 authoring and product-detail UX implementation — 2026-11-23

### Admin Catalog V3 authoring changes

- The existing V3 Admin workspace now supports editing menu/deal categories through the authenticated `catalog_category_upsert` command. Category kind is immutable in this editor; no direct PostgREST writes were introduced.
- Product create/edit continues through the finite authenticated product command and supports optional standalone price only when `is_standalone_sellable=false`.
- Existing fixed deals can now be edited through a dedicated `deal-edit` action. The editor only accepts the currently approved shape: one `FIXED_BUNDLE` deal variant, one product-variant option per active component group, fixed quantities, `INCLUDED` mapping and zero surcharge.
- Fixed deal edits preserve deal, variant, group, option and mapping IDs for retained records. Removed groups/options/mappings are retained but marked inactive; records are not deleted.
- Edit workflow: read current detail and capture draft revision; reject stale revisions; temporarily deactivate deal and variant; update fixed component groups; read the deal back; rebuild INCLUDED/zero-surcharge mappings including deactivation of removed mappings; preserve or change the supported Flame Hour global assignment; verify the inactive deal contents; restore its prior active state and prior availability; read back and verify again. Any error leaves a visible partial-operation warning with the exact deal ID/stage; it does not create a replacement deal.
- The edit form deliberately preserves the active state and lets the user change availability. It does not expose selectable flavours, product alternatives, surcharge fields or future `+Rs.` upgrades.
- Deal editing fails closed for non-fixed variants, selectable/variable groups, surcharge mappings, multiple/branch-specific schedules, or a schedule other than the exact currently approved Flame Hour schedule.
- Deal creation now fails closed when duplicate `Deals` categories/collections or duplicate `Flame Hour daily` schedule names exist. A pre-existing Flame Hour schedule must match exactly seven weekly windows, Monday–Sunday, 3 PM–5 PM, `Asia/Karachi`; the editor will not silently create a second schedule to bypass a conflict.

### Customer-facing V3 product detail preview

- The separate non-ordering V3 catalog preview now opens product details in an accessible `<dialog>`, rather than rendering the variant selector inline on each product card.
- Multi-variant products expose their product-variant selector inside the detail dialog. This supports the published The Smash Single Patty / Double Patty price choice in the correct product detail context.
- Single-variant products select their sole variant automatically in the dialog.
- Published option price and any published customization descriptions are shown individually. The preview does not calculate a cart subtotal/final checkout total, add to cart, quote, or submit orders.
- The preview dialog closes when branch/fulfilment context changes or the catalog reloads. The preview remains a separate no-index page and is not wired into the active V2 customer storefront.

### Verification

- Admin Static Checks run **45142741892**: 58 tests passed, zero failed; Admin asset/invitation wiring checks passed.
- Disposable local Catalog Importer QA run **45142711936**: complete migration replay passed; 25 products, 28 variants, 6 fixed-price deals and 18 component groups/options/mappings imported; snapshot valid; SQL publication validator returned zero errors; retry created zero further mutations; the no-op Flame Duo edit executed through the actual Admin workspace with 4 authenticated catalog mutation RPCs, preserved price/contents/availability/active state and left strict publication validation passing; publication rows remained zero; disposable stack cleanup passed.
- Later disposable local Catalog Importer QA run **45142711936** also applied the latest deal/schedule conflict guards and completed with success.
- Website Static Checks run **45143263591** passed: syntax, core catalog regression tests, preview regression tests and inline-script parsing.
- Earlier Admin/Website workflow attempts with failures were corrected; use the successful latest runs above as the current evidence. Deployment workflow jobs remain skipped by their explicit release gates.

### Remaining product work / release boundary

- The Admin workspace and V3 product-detail dialog are source changes. Neither the Admin preview nor customer Website preview was deployed; the deployment workflows were intentionally skipped.
- The product-detail dialog is on the separate read-only `catalog-preview.html` path, not yet the active customer storefront. The active `index.html` still has its old V2/static product/order contract.
- The current production order API/schema is not deployed/complete. Do not connect the old cart to V3 or enable customer ordering until server-side quote/pricing, order create, idempotency, availability, cancellation and delivery contracts are implemented and tested.
- No browser-based live Admin sign-in/E2E session has been run. Current Admin integration QA calls the actual workspace handlers with a mocked DOM root and a real disposable Supabase database.
- Production catalog remains empty and unpublished. No Production migration, catalog import, publication/current pointer change, Edge Function deployment, Vercel deployment/domain change or checkout activation was performed.
- The only source/documentation writes were on `work/production-source-audit`; `main` was not modified.
- Current deals remain fixed-price with INCLUDED/zero-surcharge components. Selectable deal products/flavours and +price upgrades remain future-only. GST remains deferred.


## Latest continuation — API wiring and two-hour release readiness (2026-11-23)

User clarified that Website, Admin, POS and Rider are already substantially built; do not rebuild them. Focus on existing API connections, authentication/branch context and small fixes.

### Latest source integration on `work/production-source-audit`

- Production `user_roles` uses `role_key`; Order/Delivery API reads have been corrected to that field.
- POS gets its caller's role and branch from authenticated `flame-chick-order-api?view=staff_context`.
- Rider gets its own active profile from authenticated `flame-chick-delivery-api?view=profile` and checks roles through the same staff context API.
- POS browser no longer reads operational orders/delivery/rider tables directly; order board, history/status and dispatch use authenticated Edge API requests.
- Delivery dispatch API derives caller branch from active `role_key` and rejects a mismatched caller-supplied branch.
- Rider multi-branch ambiguity fails closed; no silent branch selection.
- Removed obsolete browser-side direct PostgREST/RPC helper functions from POS and Rider.
- Preview workflows use the verified Vercel project/team IDs, but preview gates remain disabled until GitHub Environment secret/vars are configured.

### Latest CI evidence

- POS/Rider Static Checks #16 passed, including API-only reads, explicit delivery-selection payloads, and missing-vs-zero area-fee handling.
- Website Static Checks #144 passed, including delivery selection and missing-vs-zero fee checks.
- Admin Static Checks #82 passed.
- Edge Function Static Checks #40 passed.

The current exact release report is `docs/handoffs/2026-11-23-two-hour-release-readiness.md`. The Vercel target document is `docs/deployment/vercel-github-actions.md`.

### Production state rechecked (read-only)

- 24 migrations through `20261122105821`.
- Catalog tables exist but categories/products/variants/deals/publications/current publication all have zero rows.
- Website ordering/delivery/pickup flags are false.
- Only `flame-chick-staff-admin` Edge Function version 1 is deployed; Catalog/Order/Delivery APIs are not deployed.
- Operational tables are absent: orders, order_items, order_status_history, payments, delivery_areas, delivery_tasks, delivery_task_offers, delivery_assignments, delivery_task_events, rider_profiles and rider_push_subscriptions.
- Realtime has no published tables; Storage has no buckets.
- Vercel has four correct project records and repository links, but no deployments or custom domains. SSO is enabled. Preview workflows skipped due missing GitHub deployment secret/enable variables.

**Release assessment: NO-GO for full operational deployment until the additive operational schema/RPCs are implemented and tested, the current Edge Functions and Catalog V3 Staff Admin code are deployed with verified secrets/CORS, catalog is imported and published after review, and live browser E2E is passed.** No Production DB writes, migration, import/publication, Edge Function deployment, Vercel deployment, domain change, checkout activation or paid-plan upgrade occurred in this sprint. `main` remains untouched. GST remains deferred; future deal selectors/+price choices remain future-only.


---

## 2026-11-23 — Operational schema V1 candidate added (source only; not applied)

**Working branch:** \`work/production-source-audit\`  
**Latest source commit at this checkpoint:** \`8c024c24a1b5eacbd4f3e2f247a333e7171e6cbe\`  
**Migration:** \`supabase/migrations/20261123160000_flame_chick_operational_schema_v1.sql\`  
**Disposable QA:** \`supabase/tests/flame_chick_operational_schema_v1.sql\`  
**Workflow:** \`.github/workflows/qa-staff-admin-role-boundary.yml\` now includes the new QA test path and runs it after the complete local migration replay.

### Corrected live Production baseline — use this instead of older zero-catalog statements

Read-only checks on 2026-11-23 confirm:
- Supabase project \`adkrxfnawdiljhjaavnj\`, Mumbai \`ap-south-1\`, Free plan, healthy.
- Current catalog publication **#2**, schema V3, revision 92, checksum \`8062b1961ee2c9e7668ed4039c9d2396c0fe66a7571a2591b1146eea113913c5\`.
- Publication contains 8 categories, 25 products, 28 product variants, 6 deals, 6 deal variants, and the linked deal component/options/mapping structures.
- Deal model decision is **Option 1**: actual product/variant UUID links. Deal-only product variants stay non-standalone and may retain NULL standalone price when correctly mapped. Do not introduce a text-only included-item table.
- Catalog publication and its source records must be preserved. Do not reimport or republish the menu as part of operational schema work.
- Existing production migration ledger includes the catalog V3 and deal-only pricing work; operational tables are still absent.
- Website order/delivery/pickup flags remain disabled. Only \`flame-chick-staff-admin\` is deployed (older v1); Catalog/Order/Delivery functions are not deployed.
- No operational business tables are present; no operational tables are registered in \`supabase_realtime\`; no Storage buckets were configured.

### What the candidate migration adds

- Branch delivery areas and typed Not Listed fee settings. Missing fee stays NULL; explicit Rs. 0 is a valid configured amount. No default-to-zero behavior.
- Orders with existing POS/API-compatible field names, immutable catalog publication/version references, universal idempotency key + request hash, server-computed money snapshots, cancellation/rejection actor/time/reason fields, and stale POS \`needs_confirmation\` state.
- Order items, modifier/component snapshots, append-only status history.
- Append-only payment collection/refund ledger. No payment gateway or automatic refund logic.
- Delivery tasks, rider profiles, 60-second offer records, current assignments, append-only task events.
- Rider push subscriptions store encrypted bytea payloads and endpoint digest only. Current cleartext Rider push API must be updated before this table is usable.
- Private website successful-order events, order number counters, notification outbox and rate-limit buckets.
- RLS enabled and forced on new public/private tables; no anon/authenticated direct grants. service_role gets only server read access, rider-presence column updates, and limited encrypted-push writes. No direct service_role order/payment/delivery DML.
- No Realtime publication changes. Realtime is deliberately deferred until branch/rider authorization and event projection are implemented.
- No GST/tax/service-charge/tip columns. GST remains deferred.

### Important implementation boundaries / known follow-up work

1. This is a **schema candidate only**, not a complete functioning order/delivery backend. Transactional RPCs for \`flame_chick_create_order\`, \`flame_chick_update_order_status\`, website quota, delivery state machine, accept/decline and push-config are not yet authored/deployed.
2. Order API still calls a separate rate-limit RPC before order creation. Before live use, universal idempotency replay must be resolved before website quota, and successful website quota event insertion must happen in the same transaction as order creation. Current desired quota: 3 per rolling minute, 3 per rolling 10 minutes, 15 per rolling hour per normalized phone; POS and staff orders bypass only this website quota, not universal idempotency.
3. Order RPC must validate exact V3 publication item/deal IDs and all selected component mappings, server prices, availability, schedules and delivery fees. Never trust client totals/fees.
4. Stale offline POS catalog/price requests must be held for explicit Cashier/Manager confirmation; never silently reprice.
5. Rider push Edge Function must encrypt/decrypt using a server-only secret, hash endpoint lookup, and adapt its existing cleartext \`endpoint/p256dh/auth\` REST calls before deployment.
6. Order API read projection still contains deferred tax/service/tip field names and must be updated before any live integration.
7. Rider return UI wording and POS return confirmation roles need reconciliation with the approved policy: Rider reports return; Cashier/Manager confirms physical receipt; returned order moves to the cancelled/returned terminal queue, not hard-deleted.
8. Delivery task/offer/assignment RPCs must enforce branch, role, rider ownership and database-time 60-second expiry; rejected/expired offers return to POS for manual reassignment, never auto-rotate.
9. Website security audit remains a mandatory stop-gate immediately before attaching/enabling website checkout. Do not enable website ordering/delivery/pickup flags in this stage.
10. The full local migration QA workflow was wired to run the structural fixture, but this session did not obtain a confirmed workflow-run result. Do **not** claim the migration passed local replay/QA until the Actions run is observed and successful.

### Production safety statement

No Production SQL/migration, table creation, seed, catalog import/publication, Auth user/role creation, Edge Function deployment, secret change, Storage/Realtime setting, Vercel deployment, checkout activation, or paid-plan upgrade was performed. Production remains read-only. The migration candidate is not approval to apply it. Keep \`main\` and the original HFP/reference repositories untouched.

---
## 2026-11-23 — Rider delivery flow simplified (source only)

User explicitly confirmed: remove the “At restaurant” step. Required Rider sequence is exactly:

1. Accept the targeted delivery offer once in the Offers panel.
2. Picked up — this is the next Rider action after acceptance.
3. Delivered — completes delivery.

There is no separate arrival state, arrival timestamp, “At restaurant” button, or second acceptance button in the active-job card. Offer acceptance remains a distinct accept_offer API command because it consumes the targeted 60-second offer; it is not duplicated as an active-task action.

Source-only edits on work/production-source-audit:
- Rider UI no longer displays the second Accept button, arrival button, arrival status label, or arrival pickup counter.
- Delivery API generic task actions no longer accept legacy arrive; targeted accept_offer / decline_offer remain handled by their dedicated guarded branch.
- POS delivery status labels and active dispatch filters no longer include the arrival state.
- Operational schema candidate task/assignment status constraints no longer include arrived_at_restaurant; the unused arrival timestamp was removed.
- Delivery lifecycle contract now records the resolved Accept → Picked up → Delivered sequence.
- No Production SQL or deployment was performed.

Verification caveat: source files were re-read after changes, but GitHub reported no workflow runs for the Rider/POS/API commits. The simplified flow is therefore source-updated but not yet CI-verified or runtime-verified. Before deployment, run syntax/contract tests and disposable local migration replay, then test accept, pickup, delivery, reject/expiry, failure/physical return and role isolation against local Supabase.


# USER-APPROVED PRIORITY — ALL POS ORDER TYPES MUST SYNC TO DATABASE
**Confirmed:** 2026-11-24 (user clarification)

The highest-priority POS data requirement is that **every POS order type is persisted in the central Production database**: Dine-in, Takeaway, and Delivery. IndexedDB is the local-first working store and durable offline outbox, not a permanent destination for Dine-in/Takeaway orders.

Required behavior:
- Save every order locally first so the cashier can continue even with no internet.
- When online, automatically synchronize pending POS orders to Supabase. On an offline-to-online transition, resume automatically; no manual retry should be required.
- Keep unsynced order writes and payment/status mutations in a durable local outbox until the server confirms them.
- Use the stable local order ID as the idempotency identity. A timeout/lost response must be reconciled before retry; the same local order must never create a duplicate cloud order.
- Dine-in open checks must sync on first save and subsequent edits must update the same cloud order, not create a new order. Preserve table identity/name and any preorder scheduling data in the database (the current Production orders schema does not yet have table/scheduled fields; design an additive migration if needed).
- Takeaway maps to database fulfillment type `pickup`; preserve the POS-facing label `Takeaway` in the client/UI projection.
- Delivery must still enter the shared Online Orders workflow as a POS-source delivery order and create its delivery task. It must use the same durable sync/retry/idempotency guarantees as the other POS types.
- Do not let local payment method selection or a rider's Delivered status imply server-side payment collection. Actual collections must be represented by payment records. If a payment is taken while offline, queue the payment command durably and replay it idempotently after reconnection; only then mark the server order paid/completed and move it to history.
- Website order throttles apply to website traffic only, never POS sync.
- Keep catalog pricing validation and authoritative totals server-side; do not trust client totals or client-supplied branch/restaurant IDs.
- Preserve existing POS manual order-entry UX, table workflow, receipt confirmation, delivery board, staff role rules, and rider lifecycle. Do not rebuild the POS.

## Current implementation gap confirmed by source audit
- With `FLAME_CHICK_ORDER_API_READY=true`, `syncPending()` immediately delegates to `syncPendingPosDeliveryOrders()`.
- That specialized function intentionally filters to POS Delivery and explicitly leaves Takeaway/Dine-in local.
- Takeaway receipt finalization currently marks local status Completed/Paid and queues a generic local record, but the Supabase-ready sync path does not upload it.
- Dine-in open checks are locally queued and trigger sync, but the Supabase-ready sync path excludes them.
- Delivery has a separate immediate submission path; unify all three under a durable order outbox while preserving delivery's shared Online Orders board placement.
- Production already has `orders.local_order_id` and a unique idempotency constraint on (restaurant_id, branch_id, source, idempotency_key). Existing order item, deal-component, modifier, payment and status-history tables should be reused.
- Production `orders.fulfillment_type` supports `delivery`, `pickup`, `dine_in`; `orders.status` does not support local-only labels such as `Open` or `Scheduled`. Add an explicit safe mapping and persist table/scheduling data via a reviewed additive schema change if required.

## Next implementation stage
Design and implement a single authenticated POS sync contract and service-role-only transactional RPC for create/update of Dine-in, Takeaway and Delivery orders; persist order line snapshots/components/modifiers and table/schedule data; queue offline payment/status operations separately with idempotency; then update POS sync/reconnect handling and tests. Test all three order types online and offline, edit/replay, lost-response reconciliation, payment replay, duplicate/concurrent retries, and ensure no rider-delivered order is treated as paid. Keep Production schema/functions/deployments unchanged until the source migration and full disposable QA are reviewed and separately approved. Manual backups remain a prerequisite before accepting real customer orders.


# 2026-11-24 — Unified POS sync implementation checkpoint (IN PROGRESS / NOT READY)
- User's top priority: Dine-in, Takeaway and Delivery must all persist to Production database; IndexedDB is local-first storage and durable offline outbox; auto-sync when connection returns.
- New source-only candidate migration added: `supabase/migrations/20261124050000_flame_chick_unified_pos_order_sync_v1.sql`.
- Candidate introduces `flame_chick_sync_pos_order(jsonb)`, idempotent local order identity, local revision protection, item/component/modifier persistence, delivery task creation, table/scheduled dine-in fields, and optional queued payment ledger write. RPC is intended to be service_role-only SECURITY DEFINER with empty search_path. A follow-up source commit `e376d2c4c2e010409d079eba3676b70f318048a2` fixed a replay path so same-revision identical requests do not rewrite order item rows/history.
- This is an incomplete source candidate. It has NOT been integrated into Order API, POS sync worker, or end-to-end tests; do NOT treat as completed or deploy it. The current POS still filters cloud sync to Delivery only and still excludes Dine-in/Takeaway. The existing online event handler already calls `syncPending()`; keep it and extend the worker rather than replacing IndexedDB.
- Critical remaining work before any apply/deploy: Order API must derive restaurant/branch/actor from verified staff session; normalize old POS cart product IDs and legacy deal choices to current V3 publication IDs; invoke `calculateWebsiteOrder` server-side (including deals/components/modifiers) and build canonical payload with server totals/hash/revision; reconcile idempotency response; update board select/normalizer to actual Production columns; update POS local worker to all fulfillment types and keep all failed/unconfirmed records queued; preserve existing receipt confirmation and offline payment commands with stable request UUIDs; do not mark Paid based on payment-method selection; delivery rider Delivered remains unpaid until cashier collection.
- Candidate migration needs review/fixes before it can be considered QA-ready. Specifically verify transaction atomicity, constraints and idempotency under concurrent calls, stale-revision response handling, payment retry behavior, and all table/ordering edge cases. Add SQL tests and a real local Supabase/PostgREST/Edge API integration test covering dine-in, takeaway, delivery, edits, offline replay, lost response, concurrent retries, and payment replay.
- Latest push CI was triggered after the migration source change: run `45332812304` (workflow `QA Flame Chick catalog publication validation fixes V1`) and run `45332866711` (same workflow after replay fix) were pending/in progress at checkpoint; do not report success until inspected. Other triggered workflow run: `45332866786` pending.
- Production remains unchanged by this work: do NOT apply the candidate migration, deploy Order API/POS, set secrets, enable Realtime, or publish ordering until the complete source implementation passes disposable local QA and a separately reviewed Production rollout.
- User has a two-hour setup deadline. Prioritize a verified working core and report honestly if the deadline cannot be met safely; do not sacrifice the database/payment/offline safeguards or pretend a partial migration completes the requirement.


# 2026-11-24 — Unified POS sync continuation checkpoint (LATEST)

## User's explicit top priority
All POS order types — **Dine-in, Takeaway, and Delivery** — must be persisted in the Production database. IndexedDB remains the durable local-first store and offline outbox. If internet is unavailable, the order must remain safely in IndexedDB; when connectivity returns, sync must start automatically and reconcile with the database. Do not restrict cloud sync to Delivery. This is the current top priority.

## Exact repository state
- Repository: `itsfahadahmed1234-creator/flame-chick-platform` (owner spelling includes `ahmed`).
- Branch: `work/production-source-audit`.
- Latest commit: `897f943cff9a7a5568678a0a9c808a8a1da69808` — “Harden POS sync ledger balances and idempotent replay side effects”.
- New source-only candidate migration: `supabase/migrations/20261124050000_flame_chick_unified_pos_order_sync_v1.sql`.
- Updated handoff documents: `PROJECT_HANDOFF.md` and this continuation file. Read both first in the next chat.
- Production Supabase project: `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`, Free plan.

## What was checked / workflow status
- Previous checkpoint workflows all succeeded on commit `e376d2c4c2e010409d079eba3676b70f318048a2`: staff role boundary QA run `45332866687`, catalog publication validation run `45332866711`, Catalog V3 importer local DB run `45332866786`.
- New workflows triggered on latest commit `897f943cff9a7a5568678a0a9c808a8a1da69808` and were **in progress** at last check: `45334043211` (catalog publication validation), `45334043248` (staff role boundary), `45334043208` (Catalog V3 importer). Recheck them before further edits; do not assume they passed.
- Production has NOT been modified by the unified-sync candidate. Do not apply this migration or deploy any new Edge Function until the candidate is corrected, API/POS integrated, and end-to-end QA passes. Prior seven operational migrations remain the only approved/applied set.

## Existing POS behavior discovered — preserve it
- POS has manual order creation, dine-in table checks, takeaway receipts, and delivery checkout already. Do not rebuild the POS.
- Current `syncPending()` starts with `if(FLAME_CHICK_ORDER_API_READY){await syncPendingPosDeliveryOrders();return;}`; the active delivery-only worker intentionally ignores dine-in and takeaway. This is the behavior to replace with unified sync.
- `saveLocalOrder()` saves manual orders to IndexedDB stores `orders` and `queue`; dine-in table checks are local and need to sync as mutable open orders. Takeaway is currently finalized as local completed/paid (must change: cashier receipt/payment confirmation is the only proof of collection; don't fabricate paid records from selected payment method). Delivery currently gets sent to the Online Orders board and must remain there as source POS.
- Existing online event handling already calls `syncPending()`; keep it and extend the worker. Ensure startup, online event, visibility/focus, and periodic retry all call a single idempotent outbox processor.
- Existing POS API routes support staff auth, board, status, cancellation/rejection and payment collection. Board currently has invalid select columns/relations (see below).

## Candidate migration status — NOT QA-READY
File: `supabase/migrations/20261124050000_flame_chick_unified_pos_order_sync_v1.sql`.
- Adds a proposed service-role-only SECURITY DEFINER RPC `flame_chick_sync_pos_order(jsonb)`, local order ID/idempotency, monotonic local revision, dine-in table/scheduled fields, line/modifier/component snapshots, delivery task creation, and optional payment ledger support.
- Latest commit `897f943...` improved balance_due maintenance, normalizes legacy payment method names to DB-supported values, and wraps delivery task/history writes so same-revision replay does not duplicate those side effects.
- Candidate is still a draft. The SQL RPC currently accepts client-supplied totals/item snapshots and only checks arithmetic consistency; it does **not yet** independently derive prices/discounts from current published V3 catalog. Never trust these amounts in Production. The API must canonicalize/prices items first; the RPC must only accept a trusted canonical payload from the server and should bind/hash it. Verify all column constraints, idempotency uniqueness, locking, stale revision handling, and SQL syntax against disposable local Supabase before applying.
- Recheck that payment writes occur only after an explicit cashier-confirmed payment action. A chosen payment method or printed receipt does not mean cash collected. Delivery marked Delivered is still unpaid until cashier collects. Partial collection updates balance; full collection completes and moves order to history. Do not send payment entries just because an offline local UI has a payment-method selection.

## Critical architecture gap: Catalog V3 vs current POS
- Catalog API returns immutable V3 snapshots and explicitly does not adapt them to legacy schema V2.
- Current POS `adaptFlameChickCatalog()` expects schemaVersion 2, fields such as `CategoryID`, `ProductID`, `VariantID`, `DealID`, and legacy compatibility rows. The published catalog API returns V3 and currently fails closed in POS. Do not change the API to lie about schema version.
- Current POS cart holds a mixture of legacy product variant IDs, deal IDs, and deal choice IDs. The trusted order API uses `calculateWebsiteOrder` plus `FlameChickCatalogV3` and `FlameChickCatalogV3DealView`; it expects canonical V3 product/deal/modifier selections.
- Implement/review a real POS catalog adapter from canonical V3 to POS UI, or change POS selection payload creation to retain V3 IDs and component option IDs. Do not guess legacy-to-V3 mapping. Ensure deals including fixed and choice components, product modifiers, size pricing, availability, and delivery area fee are handled server-side.
- Server must resolve branch/restaurant/actor from verified staff profile; do not accept body-supplied branch/restaurant as authority. POS delivery must be allowed by staff even if public website ordering flags are disabled.

## Order API integration still missing
- `supabase/functions/flame-chick-order-api/index.ts` currently calls missing DB RPCs `flame_chick_create_order` and `flame_chick_update_order_status`; implement the correct unified POS sync endpoint using `flame_chick_sync_pos_order` after canonical V3 pricing/validation is complete.
- Extend RPC allowlist/type and route; authenticate Admin/Owner/Manager/Cashier, derive actor/branch from `resolveStaffContext`, and use service-role-only RPC.
- Board `readOrderBoard()` currently selects nonexistent columns `table_id`, `table_number_snapshot`, `tax_amount`, `service_charge`, `tip_amount`, nested `order_items.tax_amount`, and nonexistent relation `order_item_components` (verify actual FK relation names before select). Production schema has `table_reference`, `table_label_snapshot` (candidate migration adds these), and no GST/tax/service-charge/tip fields; `order_item_components` is a real table and FK relation, but confirm PostgREST embed name/relationship. Remove unsupported columns, preserve product/deal snapshots and modifiers/components.
- Production `orders` supports fulfillment types `delivery`, `pickup`, `dine_in`; statuses include new, accepted, preparing, ready, out_for_delivery, delivered, collected, served, completed, rejected, cancelled, returned. It has check constraints: total = subtotal - discount + delivery_fee, delivery fee snapshot matches, customer phone currently has a NOT NULL/check constraint until candidate migration relaxes it, and payment method summaries are not the same as payments ledger methods.
- Production `order_item_components`, `order_item_modifiers`, `order_status_history`, and `payments` exist. `payments.payment_method` accepts only cash/card/bank/wallet/other; map bank_transfer→bank, cod→cash, online→other only for summary display, never claim payment is collected.

## Required implementation order in next chat
1. Re-read both handoffs, inspect branch head, inspect all workflow runs above. Do not ask user to repeat context.
2. Audit and fix candidate SQL against exact live schema/check constraints. Use a disposable local DB replay. Add a deterministic SQL fixture that covers dine-in, takeaway, delivery, update revision, identical replay, conflicting replay, concurrent duplicate, and partial/full payment semantics. Fix any constraint mismatch before API integration.
3. Resolve V3 catalog/POS compatibility correctly. Inspect catalog snapshot schema, POS UI selection model, deal configurator and pricing engine. Implement adapter or V3 payload path and tests; no legacy ID guessing.
4. Implement server-side POS quote/canonicalization using current published V3 snapshot and `calculateWebsiteOrder`/deal view, but do not apply website-only branch enablement or website phone rate limits to POS. Compute server totals, delivery fee, modifiers, deals, components, publication version, stable request hash. Verify current catalog sellability.
5. Implement Order API sync route and use only trusted server-derived actor/restaurant/branch. Use `flame_chick_sync_pos_order` only after the trusted canonicalization is in place.
6. Replace delivery-only `syncPendingPosDeliveryOrders()` early return with unified IndexedDB outbox sync for all three fulfillment types. Preserve unsynced rows until server confirms/reconciles; never delete queue row on timeout. Use stable local order ID + revision + request hash; on lost response, query by local identity/idempotency and retry safely. Backoff must not stop future automatic sync. Do not let stale in-flight response overwrite a newer local edit.
7. Distinguish local dine-in open check updates from takeaway and delivery finalization; sync edits and status/receipt state. All order types should appear in database and POS board/history according to lifecycle, source POS. Do not force dine-in and takeaway into delivery board if UI should show separate views; persistence is mandatory.
8. Payment semantics: order created unpaid by default; only explicit cashier collection records payment; delivery Delivered does not collect; partial balance remains; full payment completes. Offline payment actions need their own stable payment request UUID and queue, replay-safe. Do not report a payment as collected until the server acknowledges it.
9. Fix board query to exact schema and test PostgREST embeds/normalization for website + POS orders of all fulfillment types.
10. Run full local migration replay + Edge Function API/PostgREST/Postgres end-to-end tests including offline/reconnect, timeout/lost response, duplicate/concurrent retries, edited order, deal/modifier selections, delivery task, payment replay, branch/role boundaries. Then run all relevant GitHub Actions and inspect logs.
11. Update both handoffs with exact commits, workflow IDs/results, what's done, what remains, and explicit Production safety status.
12. Only after local QA passes, prepare a separate reviewed Production rollout. No Production migration apply, Edge Function deploy, secret setup, Realtime enablement, or customer-order activation without explicit authorization for that stage.

## Fixed business constraints — preserve
- Production is being built; no real customer orders currently operating.
- Free Supabase plan only; no paid upgrade without explicit approval.
- GST/tax fields and calculations deferred; do not add GST now.
- Rider lifecycle only Accept → Picked up → Delivered; no “At restaurant”.
- Rider Delivered does NOT mean payment collected. Cashier collection completes the order.
- Delivery offer expiry 60 seconds; reject/expire returns to POS for reassignment.
- Delivery failure: rider reports return; Manager physically confirms return; cancellation/return audit preserved.
- Roles: Admin + Owner full authority; Manager POS/return confirmation, no admin panel/deletion; Cashier POS/rider assignment/rejection/cancellation audit, no deletion; Rider only own assigned offers.
- Website order rate limits are website-only (3/min, 3/10 min, 15/hour), never POS.
- Manual backup/restore procedure deferred until before real customer orders are accepted; must be done then.
- Do not deploy Rider Web Push: push remains deliberately disabled/fail-closed (PUSH_NOT_CONFIGURED 503); polling/commands remain the current approach.

## Next-chat opening instruction
Continue on `work/production-source-audit` at latest branch head. Read `docs/handoffs/2026-11-23-new-chat-continuation-handoff.md` first, then `PROJECT_HANDOFF.md`. Start by checking workflow runs `45334043211`, `45334043248`, `45334043208`; then audit candidate SQL. The immediate target is unified offline-safe sync for Dine-in + Takeaway + Delivery, not a new POS UI. Proceed carefully without asking user to restate known requirements. Do not claim completion or touch Production until end-to-end tests pass and rollout is separately authorized.
