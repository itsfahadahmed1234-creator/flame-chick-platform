# Flame Chick Production — Restaurant Installation & Test-Data Handoff

**Checkpoint date:** 2026-11-28 (Asia/Karachi)  
**Primary repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Continuation branch:** `release/pos-rider-delivery-optimization-2026-11-28`

## Read this first

This is the current continuation note for the next chat. Read it together with the [POS / Rider / Delivery Release Checkpoint](2026-11-28-pos-rider-delivery-release-checkpoint.md). Keep the work isolated to the production release stream.

Do not assume that restaurant installation or live operational readiness is complete. The software is deployed and one complete website delivery workflow was manually tested successfully, but the physical restaurant setup and remaining operational rehearsals are still pending.

## Current production deployment state

### POS
- URL: https://flamechickpos.itsfahadahmed1234.workers.dev
- Cloudflare Worker: `flamechickpos`
- Active version: **8**
- Version ID: `a6145175-caa0-4138-ba53-f5c7782d147d`
- Deployment ID: `79e98bf7-6bbb-480d-bcd0-6fb357c7a52f`
- Production deployment workflow run [46128209921](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46128209921) succeeded.
- POS Worker/refresh regression: **13 passed, 0 failed**.

### Rider
- URL: https://flamechickrider.pages.dev
- Active production Pages deployment: `4ddbf528-6c16-455f-9601-8d0ca43a21a9`
- Production branch commit: `4e45de24fe56fe81436a538b28a21e8cf69121c3`

### Delivery API
- Supabase project: Flame Chick Production, project ref `adkrxfnawdiljhjaavnj`, Mumbai region `ap-south-1`.
- `flame-chick-delivery-api`: version **5**, ACTIVE.
- Existing `verify_jwt=false` configuration is deliberate; the function performs the existing Auth validation and OPTIONS handling itself.

### Other deployed portals
- Customer website: https://flamechick.pages.dev
- Admin portal: https://flamechickadmin.pages.dev
- POS, Rider, and Admin are separate applications. Do not conflate deployment ownership across streams.

## Manual test result reported by the user

The user confirmed that they:
1. Opened the deployed POS after the Worker v8 deployment.
2. Confirmed QZ Tray was working on the computer they were using.
3. Placed a test order through the customer website.
4. Followed it through POS and Rider delivery.
5. Completed the end-to-end workflow including the payment-collection stage.
6. Reported that the whole workflow ran smoothly.

Treat this as a **successful single end-to-end test reported by the user**, not proof that every operational scenario or the actual restaurant hardware has passed. QZ Tray has not yet been confirmed on the physical restaurant cashier computer/printer.

## Restaurant installation plan — no on-premises server required

The production apps and Supabase backend are hosted. The restaurant needs client devices, local printing equipment, reliable connectivity, and properly provisioned staff accounts; do not plan an in-store database/server installation.

### Initial recommended setup
- One Windows 10/11 cashier computer or laptop with a current Chrome or Edge browser.
- One compatible 80 mm thermal receipt printer, connected and installed in Windows with its correct driver.
- QZ Tray installed and running on the cashier computer. QZ Tray is a local bridge between the POS browser and Windows printer.
- A mobile phone with internet for the Rider portal.
- Reliable broadband/Wi-Fi, an alternate mobile hotspot, and UPS protection for the router/cashier workstation where practical.

Start with one cashier terminal. Add more terminals only after the first terminal and its printer are stable.

### POS installation at the restaurant
1. Open https://flamechickpos.itsfahadahmed1234.workers.dev in Chrome/Edge on the actual cashier computer.
2. Sign in using an individually assigned authorized staff account.
3. Confirm the correct branch, menu, and Online Orders inbox load.
4. Bookmark the URL or create a browser shortcut; it is a browser app, not a locally installed Windows POS executable.
5. Install the printer's Windows driver, connect it, and print a Windows test page.
6. Install QZ Tray from its official source: https://qz.io/download?os=windows and keep it running.
7. In POS, open **System & Data → Printing**.
8. Choose **Find Windows Printers**, select the receipt-printer queue, enable the QZ Tray direct-print preference, save, and send a clearly identified test receipt.
9. Verify printing after a POS refresh and after a QZ Tray/computer restart.

QZ Tray on the user's current computer does not mean it is installed on the restaurant's computer. Repeat local setup at the restaurant.

### Important current kitchen-printing limitation
- The current POS defaults to Counter Receipt enabled and Kitchen KOT disabled.
- The current direct QZ printer selection/routing is for the counter receipt.
- Do not assume that enabling the Kitchen KOT checkbox gives a separately routed direct kitchen printer. A separate kitchen printer workflow has not been installed and verified; the current code path can fall back to the browser print dialog for non-counter destinations.
- Before relying on automatic kitchen tickets, implement and test explicit kitchen-printer routing or decide on a documented manual KOT process. Do not claim kitchen ticket printing is production-ready.

### Rider and Admin setup
- Rider portal: https://flamechickrider.pages.dev — open on the rider's phone, sign in with that rider's own credentials, and test only the rider's own branch/offers.
- Admin portal: https://flamechickadmin.pages.dev — access restricted to the Admin/Owner model.
- Use separate named staff accounts, never a shared cashier/rider login.
- The user's Admin account is the first full-access account. A separate Owner account is planned for later; do not turn the Admin account into the Owner.
- Role model:
  - Admin and Owner: full business authority.
  - Manager: POS operations and confirm physical failed-delivery returns; no Admin panel and no deletion authority.
  - Cashier: POS, rider assignment and permitted order operations; no deletion authority.
  - Rider: only the Rider's own offers and assigned delivery tasks.

