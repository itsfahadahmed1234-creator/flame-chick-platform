# Deal-only product pricing implementation handoff — 2026-11-23

## Scope and explicit user decision

Implement the existing linked product/variant deal model. Do not create a text-only deal contents table.

**Current menu scope:** every currently published Flame Chick deal remains a fixed bundle with its own fixed base price and fixed, locked component composition. No customer-selectable products, flavours, optional upgrades, or +price choices are to be enabled now.

**Pricing rule:** component product prices are not automatically added to the deal. Current deal contents use `INCLUDED`; the deal variant's `base_price` is the bundle price. A future Admin-configured `SURCHARGE` may add only the explicit deal-specific `unit_surcharge`, never the product's normal standalone price. This future capability is represented in validation but is not activated in current deal data or customer UI.

**Product visibility:** deal-only variants have `is_standalone_sellable=false`, remain linked by product and variant IDs to deal component options, and are excluded from standalone product choices. Standalone variants still require their own price.

## Source implementation on `work/production-source-audit`

- `supabase/migrations/20261123150000_flame_chick_deal_only_variant_pricing_v1.sql`
  - Commit: `7bf650d970fea5f1dcffd9ebb8af3754c9050e11`
  - Append-only candidate migration; source-only. Preflights the exact current validator/compiler source hashes and validator security metadata before replacing the publication validator.
  - Keeps `ACTIVE_VARIANT_PRICE_MISSING` for active standalone-sellable variants.
  - Adds `DEAL_ONLY_VARIANT_NOT_MAPPED`: active non-standalone variants must have an active component option and active deal-variant mapping with `INCLUDED` or `SURCHARGE` treatment.
  - Does not change product editor commands, deal schema, compiler, role grants, RLS, or live database.
- `apps/flame-chick-website/js/catalog-v3.js`
  - Commit: `a93c22fd8d541af1f290a37563e8a33e75781957`
  - Snapshot contract accepts `price: null` and rejects it for standalone-sellable variants.
  - Adds the matching active deal mapping requirement for non-standalone variants.
  - Rejects a non-standalone variant mapped only with `STANDALONE` treatment.
- `tests/catalog-v3-contract.test.mjs`
  - Commit: `b0820c446a6b77875281529eb862652c36f263bd`
  - Adds tests for nullable deal-only variants with `INCLUDED` and future `SURCHARGE`, standalone null-price rejection, orphan rejection, and `STANDALONE` treatment rejection.
- `supabase/tests/catalog_publication_validation_fixes_v1.sql`
  - Commits: `03deca603941c54a683b2408fdbd8d4cfe90b462`, then `ed63bfb182c6148cb99a041036976baedf2a960b`
  - Rollback-only fixture exercises nullable deal-only variant inclusion, future explicit surcharge validation, snapshot serialization of null price and rejection after the active mapping is removed.
  - Deal-only test product is isolated from existing BY_SIZE modifier assignments so the fixture tests only the intended pricing rule.
- `.github/workflows/ci-website-static.yml`
  - Commit: `f2be564061106d78320c776427fb04eaef4ff0ec`
  - Includes the candidate migration in website/catalog CI path filters.
- `.github/workflows/qa-catalog-publication-validation-fixes-v1.yml`
  - Commit: `2b20ac3cb4b00fc104dad4ff33e5628426e39dc5`
  - Adds source/fixture assertions for the deal-only pricing candidate to the disposable local migration-chain QA.

## Important existing behavior retained

- The V3 menu view already filters out variants where `standaloneSellable !== true`; a product with no standalone-sellable variants is not shown as a standalone menu product.
- The deal view exposes the deal variant base price separately from component pricing. It only resolves standalone product price for `STANDALONE` treatment. `INCLUDED` and `SURCHARGE` do not inherit component standalone prices.
- The configurator emits IDs and quantities, not a browser-calculated total. The current fixed groups remain auto-selected and locked. No optional selector has been introduced.
- Current menu data still must use fixed component groups and `INCLUDED` mappings only.

## Verification status — passed in disposable CI (2026-11-23)

**Status: VERIFIED** Source implementation and database QA are now passing on `work/production-source-audit`.

### Final automated checks

- **Website Static Checks:** [run 45128810592](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128810592), head `c03a08c152013cd6f73715809294adb4db52cab7`, success.
  - JavaScript syntax checks passed.
  - Core catalog contract/client/view/deal-view/configurator/branch/time tests passed.
  - Preview regression tests passed.
  - Inline website and preview scripts parsed successfully.
