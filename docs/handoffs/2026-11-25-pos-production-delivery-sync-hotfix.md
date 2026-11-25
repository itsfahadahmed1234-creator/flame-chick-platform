# Flame Chick POS — Production Delivery Sync Hotfix

**Date:** 25 November 2026  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Source commit:** `aaa60949aa42f1ef43482fe2506d3af46095d40f`  
**Supabase project:** `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai, Free plan)

## User-reported blocker

Local POS Delivery order:

- Local ID: `LOCAL-20261125062605-53b1248b`
- Total: Rs. 2,099
- Local state: `needs_review`, six attempts
- Error: `An option is not allowed or is duplicated in this component group.`

Supabase Edge logs showed Order API HTTP 400 responses at 11:26:05, 11:26:15 and 11:26:31 Asia/Karachi on 25 Nov 2026. A read-only query confirmed there was no cloud `public.orders` row with that `local_order_id`. The local receipt remains the recovery source; do not create a replacement order.

## Verified root cause

The Production Edge Function `flame-chick-order-api` was version 3. Its deployed `catalog-v3-deal-view.js` was stale (22,369 bytes) and did not include `buildCategoryBurgerChoiceSet`. The Website and POS client used the newer category-driven module (26,482 bytes). The client sent real Chicken Burgers product/variant IDs, but the stale server model only allowlisted the internal `Burger / Included` source anchor, resulting in `SELECTION_OPTION_INVALID` and an HTTP 400.

The function's deployed `index.ts` and `flame-chick-order-pricing.mjs` matched the repository; the stale deal-view module was the mismatch.

## Applied fix

Deployed the aligned existing Order API bundle to the same Supabase Function endpoint:

- Function: `flame-chick-order-api`
- New version: **4**, ACTIVE
- Function checksum: `6896c4d5c9f831a07ca8e5f693bef0a2ae04bd89597bd0c54cdffb121dfa3acb`
- Verified post-deploy readback: `catalog-v3-deal-view.js` is 26,482 bytes and contains `buildCategoryBurgerChoiceSet`.
- Bundled files sourced from commit `aaa60949aa42f1ef43482fe2506d3af46095d40f`: `index.ts`, `catalog-v3.js`, `catalog-v3-deal-view.js`, `flame-chick-order-pricing.mjs`, `website-order-quote-token.mjs`.
- Existing `verify_jwt=false` setting preserved; the function retains its own API-key and Supabase Auth validation.

No database migration, SQL table write, service-role direct DML, catalog draft/publication change, order insert, delivery configuration change, payment, rider assignment, or Vercel alias change occurred in this fix.

## Tests

Added to `supabase/functions/flame-chick-order-api/index_test.ts` a synthetic route-level regression test for authenticated POS Delivery sync. It covers:
1. three distinct customer-selected Chicken Burgers (OG Crunch, The Injector, Nashville Fire);
2. repeat same burger three times;
3. server-calculated fixed deal price and Rs. 50 synthetic delivery fee;
4. zero component surcharge and normalized Burger component snapshots.

GitHub Edge Function workflow run `45561951036` completed SUCCESS:
- `deno check` passed;
- Deno Order API route tests: 3 passed, 0 failed;
- Node static/pricing/contract/token/bundle suite: 49 passed, 0 failed.

Admin static workflow on this commit also succeeded. POS/Rider static suite last succeeded at commit `3ed78d6d0f30de1e00dbda36c2a58f0bbab6b743`.

## Production identity and delivery configuration — read-only

- The authenticated user who created the local test order has an active restaurant-wide `admin` role.
- One active branch: Main, timezone `Asia/Karachi`; global Admin resolves safely to the only active branch.
- One active delivery area, plus configured Not Listed fee Rs. 100.
- No cashier/manager/owner user was created in this stage. Existing API/DB role rules support Admin, Owner, Manager and Cashier for POS creation/sync; role records for Manager/Cashier still need to be provisioned separately through Staff Admin before those accounts can be rehearsed.

## Exact next step

User should open POS → System & Data → Local POS Orders and click **Retry Production sync once** for `LOCAL-20261125062605-53b1248b`. Do not create a replacement order or repeatedly retry.

After the user's report, verify read-only:
- exactly one cloud order matching `local_order_id`;
- `source='pos'`, `fulfillment_type='delivery'`, server total Rs. 2,099 if the saved order content still matches current publication and fee;
- an associated dispatch-pending delivery task;
- order visible on POS Online Orders board with POS source label.

If sync still fails, stop and inspect the exact new error/log before retrying. Do not edit database rows manually.

## POS release gate — not yet cleared

The POS must not be described as production-ready for live restaurant operations until:
- the existing local order sync and Online Orders board appearance are confirmed;
- a controlled end-to-end rehearsal covers accept → Preparing → Ready → rider offer/accept → rider pickup/out-for-delivery → delivered → Cashier payment collection;
- cancellation/rejection role restrictions and actor/time audit are verified;
- test accounts and test transactions are used; no real customer or payment data is introduced.

The existing POS Preview deployment remains `dpl_8kVsz7UYvWbXZ1GfSVcASu4Z7mKR` READY (Preview target, commit `71e1de4dad57b09b3609437acc59634508aa22a4`) at:
https://flame-chick-pos-production-git-work-productio-675169-fahad-7455.vercel.app/

No Vercel production alias was promoted or changed.
