# Flame Chick — New-chat continuation handoff (2026-11-23)


## LATEST CHECKPOINT — 2026-11-23: production integration audit completed

**Audit report:** [docs/handoffs/2026-11-23-production-integration-audit.md](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/blob/work/production-source-audit/docs/handoffs/2026-11-23-production-integration-audit.md)

**Result: NO-GO for full production deployment.** The read-only audit is complete. Supabase is healthy and the catalog schema/authoring foundation is applied, but this is not yet an end-to-end live system.

Critical verified blockers:
- Production has no order/delivery/rider tables or required order/delivery RPCs; those APIs are not deployed.
- Production public catalog RPC is the old version without `databaseNow`; repository migration candidate `20261122174500_flame_chick_catalog_database_time_metadata_v1.sql` is not applied. Its exact-source/security preflight SHA matches live Production.
- Only `flame-chick-staff-admin` version 1 is deployed. Repository catalog actions are not in that deployed version.
- Website homepage still loads V2 catalog client and has old hardcoded menu mapping/fallback. V3 is only on the separate synthetic/non-ordering preview page.
- Current POS/Rider clients query old role/table shapes directly; production intentionally has no app-role table grants and uses `user_roles.role_key`, not `role`. Order/delivery data tables do not exist.
- POS has unfiltered delivery offer/assignment Postgres Changes subscriptions; Rider uses Postgres Changes and a two-minute Edge Function heartbeat. No business Realtime tables or private-message policies exist.
- No Storage buckets exist; leaked-password protection is disabled.
- Connected Vercel workspace exposes only HFP team `fahad-7455`, with no Flame Chick projects. Do not deploy Flame Chick there; reauthorize the intended Flame Chick Vercel team.

No production SQL write, migration, seed, Auth change, Storage/Realtime setup, Edge Function deployment, secret change, Vercel deployment, domain/alias change, menu publication or checkout activation was performed. Documentation-only commits were made on `work/production-source-audit`; `main` remains untouched.

**Time expectation:** A safe full-system deployment cannot be completed within three hours from this audited state. The missing order/delivery backend, client migrations, end-to-end tests, new menu input, and release/recovery setup are substantive implementation phases. Do not shortcut them or deploy partial functionality as if it were complete.

**Next action:** proceed with source-only implementation starting at the catalog timestamp/credential contract, then V3 storefront integration and order backend; build delivery/POS/Rider and full release gates afterward. Production changes remain separately gated by explicit approval.

---


## LATEST OVERRIDE — 2026-11-23: newly published menu is now the target catalog

The user has clarified an important change in the restaurant's menu plan:

- Previously, the restaurant had two menus: one already running and a second/upcoming menu.
- The restaurant has now published the previously upcoming menu.
- **The newly published menu is now the authoritative/current menu to implement for Flame Chick.**
- The formerly running/older menu is superseded for operational catalog purposes. Do not import it, use it as a fallback, merge it into the new catalog, or treat its old-only items as products to retain in the target menu.
- The 2026-11-21 current-vs-upcoming comparison and menu reconciliation remain useful historical records of what was known then, but their old distinction ("current menu = compatibility baseline; upcoming menu = future target") is superseded by this update. Do not treat that comparison as the final authoritative content of the now-published menu.
- The user will provide the actual new published catalog/menu material when the project reaches the stage where catalog details must be entered/seeded. Do not ask for it prematurely or reconstruct the target menu from the old menu, historical screenshots, synthetic preview fixture, or legacy hardcoded website data.
- Until the user supplies the new menu, do not seed menu rows, create guessed catalog values, publish a catalog, or enable ordering. Keep the production catalog empty. The V3 schema/preview remains structural work only; its synthetic sample is not restaurant data.
- When menu entry is next required, use only the newly supplied published menu as the source, then reconcile exact names, categories, variants, prices, modifiers, deal choices, schedules and unresolved facts before any controlled data-entry plan. Do not silently carry over assumptions from the older reconciliation.

