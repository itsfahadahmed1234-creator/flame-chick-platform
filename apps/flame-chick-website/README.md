# Flame Chick Customer Website

Static customer storefront for Flame Chick, with a separate non-ordering V3 catalog preview entry.

- Customer storefront entrypoint: `index.html`
- Separate non-ordering published-catalog preview: `catalog-preview.html` (noindex; not authentication protected; reads only the public current publication; not deployed while the preview gate is disabled)
- Preview stylesheet/controller: `css/catalog-preview.css`, `js/catalog-preview-page.js`
- CSS: `css/styles.css`
- Active browser scripts: `js/config.js`, `js/catalog.js`, `js/hero-slider.js`, `js/i18n.js`, `js/pricing.js`, `js/staging-guard.js`, and `js/store.js`, plus the inline scripts in `index.html`.
- Brand assets: `assets/`
- Media: `media/f/` (59-frame scroll sequence), `media/products/` (11 product images), `media/hero.jpg`, and `media/hero.mp4`
- Supabase: Production project `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`
- Checkout and catalog APIs: `flame-chick-catalog`, `flame-chick-order-api`

The browser configuration contains only the Production Project URL and a publishable API key. It has no service-role or secret key.

Customer checkout uses a single **Place order** action. The browser sends the selected catalog IDs and order details to `flame-chick-order-api` with a unique idempotency request ID. The API recalculates prices, validates availability and delivery fees, and commits the order atomically; the browser does not request or hold a signed quote first. The canonical Production hostname can accept customer orders. For the explicitly approved launch rehearsal, only the exact controlled Website Preview deployment URL and its exact branch alias are temporarily allowed to submit to Production after a browser confirmation; those requests are automatically tagged `[TEST ORDER - ADMIN DELETE]` in the order notes so Admin can identify and remove them before launch. All other Preview hosts remain read-only. Never wildcard-match Vercel Preview hostnames.

Before enabling live ordering, complete the Production schema, published menu, storage assets, delivery-area configuration, and checkout/availability tests. The current backend schema is not yet migrated.


## Catalog preview safety

The preview page is separate from the customer storefront and does not change the live menu. It has no add-to-cart, checkout, payment or order-submission controls. Product/deal choice checks are local and do not calculate an authoritative total or request a quote. It reads only the published catalog endpoint, not draft/admin data. Product/deal media remains placeholder-only until the production storage bucket is provisioned. The `noindex` directive is not access control; do not treat this page as a private admin interface. The Vercel preview deployment workflow remains disabled until explicitly approved.
