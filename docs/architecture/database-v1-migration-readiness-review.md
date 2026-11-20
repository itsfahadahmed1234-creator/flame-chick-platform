# Flame Chick Production — Database V1 Migration Readiness Review

**Review date:** 2026-11-20  
**Branch:** work/production-source-audit  
**Status:** Design consistency review completed; not approved for SQL implementation or Production  
**Target:** Supabase PostgreSQL 17, Mumbai ap-south-1, Free plan  
**Production boundary:** No Production DDL/data/Auth/settings/functions/storage/realtime changes in this review.

## 1. Executive outcome

The database design has enough resolved business direction to proceed to a controlled SQL specification and isolated migration prototype. It is not yet migration-ready for Production.

Recommended next stage:
1. Produce exact canonical DDL with named constraints, indexes, triggers, command function signatures, grants and transaction boundaries.
2. Reconcile existing application DTOs/statuses/field names with the canonical database model.
3. Run migrations and adversarial tests in a verified isolated local/test database.
4. Review schema diff, security grants, performance plans and backup/restore.
5. Request separate explicit approval for any Production change.

This review is not permission to deploy SQL or modify Production.

## 2. Resolved V1 business decisions

### Branch resolution
- Website candidates are active and explicitly website-enabled for the requested fulfilment type.
- Exactly one eligible branch: server may auto-resolve.
- Multiple eligible branches: customer explicitly selects from a safe public list.
- Zero eligible branches: fail closed.
- Browser branch UUID is a selector, never authority; server revalidates tenant, active status and channel/fulfilment capability.
- No branch inference from IP, free-text address or GPS.

### Menu and branch scope
- Products, variants, deal definitions and base prices are restaurant-wide in V1.
- Variant and deal availability may differ by branch.
- Delivery areas and delivery fees are branch-specific.
- Branch override cannot reactivate globally inactive/archived items.
- No branch-specific price overrides in V1.
- Catalog cache/order identity includes restaurant publication ID/version, branch ID, branch availability revision and schema version. Orders snapshot both publication and availability revision.

### Staff roles
- One role identity per user per restaurant at a time.
- Manager, Cashier or Rider may have assignments in multiple branches only with the same role key.
- Admin or Owner is one restaurant-wide role and cannot coexist with another role/branch assignment.
- Admin and Owner have equivalent full business authority with distinct audit identity.
- Role changes serialize by restaurant/user and append audit atomically; last-active-Owner protection serializes at restaurant scope.
- Manager has branch operational POS only; Cashier has approved POS processing/rejection/dispatch; Rider sees own offers/assignments only. Kitchen remains denied unless approved.

### Deals
- Curated choice groups only.
- Fixed components plus explicit choice groups with min/max.
- Explicit non-negative surcharge, including deliberate zero.
- No free-text substitutions or category-wide dynamic pools.
- Missing variant can resolve only if exactly one eligible active variant exists; otherwise reject.

### Returned orders and money
- Operational return state is separate from payment settlement.
- COD returned without collection becomes closed-uncollected; no refund entry.
- Actual collection remains immutable.
- Refund is a separate append-only ledger entry recorded only after payout occurred.
- Admin/Owner only may authorize/record refund in V1; cumulative refund cannot exceed successful collected amount.
- No automatic refund, gateway, wallet/store credit or GST/tax in V1.

### Customer drop-off pin
- Optional one-time fixed delivery destination pin, either device coordinate once or manually placed map pin.
- Written address remains required; no pin/permission denied never blocks checkout.
- Assigned Rider and authorized branch POS can view the destination and open a Google Maps URL generated from validated coordinates.
- Store one coordinate pair privately; current assignment governs Rider access.
- No Rider GPS, continuous customer tracking, movement history, location session, polling, geofencing or Realtime location.
- Proposed 24-hour post-terminal coordinate deletion and exceptional Admin/Owner terminal support access remain unconfirmed.

## 3. Security architecture baseline

- All exposed tables: RLS enabled; explicit grants separately reviewed.
- app_private is not Data API exposed; no browser schema/table privileges.
- Public anonymous access only to published catalog projection and website order submission route; no public order reads.
- service_role only server-side; never in browser; RLS bypass means every server command validates human actor/role/branch/state.
- Staff JWT is verified with Supabase Auth; current active role/branch is loaded from database, never user_metadata or caller fields.
- SECURITY DEFINER only when unavoidable, fixed/empty safe search_path, controlled owner, schema-qualified objects and exact EXECUTE grants.
- Existing Production default-privilege hardening must be respected: no assumptions that new objects inherit application-role grants. Verify every new object.
- No hard deletes of orders, payments, delivery history, status events, publication history or role audit through normal app.
- All important mutations use row locks/compare-and-set, idempotent command IDs, atomic audit events and transactional outbox.
- Website phone quota applies only to successfully committed source=website orders: 3/rolling minute, 3/rolling 10 minutes, 15/rolling hour per normalized submitted phone using HMAC. POS and other authenticated staff order sources are exempt. Universal order idempotency applies to Website and POS.
- Rate quota does not protect Edge invocation budget from volumetric floods; separate ingress/bot abuse controls require measured design and must not trust spoofable IP headers.