### Latest CI verification — 2026-11-23

GitHub Actions **Flame Chick Website Static Checks**, run [45116517717](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45116517717), completed with conclusion **success** on branch `work/production-source-audit`, exact head commit `96c44121eececa3d7947a406ad5d21a35f6bbe41`. The `static-checks` job succeeded, including active JavaScript syntax, core catalog regression tests, V3 preview regression tests and website inline-script parsing. This is source CI only; it is not a live catalog integration test or release/deployment approval.

No catalog was added to Supabase, and no production deployment or production write was performed as part of this check or handoff update.

---

**Purpose:** This file is the compact, current entry point for the next ChatGPT conversation. Read it together with the root `PROJECT_HANDOFF.md`, which holds the longer project history, architecture decisions, schema contracts, security posture, and previous approvals. Do not restart the project or ask the user to repeat information already recorded there.

**Current stopping point:** The isolated V3 synthetic catalog preview has passed its full local test suite and the user-facing smoke tests. The agreed next work is a read-only production catalog integration audit. No production deployment or Supabase write was performed in this session.

## 1. Exact source identity — do not guess or abbreviate

- GitHub repository owner: `itsfahadahmed1234-creator`
- Repository: `flame-chick-platform`
- Exact repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Active working branch: `work/production-source-audit`
- Default branch: `main` — **leave it untouched** unless the user explicitly authorizes a change.
- Verified archive/source commit: `95fca5b825ff05d88899b4d13855a95f1e0f850e`
- Commit message: `test: isolate optional and required deal group mappings`
- Source archive link: https://github.com/itsfahadahmed1234-creator/flame-chick-platform/archive/95fca5b825ff05d88899b4d13855a95f1e0f850e.zip
- GitHub Actions run for that exact commit: [Flame Chick Website Static Checks — run 45107009218](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45107009218). GitHub run metadata verified: branch `work/production-source-audit`, head SHA exactly `95fca5b825ff05d88899b4d13855a95f1e0f850e`, status `completed`, conclusion `success`.

**Critical spelling guardrail:** The owner slug contains `itsfahad + ahmed + 1234-creator`. Never use shortened or guessed variants. Before GitHub writes, verify the exact full repository and fetch the current file from the exact working branch; use the returned blob SHA. Do not write to `main`.

## 2. Exact local folder and preview command

The user extracted the verified commit archive into this folder:

```text
C:\Users\fahad\Music\flame-chick-platform-95fca5b825ff05d88899b4d13855a95f1e0f850e\flame-chick-platform-95fca5b825ff05d88899b4d13855a95f1e0f850e
```

The user's Command Prompt was left inside that folder after running the tests. From the repository root, the local-only preview server is started with:

```cmd
node ".\\scripts\\local-catalog-preview-fixture.mjs"
```

Open:

```text
http://127.0.0.1:4179/catalog-preview
```

This is a **local synthetic fixture**, not the live Supabase catalog. The local harness is deliberately bound to IPv4 loopback and uses synthetic fixture data; it does not make production catalog requests, create orders, write to Supabase, or deploy anything. Keep the older Downloads project folder as a backup; do not continue work in the old, out-of-sync extracted folder.

There is no `package.json` at the root. Use Node's built-in test runner directly; do not invent npm scripts or create a package file just to run tests.

## 3. Latest verified results — 2026-11-23

### Full automated test suite

From the new Music-folder archive root, the user ran:

```cmd
node --test
```

Final output:

- `# tests 136`
- `# pass 136`
- `# fail 0`
- `# cancelled 0`
- `# skipped 0`
- Duration approximately 1.66 seconds.

The matching GitHub Actions Website Static Checks workflow also completed successfully on the same commit (run 45107009218). This is the source snapshot to use for continuation.

### Browser smoke tests in the new archive

