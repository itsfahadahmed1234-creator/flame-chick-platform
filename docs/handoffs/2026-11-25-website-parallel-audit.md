# Flame Chick Website — Parallel Development Audit (2026-11-25)

## Isolation and source identity

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Website-only branch: `work/website-parallel-development`
- Base branch: `work/production-source-audit`
- Exact base commit: `c37e3fc9a30f84ba4bf49884e11b13232ef96f60`
- User-provided earlier checkpoint: `1528dc38f3c9acc80285b9430cea51a44ba87241`
- At branch creation, the production/POS branch was two commits ahead of the user checkpoint. Both newer commits changed only `PROJECT_HANDOFF.md` and added the POS History/Delivery/Payment handoff; the Website source was unchanged.
- The new branch was created from the exact current branch HEAD above and verified by reading its Git ref. It did not alter the source branch.
- No Website application source files were changed during this audit. This document is the only intended repository change on this branch at this checkpoint.
- Do not merge, cherry-pick, rebase, reset, or push this work onto `work/production-source-audit` without explicit user approval.

## Scope and safety boundary

This branch is for the existing customer Website only. Do not independently change POS, Admin, Rider, Order API, shared catalogue modules, database schema, migrations, production settings, or deployed Edge Functions. Identify a shared dependency and coordinate it with the Production/POS chat before touching it.

Production is not approved for restaurant-live operations. Do not:
- publish or modify the catalogue;
- insert real orders or payments, or exercise customer checkout against Production;
- change branch delivery/fulfilment settings, staff/roles, Rider settings, Realtime, or order data;
- deploy or replace Supabase Edge Functions;
- promote Preview deployments or alter production aliases;
- expose any server secret in browser code.

GST/tax implementation remains deferred.

## Existing Website architecture

The app is a static HTML/CSS/JavaScript storefront, not a framework application. It should be maintained in place.

Main files:
- `apps/flame-chick-website/index.html` — existing homepage and main V3 storefront, including branch selection, product and deal browsing, item customizers, cart, customer details, verified quote, checkout confirmation, and responsive styling.
- `apps/flame-chick-website/order-online-v3.html` — a separate no-index V3 ordering page with a second rendering of the customer order flow.
- `apps/flame-chick-website/menu.html` — published V3 read-only menu.
- `apps/flame-chick-website/catalog-preview.html` — no-index read-only catalogue preview; not an order-entry page.
- `apps/flame-chick-website/js/config.js` — public API configuration. It contains a publishable key only; no service-role key was found in the browser configuration.
- `js/catalog-v3-client.js`, `js/catalog-v3.js`, `js/catalog-v3-view.js` — public catalogue loading, contract validation and product presentation.
- `js/branch-fulfilment-v3.js` — branch/fulfilment selection.
- `js/catalog-v3-deal-view.js`, `js/catalog-v3-deal-configurator.js` — shared V3 deal interpretation and customer component-selection UI.
- `js/website-order-v3.js` — Website V3 cart, quote, checkout, and confirmation.
- `js/public-menu-v3.js`, `js/catalog-preview-page.js`, `js/catalog-v3-preview.js` — read-only menu and preview rendering.
- Legacy files `js/catalog.js`, `js/pricing.js`, `js/store.js`, `js/hero-slider.js`, `js/i18n.js`, and legacy inline code remain in the app. The old homepage V2 cart/drawer and old order-submit handler are still present in the HTML/inline script, although the V2 cart bar is hidden and a source comment identifies V3 as the active homepage checkout. Treat this as dormant legacy code, not as the current V3 flow; do not delete it until references and regression coverage are mapped.

The current homepage has V3 ordering embedded below its Menu section. Its navigation's Order Online action goes to that section. The separate `order-online-v3.html` page is present, but the homepage flow is the primary implemented storefront path.

## Catalogue integration

- The V3 client calls the public Catalogue Edge Function using GET/no-store and the publishable key. It validates the health envelope, immutable publication metadata, database timestamp, V3 snapshot contract and matching publication/version hashes before presenting the menu.
- Product/category/variant information comes from the current published V3 snapshot. Product availability and branch availability are resolved from that snapshot; no menu prices or product IDs should be hardcoded into the customer UI.
- The V3 loader does not rely on a localStorage catalogue cache; it verifies the current publication when loading.
- The normal Website config currently points to the Production Supabase project for both the public catalogue API and the Order API. The key in the browser is a publishable key, not a service-role credential. Do not copy or introduce server secrets into Website code.

## Cart, fulfilment, delivery and checkout

