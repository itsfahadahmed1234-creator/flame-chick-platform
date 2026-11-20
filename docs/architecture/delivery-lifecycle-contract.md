# Flame Chick Production — Delivery Lifecycle Contract

**Status:** Owner-confirmed business rules and proposed implementation contract  
**Date:** 2026-11-20  
**Production status:** Design only; no SQL or live changes.

## 1. Confirmed outcomes

| Situation | Required behavior |
|---|---|
| Rider rejects | Offer becomes rejected; task returns to POS dispatch queue. Cashier or Manager manually selects another rider. |
| No response | Offer expires exactly 60 seconds after server-recorded creation; task returns to POS for manual reassignment. |
| Delivery fails | Assigned Rider may report failure and choose to return. This is not physical receipt confirmation. |
| Delivery succeeds | Rider marks delivered; task and order complete immediately in one transaction. No staff confirmation or proof/OTP/photo in V1. |
| Physical return | Cashier or Manager confirms receipt at restaurant. Rider cannot self-confirm. |

No automatic next-rider offer is created. Every reassignment creates a new offer attempt. Cashier's return-confirmation permission does not grant general cancellation authority. No normal app role hard-deletes orders.

## 2. Separate state machines

### Offer
- `pending` → `accepted`
- `pending` → `rejected`
- `pending` → `expired`

Exactly one terminal outcome. No transition out of a terminal state. Reassignment creates a new offer row.

### Delivery task
- `awaiting_assignment` → `offered`
- `offered` → `awaiting_assignment` after rejection or expiry
- `offered` → `assigned` after addressed Rider accepts
- `assigned` → `picked_up` → `out_for_delivery`
- `out_for_delivery` → `delivered`
- `out_for_delivery` → `return_pending_confirmation` after Rider reports failure and chooses return
- `return_pending_confirmation` → `returned` after Cashier or Manager confirms physical receipt

Rider's report does not mean the restaurant has received the order.

### Order
Keep order acceptance/preparation status separate from delivery-task status. Successful delivery moves the order to its completed/delivered terminal state immediately. Confirmed physical return moves it to a distinct `returned` (or equivalent failed-delivery) terminal state. Never mark a returned order delivered. Normalize exact enum/text values against the existing Order API before SQL.

## 3. Proposed field-level tables

Use UUID primary keys, tenant/branch composite keys and foreign keys. Server commands—not clients—set scope, actor, state and timestamps.

### delivery_tasks
One row per delivery order (`UNIQUE(order_id)`), created transactionally when dispatch becomes available.

- `id`, `restaurant_id`, `branch_id`, `order_id`
- `status`
- `recipient_name_snapshot`, `recipient_phone_snapshot`
- `delivery_address_snapshot`, `delivery_instructions_snapshot`
- `delivery_area_id_snapshot`, `delivery_area_label_snapshot`, `delivery_selection_type_snapshot`
- `delivery_fee_snapshot`
- `ready_for_dispatch_at`, `picked_up_at`, `delivered_at`
- `return_reported_at`, `return_confirmed_at`
- `return_reason_code`, bounded `return_note`, `return_confirmed_by`
- `created_at`, `updated_at`

Current rider is derived from the one current assignment; do not maintain a separate authoritative rider field without a demonstrated query need.

### delivery_task_offers
One immutable attempt per selected rider.

- `id`, `restaurant_id`, `branch_id`, `task_id`, `rider_user_id`
- `offer_round` (monotonic per task)
- `status` (`pending`, `accepted`, `rejected`, `expired`)
- `offered_at`, `expires_at` (server-generated; exactly offered_at + 60 seconds)
- `responded_at`
- `created_by` (verified dispatch actor)
- `request_id` (idempotency/correlation key)

Constraints/indexes: unique `(task_id, offer_round)`; at most one pending offer per task via partial unique index; `expires_at > offered_at`; composite FKs ensure task, branch and rider eligibility agree. Candidate indexes: `(rider_user_id, status, expires_at)` and `(branch_id, status, expires_at)`.

### delivery_assignments
An accepted offer creates the assignment atomically.

