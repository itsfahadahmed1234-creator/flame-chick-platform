# Cashier payment collection V1 — Step 3 complete — 2026-11-23

**Branch:** `work/production-source-audit`  
**Full disposable DB QA, including six concurrent races:** [45204886242 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204886242)  
**Explicit payment race output:** [45204718345 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204718345)  
**POS/Rider static:** [45205077273 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45205077273)  
**Edge type/contracts:** [45204896684 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204896684)  
**Admin static:** [45204904608 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204904608)

## Implementation

The new migration `supabase/migrations/20261123173000_flame_chick_payment_collection_v1.sql` adds a postgres-owned `SECURITY DEFINER` RPC with an empty search path, service_role-only execution, no direct browser table write grants, branch-scoped staff authorization and order-row locking.

The trusted Order API exposes `action:'collect_payment'`:
- verifies the authenticated user and Cashier/Manager/Admin/Owner role;
- derives the actor ID from Auth, validates request ID/amount/method and calls the private database transaction;
- never accepts a client-supplied actor or exposes the service secret.

POS displays **Collect Payment** for Delivered orders, displays total/paid/due amounts, offers amount + method (cash/card/bank/wallet/other), refreshes the authoritative board before opening, and retains the same idempotency request ID after an uncertain response. The UI prevents changing amount/method until a new, refreshed attempt is opened.

## Behavior

- Partial payment creates an auditable payment row, sets `paid_amount` and `partially_paid`, leaves order `delivered` with a remaining balance and does not set `completed_at`/`collected_at`.
- Full collection creates the final payment row, sets `paid`, changes order to `completed`, and records `collected_at` + `completed_at` in the same transaction.
- Allowed financial starting states are only `unpaid` and `partially_paid`. Only a Delivered delivery order can be collected; returned/undelivered/settled orders are rejected.
- Amount must be positive, at most 2 decimal places and no greater than the outstanding balance.
- Idempotency uses a UUID request key. Same request facts return the original ledger entry; changed facts with the same key return conflict.
- Cashier/Admin/Owner/Manager can record; Rider is explicitly denied. Delivery and return commands still do not create payments.
- If different methods are used for partial and final collection, order summary is `mixed`.
- Return/refund reconciliation stays separate. No refunds are created and GST stays deferred.

## Tests and CI

The rollback-only SQL behavior fixture checks Rider denial, undelivered/returned order denial, partial payment, precision rejection, same-request retry, changed-payload conflict, overpayment rejection, final completion and mixed payment methods.

The local concurrency harness uses separate PostgreSQL sessions for six races:
1. Accept vs decline — accept wins.
2. Decline vs accept — decline wins.
3. Accept before deadline vs expiry sweeper — `SKIP LOCKED` preserves the locked accept.
4. Expiry at deadline vs accept — expiry wins.
5. Two simultaneous identical Cashier submissions — one payment row; second returns `already_processed`.
6. Two simultaneous collection attempts that would over-collect — one succeeds; one gets `PAYMENT_AMOUNT_EXCEEDS_BALANCE`.

[Run 45204886242](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204886242) replayed full migration history, verified security/roles/schema, ran delivery/payment behavior and concurrency fixtures, and shut down disposable Supabase successfully. [Run 45205077273](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45205077273) passed POS/Rider browser/source tests. [Run 45204896684](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204896684) passed Deno Edge type/contracts. [Run 45204904608](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45204904608) passed Admin static tests.

## Not deployed / next

POS preview deployment was skipped. No target Supabase Production migration or payment data write, Edge deployment, Vercel deployment, Realtime activation or checkout activation occurred. This is source-validated only.

Next stage: customer website/order checkout integration against published catalogue and tested Order API. Keep server-side prices, delivery fee, idempotency and website order rate limits authoritative. Online payment gateway, refund and financial reconciliation are out-of-scope separate stages. GST deferred.

---

