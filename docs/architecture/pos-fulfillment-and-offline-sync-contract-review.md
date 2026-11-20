# Flame Chick — POS Fulfilment Modes and Offline Sync Contract Review

**Status:** Source review complete; requirements recorded for later implementation. No application code, SQL, Production schema, or deployment was changed.  
**Reviewed:** 2026-11-20  
**Repository branch:** `work/production-source-audit`  
**Source snapshot commit:** `3f590b6018574b73d7ab0fa7eccf37726ad6afdb`

## 1. Scope and source files

Reviewed only the mode/checkout/table/offline paths needed to align application and database contracts. This was not the deferred website security audit.

- POS: `apps/flame-chick-pos/index.html` (blob `8e20d22a11570957c0b7a2b8aeeb57a4e4c5293b`)
- Website active entrypoint: `apps/flame-chick-website/index.html` (blob `e40d903e5924e8dd545ae605d5ae2c6b04c60df2`)
- Website entrypoint guide: `apps/flame-chick-website/README.md`
- POS entrypoint guide: `apps/flame-chick-pos/README.md`
- Namespaced order API: `supabase/functions/flame-chick-order-api/index.ts`

This is a review of the repository branch, not a verification of the byte-for-byte source currently deployed to the Vercel POS or website projects.

## 2. Website mode contract

The active website entrypoint offers exactly two customer choices:
- UI label `Delivery` → API `fulfillment_type: "delivery"`
- UI label `Takeaway` → API `fulfillment_type: "pickup"`

The active entrypoint loads `js/config.js`, `js/catalog.js`, and inline scripts in `index.html`. The README explicitly says `js/app.js` is inactive legacy code. Although that inactive file contains a historical mapping for `dine_in`, it is not the current website checkout contract and must not be used to infer current UI support.

Therefore Batch 2 website branch capabilities remain `website_delivery_enabled` and `website_pickup_enabled`. Do not add website dine-in capability or enable website dine-in based on the inactive helper. POS dine-in is a separate channel capability.

## 3. POS mode and hidden-control finding

The POS local order model supports three UI values:
- `Delivery`
- `Takeaway`
- `Dine-in`

The current HTML is internally inconsistent:
- The Dine-in order-type button has the `hidden` attribute.
- The hidden order-type select still contains Delivery, Takeaway and Dine-in.
- `dineTableSection` and `preorderSection` are hidden in the initial markup.
- The Open Tables navigation button is hidden.
- The table-picker modal, table management modal, `selectTableBtn` handler, Dine-in Immediate/Pre-Order controls, arrival/preparation scheduling, scheduled-order editor, table movement, open checks and pay/close handlers remain in the application code.

The current `loadTables()` reads IndexedDB `STORES.tables`; when empty, it creates ten local default tables. Manage/add/rename/activate/deactivate table operations write to that same local IndexedDB store. There is no central branch-table configuration in this POS path.

**Owner instruction:** this is a UI mismatch to leave untouched now. Do not unhide Dine-in, restore the Open Tables navigation, change markup/CSS, remove the remaining handlers, or otherwise repair the POS UI as part of database work. Retain all three POS modes in the future data/API design.

## 4. Actual POS offline and cloud-sync behavior found

The current POS uses IndexedDB version 6 with local stores including `orders`, `queue`, `statusQueue`, `tables`, cached menu/catalog data and settings. It is local-first and can retain order data on the device.

However, its current cloud sync is **not yet a three-mode POS order sync**:
- `HFP_ORDER_API_READY` is true, and `syncPending()` delegates to `syncPendingPosDeliveryOrders()`.
- `hfpIsPosDeliveryOrder()` selects only POS orders whose fulfilment type is `delivery`.
- The sync function explicitly reports: “Takeaway and dine-in orders remain local.”
- Sending delivery orders requires Internet access and a signed-in Flame Chick staff session. Failed/offline deliveries remain in the local queue for retry.
- The current API payload builder sends `fulfillment_type: "delivery"` and uses a stable local order ID in its POS idempotency key.
- Takeaway orders are saved and finalized locally; their queue entries are not sent by the current delivery-only sync path.
- Dine-in open/scheduled checks and their table/payment operations are saved locally; they are not sent by the current delivery-only sync path.

Thus the current POS provides local persistence and a retryable Delivery-to-cloud path, but Takeaway and Dine-in are not yet centrally stored/synchronized. A cached menu also requires a successful online initialization before a new device/browser can work offline.

