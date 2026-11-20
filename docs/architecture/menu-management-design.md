# Menu Management and Catalog Schema Design

**Status:** Requirements and target design; not a production migration  
**Prepared:** 2026-11-20  
**Scope:** Admin-managed menu authoring and publication for Flame Chick Production

## 1. Purpose and non-goal

The supplied menu image is a **capability/reference sample only**. The user explicitly said this menu will not be published. Do not seed its item names, prices, categories, or deals into Production and do not treat it as the final launch catalog.

The goal is to build the database and Admin panel so authorized staff can create, change, organize, price, schedule, preview, publish, unpublish, and archive future menu content through the Admin UI. Routine menu changes must not require SQL or a database-console edit.

This document is a preliminary target capability model and gap assessment, not approval to apply DDL. Reconcile it with all app/API contracts and refine it before migrations are finalized.

## 2. What the reference menu demonstrates

The picture demonstrates structures the system should be able to represent:

- Independently named and ordered categories/sections: Starters, Injected Broast, Whole Chicken Broast, Chicken Burgers, Flame Beef, Flame Fish, Wraps, Beverages, Shakes, and Deals & Combos.
- Products sold as one priced item.
- Portion/size pricing (Quarter, Half, Full Broast).
- Flavour/style choices (Cheetos Butter, Nashville, Simple Injected).
- Similar beverage products with different package sizes/volumes.
- Products/options whose prices are not decided yet (shown as TBD).
- Bundles containing multiple products, quantities, and potentially selectable choices (burger, drink, etc.).
- A time-window promotion (Flame Hour, shown as 3 PM–5 PM).
- Different deal families (time-window offer, duo, feast, kids deals).

These are examples of capabilities only. The image does not define final rules such as whether flavors are variants or modifiers, which days a promotion runs, the exact contents of Platter, or whether combo items are fixed or customer-selectable. Do not invent those rules.

## 3. Current Admin and API capability assessment

The current Admin source has useful foundations:

- Category CRUD, Urdu labels, sort order, visibility and image handling.
- Subcategory CRUD and product assignment.
- Product create/edit with single-price or multiple size/option variants.
- Product availability, active/hidden state, featured flag and image handling.
- Deal creation with fixed product, fixed variant, customer choice from a subcategory and included-drink component types.
- Deal title, group/category, bundle price, order, active/available/featured flags and image handling.
- Delivery-area management, website settings and staff management.

However, this is **not yet a complete menu authoring/publishing workflow**:

1. Product and variant forms require a numeric price. An unpriced/TBD draft cannot be saved cleanly.
2. Deal bundle price is required, so an unpriced deal draft is not supported.
3. Deal schedules/time windows are not represented in the current Admin deal form or catalog response.
4. Although database and catalog code contain modifier-group, modifier, modifier-price-rule and product-assignment concepts, the current Admin loader/editor does not provide full modifier-group management.
5. Existing deal edits update deal-level fields only; existing components are left unchanged. The UI currently suggests creating a new deal to build a different bundle.
6. Some component choices are limited to an active subcategory plus a size key or an included drink volume. A more complete choice-group editor is needed for configurable combos.
7. Existing Admin writes are a sequence of direct REST calls from the browser. Multi-row edits can leave partial state if a later request fails. Important compound operations need transactional server-side commands.
8. The current public catalog function reads source tables and builds a response at request time. It does not read a committed publication version. It is not yet a strict draft-versus-published, atomic publication workflow.
9. The catalog function currently converts numeric prices using fallback expressions. Production must preserve NULL/unpriced distinctly from a real zero price and must never silently publish an unpriced purchasable option.
10. Some Admin deal grouping depends on special category legacy IDs. The future editor should use an explicit category/deal-group type or configuration, not magic legacy keys as the only rule.

Keep these observations tied to the current branch code; re-check if Admin or function source changes.

## 4. Target functional model

### 4.1 Menu sections and categories

Authorized Admin users should be able to add, rename, translate, reorder, hide, show, and archive categories; manage optional subcategories; choose menu section/display order; and preview website/POS navigation before publishing.

A new category must be database data, not a hardcoded code branch. Avoid requiring code changes for a new category such as Flame Fish or a future Desserts section.

Decide whether a distinct menu_sections entity is genuinely needed. If categories alone meet the confirmed layout, do not add a redundant hierarchy. If one category must appear under multiple navigation groups, model that relationship explicitly rather than duplicating products.

