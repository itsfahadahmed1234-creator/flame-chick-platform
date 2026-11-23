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

## Real local Supabase Catalog V3 importer integration — passed (2026-11-23)

The review-only menu importer has now passed a real PostgreSQL integration run using the complete migration chain and the actual finite Staff Admin catalog RPC map. This was executed only against the workflow's disposable local Supabase stack.

**Passing run:** [QA Flame Chick Catalog V3 Menu Importer run 45138765293](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45138765293), head `7b6c84218e81c8b24f369c8b1acc92385acf8d08`, conclusion success.

### What the run actually did

- Started a fresh local Supabase stack, installed the hosted-only helper compatibility stub used by previous local QA, and applied the complete migration history with `supabase migration up --local`.
- Created a disposable local tenant and synthetic Admin identity. Each read/write was routed through `buildCatalogRpcCall` from `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs` and invoked as Postgres role `authenticated` with transaction-local JWT subject/role claims. No service-role shortcut was used for catalog commands.
- Ran the importer end-to-end through all 39 progress steps: 8 categories, 25 products (23 standalone variants + 5 deal-only variants; 28 variants total), one Deals collection, one Flame Hour schedule, and six fixed deals/offers with 18 component groups/options/mappings.
- Read back every product and deal and confirmed the six deals and six deal variants were active only after exact component and price verification.
- Verified the generic Burger product and Little Crunch's explicitly named OG Crunch link separately.
- Confirmed 5 nullable, non-standalone deal-only variants and 0 nullable standalone variants.
- Confirmed 2 Flame Hour schedule assignments and 7 daily schedule windows.
- Confirmed 0 non-INCLUDED/surcharge component mappings, 0 publication rows, and no catalog current-publication pointer was changed.
- Compiled the catalog from the database and validated the V3 schema after adding a QA-only publication envelope in memory (checksum is generated by Postgres using the same canonical `jsonb::text` SHA-256 procedure as the publish path; the synthetic publication UUID/number are not written to the database).
- The V3 snapshot contract returned `ok: true`.
- Ran the importer a second time: **0 additional mutations**, unchanged draft revision and row counts. The command idempotency table stayed at 61 records from the first 61 mutations.
- Discarded the local Supabase stack with `supabase stop --no-backup`; cleanup step passed.

### Logged database counts from the passing run

- Categories: 8
- Products: 25
- Product variants: 28
- Deals / deal variants: 6 / 6
- Component groups / options / mappings: 18 / 18 / 18
- Deal-only NULL-price variants: 5
- Standalone NULL-price variants: 0
- Active deals / active deal variants: 6 / 6
- Schedule sets / windows / assignments: 1 / 7 / 2
- Included-surcharge violations: 0
- Publication rows: 0
- First-run catalog writes / reads: 61 / 95
- Second-run mutation count: 0

### Additional strict gate in progress at handoff update time

A follow-up run `45139264349` adds an assertion that the SQL publication validator must return `ok: true` with exactly zero errors, not just absence of the two deal-only pricing errors. An initial attempt `45139118409` stopped at Node syntax-check before starting Supabase due a formatting typo in the QA summary; that typo is fixed in the current source. At handoff update time, `45139264349` is still in local Supabase startup with no failure reported. Do not mark this stricter gate as passed until that run completes successfully.

### Safe boundary remains unchanged

This successful real-DB integration was local/disposable only. No Production migration, product/category/deal writes, catalog publication, Edge Function deployment, Admin website deployment, customer website deployment or checkout activation occurred. Production catalog remains empty and unpublished. The Admin import button is source-only and not available in the deployed version until separate review and approval. GST remains deferred; current deals remain fixed and use INCLUDED/zero surcharge only.

