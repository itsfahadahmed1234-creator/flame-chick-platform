# Flame Chick Menu V1 — Proposed Database Object Contract

Date: 2026-11-21
Branch: \`work/production-source-audit\`
Status: design-level object contract for migration preparation; not executable SQL and not Production approval

This contract follows the uploaded menu and the verified live schema report in \`docs/handoffs/2026-11-21-menu-schema-reconciliation.md\`. Existing empty catalog tables are reused; only missing capabilities and precise relationship corrections are proposed.

## 1. Existing tables retained

Keep the existing tables:
\`categories\`, \`subcategories\`, \`products\`, \`product_variants\`, \`modifier_groups\`, \`modifiers\`, \`modifier_group_assignments\`, \`modifier_price_rules\`, \`drink_options\`, \`branch_product_availability\`, \`branch_variant_availability\`.

Keep explicit \`categories.category_kind\`; keep nullable \`product_variants.price NUMERIC(12,2)\`; keep existing branch product/variant overlays and restaurant timezone. No direct app-role table grants or policies are added.

## 2. Variant metadata extension

Extend \`product_variants\` with:
- \`variant_kind TEXT NOT NULL DEFAULT 'standard'\`, allowed: \`standard\`, \`portion\`, \`flavour\`, \`pack\`, \`volume\`.
- \`pack_quantity INTEGER NULL\`, positive when supplied.
- \`pack_unit TEXT NULL\`, trimmed bounded label (e.g. \`pcs\`).
- \`is_standalone_sellable BOOLEAN NOT NULL DEFAULT true\`.

Keep \`size_key\` and \`size_label\` for compatibility and stable option display, but stop treating every variant as a beverage/product size in Admin UI. \`drink_options.volume_ml\` remains the authoritative measured beverage volume. Do not duplicate beverage volume into generic variant metadata in V1.

Semantics:
- Quarter/Half/Full Broast: \`portion\`.
- Whole Chicken Broast flavour options: \`flavour\` if the menu owner chooses one product with flavour variants.
- 12 pcs / 6 pcs Nuggets and 6 pcs Wings: \`pack\`, with integer pack_quantity and unit \`pcs\`.
- Water/Cold Drink regular and 1.5L options: \`volume\`; \`drink_options.volume_ml=1500\` for 1.5L. Regular volume stays NULL until known.
- Fries/Juice/6-piece Nuggets/1L drink may be active deal-only variants with \`is_standalone_sellable=false\`. Active state means the option is a valid catalog component; standalone sellability is a separate check.

No multi-axis variant combination table is introduced for this menu.

## 3. Exact variant-scoped modifier pricing

Change \`modifier_price_rules\` authoritative relationship:
- Add \`product_variant_id UUID NOT NULL\`.
- Add composite FK \`(product_variant_id, restaurant_id, product_id)\` to \`product_variants(id, restaurant_id, product_id)\`.
- Replace uniqueness \`(modifier_id, product_id, size_key)\` with \`(modifier_id, product_variant_id)\`.
- Remove the old \`(restaurant_id, product_id, size_key)\` FK and retire \`size_key\` after API adapter transition.
- Preserve modifier/group/product assignment same-tenant FKs.

The table is confirmed empty, so no row backfill is needed. Migration must explicitly preflight zero rows before dropping the old key, or provide a guarded conversion if that changes before application.

## 4. Deal collections and deals

### \`deal_collections\`
One visible heading/group in Deals & Combos, e.g. Flame Hour or Kids Deals.
- \`id UUID PK\`, \`restaurant_id UUID NOT NULL\`.
- \`category_id UUID NOT NULL\` references a \`category_kind='deal'\` category in same restaurant.
- \`name_en/name_ur\`, \`sort_order\`, \`is_active\`, timestamps.
- Optional \`schedule_set_id\` assigned after schedule tables exist.
- Unique composite keys for tenant-safe child FKs.
- No free-form metadata as the canonical deal composition.

### \`deals\`
One purchasable offer row, not a collection heading.
- \`id UUID PK\`, \`restaurant_id UUID NOT NULL\`, \`collection_id UUID NOT NULL\`.
- \`legacy_id\` nullable compatibility only.
- \`title/title_ur\`, descriptions, image metadata, \`sort_order\`.
- \`bundle_price NUMERIC(12,2) NULL\`; NULL allowed in draft, non-negative when present.
- \`is_active\`, \`is_available\`, timestamps.
- Unique tenant-scoped identity and FK to collection.
- No separate deal variant table in this menu-first V1; each distinct printed offer is its own deal row.

The six printed offers are:
1. Flame Hour: The Injector + Drink.
2. Flame Hour: Quarter Broast + Burger + Drink.
3. Flame Duo.
4. Flame Feast.
5. Kids Deals: Mini Flame.
6. Kids Deals: Little Crunch.

### \`deal_component_groups\`
Required/optional component slot:
- \`id\`, \`restaurant_id\`, \`deal_id\`.
- \`name_en/name_ur\`, \`sort_order\`.
- \`min_units INTEGER NOT NULL\`, \`max_units INTEGER NOT NULL\`, both bounded and min <= max.
- \`allow_repeat_option BOOLEAN NOT NULL\`.
- \`max_units_per_option INTEGER NULL\` (when NULL, constrained by group max; otherwise positive and <= group max).
- \`is_required BOOLEAN\` may be derived from min_units > 0; avoid storing contradictory duplicate semantics.
- Unique tenant-scoped group identity.

### \`deal_component_options\`
Explicit allowed variant in one component group:
- \`id\`, \`restaurant_id\`, \`deal_id\`, \`component_group_id\`, \`product_id\`, \`product_variant_id\`.
- \`pricing_treatment TEXT\`: \`included\`, \`surcharge\`, \`standalone\`.
- \`unit_surcharge NUMERIC(12,2) NOT NULL DEFAULT 0\`; non-negative; must be zero unless treatment is surcharge.
- \`max_quantity_per_deal INTEGER NULL\`, bounded positive if supplied.
- \`sort_order\`, \`is_active\`, timestamps.
- Composite FKs enforce same restaurant/deal/product/variant and component group ownership.
- Unique option per group and variant.
- An option must point to an active product and active variant at publication; branch availability checked at quote/checkout.
- \`included\` adds zero; \`surcharge\` adds explicit surcharge per selected unit; \`standalone\` adds current published variant price only for genuinely additional units. A required included slot is not charged its full standalone price.

### \`branch_deal_availability\`
Sparse branch override:
- \`id\`, \`restaurant_id\`, \`branch_id\`, \`deal_id\`, \`is_available\`, timestamps.
- Unique \`(branch_id, deal_id)\`.
- Composite FKs enforce same tenant.
- Effective availability requires deal active/available globally, collection active, branch active, and branch override not false.

## 5. Schedule model

### \`catalog_schedule_sets\`
- \`id\`, \`restaurant_id\`, \`name\`, \`timezone_scope\` or equivalent explicit inheritance mode, timestamps.
- Restaurant timezone is the default.
- Branch timezone override is optional and falls back to restaurant timezone.
- Collection schedule assignment may be a nullable FK from \`deal_collections\`; separate assignment table can be chosen if multiple schedules per collection become a real requirement. V1 should prefer one schedule set per collection.

### \`catalog_schedule_windows\`
- \`id\`, \`restaurant_id\`, \`schedule_set_id\`.
- Window type: weekly or one_off.
- Weekly: ISO weekday 1–7, local start time, local end time.
- One-off: timestamptz start/end.
- Optional effective_from/effective_to dates for recurring weekly windows.
- Explicit all_day flag if all-day operation is required; do not encode 24h with ambiguous equal start/end.
- Start inclusive, end exclusive.
- Overnight window when end <= start must be evaluated against the originating weekday, including after midnight.
- Multiple windows per weekday are allowed; overlapping/ambiguous windows should be rejected at publication or normalized by validation.

Flame Hour gets one weekly window 15:00–17:00 after weekdays are selected by Admin. Do not default weekdays to all seven.

### Branch timezone
Add nullable \`branches.timezone\` with IANA validation in trusted command logic. Effective timezone = branch timezone when set, otherwise restaurant timezone. Avoid a DB CHECK that queries \`pg_timezone_names\`; validate in trusted commands and publish validator.

## 6. Draft, audit and publication

### \`catalog_draft_state\`
One row per restaurant:
- \`restaurant_id PK/FK\`.
- \`revision BIGINT NOT NULL DEFAULT 0\`.
- \`updated_at\`, \`updated_by UUID\`.
- Revision increments exactly once per successful catalog aggregate command/publication-affecting draft change.

### \`catalog_audit_log\`
Append-only:
- \`id\`, \`restaurant_id\`, \`actor_user_id\`, \`actor_role_key\`.
- \`action_key\`, \`entity_type\`, \`entity_id\`, \`request_id\`.
- \`revision_before/revision_after\`.
- Safe \`before_state/after_state JSONB\` snapshots (exclude credentials, private customer data, and media bytes).
- \`occurred_at\`.
- Deny UPDATE/DELETE/TRUNCATE to application roles; append only through trusted command transaction.

### \`catalog_publications\`
Immutable:
- \`id\`, \`restaurant_id\`, \`publication_number\`, \`draft_revision\`.
- \`schema_version\`, \`pricing_engine_version\`.
- \`snapshot JSONB NOT NULL\`, \`snapshot_sha256 TEXT NOT NULL\`.
- \`published_by\`, \`published_at\`.
- Unique \`(restaurant_id, publication_number)\`.
- No updates/deletes after insert; enforce with owner-controlled trigger and privileges.

### \`catalog_current_publication\`
One row per restaurant:
- \`restaurant_id PK\`, \`publication_id\`, \`updated_at\`, \`updated_by\`.
- FK ensures publication belongs to same restaurant.
- Pointer switch and publication insert occur in one transaction.
- Rollback updates pointer only; immutable publication history remains.

Public catalog function reads this pointer and immutable snapshot only. It must not reconstruct from mutable draft tables.

## 7. Pricing / validation rules

- All currency values use NUMERIC(12,2), PKR for current restaurant.
- Ordinary item line = quantity × (published variant price + resolved modifier charges).
- Combo line = configured deal price + sum(component units × explicit surcharge) + any genuinely additional standalone components.
- Included choices add zero; never double charge component standalone price.
- NULL/TBD price is not purchasable. Explicit zero is a valid free price.
- A deal-only variant may be selected only through a published deal component option; standalone product checkout rejects it.
- All required group unit counts and option quantity limits are validated server-side.
- Branch availability is checked for every selected component variant.
- Schedule evaluation uses one captured DB timestamp and effective local timezone.
- Checkout and quote use the same canonical pricing implementation/version and current publication identity.

## 8. RPC/Edge Function contract (next layer, not defined as SQL in this document)

Expose business actions, not raw table CRUD:
- Draft read.
- Category/subcategory aggregate upsert/archive.
- Product + variant aggregate upsert/archive.
- Modifier group/options/assignments aggregate upsert/archive.
- Deal collection + schedule aggregate upsert.
- Deal + component groups/options aggregate upsert/archive.
- Branch availability update.
- Publish validation + atomic publish.
- Rollback to a prior immutable publication.

All write commands require verified JWT \`auth.uid()\`, Admin/Owner authorization from server-side role records, server-resolved restaurant, expected draft revision, request idempotency, explicit payload allowlists, tenant-safe relationship checks and same-transaction audit. Use SECURITY DEFINER only where needed, empty search_path and fully qualified object names, explicit EXECUTE grants.

## 9. Migration preparation gates

Before generating executable migration SQL:
1. Confirm no rows in the 11 catalog tables and no app dependencies on the proposed columns (already currently zero catalog rows; inspect source DTO consumers again).
2. Freeze exact FK and unique constraint names from live schema.
3. Choose whether schedule collection link is direct nullable FK or separate assignment table (V1 recommendation: direct FK).
4. Decide whether \`max_units_per_option\` is sufficient or whether options need explicit minimum quantity (V1 recommendation: group min/max + option max only).
5. Include a preflight that requires \`current_user = postgres\` and \`session_user = postgres\`, verifies prerequisite relations, and aborts if unexpected rows/schema drift are found.
6. Keep RLS enabled and revoke all direct table privileges from PUBLIC and app roles on every new table.
7. Verify every new FK has a child-side index.
8. Add transactional migration tests, golden pricing/schedule fixtures, security/role tests and concurrency/revision tests.
9. Inspect resulting owner, RLS, ACL, policies, indexes, functions, function search_path and publication immutability.
10. No Production application until separate explicit owner approval.

This document defines the intended relational object contract only. It does not claim these objects currently exist.