## Current order-test data status

- The user states that **all orders currently in Flame Chick are test orders** and wants them removed before normal restaurant use.
- No order deletion, data cleanup, SQL write, migration, or Supabase data mutation has been performed.
- The POS Order History has no delete action for submitted orders. The trash icon beside Place Order only clears an unsent cart.
- The production schema uses restrictive foreign keys across order records and related data. Relevant tables include:
  - `public.orders`
  - `public.order_items`
  - `public.order_item_components`
  - `public.order_item_modifiers`
  - `public.order_status_history`
  - `public.payments`
  - `public.delivery_tasks`
  - `public.delivery_task_offers`
  - `public.delivery_assignments`
  - `public.delivery_task_events`
  - `app_private.website_order_success_events` (website order idempotency/rate-limit accounting relation)
  - `app_private.notification_outbox` may contain related order aggregate IDs; inspect carefully before cleanup.
- Do not delete only rows from `public.orders`, because related FK records use `ON DELETE RESTRICT`.
- The read-only inventory query below was provided to the user but **has not been run**:

```sql
SELECT
    o.order_number,
    o.source,
    o.status,
    o.total,
    o.paid_amount,
    o.payment_status,
    o.created_at
FROM public.orders o
JOIN public.restaurants r
    ON r.id = o.restaurant_id
WHERE r.slug = 'flame-chick'
ORDER BY o.created_at;
```

### Required safeguards before deleting test records
1. Start with read-only inventory and relationship counts for the Flame Chick restaurant/branch.
2. Confirm the exact scope with the user; their statement is that all current orders are test orders.
3. Confirm whether any actual cash, card, bank, or other real money was transferred/received during the payment-collection test. Do not erase evidence of real financial movement.
4. Produce a reviewed transaction-only cleanup plan/script with exact order IDs and dependent records. Keep menu/catalog, restaurants, branches, staff/Auth users, rider profiles, roles, delivery configuration, and operational settings.
5. Preserve order-number counters unless a deliberate, separately approved numbering reset is required.
6. Show pre-delete and post-delete row counts. Do not execute destructive SQL until the cleanup plan and financial treatment have been explicitly agreed.
7. Do not edit/deploy POS UI merely to add a delete button as a workaround.

## Edge Function usage comparison

- User-reported pre-test baseline: **445 Edge Function invocations**.
- Supabase usage counters refresh hourly; there is no confirmed post-test refreshed figure yet.
- Compare the same project, usage metric and reporting period after dashboard refresh. Background app usage may be included in the delta, so do not claim the entire difference is exclusively from one test order.
- Do not use logs to measure invocations.

## Critical prohibitions and project boundaries

### Supabase Logs — absolute do-not-touch restriction
- The user explicitly forbids touching the expensive Supabase log query. It previously reached 102 GB and the user later observed 106 GB; the user does not know why or who caused the increase.
- **Never run, open, edit, recreate, debug, repeat, investigate, or otherwise touch that query.**
- Do not open Supabase Logs Explorer or use `query_logs`, Postgres logs, Edge Function logs, log exports, or any equivalent path.
- Do not investigate who caused the GB increase. No assumptions or blame.
- Do not change Log Ingestion, drains, retention, or telemetry without separate explicit approval. Log Ingestion is a distinct meter; it is not permission to access log queries.

### Other guardrails
- Stay on Supabase Free plan; do not upgrade without explicit approval.
- No migrations, secrets/Auth changes, schema changes, or writes without explicit approval.
- GST remains deferred; do not add GST/tax calculations or columns.
- Do not edit/deploy the Customer Website, Admin, Order API, Staff Admin, shared RPCs, or shared contracts from this POS/Rider release chat; another workstream owns those. Manual use of deployed website to place the user's explicitly requested test order was allowed, but source edits remain out of scope.
- Preserve source/feature branches and the isolated release branch. Do not merge/rebase/force-push or touch unrelated streams without explicit direction.
- Keep the restaurant in supervised-test status. Do not declare full live operations ready until on-site installation, required workflows, permissions, printer recovery, and full manual rehearsal have passed and the user accepts them.

## Suggested next-chat sequence

1. Read this document and the linked release checkpoint before taking action.
2. Ask whether the restaurant has the Windows cashier PC and receipt printer ready; hardware availability has not been confirmed yet.
3. Plan on-site setup for the cashier PC, Windows printer driver, QZ Tray, and one genuine test receipt.
4. Decide how kitchen KOT will be handled, since separate direct kitchen printing is not yet verified.
5. Complete remaining operational rehearsals: dine-in, takeaway, simultaneous orders, rider decline/reassignment, 60-second offer expiry, failed delivery/physical return confirmation, role isolation, and disconnect/reconnect recovery.
6. Separately inspect and prepare the safe test-order cleanup; first settle whether any real money was involved. Do not execute the delete script until approved.
7. Later obtain the refreshed Edge Function invocation number from usage counters only; keep Supabase Logs untouched.
