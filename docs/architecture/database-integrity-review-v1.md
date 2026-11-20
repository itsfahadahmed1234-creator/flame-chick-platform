# Flame Chick Production — Database Integrity Review V1

**Status:** Design review and test requirements; not a migration or authorization to apply DDL  
**Date:** 2026-11-20  
**Branch:** `work/production-source-audit`  
**Scope:** Tenant/branch isolation, catalog publication, order idempotency, delivery transactions, staff authority and recovery  
**Production boundary:** Read-only. No SQL, schema, data, Auth, settings or deployment changes.

## 1. Review outcome

The V1 design now has confirmed product decisions for branch resolution, catalog scope, role multiplicity, deal choices and returned-order financial handling. The current pass reconciles the schema direction and identifies remaining engineering gates; it is not yet executable DDL.

The most important technical risks to resolve before migrations:
1. Cross-tenant composite keys must exist at every relationship boundary, including branch availability, order lines, payment ledger, delivery task/offer/assignment, and private drop-off pin.
2. One-role-per-user/restaurant across multiple branch rows is a cross-row invariant. A plain partial unique index cannot enforce it; serialize the staff command and add a database-side guard.
3. Website and POS idempotency must share one atomic order command while only website source invokes the phone quota. Same-key concurrency and public replay privacy need isolated tests.
4. Payment collections/refunds must be append-only, idempotent and protected from concurrent over-refunds.
5. Delivery state transitions, offer expiry and reassignment must be row-locked and idempotent; stale Rider access must be revoked by current-assignment checks.
6. Customer drop-off coordinates must stay private and static; no Rider GPS or continuous customer tracking.
7. The existing Production default-privilege hardening changes default grants. Every new function/table requires explicit owner/grants verification; do not assume Supabase defaults.
8. The existing application sources use legacy field names, statuses and direct REST reads. A versioned DTO/adapter and compatibility tests are required before app cutover.
9. Backup and restore must include both database and Storage media; a Git repository or SQL dump alone is not a full recovery plan.
10. Website security audit is intentionally deferred but is a mandatory stop-gate before website/database attachment.


## 2. Tenant and branch integrity rules

- Every business row has a non-null `restaurant_id`; branch-operational rows also have a non-null `branch_id`.
- Composite foreign keys bind `(branch_id, restaurant_id)` to the same branch. Apply the same tenant pair to orders, delivery tasks, offers, assignments, riders, delivery areas, payment rows and event rows.
- A request's branch is resolved by trusted server logic from the authenticated staff role or configured public ordering route. Never trust `restaurant_id`, `branch_id`, role or actor supplied by a browser.
- Admin/Owner restaurant-wide scope is explicit. Manager/Cashier/Rider require an active branch role; NULL branch never means "all branches".
- A task, offer, assignment and rider must all agree on restaurant and branch. Use composite FKs where possible, plus transaction validation for state-dependent rules.
- Avoid cascading deletion from restaurants, branches, users or catalog rows into orders, snapshots, assignments or audit history. Use deactivation/archive and controlled retention.
- Every staff Data API query must constrain the active role, restaurant and branch. RLS and grants are separate controls; test both.

## 3. Catalog publication integrity

- Draft mutations carry an expected revision. Concurrent stale edits fail with a conflict rather than overwriting newer work.
- Publishing validates the entire candidate snapshot: required names, valid category relationships, active variants, non-null prices for sellable items, modifier selection bounds, deal component references, schedule validity, branch/channel scope and delivery projection consistency.
- Unknown price is NULL, never silently converted to zero. Zero is allowed only when explicitly configured.
- Snapshot generation, canonical checksum, immutable publication insert, publication event and current-pointer update occur in one transaction.
- Publish/rollback uses a row lock or compare-and-set on the current pointer and validates the expected revision. A failed transaction leaves the previous publication active.
- A publication is immutable. Rollback points to a previous valid publication; it does not rewrite old data.
- Cache identity must include every scope that can change output: tenant, branch (if branch-specific), channel (if channel-specific), schema version and publication version. POS cache activation is staged and atomic; keep the previous valid cache on failure.
- Public catalog output contains only published customer-safe fields and media. It must not expose draft rows, staff/customer data, private settings or internal storage paths/secrets.

