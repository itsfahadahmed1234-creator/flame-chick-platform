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
