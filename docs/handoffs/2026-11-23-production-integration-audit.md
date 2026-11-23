# Flame Chick — Production integration audit (2026-11-23)

**Scope:** Read-only audit of the live Supabase project, Git working-branch source, API contracts, application clients, security posture and currently available Vercel workspace.  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**CI source commit:** `96c44121eececa3d7947a406ad5d21a35f6bbe41`  
**Latest CI:** [Flame Chick Website Static Checks run 45116517717 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45116517717)  
**Production Supabase project:** `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`, Free, PostgreSQL 17.12, `ACTIVE_HEALTHY`.

## Executive result

**NO-GO for a complete production deployment today.** The database is healthy and the catalog foundation is significantly implemented, but the system is not end-to-end deployable. The highest-risk gaps are not cosmetic: order/delivery database schema and RPCs are absent; the current website consumes an obsolete V2 DTO and still contains a hardcoded superseded menu; the production public catalog reader lacks the V3 database timestamp required by the new Edge Function; only the original Staff Admin Edge Function version is deployed; POS/Rider authorization and data access assume direct table grants and schema that do not exist; and Realtime/Storage are not provisioned.

The three-hour target is useful for prioritization, but must not be treated as permission to bypass these gates. Do not deploy a partial or unverified ordering/delivery system.

## 1. Live Production facts — verified read-only

- Supabase project is active and healthy, Mumbai, PostgreSQL 17.12.
- Migration ledger contains 24 migrations through `20261122105821 flame_chick_catalog_publication_validation_fixes_v1`.
- Repository candidate migration `20261122174500_flame_chick_catalog_database_time_metadata_v1.sql` is **not applied**.
- One Flame Chick restaurant and one active Main branch exist. Restaurant timezone is `Asia/Karachi`, currency is PKR.
- Website ordering, delivery and pickup flags are all `false`.
- One Auth user, one profile, one active `admin` role and one staff audit row exist. No Owner, Manager, Cashier or Rider role assignments yet.
- All catalog authoring/deal/schedule/publication tables exist and are empty. Counts: categories 0, subcategories 0, products 0, variants 0, modifier groups/modifiers/assignments/price rules 0, deal collections/deals/variants/components/options 0, schedules/windows/assignments 0, branch availability rows 0, publications 0, current pointer 0.
- `public.flame_chick_catalog_public_read('flame-chick')` returns `published=false` and null snapshot/metadata. No restaurant menu has been seeded.
- Order, order-item, delivery-task, delivery-offer, assignment, rider-profile, push-subscription and rate-limit tables are absent.
- Expected order RPCs (`flame_chick_create_order`, `flame_chick_update_order_status`, `flame_chick_check_website_order_rate_limit`) are absent.
- Expected delivery RPCs (`flame_chick_manage_delivery`, accept/decline offer RPCs) are absent.
- No Storage buckets exist.
- No business tables are in `supabase_realtime`; no `realtime.messages` authorization policies exist.
- Only deployed Edge Function: `flame-chick-staff-admin`, ACTIVE version 1, `verify_jwt=true`. The deployed source is the older Batch 4 staff-only implementation; it does not include the repository's new `catalog-actions.mjs` route.
- Catalog, order and delivery Edge Functions are not deployed.
- Security advisor: 33 informational RLS-enabled/no-policy notices (consistent with intentional deny-by-default tables), plus warning that leaked-password protection is disabled. Health advisor has no findings. Performance advisor reports unused indexes, expected on a mostly empty pre-launch database.
- Public/app-role direct table privileges are closed for the inspected public and app_private tables. The public catalog read RPC is server-only (service_role execute only), postgres-owned, SECURITY DEFINER and empty search_path.
- The live catalog-read RPC source SHA-256 is `450bb2ea8671bcc581240c7af2400f49323efeef2aa3f1d2e6e5c9dbe6c919e4`, exactly matching the strict preflight pinned in the repository timestamp migration candidate.

## 2. Catalog read path — status and exact gaps

### Database foundation

The relational catalog, draft revision/idempotency, audit, deals, schedules, immutable publications and current pointer are applied. Draft command RPCs and publish/rollback RPCs are present. Direct table grants remain closed. This is a strong foundation.

### P1: database-time contract is not yet aligned

The V3 public catalog Edge Function requires a valid `databaseNow` value from the public-read RPC for both published and unpublished responses. Production's current RPC does not return this field. The repository has a candidate migration that adds it outside the immutable snapshot/checksum, preserves SECURITY DEFINER/empty search_path/service_role-only execution and checks the exact live function body/security ACL before replacement. Its preflight SHA matches Production exactly.

**Required:** review the candidate and recovery plan, then obtain separate explicit approval before applying. Do not deploy the catalog function before the migration is applied and verified.

### P1: catalog Edge Function credential selection

