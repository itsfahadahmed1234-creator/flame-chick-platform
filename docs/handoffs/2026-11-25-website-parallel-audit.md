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


---

## 2026-11-25 — Homepage cart and fulfilment visual redesign

**Latest Website branch checkpoint:** `5cbcb7136c6369a62dd97053a60fb1a7ed669503`  
**Branch:** `work/website-parallel-development`

### User-requested visual changes implemented

- Removed the large homepage branch/fulfilment selection panel. The homepage no longer displays a branch selector or the separate "choose delivery/pickup before menu" gate.
- The Website context now requires exactly one currently enabled website-ordering branch. The single branch is selected internally from the server context and the matching published V3 branch snapshot. If the API ever reports zero or multiple enabled branches, the page fails closed with an explanatory error rather than silently selecting one.
- The published V3 catalogue can render immediately after its normal secure catalogue/context load; Delivery is selected by default when available.
- Moved the active V3 cart and customer details into a responsive slide-in cart drawer.
- Added Delivery and Takeaway fulfilment controls inside the cart. Takeaway maps to the existing backend `pickup` fulfilment value.
- Added a mobile bottom cart bar that appears when the cart contains items. The homepage header cart button and mobile cart bar both open the same V3 cart drawer.
- Reused the V2-style segmented radio control, slide-in drawer, red/cream/gold palette and existing V2 responsive interaction styling already contained in the Flame Chick homepage. No design assets, data, catalogue content or code were fetched from another website.
- Kept the V3 published catalogue client, product/deal renderers, deal configurator, product modifiers, quote endpoint, order submission, signed quote token, idempotency and server-side pricing/availability validation.

### Fulfilment interaction

- Delivery is the initial method when the single branch's current server context supports Delivery.
- Takeaway is available only when the same current server context supports Pickup.
- Unsupported fulfilment options are disabled in the cart UI.
- Changing fulfilment preserves the cart contents but invalidates any prior quote and requires a fresh server-verified quote. The server still validates the chosen fulfilment and the selected product/deal availability.
- Delivery area/address fields are shown only when Delivery is selected. Area IDs, locality and address are submitted as customer selections; no client fee calculation was added.
- Dine-in remains a POS/staff fulfilment type and was not added to the customer Website.

### Source files changed on the Website branch

1. `apps/flame-chick-website/index.html` — removed homepage branch/fulfilment gate and inline cart; added responsive V3 cart drawer, in-cart Delivery/Takeaway controls, mobile cart bar and V2-style visual rules.
2. `apps/flame-chick-website/js/website-order-v3.js` — single-enabled-branch internal context, automatic Delivery default, drawer open/close handling, mobile cart count, fulfilment switching and quote invalidation.
3. `tests/website-source-hygiene.test.mjs` — asserts no visible branch selector, Delivery default, Takeaway option, V2-style cart drawer and V3 fulfilment/quote wiring; updated the existing product-artwork assertion to match the current V3 renderer helper.
4. `.github/workflows/ci-website-static.yml` — enabled the Website-only CI workflow on `work/website-parallel-development`, retaining the existing production-source branch trigger and all existing checks.

### CI verification

- GitHub Actions run: `45571519719`
- Workflow: **Flame Chick Website Static Checks**
- Exact tested commit: `5cbcb7136c6369a62dd97053a60fb1a7ed669503`
- Result: **SUCCESS**
- Verified steps: JavaScript syntax checks; core Website/catalogue/deal/fulfilment regression tests; preview fixture tests; Website and preview inline-script parsing.
- An earlier run `45571426142` failed on a stale existing `product.imagePath` assertion. The source currently invokes `appendProductArtwork(art, product, category.name)`; the test was aligned with that renderer and the full rerun passed. This was a test expectation correction, not a catalogue, pricing or order API change.
- No interactive browser layout test or end-to-end checkout was performed.

### Preview restriction remains

The standard Website config still points to the Production Catalogue and Production Order API. A Vercel Preview using that config could potentially create a live order. Therefore:
- No Vercel Preview was deployed for this visual checkpoint.
- Do not test quote/place-order/retry against the normal Production-backed Preview.
- The Website preview workflow's existing fail-closed deployment gate remains unchanged and disabled on the parallel branch.
- Before enabling an interactive Preview, create and verify a genuinely isolated mock/staging order path with no Production write route. A UI-only disabled button is not an adequate isolation boundary.

### Shared/backend and Production impact

