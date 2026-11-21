# Flame Chick — Menu-Driven Catalog Architecture V1

Date: 2026-11-21
Branch: \`work/production-source-audit\`
Status: owner direction accepted; design only; no migration candidate or Production change authorized by this document

## 1. Governing direction

The uploaded Flame Chick menu is the concrete V1 requirements source for catalog and Admin-panel design. Do not design a generic restaurant feature set first and force this menu into it. The database must represent the products, portions, flavours, deal components, fixed deal prices and scheduled offers shown here. The Admin panel must expose only the relevant authoring controls for the selected entry type.

Existing generic catalog/deal notes remain useful only where consistent with this menu-specific contract. Where there is a conflict, this menu-specific V1 contract takes precedence for initial implementation.

The goal is data-driven menu creation and administration without SQL or schema changes for ordinary new products, variants, deal definitions, eligible choices, prices, schedules and branch availability.

## 2. Source menu inventory

All listed currency values are PKR. TBD is an unknown price, not a zero-price item.

### Starters
- Classic Nuggets (12 pcs) — 699
- Injected Nuggets (12 pcs) — 749
- Fire Wings (6 pcs) — 599
- Injected Wings (6 pcs) — 699
- Platter — 1,499

### Injected Broast
- Quarter — 899
- Half — 1,599
- Full — 2,399

### Whole Chicken Broast
- Cheetos Butter — TBD
- Nashville — TBD
- Simple Injected — TBD

### Chicken Burgers
- The Injector — 649
- OG Crunch — 599
- Nashville Fire — 749

### Flame Beef
- The Smash — TBD
- The Marrow — TBD

### Flame Fish
- Injected Finger Fish — TBD
- Fish Burger — TBD

### Wraps
- Tender Fillet Wrap — 599
- Flame Chick Special — 649

### Beverages
- Water — 99
- Water 1.5 Ltr — 150
- Cold Drink — 120
- Cold Drink 1.5 Ltr — 250

### Shakes
- Oreo Shake — TBD
- Lotus Shake — TBD

### Deals & Combos
- Flame Hour, 3 PM–5 PM:
  1. 1 Injector + Drink — 699
  2. Quarter Broast + Burger + Drink — 1,599
- Flame Duo:
  3. 2 Burgers + Quarter Broast + 2 Drinks — 2,099
- Flame Feast:
  4. Half Broast + 3 Burgers + 1L Drink — 3,599
- Kids Deals:
  5. Mini Flame — 6 Nuggets + Fries + Juice — 399
  6. Little Crunch — 6 Nuggets + OG Crunch + Fries + Drink — 999

## 3. Menu data model

Use existing normalized catalog concepts for categories, products, variants, modifier groups/options and branch availability. Add the missing deal, deal-choice, schedule and publication structures only after this menu-specific contract and its validation cases are reviewed.

### Categories and menu entries
- The nine ordinary menu sections are menu categories.
- Deals & Combos is a separate deal category/section, not an ordinary product category.
- Use explicit category kind/type; never infer deal-vs-menu behavior from a category name or legacy ID.
- Preserve user-facing names, order and optional descriptions/images.
- A category or product may be archived, not hard-deleted, once referenced by deals or order history.

### Products and variants
- Ordinary purchasable entries are products with one or more sellable variants.
- Quarter/Half/Full Injected Broast should be represented as selectable priced variants of the Injected Broast product unless later menu rules require separate products.
- Fixed pack descriptions such as 12 pcs and 6 pcs are part of the sellable offer and must be represented explicitly, not buried only in description text.
- Water/Cold Drink size entries must be represented as distinct variants or products with explicit labels. Do not infer the unnamed regular drink volume. Record measured volume only when confirmed.
- Whole Chicken Broast flavour entries must be representable as a controlled choice/variant set. Do not force them into a generic add-on modifier. The exact product-vs-flavour-variant presentation remains an owner/menu clarification before seed data is finalized.
- Use exact product_variant_id references for deal components and variant-specific modifier prices. A label such as "Large" or "Quarter" is not a safe pricing key.
- TBD prices remain NULL with an explicit incomplete/unpriced state. NULL must never be coerced to zero. A deliberately free item has an explicit zero price and a distinct state.

### Modifiers and customizations
The pictured menu does not list customer-selectable toppings, sauces, crusts or spice choices. Do not make those prominent mandatory workflows in the V1 Admin UI or invent menu options for them.

Keep the data model extensible for controlled modifier groups if the finalized menu later introduces them. Where needed, support selection mode, minimum/maximum selection, per-option quantity bounds, exact variant-scoped pricing and server-side validation. Do not implement generic free-allowance or complex nested customization engines just because they are possible.

## 4. Deal and combo model

Deals are first-class catalog records with:
- A configured deal/base price.
- One or more component groups.
- Required or optional groups.
- Minimum and maximum selections.
- Quantity bounds per selected component.
- Explicit allowlisted product-variant choices or a curated category/subcategory choice pool.
- Optional branch availability.
- Optional schedule set.
- Draft/active/archive state and publication version.

### V1 component pricing treatments

Use three explicit treatments for V1:

1. INCLUDED — the selected choice is included in the advertised deal price.
2. SURCHARGE — the choice adds an explicitly configured amount per selected component unit. Do not calculate a dynamic price difference at checkout.
3. STANDALONE — a genuinely additional component outside the included deal slots is charged at its current standalone published variant price.

An included slot must not also receive the full standalone price. Replacing an included option uses an explicit SURCHARGE when an upgrade charge applies. Never permit implicit negative credits. Component surcharges multiply by selected component quantity; a configured per-deal charge belongs in the deal base price, not a per-unit component surcharge.

The advertised deal price includes the components printed in the menu. Do not add their normal standalone prices again.

Nested deals (a deal containing another deal) are excluded from V1.

### Menu-specific deal composition requirements

| Deal | Required composition to support | Source price |
|---|---|---:|
| Flame Hour 1 | 1 The Injector + 1 eligible drink | 699 |
| Flame Hour 2 | 1 Quarter Broast + 1 eligible burger + 1 eligible drink | 1,599 |
| Flame Duo | 2 eligible burgers + 1 Quarter Broast + 2 eligible drinks | 2,099 |
| Flame Feast | 1 Half Broast + 3 eligible burgers + 1 1L drink variant | 3,599 |
| Mini Flame | 6 nuggets + fries + juice | 399 |
| Little Crunch | 6 nuggets + 1 OG Crunch + fries + drink | 999 |

The number of component units must be validated. For example, Flame Duo requires exactly two burger units and two drink units, not merely two selected option records.

A multi-unit component group must specify whether the same option can be chosen repeatedly or whether distinct choices are required. Until defined, the safe Admin default is explicit repeated-quantity allowance per option, not an assumed uniqueness rule.

### Incomplete source details that block deal publication

Do not invent any of these:
- Which weekdays Flame Hour runs. The image supplies 3 PM–5 PM but no days.
- Which drink variants are included in each deal.
- Which burger choices are eligible for Flame Hour 2, Flame Duo and Flame Feast.
- The 1L drink variant used by Flame Feast; the ordinary beverage list only shows regular and 1.5 Ltr entries.
- The exact 6-nugget product/portion used by both Kids Deals; ordinary starters list 12-piece nuggets only.
- Fries and juice products/variants, which are not present in the ordinary menu list.
- Whether Whole Chicken Broast flavours are sellable variants or a required flavour selection.

Deals may be saved as drafts with incomplete groups, but publishing an active deal must fail if a required group, component choice, price, quantity rule, branch availability rule or schedule configuration is incomplete.

## 5. Pricing contract for this menu

All prices are PKR stored in PostgreSQL NUMERIC, not floating point. Final currency values use two decimal places. GST remains deferred.

### Ordinary item line
For one homogeneous configuration:

\`unit_price = selected_variant_price + sum(modifier_quantity * resolved_modifier_unit_price)\`

\`line_total = quantity * unit_price\`

Different customizations belong to separate homogeneous order lines. The browser never supplies an authoritative unit price or total.

### Combo line
\`combo_unit_price = configured_deal_price + sum(component_quantity * configured_component_surcharge) + sum(genuinely_additional_standalone_components)\`

\`combo_line_total = combo_quantity * combo_unit_price\`

Included components contribute zero additional charge. Component-level modifiers, if configured, are evaluated against the exact selected component variant and are charged only when their published rule says so.

### Time eligibility
A schedule controls whether the deal is available; it does not rewrite the price. Runtime evaluation uses one server-captured database timestamp and the restaurant's configured IANA timezone. Windows are start-inclusive/end-exclusive. Overnight windows must evaluate the prior weekday's schedule after midnight. No cron-driven active-flag flipping.

Flame Hour's 15:00–17:00 window is captured, but active weekdays remain unset until confirmed. It must not be silently interpreted as every day.

### Promotions outside menu-defined deal prices
The pictured menu defines fixed-price deals and a scheduled Flame Hour section. It does not define coupons, percentage discounts, arbitrary fixed-amount discounts or promotion stacking. Do not expose or enable those as V1 business workflows solely for theoretical extensibility. Keep future promotions separate from deal pricing and require a new reviewed contract before implementation.

## 6. Admin panel experience

The Admin panel should be menu-driven and progressive:

1. Menu Sections: add/reorder/archive the nine ordinary categories and the separate Deals & Combos section.
2. Products: name, category, description, image, active/available state and sort order.
3. Variants/Portions: add labels, pack counts, portion sizes, exact prices and availability. Show only relevant variant controls for the product being edited.
4. Deal Builder: select deal name and price, create component groups, configure required quantities, allowlisted choices, repeated-option rules and explicit surcharge treatment.
5. Schedule: configure weekdays, time windows, effective dates, timezone inheritance and branch overrides. Incomplete schedules remain draft.
6. Branch Availability: disable a product variant or deal at a branch without changing shared base price.
7. Preview & Publish: preview customer-facing menu and combo composition; validate all referenced items, prices, choices, schedules and media before atomic publication.
8. Audit & Version History: show actor, change, time, draft revision and publication/rollback history.

Do not show raw database function names to Admin users. The UI exposes business actions; narrowly scoped authenticated server commands/RPCs implement those actions behind the scenes. Only Admin and Owner can author/publish. Manager, Cashier and Rider have no catalog authoring access.

## 7. Publication and order history

- Admin edits a draft revision.
- Server commands validate the whole aggregate and expected draft revision.
- Publication creates an immutable compiled snapshot with version/checksum and atomically switches the current-publication pointer.
- Public catalog reads use only the current immutable publication plus valid branch availability.
- Checkout revalidates current publication, selected component relationships, branch availability, schedule, and prices using the same server pricing implementation as quote generation.
- On changed quote, return a canonical breakdown/fingerprint and require customer confirmation; never silently reprice.
- Order snapshots preserve catalog version, pricing-engine version, product/variant labels, quantities, component choices, accepted prices, surcharges, discounts and timestamps.
- Rollback switches the pointer to a prior immutable snapshot; it does not rewrite publication history or historical orders.

## 8. Security requirements

- Keep existing catalog tables deny-by-default. No direct browser table grants/policies to make the old Admin CRUD work.
- Browser actions call authenticated, narrowly scoped server commands. Actor comes from verified auth.uid(); role and tenant scope are server-resolved.
- Admin/Owner only can author, publish or roll back catalog.
- Validate every referenced product, variant, deal, category, restaurant and branch server-side. IDs supplied by the browser are selectors, not authority.
- Multi-row product/variant and deal/component updates are atomic.
- Use optimistic draft revision checks and transaction-level locking for concurrent edits/publication.
- Append actor audit records in the same transaction; prevent update/delete/truncate of audit history.
- Privileged functions use a fixed empty search_path, fully qualified object names, explicit execution grants and internal authorization checks.
- No service/secret key in browser code.
- Keep GST deferred and do not infer tax inclusion in the displayed prices.

## 9. Acceptance tests required before a migration is ready

1. All source menu sections and entries can be authored in Admin without SQL.
2. Quarter/Half/Full Broast have separate variant prices and appear correctly in preview.
3. A NULL/TBD price cannot be ordered; an explicit zero-price item remains distinguishable.
4. Water/Cold Drink variants retain exact labels; no unconfirmed volume is invented.
5. A deal's included components do not add standalone prices again.
6. Component surcharge is multiplied by selected component quantity.
7. Combo requires exact configured component quantities and allowed variants.
8. A missing Kids Fries/Juice/6-Nugget entry blocks publication, not draft editing.
9. Flame Feast cannot publish without a real 1L variant and defined burger choices.
10. Flame Hour cannot publish as scheduled until its weekdays and timezone are configured.
11. Overnight schedules work across the weekday boundary; end time is exclusive.
12. Branch-disallowed component choices are rejected; a deal is unavailable if required groups cannot be fulfilled.
13. Concurrent edits using an old draft revision fail without overwriting the newer draft.
14. Unauthorized Manager/Cashier/Rider catalog writes fail.
15. Quote and checkout produce identical calculations from the same catalog version and timestamp.
16. Replayed order idempotency key cannot create a second order.
17. Historical order snapshot remains unchanged after later product/deal edits or catalog publication rollback.

## 10. Out of scope for this menu-first V1

Unless the finalized menu explicitly adds a requirement, do not implement:
- Generic coupon engine or stacked promotions.
- Free modifier quotas.
- Nested deals.
- BOGO / buy-X-get-Y rule DSL.
- Inventory depletion and stock forecasting.
- Allergens/dietary or calorie calculations.
- Loyalty/referral/customer segmentation.
- GST/tax.
- Service/payment fees not yet approved.
- Product-family-specific UI that is not required by the current menu.

## 11. Current implementation truth and next steps

This is a design contract only. It does not authorize a Production migration.

The previously verified Production catalog foundation consists of 11 empty catalog tables and 15 FK indexes. No catalog business data, deal tables, schedule tables, command RPCs, publication snapshots or Admin catalog authoring API have been added. Existing direct Admin REST mutations remain disabled and must be replaced with authenticated server commands.

Next:
1. Reconcile this menu-specific contract against exact applied table definitions and existing Admin DTO/source.
2. Resolve the listed menu details that affect deal composition and schedule activation.
3. Prepare a migration candidate on the working branch only.
4. Add schema constraints, pricing unit tests, schedule tests, role/security tests and menu-specific golden test fixtures.
5. Review the migration candidate and rollback plan.
6. Request separate owner approval before any Production schema application.

No Production schema/data changes, Edge Function deployments, Vercel deployments, or menu seeding are authorized by this document.


## 12. Live schema reconciliation (2026-11-21)

The follow-up read-only Production inspection is recorded in \`docs/handoffs/2026-11-21-menu-schema-reconciliation.md\`. It confirms:
- Existing \`categories.category_kind\` already distinguishes \`menu\` and \`deal\`; do not add it again.
- Existing product variant price is nullable \`numeric(12,2)\`; keep NULL distinct from explicit zero.
- Existing drink option has nullable \`volume_ml\`; do not invent the regular beverage volume.
- Existing branch product/variant availability overlays and restaurant IANA timezone are present.
- No deals, deal component, schedule, branch-deal availability, catalog draft/audit or immutable publication structures exist in Production.

Menu-first schema changes now required before authoring:
1. Typed variant metadata for portion/flavour/pack/volume and explicit standalone-sellable vs deal-only variant eligibility. Preserve the current one-dimensional variant model; no generic multidimensional variant matrix for this menu.
2. Replace modifier price-rule \`product_id + size_key\` as authoritative scope with exact \`product_variant_id\` and a tenant/product composite FK.
3. Add normalized deal collections, deal records, required component groups, exact variant allowlist options and branch deal availability. The six printed offer rows are individual deals; Flame Hour and Kids Deals are collections/headings.
4. Add reusable schedule sets/windows, including weekdays, multiple windows, overnight/effective-date behavior and optional branch timezone override. Attach Flame Hour schedule to its collection; weekdays remain unconfigured until confirmed.
5. Add draft revision, append-only audit, immutable compiled publication snapshots and an atomic current-publication pointer.

Critical compatibility defects confirmed in current source:
- Public catalog Edge Function reads missing \`deals\` and \`deal_components\` tables and mutable authoring rows; it is not safe to deploy as production catalog.
- It converts nullable variant prices using \`Number(price) || 0\`; this must preserve NULL to avoid treating TBD as free.
- It does not select/emit explicit \`category_kind\`.
- It reads modifier prices by \`size_key\`; adapt to exact variant ID.
- Existing Admin UI performs direct REST CRUD, uses legacy category IDs to identify deals, and writes old deal component rows sequentially. Replace with authenticated atomic commands; do not grant direct table access.

The unresolved menu details and required golden tests are enumerated in the reconciliation handoff. No Production changes were performed by the inspection.
