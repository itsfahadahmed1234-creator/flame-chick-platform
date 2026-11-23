# Flame Chick — newly published menu catalog preparation (2026-11-23)

**Status:** Source-of-truth menu transcription and implementation rules prepared. This is a specification only: no catalog rows, seed files, database writes, publications, deployments, or checkout activation.

## Authority and exclusions

- The restaurant's newly published menu (previously called the upcoming menu) is the only operational menu source.
- The formerly running menu is superseded. Do not import, merge, reference as fallback, or preserve old-only menu entries.
- The user supplied the new menu image and then confirmed the deal rules and product distinctions recorded below.
- Production catalog tables remain empty until a separate reviewed data-entry step is explicitly approved.
- The GST system is deferred. Do not add tax schema, GST calculation, tax inclusion/exclusion logic, checkout tax logic, or tax-dependent price adjustments now. A previously requested static menu notice is content-only and must not be interpreted as enabling tax behaviour.

## Menu categories and standalone products

Prices are PKR. Preserve the printed spelling/capitalization in customer-facing names unless the restaurant later corrects it.

### Starters

| Product | Standalone size / pack | Price |
|---|---|---:|
| Classic Nuggets | 12 pcs | 699 |
| Injected Nuggets | 12 pcs | 749 |
| Fire Wings | 6 pcs | 599 |
| Injected Wings | 6 pcs | 699 |
| Platter | Single menu entry | 1,499 |

Platter description is intentionally blank. The restaurant will provide it later. Do not invent a description or composition.

### Injected Broast

| Product | Printed composition | Price |
|---|---|---:|
| Quarter Broast | 2 pcs chicken, dips, bun and fries | 899 |
| Half Broast | 4 pcs chicken, dips, buns and fries | 1,599 |
| Full Broast | 8 pcs chicken, dips, buns and fries | 2,399 |

### Whole Chicken Broast

These are **three independent products**, not one product with flavour/variant choices:

| Product | Price |
|---|---:|
| Simple Injected | 2,499 |
| Nashville | 2,699 |
| Cheetos Butter | 2,799 |

Each gets its own product identity and its own single purchasable variant. Do not implement a shared flavour selector.

### Chicken Burgers

| Product | Printed description | Price |
|---|---|---:|
| OG Crunch | Crispy fried chicken, lettuce, jalapeño and secret sauce, served with fries. | 599 |
| The Injector | Juicy injected crispy chicken, jalapeño, fresh lettuce and signature sauce, served with fries. | 649 |
| Nashville Fire | Nashville-spiced crispy chicken, jalapeño, fresh lettuce and signature sauce, served with fries. | 699 |

### Flame Beef

**The Smash** is one product with a required product-popup patty selector:
- Single Patty — Rs. 799
- Double Patty — Rs. 999

Use two purchasable product variants with distinct stable IDs. The customer must choose one variant before adding the product to the cart. Do not create two unrelated product cards.

| Product | Printed description | Price |
|---|---|---:|
| The Marrow | Juicy beef patty filled with rich bone marrow butter, served with fries. | 1,199 |

### Wraps

| Product | Printed description | Price |
|---|---|---:|
| Tender Fillet Wrap | Crispy chicken tender fillet, jalapeño, fresh lettuce and signature sauce wrapped in a soft tortilla. | 599 |
| Flame Chick Special | Crispy injected nuggets, jalapeño, fresh lettuce and signature sauce wrapped in a soft tortilla. | 649 |

### Beverages

| Product | Printed size | Price |
|---|---|---:|
| Water | No size printed | 99 |
| Water | 1.5 Ltr | 150 |
| Cold Drink | No size printed | 120 |
| Cold Drink | 1.5 Ltr | 250 |

Do not infer a ml volume for the Rs. 120 Cold Drink. Deal references to the "120 one" mean the Cold Drink menu entry priced Rs. 120. The deal component must point to that exact menu product/variant.

## Deals — fixed compositions and approved display wording

All deal components are fixed for the customer. No burger substitutions or customer-selectable burger choices. A single deal variant / fixed bundle is appropriate except Flame Hour, which has two printed package versions under the same Flame Hour schedule.

### Flame Hour — every day, 3:00 PM to 5:00 PM

Timezone: Asia/Karachi. Start is inclusive; end is exclusive (15:00:00 <= local time < 17:00:00).

1. **The Injector + Cold Drink** (the Rs. 120 Cold Drink) — Rs. 699.
2. **Quarter Broast + Burger + Cold Drink** (the Rs. 120 Cold Drink) — Rs. 1,599.

The second package's customer-facing component label and deal description must say **"Burger"**, not "OG Crunch". Its fixed internal component must link to the separate deal-only **Burger** product, not OG Crunch. No substitutions or selection UI.