## 4. Order and idempotency invariants

- Resolve tenant/branch, source, fulfillment type and publication context on the server before committing.
- Recalculate product/deal/modifier prices, discounts, delivery fee and total from authoritative database records. Ignore/reject browser-supplied totals and fees.
- Use exact canonical request validation and a server-computed, versioned payload fingerprint. A same-key/same-fingerprint replay returns the existing result; same key with a different fingerprint returns conflict.
- Enforce unique order creation scope, currently proposed as `(restaurant_id, branch_id, source, idempotency_key)`; validate compatibility with existing POS key/source behavior before SQL.
- Create order, lines, modifier/component snapshots, delivery task, initial status history, transactional outbox and (website source only) quota event in one database transaction.
- POS uses the same idempotency and transaction guarantees but bypasses the customer website phone quota.
- Website quota applies only to newly committed `source=website` orders: 3 per rolling minute, 3 per rolling 10 minutes, 15 per rolling hour per normalized submitted phone. Use HMAC digest, database time and a transaction lock. Invalid/rolled-back orders and exact retries do not consume another slot.
- A public idempotency key is not a lookup credential. Website replay returns only a minimal acknowledgement and non-sensitive receipt reference. Never return customer PII or an order row to an anonymous caller.
- On timeout after commit, retain the same key and retry; do not mint a new key just because the response was lost.
- Keep customer order snapshots immutable except through a separately authorized, reasoned correction command that appends audit history.

## 5. Delivery transaction invariants

- One delivery task per delivery order. Non-delivery fulfillment must not accidentally create one.
- Offer creation locks the task, checks branch/rider eligibility and no current assignment/pending offer, then inserts offer, event and notification outbox atomically.
- Offer expiry is exactly 60 seconds from database time. Acceptance checks `expires_at` while holding the relevant row lock; a delayed sweeper cannot make an expired offer acceptable.
- Accept/reject/expiry races have one winner. Unique constraints prevent duplicate pending offers and multiple current assignments.
- Rejection/expiry returns task to manual POS dispatch. No automatic rider rotation.
- Rider can act only on their own pending offer/current assignment; every command binds rider to verified `auth.uid()`.
- Delivered command atomically closes task and assignment, completes order and appends task/order events.
- Failure with return choice leaves order non-delivered and task `return_pending_confirmation`. Only Cashier/Manager/Admin/Owner can confirm physical receipt in the correct branch; that transaction closes assignment/task and moves order to a distinct returned outcome.
- Notifications are outbox side effects. A notification provider failure must not roll back a committed order or delivery transition.

## 6. Staff and authorization invariants

- Authorization comes from verified Supabase Auth identity plus active database role and branch membership, not user-editable metadata, email, frontend state or request fields.
- Admin and Owner have equivalent full business authority, with separate actor identity in every audit event. Manager remains restricted to approved branch operations; Cashier has POS processing/rejection/dispatch permissions; Rider is limited to own jobs.
- Staff role and branch changes are atomic with append-only audit. Last-active-Owner protection is serialized by a restaurant-level lock.
- Prevent self-escalation and unauthorized role assignment. Admin/Owner can manage staff under the owner-confirmed authority model; Manager/Cashier/Rider cannot.
- Auth invitation and SQL role binding are a recoverable idempotent workflow across two systems. Do not activate a role until the identity is verified and correctly bound.
- No ordinary app hard-deletes orders, payments, delivery history, staff-role audit, publication history or status events.
- `service_role` is a technical bypass credential, not a human role. Every privileged command validates the verified actor, role, branch, target and state inside the command transaction.

## 7. Required isolated adversarial and recovery tests