- The active V3 cart is browser state. It stores product/deal identifiers, quantities, modifier selections and deal component selections; it does not send a trusted client price.
- Website fulfilment supports `delivery` and `pickup` only. Pickup is the Website's Takeaway equivalent. Dine-in is not present in the Website fulfilment selector; it remains a POS/staff operation.
- Branch options are fetched from the Order API's read-only `GET view=website_context` response and reconciled with the published catalogue. One branch is auto-selected; multiple branches require a choice. Branch or fulfilment changes clear cart/quote state to avoid mixing branch-specific selections.
- Delivery areas and current fee presentation come from branch context. A named area is selected by area ID. Not Listed/Other requires a customer confirmation and locality. The browser sends the selected area and address details, not a fee amount.
- The customer provides name and phone; email is optional. Delivery requires an address and area. Optional notes/instructions are supported.
- `Get verified total` submits a quote request. The server re-reads the current publication and delivery configuration, resolves current product/variant/deal/modifier prices, validates deal component selections and fulfilment, and returns the authoritative total and a short-lived signed quote token. Client-calculated totals are not sent as authoritative values.
- `Place order` requires a cryptographically random request UUID and preserves that UUID for safe retries. The client handles uncertain responses with a retry of the same request, rather than creating a new request. The API verifies the quote token again, performs idempotency lookup/commit, and enforces website rate limits.
- The V3 Website currently presents cash on delivery for delivery or cash at pickup. There is no Website card gateway or customer payment-method selector in this checkout. POS staff's COD/Card/Online collection controls are not a Website gateway.
- Checkout success UI only accepts a server-confirmed order reference.

## Deals and category-driven Burger choices

- Website deal options are generated from the current published catalogue and current branch/fulfilment context, not from hardcoded product lists or prices.
- For a category-driven Burger group, the deal-view model expects one internal non-standalone `Burger / Included` anchor in the published deal component group, with an `INCLUDED` zero-surcharge mapping. It discovers eligible products and variants dynamically from the active, available `Chicken Burgers` category and excludes the internal placeholder product itself.
- The configurator renders one selectable Burger slot for each required unit (Burger 1, Burger 2, Burger 3, etc.). Each slot offers the available category-driven choices. Repeat selection is permitted or blocked according to the published group's repeat setting and per-choice cap.
- The client payload carries exact catalogue IDs and choices, not prices. The server pricing module independently validates that each choice is allowed for the published deal, matches its product/variant identity, obeys group minimum/maximum/repeat/per-option limits and has a valid published pricing treatment. Included Burger selections add no surcharge.
- Website category-driven Burger implementation is present in source. Do not alter the shared deal-view validator, pricing engine, catalogue snapshot contract, or Order API independently; a change there affects other apps or server validation and requires coordination.
- Latest handoff reports a Production draft revision 108 versus published revision 92/publication 2. Draft editing is not visible to the Website until an authorised publication occurs. The Website must continue reading only the published snapshot. Do not publish or change draft/published catalogue data as part of Website work.

## Order API and security dependencies

Shared files requiring coordination before modification:
- `supabase/functions/flame-chick-order-api/index.ts`
- `supabase/functions/flame-chick-order-api/flame-chick-order-pricing.mjs`
- `supabase/functions/flame-chick-order-api/website-order-quote-token.mjs`
- `apps/flame-chick-website/js/catalog-v3.js` and `js/catalog-v3-deal-view.js` where mirrored/bundled into POS or the Edge Function
- any Supabase RPC, migration, database schema, branch/delivery-setting or rate-limit implementation.

The Production Order API v5 is reported ACTIVE by the latest POS handoff; its deployment was coordinated with the POS work. Do not redeploy or edit it from this branch.

Server-only secret names expected by source are `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` and `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET`. Their Production presence was not independently verified in the earlier deployment-readiness handoff. Do not inspect, copy, print or expose their values. Ask the Production coordinator to verify presence/configuration using a non-secret confirmation only.

The documented website-order rate-limit policy is 3 orders/minute, 3 orders/10 minutes, and 15 orders/hour. Preserve the database-backed atomic enforcement and idempotency behaviour. Do not add a client-only substitute or bypass.

## Preview safety — hard gate

The regular Website `js/config.js` points to Production Catalogue and Order API endpoints. The latest Production handoff reports Website ordering, Delivery and Pickup enabled for the active branch. Consequently, a normal Vercel Preview using this config can potentially quote and create a real Production order.

- Do not use the Production-backed Preview to click `Get verified total`, `Place order`, or `Retry order confirmation`.
- The existing opt-in `js/staging-guard.js` is only a WhatsApp/telephone destination test helper; it is not loaded as a Website order safety mechanism and does not block Order API calls.
- `catalog-preview.html` and the local synthetic catalogue fixture are read-only and cannot exercise order submission. The fixture is served on loopback, uses synthetic data, and does not expose order/payment endpoints.
- No full checkout-capable Preview is approved until an isolated mock/staging Order API is proven to have no Production write path. A UI-only disabled button is not sufficient as the sole security boundary for a checkout test.
- Safe route testing should use the existing synthetic Order API integration harness/local database tests with synthetic data, or a separately provisioned staging backend approved by the Production coordinator. Never create a live test order for convenience.