## 5. Canonical mode vocabulary for the database/API

Use these canonical values in future order records and server commands:

| Customer/staff UI label | Canonical `fulfillment_type` | Current channel support |
|---|---|---|
| Delivery | `delivery` | Website + POS |
| Takeaway | `pickup` | Website + POS |
| Dine-in | `dine_in` | POS only |

Keep labels separate from stored values. In particular, map POS `Takeaway` to the existing website/API-compatible `pickup` code; do not introduce a second `takeaway` database value. `dine_in` is not eligible for the current website branch-resolution flow.

Delivery-only data and delivery task creation must apply only to `delivery`. Pickup/takeaway must not require a delivery address or create a rider task. Dine-in must not create a delivery task.

## 6. Required future POS offline-to-database behavior

The future POS implementation must support Delivery, Takeaway and Dine-in while offline, then synchronize all three into the central database when connectivity and authorized staff access are available.

### 6.1 Durable local outbox and idempotency

- Keep local-first order capture in IndexedDB, including a durable pending outbox.
- Preserve one stable local order identity across reconnects, edits and retries. Do not generate a fresh order identity on every sync attempt.
- Give every server-accepted command/event its own stable idempotency key, so a lost response and retry cannot duplicate an order, item, payment or state transition.
- Sync a given order's queued commands in sequence. A later table move, item edit, payment close or cancellation must not overtake its earlier create/update command.
- Mark records Synced only after a server acknowledgement. Keep Pending/Syncing/Failed state and a retryable error for unresolved commands; local save is not proof of cloud persistence.
- Preserve the local receipt reference; attach the server order ID/number once acknowledged rather than changing the local identity.

### 6.2 Server authority and stale catalog

- The server must revalidate branch, staff authority, fulfilment mode, product/variant/modifier/deal availability, prices, discounts, delivery area/fee and status transitions. Browser-supplied totals/status/role are not authoritative.
- Capture the catalog publication/version used for an offline POS order. Keep the already-agreed stale-offline rule: if price or availability changed since the cached publication, hold the order for explicit Cashier/Manager confirmation; never silently reprice or silently remove an item.
- A staff session/role recorded locally is not by itself trusted authorization. Design a secure offline actor-attribution and re-authentication/sync rule before release; server-side commands must verify the syncing actor and preserve reliable attribution for who captured/changed the order.

### 6.3 Dine-in and table synchronization

- Add branch-scoped table configuration to the future schema/API (later batch, not Batch 2). Cache the authoritative table list locally for offline use; do not treat each browser's auto-created local `T1`/ten-table set as the permanent shared source of truth.
- Dine-in orders need a branch-valid table reference and an immutable table-name/number snapshot. A scheduled dine-in preorder may exist before a table is assigned; assignment happens later.
- Preserve the current Immediate/Pre-Order behavior and the scheduled arrival/preparation timestamps in the future order contract unless a later approved product decision changes them.
- Table occupancy should be derived/validated against server-side open checks. During offline operation, local availability is provisional: two POS devices can choose the same table. The server must detect this conflict on sync and return a recoverable conflict for staff resolution; never overwrite another open check or silently double-book a table.
- Open-check item edits, table moves, scheduled-order changes and payment/close actions need ordered, idempotent commands or equivalent event sequencing. A one-time order insert is not enough to synchronize the full dine-in workflow.

### 6.4 Mode-specific server workflow

- Delivery: create order plus delivery task/dispatch eligibility in the appropriate transaction; require delivery address/area and server-calculated fee.
- Pickup/Takeaway: persist the order centrally and use the pickup/collection lifecycle; no rider task and no delivery address/area.
- Dine-in: persist open checks, table assignment, scheduled arrival/preparation and served/paid/closed state; no rider task.
- Keep Website/POS source attribution. Website phone quotas remain website-only; universal order idempotency still applies to both Website and POS.

## 7. Scope and guardrails

- No POS or website source files were edited.
- The hidden Dine-in/table UI was intentionally not repaired.
- No Batch 2 or later SQL was authored/applied by this review.
- No Production database, Vercel setting, domain, environment variable or deployment was changed.
- The website security audit remains deferred until immediately before connecting the website to the database.
- Before implementing offline sync, resolve secure actor attribution, multi-device table conflicts, command/event sequencing, stale-catalog review UX, and recovery from partial sync. Test retries/lost responses and concurrent table assignment against a disposable environment.