Outside 3–5 PM, both Flame Hour offers must remain visible and greyed out. Customers must still be able to open the deal detail popup and see the composition, but all ordering/continue/add actions must be unavailable. The trusted order API must independently reject attempts outside the schedule. Do not hide the deals or rely on the browser clock.

### Flame Duo — Rs. 2,099

Fixed composition:
- 2 x the deal-only **Burger** product; customer-facing component label: **"Burger"** with quantity 2.
- 1 x Quarter Broast.
- 2 x the Rs. 120 Cold Drink.

The deal description and popup must say **"2 Burgers"**, not "2 OG Crunch". No selectable burger choices.

### Flame Feast — Rs. 3,599

Fixed composition:
- 1 x Half Broast.
- 3 x the deal-only **Burger** product; customer-facing component label: **"Burger"** with quantity 3.
- 1 x restaurant-supplied 1L drink.

The customer-facing description/popup must say **"3 Burgers"**, not "3 OG Crunch". The 1L drink is a deal-only included component. Do not add a standalone product, standalone price, selectable drink list, or charge for it separately. Restaurant decides what is supplied.

### Mini Flame — Rs. 399

Fixed composition:
- 6 x Classic Nuggets (not Injected Nuggets).
- Fries, deal-only; no size/portion selector.
- Juice, deal-only; restaurant decides what is supplied.

Do not create standalone Fries/Juice menu cards or invent brands/flavours/prices. Represent them only as included deal components.

### Little Crunch — Rs. 999

Fixed composition:
- 6 x Classic Nuggets.
- OG Crunch (the menu explicitly names OG Crunch here; retain that name).
- Fries, deal-only; no size/portion selector.
- The Rs. 120 Cold Drink.

No selectable burger choices.

## Implementation requirements discovered from current V3 source

1. The V3 deal data model already identifies each component by exact productId and productVariantId. Keep those authoritative IDs bound to the fixed products.
2. The current published snapshot's dealComponentGroups.nameEn is a customer-facing label, while each component option links to an internal product. For the generic burger components, set the group label to **"Burger"** and link the component option to the separate deal-only **Burger** product and variant. Do not map generic Burger to OG Crunch. The website must render a fixed one-option group's group label instead of exposing the internal product name.
3. All fixed deal groups should be preselected/locked by the UI using the single-option + exact required quantity model. The customer must not be asked to select a burger, drink, fries, or restaurant-supplied juice/1L drink. Keep ID/quantity validation and server-side reconstruction.
4. Current V3 deal availability combines branch/fulfilment availability and schedule availability, and the configurator refuses every unavailable deal. Separate "can open details" from "can order": a schedule-closed Flame Hour offer can open in read-only detail mode while remaining unorderable. Keep the current available/orderable meaning fail-closed and never let a read-only popup yield an orderable quote.
5. Flame Hour schedule evaluation must use trusted database time and restaurant timezone Asia/Karachi; do not use client time for order acceptance.
6. The 6-piece Kids-deal nugget portions must be represented as deal-only component variants/options, not as six 12-piece packs and not as a standalone 6-piece product listing. A catalog draft should keep the 12-piece standalone pack at its printed price and a non-standalone 6-piece deal portion for the two kids bundles.
7. Fries, Juice and the 1L deal drink are included deal-only components. They must not appear as independently purchasable menu items, must not gain invented standalone prices, and must not become customer-selectable options.
8. Simple Injected, Nashville and Cheetos Butter are separate product records, not product flavours.
9. The Smash's Single/Double Patty are variants of one product and must be the required selector in its product popup.
10. Keep browser calculations non-authoritative. Deal prices are the printed fixed bundle prices; component links are for snapshot/order composition and must not generate a browser-calculated subtotal or modify the printed deal price.

## Deferred / restaurant-managed content

- Platter description/composition: blank until restaurant provides it.
- Mini Flame Juice identity/flavour: restaurant-managed; no invented choice or brand.
- Flame Feast 1L drink identity: restaurant-managed; no standalone entry or price.
- No size/portion selector for deal Fries.
- No GST calculation or system implementation.

## Pre-entry validation checklist

Before any controlled data entry is approved:
- Verify every standalone product name, price, category, description, and variant against the supplied new menu.
- Verify every deal has exactly the fixed items, quantities, printed price, inclusion treatment, public component wording, and branch availability.
- Verify both Flame Hour versions share the daily Asia/Karachi 15:00–17:00 schedule and remain visible but unorderable outside it, including from popup controls.
- Verify no old menu item, old price, Pizza Bite item, or synthetic fixture value entered the draft.
- Verify The Smash selector is required and maps exactly to Rs. 799 / Rs. 999.
- Verify Simple Injected, Nashville and Cheetos Butter exist as three separate products.
- Verify Kids deals use Classic Nuggets six-piece deal-only components.
- Verify Fries, Juice and Flame Feast 1L drink do not surface as standalone products or selectable choices.
- Verify GST/tax fields and calculations have not been introduced.
- Keep Production catalog empty and unpublished until separate review and explicit approval.

