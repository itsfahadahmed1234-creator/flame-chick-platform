# Flame Chick POS

Static cashier/POS application.

- Entrypoint: `index.html`
- Assets: `assets/`
- Uses the single Flame Chick Production Supabase project and namespaced catalog, order and delivery APIs.
- Retains the local-first cashier workflow, saved-order/idempotency safeguards, operational Realtime updates, and polling fallback from its source baseline.

Production readiness is pending schema/menu migration, branch and staff-role setup, and a controlled end-to-end checkout/dispatch test. Do not deploy this source to the current Vercel POS until that gate is passed.