- `id`, `restaurant_id`, `branch_id`, `task_id`
- `offer_id` (unique), `rider_user_id`
- `status` (`active`, `completed`, `released`)
- `assigned_at`, `accepted_at`, `picked_up_at`, `delivered_at`, `ended_at`

Use a partial unique index for one current assignment per task (`ended_at IS NULL` and active status), plus `(rider_user_id, status)`. Composite FKs must ensure task, accepted offer, branch and rider agree.

### delivery_task_events
Append-only lifecycle/audit stream.

- `id`, `restaurant_id`, `branch_id`, `task_id`
- optional `offer_id`, `assignment_id`
- `event_type`, `from_status`, `to_status`
- `actor_user_id`, `actor_role` (null only for system expiry event)
- `occurred_at` (server time)
- optional `reason_code`, bounded `note`
- `request_id`
- `safe_metadata` (allowlisted non-sensitive data only)

No browser UPDATE/DELETE. Append the event and update current state in the same transaction. Order transitions also append `order_status_history` in that transaction.

## 4. Transactional command contracts

All commands derive actor and role from a verified JWT (or authenticated internal system invocation). Never trust client actor IDs, role, timestamp, expiry, branch, fee or target status.

### create_delivery_offer(task_id, rider_user_id, request_id)
Caller: Admin, Owner, Manager or Cashier with branch dispatch permission. Lock task; require dispatch-ready order, task awaiting assignment, no current assignment and no pending offer. Validate rider is active/eligible for branch. Set server `offered_at` and `expires_at = offered_at + 60 seconds`; insert offer, set task offered, append event and enqueue notification/outbox work atomically. No automatic rotation.

### accept_delivery_offer(offer_id, request_id)
Caller: addressed Rider only (`offer.rider_user_id = auth.uid()`). Lock task and offer consistently. Require pending status and database time strictly before expiry. At or after expiry, reject even if stored status still says pending. Require task offered and no current assignment. Atomically accept offer, insert one current assignment, set task assigned and append event. Concurrent accept/reject/expiry must have one winner.

### reject_delivery_offer(offer_id, reason_code, note, request_id)
Caller: addressed Rider only. Require pending and database time strictly before expiry. Set rejected/responded time, task awaiting assignment, append event. Do not create another offer.

### expire_delivery_offers(branch_id, batch_limit)
Internal-only bounded command. Find pending offers where expires_at <= database time, lock rows with `FOR UPDATE SKIP LOCKED` (or equivalent), re-check state/deadline, expire them, return task to awaiting assignment only if this remains its active offer and there is no current assignment, append one system event and enqueue POS notification. Idempotent and safe with concurrent responses. The worker updates visibility; it does not define the 60-second validity boundary.

### get_pos_dispatch_queue(branch_id)
Caller: Cashier, Manager, Admin or Owner authorized for branch. Run a bounded expiry sweep for due offers, then return branch-scoped dispatch tasks and current offer outcome. POS 15-second polling recovers missed Realtime events; queue correctness must not depend on Realtime.

### mark_delivery_picked_up / mark_out_for_delivery
Caller: Rider on current active assignment only. Validate ownership and transition; set server timestamps and append events. Do not add a separate arrival state unless existing UI/workflow requires it.

### mark_delivery_delivered(task_id, request_id)
Caller: Rider on current active assignment. Require task out_for_delivery. In one transaction: task delivered, assignment completed/ended, order delivered/completed, server timestamps, task event and order status history. Idempotent retry must not duplicate effects. No staff confirmation/proof in V1.

### report_failed_delivery_return(task_id, reason_code, note, request_id)
Caller: Rider on current active assignment. Require out_for_delivery. Set task return_pending_confirmation and store failure/return report; append event. Keep order non-delivered. Do not set returned_at, return_confirmed_by, task returned or order returned yet.

### confirm_physical_return(task_id, outcome, reason_code, note, request_id)
Caller: Cashier, Manager, Admin or Owner with branch POS permission. Require return_pending_confirmation and correct branch. In one transaction: task returned; set confirmation actor/time/outcome; end assignment as released/returned; move order to distinct returned terminal status; append task event and order status history. Rider cannot call successfully. Duplicate confirmation cannot duplicate state or effects. Never delete the order.