## Change control

This specification does not authorize database writes, migrations, catalog import, publishing, Edge Function deployment, website deployment, branch enablement, or checkout activation. Those remain separate review and approval gates.


## Source implementation checkpoint — 2026-11-23

The first implementation gaps identified above have now been addressed on the working branch:

- Deal view model exposes `branchAvailable` separately from full `available` (orderable) state. Schedule closure and missing fulfilment can leave details browseable without making the deal orderable.
- Deal cards remain rendered and are visually greyed when not orderable. Their details button remains available only when the deal is valid for the selected branch. Schedule-closed deals open a read-only details view.
- Read-only deal configurators show detail but cannot change fixed components or emit a selection payload. The completion button is disabled in read-only state.
- Fixed single-option component groups with an exact required quantity are automatically preselected when the deal variant is selected and their quantity controls are disabled. Programmatic quantity mutation also rejects fixed groups.
- A single-option component group uses its configured customer-facing group label for the option row. This supports the exact public label "Burger" while the component option remains bound to the internal OG Crunch product and product-variant IDs.
- Regression coverage added for branch-vs-schedule availability, fixed component preselection/locking, read-only schedule-closed details, generic one-option labels and grey unavailable cards.

**Latest CI:** [Flame Chick Website Static Checks run 45124549443](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45124549443), exact head `9b3698f0e03f00f5999bf1090d662c70db53b42b`, completed successfully. JavaScript syntax, core catalog regression tests, preview regression tests and inline script parsing passed.

This is still preview/source behaviour only. The main customer storefront has not been switched to V3. No menu data has been seeded, no production migration applied, no catalog published, no Edge Function or Vercel deployment performed, and website ordering remains disabled. The next safe source step is review of product popup variants (especially required Smash Single/Double), then an isolated preview UI/manual smoke test before preparing a menu import plan.


## Additional schema gate found during safe pre-entry review

The live database allows `product_variants.price` to be NULL at the table-constraint level, but two higher-level publication contracts currently reject that:
- V3 snapshot validator declares every product variant `price: money` (non-null).
- Publication validation emits `ACTIVE_VARIANT_PRICE_MISSING` for every active variant with a NULL price, even if it is non-standalone and used only as an included deal component.

This matters for the newly approved menu because Fries, Juice, the Flame Feast 1L restaurant-supplied drink, and the 6-piece Classic Nuggets deal portion have no standalone menu price and must be deal-only. Do **not** invent Rs. 0 or any other price just to pass validation.

Before entering these components, implement and test a narrow schema/contract update that permits a NULL price only for a non-standalone variant referenced through an active deal component option and active deal-variant mapping. Current published deals must use `INCLUDED` with no customer selectors or surcharges. Preserve future `SURCHARGE` compatibility only when the exact deal-variant mapping explicitly defines the surcharge; never infer it from the product price. Keep standalone-sellable variants price-required; reject orphaned variants and NULL-priced `STANDALONE` mappings. Update snapshot validation, publication validation and preview behavior consistently. Test both accepted and rejected cases. This is a source/migration candidate only until separately approved for Production.

Also, the current isolated V3 preview uses inline product-card selectors rather than a product detail popup. The required Smash Single/Double selection is not yet a popup implementation. Before customer storefront cutover, build/test an accessible product detail popup (or another explicitly approved popup-equivalent) with mandatory variant selection, then connect it only after the secure order API and main V3 storefront migration are complete.

## Latest user decision — retain linked deal products (2026-11-23)

**Decision:** Do not use the proposed text-only included-content model. Retain the existing V3 product/variant-linked deal architecture. Any item that appears in a deal but is not a standalone item on the newly published menu must be represented as a **deal-only product** and linked through the existing `deal_component_options` product/variant references.

This is the user's chosen simpler operational model. It supersedes the earlier conversational proposal for a separate text-only included-content structure. Do not create a new text-only deal-content table for this menu.

### Deal-only product rules

- Deal-only items are real internal catalog product/variant records, but they are **not independently sellable** and must never appear as standalone menu cards, standalone search results or customer-selectable products.
- Keep the existing fixed deal component mappings and `pricingTreatment = INCLUDED`. The deal's printed fixed price is the only amount charged. Component prices must not be added to the deal, exposed as individual charges, or used to calculate a second total.
- Do not invent standalone prices or insert Rs. 0 merely to satisfy validation. A deal-only included variant may have a NULL price only after a narrowly scoped, tested source/migration change proves it is non-standalone and referenced exclusively by valid included deal mappings. Standalone variants remain price-required. Reject orphaned NULL-price variants and NULL-price variants used for standalone/surcharge treatment.
- Fixed bundle contents remain preselected and locked. No substitutions or customer-facing component selectors are introduced.
- Keep immutable order snapshots of the resolved component product/variant IDs, customer-facing names and quantities when the future order API is implemented. Do not rely on a live catalog join to reconstruct historical order contents.
- Generic deal wording is not evidence of a specific standalone product. Do not map a generic Burger to OG Crunch just to satisfy the foreign key; create the deal-only Burger product below.
- Deal-only products should be shared across deals only where the restaurant wording and operational identity are the same. Do not guess recipes, brands, flavours or further composition.