## 4. Critical database invariants

### Tenant/branch
- Composite FKs for every restaurant/branch-owned relationship.
- Order, line, task, offer, assignment, rider, payment, branch availability and private location must bind to matching restaurant and branch.
- Avoid cascading deletes into financial, order, delivery or audit history.

### Role constraints
- A partial unique index can prevent duplicate active assignments but cannot alone enforce same-role-across-branches.
- Enforce one role key per (restaurant,user) inside a serialized command; add a database-side constraint trigger/guard as defense in depth.
- Lock final Owner checks at restaurant scope to avoid concurrent demotion/deactivation.

### Orders
- Unique idempotency scope and server-computed canonical fingerprint.
- Idempotency replay happens before website quota check; same key/different payload returns conflict.
- One transaction: order, lines, modifier/deal snapshots, status event, delivery task if applicable, optional pin, outbox, and website quota event iff source=website.
- Public replay response never exposes order row, PII, address or status history.

### Payments
- Append-only collection/refund ledger.
- Refund locks original collection, sums successful prior refunds and inserts only if remaining refundable amount is sufficient.
- Unique idempotency plus row lock prevents concurrent over-refund.
- Payment summary is separate from operational order status.

### Delivery
- One delivery task per delivery order.
- Offer expiry exactly 60 seconds based on database time; accept checks expiry while holding lock.
- Accept/reject/expire races have one winner; one current assignment.
- Rider access checks verified UID and current assignment every request; reassignment revokes former Rider immediately.
- Rider reports failed/return intent; Cashier/Manager/Admin/Owner confirms physical receipt; return never auto-means delivered.
- Outbox notifications never determine transaction success.

### Catalog
- Immutable publication snapshots, expected draft revision, canonical server checksum.
- Branch availability overlay cannot reactivate global inactive state.
- Cache staged and atomically activated; last-known-good cache remains if download/validation fails.
- Stale offline POS order is held for explicit staff confirmation; never silently repriced.

### Drop-off pin
- Optional private row, composite tenant/order/task FK, no direct browser access.
- Same transaction as order/task; no orphan pin on failure.
- Only narrow Delivery API response to current Rider or authorized POS role.
- No coordinates in public responses, analytics, logs, broad notifications or Realtime.

## 5. Migration sequence — proposed, not executed

| Batch | Scope | Main dependencies / gate |
|---|---|---|
| 0 | Verify existing Production baseline and exact migration history | Read-only reconciliation; never reapply baseline |
| 1 | Private schema, privilege helpers and exact grants | Confirm hardened default privileges; test function ownership/search_path |
| 2 | Restaurant, branch and shared composite keys | Tenant/branch integrity tests |
| 3 | Profiles, role assignments, staff audit and invitation workflow state | Role lock, same-role cross-branch guard, last-Owner tests |
| 4 | Catalog categories/products/variants/modifier groups | Composite product/category/variant FKs |
| 5 | Branch availability overlays and branch catalog revision | Same-tenant branch FKs; global inactive guard |
| 6 | Deals/components/curated choices | Min/max, variant resolution and surcharge tests |
| 7 | Draft revision and immutable publication | Atomic publish/rollback and checksum tests |
| 8 | Delivery areas/default fee settings | Listed/Not Listed mutual exclusivity and fee snapshots |
| 9 | Orders, order lines, snapshots, status history and idempotency | Website/POS concurrent retries and atomic rollback |
| 10 | Payment ledger and refund commands | Over-refund concurrency, role authorization |
| 11 | Delivery tasks/offers/assignments/events and rider profiles | Expiry/assignment race tests |
| 12 | Private website quota events, API rate buckets, drop-off pin and outbox | Private grants, HMAC rotation, pin privacy, cleanup |
| 13 | Narrow catalog/order/delivery/staff command functions, RLS and explicit grants | Full role/branch adversarial tests |
| 14 | Storage policies, exact query indexes and targeted Realtime | Storage restore; no pin Realtime |
| 15 | Controlled tenant/branch/owner setup | Separate explicit approval; menu entered through Admin |

