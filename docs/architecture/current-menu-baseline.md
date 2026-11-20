# Current Published Menu — Source Baseline

**Source received:** User-supplied Flame Chick menu image, 2026-11-20  
**Purpose:** Baseline inventory for schema and Admin capability design  
**Publication instruction:** This is the current menu baseline only. It is NOT an instruction to insert or publish these rows in Production. No menu data has been seeded.

## 1. Published menu information visible in the source

The image states: **“All prices are exclusive of applicable GST.”**

The image does not state a GST rate, tax calculation method, tax registration configuration, or whether tax is applied per line or at order level. Do not invent these settings. Tax must be configurable and calculated on the server once business/accounting rules are confirmed.

### Starters

| Item | Description / serving | Displayed price (PKR) | Note |
|---|---|---:|---|
| Classic Nuggets | 12 pcs | 599 | |
| Injected Nuggets | 12 pcs | 649 | |
| Fire Wings | 6 pcs | 499 | |
| Injected Wings | 6 pcs | 599 | |
| Platter | 6 Classic Nuggets, 6 Injected Nuggets, 6 Fire Wings, 6 Injected Wings, Fries & Dips | 1,499 | Marked NEW |

### Injected Broast

| Item | Description / serving | Displayed price (PKR) |
|---|---|---:|
| Quarter Broast | 2 pcs chicken, dips, bun and fries | 749 |
| Half Broast | 4 pcs chicken, dips, 2 buns and fries | 1,399 |
| Full Broast | 8 pcs chicken, dips, 4 buns and fries | 2,100 |

The current artwork presents Quarter/Half/Full Broast as three named menu items. Do not assume they are currently maintained as variants of one product; Admin/catalog design can support both representations, and the source data model should be confirmed against actual current records before mapping.

### Wraps

| Item | Displayed price (PKR) |
|---|---:|
| Tender Fillet Wrap | 500 |
| Flame Chick Special | 550 |
| B-B-Q Wrap | 600 |

### Burgers

| Item | Description | Displayed price (PKR) |
|---|---|---:|
| The Injector | Juicy injected chicken, crispy coating, signature sauce, lettuce & mayo. | 549 |
| OG Crunch | Crispy chicken, fresh lettuce, pickles & signature sauce. | 499 |
| Classic Chick | Crispy chicken fillet, cheese, fresh veggies & creamy sauce. | 599 |
| Nashville Fire | Spicy Nashville-style chicken, lettuce, pickles & fiery sauce. | 649 |

### Beverage list shown below the Burger list

The right-hand panel shows these products after the burger list, but the supplied artwork does not visibly print a separate “Beverages” heading. Treat these as a likely beverage group for design purposes, but confirm the intended category label/order in the live Admin/catalog before migration or import.

| Item | Displayed price (PKR) | Note |
|---|---:|---|
| Fresh Mint | 249 | |
| Strawberry Blaze | 299 | |
| Peach Kick | 299 | |
| Berry Burst | 349 | |
| Blue Flame | 349 | |
| Sunset Splash | 449 | Marked NEW |
| Water | 99 | |
| Cold Drink | 120 | |
| 1.5 Ltr Water Bottle | 150 | Marked NEW |
| Cold Drinks 1.5 Ltr | 250 | Marked NEW |

## 2. Inventory count derived from the artwork

- 5 visible product groupings: Starters, Injected Broast, Wraps, Burgers, plus a likely beverage grouping without a printed heading.
- 25 named sellable entries if Platter is counted as a menu item: 5 starters including Platter, 3 broast items, 3 wraps, 4 burgers, and 10 beverage-list items.
- All 25 entries show a numeric price in this current menu image; the GST rate is not specified.
- One bundle is explicitly described: Platter with four named food quantities plus Fries & Dips.
- No size-selection UI, flavor modifiers, optional add-ons, combo customization, scheduled deal, stock rules, or channel-specific availability are described in this current-menu artwork.
- “NEW” is a merchandising label on Platter, Sunset Splash, 1.5 Ltr Water Bottle, and Cold Drinks 1.5 Ltr; the image does not define whether “NEW” should expire or remain a permanent badge.

## 3. What this tells us about the catalog model

The Production schema and Admin panel must comfortably support:

- Category/group records created and ordered through Admin.
- Product name, description, image, price, active/available state, sort order and optional promotional badge.
- Multilingual labels/descriptions where needed.
- A simple product with one price.
- A future product with multiple portions/variants without hardcoded size enums.
- A bundle (Platter) containing fixed component references and quantities; the exact component list needs confirmation against current catalog records and stock/availability policy.
- Beverage products with no hardcoded beverage table/category assumptions.
- Configurable tax settings/rules rather than hardcoding the GST rate into product prices.
- Future TBD/unpriced drafts, modifiers, selectable deal components and time schedules as outlined in the menu-management design.
- Immutable order-item/component/price/tax snapshots so future changes do not alter old orders.

## 4. Important source boundaries and open questions

- This document is transcription from the supplied artwork only. It is not proof of the exact live website/POS catalog values or internal variant structure.
- The artwork is a user-provided visual baseline, not an authoritative tax/accounting policy.
- The beverage heading is not visible in the image. Confirm the intended category name and placement.
- Confirm whether the displayed amounts are entered as tax-exclusive selling prices and GST is added at checkout, or whether a separate accounting treatment applies. The artwork only says prices exclude applicable GST.
- Confirm how “NEW” behaves (permanent until manually removed, or automatic expiry).
- Confirm whether Platter components are fixed products and whether Fries & Dips are tracked as catalog components or descriptive inclusions.
- Current menu artwork has no explicit flavor modifiers or customer-selected combo choices. Do not invent these for current published items; design future Admin capabilities separately.
- Before importing any catalog, compare this baseline against the current live backend/catalog export and retain stable item identities. Do not use display names as permanent primary keys.

## 5. Safety status

- No product, price, category, tax setting, deal, user or other menu data from this image has been inserted into Supabase Production.
- No schema or live application has been modified because of this image.
- This file is a reference inventory for schema/Admin design and later controlled catalog setup.