### Required mapping for the published offers

**Existing standalone products/variants reused as deal components:**
- The Injector — Flame Hour first offer.
- Cold Drink, the exact menu entry priced Rs. 120 — Flame Hour both offers, Flame Duo and Little Crunch.
- Quarter Broast — Flame Hour second offer and Flame Duo.
- Half Broast — Flame Feast.
- OG Crunch — Little Crunch only, because that deal explicitly names OG Crunch.

**Create deal-only product/variant records (non-standalone):**
- **Burger** — generic burger component for Flame Hour's Quarter Broast + Burger offer, Flame Duo (quantity 2), and Flame Feast (quantity 3). Do not map this product to OG Crunch.
- **Classic Nuggets (6 pcs)** — the six-piece included portion in Mini Flame and Little Crunch. Keep it separate from the standalone Classic Nuggets 12-piece pack; do not represent six pieces as six 12-piece packs.
- **Fries** — included component in Mini Flame and Little Crunch. No size/portion selector.
- **Juice** — included component in Mini Flame. Restaurant decides what is supplied; do not invent a brand/flavour.
- **1L Drink** — included component in Flame Feast. Restaurant decides what is supplied; do not create a standalone drink entry or selectable choice.

The deal quantities stay as printed: Flame Hour first offer (1 The Injector + 1 Rs.120 Cold Drink); Flame Hour second offer (1 Quarter Broast + 1 Burger + 1 Rs.120 Cold Drink); Flame Duo (2 Burgers + 1 Quarter Broast + 2 Rs.120 Cold Drinks); Flame Feast (1 Half Broast + 3 Burgers + 1 1L Drink); Mini Flame (6-piece Classic Nuggets portion + Fries + Juice); Little Crunch (6-piece Classic Nuggets portion + 1 OG Crunch + Fries + 1 Rs.120 Cold Drink).

### Required source/schema work before catalog entry

1. Inspect the actual current migrations, product/variant fields, deal component constraints, catalog write commands, publication validator, compiled snapshot, V3 snapshot validator, view models and preview renderer. Follow the existing architecture; do not invent a parallel model.
2. Confirm the product/variant non-standalone field semantics and ensure deal-only records are excluded from all standalone product surfaces, while remaining resolvable through deal component mappings.
3. Implement the narrow NULL-price rule for deal-only variants consistently in SQL publication validation and the TypeScript snapshot validator. Current published mappings use `INCLUDED`; retain future explicit `SURCHARGE` compatibility without enabling customer choices now. Standalone-sellable, orphaned, and NULL-priced `STANDALONE` variants must fail closed. Preserve all existing RLS, grants and immutable snapshot guarantees.
4. Keep deal component presentation fixed and customer-friendly. Generic Burger displays as Burger; the Little Crunch component displays as OG Crunch. Included deal components must not show separate component prices or a browser-calculated deal total.
5. Add synthetic fixtures and regression tests for all six offers, checking product IDs, variant IDs, quantities, included treatment, standalone exclusion, NULL-price acceptance/rejection, generic Burger versus OG Crunch identity, and the exact fixed deal prices.
6. No Production SQL, migration application, seed/import, catalog publication, Edge Function deployment, website deployment, or checkout activation is authorized by this decision. These remain separate explicit approval gates. GST remains deferred.

**Current safe boundary:** documentation decision only. The live Production catalog remains empty and unpublished. No database, deployment, or checkout changes were made for this decision.

## Latest pricing and future deal-selector clarification — 2026-11-23

This clarification supersedes any earlier wording that limited nullable deal-only component variants to `INCLUDED` mappings or implied that deal components must always remain fixed forever.

### Core pricing rule

A deal has its own authoritative base selling price. **A component product's normal standalone price is never automatically added to a deal.** The deal variant's component mapping explicitly controls the pricing treatment:

- `INCLUDED`: component is part of the deal at no additional charge, regardless of whether its product variant has a standalone price.
- `SURCHARGE`: add the explicit `unit_surcharge` configured for that option in that deal variant. This surcharge is deal-specific and is not derived from the component product's standalone price.
- `STANDALONE`: use the component variant's own price only where the deal pricing mode permits it (the current validation disallows STANDALONE options in `FIXED_BUNDLE`). Do not use this treatment implicitly.

Therefore, a regular standalone product can keep its ordinary menu price and still be included in a deal at zero extra charge, or have a deal-specific upgrade surcharge. A deal-only product/variant can have no standalone price.

### Product and variant price optionality