Some constraints and functions should be created with the tables they depend on. The batches are conceptual dependency groups, not necessarily one migration file each.

## 6. Engineering blockers before SQL prototype

1. **Legacy source mapping:** Current apps/functions use older table fields, role values, fulfillment names, order statuses, and REST DTOs. Produce a field-by-field mapping and versioned API contract. No blind renaming.
2. **Payment source audit:** Map current POS payment collection methods/statuses to the ledger. Do not assume card gateway support or existing refund mechanics.
3. **Delivery state normalization:** Current code includes legacy values such as dispatch_pending, offering, assigned, accepted, arrived_at_restaurant, out_for_delivery, failed and return_reported; target lifecycle has canonical states. Define adapter and event mapping.
4. **Composite parent keys:** Enumerate every required parent UNIQUE key before writing child FKs; especially order/task branch composite key for the private drop-off pin.
5. **Role invariant implementation:** Specify transaction lock key, constraint trigger/guard and last-Owner protection in SQL; test concurrency.
6. **Payment ledger schema:** Finalize how current payment_status is derived/stored and how COD collection is recorded in POS before building refund functions.
7. **Schedule semantics:** Keep deal schedule authoring disabled until timezone/recurrence/overnight/branch rules are resolved.
8. **Not Listed locality:** Decide whether separate locality label is needed; it must never set fee.
9. **Rider arrival event:** Decide whether arrival-at-restaurant is a separate event.
10. **Drop-off pin retention:** Confirm 24-hour cleanup and exceptional terminal-state Admin/Owner support access.
11. **Backup/recovery:** Confirm an external encrypted backup target and prove restore of both PostgreSQL data and Storage assets. Do not assume Free includes a suitable automatic backup retention.
12. **Test environment:** Verify an isolated disposable database exists or use local Supabase. Do not consume or mutate Production for tests. Check Free active-project limits before creating a project.

## 7. Required isolated test suite

### Authorization and isolation
- anon, non-staff authenticated, Admin, Owner, Manager, Cashier, Rider, revoked role and unrelated branch/tenant.
- Cross-tenant/branch forged IDs across every relationship.
- Direct Data API DML, guessed UUID, PostgREST schema discovery, RPC enumeration and SECURITY DEFINER execution.
- Role conflict and last-Owner concurrent mutation.
- Manager Admin API, Cashier delete/accepted cancellation, Rider other-rider data and terminal pin access.

### Transactions and concurrency
- Website/POS same-key same-payload parallel creation → one order.
- Same key changed payload → conflict.
- Lost response retry after commit → no duplicate effects.
- Website quota exact rolling boundaries, simultaneous same-phone requests, HMAC key rotation overlap, POS bypass.
- Failure at each write point rolls back all dependent rows.
- Offer accept/reject/expire races and 60-second boundary.
- Concurrent refunds cannot exceed successful collected balance.
- Publish and rollback races on expected draft revision.
- Reassignment immediately invalidates former Rider's access.

### Data integrity and operations
- Invalid/mismatched product variants, modifier choices, deal selections and branch availability.
- Explicit zero vs NULL price/fee.
- Stale POS publication/availability revision.
- Return with COD not collected vs previously collected; no automatic refund.
- Pin absent, manual pin, one-time device pin, invalid coordinates, forged tenant/task, denied permissions, URL generation and retention.
- Notification provider failure leaves committed order/task intact.
- Backup restore including Storage and published media.
- Query plans for POS board, Rider own offers/assignments, website catalog/order creation and Admin lists.
- Free-plan resource/invocation estimates using measured request patterns.

## 8. Deferred mandatory website audit

The customer website security audit is intentionally not performed now. It must be completed immediately before attaching the website to the database and is a hard release gate. That audit must include browser threat model, XSS/DOM injection, checkout payload tampering, idempotency storage/replay, CORS/CSRF as applicable, rate-limit bypass, phone normalization, branch spoofing, API abuse, public response privacy, secrets/build artifacts, CSP/security headers, dependency and source review, and negative tests. Do not treat the current database review as a website security sign-off.

## 9. Current status

- Database design documents reconciled for the confirmed business decisions.
- Static drop-off pin is documented; live tracking is explicitly excluded.
- Existing Production security baseline remains untouched.
- No SQL migrations were created/applied in this review.
- No app source, Edge Function, Auth settings, Storage, Realtime, Vercel deployment, main or original source repository was modified.
- Production remains read-only and requires separate explicit approval for any future DDL/data/settings changes.

**Next recommended action:** begin Batch 0 as a read-only verification and produce the exact DDL/constraint/grant specification for Batches 1–3. Do not start Production changes.
