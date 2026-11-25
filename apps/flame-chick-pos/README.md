# Flame Chick POS

Static cashier/POS application.

- Entrypoint: `index.html`
- Assets: `assets/`
- Uses the single Flame Chick Production Supabase project and namespaced catalog, order and delivery APIs.
- Retains the local-first cashier workflow, saved-order/idempotency safeguards, operational Realtime updates, and polling fallback.
- POS Delivery orders are synced through the authenticated V3 Order API, priced against the immutable published catalog, and then appear in the shared Online Orders board with a POS source label.
- Staff access: active Admin and Owner are restaurant-wide; Manager and Cashier roles are branch-scoped. The server derives identity/role/branch from the authenticated Supabase session and validates every order/status command. No browser role assertion or direct table write is authoritative.

## Current deployment/readiness status — 2026-11-25

- Core operational schema and Order/Delivery/Staff APIs are already installed in Flame Chick Production. The existing POS V3 sync route and shared Online Orders board are implemented.
- A live Order API bundle mismatch blocking category-driven Burger selections from POS has been corrected. Production `flame-chick-order-api` is version 4 and its deployed deal-view bundle now includes the Chicken Burgers category-source helper. Route-level synthetic delivery tests pass.
- Existing POS Preview remains READY at the branch preview alias recorded in `PROJECT_HANDOFF.md`. No production Vercel alias has been changed.
- **Production readiness remains gated** on retrying the previously saved local test Delivery order once, confirming it appears in Online Orders and creates the expected delivery task, and completing a controlled end-to-end rehearsal with test accounts. Do not use the POS for live restaurant operations until this gate is explicitly cleared.
- Never create a replacement order while the saved local order is recoverable. Never retry a `needs_review` order repeatedly without fixing its validation cause.