- Standalone-sellable active variants must have a price.
- Non-standalone deal-only active variants may have a NULL price (or an optional stored price if a future operational need is established); their product price is not used by `INCLUDED` or `SURCHARGE` deal mappings.
- Publication must fail closed if a NULL-priced active variant is not non-standalone and referenced by an active deal component option with a valid active deal-variant mapping using `INCLUDED` or `SURCHARGE`.
- A NULL-priced variant must never be allowed for a `STANDALONE` mapping. A variant marked standalone-sellable must remain price-required even if it is also used in a deal.
- Do not create fake zero prices. Keep the product editor's optional price input semantics, but implement the narrow matching SQL publication validation and V3 snapshot validator rules. Snapshot schema should accept `price: null` where the database publication rules permit it.
- The customer storefront must exclude non-standalone variants from standalone product cards, while deal component mappings can still reference and render them.

### Current menu versus future configurable selectors

The newly published menu's current deal compositions remain fixed as already approved. Do not add selector choices or surcharges to the current offers unless the restaurant publishes them or the user separately instructs it.

The catalog model must nevertheless support a future Admin-configurable deal selector without a schema redesign. Use the existing deal component group, component option, and per-deal-variant option mapping model:

- Configure a group with quantity bounds for required or optional selection.
- Add the exact allowed product/variant options for that deal only.
- Configure each option's treatment and (where applicable) explicit per-unit surcharge on its deal-variant mapping.
- The Admin can later enable/disable choices, make a group optional/required, and set the upgrade amounts for each deal.

**Illustrative future burger selector** (example only; not current menu authorization):
- OG Crunch — `INCLUDED`, Rs. 0 extra.
- The Injector — `SURCHARGE`, Rs. 50 extra.
- Nashville Fire — `SURCHARGE`, Rs. 100 extra.

In that example, the deal's own base price remains unchanged. The normal standalone prices of OG Crunch, The Injector and Nashville Fire are not used to calculate the bundle; only the explicit deal mapping surcharge applies. The server quote/order API must validate the current publication, selected IDs, quantities, pricing treatments and surcharge amounts, then calculate the authoritative amount. The browser configurator may collect IDs and quantities but must not become a pricing authority.

### Current scope and future work

1. Keep all six currently published offers fixed exactly as approved, with deal-only products where required and existing standalone products reused where explicitly named.
2. Update the publication validator and snapshot validator to allow NULL only for eligible non-standalone variants; allow valid `SURCHARGE` mappings as well as `INCLUDED` mappings for those deal-only variants. Keep the stronger prohibition on NULL-priced `STANDALONE` options.
3. Verify component pricing treatment is preserved in the immutable publication snapshot and is resolved by the trusted server quote/order path. No product variant price should leak into a fixed deal total unless the selected mapping explicitly says `STANDALONE`.
4. Add regression tests covering standalone product reused as INCLUDED, standalone product used with deal-specific SURCHARGE, null-priced deal-only INCLUDED, null-priced deal-only SURCHARGE, and rejected null-priced STANDALONE/orphan/standalone-sellable variants.
5. Add future-selector tests for one required selection and an optional group, including the illustrative burger upgrade mapping. Keep the present menu offers fixed in current catalog data.
6. No Production migration/write, product seed/import, catalog publication, Edge Function deployment, storefront deployment or checkout activation is authorized by this clarification. GST remains deferred.

**Decision meaning:** deal contents remain trackable product/variant references. Product standalone pricing is independent from deal pricing. Future deal-specific choices and surcharges are supported through the existing deal builder, not by adding a second product-pricing system.

## Deal-only product pricing implementation — verified 2026-11-23

The requested source implementation is now complete and passed both website CI and the full disposable Supabase migration-chain QA.

### User-approved current behaviour

- Keep all six deals as fixed, pre-priced bundles with fixed component quantities. The deal variant `base_price` is the bundle price.
- Current component mappings are `INCLUDED`; normal product/variant prices are never added to the fixed deal price.
- No selectable burger/flavour/product alternatives, no optional upgrade controls and no +price choices are enabled now.
- Active standalone-sellable variants must have a price.
- Active non-standalone deal-only variants may have `price = NULL`, but must be referenced by an active deal component and active deal-variant mapping.
- Future explicit `SURCHARGE` is supported by the existing model only as a future capability. It must use its deal-specific `unit_surcharge`, never infer the surcharge from the component's standalone price. The only surcharge use in the current SQL fixture is rolled back during QA; it is not current menu data or a customer-facing selector.
- Generic **Burger** is a separate deal-only product, not OG Crunch. OG Crunch is used only where the published menu explicitly names it (Little Crunch).

### Verified source changes

