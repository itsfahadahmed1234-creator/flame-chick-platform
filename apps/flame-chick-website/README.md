# Flame Chick Customer Website

Static customer storefront for Flame Chick.

- Entrypoint: `index.html`
- CSS: `css/styles.css`
- Active browser scripts: `js/config.js` and `js/catalog.js`, plus the inline scripts in `index.html`
- Legacy JavaScript files: retained in `js/` for reference, but not loaded by the current storefront entrypoint. In particular, `js/app.js` is inactive and contains historical HFP/Pizza Bite settings and HFP staging image URLs; do not add it to the production page without a full review.
- Brand assets: `assets/`
- Media: `media/f/` (59-frame scroll sequence), `media/products/` (11 product images), `media/hero.jpg`, and `media/hero.mp4`
- Supabase: Production project `adkrxfnawdiljhjaavnj`, Mumbai `ap-south-1`
- Checkout and catalog APIs: `flame-chick-catalog`, `flame-chick-order-api`

The browser configuration contains only the Production Project URL and a publishable API key. It has no service-role or secret key.

Before enabling live ordering, complete the Production schema, published menu, storage assets, delivery-area configuration, and checkout/availability tests. The current backend schema is not yet migrated.