- No shared catalogue or deal validator modules changed.
- No Order API, pricing module, quote-token module, Edge Function, database RPC, migration, database schema, Production setting, catalogue publication, order, payment, staff account, Rider setting, Realtime setting, Vercel alias or production deployment changed.
- No commit was made to `work/production-source-audit`. All code and test changes remain on `work/website-parallel-development`.

### Next step

Review the redesigned homepage and cart drawer in a safe visual-only Preview or local static test environment once the Production write path is isolated. Then test desktop/mobile interactions, including fulfilment toggling, field visibility, cart preservation, quote invalidation and server validation. Do not enable checkout Preview or change Production configuration as a side effect.


---

## 2026-11-25 — Safe visual review Preview deployment

### Preview deployment (verified READY)

- Dedicated Vercel team: `team_Rpf9jeGg9r3cmMguFXHtziqz` (`fahad-7455`, Hobby)
- Separate Vercel project: `flame-chick-website-visual-review`
- Project ID: `prj_7C1gVdgIUx3IOtzix60atkllkNRJ`
- Root directory: `apps/flame-chick-website/visual-review`
- Project SSO protection: enabled for all deployments
- Git source: `itsfahadahmed1234-creator/flame-chick-platform`
- Git branch: `work/website-parallel-development`
- Deployed commit: `f27da4daf4872eb15d371f8c599e9bfa96621edc`
- Preview deployment ID: `dpl_C9xMZGNBEpPp4rz1gvfNj8wSkoFa`
- Preview URL: https://flame-chick-website-visual-review-l7zuhblsr-fahad-7455.vercel.app
- Vercel status: `READY`
- Vercel target: `null`, verified by the deployment API as a Preview deployment
- Build log confirms GitHub cloned `work/website-parallel-development` at commit `f27da4d`, build completed, and deployment completed.
- This is an isolated, standalone visual-review page. It uses sample visual content, no live catalogue, no Supabase configuration, no Order API, no external scripts and no order submission. The checkout control is disabled. It does not test real product/deal data or real checkout.
- Vercel SSO protection means the preview requires access through the team's Vercel authentication.

### Deployment provisioning correction / audit note

The first create-deployment request placed `target: "preview"` in the request body. Vercel did not apply that value; the response created a Production-class deployment `dpl_BWwnUS9LwfGhTPAuLsbUCzLuMCWQ` inside the newly created **separate visual-review project**, not in the existing `flame-chick-website-production` project. Its content is the same static, inert visual-review page with no catalogue/API/checkout connection; it did not touch the real production Website project, its domains, catalogue, Order API, database or orders. The cancellation request was rejected because the deployment was already READY. The corrected request omitted the target field; Vercel then created the above deployment with `target: null`, and the deployment card/API both verified it as `preview`.
- Do not use the first deployment URL or the separate review project's automatically generated root alias for further work; use the explicit Preview URL above.
- Existing Vercel project `flame-chick-website-production` (ID `prj_izBWyrFmPZIm63FHAT4jaLHUTLzu`) was only inspected; it was not redeployed, reconfigured, aliased, promoted or changed.

### Deployment safety and testing limitations

- This preview is intentionally visual-only; sample cards/labels are not live catalogue data and sample names/prices must not be treated as business data.
- The deployed page has no calls to Supabase, catalogue endpoints, order API, payments or customer-data collection. The disabled checkout is not a production checkout implementation.
- No production alias was assigned to the existing Website project. No existing custom domain was changed.
- Deployment is suitable for reviewing the design direction (hero, category pills, sample cards, sample deals, cart drawer, Delivery/Takeaway segmented control and responsive layout); it is not a final functional Website deployment or an operational checkout test.

### Next step

Use the explicit Preview URL above to review desktop and mobile visuals. Gather visual feedback, then port approved styling/layout refinements back into `index.html` and `website-order-v3.js` while retaining V3 catalogue/checkout integration and continuing to block Production checkout from Preview.


---

## 2026-11-25 — Corrected deployment: real Flame Chick Website Preview

The earlier standalone visual-review mockup was not the intended review target. The correct preview has now been deployed from the real customer Website implementation into the existing `flame-chick-website-production` Vercel project, using the isolated Website branch. The standalone mockup URL should not be used for review.

### Verified real Website Preview