| Test | Expected result |
|---|---|
| Staff from Branch A queries or mutates Branch B IDs | No rows / denied; no cross-branch data leakage |
| Valid branch ID paired with another restaurant ID | Composite FK or command rejects |
| Rider substitutes another rider's offer/task UUID | Denied; no data returned |
| Manager calls Admin/catalog/staff endpoints directly | Denied by server and database, not merely UI |
| Cashier attempts delete or accepted-order cancellation | Denied |
| Admin demotes/deactivates final Owner concurrently with another Admin | At most one operation succeeds; one active Owner remains |
| Auth invite succeeds but role insert fails | Invitation remains recoverable; retry does not create duplicate user/role |
| Two Admins publish from the same draft revision | One wins; stale revision receives conflict |
| Publish snapshot write succeeds but pointer update fails | Whole transaction rolls back; previous pointer remains |
| Snapshot checksum is altered | Verification fails; corrupted snapshot is not served |
| Listed area belongs to another branch | Rejected |
| Not Listed has no configured default fee | Checkout rejected; no implicit zero |
| Listed selection with NULL area ID or Not Listed with non-NULL area ID | Rejected |
| Browser submits altered price, fee, total, status, actor or branch | Server recomputes or rejects; never trusts it |
| Same idempotency key and same payload submitted concurrently | Exactly one order and one set of side effects |
| Same idempotency key reused with changed payload | Conflict; no second order |
| Website exact retry after committed response loss | Minimal acknowledgement; no extra quota event or PII disclosure |
| POS creates same phone orders | Website phone quota not applied; universal idempotency still applies |
| Website order fails after quota check but before commit | Entire transaction rolls back; no quota event |
| Website order exceeds any rolling window | 429 with bounded Retry-After; no order/event |
| Offer accept races expiry/reject | Exactly one legal transition; no duplicate assignment |
| Rider reports return, then retries | One return report; no premature returned order state |
| Rider attempts physical-return confirmation | Denied |
| Notification provider fails after successful order | Order remains committed; outbox remains retryable |
| Data API direct DML bypass attempt | Denied by grants/RLS; protected commands remain the only write path |
| SECURITY DEFINER helper called by anon/authenticated | Permission denied unless explicitly designed public endpoint |
| New public table/function created after default-privilege hardening | No accidental default PUBLIC/anon/authenticated/service_role access; explicit grants verified |
| Backup restore test | Restored database and required Storage assets reconcile; application integrity checks pass |

## 8. Remaining decisions / explicit holds

Resolved and reflected in `database-v1-product-decisions.md`: branch routing, restaurant-wide base menu/prices with branch availability, same-role multi-branch identity, curated deal choices, returned-order ledger/refund policy and static customer destination pin.

Remaining:
1. Not Listed locality/mohalla label alongside full address.
2. Deal schedule semantics: recurrence, overnight, timezone, overlap and branch scope. Do not activate schedule authoring until defined.
3. Kitchen role: deny existing source read path by default until role and exact permissions are approved.
4. Ingredient inventory: excluded from V1 unless approved.
5. Rider arrival-at-restaurant event vs pickup as next explicit state.
6. Precise coordinate retention proposal (24 hours after terminal state) and whether Admin/Owner need exceptional terminal-state support access.
7. Website threat-model/security audit at the later website/database integration milestone.
8. Exact legacy source/status/fulfillment/payment value mapping and API DTO versioning. This is an engineering compatibility gate, not a business decision to guess.


## 9. Next step

Continue a source-independent schema consistency pass for exact role multiplicity, branch routing and catalog scope. Then reconcile the open business decisions that affect table keys and constraints. Only after that prepare a clean migration plan and execute it against an isolated test database. Production remains read-only and requires separate explicit approval.

## Future customer drop-off pin integrity review

The owner-approved scope is one optional fixed customer-shared delivery destination coordinate, not live tracking. See [drop-off pin data contract](./customer-dropoff-pin-data-contract-v1.md) and [ERD/authorization addendum](./customer-dropoff-pin-erd-authorization-addendum-v1.md).