The user confirmed all of the following in the local synthetic preview:

1. Preview server opened and catalog items displayed.
2. Clicking **Reload catalog** caused the catalog items to appear again; branch/fulfilment selection and preview rendering recovered.
3. **Pickup** displayed the menu items.
4. Burger Meal deal validation succeeded with the Regular variant, Classic Burger — Regular, Cola — 500 ml, and optional Extra Cheese omitted.
5. Successful message: “Deal choices validated locally. No quote was requested and no order was created.”

The deal configurator's required-choice behaviour was also tested: incomplete required selections kept validation disabled. Extra Cheese is optional and can be omitted.

### Important older-folder mismatch

The older Downloads-folder copy produced 125 passes and 10 failures when the user ran `node --test`. Its tests/fixtures were out of sync with the current source snapshot. The user then extracted commit `95fca5b...` into the Music folder and the matching suite passed 136/136. **Do not try to patch the old folder's 10 failures or mix files between the two folders.** Continue only from the Music-folder archive / matching working-branch source.

## 4. What this preview milestone does — and does not — prove

The new standalone page is a non-ordering V3 catalog preview. It renders catalog products/deals from the validated synthetic V3 fixture, supports branch/fulfilment selection and Reload, and validates deal selections locally. It deliberately has no add-to-cart, checkout, quote, or order submission flow and does not compute authoritative totals.

A `noindex` directive is not access control. Do not describe this page as a protected Admin preview or enter secrets into it. Preview deployment was not enabled. The existing customer storefront and its hidden-menu safety gate were not changed by this preview work.

**Do not confuse these successful synthetic tests with a live Supabase integration test, production readiness, or a deployment approval.**

## 5. Project invariants and user-approved decisions to preserve

Read the root `PROJECT_HANDOFF.md` for full evidence and history. These are the critical operating constraints:

- Flame Chick is the active project. Pizza Bite is legacy/reference material only; do not import old Pizza Bite menu/configuration into Flame Chick.
- The operational website menu must be database-driven. Categories, products, variants, prices, modifiers, deals, schedules, branch availability and fulfilment rules must come from the current immutable published V3 catalog. Do not hardcode operational product/menu/pricing data in website source.
- Admin/Owner author draft catalog changes through secure database commands. Publication produces an immutable snapshot. The public website reads only the current published snapshot; no draft-table or legacy/hardcoded fallback.
- Browser-displayed prices are informational only. A trusted server-side quote/order API must independently validate publication/version, stable IDs, branch, fulfilment, availability, schedules, modifiers/deal rules and recalculate every amount. No browser-calculated total is authoritative.
- Never expose the Supabase secret/service key in a browser, website bundle, POS or Rider app. Public clients use only the publishable/anon key as appropriate; privileged operations use authenticated server-side code and database authorization.
- RLS remains deny-by-default. Do not loosen table grants or policies for legacy UI compatibility. Every command must verify actor/tenant/branch/role in the database, use atomic transactions, revision/idempotency protections and audit where specified.
- Admin and Owner are separate restaurant-wide full-authority roles. The user's Admin account is the Admin identity; do not assign Owner to that account. A separate Owner identity is to be added later. Manager, Cashier and Rider remain branch-scoped with their previously defined restrictions. Preserve the detailed matrix in `PROJECT_HANDOFF.md`; never broaden operational-role permissions.
- Keep the Supabase Flame Chick project on Free tier and Mumbai `ap-south-1`. Do not upgrade, create another project, migrate region, or incur paid services without explicit approval.
- GST is deliberately deferred. Do not add GST rules or make assumptions about inclusive/exclusive display without explicit owner confirmation.
- Website order rate limits are a Website-only concern and must be enforced atomically server-side at the approved limits recorded in `PROJECT_HANDOFF.md`. Do not impose those Website limits on POS orders.
- Do not seed guessed menu values or resolve unresolved deal choices, time windows, product attributes, portion/volume facts or TBD prices by assumption. Use the current menu reconciliation documents in `docs/handoffs` and ask only when a genuinely unresolved owner decision blocks the next step.
- Protect production: no migration, seed, Edge Function deploy, Vercel deploy, domain/alias change, menu publication or checkout enablement without a separate review and explicit approval. Do not infer approval from a successful local test or CI run.

