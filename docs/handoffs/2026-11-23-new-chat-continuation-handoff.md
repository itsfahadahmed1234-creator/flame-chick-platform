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


# 2026-11-24 — Trusted POS V3 pricing foundation (SOURCE ONLY; sync still incomplete)

**Latest verified source commit:** `3b9c070c966b41509670f828764fa41be821911b`  
**Branch:** `work/production-source-audit`

## What changed in this slice
- Added an explicit `staffPos` dependency option to the shared V3 pricing engine. It is not read from the browser request; the future Order API must set it only after bearer-token verification, role authorization, and branch resolution.
- Trusted POS pricing now accepts all three canonical fulfilments: `delivery`, `pickup` (POS UI label Takeaway), and `dine_in`. Normal website calls still accept only `delivery` and `pickup`.
- POS pricing does not require website-ordering flags. It still requires the selected branch to exist in the current published V3 snapshot and still validates product/variant availability, deal schedule/branch availability, modifier rules, and server-side prices.
- POS walk-in customer phone may be omitted; a supplied phone is still validated. The API must continue requiring a phone for POS Delivery before RPC submission.
- V3 deal availability view accepts `dine_in` only when the internal `staffPos: true` option is passed. Public website callers cannot use that option.
- Added regression tests for dine-in pricing with website ordering disabled, optional walk-in phone, pickup POS pricing with website flags disabled, and rejection of unavailable published products.

## Verification
- Website static checks passed: run `45337053027`.
- Edge Function static/type/API/pricing checks passed on the successive source commits: `45337053042`, `45337060211`, `45337063925`.
- Existing disposable catalog-publication validation and full migration replay passed: run `45334043211`.
- Existing staff role boundary, operational schema, delivery commands/concurrency and actual Website Order API tests passed: run `45334043248`.
- Catalog V3 importer local database workflow passed: run `45334043208`.
- These green workflows do **not** test the new unified POS outbox/RPC end-to-end. The new pricing slice is covered by the Edge Function test job; it is not a claim that POS synchronization is complete.

## Still unfinished — immediate next work
1. Implement a staff-only POS sync API action. Authenticate the bearer token, resolve `resolveStaffContext`, derive restaurant/branch/actor exclusively from that trusted context, reject Rider role, and call `calculateWebsiteOrder(..., {staffPos:true})`. Do not trust browser totals, catalog IDs outside the published snapshot, actor, branch, or role.
2. Canonicalize POS cart rows to V3 product variant IDs, modifier-group selections, deal variant IDs, and exact component option IDs. The current POS catalog adapter still expects V2; the live catalog API returns V3. Do not guess legacy ID mappings.
3. Build the exact RPC payload expected by `flame_chick_sync_pos_order(jsonb)`, including server-derived totals, publication/version, item/component/modifier snapshots, request hash, stable local ID, and monotonic revision. For Delivery, validate current branch delivery area and Not Listed fee on the server.
4. Extend the RPC/API integration tests for authenticated staff POS create/update and verify exact production-column/constraint compatibility against disposable local Supabase.
5. Replace the delivery-only `syncPendingPosDeliveryOrders()` dispatch with one durable IndexedDB outbox processor for all three fulfilment modes. Preserve startup/online/visibility/focus retry, stable identity/revision, lost-response reconciliation, and queued rows until server acknowledgement.
6. Separate order sync from payment collection. Takeaway receipt printing/payment-method choice must not mark an order paid. Dine-in table close and Delivery Delivered must not imply payment collection. Add explicit cashier collection commands with their own stable request UUIDs; replay offline collections idempotently.
7. Fix and test `readOrderBoard()` against actual columns/embeds, then test board/history normalization for all POS fulfilment types.
8. Run full disposable local migration replay + SQL fixture + actual Edge API/PostgREST/PostgreSQL tests for Dine-in/Takeaway/Delivery, edits, offline/reconnect, lost response, concurrent retries, deals/modifiers, delivery task, partial/full payment replay, and staff/branch boundaries.

## Production safety
Production remains unchanged by this source-only work. The live migration ledger remains at 33 applied migrations; the candidate `20261124050000_flame_chick_unified_pos_order_sync_v1.sql` remains unapplied. Do not deploy functions, set secrets, enable Realtime, apply this candidate migration, enable website orders, or deploy Vercel as part of this step. No GST/tax fields or calculations. Free plan only. Keep IndexedDB; do not rebuild the POS.



# 2026-11-24 — POS V3 database-catalog adapter foundation (NOT YET WIRED INTO POS)

**User clarification:** Flame Chick Production is the intended production system being built. There is no live operation and no real customer/order production data. Continue building the real Production architecture; use disposable local Supabase for migration and integration tests. Do not seed fake operational data into the Production project.

**Catalog-source decision (explicit):** The POS must use the new published database-backed V3 catalog as its only menu source. Do not use the old V2 catalog or V2 legacy identifiers as a fallback. Keep the existing POS screen/workflow; replace its catalog integration, not the POS itself.

## Source files added
- `apps/flame-chick-pos/catalog-v3-adapter.js`: standalone V3-to-POS display projection. It validates the V3 snapshot through the shared catalog contract, resolves a branch, uses database time and the shared V3 deal view, carries V3 product/variant/category/deal/component-option IDs, respects branch availability and sellable/priced variant requirements, and does not map legacy IDs.
- `tests/pos-catalog-v3-adapter.test.mjs`: regression tests for V3 identity preservation, branch availability, null/non-standalone pricing, exact deal IDs, unavailable deals, multi-branch selection and fail-closed V2/time handling.

## Important current status
- These files are a separate adapter/test foundation only. The existing `apps/flame-chick-pos/index.html` has **not yet been wired to load/use this adapter** and still expects schema V2. Do not describe the POS as V3-integrated or operational.
- The test file has been added, but its execution has not yet been confirmed by a CI run. Existing successful POS static checks ran on the earlier adapter commit and do not validate this new adapter/test.
- The current published database snapshot read-only inspection returned schema V3, publication number 2, 1 branch, 8 categories, 25 products, 28 variants, 6 deals, 18 component groups/options/mappings. It currently has zero modifiers, zero modifier assignments/rules, zero delivery areas, and zero drink options. Do not infer that empty tables mean the POS can assume modifiers or delivery fee data exist; fail closed for any required unavailable setup.
- The single current branch has website ordering disabled; POS staff ordering must not depend on those website flags.

## Next exact work
1. Execute the new adapter test with the existing V3 fixture and correct any mismatches against the actual contract.
2. Wire the POS page to load the V3 contract, V3 deal view and adapter before the POS application code. Replace the V2 health/schema check and V2-shaped cache adapter with V3-only loading; persist the immutable V3 snapshot and a normalized display projection in IndexedDB. Keep V3 IDs in cart lines.
3. Replace the V2 modifier UI adapter with the shared V3 `buildProductModifierGroups` / `validateModifierSelections` contract. Keep size-specific modifier prices from V3 rules; do not infer FREE/FIXED/BY_SIZE fields.
4. Replace the old V2 deal UI with V3 `buildDealViewModel` variants/groups/options and `validateDealSelections`. Submit exact `deal_variant_id`, `component_group_id`, `component_option_id`, quantity and nested modifier IDs to server pricing.
5. Implement authenticated staff POS quote/create/update API. Derive staff, branch, source and permissions from the authenticated staff context; never trust browser totals or browser-provided `staffPos`. Use V3 server pricing and current publication/database time.
6. Integrate all three fulfilments with the durable IndexedDB outbox and the unified sync RPC; preserve stable local identity, revision conflict protection, server acknowledgement, lost-response reconciliation and offline retry.
7. Test dine-in table leases/uniqueness across two terminals, all three fulfilments, edits, modifiers/deals, delivery fee validation, payments, concurrency, realtime board and offline reconnect against disposable local Supabase.
8. Only after full disposable integration tests pass, review the migration and deploy/cut over deliberately. No unverified migration.

## Safety
No Production DB changes, test orders, customer records, function deployment, Vercel deployment or Realtime changes were made in this adapter step. No GST/tax changes. Free plan only. Keep the existing POS UI and IndexedDB offline-first design.


# 2026-11-24 — Cashier delivery-payment popup narrowed to requested methods

## User-confirmed workflow
After the Rider marks a Delivery order Delivered, the Cashier/Manager/Admin/Owner opens **Collect Payment**. A popup requires one method:
- **COD** → database payment method `cash`
- **Card** → `card`
- **Online/bank transfer** → `bank`

The cashier confirms the method only after receiving the **entire outstanding balance**. There is no editable partial amount and no Wallet/Other choice in this popup. On successful server confirmation of zero balance, the order must be `completed`, disappear from active Delivery orders, and appear in Order History. Rider Delivered remains delivery-only; it never collects payment or completes the order.

## Source changes
- Added `apps/flame-chick-pos/payment-collection.js`: strict three-method mapping and UUID/full-balance request validation.
- Updated `apps/flame-chick-pos/index.html`: removed editable payment amount and extra payment choices from the delivery collection popup; changed action label to **Confirm method & collect payment**; it uses the current authoritative server balance and the same idempotent request UUID on uncertain retries; it refuses a success response unless the server confirms `completed=true` and `balance_due=0`; after success it refreshes active orders and Order History.
- Added `tests/pos-payment-collection.test.mjs` for exact method options, database mapping, full-balance payload and invalid request rejection.
- Updated `tests/ops-source-hygiene.test.mjs` for the new collection UI contract.
- Updated `.github/workflows/ci-ops-static.yml` to run the new test.

## Existing backend reused, not duplicated
The existing source-only migration `20261124033426_flame_chick_payment_collection_v1.sql` and Order API already implement a service-role-only, security-definer, row-locked, idempotent payment transaction. It checks branch-scoped staff roles (Admin/Owner/Manager/Cashier), prevents over-collection, records the ledger and audit row, and completes the order only when balance reaches zero. That migration is not applied to Production. Do not add another payment RPC or duplicate ledger logic.

The existing backend also allows partial payments for other potential workflows; this requested Delivery popup now always sends the full current outstanding balance. No card gateway, bank API verification, wallet, or online gateway integration is implied by the label Online/bank transfer: it is a cashier-recorded method after receipt/verification outside this app.

## CI / current status
- An initial POS static workflow failed because its old source-hygiene test explicitly required the old editable partial amount and five-method popup. The assertions were updated to the new requirement.
- Latest run for the updated source-hygiene assertions: `45339760906` was queued at checkpoint time; poll it and inspect any failure logs before calling the tests passed.
- Admin static checks passed on earlier commits. POS preview deployment remains skipped by the configured fail-closed readiness gate.
- No Production database changes, function deployments, Vercel deployments, fake customers/orders, or Realtime changes were made.

## Still outstanding
The POS is **not yet wired to the V3 catalog adapter**; the existing page still has the legacy V2 catalog dependency. Continue the V3-only POS integration before claiming the POS is ready. Then implement and test the authenticated staff POS sync API, unified IndexedDB outbox for Dine-in/Takeaway/Delivery, real disposable local Supabase integration, offline/reconnect/revision/idempotency/concurrency tests, board/history correctness and payment migration validation. Do not apply any migration or deploy until all relevant disposable tests pass. Keep Production as the target system being built; it currently has no live customer/order operation. No GST changes; Free plan only.


# 2026-11-24 — POS published V3 catalog cutover (menu read path only; order path intentionally gated)

## Completed source integration
- POS now loads the shared website V3 catalog contract, V3 deal view, and `catalog-v3-adapter.js` before its main application code.
- Health responses are validated with `FlameChickCatalogV3.validateHealth`; catalog download must match V3 schema, publication ID and version hash.
- IndexedDB menu cache records schemaVersion 3 and the publication/version metadata.
- Existing V2 catalog cache is discarded from the menu/catalog stores at startup. Orders, tables and queue stores are not deleted by this cache reset.
- POS menu projection uses V3 category/product/variant IDs, published prices, branch product/variant availability, subcategories and database timestamp.
- Product modifier groups now come from the shared V3 `buildProductModifierGroups` logic for the selected product variant, with resolved V3 minor-unit prices. No V2 modifier tables or legacy IDs are used in this read path.
- Unavailable/scheduled/branch-unavailable deals remain visible in the menu as disabled entries; the POS no longer silently hides them.

## Fail-closed safety gates (important)
The current Order API `action=create` for staff still calls the older `flame_chick_create_order` RPC and does not invoke the V3 server-side quote/pricing path. The current local cart and delivery create payload are also still legacy-shaped. The old deal picker still expects V2 `dealComponents` and cannot correctly represent V3 deal variants/component groups.

Therefore:
- `saveLocalOrder()` now refuses order submission when the V3 catalog is loaded, with an explicit message that V3 staff pricing/sync must be connected first. This prevents V3 IDs being sent into legacy order RPCs or creating wrongly priced/structured records.
- V3 deal buttons remain disabled until the V3 deal variant/component selection and server payload are implemented.
- The menu can be read from the published V3 snapshot, but POS checkout is **not yet operational**. Do not remove these gates or call the POS complete until the next phase is finished.

## CI
- `tests/pos-catalog-v3-adapter.test.mjs` now runs in the POS static workflow.
- `tests/ops-source-hygiene.test.mjs` includes V3-only loader/cache, unavailable-deal display, V3 order fail-closed and V3 deal fail-closed assertions.
- Run `45340945412` passed on commit `8df0ef51e5b175e09aa34fe1933caaae49127bd7`, before the final order/deal gates were added. A new run for the latest commits must be checked; do not reuse the earlier pass as proof of the final tree.
- Older failed runs during test migration are historical; current verification is the latest workflow run for the final head SHA.

## Next exact implementation work
1. Implement a trusted staff V3 quote endpoint/action that resolves the authenticated staff identity, branch and fulfilment from trusted session context. Call shared `calculateWebsiteOrder` with `staffPos:true` only server-side. Never trust browser prices, branch IDs, totals, or `staffPos`.
2. Add a staff-only V3 order create transaction/RPC using the canonical priced result and idempotency key; preserve cashier actor, source, branch, POS device/register metadata and audit fields. Review the existing order tables/RPC and migration dependencies before drafting any migration.
3. Implement V3 product cart payloads (`kind: product`, `product_id`, `product_variant_id`, modifier group IDs and modifier IDs) and V3 deal selector/cart payloads (`kind: deal`, `deal_id`, `deal_variant_id`, exact component group/option/product/variant IDs and nested modifiers). Validate selections through shared V3 validators and let server pricing calculate totals.
4. Connect Dine-in, Takeaway and Delivery to one durable IndexedDB outbox with local UUID, stable idempotency key, revisions, server acknowledgement, retry and lost-response reconciliation. Current legacy `syncPending` short-circuits to Delivery sync; Dine-in and Takeaway are not yet on unified server sync.
5. Load delivery areas/fees from trusted branch delivery configuration (not the V3 catalog arrays, which the V3 contract explicitly requires empty). Do not infer a zero/default fee.
6. Add disposable local Supabase migration/integration tests for all fulfilments, pricing/modifiers/deals, payment collection, offline reconnect, duplicate retries, two-terminal table concurrency, revisions and history.
7. Only after tests pass, review/deploy migrations and function changes deliberately. No Production migrations, test orders, fake customer records, Edge Function deployments, Realtime changes or Vercel deployments have been made in this stage.

User priorities/constraints unchanged: Flame Chick Production is the system being built and has no live customer/order production data; no GST/tax implementation; Free plan only; no rebuild of existing POS UI; no unverified migrations.