### 4.2 Products and variants

Admin must support simple products with one price and products with one or more size, portion, volume or flavor choices. Fields should include stable IDs, internal code where needed, English/Urdu names and descriptions, images, category/subcategory, sort order, featured flag, active/available state and archive state. Variants need stable IDs and unique keys within their parent; changing a display label must not break old order records.

Do not hardcode labels such as Quarter, Half, Full, Small or Large into database enums. They are data entered by Admin.

### 4.3 Pricing and TBD/unpriced state

Price must distinguish:

- **Unpriced/not decided:** NULL or explicit unpublished pricing state; never convert to zero.
- **Priced:** a valid non-negative amount in restaurant currency.
- **Genuinely free:** explicit numeric zero, intentionally saved and clearly shown in Admin as a real zero price.

Do not add silent DEFAULT 0 to product, variant, bundle, delivery, or modifier prices where zero would hide missing setup. Apply non-negative constraints and explicit publish-time validation.

Admin should allow a draft with TBD price, but publication must block any purchasable item/variant/deal whose price cannot be calculated safely. The UI must identify exactly what blocks publication. Bundle totals and component adjustments must be explicit; do not infer totals from incomplete component prices. Current app config uses PKR; calculate final totals on the server/database, never in the browser as the trusted source.

### 4.4 Modifier and option groups

Admin should manage reusable option groups and options, with translated labels, single/multi-select mode, required/optional and min/max selection counts, sort order, active state, product/variant assignments, and pricing modes (included/free, fixed extra, or price by selected variant/size where genuinely needed). Validate that every selection belongs to a group assigned to the selected product. Decide whether duplicate selection and per-option quantity are allowed.

Existing modifier tables are a starting point, not proven complete. Review variant-specific rules and product-to-group assignment semantics before final DDL.

### 4.5 Deals, bundles and combo builder

Admin should create and edit deals with title/translations, description, image, group/category, bundle price, visibility/availability and ordered components. Each component may be a fixed product, fixed variant, customer-choice pool, or configured option group. It needs quantity, required/optional state, min/max choice count, display label, allowed alternatives, and explicitly defined surcharge/substitution rules.

The builder must support patterns like multiple burgers plus a broast and drinks, or nuggets plus fries and juice, without custom database tables or code paths for each deal name.

Support full component editing, reordering and safe replacement. Validate restaurant ownership, active/available state, variant membership and pricing. Avoid arbitrary table-name/record-ID polymorphic references that cannot enforce foreign keys; use typed relations or dedicated choice-pool tables with real constraints.

### 4.6 Deal and item scheduling

Support one-off effective date/time ranges and recurring day-of-week/local start/end time rules. Store/resolve the restaurant or branch timezone deliberately (current app config uses Asia/Karachi); do not depend on the browser's timezone. Define rules for overlapping schedules, overnight windows and branch overrides. Admin preview should show whether an offer is currently eligible and when it starts/ends.

Schedule data should be queryable and constrained, not buried only in free-form JSON or hardcoded display labels. Decide whether schedules are restaurant-wide or branch-specific before DDL.

### 4.7 Media

Admin should manage product/category/deal images with validated MIME type, size and extension, generated storage paths, safe filenames, alt text, active/previous versions and cleanup safeguards. Public website access should be limited to intentionally published catalog media. Draft/private media and staff/customer files must not become public. Enforce upload/delete/restore authorization in Storage policies and server-side checks, not only hidden UI buttons. Avoid public bucket listing unless justified.

### 4.8 Draft, preview, publish and rollback

Target workflow:

1. Admin edits a private draft.
2. Server-side validation checks the complete menu graph: categories, products, variants, prices, modifiers, deal components, schedules and media.
3. Admin previews exactly what website and POS will receive.
4. An authorized publisher explicitly publishes.
5. A transaction or safe version-switch mechanism makes the new catalog visible atomically; no half-updated menu.
6. The previous published version remains available for rapid rollback.
7. Audit history records who prepared, approved, published, rolled back and when.

Draft edits must not change the current public menu. The public catalog API should read only the current published version, not partially edited source tables. Evaluate Demo menu_publications/menu_publication_chunks as reference only; verify checksum, size, atomicity and operational semantics before reusing.

### 4.9 Preserve historical order truth

At checkout, store immutable snapshots of product, variant, selected modifiers, deal/component choices, names/labels, unit prices, quantities, discounts, taxes if used, bundle price, surcharges, line totals, delivery area and fee. Future menu changes must never rewrite old orders. Referenced catalog records should be archived, not hard-deleted.

