# Flame Chick Production — Restaurant Installation & Test-Data Handoff

**Checkpoint date:** 2026-11-28 (Asia/Karachi)  
**Primary repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Continuation branch:** `release/pos-rider-delivery-optimization-2026-11-28`

## Read this first

This is the current continuation note for the next chat. Read it together with the [POS / Rider / Delivery Release Checkpoint](2026-11-28-pos-rider-delivery-release-checkpoint.md). Keep the work isolated to the production release stream.

Do not assume that restaurant installation or live operational readiness is complete. The software is deployed and one complete website delivery workflow was manually tested successfully, but the physical restaurant setup and remaining operational rehearsals are still pending.

## Current production deployment state

### POS
- URL: https://flamechickpos.itsfahadah1234.workers.dev
- Cloudflare Worker: `flamechickpos`
- Active version: **9**
- Version ID: `8b2f6ac4-0df4-4f74-84d2-c3f2b68c51d4`
- Deployment ID: `ca57b6b0-bcdb-4ade-9c92-657fa613dafe`
- Previous version 8 rollback point: `a6145175-caa0-4138-ba53-f5c7782d147d`
- Production deployment workflow run [46140147550](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147550) succeeded; Cloudflare reports 100% traffic on version 9.
- Receipt release regression workflow [46140147656](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147656) succeeded, including POS tests, build and Wrangler dry-run.

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

Treat this as a **successful single end-to-end test reported by the user**, not proof that every operational scenario has passed. The user has now separately reported that the actual restaurant printer was tested and is working with the current QZ setup. Basic physical printing is therefore confirmed by the user; receipt appearance/layout optimization remains the next task.

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
1. Open https://flamechickpos.itsfahadah1234.workers.dev in Chrome/Edge on the actual cashier computer.
2. Sign in using an individually assigned authorized staff account.
3. Confirm the correct branch, menu, and Online Orders inbox load.
4. Bookmark the URL or create a browser shortcut; it is a browser app, not a locally installed Windows POS executable.
5. Install the printer's Windows driver, connect it, and print a Windows test page.
6. Install QZ Tray from its official source: https://qz.io/download?os=windows and keep it running.
7. In POS, open **System & Data → Printing**.
8. Choose **Find Windows Printers**, select the receipt-printer queue, enable the QZ Tray direct-print preference, save, and send a clearly identified test receipt.
9. The user has completed a physical printer test and reports that it is working. The next chat should optimize receipt layout rather than repeat basic printer installation. Still verify persistence after a later POS refresh/QZ restart if that behavior has not already been exercised.

QZ Tray setup is now confirmed working with the restaurant printer by the user's physical test. Any additional cashier computer still needs its own local QZ Tray and printer setup.

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
2. Begin the new chat with the specific task: **optimize the QZ thermal receipt layout** on the deployed v9 POS. Read both handoffs and inspect current source before editing.
3. Preserve the currently working restaurant printer/QZ setup. Use the user's actual printed receipt and observations to refine the 80mm layout, logo, header, delivery details/charges, item wrapping, totals, payment block, footer, paper feed and cut behavior.
4. Keep changes isolated to POS receipt printing and regression tests. Run POS test suite, build and Wrangler dry-run before deployment. Version 9 remains the known rollback point until a subsequent verified deploy.
5. Decide how kitchen KOT will be handled, since separate direct kitchen printing is not yet verified.
6. Complete remaining operational rehearsals: dine-in, takeaway, simultaneous orders, rider decline/reassignment, 60-second offer expiry, failed delivery/physical return confirmation, role isolation, and disconnect/reconnect recovery.
7. Separately inspect and prepare the safe test-order cleanup; first settle whether any real money was involved. Do not execute the delete script until approved.
8. Later obtain the refreshed Edge Function invocation number from usage counters only; keep Supabase Logs untouched.


---

## Addendum — 2026-11-28 POS v9 receipt release and physical printer test

The QZ receipt changes have been merged and deployed to the existing Cloudflare POS Worker.

- GitHub repository: `itsfahadahmed1234-creator/flame-chick-platform`
- PR #2: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/pull/2 — merged.
- Merge commit: `50eb6e40143dd8f2bf7a824001a1de50a9de7d21`.
- Release branch: `release/pos-rider-delivery-optimization-2026-11-28`.
- Feature branch merged: `feature/pos-qz-receipt-layout-2026-11-28`.
- Production POS URL: https://flamechickpos.itsfahadah1234-creator.workers.dev
- Active Worker version: **9** (`8b2f6ac4-0df4-4f74-84d2-c3f2b68c51d4`).
- Deployment ID: `ca57b6b0-bcdb-4ade-9c92-657fa613dafe`.
- Cloudflare confirms 100% traffic on version 9.
- Previous version 8 remains the rollback point: `a6145175-caa0-4138-ba53-f5c7782d147d`.
- Production deploy workflow [46140147550](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147550) — success.
- POS/Rider release checks [46140147656](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147656) — success.
- The receipt-specific workflow passed regressions, POS build and Wrangler dry-run before deployment.

### What v9 changes in QZ receipt printing

- Existing Flame Chick receipt logo is included through printer-compatible ESC/POS image output.
- Receipt structure follows the POS receipt renderer more closely.
- Delivery orders show available customer delivery information and a **Delivery Charges** row.
- Dine-in and takeaway omit delivery-only details/charges.
- Legacy surcharge presentation is removed.
- Existing payment details, totals, feed and cut logic are retained.

### Physical printer status

The user has tested the printer at the restaurant and confirms that it is working with the current setup. Record the physical printer/basic QZ printing path as working. Do not confuse that with final receipt-layout acceptance: the user wants the next task to optimize the visual/print output further.

### Next new-chat task: optimize thermal receipt output

This is the immediate next task. Do not restart system installation, redesign POS, or move to order cleanup first.

1. Read this handoff and the linked POS/Rider/Delivery Release Checkpoint.
2. Inspect the existing v9 receipt implementation on the release branch before making changes.
3. Keep the current working printer, Generic / Text Only Windows queue, QZ Tray connection and existing certificate arrangement intact unless a specific fault is demonstrated.
4. Compare the printed output against the user's reference and optimize:
   - proper 80mm print width, margins, line spacing and alignment;
   - logo dimensions, clarity and centered header;
   - restaurant contact and invoice metadata;
   - delivery customer name, phone, address, area and instructions;
   - Delivery Charges and grand total, never a Surcharge row;
   - item names, modifiers, quantities, price columns and long-text wrapping;
   - payment method/status and footer;
   - feed length and automatic cutter command.
5. Ask the user to share a clear photo of the latest printed receipt or describe the specific layout defects. Do not guess at visual changes that cannot be seen.
6. Make receipt-only changes within POS source/tests. Do not modify Website, Admin, Rider, Supabase, order APIs, database schema, Auth, secrets, or shared contracts.
7. Run the full POS regression suite, build and Wrangler dry-run. Deploy only after successful verification and preserve Worker v9 as the rollback point.
8. Obtain user's confirmation from the actual physical print before marking receipt layout accepted.

The separate kitchen KOT limitation, remaining operational rehearsals, safe test-order cleanup process, Edge Function usage baseline and all hard prohibitions below remain in force.