## 5. Expiry execution on Supabase Free

Correctness must not depend on a paid scheduler, continuous worker, Realtime or exact background timing.

1. **Hard deadline:** accept command compares database server time with expires_at inside the locked transaction. At 60 seconds the offer is no longer acceptable even if no expiry sweep ran.
2. **Lazy bounded expiry:** POS dispatch queue fetch runs a bounded, idempotent expiry sweep for that branch.
3. **Optional scheduler:** add periodic database/Edge Function scheduling only after verifying capability/configuration on the actual Free project. It improves visibility, not correctness.
4. **Fallback:** POS keeps its 15-second polling fallback; Realtime is best-effort. Next fetch repairs missed events.
5. **Bounded work:** index pending status/deadline, process limited batches, use SKIP LOCKED or equivalent. Avoid full-table scans.
6. Use database time, never Rider device clock.

## 6. Authorization and Realtime

- Browser clients receive no direct INSERT/UPDATE/DELETE on tasks, offers, assignments or task events. Use authenticated Delivery API/narrow commands.
- Rider reads are bound to `auth.uid()` and active rider profile; no branch-wide Rider offer policy.
- POS reads are branch-scoped and role-gated; Cashier/Manager receive only operational fields needed for dispatch and physical return.
- Rider sees own-job operational events only; Cashier/Manager see branch operational events; Admin/Owner full audit.
- Realtime is targeted to addressed Rider offers/assignments and branch POS dispatch changes. Order History remains normal fetch/manual refresh.

## 7. Candidate indexes and constraints

- Partial unique pending offer per task.
- Unique `(task_id, offer_round)`.
- `(rider_user_id, status, expires_at)` for own offers.
- `(branch_id, status, expires_at)` for dispatch/expiry.
- Partial unique current assignment per task.
- `(rider_user_id, status)` for own assignments.
- `(branch_id, status, ready_for_dispatch_at)` for POS queue.
- `(task_id, occurred_at)` for task event history.
- Unique request/idempotency key in the appropriate command scope.
- Composite FKs prevent cross-tenant/branch task, offer, assignment and rider combinations.
- CHECK constraints validate states, expiry ordering and timestamp consistency. Cross-row invariants remain inside transactional commands.

## 8. Acceptance and adversarial tests

1. Reject returns task to POS; no automatic next offer.
2. Accept just before expiry may succeed; at/after expiry fails even if row has not been swept.
3. Device clock skew does not affect expiry.
4. Repeated expiry sweeps are idempotent; concurrent workers cannot duplicate terminal outcomes.
5. Accept racing reject/expiry has one winner and at most one current assignment.
6. Rider cannot read/respond to another rider's offer or assignment by changing UUID.
7. Cross-branch task/rider/offer/assignment combinations fail.
8. Reassignment preserves prior attempts and creates a new offer row.
9. Rider cannot update another rider's delivery or mark delivered from an invalid state.
10. Delivered command atomically completes task/order and appends both histories.
11. Failure report leaves task pending physical return and order non-delivered.
12. Rider cannot confirm physical return.
13. Cashier and Manager can confirm only return-pending tasks in their branch.
14. Return confirmation atomically closes task, marks order returned, ends assignment and appends events.
15. Duplicate/lost-response retries do not duplicate state, assignment, events or notifications.
16. POS recovers after missed Realtime and app reload.
17. Expiry works when optional scheduling is disabled.
18. No command trusts client actor, role, timestamp, fee or arbitrary status.

## 9. Separate open questions

These are not settled by the lifecycle decision:
- Whether Rider rejection/failure reason is mandatory and which reason codes apply.
- Whether arrival-at-restaurant is a separate recorded state or pickup is the next explicit action.
- Whether Not Listed checkout collects a separate locality/mohalla label in addition to full address.
- Canonical order status names and customer notification/payment/refund handling for returned orders. Preserve payment records; do not invent automatic refunds.
- Optional scheduler configuration, only after Free-plan capability verification.

No GST/tax, ingredient inventory, OTP/photo proof or automatic rider rotation is introduced by this contract.