## 5. Security and reliability guardrails

- Scope every business row to the restaurant and, where applicable, branch. Use foreign keys and composite constraints to prevent cross-tenant references.
- Enable RLS on every exposed table. Keep internal tables/functions in a non-exposed schema with restrictive grants. Authenticated alone is not business authorization.
- Never trust browser-supplied IDs, prices, totals, role claims, branch IDs, availability, discounts, component choices or status transitions.
- Authorize using controlled role records; never use user-editable user_metadata for access decisions.
- Use least-privilege server operations. Avoid SECURITY DEFINER unless necessary; if needed, secure owner, fixed search_path, execution grants and explicit authorization. Revoke default PUBLIC execute where appropriate.
- Make compound catalog changes transactional and idempotent. Failed product/variant or deal/component writes must not leave partially configured live items.
- Public catalog responses must exclude staff profiles, customer addresses/phones, internal settings, private object paths, secrets and unpublished drafts.
- Redact tokens, keys, phone/address data and sensitive payloads from logs and errors.
- Rate-limit public order endpoints; enforce idempotency and transactional pricing/availability checks.
- Protect Storage paths and operations with strict policies; public read only for intentionally published media.
- Audit menu edits, price/availability changes, staff role changes and publication/rollback events. Ordinary app clients must not rewrite audit history.
- Add indexes for actual branch-scoped queries, joins and schedule checks; validate with query plans/advisors instead of indexing everything.
- Establish encrypted database and Storage backups, integrity verification, retention, restore drills and an incident/recovery runbook. Test restores; a successful backup upload is not proof of recoverability.
- Keep Realtime limited to agreed POS/Rider operational state. Catalog changes can use a published-version refresh/invalidation mechanism.

## 6. Recommended Admin information architecture

Extend the existing Admin navigation rather than building a separate product:

- **Menu overview:** draft/published version, last publish, validation warnings, preview and rollback.
- **Categories:** create/edit/reorder/archive, translate and configure display grouping.
- **Products:** create/edit/archive, translations, category, images, variants/prices and availability.
- **Options & modifiers:** reusable groups/options, selection and pricing rules, product assignments.
- **Deals & combos:** builder for fixed/selectable components, editing, schedules, availability, bundle price and preview.
- **Media library:** published/draft state, upload validation, usage references and safe replace/restore.
- **Audit/history:** who changed price/item/availability or published/rolled back a catalog version.

Role permissions (who may edit prices, publish, archive or roll back) must be specified and enforced server-side. Do not rely only on hidden buttons.

## 7. Decisions still required before final DDL

Do not invent these business rules:

- Whether flavors are product variants, modifier options, or separate products for each menu family.
- Whether combo choices are limited to category/subcategory or curated explicit lists.
- Whether customers may customize, substitute or add extra items within bundles, and how surcharges work.
- Whether scheduled deals recur daily, on selected weekdays, or only on dated campaigns.
- Whether schedules apply restaurant-wide or per branch.
- Whether stock/quantity limits, allergens, dietary labels, tax or discount handling are needed.
- Whether items/deals are dine-in-only, delivery-only, takeaway-only or available across channels.
- Who may draft, approve, publish, change prices and roll back.
- Whether website and POS always share one published catalog or need branch/channel variations.

The supplied picture does not answer these questions.

## 8. Definition of done: routine menu changes without database work

Once the initial schema and Admin workflow are installed, an authorized user must be able to do all of the following in Admin:

- Add a category and reorder it.
- Add a product with translations and images.
- Add, rename, reorder, price, mark unpriced in draft, make unavailable and archive variants.
- Create option groups and attach them to products.
- Create a bundle with fixed and customer-selectable components.
- Set recurring time/day/date schedules for deals.
- Save drafts, preview validation errors, publish atomically and roll back to the prior catalog.
- Review an audit trail of changes.

These must not require direct SQL, database-dashboard edits or code deployment. A genuinely new business capability not included in the agreed model may still need a future reviewed schema/code migration. The goal is no database work for routine menu administration, not a claim that software can evolve forever without schema changes.

## 9. Safety status

- This document is a design specification only.
- No menu entries or prices from the supplied image have been inserted.
- No Production schema, data, policies, Storage, Functions or settings were changed.
- The new catalog schema and publication workflow remain to be reviewed against the complete API/app contract before Production DDL.
