# Flame Chick Production — ERD and V1 Schema Proposal

**Status:** Draft ERD and table-level proposal; not SQL and not approval to apply DDL  
**Prepared:** 2026-11-20  
**Scope:** Single Flame Chick restaurant with branch-aware operations, Admin-managed catalog, website, POS and Rider portal

## 1. Design principles

1. Keep the first schema small enough to operate and maintain, but complete enough for the confirmed menu and order workflows.
2. Model routine menu choices as data, not enums or hardcoded categories. Admin can add products, variants, modifiers, deals and schedules without database work.
3. Separate the editable catalog from the published catalog. Public clients read only an approved immutable snapshot.
4. Make the database the authority for identity, branch scope, prices, availability, delivery fees, totals and workflow transitions.
5. Use stable UUID identities and immutable order snapshots. Display names and legacy IDs are not primary keys.
6. Keep sensitive operational data private and give browser clients only the exact data they need.
7. No GST/tax schema in V1, by explicit owner decision.
8. No Production DDL until this ERD and the affected migration batch are reviewed and approved.

## 2. Proposed V1 entity relationship diagram

\`\`\`mermaid
erDiagram
  RESTAURANTS ||--o{ BRANCHES : operates
  RESTAURANTS ||--o{ CATEGORIES : owns
  RESTAURANTS ||--o{ PRODUCTS : owns
  CATEGORIES ||--o{ SUBCATEGORIES : groups
  CATEGORIES ||--o{ PRODUCTS : contains
  SUBCATEGORIES o|--o{ PRODUCTS : filters
  PRODUCTS ||--|{ PRODUCT_VARIANTS : sells_as

  MODIFIER_GROUPS ||--o{ MODIFIERS : contains
  PRODUCTS ||--o{ PRODUCT_MODIFIER_GROUPS : uses
  MODIFIER_GROUPS ||--o{ PRODUCT_MODIFIER_GROUPS : assigned_to
  MODIFIERS ||--o{ MODIFIER_VARIANT_PRICES : priced_by
  PRODUCT_VARIANTS ||--o{ MODIFIER_VARIANT_PRICES : price_context

  RESTAURANTS ||--o{ DEALS : offers
  CATEGORIES ||--o{ DEALS : displays
  DEALS ||--o{ DEAL_COMPONENTS : contains
  DEAL_COMPONENTS ||--o{ DEAL_COMPONENT_CHOICES : allows
  PRODUCTS o|--o{ DEAL_COMPONENTS : fixed_product
  PRODUCT_VARIANTS o|--o{ DEAL_COMPONENTS : fixed_variant
  PRODUCTS ||--o{ DEAL_COMPONENT_CHOICES : selectable_product
  PRODUCT_VARIANTS o|--o{ DEAL_COMPONENT_CHOICES : selectable_variant
  DEALS ||--o{ DEAL_SCHEDULES : scheduled_by
  DEAL_SCHEDULES ||--o{ DEAL_SCHEDULE_DAYS : repeats_on

  RESTAURANTS ||--o{ MENU_PUBLICATIONS : versions
  RESTAURANTS ||--|| RESTAURANT_CATALOG_STATE : current_pointer
  MENU_PUBLICATIONS ||--o{ RESTAURANT_CATALOG_STATE : points_to
  MENU_PUBLICATIONS ||--o{ MENU_PUBLICATION_EVENTS : audit

  BRANCHES ||--o{ DELIVERY_AREAS : serves
  BRANCHES ||--o| BRANCH_DELIVERY_SETTINGS : configures
  BRANCHES ||--o{ USER_ROLES : scopes
  BRANCHES ||--o{ ORDERS : receives
  BRANCHES ||--o{ DELIVERY_TASKS : dispatches

  ORDERS ||--|{ ORDER_ITEMS : contains
  PRODUCTS o|--o{ ORDER_ITEMS : snapshot_reference
  PRODUCT_VARIANTS o|--o{ ORDER_ITEMS : snapshot_reference
  DEALS o|--o{ ORDER_ITEMS : snapshot_reference
  ORDER_ITEMS ||--o{ ORDER_ITEM_MODIFIERS : customizes
  ORDER_ITEMS ||--o{ ORDER_ITEM_COMPONENTS : expands
  ORDERS ||--o{ PAYMENTS : paid_by
  ORDERS ||--o{ ORDER_STATUS_HISTORY : changes

  DELIVERY_AREAS o|--o{ ORDERS : selected_area
  ORDERS ||--o| DELIVERY_TASKS : dispatches_as
  DELIVERY_TASKS ||--o{ DELIVERY_TASK_OFFERS : offers
  DELIVERY_TASKS ||--o{ DELIVERY_ASSIGNMENTS : assigned
  RIDER_PROFILES ||--o{ DELIVERY_ASSIGNMENTS : accepts
  USER_ROLES ||--o{ RIDER_PROFILES : authorizes
\`\`\`

The ERD is conceptual. Exact cardinalities, optionality, unique constraints and composite foreign keys must be represented in migration SQL and tested. It intentionally omits optional systems that have not yet been confirmed.

## 3. Table groups and recommended responsibilities

### A. Tenant and identity

**restaurants**
- One Flame Chick tenant row: name, slug, currency code, timezone, active state.
- PKR and Asia/Karachi are current defaults, but store them as data rather than hardcoded assumptions.

**branches**
- Belongs to one restaurant; branch code/name/address/phone/active state.
- Add a unique composite key for (id, restaurant_id) so child rows can enforce tenant/branch consistency.
- Branch-wide delivery areas and operational orders are branch-scoped.
- Catalog products/prices are initially restaurant-wide. Do not add branch-specific product prices until required.

**user_profiles**
- Profile keyed to auth.users.id; minimum PII required by Admin/staff UI.
- Do not expose profile phone/avatar to public catalog.

**user_roles**
- Auth user, role, branch scope, active state, created_by and created_at.
- A nullable branch role should only have a clearly defined restaurant-wide meaning; do not use NULL as a shortcut that grants access across branches.
- Enforce allowed role values and prevent duplicate active role assignments for the same user/branch/role.

**staff_role_audit**
- Private/append-only audit of role assignment, activation/deactivation and actor.
- No ordinary browser update/delete.

### B. Catalog authoring

**categories**
- Restaurant, English/Urdu name, description if needed, image reference, display order, active/archive state.
- New category is a data record; adding a category must not require a code deployment.

**subcategories**
- Optional child filter under a category.
- A product's category and subcategory must be consistent; use composite relationship constraints.

**products**
- Restaurant, category, optional subcategory, stable internal SKU/code where useful, English/Urdu name and description, image reference, sort order, featured, active and available state.
- No hardcoded product names or category IDs.
- Do not hard-delete a product referenced by an order or deal; archive it.

**product_variants**
- Product, stable variant key, display label/translated label, sort order, active/available state, nullable numeric price.
- A simple single-price product can use one internal REGULAR variant to preserve the current POS contract.
- A nullable price means draft/unpriced; zero is an intentional free price only when saved explicitly.
- Publish validation rejects any active purchasable variant with NULL price.
- Labels such as Quarter, Half, Full, 1.5 Ltr, or future sizes are data, not schema enums.

### C. Customization

**modifier_groups**
- Reusable group name/translations, selection style, active state and sort order.
- Examples may include sauces, spice levels or add-ons, but no specific group is assumed.

**modifiers**
- Choices within a group, translated labels, active state, sort order, pricing mode.
- Pricing modes should be a constrained set such as included/free, fixed extra, or variant-priced. Validate required price fields for each mode.

**product_modifier_groups**
- Join between product and group.
- Stores product-specific required flag, minimum/maximum selections and display order. This avoids forcing every product that reuses a group to have identical selection rules.

**modifier_variant_prices**
- Optional price per modifier and product variant where an option's price varies by size/portion.
- Use real foreign keys to both modifier and variant, not an unchecked size_key string.
- Order RPC validates group assignment, count limits, active state and price mode.

### D. Deals and scheduled offers

**deals**
- Restaurant, display category/group, title/translations, description, image, nullable bundle price for draft, active/available/featured state and sort order.
- Draft may be unpriced; publish validation blocks unpriced purchasable deal.

**deal_components**
- Ordered component groups belonging to a deal.
- Supports fixed product, fixed variant or a customer-choice group.
- Stores quantity, required/optional, selection minimum/maximum, label and explicitly defined surcharge policy.
- Do not use a generic table-name/string ID relationship.

**deal_component_choices**
- Curated selectable product/variant choices for a component group, with explicit foreign keys, sort order, active state and optional surcharge.
- Server validates all choices and pricing at order creation.

**deal_schedules** and **deal_schedule_days**
- Structured schedule records for one-off date ranges or recurring local-time windows.
- Store IANA timezone and define valid-from/valid-until, local start/end time and recurrence days.
- Use schedule type and constraints to prevent ambiguous rows.
- The exact recurrence policy and whether deals are branch-specific remain open. Do not implement overlapping or branch-override semantics until confirmed.

### E. Catalog publication

**menu_publications**
- Immutable publication row: restaurant, sequential version, catalog schema version, JSONB snapshot, SHA-256 checksum, publisher, published_at and validation metadata.
- Start with one JSONB snapshot. Use chunking only if real payload size/performance tests prove it necessary.
- A publication includes menu content, not private operational data or customer/staff details.

**restaurant_catalog_state**
- One row per restaurant pointing to the current publication ID.
- Publish transaction inserts the immutable snapshot and atomically moves this pointer.
- Rollback moves pointer to a previous valid immutable snapshot; never edits a publication.

**menu_publication_events**
- Private append-only record of draft validation, publish, rollback, actor, time, version and safe details.

### F. Delivery pricing

**delivery_areas**
- One active named area per branch, with English/Urdu labels if needed, explicit fee, sort order and active state.
- Fee must be non-negative and NOT NULL. No default zero. Admin must deliberately enter zero to configure free delivery.
- Composite branch/restaurant constraints prevent a branch-A area being used by branch B.

**branch_delivery_settings**
- One row per branch, with nullable not_listed_delivery_fee, updated_by and updated_at.
- NULL means Not Listed is not configured and checkout is blocked.
- Zero means Admin explicitly configured a free Not Listed fee.
- The public catalog API returns only the safe fee projection for the correct branch; clients do not access the generic settings table.

**orders / delivery_tasks**
- Preserve delivery_selection_type, selected area ID where listed, display/Other label, exact fee and delivery address snapshots.
- Server resolves the fee from delivery_areas or branch_delivery_settings within the order transaction.
- See delivery-pricing-contract.md for the required request payload, validation and tests.

### G. Orders and payments

**orders**
- Branch, order number, source, idempotency key, catalog publication ID/version, fulfillment type, status, customer name/phone/address snapshots, selected delivery details, subtotal, delivery fee, total, currency, payment state, safe notes and lifecycle timestamps.
- Do not include GST/tax tables or calculation in V1.
- Use stable state values and explicit transition logic. Status changes should be performed through role-checked transactional commands.

**order_items**
- Order, line number, optional product/variant/deal references, quantity, product/deal/variant name snapshots, unit price snapshot, line total and item snapshot JSON for non-authoritative descriptive context.
- Product/variant/deal snapshots preserve what was sold even after catalog edits/archive.
- Unique (order_id, line_number).

**order_item_modifiers**
- Order item, optional catalog references, selected modifier/group snapshots, quantity, unit price and total price snapshot.

**order_item_components**
- Order item, optional deal component/selected item references, quantity, component and selected name/variant snapshots.

**payments**
- Separate payment attempts/receipts/refunds if required by existing POS flow; each payment must be idempotent and tied to one order.
- Keep payment status and amount consistent transactionally. Do not infer paid status from a browser flag.

**order_status_history**
- Append-only status transitions, actor, timestamp and reason.
- Keep Order History on normal fetch/manual refresh; do not add broad Realtime.

V1 order financial scope is subtotal + delivery fee + total, plus only payment fields needed by the current POS. Discounts/refunds/extra financial workflows should only be included where the existing app flow requires them. GST is deferred.

### H. Delivery and rider operations

**delivery_tasks**
- One task per delivery order, branch, status, recipient/contact/address/area snapshots, fee snapshot, instructions and lifecycle timestamps.
- Task creation must be atomic with the accepted order's delivery state.

**delivery_task_offers**
- Task, rider user, offer round, offered/expiry/responded timestamps and status.
- Enforce uniqueness and valid offer state transitions.

**delivery_assignments**
- Task, rider user, offer, assignment status, current marker and lifecycle timestamps.
- Enforce one current assignment per task with a unique partial index.
- Include branch scope or an equivalent safe branch key if POS needs branch-filtered Realtime on this table.

**rider_profiles**
- Auth user and branch, rider code/display name, active/availability/accepting_jobs and last-seen fields.

**rider_locations**
- Sensitive, short-retention location records only if the current rider app genuinely requires location tracking; otherwise do not create initially.

**rider_push_subscriptions**
- Private schema/table; push endpoint and keys never readable by browser clients or other riders.

**rider_status_history**
- Optional append-only status change log, scoped to the rider and branch, with retention policy.

### I. POS operations and background reliability

Only include operational tables when the current app flow requires them:
- pos_devices
- register_sessions
- restaurant_tables
- cash_register_movements

Also consider:
- private website-order rate-limit events
- event_outbox for retryable side effects (notifications, webhooks)
- narrow audit events

Do not add tables solely because they existed in the Demo schema.

## 4. High-value invariants to enforce in PostgreSQL

1. Every catalog row belongs to one restaurant; every branch-scoped row references a branch in the same restaurant.
2. A product's subcategory belongs to its category.
3. A variant belongs to the referenced product; order variant/product references use a composite FK to prevent mismatched pairs.
4. A modifier belongs to its group; a product assignment joins only same-restaurant product/group; a modifier selection is allowed only through an active assignment.
5. Every deal component/choice references valid products/variants in the same restaurant.
6. Required selections and min/max choices are validated in one order transaction.
7. Active/published sellable variants and deals have explicit valid prices. NULL is draft/unpriced; zero is explicit free.
8. Published catalog pointer references an immutable publication for the same restaurant.
9. Order line IDs and idempotency keys are unique in the correct branch/source scope.
10. An order item stores immutable name/price/quantity snapshots.
11. Listed delivery selection must have an active area for the same branch; Not Listed must have explicit selection type, null area ID and a configured branch default.
12. No client-provided price, delivery fee, actor ID, staff role or branch ID is authoritative.
13. Delivery task belongs to the same branch as its order; offers/assignments belong to that task and valid rider profile.
14. Only one current delivery assignment per task.
15. Status and offer transitions must be valid; ordinary clients cannot rewrite audit/history rows.

Use foreign keys, unique/check constraints, transactions and server-side authorization together. RLS alone does not enforce every cross-row invariant.

## 5. Security boundary proposal

| Data class | Examples | Browser access |
|---|---|---|
| Public published catalog | Published categories/products/variants/deals/images and branch delivery pricing | Read-only through catalog Edge Function allowlist |
| Authenticated staff operational | Branch orders, selected delivery tasks, POS resources | Only required rows/fields, RLS + server role checks |
| Admin write commands | Menu edits, price changes, delivery fee settings, publish/rollback | Authenticated server commands; no multi-row browser REST writes |
| Rider-private operations | Own offers, current assignments, rider presence | Rider's own rows and task data required for delivery |
| Restricted finance/audit | Payments, role audit, publication audit, order events | Narrow owner/admin/finance permissions |
| Private secrets/PII | Push keys, rate-limit hashes, internal dispatch settings, credentials | Private schema/service-side only; never public API |

Security requirements:
- Enable RLS on every exposed table and review grants separately.
- No raw anonymous SELECT on mutable catalog tables. An Edge Function returns only a published allowlisted payload.
- Private schema has no browser role USAGE/table access.
- Server functions derive actor from verified JWT, never caller-supplied actor_user_id.
- SECURITY DEFINER only where needed; fixed/empty search_path, schema-qualified objects, safe owner and exact EXECUTE grants.
- Protect Storage: private drafts; intentional public published media; no customer/staff private files in public bucket.
- Redact PII, tokens and keys from logs and errors.

## 6. Proposed initial migration sequence

This is a dependency order, not an instruction to apply:

1. Reconcile existing applied Production security baseline migration (already present; never reapply).
2. Tenant core: restaurants, branches and shared constraints.
3. Identity: user_profiles, user_roles, staff_role_audit and private authorization helpers.
4. Catalog core: categories, subcategories, products, variants.
5. Customization: modifier groups/options/assignments/variant price rules.
6. Deals: deals, components, typed choices and structured schedules.
7. Publication: immutable menu_publications, current pointer, publication audit and transactional validation/publish/rollback.
8. Delivery pricing: delivery_areas and branch_delivery_settings.
9. Orders/payments: orders, order_items, modifiers/components, payments and status history.
10. Delivery/rider: tasks, offers, assignments, profiles, private push configuration and required indexes.
11. POS operations only where confirmed required.
12. Storage policies, catalog/order/delivery/staff functions, grants/RLS, indexes, views and targeted Realtime.
13. Create restaurant/branch records via reviewed controlled setup; enter menu through Admin, not SQL image seed.

Some functions/triggers should be introduced in the same migration as the tables and constraints they depend on. Keep migrations focused, test the entire chain against an isolated disposable project first, and run adversarial authorization tests before Production.

## 7. Decisions still open before SQL is authored

1. **Offline POS stale catalog — CONFIRMED:** hold sync when the locally used publication is stale and the server-calculated price/availability would change. Require explicit authenticated cashier/manager confirmation before resubmission; never silently reprice. Implement publication version binding, a stable CATALOG_VERSION_STALE conflict, local needs_confirmation state, a new idempotency key after confirmation, and an audit event. See performance-security-operations-plan.md.
2. **Not Listed locality:** should the website/POS collect a separate locality/mohalla label when Not Listed is selected, in addition to the full delivery address? This field should never control the fee.
3. **Publishing authority:** owner only, or owner/admin/manager? Who can change prices and roll back?
4. **Deal options:** should choices be curated lists, category/subcategory pools, fixed components, or all three?
5. **Schedule policy:** recurring days, date ranges, timezone, and whether branch-specific schedules are required in V1.
6. **Menu scope:** current recommendation is restaurant-wide products/prices with branch-scoped delivery pricing. Confirm whether different branches need different menu prices/availability in the first release.
7. **Inventory:** no ingredient-level stock/inventory schema in V1 unless the user confirms it is required.

GST/tax is not an open V1 decision; it is explicitly deferred.

## 8. Validation plan before Production

- Apply every migration to a disposable Supabase project using the same PostgreSQL/Supabase versions.
- Verify constraints, indexes, triggers, functions, RLS, grants, Storage policies and migration history.
- Test as anon, customer website, owner, admin, manager, cashier, kitchen, rider and an unrelated branch user.
- Attempt IDOR and cross-branch/restaurant access with valid IDs from another scope.
- Attempt tampered product/variant/deal/price/fee/role/branch/status values.
- Test idempotent retries and lost responses for website/POS order creation, payment and delivery transitions.
- Test partial failure and concurrent editing for product+variants, deal+components and publish.
- Test catalog publish/rollback and corrupt/partial catalog downloads.
- Test POS offline order sync with unchanged/stale catalog versions.
- Test delivery area fee, explicit zero, missing Not Listed default, fake client fee and fee update after order.
- Test full encrypted backup and isolated restore, including Storage media.
- Run Supabase security/performance advisors and inspect query plans for common POS/website/Rider operations.

## 9. Safety status

- This document is a proposed ERD and V1 table model only.
- It does not create SQL migration files and has not been applied to Production.
- No Production data, schema, functions, policies, Storage, users, settings or deployments were changed.
- Next: resolve the listed decisions that affect the schema, then produce a field-level migration specification and review it before writing the first new Production DDL migration.

## 3J. Owner-confirmed delivery lifecycle (2026-11-20)

The following workflow is now a confirmed business contract and must be implemented consistently by the Delivery API, POS, Rider portal, transactional database commands, audit records and Realtime events.

### Offer dispatch and response

1. An order becomes ready for rider dispatch. Cashier or Manager explicitly selects a rider and creates a targeted offer. Do not automatically offer the task to the next rider after a rejection or timeout.
2. Only the addressed rider may read or respond to that offer. The offer has a server-generated `offered_at` and `expires_at = offered_at + 60 seconds`.
3. Rider rejection records `rejected`, response time and authenticated actor; the task returns to the POS dispatch queue as unassigned/awaiting reassignment. Cashier or Manager chooses the next rider.
4. If no response arrives, the offer expires at 60 seconds and returns to the POS dispatch queue. The expiry boundary is authoritative in the database: an accept command at or after `expires_at` must fail even if a background expiry worker has not yet updated the row.
5. Expiry processing must be idempotent and safe under concurrent accept/reject/expiry attempts. Use row locking/conditional updates so only one terminal offer outcome wins. POS must be able to recover the queue via normal fetch/polling if a Realtime event is missed.
6. The POS must show the offer outcome and allow a new manual assignment. Preserve each offer attempt; do not overwrite a rejected/expired offer when creating the next one.

### Acceptance, pickup and delivery

7. A rider can accept only their own pending, unexpired offer. Acceptance atomically changes the offer to accepted, creates/activates the current assignment, and moves the task into assigned state. Enforce at most one current assignment per task.
8. The assigned rider alone may record pickup and the out-for-delivery transition, following the existing Rider workflow. All transitions validate the current task/assignment and authenticated rider identity server-side.
9. When the assigned rider marks the order delivered, the delivery task and order complete immediately in the same transaction. No cashier/manager confirmation or proof/OTP/photo is required by the confirmed V1 policy. Store delivered actor and server timestamp; any future proof requirement is a separate decision.

### Failed delivery and physical return

10. If delivery fails, the assigned rider may report failure and choose to return the order. This records a failure/return-in-progress event and moves the task to a return-awaiting-physical-confirmation state; it does not complete the order or mark the return as physically received.
11. Once the rider physically brings the order back, either Cashier or Manager may confirm physical receipt. The confirmation must be a role-checked transactional command and record authenticated actor, role, server timestamp, task/order, previous and resulting states, outcome/reason and request/correlation ID.
12. After confirmation, the delivery task reaches a returned/closed outcome and the order reaches a distinct returned/failed terminal outcome (not delivered/completed). Preserve the original order and all snapshots; no hard deletion.
13. Do not allow the rider to self-confirm physical return. Do not allow a cashier/manager to confirm before the task is in the return-awaiting-confirmation state. Duplicate confirmations must be idempotent or safely rejected without duplicate history.
14. Cashier and Manager both have physical-return confirmation permission. This specific confirmation permission does not grant Cashier general Manager privileges, Admin-panel access, or authority to cancel accepted orders outside this return flow.

### Suggested state model (final names to be normalized in migration specification)

- Offer: `pending -> accepted | rejected | expired` (exactly one terminal outcome).
- Task: `awaiting_assignment -> offered -> assigned -> picked_up -> out_for_delivery -> delivered`; failure path: `out_for_delivery -> return_pending_confirmation -> returned`. A rejected/expired offer returns the task to `awaiting_assignment`.
- Order: retain the existing order acceptance/preparation lifecycle; delivery success transitions to `delivered/completed` immediately, while confirmed physical return transitions to a separate `returned` or equivalent failed-delivery terminal state. Do not conflate delivery-task state and order state.

### Database/API implementation invariants

- Use server time for offer creation/expiry and every lifecycle timestamp. Never accept client-supplied actor IDs, role, timestamp, task status or expiry.
- Offer acceptance, rejection, timeout, assignment activation, pickup, delivery completion, rider failure/return report and physical-return confirmation are narrow commands with explicit role/branch/ownership checks and append-only events.
- Preserve rejected/expired offer attempts and status history. Audit actor, actor role, old/new state, timestamp, reason/outcome and correlation ID as applicable.
- Keep Rider reads and Realtime strictly filtered to the authenticated rider's own offers/assignments. POS dispatch updates remain branch-scoped. Order History remains ordinary fetch/manual refresh, not broad Realtime.
- The 60-second deadline must be enforced synchronously by the accept command; background expiry processing exists to update POS visibility and emit events, not to define whether an offer is still acceptable.
- No Production DDL or application implementation has been created by recording this decision.



## Delivery lifecycle field specification

The owner-confirmed delivery lifecycle is now specified in detail in [`delivery-lifecycle-contract.md`](./delivery-lifecycle-contract.md). Treat that document as the authoritative field-level proposal for delivery tasks, immutable offer attempts, assignments, append-only task events, state transitions, transactional command contracts, 60-second expiry and acceptance tests. This supplements the conceptual ERD above; it does not authorize SQL or Production DDL.

## Field-level schema and Free-plan implementation spec

The draft field-level design is now maintained in [production-field-level-schema-v1.md](./production-field-level-schema-v1.md). It expands the conceptual entities above into candidate columns/types, tenant and branch constraints, indexes, RLS/grant strategy, Edge Function command boundaries, rate-limit storage and Free-plan usage budgets. This is still a design proposal; no SQL migrations or Production DDL are authorized. Use it together with delivery-lifecycle-contract.md, delivery-pricing-contract.md and security-access-matrix-v1.md.