- `supabase/migrations/20261123150000_flame_chick_deal_only_variant_pricing_v1.sql`: append-only candidate; source guard pins validator/compiler baseline `f179cc3b...` / `1cee9543...`, preserves and verifies SECURITY DEFINER ownership, empty search_path and ACLs, requires standalone prices and active deal mappings for non-standalone variants.
- `apps/flame-chick-website/js/catalog-v3.js`: snapshot `price` is `nullableMoney`; standalone NULL price is rejected; non-standalone variants need a valid active `INCLUDED` or future explicit `SURCHARGE` mapping; `STANDALONE` cannot be used for null-priced/non-standalone variants.
- `supabase/tests/catalog_publication_validation_fixes_v1.sql`: rollback-only fixture proves deal-only NULL-price acceptance, standalone NULL-price rejection, future surcharge compatibility, snapshot null serialization, and rejection when the active deal mapping is removed.
- `tests/catalog-v3-contract.test.mjs`, `tests/catalog-v3-view.test.mjs`, `tests/catalog-v3-deal-view.test.mjs`: cover snapshot constraints, standalone menu exclusion, inclusion price independence and deal popup resolution of null-priced deal-only components.
- `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql` and `.github/workflows/qa-catalog-publication-validation-fixes-v1.yml`: recovery guard updated to recognize the candidate validator source; recovery still verifies the exact original helper baseline after compensation.

### Passing CI evidence

- [Website Static Checks — run 45128810592](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128810592), success. Syntax, catalog contract/client/view/deal tests, preview tests and inline scripts passed.
- [Disposable migration-chain QA — run 45128650772](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128650772), success. Full local migration replay, rollback-only catalog fixture, forward compensation, helper source/security verification, zero residual test tenant, migration ledger count and local stack shutdown all passed.

### Safe boundary and remaining phases

No Production migration was applied. No Production products, variants, deals or publication data were inserted. No catalog was published; no Edge Function or website deployment occurred; checkout remains disabled.

The V3 catalog authoring UI and reviewed data-entry package for the real published menu have not yet been completed. The existing `apps/flame-chick-admin/app.js` still references legacy `deal_components` / `bundle_price` paths and requires product prices; do not use that legacy surface as the V3 deal-only authoring editor. The next safe phase is to integrate the secured V3 catalog command API with the Admin panel, then prepare a synthetic, reviewed draft for all standalone items and six fixed deals. The draft must include deal-only Burger, Classic Nuggets (6 pcs), Fries, Juice and 1L Drink; keep every current deal group fixed with `INCLUDED` mapping. The Smash's required Single/Double popup remains a separate website UI blocker before storefront cutover.

GST remains deferred. Production changes and publication remain separate explicit approval gates.
## Published menu V3 review draft — validated 2026-11-23

A source-only, review-only catalog draft and a synthetic snapshot test suite have been added. **No Production rows have been written.**

### Draft file

ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json

- Status: REVIEW_ONLY_NOT_IMPORTED
- 8 categories (7 menu categories + Deals).
- 25 product records: 20 standalone menu products + 5 deal-only products.
- 28 product variants: 23 standalone variants + 5 deal-only variants.
- 6 fixed-price offers across 6 deal records.
- 18 fixed deal component groups/options/mappings.
- All current deal component mappings are INCLUDED, surcharge = 0.
- The draft uses stable natural keys, not generated database UUIDs. No product or deal is seeded from this file automatically.

Deal-only products: Burger, Classic Nuggets (6 pcs), Fries, Juice, 1L Drink. Their variants are standaloneSellable=false and price=null; each is linked into the appropriate fixed deal. Generic Burger never maps to OG Crunch. Little Crunch maps to the named OG Crunch standalone product.

### Flame Hour model detail

The two printed Flame Hour packages are represented as two separate deal entries under the same deals collection and the same daily Asia/Karachi 15:00–17:00 schedule:
- Flame Hour — The Injector + Cold Drink, Rs. 699.
- Flame Hour — Quarter Broast + Burger + Cold Drink, Rs. 1,599.

Reason: V3 component groups belong to a deal record, not to an individual deal variant. Putting both packages as variants of one deal record would make each variant have to satisfy both package component groups. Separate deal records keep each fixed composition independently valid and orderable, with the same schedule. This creates two clearly named offer cards; it does not introduce a selector.

### Synthetic full-menu validation

- tests/fixtures/flame-chick-published-menu-v3-fixture.cjs creates a deterministic V3 snapshot from the review JSON draft without mutating the draft.
- tests/published-menu-v3-draft.test.mjs verifies the full V3 snapshot contract, 20 visible standalone products vs five hidden deal-only products, standalone prices and variants (including The Smash pricing data), all six exact offer prices and fixed contents, Burger vs OG Crunch product identity, Flame Hour daily schedule and after-hours read-only configurator behavior.
- CI is wired to run the new tests and include the draft/fixture in the path filter.

**Passing CI:** [Flame Chick Website Static Checks run 45129861610](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45129861610), head 9b568bcf98fb7bd55eaca43e744dda142782bc4c, success. All 96 core catalog/preview checks passed, including the new end-to-end published-menu draft suite.

