# CURRENT CHECKPOINT — 2026-11-23 — Step 2 POS/Rider delivery integration source checks PASSED

**Active branch:** `work/production-source-audit`  
**Latest POS integration source commit:** `45af748ee2184e58072e90a5fd932ede11416072`  
**POS/Rider static QA:** [run 45198567593 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198567593)  
**Edge Function type/contract QA:** [run 45198081185 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198081185)  
**Disposable operational/delivery SQL QA:** [run 45197859536 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45197859536)  
**Admin source QA:** [run 45198568180 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198568180)

Flame Chick remains a **pre-launch production build**. The partly provisioned Supabase Production project is the target environment, not a live restaurant operations system. This Step 2 work is source wiring and disposable QA; no Edge/website/POS/Rider deployment or new operational migration was applied to the target Supabase environment.

## Step 2 source integration completed

- POS now keeps Rider-delivered orders in the active third column, renamed **Delivery & Awaiting Payment**, and labels a delivered order **Delivered · awaiting cashier payment collection**. The Order API active board includes `delivered`, so the POS does not lose the order when the Rider marks it delivered.
- The POS does not offer an automatic “complete” action after Rider delivery. A distinct Cashier payment-collection command and corresponding POS action are still required in the next order-processing phase.
- Rider completion copy now says delivery was marked delivered and the order remains awaiting Cashier payment collection. Rider steps remain **Accept offer → Picked up → Delivered**; no restaurant-arrival step was reintroduced.
- Delivery dispatch API now returns `accepting_jobs` and `last_seen_at` in addition to Rider identity and availability. Those are the exact fields the POS uses to filter recent, online, available Riders before showing assignment choices.
- POS physical-return confirmation now permits **Cashier**, Manager, Admin and Owner, matching the database command authorization. The Cashier confirm button is visible after the Rider reports physical return.
- Staff physical return continues to update the delivery/order state to `returned`, without treating it as paid or completed. Returned orders leave the active board and appear in the existing **Cancelled Orders** history tab. Cloud, local fallback and status-label handling include `returned`.
- Existing Rider-specific delivery views remain scoped to that authenticated Rider’s offers and assignments. POS still chooses one Rider explicitly; offer expiry remains 60 seconds and requires manual reassignment.

## Delivery vs payment vs completion — authoritative

Rider `delivered` now sets only delivery facts (`delivery_tasks.status`, assignment release, `orders.status='delivered'`, `delivered_at`, and audit history). It does **not** set `completed_at`, create a payment or change `payment_status`.

The Cashier must later physically receive and record payment as **Collected**, with amount/method/actor/time audit. Only after the payment transaction commits may the order be marked **Completed**, receive `completed_at`, and move into Order History. Physical return remains a separate `returned` state; do not infer payment collection or refund from it. GST remains deferred.

## Verification results