- Existing Vercel project: `flame-chick-website-production`
- Project ID: `prj_izBWyrFmPZIm63FHAT4jaLHUTLzu`
- Team: `fahad-7455`
- Git repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/website-parallel-development`
- Deployed commit: `2547a6db9f2d54368735ef52bbc0d0724e3bcef3`
- Deployment ID: `dpl_8i8kJR6xJPvsWSkvAvR9Ruuyw95w`
- Unique Preview URL: https://flame-chick-website-production-4oiixa7th-fahad-7455.vercel.app
- Vercel state: `READY`
- Vercel target: `null`, confirmed by Vercel as Preview, not Production.
- The build log confirms the actual repository branch and exact commit were cloned and deployed.
- The deployed root is the Vercel Website project's existing app root, serving `apps/flame-chick-website/index.html`, not `visual-review/index.html`.

### Deployed-page verification

The deployment URL was fetched successfully:
- HTTP response: `200 OK`
- Page title: `Flame Chick | Order Online`
- The actual homepage HTML contains `fc-preview-readonly-banner` and `fc-preview-checkout-notice`.
- The homepage loads the normal V3 published catalogue client and the new Preview checkout guard.
- The deployed `js/preview-checkout-guard.js` returned HTTP 200 and contained the exact Production-host allowlist.
- The deployed `js/website-order-v3.js` returned HTTP 200 and contains the Preview write block.
- The deployed page does not contain the earlier sample mockup's `Sample burger` content.

### Preview safety implementation

- The real published V3 catalogue still loads by read-only GET through the existing Flame Chick Catalogue endpoint, allowing review of the actual published product/deal data and images.
- The read-only Website context GET remains available so the single currently enabled branch and fulfilment availability can be shown.
- The Website identifies order-write permission using an exact allowlist of verified Production hostnames: `flamechic.vercel.app` plus the Vercel Production domains/hostname mapped to the confirmed Production deployment.
- On every other hostname (including branch Preview aliases and localhost), quote and order POST calls are blocked before network submission, quote/place/retry controls are disabled, and a visible Preview-only notice is shown.
- The V3 cart, product customization, deal customization, cart quantity/edit controls and Delivery/Takeaway selection remain available for visual review. A quote or order cannot be created from the Preview.
- This guard is a browser-side fail-closed safeguard for the requested Preview. It does not replace server-side API validation; the deployed Preview must remain non-operational and no checkout testing is permitted against Production.

### CI

- Website Static Checks run: `45575943232`
- Exact commit: `2547a6db9f2d54368735ef52bbc0d0724e3bcef3`
- Result: **SUCCESS**
- Verified steps: active JavaScript syntax; preview-write guard tests; core catalogue/deal/fulfilment tests; preview fixture tests; inline homepage and preview script parsing.
- Guard regression tests cover the verified Production-host allowlist, block non-GET methods on arbitrary Preview/local hosts, allow read-only GETs and fail closed for malformed or deceptive hostnames.

### Production alias verification

The Production aliases were read back after deployment:
- `flamechic.vercel.app` still maps to the pre-existing Production deployment `dpl_J5y1tZeoBZfRAfxVkmjLTZ72jq6i`.
- `flame-chick-website-production-six.vercel.app` still maps to the same existing Production deployment.
- `flame-chick-website-production-fahad-7455.vercel.app` still maps to that same existing Production deployment.
- The new Preview has only its unique branch Preview alias and did not receive or replace the Production aliases.
- No Production alias was promoted, moved, or reassigned. No Supabase resource, catalogue, order, payment, migration, staff role, POS, Admin or Rider setting was changed by this deployment.

### Correct review URL

Use only this actual Website Preview for customer-facing visual review:

https://flame-chick-website-production-4oiixa7th-fahad-7455.vercel.app

The previous standalone mockup at `flame-chick-website-visual-review-*.vercel.app` was not the real Website and should be disregarded. The existing custom domain `https://flamechic.vercel.app` remains on its original Production deployment.

### Remaining verification

The deployment and source response were verified, but a full interactive browser rehearsal (actual catalogue hydration, product/deal modals, cart drawer behavior, responsive screenshots) was not performed. The user should review the real Preview on desktop/mobile. Do not test Get Verified Total, Place Order or Retry on Preview.


---

## 2026-11-25 — Catalogue render fix + status panel removal

### User feedback
- The visual design was approved, but the live catalogue did not render.
- User requested removal of the catalogue status section.

### Root cause verified in browser preview
- The page was failing during catalogue rendering because `appendProductArtwork(art, product, category.name)` was called by the V3 product renderer but the helper was not defined in the deployed Website script.
- This exception occurred during product card creation and caused the Website's initialization catch to mark online ordering unavailable and hide the rendered menu.