# 2026-11-24 — Authenticated V3 POS sync API foundation (source-only; not deployed)

## Implemented on this branch
- Added Order API action `sync_pos_order` for authenticated staff POS synchronization.
- Verifies the bearer token through Supabase Auth, resolves active staff role and single authorized branch server-side, and derives `actor_user_id`, `restaurant_id`, and `branch_id` from that trusted context. Browser-supplied actor/branch values are ignored.
- Only Admin, Owner, Manager and Cashier may sync; Rider is denied.
- Reads the current published V3 catalog through the service-only catalog RPC and uses shared `calculateWebsiteOrder(..., { staffPos: true })` server-side. Browser prices/totals are ignored.
- Validates publication/version, product/deal identities, variants, modifiers, quantities and branch availability through the shared pricing contract.
- Delivery fees are re-read from branch `delivery_areas` and `branch_delivery_settings`; listed area ID and Not Listed locality are validated. Dine-in/Takeaway cannot include delivery fields or delivery fee.
- Builds a canonical POS request hash and stable idempotency key `flame-chick-pos-<local_order_id>`, then calls service-role-only `flame_chick_sync_pos_order(jsonb)`.
- Does not set an initial payment method: a newly created order remains unpaid, and payment is a separate cashier collection action.
- Added a synthetic route-level Deno test for staff auth, server-derived actor/branch, server V3 price replacing browser price, and unpaid order result.
- Corrected the unapplied candidate SQL to allow nullable phone for Dine-in/Takeaway walk-ins and to keep payment method null until payment is actually collected. Added Not Listed locality persistence and validation.
- Updated `.github/workflows/ci-edge-functions.yml` so changes to the candidate POS sync migration run the Edge API checks.

## Verification
- Edge Function type-check and route integration tests passed on run `45342361392`, head `908571b5f528bb338e77a96881d7956c4d3b7c5c`.
- Run URL: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45342361392
- The prior failed run `45342253061` was caused by the second test inheriting the first test's restored global fetch. The test now installs its own isolated synthetic fetch; the latest Edge workflow passed.
- The Admin static workflow for the same head was also triggered and must be checked before declaring all current-head workflows green.

## Critical boundary / not yet complete
- Candidate migration `supabase/migrations/20261124050000_flame_chick_unified_pos_order_sync_v1.sql` remains source-only. It has NOT been applied to Production or any live database. Do not deploy the Edge Function or connect the UI until this migration has passed a disposable local Supabase reset/integration test.
- The SQL RPC writes V3-priced item snapshots supplied by the trusted Edge Function and revalidates branch, delivery fee, role, revision, and monetary arithmetic. It is not a substitute for the required disposable DB tests.
- POS UI still has its V3 fail-closed checkout gate. It does not yet call `sync_pos_order`.
- V3 deal UI selection/cart serialization remains gated. Do not enable deal buttons until component selections serialize into the canonical V3 payload.
- The single unified IndexedDB outbox and automatic replay for Dine-in, Takeaway and Delivery are not yet implemented. Current legacy sync paths remain and must not be represented as the completed offline design.
- Existing payment collection API supports `cash`, `card`, `bank`, `wallet`, `other`; the POS cashier-facing labels should map COD→cash, Card→card, Online/bank transfer→bank. Keep payment collection separate from order creation; delivery is not complete merely because rider marks Delivered.
- No Production migration, Edge Function deployment, Vercel deployment, test order/customer or fake production record was created.

## Next exact work
1. Check all workflows on the latest head; fix any failures before proceeding.
2. Run the candidate migration only in disposable local Supabase, reset from all migrations, and add real SQL integration coverage for product/deal snapshots, three fulfilments, branch delivery fees, unpaid orders, revision conflicts, idempotency, status/payment collection, history, and two-terminal dine-in table concurrency. Inspect and fix any SQL/RPC issue before considering production.
3. Connect existing POS UI to the V3 payload and new API; implement deal component selection before enabling deals.
4. Replace legacy delivery-only sync short-circuit with one durable IndexedDB outbox for Dine-in, Takeaway and Delivery, with stable local UUID/idempotency, revision, pending/attempt state, server acknowledgement, retry/backoff, reconnect trigger, and reconciliation after lost responses.
5. Test offline order capture and automatic sync after reconnect, duplicate retry, network timeout, terminal concurrency and history/payment behaviour.
6. Only after disposable integration and current-head CI pass, review deployment/migration sequencing explicitly. Production is the system being built and currently has no live customer/order records. No GST/tax logic; Free plan only; preserve existing POS UI.


# 2026-11-24 — Disposable POS SQL QA run 63 diagnosis and fixture correction

- Run 63 failed in the behavioral SQL fixture before the POS sync RPC was called.
- Exact PostgreSQL error: `STAFF_ROLE_SELF_ASSIGNMENT_DENIED` at fixture insertion into `public.user_roles`.
- Cause: the synthetic Cashier/Rider rows listed the target user as `assigned_by`; the production staff-role trigger correctly prohibits self-assignment.
- Corrected `supabase/tests/flame_chick_pos_order_sync_v1.sql`: bootstrap a separate synthetic Admin using the approved `assignment_method='initial_bootstrap'` path, then assign the synthetic Cashier and Rider with that Admin as actor. Added cleanup assertion for all three test Auth users.
- No application authorization rule or production migration was weakened to accommodate the test.
- Re-run 64 was triggered from this corrected test on commit `038bb1c1b7680144a8ea2cb9e1cc5485378e966a`; it is currently in progress. Final SQL behavioral result is not yet verified; check the failing/passing step logs before proceeding.
- Full migration replay had succeeded on run 63 before the fixture test began. Run 63 failure does not establish that the POS sync behavior passed or failed.
- Production remains untouched; local fixture transaction is rolled back by the SQL test. No fake records were written to the hosted project.


# 2026-11-24 — POS behavioral QA run 64 diagnosis; run 65 rerun

- Run 64 passed the full disposable migration replay, then the POS behavioral SQL stopped at the first Dine-in create with `POS_STAFF_REQUIRED`.
- Root cause: `public.flame_chick_get_staff_role_rows` intentionally projects only staff rows for the canonical `flame-chick` restaurant slug; the fixture used `qa-pos-sync-flame-chick`. The production role boundary is correct.
- Corrected the disposable fixture to use slug `flame-chick` and added an explicit preflight assertion that the synthetic Cashier is visible through the real role-projection RPC. The test still creates synthetic Admin/Cashier/Rider identities and rolls all rows back.
- Run 65, URL https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45347377217, was triggered on commit `22b783518f8efbc9899ad019cd0305502e8fb5b0`. At handoff update time it had passed source checks and was starting disposable Supabase; behavioral SQL result is pending and must be inspected.
- Run 63's earlier self-assignment fixture error and run 64's slug mismatch are test fixture defects, not evidence of the POS sync RPC passing. Do not claim behavioral integration passed until run 65 or a later corrected run passes the SQL step.
- Production project was not changed. No migrations deployed and no operational records created there.


# 2026-11-24 — POS sync SQL run 65 diagnosis and generated-column correction

- Run 65 passed complete disposable migration replay and staff-role fixture checks, then the first Dine-in order insert exposed the next genuine migration defect:
  `cannot insert a non-DEFAULT value into column "balance_due"`; `balance_due` is generated as `greatest(total-paid_amount,0)`.
- Corrected candidate migration `20261124050000_flame_chick_unified_pos_order_sync_v1.sql`: removed `balance_due` from the initial INSERT, removed explicit assignments from the revision UPDATE and payment UPDATE. The database-generated column is now the only source of balance.
- Candidate migration remains unapplied to the hosted Flame Chick project. This change is source-only pending disposable verification.
- Run 66 has been triggered on commit `a4741f838de027d20b82e50f8a79f86e068e5b77`: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45347935015. At checkpoint time it was in progress. Inspect the full migration replay and behavioral SQL logs; do not report success until the SQL step passes.
- Run 65's full migration replay passed; behavioral SQL failed at the first order insert, so no downstream Dine-in/Takeaway/Delivery or payment assertions ran.
- No changes to hosted database, auth users, customer/order data, Edge Function deployment, or website deployment.


# 2026-11-24 — Run 66 had one failed step; run 67 cast correction

- Clarification: run 66 did **not** have multiple failures. Its migration replay, Edge Function static checks, catalog publication validation, and staff role-boundary workflow all passed. Exactly one step failed: `Exercise POS sync, all fulfilments, walk-ins, revisions, table lock and payment replay`.
- Exact test error: `could not determine polymorphic type because input has type unknown`, at test-only call `jsonb_set(payload,'{notes}',to_jsonb('changed at same revision'),true)`.
- This failure is in a SQL test literal, not a failure of migration replay. The candidate migration itself applied successfully to the disposable local database.
- Corrected both test strings passed to `to_jsonb` by casting them explicitly to `text`. No production constraints or database authorization were changed.
- Run 67 on commit `c2baa612ee9d1b3074291be132866402faee3e72`: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45348420225. It passed source-check setup and was starting the disposable local stack at handoff update time. Check the behavioral SQL step result; do not claim it passed until verified.
- Production remains untouched. No migrations deployed, Edge Function deployed, Vercel deployment, customer rows or order rows created.


## POS same-revision payload fingerprint regression — 2026-11-24

The unified POS sync behavioral workflow previously failed exactly one assertion: `POS_SAME_REVISION_CHANGED_PAYLOAD_NOT_REJECTED`. Root cause in the test fixture: it changed the order notes but reused the original `request_hash`, which represents an identical retry from the RPC's perspective. The trusted `flame-chick-order-api` recomputes SHA-256 over the canonical server-priced POS payload; a changed note/content therefore produces a different hash before the service-role-only sync RPC is called. The SQL behavioral test now models that contract by assigning a distinct fingerprint for changed content at the same revision, then asserting `POS_ORDER_REVISION_CONFLICT`. It also retains the exact-payload/exact-hash replay assertion and later-revision update assertion.

Added authenticated Edge Function regression coverage: identical POS request payloads must yield stable hashes; changed payload content at the same local order ID/revision must yield a different canonical hash. Changes committed on `work/production-source-audit`:
- SQL behavioral test commit: `973238aa675cf4a68288d12176d462a654d7af78`
- Edge Function regression test commit: `26e7b1b48ffb269d4aa1f4a0510f1d99d4349b01`

These commits update test coverage only; no migration, Production data, Edge Function deployment, Vercel deployment, Realtime configuration or secrets were changed. Wait for the newly triggered disposable-local-Supabase workflow and inspect the exact failed job/step/log if it fails again. Do not infer that SQL/edge tests passed merely from commits. The unified POS sync workflow must pass before moving to the agreed application/API/Edge Function/Realtime deployment phase. After infrastructure deployment, conduct the complete manual test-order rehearsal with test accounts before real restaurant go-live. Flame Chick has no live restaurant operation or existing production customer/order records; this is a new system being built.


Follow-up CI correction: the first Edge Function test run after adding the new regression coverage failed TypeScript control-flow analysis (TS2367), because Deno inferred the array length as a literal after a prior length assertion. The test now reads the count through `Array.from(posSyncPayloads).length` to avoid stale narrowing. Fix commit: `4ee773b75541f5d59b48eceb4fb58018072f901c`. Recheck the latest Edge Function workflow and unified POS behavioral SQL workflow before declaring this fix verified.


## Latest workflow verification — 2026-11-24 (after POS revision-fingerprint fix)

Latest relevant workflow results inspected directly, including job steps (not just run badges):

