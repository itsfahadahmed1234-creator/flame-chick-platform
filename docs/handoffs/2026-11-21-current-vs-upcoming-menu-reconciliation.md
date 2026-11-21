# Flame Chick — Current vs Upcoming Menu Reconciliation

Date: 2026-11-21
Branch: \`work/production-source-audit\`
Status: both supplied menu images inspected; design reconciliation only

## 1. Source authority

Two Flame Chick menu images are now available:
- Current published menu: image uploaded after the request to re-upload the current menu.
- Upcoming menu: red/white menu image uploaded earlier in this conversation.

Use the current menu as the compatibility baseline for the transition and the upcoming menu as the target catalog for the next release. Do not seed every current item as active in the target menu: some current items are absent from the upcoming menu. Do not hard-delete/lose the current catalog or its historical labels/prices when the new menu is published; immutable publication/order snapshots preserve the old state.

The supplied images are single-page menu views. Absence from an image means "not shown in this supplied menu page", not necessarily proof that the business has permanently discontinued an item outside the pictured menu.

## 2. Current menu — extracted entries

All current prices are shown with the explicit note: **"All prices are exclusive of applicable GST."**

### Starters
| Item | Listed price |
|---|---:|
| Classic Nuggets 12 pcs | Rs. 599 |
| Injected Nuggets 12 pcs | Rs. 649 |
| Fire Wings 6 pcs | Rs. 499 |
| Injected Wings 6 pcs | Rs. 599 |
| Platter | Rs. 1,499 |

Current Platter description: 6 Classic Nuggets, 6 Injected Nuggets, 6 Fire Wings, 6 Injected Wings, Fries & Dips. The upcoming menu image does not repeat the composition; do not assume it remains unchanged without approval.

### Injected Broast
| Item | Listed price | Current description |
|---|---:|---|
| Quarter Broast | Rs. 749 | 2 pcs chicken, dips, bun and fries |
| Half Broast | Rs. 1,399 | 4 pcs chicken, dips, 2 buns and fries |
| Full Broast | Rs. 2,100 | 8 pcs chicken, dips, 4 buns and fries |

### Wraps
| Item | Listed price |
|---|---:|
| Tender Fillet Wrap | Rs. 500 |
| Flame Chick Special | Rs. 550 |
| B-B-Q Wrap | Rs. 600 |

### Burgers
| Item | Listed price | Current description |
|---|---:|---|
| The Injector | Rs. 549 | Juicy injected chicken, crispy coating, signature sauce, lettuce & mayo |
| OG Crunch | Rs. 499 | Crispy chicken, fresh lettuce, pickles & signature sauce |
| Classic Chick | Rs. 599 | Crispy chicken fillet, cheese, fresh veggies & creamy sauce |
| Nashville Fire | Rs. 649 | Spicy Nashville-style chicken, lettuce, pickles & fiery sauce |

### Drinks shown in the right-side menu panel
| Item | Listed price |
|---|---:|
| Fresh Mint | Rs. 249 |
| Strawberry Blaze | Rs. 299 |
| Peach Kick | Rs. 299 |
| Berry Burst | Rs. 349 |
| Blue Flame | Rs. 349 |
| Sunset Splash (NEW marker) | Rs. 449 |
| Water | Rs. 99 |
| Cold Drink | Rs. 120 |
| 1.5 Ltr Water Bottle (NEW marker) | Rs. 150 |
| Cold Drinks 1.5 Ltr (NEW marker) | Rs. 250 |

These flavoured drinks should be modeled as products unless the finalized recipe/menu defines actual size variants. The current image does not provide measured volumes for Fresh Mint / Strawberry Blaze / Peach Kick / Berry Burst / Blue Flame / Sunset Splash or the regular water/cold drink.

No deals/combo section is visible on the supplied current-menu image. This does not establish that no other deal exists outside this page.

## 3. Upcoming menu — target entries

### Starters
| Item | Upcoming listed price |
|---|---:|
| Classic Nuggets 12 pcs | Rs. 699 |
| Injected Nuggets 12 pcs | Rs. 749 |
| Fire Wings 6 pcs | Rs. 599 |
| Injected Wings 6 pcs | Rs. 699 |
| Platter | Rs. 1,499 |

### Injected Broast
| Portion | Upcoming listed price |
|---|---:|
| Quarter Broast | Rs. 899 |
| Half Broast | Rs. 1,599 |
| Full Broast | Rs. 2,399 |

The upcoming image no longer prints the current menu's portion contents/descriptions. Retain existing current descriptions as historical/baseline information, but do not assume they remain the exact target customer-facing copy until confirmed.

### Whole Chicken Broast
- Cheetos Butter — TBD
- Nashville — TBD
- Simple Injected — TBD

The menu supports three named flavour choices; whether those are variants of one product or separate products remains an authoring choice. Variant metadata must support the flavour representation if selected.

### Chicken Burgers
- The Injector — Rs. 649
- OG Crunch — Rs. 599
- Nashville Fire — Rs. 749

### Flame Beef
- The Smash — TBD
- The Marrow — TBD

### Flame Fish
- Injected Finger Fish — TBD
- Fish Burger — TBD

### Wraps
- Tender Fillet Wrap — Rs. 599
- Flame Chick Special — Rs. 649

B-B-Q Wrap is not shown in the upcoming menu.

### Beverages
- Water — Rs. 99
- Water 1.5 Ltr — Rs. 150
- Cold Drink — Rs. 120
- Cold Drink 1.5 Ltr — Rs. 250

### Shakes
- Oreo Shake — TBD
- Lotus Shake — TBD

The current flavoured drinks are not shown in the upcoming menu.

### Deals & Combos
- Flame Hour (3 PM–5 PM): The Injector + Drink — Rs. 699
- Flame Hour (3 PM–5 PM): Quarter Broast + Burger + Drink — Rs. 1,599
- Flame Duo: 2 Burgers + Quarter Broast + 2 Drinks — Rs. 2,099
- Flame Feast: Half Broast + 3 Burgers + 1L Drink — Rs. 3,599
- Mini Flame: 6 Nuggets + Fries + Juice — Rs. 399
- Little Crunch: 6 Nuggets + OG Crunch + Fries + Drink — Rs. 999

The upcoming image does not state Flame Hour weekdays, eligible choices, or prices for TBD products. It does not explicitly repeat the current menu's GST-exclusive statement.

## 4. Price movement for products shown in both menus

| Item | Current | Upcoming | Difference |
|---|---:|---:|---:|
| Classic Nuggets 12 pcs | 599 | 699 | +100 |
| Injected Nuggets 12 pcs | 649 | 749 | +100 |
| Fire Wings 6 pcs | 499 | 599 | +100 |
| Injected Wings 6 pcs | 599 | 699 | +100 |
| Platter | 1,499 | 1,499 | No change |
| Quarter Broast | 749 | 899 | +150 |
| Half Broast | 1,399 | 1,599 | +200 |
| Full Broast | 2,100 | 2,399 | +299 |
| The Injector | 549 | 649 | +100 |
| OG Crunch | 499 | 599 | +100 |
| Nashville Fire | 649 | 749 | +100 |
| Tender Fillet Wrap | 500 | 599 | +99 |
| Flame Chick Special | 550 | 649 | +99 |
| Water | 99 | 99 | No change |
| Cold Drink | 120 | 120 | No change |
| Water 1.5 Ltr | 150 | 150 | No change |
| Cold Drink 1.5 Ltr | 250 | 250 | No change |

## 5. Transition: removed, new and changed families

### Not shown in upcoming menu
- Current Burger: Classic Chick.
- Current Wrap: B-B-Q Wrap.
- Current flavoured drinks: Fresh Mint, Strawberry Blaze, Peach Kick, Berry Burst, Blue Flame, Sunset Splash.

Treat these as target-menu removals only after the Owner confirms that they are retired. Archive or deactivate in the new publication; never delete their records or historical references.

### New or expanded in upcoming menu
- Whole Chicken Broast with Cheetos Butter, Nashville and Simple Injected flavours.
- Flame Beef: The Smash and The Marrow.
- Flame Fish: Injected Finger Fish and Fish Burger.
- Shakes: Oreo Shake and Lotus Shake.
- Flame Hour, Flame Duo, Flame Feast, Mini Flame and Little Crunch structured deals.
- Six-piece Nuggets component for Kids Deals; Fries and Juice deal components.
- 1L drink reference in Flame Feast.

## 6. Database architecture impact

The menu-first architecture remains suitable, with these additions/clarifications:

1. **Preserve descriptions and menu copy.** Existing bilingual product descriptions are suitable for current burger/broast descriptions. A product's listed composition can remain customer-facing description unless recipe costing, inventory or kitchen component-level tracking is separately requested.
2. **Keep pack and variant metadata.** 12-piece Nuggets, 6-piece Wings, future six-piece Nuggets, broast portions and beverage sizes must be representable with variant kind and pack count/unit. Regular drink volume remains unknown; do not invent it.
3. **Support two beverage patterns.** Current flavoured beverages are separate products; bottled water/cold drinks have regular and 1.5L variants. Upcoming shakes are separate products unless future size choices are added.
4. **Support menu-only retirement.** Active/available status and immutable publication snapshots permit removal from new menu while preserving old orders and archived products.
5. **Keep deal components normalized.** Upcoming menu adds six individual structured deals, with collection headings Flame Hour and Kids Deals. Fries, Juice, six-piece Nuggets and a 1L drink can be deal-only variants if they are not intended for standalone sale.
6. **Historical versioning is required.** Current prices and descriptions must remain recoverable in old publication/order snapshots when upcoming menu prices become current.
7. **Do not turn the Platter into an inventory recipe engine.** Its current menu copy describes fixed contents. Product description/order snapshot suffices for current scope unless owner asks for kitchen component breakdown or inventory accounting.
8. **TBD remains NULL.** The upcoming TBD prices for Whole Chicken Broast, Flame Beef, Flame Fish and Shakes must not be published as purchasable prices or converted to zero.

## 7. GST discrepancy — unresolved requirement

The current menu explicitly states all prices are exclusive of applicable GST. The upcoming menu image does not show a GST note. Project decisions had previously deferred implementing GST/tax in the initial schema.

This image comparison does not authorize silently reversing that decision. For now:
- Keep the product/deal prices as their configured menu prices; do not add a tax table/calculation to the catalog migration without approval.
- Do not label the upcoming customer prices as GST-inclusive or GST-exclusive until the Owner confirms the target menu's display and checkout policy.
- Before Website/POS order integration, confirm whether applicable GST must be calculated and shown as a separate order amount. If so, design it in the order/pricing domain, not as hidden product price manipulation.
- Preserve tax presentation/amount in historical order snapshots once the tax policy is implemented.

## 8. Migration and release checklist updates

- Include all current and upcoming product types in variant/product Admin contract tests.
- Verify current flavours as ordinary products and target beverages as volume variants.
- Ensure historical product names/descriptions/prices survive archive and publication changes.
- Validate deal component quantities and deal-only standalone restrictions.
- Do not retire Classic Chick, B-B-Q Wrap or current flavour drinks until Owner confirms the target menu is final.
- Confirm GST display/checkout policy before customer order integration.
- No menu seed data should be inserted until target product list, prices, details and deal choices have been approved.

No Production schema/data changes, Edge Function deployments, Vercel deployments or menu seeds were made by this comparison.