### Fixes on Website branch only
- Added a local `appendProductArtwork` helper to the existing V3 Website script:
  - Uses the published catalogue's `imagePath` only when present.
  - Builds a path against the existing public Flame Chick media bucket URL from the Website config.
  - Uses lazy loading and a safe fallback icon if the image cannot load.
  - Does not hardcode catalogue product IDs, prices, or published availability.
- Removed the entire Catalogue Status panel from the homepage markup.
- Removed its reload button event handler and changed the status setter to a no-op; catalogue/checkout failures still appear in the existing order-status context.
- No API/backend/schema/POS/Admin/Rider or Production settings were changed.

### CI and deployment
- Static Website checks run: `45577025295` — **SUCCESS** for commit `6d909c672c6216995734bc951d3253760f6575b9`.
- Deployment: `dpl_9uAiY4diDwZfheGkSjcvDvUa99cK`
- Status: **READY**, target **Preview**
- Branch: `work/website-parallel-development`
- Commit: `6d909c672c6216995734bc951d3253760f6575b9`
- URL: https://flame-chick-website-production-pmnve3cvo-fahad-7455.vercel.app
- Deployed page verified HTTP 200, correct Flame Chick title, preview banner present, catalogue status panel removed, menu root markup present, helper script served HTTP 200.
- Production aliases remain attached to their prior Production deployment.

### Remaining browser verification
- Automated source checks passed and deployment is READY. A full live interactive catalogue hydration, image loading, and mobile/desktop cart rehearsal still needs to be performed by reviewing this updated Preview.


---

## 2026-11-25 — Follow-up product card renderer fix

### User observation
The real Website Preview displayed the category heading `Starters` and the `Deals` heading, but no product cards. The previous Preview was not yet functional enough; the category heading alone did not mean the catalogue had rendered.

### Second root cause
The browser rendered the page and initialized the V3 catalogue, but stopped while creating the first product card because `cardPrice(firstVariant.priceMinor)` and variant-option price labels called a missing `cardPrice` helper. The browser exposed the runtime error `cardPrice is not defined`. This was in addition to the earlier missing `appendProductArtwork` helper, which has already been restored.

### Fix
- Added `cardPrice(priceMinor)` to `apps/flame-chick-website/js/website-order-v3.js`.
- The helper delegates to `FlameChickCatalogV3View.formatMoney`, passing the current server Website context currency code (fallback PKR) and `en-PK` locale.
- No prices or catalogue values were hardcoded; product prices still come from the published V3 catalogue.
- Kept the existing artwork helper and complete removal of the Catalogue Status panel.

### Automated checks
- Website Static Checks: `45577611373`
- Commit: `84f9ccf9d0f158b3ade70b4b03ac9a8373e77c86`
- Result: **SUCCESS**
- JavaScript syntax, core catalogue/deal/fulfilment regressions, preview write-guard tests and inline script parsing passed.

### New Preview deployment
- Project: `flame-chick-website-production`
- Deployment ID: `dpl_A2N1kM7cB2UBz8LCYALFH2m5RD5u`
- URL: https://flame-chick-website-production-oc7wbv9ff-fahad-7455.vercel.app
- State: **READY**
- Target: Preview (`null` at API level)
- Branch: `work/website-parallel-development`
- Exact commit: `84f9ccf9d0f158b3ade70b4b03ac9a8373e77c86`

### Deployment response checks
- Homepage returned HTTP 200 with title `Flame Chick | Order Online`.
- Homepage has V3 catalogue client scripts and menu root.
- Homepage does not contain the removed `connection-panel`.
- Preview read-only notice remains present.
- Deployed `website-order-v3.js` returned HTTP 200 and contains both `appendProductArtwork` and `cardPrice` definitions.
- Deployed `catalog-v3-view.js` returned HTTP 200 and exports `formatMoney`.
- This was a deployed source/HTTP verification. The remote browser's interactive catalogue hydration and image requests were not directly exercised after this exact deployment; user review is still required to confirm product cards are now visible.

### Production / parallel safety
- No Production alias was changed.
- No Production database/catalogue/order/payment data was modified.
- No POS, Admin, Rider, backend API, migrations or shared server pricing code was changed.
- All changes remain on `work/website-parallel-development`.


---

## 2026-11-25 — Product popups, direct add, and unified deal popup

### User-requested customer flow