| Area | Latest successful run | Result |
|---|---:|---|
| Unified POS sync + V3 catalog import against disposable local Supabase | [#68 / 45349845108](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45349845108) | PASS — full migration replay, POS behavioral SQL (Dine-in/Takeaway/Delivery, walk-ins, exact retry, changed same-revision payload rejection, later revision, table lock, payment replay), catalog import/compile/validate/resume, disposable stack stopped |
| Edge Function TypeScript + API integration/static contracts | [#96 / 45349936949](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45349936949) | PASS — TypeScript check, actual Website Order API synthetic route tests, RPC/catalog/pricing/key contracts |
| Admin static checks | [#144 / 45349936893](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45349936893) | PASS |
| Staff Admin role boundary QA | [#103 / 45347935003](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45347935003) | PASS — role authorization and disposable SQL tests |
| Catalog publication validation fixes | [#89 / 45347934967](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45347934967) | PASS |
| POS/Rider static checks | [#56 / 45341289623](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45341289623) | PASS |

The two immediately preceding failed attempts are historical and superseded:
- SQL workflow #67 failed because its test changed `notes` while reusing the same request hash. Corrected SQL behavioral fixture in #68 now supplies a distinct canonical fingerprint for changed same-revision content and the full workflow passed.
- Edge Function workflow #95 failed TypeScript check TS2367 because TypeScript narrowed a test array length to literal 2 before a later comparison with 3. The test assertion was changed to use `Array.from(posSyncPayloads).length`; Edge Function workflow #96 then passed all steps.
- Older failed runs #63–#67, #87–#95 and other earlier attempts are historical records from superseded commits. Do not mistake them for current branch failures; GitHub retains their audit history.

**Current verification checkpoint:** all relevant latest workflows inspected above are green. No remaining failed current run identified. No application or SQL behavior changes were needed after the green results; the follow-up was test-only. Do not claim production deployment or real-world manual rehearsal has occurred.

**Deployment gate remains:** after this successful unified behavioral SQL workflow, proceed to the planned infrastructure deployment of the apps, APIs, Supabase Edge Functions, Realtime and required integrations. This is deployment of the new system, not permission to start real restaurant operations. Before a restaurant go-live, conduct the complete manual rehearsal using test accounts and explicitly identified test orders: all three fulfilment types; online ordering and POS where applicable; IndexedDB offline queue and automatic reconnect sync; rider accept/pickup/delivered; Cashier collect-payment popup and COD/Card/Online-bank-transfer method; payment collection then completion/history; staff role boundaries; duplicate requests, network loss/retry, and failure recovery. Verify records and clean up test data. Only after the rehearsal passes may real restaurant operations begin. Flame Chick is being built from scratch; do not imply there are pre-existing production customers or orders.


## 2026-11-24 — First application deployment wave (protected Vercel previews)

User authorized starting deployment and requested the customer website hostname `flamechick.vercel.app`.

### Canonical website hostname
- Verified Vercel domain `flamechick.vercel.app` is already attached to the intended new Website project `flame-chick-website-production` and verified by Vercel. No registration or DNS change was needed.
- Corrected `docs/operations/admin-auth-deployment-configuration.md` from the old misspelling `flamechic.vercel.app` to `flamechick.vercel.app` (commit recorded separately).
- Do not move the custom hostname to a new preview deployment. It remains the intended customer website hostname; final production alias/cutover must wait for backend + manual test-order rehearsal and explicit go-live authorization.

### Vercel project inventory
All four existing projects belong to team `team_Rpf9jeGg9r3cmMguFXHtziqz` (Hobby plan) and link to `itsfahadahmed1234-creator/flame-chick-platform`. Existing project domains are verified:
- Website: `flamechick.vercel.app` (canonical customer hostname) and generated project alias.
- POS: `flamechickpos.vercel.app`.
- Admin: `flamechickadmin.vercel.app`.
- Rider: `flamechickrider.vercel.app`.

### Preview deployment results
The first API-created POS deployment was canceled because the project-level Ignored Build Step ran `exit 0`; this was a project build setting, not an application compile failure. Cleared the ignored-build-step command (set to null) for all four intended app projects and verified the project updates. Set the correct app root directories:
- `apps/flame-chick-website`
- `apps/flame-chick-pos`
- `apps/flame-chick-admin`
- `apps/flame-chick-rider`

Created isolated preview deployments from branch `work/production-source-audit`, commit `30d960c623d66e8a49a37c8180d5bb57f3919ab6`. These are **preview target=null**, not Production targets; no production alias/domain was assigned:
- Website: READY — https://flame-chick-website-production-7r06lrwbu-fahad-7455.vercel.app (deployment `dpl_HZ1Bz1qdww9jqSTiovkwRfLZLqU8`)
- POS: READY — https://flame-chick-pos-production-h5shek378-fahad-7455.vercel.app (deployment `dpl_2sjv8qVthWH1TaWJvXrrccnd4Vjj`)
- Admin: READY — https://flame-chick-admin-production-hol0gu7i4-fahad-7455.vercel.app (deployment `dpl_48CK9TiY468Tyvhc6zzMmxbDFWcd`)
- Rider: READY — https://flame-chick-rider-production-cn2l2gex4-fahad-7455.vercel.app (deployment `dpl_AoAJvNZQLsBamhBGNWEspcvv3hRU`)

Each build log shows Git clone, `vercel build`, output deployment completed. This is a successful static-app preview wave, **not** proof that live backend functions or full workflows work.

### Hosting blocker diagnosed
Earlier Git-linked project deployments were `BLOCKED` with Vercel's team-configuration troubleshooting link. The Hobby team has one OWNER (`itsfahadahmed1234-creator`), while the historical `main` commit author was `befahad1234-cmyk`. Do not transfer repository ownership, alter billing plan, or disable protection as an automatic workaround. API-created preview deployments from the explicitly selected repo/branch/commit are READY. Team remains on Hobby; no plan upgrade was performed.

### Supabase/backend status verified
Project `adkrxfnawdiljhjaavnj` remains ACTIVE_HEALTHY in Mumbai, Free plan. Migration history currently ends at `20261124033433`; the candidate unified POS sync migration `20261124050000` is not present in the hosted migration history. Read-only counts: 1 restaurant, 1 branch, 0 orders, 0 order_items, 0 payments, 0 delivery_tasks, and 0 tables in `supabase_realtime`. No test customer/order data was added. One Edge Function is currently deployed: `flame-chick-staff-admin` version 1. Catalog, order API and delivery API are not deployed yet.

### Deployment must pause at backend configuration gate
- Vercel Production env lists are empty for all four app projects.
- Required Supabase Edge Function secrets are not yet configured/verified through the available connector; do not attempt to deploy functions that fail closed without service secret, branch ID, HMAC quote secret/phone secret, staff allowed-origin and invite redirect configuration.
- Supabase Auth Site URL/redirect allowlist and Edge Function secrets must be configured for `https://flamechickadmin.vercel.app` and `https://flamechickadmin.vercel.app/accept-invitation.html`.
- Website config still contains an owner/contact phone destination and public catalog media base; do not treat a ready static preview as customer ordering being ready. Verify source config and menu media before enabling checkout.
- No operational Realtime tables are currently in `supabase_realtime`. Architecture requires private authorized Broadcast; POS currently has broad legacy Postgres Changes subscriptions and Rider user-filtered Postgres Changes. Do not simply publish operational tables or enable broad subscriptions. Implement authorized server-side Broadcast + channel policies first.
- No Production schema migration was applied by this deployment wave; no Edge Function was deployed/replaced; no Auth settings/secrets were changed; no Realtime publication/policies were changed; no Vercel production deploy or alias cutover was performed.

### Next steps
1. Finish and review the hosted candidate operational/POS sync migration chain only after checking exact diffs against the successful disposable run; apply via a controlled release step.
2. Configure the server-only Supabase Edge Function secrets securely without exposing values in chat, source, Vercel client variables or GitHub.
3. Deploy and smoke-test catalog, order, delivery and staff-admin Edge Functions with correct JWT modes and exact CORS/origin allowlists.
4. Implement authorized private Realtime Broadcast, channel policies, app subscriptions and polling fallback; test branch/own-rider isolation.
5. Configure Vercel production environment variables only with public values required by each app; verify the apps use only publishable keys client-side.
6. Validate the preview deployments in browser and run API integration tests. Do not attach customer-facing production domain to preview.
7. Run the full manual test-order rehearsal (Dine-in, Takeaway, Delivery; offline IndexedDB and automatic reconnect; rider delivery; cashier COD/Card/Online-bank transfer payment collection; completed/history; role isolation; retries/failure recovery).
8. Only after manual rehearsal passes and explicit go-live approval, create a production-target deployment from a reviewed release commit and assign `https://flamechick.vercel.app` to that tested Website deployment.

Remember: Flame Chick is a new system under construction. Existing restaurant/branch foundation rows are present, but there are no customer/order/payment/delivery operational records. Deployment of static preview apps is not real-restaurant launch.


## HFP / Flame Chick demo architecture review — 2026-11-24

User explicitly asked to inspect the existing HFP and Flame Chick demo implementations and determine what can be adopted for Production Edge Functions, APIs and Realtime. Completed pinned-source review and added:
`docs/architecture/hfp-demo-reference-adoption-review-2026-11-24.md`
(commit `ba01cbc5c28c641a17ada87ee9f6370179d268df`).

Reference repository: `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`.
- HFP main pinned ref: `1b26a263767f37a767449a7493f53b666cd14df3`.
- HFP rider offers pinned ref: `becf1a407224ed7546f51823c1719d2c54a8d506`.
- Flame Chick demo pinned ref: `e32943f928a905914b4aad7abc90feabf39c0c70`.

Decision: selectively adopt domain-separated APIs, finite action routing and stable errors, rider offer lifecycle semantics, atomic offer acceptance/idempotency concepts, Realtime client lifecycle (session token refresh, channel cleanup, debounce/coalesce, reconnect refetch/manual fallback), and IndexedDB persistence/retry/reconciliation UX concepts.

Do NOT copy code wholesale:
- Demo Order API is nearly line-for-line HFP Order API and contains HFP-specific branch/RPC conventions; not a Production V3 implementation.
- Demo Delivery API is more adapted but still has legacy HFP-named RPCs, old schema and wildcard CORS.
- Catalog functions are schema V2 multi-table readers; Production uses V3 immutable published catalog snapshots.
- HFP/demo Realtime uses Postgres Changes and includes broad/unfiltered POS subscriptions to delivery offers/assignments; Production must use private Broadcast topics and DB-enforced authorization.
- Rider user-filtered Postgres Changes is a useful UX pattern but a client filter is not the security boundary; Production uses private per-rider topics authorized against auth.uid(), role/profile and branch.
- HFP POS has IndexedDB queue stores, retry/backoff and lost-response reconciliation ideas, but current `syncPending()` short-circuits when its API-ready flag is true and explicitly says cloud sync is not enabled. Flame Chick demo POS explicitly says local POS orders remain on-device and cloud sync is not enabled. Neither proves unified cloud sync.
- Production still needs one unified IndexedDB outbox for Dine-in, Takeaway and Delivery with stable local ID, monotonic revision, server-computed hash, idempotency, reconnect/backoff, lost-response reconciliation and ack-before-removal.

No Production schema, function, secret, Auth, Realtime publication or Vercel configuration was changed during this review. This is a documented architecture assessment only.

Next: use the review to finish deployment safely. Preserve current V3 Catalog and Order API contracts; configure secrets; deploy/test the Production functions; implement private Broadcast/outbox and replace raw Postgres Changes; integrate the unified POS outbox; then manual test-order rehearsal before real restaurant go-live.


## 2026-11-24 — Unified POS sync migration applied to the empty Production database

Following the documented successful disposable local Supabase behavioral workflow #68, applied the reviewed unified POS sync migration to the hosted Flame Chick Production project `adkrxfnawdiljhjaavnj` via the controlled migration action.

- Applied migration version: `20261124082809`
- Migration name: `flame_chick_unified_pos_order_sync_v1`
- GitHub migration source: `supabase/migrations/20261124082809_flame_chick_unified_pos_order_sync_v1.sql`
- Source commit: `bb2bd26d6143383165076e320ca35952990d71cf`
- Removed superseded source-only candidate `20261124050000_flame_chick_unified_pos_order_sync_v1.sql` to prevent duplicate replay/conflicting migration history (commit `6eb1e3954cd78bd7946a049fa8eeb312476708cb`).

Post-apply verification:
- Hosted migration history records `20261124082809`.
- `public.flame_chick_sync_pos_order(jsonb)` exists.
- `service_role` can execute it.
- `anon`, `authenticated`, and `PUBLIC` cannot execute it.
- `service_role` has no direct INSERT/UPDATE on `public.orders`.
- Operational order/payment/delivery-task counts remain zero.
- No test customer, staff, order, payment or delivery rows were inserted.
- The Disposable SQL behavior suite was not run against hosted Production because its fixture preflight intentionally conflicts with the already-existing Flame Chick tenant. Workflow #68 remains the source of disposable behavioral verification; hosted verification was read-only.

Security advisor now reports 51 informational `rls_enabled_no_policy` notices across private/locked tables plus one warning for disabled Auth leaked-password protection. The RLS-enabled/no-policy pattern is intentional for tables with no direct browser access and tightly scoped server RPC access; do not add broad permissive policies to silence the linter. Review/record this distinction in final security readiness. Performance advisor reports unindexed foreign keys, including the new outbox branch FK; address with a reviewed index migration after the functional release. No security advisor error/high/critical finding was reported in this output.

### Deployment state update
- Catalog Edge Function deployed as version 1, `verify_jwt=false`, with both `index.ts` and `publication-read-contract.mjs`.
- Catalog deployment SHA: `9705e9a3da2609276f1bf0d5086a298cdeed8eb8d937f3c2c43ff1fc6269fbee`.
- Existing Staff Admin remains version 1, which is stale relative to current source: its deployed file set omits `catalog-actions.mjs` while current GitHub source imports it. It must be redeployed with the complete dependency bundle.
- Order and Delivery functions remain undeployed.
- Catalog publication #2 is V3 and present; branch ordering is disabled intentionally; only one active Admin role exists; there are no active Rider profiles. Do not enable website checkout or attempt live Rider workflow before branch/menu/role configuration.
- Realtime authorization baseline: `realtime.messages` exists with RLS enabled; zero policies and zero publication tables. No operational Broadcast implementation has been applied. Do not add broad policies or raw Postgres Changes publication.
- Required secrets cannot be safely inspected/set with the available Supabase connector. Do not deploy functions that depend on unverified secrets or echo secret values. Need secure dashboard/CLI secret configuration and exact environment names from source.


## 2026-11-24 — Production API rollout and POS integration audit (continued)

### Hosted database and functions
- Unified POS sync migration applied as `20261124082809_flame_chick_unified_pos_order_sync_v1`; see prior entry. The earlier duplicate candidate file `20261124050000_...` has been deleted from the current branch. It appeared in one earlier workflow run for commit `bb2bd26...` because that run was created before the deletion commit; it is not present at current branch HEAD.
- Catalog Edge Function deployed ACTIVE version 1 with its `publication-read-contract.mjs` dependency, `verify_jwt=false` for public read-only catalog.
- Staff Admin Edge Function redeployed ACTIVE version 2 with all three source files: `index.ts`, `origin-policy.mjs`, `catalog-actions.mjs`; `verify_jwt=true`.
- Order API and Delivery API are still not deployed. Their current sources use wildcard CORS. Before deployment, replace wildcard CORS with exact origin allowlists (website canonical origin, POS/Admin/Rider production origins, and only explicitly authorized preview origins) while preserving JWT + database role checks. Catalog is read-only and may retain public wildcard CORS.
- Order API needs `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` and `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` for website quote/rate-limit features. Do not enable website checkout until these secrets and branch config are set. POS sync route uses `action=sync_pos_order` and server-derived Auth actor/branch.
- Supabase connector available here cannot set or safely verify Edge Function secrets. Do not guess secret values, echo them, put them in source/Vercel public variables, or deploy website checkout as ready without configuration.

### Latest CI results
Current branch head at this point: `6eb1e3954cd78bd7946a049fa8eeb312476708cb`.
- Edge Function static checks: PASS, run `45356673455`.
- Catalog publication validation QA: PASS, run `45356673371`.
- Catalog V3 importer/local database QA: PASS, run `45356673366`.
- Staff Admin role-boundary QA: run `45356673505`; all substantive steps passed (full migration replay, ACL/RLS, Admin/Owner/Manager/Cashier/Rider authorization, delivery lifecycle, website API idempotency/rate quotas, Rider Web Push fail-closed, actual Website Order API integration, simultaneous rider accept/decline/expiry race). At last poll, only disposable Supabase teardown/cleanup was still in progress. Recheck final run conclusion before proceeding.
- Earlier failures for commit `bb2bd26...` were caused by both old and replacement POS sync migration files being present simultaneously; the replacement's preflight correctly detected the RPC created by the old file. The current branch deletes the old file, and all three latest database/edge static workflows on `6eb1e395...` pass. Do not report the old-commit failures as current HEAD failures.

### Critical POS source audit — unified sync is not yet wired
Inspected `apps/flame-chick-pos/index.html`, `catalog-v3-adapter.js`, `payment-collection.js`, the current Order API, and `flame-chick-order-pricing.mjs`.
- POS already fetches and caches the published V3 catalog via Catalog API and `FlameChickPosCatalogV3.adapt`; old V2 cache is explicitly discarded. Product variants use V3 UUID IDs.
- However, `saveLocalOrder()` currently contains a guard that blocks placing orders whenever a V3 snapshot is loaded: “V3 staff order pricing and synchronization must be connected before placing orders; no legacy V2 order will be submitted.”
- Existing `syncPending()` returns early to `syncPendingPosDeliveryOrders()`; this only handles Delivery. Dine-in and Takeaway remain local-only. The legacy generic Apps Script sync branch is unreachable when `FLAME_CHICK_ORDER_API_READY=true`.
- Current POS Delivery submission still uses old `action:'create'` and a LOCAL-prefixed ID; the new Production API requires `action:'sync_pos_order'`, UUID `local_order_id`, positive `local_revision`, and V3 catalog publication/version IDs. Current POS local IDs are `LOCAL-...`, which fail the API UUID contract.
- Current V3 deal cards are intentionally disabled (`renderDealCard` sets `orderable=false`), and `openPOSDeal()` reads the legacy `catalogSnapshot.dealComponents` shape. The current published V3 snapshot has 25 products, 28 variants, 6 deals, 6 deal variants, 18 component groups, 0 modifier groups, 0 delivery areas. Deal selection must be updated to V3 component-group/option IDs before deal orders can sync.
- Product sync payload must use API contract fields `product_id`, `product_variant_id`, `modifiers:[{modifier_group_id,modifier_ids:[]}]`; deal sync uses `deal_id`, `deal_variant_id`, and `component_groups:[{component_group_id,components:[{component_option_id,product_id,product_variant_id,quantity}]}]`. Server recomputes prices from the immutable V3 publication; never trust POS prices.
- Dine-in maps to `dine_in`, Takeaway to `pickup`, Delivery to `delivery`. Dine-in additionally needs table reference/label and optional schedule fields.
- New local orders must use stable UUIDs and monotonic `local_revision`. Existing LOCAL-prefixed offline rows must be migrated in IndexedDB without loss (retain legacy ID for traceability), before they can be submitted. Keep the local order and queue until server confirms matching UUID + revision. Retry/lost-response reconciliation must use the new API/server local-order lookup, not the old Apps Script `syncCheck` or fingerprint fallback.
- Delivery creation must use the same unified `sync_pos_order` path as Dine-in/Takeaway. Rider delivery state remains in Delivery API; after Rider marks Delivered, cashier's existing popup (COD/Card/Online-bank transfer) calls `collect_payment`; order completes and moves to history only after server confirms zero balance. Do not collect delivery payment at Rider Delivered event.
- `payment-collection.js` already implements the three requested method labels and idempotent full-balance request contract; retain it and verify server completion/history transition.
- POS code references `startFlameChickRealtime()` / `stopFlameChickRealtime()` but no implementation definition was found in `index.html` or other app files. Add a real private Broadcast client lifecycle; do not leave login path calling undefined functions.
- Rider currently uses rider-filtered Postgres Changes subscriptions. Replace with private `fc:rider:<auth.uid()>` Broadcast subscription; retain token refresh, channel cleanup, debounced API refresh, reconnect/manual fallback. POS should subscribe to private `fc:branch:<branch_uuid>:pos`.

### Live project configuration blockers
- Current V3 catalog publication #2 exists. Branch website ordering remains disabled intentionally.
- No delivery areas are configured; there are zero rows in `public.delivery_areas` and the branch Not Listed default fee is NULL. Delivery order creation must remain blocked until Admin configures delivery fees.
- Only the Admin role exists; no Owner, Manager, Cashier or Rider profiles have been configured yet. Do not create roles/accounts without the user's approved invitations/setup process.
- Browser inspection of the previews showed: Website static preview had an unsupported/unavailable V3 catalog message and displayed legacy fallback menu items, with checkout failing before Catalog deployment. Recheck after Catalog deployment; remove/hide legacy fallback rather than presenting old menu data if V3 API fails. POS preview is behind Vercel Authentication/SSO. Rider preview showed Failed to fetch because Delivery API is not deployed. Admin preview loaded but is not proof of backend readiness.
- The existing `flamechick.vercel.app` tab still served the older public site. Do not assume custom domain has been cut over to the new preview. Keep it untouched until the new V3 website/API is validated and user explicitly approves production alias cutover.

### Exact next implementation sequence
1. Recheck final conclusion of run `45356673505` and current HEAD workflow status.
2. Implement POS V3 deal selection (variant + component groups/options) and one unified IndexedDB outbox for all three fulfillment types. UUID migration for legacy local IDs; revision/hash/idempotency; retry/backoff; lost-response reconciliation; no queue deletion until matching server acknowledgement.
3. Update POS receipt/payment flow: Dine-in saves open check then syncs; Takeaway syncs on receipt confirmation with appropriate cashier-confirmed payment; Delivery syncs unpaid and waits for Rider Delivered then cashier method selection and collection. Preserve the already built COD/Card/Online-bank popup.
4. Add automated client/API tests for all fulfillment types, deal selections, offline/reconnect, duplicate/reordered requests, local ID migration, payment idempotency and completed/history behavior. Run local disposable Supabase behavioral workflows before further Production changes.
5. Implement private Realtime RLS authorization + server-only Broadcast triggers/events and replace missing POS Realtime function and Rider Postgres Changes. Test branch isolation, own-rider isolation, no client publish, reconnect.
6. Fix exact CORS origins and configure Edge Function secrets securely; deploy Order and Delivery APIs only after these prerequisites.
7. Configure delivery areas/default fee and approved staff accounts; then test all four apps.
8. Run manual synthetic test-order rehearsal before real restaurant launch. Keep the real customer domain off the unverified preview and preserve the current empty operational dataset until rehearsal strategy is approved.

No customer/order/payment/delivery records were created in this stage.


## 2026-11-24 — POS unified V3 sync implementation and API deployment pass

### Implemented on `work/production-source-audit`
- Added `apps/flame-chick-pos/sync-v3.js`: a pure V3 payload/identity adapter. It preserves the existing IndexedDB `localOrderId` receipt key, adds a separate stable UUID `syncOrderId`, carries monotonic `localRevision`, maps Delivery/Takeaway/Dine-in to `delivery`/`pickup`/`dine_in`, and refuses stale publications, invalid product/variant/modifier IDs, invalid deal variant/component selections, and mismatched server acknowledgements. Client prices/totals are not submitted as pricing authority.
- POS now uses one `syncPendingUnifiedPosOrders()` path for all POS fulfilment types. IndexedDB orders and queue records are retained until the API confirms the same sync UUID and revision. Transient/network errors back off and retry; permanent 4xx/catalog conflicts are retained as `needs_review`, never silently deleted. Existing LOCAL receipt keys remain intact.
- Delivery is queued immediately and remains unpaid; the delivery payload takes its area UUID and fee from authenticated branch configuration, not the immutable menu publication. Not Listed requires a locality and a configured branch default fee.
- Takeaway is saved locally first and queued after cashier receipt confirmation; a selected counter payment is carried as a separate idempotent payment request in the same server sync command. Dine-in checks queue on save; table reference and scheduling fields are sent to the server. The existing Delivery post-delivery Cashier payment popup (COD/Card/Online-bank transfer) remains the separate collection path.
- Replaced disabled V3 deal cards with the V3 deal-view model and component-group/variant selection UI.
- Added a branch-scoped authenticated Order API view `pos_delivery_context` for delivery area/default-fee settings.
- Restored a POS Realtime lifecycle with a private branch channel and automatic polling fallback. Current hosted Realtime has no `realtime.messages` policies and no Broadcast publisher/triggers, so private subscription will not be considered operational until that separate authorization/publisher work is completed; polling fallback is the reliable current refresh mechanism.
- Added `tests/pos-unified-sync-v3.test.mjs`, deployment-bundle parity tests, POS source hygiene checks, and CI coverage for the disposable unified POS SQL behavior suite. The disposable SQL suite exercises Dine-in, Takeaway, Delivery, payment idempotency and rollback.

### CI verification
- POS/Rider static checks passed on commit `51805cd5e80067d4dbe2b25811c54b031b22476b`: run `45362269181`.
- Disposable Supabase full role-boundary + unified POS SQL behavior suite passed on commit `f438d4e0ec65251eb1f5f228f88d7002e3c5a0c0`: run `45362226277`. The unified POS behavior step passed.
- Latest Edge Function static/type/integration checks passed on commit `c35fd9af61cd5162f09e43faca78102b9beff426`: run `45363516078`.
- The preceding Edge check `45363246346` failed only because the new deployment-bundle test incorrectly expected side-effect imports to use `from`; corrected to `import "./..."`, and the later run passed.
- Latest branch HEAD after this pass: `c35fd9af61cd5162f09e43faca78102b9beff426`.

### Supabase Edge Functions deployed
Hosted Flame Chick project `adkrxfnawdiljhjaavnj`:
- `flame-chick-order-api`: ACTIVE version 1, self-contained five-file bundle (entrypoint, catalog V3 validator, deal-view module, trusted pricing module, quote-token module), `verify_jwt=false` because the handler performs its own publishable-key + Auth bearer-token validation.
- `flame-chick-delivery-api`: ACTIVE version 1, `verify_jwt=false` because the handler performs its own publishable-key + Auth bearer-token validation.
- The Order API source bundle now imports only same-function local files; parity CI verifies the bundle files stay byte-identical to canonical shared modules.
- These deployments are not yet declared production-operational: function secrets have not been securely verified/set through the available connector, CORS still uses wildcard origins, and no authenticated end-to-end invocation has been performed from the deployed POS.
- Catalog API remains ACTIVE version 1; Staff Admin remains ACTIVE version 2 with its required dependencies.

### Hosted Production remains empty
Read-only verification after deployment:
- `orders=0`, `order_items=0`, `payments=0`, `delivery_tasks=0`, `delivery_offers=0`.
- Active staff role rows: 1 (Admin only); active Rider profiles: 0.
- Active delivery areas: 0.
- Main branch website ordering/delivery/pickup flags are false; Not Listed delivery fee is NULL.
- No synthetic customers/orders/payments/delivery records were created in hosted Production.

### Explicit blockers — do not bypass
1. `public.flame_chick_update_order_status(jsonb)` is absent in hosted Production (read-only `to_regprocedure` check returned false). The Order API status route currently calls this missing RPC. Kitchen status buttons must not be treated as working until a reviewed row-locked, role/branch-authorized status migration + disposable tests are implemented and applied.
2. Delivery cannot be tested end-to-end until Admin configures at least one active delivery area and the Not Listed default fee; the branch currently has zero active areas and NULL default fee.
3. Rider workflow cannot be rehearsed until an approved Rider Auth user, role and active rider profile are configured.
4. Private Realtime currently has zero `realtime.messages` policies and zero tables in `supabase_realtime`; no server Broadcast publisher/trigger exists. The POS has polling fallback, not completed Realtime delivery.
5. Order/Delivery functions still use wildcard CORS. Before public app launch, restrict to verified Website/POS/Admin/Rider origins. Do not guess preview domains.
6. Do not enable public website ordering; branch flags are deliberately false. Website HMAC secrets for quote signing and phone digest must be set securely before checkout is enabled.
7. Vercel POS preview workflow remains skipped by its current guard; this pass deployed Supabase Edge Functions, not a Vercel app release or production alias cutover.

### Next exact steps
- Implement and test the missing order-status RPC using explicit state-transition/role rules from the approved operational workflow; run the disposable local Supabase suite first, then apply the versioned migration to empty hosted Production.
- Fix CORS and configure/verify Edge secrets through secure Supabase Dashboard/CLI handling (never print secret values).
- Complete private Broadcast policies + server-only publishers or keep polling as the supported fallback.
- Configure branch delivery areas/default fee and approved staff accounts.
- Deploy/validate POS preview, then run the manual synthetic-order rehearsal for Dine-in, Takeaway and Delivery (including offline/reconnect, payment and history) before any real restaurant launch.

No customer, order, payment or delivery rows were created in hosted Production during this pass.


## 2026-11-24 — Order status RPC implementation (in progress)

- Added versioned candidate migration `supabase/migrations/20261124101500_flame_chick_order_status_commands_v1.sql`.
- Implements service-role-only `public.flame_chick_update_order_status(jsonb)`, with row locking, branch-scoped staff authorization, validated transitions, audit history, request replay handling, and reason-required reject/cancel.
- Allowed staff kitchen transitions: new/needs_confirmation → accepted → preparing → ready. Ready Takeaway → collected; Ready Dine-in → served.
- Cashier cannot cancel; Admin/Owner/Manager can cancel only before rider dispatch and only with a reason. A paid order cannot be rejected/cancelled through this route. Delivery rider pickup/delivered/failed/return and payment collection remain in their dedicated RPCs.
- Updated POS board: Dine-in Ready now offers **Mark Served** (not Takeaway Collected); Served orders remain visible pending payment/completion.
- Extended disposable POS SQL behavior test with Dine-in kitchen transition, Served timestamp, request idempotency, Cashier cancellation denial, and Manager cancellation audit. Updated POS source-hygiene assertions.
- POS/Rider static checks passed on latest source commit `716ae15863794f0a1a5cc893be43ffccb2110c93`: run `45372567729`.
- Disposable full migration replay + unified POS behavior QA is running on that exact commit: run `45372567275`. Do not apply the candidate migration to hosted Production until this run passes.
- Previous migration replay failure on run `45372137450` was caused by the migration ACL assertion using uppercase role name `PUBLIC`; PostgreSQL requires lowercase `public` for `has_function_privilege`. Fixed in the latest candidate migration. That failed run predates the fix and is not the current validation result.
- Hosted Production remains unchanged by this status-command pass; no customer/order/payment fixtures were inserted.
- Next: obtain run `45372567275` result; fix any migration or behavioral test failure; only after green local disposable replay, apply the migration to empty hosted Production, verify RPC ACL and API status path, then continue delivery config, Realtime and manual synthetic order rehearsal.


## 2026-11-24 — POS order-status RPC applied to Production; verification checkpoint

**Production project:** `adkrxfnawdiljhjaavnj` (Flame Chick Production, ap-south-1, Free)  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`

### Exact continuation and CI evidence
- The unfinished task was the missing `public.flame_chick_update_order_status(jsonb)` RPC used by the POS Order API status route.
- Candidate migration SQL was read from the branch and matched the disposable QA implementation.
- GitHub Actions disposable full role-boundary + unified POS behavior run **45372567275** completed with conclusion **SUCCESS** on implementation commit `716ae15863794f0a1a5cc893be43ffccb2110c93`. All listed steps passed, including complete migration replay, staff ACL/RLS, role authorization, delivery lifecycle/physical return, unified POS Dine-in/Takeaway/Delivery/payment idempotency, website order API integration, Rider push fail-closed, concurrency race tests and disposable stack cleanup.
- POS/Rider static checks run **45372567729** passed on the same implementation commit.
- The current branch head at time of handoff update had two later commits that changed only these two handoff documents; compare confirmed no implementation files changed after the tested implementation commit.
- The SQL migration was applied to hosted Production through the Supabase migration action. Supabase generated the authoritative migration version **`20261124102922_flame_chick_order_status_commands_v1`**. The candidate source file was then renamed to `supabase/migrations/20261124102922_flame_chick_order_status_commands_v1.sql`; the old `20261124101500_...` file was deleted. Do not restore or reapply the old filename.

### Post-apply Production verification — PASS
- Project status: `ACTIVE_HEALTHY`, PostgreSQL 17.12.
- Production migration ledger now contains 35 entries, including `20261124102922_flame_chick_order_status_commands_v1`.
- `public.flame_chick_update_order_status(jsonb)` exists.
- Function owner is `postgres`; `SECURITY DEFINER` is enabled; function config has an empty search path.
- EXECUTE is granted to `service_role`; EXECUTE is denied to `anon`, `authenticated` and `PUBLIC`.
- Required operational dependencies exist: orders, order_status_history, delivery_tasks, delivery_task_offers, delivery_task_events and `app_private.flame_chick_delivery_staff_role(uuid,uuid,uuid)`.
- Production order count and order-status-history count remain **0**. No test/business order was inserted.
- Security advisor currently reports 51 INFO `RLS Enabled No Policy` findings and 1 WARN for disabled Auth leaked-password protection. These are not to be described as zero lints; review/remediate separately without adding broad policies.

### Important verification boundary
The disposable behavioral workflow passed before the final migration filename was aligned to the server-generated version. The SQL body was not changed by the rename, and Production ACL/existence checks passed, but rerun the full disposable migration replay/behavior workflow against the renamed current branch before treating the current HEAD as fully CI-green. No live behavioral request has been sent to the new RPC; Production has no order fixtures and the RPC's role/state behavior remains supported by disposable QA, not a live order test.

### Exact next steps
1. Re-run the full disposable Supabase migration replay and unified POS behavioral workflow on current branch HEAD; inspect all job steps and fix any issue before more rollout.
2. Read the current Order API status handler and confirm the request payload maps exactly to the new RPC contract, including trusted actor ID, request UUID, status strings and error mapping. Do not change API behavior by assumption.
3. Add a safe authenticated synthetic fixture path in disposable QA to exercise the deployed SQL contract; do not create hosted Production test orders.
4. Continue launch blockers: verified CORS allowlists for Order/Delivery functions, securely set/verify required Edge secrets without displaying values, private Realtime authorization/publishers or documented polling fallback, delivery-area + Not Listed fee configuration, approved staff role setup, POS app deployment and manual synthetic end-to-end rehearsal.
5. Do not enable public website ordering, switch customer domains, or start real restaurant operations until the manual rehearsal is complete and the user approves. Keep the real customer domain untouched. GST remains deferred.
6. Preserve the payment rule: Rider Delivered is not payment collection; Cashier selects COD/Card/Online-bank transfer and confirms full collection before order completion/History.

**No real customer orders, payments or delivery records were created by this status-RPC rollout.**


## 2026-11-24 — POS status RPC idempotency payload integration fix (CI pending)

- Read the currently deployed `flame-chick-order-api` version 1 source, not just the handoff. The handler authenticates the staff user through Supabase Auth and derives `actor_user_id` from the verified Auth response; it calls `flame_chick_update_order_status` through service-role PostgREST using `p_payload`.
- Audited the POS `updateOnlineOrderStatus()` call site. It previously sent order ID/status/reason but omitted the optional RPC `request_id`, causing the SQL function to generate a fresh UUID server-side.
- Corrected `apps/flame-chick-pos/index.html`: each status mutation now creates `requestId: crypto.randomUUID()` and includes `request_id: mutation.requestId` in the Order API request. No database schema or live data changed.
- Added a source-hygiene test in `tests/ops-source-hygiene.test.mjs` asserting the status mutation creates and sends the request UUID.
- Commits: POS source change `89c950785bbf73ff5ae0a6a3870fba8da21337ce`; test addition `8f64002dd4ec31a2acaa76099cf64e706d4fefa7`.
- **CI for these two latest commits has not yet been inspected/confirmed.** The earlier static check `45372567729` and disposable behavior run `45372567275` passed on `716ae15863794f0a1a5cc893be43ffccb2110c93`, before the UUID integration fix and Production-generated migration filename alignment. Re-run/inspect the current-HEAD static and full disposable migration + POS behavioral workflows before declaring the current branch green.
- The deployed Order API version 1 still uses wildcard CORS and required Edge Function secrets have not been securely verified/set; this small POS payload fix does not resolve those deployment blockers.


## 2026-11-24 — Production system build rollout: database migrations and public V3 menu

**Important terminology:** This is the build-out of the Flame Chick Production system. No restaurant operation is currently running. Hosted Supabase is the intended production environment, but its empty operational tables are not evidence of live restaurant operations.

### Database migration state
- Verified hosted Supabase project `adkrxfnawdiljhjaavnj` migration ledger contains **35 applied migrations**.
- The repository currently contains the matching 35 versioned SQL migration files. The final applied version is `20261124102922_flame_chick_order_status_commands_v1`.
- The full operational schema is installed: catalog, staff roles, operational orders, delivery, payments, website order API, unified POS sync and order status commands.
- The catalog publication is already live in the database: Flame Chick publication **#2**, schema V3, **25 products, 28 variants, 6 deals**, checksum `8062b1961ee2c9e7668ed4039c9d2396c0fe66a7571a2591b1146eea113913c5`.
- Main branch is intentionally not accepting website orders yet: `website_ordering_enabled=false`, `website_delivery_enabled=false`, `website_pickup_enabled=false`; active delivery areas=0 and Not Listed default fee=NULL. Do not flip these flags until branch fulfilment and end-to-end checkout rehearsal are completed.
- No customer/order/payment/delivery operational fixtures have been created. The current environment is still being built and rehearsed.

### Public website catalog publication
- Root homepage `apps/flame-chick-website/index.html` previously loaded the legacy V2 catalog client against the published V3 API and fell back to hard-coded legacy menu markup. That stale embedded menu and its legacy catalog loader have now been disabled; homepage menu/CTA links point to the current published V3 menu.
- Added `apps/flame-chick-website/menu.html` and `js/public-menu-v3.js`: read-only public menu page. It fetches the immutable V3 publication through the public catalog API, verifies publication metadata/checksum using the existing V3 client/validator, renders current products/variants and scheduled deal variants, and offers branch selection. It contains no cart, quote, checkout, or order-write path.
- This keeps the public menu visible without exposing a checkout that cannot yet accept orders safely. Homepage copy now states that online checkout is not enabled yet; do not claim customer ordering is live.
- Added the new public menu JavaScript to website syntax CI.
- Website static workflow **45377068545** passed on homepage-correction commit `5653713cd6a41f6efe3954691a41f9c573d721ac`; all syntax, catalog regression, preview regression and inline-script checks passed.
- Website static workflow **45376873630** also passed for the initial V3 public-menu module.
- Vercel Production deployment **READY**: `dpl_GCFHz8afyKw4d7z95ofwBZJoQZ2B`, commit `5653713cd6a41f6efe3954691a41f9c573d721ac`. Production aliases now map to this deployment, including public custom domain **`https://flamechick.vercel.app`** and `flame-chick-website-production-six.vercel.app`.
- Public menu URL: **`https://flamechick.vercel.app/menu.html`**. Root homepage URL: **`https://flamechick.vercel.app/`**.
- A staging build `dpl_HvRANAF51hQoZbjLzoVbx7gdfCGZ` also reached READY before the Production deployment. The current Production deployment was built from the exact reviewed branch commit, not promoted from staging.
- Verification boundary: Vercel reports the Production deployment READY and the custom-domain alias assigned. Website static tests passed. A browser-level visual/network smoke test of the newly live `/menu.html` has **not yet been recorded**; do not claim that runtime rendering has been manually verified until that check is done.

### POS status request idempotency integration
- `apps/flame-chick-pos/index.html` now generates a UUID for each status mutation and sends it as `request_id`.
- `tests/ops-source-hygiene.test.mjs` checks the UUID is created and sent.
- POS/Rider static workflow **45375639994** and Staff Admin role-boundary QA **45375639906** passed on commit `8f64002dd4ec31a2acaa76099cf64e706d4fefa7`.

### Exact next steps
1. Perform a browser-level smoke test of `https://flamechick.vercel.app/` and `https://flamechick.vercel.app/menu.html`: verify the live V3 publication loads, all product categories/variants and deals render, no V2 fallback or stale hard-coded prices appear, and branch switching works if applicable.
2. Finish app/API launch readiness: CORS allowlists, secure Edge secrets, Admin/POS/Rider deployment verification, staff account setup, delivery area/default fee configuration and private Realtime or supported polling fallback.
3. Keep website checkout disabled until all checkout/fulfilment configuration is complete and a manual synthetic end-to-end rehearsal passes.
4. Run the complete manual rehearsal with clearly identified test orders and test accounts: Dine-in, Takeaway, Delivery, offline POS queue + automatic IndexedDB sync after reconnection, status transitions, Rider accept/reject/expiry/delivery, physical return, Cashier payment collection with COD/Card/Online-bank transfer, idempotent retries and Order History.
5. Preserve the rule: Rider Delivered does not mean payment collected. Cashier must explicitly select collection method and confirm full collection before the order is completed and moved to History.
6. GST remains deferred. Do not enable public order intake or represent the system as operational until rehearsal and user approval.

**No live restaurant operation or real customer transaction was started by this deployment.**


### Homepage final navigation correction — CI pending
- After the first Production website deployment, a final source review found that the homepage's dormant legacy Add/Cart action still routed to `order-online-v3.html`. Changed every legacy homepage action redirect to `menu.html`, relabelled the header control as Menu, and changed the bottom bar text to Browse the published menu. This ensures old embedded controls cannot lead customers to the unconfigured checkout route.
- Commit: `2c48be760af08d7242790eb7f5967109c1fb47a5`.
- Website static workflow **45377334847** and preview deploy workflow **45377334883** were triggered on this commit; at handoff update time CI is still running and preview workflow guard may skip it. The previous Production deployment `dpl_GCFHz8afyKw4d7z95ofwBZJoQZ2B` is READY on prior commit `5653713cd6a41f6efe3954691a41f9c573d721ac`. After current static workflow succeeds, create a fresh Vercel Production deployment for commit `2c48be760af08d7242790eb7f5967109c1fb47a5` so these final navigation corrections are live.


### Final public homepage navigation deployment — READY
- Current homepage final correction commit `2c48be760af08d7242790eb7f5967109c1fb47a5` passed Website Static Checks workflow **45377334847** (all syntax, core catalog regression, preview regression and inline-script steps successful).
- A fresh Vercel **Production** deployment was created from that exact commit and reached **READY**: `dpl_YJbH18Kd2MH9nkTb6rbfQVKYoK78`.
- Vercel confirms the custom domain alias `flamechick.vercel.app` is assigned to this newest deployment. Public menu remains `https://flamechick.vercel.app/menu.html`.
- This latest release includes the final change routing all homepage legacy Add/Cart controls to the read-only V3 menu and labels the header control as Menu.
- The deployment is published. Runtime browser-level menu rendering smoke test remains the outstanding website verification; static tests and Vercel READY/alias are not a substitute for that visual/network test.


## 2026-11-24 — Homepage V3 catalog + website checkout rollout (supersedes older disabled-checkout notes)

### User-approved storefront requirements
- The customer catalog must be embedded directly on the existing homepage, immediately below the large **Menu** heading. Do not route customers to `menu.html` or `order-online-v3.html`; no separate Menu-page button. The sentence “Browse the current published Flame Chick catalog, including current sizes and deals.” must not appear.
- Preserve the original V2 homepage visual identity and illustrated product-card treatment, but render names, descriptions, variants, prices, availability and deals from the current immutable V3 publication. No hard-coded catalog prices.
- Homepage V3 checkout must support both Delivery and Pickup.
- For now, customer-entered/unlisted delivery localities use a temporary **Rs. 150** fee. The server reads this from `branch_delivery_settings.not_listed_delivery_fee`; the browser does not submit a fee. The Owner will later configure named delivery areas and their individual fees through Admin. At this point Main has zero active named areas, so customers use the Not Listed / Other locality input and enter their locality/address.
- Existing secure quote → signed short-lived quote token → idempotent create order flow remains authoritative. Customer must see server-verified total before Place Order.

### Source changes and checks
- Homepage V3 checkout/catalog now occupies the Menu section and reuses V2 classes and card visual treatment (`cat`, `cat-pill`, `items`, `card`, `art`, `body`, `foot`), with product artwork from published image paths where available and Flame Chick product media/fallback illustrations otherwise.
- V3 product customizer, modifier selections, deal configurator, branch/fulfilment selection, delivery area/locality/address, cart, server quote, order submit, retry, and success UI are mounted on the homepage.
- Homepage header/menu/hero/feature CTAs now scroll to the embedded Menu section or cart. Removed the legacy V2 `js/catalog.js` loader and old page redirects. No links or redirects to `menu.html` or `order-online-v3.html` remain in the homepage.
- Removed the requested catalogue intro sentence. Kept the printed-menu GST notice; GST calculations remain deferred.
- V3 cart count is synced to the existing homepage cart badge.
- Replaced old website-source-hygiene assertions with V3 homepage integration tests, including dependency order, homepage embed, V2 visual card classes, server quote/commit flow, delivery locality selection, server-side fee validation, idempotent retry, and API CORS/branch flags.
- Website Static Checks workflow **45384177022** passed on commit `0a4394fe1533171cf9506cff980dad1e9fa28479`. All steps passed: JavaScript syntax, core catalog tests, preview tests, homepage inline-script parsing.
- Homepage HTML source audit: no duplicate element IDs; no separate menu/order page links; requested intro sentence absent.

### Hosted Supabase production changes
- Main branch `84b1b6dc-4fd1-45fa-8d9b-23d203b36cfd` now has `website_ordering_enabled=true`, `website_delivery_enabled=true`, and `website_pickup_enabled=true`.
- `branch_delivery_settings.not_listed_delivery_fee=150.00` on Main. No named active delivery areas exist yet. Server-side Order API reads the fee from this table; never trust client-supplied fees.
- Deployed `flame-chick-order-api` version **2** and `flame-chick-catalog` version **2**, both ACTIVE, using exact current repository source and their bundled local dependencies. The Order API CORS handler supports OPTIONS, GET and POST; previous 404 OPTIONS log entries were from before this redeployment.
- Do not change Edge Function JWT settings: these public APIs use their own publishable-key checks / public-read contract; Order API remains `verify_jwt=false` as before.

### Latest public Production deployment
- Vercel Production deployment **READY**: `dpl_J5y1tZeoBZfRAfxVkmjLTZ72jq6i`, source commit `0a4394fe1533171cf9506cff980dad1e9fa28479`.
- Vercel confirms alias `https://flamechick.vercel.app` is assigned to this deployment, along with the deployment's production aliases.
- Public root homepage: `https://flamechick.vercel.app/`. The customer catalog and checkout are embedded on this homepage below Menu.
- This deployment is the new source of truth and supersedes the earlier read-only `menu.html` rollout and all notes saying website checkout is disabled.

### Remaining verification — do not overstate readiness
- Browser-level live smoke test of the latest Production homepage and real network checkout was not completed in this session. The connected browser only had the older `/menu.html` tab open; the browser connector available here could read tabs but not navigate them. Container DNS/network access was unavailable. Do not claim that a real order was submitted or that live quote/create has passed.
- Earlier Supabase logs recorded OPTIONS 404 responses before Edge Function version 2 was deployed. After deployment, no fresh API request logs were returned in the checked window. Re-test browser preflight, `website_context`, catalog load, quote and create flow on the live site before treating customer checkout as fully verified.
- Do not create real orders during smoke tests. Use explicit disposable/test customer data and clearly mark test orders if the order API creates records.
- Check whether Admin exposes Owner-managed named delivery-area fees and test that saving one updates the same `delivery_areas` records read by the website.
- Run the full manual synthetic restaurant rehearsal before real operations: Delivery and Pickup website checkout; POS receive; offline POS queue and automatic sync; status workflow; rider accept/reject/expiry/delivery; return; Cashier payment collection with COD/Card/Online-bank transfer; idempotent retry; history. Rider Delivered is not payment collected; Cashier collection confirmation is still required before completion/history.
- Existing security advisor reports INFO `rls_enabled_no_policy` on 51 tables (including many private/internal tables intended to be inaccessible directly) and WARN leaked-password protection disabled. Review grants/RLS and Auth setting in the broader production-readiness pass; do not blindly add public policies to clear the informational lint.
- GST remains deferred. No real restaurant operations were started by this deployment.

### Exact next action
1. Open `https://flamechick.vercel.app/` in a browser and verify the embedded V3 menu/cards and Delivery/Pickup selection.
2. Verify the browser network preflight and Order API `website_context`, then perform one clearly labelled test quote/order in a safe test flow and verify the resulting order reaches POS. If any request fails, fix that exact blocker before enabling actual customer traffic.
3. Inspect Admin's named delivery-area management and Owner permissions, then complete the full manual rehearsal above.


## 2026-11-24 — Verified POS status workflow + current launch checkpoint

**Repository branch:** `work/production-source-audit`  
**Branch HEAD before this handoff entry:** `da6d9c1b7b6e1df50d907c1287458e567a497174`

### POS status workflow verification — COMPLETE
- The Production status-command migration is `20261124102922_flame_chick_order_status_commands_v1.sql`; hosted Production confirms the RPC exists with postgres ownership, SECURITY DEFINER, empty search_path, and EXECUTE granted only to service_role. The migration was applied and its Production ACL/object checks passed. Production still has zero orders and zero status-history rows.
- POS source commit `89c950785bbf73ff5ae0a6a3870fba8da21337ce` added a per-mutation UUID request ID to status updates; test commit `8f64002dd4ec31a2acaa76099cf64e706d4fefa7` added source-hygiene coverage.
- POS/Rider static workflow **45375639994** passed on `8f64002dd4ec31a2acaa76099cf64e706d4fefa7`.
- Full disposable Staff Admin Role Boundary QA workflow **45375639906** also passed on that same commit. Its successful job replayed the complete migration history and ran `supabase/tests/flame_chick_pos_order_sync_v1.sql`, which explicitly checks the status RPC exists, Dine-in new → accepted → preparing → ready → served, served_at, exact request replay, Cashier cancellation denial, and Manager cancellation with actor/reason audit. The same run also passed staff ACL/RLS, role-boundary, delivery lifecycle/physical return, unified POS sync/payment idempotency, website order API/quota, and concurrency checks.
- Therefore the previous statement that a full QA rerun after the UUID integration was still pending is superseded: **the current POS/status implementation was fully replayed and behavior-tested on commit `8f64002...`**.
- A comparison from `8f64002...` to the current branch HEAD showed subsequent changes only in website storefront files, website static workflow and the two handoff documents; no POS, Order API status handler, status migration or POS SQL behavior-test files changed after the passing QA commit. The current HEAD itself is a documentation checkpoint, not a new POS implementation build.

### Current deployment / launch boundary
- Website Static Checks workflow **45384177022** passed on website implementation commit `0a4394fe1533171cf9506cff980dad1e9fa28479`; the Production Vercel deployment `dpl_J5y1tZeoBZfRAfxVkmjLTZ72jq6i` was recorded READY for that commit, with homepage V3 catalog and checkout embedded below Menu, Delivery and Pickup, and server-side Not Listed fee Rs. 150.
- Do not infer that the restaurant is ready for live operations from CI or deployment status. Live browser checkout/order-to-POS verification and the full manual restaurant rehearsal remain required. Never create an unlabelled real customer order during testing.
- User has most recently reported being unable to enter Admin, POS and Rider. Treat successful staff login/role routing for the intended accounts as the immediate next operational blocker; inspect the actual Auth/session/role-gate and deployment routing before changing credentials or roles. Do not grant broader roles as a workaround.
- Other remaining launch checks include verified CORS allowlists, secure verification of required server-side secrets without displaying values, Owner-managed delivery-area configuration, Rider account/profile setup, Realtime or documented polling fallback, offline/reconnect sync rehearsal, payment collection, return workflow and History.
- Preserve: rider Delivered is not payment collection; Cashier must explicitly collect the full amount using COD, Card or Online/bank transfer before completion/History. GST remains deferred. Do not rebuild the POS, apply unverified migrations, enable untested customer traffic, or start real restaurant operations before the manual rehearsal and user approval.

### Exact next action
1. Resolve and verify Admin/POS/Rider sign-in and role routing for the existing intended accounts without changing role boundaries.
2. Run a controlled browser smoke test of the live homepage catalog/quote and a clearly labelled test order only if the test flow is isolated and approved; verify it reaches POS.
3. Complete the Dine-in, Takeaway, Delivery, offline/reconnect, rider, return, Cashier payment and History rehearsal. Update this handoff and `PROJECT_HANDOFF.md` after each verified stage.


## 2026-11-24 — Staff access/CORS recovery checkpoint

### Root cause evidence
- Production Auth logs show the existing Admin identity `itsfahadahmed1234@gmail.com` successfully authenticated at 11:27:02Z, 11:27:25Z and 11:28:03Z (Auth `/token` and `/user` returned 200). Earlier failed attempts at 11:26Z were `invalid_credentials`; do not reset the password based on those earlier attempts.
- Immediately after successful Auth, Staff Admin Edge Function v2 returned **OPTIONS 403** on three browser preflights (11:27:04Z, 11:27:26Z, 11:28:03Z). Thus at least the Admin failure was not an invalid password: the Staff Admin CORS allowlist rejected the browser preflight before the authenticated request reached the handler.
- Staff Admin source had an optional exact-origin allowlist environment setting; missing/incorrect configuration failed closed. Added `parseStaffAdminOrigins()` which always includes only the verified canonical production Admin origin `https://flamechicadmin.vercel.app`, while merging any explicitly configured exact HTTPS origins. Wildcards remain rejected. Added tests for missing environment fallback and exact-origin merging.
- **Production Staff Admin Edge Function v3 is deployed** with `verify_jwt=true`. Source includes index.ts, origin-policy.mjs and catalog-actions.mjs.
- CI after the patch: Admin Static Checks **45387619860 PASSED** and Edge Function Static Checks **45387619991 PASSED** on commit `23bf0f96e9416e8e3c3822edab5b70ec668e0bdb`; the Edge job includes TypeScript checks, actual Website Order API route tests and contract hygiene.
- The connected browser was showing generated Vercel deployment URLs rather than the canonical app domains. Verified custom domains: Admin `https://flamechicadmin.vercel.app`, POS `https://flamechicpos.vercel.app`, Rider `https://flamechicrider.vercel.app`. Staff Admin intentionally allows only the canonical Admin origin; use that exact domain, not the generated preview hostname. POS and Rider canonical domains should also be used for the smoke test.

### Roles and account readiness (read-only Production query)
- Active Flame Chick restaurant: 1; active branch: 1.
- Active Admin assignments: 1; Owner, Manager, Cashier and Rider assignments: 0.
- Active Rider profiles: 0.
- The existing Admin is allowed by the POS backend role resolver, so a dedicated Cashier account is not required for the Admin to access POS. POS browser currently showed an old `Invalid login credentials` message; Auth logs show failed attempts followed by successful login on the Admin identity. Re-test once on canonical POS domain with the same confirmed Admin credentials; do not reset password or create duplicate Auth users.
- Rider portal cannot activate until a Rider account has an active branch-scoped Rider role and matching active rider profile. Admin invitation/role assignment and rider profile provisioning still need a controlled setup step; do not invent an email/account or grant Rider role to Admin.

### Immediate next actions
1. User opens canonical Admin domain `https://flamechicadmin.vercel.app` and signs in with existing Admin account; verify Staff & Riders page loads without CORS error. If it still fails, capture exact visible error and check fresh Edge logs after v3.
2. Open canonical POS domain `https://flamechicpos.vercel.app`, sign in with same Admin account and verify staff context and Online Orders board. Do not treat cached old preview page error as current.
3. Create/assign separate Cashier/Manager/Rider accounts only when their real work email addresses are supplied/confirmed; Rider additionally requires profile setup. Keep Admin and future Owner distinct.
4. Continue controlled website checkout → POS, offline/reconnect, rider, physical return, Cashier COD/Card/Online-bank collection and History rehearsal. No real restaurant operation until the full manual rehearsal passes.

**Important:** No new business migration was applied in this recovery. Existing Production role data was read only. The CORS code change was tested and deployed as an Edge Function update.


## 2026-11-24 — Password recovery guidance (no password reset performed)

- The Rider app contains a public `Set / reset password` action and handles Supabase Auth `recovery` callbacks. After password update, it reads the user's active Flame Chick staff roles: Rider continues into Rider profile; Admin/Owner/Manager/Cashier is explicitly signed out of the Rider app and told to use the POS portal. This makes the Rider reset route a shared staff-password recovery route, not permission to use Rider as an Admin.
- If the existing Admin password is forgotten, open canonical Rider domain `https://flamechickrider.vercel.app`, enter the existing Admin account email, select `Set / reset password`, follow the newest recovery email on the same device, and save a new password of at least 8 characters. Then sign in to canonical Admin `https://flamechicadmin.vercel.app` and POS `https://flamechickpos.vercel.app` with that same account/email and new password. The recovery route validates the actual role and will not grant Rider access to an Admin account.
- No recovery email was requested or sent by the assistant; no password was changed. Avoid creating duplicate Auth users or granting Rider role to Admin.
- Earlier Auth logs showed successful Admin password login at 11:27–11:28Z, but that does not prove the user still remembers the password now. The subsequent Admin browser blocker was CORS and has been fixed in Staff Admin Edge Function v3. POS's previously displayed invalid-credentials error may be a mistyped password; re-test after recovery if needed.
- Production currently has one Admin role assignment, zero separate Rider role assignments, and zero active Rider profiles. Rider portal sign-in requires a separate real Rider account with active branch-scoped role plus rider profile.


## 2026-11-24 — Rider portal 404 / domain alias repair

- User reported `https://flamechickrider.vercel.app` returned Vercel `404 DEPLOYMENT_NOT_FOUND`. This was not an authentication/password error.
- Vercel audit found Rider project `flame-chick-rider-production` had the canonical custom domain registered and verified, but the domain had no deployment alias. Latest production-target deployment `dpl_CH2pMCcn9Rvm7Me6aD5nDoNEmftJ` on main was BLOCKED by Vercel team-configuration protection. Newer deployment `dpl_AoAJvNZQLsBamhBGNWEspcvv3hRU` from branch `work/production-source-audit`, commit `30d960c623d66e8a49a37c8180d5bb57f3919ab6`, was READY but had only a generated preview alias.
- Compared source from Rider deployment commit to current branch: no Rider app source changes since the READY deployment. Other changed files included POS, website, order API, migrations/tests and handoffs; those do not alter Rider app bundle. Do not promote the blocked main deployment.
- Repaired routing by assigning canonical alias `flamechickrider.vercel.app` to READY deployment `dpl_AoAJvNZQLsBamhBGNWEspcvv3hRU`. Vercel confirmed alias mapping: canonical domain -> that READY deployment ID. This fixes the identified missing alias. A direct external page fetch was not available from the inspection tool, so user must confirm browser rendering.
- User should hard-refresh/open `https://flamechickrider.vercel.app` now. If it renders login, password recovery can be initiated using the existing Admin email; the Rider app's recovery route routes non-Rider staff away from Rider after reset and does not grant Rider permissions. Rider sign-in still needs separate Rider role and active rider profile (Production previously had zero of each).
- Admin and POS links have not been re-verified in this repair. Keep using their canonical domains and diagnose separately if they fail.


## 2026-11-24 — Admin portal 404 / canonical alias repair

- User reported canonical Admin URL `https://flamechicadmin.vercel.app` returned Vercel `404 DEPLOYMENT_NOT_FOUND`. Verified Vercel project showed the domain registered/verified but no canonical alias assigned to a deployment. Root cause is deployment alias routing, not Auth credentials or CORS.
- Admin project latest READY deployment: `dpl_48CK9TiY468Tyvhc6zzMmxbDFWcd`, branch `work/production-source-audit`, commit `30d960c623d66e8a49a37c8180d5bb57f3919ab6`. The main production-target deployment was BLOCKED. Admin application source has not changed since the ready deployment; Staff Admin Edge Function CORS fix was separately deployed to Supabase v3.
- Assigned `flamechicadmin.vercel.app` to the READY Admin deployment. Verified Vercel alias lookup maps the canonical domain to `dpl_48CK9TiY468Tyvhc6zzMmxbDFWcd` (state READY). User must hard-refresh and confirm browser rendering.
- POS custom domain is also registered/verified but no canonical alias is currently present. Do NOT assign the existing ready POS deployment from commit `30d960c`: current branch has substantive later changes to `apps/flame-chick-pos/index.html` (+470/-402) and new `apps/flame-chick-pos/sync-v3.js` (+280), so it is stale. Build/deploy POS from current audited branch and validate CI before assigning canonical POS domain. POS latest ready deployment is not proof current POS source is deployed.
- Rider canonical alias was separately repaired earlier to its READY deployment from `30d960c`; its app source itself has no later source changes in current compare. Rider portal still needs actual browser confirmation and separate Rider role/profile.


## 2026-11-24 — POS canonical deployment alias repaired

- User confirmed canonical Admin portal opens after Admin alias was assigned to READY deployment `dpl_48CK9TiY468Tyvhc6zzMmxbDFWcd`.
- POS project `flame-chick-pos-production` had verified custom domain `flamechicpos.vercel.app` registered but no deployment alias, causing the same Vercel 404. POS app source had changed substantially after the older READY deployment, so that stale build was not assigned.
- Confirmed POS/Rider static workflow passed at commit `8f64002dd4ec31a2acaa76099cf64e706d4fefa7` (run `45375639994`). Compared that commit to current branch HEAD `1bbbd45f597847d03a7ec6cda0c64be16fd54661`: no POS or Rider app source changed after the passing workflow; only website, Staff Admin CORS, tests and handoffs changed.
- Created Vercel deployment `dpl_GVqLwxp6aLumC9eN5xhjsRMERmj7` from the current branch HEAD `1bbbd45f597847d03a7ec6cda0c64be16fd54661`, inheriting the existing POS project configuration/environment. Vercel build completed and state is READY.
- Assigned canonical alias `flamechicpos.vercel.app` to this READY deployment. Verified Vercel alias lookup maps the domain to `dpl_GVqLwxp6aLumC9eN5xhjsRMERmj7` and the deployment state is READY.
- User must now open `https://flamechicpos.vercel.app` and confirm login screen loads; then test sign-in using the existing Admin email/password (or password reset already described). A READY build and alias mapping are not equivalent to a browser login/functional smoke test.
- Do not claim full POS production readiness until POS login, incoming order board, order status RPC, payment collection and offline IndexedDB-to-Supabase sync are manually exercised.


## 2026-11-24 — POS login/order-board failure: missing tax_amount column fixed

### Root cause verified against Production
- User reported POS displayed `column order_items_1.tax_amount does not exist` after sign-in, then returned to the login gate.
- Production information_schema confirms neither `orders.tax_amount` nor `order_items.tax_amount` exists. GST/tax was explicitly deferred and no tax fields should be introduced now.
- Production Edge Function logs showed `flame-chick-order-api` version 2 returning HTTP 500 to authenticated `GET ?board=active&limit=100` at 12:36–12:37Z on Nov 24.
- Root cause: `readOrderBoard()` selected legacy/unimplemented parent and child fields: `orders.tax_amount`, `order_items.tax_amount`, as well as non-existent `service_charge`, `tip_amount`, `table_id`, and `table_number_snapshot`. Production uses `table_reference` and `table_label_snapshot` instead.

### Source fix, regression tests and deployment
- Updated `supabase/functions/flame-chick-order-api/index.ts` order-board select to match the existing operational schema. Removed tax/charge/tip and unimplemented table IDs/number fields; selected current table reference/label snapshots instead. No table/schema/business migration was applied.
- Added a contract regression test in `tests/edge-function-contract-hygiene.test.mjs` to require current fields and reject unsupported/tax fields in the order board select.
- Edge Function Static Checks run **45394870964 PASSED** on commit `3b786f76930d704b8b5168d9441465f6783e1ab2`; includes Deno type-check, synthetic actual Order API quote/checkout tests and Node contract tests. Admin Static Checks run **45394870914 PASSED** on the same commit.
- Production Supabase `flame-chick-order-api` successfully deployed as **version 3**, retaining `verify_jwt=false` (the function validates its own public/staff auth contract, unchanged from v2). Deployed bundle includes `index.ts`, `catalog-v3.js`, `catalog-v3-deal-view.js`, `flame-chick-order-pricing.mjs`, `website-order-quote-token.mjs`.
- Verified deployed function reports ACTIVE v3 and the corrected order-board select. A read-only comparison of all selected columns against Production `information_schema.columns` returned no missing columns for `orders`, `order_items`, `order_item_modifiers`, `order_item_components`, or `delivery_tasks`.

### Important POS UI behavior and remaining live check
- POS browser sign-in saves the authenticated staff session before loading the online order board. Its current catch block may still display the login gate when a downstream order-board request fails, even though the staff session was already saved. The original reported DB 500 is fixed in the server API; do not interpret a later downstream error as invalid password without checking status/logs.
- User must hard-refresh the canonical POS domain `https://flamechicpos.vercel.app` (Ctrl+Shift+R), sign in using the existing Admin account, and verify the login gate stays closed and the Online Orders board loads. This live authenticated test has not yet been confirmed after Edge Function v3 deployment.
- No real orders were created by this test. No business migrations or database writes were performed; only read-only schema inspection, source/test updates and Edge Function deployment occurred.
- GST remains deferred. Never add `tax_amount` or tax/charge fields merely to satisfy an old query. Do not rebuild the POS.

**Exact next action:** user hard-refreshes canonical POS, signs in with existing Admin credentials, confirms whether Online Orders board loads. If it still shows an error, inspect fresh version-3 Edge Function logs and exact response before changing code.


## 2026-11-24 — POS V3 catalog loading recovery

### User-visible issue and diagnosis
- User confirmed Admin login and POS login/order board work, but POS local catalog remains empty with notice `Menu could not be refreshed. Retry when online.`. The customer website's published V3 menu loads successfully.
- Production `flame_chick_catalog_public_read('flame-chick')` was checked read-only: published=true, publication #2, draft revision 92, schema V3, matching snapshot schema V3, valid 64-character SHA-256, valid UTC databaseNow, 25 products, 28 variants and 8 categories. No catalog republish or menu data changes were needed.
- Catalog Edge Function `flame-chick-catalog` is ACTIVE v2. POS browser log showed GET `action=health` returned HTTP 200. No subsequent POS `action=catalog` request was recorded, so the POS stops between health response and full-snapshot request; this is a POS frontend runtime/assets/configuration issue, not unavailable published menu data or staff credentials.
- POS source had been loading shared V3 contract/deal modules using paths `../flame-chick-website/js/catalog-v3.js` and `../flame-chick-website/js/catalog-v3-deal-view.js`, outside the independent POS Vercel project root. To make POS self-contained, copied the exact canonical files into `apps/flame-chick-pos/catalog-v3.js` and `apps/flame-chick-pos/catalog-v3-deal-view.js`, changed POS script tags to local `./catalog-v3.js` and `./catalog-v3-deal-view.js`, kept adapter loaded afterward, and updated test imports accordingly.
- Added regression test to `tests/pos-catalog-v3-adapter.test.mjs`: asserts both POS-local V3 bundles are byte-for-byte identical to website canonical modules and POS loads them before adapter without cross-project paths. Updated old source-hygiene assertions in `tests/ops-source-hygiene.test.mjs` to expect local paths.
- POS Vercel project setting corrected to `rootDirectory=apps/flame-chick-pos`, `sourceFilesOutsideRootDirectory=false`. No database migration/table changes; no catalog/menu publication changes.

### Verification and deployment
- POS/Rider Static Checks workflow **45402935904 PASSED** on commit `4d75c49126e46f2735c5daf9c49273ce835c3e82`; the Node source and POS catalog adapter suite completed successfully.
- Fresh Vercel POS deployment `dpl_ERAfkR984GdURXKnJ9WpP99T5QqZ` from branch `work/production-source-audit`, commit `4d75c49126e46f2735c5daf9c49273ce835c3e82`, reached READY.
- Canonical alias `flamechicpos.vercel.app` was reassigned from previous deployment `dpl_GVqLwxp6aLumC9eN5xhjsRMERmj7` to `dpl_ERAfkR984GdURXKnJ9WpP99T5QqZ`. Vercel alias lookup confirms canonical domain points to new READY deployment.
- Full disposable Staff Admin Role Boundary QA run **45402935896** on commit `4d75c491...` remains IN PROGRESS at last check. Do not mark full system rehearsal or database QA complete based on the POS static workflow.
- The browser still needs an actual post-deploy refresh and UI confirmation. User should Ctrl+Shift+R at `https://flamechicpos.vercel.app`, keep/sign back into the existing Admin account if required, then confirm Menu shows products. No POS order has been created for this test.

**Exact next action:** wait for the user to hard-refresh POS and confirm V3 products appear. If not, inspect fresh browser-visible notice and new Catalog Function logs; check whether the second `action=catalog` request is now present and its status. Do not change catalog data, create tax fields, apply migrations or rebuild POS without new evidence.


## 2026-11-24 — POS published deals missing after catalog recovery

### Diagnosis (Production read-only checks)
- User confirmed product catalog now appears in POS but published deals are absent. Customer website menu continues to load.
- Read-only Production RPC `public.flame_chick_catalog_public_read('flame-chick')` confirms published V3 snapshot contains 6 deals, 1 deal collection, 6 deal variants, 18 component groups, 18 component options and 18 variant-option mappings. Existing deal names include Flame Hour — The Injector + Cold Drink; Flame Hour — Quarter Broast + Burger + Cold Drink; Flame Duo; Flame Feast; Mini Flame; Little Crunch. No menu/catalog data changes or republish needed.
- Catalog Edge Function logs show POS health GET and full `action=catalog` GET both HTTP 200 at 2026-11-24 13:28:35–36Z. So the previous missing-script/asset issue is resolved; the POS now downloads the snapshot.
- Confirmed data-shape mismatch in POS renderer: the raw V3 snapshot uses canonical lower-camel fields such as `dealId`, `dealCollectionId`, `title`, and collection `categoryId`. POS renderer expects projected legacy display fields `DealID`, `Title`, `CategoryID`, `Active`, `Available`, etc. `catalog-v3-adapter.js` already correctly generates that display projection as `adapted.deals`, but POS was rendering/filtering `catalogSnapshot.deals` (raw rows), which have no `Active===true` or display `CategoryID` fields. Therefore product rows displayed while deal cards were filtered out.

### Source fix on branch
- Commit `560a30ab79ae0d96c63bb4d93ba81fe09f7d18dd`: introduce dedicated `posDeals` state, derive it from `adaptFlameChickCatalog(saved).deals` when restoring local IndexedDB snapshot, and assign `adapted.deals` on successful cloud refresh.
- Updated category grouping, category counts, and deal rendering to read `posDeals`, never raw `catalogSnapshot.deals`.
- Added regression test to `tests/pos-catalog-v3-adapter.test.mjs` requiring local and refreshed projection initialization and rejecting raw snapshot deal rendering.
- Test update commit `b4dd721d2f4f5a1cae27514e5b681194641dd5a5` (branch HEAD at handoff write).
- No database schema/migrations/data edits; no menu republish; no order created. GST/tax remains deferred.

### CI / deployment status at handoff update
- New POS/Rider static workflow run **45404679429** on commit `560a30a...` was IN PROGRESS at last check; Admin static workflow **45404679927** succeeded; full disposable Staff Admin Role Boundary QA **45404679684** was IN PROGRESS. Must retrieve final conclusions before deployment.
- Previous commit's POS/Rider Static Checks **45402935904** and Staff Admin Role Boundary QA **45402935896** passed, but those precede this deals fix and do not validate it.
- Do NOT deploy the deals fix until run **45404679429** passes. If it fails, inspect logs and fix tests before deployment.
- After CI passes, create a fresh Vercel POS deployment from current branch HEAD (the later test commit `b4dd721...`, not old `4d75c491...`), wait for READY, assign canonical alias `flamechicpos.vercel.app`, verify alias points to the new deployment, then ask user to hard-refresh and confirm deal cards and deal configurator.
- Important: previous POS Vercel project root is configured as `apps/flame-chick-pos`. Preserve this root setting and the local V3 runtime bundles.

**Exact next action:** check GitHub Actions run 45404679429. Only after success deploy current HEAD to POS and validate Flame Hour / Flame Duo / Flame Feast / Mini Flame / Little Crunch deal cards plus at least one deal configurator. Keep database untouched.


### 2026-11-24 follow-up — POS deal projection fix passed and deployed
- POS/Rider Static Checks **45404684277 PASSED** on latest commit `b4dd721d2f4f5a1cae27514e5b681194641dd5a5`, including the new test that POS uses the V3 adapter's projected deal rows rather than raw snapshot deals.
- Admin Static Checks **45404679927 PASSED** on commit `560a30a...` (shared source state before the final test-only commit).
- Fresh POS Vercel deployment **`dpl_Gj67JUEpNrUSuvKkG8DUyHV4r5HA` READY**, built from latest commit `b4dd721...` on `work/production-source-audit`. POS Vercel root directory setting remains `apps/flame-chick-pos`.
- Canonical alias `flamechicpos.vercel.app` was assigned to this new READY deployment. Alias lookup confirms `deploymentId=dpl_Gj67JUEpNrUSuvKkG8DUyHV4r5HA`.
- Staff Admin Role Boundary QA run **45404679684** was still IN PROGRESS at the last check (on parent source commit `560a30a...`). Must retrieve final status; do not claim full QA/rehearsal complete.
- User-facing confirmation still required: hard-refresh `https://flamechicpos.vercel.app`, open Menu, verify Deals category and six published deal cards appear, then open at least one deal and verify component choices/configurator work. Do not place an order as part of this check.
- No Production DB/schema/migration/catalog publication changes were made for the deals fix. The six deals were already present in the immutable published snapshot. GST remains deferred.


## 2026-11-24 — POS visual refinement and order-type startup correction

### User-requested changes
- User shared a live POS screenshot and requested: improve product/deal card typography and alignment; make Flame Chick wordmark/logo clearly red; show Delivery, Takeaway and Dine-in controls in that order; make Delivery the default when POS opens; show Delivery-specific fields first; show Table and Dine-in Mode/scheduling fields only after Dine-in is selected.
- Do not rebuild POS, change catalog content, create database migrations, add tax/GST fields, or create test orders.

### Source diagnosis and implementation
- The Dine-in order button was explicitly hidden in the markup (hidden attribute), even though it remained in the backing select and the JavaScript supported it. The POS init() function also overrode the HTML's Delivery default by setting the order type to Dine-in at startup. This caused the selector/fields to disagree.
- Removed the hidden attribute from the Dine-in button. Visible order selector order is Delivery → Takeaway → Dine-in.
- Updated the POS init() startup selection and setupCashierControls() initial fallback to Delivery. Existing Dine-in table selection/reopen routines intentionally still set Dine-in when an existing table/check is opened; those paths were preserved.
- Delivery-specific address/area/Not Listed locality controls remain governed by the existing updateOrderFieldsByType() function and now show at startup. Dine-in table and scheduling/mode controls remain conditional on Dine-in selection.
- Added targeted POS card styling: balanced grid/card dimensions, consistent image thumbnails, clearer product title/description typography, separated price/action footer, aligned action buttons, improved spacing and subtle hover treatment. Product/deal IDs, prices, configurator data and add-to-order handlers are unchanged.
- Changed long disabled deal action text (which overlapped deal prices/cards in the user's screenshot) to a compact Unavailable now status label with the full reason retained as a title/tooltip. Available deals retain Choose Deal.
- Applied a red color filter to the existing official brand SVG image in POS CSS; no logo asset was replaced.
- No database, RPC, Edge Function, order or catalog data changes. No migration applied and no test order created.

### Commits and CI
- UI commit: c35073a7b356130c77646fb0a310a0c41ee7747d — UI implementation.
- Test commits added and refined regression assertions. Final branch HEAD at this update: 72f2977adf0d3b64d8a3e67edc2761ab4da39e9e.
- POS/Rider Static Checks 45407482554 PASSED on exact final HEAD 72f2977..., including POS source parsing, current catalog/deal regression coverage, and new tests for Delivery startup, all three visible order types, compact unavailable-deal status and red wordmark/card styling.
- Several earlier workflow attempts failed only due overly broad/incorrect new test matchers. They were inspected from job logs and fixed. The final run above is the passing run for the exact current HEAD; do not cite earlier failures as current status.

### Vercel deployment
- Existing POS project preserved: flame-chick-pos-production, project ID prj_gh1UnkZKnFnehWEs5eYhiXa40Xj5, team ID team_Rpf9jeGg9r3cmMguFXHtziqz.
- Existing POS project root remains apps/flame-chick-pos; no new project created.
- Fresh Vercel deployment dpl_9qb42tx35mD3qcb57c4B7zAMhVur READY, from branch work/production-source-audit, exact commit 72f2977...; build events confirm source cloned from that branch/commit and deployment completed.
- Canonical POS alias flamechicpos.vercel.app was assigned to the new READY deployment, replacing prior deployment dpl_Gj67JUEpNrUSuvKkG8DUyHV4r5HA. Vercel alias lookup confirms flamechicpos.vercel.app appears on deployment dpl_9qb42tx35mD3qcb57c4B7zAMhVur.
- Deployment's immutable URL: https://flame-chick-pos-production-4ocw3vdeg-fahad-7455.vercel.app.

### Remaining live verification
- User must hard-refresh https://flamechicpos.vercel.app (Ctrl+Shift+R), sign in with existing Admin credentials if requested, and confirm:
  1. Flame Chick logo/wordmark is visible red.
  2. Product and deal cards have readable text, aligned images/prices/actions and no overlap.
  3. Deal cards show compact unavailable status rather than long overlapping button copy.
  4. Order type selector visibly shows Delivery, Takeaway, Dine-in in that order; Delivery is active after a new POS open/refresh.
  5. Delivery starts with address and area fields; Takeaway hides Delivery-only inputs; Dine-in shows Table and Dine-in Mode/scheduling fields.
  6. Selecting Dine-in, selecting a table, and reopening an existing table/check still works.
- The source and workflow checks pass and Vercel is READY, but the post-deploy visual/interaction check is not yet confirmed by the user. Do not claim the full POS workflow or restaurant rehearsal is complete.
- Continue with POS screen feedback. If the layout is visually right, proceed to the pending live order-type and deal-configurator checks. Keep Production database/schema untouched and GST deferred.


## 2026-11-24 — Delivery configuration admin command and POS layout follow-up

- User reported delivery totals showing “Not configured”, requested branch-specific named area fees and an Admin-configurable Not Listed / Other default fee, plus a three-card desktop POS grid and right-aligned Choose Deal / Add actions.
- Read-only Production inspection confirmed Main branch has zero configured delivery areas and `branch_delivery_settings.not_listed_delivery_fee=150`. The older Admin UI wrote a separate `restaurant_settings.DefaultDeliveryFee` value, which the Order API does not use. Existing POS Order API endpoint `view=pos_delivery_context` already reads the authoritative branch settings.
- **Production change:** a new authenticated Admin/Owner-only function was created through Supabase MCP and recorded by the remote ledger as `20261124142950_flame_chick_delivery_configuration_admin_v1`. It supports list, area upsert, and default fee set, with tenant/branch validation and authenticated role check. Read-only verification confirmed both function objects exist, owner postgres, internal SECURITY DEFINER with empty search_path, wrapper SECURITY INVOKER, execute ACL only postgres/authenticated; existing Rs. 150 and zero area rows unchanged. **Important deviation:** this function was applied before disposable QA, contrary to the source-first rollout rule. No further production migrations or writes are approved until this function is source-reconciled and QA'd. Exact SQL remains retrievable from `supabase_migrations.schema_migrations` version `20261124142950`; mirror it into the source migration directory before local replay.
- Working tree source edits prepared in this continuation: Admin delivery page now reads/writes through the secure RPC, delivery nav is enabled, area creation/edit uses command RPC; POS desktop catalog grid is three columns, mobile remains two, action buttons align right; when no named areas exist POS preselects Not Listed if the saved default fee is available. These source changes still require commit, static tests, deployment and live verification.
- Still not completed: selectable Burger component options (requires changing the V3 deal-component draft to real product variant IDs, validating, then publishing); fixed-item deal selector cleanup; image propagation from published catalog snapshot to POS; Storage bucket provisioning and image upload. Production currently has no uploaded catalog images/bucket objects, so do not claim images are live.
- No deal/menu publication, order, payment, GST or tax change. GST remains deferred. No real order was created.
- Latest known POS baseline remains commit `72f2977adf0d3b64d8a3e67edc2761ab4da39e9e`, CI `45407482554` passed; latest POS deployment at that baseline is READY. New source edits above are not deployed.

**Next:** retrieve exact SQL from remote migration ledger and mirror to source; add disposable SQL/role-boundary tests for Admin/Owner allowed and Manager/Cashier/Rider/anon denied, plus fee/area validation; run Admin/POS static checks. Only then proceed with deploy preview and verify canonical Admin/POS pages. Do not publish catalog burger changes until the deal selection payload passes the existing order-pricing/checkout contract.


### CI correction after delivery/POS source commit
- GitHub Actions POS/Rider Static Checks **45421158015 FAILED** on commit `b41ccd7b60e06624ce4cb38c56105d8ca2ab1e4d`. Exact failure: stale visual regression assertion expected the old `auto-fill/minmax(280px)` grid; the new three-column desktop grid intentionally changes this. 46/47 tests passed; no runtime/functional test failed.
- Admin Static Checks **45421158036 PASSED** on `b41ccd7...`.
- Staff Admin Role Boundary QA **45421157997 PASSED** on `b41ccd7...`, including full disposable migration replay and Admin/Owner vs operational-role boundaries, but this run predates the newly reconciled migration file commit `6bf4dfdc8d0696b68bc03f0bf4133af0b168a452`; therefore it does not validate that new source migration yet.
- Updated the POS visual test to assert three desktop columns, two mobile columns and right-aligned action button. This test fix is queued for a new CI run against the migration-reconciled branch head.
- No Vercel deployment was triggered (preview workflows skipped); do not deploy until the exact latest POS/Admin checks and full role-boundary QA pass.


### 2026-11-24 — POS shared media projection and deal picker UI refinement
- POS V3 adapter previously omitted product `imageCurrentPath` and `imagePublished` fields even though POS image renderer already used the same public `flame-chick-media` bucket URL contract as Admin. Added published image metadata to product/category display projections. This only enables existing uploaded assets to render; Production Storage inspection previously showed no bucket objects, so no actual menu photos have been provisioned and image display still needs Storage setup and live check.
- POS deal configurator source now displays single-option fixed groups as an included fixed-quantity summary without disabled +/- controls. Multi-option groups render selectable image cards with included/surcharge labels and selection count/removal actions. The existing V3 option IDs, group min/max validation, price computation and final component payload remain the source of truth.
- Burger option records in current Production published catalog are still only the generic placeholder “Burger — Included” for Flame Duo (2), Flame Feast (3) and Flame Hour Quarter Broast (1). The actual sellable burger products and variants exist (OG Crunch, The Injector, Nashville Fire), but they have not yet been added to those published deal component groups. UI alone does not create these menu options; next step is a reviewed V3 draft component update and publish through Admin after QA.
- These changes are source-only and not yet committed/deployed. Tests added for image metadata projection and deal picker behavior. No catalog publication, Storage bucket, order or payment mutation occurred.


### Latest source verification — 2026-11-24
- POS/Rider Static Checks **45421823037 PASSED** on `bcd5b643e7cf7c1458a6de50fc84bbb9b030afef`; this validates the 3-column desktop grid, 2-column mobile grid and aligned action buttons after correcting the stale visual assertion.
- On current source commit `a2d7b2bee07a9fc4ff76dfea7e924ed357794f9b`, POS/Rider Static Checks **45422823037 PASSED** and Admin Static Checks **45422823030 PASSED**. Full disposable Staff Admin Role Boundary QA **45422823136** is still running and includes the new `20261124142950` migration replay.
- Read-only Production smoke test impersonating the actual authenticated Admin role successfully called `public.flame_chick_delivery_configuration_command('list', ...)` and returned Main branch, no named areas, Not Listed fee Rs. 150. This was a read-only transaction rolled back; no data changed. The current branch POS default now also calls `updateOrderFieldsByType()` when auto-selecting Not Listed so the locality input is shown together with the fee.
- No Vercel production deployment or live order was made for these new changes. Wait for role-boundary QA to pass, then deploy previews and test Admin delivery settings and POS delivery quote before any production alias change.


## 2026-11-24 — QA complete and preview deployments READY (no production alias promotion)

- Final branch source commit: `c109be13b46aab92875e3e94dff9735e0b119017` on `work/production-source-audit`.
- GitHub Actions on exact commit `c109be13...`: POS/Rider Static Checks **45423182302 PASSED**; Admin Static Checks **45423182023 PASSED**; Staff Admin Role Boundary QA **45423181956 PASSED**. Role-boundary workflow replayed the full migration history, verified ACL/RLS baseline, exercised Admin/Owner and operational-role authorization, and completed disposable POS sync, website-order/idempotency/quota, rider-delivery/return and race checks. This QA uses a disposable local Supabase stack, not Production test orders.
- Read-only live Production RPC check using the existing authenticated Admin user succeeded: `flame_chick_delivery_configuration_command('list')` returned Main branch, zero named delivery areas, and `not_listed_delivery_fee=150`. The test was run in a rolled-back transaction; it did not write a delivery area, fee, order or payment.
- Vercel POS preview deployment **READY**: `dpl_EfVdNLPvNLfAvL1URmndn2xscyNv`, URL `https://flame-chick-pos-production-eajk9d0dd-fahad-7455.vercel.app`, from exact commit `c109be13...`, existing project `flame-chick-pos-production`, root `apps/flame-chick-pos`.
- Vercel Admin preview deployment **READY**: `dpl_5MC1VJos5W4Ftkgk9WSMeauJUGkB`, URL `https://flame-chick-admin-production-fxdrq9od9-fahad-7455.vercel.app`, from exact commit `c109be13...`, existing project `flame-chick-admin-production`, root `apps/flame-chick-admin`.
- These are immutable preview URLs only. Canonical production aliases `flamechicpos.vercel.app` and the Admin production domain have NOT been changed. A direct web-open probe could not access these preview URLs in the tool environment, so browser-level login/visual/interaction is still pending user verification.
- The Admin delivery page now uses the authenticated RPC and supports adding/editing branch areas (English/Urdu name, fee, sort, active) and setting the branch's Not Listed fee. The existing Rs. 150 remains configured. Because no named areas exist yet, POS defaults the area field to Not Listed when a default fee is available and reveals the locality field; cashier/customer must still provide the actual locality and full address.
- POS layout: three desktop columns, two mobile columns, right-aligned Add/Choose Deal actions. Deal configurator: fixed one-option bundle items display as fixed included summaries, while variable groups use selection cards. Product image metadata is carried through the POS adapter and resolves against the same public `flame-chick-media` bucket path as website/Admin.
- **Still not done / do not claim complete:** Production Storage bucket is absent/empty (no catalog image objects); therefore actual product photos will not appear until the bucket is safely provisioned and images uploaded. Generic Burger groups in the published catalog still point to the placeholder Burger option; OG Crunch, The Injector and Nashville Fire exist as sellable products but are not yet mapped into deal groups. The new POS card selector is ready for multi-option groups, but the actual burger choice requires an Admin-reviewed V3 draft component change, local validation, publication and end-to-end order-pricing verification.
- No catalog publication or real order/payment created. No GST/tax implementation. No production alias promotion. No restaurant operations sign-off.

**Next exact steps:** open the two preview URLs in a real browser, verify existing Admin login and delivery configuration page, add/modify no actual delivery data unless Owner/Admin chooses the intended areas/fees, then sign in to POS and verify delivery total shows Rs. 150 for Not Listed, locality input, three-column layout, fixed deal summaries and selectable deal cards. After that, provision the shared Storage bucket with reviewed access policy and upload actual catalog images; update the V3 Burger deal groups through the Admin catalog workflow; validate pricing and order payload in disposable tests. Only then consider canonical production alias promotion and a full manual restaurant rehearsal. Do not create a test customer order on the live system.


## 2026-11-24 — Admin preview login blocked by exact-origin CORS rejection

- Browser context showed the Admin preview rendering its login form but displaying **“Failed to fetch”**. The existing production Admin domain remains signed in and working.
- Supabase unified function logs directly confirmed the cause: `OPTIONS | 403` for `/functions/v1/flame-chick-staff-admin` at 2026-11-24 15:23:29Z and 15:23:47Z from the preview browser. Deployed `origin-policy.mjs` only always included `https://flamechickadmin.vercel.app`; the Admin preview hostname was not on its exact CORS allowlist. This is not an Admin account, role or password error.
- Vercel project SSO protection remains enabled for non-custom aliases, but browser context reached the page; the verified immediate blocker is Supabase exact-origin CORS.
- Source update pins exactly two Admin preview origins: immutable preview `https://flame-chick-admin-production-fxdrq9od9-fahad-7455.vercel.app` and branch alias `https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app`. No wildcard is added and other preview apps/subdomains remain blocked. Regression tests check exact matching.
- **Not yet deployed:** wait for Admin static checks on exact source commit, then deploy all three Staff Admin Edge Function files from that branch. Refresh Admin preview and confirm `OPTIONS` becomes 200 and Staff Admin context loads. Do not change production Admin domain or auth accounts.


- CI caught a source-edit omission before deployment: `parseStaffAdminOrigins` referenced the pinned preview list before its export was present. The failing Admin Static Checks run was inspected; failure was a module import error, not a runtime or permission issue. Added the missing explicit export. No Supabase function was deployed from the failing commit.


## 2026-11-24 — Admin preview CORS fix deployed

- Root cause confirmed from Production Supabase function logs: Admin preview `OPTIONS` preflights to Staff Admin returned HTTP 403 because only the canonical production Admin origin was always included in the exact-origin allowlist.
- Updated `supabase/functions/flame-chick-staff-admin/origin-policy.mjs` to include only two explicitly pinned Admin preview origins (the immutable preview URL and its branch alias). No wildcard `*.vercel.app`, no public bypass, no changes to Auth/RLS/role checks, and the canonical production Admin origin remains allowed.
- Regression tests now assert that both exact preview hosts receive CORS and unrelated Vercel hosts remain rejected.
- GitHub Actions for commit `921660992fcebe67a910b3f7480edb91e28315c4`: Admin Static Checks **45426074111 PASSED**; Edge Function Static Checks **45426073813 PASSED**; Catalog Admin API QA **45426073950 PASSED**. Earlier failing commit `3cde294...` was not deployed; its import/export test failure was corrected before deployment.
- Deployed Supabase Edge Function `flame-chick-staff-admin` successfully as **version 4**, still `verify_jwt=true`. Files deployed: `index.ts`, `origin-policy.mjs`, `catalog-actions.mjs`.
- After deployment, no new preview request had yet appeared in Supabase logs at the time of this handoff update. Browser-level login is therefore **not yet confirmed fixed**. Next action: refresh `https://flame-chick-admin-production-fxdrq9od9-fahad-7455.vercel.app` (Ctrl+Shift+R), attempt login with the existing Admin credentials, then inspect logs for preview-origin `OPTIONS 200` followed by authenticated Staff Admin `GET 200`. If it still fails, capture the exact on-screen error and inspect the new log entries. Do not reset password or alter the account unless the app now returns an actual Auth credential error.
- Production Admin alias `https://flamechicadmin.vercel.app` was not changed. No production user data, delivery settings, orders, or payments were modified.


### User confirmation — Admin preview login successful (2026-11-24)
- User has confirmed: “i entered the admin panel” after Staff Admin Edge Function v4 deployment.
- Post-deploy Supabase function logs show Staff Admin endpoint `OPTIONS 200`, `GET 200`, and multiple `POST 200` requests at 2026-11-24 15:31:08Z–15:31:36Z, replacing the previously observed preview-origin `OPTIONS 403`. This independently corroborates successful browser-to-API access.
- Existing Admin account was retained; no password reset, Auth account mutation, or role change occurred.
- Next: have user open **Delivery areas** in Admin preview and inspect whether Main branch, Rs. 150 Not Listed fee and area list load from the secure branch configuration command. Do not save fees or add area rows until UI read is confirmed. If values fail to load, inspect browser console and function logs for `flame_chick_delivery_configuration_command` call result. Do not promote the preview or alter production Admin alias yet.


## 2026-11-24 — Delivery areas tab role-gating correction

- User entered Admin preview successfully but reported only Staff & Riders and Catalog V3 Draft available.
- Root cause is in `apps/flame-chick-admin/app.js` bootstrap: after verifying Admin/Owner role, the UI hard-coded `allowed=["staff","catalog-v3"]` and disabled every other tab. This overrode the enabled Delivery button in `index.html` and hid the already implemented Delivery management screen from Admin/Owner.
- Changed the Admin/Owner navigation allowlist to `["staff","catalog-v3","delivery"]`. Delivery calls the existing authenticated Admin/Owner-only `flame_chick_delivery_configuration_command` RPC via `loadDeliveryConfig`. No table grants, roles, RLS, or APIs were widened. Dashboard, Orders, Menu, Categories, Deals, Website Images and Website Settings remain disabled pending their secure APIs.
- Added `tests/admin-navigation-access.test.mjs` and included it in Admin static CI. This explicitly checks Admin/Owner bootstrap and Delivery route wiring, and confirms the unfinished modules stay gated.
- Source change is not deployed yet. Await exact CI pass, then create a fresh Admin preview deployment and reassign the already CORS-allowlisted branch preview alias. Do not change the canonical production Admin domain.

- First CI run for the Delivery tab update failed one existing Catalog V3 Admin navigation test because it asserted the previous two-tab allowlist literally. The new Delivery-specific test and remaining 84 tests passed. Updated the old assertion to expect the new three-tab Admin/Owner allowlist; no application logic change beyond Delivery access was made in this correction. Await rerun before deployment.


## 2026-11-24 — Delivery Areas Admin navigation deployed to preview

- Admin Static Checks run `45427676653` completed **successfully** for exact branch HEAD `0787a008f396c76a24c471ebf8d3021f256bde5c`.
- Created fresh Vercel deployment in the existing Admin project `flame-chick-admin-production`, project ID `prj_kPEqsepRzivOJhNeA32Io3netjav`, from that exact branch and commit.
- Deployment `dpl_EKANAZKxB4Lzr3y9LZz98uwUQqXc` reached `READY`. Branch preview alias: `https://flame-chick-admin-production-git-work-product-0d7cc4-fahad-7455.vercel.app`.
- This is a preview deployment (`target=null)); canonical production Admin alias `https://flamechickadmin.vercel.app` was not promoted or changed.
- User should open the branch preview alias and hard-refresh (Ctrl+Shift+R). Expected Admin/Owner tabs: Staff & Riders, Catalog V3 Draft, Delivery Areas. Confirm the Delivery Areas tab appears and loads configuration before any settings are saved.
- Delivery Areas access is UI-enabled only for verified Admin/Owner sessions and continues to call the existing authenticated Staff Admin command. Other unfinished tabs remain disabled. No DB migration, fee change, delivery-area insert, or production data change was made.
