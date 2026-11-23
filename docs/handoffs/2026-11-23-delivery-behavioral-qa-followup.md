# POS/Rider delivery integration — Step 2 source checks PASSED — 2026-11-23

**Branch:** `work/production-source-audit`  
**POS/Rider source:** `45af748ee2184e58072e90a5fd932ede11416072`  
**POS/Rider static QA:** [45198567593 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198567593)  
**Edge TypeScript/contracts:** [45198081185 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198081185)  
**Disposable DB lifecycle/payment tests:** [45197859536 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45197859536)  
**Admin static checks:** [45198568180 — success](https://github.com/itsfahamed1234-creator/flame-chick-platform/actions/runs/45198568180)

## Step 2 changes

1. **Delivered remains active in POS.** The Order API active board includes `delivered`; POS keeps it in the third column renamed **Delivery & Awaiting Payment**, displays **Delivered · awaiting cashier payment collection**, counts it as active and does not complete or hide it.
2. **Rider confirmation is delivery-only.** Rider toast clarifies that delivery is marked but cashier payment collection is still pending. No at-restaurant stage exists; the flow remains **Accept offer → Picked up → Delivered**.
3. **POS Rider availability is now fed the expected fields.** Dispatch query returns `accepting_jobs` and `last_seen_at` as well as Rider ID, name, phone, active and availability state. This fixes the mismatch where POS filtered on fields the Edge API did not return.
4. **Cashier can confirm physical returns.** POS render path and handler permit Cashier alongside Manager/Admin/Owner, matching the database RPC. Rider must still report physical return first; staff physically verifies the handover.
5. **Returned orders reach Cancelled Orders history.** Order API `all` board exposes `returned`; POS maps its label, and the existing Cancelled Orders history tab includes both `cancelled` and `returned`, including offline/local fallback.
6. **Delivery SQL no longer prematurely completes orders.** Rider `delivered` sets delivery/order delivered facts and releases the Rider; it no longer sets `completed_at` or returns a completion timestamp. Staff-confirmed physical return sets `returned_at` but not `completed_at`.
7. **SQL behavioral fixture strengthened.** After Rider delivery, asserts order delivered but `completed_at IS NULL`, `payment_status='unpaid'`, `paid_amount=0`, and `balance_due=total`. After physical return it asserts the order is returned, not completed, still unpaid, with no payment record.

## Verification

- [45197859536](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45197859536): complete local migration replay; staff ACL/RLS + roles; operational schema; delivery lifecycle and expiry; delivered/return financial-state assertions; all four concurrent PostgreSQL races; disposable stack shutdown — all passed.
- [45198081185](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45198081185): Deno checks on catalog, order, delivery and staff Edge Functions; Edge contract tests — passed.
- [45198567593](https://github.com/itsfahamed1234-creator/flame-chick-platform/actions/runs/45198567593): POS/Rider JS parse and source-hygiene tests — passed.
- [45198568180](https://github.com/itsfahmed1234-creator/flame-chick-platform/actions/runs/45198568180): Admin static checks — passed.
- Preview deployment workflows were skipped. This work has **not been deployed** to Vercel or Supabase Production.

## Authoritative workflow — delivery is not collection

Rider `Delivered` means food was handed to the customer. It does not imply cash/payment received and does not complete the order. POS keeps it in active **Delivered / awaiting payment collection** until Cashier records the payment as **Collected**. Collection must record amount, method, actor and time. Only after the required balance is collected may the backend mark the order **Completed**, set `completed_at`, and move it into Order History.

A returned order remains `returned`, not paid or completed; payment/refund reconciliation remains a distinct finance decision. GST remains deferred.

## Next stage — Cashier payment collection

Implement the separate server-side Cashier payment-collection transaction and the POS action. It must lock the order/payment state, validate outstanding balance, append an auditable payment row, update paid amount/payment status, support partial collection (order remains delivered/active), and complete/history only when fully collected. Add idempotency/duplicate/overpayment/return-reconciliation tests. Rider must never be able to record payment or complete the order.

Flame Chick is a pre-launch build. The partly provisioned Supabase Production project is the target environment; no target DB writes or application deployments occurred in this source/QA stage.
