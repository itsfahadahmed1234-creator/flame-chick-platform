# Flame Chick handoff — catalog authoring and API contract reconciliation

Date: 2026-11-21
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Branch: `work/production-source-audit`
Supabase Production: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Source changes

- `flame-chick-catalog` now prefers `SUPABASE_SECRET_KEYS` (`default` or first key), then `SUPABASE_SECRET_KEY`, then the legacy `SUPABASE_SERVICE_ROLE_KEY` fallback.
- Order API RPC names are now `flame_chick_create_order`, `flame_chick_update_order_status`, and `flame_chick_check_website_order_rate_limit`.
- Delivery API RPC names are now `flame_chick_manage_delivery`, `flame_chick_get_rider_push_config`, `flame_chick_verify_delivery_push_webhook`, `flame_chick_accept_delivery_offer`, and `flame_chick_decline_delivery_offer`.
- Removed HFP identifiers from Admin/POS/Rider/Website runtime source; website's inactive historical script was deleted and browser storage keys were namespaced for Flame Chick.

## Catalog design reconciliation

See `docs/architecture/catalog-authoring-v1-reconciliation.md`.

Key rules:
- Preserve current Website/POS/Admin DTO fields during V1 rather than introducing incompatible generic column names.
- Add explicit category kind (`menu` / `deal`) instead of magic legacy category IDs.
- Keep unpriced draft variant price as NULL, distinct from deliberate zero price.
- Use same-restaurant composite foreign keys and RLS with no direct anon/authenticated table policies.
- Move all Admin catalog writes behind authenticated Admin/Owner server commands; public catalog endpoint exposes only published snapshots.
- Keep branch availability overlays separate from restaurant-wide base prices.
- Keep GST/tax deferred; unresolved flavor and schedule rules are not silently inferred.

## Not implemented / not deployed

- No catalog tables or business data exist in Production yet.
- No catalog authoring migration has been applied.
- `flame-chick-catalog` remains read-only and undeployed.
- Order and delivery RPC names are source contracts only; corresponding SQL RPCs are not present in the applied migrations.
- Admin dashboard and POS delivery-reassignment RPC names are also not implemented yet.
- Edge Function static Deno check workflow is prepared, but no successful run is recorded yet.
- No Edge Function secrets, custom domains, Vercel deployment, or Production environment configuration were changed.

## Static CI evidence

- Admin checks passed: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881645889
- Website checks passed: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881563119
- POS/Rider checks passed: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44881805138

## Next implementation

Prepare the base catalog authoring migration for categories, subcategories, products, variants, modifier groups, modifiers, assignments, modifier price rules and drink options; then implement authenticated draft reads/mutations in `flame-chick-catalog`. Do not apply the migration or enable writes until the schema/commands and rollback plan are reviewed and separately approved.