## Responsive behaviour and test coverage

- Website has responsive layouts and mobile-oriented CSS for product cards, deal controls, forms, cart and dialogs. The ordering page switches to a single-column form/cart layout at smaller widths. Source inspection confirms responsive rules exist; no interactive desktop/mobile browser rehearsal was performed in this audit.
- Existing Website Static Checks include JavaScript syntax checks, core catalogue/deal/fulfilment regression tests, preview fixture checks and inline-script parsing.
- Workflow run `45538933406` on commit `e6ed5ce59888e2b8912ed6fb0a1cd7e47992f074` failed in the core test step: four assertions in `tests/published-menu-v3-draft.test.mjs` still expected fixed Burger product mappings after the category-driven model changed. JavaScript syntax passed; later preview tests and inline-script parsing were skipped by the failed step.
- A later descendant commit `8e41d3357d63fc25c9fb0a0f2d22afe27a30e43a` updated the corresponding fixture/expectations. Website Static Checks run `45539528562` on that commit passed. The comparison from `e6ed5ce` to `8e41d335` confirms the Website application directory itself was unchanged; the fix was in tests/fixtures and other non-Website paths.
- Current branch HEAD `c37e3fc9a30f84ba4bf49884e11b13232ef96f60` descends from `8e41d335`; the later commits changed other app/backend/handoff paths and not the Website application directory. No Website-specific workflow run was found on exact current HEAD. Do not claim an interactive browser test or a current-HEAD CI run occurred as part of this audit.
- No tests, Playwright flows, browser clicks, quote calls or checkout requests were executed during this audit.

## Existing CI and Preview workflow limitations

- `.github/workflows/ci-website-static.yml` is Website-specific but its push trigger is pinned to `work/production-source-audit`. It will not automatically run for this parallel branch until its branch filter is updated on this branch.
- `.github/workflows/deploy-flame-chick-website-preview.yml` is Website-specific and deploys with `--target=preview`, but its branch condition is also pinned to `work/production-source-audit`. It will not deploy from this branch as currently written. It also remains fail-closed behind `vars.FLAME_CHICK_WEBSITE_PREVIEW_DEPLOY_ENABLED == 'true'`. Keep that approval gate and Preview-only target; do not modify Vercel project settings or production aliases.
- Previous handoff records a READY Website Preview deployment `dpl_41n22sQCEHKtRQ2KR1Rez4bR1kqf` from commit `71e1de4dad57b09b3609437acc59634508aa22a4`. This is historical evidence only; its current deployment state/alias was not re-verified in this audit, and its Website config must be treated as Production-backed. Do not use it for checkout tests.

## Audit result and next Website-only plan

No application-code change is approved by this audit. Continue in the following order:

1. Establish reproducible Website-only CI on `work/website-parallel-development` by updating only the Website workflow branch filters. Keep the deploy variable fail-closed and the deploy target Preview-only.
2. Introduce a verified Preview/local test mode that routes quote/create operations exclusively to a synthetic mock Order API or disables every order API call in Preview. Do not rely only on hiding checkout buttons. Continue using the public published catalogue read path only when safe.
3. Run the existing Website static, deal, catalogue, quote-token, fulfilment, local preview fixture and order API synthetic integration tests; record exact commit and run IDs.
4. Audit and streamline the homepage's dormant legacy V2 cart/drawer/order handler and stale copy only after mapping all references and preserving the V3 homepage entry points. Do not remove legacy code blindly.
5. Inspect and correct the customer journey: branch selection, Delivery/Pickup labels, delivery areas/Not Listed confirmation, mobile layout, product modifiers, deal burger slots, cart edit/remove/quantity, quote expiry, idempotent retry, validation errors and accessibility.
6. Rehearse complete checkout only against an isolated synthetic backend with synthetic names/phones/addresses and fake orders; verify server rejection for invalid IDs, stale menu, changed delivery fee, invalid deal choices, fulfillment, rate limiting and duplicate request replay.
7. Maintain a new Website-specific handoff on this branch after each completed stage. Do not merge into the Production/POS branch without explicit user approval.

## Handoff status

- Audit completed from repository source and existing handoffs.
- Branch created and verified from exact source HEAD; no source files modified.
- Features completed during this audit: none.
- Tests performed during this audit: none.
- Preview deployed during this audit: none.
- Production changes during this audit: none.
- Shared-backend dependencies: Order API, pricing/quote token, shared V3 catalogue/deal-view contract, delivery configuration and atomic order-rate-limit RPC; coordinate all changes with the Production/POS chat.
