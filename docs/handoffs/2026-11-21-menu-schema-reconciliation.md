# Flame Chick — Menu / Live Schema Reconciliation

Date: 2026-11-21
Branch: \`work/production-source-audit\`
Production project: \`adkrxfnawdiljhjaavnj\` (Mumbai, Free plan)
Status: read-only Production inspection complete; design reconciliation recorded; no Production changes

## 1. Inspection scope and verified state

Read-only inspection was performed against the active Production project and the working-branch source:
- Supabase project status and migration list.
- Verbose table metadata plus \`information_schema.columns\` and \`pg_constraint\`.
- Applied catalog foundation migration.
- \`apps/flame-chick-admin/app.js\`.
- \`supabase/functions/flame-chick-catalog/index.ts\`.
- Existing deal/combo/schedule design document.

Production is ACTIVE_HEALTHY on PostgreSQL 17.12. Applied migration list contains 12 migrations, including:
- \`20261121061000_flame_chick_catalog_authoring_foundation\`
- \`20261121062000_flame_chick_catalog_fk_indexes\`

The 11 catalog tables remain empty. Prior verified security posture remains: postgres ownership, RLS enabled, zero policies, no direct table grants to anon/authenticated/service_role, no Realtime entries; the 15 reviewed FK indexes exist and are postgres-owned. No deal, schedule, draft/audit, publication, or catalog command tables/functions were found.

No SQL write, migration, seed, deployment or configuration change was performed in this inspection.

## 2. Existing structures that already fit the menu

| Existing table/field | Verified capability | Menu use |
|---|---|---|
| \`categories.category_kind\` | Exists with \`menu\` and \`deal\` | Nine ordinary sections and a separate Deals & Combos category. Do not add this column again. |
| \`products\` | Bilingual names/descriptions, category/subcategory, media, featured/order, active/available flags | Ordinary products and future deal-only component products. Product rows are constrained to \`category_kind='menu'\`. |
| \`product_variants\` | One keyed labelled variant per product, nullable \`numeric(12,2)\` price, active/available flags | Quarter/Half/Full Broast; regular/1.5L drinks; product portion/pack/flavour choices. |
| \`drink_options\` | Variant-linked display labels, \`volume_key\`, optional \`volume_ml\` | Water/Cold Drink size metadata; confirmed 1.5L = 1500ml; future 1L = 1000ml. Unknown regular volume remains NULL. |
| Modifier groups/options | Required/optional selection mode, min/max options, FREE/FIXED/BY_SIZE price modes | Keep available for a future menu-defined customization; this pictured menu does not currently require a toppings/sauces workflow. |
| Branch product/variant availability | Sparse branch-level sellability overrides | Existing basis for per-branch item availability; add a corresponding deal availability overlay. |
| \`restaurants.timezone\` | Required IANA timezone field | Restaurant-level schedule fallback. |

The nine ordinary menu categories are Starters, Injected Broast, Whole Chicken Broast, Chicken Burgers, Flame Beef, Flame Fish, Wraps, Beverages and Shakes. Deals & Combos is a separate \`category_kind='deal'\` category.

The existing variant price correctly distinguishes NULL from zero at the database layer. NULL is appropriate for every TBD price; zero must remain a deliberately free item.

## 3. Verified schema gaps / adjustments

### 3.1 Variants need explicit meaning and pack metadata

The existing physical fields are named \`size_key\` and \`size_label\`, and the current Admin editor presents them as size rows. The upcoming menu uses that same one-dimensional variant mechanism for different meanings:
- Portion: Quarter, Half, Full Injected Broast.
- Flavour: Cheetos Butter, Nashville, Simple Injected under Whole Chicken Broast.
- Pack: Nuggets 12 pcs, Wings 6 pcs, and the future six-nugget deal component.
- Volume: regular and 1.5 Ltr beverage choices.

Before menu authoring, add typed variant metadata such as \`variant_kind\` (portion/flavour/pack/volume/standard) and pack count/unit fields. The customer-facing label remains explicit. Drink volume continues to use the existing \`drink_options.volume_ml\` field. Do not infer a volume for the unlabeled regular drink.

Deal-only variants also need a clear standalone-sale switch. For example, Fries, Juice or a six-piece nugget component may be allowed inside a deal without appearing as separately purchasable products in the ordinary menu. Model this explicitly at variant level (standalone-sellable false) instead of relying on a fake price of zero or an inactive record. A deal may use an active component-only variant; standalone checkout must reject it.

The product remains a one-dimensional variant model for this V1 menu. Multiple simultaneous axes (e.g. size × crust) are not required by the pictured menu and are not being added as a generic matrix engine now.

### 3.2 Modifier price rules must reference an exact variant UUID

Live \`modifier_price_rules\` currently stores \`product_id + size_key\` and has a composite FK to \`product_variants(restaurant_id, product_id, size_key)\`. It does not store \`product_variant_id\`.

Replace this as the authoritative relationship with \`product_variant_id\` and a same-tenant/product composite FK to \`product_variants(id, restaurant_id, product_id)\`; make the uniqueness key \`(modifier_id, product_variant_id)\`. Remove the old size-key relationship after adapting the API DTO. This avoids accidental matching when labels/keys are reused across different variant dimensions. Existing table is empty, so no business data conversion is needed.

### 3.3 Deals and combos are entirely missing from Production

There is no live \`deals\` or \`deal_components\` table. The current Admin and public catalog sources still expect these legacy relations, but the applied catalog foundation intentionally did not create them.

Do not recreate the old generic component-row / metadata shape as the new canonical model. Add normalized, tenant-safe relational entities:
- \`deal_collections\`: visible grouping headings such as Flame Hour and Kids Deals; shared schedule can be attached here.
- \`deals\`: each actual purchasable offer and its configured fixed menu price. This menu has six individual offer rows: two under Flame Hour, one Flame Duo, one Flame Feast and two under Kids Deals.
- \`deal_component_groups\`: required slots such as Burger, Drink, Broast, Nuggets, Fries and Juice; minimum/maximum total units; repeat-choice rule; sort order.
- \`deal_component_options\`: exact allowlisted \`product_variant_id\` entries per group; \`INCLUDED\`, \`SURCHARGE\` or \`STANDALONE\` treatment; explicit non-negative per-unit surcharge; optional per-option quantity ceiling.
- \`branch_deal_availability\`: sparse branch enable/disable overlay, like the existing product/variant overrides.

A deal has one configured base price in this menu-first V1. Multiple offer variants can be represented as separate deal records in a collection; a separate generic deal-variant matrix is not necessary for the pictured menu. A deal cannot contain another deal.

For a group requiring two burgers, the rule is two selected units, not two option rows. The group must explicitly say whether the customer may repeat one burger twice. The same applies to the two drinks in Flame Duo.

Included components add zero to the configured deal price. Surcharges are explicit per component unit. Standalone treatment adds the server-stored variant price only for a genuinely additional component. Missing pricing rules never mean free.

### 3.4 Deal-only components must be authorable without leaking into the ordinary menu

The image does not list Fries, Juice, six-piece Nuggets or a 1L drink as standalone menu entries, yet the Kids Deals and Flame Feast refer to them.

Support active component-only variants that can be selected inside a deal but are not shown or sold as standalone menu items. They must still be validated for branch availability and inclusion in order snapshots. This is a visibility/sellability distinction, not permission to invent component products or choices.

### 3.5 Schedules are missing; branch timezone override is not present

Only \`restaurants.timezone\` exists; \`branches\` has no timezone override. Add reusable schedule sets with:
- Multiple weekly local-time windows.
- Explicit overnight handling.
- Effective date boundaries / one-off timestamp windows.
- Start-inclusive, end-exclusive semantics.
- Database-time evaluation using one captured timestamp per quote/checkout.
- Optional branch timezone override, falling back to restaurant timezone.

Attach the schedule to the Flame Hour collection so both Flame Hour deals share the same 3 PM–5 PM window. The days of week are not printed; leave the schedule incomplete and block publication until Admin configures the weekdays. Never assume every day.

### 3.6 Draft revision, audit and publication controls are missing

Add:
- One restaurant-scoped draft state with monotonic revision.
- Append-only actor audit for every catalog command.
- Immutable compiled publication snapshots containing the complete menu/deal/schedule data and checksum.
- A restaurant-scoped current-publication pointer switched atomically during publish/rollback.

Draft commands use expected revision and transaction locking. Public catalog reads must use only the current immutable snapshot, not mutable authoring tables. Branch sellability and schedule eligibility are included in the resolved public response with revision/time identity.

## 4. Critical source defects / compatibility blockers

### Public catalog Edge Function

The current source \`supabase/functions/flame-chick-catalog/index.ts\`:
- Reads \`deals\` and \`deal_components\` even though neither table exists in the applied Production schema.
- Also reads \`delivery_areas\` and \`restaurant_settings\`, which are separate domains and are not part of this catalog foundation.
- Reads mutable authoring tables directly rather than an immutable publication pointer.
- Does not select/emit the explicit \`category_kind\` field.
- Converts \`product_variants.price\` with \`Number(r.price) || 0\`; a NULL/TBD draft price therefore becomes zero in the response. This must be corrected to preserve NULL.
- Reads modifier price rules by \`size_key\`; update to exact variant ID with a compatibility adapter only if a consumer still requires the old DTO.

This function must not be deployed as the production public catalog in its current form.

### Admin source

The current \`apps/flame-chick-admin/app.js\`:
- Loads catalog, deals, delivery areas and settings using direct PostgREST requests.
- Has direct CRUD for categories/subcategories, products/variants, deals/components, images, delivery areas and restaurant settings.
- Classifies deal categories using legacy IDs/name matching (e.g. \`CAT-DEALS\`, \`CAT-SD\`, \`CAT-1\`) rather than the live explicit \`category_kind\`.
- Uses the old deal component schema and sequential multi-row writes that can partially persist.

Keep the catalog modules disabled until they use authenticated, atomic Admin/Owner commands. Do not loosen table grants/RLS to accommodate the legacy browser code. The Admin UI should use business terminology (Add Product, Configure Portions/Flavours, Build Combo, Schedule Deal, Publish Menu), not expose raw database function names.

## 5. Menu-specific deal mapping

| Collection | Offer | Required component groups | Menu price |
|---|---|---|---:|
| Flame Hour | The Injector + Drink | The Injector ×1; eligible Drink ×1 | 699 |
| Flame Hour | Quarter Broast + Burger + Drink | Quarter Broast ×1; eligible Burger ×1; eligible Drink ×1 | 1,599 |
| Flame Duo | 2 Burgers + Quarter Broast + 2 Drinks | eligible Burgers ×2; Quarter Broast ×1; eligible Drinks ×2 | 2,099 |
| Flame Feast | Half Broast + 3 Burgers + 1L Drink | Half Broast ×1; eligible Burgers ×3; 1L Drink ×1 | 3,599 |
| Kids Deals | Mini Flame | Nuggets 6 pcs ×1; Fries ×1; Juice ×1 | 399 |
| Kids Deals | Little Crunch | Nuggets 6 pcs ×1; OG Crunch ×1; Fries ×1; eligible Drink ×1 | 999 |

All deal choices remain unconfigured until their exact eligible variants are confirmed. The deals may be drafted but cannot publish while required choices are missing.

## 6. Unresolved menu facts — do not seed or invent

1. Flame Hour weekdays; only 3 PM–5 PM is stated.
2. Eligible drink variants in each deal.
3. Eligible burger variants in Flame Hour 2, Flame Duo and Flame Feast.
4. Which 1L drink is intended for Flame Feast; it is absent from the ordinary drink list.
5. Which nuggets (Classic, Injected or another recipe) are used in the six-piece Kids Deal portion; the ordinary menu only lists 12-piece entries.
6. Fries and Juice are not listed as ordinary products; their recipes/variants and whether they are deal-only need owner/menu confirmation.
7. Whether Whole Chicken Broast flavours are distinct product variants under one product or separate menu products. The schema can support either; do not seed until the chosen presentation is confirmed.
8. Platter contents are not described. Treat it as one product with one TBD/known price, not an inferred bundle.
9. The regular Water/Cold Drink volume is unspecified; preserve a Regular label and NULL volume_ml.

TBD prices for Whole Chicken Broast, Flame Beef, Flame Fish and Shakes remain NULL. No TBD price may be coerced to zero or published for sale.

## 7. V1 Admin capability map

- Menu sections: create/reorder/rename/archive menu and deal categories, based on \`category_kind\`.
- Product editor: bilingual name/description, image, category, menu visibility, active/available.
- Variant editor: variant kind, customer label, pack quantity/unit, volume details, price (NULL allowed only in draft), standalone-sellable, active/available.
- Deal collection editor: heading, sort order and optional schedule.
- Deal builder: fixed price, component groups, exact eligible variants, required unit quantities, repeat-choice behavior, explicit pricing treatment/surcharge.
- Schedule editor: weekdays, multiple time windows, overnight/effective dates and timezone inheritance.
- Branch controls: product/variant/deal availability only; base prices remain shared.
- Preview/publish: show menu and deal choices; validation errors block publication.
- Version/audit view: actor, action, timestamp, revision and publication history.

Do not expose coupon, stacked discount, loyalty, inventory, allergens or generic free-modifier quota controls for this menu-first V1. Those are separate future requirements and do not appear on the supplied menu.

## 8. Required automated tests before migration review

- Every menu category and product type can be authored using the intended Admin action contracts.
- Variant kinds allow Quarter/Half/Full, flavour labels, pack counts and drink volume without semantic misclassification.
- NULL price remains NULL from draft DB through DTO/quote; explicit zero remains distinct.
- Six-piece deal-only Nuggets can be used inside a deal but cannot be ordered as a standalone item.
- Deal-only Fries/Juice/1L drink choices do not appear in standalone menu projection.
- Required deal group counts are enforced in units; repeat option behavior is deterministic.
- Included components are not double-charged; per-unit surcharge multiplies by selected units; Standalone uses published variant price.
- A missing deal option, missing price or missing eligible schedule prevents publication.
- Flame Hour is not publishable until weekdays are configured; runtime respects local branch timezone and end-exclusive 5 PM boundary.
- Branch disables required variant/deal choices and the quote becomes invalid rather than silently substituting.
- Old modifier \`size_key\` is eliminated from the authoritative price-rule FK; exact product_variant_id integrity is enforced.
- Stale draft revisions and concurrent commands cannot overwrite one another.
- Manager/Cashier/Rider cannot author or publish.
- Public catalog only reads immutable publication snapshots; old snapshots and order snapshots remain unchanged after rollback.

## 9. Next implementation sequence

1. Update the menu-driven architecture spec and project handoff with these verified findings.
2. Prepare a single reviewed migration candidate covering variant metadata, exact variant-scoped modifier prices, deal collections/deals/component groups/options, schedules, branch deal availability, draft revision/audit and publication snapshots/pointer.
3. Add database command contracts and source DTO v3 compatibility adapters. Correct NULL-price handling and explicit category kind.
4. Replace Admin direct writes with authenticated atomic commands and progressive menu-driven screens.
5. Test with a local/CI PostgreSQL service and deterministic menu fixtures; do not use a paid Supabase branch.
6. Run static source/contract checks and verify no current client depends on old direct table access.
7. Review the exact migration, SQL ownership, RLS/ACL, rollback plan and CI results.
8. Only then request separate Production approval. No Production DDL, data, function deployment or Admin enablement is authorized by this reconciliation.

The uploaded menu is the governing V1 domain source. This report records schema/source inspection facts and the proposed technical adaptation; it does not claim that unresolved menu choices have been decided.
