# Delivery concurrency QA — Step 1 PASSED — 2026-11-23

**Branch:** `work/production-source-audit`  
**Concurrency test source commit:** `eda617341dda21846573e6c4e66c72e190f7fd10`  
**Passing CI:** [Flame Chick Staff Admin Role Boundary QA — run 45188384720](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45188384720)

## Four real concurrent PostgreSQL-session races — passed

The disposable local Supabase fixture uses separate `psql` sessions. A test-only trigger scoped to the synthetic `flame-chick` tenant pauses status updates after the delivery command has acquired the task/offer row locks. The competing command is then proven to be waiting on the PostgreSQL lock (or the expiry sweeper must complete using `SKIP LOCKED`).

1. **Accept wins over decline.** Rider acceptance succeeds; the concurrent decline returns `DELIVERY_OFFER_ALREADY_RESOLVED`.
2. **Decline wins over accept.** Rider decline succeeds; the concurrent accept returns `DELIVERY_OFFER_ALREADY_RESOLVED`.
3. **Accept wins over expiry sweep.** Acceptance occurs one microsecond before expiry while holding the task lock. The sweep tests at the exact deadline and reports `expired_count=0` because it skips the locked task.
4. **Expiry wins over accept.** The sweep expires the offer at the deadline while holding the task lock; the waiting accept receives `DELIVERY_OFFER_ALREADY_RESOLVED`.

Each race verifies offer/task/order state, no more than one current assignment, Rider availability and the corresponding mutually exclusive accept/decline/expiry audit event counts. Final CI output: **all four races produced one coherent terminal state, at most one current assignment, and matching audit events.**

The full workflow also passed complete migration replay, staff ACL/RLS baseline, Admin/Owner/operational-role authorization, synthetic fixture checks, operational schema constraints/security, the previous delivery lifecycle + exact expiry boundary fixture, and disposable Supabase teardown.

## Existing delivery verification retained

- Targeted Rider assignment; no automatic rotation.
- Wrong-Rider offer denial.
- Idempotent acceptance; pickup; delivered retry.
- Failed delivery and Rider return report.
- Rider cannot confirm physical return; Cashier can confirm.
- Delivery and physical return do not modify the payment ledger.
- Offer accepted one microsecond before expiry; offer expires at the exact 60-second boundary; POS must manually reassign.

## Authoritative delivery/payment workflow

Rider **Delivered** means the food was handed to the customer. It does not mean payment was received and does not complete the order. POS keeps the order active in **Delivered / awaiting-payment**. The order remains unpaid/outstanding until the Cashier physically receives and explicitly marks payment **Collected**, recording amount, method, actor and time. Only then does POS set **Completed**, set `completed_at`, and move the order into history.

**Required correction before app integration:** the current candidate `flame_chick_manage_delivery(action='delivered')` sets `orders.completed_at` during the Rider action. Remove this premature completion; Rider delivery must not update payment status. Add a separate Cashier collection command and end-to-end tests proving only recorded collection completes the order. Do not infer refund/payment handling for physically returned orders. GST remains deferred.

## Next

Step 1 is complete. Proceed to **Step 2: review and connect the existing POS and Rider apps** against the verified service contract:
- POS manually selects one Rider for each targeted offer.
- Rider flow remains **Accept offer → Picked up → Delivered**; no restaurant-arrival step.
- Riders see only their own offers/jobs.
- Cashier and Manager can confirm physical returns, and returned orders appear in the correct POS queue.
- Keep payment collection separate from delivery before wiring the Delivered action into the active POS order lifecycle.

This run used disposable local Supabase only. Flame Chick is a pre-launch build; the designated Supabase Production project remains the partly provisioned target environment. No target database writes, app deployments, Realtime enablement or checkout activation occurred in this QA stage.
