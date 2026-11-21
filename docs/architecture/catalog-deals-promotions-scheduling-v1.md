# Flame Chick — Deals, Combos, Promotions & Time-Based Availability V1

Date: 2026-11-21
Branch: `work/production-source-audit`
Status: owner-approved design direction; deal schema and command migrations applied to the empty Production project; no menu/staff data inserted; publication/runtime and app integration remain pending
Production project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## 1. Objective and boundary

Extend the existing catalog so the Admin panel can author ordinary fast-food menus and structured combo offers without adding a database migration for each new product, option, deal, schedule or promotion.

The design must support common Pakistani fast-food patterns: burger and drink combos, pizza meals, choose-your-own bundles, family deals, multiple included sides/drinks, size upgrades, paid add-ons, time-limited lunch or evening deals, weekday offers, date-specific campaigns, coupon discounts and branch-specific availability.

This document is the reviewed domain contract and implementation reference. The deal schema and Admin/Owner command layer described below have now been applied to the empty Production project. This does not authorize menu seeding, public API release, Edge Function deployment or Admin UI enablement.

## 2. Existing foundation — keep and extend

The 11 existing catalog tables remain the foundation:
- Categories/subcategories/products/product variants.
- Modifier groups/options/product assignments/size-specific modifier prices.
- Drink volume options.
- Branch product and variant availability overlays.

The existing catalog is restaurant-wide for base items and prices. Branches may override sellability/availability, but must not silently override base prices. Existing `category_kind` explicitly distinguishes `menu` and `deal`; deals must reference a `deal` category. Never infer category type from a legacy ID or label.

The current product variant contract represents a sellable size/portion/volume choice. Other recipe choices such as crust, spice level, protein, sauces, toppings and add-ons remain explicit modifier groups/options with selection limits and server-resolved prices. Flavours that are independently prepared/menu-listed can be separate products. This is data configuration, not a hardcoded list of Pakistani food categories.

## 3. Structured combo/deal model

Deals are not ordinary products with a JSON blob. They are first-class catalog entities with relational composition and typed foreign keys.

### Proposed relational entities

| Entity | Purpose |
|---|---|
| `deals` | Deal identity, deal category, name/description/media, active/archive state, availability mode and sort order. |
| `deal_variants` | Purchasable deal configurations and their nullable-during-draft base price. Supports different deal sizes/tiers such as Regular/Family. |
| `deal_component_groups` | Required/optional slots such as Burger, Pizza, Side, Drink or Dessert; each has min/max selected units, single/multiple selection and display order. |
| `deal_component_options` | Explicit allow-list of eligible product + exact product variant choices for a component group. |
| `deal_variant_component_options` | Which component options are permitted for each deal variant and how each option is priced for that variant. |
| `branch_deal_availability` | Branch-level enable/disable overlay, following the same conservative model as product/variant availability. |

Every row carries `restaurant_id` where needed. Composite foreign keys must enforce that the deal, category, deal variant, product, product variant, group, option and branch all belong to the same restaurant. A deal cannot include another deal in V1; this avoids recursive bundle pricing.

### Component selection rules

A deal can define any number of component groups. Each group has:
- A minimum and maximum number of selected units.
- Single or multiple selection semantics.
- A quantity limit per option.
- A stable display order and bilingual labels.
- An explicit allow-list of component options.

An option points to one exact product variant, not a client-supplied product name or free-form JSON selector. This makes the selection graph reviewable and FK-safe. The UI can show several variants as separate selectable options and group them under the same product name.

Examples:
- “Choose 1 burger” + “Choose 1 side” + “Choose 1 drink”.
- “Choose any 2 sides” with repeat quantity rules.
- Family bundle with 2 burgers, 2 sides and a drink.
- Pizza deal with a base pizza, selectable crust/toppings through the selected product's own modifier groups, and a drink size upgrade.
- Fixed combo where the customer may choose between approved products, but cannot substitute arbitrary menu items.

The selected product retains its ordinary modifier assignments, so deal components can still use cheese, sauces, spice, toppings or other product customizations. The order validator must apply those product-level selection and price rules to each selected component.

### Deal pricing — no browser-calculated totals

Each deal variant has an explicit pricing mode:
- `FIXED_BUNDLE`: a required base bundle price is charged; component choices are included unless a configured surcharge applies.
- `BASE_PLUS_SELECTED_ITEMS`: a required base amount is combined with the standalone variant prices of selected component choices, plus any explicitly configured surcharge.

Each deal-variant/component-option pair has one explicit pricing treatment:
- `INCLUDED`: adds zero.
- `FIXED_SURCHARGE`: adds a non-negative configured amount.
- `ADD_VARIANT_PRICE`: adds the selected product variant's server-stored price.

