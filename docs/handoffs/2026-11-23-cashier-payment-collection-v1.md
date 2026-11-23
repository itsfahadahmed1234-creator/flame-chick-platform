# Cashier payment collection V1 — implementation and QA PASSED — 2026-11-23

**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Payment migration:** `supabase/migrations/20261123173000_flame_chick_payment_collection_v1.sql`  
**Payment command source commit:** `5c7344bee65e4c960363cc840dd84b4edcf436ab`  
**POS retry-safety/source-test commit:** `b653ec962d6130729cf88d1514764cc9671bed9a`

## Verification — all passed

- **Disposable Supabase migration replay + role/security + lifecycle + six concurrency races:** [run 45204886242 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204886242). Completed all steps, including the migration history replay, staff ACL/RLS, operational schema, delivery/payment behavior fixture, six simultaneous PostgreSQL session races, and disposable stack teardown.
- **Payment concurrency evidence:** [run 45204718345 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204718345). Logs explicitly show:
  - Race 5/6: concurrent identical Cashier submissions with one request ID returned one ledger row; retry reported `already_processed`.
  - Race 6/6: two competing collection attempts that would over-collect serialized; the second was rejected with `PAYMENT_AMOUNT_EXCEEDS_BALANCE`.
  - Final marker: all four delivery races and both payment races produced coherent terminal states and matching ledger/audit records.
- **POS/Rider JavaScript and source tests:** [run 45205077273 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45205077273).
- **Order/Delivery Edge Function type and contract tests:** [run 45204896684 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204896684).
- **Admin static checks:** [run 45204904608 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204904608).
- **POS preview deployment:** [run 45204904731 — skipped](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204904731).

## Database command

Added service-role-only `public.flame_chick_collect_order_payment(jsonb)` as a security-definer transaction with an empty search path and postgres ownership. The browser cannot call the RPC directly or write to the payment ledger.

The trusted Order Edge Function:
- verifies the caller's Auth identity;
- permits only the authenticated Admin, Owner, Manager or Cashier role for the authorized branch;
- derives `actor_user_id` from the verified token, never from the browser payload;
- requires a UUID idempotency request ID, a positive numeric amount, and an allowed method (`cash`, `card`, `bank`, `wallet`, `other`);
- invokes the service-only RPC.

The database command independently validates the branch-scoped staff role, locks the order before reading/updating the outstanding balance, writes the payment ledger row with method, amount, collector, request key and timestamp, and records an order-status audit event. It rejects invalid/over-precision amounts, unsupported payment methods, mismatched request-ID reuse, overpayment, settled/unsupported financial states, undelivered orders, and returned orders.

## Business behavior now enforced

- **Collection is allowed only after a delivery is marked Delivered** and only while the financial status is `unpaid` or `partially_paid`.
- Partial receipt updates `paid_amount` and `payment_status='partially_paid'`, leaves order status `delivered`, preserves the outstanding generated `balance_due`, and does not set `completed_at` or `collected_at`.
- When the outstanding balance reaches zero, the same transaction inserts the final payment, sets payment status `paid`, sets order status `completed`, and records `collected_at` and `completed_at`.
- Different methods across separate collection rows produce payment summary `mixed`.
- Same request ID + same amount/method/actor is idempotent and returns the original ledger row. Reusing the key with changed payment facts is a conflict.
- The order-row lock serializes simultaneous payment collection; it prevents duplicate ledger movements and stale over-collection.
- Rider cannot collect payment. The Rider API still has no payment action. A Rider's Delivered action stays delivery-only.
- A physically returned order remains `returned` and unpaid; return/refund reconciliation remains a separate finance decision. No refunds are inferred or created.

The Cashier POS view now shows **Collect Payment** on a delivered order, displays paid/outstanding amounts, and opens a collection modal for amount and payment method. Before opening the modal it refreshes the order board. After an uncertain network response, it preserves the same request ID and requires the same amount/method for retry; it does not silently issue a new payment ID.

## Disposable tests

The rollback-only delivery command fixture now exercises:
1. Rider collection denied.
2. Order not yet delivered cannot be settled.
3. Partial collection leaves delivery active and balance outstanding.
4. Amount precision beyond two decimal places rejected.
5. Same-request retry returns exactly one payment row.
6. Changed facts under the same idempotency key rejected.
7. Overpayment rejected without a ledger entry.
8. Final balance collection marks paid/completed and stores collection/completion time.
9. Mixed methods are reflected in the order summary.
10. Full-payment retry remains idempotent.
11. Returned order cannot be paid through this command.
12. Delivery/return lifecycle itself does not alter the payment ledger.

The concurrency harness extends the original four delivery races with two real concurrent Cashier payment sessions. Payment triggers and synthetic orders exist only in disposable local Supabase and the entire stack is shut down by CI.

## Boundaries / next work

- This is **staff-recorded/manual payment collection**, not a payment gateway, card processor, bank verification, wallet integration, or online payment settlement. No card credentials or sensitive payment-instrument details are collected by this UI.
- Refunds, returned-order financial reconciliation, write-offs and cash-register shift reconciliation remain separate designs.
- Website order creation/checkout connection, live payment flows, target Supabase Production migration application, function deployments, Vercel deployment, Realtime activation and go-live release checks are not completed by this step.
- GST remains deferred.
- No Supabase Production operational migration, payment write, Edge deployment or app deployment occurred. Preview workflow was skipped; the POS code is source-tested only.
- Keep `main` untouched; continue on `work/production-source-audit`.

## Next implementation stage

Continue with customer website/order checkout integration against the tested server-side order API and published catalogue. Keep server-side pricing, delivery fee validation, order idempotency and current website order throttles authoritative. Do not add online-payment gateway logic or turn checkout on until its separate security, financial settlement and release checks are designed and passed.
