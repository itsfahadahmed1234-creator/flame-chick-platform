# Flame Chick Catalog Authoring V1 — Source / Schema Reconciliation

Date: 2026-11-21
Branch: `work/production-source-audit`
Status: design reconciliation; no SQL migration applied

## Goal

Implement routine menu authoring through Admin without requiring SQL or code changes for ordinary category, product, variant, modifier and drink-size changes. Preserve the existing Website/POS catalog DTO while moving all writes behind authenticated server commands.

## Current source contract that must be preserved or adapted

| Domain | Existing source DTO / table fields | Reconciliation decision |
|---|---|---|
| Categories | `name_en`, `name_ur`, `legacy_id`, `sort_order`, `is_active`, `category_folder_key`, `image_current_path`, `image_previous_path` | Preserve DTO fields; add an explicit `category_kind` (`menu` or `deal`) so UI no longer relies on magic legacy IDs such as `CAT-DEALS`, `CAT-SD` or `CAT-1`. |
| Subcategories | `category_id`, `name_en`, `name_ur`, `legacy_id`, `sort_order`, `is_active` | Preserve DTO; add `restaurant_id` and composite tenant/category integrity. |
| Products | `category_id`, `subcategory_id`, `name_en`, `name_ur`, `description_en`, `description_ur`, `legacy_id`, `featured`, `sort_order`, `is_active`, `is_available`, image path/extension/published fields | Preserve client names in V1; server enforces same-restaurant category/subcategory. Avoid exposing storage mutation through direct REST. |
| Product variants | `size_key`, `size_label`, `price`, `legacy_id`, `sort_order`, `is_active`, `is_available` | Preserve DTO; `price` must be nullable for an unpriced draft. Empty input must remain NULL, never coerce to zero. |
| Modifier groups | `name_en`, `name_ur`, `standalone_only`, `selection_mode`, `min_select`, `max_select`, `sort_order`, `is_active` | Preserve current fields; server validates selection mode and min/max. |
| Modifiers | `modifier_group_id`, `name_en`, `name_ur`, `price_mode`, `fixed_price`, `sort_order`, `is_active` | Preserve current DTO; validate price-mode-specific columns and non-negative values. |
| Product/group links | `modifier_group_assignments` with `product_id`, `modifier_group_id`, `is_active`, `sort_order` | Preserve existing link table; enforce same-restaurant composite foreign keys and unique product/group pair. |
| Modifier pricing | `modifier_price_rules` with `modifier_id`, `size_key`, `price` | Keep response compatibility initially. Candidate schema must ensure a rule can only resolve to variants for products that have the modifier group assigned; do not trust browser-calculated option prices. |
| Drinks | `drink_options` with `product_variant_id`, `display_name`, `display_name_ur`, `volume_key`, `volume_ml`, `is_active`, `sort_order` | Retain dedicated drink-size options for compatibility with current Admin/Website/POS DTO. |

The current catalog Edge Function already reads these table names and field families and emits the existing schema-v2 DTO. Do not replace it with generic column names unless a versioned adapter is included.

## Database constraints required in the catalog foundation

1. Every authoring row belongs to the single Flame Chick restaurant using `restaurant_id`; child rows also carry `restaurant_id` so composite foreign keys prevent cross-tenant references.
2. Category kind is explicit data. Products may reference only `menu` categories; deals may later reference only `deal` categories. Do not infer deal category from `legacy_id` or English-name substring matching.
3. Subcategory must belong to the selected category and same restaurant.
4. Product variants must belong to the same restaurant/product; `(product_id, size_key)` is unique; price is NULL or non-negative. NULL means unpriced draft, zero means deliberately free.
5. Modifier group, modifier, product/group assignment and price rule relationships must be same-restaurant and unique. Enforce min/max selection bounds in the database command and order validation.
6. Drink option must reference a variant in the same restaurant and use a valid positive volume where volume is measured.
7. Archive referenced categories/products/variants/modifiers; do not hard-delete rows used by deals or historical order snapshots.
8. Enable RLS on every public table and create no direct anon/authenticated table policies. Browser reads/writes go through Edge Functions; service secrets remain server-side.
9. Admin writes are atomic server commands with verified Admin/Owner identity, expected draft revision and actor audit. Remove direct browser REST mutations before enabling catalog authoring.
10. Keep `legacy_id` optional and non-authoritative. It is only a compatibility/display field; primary and foreign keys remain UUIDs. New generated values use Flame Chick prefixes, not retired demo prefixes.

## Publication and branch behavior already decided

- V1 base categories/products/variants/deals and base prices are restaurant-wide and identical across branches.
- Branch availability overlays may disable a variant/deal at one branch; an overlay cannot reactivate a globally inactive item.
- Website and POS consume the same current immutable catalog publication; response/cache identity also includes branch availability revision.
- Admin and Owner may draft, edit prices, publish and roll back, with immutable actor attribution.
- A publish command must reject active purchasable variants with NULL price, invalid modifier selections, incomplete media references and broken deal references.
- Publication snapshot/checksum and pointer changes must be atomic; rollback points to an earlier immutable publication, never mutates history.
- GST/tax remains deferred.

## Explicitly deferred from this catalog foundation

- Deal schedule recurrence, overnight/timezone overlap and branch-vs-restaurant schedule scope.
- Product-family flavor representation where the correct model differs by menu family.
- Inventory/stock, allergens and dietary labels unless separately approved.
- Channel-specific product restrictions beyond existing branch capability controls.
- Full website security audit and live Website-to-Production database integration; this remains a mandatory later stop-gate.

## Next implementation sequence

1. Prepare the base authoring migration for categories, subcategories, products, product variants, modifier groups, modifiers, assignments, modifier price rules and drink options using the compatibility fields above.
2. Add explicit `category_kind` and remove all magic legacy category identifiers from Admin UI.
3. Add server-side catalog draft read/mutation commands in `flame-chick-catalog`; public GET continues to expose only the published snapshot.
4. Replace Admin direct REST writes with authenticated catalog commands and optimistic draft-revision checks.
5. Add database constraint and command tests, including tenant-crossing FKs, NULL-vs-zero pricing, modifier assignment integrity, stale draft revision and archive protection.
6. Only after a separate owner approval, apply the reviewed migration to Production. Do not deploy or enable catalog Admin writes before schema and function QA.

## Current status

- Production still has no catalog business tables or seeded menu data.
- The current `flame-chick-catalog` Edge Function remains public read-only and is not deployed.
- The function source now supports the new `SUPABASE_SECRET_KEYS` environment map with legacy service-role fallback.
- Order and delivery Edge Function RPC names have been renamed to Flame Chick-specific planned names; their SQL RPC implementations are not yet present in the applied migrations.
- No database or Vercel changes were made by this reconciliation.