`supabase/functions/flame-chick-catalog/index.ts` falls back to the first arbitrary value in `SUPABASE_SECRET_KEYS` when no explicit `default` is set. Arbitrary key ordering must not choose a credential. Change to a named, explicit target key and fail closed if it is missing. Review the same pattern in order/delivery functions; do not print or expose secret values.

### P1: public customer website remains V2/legacy

`apps/flame-chick-website/index.html` loads only `js/config.js` and `js/catalog.js` (V2); it does not load the V3 client/validator/orchestrator. The inline `FCCore.MENU` contains the former static/hardcoded menu. `fcLoadLiveCatalog()` maps live products by English names to those static entries and keeps static prices as fallback when variant/deal price values are zero or missing. It is not compatible with the V3 relational snapshot contract and must not be connected to the V3 catalog endpoint.

The current fail-closed hidden-menu gate prevents those menu items from being displayed if V2 catalog loading fails. Preserve that gate. Do not remove it or enable checkout until the V3 consumer fully replaces the old mapping/cart/checkout contract and the server-side order API is ready.

The standalone `catalog-preview.html` uses the V3 client and is read-only/non-ordering. It is not the production storefront, not an Admin preview, and not deployed. Its successful tests use synthetic fixtures only.

### Menu source-of-truth override

The restaurant has now published the menu previously called the upcoming menu. That newly published menu is authoritative. The older running menu is superseded and must not be seeded, merged or used as the customer fallback. User will provide the actual new menu when catalog entry is required. Keep Production catalog empty until then. The old-menu rollback runbook was corrected: restoring the old Vercel deployment would show obsolete menu content and is not the default business-safe rollback.

## 3. Admin source/API — status and gaps

- Deployed `flame-chick-staff-admin` is version 1, staff-management only. Repository source has additional finite catalog-action routing and a finite RPC map, but that source has not been deployed.
- Repository catalog action API uses caller publishable key + caller Bearer JWT for catalog RPCs; database derives `auth.uid()` and Admin/Owner role. Publish/rollback are intentionally rejected at the Edge API boundary until Website compatibility/release gates are complete.
- Admin UI currently enables only the Staff module after bootstrap; other navigation is disabled. This is correct as a temporary fail-closed state.
- Admin `app.js` still contains direct PostgREST reads/writes for legacy catalog, orders, delivery areas, restaurant settings and direct Storage upload/delete. Those functions must not be re-enabled. Existing production table grants prevent these operations; do not loosen grants.
- The new V3 catalog Admin integration must use the Staff Admin function's finite authenticated actions and draft read/mutation RPCs. Replace/quarantine old direct REST CRUD before enabling catalog navigation.
- Current production has only one Admin role. Owner must remain a separate future account; do not create or assign it implicitly.

## 4. Order API — critical blockers

Repository `flame-chick-order-api` is not deployed and its required DB schema/RPCs are absent. It currently:
- Calls missing service-role order-create/status/rate-limit RPCs.
- Queries `public.user_roles` using column `role`, while current production schema column is `role_key`.
- Performs direct user-context REST reads of `user_roles`; production intentionally has no authenticated table SELECT grants/policies, so this read path cannot authorize staff.
- Has arbitrary first-secret-key fallback and wildcard CORS.
- Uses a separate rate-limit RPC check before order creation; the approved requirement is atomic website-only rate limiting in the same order transaction. This check-then-create design is not sufficient for race-safe enforcement.
- Uses the approved website limits only for website requests (3/min, 3/10 min, 15/hour), but these must be implemented atomically with order submission. POS must not be subjected to website guest limits.

**Required:** design and implement order schema, immutable order/item/component/modifier snapshots, quote/submit/status/cancel/reject RPCs, idempotency, transactional website-only limiter, audit and branch-scoped board read. Actor/role checks must be database-authoritative; no direct role table reads by clients/functions using the caller JWT unless a narrowly scoped policy/API is explicitly designed and tested.

## 5. Delivery/Rider API — critical blockers

Repository `flame-chick-delivery-api` is not deployed and its expected tables/RPCs are absent. It currently:
- Uses service-role direct REST reads/writes for delivery tasks, offers, assignments, rider profiles and push subscriptions.
- Checks Rider role/profile through direct user-context REST queries; current role schema uses `role_key` and has no app-role direct table grants.
- Contains broad wildcard CORS and arbitrary first-secret-key fallback.
- Rider source uses 120-second presence heartbeat, despite the approved architecture explicitly rejecting periodic Edge Function heartbeat.
- POS subscribes to branch-filtered orders/tasks **and unfiltered** delivery offer/assignment Postgres Changes; this leaks event scope and violates the private-topic plan.
- Rider subscribes to rider-filtered Postgres Changes rather than private per-rider Broadcast.
- No Realtime publication tables or private `realtime.messages` authorization policies exist.