### Current implementation boundary and next phase

The pricing contract and full published-menu review draft are source-tested. The next source implementation phase is to connect the Admin panel to the secured V3 catalog command API. The current apps/flame-chick-admin/app.js still uses legacy deal_components / bundle_price REST paths and product-price-required UI; it must not be used to enter this V3 draft. Inspect the V3 command functions and role checks first, then build an Admin V3 editor that supports:
- standalone products with required prices;
- non-standalone deal-only products with optional NULL prices;
- fixed deal variants with fixed component groups/mappings using INCLUDED only for these six current offers;
- no current selectable +price or product/flavour upgrade options.

After the Admin V3 authoring UI and draft review are complete, add a source-only command/preview test for all six real offers. The Smash's required product popup remains a separate storefront UI blocker. No Production migration, catalog import, publication, Edge Function deployment, website deployment or checkout activation has been performed or authorized. GST remains deferred.

## Catalog V3 Admin authoring workspace — source implemented and CI verified (2026-11-23)

A dedicated V3 authoring page has been added to the Admin source on this branch. It uses only the existing authenticated Staff Admin Edge Function and its finite catalog command allow-list. It does not perform direct PostgREST table writes, use service-role keys in the browser, or expose publish/rollback actions.

### Added source files

- `apps/flame-chick-admin/catalog-v3-admin.js` — product/category/fixed-deal authoring workspace and validation helpers.
- `apps/flame-chick-admin/catalog-v3-admin.css` — responsive workspace styling.
- `tests/catalog-v3-admin.test.mjs` — validation and API-contract regression tests.

### Existing Admin files updated

- `apps/flame-chick-admin/index.html`: Catalog V3 navigation entry, page root, stylesheet and module links.
- `apps/flame-chick-admin/app.js`: Catalog V3 workspace is mounted through the existing signed-in Staff Admin API request path, with current draft revision and per-mutation request IDs.
- `.github/workflows/ci-admin-static.yml`: syntax checks, Catalog V3 tests, static asset and page-wiring checks.

### Security and role boundaries

- Catalog V3 navigation is enabled only after the existing authenticated context returns `actor_role` of `admin` or `owner`. Manager/Cashier/Rider cannot access this screen.
- The workspace's action names are finite and match the allow-listed actions in `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs`.
- Every mutation goes through the existing Staff Admin Edge Function, carrying `expected_revision` and a request ID. The database command functions remain actor-scoped, role-checked, revision-checked, idempotent and audited.
- No generic RPC/table proxy, browser service-role credential, publish action or rollback action has been added.
- The legacy menu/deal REST editors remain separate and must not be used for the V3 draft.

### Current Admin V3 authoring behavior

- Product form supports standalone variants with required prices and deal-only variants with `is_standalone_sellable=false` and optional NULL price. Pack metadata is validated.
- Fixed-deal form supports a deal-owned base price and fixed components linked to exact product variant IDs. Component quantity is fixed in min/max bounds; each component has exactly one option.
- Mapping creation is intentionally fixed to `INCLUDED` with zero surcharge. It does not create selectable alternatives, product/flavour selectors, optional upgrade choices or +price controls.
- Flame Hour checkbox creates/reuses a seven-day Asia/Karachi 15:00–17:00 schedule and assigns it to the new deal.
- A new deal is initially saved inactive. Before activation, the workspace re-reads and verifies the exact deal price, component names/quantities/variant IDs, all active INCLUDED mappings with zero surcharge, and Flame Hour schedule assignment. It then activates the deal and reads it back once more to verify activation. A failure leaves the deal inactive and exposes its ID to prevent blind duplicate creation.
- Deal inspection reads the database's actual `product_name_en` and `variant_label` detail DTO fields.
- This is an initial create/edit product + create fixed deal workspace. It does not yet provide an automated import of the review JSON draft, a deal-edit workflow, or a browser-driven end-to-end smoke test. Use the review-only JSON draft as the source of truth; do not infer content.

### Verification

**Admin Static Checks passed:** [run 45132136238](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45132136238), head `489d42fd5e9627ba2c65a8b8e9a6bd3e1ed5cc02`.
- JavaScript syntax check passed.
- Catalog V3 Admin unit tests passed (nullable deal-only prices, standalone price requirement, pack metadata, fixed groups, INCLUDED-only mapping builder, exact action allow-list and DTO contract, Admin/Owner-only navigation, read-back/activation verification).
- Static asset and navigation/script/style wiring checks passed.

### Crucial deployment limitation and next work

The production/deployed `flame-chick-staff-admin` Edge Function is still version 1, and the Admin app is not deployed with these source changes. This branch work does not make the live Admin page available. Do not attempt to use the new UI against the live site until the updated Edge Function source has a separate review, QA, deployment approval and deployment; then deploy the Admin website only after that review. The current V3 catalog remains unseeded and unpublished in Production.

