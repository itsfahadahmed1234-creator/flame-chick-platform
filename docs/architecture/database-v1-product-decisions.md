# Flame Chick Production — Database V1 Product Decisions

**Status:** V1 design decisions resolved for schema planning  
**Date:** 2026-11-20  
**Branch:** `work/production-source-audit`  
**Scope:** Website branch routing, catalog scope, staff role multiplicity, deal choices and returned-order financial treatment  
**Safety:** These decisions update design documentation only. They do not authorize Production DDL, code deployment or live business-policy changes.

## 1. Website branch selection and server resolution

**Decision**
- A customer-facing branch must be explicitly eligible for website ordering: active and website-ordering enabled.
- If exactly one eligible branch exists for the requested fulfilment type, the server may resolve it automatically.
- If more than one eligible branch exists, the website must ask the customer to select a branch. The branch selector is populated only from a narrow public-safe list of eligible branches.
- The selected branch ID is a selector, not authority. The Order API/database command revalidates that the branch belongs to Flame Chick, is active, permits website orders and supports the requested fulfilment type.
- If there are zero eligible branches, checkout fails closed with a safe unavailable message.
- Do not infer a branch from free-text address, client IP or untrusted geolocation in V1. Geospatial/address-based routing would need verified service-area geometry and its own design.
- Delivery areas and Not Listed fee configuration are resolved only within the selected branch. A listed area must belong to that branch; Not Listed uses that branch's configured default fee.
- POS staff branch scope continues to come from the active authenticated role assignment, not a client-provided branch selector.

**Schema/API implications**
- Add branch capabilities: `website_ordering_enabled`, `website_delivery_enabled`, `website_pickup_enabled` (or equivalent constrained channel configuration).
- Expose only a minimal branch-selection projection: opaque branch ID, customer-facing name and supported fulfilment modes. Do not expose private branch address, staff contacts or internal settings.
- Resolve one `branch_id` before loading branch availability, areas, prices, idempotency scope and order creation.
- Bind idempotency, catalog overlay version, delivery area/fee and order snapshots to the resolved branch.
- A client cannot submit a branch UUID that is not in the current eligible branch set.

## 2. Catalog, price and availability scope

**Decision**
- V1 menu structure, product/deal definitions and base prices are restaurant-wide and identical across branches.
- Product/variant sellability may differ by branch. A branch may mark a product variant unavailable without changing its base price or other branches' availability.
- Deal sellability may also be overridden per branch. A selected deal is purchasable only when the deal and every selected component/variant are eligible for that branch.
- Delivery areas and delivery fees remain branch-specific.
- Branch-specific prices, branch-specific deal prices, and channel-specific prices are out of scope for V1. Do not add price override tables pre-emptively.
- Global product/variant/deal inactive or archived state always prevents sale at every branch. A branch override cannot reactivate a globally inactive item.
- When no branch availability override exists, inherit the global availability state from the published restaurant catalog.

**Schema/API implications**
- Retain one restaurant-level draft revision, immutable publication sequence and current publication pointer for the base menu/prices.
- Add branch-scoped availability override records for variants and deals, each constrained to the same restaurant/branch and audited by Admin/Owner. Missing override means inherit global state.
- Keep a branch catalog state/revision row. Increment its availability revision atomically whenever an availability override changes.
- A branch catalog response/cache identity includes restaurant publication ID/version, branch ID, branch availability revision and catalog schema version. POS must stage and atomically activate a complete matching version; keep its last-known-good cache if staging fails.
- Order creation snapshots both the restaurant publication and branch availability revision used for validation. Stale offline POS submissions are held for explicit confirmation if either relevant version changes the selected item's availability or price.
- Do not silently reprice. Base price is common in V1; availability can differ.

## 3. Staff role multiplicity