- **Disposable Supabase migration-chain QA:** [run 45128650772](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45128650772), head `2d1ffdbb1452016a7f5605ca5bfd90dc2c98bbc1`, success.
  - Full migration history applied to a fresh local disposable Supabase stack.
  - Deal-only nullable-price publication fixture passed.
  - Standalone NULL-price rejection passed.
  - Future-only explicit `SURCHARGE` compatibility check passed, with the mapping restored to `INCLUDED` before fixture completion.
  - Snapshot compiler serialized the deal-only `price: null` and `standaloneSellable: false` correctly.
  - Unmapped non-standalone variant was rejected.
  - Forward compensation restored the original validator/compiler source hashes and preserved helper security metadata.
  - Test tenant was rolled back/absent and the migration ledger count matched the complete migration file count.
  - Disposable Supabase stack shut down successfully.

### Source implementation

- `supabase/migrations/20261123150000_flame_chick_deal_only_variant_pricing_v1.sql`
  - Uses exact pre-migration validator/compiler source hashes from the post-2026-11-22 baseline.
  - Preflights both helpers' security metadata before replacement.
  - Keeps active standalone-sellable variants price-required.
  - Requires every active non-standalone variant to be mapped by an active deal option and active deal-variant mapping.
  - Allows that deal-only mapping to use `INCLUDED` now or explicit `SURCHARGE` as future-only compatibility. No current menu choice is configured as surcharge.
- `apps/flame-chick-website/js/catalog-v3.js`
  - Snapshot schema accepts nullable variant price, but rejects NULL for standalone-sellable variants and rejects non-standalone variants without a valid active INCLUDED/SURCHARGE deal mapping or with only STANDALONE treatment.
- `supabase/tests/catalog_publication_validation_fixes_v1.sql`
  - Rollback-only fixture covers mapped deal-only NULL price, explicit future surcharge mapping, standalone NULL-price rejection, snapshot serialization and orphan rejection.
- `tests/catalog-v3-contract.test.mjs`, `tests/catalog-v3-view.test.mjs`, `tests/catalog-v3-deal-view.test.mjs`
  - Cover nullable deal-only snapshot validation, standalone exclusion from the menu, fixed deal price independence from the component's normal product price and deal popup resolution of NULL-priced included components.
- `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql`
  - Updated its source-hash guard to recognize this new candidate validator; the restored end state still verifies the previous validator/compiler source hashes.
- `.github/workflows/qa-catalog-publication-validation-fixes-v1.yml`
  - Includes the recovery-script path in its trigger and checks the reviewed candidate hash.

### Confirmed current menu rule

All currently published deal components remain fixed and use `INCLUDED`; each deal uses its own single printed `base_price`. The future `SURCHARGE` compatibility is not a current customer selector and must not be configured in the six current deals. Generic Burger is a separate deal-only product (not OG Crunch); OG Crunch is used as a named standalone product only in Little Crunch.

## Remaining implementation stages

1. Prepare a reviewed V3 catalog draft/import package for the standalone menu and all six fixed deals, including the deal-only Burger, Classic Nuggets (6 pcs), Fries, Juice and 1L Drink records. Do not seed Production.
2. Build/integrate the Admin catalog authoring surface with the new secured V3 catalog command API. The existing `apps/flame-chick-admin/app.js` still references legacy `deal_components`/`bundle_price` paths and required product-price inputs; do not treat that legacy UI as the V3 deal-only catalog editor.
3. Add an end-to-end synthetic snapshot/preview fixture for all six actual deals and verify exact IDs, quantities, fixed prices, generic Burger display vs OG Crunch, Flame Hour schedule and read-only behavior.
4. Separately implement and test The Smash's required product detail popup before any storefront cutover.
5. Only after separate review/approval may a production migration be applied, catalog draft rows entered, a catalog published, or any deployment/checkout activation be considered.


## Production boundary

No Production SQL or migration was applied. No catalog products, variants, deals, or publication data were inserted. No catalog was published. No Edge Function, website or Vercel deployment occurred. Checkout remains disabled. Do not apply this migration or import the menu without a separate explicit review and approval.

GST remains deferred. Current menu deal choices remain fixed. Future selectable product/flavour/surcharge functionality is not enabled now.
