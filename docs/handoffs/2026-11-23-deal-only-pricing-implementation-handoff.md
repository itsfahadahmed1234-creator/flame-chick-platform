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

## Verification status / next steps

**Not yet verified as passing.** The source commits and regression fixtures have been created, but a complete CI/local disposable migration-chain run has not been confirmed in this handoff. Do not describe this implementation as production-ready until:
1. Run the full website static checks and contract/deal/view tests.
2. Run the complete local Supabase migration chain from an empty disposable database.
3. Run `supabase/tests/catalog_publication_validation_fixes_v1.sql` and the existing forward-compensation/recovery fixture; verify the migration ledger and test tenant are clean.
4. Review the final SQL diff, including function owner, SECURITY DEFINER, empty search_path and ACL preservation.
5. Review the final snapshot shape and ensure nullable variant price is only allowed for correctly mapped non-standalone variants.
6. Update all project handoffs with final CI run IDs/results.

## Production boundary

No Production SQL or migration was applied. No catalog products, variants, deals, or publication data were inserted. No catalog was published. No Edge Function, website or Vercel deployment occurred. Checkout remains disabled. Do not apply this migration or import the menu without a separate explicit review and approval.

GST remains deferred. Current menu deal choices remain fixed. Future selectable product/flavour/surcharge functionality is not enabled now.