**Decision**
- One person has one role identity per restaurant at a time. Do not combine Admin + Owner or operational roles such as Manager + Cashier.
- An Admin or Owner role is restaurant-wide and cannot be combined with an operational role.
- A Manager, Cashier or Rider may be assigned to multiple branches, but the role must be the same at every branch. Example: Cashier in Branch A and Cashier in Branch B is allowed; Cashier in Branch A and Manager in Branch B is not.
- A role change is a deliberate audited transition. Disable the old active role assignment(s) and create the new role assignment(s) atomically in the database command.
- The last-active-Owner guard remains mandatory and is serialized with the restaurant-level staff-authority lock.
- Admin and Owner have equal staff-management authority, but each action stores the actual acting identity and role. Manager/Cashier/Rider cannot manage staff.

**Schema/API implications**
- Enforce role consistency under a transaction-scoped lock for `(restaurant_id, user_id)`; a simple query without serialization is raceable.
- Enforce no duplicate active role assignment for the same user/branch and no simultaneous different active role keys for one user/restaurant.
- Multiple branch rows are permitted only when they share the same operational role. Admin/Owner use a single restaurant-wide assignment.
- Validate all active branch assignments against active branches in the same restaurant. Role assignment and staff audit rows commit together.

## 4. Deal choices and substitutions

**Decision**
- V1 uses curated choice groups only. Admin explicitly selects the allowed products/variants for each choice group.
- A deal may contain fixed items plus one or more choice groups. Each group defines required/minimum/maximum selections.
- A customer may select only from the curated choices in the published deal version. No free-text substitutions, arbitrary category-wide pools or customer-selected items outside the group.
- A substitution is simply a permitted choice within a configured group. If the Admin wants no substitutions, use a fixed component.
- Each curated choice has an explicit server-stored surcharge (including an intentional zero). Any upgrade cost is this configured surcharge; do not calculate an implicit price difference from the standalone menu price.
- The deal's bundle price covers its included base contents. The order command adds only the configured selected-choice surcharges, validates min/max/duplicate rules and calculates the final total server-side.
- A selected product/variant must be active, globally sellable and available at the selected branch. Invalid/stale selections fail closed.
- Published order snapshots preserve deal title, component labels, selected item/variant labels, quantities, bundle price and each surcharge so later edits do not rewrite history.

**Schema/API implications**
- Keep `deal_components` with `fixed_item` and `choice_group`, and `deal_component_choices` as the explicit curated allowlist.
- Enforce that fixed components have fixed product/variant references and no choice rows; choice groups have valid min/max and only curated choice rows.
- Require deterministic variant resolution: a choice must name a permitted variant, or the product must have exactly one active sellable variant when variant is omitted.
- `surcharge_mode` is limited to none or selected-choice surcharge. A choice surcharge is explicit, numeric and non-negative.
- Validate the full selection graph inside the atomic order-creation transaction; never trust client-supplied prices or choice membership.

## 5. Financial handling of physically returned orders

**Decision**
- A physically returned delivery changes the operational order outcome to `returned`; it does not automatically create a refund or erase a payment.
- For COD where no money was collected, record the order as `not_collected` / closed-uncollected. No refund transaction is created.
- If money was already collected, preserve the original collection record. The payment remains collected until an actual refund is completed and recorded.
- A refund is a separate, append-only financial event linked to the original collection, with amount, method, server timestamp, actor, reason, request/idempotency key and safe receipt/reference. Partial refunds are supported but cumulative refunds cannot exceed the captured amount.
- Admin or Owner authorization is required to issue/record a refund in V1. Manager, Rider and Cashier cannot independently authorize refunds. A later explicit approval workflow could allow Cashier to execute an already-approved payout, but it is not assumed now.
- Record the refund only after money has actually been returned by the recorded method. Do not set a payment to refunded merely because a refund was requested.
- No payment gateway, automatic wallet refund, store credit, or automated customer compensation is introduced by this decision.
- A returned order remains in order/delivery history; return and financial events are separately auditable.

