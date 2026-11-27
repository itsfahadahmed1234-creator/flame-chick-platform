# Flame Chick customer website — current operating notes

Updated: 2026-11-27

## Current source and runtime

- Customer site: `https://flame-chick-website-production.vercel.app`
- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Active source branch for the storefront: `work/website-parallel-development`
- Customer entrypoint: `apps/flame-chick-website/index.html`
- Production Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, `ap-south-1`)
- Production Website Order API: `flame-chick-order-api`, deployed version 11
- The API source in this branch is synchronized to the deployed v11 entrypoint. Phone digests use HKDF key derivation from the server-only Supabase service credential; the retired `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` is not required.
- The browser contains the Supabase URL and public publishable key only. Never place `service_role`, secret keys, HMAC keys, or database credentials in website assets.

## Published catalogue and current draft

- The public website reads the published V3 catalogue; it does not read the draft directly.
- Published publication: 2 (25 products, 28 product variants, 6 deals at the time of the audit).
- The current draft revision is 108, while the published snapshot is at revision 92.
- The changes after revision 92 are edits to the **Flame Feast** deal and its component/variant choices. They have not been published; customers continue seeing the published snapshot until an authorized publish operation.
- Product-variant price comparison between the current draft and the published snapshot returned no product-price/availability differences at the time of audit.
- The Main branch is active for website orders, Delivery and Takeaway are enabled. Listed area **Comsats University** has a Rs 0 fee; Not Listed uses a Rs 100 fee. The Order API recalculates and validates these values server-side.
- GST calculations remain deliberately deferred. Do not add tax fields, tax computation, or checkout tax collection as part of website cleanup. Customer-facing copy that says prices are “exclusive of applicable GST” should be reviewed separately because tax is not currently calculated by the website.

## Checkout and security invariants

- The customer browser sends catalogue identifiers, selected options, customer data, fulfilment selection, and an idempotency request ID. It does not submit trusted prices or a delivery fee.
- The Order API calculates prices and delivery fee from the active published catalogue and current branch/delivery configuration, and the database transaction validates the request before inserting the order.
- Retrying an uncertain checkout must reuse the exact same request ID and request body. Do not generate a new ID for an uncertain request.
- The database applies per-phone request quotas (3 in 1 minute, 3 in 10 minutes, 15 in 1 hour, as verified in the audit). This is not an IP-level bot defence: rotating phone numbers can bypass per-phone quotas.
- The Edge Function currently returns wildcard CORS. CORS is not authentication, but this broad browser-origin policy and the lack of layered IP/bot controls remain hardening items. Do not make an origin allowlist change without checking all legitimate POS/admin/website origins and preview requirements.
- No live order was submitted during the audit or source cleanup.

## Cleanup completed in this pass

- Synchronized the exact deployed Order API v11 `index.ts` into both `work/website-parallel-development` and `work/production-source-audit`.
- Removed an unused V3 `loadWebsiteContext` helper; startup already fetches catalogue and website context together.
- Removed the no-op `pageStatus` wrapper and its calls.
- Removed unused V2 catalog-cache settings from `js/config.js`; V3 catalogue loading explicitly uses no local/session storage cache.
- Fixed the product-view-model error path to clear the real V3 nodes (`catsIn` and `menuRoot`) and show a visible error rather than dereferencing obsolete V2 element IDs.
- Removed a duplicated Preview guard assignment.
- Removed the obsolete HMAC environment variable from the Edge Function test setup.
- Added static regression assertions for the error path and the HKDF-based API implementation; CI now triggers when the Order API entrypoint changes.

## Intentionally not removed yet

The homepage still contains a legacy, hidden V2 drawer/form and old inline JavaScript, including obsolete cart/customer storage helpers and an unreachable legacy submit block. These are not the V3 checkout path, but removal affects a large inline script and duplicate legacy markup. Keep them untouched until the UI rehearsal confirms the actual live V3 interactions, then remove them in a separate reviewed change. Do not re-enable or extend the V2 order handler.

## Remaining work for OpenCode UI rehearsal

Use a read-only browser test. Do **not** click the final Place Order/Retry Order button and do not submit a real Production order.

1. Load the production website and confirm the V3 catalogue, product names, images/fallbacks, categories, deal cards, and prices.
2. Test product dialogs: single-variant add, multi-variant choice, quantity stepper, modifier required/optional choices, and close/reopen behaviour.
3. Test deals: required slots, burger slot switching, repeat limits, substitutions/options, deal quantity, and total display. Confirm Flame Feast choices reflect the *published* revision, not unpublished draft revision 108.
4. Test cart add/remove/quantity and all line/subtotal/fee/total recalculations.
5. Switch Delivery ↔ Takeaway repeatedly. Confirm delivery fields appear only for Delivery and cart selections remain stable where applicable.
6. Test listed area selection (Comsats University, Rs 0), Not Listed (Rs 100 plus locality and explicit confirmation), and Takeaway (Rs 0 delivery fee). Compare the visible fee with the known current DB configuration.
7. Confirm cash payment instructions follow fulfilment type; confirm mobile viewport, scrolling/sticky cart footer, modal scrolling, keyboard/focus and reduced-motion behaviour.
8. Refresh/navigate back and verify the cart/customer data behaviour; do not infer successful order creation from local UI state.
9. Check DevTools console/network errors. Never copy service credentials or customer data into screenshots/logs.

After UI checks, report every mismatch with a screenshot, exact click sequence, selected fulfilment, viewport width, and expected/actual result. Then perform a separate security hardening review of CORS/origin handling and anti-automation/rate limiting; this pass did not change those policies.
