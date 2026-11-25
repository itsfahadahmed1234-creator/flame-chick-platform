# 2026-11-25 — POS History, Delivery-only Online Orders, and Payment Collection checkpoint

## Canonical state

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/production-source-audit`
- Source commit for this checkpoint: `1528dc38f3c9acc80285b9430cea51a44ba87241`
- Supabase project: `adkrxfnawdiljhjaavnj` — Flame Chick Production, Mumbai (`ap-south-1`)
- Live Order API: `flame-chick-order-api` version **5**, ACTIVE, `verify_jwt=false` (unchanged)
- POS preview: `https://flame-chick-pos-production-k6odt27ve-fahad-7455.vercel.app/`
- POS Preview deployment: `dpl_EUrXHvN1y5dHr9sfodsA9LQk4Keo`, READY, target `null` (Preview), built from exact source commit above.
- Existing branch-preview alias: `flame-chick-pos-production-git-work-productio-675169-fahad-7455.vercel.app`; no Production alias was promoted or changed.

## 1. History navigation root cause and fix

The POS inline script runs in strict mode (`'use strict'`) but the History implementation referenced three undeclared variables:

- `historyActiveTab`
- `historyLoading`
- `historyServerRows`

`showHistory()` assigned `historyActiveTab='pos'` before calling `showPage('history')`. The assignment threw a `ReferenceError`, so the System & Data modal closed and the main POS view remained visible. This matches the user-reported symptom.

Added explicit declarations immediately before `historySearchMatches()` in `apps/flame-chick-pos/index.html`:

```js
let historyActiveTab='pos';
let historyLoading=false;
const historyServerRows={pos:[],online:[],all:[],cancelled:[]};
```

- Fix commit: `91f34d362661733f141a44128b46fc1e63a9a05c`
- Regression assertion commit and current checkpoint: `1528dc38f3c9acc80285b9430cea51a44ba87241`
- `tests/ops-source-hygiene.test.mjs` now asserts all three History state declarations as part of the primary History page test.
- The current Preview HTML returned HTTP 200 and contains the History page, History navigation control, all three declarations, `showHistory()`, and Back to POS control.
- This was a source/served-HTML verification. A signed-in interactive click test has not yet been performed; the user should verify it in the Preview after sign-in.

## 2. Delivery-only Online Orders — backend alignment completed

The POS source already had two Delivery-only guards:
1. `fetchWebsiteOrders()` sends `fulfillment_type:'delivery'` to the Order API.
2. `isOnlineDeliveryOrder()` requires the normalized fulfilment type to equal `delivery`, and the Online Orders board filters through that function.

The live Order API v4 did not implement the `fulfillment_type` filter. It therefore ignored the POS request parameter and queried all fulfilment types. This allowed Dine-in/Takeaway rows to reach the POS inbox despite the frontend request.

Deployed Order API version **5** from the exact five source files at commit `1528dc38f3c9acc80285b9430cea51a44ba87241`. The deployed `index.ts` now:
- parses the `fulfillment_type` query parameter;
- passes the normalized filter to `readOrderBoard()`;
- applies `fulfillment_type=eq.delivery` in the database query when requested.

Post-deploy re-fetch verified all five deployed files are byte-for-byte equal to the branch source files:
- `index.ts`
- `catalog-v3.js`
- `catalog-v3-deal-view.js`
- `flame-chick-order-pricing.mjs`
- `website-order-quote-token.mjs`

Function result: version `5`, status ACTIVE, SHA-256 `91664f4dc20488a2cb7d1ccfb5ae68a803c253ba0b05216f6cab66b887951952`. Function name/URL and `verify_jwt=false` remain unchanged.

Expected behavior: Online Orders contains Delivery only, from Website and POS sources. Dine-in and Takeaway must not appear there. They remain in the in-house POS and History workflow.

## 3. Payment collection / settlement — current implementation

The POS currently contains a **Collect Payment** action for an online-board Delivery order only after its status is `Delivered` and its authoritative outstanding balance is greater than zero. It is available to Admin, Owner, Manager and Cashier roles.

The collection popup offers:
- **COD** (stored as `cash`)
- **Card** (stored as `card`)
- **Online/bank transfer** (stored as `bank`)

It requires the full outstanding balance; the cashier confirms the method only after receiving/confirming payment. The action uses an idempotent request ID and completes the order only after the server confirms `completed=true` and `balance_due=0`; successful completion moves the order into History.

Important boundary: this is staff-recorded payment collection/settlement, **not** an online card gateway, acquiring integration, bank API, or payment verification integration. Choosing Card/Online as a method does not charge a card or automatically verify a bank transfer. Rider marking Delivered does not itself collect payment or complete the order.

The corresponding payment-collection migration is present in the live migration ledger as `20261124033426_flame_chick_payment_collection_v1`. No payment row or order was created/changed during this checkpoint.

## 4. Preview and verification status

- POS Preview deployment `dpl_EUrXHvN1y5dHr9sfodsA9LQk4Keo` is READY and uses source commit `1528dc38f3c9acc80285b9430cea51a44ba87241`.
- Preview HTML was fetched successfully (HTTP 200); History markup/navigation/state, delivery filter, and Collect Payment control were present.
- Live Supabase Order API v5 was re-fetched; all five bundle files match the exact branch source.
- The GitHub combined-status lookup returned no statuses for the History fix commit. Do **not** claim the new History regression suite or full POS CI passed. The regression assertions are committed, but an Actions success result for this checkpoint has not been observed.
- No signed-in interactive History click test has yet been done.
- No Production alias, schema, migration, catalog draft/publication, order, payment, delivery-area setting, staff account, Rider configuration, or Realtime setting was changed in this checkpoint. The only live mutation was deploying the Order API version 5 Edge Function bundle.

## 5. Next operator verification

1. Open the POS Preview above and hard-refresh.
2. Sign in with the existing Flame Chick staff account; do not share credentials in chat.
3. Click the top-level **History** tab. Also check **System & Data → Order History**. Both should open the same dedicated History page; use **Back to POS** to return.
4. Inspect the Online Orders board and confirm that it lists Delivery orders only. Do not create live orders just for this check; use existing controlled test records or wait for the approved rehearsal.
5. For a delivered test Delivery order with a positive balance, verify the Collect Payment action shows COD, Card and Online/bank transfer; do not record real payments during the preview check.

Production remains pre-launch and not cleared for live restaurant operations. Full end-to-end rehearsal, backups/restore readiness, Rider/Cashier role checks and the remaining launch gates are still required. GST remains deferred. Catalog publication remains unapproved.
