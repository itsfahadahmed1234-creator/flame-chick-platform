**Hostname boundary:** The expected initial validation hostname is `flamechickpos.itsfahadahmed1234.workers.dev`. Cloudflare recommends a custom domain/route rather than `workers.dev` for business-critical production. The connected account currently has no zones attached, and the user supplied only the label `flamechickpos`, not a registered full domain/TLD. Use the workers.dev hostname for initial testing only; do not invent a suffix, purchase/register a domain, add a zone, or change DNS. Record the exact full custom production hostname after the user connects the zone/domain.

# Current hosting direction — 2026-11-27

The primary next hosting task is a new Cloudflare Workers + Workers Static Assets project named `flamechickpos` in the connected Cloudflare account. No Cloudflare POS project/deployment has been created yet. The latest validated POS source candidate is this directory at commit `41c8aea80febd434048e50c352b386c01b02e7d4`; all 14 POS files other than README.md match the later documentation-only branch checkpoint.

Read [the Cloudflare POS hosting continuation handoff](../../docs/handoffs/2026-11-27-cloudflare-pos-hosting-continuation.md) before configuring hosting. The POS is plain static HTML/JavaScript with a server-side QZ signing endpoint that must be ported to a Worker. Never publish its Node signer source/private key as static assets. Keep the Vercel Production host as a fallback until Cloudflare is fully verified.

---

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


## Temporary POS Preview deployment via GitHub Actions

- Use `.github/workflows/deploy-flame-chick-pos-preview.yml` while the original Vercel team's daily deployment quota is exhausted.
- The workflow is restricted to `work/production-source-audit`, requires repository variables `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true` and `FLAME_CHICK_POS_PREVIEW_PROJECT_READY=true`, and uses repository secret `VERCEL_TOKEN`.
- It is pinned to the isolated Vercel Preview project `flamechickpos` in the current Hobby team. The Vercel project root directory is `apps/flame-chick-pos`; therefore the CLI must run from the monorepo root (not from this folder) to avoid duplicating the root-directory path.
- Deploy command is explicit Preview environment only. No production alias or custom domain is assigned by the workflow.


## Temporary isolated bootstrap

A one-time Production bootstrap is push-gated in `.github/workflows/bootstrap-flame-chick-pos-isolated-production.yml` and requires repository variable `FLAME_CHICK_POS_TEMP_BOOTSTRAP_ENABLED=true`. It targets only the isolated Vercel project `flamechickpos` in the temporary Hobby team, with SSO protection enabled and no live restaurant POS alias. The first deployment must be Production because Vercel will not accept Preview as the first deployment for a new project. QZ signing CORS now includes `https://flamechickpos.vercel.app`, but QZ signing remains unavailable until a matching private key is securely configured in this new Vercel project. Follow `PROJECT_HANDOFF.md` for exact scope and post-bootstrap steps.