No missing rule may silently default to free. A missing allowed-option pricing row means that option is not selectable for that deal variant. Draft prices may be NULL; publication and checkout must reject any required unpriced value. Explicit zero remains a valid, deliberate price.

Prices use the restaurant currency and Postgres numeric arithmetic. Do not accept component prices, deal totals, discounts, branch prices or line totals from the browser. One trusted pricing path must resolve them from the current publication and selected IDs.

## 4. Promotions — separate from sellable combo deals

A combo is a sellable menu offer. A promotion is a rule that changes the price or eligibility of an existing product, category, deal or order. Keep these concepts separate so a scheduled discount does not have to be duplicated as a second menu product.

### Proposed relational entities

| Entity | Purpose |
|---|---|
| `promotions` | Promotion identity/status, discount type/value, min subtotal, maximum discount, priority and stacking policy. |
| `promotion_targets` | Typed target scope: whole order, product, menu category or deal. Exactly one target scope per row. |
| `promotion_coupon_codes` | Optional normalized coupon codes with a unique restaurant-scoped lookup key. |
| `promotion_channels` | Explicit eligible order channels, initially Website and POS. |
| `promotion_schedule_assignments` | Links a promotion to one or more schedule sets, globally or for a specific branch. |
| `promotion_branch_rules` | Optional branch allow/deny override for a promotion. |
| `promotion_redemptions` | Later order-domain ledger for atomic usage limits and per-customer caps; must be integrated with the order transaction before limits are advertised/enabled. |

V1 discount primitives should cover percentage-off, fixed-amount-off and fixed-price offers with an optional maximum discount and minimum eligible subtotal. Target scope supports whole order, product, category or deal. Coupon code is optional.

Stacking must be explicit. Default to exclusive/non-stackable. When stacking is deliberately enabled, the order pricing engine must apply a deterministic priority and cap calculation. Two promotions must never both discount the same amount just because they were returned by separate queries.

Usage caps must not be enforced with a read-then-write counter. They require a transactional reservation/redemption ledger tied to the order, unique idempotency and row-level locking. Until the order schema is ready, usage caps and per-customer caps remain design-only and must not be exposed as working features.

Advanced mechanics such as buy-X-get-Y, loyalty points, referral credits, targeted customer segments and payment-method-specific offers are intentionally not part of this first implementation slice. They can be added as typed rule families later; do not approximate them with arbitrary JSON.

## 5. Reusable schedules and time-zone semantics

Use a shared schedule model rather than repeating ad hoc date/time columns across deals and promotions.

### Proposed relational entities

| Entity | Purpose |
|---|---|
| `catalog_schedule_sets` | Named schedule, restaurant, explicit IANA timezone, active state and optional inclusive effective date bounds. |
| `catalog_schedule_weekly_windows` | One row per weekday/time window; supports multiple windows per day. |
| `catalog_schedule_date_windows` | One-off absolute `timestamptz` windows, e.g. a campaign from Friday 18:00 to Sunday 23:00. |
| `deal_schedule_assignments` | Assigns schedule sets to a deal, globally or to a branch. |
| `promotion_schedule_assignments` | Assigns schedule sets to a promotion, globally or to a branch. |

The timezone is copied from the restaurant's configured timezone when the schedule set is created and stored explicitly. Validate it against PostgreSQL's IANA timezone catalog. Do not rely on browser locale, device clock, server default timezone or hardcoded Pakistan offsets.

Weekly schedule rules use local weekday + local start/end times. Multiple windows per weekday are supported. An end time earlier than the start means the window crosses midnight into the next day; the weekday belongs to the starting day. Equal start/end is invalid unless an explicit all-day flag is selected. Effective-from/effective-until dates are interpreted in the schedule's timezone.

One-off date windows use absolute timezone-aware timestamps and require start < end. Window boundaries are start-inclusive and end-exclusive. Weekly and one-off windows within a schedule set are OR conditions. Multiple assigned schedule sets are also OR conditions.

Branch precedence is explicit:
1. A branch-specific schedule assignment for that deal/promotion overrides the restaurant-wide schedule assignment for that branch.
2. If no branch-specific assignment exists, the restaurant-wide assignment is the fallback.
3. The separate branch availability/eligibility overlay can still disable the deal or promotion at that branch.
4. A globally inactive/archive item cannot be re-enabled by a branch override.

This makes lunch, dinner, happy-hour, weekend, Ramadan/date-specific and branch-specific schedules data changes through Admin.

### Runtime evaluation

No cron job is required to flip an `is_active` field at the schedule boundary. The trusted server/database evaluator checks current database time against the published schedule definition each time availability or checkout pricing is resolved. This avoids stale flags, dependence on background workers and free-plan scheduling complexity.