- [Run 45197859536](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45197859536) passed complete disposable migration replay, staff ACL/RLS and role authorization, operational-schema constraints/security, the delivery lifecycle/expiry fixture (including new assertions that Rider delivery and staff-confirmed return remain unpaid and without `completed_at`), all four real concurrent delivery races, and disposable Supabase teardown.
- [Run 45198081185](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198081185) passed Deno type-check for all Edge Functions and the Edge contract tests, including dispatch Rider heartbeat fields and delivered/returned board statuses.
- [Run 45198567593](https://github.com/itsfahamed1234-creator/flame-chick-platform/actions/runs/45198567593) passed POS/Rider inline JavaScript parsing and source-hygiene/integration assertions.
- [Run 45198568180](https://github.com/itsfahamed1234-creator/flame-chick-platform/actions/runs/45198568180) passed Admin static checks.
- Preview deployments were skipped by their workflows. These apps/functions are **not deployed from this work**.

## Next — order-processing and payment collection

Build the separate Cashier payment-collection transaction/API:
1. Lock the order and payment state; validate the collected amount against outstanding balance.
2. Record payment method, amount, actor and timestamp in the payment ledger with an idempotency key.
3. Update `paid_amount` and `payment_status`; only when the required balance is fully collected set `orders.status='completed'`, `completed_at`, and let the order move into Order History.
4. Partial collection must leave the order active in Delivered / awaiting payment and must not complete it.
5. Duplicate collection, overpayment, retries, cancellation and return/refund reconciliation need explicit DB tests.
6. Keep Rider API incapable of recording payment or completing orders.

No target Production writes, deployments, Realtime activation or checkout activation occurred during this Step 2 source/QA phase. Continue incrementally toward the pre-launch production system.
---

# CURRENT CHECKPOINT — 2026-11-23 — Step 1 delivery concurrency QA PASSED

**Active branch:** `work/production-source-audit`  
**Latest concurrency test source commit:** `eda617341dda21846573e6c4e66c72e190f7fd10`  
**Passing full disposable QA:** [GitHub Actions run 45188384720](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45188384720)  
**Environment:** disposable local Supabase only. Flame Chick remains a pre-launch build; the partly provisioned Supabase Production project is the target environment, not a live restaurant operations system.

## Step 1 completed — four real parallel PostgreSQL-session races

The refined fixture adds a test-only, synthetic-tenant-scoped trigger that pauses the offer status update **after** the command has locked its task and offer. Separate `psql` connections then contend on the same task row. This avoids clock-helper sleeps during the expiry sweep candidate scan.

All four races passed:

1. **Accept wins vs decline:** acceptance commits; concurrent decline receives `DELIVERY_OFFER_ALREADY_RESOLVED`.
2. **Decline wins vs accept:** decline commits and task returns to `dispatch_pending`; concurrent accept receives `DELIVERY_OFFER_ALREADY_RESOLVED`.
3. **Accept vs expiry sweep:** Rider acceptance is just before deadline while holding the task lock; the sweeper reaches exact expiry and returns `expired_count=0` because `SKIP LOCKED` skips the locked task.
4. **Expiry sweep vs accept:** the sweeper expires the offer at the deadline while holding the task lock; the blocked accept then receives `DELIVERY_OFFER_ALREADY_RESOLVED`.

Every race checks the final offer/task/order status, current assignment count, Rider availability and mutually exclusive `offer_accepted`, `offer_declined`, `offer_expired` audit events. The CI log ends with: **“all 4 races produced one coherent terminal state, at most one current assignment, and matching audit events.”**

Run 45188384720 passed every step: fixture/shell safeguards, disposable Supabase startup, full migration replay, staff ACL/RLS and role checks, operational schema verification, existing delivery lifecycle/expiry tests, race fixture setup, all four simultaneous session races, and disposable stack shutdown. Earlier fixture/harness failures are historical; they were corrected without weakening production SQL or role protections.

## Verified delivery behavior now covered

- Targeted single-Rider assignment; no automatic rotation.
- Wrong-Rider denial.
- Accept/idempotency, pickup and delivered/idempotency.
- Failed delivery, return report, Rider cannot confirm physical return, Cashier can confirm.
- Payment ledger unchanged by delivery/return actions.
- 60-second expiry: one microsecond before succeeds; exactly at deadline fails closed and requires manual reassignment.
- Accept/decline and accept/expiry/skip-locked races are covered with actual separate database sessions.

## Authoritative delivery/payment rule — must be applied before app integration

Rider marking **Delivered** confirms delivery only. POS must keep the order in its active **Delivered / awaiting-payment** queue. Payment remains outstanding until the Cashier physically receives and explicitly records **Collected**, with amount, method, actor and time audit. Only after payment collection may POS set the order to **Completed**, set `completed_at`, and move it into order history.

**Known candidate SQL mismatch:** `flame_chick_manage_delivery(action='delivered')` currently sets `orders.completed_at` during Rider delivery. Remove that premature completion and do not change payment status during Rider delivery. Implement a separate Cashier payment-collection command and tests proving only a recorded collection completes the order. Keep physical return and refund/payment ledger decisions separate unless explicitly designed. GST remains deferred.

## Next project stage

Step 1 is complete. Move to **Step 2: POS/Rider app integration review and wiring**:
- POS manually assigns exactly one Rider.
- Rider stages remain **Accept offer → Picked up → Delivered** (no restaurant-arrival step).
- Rider sees only their own offers/jobs.
- Cashier and Manager can confirm physical returns; returned orders enter the correct POS queue.
- Preserve the above separation between delivery and payment collection; correct the premature completion behavior before enabling the Rider Delivered action against the operational order flow.

No target Supabase database writes, function deployment, Vercel deployment, Realtime activation or checkout enablement occurred in this QA stage. Continue building the pre-launch production system in controlled, verified increments.
---

# AUTHORITATIVE ORDER DELIVERY VS PAYMENT COLLECTION RULE — 2026-11-23

**Rider marking an order Delivered does NOT mean payment was collected and does NOT complete the order.**

Required operational flow:

1. Rider marks the delivery task **Delivered** after handing the order to the customer.
2. POS reflects the order status as **Delivered**, but the order stays in the active POS workload/awaiting-payment view. It must not be removed to history or marked completed just because the Rider delivered it.
3. The order retains its correct outstanding payment state. Delivery status and payment collection are separate facts. Never create a payment, set payment_status to paid, or imply cash receipt solely from the Rider's Delivered action.
4. Cashier physically receives/records the payment and explicitly marks the payment as **Collected**. Record the collection event, amount/method and cashier/actor/time audit using the eventual payment model.
5. Only after the required payment has been collected and recorded does POS mark the order **Completed**, set its completion timestamp, and move it out of the active queue into order history.
6. If payment remains outstanding, the order stays Delivered and active/awaiting collection. A Rider status update cannot close the cashier's financial responsibility.

**Known source mismatch to fix during order/payment implementation:** the current candidate delivery command migration sets `orders.status='delivered'` and also sets `orders.completed_at=v_now` in the Rider `delivered` action. That is not the final business behavior. Before operational integration, remove that premature completion timestamp, preserve the order in the POS Delivered / payment-awaiting queue, and implement a separate cashier payment-collection command that records the collection before setting `status='completed'` and `completed_at`. Add end-to-end tests proving Rider delivery leaves payment outstanding and only cashier collection completes the order. Do not change the return/refund rule by inference: a physically returned order and its payment/refund ledger remain separate decisions.

This is an authoritative workflow requirement and supersedes any old wording that equates Rider delivery with order completion. GST remains deferred.

---

# AUTHORITATIVE PROJECT STATUS CORRECTION — 2026-11-23

**Flame Chick is a pre-launch production build. There is no live restaurant operations system running. We are building it.**

Terminology to use going forward:

- **Supabase Production project** means the designated target project/environment. It is not evidence that a live restaurant operations service is running.
- That target environment is already partly provisioned: foundational restaurant/branch, staff identity, catalog schema and catalog-related work have been applied in earlier stages. Do not describe the database project as entirely empty or pretend no prior authorized setup occurred.
- The complete operational product is still being built: trusted order APIs, delivery/rider operations, POS and Rider integration, customer website/checkout connection, related deployment and release checks remain staged work.
- Disposable local Supabase is for migration replay and repeatable QA. It is a validation tool, not a replacement project and not a reason to indefinitely defer the production build.
- Phrases such as "Production untouched" in earlier checkpoints mean only that the specific source/QA stage did not make writes to the target Supabase environment. They do **not** mean a live system exists, that production implementation must be avoided, or that building the target system is disallowed.
- Continue the approved build step by step. Make target-environment changes as required by the implementation plan, using verified project identity, migration history, tested SQL and controlled rollout. Do not make unrelated changes or claim an app/service is live until it is actually deployed and verified.

This correction supersedes any earlier wording that could imply an active restaurant system is running. It does not change the user's menu, role, delivery, payment, GST-deferral, or application requirements.

---

# CURRENT CHECKPOINT — 2026-11-23 — delivery concurrency QA preparation

**Active branch:** `work/production-source-audit`  
**Verified delivery expiry source commit:** `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`  
**Scope note:** The Supabase Production project is a pre-launch target environment, not a live restaurant operations system. This source/QA stage did not modify that target project; `main` remains untouched.

## Current verified state

- Delivery command migration remains source-only.
- Expiry clock helper and exact 60-second boundary tests passed on disposable Supabase in [workflow run 45182331625](https://github.com/itsfahamed1234-creator/flame-chick-platform/actions/runs/45182331625).
- Existing delivery lifecycle behavior also passed: targeted Rider assignment, wrong-Rider denial, accept/idempotency, pickup, delivered/idempotency, failed delivery, return report, Rider cannot confirm physical return, Cashier can confirm, and payment ledger unchanged.
- Full migration replay, staff role boundaries, operational schema constraints/security, fixture rollback, and local stack cleanup passed.

## Concurrency QA status — NOT YET IMPLEMENTED

- The next requested work is genuine parallel-session testing of accept-vs-decline and accept-vs-expiry/sweep.
- A first committed-fixture draft was removed before workflow use because the source schema and role setup needed further validation; it was not run and must not be treated as test coverage.
- Do not claim race safety from SQL row-lock inspection alone.
- Next implementation must use committed disposable fixtures in the isolated local stack, invoke separate PostgreSQL sessions concurrently, assert one valid terminal result / no duplicate current assignment / consistent event rows, and rely on full disposable stack teardown for fixture isolation.
- Avoid weakening database authorization or production clock behavior to make tests pass.

No Production migrations, DB writes, Edge Function deployments, Vercel deployments, Realtime changes, checkout activation or catalog publication occurred. GST remains deferred.
---

# CURRENT CHECKPOINT — 2026-11-23 18:25 PKT — delivery expiry boundary QA added

**Active branch:** `work/production-source-audit`  
**Latest source commit:** `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`  
**Latest handoff documentation commit:** `47eae3d3de20658cd1c3e95f0e678fa0cec4c4f4`  
**Production and `main`: untouched.**

## Delivery expiry work in progress

- Added private helper `app_private.flame_chick_delivery_clock_now()` to the source-only delivery command migration. Its production implementation delegates to PostgreSQL `clock_timestamp()`; direct execution is revoked from PUBLIC, anon, authenticated and service_role.
- All delivery command/sweep expiry decisions now use this private helper consistently.
- The rollback-only delivery SQL fixture temporarily replaces the helper with a deterministic transaction-local clock and rolls the replacement back with the fixture.
- Added exact-boundary assertions:
  - acceptance one microsecond before the 60-second deadline succeeds;
  - acceptance exactly at the deadline returns `OFFER_EXPIRED`, marks the offer expired, returns the task to `dispatch_pending`, and creates no current assignment;
  - expiry does not auto-rotate; a staff member must explicitly reassign the Rider.
- The private helper's execute privileges are included in the migration's security assertions.

## CI status — NOT YET VERIFIED

- Previous complete delivery lifecycle QA remains green: [run 45179371115](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45179371115), commit `28ffba173a989f5f7cd9c3e378ce24a820b13520`.
- The source commit containing the new deterministic expiry boundary fixture is `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`.
- Its complete disposable Staff Admin / operational / delivery QA run [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625) was still in progress at handoff update time, currently on disposable Supabase startup. **Do not claim the new boundary tests pass until this run completes and the delivery fixture step is green.**
- An earlier run on the helper-only migration commit `de635aeaf851b093c6d751de3130cd7f9f6219d3` passed, including full migration replay and the prior lifecycle fixture; it did not yet contain the boundary assertions.

## Remaining work

1. Verify run `45182331625`; inspect logs and fix only a demonstrated failure.
2. Add genuine multi-session race tests for accept-vs-decline and accept-vs-expiry/sweep. The existing SQL locks task before offer and the expiry sweep uses `FOR UPDATE SKIP LOCKED`, but those facts are not a substitute for concurrent execution evidence.
3. After expiry/race tests pass, update POS/Rider integration against the exact Rider stages **Accept offer → Picked up → Delivered** (no restaurant-arrival step), and confirm Cashier/Manager physical-return UI permissions.
4. Continue order API and website integration only after backend tests.

No Production migrations, Edge Function deployment, Vercel deployment, Realtime changes, checkout activation, catalog edits/publication or other Production writes are authorized or performed. Candidate migrations remain source-only. GST remains deferred.
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

**Detailed audit:** [docs/handoffs/2026-11-23-production-integration-audit.md](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/blob/work/production-source-audit/docs/handoffs/2026-11-23-production-integration-audit.md)  
**Audit outcome:** NO-GO for full production deployment from current state. Supabase is healthy and catalog foundation is applied, but order/delivery/rider backend, live V3 customer storefront integration, client authorization migrations, private Realtime, Storage, and release rehearsal are not complete.

Verified Production:
- 24 migrations through `20261122105821`; the `20261122174500` database-time candidate is not applied.
- One active restaurant/Main branch, website delivery/pickup/ordering flags all false.
- Catalog tables and publication structures exist but are empty; no current publication.
- Production catalog read RPC has no `databaseNow`; its live source SHA matches the candidate migration's strict preflight.
- Only `flame-chick-staff-admin` version 1 is deployed; catalog/order/delivery functions are not deployed.
- Order/delivery/rider tables and required order/delivery RPCs are absent.
- Existing website homepage is still V2/legacy hardcoded mapping; V3 is only a separate synthetic read-only preview.
- POS/Rider clients still assume direct role/data REST access and old role schema; POS has broad offer/assignment Realtime subscriptions; Rider has Postgres Changes and two-minute heartbeat.
- No Storage bucket, no business Realtime publication or private-message policies; leaked-password protection is disabled.
- Current Vercel connection exposes only HFP team `fahad-7455`; no Flame Chick project appears. Do not deploy Flame Chick to HFP. Reauthorize the correct Flame Chick Vercel team.

**No production changes were performed during this audit.** No SQL writes/migrations/seeds, Auth settings, Storage/Realtime setup, Edge Function deployment, secret change, Vercel deployment, domain changes, menu publication or checkout activation. Audit documentation only was committed on `work/production-source-audit`; leave `main` untouched.

**Three-hour constraint:** a safe full-system deployment is not achievable from this state in three hours. Do not bypass security, schema, end-to-end tests or release gates. Continue with source-only contract fixes and staged implementation; each Production write/deployment remains a separate review and explicit approval.

---

# CURRENT OVERRIDE — 2026-11-23: newly published menu is the authoritative target

The user confirms that the restaurant has now published the menu that was previously described as the upcoming menu. That newly published menu is now the current/authoritative Flame Chick menu to implement. The formerly running menu is superseded for operational catalog purposes: do not import it, merge it into the new catalog, use it as a fallback, or assume old-only products remain in the target menu.

The 2026-11-21 current-vs-upcoming comparison and related menu reconciliation are historical records of the earlier plan. Their previous designation of the old running menu as the compatibility baseline and the upcoming menu as a future target is superseded. They must not be used as the final source of restaurant menu data.

The user will provide the actual newly published menu/catalog material when catalog entry becomes necessary. Do not request it prematurely; do not reconstruct it from the old menu, historical comparison, synthetic fixtures or legacy hardcoded website. Until that material is provided and reconciled, keep the production catalog empty. Do not seed guessed records, publish a catalog or enable ordering. At the menu-entry phase, reconcile the supplied new menu's exact products, categories, variants, prices, modifiers, deal choices and schedules; identify unresolved facts rather than assuming.

This update changes which menu is authoritative; it does not authorize production writes, deployment, publication or checkout enablement.

## Latest CI verification — 2026-11-23

GitHub Actions **Flame Chick Website Static Checks**, run [45116517717](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45116517717), completed successfully on `work/production-source-audit`, commit `96c44121eececa3d7947a406ad5d21a35f6bbe41`. The static-checks job passed the JavaScript syntax checks, core catalog regression tests, V3 preview regression tests and website inline-script parsing. This is source CI only; it does not demonstrate live Supabase catalog integration and does not authorize deployment.

No production catalog data was inserted and no production write or deployment occurred for this verification.

---

## Latest checkpoint — standalone V3 non-ordering menu preview page (2026-11-23)

**Status: separate catalog preview entry, product/deal rendering and local selection validation implemented. Static CI passed. Preview deployment skipped; existing storefront is untouched.**

- Added `apps/flame-chick-website/catalog-preview.html`, linked styles `css/catalog-preview.css` and page controller `js/catalog-preview-page.js`.
- This is a separate entry path. Existing `index.html`, the legacy storefront markup and hidden-menu gate were not changed. The main storefront has no link to this preview page.
- Page includes `noindex,nofollow,noarchive` metadata. This is search-engine guidance, **not authentication/access control**. The page reads only the current public published catalog and does not fetch draft/admin data. Do not treat it as a secure admin preview or enter secrets.
- Script dependencies are loaded in verified order: public configuration, V3 validator/client, branch fulfilment, product/deal view-models, deal configurator, preview orchestrator and page renderer.
- Displays connection/publication state, publication/version identity, database timestamp, branch and fulfilment selector, product categories, available standalone-sellable product variants, individual published prices, per-variant modifier choices, published deal collections, schedule/branch availability and deal component configurator.
- Product variant selectors require an explicit selection when there are multiple sellable variants; a single variant is selected as the only available choice. Non-standalone variants are excluded from the standalone product list.
- Product modifiers show their individual fixed or variant-specific price amounts. Required/max selection bounds are validated locally. No combined product total is computed.
- Deal variant labels and component selections are previewed without representing the deal variant base amount as a final deal price. Deal component/modifier prices remain itemized. Deal selection payloads stay in browser memory only and contain identifiers, not price totals.
- No add-to-cart action is present; legacy add selectors are hidden in this page's CSS. Deal configurator action is labelled **Validate preview choices**, and its completion message explicitly says no quote/order was created.
- Product/deal image paths are intentionally not rendered. The Storage media bucket has not yet been provisioned; the page uses neutral placeholders instead of falling back to unrelated legacy/demo images.
- Added `tests/catalog-preview-page.test.mjs` for noindex/separation, script dependencies, required page targets, safe DOM/no order or persistence calls, no totals, single-variant selector behaviour and responsive/accessibility styles. Added preview page JS syntax check and page inline-script parse check to Website Static Checks.
- One final UI review removed a duplicate placeholder option for single-variant products. Latest Website Static Checks [45098417842](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45098417842) passed on commit `255c15236e676e6f86ba9916062a641bad2eec2a`: **94 tests passed, 0 failed**, JS syntax checks and both Website/preview inline-script parsing passed.
- Website preview deployment workflow run [45098406409](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45098406409) was **skipped** because `FLAME_CHICK_WEBSITE_PREVIEW_DEPLOY_ENABLED` is not `true`. No deployment occurred. No SQL migration was applied, Edge Function deployed, menu published, Supabase data changed or checkout enabled.

**Next:** the separate preview page needs a real browser visual/interaction review before it can be considered release-ready. Since it is intentionally not deployed, test it in a controlled local/static preview or wait for explicit approval to enable a protected preview deployment. Before any deployment, agree on access control: `noindex` is not a security boundary. Then provision/validate media storage and implement the authoritative order quote API before considering cart/checkout.

---

## Latest checkpoint — V3 non-ordering catalog preview orchestrator (2026-11-23)

**Status: isolated orchestration layer added and regression-tested. It is not referenced by the Website HTML and is not deployed.**

- Added `apps/flame-chick-website/js/catalog-v3-preview.js`.
- Orchestrates V3 catalog client, strict V3 validator, branch/fulfilment selector, product menu view-model and deal/schedule view-model.
- It accepts only a successful client load with:
  - A fully validated V3 publication;
  - matching `versionId`;
  - valid UTC `databaseNow` returned as response metadata and on the catalog envelope;
  - branch selector initialized successfully.
- It does not use the customer device clock, localStorage/sessionStorage, or HTML injection APIs.
- The preview waits for explicit delivery/pickup selection. Where multiple branches are published, it waits for explicit branch selection. It then builds product and deal view-models against that exact branch/fulfilment context.
- A branch change clears the current preview and resets fulfilment. A fulfilment change rebuilds product and deal view-models for the updated context. Reload clears the old preview before fetching the catalog again.
- The exported API deliberately exposes no add-to-cart, checkout or order submission methods. Result view-models are tagged `non-ordering-preview` with `canAddToCart=false`, `canCheckout=false` and `canSubmitOrder=false`.
- Added `tests/catalog-v3-preview.test.mjs` covering single/multi-branch boot, context selection, branch-change invalidation, fulfilment rebuild, unpublished/network/mismatched catalog state, one view-model failing, subscriptions, reload and absence of browser clock/storage/order dependencies.
- The first two test runs caught mismatched test-fixture assumptions about the exact public API state shape and response timestamp envelope; tests were corrected while keeping strict production validation intact.
- Latest Website Static Checks run [45097423061](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45097423061) passed on commit `6633af2f2c20fb3f36220958e18e0f3686928b1f`: **85 tests passed, 0 failed**, JavaScript syntax checks and inline Website script parsing passed.
- Subsequent handoff update is documentation-only. The preview module and its tests are still unreferenced by `index.html`; the prior hidden-menu safety gate is unchanged. No database migration was applied, Edge Function deployed, catalog published/seeded, Vercel deployment or domain change performed, and no ordering flow enabled.

**Next:** build the actual non-ordering product/deal preview renderer on top of this orchestrator, keeping it as a separate gated preview page/entry rather than altering the legacy storefront page. The preview should present product variants and deal choices while keeping all add/order controls absent. Only after visual and interaction checks pass should an explicit, separate decision be made about connecting the live Website. Checkout remains closed until trusted server quote/order APIs and complete end-to-end checks exist.

---

## Latest checkpoint — trusted database time and branch/fulfilment selector (2026-11-22)

**Status: isolated V3 branch/fulfilment selector and database-time transport contract implemented; Website Static Checks passed. Candidate SQL migration is committed but NOT applied. No storefront integration or deployment.**

- Added `apps/flame-chick-website/js/branch-fulfilment-v3.js`.
  - If the published catalog has exactly one branch, it selects that branch automatically.
  - If more than one branch exists, the customer must explicitly select one.
  - Delivery/pickup is always an explicit choice, including the one-branch case.
  - Each method is enabled only when both `websiteOrderingEnabled` and its corresponding branch flag are true.
  - Changing branch clears the previous fulfilment selection. Unknown branch IDs, duplicate branch IDs, empty branch catalogs, missing contract/time and unsupported fulfilment methods fail closed.
  - Accessible fieldsets, legends, labelled radio controls and live status text are used; catalog names are inserted as text, not HTML.
  - The module does not use the customer's device clock.
- The previous public catalog RPC did not return trusted server time. Added candidate migration `supabase/migrations/20261122174500_flame_chick_catalog_database_time_metadata_v1.sql` to return PostgreSQL `clock_timestamp()` as UTC `databaseNow` metadata. It leaves the immutable snapshot and its SHA-256 input unchanged, preserves SECURITY DEFINER + empty search_path, and keeps the RPC executable only by `service_role`. The migration verifies the checksum and closed table grants.
- Updated `supabase/functions/flame-chick-catalog/index.ts` to pass the RPC timestamp through health/catalog metadata, validating its UTC shape. Updated V3 catalog client and contract so the catalog response must carry a valid database timestamp before it can be used; isolated publication-snapshot validation continues to accept the stored snapshot without transport-only time metadata.
- Added strict UTC timestamp validation in `catalog-v3.js`; invalid calendar dates such as 30 February are rejected. The branch flow receives database time explicitly and does not calculate current time itself.
- Added `tests/branch-fulfilment-v3.test.mjs` covering one/multiple branches, explicit fulfilment, branch switching, unsupported ordering, unknown/duplicate branch IDs, invalid/missing trusted time and absence of browser clock dependencies.
- Added `tests/catalog-database-time-migration.test.mjs` to statically verify the candidate migration's checksum, metadata, SECURITY DEFINER, search_path and grants contract. These are source-level checks, not a live PostgreSQL migration rehearsal.
- Added all new files/tests and migration path to Website Static Checks. A sequence of CI failures caught a misplaced metadata requirement, a validator splice/syntax issue and two test-order expectations; those were corrected before the final green run. Do not treat the earlier failed runs as successes.
- Latest Website Static Checks [45049977005](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45049977005) passed on commit `a7ff7e98a6044b49a82b27349171fe3b9a052e9e`: **77 tests passed, 0 failed**, JavaScript syntax checks and inline Website script parsing passed.
- Latest Edge Function Static Checks [45049441105](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45049441105) passed on commit `f0c0d381c2a7813b3a71900729a102ca55a7696b`; Deno type checks include the updated catalog function.
- Website preview deployment workflow was skipped. No migration was applied; no Edge Function was deployed; no catalog was published/seeded; no Vercel deployment, domain change, menu enablement or checkout activation occurred. Existing Website HTML remains unchanged and the hidden-menu safety gate remains in force.

**Next:** build an isolated orchestration/preview adapter that loads and verifies the V3 catalog, obtains the trusted database timestamp, requires branch/fulfilment selection, and then constructs product and deal view-models for that exact context. It must remain non-ordering and not activate the old hardcoded menu. Add tests for branch changes invalidating product/deal view models and ensure the quote/order server remains the only pricing authority. Only after that preview adapter passes should we consider integrating it into the Website behind a disabled-by-default feature gate.

---

## Latest checkpoint — V3 deal configurator adapter (2026-11-22)

**Status: isolated accessible deal configurator and ID-only selection payload implemented; latest full Website Static Checks passed. Not wired into storefront. No deployment or publication.**

- Added `apps/flame-chick-website/js/catalog-v3-deal-configurator.js`.
- Provides explicit deal-variant selection; component group selection and quantity caps; per-instance modifier customization for repeated component items; required/maximum selection validation; and accessible fieldset/legend, labels, radio/checkbox/number controls and live status.
- Changing deal variant resets prior component choices. Reducing a repeated component quantity removes customizations belonging to removed instances. A closure issue in repeated-item modifier event handlers was found during review and fixed using block-scoped loop binding.
- The completion callback receives only the V3 publication/version/branch/fulfilment identifiers, deal and variant IDs, component option/product/product variant IDs, modifier group IDs and modifier IDs. It does not include names, prices, totals or browser-computed quote data. The future server quote/order API must independently validate all identifiers, current publication, availability, schedules, selection rules and authoritative prices.
- UI renders base variant and option/modifier price labels only for display; no client-side total is calculated. The adapter requires an explicit completion callback and does not itself submit orders or call an API.
- Added `tests/catalog-v3-deal-configurator.test.mjs` for fail-closed context, variant and component selection, quantity caps, ID-only payload shape, repeated component customizations, invalid modifier IDs, stale customizations after quantity reduction, and required rendering dependencies.
- A first explicit run caught two test harness setup errors; corrected the tests. A subsequent review caught that the new test file was not yet in the CI test command. Updated the workflow to explicitly run it. Another regression test covers a required modifier group that cannot be satisfied due to a missing variant-specific price rule; such component options now fail closed rather than silently dropping the required group.
- Latest Website Static Checks run [45048585722](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45048585722) passed on source/test commit `237826c15b3048118f50558b17286d6e7e5b041c`: **65 tests passed, 0 failed**, syntax checks and Website inline-script parsing passed. The handoff update is documentation-only.
- The configurator remains unreferenced by `index.html`; the Website's hidden-menu safety gate is unchanged. No database write, migration, Edge Function deployment, menu publication/seed, Vercel deployment, domain modification or checkout activation.

**Next:** implement a unified branch and fulfilment selector that consumes the published catalog, handles the one-branch case safely and requires a user choice when multiple branches exist. It must obtain trusted server time and keep delivery/pickup disabled when the selected branch does not support it. Then create a non-ordering preview integration that can render product and deal UI behind an explicit feature gate. Keep checkout closed until the server quote/order API and full integration tests exist.

---

## Latest checkpoint — V3 deal choices, component modifiers and trusted-time schedules (2026-11-22)

**Status: isolated deal/schedule view-model and selection validators added; latest full Website Static Checks passed. Not connected to the Website HTML. No deployment or publication.**

- Added `apps/flame-chick-website/js/catalog-v3-deal-view.js`.
- Requires a fully validated V3 publication, explicit branch ID, explicit delivery/pickup fulfilment, and a trusted database timestamp. It deliberately does not call `Date.now()` or use the customer's device clock.
- Deal schedule precedence matches the approved database design: branch-specific assignment, then global deal assignment, then collection fallback. If no schedule is assigned, the deal is not schedule-restricted. A referenced but missing schedule fails closed.
- Schedule evaluation supports IANA timezones, weekly windows, all-day windows, overnight windows tied to the starting weekday, effective local dates and one-off absolute windows. Window start is inclusive and end is exclusive. Database checkout must still re-evaluate at quote/order time; browser display state is informational only.
- Deal view-model uses exact deal variant/component-option mapping IDs, product and product-variant IDs, pricing treatment, integer minor-unit display metadata, option quantity caps and branch product/variant/deal availability. It does not compute a deal total.
- Missing deal-variant option mapping is never treated as included/free. Unavailable component options are removed; a deal variant becomes unsatisfiable if a required group no longer has enough branch-available capacity.
- Product modifier groups are now exposed for eligible deal component variants using the exact product-variant-specific modifier price rule. `standaloneOnly` groups are excluded from deal components. Modifier selection validator enforces assigned group IDs and min/max option counts. It does not calculate totals.
- Added `tests/catalog-v3-deal-view.test.mjs` for timezone/window boundaries, overnight schedules, invalid/missing trusted time, schedule precedence, branch availability, exact component mappings, missing pricing maps, required choices, quantity caps, modifier mapping and selection bounds.
- A first test run exposed a time-parser regex escaping defect; the parser was corrected and the exact boundary cases were re-run successfully. This is why the failed CI run is retained in Actions history rather than hidden.
- Latest Website Static Checks run [45047473872](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45047473872) passed on source/test commit `0b6b56cfcbed32008614c37db5a2f623e8842dbd`: **55 tests passed, 0 failed**, syntax checks and inline Website script parsing passed. Subsequent handoff-only commit records this result.
- The deal module and tests are not referenced by `index.html`; the hidden-menu safety gate remains unchanged. No Supabase writes, migrations, Edge Function deployment, publication, menu seed, Vercel deployment, domain change or checkout activation.

**Next:** build an isolated, accessible deal/customization UI adapter around the validated deal and product modifier view-models. It must require explicit deal variant and component selections, support modifier selection per chosen component, and send only stable IDs/quantities to the future server quote API. Do not compute final totals in the browser. Then unify product/deal renderers behind the branch/fulfilment selection flow and only integrate after end-to-end tests.
 
---

## Latest checkpoint — isolated V3 Website menu renderer foundation (2026-11-22)

**Status: renderer/view-model and focused tests added; latest full Website Static Checks passed. It is intentionally not connected to the storefront. No deployment or catalog publication.**

- Added `apps/flame-chick-website/js/catalog-v3-view.js` as a separate module. It accepts only snapshots that pass the strict V3 validator and uses stable UUIDs, never legacy product names or hardcoded menu data.
- Builds menu categories/products/variants from the immutable publication, maps modifier groups and exact variant-specific price rules, filters global and branch product/variant availability, and requires explicit branch selection when more than one branch exists.
- Branch fulfilment flags are checked independently for delivery and pickup. It does not calculate cart totals or claim checkout price authority.
- DOM renderer uses `createElement` and `textContent` for database-controlled text; no HTML-string injection. Multiple variants are not silently selected. Modifier UI is explicitly marked pending; products with modifiers are not addable through this initial renderer. Deals, schedules, media delivery and full customization UI are not yet rendered.
- Added `tests/catalog-v3-view.test.mjs` for V3 validation gate, branch selection, fulfilment flags, branch overlays, multi-variant handling, modifier price mapping and integer-money formatting.
- CI workflow now syntax-checks the new view module and includes the focused test file. First run exposed a test-isolation issue (global validator fallback); test was corrected to pass an explicitly empty validator dependency. Verify the latest run before proceeding.
- Latest Website Static Checks run [45046567404](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45046567404) passed on source/test commit `cc02e5a9ae8a2096dfe30816ebcf99be8dfe6333`: **42 tests passed, 0 failed**, JavaScript syntax checks passed, and inline Website scripts parsed. Subsequent handoff-only commit records this result.
- The V3 renderer is not referenced by `index.html`; old V2/hardcoded path remains behind the hidden-menu safety gate. No live customer menu can be exposed by this work.
- Preview workflow was skipped; no Vercel deployment. No Supabase/database write, Edge Function deployment, catalog publication, menu seed or secret change.

**Next:** implement and test schedule evaluation, deal view-model/UI, modifier selection/pricing UX, controlled media handling, and a deliberate branch/fulfilment selection flow. Only after all V3 capabilities and end-to-end checks are complete should the storefront be integrated. Keep checkout disabled until server-side Order API pricing/idempotency/rate limits exist.
 
---

# CRITICAL IDENTITY AND SPELLING GUARDRAIL — READ BEFORE GITHUB / VERCEL ACTIONS

This project has repeatedly been affected by assistant-side owner-name typos. Do not rely on memory, shortened names, or guessed account slugs. Copy these exact identifiers:

- **GitHub owner (exact):** `itsfahadahmed1234-creator`
- **GitHub repository (exact):** `flame-chick-platform`
- **Full GitHub repository path (exact):** `itsfahadahmed1234-creator/flame-chick-platform`
- **GitHub working branch (exact):** `work/production-source-audit`
- **GitHub default branch:** `main` — leave it untouched unless the user explicitly directs otherwise.
- **Vercel team name / slug:** `Fahad` / `fahad-7455`
- **Vercel team ID (exact):** `team_Rpf9jeGg9r3cmMguFXHtziqz`

### Mandatory safeguards

1. Always use the full, exact GitHub repository path above in connector calls. Never abbreviate or reconstruct the owner name.
2. The owner spelling contains **`ahmed`**: `itsfahad + ahmed + 1234-creator`. Do not drop letters or shorten it.
3. Common incorrect variants include `itsfahadah1234-creator`, `itsfahad1234-creator`, and any other spelling that omits `ahmed`. These are not the repository owner.
4. Before any GitHub read/write, verify the repository with GitHub `get_repo` or a successful fetch against the exact full path. Before any Vercel Git operation, verify the linked repository in Vercel Git deployment context.
5. Before editing a handoff file, fetch the current file from the exact repository and branch, then pass the returned current blob SHA to the update call. If GitHub returns 404, stop and re-check the full owner/repository spelling; do not keep retrying guessed names.
6. Do not assume GitHub owner, Vercel team, Supabase organization, or project identifiers are interchangeable. Keep each service's identifiers separate.
7. Preserve the user's HFP resources and the legacy Flame Chick resources. Do not change them as a workaround for an account-name or connection error.

This guardrail is intentionally prominent because these identifiers are operationally critical. Treat the exact values above as authoritative and verify them at the point of use.

---

## Latest checkpoint — V3 public Website catalog client scaffold (2026-11-22)

**Status: client module and focused tests added, but final CI run after test-harness corrections is not yet verified. Client is not loaded by the Website HTML and no deployment is authorized.**

- Added `apps/flame-chick-website/js/catalog-v3-client.js`.
- Client requires HTTPS API configuration, public publishable key, and the V3 validator.
- Fetches health first; unpublished status returns a closed state without catalog fetch.
- Fetches catalog only after valid published health metadata.
- Validates the complete V3 snapshot and requires exact match for schema version, publication ID/number, draft revision, snapshot hash, publication timestamp and derived version ID between health and catalog.
- Uses GET, `cache: no-store`, `redirect: error`, bounded response size (4 MiB plus bounded envelope overhead), request timeout, one retry for network/429/5xx, and no persistent browser storage cache. Permanent HTTP errors and schema/integrity failures are not retried.
- Browser sends only the public publishable key; no Authorization bearer secret is added. Database RPC remains responsible for recomputing the PostgreSQL jsonb::text SHA-256 before the snapshot leaves the server.
- Added `tests/catalog-v3-client.test.mjs` for success, unpublished, health transport failure, metadata mismatch, malformed envelope/schema, retry policy, oversized response, HTTPS and validator requirements.
- Added client syntax check and client tests to `.github/workflows/ci-website-static.yml`.
- First run `45045702129` failed on two test-harness expectations (default transient retry count and UMD global fallback in the missing-validator test). Both test setups were corrected in commit `d4efcb3d9f5b881ab48ea7a54ab9b91e6868bc05`. The rerun triggered by that commit must be inspected and confirmed successful before proceeding.
- Current intended branch head after test corrections: `d4efcb3d9f5b881ab48ea7a54ab9b91e6868bc05`.

**Still not done:** no HTML script reference to the V3 client, no dynamic menu rendering, no V3 pricing/choice/cart UI, no checkout integration, no Edge Function deployment, no database migration or publication, no Vercel deployment. Existing V2 loader and hardcoded menu path remain behind the current hidden-menu gate. Do not remove that gate or expose the menu yet.

Next: confirm CI passes, then build isolated rendering/view-model tests against the real V3 fixture. Integrate only after V3 menu, variants, modifiers, deals and branch rules are fully rendered from stable database IDs and tested. Keep final order pricing exclusively server-calculated.

---

## Latest checkpoint — Website database-driven catalog integration audit (2026-11-22)

**Status: database-driven architecture confirmed; active V3 client integration is still pending. Do not deploy.**

### Source-of-truth decision

- Supabase's immutable published catalog is the only source of truth for Website categories, products, variants, sizes, prices, modifiers, deals, availability, schedules, branches and fulfilment eligibility.
- Website HTML/JS may contain presentation templates, layout, static marketing copy and design assets, but must not contain operational menu/product/price/deal data.
- Admin edits draft catalog data; publication creates an immutable version; Website reads only the current published snapshot. No draft-table fallback.
- Customer-visible pricing is informational until the trusted checkout/order API independently validates the selected published IDs and recalculates all prices/totals.

### Verified integration findings

- Publication compiler in `20261122031027_flame_chick_catalog_publish_rollback_v1.sql` emits **schema V3** and publication metadata. SHA-256 is lowercase hex of UTF-8 bytes of PostgreSQL `jsonb::text`.
- Public read RPC independently recomputes and verifies this hash before returning the immutable current publication.
- Public Catalog Edge Function `supabase/functions/flame-chick-catalog/index.ts` returns the V3 snapshot plus publication identity metadata. It uses server-side database credentials only; browser receives only the public publishable key.
- Found and fixed a health endpoint edge case: when there is no publication, it previously advertised schema 2 even though the contract is V3. Constant now reports schema 3 for the unpublished health response too.
- V3 validator and tests were corrected to allow optional deal component groups with zero allowed mappings while still requiring satisfiable mappings for groups with `minUnits > 0`, matching the database publication validator.
- Current edge function config keeps public catalog read with `verify_jwt=false`; the function still requires the public API key and uses server-side secret only for the internal RPC. Do not expose secret key to browser.

### Verification

- Website catalog V3 contract workflow passed previously: 26 tests, 0 failures (run 45045341326, commit `5540866736ba00c11a560a9147aa34bb436ab464`).
- Edge Function Static Checks passed after unpublished-health schema correction (run [45045454847](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45045454847), commit `f68e2f11514a58760597d37576ff5facd809e9de`).
- Current branch head at this checkpoint: `f68e2f11514a58760597d37576ff5facd809e9de`.
- No Edge Function deployed, no catalog published, no database migration/write, no Website V3 client integration, no deployment, and no legacy site change.

### Next safe implementation sequence

1. Build a V3-only public client that calls health then catalog, verifies publication metadata matches exactly, validates the full V3 snapshot, rejects stale/tampered/mismatched responses, bounds response size/time/retries, and uses no persistent browser cache until integrity/caching design is explicitly tested.
2. Test unpublished, network failure, timeout, HTTP errors, invalid JSON, schema mismatch, publication ID/version/hash mismatch, malformed snapshot, oversize response and server checksum failure.
3. Integrate the V3 client behind the existing hidden menu gate; remove hardcoded operational menu data from the active Website path only after dynamic rendering and UI parity tests are complete.
4. Render categories, products, variants, modifiers and deals by stable database IDs; never use display names as identifiers. Keep branch-specific availability and schedules fail-closed.
5. Keep cart selection IDs and display quote separate from final price authority. Do not enable checkout until the order API supports V3 IDs and recalculates every amount server-side.
6. Do not expose V3 menu, remove the old fallback guard, deploy or publish until all end-to-end tests pass.

---

## Latest checkpoint — strict Website catalog V3 contract (2026-11-22)

**Status: strict V3 snapshot/health contract implemented and automated checks pass. This is a validator milestone only; it is not yet wired into the storefront loader, pricing UI, or checkout. No deploy or live catalog publication.**

### Source and identity guardrails

- Exact repository: `itsfahadahmed1234-creator/flame-chick-platform`.
- Active work branch: `work/production-source-audit`. Keep `main` untouched.
- Supabase project remains `adkrxfnawdiljhjaavnj` in Mumbai on Free plan.
- Old deployed Website `flame-chick.vercel.app` and all legacy workspaces remain untouched.

### Implemented

- Added `apps/flame-chick-website/js/catalog-v3.js`, a standalone browser/CommonJS-compatible V3 contract module. It is intentionally not yet imported by the active storefront; the old V2 loader remains unchanged and rejects V3. The previously added hidden-by-default menu guard therefore remains in effect.
- Exact V3 top-level allowlist matches the public Catalog Edge Function envelope's `data` object: publication compiler fields plus `versionId`, `publicationId`, `publicationNumber`, `draftRevision`, `pricingEngineVersion`, `snapshotSha256`, and `publishedAt`.
- Rejects unsupported versions, missing/unknown fields, invalid metadata, oversized payloads (>4 MiB plus bounded envelope overhead), malformed arrays/rows, invalid UUID/date/time/timezone/currency/branch-code/key values, duplicate IDs/relationships, and dangling/cross-entity references.
- Money is validated as finite non-negative numeric values with at most two decimal places and converted to integer minor units; null and zero remain distinct.
- Enforces product variant existence, pack metadata shape, modifier selection bounds, exact BY_SIZE price-rule coverage for every assigned product variant, and adequate active modifier options.
- Enforces deal/variant/group/option relationship integrity, per-variant allowed option mapping, group selection capacity, pricing treatment rules, and STANDALONE restrictions (BASE_PLUS_SELECTED_ITEMS + standalone-sellable priced variant).
- Validates weekly/one-off schedule shapes, calendar dates, IANA timezones, restaurant/branch schedule timezone scope, and unique branch/global deal schedule assignments.
- Exposes fail-closed branch ordering and product/variant/deal availability resolvers. A branch override cannot reactivate a globally unavailable product or variant.
- Explicitly rejects nonempty `deliveryAreas` or `promotions` because publication schema V3 currently emits them as empty arrays and their full implementation is not yet available.
- Added deterministic V3 fixture `tests/fixtures/catalog-v3-fixture.cjs` and 21 contract tests in `tests/catalog-v3-contract.test.mjs` (plus the existing 5 Website source-hygiene checks).
- Updated `.github/workflows/ci-website-static.yml` to syntax-check the V3 module and execute both test files.

### Verification

- Latest Website Static Checks workflow for branch HEAD `d808bc5150eca1ba24af54f2ddd5555fe26636bf`: SUCCESS.
- Run: [45044376718](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45044376718).
- Test result: 26 passed, 0 failed; Website inline scripts parse successfully.
- Preview workflow for the same change was skipped; no Vercel deployment was created.
- Earlier exploratory test runs exposed fixture/test defects and were fixed before the successful run. Do not treat those failed runs as current failures; the latest branch-head run is the authoritative result.

### Important limitations — still NOT production-ready

1. V3 validator is not yet connected to `catalog.js` or the page's active loader.
2. Website remains statically authored and name-matched; dynamic category/product/variant rendering is not implemented.
3. The current `pricing.js` still implements the legacy V2 deal model; exact V3 modifier/deal pricing and customer choice UI are not implemented.
4. Schedule evaluation, branch selection, branch-specific product/variant/deal visibility and fulfilment eligibility have only contract-level helpers/tests, not full customer UI integration.
5. The public Catalog Edge Function is not deployed in this project; no published snapshot exists to perform a live read test.
6. Client-side integer minor-unit conversion is a display/UX safety mechanism only. Checkout must independently recompute all prices, modifiers, deal selections, delivery fees and totals on the trusted server.

### Next work — required sequence

1. Add a version-pinned public catalog client for `health` and `catalog` actions: validate response envelope, health metadata, V3 schema, publication identity and cache/version behavior. Keep network errors, unpublished catalogs, unsupported versions and hash/metadata mismatch fail-closed.
2. Reconcile the snapshot hash semantics exactly with the server's `snapshot_sha256` calculation before attempting browser-side hash verification. Do not assume whether the hash covers the raw snapshot or metadata-wrapped DTO; document and test the exact byte/canonicalization contract first.
3. Build dynamic menu/category/product/variant rendering from stable IDs; sanitize all untrusted text and constrain media paths to a controlled same-origin allowlist. Do not use legacy name matching.
4. Implement a V3 quote/pricing engine in integer minor units for product variants, FREE/FIXED/BY_SIZE modifiers, modifier selection bounds, deal variants, required/optional groups, repeat and quantity limits, INCLUDED/SURCHARGE/STANDALONE treatment, and schedules/branch availability.
5. Add exhaustive golden and property tests, including DST/overnight schedule boundaries, cache invalidation, stale versions, tampering, XSS payloads, large payloads, duplicate cart selections, max quantities, null/zero prices and every deal pricing combination.
6. Align checkout payload with stable V3 IDs and server-side order quote/recalculation, idempotency and website-only rate limiting before enabling order submission.
7. Only after source, test and server dependencies are complete request a controlled preview; no deployment is currently authorized.

No Supabase migration, database write, catalog publication, Edge Function deployment, secret change, Vercel setting, Vercel deployment or legacy live-site change was made during this milestone.

---


## Latest checkpoint — Website V3 compatibility safety gate (2026-11-22)

**Status: first fail-closed storefront guard implemented and its CI passed. V3 integration itself is NOT implemented; no menu is published and no deployment was created.**

- Repository identity verified: `itsfahadahmed1234-creator/flame-chick-platform`.
- Branch: `work/production-source-audit`; do not merge or push to `main`.
- Website V3 incompatibility reconfirmed: publication compiler emits schemaVersion 3 normalized catalog. Existing `apps/flame-chick-website/js/catalog.js` validates schemaVersion 2 and expects legacy PascalCase DTO fields. Existing pricing engine `js/pricing.js` consumes legacy `dealComponents`, `SizeKey` modifier rules and a simple bundle-price deal model. V3 has deal variants, component groups/options, variant-specific pricing treatment/surcharges, schedules and branch availability. A version-number-only change or lossy V3->V2 conversion is prohibited.
- Existing Website menu HTML is statically built from a hard-coded MENU array and then matched to live catalog by product names; this is not a safe production catalog source. The old platter mapping is also a simplified deal special case.
- Safety change: `apps/flame-chick-website/index.html` now initially hides `#cats` and `#menuRoot`, shows an accessible status notice, and reveals the old menu only after `FlameChickCatalog.load()` reports a ready, validated catalog. Missing config or any load/validation error keeps the menu hidden. This is a temporary fail-closed guard, not the completed V3 storefront.
- Regression guard added to `tests/website-source-hygiene.test.mjs` to require the hidden-by-default menu, status notice and both ready/failure state transitions.
- Website static CI run [45042841555](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45042841555) — SUCCESS. JavaScript syntax, all website hygiene tests including the new fail-closed assertion, and inline script parsing passed.
- Corresponding preview workflow [45042841520](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45042841520) — SKIPPED. No Vercel deployment was created.
- This source change only alters the new private repo branch. It does not alter the old legacy Website deployment or live domain.

### Required implementation before V3 storefront acceptance

1. Define a strict versioned V3 client contract directly from the SQL snapshot compiler. Validate all required arrays, identifiers, foreign-key relationships, enum values, numeric prices, integer quantities, and snapshot metadata. Reject unknown incompatible versions and malformed/duplicate IDs.
2. Replace hard-coded name-matched menu with dynamic category/product/variant rendering using stable database IDs. Do not silently pick the first variant. Enforce branch-specific availability and restaurant/branch website-ordering flags.
3. Rewrite pricing engine to consume V3 normalized structures: exact productVariantId modifier-price rules; group min/max and selection modes; deal collections/variants/component groups/options; included, standalone, and surcharge treatments; max quantities/repeat rules; schedule/timezone evaluation; branch availability. Preserve NULL vs zero and avoid JS floating-point money arithmetic.
4. Make deals fully selectable in UI and persist exact chosen variant/component IDs in cart and order payload. Reject missing/extra/invalid choices locally for UX and again server-side.
5. Resolve delivery area/default fee and branch identity as explicit server-controlled checkout data; current V3 snapshot deliberately emits empty deliveryAreas and promotions, and old frontend fallback behavior must not be carried over as assumed configuration.
6. Add deterministic fixtures covering all catalog entity types, valid/invalid snapshots, stale cache, unpublished catalog, unsupported schema, missing/null/zero values, disabled branch, schedule edges/timezones/DST, modifier price matrix, deal choices/surcharges, cart version changes and XSS/untrusted display text.
7. Add property/fuzz tests for duplicate IDs, cross-restaurant/branch references, missing relationships, overflow, unsafe numeric values, huge payloads and malformed JSON. Keep cache versioned and fail closed on stale/unknown formats.
8. Align Website order payload and Order API validation with V3 IDs and pricing; server recomputes all totals. No customer order submission until the order schema/RPC/function and idempotency/rate-limit controls are implemented and tested.
9. Only after tests pass, request explicit approval for a controlled preview. Keep current static menu hidden until V3 path is complete. Do not publish or seed any menu, do not deploy, and do not touch the legacy site.

No Supabase migration, publication, data write, Edge Function deployment, secret change, Vercel setting or Vercel deployment was performed in this checkpoint.

---


## Latest checkpoint — runtime security and integration audit (2026-11-22)

**Status: read-only audit completed. Security boundaries show expected deny-by-default behavior. No deployment or production-data mutation performed. Multiple launch-blocking integration gaps remain.**

### Supabase project and deployed function state

- Project `adkrxfnawdiljhjaavnj` is `ACTIVE_HEALTHY`, Postgres 17.12, Mumbai `ap-south-1`; Free plan retained.
- Migration ledger contains 24 migrations through `20261122105821_flame_chick_catalog_publication_validation_fixes_v1`.
- No Supabase database branches exist.
- Only deployed Edge Function is `flame-chick-staff-admin`, ACTIVE version 1, deployment ID `ea8d70fb-5f7b-4198-9442-dedd82fdf79a`, `verify_jwt=true`, deployed SHA-256 `1c541dca27382731b10ccad6219aa94eaadf8c0412242e3da59471df78947327`.
- The deployed Staff Admin version predates the Catalog route additions currently on the working GitHub branch. The branch code (including `catalog-actions.mjs`) passed CI but is **not deployed**. Do not assume the live function has Catalog Admin API routes.
- No Staff Admin function log entries were found in the 24-hour audit window queried (2026-11-21 16:00 UTC to 2026-11-22 16:00 UTC). This confirms no invocation evidence in that window; it does not by itself prove a runtime failure.
- The new Vercel Admin project has no deployment, so there is no new-domain authenticated browser session to use for an end-to-end test. The open browser tab `flame-chick-admin.vercel.app` belongs to a legacy app and must not be used for new-project tests.

### Database access and role-isolation checks

- Read-only ACL audit found 33 application tables across `public` and `app_private`; all 33 have RLS enabled and no direct SELECT/INSERT/UPDATE/DELETE grants for `anon` or `authenticated`.
- `public.flame_chick_staff_admin_command` is a postgres-owned SECURITY INVOKER wrapper executable by authenticated only; its private implementation derives the actor from `auth.uid()` and checks the active restaurant-wide Admin/Owner role.
- `public.flame_chick_staff_admin_system_command` is postgres-owned SECURITY DEFINER with empty search_path and executable only by service_role.
- The catalog public wrappers are authenticated-only; private authoring helpers check the active restaurant-wide Admin/Owner. The public catalog read helper is service_role-only.
- Safe negative runtime calls without an authenticated actor returned:
  - Staff Admin `list` -> `STAFF_AUTH_REQUIRED`
  - Catalog draft read -> `CATALOG_ADMIN_FORBIDDEN`
  Both aborted before any write.
- Live tenant counts: one restaurant, one branch, one active Admin role; no Owner, Manager, Cashier or Rider assignments. Zero menu categories/products/deals, zero catalog publications and zero current-publication pointers.
- Security Advisor: 33 INFO `rls_enabled_no_policy` notices are the intentional deny-by-default table posture; one WARN `auth_leaked_password_protection` is unavailable on the Free plan. No paid upgrade is authorized.
- Performance Advisor: 30 INFO unused indexes on this empty/pre-launch workload; retain until real workload evidence justifies a change. Health Advisor: no findings.

### Storage and Admin UI

- The `flame-chick-media` Storage bucket does not exist yet.
- `storage.objects` and `storage.buckets` have RLS enabled and zero policies. Table-level privileges exist for the API roles, but without policies the legacy browser upload/delete paths remain denied. Do not add broad policies to make them work.
- The Admin app's active bootstrap permits only the Staff & Riders page. Dashboard, Orders, Menu, Categories, Deals, Delivery, Website Images and Website Settings are disabled both in the HTML and again in the JavaScript bootstrap.
- The Admin source still contains older direct PostgREST CRUD and Storage helper code for those disabled modules. Database RLS/no direct table grants and the no-policy Storage posture deny those operations. This is defense in depth, not a reason to re-enable the old UI. Before enabling any such module, remove/replace its direct browser CRUD path with its reviewed authenticated API and add tests proving the old paths are unreachable.

### Critical Website / catalog compatibility blocker

- Production database publication compiler creates **schemaVersion 3** snapshots with the normalized new catalog/deal model (typed product variants; exact product-variant modifier price rules; deal collections, deal variants, component groups/options, schedules and branch availability).
- Current Website loader `apps/flame-chick-website/js/catalog.js` is still hard-coded to **schemaVersion 2** and requires the old PascalCase DTO arrays/fields (including legacy `dealComponents`, `SizeKey` modifier price rules and `deliveryAreas`).
- Current public Catalog Edge Function source returns the stored V3 snapshot unchanged; it does not contain a V3-to-V2 adapter. It also advertises schema version 2 only for the unpublished health response.
- Therefore, once a V3 publication exists, the current Website loader will reject the health/schema response before loading the menu. Merely changing the schema-version constant is not sufficient because the payload field names and deal/pricing model differ.
- No publication exists and the Catalog function is not deployed, so this is a source-contract/launch blocker, not a current customer-facing incident.
- Do not seed/publish or cut over the Website until the DTO strategy is explicit, the Website/catalog/pricing/deal code is updated together, and golden tests cover ordinary variants, exact modifier pricing, deal required/optional choices, included/surcharge/standalone components, schedules, branch availability, NULL vs zero prices and rollback.

### Order and delivery readiness

- Current Production database has no order, order-item, delivery-task, offer, assignment, rider, or website-rate-limit tables/functions.
- Supabase has no deployed `flame-chick-order-api`, `flame-chick-delivery-api`, or `flame-chick-catalog`; source files alone are not deployed capability.
- Do not deploy the Order or Delivery functions until their full schema/RPCs, role/branch/rider ownership checks, atomic status transitions, idempotency, website-only rate limiting, private Realtime authorization/outbox, expiry/return flows and E2E tests exist and pass.
- The existing source code's TypeScript pass does not override these missing runtime dependencies.

### Next gates — required order

1. Resolve and document the V3 Website DTO contract. Then implement the Website catalog, pricing and deal adapter/client changes with deterministic fixtures and regression tests. Keep the legacy live website untouched.
2. Complete a source-level security review and request-level tests for the new Catalog Admin route implementation. Only then consider updating the deployed Staff Admin function, with a separately reviewed deployment and readback.
3. Replace the disabled Admin modules' direct REST/Storage code with secure domain APIs before enabling their navigation. Create Storage bucket and narrowly-scoped policies only when the media API/ownership model is ready.
4. Implement Order and Delivery schema/RPCs and their Edge Functions, followed by role/rider/branch isolation, duplicate/retry/race/expiry/return/concurrency tests and private Realtime authorization.
5. After the relevant source/schema gates pass, request approval for a controlled preview on the new Vercel projects. Use the **new** `flamechicadmin.vercel.app` origin, not any legacy project/session. Test the existing Admin identity read-only first; do not create staff identities or send invites for smoke tests.
6. Keep all four Vercel projects without deployments, no menu seed/publication, no customer order intake and no legacy Website cutover until separate explicit approval.

No Supabase migration, table data, Auth setting, function deployment, secret, Storage policy/bucket, Vercel setting, deployment or legacy live resource was changed during this audit.

---


## Latest checkpoint — CI failure repairs and verification (2026-11-22)

**Status: targeted CI failures repaired; all current relevant automated checks pass. This is not a production-readiness certification.**

- Working branch: `work/production-source-audit`; latest verified branch HEAD at this checkpoint: `0a78a39935b598b578c272d253044ae1e439a51b`. `main` remains untouched.
- Exact GitHub repository: `itsfahadahmed1234-creator/flame-chick-platform`.

### Failures found and fixes applied

1. Catalog Admin API QA failure: the workflow attempted `npm install --global deno@2.9.8`, but npm had no matching package version. Replaced this with the same pinned `denoland/setup-deno` action used by the Edge Function pipeline, pinned to Deno `2.9.8`.
2. Edge Function TypeScript failure: TypeScript inferred that the JavaScript catalog route helper could return `undefined`. Added JSDoc `@returns {never}` to the invalid-request helper, making its always-throws contract explicit to Deno's type checker.

### Verified CI results

- Catalog Admin API QA: run [45041083181](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45041083181) — SUCCESS on exact HEAD `0a78a39935b598b578c272d253044ae1e439a51b`. All 7 Node contract tests passed; pinned Deno setup passed; Staff Admin Edge Function and imported catalog action router type-check passed.
- Edge Function static checks: run [45041080371](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45041080371) — SUCCESS on `d9454c14487804ac260b1ddfe5d1ac4e1aee63e4`. All four Edge Function type checks and RPC/key contract hygiene test step passed. The only subsequent commit to HEAD changed the Catalog QA workflow file, not Edge Function source.
- Admin static checks: run [45041080431](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45041080431) — SUCCESS on `d9454c14487804ac260b1ddfe5d1ac4e1aee63e4`. JavaScript syntax, invitation wiring, and bundled static contract checks passed. The only subsequent commit to HEAD changed the Catalog QA workflow file, not Admin app source.
- Staff Admin role-boundary disposable local Supabase QA: run [45028629608](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45028629608) — SUCCESS. Full migration replay, Admin/Owner allow paths, Manager/Cashier/Rider and missing-JWT deny paths, spoof-resistance, RLS/ACL checks, and rollback cleanup passed.
- POS/Rider static checks: run [44881805138](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881805138) — SUCCESS. POS and Rider app source did not change after that tested commit in the current working-branch history.
- Catalog publication validator migration-chain/recovery QA: run [45015595535](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45015595535) — SUCCESS. Full local migration replay, candidate regression fixture, compensation rehearsal and cleanup passed.

Older failed attempts remain in Actions history; the successful runs above supersede them for the respective code/workflow revisions. GitHub's combined commit-status endpoint returned an empty legacy status list; the results above are from the GitHub Actions run and job-step records, not inferred from that endpoint.

### Hard production boundary — do not bypass

A green CI pipeline does **not** prove that a live production system is free of bugs. It only verifies the tested static contracts and disposable test scenarios. Do not claim “zero production errors” or equate passing CI with completed end-to-end validation.

Still outstanding before any preview or production deployment:
1. Review complete source/API behavior and threat boundaries, not just compile status.
2. Deploy expanded Staff Admin/catalog code only after a separate review/approval; verify the actual deployed version and configuration.
3. Exercise safe read-only Staff Admin/catalog requests using the existing authenticated Admin session on the exact Admin origin; verify unauthorized roles/origins, JWT failures, network failures and malformed requests fail closed.
4. Complete catalog UI integration and DTO compatibility; publication and rollback remain unavailable in the catalog API until the Website schema-v3 contract is approved.
5. Finish order and delivery/rider schemas and APIs; these are not operational yet. POS/Rider static checks alone do not prove live workflow readiness.
6. Perform end-to-end Website, Admin, POS and Rider tests using non-customer test data, with explicit failure/retry/idempotency, concurrency, reconnect and recovery tests.
7. Confirm Vercel root directories, Production Branch, build/ignore settings and environment variables through readback before creating a controlled preview.
8. Keep all Vercel projects undeployed, no customer order intake, no menu seed/publication, no Website cutover and no changes to the legacy live site until separate explicit approval.

No Supabase migrations, production database data, Edge Function deployments, Auth settings/secrets, or Vercel deployments were changed while repairing CI.

---


## Latest checkpoint — Vercel Git connections completed (2026-11-22)

**Status: all four Flame Chick Vercel project shells are linked to the intended private GitHub repository; no deployment created.**

- Correct GitHub owner/repository: `itsfahadahmed1234-creator/flame-chick-platform` (owner spelling includes `ahmed`; private repository).
- Intended Vercel workspace: Fahad (`fahad-7455`, team ID `team_Rpf9jeGg9r3cmMguFXHtziqz`), Hobby plan. Hassan Food Point projects in this same workspace remain separate and untouched.
- Vercel Git deployment context verified all four project links point to that exact repository:
  - Website `flame-chick-website-production` — `prj_izBWyrFmPZIm63FHAT4jaLHUTLzu`
  - Admin `flame-chick-admin-production` — `prj_kPEqsepRzivOJhNeA32Io3netjav`
  - POS `flame-chick-pos-production` — `prj_gh1UnkZKnFnehWEs5eYhiXa40Xj5`
  - Rider `flame-chick-rider-production` — `prj_U3djCTfZK0Ubl808umChQn7MPPNg`
- Readback from all four projects: `latestDeployment=null`, `live=false`. No Vercel deployment has been created.
- Project domains previously verified and assigned: `flamechic.vercel.app`, `flamechicadmin.vercel.app`, `flamechicpos.vercel.app`, and `flamechicrider.vercel.app`.
- Git repository connection is confirmed. The Production Branch setting was not independently read back in this verification; intended branch remains `work/production-source-audit`, and `main` must remain untouched.
- No HFP project, legacy Flame Chick project, legacy `flame-chick.vercel.app` domain, Supabase setting, secret, migration, menu data or application deployment was changed in this step.

### Next safe gates

1. Read back each Vercel project's Git branch and build/root-directory settings before any deployment.
2. Verify CI on `work/production-source-audit`, especially the catalog Admin API workflow; do not treat the repository connection as a successful build.
3. Review app-specific deployment configuration and security gates before creating any preview or production deployment.
4. Keep all four apps undeployed until explicitly approved; no customer Website cutover or live order intake.

---

## Latest implementation checkpoint — authenticated catalog Admin API contract (2026-11-22)

**Status: source implementation committed; CI and runtime integration are not yet verified; not deployed.**

- Continued on `work/production-source-audit`; `main` remains untouched.
- Extended the existing `flame-chick-staff-admin` Edge Function source with a finite, authenticated catalog RPC route map instead of adding another Edge Function.
- Supported draft reads: categories, subcategories, products, modifier groups/assignments, deal collections/deals/details, schedule sets/details and publication history.
- Supported draft writes: category/subcategory/product, modifier group/assignment, deal collection/deal/components/variant options, deal schedule assignment/branch availability and schedule set.
- Every write requires a UUID `request_id` and expected draft revision. Read IDs/cursors/limits are validated; payload size is bounded to 65,536 UTF-8 bytes per mutation.
- Catalog RPC requests use only the publishable key plus the caller's Bearer JWT. The existing DB functions derive `auth.uid()`, resolve the active restaurant-wide Admin/Owner identity and remain the authority for permissions, tenant checks, input validation, idempotency and transaction safety. No client table grants or permissive RLS policies were added.
- `catalog_publish` and `catalog_rollback` are intentionally not routed yet. Do not expose them until the public Website schema-v3 DTO compatibility and launch gate are reviewed.
- Added `tests/catalog-admin-api.test.mjs` and `.github/workflows/qa-catalog-admin-api.yml`. The workflow runs Node 22 contract tests and a pinned Deno 2.9.8 type-check of the Staff Admin Edge Function. Workflow update commit: `f22a1dbabebea2af44d769f5fb2c8103856194d3`. The combined GitHub commit-status lookup returned an empty status list; **the workflow is not yet verified as passing**.
- Detailed contract and action list: `docs/handoffs/2026-11-22-catalog-admin-api-contract.md`.
- Source commits: `74ed14b667f9977a303bee4f2b5d003ed6532c9b`, `17397780afc8c0e207734c6be64c82b6618faa61`, `8781bbacc98ddc62844ff661d30c0aac145eb5a1`, `f62446a0aa8373d23bf93aca9e1edc63ccc471b2`, `13e3f19a12969824689b7f324036353a58894688`, workflow `f22a1dbabebea2af44d769f5fb2c8103856194d3`, docs `692936936371eee73b227599abf89aa77c136609`, Deno-gate documentation `c4a9c2bb9cb93a61907d5b9bd6a1032706e7049c`.
- Deployed Supabase Staff Admin remains old version 1 until QA and source review pass. No function deployment, runtime request, catalog UI integration, DB migration, menu write/publication, or Vercel change occurred.

### Next gates

1. Verify the new GitHub Actions workflow succeeds.
2. Run a full Deno/Edge Function type check and request-level mock tests.
3. Review and deploy the expanded Staff Admin function only after QA succeeds.
4. Test read-only draft reads with the existing Admin session; verify denied roles and wrong origins without writing rows.
5. Integrate the disabled Admin UI and keep publication disabled until Website DTO compatibility is resolved.
6. Keep HFP Vercel workspace isolated; reauthorize the original Flame Chick Vercel workspace before any Flame Chick deployment.

---

## Latest checkpoint — Vercel workspace isolation and Supabase verification (2026-11-22)

**Status: workspace separation confirmed; no Vercel resources changed.**

### Vercel workspace boundary

- The newly connected Vercel workspace is team **Fahad** (`fahad-7455`, team ID `team_Rpf9jeGg9r3cmMguFXHtziqz`), Hobby plan.
- Its verified projects are `hfp-admin-staging`, `hfp-website-staging`, and `hassan-food-point`. The project list returned 80 deployment records across those projects at the time of inspection.
- A Flame Chick project search in this workspace returned no matches.
- Treat this workspace as Hassan Food Point only. Do not deploy Flame Chick into it, transfer HFP resources, or modify/delete its projects, deployments, aliases, domains, environment variables, or settings.
- The previously used Vercel workspace `befahad1234-7050` is not visible through the currently authorized Vercel connection. Existing Flame Chick project shells/deployments were previously identified in that workspace; this connection change does not imply they were transferred or deleted.
- Before any Flame Chick Vercel operation, reconnect/authorize the original Flame Chick-owning Vercel workspace and verify its team ID and projects. Do not create replacement Flame Chick projects in the HFP workspace as a workaround.

### Intended production-build Supabase verification

- Project `adkrxfnawdiljhjaavnj` remains `ACTIVE_HEALTHY`, Mumbai `ap-south-1`, Free.
- Migration ledger currently contains 24 entries; latest is `20261122105821_flame_chick_catalog_publication_validation_fixes_v1`.
- `flame-chick-staff-admin` remains ACTIVE, version 1, with `verify_jwt=true`; deployed function SHA-256 `1c541dca27382731b10ccad6219aa94eaadf8c0412242e3da59471df78947327`.
- A read-only function-log query for 2026-11-22 14:00–15:15 UTC returned no function-source log entries. This does not prove the function is broken; it means no end-to-end runtime request was observed in that window. Authenticated Admin browser integration remains unverified.
- Security advisor: 33 INFO `rls_enabled_no_policy` notices are expected for deny-by-default tables; one WARN `auth_leaked_password_protection` remains because the built-in feature requires a paid Supabase plan. No plan upgrade is authorized.
- Performance advisor: 30 INFO unused-index notices on the pre-launch, effectively zero-traffic database; retain indexes until real workload measurements justify any change.
- Health advisor returned no findings.

### Next safe gates

1. Keep Flame Chick and Hassan Food Point Vercel workspaces separate.
2. When returning to Vercel work, reauthorize the original Flame Chick workspace and verify project ownership before any change.
3. Test Staff Admin from an authenticated Admin session on the intended Admin origin. Do not create synthetic persistent staff identities or send an invitation as a smoke test.
4. Continue secure catalog/order/delivery implementation only on `work/production-source-audit`; keep `main` unchanged.
5. No customer Website cutover, Admin/POS/Rider deployment, menu seed/publication, or live order intake is authorized by this checkpoint. Flame Chick remains in production-build phase, not live.

No Supabase migration, Edge Function deployment/configuration, Auth setting, secret, Vercel deployment, Vercel transfer, project deletion, domain/alias change, or production menu/order data was changed during this checkpoint.

---



## Latest stage — Staff Admin Edge Function deployed (2026-11-22)

**Status: deployed; JWT verification enabled; UI/runtime integration verification still pending.**

- User confirmed Supabase Auth Site URL and exact invitation redirect URL were already configured for the selected Admin domain.
- User confirmed the two function secrets were added:
  - `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS=https://flamechicadmin.vercel.app`
  - `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL=https://flamechicadmin.vercel.app/accept-invitation.html`
- Deployed `flame-chick-staff-admin` to project `adkrxfnawdiljhjaavnj`.
- Deployment id: `ea8d70fb-5f7b-4198-9442-dedd82fdf79a`; status ACTIVE; version 1; `verify_jwt=true`.
- Deployed source files: `index.ts` and `origin-policy.mjs` from `work/production-source-audit`.
- Verified deployment through Supabase function details and function listing. No invocation logs were present after deployment; an end-to-end request has not yet been observed/tested.
- Extended `tests/staff-admin-origin-policy.test.mjs` with exact production Admin origin checks. This test update is committed but a new CI run has not yet been observed.
- Added `docs/operations/admin-auth-deployment-configuration.md` and `docs/handoffs/2026-11-22-admin-auth-domain-binding.md`.

### Remaining checks / gates

1. Verify browser calls from `https://flamechicadmin.vercel.app` succeed only with an authenticated Admin/Owner JWT; Website/Rider/unlisted browser origins receive no CORS allow-origin.
2. Verify the deployed function's configured environment by exercising the safe Staff Admin list endpoint with the existing Admin session. Do not create synthetic production accounts or send real invitations as a smoke test.
3. Complete invitation flow testing only with an approved test invitee; verify retry-finalize/idempotency and partial failure handling.
4. Admin Vercel project `prj_139YvQ8CHvwSXsZ2xrno5x55STfz` currently has verified domain `flamechicadmin.vercel.app`, SSO enabled for all_except_custom_domains, but zero deployments and no latest deployment. Do not claim Admin UI is live. A protected preview deployment still requires a separately reviewed deployment step.
5. Keep non-Staff Admin modules disabled; legacy direct REST CRUD/storage functions remain in the Admin JS and must not be enabled until replaced with secure APIs.

No Owner account, other staff accounts, production menu data, order intake or customer Website cutover was changed. Flame Chick remains in production-build phase, not live.
# CURRENT IMPLEMENTATION STATUS — 2026-11-22 (catalog validator fix applied and verified; pre-launch build)

## Latest stage — catalog publication validator fix

**Status: APPLIED AND VERIFIED**

- Intended production-build Supabase project: `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai `ap-south-1`, Free).
- Applied migration version: `20261122105821`, name `flame_chick_catalog_publication_validation_fixes_v1`.
- Repository file: `supabase/migrations/20261122105821_flame_chick_catalog_publication_validation_fixes_v1.sql`.
- Working branch: `work/production-source-audit`; `main` unchanged.
- Revised local migration-chain and recovery rehearsal: [GitHub Actions run 45015289131 — completed / success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45015289131).

### Applied function fingerprints and security

| Helper | Applied SHA-256 |
| --- | --- |
| `flame_chick_catalog_publication_validate(uuid)` | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` |
| `flame_chick_catalog_compile_snapshot(uuid,timestamptz)` | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` |

Both helpers remain postgres-owned, ACL `{postgres=X/postgres}`, SECURITY DEFINER, empty search_path, VOLATILE, non-strict, PARALLEL UNSAFE, non-leakproof, cost 100 and rows 0. No EXECUTE is granted to `anon`, `authenticated` or `service_role`.

### Behavior fixed and tested

1. Required deal groups (`min_units > 0`) require per-deal-variant option maps; optional groups may omit them.
2. Active collection fallback schedule IDs remain valid snapshot references even without active deals. Invalid/inactive referenced schedules block publication.
3. Unreferenced active schedule drafts do not block publication and are omitted from customer snapshots.
4. Inactive-deal schedule assignments are ignored/omitted; active-deal timezone mismatches still block publication.
5. Active deal assignments to inactive branches are rejected; those assignments and otherwise-unreferenced schedule sets are omitted.
6. Existing validation for active component groups with no eligible options remains intact.

### Recovery readiness

- Recovery SQL template: `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql` (outside `supabase/migrations`, so routine pushes cannot auto-apply a reversal).
- Recovery fixture: `supabase/tests/catalog_publication_validation_recovery_v1.sql`.
- Runbook: `docs/architecture/catalog-validator-recovery-v1.md`.
- The revised CI run replays the full migration chain through the candidate, runs the candidate regression fixture, manually rehearses the recovery template and verifies the original function hashes/security metadata are restored. All steps and disposable stack cleanup passed.
- Recovery remains a separate forward-only migration: only create a new timestamped migration from the template if needed, after a fresh dry-run and separate explicit approval.

### Project invariants after apply

- Migration ledger: **24 entries**, latest `20261122105821_flame_chick_catalog_publication_validation_fixes_v1`.
- One restaurant and one branch.
- Zero categories, products, product variants, deals, schedule sets, publications and current-publication pointers.
- Zero QA fixture tenants.
- No menu data/publication, customer orders, Edge Functions, app deployments, Website cutover, Vercel aliases or DNS changes.
- Flame Chick is still in the production-build phase; the customer-facing system is not live.

## Staff Admin authorization boundary QA — implementation and live ACL audit

**State: disposable runtime role-boundary QA passed. Admin security gate still requires Edge Function/Auth configuration and app-level integration tests.**

Read-only inspection of intended production Supabase project `adkrxfnawdiljhjaavnj` confirmed:
- Active Flame Chick staff assignments: exactly one, the user's restaurant-wide `admin`; no Owner/Manager/Cashier/Rider identities exist yet.
- `user_profiles`, `user_roles`, `staff_role_audit`, `app_private.staff_invitation_requests`, and `app_private.staff_invitation_branch_targets` all have RLS enabled, postgres ownership, and no direct SELECT grants to anon/authenticated/service_role.
- `app_private` schema USAGE is granted to authenticated only; anon and service_role have no schema USAGE.
- Public Staff Admin wrapper is SECURITY INVOKER, postgres-owned, executable by authenticated only; private implementation is SECURITY DEFINER with empty search_path and authenticated-only execute. System invitation finalizer is service_role-only.
- Read-only function privilege scan found no anon or PUBLIC EXECUTE grants on functions in public or app_private.
- Staff tables are not members of Supabase Realtime publication.
- The Staff Admin command reads `auth.uid()` and accepts only an active restaurant-wide Admin/Owner. It does not trust role or actor values supplied in the JSON request body.

Added disposable CI fixture `supabase/tests/batch4_staff_admin_role_boundary.sql`. It creates five synthetic Auth identities in a transaction, bootstraps a temporary Admin, assigns Owner/Manager/Cashier/Rider through the real command, verifies Admin and Owner list access, verifies all three operational roles and missing JWT are denied, tests body-level role spoofing, and checks direct grants/RLS/Realtime exposure. It ends in ROLLBACK; no fixture identity or role is intended to persist.

Added `.github/workflows/qa-staff-admin-role-boundary.yml` to replay the full migration history on a disposable local Supabase stack, run the existing Batch 4 ACL/RLS assertions, run the new runtime role fixture, and verify all synthetic data is gone.

- Final passing CI run: [45028629608](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45028629608)
- Iterative test-only corrections: fixed workflow marker validation; seeded a deterministic QA tenant/branch because migrations are schema-only; omitted generated Auth column `confirmed_at` and corrected row arity; changed authenticated test phase to use transaction-local tenant IDs instead of direct private-table reads (which must remain denied).
- Final run `45028629608` completed successfully: full local migration replay, existing staff ACL/RLS baseline, Admin and Owner allow paths, Manager/Cashier/Rider deny paths including role-spoofing attempts, missing-JWT denial, direct table grant/RLS/Realtime structural checks, and post-rollback absence of synthetic Auth users, roles, audit rows, restaurant and branch all passed.
- The fixture and CI use only a disposable local Supabase stack and rollback-only transaction. No intended-production Supabase migration, Auth setting, Edge Function, Vercel deployment, secret or live data was changed. No Owner account was created.

No Production Supabase migration, Auth settings, Edge Function deployment, Vercel deployment, secret or live data was changed. No Owner account was created.

## Latest stage — Admin security readiness and Staff Admin origin hardening

**Code and CI: implemented; deployment configuration intentionally pending.**

- Supabase organization `Flamechic` is still Free; project `adkrxfnawdiljhjaavnj` remains `ACTIVE_HEALTHY`.
- Supabase confirms leaked-password screening via HaveIBeenPwned is available on Pro and above. No upgrade was made. The Admin invitation UI still requires at least 12 characters; use unique password-manager passwords. MFA remains a recommended next security control for Admin/Owner.
- New Vercel project `flame-chick-admin-production` has a verified default domain `flame-chick-admin-production.vercel.app`, but SSO protection applies to all except custom domains and no deployment exists. It is not a suitable public staff invitation destination.
- Legacy `flame-chick-admin.vercel.app` is a separate old project and is not used as the new Admin callback.
- Staff Admin Edge Function remains undeployed; no Auth URL settings, environment secrets, Vercel deployment, DNS, or aliases were changed.

### Staff Admin function changes

- Added `origin-policy.mjs` with strict exact-origin parsing. Rejects wildcard hosts, non-HTTPS production origins, paths, queries, fragments, embedded credentials and malformed values. HTTP is allowed only for explicitly listed loopback development origins.
- CORS reflects only an exact allowlisted browser origin; no wildcard or credentials header.
- Invitation redirect is accepted only when it is HTTPS, on an allowlisted origin, and exactly `/accept-invitation.html` with no query or fragment.
- Missing or malformed origin configuration fails closed with 503. Unlisted browser origins receive 403 without an allow-origin header.
- JWT gateway verification remains `verify_jwt=true`; database commands still use the caller's JWT and derive actor identity from `auth.uid()`. Service secret is still only used in the server-side `apikey` header for the service-only invitation finalizer.
- SQL role review confirmed the database trigger protects the last active Owner with `LAST_ACTIVE_OWNER_PROTECTED`. Admin and Owner remain distinct restaurant-wide roles; Manager, Cashier and Rider remain branch-scoped.

### Automated tests

- Added `tests/staff-admin-origin-policy.test.mjs` for exact origins, wildcard/path/query/fragment/credential rejection, safe invite callback, and CORS behavior.
- Added `tests/staff-admin-role-boundary.test.mjs` for JWT verification, `auth.uid()` actor derivation, Admin/Owner versus operational role scope, private command isolation and service-secret header handling.
- Expanded Edge Function hygiene checks and the Admin CI workflow to run these tests.
- Latest static CI: [run 45020282242 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45020282242).
- Edge Function Deno type check: [run 45020278858 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45020278858).

### Exact configuration after custom domain selection

Only after the chosen public custom Admin domain is attached and verified:
- Supabase Auth Site URL: `https://<custom-admin-domain>/`
- Auth redirect allowlist: exact `https://<custom-admin-domain>/accept-invitation.html` plus only separately approved local loopback URLs
- `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS=https://<custom-admin-domain>`
- `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL=https://<custom-admin-domain>/accept-invitation.html`

Do not deploy Staff Admin or invite staff until the public callback is ready, exact origins and redirects are configured, and the server-only secret is stored securely.

## Remaining controlled work

1. Choose and attach the public custom Admin domain; then configure exact Auth Site URL/redirect allowlist and matching Staff Admin origins.
2. Decide whether to move to Supabase Pro if built-in leaked-password screening is required; do not upgrade without explicit approval.
3. Deploy and test Staff Admin Edge Function and protected Admin preview; keep non-Staff modules disabled until secure command APIs replace legacy direct REST operations.
4. Continue catalog/order/delivery command API and pricing/quote engine work. The public snapshot still has empty deliveryAreas/promotions stubs; do not cut over the Website until required DTO parts are implemented and version compatibility is resolved.
5. Keep real-menu seeding/publication, customer Website cutover, POS/Rider deployments and Vercel changes separately reviewed and approved.

## Admin identity bootstrap — completed and verified

- Supabase project: `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai `ap-south-1`, Free).
- Auth account: `itsfahadahmed1234@gmail.com`, Auth user ID `327528e6-ea13-4f18-bd44-f4a8c7ce636a`; email confirmed.
- `public.user_profiles`: active profile, display name `Admin`.
- `public.user_roles`: active restaurant-wide `admin` role for Flame Chick, `branch_id IS NULL`, assignment method `initial_bootstrap`.
- Trigger-generated `staff_role_audit` row verified; action `activated`, actor equals the Admin user.
- The separate Owner identity has NOT been created and must remain separate. Do not grant Owner to the Admin account.
- Main branch remains the initial branch. No Manager, Cashier or Rider identities have been created.

## Immediate Admin application readiness — not yet complete

- No Supabase Edge Functions are deployed. The Admin UI calls `flame-chick-staff-admin` during bootstrap, so the panel cannot yet complete its production login/context flow.
- The Staff Admin function source is present and `verify_jwt=true`; it still needs exact production origins, invitation redirect URL, server-only secret key configuration, deployment and role/negative-path tests.
- New Vercel project `flame-chick-admin-production` has not been deployed; SSO deployment protection is enabled. The legacy Admin app project must not be mistaken for the new production project.
- Admin catalog, orders, deals, delivery, media and settings modules remain disabled in the UI. This is intentional.
- Source audit confirms legacy direct REST CRUD/storage operations still exist in `apps/flame-chick-admin/app.js`. Do not enable those modules or grant direct table CRUD for compatibility. Replace them with secure domain command APIs first.
- No Vercel deployment, Auth redirect/origin change, Edge Function deployment or secret change was performed during the Admin bootstrap.

## Catalog publication validation fixes — applied and verified

The validator/compiler fix was reviewed against the exact pre-apply function source and security metadata, passed the revised disposable CI workflow, and was applied to the intended production-build Supabase project.

- Applied ledger version: `20261122105821`.
- Repository migration: `supabase/migrations/20261122105821_flame_chick_catalog_publication_validation_fixes_v1.sql`.
- Working branch: `work/production-source-audit`; no changes to `main`.
- CI run: [45015289131 — completed / success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45015289131).
- Post-apply read-only verification confirmed both expected function source hashes, postgres ownership, exact postgres-only ACL, SECURITY DEFINER, empty search_path, and no EXECUTE for anon/authenticated/service_role.
- Post-apply counts: one restaurant, one branch; zero categories, products, deals, schedule sets, publications and QA tenants.
- No menu data, publication, Edge Function, app deployment, Website cutover or Vercel configuration changed.

The behavior changes and the exact helper fingerprints are documented in the detailed follow-up at `docs/handoffs/2026-11-22-admin-bootstrap-catalog-validator-follow-up.md`. Recovery SQL remains outside the automatic migration folder and must be copied to a fresh timestamped migration only if separately approved.

## Current Supabase advisor findings

- Security advisor: no current high/critical findings. It reports INFO `rls_enabled_no_policy` for deny-by-default tables (expected: app roles intentionally have no direct table policies/grants) and WARN `auth_leaked_password_protection` because leaked-password protection is disabled. Enable this Auth setting before broad staff onboarding.
- Performance advisor: unused-index INFO notices are expected on the empty pre-launch database; do not drop indexes based on zero-traffic statistics.
- Health advisor returned no findings.
- No real menu, orders, publications, delivery areas or promotions have been seeded.

## Security hygiene follow-up

- A previously open legacy POS browser tab exposed a credential in its URL query string. Treat that credential as compromised: rotate it if it was valid, remove the URL from browser history/screenshots/logs where possible, and never put passwords in URLs. Do not assume it was the new Admin password.
- Never store service-role/secret keys in browser configuration or Vercel public environment variables.

## Next execution order

1. Configure Auth leaked-password protection and the exact Admin Site URL/redirect allowlist before broad staff onboarding.
2. Configure Supabase Auth leaked-password protection and the exact Site URL/redirect allowlist for the new Admin app domain.
3. Deploy and test the Staff Admin Edge Function only after its exact origin and server-only secret settings are ready; verify Admin login, context, invitation, retry/finalize, role assignment, and denial for non-Admin actors.
4. Deploy the Admin UI to a protected preview first, verify session handling and that all non-Staff modules stay disabled. Then separately review production access/protection.
5. Build secure catalog, order, delivery and media APIs before enabling any corresponding Admin modules.
6. Keep customer Website cutover, real menu seeding, production order intake and Owner/staff account creation behind their separate explicit approvals.

---

# CURRENT IMPLEMENTATION STATUS — 2026-11-22 (publication, rollback and legacy Website fallback)

## Hard release and rollback rule

Draft menu changes never update the customer menu. The new Website reads only the immutable publication selected by `catalog_current_publication`; no pointer means no customer menu. Admin preview is separate and must never be a public draft URL.

### Database migrations now applied
- `20261121155900_flame_chick_catalog_public_snapshot_read_v1`
- `20261122031027_flame_chick_catalog_publish_rollback_v1`

### Implemented publish/rollback database commands
- `public.flame_chick_catalog_publish(expected_revision, request_id)`: locks expected draft revision, validates full menu/deal graph, compiles deterministic schema V3, stores SHA-256 immutable publication and atomically changes current pointer.
- `public.flame_chick_catalog_rollback(target_publication_id, expected_revision, request_id, reason)`: Admin/Owner only; requires a 10–500 character reason; validates same-restaurant immutable target + SHA-256 and changes only current pointer. Draft content remains untouched.
- `public.flame_chick_catalog_publication_history(after_number, limit)`: bounded Admin/Owner metadata history, no snapshot body in Admin response.
- Publish/rollback include actor audit and idempotency records in the same transaction. Failed validation/transaction leaves old pointer unchanged.
- Private compile/validate helpers are postgres-owned SECURITY DEFINER with empty search_path; public wrappers are SECURITY INVOKER, authenticated-only, and actor authorization is active Admin/Owner. No direct table grants were added.
- Publication snapshots use schema V3 and fixed pricing engine identifier `flame-chick-pricing-v1`. Snapshot hash is lower-case SHA-256 of PostgreSQL canonical `jsonb::text` converted to UTF-8.
- Rollback-only full QA passed: publish v1, replay, edit/publish v2, invalid draft rejected with v2 still current, rollback v1, replay, verify v1 exact published snapshot and v2 immutable; invalid/newer draft remains unchanged. All fixtures were rolled back.

### Production is still empty — no real menu seeded
Verified counts after tests: zero restaurants, categories, products, deals, draft states, publications, current pointers, catalog audit rows and idempotency rows. Published-read returns `published=false` and NULL snapshot. No new live menu has been published.

### Published-only read and Edge Function
- `public.flame_chick_catalog_public_read(text)` is postgres-owned SECURITY DEFINER with empty search_path, executable only by `service_role`. Anon/authenticated cannot execute it; service_role has no direct SELECT on publication tables.
- `supabase/functions/flame-chick-catalog/index.ts` now calls only this RPC, passes through the immutable snapshot and advertises the active snapshot schema version. Static checks passed.
- Supabase currently lists zero deployed Edge Functions. Do not deploy this source to a customer-facing project until V3 Website client and quote/checkout integration are ready.

### Important V3 and checkout blockers
- Current Website catalog consumer validates schema V2; publication compiler emits V3. Do not point the V2 client to a V3 response or weaken the version check.
- Existing schema does not yet include `restaurant_settings`, `delivery_areas` or promotions; current V3 snapshot explicitly uses empty deliveryAreas/promotions arrays and only the restaurant-name/currency/timezone settings. Implement those domains and checkout configuration before switching the customer website.
- Runtime schedule evaluation, V3 Website menu renderer, deal quote calculation in order flow, branch-specific runtime effective availability, and complete end-to-end checkout-to-POS tests remain pending.
- Existing Admin catalog modules stay disabled and direct browser REST writes remain prohibited.

## Verified legacy Website emergency rollback target

The existing public Website remains untouched and live:
- Domain: `https://flame-chick.vercel.app`
- Legacy Vercel project: `flamechicks` (`prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5`)
- Known-good production deployment: `dpl_4MepX2o8ysrqsnHp7H6H7mVqznGP`
- Commit: `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2`
- Source: legacy repo `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`, ref `feature/flame-chick-wa-storefront`
- Vercel confirms `flame-chick.vercel.app` is assigned to this READY production deployment; live fetch returned HTTP 200 on 2026-11-22.
- New project `flame-chick-website-production` (`prj_jwin4eFY0BXIgZUgcZGAuntybqkI`) has no deployments or custom domain.

Emergency rollback after a future Website cutover: use Vercel `assign_alias` with the old deployment ID above and alias `flame-chick.vercel.app`, team `team_lrFy9ILYEz9umsBy98GCyQjI`. Then verify the alias map and live HTTP 200. This action has not been performed. Database rollback to a previous catalog publication is separate; until at least two DB publications exist, the verified legacy Vercel deployment is the first-release fallback. Before the first customer cutover, recommended baseline sequence is to import the exact legacy menu from `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS` commit `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2`, review it and publish as database publication #1; publish the upcoming menu as #2. The old-menu source and no-seed-yet status are recorded in `docs/handoffs/2026-11-22-legacy-live-menu-baseline-preservation.md`.

Detailed runbook: `docs/architecture/website-release-cutover-rollback-v1.md`.
Detailed implementation/QA: `docs/handoffs/2026-11-22-catalog-publish-rollback-implementation.md`.
Draft/live invariants: `docs/architecture/draft-vs-published-catalog-separation.md`.

## Release sequence still required
1. Implement a V3 Website consumer and deal-variant rendering; V2 consumer remains unchanged until adapter passes.
2. Implement delivery areas/settings, server-side schedule evaluation, and order/quote pricing over the same published snapshot.
3. Complete golden/concurrency/idempotency/stale-revision tests and end-to-end customer checkout → POS tests.
4. Deploy Edge Function + Website only to preview first. Keep `flame-chick.vercel.app` on the old deployment during testing.
5. Record the new deployment ID; only with explicit owner approval assign the customer alias to it.
6. If critical checks fail, assign the alias back to the verified old deployment above; database pointer rollback remains separately available.

No Website alias move, Edge Function deployment, Vercel production deployment or real-menu seed was performed by this stage.

---

# CURRENT IMPLEMENTATION STATUS — 2026-11-21 (latest; draft/live menu isolation enforced)

## Hard rule: draft catalog can never become the live website menu by accident

The editable catalog and the customer-visible catalog are separate data paths:
- Admin/Owner authoring commands mutate only mutable draft tables and increment `catalog_draft_state.revision`.
- The website read path returns only the immutable row selected by `catalog_current_publication`.
- A missing pointer returns `published=false` with a NULL snapshot. The website Edge Function converts this to `CATALOG_NOT_PUBLISHED` (HTTP 404); it never reconstructs a response from draft tables.
- Publication history has database triggers that reject UPDATE, DELETE and TRUNCATE. A new menu must create a new publication version; it must not edit an old snapshot.
- Public reads verify that the snapshot schema version and SHA-256 match publication metadata. A mismatch fails closed.
- Only `service_role` can execute the public-read RPC. It cannot directly SELECT the publication or current-pointer tables. `anon` and `authenticated` cannot execute the RPC.
- The catalog Edge Function source now calls only `public.flame_chick_catalog_public_read(text)` and does not query mutable catalog tables. It remains undeployed; Supabase reports zero deployed Edge Functions.
- Current Production state: zero catalog publication rows, zero current-publication pointers and zero draft-state rows. Thus the new read path serves no menu until a first successful publication.

### Applied publication-read migration
- `20261121155900_flame_chick_catalog_public_snapshot_read_v1`
- Guarded workflow: https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44922905879
- Edge Function static checks: https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44922820111

### Publish and website-switch rules — mandatory next stage
1. Build a full catalog compiler/validator. It must validate products, variants, modifiers, deals, price completeness, component selection ranges, variant-option maps, schedule windows, timezones and branch availability before publication.
2. In one database transaction, lock the restaurant's draft revision, compile the snapshot at that exact revision, compute SHA-256 of PostgreSQL `snapshot::text` encoded as UTF-8, insert a new immutable `catalog_publications` row and atomically switch `catalog_current_publication`. If any step fails, the previous pointer remains untouched.
3. Reject a publish attempt if the draft revision changed during compilation or if any validation fails. Never publish a partial snapshot.
4. Rollback changes only the current pointer to a previously validated immutable publication; it never edits publication history.
5. Test that edits made after publication do not change the currently served snapshot, a failed publish leaves the old pointer intact, and rollback restores the previous snapshot exactly.
6. Keep the existing live Website data source untouched until the snapshot compiler, publish/rollback commands, golden tests and public Edge Function integration all pass. Website switching is a separately verified release action—not a side effect of saving a draft.
7. Keep Admin draft reads private. Do not expose a preview URL or public query parameter that reads arbitrary draft revisions. Any future Admin preview must be authenticated and separate from the customer catalog endpoint.
8. Cache keys must include publication identity/hash (and, when branch overlays are added, the branch availability revision). A cache must never be keyed only by restaurant slug.

### Rollback-only QA already passed
- No pointer for an active restaurant returned `published=false`, with a NULL snapshot.
- A valid temporary immutable publication returned the exact stored snapshot and verified checksum.
- Incrementing the draft revision after publication left the live snapshot and publication identity unchanged.
- Attempts to update publication history were rejected by the existing immutability trigger.
- All test fixtures were rolled back. No real menu, live pointer or publication row was created.

### Current production website status
The new Supabase catalog Edge Function is not deployed, and no Vercel/Website switch was made by this work. Therefore the existing running website remains on its previous data source until the separate, tested cutover. Draft records in the new catalog cannot flow to it.

---

# CURRENT IMPLEMENTATION STATUS — 2026-11-21 (latest; deal builder commands applied)

## Deal-builder schema, commands and FK indexes now applied

Working branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

### Applied migrations
- `20261121152231_flame_chick_deal_builder_schema_v1`
- `20261121153223_flame_chick_deal_commands_v1`
- `20261121154711_flame_chick_deal_builder_fk_indexes`

The deal command migration is recorded in the remote ledger and all public/private function signatures and grants were checked in Production. The four missing child-side composite FK indexes identified by the Performance Advisor are now applied.

### New deal data model
- `deal_variants`: separate purchasable variants (e.g. Regular/Family) per deal with `FIXED_BUNDLE` or `BASE_PLUS_SELECTED_ITEMS`, optional draft `base_price`, label and active/sort fields.
- `deal_variant_component_options`: explicit per-deal-variant allow-list of component options, with `INCLUDED`, `SURCHARGE`, or `STANDALONE` treatment, per-option surcharge and variant-level quantity cap. No mapping means that choice is not allowed for that deal variant.
- Existing `deals.bundle_price` and old `deal_component_options.pricing_treatment/unit_surcharge/max_quantity_per_deal` are retained for compatibility, but the new command layer does not use them as the pricing source. The new variant and variant-option mapping rows are canonical.
- A FIXED_BUNDLE deal variant cannot use STANDALONE treatment. BASE_PLUS_SELECTED_ITEMS supports standalone product-variant price, explicit surcharge, or included choice.
- Variant option quantity caps cannot exceed their component group's maximum or repeat policy.
- Existing exact menu `product_variant_id` references are enforced by composite FKs; component options cannot point to a different restaurant/deal/product combination.

### Schedule and branch behavior
- `catalog_schedule_sets.timezone` is now required, backfilled from restaurant timezone for any existing rows, and validated as an IANA timezone.
- Weekly windows support overnight ranges (e.g. 20:00–02:00), optional effective dates, and all-day windows; one-off windows use timestamptz and command inputs must include an explicit UTC offset.
- Windows are patched by ID and removed only through an explicit `remove_window_ids` list.
- Deal schedule assignment precedence is branch-specific deal assignment, then deal-wide assignment, then collection fallback. Inactive assignments fall back to the next applicable scope.
- Branch-specific assignments require schedule timezone to match branch timezone (falling back to restaurant timezone). Global deal assignments require restaurant timezone.
- Branch deal availability remains a separate override from time scheduling; it does not replace the schedule evaluator.
- No cron job or Realtime subscription was added for schedule evaluation.

### New public database command/read wrappers
- `public.flame_chick_catalog_deal_collection_read(uuid,integer)`
- `public.flame_chick_catalog_deal_collection_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_deal_list_read(uuid,uuid,integer)`
- `public.flame_chick_catalog_deal_detail_read(uuid)`
- `public.flame_chick_catalog_deal_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_deal_components_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_deal_variant_options_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_schedule_set_read(uuid,integer)`
- `public.flame_chick_catalog_schedule_detail_read(uuid)`
- `public.flame_chick_catalog_schedule_set_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_deal_schedule_assignment_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_deal_branch_availability_upsert(jsonb,bigint,uuid)`

All public wrappers are SECURITY INVOKER with empty search_path and EXECUTE for authenticated only. Private command/read internals are postgres-owned SECURITY DEFINER with empty search_path. Shared command helpers centralize actor resolution, per-restaurant revision lock, SHA-256 idempotency replay and same-transaction append-only audit. Actor scope is still active restaurant-wide Admin/Owner only.

### Performance indexes added after Advisor review
- `deal_schedule_assignments_branch_fk_idx(branch_id,restaurant_id)`
- `deal_schedule_assignments_deal_fk_idx(deal_id,restaurant_id)`
- `deal_variant_component_options_variant_fk_idx(deal_variant_id,deal_id,restaurant_id)`
- `deal_variants_deal_fk_idx(deal_id,restaurant_id)`

Additional deal and schedule keyset-read indexes:
- `deals_restaurant_collection_id_idx(restaurant_id,collection_id,id)`
- `catalog_schedule_sets_restaurant_id_id_idx(restaurant_id,id)`

### QA completed — every fixture rolled back
- Executed the schema and command migrations inside rollback-only transactions before application.
- Authenticated Admin created a deal collection, menu product, Regular/Large product variants, weekly overnight and one-off schedule windows, a Regular FIXED_BUNDLE variant and Family BASE_PLUS_SELECTED_ITEMS variant.
- Created component groups with the same exact variant reused in separate groups; same-variant use is only deduplicated within one group.
- Mapped Regular to INCLUDED/SURCHARGE and Family to STANDALONE/SURCHARGE.
- Verified FIXED_BUNDLE cannot use STANDALONE.
- Verified same-request/same-payload replay and changed-payload request-ID reuse rejection.
- Verified explicit schedule window removal.
- Verified a branch schedule update with omitted branch_id preserves its existing branch scope.
- Verified branch/global schedule timezone mismatch rejection and valid Asia/Karachi matching.
- Verified component variant quantity caps cannot exceed the component-group repeat/quantity rules.
- Verified bounded collection/deal/schedule list reads and one-deal/schedule detail reads.
- Verified direct deal table read denied and authenticated Cashier role cannot execute catalog authoring commands.
- Temporary Admin/Cashier/Auth, restaurant, branch, categories, product, deal and schedule fixtures were all rolled back.

Post-test Production counts are zero for menu/deal/staff test rows, catalog draft states, catalog audit rows and idempotency rows. No actual menu records or staff users were seeded.

### Live Advisor state
- Security Advisor: 33 INFO `rls_enabled_no_policy` notices. These are intentional deny-by-default tables; do not create broad RLS policies to clear the notices.
- Performance Advisor: 43 INFO unused-index notices remain because this is an empty pre-launch project. The Advisor no longer reports unindexed deal-builder FKs after the four FK indexes above. Do not drop the other query/FK indexes based on zero-workload counters.

### Still not implemented / not enabled
- Publication compiler and validation for deals, variants, modifiers, base prices, missing required choices, exact eligible options, product/variant active/priced state, schedules and branch overrides.
- Runtime schedule evaluator and quote/pricing integration using an immutable published snapshot.
- Golden deal-pricing tests covering fixed bundle, base-plus-selected choices, component quantities, modifiers, promotions and refund allocations.
- Catalog Edge Function router and service-side payload/rate limits.
- Admin UI integration; direct REST writes and catalog Admin modules remain disabled.
- Edge Function not deployed; no order/checkout pricing uses the new deal model yet.
- Explicit Owner positive and Manager/Rider role matrix tests remain outstanding; the shared actor resolver only returns active restaurant-wide Admin/Owner roles.
- GST remains deferred.

### Next implementation stage
Build the publication compiler and exhaustive static validation against the full menu/deal graph. It should reject incomplete published deal variants, invalid selection bounds, unavailable/non-menu product variants, missing prices where required, treatment/mode mismatches, missing allowed option maps, quantity-cap conflicts, and invalid schedule/branch timezone or date-window configuration. Compile a deterministic immutable snapshot with version/checksum and atomic current-publication pointer. Keep public menu reads on published snapshot only. Only after quote/publication tests pass should the single catalog Edge Function router and Admin UI be enabled.

---

# CURRENT IMPLEMENTATION STATUS — 2026-11-21 (latest)

## Modifier command layer applied and authenticated QA passed

Working branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

Latest catalog command migrations applied:
- `20261121133607_flame_chick_catalog_commands_v1`
- `20261121140000_flame_chick_catalog_commands_v1_qa_fixes`
- `20261121144209_flame_chick_catalog_product_commands_v1`
- `20261121145500_flame_chick_catalog_product_commands_v1_qa_fixes`
- `20261121150452_flame_chick_catalog_modifier_commands_v1`

Modifier migration workflow:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44917875677

### Available modifier database commands
- `public.flame_chick_catalog_modifier_draft_read(uuid,integer)`
- `public.flame_chick_catalog_modifier_assignment_draft_read(uuid)`
- `public.flame_chick_catalog_modifier_group_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_modifier_assignment_upsert(jsonb,bigint,uuid)`

These are authenticated SECURITY INVOKER wrappers. Private internals are postgres-owned SECURITY DEFINER with empty search_path. Actor scope is derived from `auth.uid()` and active restaurant-wide Admin/Owner membership. No direct application-role table CRUD/read has been granted.

### Modifier command design
- Group + options are one atomic aggregate; product assignment + exact-variant price rules are a second aggregate.
- Supports FREE, FIXED and BY_SIZE modifier pricing.
- Selection mode and min/max are validated against existing constraints.
- Exact `product_variant_id` is used for BY_SIZE pricing; no text size-key mapping.
- FREE/FIXED rules are rejected; BY_SIZE rules must reference a modifier in the exact group and variant on the assigned product.
- A BY_SIZE option cannot switch pricing mode while exact price rows exist. Admin must explicitly remove the rows first.
- Patch semantics preserve omitted modifier options and omitted price rules; archive options with `is_active=false`, explicitly remove price rules using `remove_price_rules`.
- Draft can be incomplete; publish/quote validation later must reject missing required choice/rule paths.
- Product assignment reader uses set-based aggregates for options and exact-variant price rows.
- New index `modifier_groups_restaurant_id_id_idx(restaurant_id,id)` supports the tenant-scoped keyset group page.

### Modifier QA
Authenticated transaction QA passed for category/product prerequisites, group and options creation with FREE/FIXED/BY_SIZE, exact Regular/Large variant price rules, idempotent assignment replay, set-based product assignment read, blocking BY_SIZE mode change while old prices exist, explicit removal and subsequent mode transition, modifier draft read and direct table read denial.

A test revealed the first rule-removal validation ran before restaurant actor resolution. Fixed before applying migration; then the full suite passed. All temporary fixtures were in explicit transactions and rolled back. Independently verified zero temporary users, restaurant rows, categories, products, variants, modifier groups/options/assignments/rules, audit rows and idempotency rows.

### Live security / performance verification
- New internal functions are postgres-owned SECURITY DEFINER with empty search_path.
- Public wrappers are SECURITY INVOKER, authenticated EXECUTE only; anon and service_role denied.
- Authenticated has no direct modifier table reads/writes and no idempotency ledger read.
- Security Advisor: 30 INFO RLS-enabled/no-policy findings (intentional deny-by-default; do not add broad policies).
- Performance Advisor: 47 INFO unused-index findings; expected for empty pre-launch tables. Do not drop supporting FK/query indexes before representative workload.

### Next implementation phase
Implement deal collections/deals/component groups/eligible exact product variant commands, using V1 pricing treatments INCLUDED, SURCHARGE and STANDALONE. Then implement comprehensive publication compiler validation (including modifier group selection bounds, active options, assignment and BY_SIZE exact rule completeness), then the single catalog Edge Function router and Admin UI integration. Keep Admin direct REST writes and catalog UI disabled until fully tested.

No Edge Function has been deployed. No menu or staff data seeded.

## Mandatory SQL standard
Follow `docs/standards/sql-engineering-long-term-reliability.md` for all future migrations and functions: database-enforced invariants, atomic transactions, idempotency, revision checks, same-transaction audit, minimal grants, empty search_path for SECURITY DEFINER, bounded reads, justified indexes and append-only migrations.

---

# CURRENT IMPLEMENTATION STATUS — 2026-11-21 (latest; supersedes older status below)

## Product/variant authoring command layer applied and tested

Working branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

Latest applied catalog migrations:
- `20261121125542_flame_chick_menu_v1_catalog`
- `20261121133607_flame_chick_catalog_commands_v1`
- `20261121140000_flame_chick_catalog_commands_v1_qa_fixes`
- `20261121144209_flame_chick_catalog_product_commands_v1`
- `20261121145500_flame_chick_catalog_product_commands_v1_qa_fixes`

Successful application workflows:
- Product/variant commands: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44915515192
- Product command forward QA correction: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44915684114

### Available catalog database commands now
- `public.flame_chick_catalog_draft_read(text,uuid,integer)`
- `public.flame_chick_catalog_category_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_subcategory_upsert(jsonb,bigint,uuid)`
- `public.flame_chick_catalog_product_draft_read(uuid,integer)`
- `public.flame_chick_catalog_product_upsert(jsonb,bigint,uuid)`

These are authenticated SECURITY INVOKER wrappers. Internal command/read functions are postgres-owned SECURITY DEFINER with empty search_path. Admin/Owner authority is derived from `auth.uid()` and active restaurant-wide membership. No application role has direct catalog table CRUD or idempotency-ledger table access.

### Product/variant semantics
- One atomic product + supplied variant upsert command; strict allowlisted bounded payload.
- Same-restaurant menu category and matching optional subcategory validation.
- Existing variant upserts by same-product variant ID or normalized size_key.
- Omitted variant arrays leave all variants unchanged; supplied arrays patch only the listed variants. No silent deletion. Set is_active=false to archive explicitly.
- Supports standard, portion, flavour, pack and volume variant kinds.
- Pack requires quantity and unit; non-pack rejects pack metadata.
- NULL price = unpriced/TBD; numeric zero = explicit zero. Uses NUMERIC(12,2) semantics.
- Image/storage metadata is intentionally not in the command yet; separate secure storage-aware command required.

### Authenticated transaction QA passed
Temporary test auth user, restaurant, profile and Admin role were created only inside explicit transactions and rolled back. Tests passed for category creation, product + variants creation, zero vs NULL price, same-request replay, changed-payload idempotency-key rejection, null variants rejection, duplicate variant ID rejection, stale revision conflict, bounded draft read, partial variant patch preserving omitted variants, no duplicate revision on replay, direct table-write denial and direct product_variant SELECT denial.

Independent post-test counts: zero temporary Auth users, restaurants, categories, subcategories, products, variants, draft states, catalog audit rows or idempotency rows.

Unauthenticated command/draft-read tests also reject with `CATALOG_ADMIN_FORBIDDEN`.

### Advisor results
- Security Advisor: 30 INFO RLS-enabled/no-policy findings. These are intentional deny-by-default controls; do not create broad policies to clear the INFO notices.
- Performance Advisor: 52 INFO unused-index findings. Expected before business data/workload exists; do not drop indexes based on empty-project usage counters.

### Not yet ready for Admin or deployment
- Owner positive and Manager/Cashier/Rider explicit denial tests remain to be added.
- Modifier group/assignment/exact variant price-rule authoring commands remain.
- Deal, component group and deal choice commands remain.
- Image upload metadata command remains.
- Publication compiler, publish and rollback commands remain.
- Edge Function router not yet deployed; Admin catalog direct REST writes not yet replaced; catalog UI must remain disabled.
- No menu, restaurant, branch, staff or catalog rows have been seeded.

### Next work
Implement modifier group/option/assignment and exact `product_variant_id` price-rule commands. Then implement deal/component commands and full publication validation. Build the catalog Edge Function router and Admin integration only after those commands and role tests are complete. Keep the existing project/branch/Free plan; no additional Supabase project or paid upgrade.

## SQL reliability standard remains mandatory
See `docs/standards/sql-engineering-long-term-reliability.md`. Preserve atomic commands, exact actor authorization, idempotency, revision checks, same-transaction audit, append-only migrations, bounded reads, least-privilege grants and Free-tier-aware query patterns.

---

# CRITICAL CURRENT STATUS — 2026-11-21 (read before continuing)

## Verified GitHub repository identity

The connected private repository is `itsfahadahmed1234-creator/flame-chick-platform` (note the exact owner spelling, including `ahmed`). Earlier 404s were caused by using the wrong owner slug; subsequent repository and branch reads now succeed.

## Guarded migration-ledger repair workflow prepared (2026-11-21)

A GitHub Actions workflow was committed at `.github/workflows/repair-flame-chick-catalog-ledger.yml` on the working branch. It is restricted to `work/production-source-audit` and one dedicated trigger file, targets only Production project `adkrxfnawdiljhjaavnj`, pins Supabase CLI v3.2.0, verifies the exact checked-in migration file, inspects the remote migration list, repairs only version `20261121061000` as applied, then lists migrations again. It does not execute migration SQL or run `db push`.

The workflow requires two GitHub Actions repository secrets: `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. GitHub connector tooling cannot inspect or create repository secrets, and the container has no existing CLI or credentials. The one-time trigger is therefore intentionally withheld until the owner adds those two secrets. Do not store credentials in repository files or share them in chat.

Supabase CLI v3 changed database commands to default local; the workflow explicitly uses `--remote=<project-ref>` and `--yes` per current v3 documentation. The correct pinned stable release selected is v3.2.0. Official docs: https://supabase.com/docs/guides/local-development/cli/migrating-to-v3 and https://supabase.com/docs/reference/cli/supabase-migration-repair.

## Latest guarded repair workflow result — blocked by missing secrets

The one-time trigger file `ops/triggers/repair-catalog-ledger.txt` was committed on the working branch. GitHub Actions run **44890673291** executed the workflow and stopped at the first credential pre-check because both `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` were empty. The Supabase CLI was not installed or run; no database connection was made; the repair step was skipped. Production migration ledger therefore remains at the same ten versions and catalog version `20261121061000` is still not recorded.

Required owner action: add repository Actions secrets named exactly `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` at https://github.com/itsfahadahmed1234-creator/flame-chick-platform/settings/secrets/actions . Use a Supabase Personal Access Token for the first and the existing database password for the second. Do not paste either value in chat or commit them to the repository. After both secrets exist, retrigger by updating `ops/triggers/repair-catalog-ledger.txt`; verify GitHub Actions and the Supabase migration list before proceeding to the FK-index migration.

## Catalog foundation and FK-index migrations reconciled in Production

Both catalog migrations are now correctly represented in the Production migration ledger:
- `20261121061000_flame_chick_catalog_authoring_foundation`
- `20261121062000_flame_chick_catalog_fk_indexes`

The first migration's SQL had already been applied before its ledger record was repaired using the official Supabase CLI v3 workflow. The repair changed migration history only; it did not rerun DDL.

The FK-index migration was then applied through the official Supabase CLI v3 `db push` workflow after a dry-run confirmed that `20261121062000_flame_chick_catalog_fk_indexes.sql` was the only pending migration. The workflow uses explicit `--remote=<project-ref>`, pinned CLI v3.2.0, the repository Actions secrets, and a non-interactive `--yes` confirmation after the dry-run gate.

GitHub Actions run [44892500555](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44892500555) completed successfully. Independent Supabase verification confirms migration versions `20261121061000` and `20261121062000` are recorded, all 15 expected indexes exist in `public`, and all 15 are owned by `postgres`. No catalog business rows were inserted. The index migration did not alter RLS, policies, grants or Realtime publication.

Next: build secure Admin/Owner catalog command APIs, immutable published catalog snapshots, audit/revision controls, and migrate Admin UI away from direct table writes. Keep public catalog reads separate from authenticated writes. Do not seed live menu data until the catalog UI and command validation are ready.

## Catalog foundation: applied in Production, migration ledger pending

Production project `adkrxfnawdiljhjaavnj` (Mumbai, PostgreSQL 17.12, Free plan) currently contains the catalog authoring foundation. The migration DDL was executed directly as `postgres` on 2026-11-21 and committed to Git as `supabase/migrations/20261121061000_flame_chick_catalog_authoring_foundation.sql`. This direct application bypassed the Supabase migration tracker. The actual Supabase migration ledger still contains only the previous ten applied versions and does NOT contain `20261121061000`.

**Never rerun the catalog foundation DDL against the current Production project.** Its preflight deliberately rejects existing catalog relations.

The supported one-time reconciliation is the official Supabase CLI command from a linked project, after reviewing local/remote version lists and confirming schema parity:

```bash
supabase migration repair 20261121061000 --status applied
supabase migration list
```

The repair command updates migration history only; it does not rerun the SQL. Do not manually edit `supabase_migrations.schema_migrations`. This chat's connected Supabase tools do not expose the CLI repair command and the container has no Supabase CLI/login context, so the ledger repair is still **pending**. Do not run `supabase db push` until repair and list reconciliation are complete.

## Live catalog state verified

Eleven public tables exist, owned by `postgres`, RLS enabled, with zero policies, no direct table grants to `anon`, `authenticated` or `service_role`, no Realtime publication entries, and zero rows:
`categories`, `subcategories`, `products`, `product_variants`, `modifier_groups`, `modifiers`, `modifier_group_assignments`, `modifier_price_rules`, `drink_options`, `branch_product_availability`, `branch_variant_availability`.

No rows exist in restaurants, branches or catalog tables. No menu, prices, product, branch or restaurant data was seeded.

The only intended private schema USAGE grant for an application role is `authenticated` on `app_private`, required by Batch 4's Staff Admin invoker wrapper. `anon` and `service_role` do not have `app_private` USAGE. Catalog trigger function `app_private.flame_chick_catalog_touch_updated_at()` is invoker-security, owned by postgres, fixed search_path `pg_catalog`, and has direct EXECUTE revoked from application roles.

## Catalog QA and advisor results

Disposable behavioral QA passed in a separate explicit transaction and rolled back. It checked:
- NULL variant price remains distinct from explicit zero.
- Product cannot reference a deal category.
- Cross-restaurant category/subcategory and branch/product/variant references are rejected.
- Size-based modifier price rules require a corresponding real variant and modifier-group assignment.
- Invalid selection-mode bounds and inconsistent FREE/fixed-price settings are rejected.
- Negative product prices and invalid drink volumes are rejected.
- All temporary QA rows were rolled back; independent follow-up count queries confirmed zero rows.

Security Advisor: 18 INFO findings, all `rls_enabled_no_policy`; this matches the deliberate deny-by-default setup across new and earlier foundation tables. Do not add permissive policies just to silence the information-only lint.
Performance Advisor: 15 INFO findings for catalog child-side foreign keys missing covering indexes, plus 17 INFO unused-index findings (expected on an empty project; do not prune before usage exists).
Health Advisor: zero findings.

## Next staged migration

`supabase/migrations/20261121062000_flame_chick_catalog_fk_indexes.sql` is committed to `work/production-source-audit`. It creates the 15 targeted FK covering indexes reported by Performance Advisor, without changing privileges, policies, RLS or rows. It is **staged only and NOT applied**. Apply it only after migration version 20261121061000 is repaired/recorded and the migration list is aligned.

## Catalog implementation still pending

- The Admin app still has direct PostgREST catalog CRUD; do not enable it against zero-grant tables.
- Public catalog Edge Function still reads mutable base tables and has not been adapted to immutable publication snapshots, explicit category_kind, branch overlays or product-scoped modifier price rules.
- Still needed: Admin/Owner-only atomic draft commands, append-only actor audit, draft revision concurrency, media validation/publication, immutable catalog publication snapshot/checksum/current pointer, publish validation, rollback, and matching Admin UI/DTO changes.
- Deals/deal components/curated deal choice groups and deal schedules remain deferred to a separate reconciled design slice.
- GST/tax remains deferred.

## Important working constraints

- Continue on `work/production-source-audit`; do not touch main or existing older projects.
- Run database migrations as `current_user = postgres` and `session_user = postgres`, never `supabase_admin`.
- No Supabase database branches, no paid upgrades, and no direct editing of internal migration ledger tables.
- Keep all application catalog tables deny-by-default until reviewed server commands and public immutable snapshot read path are implemented.
- Read this section and `docs/handoffs/2026-11-21-catalog-foundation-reconciliation.md` before resuming.

---


## 2026-11-21 — Catalog/API source reconciliation prepared

**Source commit:** `3f657ec491847ac91eade96fa78d4a834695aeb8` (catalog contract reconciliation); Edge Function source commit `eae8ac03c88ef0fec2ad6660cd3e5951a2389a44`.

Completed:
- Renamed the remaining HFP-prefixed order/delivery RPC names and error/comment strings in Edge Function source to `flame_chick_*` names.
- Updated `flame-chick-catalog` to prefer the current `SUPABASE_SECRET_KEYS` environment map, with `SUPABASE_SECRET_KEY` and legacy `SUPABASE_SERVICE_ROLE_KEY` fallback.
- Updated the database/application contract map to the new function names and explicitly distinguished implemented Staff Admin RPCs from order/delivery/dashboard RPCs that still need SQL implementations.
- Removed retired storefront brand references from the source consistency audit.
- Updated menu design decision status to reflect owner-approved curated deal choices, explicit surcharges, Admin/Owner publish authority, shared base catalog/prices and branch availability overlays.
- Added `docs/architecture/catalog-authoring-v1-reconciliation.md` defining a source-compatible base catalog schema scope and security requirements.

Important: RPC renaming is not implementation. The order, website rate-limit and delivery RPCs are not present in the applied migrations; related APIs must not be deployed/enabled until those SQL commands are implemented and tested. The catalog Edge Function is still read-only and not deployed.

No Production schema or data changes were made. The next database work is to prepare the catalog authoring migration and authenticated draft-command API; apply only after separate review/approval. Keep GST deferred and the full Website security audit as a later stop-gate.

---


## 2026-11-21 — Flame Chick-only runtime source cleanup

**Source commits:** `b7fb2bb38cb37a395a93810864f85a9ae5d925c3`, `45d279f35d59be90f5238ed4095a9a3d8e6983f7`, `4c07607e712e1ebdbb374444086d5e1096f072c5`, `c66dc7656756189b47b7728e913c6012bf7415a3`, `dfc034d3944fd552bc66216e7897a259645ae431`, `6b591f1fe3bfb5c5c9f762231ec6a3843799cee3`, `d6f6182c2c16b12bf7860f391d71ca73c2cfd56c`, `173b7f26593bc75d1baac1b73f2a6071f3b5486b`.

Completed source hygiene:
- Removed the inactive `apps/flame-chick-website/js/app.js` file. It was not referenced by the active storefront entrypoint and contained historical HFP/Pizza Bite settings and staging URLs.
- Rewrote the Website README without references to the retired storefront implementation.
- Rebranded active website module globals and callbacks to Flame Chick names; replaced old language/cart/fulfilment storage keys with Flame Chick keys; changed order reference prefix to `FC-`; updated visible brand copy and removed the legacy Waisa location claim.
- Replaced Admin-generated legacy `PB*` IDs with Flame Chick prefixes (`FC-PROD`, `FC-VAR`, `FC-CAT`, `FC-SUB`, `FC-DEAL`, `FC-SLIDE`).
- Renamed local POS/Admin/Rider HFP-prefixed identifiers to Flame Chick names; Rider Realtime channel now uses `flame-chick-rider-ops-`.
- Verified the active Admin, Website, POS and Rider runtime files contain no Pizza Bite branding or HFP identifiers (base64 image data is excluded from semantic checks).

Static CI results:
- [Admin static checks passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881645889).
- [Website static checks passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881563119).
- [POS and Rider static checks passed](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44881805138).

Important compatibility note: the source rename of `flame_chick_admin_dashboard` and `flame_chick_admin_reassign_delivery` does not create those database RPCs. The related Admin dashboard and POS delivery-reassignment server contracts still need implementation and QA before those operations can be enabled.

No database migration, Production data change, Edge Function deployment, Vercel deployment, secret configuration, or domain assignment was performed.

---


### Admin invitation acceptance CI — passed

- Workflow: [Flame Chick Admin Static Checks](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881008259).
- Both Admin JavaScript files pass `node --check`.
- Five automated behavior tests pass: new invite/password activation, existing confirmed account acceptance, unconfirmed-email rejection, password mismatch rejection, and retry after failed activation.
- Static asset and page/script wiring checks pass.
- This validates the browser logic with mocked Auth/Edge Function responses. Live Production Auth and Edge Function integration remain untested because the function/origin/redirect are not configured and Production has no staff fixtures.

### Admin static CI verification — passed

- Workflow run: [Flame Chick Admin Static Checks #2](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44880704883).
- `node --check` passed for both `apps/flame-chick-admin/app.js` and `accept-invitation.js`.
- Static page assets, login link, acceptance page script and acceptance action checks passed.
- The first CI attempt failed only because the test asserted a literal `/auth/v1/user` string while the page correctly calls the shared `authRequest("user", "GET")` helper. The assertion was corrected and the rerun passed.
- This is static source validation only; it does not replace live Supabase Auth integration tests.
## 2026-11-21 — Batch 4 staff invitation acceptance UI implemented

**Source commit:** `0eac38d99286f289f188ef8130e6fe74e15dddd2` on `work/production-source-audit`.

Added:
- `apps/flame-chick-admin/accept-invitation.html` and `accept-invitation.js`.
- Admin sign-in link to the acceptance page and invitation dialog guidance.
- New-user path: reads the Supabase Auth invite session from the redirect fragment, removes token material from the address bar, verifies the authenticated and confirmed user, requires a 12-character password, updates the Auth password, then calls the authenticated `accept_invitation` command.
- Existing-user path: sign-in using the exact confirmed email and password, then calls the same database acceptance command. The browser does not submit a user ID, email identity claim, role or branch assignment to the acceptance RPC.
- Retry activation after password update if the database activation request fails.
- Admin app README and deployment notes updated.

The applied database command remains the authority for exact confirmed-email matching, invitation expiry, active inviter authority, role-conflict checks, branch availability, role assignment and audit. Production migration history was rechecked and remains at the existing 10 applied migrations; no database changes were made.

**Not yet live-tested:** Production currently has no restaurant, branch, Auth users or staff records; the Staff Admin Edge Function is not deployed; exact Admin origin and invite redirect have not been selected/configured. Therefore no email was sent and no invitation was accepted. The page must not be described as end-to-end production verified yet.

### Next safe steps
1. Run the new Admin static CI checks and fix any syntax/path failures.
2. Confirm the final Admin HTTPS origin. Add the acceptance URL to Supabase Auth allowed redirect URLs and set the exact `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` and `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL` values.
3. Configure the Edge Function publishable/secret key environment variables securely, then deploy the Staff Admin Edge Function after reviewing the exact settings.
4. Bootstrap the first Admin using the documented postgres-only procedure; then create a test branch and test both new-user and existing-user invitation paths, expiry, wrong-email rejection, issuer deactivation and retry/idempotency.
5. Keep the Vercel preview gate disabled until the app-specific review passes.

No Auth users, invitation emails, staff roles, restaurant/branch seeds, Edge Function deployment, Vercel deployment, environment variables or production domains were created by this UI change.

---
## 2026-11-20 — Batch 2 applied to Flame Chick Production

**Owner approval:** explicit approval received in chat before execution.
**Production project:** `adkrxfnawdiljhjaavnj` — Flame Chick Production, org `ydlbinhyoutdqueilxnd`, Mumbai `ap-south-1`, PostgreSQL 17.12, Free plan, ACTIVE_HEALTHY.
**Migration:** `20261120164125_batch2_restaurant_branch_foundation`.
**Source candidate:** `docs/drafts/batch2_restaurant_branch_foundation_candidate.sql`.
**Canonical migration added to repo:** `supabase/migrations/20261120164125_batch2_restaurant_branch_foundation.sql`.

Apply API returned success. Supabase migration history now contains Batch 2 after Batch 1.

Post-apply verification:
- Both `public.restaurants` and `public.branches` exist.
- Both are owned by postgres; RLS is enabled.
- No SELECT or INSERT table privileges for anon, authenticated or service_role (same candidate revokes all table privileges from these roles and PUBLIC).
- Both tables contain zero rows.
- No policies exist; this is intentional deny-by-default because no application roles have any table grants. Supabase Security Advisor now reports two INFO-level `rls_enabled_no_policy` findings (one per table); not a high/critical finding. Do not add a permissive policy or grant merely to silence this informational lint. Reassess when a narrowly scoped server access path is designed.
- No Realtime publication entries.
- Performance Advisor zero lints; Health Advisor zero lints.
- Candidate's post-apply verification confirmed owner/RLS/ACL/constraints/empty rows/no policies/no Realtime. A follow-up ACL query confirmed no SELECT/INSERT for all three application roles.
- The verification multi-statement query returned the constraint listing; table metadata from Supabase showed zero rows and all expected columns/defaults/checks.

No restaurant/branch seed rows were inserted. No POS or website code, UI, deployment, API keys, environment variables, Data API exposed-schema settings or website security audit were changed. POS Dine-in UI remains intentionally unfixed. Offline POS multi-mode sync remains a future design/implementation requirement.

## 2026-11-20 — Batch 2 candidate completed and rollback-tested

**Status: candidate prepared and disposable validation passed; NOT applied to Production.** Production project identity was rechecked: `adkrxfnawdiljhjaavnj`, Flame Chick Production, org `ydlbinhyoutdqueilxnd`, PostgreSQL 17.12, Mumbai, Free plan. SQL identity: `current_user=postgres`, `session_user=postgres`.

Candidate file: `docs/drafts/batch2_restaurant_branch_foundation_candidate.sql`.

Scope is exactly two tables:
- `public.restaurants`: UUID identity, canonical unique slug, trimmed name, required currency code and IANA timezone, inactive-by-default state, created/updated timestamps.
- `public.branches`: UUID identity, restaurant FK with RESTRICT, unique (id, restaurant_id) for future composite tenant FKs, restaurant-scoped unique branch code, customer-facing name, private nullable operational address/phone, inactive-by-default state, website master ordering gate and delivery/pickup capability flags (all false by default).

Security: explicit RLS on both public tables; no policies and no direct privileges to PUBLIC/anon/authenticated/service_role; owner postgres; no public RPC/view/function/trigger, no seed rows, no Auth objects and no Realtime membership. The website delivery/pickup flags do not control POS modes. Fulfilment mapping remains delivery/pickup/dine_in per source report. The current POS UI mismatch remains intentionally unfixed. Batch 2 does not add shared POS tables or offline sync tables.

Safety refinements: restaurant currency/timezone are required rather than assumed; restaurant and branch start inactive; website ordering/capabilities start false. IANA timezone and supported ISO-4217 code are validated by trusted provisioning logic. `updated_at` is maintained by trusted server-side commands; browser roles cannot update rows.

**Validation:** candidate executed in a disposable transaction, augmented with temporary valid/invalid test rows, and explicitly rolled back. Assertions covered owner/RLS/no-client-table-privileges/no-policies/no-Realtime/empty migration state, valid tenant+branch insert, fail-closed defaults, invalid slug, invalid currency format, invalid branch code, missing-parent FK and duplicate branch code. All acceptance assertions passed. A first test-harness attempt hit the intended capability CHECK before the FK test; test fixture was corrected and the complete suite then passed. Post-rollback read-only check confirmed zero Batch 2 tables, zero Realtime entries, and only the already-existing Batch 1 migration. Security, Performance and Health Advisors each returned zero lints.

No persistent Batch 2 DDL or rows were created. No Production migration history change occurred. External encrypted backup remains absent as previously approved. Batch 2 SQL needs a separate explicit owner approval before permanent application.

## 2026-11-20 — POS fulfilment and offline-sync source review

Reviewed the working-branch POS, active website entrypoint and order API for exact fulfilment contracts. Detailed report: [POS fulfilment and offline-sync contract review](docs/architecture/pos-fulfillment-and-offline-sync-contract-review.md).

**Canonical future order values**
- Delivery → `delivery` (Website + POS).
- Takeaway → `pickup` (Website + POS).
- Dine-in → `dine_in` (POS only).

**POS UI instruction:** The Dine-in button and Open Tables navigation are hidden, while table selection, table management, open checks, Immediate/Pre-Order scheduling, table movement and payment/close logic remain. Owner says this is a UI bug and explicitly instructed not to fix it now. Leave all POS UI/code untouched; retain all three modes in the future data/API design.

**Current sync gap:** POS IndexedDB stores orders/queue/status queue/tables and cached catalog. Current Supabase POS sync only selects POS `delivery` orders; takeaway and dine-in remain local. Delivery sync requires connectivity and an authenticated staff session. Table records are local and default ten local tables are created when no local table records exist. This is not yet full offline multi-mode synchronization.

**Required future work:** implement durable local outbox and stable local IDs; per-command idempotency; ordered sync; server-side role/branch/catalog/price/fee/status validation; stale catalog hold for Cashier/Manager confirmation (no silent repricing); branch-scoped shared table configuration; recoverable multi-device table conflict handling; dine-in open-check edits, scheduling, table moves and close/payment commands; preserve actor attribution and audit. Delivery creates delivery task; pickup and dine-in do not. Resolve offline actor authentication/attribution before shipping.

Website active UI currently offers Delivery and Takeaway only; its active payload maps these to `delivery` and `pickup`. `js/app.js` is explicitly inactive legacy code and is not evidence of current website dine-in support. Batch 2 website flags remain delivery/pickup only; do not add website dine-in based on legacy code.

No UI, source code, SQL, database, Vercel configuration or deployment was changed. Website security audit remains deferred until immediately before website database integration. Batch 2 SQL remains unapproved/unapplied.

## 2026-11-20 — Batch 2 owner decisions confirmed

The owner approved the following Batch 2 decisions:
- Branch codes are canonical lower-case ASCII, 1–32 characters, using letters, digits, underscore or hyphen (examples: `main`, `gulberg`, `dha-01`). Codes must be unique within a restaurant.
- Branch names are customer-facing and may appear in the future allowlisted public branch-discovery response.
- Operational branch address and phone remain private and are excluded from public discovery by default. No public disclosure of those fields is authorized.
- V1 uses restaurant-wide base menu prices across all branches. Branch-specific product availability and delivery fees are supported; branch-specific base product pricing is excluded.
- Existing website branch-resolution rule remains: zero eligible branches blocks ordering; one eligible branch auto-resolves; multiple eligible branches require customer choice. The server revalidates eligibility on catalog/quote/order commands.

These decisions resolve the corresponding Batch 2 owner-review questions. They do **not** approve SQL or Production DDL. Remaining pre-SQL work: confirm exact fulfilment-mode vocabulary against active app contracts, reconcile exact columns/types/FKs/indexes across specs, author exact candidate SQL, run isolated disposable acceptance tests, and present the complete migration for separate explicit approval.




## 2026-11-20 — Batch 2 restaurant/branch foundation review

**Status: design reviewed and tightened; no Batch 2 SQL authored or applied.**

Reviewed the Batch 2 tenant/branch section against the field-level V1 schema and owner-confirmed operating model. Updated `docs/architecture/database-v1-ddl-spec-batches-1-3.md` (commit `a1916ac74c20568a4a967e15d5e2b16f20021449`) with:
- Strong canonical format and length checks for restaurant slug, name, currency code, branch code and branch name.
- IANA timezone validation in trusted provisioning logic rather than an unsafe CHECK/subquery.
- Explicit public-schema RLS and grant boundary: RLS enabled, no direct grants to PUBLIC/anon/authenticated/service_role in this batch; no public discovery RPC/view yet.
- Server-derived branch eligibility based on active restaurant + active branch + website ordering enabled + requested fulfilment capability.
- Website branch resolution: zero eligible branches fail closed; one auto-resolves; multiple require customer choice; chosen branch revalidated on catalog/quote/order calls.
- Operational address/phone excluded from public branch discovery by default.
- Composite tenant/branch FK rule, RESTRICT history behavior, audited/idempotent provisioning and no seed rows.
- No implicit delivery fee/Not Listed fee/zero fallback and no branch-specific base prices in V1.

### Batch 2 scope
Only `public.restaurants` and `public.branches`. No user/staff roles, menu/catalog, delivery areas, orders, RPCs, policies granting client access, functions, seeds, Auth users, Realtime or app deployments in this batch.

### Design review findings / gates before SQL
1. Confirm the exact branch-code canonicalization (proposed lower-case ASCII letters/numbers/underscore/hyphen, 1–32 chars).
2. Confirm whether branch name is customer-visible and whether any public address/phone should be returned; current safe default is name only.
3. Confirm the exact fulfilment-mode vocabulary from the active website/POS contracts before adding any enum/check or RPC.
4. Confirm no branch-specific base pricing in V1; current approved model in the schema notes is restaurant-wide base prices plus branch availability overlays and branch delivery pricing.
5. Before a Batch 2 migration, reconcile exact column names/types and FK/index definitions across the DDL spec, field-level spec and source contract; run isolated disposable acceptance probes first.
6. No Batch 2 production DDL until exact SQL is presented and separately approved.

### Existing handoff correction
Batch 1 is applied and verified as recorded above. Any earlier pre-apply Batch 1 status text below is historical and superseded; it must not be read as current state.


## 2026-11-20 — Batch 1 permanently applied and verified

### Applied Production migration
User explicitly approved applying Batch 1 without an external encrypted schema dump, acknowledging Production was empty. Applied successfully to the exact Flame Chick Production project `adkrxfnawdiljhjaavnj` (Mumbai, PostgreSQL 17.12, Free plan).

- Migration version: `20261120154413`
- Migration name: `batch1_private_schema_bootstrap`
- Canonical repository migration: `supabase/migrations/20261120154413_batch1_private_schema_bootstrap.sql`
- Migration file commit: `352be31da2f8cf76dfb22f492d0b07bc4e05ace5`
- Supabase migration API returned success; migration history now contains the baseline plus this Batch 1 migration.

### Post-apply verification
Read-only queries confirmed:
- `app_private` exists exactly once and is owned by `postgres`.
- `anon`, `authenticated`, `service_role`, and `PUBLIC` have no schema USAGE on `app_private`.
- No relations, functions or enum types were created in `app_private` by Batch 1.
- No Realtime publication tables in `app_private`.
- No global postgres default ACL entries were added.
- No application business tables/data were created.
- Security Advisor: 0 lints.
- Performance Advisor: 0 lints.
- Health Advisor: 0 lints.

### Effective-privilege verification
Ran a disposable transaction in `app_private` creating a test table, sequence, function and enum type. Enabled RLS on the test table and applied the documented immediate per-object PUBLIC/client revokes to the function and type. Assertions passed: anon/authenticated/service_role had no table SELECT, sequence USAGE, function EXECUTE or type USAGE. Transaction rolled back; follow-up query confirmed zero probe leftovers.

### API exposure
User confirmed the Production Dashboard Exposed schemas are exactly `graph_ql` and `public`; `app_private` is absent. No API settings changed. A PostgREST negative request test has not yet been run, so do not claim it was tested.

### Important migration discipline
The repository migration is the canonical record of the applied change. Do not reapply it manually. Any future rollback must be a new reviewed forward migration, guarded by emptiness checks and `DROP SCHEMA ... RESTRICT`; never edit applied migration history or use CASCADE.

External encrypted schema dump was not created; user explicitly accepted proceeding without it because Production had no application tables/data. This must not be treated as a backup artifact.

### Next work
Batch 1 is complete. Continue with remaining Stage 3 design/source consistency: resolve outstanding business/schema decisions, complete field-level table and API mapping, then separately review Batch 2/3 migration design. Do not start website security audit until immediately before attaching website to DB. No application deployment, Vercel changes, Auth/Storage/Edge Function work, or business table creation was performed in this Batch 1 action.
# Flame Chick Platform — Project Handoff

**Last updated:** 2026-11-22 (catalog publication validator fix applied and verified; pre-launch build; no customer-facing deployment)  
**Canonical project repository:** https://github.com/itsfahadahmed1234-creator/flame-chick-platform  
**Current working branch:** `work/production-source-audit`  
**Default branch:** `main`  
**Current stage:** Stage 1 and Stage 2 complete; Stage 3 schema/source consistency and database security design in progress. Batch 1 private schema bootstrap is now applied and verified; Batches 2–3 remain design-only. The field-level schema, source audit, universal Website/POS order idempotency, website-only customer quota, delivery/pricing contracts, role matrix and Free-plan operations/security controls are documented on the review branch. GST deliberately deferred; offline stale-order confirmation and core role/delivery decisions are owner-confirmed. Remaining deal/schedule/branch/locality/return-payment decisions and schema/API mapping must be resolved before migrations  
**Live customer website:** https://flame-chick.vercel.app/

> **Start here in every new ChatGPT conversation.** Read this file first and continue from the recorded state. Do not restart a broad repository scan or ask the user to repeat facts already recorded here. Verify only the specific live state or files needed for the next action, because remote services can change after this handoff was written.

---

## 1. Project purpose and product boundaries

Flame Chick is a standalone restaurant platform with four applications sharing one dedicated Supabase Production backend:

1. Customer website
2. POS
3. Admin panel
4. Rider portal

This is **not** Hassan Food Point (HFP) and **not** Pizza Bite. Never mix their tenants, Supabase refs, credentials, data, assets, app folders, or deployments into Flame Chick Production.

The website containing Pizza Bite branding and a pizza-bite icon is an unused demo/reference site. It is **not** the live Flame Chick customer website. The actual customer website is the Vercel deployment at https://flame-chick.vercel.app/.

The user wants a careful, incremental implementation. They explicitly said: **“proceed safely dont want to ruin work.”** Treat preservation of working applications and the live site as a hard requirement.

## 2. Non-negotiable operating rules for the assistant

Follow these rules in every future chat and tool session:

- Read this handoff before asking questions or scanning files.
- Continue from the recorded stage and branch. Do not redo completed audits without a concrete reason.
- Prefer targeted verification over broad rescans. If a live fact could have changed (deployment, branch head, database migration history, permissions), verify that fact before acting.
- **Never modify `main` directly.** Work on a clearly named feature/review branch and open a PR for review when appropriate.
- Keep the original source repository and all its branches unchanged as an archive until the new repo, deployments, and rollback plan are fully verified.
- Do not deploy, promote, switch aliases/domains, change Vercel Git connections, alter Production environment variables, apply SQL, run migrations, deploy Edge Functions, seed users/data, or change database settings without a separate explicit approval for that specific stage/action.
- Never assume the currently connected Supabase account is the Flame Chick Production account. Verify the exact project ref `adkrxfnawdiljhjaavnj` before any database work.
- Use Free plans unless the user explicitly approves a paid upgrade.
- Keep all secrets out of Git, chat, browser apps, and documentation. Never ask the user to paste a service-role/secret key into chat.
- Do not bulk rename `HFP_*` identifiers or SQL RPC names just because of the legacy prefix. Determine whether they are internal compatibility contracts before changing them.
- Do not copy Demo UUIDs, owner accounts, branch IDs, menu/order/customer data, or Demo-only business rules into Production.
- Keep the four-app architecture below. Do not redesign it without a clear technical reason and user agreement.
- Explain changes, risks, verification results, and rollback path plainly. If an action is blocked by permissions or a missing connection, report that rather than improvising a risky workaround.

## 3. Agreed repository architecture

This structure was proposed by the user and agreed. Preserve it:

```text
flame-chick-platform/
├── apps/
│   ├── flame-chick-website/
│   ├── flame-chick-pos/
│   ├── flame-chick-admin/
│   └── flame-chick-rider/
├── supabase/
│   ├── config.toml
│   ├── migrations/              # reviewed Production migrations only
│   ├── functions/
│   │   ├── flame-chick-catalog/
│   │   ├── flame-chick-order-api/
│   │   ├── flame-chick-delivery-api/
│   │   └── flame-chick-staff-admin/
│   └── demo-reference/          # historical Demo SQL; never apply automatically
├── docs/
│   ├── architecture/
│   ├── deployment/
│   └── operations/
├── .github/workflows/
├── .gitignore
├── .env.example
├── README.md
├── SECURITY.md
└── PROJECT_HANDOFF.md
```

The root README currently contains an outdated illustrative `docs/legacy-demo/` directory in its tree. The actual agreed docs folders are `architecture/`, `deployment/`, and `operations/`; update that small documentation mismatch on the working branch when convenient.

## 4. Repositories and source history

### New Production source repository

- Repository: https://github.com/itsfahadahmed1234-creator/flame-chick-platform
- Private repository; GitHub repository ID: `1464312723`
- Default branch: `main`
- Connected GitHub access was checked on 2026-11-20: pull/push available; repository admin permission is false.
- The repo already has the agreed four-app architecture, backend function folders, docs, and Demo-reference separation.
- Do not assume admin-level operations (settings, branch protection, secrets, integrations) are available.

### Current review branch

- Latest verified branch comparison at this checkpoint: `work/production-source-audit` is 55 commits ahead of `main`, 0 behind, with 17 changed paths. This is a point-in-time count; re-check before PR/merge. `main` remains unchanged.
- Branch: `work/production-source-audit`
- Created on 2026-11-20 from `main`.
- All review/design changes belong here; `main` remains unchanged.
- Older branch comparison (`44` ahead / `15` changed paths) is superseded by later role/security commits; do not rely on this historical count.
- Stage 1 commits on this branch include:
  - `0da616e0586213990bb43812855875c94d1fd1bd` — clean Pizza Bite catalog fallback labels/cache key.
  - `50096cf779dfd7b101a9445e42980b208c1f0067` — mark inactive legacy website `js/app.js` explicitly as legacy/inactive.
  - `4eaa173fea6e4117513ea258c1f98b1f292d8e3a` — document the active storefront scripts and inactive legacy module.
  - `8d1922b77249cf9d0a250e1cb5be4367314e61f1` — remove the invalid hardcoded POS URL from the Rider account setup message; direct staff to ask the owner/manager for the approved current POS address.
  - `f6d93ddfa5e8e3b17bae6a7c783ec8ef63817bd8` — route Web Push notification clicks using `FLAME_CHICK_RIDER_PORTAL_URL` rather than a stale hardcoded Rider URL; correct a user-facing HFP error label.
  - `70313d15953c98f4fd63f752dc72ca200a821852` — document the Rider URL's Web Push use and safe app-scope fallback.
  - Additional commits added and updated this handoff and the root README; see branch history for exact commit sequence.
- This commit changes only three legacy fallback strings/values: two Pizza Bite error labels become Flame Chick labels, and the fallback cache key becomes `flame_chick_catalog_v1`. The current Flame Chick config already explicitly sets that same cache key, so the normal configured path is unchanged. No live deployment was triggered.

### Original source/archive repository

- Private repository: https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS
- Selected source branch: `feature/flame-chick-wa-storefront`
- This is the source lineage for the current Flame Chick four-app storefront set.
- Keep it and its branches unchanged until the new repo and all app deployments are fully verified.
- Do not transfer Pizza Bite folders such as `apps/website-pizza-bite` or `apps/pizza-bite-admin`.
- The branch has stale/contradictory Demo-labelled root documentation. Use the actual app content and the Vercel production commit when identifying the live website source, not the old README heading alone.
- The historic `feature/flame-chick-demo` branch is Demo context, not the selected source of the current Vercel website.

### Transfer verification already completed

The source-to-destination comparison was completed before this handoff:

- All 99 files under the four `apps/flame-chick-*` roots from the selected source branch are present in the new repository.
- 88 of 99 app files were identical Git blobs; 11 were changed intentionally in the destination and should be reviewed, not blindly overwritten.
- All 72 website media files were present (59 scroll-sequence WebP frames, 11 product images, hero JPG/video).
- All nine historic Demo migration SQL files were byte-identical to their selected source-branch counterparts and are stored under `supabase/demo-reference/migrations/`.
- Pizza Bite app roots and legacy HFP/Pizza Bite roots were intentionally excluded from the new app repo.
- Repository secret scans did not find service-role/secret key values, private PEM keys, old Demo Supabase ref, or Pizza Bite project refs in the checked repository contents. This is a point-in-time scan, not a guarantee that future commits are safe.
- `.gitignore` excludes environment files (except `.env.example`), PEM/key files, `.vercel`, node_modules, and Supabase temp/branch state.

## 5. Live Vercel applications — current observed state

The user confirmed the real website is the Vercel app at https://flame-chick.vercel.app/. The four Vercel projects were inspected read-only on 2026-11-20. The projects still use the old source-repository setup; the new GitHub repo has **not** been connected to them. Do not switch their Git source or deploy from the new repo yet.

| App | Vercel project | Project ID | Observed assigned domain(s) |
|---|---|---|---|
| Customer website | `flamechicks` | `prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5` | `flame-chick.vercel.app` |
| POS | `flamechic-pos` | `prj_0qb9GVxu8x046cAWKwEtKXd11EFN` | `flamechic-pos-two.vercel.app` |
| Admin | `flame-chick-admin` | `prj_PhyoAV8iNnVsiZ0R41j9HjUAIbc9` | `flame-chick-admin.vercel.app`, `flamechic-pos.vercel.app` |
| Rider | `flamechicksrider` | `prj_oE14rE4Rz1EJRbJuYawGeznzTuyo` | `flamechic-rider.vercel.app`, `flamechicksrider.vercel.app` |

Important domain mismatch findings (do not auto-fix):

- `flame-chick-pos.vercel.app` (with hyphens) was not found as an assigned Vercel domain.
- POS project currently has `flamechic-pos-two.vercel.app`.
- `flamechic-pos.vercel.app` (without the extra hyphen) is assigned to the Admin project, which looks suspicious.
- Rider code contains a link to `https://flame-chick-rider.vercel.app/`, while the Rider project was observed with `flamechic-rider.vercel.app` and `flamechicksrider.vercel.app`.
- Decide the intended canonical POS/Admin/Rider URLs with the user and inspect links before changing Vercel domains or code. Do not move a domain without an explicit plan and approval.

The actual website's observed Production deployment was READY and aliased to `flame-chick.vercel.app`; its source commit was `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2` on `feature/flame-chick-wa-storefront`. Destination website HTML had intentional changes relative to that deployment commit, so do not claim that every new-repo file is byte-identical to the live deployed version.

## 6. Supabase Production — target and safety gate

**Intended Production project:**

- Name: Flame Chick Production
- Project ref: `adkrxfnawdiljhjaavnj`
- URL: `https://adkrxfnawdiljhjaavnj.supabase.co`
- Region: Mumbai (`ap-south-1`)
- Plan: Free
- It belongs to a separate Flame Chick Supabase account/org.

**Connection verified on 2026-11-20:** the currently connected Supabase organization is `Flamechic` (`ydlbinhyoutdqueilxnd`) and its project list contains only `Flame Chick Production` with exact ref `adkrxfnawdiljhjaavnj`, region `ap-south-1`, status `ACTIVE_HEALTHY`, and Free plan. Re-verify this exact ref before every future database mutation. Do not use HFP or Demo.

### Known applied Production migration

A security baseline is already applied to Production. Its live migration record and SQL were retrieved read-only on 2026-11-20:

`20261119125153_flame_chick_postgres_default_privileges_hardening`

Known SQL:

```sql
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
```

The exact SQL was retrieved from `supabase_migrations.schema_migrations` and verified against the recorded version/name. A matching file has now been added to `supabase/migrations/20261119125153_flame_chick_postgres_default_privileges_hardening.sql` on `work/production-source-audit`. This file records an already-applied migration; **do not reapply it**. The file is for repository history/reconciliation only.

Read-only Production inspection on 2026-11-20 confirmed: no tables in `public`; no tables in `public` or `private`; zero rows in `auth.users`; no Edge Functions deployed; no Storage buckets; the only app migration is `20261119125153_flame_chick_postgres_default_privileges_hardening`; the security advisor returned zero lints. These are point-in-time findings. Do not infer that the app schema exists.

### Reference projects — never target for Flame Chick Production

- Hassan Food Point (HFP): `ycwzmgvljaskjfatresh`
- Flame Chick Demo: `nthtslzeqglcforbsirz`
- Pizza Bite: `hrclruyrquzekjzyggpt`

These refs are reference-only. Never run Production migrations or app configuration against them.

### Demo data and rules that must not be copied blindly

Historic Flame Chick Demo has its own schema, owner, branch ID, seeded menu, policies, functions, and operational settings. In particular:

- Demo Main Branch UUID `f12a92da-2e6f-4a0a-a3f7-74b13f29888b` is Demo-only. Never copy it into Production.
- Do not copy Demo owner/auth users or customer/order records.
- Demo manual-address/zero-fee behavior is Demo-specific. Production must not silently inherit free delivery or a zero-fee fallback.
- Demo migrations are reference-only and live under `supabase/demo-reference/`, never the deployable `supabase/migrations/` directory.
- Historic Demo backend audit recorded 45 tables, 271 constraints, 187 indexes, 108 RLS policies, 33 routines, 35 triggers, three POS views, a menu seed, media bucket, cron task, and four deployed Edge Functions. Treat this as historical design reference, not proof of current Production state.
- HFP RPC prefixes such as `hfp_manage_staff_role` may be compatibility contracts. Review the schema/function contract before renaming.

## 7. Application source observations and known review items

### Customer website

- Entrypoint: `apps/flame-chick-website/index.html`.
- It loads `js/config.js` and `js/catalog.js` plus inline scripts.
- It does **not** load `js/app.js` through a script tag in the reviewed entrypoint. Earlier audit also found no obvious app.js reference in the entrypoint.
- `js/config.js` points to Production ref `adkrxfnawdiljhjaavnj` and uses a public publishable key. The key is intended to be public, but verify that it belongs to the correct Production project/account before a new Production deployment. Do not confuse publishable keys with service-role secrets.
- Config sets `catalogCacheKey: 'flame_chick_catalog_v1'`.
- `js/catalog.js` is actively loaded. Stage 1 branch commit `0da616e...` updates its fallback error text and fallback cache key from Pizza Bite to Flame Chick. This does not change the normal configured cache key.
- The separate `js/app.js` file was found to contain stale Pizza Bite/HFP settings and raw image URLs from an HFP staging image repository. It was not loaded by the reviewed entrypoint. Do not delete it blindly: verify all HTML, imports, dynamic loaders, tests, service-worker references, and other apps for references first. Then decide whether to remove it or clearly archive it on a review branch.
- Some `HFP_*` identifiers remain as legacy internal names; don't bulk rename until compatibility is understood.

### POS, Admin and Rider

- POS entrypoint contains Supabase JS CDN and a large inline script.
- Admin entrypoint loads `config.js` and `app.js`; both are active and changes can affect Admin behavior.
- Rider entrypoint contains Supabase JS CDN and a large inline script.
- Be conservative when modifying these applications. Inspect the specific function and call chain before changing operational workflows.

### Edge Functions

There are four source functions under `supabase/functions/`:

- `flame-chick-catalog`
- `flame-chick-order-api`
- `flame-chick-delivery-api`
- `flame-chick-staff-admin`

Known review items:

- `supabase/config.toml` currently sets `verify_jwt = false` for these functions. Historic Demo code intentionally performs explicit API-key + user-JWT validation in handlers. Verify every function's authentication/authorization path before changing this setting; do not flip it automatically.
- Catalog function uses a server-side `SUPABASE_SERVICE_ROLE_KEY`; this is appropriate only in function secrets, never browser code.
- Order, delivery, and staff functions include a hardcoded public publishable key fallback in `PUBLIC_KEYS`. Verify it against the separate Production project and consider moving allowed public keys fully into configured function environment/secrets after understanding compatibility.
- Staff Admin reads `FLAME_CHICK_RIDER_PORTAL_URL` for invite redirects.
- Delivery API also needs review for the Rider portal URL used in notification/deep-link text. It must ultimately use the user-approved canonical Rider URL rather than a stale hardcoded domain.
- Required secret/config names documented in `docs/deployment/production-environment.md` include `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `FLAME_CHICK_MAIN_BRANCH_ID`, and `FLAME_CHICK_RIDER_PORTAL_URL`; legacy anon key is optional only if retained for compatibility. Never store their values in this handoff.

## 8. Realtime and operational constraints already agreed

Keep Supabase Realtime narrowly scoped to live operational updates:

- POS and Rider portal need live updates for new/assigned offers, accept/reject, pickup/receipt, delivery progress/failure/return, and manager dispatch changes.
- Rider subscriptions should be targeted to the rider's own offers/assignments, not branch-wide.
- Do not add Realtime to Order History, reports, or other screens that do not need live updates.
- POS keeps a 15-second polling fallback.
- Avoid adding `order_status_history` to Realtime unless a specific, justified requirement emerges.
- The user prefers conserving Free-plan Realtime quota and keeping the implementation simple.

Historic HFP reference used five Realtime tables (`orders`, `delivery_tasks`, `delivery_task_offers`, `delivery_assignments`, `order_status_history`). Do not assume all five should be enabled in Flame Chick Production.

## 9. Backup plan

- User selected an external encrypted backup approach.
- A separate private repository named `itsfahadahmed1234-creator/flame-chick-backups` is planned but had **not** been created at last check.
- Keep database backups and Storage object backups separate and encrypted.
- Intended retention: daily backups, seven daily restore points, weekly retained copies, and monthly restore tests.
- Check current GitHub limits and practical Free-plan constraints before implementing automation.
- External backups do not prevent a Supabase Free project from pausing due to inactivity. Do not promise that they do.

## 10. Work completed and current status

### Completed before Stage 1

- Agreed and recorded the four-app architecture.
- Identified the actual live customer website and distinguished it from the unused Pizza Bite demo site.
- Audited the new repo layout, all 12 Markdown files, selected source/handoff documents, app transfer, media transfer, Demo migration archive, and repository secret patterns.
- Compared the four app source roots against the selected source branch.
- Inspected the four Vercel projects/domains read-only.
- Identified the separate Flame Chick Production Supabase project ref and the mismatch with the connected reference account.
- Reviewed website entrypoint script loading and identified the inactive legacy `js/app.js` candidate.
- Confirmed that no Vercel or Supabase Production mutations were made during the audits.

### Stage 1 work completed on 2026-11-20

- Created review branch `work/production-source-audit` from `main`.
- Updated `apps/flame-chick-website/js/catalog.js` to remove Pizza Bite fallback error wording and use the Flame Chick fallback cache key. The current config already sets this same cache key, so the normal configured path is unchanged.
- Reviewed the website entrypoint: it loads `js/config.js`, `js/catalog.js`, and inline scripts only. It does not load `js/app.js`. Reviewed the website's sibling JS modules and the other three app entrypoints; no active HTML script reference to the legacy website `js/app.js` was found. The file is retained, not deleted, and its header now clearly marks it LEGACY / INACTIVE. Website README documents the actual active runtime and warns not to re-enable the old module without review.
- The inactive legacy `js/app.js` contains Pizza Bite/HFP-era settings and HFP staging image URLs. It remains in the repo only as historical source pending any future explicit removal decision.
- Rider app had a hardcoded POS URL `https://flame-chick-pos.vercel.app/` that was not an assigned Vercel domain. Replaced that link with safe owner/manager instructions; no final POS domain was guessed.
- Delivery API push notifications had a hardcoded Rider URL `https://flame-chick-rider.vercel.app/`, inconsistent with the observed Vercel Rider project domains. It now reads `FLAME_CHICK_RIDER_PORTAL_URL`. If the environment variable is unset, the payload omits the URL and the Rider service worker safely falls back to its own app scope. No Vercel domain or secret was changed.
- Corrected a user-facing delivery API configuration error label from HFP to Flame Chick. Legacy `hfp_*` RPC names remain untouched because they are database compatibility contracts until reviewed.
- Updated deployment documentation to explain that `FLAME_CHICK_RIDER_PORTAL_URL` controls staff invitation redirects and Web Push clicks, with a safe service-worker app-scope fallback.
- Added this handoff document at the repository root as the durable context entry point and linked it from the root README. Corrected the README's illustrative docs tree to the actual `operations/` folder.
- Latest GitHub compare is recorded near the end of this handoff; treat it as a point-in-time count and re-check the branch head before writing. `main` has not been modified.
- Static review was performed through GitHub source reads. No app build, Deno type-check, browser test, or end-to-end test was run because no CI workflow/test harness is configured in this repository and no local project runtime was provisioned. Treat runtime/type validation as pending; do not describe this branch as fully tested.
- No live deployment was triggered.
- No Vercel settings/domains/Git connections were changed.
- No Supabase SQL, migration, function, secret, user, or data was changed.
- No original repository or branch was modified.
- No new backup repository was created.
- No automated test suite or app build was run in this documentation/source-only pass; record this as pending verification rather than treating it as tested.
- No merge to `main` has occurred.


### Stage 2 connection check on 2026-11-20 — superseded by successful verification below

- Read the installed Supabase skill before using Supabase tools.
- Read-only `list_organizations` returned only organization `hfp supabase` (org id `xzdklhvmheiewpnnqgsa`).
- Read-only `list_projects` returned only:
  - HFP `ycwzmgvljaskjfatresh` (ACTIVE_HEALTHY)
  - Pizza Bite `hrclruyrquzekjzyggpt` (INACTIVE)
  - Flame Chick Demo `nthtslzeqglcforbsirz` (ACTIVE_HEALTHY)
- The required Production ref `adkrxfnawdiljhjaavnj` is **not visible** to the currently connected Supabase account. The only connected organization is HFP. This confirms the existing connection warning.
- No database tables, migrations, SQL, functions, secrets, auth users, storage, or project settings were queried or changed for a guessed project. No migration was applied.
- At that earlier checkpoint Stage 2 was blocked. This was superseded after the user confirmed the Production account was connected. The successful connection/read-only inspection is recorded next.
- Do not use HFP `ycwzmgvljaskjfatresh` or Demo `nthtslzeqglcforbsirz` as a substitute.


### Stage 2 successful Production connection and migration reconciliation — 2026-11-20

- Read the Supabase skill before any Supabase operation.
- `list_organizations` now returns only `Flamechic` organization id `ydlbinhyoutdqueilxnd`.
- `list_projects` returns only `Flame Chick Production` (`adkrxfnawdiljhjaavnj`), region `ap-south-1`, status `ACTIVE_HEALTHY`. The project API URL is `https://adkrxfnawdiljhjaavnj.supabase.co`. Plan is Free per project details/context.
- `list_migrations` confirms exactly one application migration: version `20261119125153`, name `flame_chick_postgres_default_privileges_hardening`.
- Read `supabase_migrations.schema_migrations` and recovered the exact recorded SQL and migration name. It matches the security baseline SQL recorded in this handoff.
- Added matching repository file `supabase/migrations/20261119125153_flame_chick_postgres_default_privileges_hardening.sql` to branch `work/production-source-audit` (blob SHA `9ed6364ed5f7de9a16eb9e372d0c00ddcb98fb0a`). This is a history/reconciliation file for a migration that is already applied. Re-read and hash-verified the repository file after writing; Production still lists exactly the same one migration. **Do not apply/reapply it.**
- Read-only schema inspection: no `public` tables; no `public` or `private` application tables; `auth.users` has zero rows; no Edge Functions; no Storage buckets.
- Security advisor returned zero lints.
- The installed extensions list includes managed/preinstalled extensions. No extension was enabled, disabled, or changed.
- All operations were read-only except the GitHub file creation. No Supabase SQL, migration, secret, user, bucket, function, or project setting was changed.
- Stage 2 account verification and migration-history reconciliation are complete. Next: Stage 3 design the Production schema in small reviewed migrations. Before any DDL, inspect current source function contracts, reference Demo schema selectively, and document the proposed schema/migration plan. Do not mutate Production until the specific DDL batch is reviewed and approved.


### Stage 3 initial contract analysis — 2026-11-20

Read the four Production Edge Function source files on `work/production-source-audit` and inspected the Demo baseline migration as reference only. No Production database changes were made.

**Observed API-to-database contract dependencies:**

- Catalog API reads: `restaurants`, `categories`, `products`, `modifier_groups`, `deals`, `delivery_areas`, `restaurant_settings`, `drink_options`, `subcategories`, `product_variants`, `modifiers`, `modifier_group_assignments`, `deal_components`, and `modifier_price_rules`. It expects an active restaurant with slug `flame-chick` and requires at least one product and variant to publish a catalog.
- Order API directly reads `user_roles` and `orders`; it calls `hfp_check_website_order_rate_limit`, `hfp_create_order`, and `hfp_update_order_status`. It requires the Production main branch UUID in `FLAME_CHICK_MAIN_BRANCH_ID` and validates staff roles server-side.
- Delivery API directly reads/writes `delivery_tasks`, `rider_profiles`, `user_roles`, `delivery_task_offers`, and `rider_push_subscriptions`; it calls `hfp_manage_delivery`, `hfp_get_rider_push_config`, `hfp_verify_delivery_push_webhook`, `hfp_accept_delivery_offer`, and `hfp_decline_delivery_offer`. Rider scoping is branch-bound and role-bound.
- Staff Admin directly reads `restaurants`, `user_roles`, `staff_role_audit`, `user_profiles`, `rider_profiles`; it calls `hfp_manage_staff_role`. It resolves the active restaurant using slug `flame-chick` and selects a branch.
- These are only the direct HTTP/API references visible in function code. RPC bodies and triggers may depend on additional tables, columns, constraints, views, sequences, and helper routines; the migration design must include those transitive dependencies.

**Demo baseline reference audit:**

- The archived Demo baseline creates 45 tables: 42 in `public` and three in `private`.
- It is useful for understanding the prior data model, but includes Demo-specific defaults and identifiers. In particular, its `delivery_areas.delivery_fee` and `delivery_tasks.delivery_fee_snapshot` definitions default to zero; do not copy those defaults into Production without a deliberate business decision. Production delivery fees must remain unknown/unset when not configured, not silently treated as zero.
- The baseline includes `private.hfp_website_order_rate_limit_events`, `private.rider_push_config`, and `private.delivery_dispatch_settings`. Review whether each is still needed and how it should be provisioned before including it in Production.
- The source API still calls several `hfp_*` RPC names. Keep these identifiers for compatibility unless a full caller/function dependency review justifies a coordinated rename.

**Next Stage 3 work:**

1. Map all API table/column reads and writes, RPC signatures and payload contracts, triggers, views, and RLS expectations to the Demo reference SQL and existing app calls.
2. Identify missing/inconsistent columns and any Demo-only behaviors; explicitly design Production-safe defaults and tenant/branch scoping.
3. Produce a reviewed schema/migration plan and migration dependency order in docs before any DDL is applied.
4. Do not apply SQL, deploy functions, create users, seed menu data, or change Production settings until the design and the specific first migration batch are reviewed and explicitly approved.


## Production engineering quality bar — user requirement (2026-11-20)

The user explicitly requires a secure, reliable, maintainable database designed to run for years without avoidable data loss, leaks, damage, or operational failure. The implementation must prioritize security, correctness, resilience, recoverability, and compatibility with the NEW Flame Chick menu planned for launch in the coming weeks. Do not rush schema creation or copy the Demo schema blindly.

### Menu information gate

- The actual final launch menu planned for the coming weeks has **not yet been supplied**. Two images are available: the current published menu baseline and a separate future-capability reference sample. They inform catalog structure and compatibility; neither is an instruction to automatically seed Production.
- Known historical Demo context (five categories, about 24 regular products/variants plus a Platter Deal) is not an authoritative specification for the new menu. Do not assume its categories, product set, modifier structure, deal logic, pricing, or media are unchanged.
- Do not block schema design waiting for the final launch menu. Design the catalog so future menu items and rules can be created in Admin. The reference image and user clarification are documented in `docs/architecture/menu-management-design.md`; the current menu transcription is in `docs/architecture/current-menu-baseline.md`. Ask about unresolved business rules only where they change the schema.
- Continue schema/security design now. Do not create initial menu seed data from either image; once the Admin workflow is implemented, the actual launch menu can be entered and validated through Admin.

### Mandatory database/security/reliability design checklist

1. **Tenant and branch isolation:** every business record must be scoped to the Flame Chick restaurant and relevant branch where applicable. Enforce relationships with foreign keys/composite constraints and server-side authorization; never trust client-supplied restaurant, branch, role, user, fee, amount, or status values.
2. **Default-deny access:** enable RLS on every exposed application table. Keep internal/private tables and sensitive helper functions outside exposed schemas. Define narrow role-specific policies and grants; authenticated alone is not authorization. Use app-controlled authorization sources, not user-editable auth metadata.
3. **RPC/function hardening:** review every API/RPC for authentication, role/branch scoping, input validation, idempotency, bounded payloads, safe errors, rate limits, replay protection for webhooks, and least privilege. Avoid unnecessary SECURITY DEFINER; where essential, constrain search_path, ownership, execution grants, and authorization checks. Do not expose privileged keys.
4. **Data-leak resistance:** prevent cross-branch/tenant IDOR, enumerate/list leaks, verbose database errors, private customer address/phone exposure, staff/rider data leakage, public Storage listing, insecure object paths, and accidental secrets in logs. Use field minimization, explicit public catalog allowlists, safe response DTOs, and private Storage by default unless public product media is intentionally published.
5. **Order and financial correctness:** store immutable order/item/price/modifier/deal/delivery-fee snapshots so menu edits never rewrite past orders. Use numeric money types, currency rules, database constraints, server-calculated totals, idempotency keys, transactions, and explicit state-transition rules. Never rely on browser-calculated totals.
6. **Menu evolution:** support categories/subcategories, products, variants/sizes, modifiers and pricing rules, deals/bundles/components, drink options/add-ons, availability/schedule, media, Urdu/English fields, sort/display rules, and versioned publication only where the actual new menu requires them. Prefer a normalized source of truth plus an atomic/versioned published catalog snapshot so partially updated menus are not served. Confirm actual menu requirements before locking this model.
7. **Delivery and pricing correctness:** unset/unknown delivery fees must remain unknown, not default to zero. Snapshot the fee and area at checkout. Validate delivery area, branch, fee, and fulfillment server-side. Never inherit Demo zero-fee behavior.
8. **Auditing and accountability:** record security-sensitive staff/role/configuration changes and order/delivery state transitions with actor, timestamp, reason, and minimal safe metadata. Restrict audit reads and prevent ordinary app clients from rewriting history.
9. **Operational reliability:** use explicit constraints, indexes aligned with real queries, lock/transaction strategy, bounded retries, timeouts, health checks, structured redacted logs, monitoring, and safe failure behavior. Avoid unbounded Realtime subscriptions; retain the agreed targeted POS/Rider subscriptions and 15-second POS polling fallback.
10. **Backups and recovery:** define encrypted database and Storage backups, retention, integrity checks, restore drills, and a documented recovery runbook. Verify actual Free-plan backup/retention limitations; external backups do not guarantee zero downtime or prevent an inactive project from pausing. Test restores rather than only checking that backup files exist.
11. **Migration safety:** small ordered migrations, reviewable diff, preflight checks, stable migration history, forward-fix/rollback strategy where feasible, backups before risky changes, and post-migration verification. Never edit/reapply an already-applied migration. Test schema changes in an isolated non-production environment before Production application.
12. **Long-term maintainability:** document invariants, role matrix, data lifecycle/retention, operational procedures, ownership of secrets, key rotation, and dependency/version strategy. Design for evolving menu and operational workflows without prematurely overgeneralizing.

### Current decision / next action

- Do not apply Production DDL or seed data yet.
- Current menu baseline and future-capability reference have been received and documented. Final launch menu entry is a later Admin task, not a prerequisite for schema design. Continue the ERD, resolve decisions that affect the table model, then prepare the field-level migration spec.
- In parallel, continue documenting API-to-database contracts and security boundaries without changing Production.
- The user expects this handoff to be updated after every meaningful project step. Update it with menu source/version, design decisions, migrations, commits, tests, risks, and precise next action.


### Menu capability reference received — 2026-11-20

- User supplied a menu image (WhatsApp image dated 2026-11-19). It is explicitly **not** the menu to publish and must not be seeded. Its purpose is to demonstrate the structures the new Admin-managed catalog must support.
- User clarified the primary goal: design the schema so the owner/staff can add and manage the actual upcoming menu through the Admin panel without routine database changes.
- Added design specification: `docs/architecture/menu-management-design.md` (commit `8b77c9d418e0a93494fc80d007dd94a6a863c9cc`). This is design documentation only, not DDL.
- The reference demonstrates category/section variety; simple priced products; portion variants; flavor/style choices; beverage volumes; TBD/unpriced items; configurable bundles with multiple components; deal families; and time-window promotions (3 PM–5 PM shown). These examples do not determine final business rules.
- Current Admin code audit: basic category/subcategory CRUD, product single/multiple variant pricing, product availability/images, deal creation with fixed product/variant, subcategory choice and included drink, and deal-level editing. Gaps include mandatory numeric product/deal prices (no unpriced draft), no schedule editor/API schedule output, no full modifier management UI despite modifier tables/catalog serialization, no full existing deal component editing, and multi-request browser-side writes that can leave partial state. Public catalog currently builds from source tables at request time, not a committed atomic published version.
- Target design covers Admin-managed categories, products/variants, NULL/unpriced draft prices distinct from genuine zero, reusable modifier/option groups, flexible combo components and selection constraints, recurring/dated schedules in explicit timezone, media privacy, draft/preview/validate/publish/rollback, immutable order snapshots, audit history, and transactional server-side writes.
- Do not hardcode category names, size labels, flavors, drink volumes, deal names or menu-specific logic. They must be data configured through Admin.
- The design file records unresolved business choices; do not invent whether flavors are variants/modifiers/products, whether combo choices are fixed/curated, how substitutions/surcharges work, schedule recurrence/scope, channel availability, stock/tax/allergen needs, or who can publish.
- Next: complete the API/schema contract map; review existing Demo publication tables only as reference; then draft a concrete Production ERD/migration sequence and Admin/API work plan. Keep Production read-only. No menu data or Production DDL was created.
- Ask the user for clarification only on business rules that materially affect the model, not for the final menu itself. The final menu can later be entered through Admin if the designed capabilities cover it.


### Current published menu baseline received — 2026-11-20

- User supplied the current Flame Chick menu image. This is the current published-menu baseline, distinct from the earlier future-capability reference image.
- Inventory transcription is recorded in `docs/architecture/current-menu-baseline.md` (commit `64ca4e6263de50e0b5ee23e6acadd36c6a63f00c`). It records 25 named entries from the image: 5 Starters (including Platter), 3 Injected Broast entries, 3 Wraps, 4 Burgers, and 10 beverage-list entries. All 25 show numeric PKR prices. The artwork says prices are exclusive of applicable GST; the user explicitly deferred GST implementation from the initial schema, so this is retained only as source context.
- The menu artwork's beverage list is displayed below Burgers without a visible separate “Beverages” heading; verify the intended category in live Admin/catalog before importing.
- Platter is described as 6 Classic Nuggets, 6 Injected Nuggets, 6 Fire Wings, 6 Injected Wings, Fries & Dips, priced PKR 1,499. Confirm whether Fries & Dips are tracked catalog components or only description/inclusions.
- “NEW” labels appear on Platter, Sunset Splash, 1.5 Ltr Water Bottle, and Cold Drinks 1.5 Ltr. Artwork does not define automatic expiry or badge rules.
- Artwork shows Quarter/Half/Full Broast as separately named priced entries; do not assume their current backend representation is product variants until live catalog records are inspected.
- This image is evidence of displayed menu content only, not proof of live backend IDs, exact current Admin data, tax configuration, stock rules, or checkout calculations.
- No menu rows have been inserted into Production. No Production schema or live app was changed.
- Next: compare this artwork with the actual current catalog/export from the live system (where available), then map stable product identities and order snapshots. Incorporate these requirements into the proposed ERD and Admin authoring workflow. Keep Production read-only.


### Production schema/reliability blueprint drafted — 2026-11-20

- Added `docs/architecture/production-schema-blueprint.md`, `docs/architecture/delivery-pricing-contract.md`, `docs/architecture/database-application-contract-map.md` (commit `d0e58a68cdda582b02d9bf198fdcc58c7cc43e71`). Design only; no SQL created/applied.
- Reviewed archived Demo baseline SQL and follow-on security, media, offer expiry, staff audit/index, helper-usage, Admin connection, and Demo-only manual-address/zero-fee migrations. Confirmed Demo baseline contains 45 tables (42 public, 3 private), 33 functions, 35 triggers, 108 RLS policies and 103 explicit indexes. Treat Demo as a reference, not a Production migration set.
- Inspected current POS adapter and catalog refresh: schemaVersion 2, required arrays for categories/products/productVariants/subcategories/deals/dealComponents/modifierGroups/modifiers/modifierPriceRules/modifierGroupAssignments/deliveryAreas/drinkOptions; health then catalog fetch; IndexedDB cache. POS currently clears menu/category/delivery-area stores before repopulating them, so a failed cache update could lose the previous working cache. It converts missing variant prices and delivery fees to zero in the adapter. Blueprint requires version-staged cache writes, an atomic active-version pointer and no silent zero fallback.
- POS offline delivery orders currently submit product/variant/deal IDs plus idempotency key; the existing order API prices using current mutable catalog values. Production must bind orders to a publication version and implement the now-confirmed hold/explicit cashier-manager confirmation policy before order DDL.
- Catalog function currently builds from mutable source tables and its health check does not enforce a separate approved publication pointer. Blueprint specifies immutable publication snapshots, a current pointer, validated publish/rollback, checksum and schema-version contract.
- Demo raw catalog tables have anon SELECT policies and authenticated table grants. Production should use narrow allowlisted public catalog DTOs, private operational schemas, least-privilege grants, tenant/branch composite constraints and server-checked roles rather than copy policies blindly.
- Demo order function writes zero tax and contains a Demo-specific manual-address/zero-fee path. Neither is approved for Production. Current published menu artwork mentions GST, but the user explicitly deferred GST from the initial schema; do not add tax schema or calculation in this phase.
- Existing Admin writes compound catalog changes through multiple browser REST calls and lacks full modifier/schedule editors, unpriced draft support and complete deal-component editing. Blueprint recommends transactional server-side commands, concurrency checks, audit, and full Admin workflow.
- Key schema domains: restaurant/branch tenancy; categories/subcategories/products/variants; modifier groups/options/assignments/pricing; deals/components/choice pools/schedules; draft and immutable publication; orders/items/modifiers/components/payments and immutable price snapshots; delivery/rider; staff/access/audit; POS devices/registers; settings/media/outbox.
- No Production database, Storage, Function, role, settings or app deployment was changed.
- At this earlier checkpoint, the next work was contract mapping and open decisions. Subsequent documents now contain the contract map, V1 ERD and confirmed offline stale-order policy. Remaining decisions are publication/price role boundaries, deal choice rules, schedule recurrence/scope, branch-specific menu visibility/pricing, inventory need, and whether Not Listed collects a separate locality field. GST is deferred from the initial schema. Do not apply Production DDL yet.


### Owner decision — defer GST/tax from initial schema — 2026-11-20

- User explicitly agreed to keep GST out of the initial database/schema design to avoid unnecessary complexity. GST/tax is deferred until the user specifically asks to implement it.
- Do **not** create tax configuration/rule tables, tax categories, tax schedules, order tax-line tables, tax snapshots, tax-rate/effective-date engines, or tax-calculation RPCs in the initial Production migrations.
- Keep the first order financial model focused on item/variant/deal prices, quantities, subtotal, explicit discounts only where required, delivery fee, and total. Preserve immutable price and order snapshots.
- Do not guess or hardcode a GST rate. The current menu artwork's note that prices exclude applicable GST is retained as reference context only; it does not authorize GST calculation or schema additions in this phase.
- When GST becomes necessary, design it as a separate, reviewed forward migration and coordinated API/website/POS change. Do not retroactively rewrite completed order snapshots.
- Blueprint updated to reflect this decision: `docs/architecture/production-schema-blueprint.md`, commit `cc0c917869ab4f7480049e8824f829332d967283`.

- Final documentation consistency pass removed deferred tax requirements from the current-menu capability bullets and order snapshot descriptions: `docs/architecture/current-menu-baseline.md` commit `dd83b49f270593ba4f3ef7c153ac9238efe403a5`; `docs/architecture/menu-management-design.md` commit `7d25e673fa2703b2a0342c12442af78f95fa083e`. The artwork's GST wording remains transcribed as source context only. No tax schema/calculation is in the initial design.
- No Production database changes were made.

- After the owner decision, aligned both menu design records with the GST deferral: `docs/architecture/current-menu-baseline.md` (commit `4cb4fe5b001713633a7f51d99a32fb38df0b4771`) now treats the GST phrase as source context only, and `docs/architecture/menu-management-design.md` (commit `8385e29a62688e3190b0a6d510ed263a9d1118e8`) marks tax as out of scope for the initial schema.

### Owner decision — Delivery area pricing logic confirmed — 2026-11-20

The user confirmed the Production delivery-fee behavior:

- Admin manages a list of named delivery areas/localities, each with its own explicit delivery fee. Examples discussed: fee amounts such as Rs. 0 to Rs. 500; no fee bands or formula are implied by that phrase.
- Customer selects their matching listed area and the backend uses that area's configured fee.
- If their locality is not in the list, customer can select **Not Listed / Other**. This uses the separate default delivery fee configured by Admin.
- Not Listed is a distinct selection mode, not a distance calculation, geolocation calculation, nearest-area match or client-supplied fee.
- Default fee can deliberately be zero, but an unset/missing default is not zero and must block Not Listed checkout. Explicit zero means the Admin saved zero on purpose.
- Listed and Other fee values must be read and enforced server-side; never trust price/fee from the website/POS request.
- Snapshot fee source, selected area/Other classification, displayed area label and exact calculated fee on the order and delivery task. Later changes to Admin fees affect new orders only, never historic orders.
- Keep area and default-fee scope aligned to the selected branch. Current single-main-branch configuration may use one branch default; do not allow branch A's area list/default to leak into branch B if multi-branch support is activated.
- A manually typed locality/mohalla for an Other selection is recommended for rider/manager context, but the user has not explicitly confirmed whether this field is mandatory. Confirm UI requirement before implementing it; it must never determine the fee.

**Existing source audit findings (current branch code, not changes to live apps):**
- Admin already manages delivery_areas CRUD and a separate restaurant_settings key DefaultDeliveryFee. The current UI stores this default as restaurant-wide (branch_id IS NULL, is_public=true) and area rows against the selected branch.
- Existing Admin's new-area fee form is prefilled with 0; make the initial field blank/required, and accept zero only after explicit input.
- Current customer website already displays each active area's fee and a Not Listed choice, reads DefaultDeliveryFee from the catalog settings, and blocks checkout when that default is unset.
- Current POS resolves the entered area against active area rows or uses DefaultDeliveryFee for the explicit Not Listed label, and blocks delivery order submission when default is unset.
- Current POS catalog adapter converts a missing area fee to zero (Number(value) || 0). Production contract must not do this for a required fee.
- Current POS delivery-order payload sends null area_id with area_name: Not Listed for Other; the Production order contract should add an explicit selection discriminator (e.g. delivery.selection_type = listed_area | not_listed) rather than infer Other from NULL area_id alone. Server must reject ambiguous/missing selection.
- Current catalog Edge Function reads active areas for the restaurant without selecting a branch. Production catalog must expose only area choices and default fee applicable to the selected fulfilment branch. The public response may expose area names and delivery prices only, not unrelated restaurant settings or staff/internal data.
- No live app code or Production database was changed during this audit.

**Blueprint:** Delivery fee model has been documented in docs/architecture/production-schema-blueprint.md (commit 703df0269b76a689a489ea29ec617d99671dfd41). It covers Admin CRUD, listed/Other fee resolution, explicit zero vs unset, server enforcement, snapshots, branch scope, and current source gaps.

**Test cases required before launch:**
1. Listed active area with a configured positive fee -> fee matches DB area record.
2. Listed active area with explicitly saved Rs. 0 -> order may proceed at zero only if that is the actual Admin setting.
3. Inactive/unknown area ID -> rejected; never treated as Other.
4. Explicit Not Listed with configured default positive fee -> use default.
5. Explicit Not Listed with explicitly configured zero default -> use zero.
6. Not Listed with NULL/missing/invalid default -> blocked; no order or delivery task.
7. Client sends tampered area fee/default fee -> ignored; server-calculated fee wins.
8. Client sends NULL area_id without explicit Not Listed selection -> rejected.
9. Area belonging to another branch/restaurant -> rejected.
10. Admin fee changed after an order was placed -> prior order and delivery-task snapshots unchanged; next new order uses new fee.
11. Public catalog for a branch must not include other branch's restricted areas/default.
12. Takeaway/pickup does not incur delivery fee and does not require an area selection.
### Delivery pricing contract documented — 2026-11-20

- Added `docs/architecture/delivery-pricing-contract.md` (commit `55b7e3350a5666f9eabf7cac31605c8446783899`). It is a detailed design/API contract; no Production SQL or live app code was changed.
- Delivery areas are named, branch-scoped records with their own explicit non-negative fee. No automatic distance bands or geolocation pricing are implied by the user's '0 to 500' example.
- Not Listed / Other is an explicit selection using a separate Admin-configured default. NULL/unset default blocks checkout; an explicitly saved zero is a legitimate zero fee.
- The database, not the browser/POS, must resolve and calculate the fee. Do not accept client-supplied fee amounts. A null area ID without explicit `selection_type = not_listed` must be rejected.
- Proposed typed configuration: `branch_delivery_settings` with one row per branch and nullable `not_listed_delivery_fee`, instead of a generic JSON setting. This is a recommendation in the design, not yet approved/applied SQL.
- Orders and delivery tasks preserve immutable delivery selection, area label and exact fee snapshots. Later Admin fee changes apply only to new orders.
- Current code audit: Admin already has area CRUD and a separate DefaultDeliveryFee setting, but the new-area form prefills zero. Website already has listed areas + Not Listed and blocks an unset default. POS already uses the default for explicit Not Listed but coerces missing area fees to zero and sends null area ID/display name rather than an explicit selection type. Catalog Edge Function queries areas without branch filtering and exposes DefaultDeliveryFee via general public settings allowlist. These are implementation gaps, not deployed Production changes.
- Added required acceptance tests for listed area fee, explicit zero, unknown/inactive/cross-branch ID rejection, Not Listed positive/zero/unset default, fake client fee, fee changes after order, branch catalog isolation and takeaway.
- Updated `docs/architecture/production-schema-blueprint.md` to link the detailed delivery contract (commit `add4f436214c1e1d529e790c75b16ffb0dbdeb9f`).
- The only user decision still open on this delivery flow is whether Not Listed should collect a separate locality/mohalla field; the full delivery address is already required. If not collected separately, the address snapshot still carries the destination information.
- Production remains read-only. No Supabase tables, rows, functions, settings, buckets, secrets or app deployments were changed.

### Cross-application/database contract map drafted — 2026-11-20

- Added `docs/architecture/database-application-contract-map.md` (commit `93ec46bcb3bd5ed658a046a80691ed9d18d09785`). It maps the four applications, four Edge Functions, database domains, current request/response contracts, required Production changes and unresolved decisions.
- Website: schemaVersion 2 catalog loader with version-aware cache; creates web orders using product/variant/deal IDs and area selection. Production catalog should return immutable published snapshots; delivery selection must be explicit.
- POS: schemaVersion 2, IndexedDB local catalog/order queues; only POS delivery orders are cloud-submitted in the current source, while takeaway and dine-in remain local. Cache refresh must be staged/versioned and atomic. POS realtime currently branch-filters orders/tasks but not offers/assignments; Production needs branch-specific event scope.
- Admin: direct PostgREST CRUD for catalog/deals/areas/settings; multiple requests for compound writes can leave partial data. Production needs transactional server-side catalog commands plus revision checks. Admin currently has basic product/deal/area forms but not full modifiers, deal editing, schedules or publication workflow.
- Rider: rider-specific Realtime subscriptions for offers and assignments by rider_user_id; retain own-job-only access.
- Catalog Edge Function: currently builds from mutable rows and treats active product/variant existence as published; queries delivery areas by restaurant without branch filtering; general public settings allowlist includes DefaultDeliveryFee. Production must read immutable published snapshot and branch-specific delivery pricing projection.
- Order Edge Function: rate limits website orders, verifies staff for non-website orders, calls order RPCs. Database command remains authoritative for prices, item eligibility, delivery fees, branch scope and idempotency.
- Delivery Edge Function: validates rider role/profile and routes presence, offers, push subscriptions and task lifecycle through service RPCs. Preserve strict rider/branch authorization.
- The map documents source observations and recommendations only. No Production schema, app code, deployed functions, Storage, Vercel config or live app was changed.
- At this earlier checkpoint, the ERD was still a proposal and publication/price role boundaries were unresolved. The offline POS stale-price decision has since been confirmed and the ERD/map/blueprint were updated.

### Production ERD and V1 table proposal drafted — 2026-11-20

- Added `docs/architecture/production-erd-v1.md` (commit `c09989ccff7ea6d5bfab98c15a8e155f7078d295`). This is a conceptual ERD/table proposal only, not SQL and not permission to apply DDL.
- Core domains: restaurants/branches and roles; categories/products/variants; modifier groups/options/variant pricing; deals/components/choice lists/schedules; immutable menu publications/current pointer/audit; branch-scoped delivery areas/default fee; orders/items/modifiers/components/payments/status history; delivery tasks/offers/assignments/rider profiles; private push/outbox/rate-limit records only where required.
- V1 order financial scope deliberately excludes GST/tax and focuses on item price, subtotal, delivery fee and total, plus existing payment fields required by POS.
- No ingredient inventory or unconfirmed optional operations tables are assumed. POS resources such as registers/tables/cash movements are included only where active app workflows require them.
- ERD uses branch-scoped delivery area/configuration, but restaurant-wide catalog products/prices initially. Branch-specific product pricing is not added unless confirmed as a V1 requirement.
- Proposed publication uses one JSONB immutable snapshot initially; no chunking until payload-size/performance tests justify it. Public catalog health must read the true publication pointer, not infer publication from active item count.
- Offline POS stale-order policy has since been explicitly approved by the owner: hold stale orders and require authenticated cashier/manager confirmation before repricing/resubmission. The ERD and blueprint have been updated; see the owner decision section below.
- Remaining schema decisions: Not Listed locality/mohalla field requirement; publish/price permission roles; deal choice pool rules; recurring schedule scope; whether branch-specific catalog pricing/availability is required; whether inventory is needed in V1.
- Production remains read-only. No DDL, seeds, app changes or deployments were made.
- Next: resolve only the decisions that materially affect table shape, then produce the field-level migration specification and test it on an isolated disposable Supabase project before requesting approval for Production DDL.

### Production default-privilege migration safeguard added — 2026-11-20

- Updated `docs/architecture/production-schema-blueprint.md` (commit `69ad4f83bb6e14b2d9745c6d7bccf9057268a306`) to record the exact implications of the already-applied Production hardening baseline.
- Because default privileges for postgres-created public tables, sequences and functions were revoked from PUBLIC, anon, authenticated and service_role, every future migration must explicitly enable RLS and explicitly grant only the permissions each intended role requires.
- Service-role Edge Functions will not be assumed to have object permissions automatically; table/schema/sequence access and function EXECUTE grants must be explicit and verified after each migration.
- Do not depend on rls_auto_enable to secure new tables; explicitly ENABLE ROW LEVEL SECURITY and verify it from PostgreSQL catalogs.
- Test both SQL grants and RLS using anon, authenticated role variants and service_role; server-side functions must still authorize actor, tenant and branch even when using service_role.

### Owner decision — offline POS stale-catalog orders require explicit confirmation — 2026-11-20

The user explicitly approved this policy:
- Every locally created offline POS delivery order must retain the catalog publication/version used when it was built.
- On reconnect, the server compares that version and the server-calculated price/availability with the current published catalog.
- If the version is stale and the charge/availability would change, the server must HOLD the order and return a stable conflict such as `CATALOG_VERSION_STALE`; it must not silently reprice or create a normal submitted order.
- POS keeps the local order and retry queue record, marks it `needs_confirmation`, and presents the old quote versus the current server quote.
- An authenticated cashier/manager must explicitly confirm the changed total before resubmission. Cancellation or editing remains available. The confirmed submission uses a new idempotency key tied to the confirmed request/version so the original failed/held attempt cannot be mistaken for a successful order.
- Record the actor, old/new publication versions, old/new totals and confirmation time in an audit event. Do not let an untrusted browser claim that a different user approved it.
- This is a confirmed owner policy, not merely a recommendation. Implement it in the POS local-order state machine, Order API contract and database order RPC in a coordinated schema-versioned change.
- Offline stale-price decision is no longer open. The ERD (`production-erd-v1.md`, updated commit `7bd7f870105024b78da0d43f5e3c90640b1d3be0`), schema blueprint (updated commit `cadf35831a65143eb23448fe9324cabfcf950a94`) and application contract map (updated commit `b8071be4c93774cdfd1e6f4cc12068346dcc2278`) now all reflect the user's explicit confirmation/hold requirement.
- The performance/security plan's latest verified content was corrected after official docs review; it explicitly avoids claiming an unsupported one-day log retention period and records the current Free-plan quotas, actual Production empty-schema status, and no-upgrade operational recommendations.

### Security, performance and Free-plan guidance reviewed — 2026-11-20

- Added `docs/architecture/performance-security-operations-plan.md` (commit `34a6255e214bf9a3958a31894af235b765fac21e`, subsequently corrected and expanded in commit `aaee2e0ad33ae7fcdcb4bc37f73fd609de5196d5`). This compares the user's pasted security/performance advice with current Flame Chick source and current official Supabase documentation.
- Useful guidance retained: RLS + grants; role/branch authorization; no secret/service_role in browser; server-side price/fee computation; isolated staging; encrypted DB and Storage backups; query-specific indexes; server-side pagination; bounded/filter Realtime; menu/media caching; responsive WebP images; redacted error telemetry.
- The generic index SQL from the conversation is NOT to be copied. Flame Chick uses `branch_id`, `placed_at`, task/offer/assignment relations rather than assuming `rider_id` on orders. Candidate composite/partial indexes must be checked with actual query plans and RLS filters.
- Workload context recorded: Free plan, approximately 100–150 orders/day, 3–4 months of live operational history, one POS, one Admin and 8–10 riders. Approximate order count is 9,000–18,000 over 90–120 days. This does not guarantee DB size; item/modifier/component/audit/index/snapshot overhead must be measured.
- Official Free quotas checked 2026-11-20: 500 MB database/project; 1 GB Storage; 5 GB uncached and 5 GB cached bandwidth; 500,000 Edge Function invocations; 2 million Realtime messages/month; 200 peak Realtime connections; 100 Realtime messages/second; 100 channel joins/second; up to 100 channels per connection. Free plan permits two projects across organizations where user is owner/admin; inactive projects may be paused after about 7 days of low user DB activity, with a 90-day restore window. Re-check limits before launch.
- Corrected an earlier unverified claim: this plan no longer asserts a fixed one-day log retention period. Verify current Dashboard log retention for the project and do not rely on Dashboard logs as durable audit history.
- Current source review: website has a version-aware localStorage catalog cache; POS stores catalog in IndexedDB and queues offline delivery orders; POS Realtime cleanup removes channels; Rider Realtime is rider-filtered and cleanup disconnects; Admin currently loads up to 1,000 orders at boot and should move to server-side pagination; POS Realtime does not branch-filter delivery_task_offers/assignments; POS catalog refresh currently clears live local stores before writing a new version; current catalog/order adapters coerce missing prices/fees to zero in places.
- Existing POS Realtime should be branch-filtered for offers/assignments. Keep one POS live channel while signed in and Rider channels only while rider is online/accepting jobs. Keep 15-second POS polling fallback; no broad Realtime for customer website or Order History.
- Current browser apps call Supabase Data API/PostgREST. The generic instruction to put these existing calls behind Supavisor is not applicable. Supavisor transaction mode is relevant only if future Edge Functions open direct PostgreSQL connections. Use direct connection for migrations/pg_dump where supported.
- Backups: Free plan has no automated downloadable daily DB backups. DB backup exports do not include Storage objects; back up Storage separately. Encrypted off-site DB+Storage exports and verified restore drills remain mandatory. A staging project consumes one of the two Free project slots; use an isolated project only after confirming capacity, or a local Supabase stack. Do not include Production customer PII in test data unnecessarily.
- Important RLS claim distinction: the archived Demo SQL enables RLS across its application tables and defines 108 policies, but also permits anonymous SELECT on a set of raw public catalog tables. This may be intentional for public catalog data, but it is broader than a narrow published-catalog API and must not be copied blindly. The Admin browser app directly performs PostgREST CRUD, so its protection depends on actual grants and row/role policies, not just frontend login.
- User's security statements (RLS, Supabase Auth and server-side pricing) are treated as context, not a substitute for verification. The live Production check below is the source of truth for the current Production project state.

### Live Production state rechecked — 2026-11-20 (read-only)

- Connected Supabase list still returns only the `Flame Chick Production` project, ref `adkrxfnawdiljhjaavnj`, organization `ydlbinhyoutdqueilxnd`, Mumbai `ap-south-1`, Free, status `ACTIVE_HEALTHY`, PostgreSQL `17.12.0.000`.
- Exactly one application migration remains recorded: `20261119125153_flame_chick_postgres_default_privileges_hardening`.
- Read-only list across all non-system schemas shows no application tables in `public` or `private`; `auth.users` is empty; `storage.buckets` is empty. Production has no deployed app Edge Functions at the previous function-list check.
- Supabase Security, Performance and Health advisors each returned zero lints. Since the application schema is not yet present, zero lints must not be represented as proof that the future application has been secured or optimized.
- The applied migration remains a default privilege hardening base only; new table RLS, grants, function execute rights and policies must be set explicitly in each future migration.
- No Production tables, rows, roles/users, buckets, functions, secrets, settings, project configuration or app deployments were changed during this audit.

### Security access matrix drafted — 2026-11-20

- Added `docs/architecture/security-access-matrix-v1.md` (commit `7dfece6b9f2770f340e2ff43a4390f04543c2f69`). It distinguishes public customer/guest, authenticated non-staff, owner, admin, manager, cashier, kitchen, rider and server-side service_role. It is a security design proposal, not RLS SQL.
- Key boundary: a valid Supabase authenticated session is not automatically a Flame Chick staff role. Business authorization must use an active controlled user_roles assignment and branch scope; never user-editable metadata.
- The owner subsequently confirmed the main role boundaries in a later section below: Admin and Owner full business access; Manager no Admin panel and no deletion rights; Cashier POS-only with rider assignment and order rejection; Rider portal-only with strict own-offer/assignment isolation. Do not use this earlier generic summary as the final matrix.
- Current-source findings: Admin allows owner/admin/manager; permanent deletes are limited to owner/admin; staff invitations and role activation changes are owner-only in the staff-admin function; order API accepts owner/admin/manager/cashier for staff order creation; kitchen can advance permitted preparation statuses; rider function provides own-job access. Production must formalize these in RLS + grants + server commands, not rely on UI buttons.
- The role access matrix is now updated with owner-confirmed Admin/Owner/Manager/Cashier/Rider boundaries. Remaining workflow clarifications are listed in `security-access-matrix-v1.md`; do not assume unconfirmed Manager POS or Cashier cancellation powers.
- The archived Demo SQL has RLS enabled across its application tables and 108 policies, but also has anonymous SELECT policies on raw public catalog tables. This is a source-level observation, not proof of a leak; Production should return an explicit public catalog projection and must not copy policies mechanically.

### Owner-confirmed role and permission policy — 2026-11-20

The user's role instructions are now the authoritative design requirements and have been incorporated into `docs/architecture/security-access-matrix-v1.md` (latest role matrix update commit `57ae617e35e3b65bc44a1089d6fc618c00a88ed8`). Do not revert to the older generic proposals above.

- **Admin (user's role) and Owner:** both receive full Flame Chick business access, including Admin panel and POS, menu/catalog, pricing, publishing, delivery fee configuration, staff administration, orders, dispatch and reports. They must remain distinct accounts so audit history identifies the actual person. “Full access” does not mean browser access to service-role secrets or Supabase credentials.
- **Manager:** must not enter the Admin panel and has no deletion capability. Manager has confirmed restricted POS access for branch operations, dispatch/reassignment and physical-return confirmation; see the owner decision below.
- **Cashier:** POS only. May process orders, assign/reassign riders and reject orders. May not hard-delete any order or other business record. Do not grant Admin panel, catalog management, staff management or system-settings powers.
- **Rider:** Rider portal only. May see/accept/decline only offers addressed to that rider and only their own active assignments. Must never see another rider's offers, assignments, customer details or private activity by changing a UUID or API request.
- **Order preservation:** do not hard-delete orders through ordinary application workflows. Rejection/cancellation/state changes update the order transactionally and append an immutable audit event with order ID, prior/new status, action, authenticated actor ID, role-at-time, server timestamp, mandatory reason where applicable and request/correlation ID. Preserve associated items, payment references, delivery history and audit events.
- **Cashier cancellation after order acceptance is not yet approved.** Until clarified, Cashier may reject a new/unaccepted incoming order but may not cancel an accepted/preparing/ready order. Admin and Owner retain full authority for audited rejection/cancellation.
- **Current implementation mismatch:** source audit found current Admin login allows `owner`, `admin` and `manager` into the Admin panel. That current behavior conflicts with the new policy. It must be changed in the Admin UI and, critically, denied by server-side APIs/database before the revised role model is released. Current source has not yet been changed for this role policy.
- **Rider lifecycle:** now owner-confirmed. Rider accepts/rejects own offer, records pickup/out-for-delivery, marks delivered (immediate order completion), or reports failed delivery and chooses return. Cashier or Manager confirms physical return. See `docs/architecture/delivery-lifecycle-contract.md`.
- **Kitchen role:** not yet confirmed for V1; do not automatically grant Kitchen broad POS access.

## 11. Implementation roadmap — continue in this order

### Stage 1 — Source hygiene and durable handoff (COMPLETE)

- Separate review branch created; source cleanup and handoff documentation committed.
- Main branch and original source repository remain unchanged.
- Static/build/runtime testing remains a known gap to complete before merge.

### Stage 2 — Production account and migration reconciliation (COMPLETE)

- Verified exact project `adkrxfnawdiljhjaavnj` in the separate Flamechic organization, Mumbai region, Free plan.
- Retrieved the exact applied migration `20261119125153_flame_chick_postgres_default_privileges_hardening` from live migration history and added its matching historical SQL file to the review branch.
- Never reapply that migration. Production still has no application schema, business data, users, Storage buckets or Edge Functions as of the last read-only inspection; recheck before any future DDL.

### Stage 3 — Schema design and security review (CURRENT)

- Continue from `docs/architecture/production-erd-v1.md`, `docs/architecture/production-schema-blueprint.md`, `docs/architecture/database-application-contract-map.md` and `docs/architecture/delivery-pricing-contract.md`.
- Resolve only decisions that materially affect table shape or server contract.
- Produce the field-level schema/migration specification, permission matrix and adversarial test plan.
- Keep Production read-only. Do not write or apply SQL yet.

### Stage 4 — Migration authoring and isolated validation (AFTER STAGE 3 APPROVAL)

- Author small ordered SQL migrations in the review branch; preserve the already-applied baseline file untouched.
- Test the complete migration chain on an isolated disposable Supabase project using the same PostgreSQL/Supabase feature set.
- Verify explicit grants required by the Production hardening baseline, RLS, composite tenant constraints, RPC EXECUTE grants, function security, indexes and advisors.
- Run negative tests as anon, authenticated users across roles/branches, and service_role. Do not treat service_role as a substitute for server-side actor authorization.
- Apply to Production only after the user separately approves the exact migration batch and exact project ref.

### Stage 5 — Edge Function configuration and security

- Review each function's authentication, authorization, tenant/branch scoping, input validation, CORS, error handling and secrets.
- Configure secrets only in verified Production. Deploy functions after schema readiness and specific approval.

### Stage 6 — Connect and test all four apps

- Connect website, POS, Admin and Rider to Production using browser-safe publishable keys only.
- Test authentication, catalog, Admin CRUD, publish/rollback, website checkout, POS online/offline delivery orders, dispatch, rider accept/reject, pickup, delivered, failure, return and role restrictions.
- Preserve catalog schema compatibility, targeted Realtime and the POS 15-second polling fallback.

### Stage 7 — Vercel previews and project wiring

- Connect four Vercel projects to the correct app root directories only after backend readiness.
- Use Preview deployments first. Resolve canonical POS/Admin/Rider domain assignments with the user before changing aliases or links.
- Keep the existing live customer website untouched until a separately approved cutover.

### Stage 8 — End-to-end verification and cutover

- Run full end-to-end tests, security checks, rollback rehearsal and backup restore test.
- Switch production traffic/domains only after a separate explicit cutover approval. Retain previous deployments/source as rollback.

## 12. Immediate next action

Stage 1 and Stage 2 are complete. Stage 3 (schema design/security review) is current. The key design artifacts are:

- `docs/architecture/production-erd-v1.md`
- `docs/architecture/production-schema-blueprint.md`
- `docs/architecture/database-application-contract-map.md`
- `docs/architecture/delivery-pricing-contract.md`
- `docs/architecture/security-access-matrix-v1.md`
- `docs/architecture/performance-security-operations-plan.md`
- `docs/architecture/menu-management-design.md`
- `docs/architecture/current-menu-baseline.md`

Next work: complete the field-level schema/column/index/constraint/RLS/grant specification using the confirmed delivery contract; then resolve remaining menu/deal/schedule/branch and Not Listed locality questions. Prepare migrations and isolated validation only after design review. The offline stale-catalog policy is resolved. No Production SQL, seeds, secrets, buckets, Functions or app deployments until the exact changes are reviewed and approved.

**New-chat instruction:** Read this file first, then read `production-erd-v1.md`, `production-schema-blueprint.md`, `production-field-level-schema-v1.md`, `source-schema-consistency-audit-v1.md`, `production-database-security-reliability-controls-v1.md`, `delivery-pricing-contract.md`, `delivery-lifecycle-contract.md`, `database-application-contract-map.md`, `security-access-matrix-v1.md`, `performance-security-operations-plan.md`, `menu-management-design.md`, and `current-menu-baseline.md`. Continue from Stage 3. Enforce owner-confirmed role boundaries: Admin and Owner full business access; Manager no Admin panel/no deletion; Cashier POS only with order processing, rider dispatch/reassignment, new-order rejection and narrow physical-return confirmation/no deletion; Rider portal only with own-offer/assignment isolation. Offline stale-catalog orders require explicit cashier/manager confirmation. Do not repeat the original repository/source audit or Production account/migration check unless the repo/project identity changes. Always update this handoff after meaningful work. Keep `main`, the original source repo and all live deployments unchanged until separate approvals.


### Owner decision — Manager restricted POS access confirmed — 2026-11-20

The user approved restricted Manager access to the POS application. This supersedes all earlier pending/awaiting-confirmation notes about whether Manager may enter POS.

**Manager may:**
- Sign into the POS application only; no Admin panel access.
- View and supervise branch operational orders and preparation/status.
- Oversee dispatch and assign/reassign riders.
- Confirm physical returned deliveries and record the return outcome/reason.
- View only the operational fields and branch-scoped history needed for these duties.

**Manager may not:**
- Access the Admin panel or its administration APIs.
- Manage categories, products, variants, modifiers, deals, menu publication or prices.
- Manage staff accounts/roles or invitations.
- Change delivery areas, listed fees, Not Listed default fee, or sensitive settings.
- Delete orders or records.
- Reject/cancel orders unless that authority is separately approved; deny by default for now.
- Access full payment reconciliation or unrelated rider/customer records.

**Other confirmed role boundaries remain:**
- Admin (the user) and Owner: equivalent full Flame Chick business access, with distinct identities and audit attribution.
- Cashier: POS only; process orders, assign/reassign riders, and reject newly received/unaccepted orders with an audit reason. Cannot delete orders. Cancellation of accepted/in-progress orders remains unapproved and denied by default.
- Rider: Rider portal only; may accept/reject only their own offers and update only their own assigned delivery. Must not view another rider's offers/assignments.
- No role, including Admin/Owner, physically deletes orders through normal business applications. Rejections, cancellations, corrections and returns are state transitions with append-only audit events.

**Return confirmation security contract:** Rider can report failed delivery/physical return; Manager confirms physical return. The confirmation must be a transactional, server-authorized command recording order/task, previous and new state, authenticated actor derived from verified JWT, actor role, server timestamp, reason/outcome and request/correlation ID. No client-supplied actor ID is trusted.

**Implementation implications:** POS route guards must admit Manager but expose only approved operational capabilities; Admin routes/APIs must reject Manager independently of UI; SQL grants, RLS, Edge Functions/RPCs and Realtime subscriptions must enforce branch scope and the same capability set. Add adversarial tests for Manager direct API/RPC calls, attempted catalog/staff/settings access, order deletion, cross-branch reads and unauthorized rejection/cancellation.

**Current Stage 3 next action:** finish field/status/API compatibility mapping against the source audit, complete RLS/grant and command-authorization matrix, and resolve remaining non-delivery decisions: rejection/failure reason requirements, Not Listed locality, publication/price authority, deal choices, schedule recurrence/branch scope, branch-specific menu needs, Kitchen/inventory scope and returned-order notification/payment treatment. Manager POS, Rider lifecycle and Website-only order quota are confirmed. Universal idempotency applies to Website and POS; POS is exempt from the customer website quota. No Production SQL or live app deployment is authorized.

## Owner decision — delivery lifecycle confirmed (2026-11-20)

The owner has now confirmed all five delivery lifecycle choices. This supersedes the earlier open delivery lifecycle questions in Section 13 and any earlier draft alternatives:

1. **Rider rejects an offer:** mark that offer rejected and return the task to the POS dispatch queue. Cashier or Manager manually assigns another rider. Do not auto-offer the next rider.
2. **Rider does not respond:** offer expires after exactly **60 seconds** from server-recorded creation and returns to POS for manual reassignment.
3. **Delivery fails:** the assigned Rider may report failure and choose to return the order. This only starts a return-pending-physical-confirmation state; it does not mean the restaurant has received the order.
4. **Delivery succeeds:** Rider marks delivered and the order completes immediately in the same transaction. No Cashier/Manager confirmation or OTP/photo proof is required in V1.
5. **Physical return confirmation:** either Cashier or Manager may confirm the returned order has physically arrived. The Rider cannot self-confirm receipt.

### Lifecycle design implications

- Keep order status and delivery-task status separate. A successful delivery is a delivered/completed order. A confirmed return is a distinct returned/failed terminal order outcome; never mark it delivered.
- Preserve each offer attempt (pending/accepted/rejected/expired), with server `offered_at` and `expires_at = offered_at + 60 seconds`. A rejection/expiry does not erase the offer; the next dispatch creates a new offer attempt.
- The database accept command must reject at or after `expires_at`, regardless of delayed background expiry processing. Use atomic row locking/conditional transitions so accept, reject and expiry cannot race into conflicting outcomes.
- Expiry processing is idempotent and updates the POS dispatch queue; missed Realtime events are recovered by POS normal fetch/15-second polling. Only the addressed Rider sees/responds to an offer.
- Rider acceptance atomically activates the single current assignment. Rider-only commands govern pickup, out-for-delivery, delivery success and failed-delivery/return intent.
- Return confirmation is a narrow POS command for Cashier or Manager, valid only after return is pending. It atomically closes the task and updates the order to returned/failed, appending immutable audit/history with task/order, prior/new states, verified JWT actor and role, server timestamp, reason/outcome and correlation ID. Duplicate confirmation must not duplicate effects.
- This specific Cashier permission does not confer Admin-panel access or general authority to cancel accepted/in-progress orders. Existing hard-delete prohibition remains for all roles.

### Updated design documents

- `docs/architecture/production-erd-v1.md`: lifecycle states, offer expiry, atomic acceptance, immediate delivered completion and return confirmation model.
- `docs/architecture/security-access-matrix-v1.md`: role capabilities; Cashier and Manager can confirm physical return, Rider cannot.
- `docs/architecture/database-application-contract-map.md`: event-to-application/database contract.

All are design-only updates on `work/production-source-audit`. No SQL migration was authored/applied, no Production schema/data/functions/settings changed, and no Vercel deployment or `main` branch change occurred.

### Next schema-design work

1. Reconcile the ERD's delivery-task, offer and assignment state model into a precise transition table, including order/task atomicity and event/audit payloads.
2. Specify exact offer-expiry execution: database-enforced 60-second acceptance cutoff plus idempotent expiry sweep/event delivery, without assuming a paid Supabase plan or depending on Realtime for correctness.
3. Complete the field-level table/column/constraint/index/RLS/grant specification and function contracts for delivery commands.
4. Finish the remaining business decisions that materially affect schema: cashier rejection reason requirement; Not Listed locality field; menu publish/price authority; deal choice model; schedule recurrence/branch scope; branch-specific menu needs; kitchen role/inventory needs. Preserve the already-confirmed decisions and do not reopen them.
5. Only after the schema specification is reviewed, create isolated test migrations. Production remains read-only until explicit approval.


## Delivery schema design checkpoint — 2026-11-20

- Added `docs/architecture/delivery-lifecycle-contract.md` (commit `5fa5392fba6968fc59996316b6c338a5c2b7f9d3`) as the field-level proposal for delivery tasks, immutable offer attempts, assignments, append-only delivery events, command authorization, transitions, expiry and adversarial tests.
- The conceptual ERD, schema blueprint and security matrix now link to/summarize that contract. The contract separates order state from task state; rider failure/return intent is not physical receipt; successful delivery completes the order immediately; confirmed physical return closes it as returned.
- Expiry correctness does not depend on a scheduler: accept checks database time against the exact 60-second deadline. A bounded idempotent expiry sweep on POS dispatch-queue fetch makes expired offers visible; optional scheduled processing is only an optimization and must be verified against the actual Free plan before use. POS polling remains the recovery path when Realtime is missed.
- No SQL migration has been authored or applied. Production remains read-only; no Vercel deployment, main branch, original source repo or live app was changed.

### Current next action

Complete the remaining field-level schema dependency matrix (tenant/branch identity, orders, order snapshots, delivery, publication, catalog and role/audit), then reconcile the outstanding business decisions: rejection/failure reason requirements; Not Listed locality field; publication/price authority; deal choice model; schedule recurrence and branch scope; branch-specific menu requirements; Kitchen role/inventory needs; returned-order notification/payment treatment. Do not reopen the five confirmed delivery lifecycle decisions or the confirmed role/offline-order policies. Once the schema spec is internally consistent, present it for review before authoring isolated test migrations. Production DDL still requires separate explicit approval.

### Schema consistency pass — 2026-11-20

- Added the detailed delivery lifecycle specification: `docs/architecture/delivery-lifecycle-contract.md`, commit `5fa5392fba6968fc59996316b6c338a5c2b7f9d3`.
- Linked the delivery contract from the Production ERD (commit `782b9d20ab458279133fd25e41027c43df817d15`). Updated the schema blueprint to mark the lifecycle confirmed (commit `cac6c3ce0b755e062104734d0456aec345d3a581`) and the security matrix with the narrow Cashier/Manager return-confirmation permission (commit `8195c32e36d5d46ce39834bce8b2c331f63c99ef`).
- Corrected superseded open-decision wording: Manager restricted POS access, Rider lifecycle and offline stale-catalog policy are confirmed, not pending. Relevant consistency commits: `4f41085bd82805f7708708250cbcef0bb2cdefee` (security matrix), `4a8a02571a4b9feb4d1805656cf72ec0181c7e43` (schema blueprint), `d655088af126a97de5d81ab44955297b7907c4a1` (ERD), and `a556e0c5a0fb1666f9db58362ab093f845d93a97` (handoff next action).
- No Production SQL, database, Supabase settings, Edge Functions, Storage, users, Vercel deployment, `main`, or original source repository was changed.

## Field-level schema + Free-plan security checkpoint — 2026-11-20

### New canonical design document

- Added `docs/architecture/production-field-level-schema-v1.md` on `work/production-source-audit`.
- File creation commit: `b7dd21ff4fd96940fd3440464c32a512bc62a3c7`.
- Verified the saved file exists, has all 21 expected sections, includes rate-limiting and Edge Function budget guidance, and contains no SQL DDL statements. Latest verified file blob SHA at verification: `19b979d77075987f62e3a7929b3ca9e3ccbc0025`.
- It defines candidate fields/types/constraints for tenant/branch, staff roles, catalog, modifiers, deals/schedules, immutable menu publications, delivery pricing, orders and snapshots, payments (without inventing a payment gateway), delivery tasks/offers/assignments/events, internal notification outbox, private rate-limit buckets, RLS/grants, indexes, migration order and tests.
- It deliberately leaves unresolved business decisions marked open; it does not seed menu data or infer GST/inventory/payment refund rules.

### Supporting documents updated

- `docs/architecture/production-erd-v1.md` — links to the field-level schema. Commit `0b4e0696823e56ac409a05d562143346528c2e35`.
- `docs/architecture/production-schema-blueprint.md` — adds Free-plan and rate-limit implications. Commit `9def86b47face3ab7fec2587aee13bf5551ae27e`.
- `docs/architecture/database-application-contract-map.md` — records function/read path budget. Commit `3fc860aba51c516423e1c96a69900280bb47644a`.
- `docs/architecture/performance-security-operations-plan.md` — records current invocation limits, rate-limit proposal, usage thresholds and official references. Commit `39472371c485ade276d11ddd668df68abac69c5a`.

### Free-plan / Edge Function design decisions

- Retain the four existing domain functions: catalog, order, delivery and staff-admin. No function-per-CRUD, no function chaining, no extra worker for V1.
- Current official Free allowance checked 2026-11-20: 500,000 Edge Function invocations/month; function count ceiling 100/project; 256 MB memory; 2 seconds CPU/request; 150 seconds worker wall clock. Invocation allowance is shared at organization usage level, so inspect usage by project. A function 401/403/429/500 still counts; CORS preflight OPTIONS is not billed.
- High-frequency POS 15-second polling and safe Rider reads should use RLS-protected Data API reads, not Edge invocations. Rider gets own-offer/assignment filtering; POS Realtime stays branch-filtered. Order History remains normal paginated fetch/manual refresh.
- Cache immutable published catalog by version/checksum. Coordinate any combined health+catalog response with an API schema-version change; preserve last-known-good POS IndexedDB cache until new cache is fully staged and atomically switched.
- Retain Supabase Auth native rate limits. The owner-approved customer phone quota is Website-only (source=website): 3 committed orders per rolling minute, 3 per rolling 10 minutes, 15 per rolling hour. POS is explicitly exempt, including POS delivery. Universal idempotency remains required for Website and POS. Any additional Rider/dispatch/staff rate limits remain test proposals, not approved Production policies. Use private HMAC subject digests where applicable; do not store raw IP/phone/email. Do not add Redis/Upstash or continuous workers at current scale.
- Candidate test thresholds for non-order actions only (not Production enforcement): Rider 20 actions/min; staff dispatch 30/min; staff invitations 5/hour. Customer website-order caps are separately owner-approved as 3/rolling minute, 3/rolling 10 minutes and 15/rolling hour per normalized phone. This supersedes earlier generic guest-order thresholds.
- Validate actual trusted client-IP header at Supabase ingress with spoofed forwarding-header tests before relying on IP rate buckets. If trust cannot be established, don't claim IP rate limiting works; use actor/phone limits and consider verified Turnstile step-up after evidence. Application 429 does not save function invocation quota; sustained volumetric abuse needs upstream/platform mitigation.
- Warning thresholds: 50%/250k invocations investigate; 70%/350k optimize; 85%/425k prepare degradation response; 95%/475k stop nonessential calls while protecting essential order/delivery writes. These are internal manual thresholds, not platform alerts.

### Safety / state

- Documentation-only changes on the review branch. No Production SQL, schema, data, secrets, Supabase settings, Auth users, Storage, Edge Functions, Vercel deployment, `main`, or original source repo was changed.
- No migration file has been created or applied. Production remains read-only.

### Next work (in order)

1. Conduct a consistency review of the new field-level specification against the current four application source contracts and existing schema/ERD. Fix any mismatched fields, enum/status values, request/response payloads or permission assumptions before writing SQL.
2. Resolve the remaining owner decisions: rejection/failure reason requirements; Not Listed locality label; menu price/publish/rollback authority; deal choice model; schedule recurrence/branch scope; branch-specific menu/pricing needs; Kitchen/inventory needs; returned-order payment/customer-notification treatment; Rider arrival event.
3. Produce the complete RLS/grant/function authorization matrix and adversarial test matrix from the field-level spec.
4. Review the schema with the owner. Only then create isolated test migrations. Check project slot availability; use local Supabase if no safe Free test project slot exists.
5. Production remains read-only until the user explicitly approves a specific reviewed migration batch.

## Source/schema audit and owner correction — website-only quota — 2026-11-20

### Correct customer order limit scope

The owner clarified that the three customer phone limits apply **only to customer website checkout**:
- 3 committed website orders per rolling minute.
- 3 committed website orders per rolling 10 minutes.
- 15 committed website orders per rolling hour.
- Keyed by server-normalized customer phone with server-side HMAC digest.
- POS orders are exempt, including POS delivery orders that use the shared Order API. Authenticated staff-entered phone/WhatsApp/manual/third-party sources are also exempt.
- Do not rate-limit POS by customer phone. The Website quota branch is invoked only for a server-verified source=website route.
- Count only successful new website orders that commit. Exact idempotent replay is free; later restaurant reject/cancel does not refund a committed order slot; invalid/rolled-back attempts do not consume it.
- This is per phone number entered, not verified human identity; no OTP/SMS requirement is being added.

### Universal idempotency is separate and applies to Website + POS

- Website retains its stable pending idempotency key and payload in sessionStorage until confirmed success.
- POS retains its stable idempotency key derived from localOrderId across network retry, page/device restart and offline resubmission.
- Both sources use server-generated canonical request fingerprints and unique database scope (restaurant, branch, source, idempotency_key).
- Exact same key + same canonical payload returns the existing order without duplicate order items, task, payment, status event or notification. Same key + changed payload returns HTTP 409.
- Retry after timeout reuses the same key; clients do not create a new key merely because the response was lost.
- Command IDs/deduplication also required for retryable status, dispatch, Rider, return, staff and catalog mutations. Notifications use unique transactional outbox keys.
- POS remains exempt from the website phone quota while retaining all idempotency, authorization, transactional and price-validation controls.

### Source/schema consistency audit

- Added [source-schema-consistency-audit-v1.md](docs/architecture/source-schema-consistency-audit-v1.md). Latest audit correction commit: 5cd9f953d8dec540b41e12c8c43900ec9a11cb90.
- Created [production-database-security-reliability-controls-v1.md](docs/architecture/production-database-security-reliability-controls-v1.md). Commit: a9ad95d50ce900ba6eb165a3fd1608333f62eb56.
- Updated [production-field-level-schema-v1.md](docs/architecture/production-field-level-schema-v1.md). Latest idempotency/quota scope commit: a4fbf4350748678e93000feee019015d8497e80b.
- Updated [performance-security-operations-plan.md](docs/architecture/performance-security-operations-plan.md). Latest quota clarification commit: f986d4b5d014a93baa197f9b75158e2f1ec7b3d5.
- Updated [database-application-contract-map.md](docs/architecture/database-application-contract-map.md). Website-only scope and reliability link commit: a91ed837e0231187eeffdf4dd4e2ebd21860fdb0.

### Security/reliability items added to the design

- Universal order idempotency: stable source-scoped keys, server canonical fingerprints, database uniqueness, transaction locks, exact replay behavior, 409 on changed payload, concurrency/ambiguous-timeout tests.
- Command idempotency for status, dispatch, Rider, return, staff, publish/rollback and payments/webhooks when implemented.
- RLS default-deny for every public app table, verified branch/tenant checks, Rider own-resource isolation, Manager Admin denial, explicit SECURITY DEFINER hardening, and explicit service_role grants after existing default-privilege revocation.
- Immutable order/item/fee/catalog snapshots; append-only status/delivery/staff audit events; no normal-app hard deletion.
- Atomic multi-row order/dispatch/return/publish commands; DB row locks and database time for transition rules.
- Transactional notification outbox with uniqueness and bounded retry; notification failure cannot roll back a committed order/delivery event.
- Bounded retry/backoff, stable offline POS localOrderId, preserve queue until server confirmation, and last-known-good catalog cache with atomic switch.
- Server-side money calculation, delivery area/default fee validation, idempotency and catalog-version checks; no client-supplied authority.
- Encrypted off-project DB and Storage backups, restore tests, additive expand/migrate/contract migrations, and security/concurrency/recovery verification gates.
- Free-plan-conscious read paths, pagination, focused indexes, narrow Realtime and four-function architecture.

### Safety and current implementation status

These are design and documentation updates only. The source audit was read-only; no application code was modified. No Production SQL/schema/data, Auth users, settings/secrets, Edge Functions, Storage, Vercel, main branch or original source repository was changed. No website quota is active yet. No universal idempotency hardening has been deployed yet; the existing source already has client order keys and an order idempotency mechanism, but the stronger canonical fingerprint, transaction-safe all-source verification and command-level idempotency remain implementation requirements. Production remains read-only.

### Next actions

1. Resolve exact application schema names/status mappings and introduce versioned DTO adapters rather than blindly renaming fields.
2. Complete the exact RLS/grant/function execution matrix and test cases against the security access matrix.
3. Define the service-only atomic order RPC: universal idempotency for Website and POS; website-only HMAC phone quota; POS bypass.
4. Finalize remaining menu/deal/schedule/branch/locality/return-payment decisions.
5. Only after owner schema review, create isolated test migrations and test against local Supabase or a verified safe test project. Production requires explicit separate approval.

## RLS, grants and Edge Function authorization matrix — 2026-11-20

- Added [production-rls-grant-function-matrix-v1.md](docs/architecture/production-rls-grant-function-matrix-v1.md), initial commit 3d7b43707f80d26c7ba763a3a2eadd809863dd5a; Manager permission corrections commits 589dd1273b3b5e3fb21b429e5173550165869888 and final Cashier-only POS order-create boundary b67356f390c539d047b81756375384405e1952ae.
- It maps public roles, all schema table groups, direct Data API grants, private service-only tables, four Edge Function action gates, RLS policy rules and adversarial verification.
- It explicitly grants full Admin + Owner business authority, denies Manager Admin API and general cashier order-processing rights, allows Manager approved branch operational monitoring/dispatch/reassignment/return confirmation, and keeps Cashier order processing/new-order rejection/dispatch/return confirmation without deletion.
- Website public order creation is the only phone-quota path. POS, including POS delivery, bypasses that quota but still uses universal order idempotency, verified staff/branch checks, server-side prices/fees and database transactions.
- Source mismatches remain documented, including the current Admin UI Manager route guard, staff-admin Owner-only behavior that must align with Admin + Owner authority, source DTO field/status differences, direct Admin REST multi-request writes and Rider return wording. No source code was changed by the audit.

### Next design/implementation gate

Finish field/status compatibility and decide the remaining business details. Then prepare a migration-specific RLS/grant inventory and SQL only for an isolated test database. No Production SQL, RLS, grants, Edge Function changes or deployments are authorized yet.


## 2026-11-20 — Customer website security threat model added

User clarified that security review must not blindly enforce only previously stated preferences or ignore additional risks. Treat security as a system-wide, defense-in-depth objective: the owner's requirements are constraints and business decisions, not a complete threat model. Independently identify threats, make security recommendations, explain trade-offs, and verify controls before claiming the website is secure. No "fully secure" guarantee.

New canonical document:
- \`docs/architecture/website-security-threat-model-v1.md\`

This document establishes a customer-website threat model covering assets and trust boundaries; public API validation; secret leakage; broken access control/IDOR; source and role spoofing; server-side price/fee validation; replay/idempotency; bot/volumetric abuse; SQL/HTML injection and XSS; CSRF/CORS; order enumeration; PII/log leakage; Storage abuse; webhook replay (future); dependency/deployment risks; database resource exhaustion; availability/backup/restore; audit integrity; security headers/CSP; release gates and tests.

Important distinctions:
- Existing owner-approved website-only quotas remain 3/minute, 3/10 minutes, 15/hour per normalized submitted phone; POS remains exempt. These controls do not prevent Edge Function invocation exhaustion or verify phone ownership.
- Evaluate trustworthy IP signals carefully; do not trust client-supplied X-Forwarded-For. Consider managed challenge only if measured abuse justifies friction/dependency/cost.
- Public site should expose published catalog only, never raw customer orders or order history. Any future customer tracking endpoint requires separate high-entropy expiring capability design.
- All prices, discounts, delivery fees, availability and state transitions must be computed/validated server-side. No browser-supplied actor, role, branch or source authority.
- Add/verify CSP, HSTS (after domain/HTTPS checks), nosniff, Referrer-Policy, Permissions-Policy, frame policy, exact CORS allowlists, cache isolation and source-map hygiene.
- Audit third-party scripts, dependencies, secrets, build artifacts, Git/Vercel permissions and deployed headers.
- No Redis/Upstash/OTP/SMS/WAF/Turnstile or other paid/dependency addition is assumed; assess cost and evidence first.
- Threat model is design only, not evidence the controls currently exist. Actual live headers, dependency/XSS audit, route security tests, isolated implementation and release testing remain outstanding.
- No live application, Production database, Supabase function/Storage policy/secret, Vercel setting, header, domain or deployment was changed. Work remains confined to documentation on \`work/production-source-audit\`.

Next recommended work: perform a focused source-level review of the customer website and public Order API for XSS sinks, unsafe DOM rendering, third-party scripts, exposed config/secrets, PII leakage, CORS/input/body bounds and cache behavior; then inspect deployed response headers and build artifacts. Keep Production read-only and do not implement or deploy changes without explicit approval.

## 2026-11-20 — Website security audit deferred until database integration

The owner explicitly deferred the detailed customer-website audit. Do not spend the current work stage auditing or modifying website code. Continue the Production database design and validation work first: schema consistency, field/status/API mapping, RLS/grants/function authorization, transactional commands, idempotency, auditability, migration safety and adversarial/recovery tests.

**Mandatory integration-stage gate:** When the project is ready to connect/attach the customer website to the database (or enable its live database-backed ordering path), remind the owner and stop before integration. Perform the full website security audit from `docs/architecture/website-security-threat-model-v1.md`, including website source, public Order API, deployed headers/build artifacts and end-to-end authorization/input/cache tests. Do not silently skip this gate, and do not claim website security based on the threat-model document alone. No website audit or code changes are authorized in the current database-focused stage.

**Current next work:** continue the database-only consistency pass: reconcile actual application DTOs and status/field names with the proposed schema using versioned adapters; identify exact command boundaries and transaction invariants; then finish the RLS/grant/function matrix and executable adversarial test plan. Resolve only business choices that materially affect schema shape. After design review, prepare isolated test migrations; Production remains read-only and requires separate explicit approval.

## 2026-11-20 — Database-first continuation and authority consistency correction

- The owner reiterated: defer the website audit until the website is being attached/connected to the database. The integration-stage security audit is a mandatory stop-gate; do not audit or modify website code during the current database-focused stage. This reminder is recorded here for future chats; no calendar date was specified because the trigger is a project milestone.
- Continue database work now: schema/DTO consistency, tenant and branch integrity, transactional command boundaries, RLS/grants/function authorization, idempotency, audit invariants, and isolated adversarial/recovery tests.
- During a targeted consistency read, found one stale sentence in `production-field-level-schema-v1.md` that still said to preserve Owner-only staff role assignment. This contradicted the owner's explicit Admin + Owner full-business-authority model and the RLS matrix. Corrected it: both Admin and Owner can invite, assign/change roles and branches, and deactivate staff; all actions remain transactionally audited and guarded against self-escalation and removal of the last active Owner. Manager/Cashier/Rider remain barred from staff administration.
- Schema correction commit: `a67ce86245d92cd4f5f7882f5166721204974637`.
- Handoff reminder/gate commit: `53adbe2baf140e91c98ec1fd01b0f8e92f9c901e`.
- No website audit/code change, application code change, SQL migration, Production DDL/data/settings change, Edge Function deployment, Storage change, Vercel deployment, `main` change or original-repository change was made.

**Next database-only action:** continue targeted cross-document consistency review, starting with staff-role and tenant/branch constraints, then catalog publication/version integrity and order/delivery transaction boundaries. Record each correction in the canonical design docs and this handoff. Do not begin migrations until the schema and authorization contracts are internally consistent and reviewed; any test migration must be isolated from Production.

## 2026-11-20 — Database integrity review progress

Continued database-only review as requested. Re-read the canonical handoff, field-level schema, ERD, delivery lifecycle contract, application/database contract map and RLS/function matrix before making targeted edits. No broad source rescan and no website audit were performed.

### Changes committed on `work/production-source-audit`
- `d66a26236696a281a54443d763e58600296fb4df`: aligned the contract map's staff-admin target with Admin + Owner authority and explicitly recorded unresolved branch-specific catalog/pricing scope.
- `7b97e79f96b208bfea2be38d78d5c28cccca068b`: strengthened field-level schema with Admin/Owner catalog publish authority, atomic publication pointer/revision requirements, trusted canonical snapshot checksum, strict listed-area/Not-Listed consistency, and bounded/versioned server-side idempotency fingerprint requirements.
- `8fb9b2f643be497180f202a32c1fdfc9ace8d92b`: serialized last-active-Owner protection with a restaurant-level staff-authority lock to prevent concurrent demotion/deactivation races.
- `db4410242ffe1d55d5caaa4aa49999788be0e234`: documented staff invitations as a recoverable idempotent workflow across Supabase Auth and PostgreSQL; no false claim of one cross-system ACID transaction.
- `d6e93fc37d64a415de17ec97b56597c2e46c4010`: prevented anonymous website idempotency replay from becoming an order-data disclosure/lookup mechanism.
- `84a1c2d74c27b6cfd9740e7a6ceb18f133a5b71c`: added `docs/architecture/database-integrity-review-v1.md` with tenant/branch invariants, catalog/order/delivery/staff transaction rules, adversarial tests and schema-freeze blockers.

### Key findings / blockers before schema freeze
1. Define how the public website resolves exactly one branch; never trust arbitrary browser branch IDs.
2. Decide whether menu/prices/availability are restaurant-wide or branch/channel-specific; current proposal has restaurant-level publication pointer but branch-level delivery pricing.
3. Confirm deal choice structure, Not Listed locality input, returned-order payment/notification behavior, arrival event, POS local-only order scope and staff role multiplicity.
4. Validate that every composite FK, RLS predicate, grant, SECURITY DEFINER execution grant, command transaction and audit/outbox effect is represented in executable migration tests.

### Next database work
- Continue targeted contract review for role multiplicity, branch resolution and catalog publication scope.
- Reconcile decisions that alter key structure before schema freeze.
- Then create a clean migration plan and test only on a verified isolated database. Production remains read-only and requires separate explicit approval.

### Safety / deferred website audit
The customer website security audit remains deferred until the website is about to be attached to the database. At that milestone, stop and run the complete website threat-model audit before integration. No website source was audited or changed in this step. No SQL/migration, Production schema/data/Auth/settings, Edge Function deployment, Storage, Vercel, `main`, or original repository was changed.

## 2026-11-20 — Customer drop-off pin scope clarified

Owner clarified that Flame Chick will **not** collect Rider live location and does **not** want continuous customer location tracking. The earlier customer live-location draft was therefore superseded.

### Approved future feature
- Customer may optionally provide one fixed delivery destination pin: either one-time device coordinate (with browser permission) or manually placed map pin.
- Written delivery address remains required; pin is optional and declining location permission never blocks checkout.
- Assigned Rider and authorized POS staff may view that fixed pin and open a Google Maps directions link generated by the server/app from validated latitude/longitude.
- Store at most one current pin per delivery order in private `app_private`, bound by composite tenant/branch/order/task keys. No arbitrary customer-supplied maps URL.
- Rider can read only their own current active assignment; POS access is role/branch-scoped. Reassignment immediately removes previous Rider access.
- No Rider GPS, continuous customer GPS, location sessions, update streams, movement history, background tracking, location polling, location Realtime channel, geofencing or route tracking.
- Proposed precise-coordinate retention is 24 hours after terminal delivery state; confirm operational/legal need before implementation.

### Documentation
- New canonical design: `docs/architecture/customer-dropoff-pin-data-contract-v1.md` — commit `97188d00922ea0ad2cf1985f5ecb4a5bebfd0bb6`.
- V1 product decisions updated with the static drop-off pin rule — commit `343ed113b4d8f16441dbe8dbbfebcfc218316555`.
- The previous `docs/architecture/customer-live-location-data-contract-v1.md` is an obsolete draft. Do not implement it; the new static drop-off pin contract supersedes it. If possible, rename/archive it in a later docs hygiene pass; no live tracking design should remain normative.

No application code, SQL/migrations, Production schema/data/settings, Edge Functions, Realtime, Vercel, `main`, or original source repository was changed. Website security audit remains deferred until immediately before website/database integration and is a mandatory stop-gate.

**Next database action:** incorporate the static drop-off location row and narrow Rider/POS read permissions into the canonical ERD and RLS/function matrix. Do not add any live tracking or location-stream structures. Continue documentation/test design first; Production remains read-only.


## 2026-11-20 — Static customer drop-off pin integrated into database design

Completed the next database-only step for the owner-approved one-time customer delivery pin. Re-read the handoff and canonical schema, ERD, RLS matrix, integrity review, product decisions and drop-off pin contract before editing. No website audit was performed.

### Exact approved feature
- Customer may optionally share one fixed delivery destination pin using one-time device coordinates or a manually placed map pin.
- Written delivery address remains required; skipping the pin or denying GPS permission must not block checkout.
- The assigned Rider and authorized POS staff can retrieve the same point and open Google Maps directions generated from validated coordinates.
- No Rider GPS/live location, no continuous customer tracking, no location update streams, no movement history, no geofencing, no location Realtime, no polling, no background tracking.
- Coordinates are private and bound to the exact restaurant, branch, order and delivery task. At most one current pin per delivery.
- Rider can read only their current active assignment; reassignment removes the previous Rider's access. POS Manager/Cashier access is branch-scoped; Admin/Owner access follows restaurant-wide business authority.
- Public clients cannot read private coordinates. Optional pin writes are part of the existing validated website order transaction; no direct table write or separate location endpoint.
- Google Maps URL is generated from validated coordinates; arbitrary customer-provided URLs are never persisted/opened.
- Proposed precise-coordinate retention is 24 hours after terminal delivery outcome; confirm support/legal needs before implementation.

### Documentation updated
- docs/architecture/customer-dropoff-pin-erd-authorization-addendum-v1.md — commit d9625236ece0110e8647e9e767502dd57ec6d780.
- docs/architecture/production-erd-v1.md — ERD relationship extension, commit 3d4bbd259865faa9b74afc765db1b118ef7b13ee.
- docs/architecture/production-field-level-schema-v1.md — private table/constraints/transaction/retention, commit 7b8ed35fb05314efcc5b5512fcf5d024d2aa29a9.
- docs/architecture/production-rls-grant-function-matrix-v1.md — no direct grants; narrow Rider/POS read rules, commit 23e4ab00c45b8ddb6434ffa3c0260555965f6212.
- docs/architecture/database-integrity-review-v1.md — integrity invariants and adversarial tests, commit fc3dd7affa88430ea1255d8e84e3e48f97420e20.
- docs/architecture/customer-live-location-data-contract-v1.md — explicitly marked OBSOLETE / DO NOT IMPLEMENT, commit 668b746718bb369d217d17820daab92eb15dde0f. Use only the static drop-off pin docs as normative.
- This handoff entry records the integration.

### Remaining design checks
- Confirm whether Admin/Owner can access pin after terminal state for customer support; default is no Rider access and operational POS access ends with terminal task.
- Confirm 24-hour coordinate retention against actual support/legal requirements before migration.
- During SQL design, ensure matching composite unique keys exist on orders/tasks to support tenant/branch/order/task foreign keys without weakening isolation.
- Add precise pin only to the authorized Rider/branch POS delivery-detail projection; verify existing Delivery API DTO does not accidentally return customer coordinates to any other role.
- Website security audit remains a mandatory stop-gate immediately before attaching website to database.

No application source, SQL migration, Production schema/data/Auth/settings, Edge Function, Realtime publication, Storage, Vercel, main, or original source repository was changed. Production remains read-only.

**Next database-only step:** complete a cross-document consistency check for the static pin design and then proceed with the wider migration-readiness/test plan. Do not implement continuous location tracking.



## 2026-11-20 — Database V1 consistency and migration-readiness review

Completed a database-only consistency pass across the canonical field-level schema, ERD, RLS/function matrix, product decisions, delivery lifecycle/pricing contracts, integrity review and existing handoff.

### Resolved design now reflected in schema/ERD/RLS
- Website branch resolution: one eligible branch auto-resolves; multiple eligible branches require customer choice; zero fail closed; branch ID is revalidated server-side.
- Restaurant-wide products/deals/base prices with branch-specific variant/deal availability and delivery pricing. Orders bind publication version and branch availability revision. No branch price override in V1.
- One role identity per user per restaurant. Manager/Cashier/Rider may hold same role in multiple branches; Admin/Owner is restaurant-wide and exclusive. Same-role-across-branches requires serialized command + database guard; partial unique index alone is insufficient. Last active Owner protected under restaurant lock.
- Curated deal choices only, explicit non-negative surcharge, no category pools/free-text substitutions; ambiguous variant resolution rejected.
- Returned order settlement: COD not collected -> closed-uncollected/no refund; actual collection immutable; refund is a separate append-only ledger entry only after payout, Admin/Owner only, idempotent and locked against over-refund.
- Optional fixed customer drop-off pin only; no Rider GPS or continuous customer tracking.

### Documents updated
- `docs/architecture/production-field-level-schema-v1.md` — branch capabilities, role identity/consistency, branch availability overlays/revision, payment collection/refund ledger and remaining open holds. Latest commit `3c8c0e362da3b4a67d10d619dc926585b5e08590`.
- `docs/architecture/production-erd-v1.md` — resolved decisions and remaining true open questions. Commit `3d85728c3731cf2cf00c6c3ca47408d97476ef60`.
- `docs/architecture/production-rls-grant-function-matrix-v1.md` — role/branch invariants, branch availability and payment/drop-off access controls. Commit `74e27f33c98abd678d57c5f13a680a3bf1905ffd`.
- `docs/architecture/database-integrity-review-v1.md` — reconciled resolved decisions, blockers and new concurrency/privacy tests. Commit `fe8df898cfb4bdca6dd164ece69d54673f5e2a65`.
- New `docs/architecture/database-v1-migration-readiness-review.md` — consolidated security baseline, migration sequence, engineering blockers, test plan and Production boundary. Commit `9a1a1d4069f011df2950fb3964e577cc2c3bbc05`.

### Remaining genuine holds
1. Not Listed locality/mohalla label in addition to full address.
2. Deal schedule recurrence/overnight/timezone/overlap/branch semantics.
3. Kitchen role approval and exact access (deny by default).
4. Ingredient inventory (excluded unless approved).
5. Rider arrival-at-restaurant as separate event vs pickup next.
6. Drop-off pin retention (proposed 24 hours after terminal state) and exceptional Admin/Owner access after terminal state.
7. Exact legacy source/status/fulfillment/payment DTO mapping and API versioning.
8. Website security audit remains intentionally deferred, mandatory immediately before website/database integration.

### Migration-readiness outcome
The design is ready for the next **controlled DDL specification and isolated migration prototype**, not Production. Next begin with read-only verification of the already-applied baseline, then write exact SQL for private schema/privilege rules, tenant/branch keys and identity/role foundation. First confirm an isolated local/test database; do not use Production for tests. Verify backup/restore of both PostgreSQL and Storage. Production remains read-only and every Production change requires separate explicit approval.

No SQL migration was created or applied. No app source, Edge Function, Auth, Storage, Realtime, Vercel, main or original source repository was changed.



## 2026-11-20 — Batch 0 read-only Production baseline verified

After the migration-readiness review, performed read-only verification against Flame Chick Production project ref `adkrxfnawdiljhjaavnj`.

Verified:
- Project ACTIVE_HEALTHY; PostgreSQL 17.12.0; Mumbai ap-south-1.
- Exactly one application migration: `20261119125153 flame_chick_postgres_default_privileges_hardening`. Never reapply.
- No application base tables in `public`; `app_private` schema does not exist yet.
- No app tables published to Realtime.
- Only public routine is `public.rls_auto_enable()`; its current EXECUTE ACL is postgres only.
- Security, performance and health advisors each returned zero lints during this read-only check.
- Extensions observed: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.
- Public schema USAGE exists for anon/authenticated/service_role; this is not itself table DML access.

**Important residual risk confirmed:** pg_default_acl still has broad anon/authenticated/service_role defaults for objects created by internal role `supabase_admin` in public. The applied hardening has removed application-role defaults for objects created by normal `postgres`, but does not remove the internal `supabase_admin` defaults. No application tables currently exist, so no application data exposure was observed. Before first migration, prove migration sessions create application objects as `postgres`; verify object owner, ACL and RLS on every created object. Never create Flame Chick application objects as `supabase_admin`. Do not try to alter Supabase-managed internal defaults without a supported approved route.

Read-only queries and advisors only. No SQL writes, migrations, Production settings, app source, functions, Auth, Storage, Realtime, Vercel or deployments changed.

### Current readiness status
- Database V1 business decisions reconciled.
- Migration-readiness review written.
- Batch 0 read-only baseline verified.
- Production remains read-only; zero advisor lints are not proof of future schema security.
- Next: prepare the exact DDL/constraint/index/trigger/function/grant specification for private schema, tenant/branch foundation and role identity. Before isolated testing, confirm the local/test environment and verify migration execution role. No Production SQL without separate explicit approval.



### Follow-up consistency corrections and latest verification

- Application/database contract map updated to remove resolved business questions from its open list and align branch catalog/role/payment decisions — commit `bf5e50e6299cb865d83ddb648ade8fc7e8bf3398`.
- Field-level schema restored explicit cross-links/reminders for the website-only quota, universal Website/POS idempotency and static drop-off pin after the V1 open-decision section — commit `f9f717046dd02cfc9f00010f8ac85f11ca8202fc`.
- Migration-readiness report appended with actual Batch 0 read-only Production findings and the internal `supabase_admin` default-ACL caveat — commit `348041f9df6a48d334f00c8cc6f658c3b1377bb1`.
- Latest readiness report path: `docs/architecture/database-v1-migration-readiness-review.md`.
- Latest handoff commit after recording Batch 0: `ba0ad951b68f41dfc8054d26f1a807671c386b30`.

The nine principal schema/readiness/location/handoff documents were fetched again after edits. Core branch/role/payment/pin decisions and Batch 0 findings were verified. Some simple keyword checks were inconclusive because headings/phrasing differ; content was inspected directly where needed. No SQL writes were made.



## 2026-11-20 — Foundation DDL specification prepared (Batches 1–3)

Prepared `docs/architecture/database-v1-ddl-spec-batches-1-3.md` — commit `bef7937c885b44599a28d5a75426c67f34abb2c6`, then tightened invitation parent keys and role lifecycle consistency — latest commit `024924d932a91dab42b28d2ba99e1c1d5f9d0638`.

The specification covers:
1. Private `app_private` schema, privilege boundary, postgres-owned default ACL expectations and exact public RPC wrapper policy.
2. Restaurant/branch tables, website eligibility flags, composite tenant keys and no seed data.
3. User profiles, one-role-per-user/restaurant rule, same-role multi-branch assignments, serialized role changes, last-active-Owner protection, append-only staff audit and normalized private invitation workflow.

No SQL migration file has been created or applied. The document is a reviewed DDL specification, not executable SQL.

### Test-environment constraint
The current execution environment did not expose a local Supabase CLI, Docker or psql binary. Do not create a Supabase cloud branch/project without checking Free-plan availability/cost and obtaining the required user confirmation. The Production project must not be used as a migration test target.

### Next action
Before turning this specification into SQL migrations, establish a verified isolated local/test database and prove migrations run as `postgres`, not `supabase_admin`. Then implement/test Batch 1 first, inspect object ownership/default ACL/RLS/grants, and continue to Batches 2–3 only after passing. Website audit remains deferred until immediately before website/database integration.



## 2026-11-20 — Owner confirmed migration execution-role safeguard

The owner agreed to the following mandatory rule for all Flame Chick application migrations:
- Run migrations using the normal `postgres` migration owner role.
- Never create Flame Chick application objects as internal `supabase_admin`.
- After every migration, verify object ownership, RLS enabled state for exposed tables, table/schema grants, function EXECUTE ACLs and default ACL behavior.
- If the migration session role cannot be proven to be `postgres`, stop before applying SQL.
- Do not attempt unsupported changes to Supabase-managed internal `supabase_admin` defaults.

This is an owner-confirmed safety gate, not an instruction to change Production. Production remains read-only unless separately approved.



## 2026-11-20 — Isolated database test-environment assessment

No database test environment has been created and no SQL has been executed.

Execution environment inspection:
- Linux x86_64, kernel 6.18.57.
- glibc 2.41.
- Node.js 22.16.0 and npm available.
- Supabase CLI, Docker, Podman, psql and pg_isready are not installed.
- Docker socket unavailable.
- Approximately 5.8 GiB RAM and 30 GB free disk at inspection time.
- Attempt to query the npm registry for the current Supabase CLI timed out; no CLI installation was performed.

Current safe route:
- Supabase documents an experimental native local runtime for Linux x86_64/arm64 that does not require Docker, provided the CLI version is at least 2.119.0 and experimental stack mode is enabled.
- This execution environment meets the documented OS/architecture/glibc floor, but the runtime has not yet been installed or tested.
- Hosted Preview Branching is not included in the Supabase Free plan and can incur compute/usage charges. Do not create a hosted branch or incur cost without explicit review and approval.
- Prefer the no-cost local native runtime. If the CLI cannot be obtained or the runtime proves unsuitable, stop and present alternatives before using any cloud resources.

Next action:
1. Obtain the official current Supabase CLI without changing the application repository or Production.
2. Verify CLI version and native-runtime support from official documentation.
3. Initialize/use a local-only test stack in a disposable workspace, not the Production-linked project.
4. Test Batch 1 before proceeding to Batches 2–3.
5. Record test results and update this handoff after each meaningful milestone.

Production remains read-only. No migration files were added to the deployable migrations directory, no test branch/project was created, and no application SQL was applied.


## 2026-11-20 — Batch 1 rollback-only privilege probe

The owner approved proceeding carefully against the connected Flame Chick Supabase project because it is pre-launch, has no business data/application tables, and is on the Free plan. The connected project was used only for disposable, rollback-only SQL probes—not as a persistent application schema deployment.

### Read-only preflight
- Project `adkrxfnawdiljhjaavnj` ACTIVE_HEALTHY, PostgreSQL 17.12, Mumbai `ap-south-1`.
- SQL execution identity verified as both `current_user=postgres` and `session_user=postgres`.
- Existing migration remains exactly `20261119125153 flame_chick_postgres_default_privileges_hardening`; it was not reapplied.
- No application relations exist in `public` or `app_private`; `app_private` absent.
- Existing `ensure_rls` event trigger and `public.rls_auto_enable()` were inspected read-only; no trigger/function altered.
- Existing broad `supabase_admin` default ACL caveat remains; application migrations must never run as `supabase_admin`.

### Rollback-only probe results
- Probe A used a uniquely named temporary schema, schema revokes and schema-specific default ACL revokes, created disposable table/sequence/function/type, then intentionally raised an exception.
- Probe A showed client schema USAGE/table SELECT/sequence USAGE denied, but client function EXECUTE and type USAGE unexpectedly remained **true** due PostgreSQL's implicit global PUBLIC defaults.
- Probe B repeated the test with global postgres-creator default revokes for function EXECUTE and type USAGE from PUBLIC, plus private-schema role-specific revokes. All tested client privileges were **false** and every disposable object owner was postgres.
- Both probes intentionally rolled back. A follow-up read-only check confirmed the probe schema and relations do not exist and no probe default ACL changes remain. No persistent DB change was made.

### Specification correction
- Corrected `docs/architecture/database-v1-ddl-spec-batches-1-3.md`: Batch 1 now calls for global default revocation of implicit PUBLIC EXECUTE on future postgres-created functions and PUBLIC USAGE on future postgres-created types, plus private-schema-specific client role revokes.
- Important scope: these global defaults affect all future objects created by postgres in every schema. Any intentionally callable public RPC must receive explicit reviewed EXECUTE grants.
- Detailed report: `docs/architecture/batch1-rollback-privilege-probe-2026-11-20.md`.

### Advisor results and boundaries
- Supabase Security Advisor: zero lints.
- Performance Advisor: zero lints.
- Health Advisor: zero lints.
- These checks do not replace custom privilege tests.
- No migration applied, no persistent schema/default privilege change, no business data write, and no Auth, Edge Functions, Storage, Realtime, website, POS, Rider, Vercel or deployment changes.

### Next
Review the broader implications of the global function/type default revokes and test explicit public RPC grant behavior in another rollback-only probe. Then complete Batch 1 acceptance tests. Do not persist the foundation schema until the corrected specification and all test cases are reviewed. Production/live launch safeguards and the deferred website audit remain unchanged.



## 2026-11-20 — Explicit public RPC grant probe

A second rollback-only test validated the public wrapper permission pattern:
- Created a disposable SECURITY INVOKER function in `public` as `postgres`.
- Explicitly revoked EXECUTE from PUBLIC, anon and authenticated.
- Explicitly granted EXECUTE only to service_role.
- Verified PUBLIC ACL entry absent; anon=false; authenticated=false; service_role=true; owner=postgres; SECURITY DEFINER=false.
- All assertions passed. Intentional exception rolled back the function.
- Follow-up read-only check confirmed the probe function does not exist.
- Security, Performance and Health advisors each returned zero lints.
- Detailed report: `docs/architecture/batch1-public-rpc-grant-probe-2026-11-20.md`.

### Current Batch 1 status
The two key PostgreSQL default-privilege semantics are now experimentally validated:
1. Global default revokes are required to suppress implicit PUBLIC EXECUTE on future postgres-created functions and PUBLIC USAGE on future postgres-created types.
2. An explicitly granted public SECURITY INVOKER wrapper can be callable by service_role while remaining unavailable to PUBLIC, anon and authenticated.

No persistent DB changes were made. The project remains pre-launch and has no application tables. Next: complete the Batch 1 acceptance matrix with rollback-only probes for schema exposure, PostgREST exposure, Realtime publication absence, default ACL behavior for all object types, and exact ownership; review whether global function/type default revokes have any implications for Supabase-managed objects created by postgres before preparing the first persistent foundation migration. Do not proceed to Batch 2/3 until Batch 1 acceptance passes and the owner has reviewed the migration plan.


## 2026-11-20 — Batch 1 acceptance probe

### Disposable DB acceptance test
A single rollback-only acceptance probe created a uniquely named temporary schema plus table, sequence, function and enum type; applied candidate schema-specific defaults and the tested global PUBLIC revokes; enabled RLS on the disposable table; and asserted effective permissions/ownership/Realtime membership.

All assertions passed:
- anon/authenticated/service_role have no schema USAGE, table SELECT/INSERT/UPDATE/DELETE, sequence USAGE/SELECT/UPDATE, function EXECUTE or custom type USAGE.
- Schema and all objects owned by postgres.
- RLS enabled on the disposable table.
- No Realtime publication membership.
- No PUBLIC EXECUTE on the test function or PUBLIC USAGE on the test type.
- Intentional exception rolled back all DDL/default ACL changes. Read-only verification confirmed probe schema absent, zero probe relations, app_private absent, zero Realtime tables, and zero application relations in public/app_private.

### Additional platform observations
- Realtime publication is not set to publish all tables and currently contains zero published tables.
- Existing postgres default ACL rows include public and storage. The global revokes remove implicit PUBLIC defaults; they do not remove existing explicit schema-specific storage grants to anon/authenticated/service_role. Supabase-managed storage ACLs are not to be modified as part of Batch 1.
- Existing supabase_admin default ACLs remain broad across Supabase-managed schemas. Never create Flame Chick application objects as supabase_admin.
- Supabase Data API exposed-schema configuration cannot be proven through available SQL catalog access. Supabase docs say custom schemas must be separately added in Project Settings → API → Exposed schemas. Manual gate: verify app_private is not exposed, and after its creation test negative PostgREST access.
- Existing ensure_rls event trigger must not be assumed to cover app_private. DDL spec now explicitly requires RLS enabled on each app_private table as defense in depth.

### Specification and report
- Updated DDL spec with manual API exposure verification and explicit private-table RLS requirement.
- Detailed report: `docs/architecture/batch1-acceptance-probe-2026-11-20.md`.
- Advisors after rollback: Security 0, Performance 0, Health 0.

### Decision
Database-side Batch 1 rollback-only acceptance probe passes. This is not approval to persist the migration yet. Before persistent foundation DDL: manually verify Data API exposed schemas, review final migration SQL, and establish a suitable recovery/backup plan. Production schema remains empty; no persistent database changes, no Auth/Edge Functions/Storage/Realtime/Vercel/app code changes.


## 2026-11-20 — Batch 1 pre-deployment review, candidate SQL and recovery plan

### Dashboard/API exposed-schema gate
- The currently connected browser Dashboard tab was inspected read-only. It belongs to the separate organization `hfp supabase` (org ref `xzdklhvmheiewpnnqgsa`) and lists Flame Chick Demo, HFP and Pizza Bite projects; it is NOT the `Flamechic` organization (`ydlbinhyoutdqueilxnd`) containing Flame Chick Production.
- Therefore no API exposed-schema setting was inspected or changed. Do not use the HFP org tab as evidence. Correct production Dashboard path still must be checked: Project Settings → API → Exposed schemas; `app_private` must not be listed.
- The SQL integration remains connected to Flame Chick Production ref `adkrxfnawdiljhjaavnj` for read-only and rollback-only database checks.

### Important narrowing of privilege plan
- Initial rollback-only probes showed schema-specific default ACL revokes do not remove PostgreSQL implicit global PUBLIC EXECUTE on new functions or PUBLIC USAGE on new types.
- A prior proposed global revoke for postgres-created functions/types would affect every schema, not only Flame Chick `app_private`. On review, this broad global change is rejected for Batch 1.
- Candidate design is now narrow: schema-specific defaults for app roles, private schema has no client USAGE, and every future `app_private` function/type migration must immediately revoke PUBLIC and all client roles on that exact object and assert effective permissions. Public RPCs receive only exact explicit grants after review.
- DDL specification updated accordingly. This is a deliberate correction: previous acceptance probe proved global revokes work, but not that global scope is appropriate for this project.

### Candidate SQL and recovery
- Added review-only candidate SQL: `docs/drafts/batch1-private-schema-bootstrap-candidate.sql`. It is NOT under `supabase/migrations`, has not been applied, and creates only the empty `app_private` schema plus scoped defaults.
- Added recovery plan: `docs/operations/database-batch1-recovery-plan.md`.
- Supabase Free plan does not include automatic daily database backups per current official documentation. Before persistent migration, preferred protection is a Supabase CLI schema-only logical dump stored encrypted off-site; available environment currently has no Supabase CLI, Docker or pg_dump, and no backup artifact has been created.
- If external backup cannot be created, this limitation must be explicitly accepted before the schema-only transactional change. Candidate is intentionally narrow and empty; recovery uses a guarded `DROP SCHEMA ... RESTRICT` only while no objects exist. Never use CASCADE.

### Current status / next gate
- Historical pre-apply status (superseded): Batch 1 has since been applied and verified as recorded at the top of this handoff. Do not treat this earlier checkpoint as current.
- Historical pre-apply gate (superseded): the user later confirmed Exposed schemas are exactly `graph_ql` and `public`, approved applying Batch 1 without an external dump, and Batch 1 was applied and verified.


## 2026-11-20 — User-confirmed API exposed schemas and exact candidate rollback

### API exposure gate
User checked the correct Flame Chick Production Project Settings → API screen and reported exactly two exposed schemas: `graph_ql` and `public`. `app_private` is absent. Treat this as user-confirmed Dashboard evidence; no setting was changed.

### Exact candidate transaction test
Executed the current candidate SQL file's statements against connected Production, changing only its terminal `COMMIT;` to `ROLLBACK;` so the entire candidate transaction was reverted. This was a rollback-only rehearsal, not a migration apply.

Post-test read-only verification:
- `current_user=postgres`, `session_user=postgres`.
- `app_private` does not exist.
- app_private default ACL rows: 0.
- app_private Realtime publication rows: 0.
- public application relations: 0.
- no additional application migration history row beyond the existing baseline.

This confirms the candidate can execute under the connected role and its schema/default ACL statements roll back cleanly. It does not prove PostgREST negative request behavior, because no schema was left behind to test; however user-confirmed exposed-schema configuration already excludes app_private.

### Decision status
The exposed-schema gate is now satisfied. Exact candidate rollback rehearsal passed. Persistent Batch 1 remains unapplied pending explicit user authorization to create the empty private schema and its scoped default ACLs. External encrypted backup has not been produced: this environment does not provide Supabase CLI, Docker or pg_dump. Because the target is empty and Batch 1 is schema-only, this is a low-impact change, but user must explicitly accept proceeding without an external dump or arrange a dump first.

No Auth, Storage, Realtime, API settings, Functions, secrets, Vercel or application code changed.


## Batch 2 review artifacts

- DDL spec review/tightening commit: `a1916ac74c20568a4a967e15d5e2b16f20021449`.
- Field-level tenant/branch alignment commit: `f752603a1337be948e4734be04d96c992d2de9d7`.
- Handoff Batch 2 review record commit: `0245fc66ae84f59fdb12951f7f1168ffdf644769`.
- Batch 2 remains design-only. No SQL migration file has been created and no Production DDL has been executed.


## 2026-11-20 — Batch 3 candidate complete (NOT applied)

Candidate: `docs/drafts/batch3_staff_identity_roles_candidate.sql` (commit `c336e74202d335dc71857eacc452f892f56042dc`). Acceptance review: `docs/drafts/batch3_staff_identity_roles_acceptance_review.md` (commit `8e95b40d6d4d2d00d220daa0b041883339934f0f`). Working branch: `work/production-source-audit`.

Five candidate tables: `public.user_profiles`, `public.user_roles`, `public.staff_role_audit`, `app_private.staff_invitation_requests`, and `app_private.staff_invitation_branch_targets`. The design enforces one active role identity per user/restaurant, same-role multi-branch operational assignments, restaurant-wide Admin/Owner, postgres-only initial bootstrap, serialized role changes, last-active-Owner protection, append-only role audit, tenant-safe branch FKs, and a recoverable private Auth invitation workflow. All five tables are RLS-enabled, postgres-owned, deny-by-default, without client grants, policies, or Realtime membership; app_private remains unexposed.

Disposable DDL-only and behavioral rollback tests passed. They covered bootstrap, actor checks, role conflicts, multi-branch role assignments, cross-tenant branch rejection, last-Owner guard and transfer, profile deactivation, invitation target consistency, Auth email confirmation, duplicate open invitations, audit immutability, and TRUNCATE denial. Every test was rolled back. Follow-up Production state: 0 Auth users, 0 restaurants, 0 branches, 0 Batch 3 tables; migration history unchanged (baseline, Batch 1, Batch 2 only).

**Remaining gate:** true parallel two-session testing of concurrent last-Owner changes has not been performed; run in isolated staging before Production approval. The Staff Admin API, JWT actor derivation, invitation orchestration, projections and exact command grants are later work. **Batch 3 has NOT been applied. Separate explicit owner approval is required.** No app source or Vercel settings/deployments changed.


## Next catalog implementation handoff

The core catalog schema and all 15 FK indexes are applied and independently verified in Production. The next work is the secure Admin/Owner catalog authoring API, not enabling the legacy Admin direct REST writes. See `docs/handoffs/2026-11-21-secure-catalog-authoring-api.md` for the source audit, Production state, command boundaries, publication design, and security stop-gates. The catalog UI remains disabled; no catalog rows are seeded and no catalog Edge Function is deployed.


---

## CURRENT OVERRIDE — 2026-11-21: combo deals and time-based offers design

This section supersedes earlier statements that deal structures and schedules were still awaiting domain design.

Owner agreed to extend the menu foundation for combo deals, customer-selected components, scheduled offers and broader promotions. Reviewed design committed at:

- `docs/architecture/catalog-deals-promotions-scheduling-v1.md`
- Design commit: `0f7c026b4d1a6a7e6b330698f98b0de0746a831e`
- Updated secure catalog handoff commit: `174fd8b1a3dbacbe2fa4a1c901a75de5103d7049`

### Approved design scope

- First-class combo/deal entities, purchasable deal variants, component groups, exact product-variant allowlists, quantities, required/optional choices and explicit per-choice pricing.
- Fixed-price bundles and base-plus-selected-items bundles; included, fixed surcharge and selected variant price treatments.
- Existing product modifier groups remain available within deal components (e.g. crust, spice, toppings, sauces).
- Separate promotion domain for percentage, fixed amount and fixed price discounts, target scopes, Website/POS channels, coupons, branch scope and deterministic stacking.
- Reusable schedules with explicit IANA timezone, multiple weekday windows, overnight windows, effective dates, one-off date/time windows, branch override/fallback and clear boundary semantics.
- Database-time runtime schedule evaluation; no cron jobs toggling deal active flags.
- Immutable publication snapshots include deal/promotion/schedule definitions; checkout re-evaluates eligibility and all prices server-side.
- Historical order receipt snapshots preserve exact deal selections, modifiers and discounts after later catalog changes.

### Safety and exclusions

- No direct app-role table grants or permissive policies; RLS remains deny-by-default.
- Admin/Owner only authoring; verified actor from JWT and server-side membership.
- Atomic aggregate writes, expected draft revision, idempotency and append-only audit.
- No client-calculated prices or discounts; missing price rules are never treated as free.
- Promotion usage caps require a future atomic order-linked redemption ledger; do not expose them before order transaction integration.
- GST remains deferred. Inventory, allergens, BOGO, loyalty, referral and customer-segment promotions are not included in this slice.

### Current execution truth

This is design-only. No new Production tables, migrations, RPCs, Edge Functions, UI changes, seed data or deployments have been made. Production remains at the previously verified 11 empty catalog tables and 15 FK indexes, all catalog tables deny-by-default. Continue on `work/production-source-audit`; do not touch main, create a Supabase branch, upgrade the plan or apply Production DDL.

### Next stage

Prepare a review-only migration candidate on the working branch from the design contract, including deal/promotion/schedule entities and publication integration. Then run isolated/rollback-only structural, pricing, schedule, security and concurrency tests. Review the exact migration and recovery plan before any separate request for Production approval. Keep Admin catalog/deal/promotion UI disabled until secure commands and publication are complete.


## 2026-11-21 — Menu-specific live schema reconciliation

**Source of truth:** uploaded upcoming Flame Chick menu and detailed read-only reconciliation at \`docs/handoffs/2026-11-21-menu-schema-reconciliation.md\`.
**Architecture update:** \`docs/architecture/flame-chick-menu-driven-catalog-v1.md\`.
**Reconciliation commit:** \`bfacf5f015bdb2d6710437cd49554e3ef18addc3\`.
**Menu architecture update commit:** \`1a12c1c5989dc6a23fb86142b7068f7492e4806d\`.

Read-only inspection reconfirmed Production ACTIVE_HEALTHY, PostgreSQL 17.12, Mumbai ap-south-1, and 12 applied migrations including catalog foundation and FK indexes. The 11 catalog tables remain empty and deny-by-default with prior verified ownership/RLS/ACL/index posture. No SQL write, seed, deployment, or config change occurred.

### Existing schema that should be reused
- \`categories.category_kind\` already distinguishes \`menu\` and \`deal\`; do not add it again.
- \`product_variants.price\` is nullable NUMERIC(12,2); NULL must remain TBD, distinct from explicit zero.
- \`drink_options.volume_ml\` exists and is nullable; do not invent regular beverage volume.
- Branch product/variant availability overlays already exist.
- \`restaurants.timezone\` exists as IANA timezone.

### Required menu-specific schema work before authoring
1. Typed variant metadata for portion/flavour/pack/volume and an explicit standalone-sellable vs deal-only distinction. Retain a one-dimensional variant model; no generic multi-axis variant matrix is required for this menu.
2. Replace modifier price rule authoritative key \`product_id + size_key\` with exact \`product_variant_id\` and same-tenant/product composite FK.
3. Add normalized deal collections, deal records, component groups and exact variant allowlist options; add branch deal availability. The six printed offer rows are individual deals; Flame Hour and Kids Deals are collection headings.
4. Add reusable schedule sets/windows, overnight/effective-date logic and optional branch timezone override. Flame Hour 3 PM–5 PM is known, weekdays are not; publication must wait for weekday configuration.
5. Add draft revision, append-only audit, immutable compiled publication snapshots and atomic current pointer.

### Confirmed source blockers
- Public catalog Edge Function references missing \`deals\` and \`deal_components\`, reads mutable authoring tables, omits \`category_kind\`, and converts NULL variant prices to zero. It must not be deployed as production catalog until corrected.
- Admin app contains direct REST CRUD, legacy-ID deal category classification and sequential writes to the old deal-component shape. Replace with authenticated atomic commands; never loosen table grants/RLS for compatibility.
- Existing product variant Admin editor treats all variants as generic sizes; update it for menu-driven typed variant forms.
- Modifier price rules are currently selected by \`size_key\`; exact variant UUID must become authoritative.

### Menu facts still unresolved
Flame Hour weekdays; eligible drinks/burgers for each deal; intended Flame Feast 1L drink; exact six-piece nugget choice; Fries/Juice products and deal-only status; Whole Chicken Broast flavour representation; Platter contents; regular drink volume. Do not invent these or seed guesses. TBD prices remain NULL.

### Next stage
Prepare a single review-only migration candidate for variant metadata, exact variant-scoped modifier pricing, deal collections/deals/component groups/options, schedules, branch deal availability, draft revision/audit and immutable publication snapshots/pointer. Then add schema/pricing/schedule/role/concurrency golden tests and reconcile the Admin/public catalog DTOs. Keep catalog/deal Admin UI disabled. Do not apply Production DDL, seed menu data, deploy functions or Vercel until a separate review and explicit owner approval.


### Menu V1 relational object contract prepared

**Design commit:** \`1e8bf9a1d7dd27c8f8841c5b3578674ec1050cb9\`.
**Document:** \`docs/architecture/menu-v1-database-object-contract.md\`.

This is the detailed proposed table/column/FK contract for the next migration candidate:
- Typed product variants with portion/flavour/pack/volume meaning and explicit standalone-sellable flag.
- Exact product_variant_id modifier price-rule key.
- Deal collections, individual deal records, component groups, exact variant component options and branch deal availability.
- Schedule sets/windows with restaurant timezone fallback and optional branch timezone override.
- Draft revision, append-only catalog audit, immutable compiled publication snapshots and current-publication pointer.
- RPC command boundary, pricing rules and migration QA gates.

The contract deliberately excludes generic coupon/stacking engine, inventory, allergens, nested deals and GST for this menu-first V1. It is design-only and does not authorize Production DDL.


### Current vs upcoming menu comparison completed (2026-11-21)

**Comparison handoff:** \`docs/handoffs/2026-11-21-current-vs-upcoming-menu-reconciliation.md\`
**Comparison commit:** \`26521d44e003804ea72f9140e0ef6f2500611698\`.

Both supplied menu images are now the source references for transition planning:
- Current published menu is the compatibility baseline.
- Upcoming menu is the target catalog, subject to final owner approval.

The comparison records all visible current products/prices/descriptions, upcoming products/prices/TBD entries, price deltas, products not shown in the upcoming image, new categories, six deals, and unresolved deal choices. In particular:
- Current menu shows Classic Chick, B-B-Q Wrap and six flavoured drinks not shown in the upcoming menu. Do not retire them until the Owner confirms.
- Upcoming menu adds Whole Chicken Broast flavours, Flame Beef, Flame Fish, Shakes and six structured offers.
- Existing Platter composition is visible only on the current menu; do not assume unchanged target composition.
- Current image explicitly states prices are exclusive of applicable GST; upcoming image does not repeat this. GST remains deferred pending explicit confirmation of target display and checkout policy. Do not silently infer inclusive/exclusive status.
- TBD remains NULL, and no guessed component choices, weekdays, drink volume or recipe data may be seeded.

The schema must preserve historical catalog/order snapshots when current products are archived or prices change. No Production DDL, menu seed or deployment occurred during this comparison.


### Menu V1 migration candidate prepared (2026-11-21)

**Migration:** \`supabase/migrations/20261121120553_flame_chick_menu_v1_catalog.sql\`
**Migration scaffold workflow:** https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44902193577 (success; pinned Supabase CLI v3.2.0; no DB credentials).
**Candidate SQL commit:** \`d4ea1d292aa326859167b49034f4dff30941e248\`
**FK index follow-up:** \`1550cbfab89584948c8daa9004804061c1dd70d9\`
**Review handoff:** \`docs/handoffs/2026-11-21-menu-v1-migration-candidate-review.md\`
**Review handoff commit:** \`35006a01d96b6fd371841c67a33a1abb694a668b\`.

Candidate covers typed variants, exact variant-scoped modifier pricing, branch timezone override, schedule sets/windows, deal collections/deals/component groups/options, branch deal availability, draft revision, append-only audit, immutable publication snapshots and current pointer. New public tables are RLS-enabled, postgres-owned and explicitly revoked from app roles. No menu data or catalog command functions are included.

The migration was prepared using read-only live schema facts and contains strict preflight checks. **It has not been applied and is not yet declared production-ready.** Required next step is a clean disposable Supabase local migration-chain run, then security/ACL/FK-index/tenant-isolation/immutability tests and DTO reconciliation. Production remains untouched.


### Menu V1 schema migration applied to pre-launch Production project (2026-11-21)

- Project: \`adkrxfnawdiljhjaavnj\` (Mumbai, Free).
- Git source: \`supabase/migrations/20261121120553_flame_chick_menu_v1_catalog.sql\`.
- Supabase migration ledger version: \`20261121125542\`, name \`flame_chick_menu_v1_catalog\`.
- Post-apply QA: 11 new tables exist; all postgres-owned; RLS enabled; zero policies; no anon/authenticated/service_role CRUD privileges; no missing child-side FK indexes; append-only audit/publication UPDATE/DELETE/TRUNCATE protections verified.
- Exact variant modifier pricing conversion is in place: \`modifier_price_rules.product_variant_id\` required; old \`size_key\` removed.
- Branch timezone override is in place and falls back to restaurant timezone.
- No restaurant/branch/menu/deal/staff/Auth seed data inserted.
- No catalog command, pricing or public catalog functions created yet.
- Detailed QA and remaining blockers: \`docs/handoffs/2026-11-21-menu-v1-migration-candidate-review.md\`.

The migration was applied successfully to the existing pre-launch project, not to a running customer system. The schema foundation is ready for the next implementation phase, but Admin catalog editing, pricing, publication, schedules and public catalog delivery are not yet operational. Replace Admin direct REST writes and reconcile the public catalog DTO before enabling the catalog UI.


### Secure Edge API, POS/Rider Realtime and Free-tier architecture (2026-11-21)

Architecture baseline: \`docs/architecture/edge-api-realtime-free-tier-v1.md\`.

Verified:
- Supabase org \`Flamechic\` is Free; project \`adkrxfnawdiljhjaavnj\` is ACTIVE_HEALTHY, Mumbai, Postgres 17.12.
- Zero Edge Functions deployed.
- Current order/delivery/rider tables are absent. The current catalog function references legacy tables/columns and must not be deployed.
- Realtime publication currently has no business tables; no \`realtime.messages\` policies exist.
- Existing POS subscriptions include unfiltered delivery offer/assignment listeners. Rider has user-filtered Postgres Changes. Both are legacy and must be replaced/secured before launch.
- Supabase documented Free allowances: 500k Edge Function invocations/month, 2m Realtime messages/month, 200 peak Realtime connections, 5 GB egress, 500 MB DB size/project, 1 GB Storage, 50k MAU. See architecture doc links and monitor actual organization usage.

Implementation already made:
- Removed redundant \`/auth/v1/user\` round-trip from Staff Admin function; it remains \`verify_jwt=true\`, and database command independently derives \`auth.uid()\` and enforces Admin/Owner.
- Commit: \`6e21262ce052189e196332db464014b02435b3fc\`.
- Added CI assertion for this contract: \`95f56d26f2124b42992c7c49107d6ed828082d8a\`.
- Static CI run: https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44907048541 (check final status before claiming green).

Architecture decisions:
- Keep four domain functions (catalog, order, delivery, staff-admin), not per-action functions.
- User JWT + publishable key for authenticated calls; secret key only server-side.
- DB RPC is authoritative for role/branch/tenant checks, pricing, idempotency and status transitions.
- Guest website create only unauthenticated; atomic website-only rate limiting.
- POS private branch topic, rider private per-user topic; minimal event payloads with IDs/version only; clients refetch authorized data.
- Prefer transactional outbox + private Broadcast for operational events; no unfiltered Postgres Changes.
- Rider Presence is ephemeral; no 120-second Edge Function heartbeat. Persist only explicit availability preference and real lifecycle changes.
- No frequent polling; bounded paginated snapshots on reconnect.
- Do not enable Realtime until private channel authorization policies and project private-only settings are configured.

Next implementation order:
1. Shared API helpers and endpoint contracts.
2. Catalog Admin/Owner command RPCs + immutable publication compiler; adapt public catalog.
3. Order schema and atomic quote/submit/status RPCs.
4. Delivery/rider schema and atomic commands.
5. Private Realtime authorization + outbox publisher.
6. Migrate POS/Rider/Admin clients away from direct sensitive table access.
7. Role/branch/rider isolation, idempotency, race, reconnect and Free-tier usage QA.
8. Deploy only after source/schema contracts align.

Do not deploy any current draft Edge Function yet; order/delivery tables and RPCs do not exist. No new business schema was applied in this architecture phase.

---

## Latest session checkpoint — 2026-11-23: V3 synthetic preview verified; new-chat handoff

**Current continuation note:** `docs/handoffs/2026-11-23-new-chat-continuation-handoff.md`  
**Handoff commit:** `eb945532e55b490ff3b20389d97d341efba7610d`  
**Exact source commit tested:** `95fca5b825ff05d88899b4d13855a95f1e0f850e` on `work/production-source-audit`.  
**GitHub Actions:** [Website Static Checks run 45107009218 — completed / success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45107009218), verified against the exact source SHA above.

### Verified locally by the user in the pinned archive

- Archive extracted under the user's Music folder into the directory documented in the continuation handoff.
- `node --test`: **136 tests, 136 pass, 0 fail, 0 skipped**.
- Local synthetic preview opened successfully; menu items appeared.
- Reload catalog restored/re-rendered items.
- Pickup displayed items.
- Burger Meal preview choices validated successfully with optional Extra Cheese omitted; confirmation explicitly stated that no quote or order was created.
- The older Downloads copy was out of sync (125 pass / 10 fail). Do not patch it or mix files with the pinned archive.

### Current state and next step

The standalone V3 preview remains synthetic/non-ordering. The next task is a **read-only production catalog integration audit** from the database publication/compiler/read RPC through the catalog Edge Function, V3 client/validator, branch/fulfilment flow and product/deal rendering. Verify current live state read-only; produce evidence-backed gaps and a sequenced plan before proposing changes.

No production/Supabase write, migration, seed, Edge Function deployment, catalog publication, Vercel deployment, domain change, storefront cutover or checkout activation occurred in this session. Keep `main` untouched and continue on `work/production-source-audit`. Do not treat synthetic preview tests as live integration or release approval.

For the complete immediate continuation instructions, exact local folder/command, project invariants, upcoming phases and assistant working rules, read `docs/handoffs/2026-11-23-new-chat-continuation-handoff.md` first, then this full historical handoff.


# LATEST MENU DECISION OVERRIDE — 2026-11-23


The user's latest clarifications supersede any older notes about the newly published Flame Chick menu:

- Whole Chicken Broast is **three separate individual products**, not one product with flavour variants: Simple Injected — Rs. 2,499; Nashville — Rs. 2,699; Cheetos Butter — Rs. 2,799. Do not model these as variants/flavours of one product.
- GST system implementation is explicitly deferred. Do not add GST calculations, tax fields, checkout tax logic, tax rates or tax rounding behavior now. The menu transcription included a GST statement, and the user previously asked to display the statement below the large MENU heading and replace the old GST heading; that is display copy only, not authorization to implement a GST system. If there is any conflict in how the old heading should be handled, do not implement tax functionality.
- Existing confirmed deal decisions remain: Flame Hour Injector + Rs.120 Cold Drink at Rs.699; Flame Hour Quarter Broast + OG Crunch + Rs.120 Cold Drink at Rs.1,599; Flame Duo 2 OG Crunch + Quarter Broast + two Rs.120 Cold Drinks at Rs.2,099; Flame Feast Half Broast + 3 OG Crunch + restaurant-managed 1L drink at Rs.3,599; Mini Flame 6 Classic Nuggets + deal-only Fries + restaurant-managed Juice at Rs.399; Little Crunch 6 Classic Nuggets + OG Crunch + deal-only Fries + Rs.120 Cold Drink at Rs.999. No burger substitutions. Fries, juice and Flame Feast 1L drink are deal-only; do not create standalone priced products.
- Kids deal nuggets are Classic Nuggets. Mini Flame juice choice/details remain restaurant-managed. Flame Feast 1L drink remains restaurant-managed. Platter is Rs.1,499; leave description blank for restaurant completion.
- Flame Hour is scheduled every day 3:00 PM–5:00 PM Asia/Karachi. Outside this window the deal remains visible but greyed out and cannot be ordered; its popup must also prevent ordering outside the schedule.
- The Smash is one product with a required popup patty selector: Single Patty Rs.799 or Double Patty Rs.999.
- Do not add GST system logic now. Keep all production catalog records empty until user separately approves the reviewed import plan. No production write/deployment/publication is authorized by these decisions.


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


## Two-hour deployability sprint checkpoint — 2026-11-23

The POS and Rider apps are existing substantial applications; work is focused on API connections and targeted touch-ups, not replacement. Source on `work/production-source-audit` now routes POS/Rider role and operational reads through authenticated Edge Functions, uses production `user_roles.role_key`, scopes dispatch by server-resolved branch, and rejects ambiguous Rider multi-branch access. Direct browser reads of private role, order, delivery and rider tables were removed from the affected POS/Rider paths.

Latest static verification:
- POS/Rider Static Checks #16 passed, including API-only reads, explicit delivery-selection payloads, and missing-vs-zero area-fee handling.
- Website Static Checks #144 passed, including the delivery selection and missing-vs-zero fee checks.
- Admin Static Checks #82 passed.
- Edge Function Static Checks #40 passed.

The detailed checkpoint and remaining release gates are in `docs/handoffs/2026-11-23-two-hour-release-readiness.md`. Full Production deployment remains NO-GO: the live Production DB has no order/delivery/payment/rider operational tables or RPCs; catalog counts and publications are zero; only Staff Admin Edge Function v1 is deployed; ordering flags are disabled; Storage and Realtime are empty; preview credentials/gates remain unconfigured. No Production writes or deployments were made.