- Clicking any product card opens its product popup.
- Each product card retains a separate direct Add button.
- Simple single-variant products with no required modifiers can be added directly from the card without opening the popup.
- Products requiring a choice (multiple variants or required modifiers) route the Add action into the same product popup; invalid selections cannot be added.
- Product popup presents the product image/artwork, name, description, published variant/size and price, modifier choices, quantity and a final Add to cart action.
- The standalone homepage deal-configurator section is removed. Deal cards stay in the published Deals list; clicking a deal card or its Choose deal button opens a modal dialog containing the configurator.
- A deal with exactly one branch-satisfiable published variant is preselected; otherwise customers choose a variant in the popup.

### POS-style burger choices in the deal popup

- The Website continues to use its existing V3 `FlameChickCatalogV3DealConfigurator` and `FlameChickCatalogV3DealView`; neither shared module nor POS code was modified.
- Category-driven Burger choices appear as compact expandable choice groups inside the deal popup.
- The configurator creates separate Burger 1, Burger 2, etc. selectors based on the published deal component group's required/maximum units.
- Available Burger choices come dynamically from the published Chicken Burgers category and selected branch/fulfilment context. No product IDs, product names, deal contents or prices are hardcoded.
- Existing rules for duplicate/repeated choices, per-option maximum quantity, branch availability, included/surcharge pricing treatment and per-component modifier selection are preserved by the V3 configurator.
- Deal completion stays disabled until all required groups and per-burger customizations pass the configurator's validation. The resulting identifier-only payload is added to the Website cart and is revalidated/priced by the existing Order API at quote time.
- This is the same published V3 category-driven selection model the POS uses; Website presentation is styled as a compact modal consistent with the POS Burger 1/Burger 2 interaction. POS source files were inspected read-only and not changed.

### Website files changed in this stage

1. `apps/flame-chick-website/js/website-order-v3.js` — card click/keyboard popup, direct simple-product add, shared product variant/modifier/quantity dialog, deal cards open the deal dialog, one available variant auto-selected, and deal completion returns to cart.
2. `apps/flame-chick-website/index.html` — replaced the separate deal configurator section with a `<dialog id="deal-dialog">`, added compact product/deal popup styling, responsive burger slots and option-group styling.
3. `tests/website-source-hygiene.test.mjs` — coverage for direct add, product popup, single popup deal selection host and preserved category-driven Burger slot/repeat/modifier rules.

### CI

- Website Static Checks run: `45579510172`
- Exact source commit tested: `cfa6590a7339599d18b0e6da9b60062b9d26e322`
- Result: **SUCCESS**
- Verified: active JavaScript syntax checks; checkout preview guard; core catalogue, deal, modifier, branch fulfilment and regression tests; the new Website product/deal popup assertions; preview regression fixtures; inline HTML script parsing.
- Two intermediate runs failed because of over-escaped test-only regular-expression assertions. The test assertions were simplified to match the source payload and the final run above passed. Application syntax and core V3 catalogue/deal tests passed during those intermediate runs.

### Preview deployment

- Existing Vercel project: `flame-chick-website-production`
- Deployment ID: `dpl_mPYuZhZ87CezfHGjWvb26ZcjJtVJ`
- Preview URL: https://flame-chick-website-production-rib26i772-fahad-7455.vercel.app
- State: **READY**
- Target: Preview (`null` at deployment API level)
- Source branch: `work/website-parallel-development`
- Deployed source commit: `cfa6590a7339599d18b0e6da9b60062b9d26e322`
- Homepage returned HTTP 200 and title `Flame Chick | Order Online`.
- Deployed homepage contains `product-dialog`, `deal-dialog`, V3 menu root and Preview notice; does not contain the mockup's sample content.
- Deployed Website order script, V3 deal configurator and Preview checkout guard each returned HTTP 200. The V3 deal configurator source contains the compact Burger picker/slot selection logic.
- The previous Production aliases were not promoted, moved or reassigned. This is a branch Preview only.
- Preview checkout remains disabled for all non-Production hosts. Do not test quote/place/retry or create any real order from this Preview.

### Remaining manual review

- Automated checks and deployed asset/source responses are verified.
- Interactive clicks/keyboard and desktop/mobile layout should still be reviewed by the user in the new Preview, particularly:
  - simple product direct Add;
  - product card click and a multi-variant product popup;
  - modifier-required product popup and quantity validation;
  - deal popup with multiple included burgers;
  - repeat-choice limit and a deal with more than one variant;
  - mobile dialog scrolling and sticky/visible Add action.
- No full interactive browser rehearsal was completed automatically in this stage.