### Integrity invariants
- Pin row is optional, one per delivery order/task, stored in non-exposed `app_private`.
- Composite tenant/branch/order/task FKs bind the coordinate to exactly the order's delivery task and branch.
- Written delivery address remains required; missing pin is valid and never blocks checkout.
- Optional pin is validated and committed atomically with the website order and delivery task; failure leaves no orphan pin and consumes no website quota slot.
- Coordinates are never exposed in public order responses, catalog, analytics, logs, general notifications or Realtime.
- Rider read requires the current active assignment; reassignment revokes the prior Rider. POS read requires active role and branch scope.
- Google Maps directions URL is generated from validated coordinates; arbitrary user-supplied URLs are never persisted or opened.
- No Rider GPS, continuous customer tracking, coordinate update stream, location history or Realtime location channel exists.

### Adversarial tests
1. Optional valid pin + website delivery order commits with the order/task; transaction failure rolls all writes back.
2. No pin / permission denied still allows delivery checkout with written address.
3. Pickup/non-delivery order cannot attach a pin.
4. Invalid coordinates, cross-tenant IDs, cross-branch IDs, wrong order/task pairing and missing consent fail.
5. Anonymous callers cannot read private pin storage or use the order-create route to retrieve a pin.
6. Rider A cannot read Rider B's pin; reassignment immediately removes Rider A access.
7. Manager/Cashier cannot read pins outside their authorized branch; Admin/Owner access is audited.
8. Terminal task and revoked role/assignment deny access.
9. Arbitrary maps URLs are rejected; generated URL contains only validated coordinate.
10. Coordinate absent from logs, analytics, public response, notifications and Realtime.
11. Retention cleanup removes only eligible precise coordinate rows and never cascades to orders, delivery tasks, payment or audit history.

No migration or Production implementation is implied.

## V1 resolved decisions and additional adversarial tests

- Website branch: one eligible branch auto-resolves; multiple require explicit customer choice; zero fail closed. Branch ID is selector only and is revalidated server-side.
- Menu: restaurant-wide base products/prices; branch-specific variant/deal availability overlays and delivery fees. Global inactive state cannot be overridden. Orders bind publication version and branch availability revision.
- Staff: one role_key per user/restaurant. Operational roles may repeat across branches only with the same role. Admin/Owner are restaurant-wide and exclusive. Test concurrent conflicting role assignments and role change races, including last active Owner.
- Deals: curated choices only, explicit non-negative surcharge, deterministic variant resolution; no category pools/free-text substitutions.
- Returned delivery: COD with no collection closes uncollected; actual collection remains immutable; refund is separate ledger entry only after actual payout; Admin/Owner only; row lock and cumulative refund bound prevent over-refund.
- Drop-off pin: one optional fixed coordinate in app_private, same transaction as order/task; no Rider GPS or continuous customer tracking.

Additional tests:
1. One operational role assigned to multiple branches is accepted; different role across branches and Admin/Owner plus operational role are rejected, including concurrent races.
2. Branch A variant/deal unavailable does not affect Branch B; globally inactive item cannot be re-enabled by branch overlay.
3. Order with stale branch availability revision is held for confirmation; old cached data is not silently activated.
4. Curated deal choice outside allowlist or invalid variant resolution is rejected; surcharge always server-derived.
5. Concurrent refunds cannot exceed successful collected balance; failed/voided collection cannot be refunded.
6. Returned COD without collection creates no refund; returned collected order preserves collection.
7. Drop-off pin read is denied to prior Rider after reassignment and to all Riders after terminal status; coordinate absent from logs and public response.
8. Restore test reconciles DB rows, object storage references, publication checksums and application media files.
9. Every newly created function/table is checked against hardened default privileges; no unexpected PUBLIC/anon/authenticated/service_role grant.
10. Source compatibility test maps all existing app fields/statuses into versioned database DTOs without changing production source until cutover approval.