## 6. Agreed next task: read-only production catalog integration audit

The conversation stopped immediately before this audit. Start here; do not jump to deploying or wiring checkout.

1. Re-read this handoff and the root `PROJECT_HANDOFF.md`, especially the source/schema reconciliation, V3 public catalog client, catalog Edge Function, publication compiler/validator, current database migration state, security constraints and outstanding menu facts.
2. Verify the exact current branch head and working tree/source snapshot. Use only `work/production-source-audit`; keep `main` untouched. The local Music archive is pinned to commit `95fca5b...`.
3. Audit the complete catalog read path from database to browser: publication tables/current pointer → compiler/hash validation → read RPC → catalog Edge Function → health/catalog metadata → V3 browser client → contract validator → branch/fulfilment selector → product/deal view-models → UI.
4. Read the live intended Flame Chick Supabase project **read-only** to confirm current migration ledger, deployed functions, published catalog pointer and actual schema/security state. Do not perform writes. Do not assume historical handoff values are still current without re-checking.
5. Compare actual request/response DTOs and schema versions end-to-end. Identify exact gaps, stale code or integration risks. Verify that no legacy V2/hardcoded menu fallback can become visible and that errors/unpublished state fail closed.
6. Produce a small evidence-backed findings/gap list and a sequenced implementation plan. Do not start production modifications until the audit is complete and reviewed.

### Upcoming controlled phases after the audit

- **Catalog authoring and publication:** secure Admin/Owner catalog command RPCs, atomic draft mutations, optimistic revision checks, idempotency, audit trail, schedule/deal validation, immutable snapshot compiler, current-publication pointer, role/branch checks and Admin UI integration. Keep catalog editing/publishing disabled until the command path is complete.
- **Public catalog integration:** reconcile the V3 client and Edge Function DTO with the applied schema; connect the existing website to the published catalog behind a disabled-by-default gate; branch/fulfilment selection, dynamic products/variants/modifiers/deals/schedules, media handling and robust fail-closed loading. Do not expose the menu or replace the legacy hidden-menu guard until end-to-end tests and explicit approval.
- **Order and quote API:** server-side authoritative pricing, deal/modifier validation, atomic quote/submit, idempotency, cancellation/audit, and Website-only atomic rate limits. POS must use its own permitted path and not be subject to Website guest limits.
- **POS, delivery and Rider:** implement missing order/delivery/Rider schema and atomic commands; secure rider offer assignment/isolation, return/failure confirmation, and event lifecycle according to the existing architecture. Rider can only access their own assigned offers.
- **Realtime:** private branch-scoped POS topics and private per-rider topics, authenticated authorization, minimal event payloads and client refetch; no unfiltered Postgres Changes or frequent polling. Respect Free-tier message/connection/egress limits.
- **Staging and release:** disposable migration-chain and recovery rehearsal, RLS/ACL/tenant isolation, role-boundary, idempotency/race, DTO contract, browser, reconnect and end-to-end tests; then separately reviewed backup/release plan and explicit approval before any production changes.

## 7. How the next assistant should work

- Treat this file as the latest session state, and the root `PROJECT_HANDOFF.md` as the long-form project source of truth. Older entries are history; apply the newest dated/explicit override where notes differ.
- Do not claim to have inspected or changed the user's local files unless the user provides output or an available tool verifies it. Do not claim a production change happened when only a synthetic preview or static test was run.
- Be meticulous with repository, branch, file paths, source versions and commands. Verify before issuing a copy/replace command. Never give a command with a guessed nested folder path.
- The user prefers concise, step-by-step guidance: one concrete action/command at a time, then wait for the result. Avoid repeating already completed steps, typo-prone commands and unnecessary downloads.
- If a command fails, diagnose the actual path/context first; do not ask the user to repeat details already provided.
- Do not ask the user to re-explain the project. Begin by acknowledging this exact checkpoint and proceed with the read-only catalog integration audit.

