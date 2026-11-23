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

The second package's customer-facing component label and deal description must say **"Burger"**, not "OG Crunch". The fixed internal product reference remains OG Crunch as previously confirmed. No substitutions or selection UI.

Outside 3–5 PM, both Flame Hour offers must remain visible and greyed out. Customers must still be able to open the deal detail popup and see the composition, but all ordering/continue/add actions must be unavailable. The trusted order API must independently reject attempts outside the schedule. Do not hide the deals or rely on the browser clock.

### Flame Duo — Rs. 2,099

Fixed composition:
- 2 x OG Crunch internally; customer-facing component label: **"Burger"** with quantity 2.
- 1 x Quarter Broast.
- 2 x the Rs. 120 Cold Drink.

The deal description and popup must say **"2 Burgers"**, not "2 OG Crunch". No selectable burger choices.

### Flame Feast — Rs. 3,599

Fixed composition:
- 1 x Half Broast.
- 3 x OG Crunch internally; customer-facing component label: **"Burger"** with quantity 3.
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
2. The current published snapshot's dealComponentGroups.nameEn is a customer-facing label, while each component option links to an internal product. For the generic burger components, set the group label to **"Burger"** and keep the component option's product ID linked to OG Crunch. The website must render a fixed one-option group's group label instead of exposing the internal product name.
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