**Required:** implement delivery/rider schema and atomic command RPCs for offer issue/expiry/accept/decline, assignment, pickup, delivered, failed, return reported and manager/cashier confirmation according to approved role matrix; rider access must be bound to `auth.uid()` and own active assignment. Use private branch POS and private per-rider channels with authorization and compact event IDs; remove broad subscriptions and 120-second Edge Function heartbeat. Test 60-second offer expiry, reassignment and return workflow.

## 6. POS — critical blockers

- POS currently calls order/delivery/catalog Edge Function URLs that are not deployed.
- POS reads `user_roles` directly using the old `role` column; current schema uses `role_key`, and app-role table grants are closed.
- POS direct reads of order/delivery/rider tables target tables absent from Production.
- POS Realtime subscribes to unfiltered `delivery_task_offers` and `delivery_assignments` in addition to branch-filtered orders/tasks. Must be replaced with authenticated private branch Broadcast.
- POS is not a ready customer/order workflow until its old local-first/menu/order contract is reconciled with the new database-driven catalog and secure order APIs.
- No live DB order workflow exists to validate its boards, cashier status changes, cancellations, rider assignment or return confirmation.

## 7. Rider — critical blockers

- Rider calls an undeployed delivery API and direct REST role/profile/task/offer endpoints against absent tables and closed grants.
- It subscribes to direct Postgres Changes rather than private per-rider Broadcast.
- It runs a two-minute presence heartbeat, which must be removed in favour of ephemeral Presence and explicit availability preference writes.
- No Rider production account/profile exists.
- Cannot safely deploy for live dispatch until all delivery lifecycle, own-offer isolation, timeout/reassignment and return flows are implemented and tested.

## 8. Storage, Auth and Vercel

- Supabase Storage has no buckets. Admin source expects a configured media bucket and direct client uploads/metadata writes; do not enable media UI. Provision a private/publicly-readable-by-path design only after access policy and upload/delete lifecycle are reviewed.
- Leaked-password protection is disabled in Auth; enable after reviewing the Auth setting and test impact. This is a security hardening gate before staff rollout.
- Vercel connector currently exposes only team `fahad-7455`; searching its projects for Flame Chick returned none. The intended Flame Chick Vercel team `team_lrFy9ILYEz9umsBy98GCyQjI` is not available through this connected workspace. Do not deploy Flame Chick to the connected HFP team or alter HFP projects. Reauthorize the correct Flame Chick Vercel workspace before deployment.
- Historical runbook identifies intended hostnames: Website `flamechic.vercel.app`, Admin `flamechicadmin.vercel.app`, Rider `flamechicrider.vercel.app`, and POS `flamechicpos.vercel.app`. Verify exact project/domain mappings in the correct Vercel team before deployment. Do not assume these are already attached.
- Historical legacy customer domain/deployment contains the superseded menu. Do not use it as an automatic rollback target after the new menu is authoritative.

## 9. Prioritized completion plan

1. **Freeze production release:** leave website gates false; no menu seed/publication; no function or Vercel deployment until aligned.
2. **Resolve catalog read contract:** review and approve the exact database-time migration; apply only after explicit production approval; verify RPC hash/config/ACL and unpublished response; make catalog Edge Function key selection explicit; run Deno typecheck/contract tests; deploy only after separately approved.
3. **Complete new-menu catalog input:** wait for user to provide the newly published menu; reconcile exact facts; populate via Admin command API; validate publication and snapshot; publish only after separate approval.
4. **Finish website V3:** replace V2/static-menu mapping, build DB-driven cart/deal/modifier selection from V3 IDs, connect trusted quote/order APIs, fail closed, and test exact production response against the snapshot.
5. **Build order backend:** schema, atomic quote/submit/status/cancel, immutable receipt snapshots, idempotency, atomic website limiter, secure staff/branch authorization, negative-role and race tests.
6. **Build delivery backend:** schema, offer/assignment lifecycle, rider own-scope, return/failure confirmations, private Realtime/outbox, push as optional wake-up only.
7. **Migrate Admin/POS/Rider clients:** eliminate direct sensitive PostgREST and legacy DTO/schema access; enable only modules with complete APIs.
8. **Auth, media, Realtime and Vercel:** leaked-password protection, Storage bucket and policies, private Realtime auth, correct Vercel workspace/project/environment/domain binding.
9. **Staging and release:** run full migration chain in disposable staging, security/tenant/role/idempotency/concurrency/DTO/browser/end-to-end/backup/rollback tests. Only then obtain separate approvals for Production writes, Edge Function deployment, Vercel deployment, domain cutover and website ordering activation.

## 10. Explicit non-actions during this audit

No Production SQL writes, migrations, seed data, role changes, Auth settings, Storage bucket changes, Realtime settings, Edge Function deployments, secret changes, Vercel deployments, domain/alias changes, menu publication or checkout activation were performed. Git changes in this audit are documentation-only on `work/production-source-audit`; `main` remains untouched.