The public catalog response may include server-evaluated current availability and next-window metadata for display, but checkout must always re-evaluate schedules against database time. A cached response must expire no later than the next relevant schedule boundary.

## 6. Publication, branch overlays and historical orders

Deals, deal choices, promotion rules and schedule definitions are draft-authored data and must be included in the same immutable catalog publication/version as products and modifiers. The publish validator must reject:
- A deal without an active deal category or at least one complete purchasable variant.
- Component groups with impossible min/max bounds or no selectable options.
- Options pointing to inactive, archived, unavailable or foreign-restaurant products/variants.
- A deal variant with an unpriced required base or component price.
- An invalid modifier configuration on any selectable deal component.
- A scheduled item with an empty/invalid schedule or invalid timezone.
- Conflicting or ambiguous promotion stacking/target configuration.
- A branch override that references an item outside the same restaurant.

Publish snapshot creation and current-pointer change must be atomic. Published snapshots are immutable. Rollback selects a prior snapshot; it never rewrites it.

Branch availability is evaluated as a separate overlay and is not allowed to change base prices. A branch can disable a globally active deal/product/variant but cannot reactivate something globally inactive.

When orders are implemented, each purchased deal must store a server-generated immutable receipt snapshot containing the deal variant, exact selected component product/variant IDs, quantities, component modifiers, pricing treatment, resolved unit/line prices, applied promotion identifiers and discount amounts. Historical orders must remain correct after menu prices, deal composition, schedules or promotions change. The order snapshot is a historical record, not a source of live catalog truth.

## 7. Security and transactional command boundary

- Keep all authoring tables deny-by-default with RLS enabled and no direct table grants/policies for `anon`, `authenticated` or `service_role`.
- Admin and Owner only may create/edit/archive/publish deals and promotions. Manager, Cashier and Rider are denied catalog authoring.
- Resolve actor from verified JWT `auth.uid()`; resolve restaurant and role from server-side membership tables. Never trust body-supplied actor, role, tenant, branch, price or publish flags.
- Use narrowly scoped authenticated Edge Function/RPC commands; secret/service key remains server-side.
- Use atomic aggregate commands for a deal and all its variants/groups/options/prices; never make sequential browser writes that can leave a half-saved combo.
- Require expected draft revision, request idempotency and transaction-level locking. A stale editor must get a conflict, not overwrite another Admin's work.
- Append actor/audit rows in the same transaction. Audit is append-only.
- Use same-restaurant composite FKs and restrictive delete behavior. Archive referenced rows; never cascade-delete a product/variant used by a deal or historical order.
- Use exact-origin CORS, strict input schemas, request size limits and explicit command allowlists.
- No direct REST mutation or Storage metadata write from the Admin browser.

## 8. Validation and QA matrix before any Production migration

### Deal behavior
- Fixed bundle with included components totals exactly the configured bundle price.
- Fixed bundle with one or more size upgrades adds only configured surcharges.
- Build-your-own deal adds exact selected variant prices and base amount.
- Required and optional component groups enforce min/max selected units.
- Duplicate selections respect quantity limits; no unlisted option is accepted.
- Selected product modifiers obey their own required/min/max and size-price rules.
- Cross-restaurant and product/variant mismatch references fail at the database boundary.
- Inactive/archived products or variants cannot be published or checked out in a deal.
- A missing price rule is rejected rather than treated as zero.
- Failed aggregate write rolls back every child row.

### Schedule behavior
- Weekly Monday-Friday lunch window.
- Multiple windows for one weekday.
- Overnight Friday window extending into Saturday.
- One-off date/time window.
- Effective date boundaries and exact start/end semantics.
- Branch-specific schedule takes precedence over global fallback.
- Branch disable overrides a matching schedule.
- Invalid timezone, empty schedule and invalid date range are rejected.
- DST gap/fold behavior is explicitly tested for timezones that observe DST, even though Flame Chick currently uses Pakistan time.
- Device clock manipulation does not alter server availability or checkout outcome.

### Promotion behavior
- Percentage, fixed amount and fixed price calculations.
- Minimum subtotal and maximum discount caps.
- Coupon normalization and wrong/expired coupon denial.
- Exclusive stacking and deterministic explicitly-enabled stacking.
- Promotion branch/channel/target restrictions.
- Usage caps race test and replay/idempotency test when the redemption ledger is added.
- Checkout re-evaluates all rules server-side and never trusts client discount totals.

### Platform security and lifecycle
- Admin/Owner allowed; Manager/Cashier/Rider denied.
- Tenant and branch isolation.
- Concurrent edits and stale draft revision.
- Repeated command request returns the original result without duplicate rows.
- Append-only audit cannot be updated/deleted by application roles.
- RLS/ACL/security advisor check; no exposed table access or Realtime.
- Snapshot immutability, checksum, atomic pointer switch and rollback.
- Historical order snapshot remains unchanged after catalog edits.