**Current status at handoff:** 136/136 local tests passed; GitHub Actions run 45107009218 passed on commit `95fca5b...`; local synthetic Reload/Pickup/deal preview smoke tests passed; production catalog integration audit not yet started; no production/Supabase write or deployment occurred in this session.


## LATEST MENU DECISION OVERRIDE — 2026-11-23


Apply these decisions over any older handoff statements:

- Whole Chicken Broast consists of three **separate products**, not flavour variants: Simple Injected Rs.2,499; Nashville Rs.2,699; Cheetos Butter Rs.2,799.
- GST system is deferred. Do not build tax schema/fields, rates, calculations, rounding or checkout tax logic. The previously requested GST notice under the large MENU heading is display copy only; it does not authorize a GST system.
- Deals: Flame Hour Injector + Rs.120 Cold Drink Rs.699; Flame Hour Quarter Broast + OG Crunch + Rs.120 Cold Drink Rs.1,599; Flame Duo 2 OG Crunch + Quarter Broast + two Rs.120 Cold Drinks Rs.2,099; Flame Feast Half Broast + 3 OG Crunch + restaurant-managed 1L drink Rs.3,599; Mini Flame 6 Classic Nuggets + deal-only Fries + restaurant-managed Juice Rs.399; Little Crunch 6 Classic Nuggets + OG Crunch + deal-only Fries + Rs.120 Cold Drink Rs.999.
- No burger substitution choices in deals. Kids deals use Classic Nuggets. Fries, juice and Flame Feast's 1L drink are deal-only components, not standalone priced products.
- Platter Rs.1,499; leave description blank for restaurant completion. Mini Flame juice and Flame Feast 1L drink details remain restaurant-managed.
- Flame Hour runs daily 3:00–5:00 PM Asia/Karachi. Outside the window keep it visible but grey/disabled, including in its popup; do not hide it.
- The Smash is one product with required popup choice Single Patty Rs.799 or Double Patty Rs.999.
- Preserve production safety: these are catalog design decisions only. Do not write catalog data, publish, deploy, enable ordering or implement GST without separate review and approval.


## CURRENT MENU OVERRIDE — 2026-11-23: approved deal labels, separate broast products, GST deferred

The detailed specification is `docs/handoffs/2026-11-23-newly-published-menu-catalog-spec.md` (commit `e519e42d19978f845fba93d93b992073dcc73902`). It is the menu-preparation source of truth for the newly published menu and supersedes any conflicting earlier menu assumptions.

Latest user decisions:
- Deal descriptions and customer-facing deal component labels must use generic **"Burger"** wherever the deal wording says Burger. Do not replace the printed generic label with "OG Crunch". The fixed internal product mapping remains OG Crunch for Flame Hour's Quarter Broast + Burger, Flame Duo (2 Burgers), and Flame Feast (3 Burgers); there are no selectable burger choices. Little Crunch explicitly names OG Crunch and retains that name. Flame Hour's first deal explicitly uses The Injector.
- Whole Chicken Broast contains three separate products: Simple Injected (Rs. 2,499), Nashville (Rs. 2,699), Cheetos Butter (Rs. 2,799). Do not model them as flavour variants of one product.
- The Smash is one product with required Single Patty (Rs. 799) / Double Patty (Rs. 999) product-popup variant selector.
- GST system is explicitly deferred. Do not add GST schema, calculations, tax inclusion logic or checkout tax processing. No GST work should block menu/catalog preparation.
- Flame Hour runs daily 3 PM–5 PM Asia/Karachi. Outside the schedule it remains visible and greyed out; customers may open read-only details, but all ordering actions are disabled. Trusted backend must independently enforce schedule.
- Kids deals use Classic Nuggets. Mini Flame Juice is restaurant-supplied; Little Crunch drink and Flame Duo drinks are the Rs. 120 Cold Drink. Flame Feast 1L drink is restaurant-supplied and deal-only. Fries and Juice are deal-only; no standalone products/prices or portion selectors.
- Platter remains Rs. 1,499 with blank description until restaurant supplies it.

