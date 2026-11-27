# Flame Chick Customer Website

Production customer storefront for Flame Chick.

## Entrypoints and source

- Customer storefront: `index.html`
- Production website: `https://flame-chick-website-production.vercel.app`
- Active source branch: `work/website-parallel-development`
- Published catalogue preview: `catalog-preview.html` (read-only, no order submission; `noindex` is not access control)
- Retired standalone ordering URL: `order-online-v3.html` (redirects to `index.html#menu`)
- Stylesheet: `css/styles.css`
- Active V3 browser modules:
  - `js/config.js`
  - `js/catalog-v3.js`
  - `js/catalog-v3-client.js`
  - `js/branch-fulfilment-v3.js`
  - `js/catalog-v3-view.js`
  - `js/catalog-v3-deal-view.js`
  - `js/catalog-v3-deal-configurator.js`
  - `js/preview-checkout-guard.js`
  - `js/website-order-v3.js`
- The homepage still contains a legacy hidden V2 drawer/form and inline handlers. They are not the V3 checkout path and should not be extended. The 27 November OpenCode Playwright audit confirmed two uncaught errors from legacy `renderCart`/`spy` paths. Remove or safely guard these only after mapping every selector/event dependency; do not blindly delete the legacy inline block.

## Production services

- Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, `ap-south-1`)
- Catalogue API: `flame-chick-catalog`
- Order API: `flame-chick-order-api`, deployed version 11
- Browser configuration contains only the project URL and public publishable key. Service-role credentials, secret keys, HMAC keys and database credentials must remain server-side.
- The repository's Order API entrypoint is synchronized with the deployed v11 source on this branch. The current phone digest derives a separated HMAC key using HKDF from the server-only service credential; the retired `FLAME_CHICK_ORDER_PHONE_HMAC_SECRET` is not used.

## Catalogue and checkout behaviour

The storefront loads the currently published V3 catalogue and current operational branch/fulfilment configuration. It does not read draft menu data for customer display.

The browser sends catalogue IDs, explicit option selections, customer details, fulfilment selection and a unique idempotency request ID. It does not send trusted item prices or delivery fees. The Order API recalculates prices, validates availability and delivery configuration, and creates the order through the database's atomic order procedure. An uncertain retry must preserve the exact request body and request ID.

The customer-facing publication was publication 2 at the November 27, 2026 audit (25 products, 28 product variants and 6 deals). The working draft was revision 108, while the published snapshot was revision 92. The post-publication changes were Flame Feast deal edits and were not yet published at audit time. Customers continue to see the published snapshot until a controlled publish operation.

Current Main branch settings at audit time: website ordering enabled; Delivery and Takeaway enabled; listed Comsats University delivery fee Rs 0; Not Listed delivery fee Rs 100. The Order API independently validates current branch and delivery fee settings.

GST calculations are intentionally deferred. Do not add tax fields or checkout tax calculations without explicit approval. Review any customer-facing “exclusive of applicable GST” wording separately so that it does not imply an unimplemented charge.

## Security and operational notes

The database applies per-phone order quotas (3 in 1 minute, 3 in 10 minutes, and 15 in 1 hour, as verified during the audit). These controls do not provide IP-level or bot-level protection; rotating phone numbers can bypass per-phone quotas. The Edge Function currently uses wildcard CORS. CORS is not authentication, but origin policy and layered anti-automation controls remain hardening work. Do not change them without checking the legitimate website, POS, admin and approved preview origins.

Preview checkout remains restricted by `preview-checkout-guard.js`. Never add wildcard Vercel Preview host matching. Do not test by clicking Place Order or Retry Order on Production unless a real rehearsal order has been explicitly authorized.

## Validation

Static website checks cover script syntax, catalogue and deal regressions, branch/fulfilment behaviour, preview checkout guards and inline-script parsing. The production API source is now included in the website hygiene checks so an endpoint-source change retriggers CI.

The backend/catalogue/source audit is in `docs/audits/FLAME_CHICK_WEBSITE_AUDIT_2026-11-27.md`. The completed 27 November OpenCode Playwright UI audit, defects C1–C10, test results and staged correction plan are in `docs/handoffs/2026-11-27-website-ui-reliability-next-session.md`. The user uses OpenCode + Playwright for interactive browser tests; do not assume ChatGPT Work mode is available. Fixes are not implemented just because they are documented in the handoff.