## 9. Safe delivery plan

1. **Design contract (this document):** settle the relational shape and business semantics before writing DDL.
2. **Migration candidate:** add deal, schedule and promotion tables, composite constraints, indexes, triggers and RLS/ACL. Generate and review migration files only on the working Git branch.
3. **Database QA:** execute disposable rollback-only constraint tests and pure pricing/schedule evaluator tests. No seed data.
4. **Secure commands:** authenticated Admin/Owner atomic aggregate commands, audit, draft revision and idempotency.
5. **Publication:** immutable catalog snapshots and pointer include products, modifiers, deals, promotions and schedule definitions.
6. **Read/checkout services:** public catalog reads only the publication; checkout recalculates deal and promotion pricing against current server time and branch availability.
7. **Admin UI:** replace every direct REST mutation with authenticated commands; keep catalog/deal/promotion screens disabled until contract tests pass.
8. **Production gate:** independently verify migration dry-run, ownership, RLS, grants, indexes, advisors and rollback plan. Apply only after a separate owner approval. Never use a Supabase branch or paid plan for this work.

## 10. Explicit exclusions for this slice

GST/tax remains deferred. Inventory, stock depletion, allergens, loyalty, referral, customer segmentation, BOGO/buy-X-get-Y, delivery fees and payment-method promotions are not silently included. They need their own typed domain rules and validation before being presented as supported.

## Current implementation truth

Production still has only the previously verified 11-table catalog foundation and 15 FK indexes. All catalog tables are empty, owned by `postgres`, RLS-enabled, have no policies/direct app-role table grants and are not in Realtime. No deal, schedule, promotion, catalog command or publication tables have been created. This document records the design direction only.


---

## 18. Implementation status — 2026-11-21

The following deal-builder schema and command migrations are now applied on `work/production-source-audit` to Production project `adkrxfnawdiljhjaavnj` (Mumbai, Free):

- `20261121152231_flame_chick_deal_builder_schema_v1`
- `20261121153223_flame_chick_deal_commands_v1`
- `20261121154711_flame_chick_deal_builder_fk_indexes`

### Implemented data model adjustments

- Added `deal_variants` so Regular/Family/etc deal prices are not forced into one legacy `deals.bundle_price`.
- Added `deal_variant_component_options` as the authoritative allowed-option and pricing-treatment map for each deal variant. Treatments are INCLUDED, SURCHARGE and STANDALONE, with explicit per-unit surcharge and per-variant quantity cap.
- Retained legacy `deals.bundle_price` and old component-option pricing fields for DTO/source compatibility only; new deal commands do not use them as pricing source.
- Added IANA `timezone` to `catalog_schedule_sets`, backfilled from restaurant timezone, and validated through a database trigger.
- Added `deal_schedule_assignments` for deal-wide and branch-specific schedule overrides. Active branch-specific assignment overrides active deal-wide assignment; active deal-wide assignment overrides collection fallback. Inactive assignments fall through.
- Branch-specific schedule timezone must equal branch timezone (or restaurant timezone when branch override is absent); global deal assignment timezone must equal restaurant timezone.
- Branch deal availability remains a separate boolean override.

### Implemented command APIs

Admin/Owner-only wrappers now support collection create/edit/read, deal create/edit with variants, component-group and exact product-variant option authoring, per-deal-variant option allow-list/pricing maps, schedule-set/window authoring and explicit window removal, deal schedule assignments, branch availability, bounded collection/deal/schedule list reads, and deal/schedule detail reads.

All mutation APIs share the existing actor resolver, per-restaurant catalog draft revision lock, SHA-256 idempotency ledger and same-transaction append-only actor audit. Public wrappers are SECURITY INVOKER and authenticated-only. Internal command/read functions are postgres-owned SECURITY DEFINER with empty search_path. No direct table CRUD/read grants are exposed to app roles.

### Publication/runtime still pending

The migration intentionally does not seed a single deal or schedule. Draft authoring allows incomplete variants/options. Publication compiler must enforce all active group min/max constraints, complete eligible mappings for required choice groups, treatment compatibility, variant/price presence, product/variant tenant and sellability, quantity limits, and schedule/branch effective windows before creating an immutable versioned snapshot. Runtime quote logic must use only the published snapshot, not the mutable draft tables.

The exact public DTO and the single catalog Edge Function router are still pending. Existing Admin direct-REST writes remain disabled. No Edge Function or Admin catalog module is enabled by this implementation.

Detailed migration and QA record: `docs/handoffs/2026-11-21-deal-builder-command-implementation.md`.