The V3 deal schema links each component option to an internal product/variant and has a customer-facing `dealComponentGroups.nameEn`. For generic Burger components, keep the fixed OG Crunch product binding and set/display the group label "Burger". The current UI still renders productName + variantLabel and requires manual option selection, and it disables the popup when deal.available=false. These are source implementation gaps to fix and test before the catalog can be entered/published: support fixed preselected/locked deal components, generic group labels, and schedule-closed read-only popup details distinct from orderability. Do not weaken backend validation or use browser clock for schedule enforcement.

No production writes, catalog seed, publication, deployments or checkout activation are authorized by these decisions. Keep Production catalog empty until the supplied menu is converted into a reviewed import plan and a separate write approval is given.


## Latest source checkpoint — fixed deal preview rules implemented (2026-11-23)

Detailed menu rules and source changes: `docs/handoffs/2026-11-23-newly-published-menu-catalog-spec.md`.

- Customer-facing generic deal wording remains **Burger**. For Flame Hour Quarter Broast + Burger, Flame Duo (2 Burgers), and Flame Feast (3 Burgers), the published component group label is "Burger" while the exact component option is internally bound to OG Crunch. No burger substitutions or choices. Little Crunch explicitly says OG Crunch and stays named OG Crunch.
- Three Whole Chicken Broast products are separate products, not flavours/variants. The Smash is one product with required Single/Double Patty variants.
- GST system deferred entirely.
- V3 deal view now separates branch eligibility from orderability. A scheduled deal remains visible and grey when out of schedule; its details can open read-only while ordering actions remain disabled. Fixed one-option deal component groups are preselected/locked; generic single-option display uses the customer-facing group label.
- Regression tests cover the new behaviour.

CI [run 45124549443](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45124549443) passed on exact commit `9b3698f0e03f00f5999bf1090d662c70db53b42b` (syntax, core catalog tests, preview tests, inline script parsing).

These changes affect only source and the isolated non-ordering preview. The live customer storefront remains V2/legacy, Production catalog remains empty, and no database write, migration, publication, deployment or checkout enablement occurred. Next: verify required product-popup variant selection and manually smoke-test the preview before any menu import preparation.


## Additional catalog blockers discovered — 2026-11-23

The catalog specification identifies a schema/validator mismatch for deal-only items. Production table constraints allow nullable `product_variants.price`, but the V3 snapshot validator requires every variant price to be non-null and publication validation rejects any active variant with NULL price. Fries, Juice, Flame Feast's restaurant-supplied 1L drink and the 6-piece Classic Nuggets deal portion have no standalone menu prices. Do not invent a zero price. Before catalog entry, make a narrowly scoped source/migration change: allow NULL only for non-standalone variants referenced exclusively by active deal component mappings with INCLUDED pricing; keep standalone variants price-required and reject unreferenced/surcharge/standalone null-price variants. Update validator, publication validation and preview mapping, with tests. No Production migration has been applied.

The current V3 preview displays product variant selection inline on cards, not in a product popup. The required Smash Single/Double popup selection is therefore not yet implemented. Build/test the accessible product detail popup (or approved equivalent) before storefront cutover. The full menu specification records this.