**Schema/API implications**
- Separate order/delivery lifecycle state from payment/settlement state.
- Model collection and refund as immutable ledger entries. A refund entry references the original successful collection and cannot be greater than the remaining refundable balance.
- The refund command locks the original collection, checks the cumulative refund amount and idempotency key, verifies Admin/Owner role and records the refund in one transaction.
- A COD order returned before collection receives a not-collected/closed-uncollected payment outcome, not a negative payment or refund row.
- Preserve all existing payment records. Never hard-delete or overwrite the original amount/method/actor.



## 6. Future customer drop-off pin (not live tracking)

**Decision**
- No Rider live GPS location will be collected.
- No continuous customer GPS tracking or location streaming will be built.
- A delivery customer may optionally share one fixed destination pin, either by a one-time device coordinate or by manually placing a map pin.
- The written delivery address remains required; sharing a pin is optional and declining it never blocks checkout.
- The assigned Rider and authorized branch POS staff can view the fixed pin and open a Google Maps directions link generated from the validated coordinates.
- Store at most one current pin per delivery order in a private schema. Bind it to the server-resolved restaurant, branch, order and delivery task.
- Rider access is limited to their own current active assignment; POS access follows active role and branch permissions. Reassignment immediately revokes the previous Rider's access.
- Do not store arbitrary customer-supplied map URLs. Generate the Google Maps directions URL from validated latitude/longitude.
- No location update stream, location session, background GPS, Rider GPS write, movement history, location polling or Realtime location channel.
- Proposed retention: delete precise coordinates within 24 hours after terminal delivery outcome; confirm the retention window before implementation.
- A pin is a navigation aid only; it does not automatically choose a branch or prove delivery coverage.

**Implementation boundary**
This is future-ready schema design only. It does not authorize location collection or app UI now. Build only after schema approval and the website security audit at the database-integration milestone.

## 7. Explicitly deferred

- Automatic branch routing from maps/geocoding or address polygons.
- Branch-specific menu prices/deal prices and channel-specific prices.
- Category-wide dynamic deal choice pools and free-text substitutions.
- Payment gateway integrations, automatic refunds, store credit and Cashier-executed refunds.
- GST/tax, which remains excluded from V1 as already decided.
- Any change to current POS local-only takeaway/dine-in cloud-sync boundaries until separately confirmed.

## 8. Acceptance tests

1. One eligible website branch is auto-resolved; zero eligible branches fail closed; multiple eligible branches require explicit selection.
2. Forged/inactive/other-tenant/non-website-enabled branch ID is rejected.
3. A branch that does not support the selected fulfilment type is rejected.
4. Delivery area from another branch is rejected; missing Not Listed default blocks checkout; explicitly configured zero remains valid.
5. Branch A can mark a variant unavailable while Branch B continues to sell it at the same base price.
6. A globally inactive product/variant cannot be re-enabled by a branch override.
7. Cached catalog identity changes when either the base publication or branch availability revision changes.
8. One user cannot hold Admin and Owner, or Manager and Cashier, concurrently in the same restaurant.
9. One Cashier may have active assignments in multiple branches as Cashier, but cannot hold different operational role keys across branches.
10. Concurrent role changes cannot bypass the one-role rule or last-Owner guard.
11. Deal selections outside curated choices, outside min/max, or unavailable at the selected branch are rejected.
12. Deal surcharge is computed from the stored choice rule, not browser data or implicit standalone price differences.
13. Returned COD order with no collection is closed-uncollected and creates no refund.
14. Returned order with collected funds preserves the collection; a refund appears only after actual payout.
15. Refund amount cannot exceed the unrefunded collected amount; concurrent/duplicate refund requests cannot over-refund.
16. Manager/Cashier/Rider cannot authorize or record a refund; Admin/Owner actions retain immutable actor/reason audit.

## 9. Status

These are the selected V1 design decisions for schema planning. Update the field-level schema, ERD, application/database contract map, integrity review and project handoff to match. They remain subject to isolated migration tests and do not authorize Production changes.