Next safe source phase: implement a reviewed, idempotent draft-import/authoring workflow for `ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json` using the same finite command API, with preflight/reference checks, safe staged writes, complete read-back and no auto-publication. Keep the six current offers fixed and INCLUDED. Then add a source-only end-to-end synthetic workflow. The Smash popup remains a separate storefront blocker. No Production migration, catalog import, publication, Edge Function deployment, Admin website deployment or checkout activation has been performed or approved. GST remains deferred.

## Resumable published-menu importer — source implementation and Admin CI verified (2026-11-23)

A confirmed, review-only Catalog V3 menu importer is now linked to the Admin V3 workspace. **It has not been executed against Production or any database.**

### Source files

- `apps/flame-chick-admin/catalog-v3-importer.js` — validates the authoritative review JSON, preflights existing identities/conflicts, imports sequentially through finite secured catalog commands, and performs read-back verification.
- `apps/flame-chick-admin/flame-chick-published-menu-2026-11-23.v3-draft.json` — Admin-served copy of the authoritative review draft.
- `tests/catalog-v3-importer.test.mjs` — review draft validation, price/standalone rules, stable identity rules, fixed INCLUDED mapping validation, staged/active deal read-back validation, and a full mocked catalog command API import/resume simulation.
- `apps/flame-chick-admin/catalog-v3-admin.js` — adds the deliberate "Import published menu draft" Admin action, a confirmation prompt, progress feedback and interruption guidance.
- `apps/flame-chick-admin/index.html` — loads the importer before the Admin V3 workspace.
- `.github/workflows/ci-admin-static.yml` — syntax/tests/static asset verification and byte-for-byte comparison of the Admin-served menu JSON against the authoritative draft. Its path filter now includes both Catalog V3 Admin and importer test files.

### Importer safety behavior

1. Validates the exact approved V3 draft (PKR, Asia/Karachi, 8 categories, 25 products, 28 variants, 6 offers, 18 fixed components).
2. Performs read-only preflight of category/product identities, product variant details, target Deals collection and its existing deal identities, and the Flame Hour daily schedule. It stops on unrelated records, duplicate identities, conflicting names, unexpected schedules or mismatched existing product/deal data.
3. Uses stable `legacy_id` values scoped to this published-menu draft for category, product, variant and deal records. Retrying after an interruption re-reads those stable identities instead of blindly creating duplicates.
4. Writes sequentially through only the existing authenticated Staff Admin catalog command allow-list. Every mutation carries the current draft revision and a fresh request ID. No browser direct table writes, service-role key, generic RPC proxy, publication action or rollback action is used.
5. Deal records and their variants are initially inactive. It writes fixed component groups and exact product variant links, writes only `INCLUDED` mappings with zero surcharge, and sets the Flame Hour schedule where needed.
6. It reads the deal back and verifies exact bundle price, variant identity, component names, fixed quantities, linked variant IDs, active mappings, zero surcharge and schedule assignment. Only then does it activate the deal and its fixed-price variant together, then read them back again.
7. An already-active deal on retry is accepted only if it fully matches the approved fixed deal and is order-available. Any unexpected or ambiguous state halts for manual inspection.
8. The Admin button requires explicit user confirmation and describes that the operation writes only to the unpublished catalog draft. It does not publish, deploy, enable checkout or create selectable +price upgrades.

### Verification

**Admin Static Checks passed:** [run 45136997505](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45136997505), head `2a2dca9e2078d88d553b2b0af968beabe4c881f8`.
- JavaScript syntax checks passed.
- All **51 tests passed; 0 failed**.
- The full mock command-API import test passed: creates 8 categories, 25 products, 28 variants, one Deals collection, one daily Flame Hour schedule, six deals/offers and fixed INCLUDED component mappings; a second complete importer pass makes no additional writes and produces no duplicates.
- Static Admin page asset checks passed.
- Admin-served menu JSON matched the authoritative `ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json` byte-for-byte.
- [Admin Preview workflow](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45136997508) was **skipped**; no Admin deployment occurred.

### Current safe boundary

The importer test is a deterministic mock of the finite catalog command API. It is not a live or disposable-Postgres integration test of the complete catalog write sequence. The next verification step before deployment should exercise the actual finite catalog commands against a fresh local/disposable Supabase stack using the full migration chain, run the importer against that isolated database, verify the resulting compiled snapshot and publication validation, and run the importer a second time to confirm database-level idempotent resume. This QA must not connect to Production.

The Production catalog remains empty/unpublished and checkout remains disabled. No migration was applied to Production, no Production catalog data was written, and no Edge Function, Admin website, or customer website was deployed. The current deployed Edge Function/Admin site must not be assumed to contain these branch-only changes. Their deployment requires separate code review, disposable QA and explicit approval. GST remains deferred; the six current deals remain fixed and use INCLUDED/zero surcharge only.