Latest source CI remains run 45124549443 success on `9b3698f0e03f00f5999bf1090d662c70db53b42b`. Documentation commits after that do not change runtime code. Production remains untouched.

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
3. Implement the narrow NULL-price rule for deal-only variants with INCLUDED treatment only, consistently in SQL publication validation and the TypeScript snapshot validator. Standalone, orphaned, and surcharge-priced NULL variants must fail closed. Preserve all existing RLS, grants and immutable snapshot guarantees.
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

### Final strict publication-validation gate — passed

The follow-up [local Supabase QA run 45139264349](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45139264349), head `37bd8557be42a6c1e6bfd70896742a24c508d085`, completed successfully.
- Full migration replay passed.
- Real authenticated importer and deal read-back passed.
- Compiled database snapshot passed the V3 snapshot contract.
- SQL publication validator returned `ok: true` with **zero errors**.
- Second full import made **zero mutations** and did not increment the draft revision.
- No publication rows were created.
- Disposable local Supabase stack stopped successfully.

The earlier `45139118409` attempt failed only at the QA script syntax check due a literal escaped-newline formatting typo; the source was corrected before the successful run.

### Safe boundary remains unchanged

This successful real-DB integration was local/disposable only. No Production migration, product/category/deal writes, catalog publication, Edge Function deployment, Admin website deployment, customer website deployment or checkout activation occurred. Production catalog remains empty and unpublished. The Admin import button is source-only and not available in the deployed version until separate review and approval. GST remains deferred; current deals remain fixed and use INCLUDED/zero surcharge only.


## Admin menu-import action integration QA — 2026-11-23

### What was added

- Extended `scripts/qa-catalog-v3-importer-db.mjs` to load the actual `apps/flame-chick-admin/catalog-v3-admin.js` workspace module and invoke its registered Import button handler.
- The test serves the exact review-only JSON draft through a same-origin fetch stub and uses the normal authenticated catalog RPC request handler against disposable local Supabase.
- First interaction dismisses the confirmation; the test asserts **zero catalog mutation RPCs** were issued.
- Second interaction confirms and runs the import through the Admin workspace's actual `importPublishedMenuDraft()` path. Assertions require successful read-back, explicit unpublished state, and confirmation copy stating that publication and selectable +price upgrades are not performed.
- Existing follow-up assertions continue to validate the compiled snapshot, strict SQL publication validator, zero validation errors, exact menu/deal mappings, and retry idempotency.
- The importer QA workflow now includes `catalog-v3-admin.js` as a trigger and verifies the workspace module and `createWorkspace` test hook are present.

### Verification

- Run **45140258871** passed on script commit `2afcb6a3c03e9ccc25a5a2811b44ebce0d6aaaac`. Full migration replay, Admin workspace cancellation/confirmation path, actual authenticated importer, database snapshot validation, strict SQL publication validation, retry idempotency and local stack cleanup all passed.
- The run again observed transient Docker image-registry `toomanyrequests` messages during startup; it recovered and the run passed. This is runner infrastructure rate limiting, not an application/database failure.
- Latest workflow-only commit `afc1540e9ad41738c9d837bc79a4ca4098831d28` passed in run **45140263708**. The complete migration replay, Admin workspace action integration, authenticated importer, snapshot contract, strict SQL publication validation (zero errors), idempotent retry and disposable-stack cleanup all passed. The only later commits are documentation updates.
- This is a **module-level workspace interaction test with a mocked root element and same-origin draft fetch**, not a full Chromium/real-browser E2E test. Browser rendering/navigation and a real authenticated Admin session remain separate QA work.

### Current safe boundary

All Admin action and database integration checks above target disposable local Supabase. No Production catalog writes, Production migration, publication/current-pointer change, Edge Function deployment, Admin or customer Website deployment, Vercel domain change, or checkout activation occurred. The only Git writes were to `work/production-source-audit`; `main` was not written. Current deals remain fixed-price with INCLUDED/zero-surcharge mappings; selectable product/flavour upgrades and +price charges remain future-only. GST remains deferred.
