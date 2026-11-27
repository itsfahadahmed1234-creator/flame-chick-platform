# Flame Chick POS — Cloudflare hosting continuation handoff

**Date:** 2026-11-27 (Asia/Karachi)  
**Purpose:** Move POS hosting to the newly connected Cloudflare account so the POS no longer depends on Vercel for its primary hosting.  
**Immediate next task:** Create a separate Cloudflare Worker project for the POS named exactly `flamechickpos`, prepare the current POS source for Workers Static Assets, securely port its QZ signing API, and deploy/test it as the new POS host.

## 1. Start here — current source and exact upload candidate

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Continue on: `work/production-source-audit`. Do not switch to or modify `main`.
- POS app root: `apps/flame-chick-pos`
- Latest fully validated POS source-tree pin: **`41c8aea80febd434048e50c352b386c01b02e7d4`**.
- The latest branch head before this hosting handoff was `7a8188607b4d08f25e9d005b2acf0bf9ea2cd906`. That later commit changed handoff documentation only. A complete Git tree comparison confirmed all **20 files under `apps/flame-chick-pos/` are identical** between these two commits.
- Therefore the POS source to package and upload is the current `apps/flame-chick-pos/` directory from `work/production-source-audit`; its contents match the validated `41c8aea` pin. Re-check the branch head and POS app subtree before building, in case another chat has made new app changes.
- **Important status distinction:** `41c8aea` is the current validated source candidate, not a READY Cloudflare build or deployment. No Cloudflare POS project has been created and no POS files have been uploaded to Cloudflare yet.

### POS app structure / build input facts

- It is a plain static HTML/CSS/JavaScript cashier application. Main entry point: `apps/flame-chick-pos/index.html` (title: “Flame Chick POS — Local First · Cashier”).
- Local modules currently used by the page include `catalog-v3.js`, `catalog-v3-deal-view.js`, `catalog-v3-adapter.js`, `sync-v3.js`, `payment-collection.js`, and `qz-printing.js`; public brand assets are under `assets/`.
- POS root currently has **no `package.json`, no project build script, and no `wrangler.jsonc`, `wrangler.toml`, `wrangler.json`, or `cloudflare.config.ts`**. Do not invent an existing Vite/React/Next build or copy another app's configuration.
- The app uses the same Flame Chick Production Supabase URL/publishable key and existing Production Edge Functions. Supabase remains the backend/database/auth/Realtime service; Cloudflare is the new POS web host and QZ signer runtime, not a replacement database.
- The browser expects the public QZ certificate at `/qz/digital-certificate.txt` and the authenticated signer endpoint at `POST /api/qz/sign` (with OPTIONS preflight).
- The current Node/Vercel implementation is `apps/flame-chick-pos/api/qz/sign.js` and helper `api/qz/certificate-utils.js`. This source uses `node:crypto`, `node:fs`, `node:path`, and reads `QZ_SIGNING_PRIVATE_KEY` from `process.env`; it is **not automatically a Cloudflare Worker handler**.
- The current public certificate file `qz/digital-certificate.txt` is the leaf certificate only. The root CA/trust material must remain outside the public asset bundle.

## 2. Connected Cloudflare account — verified 2026-11-27

- The connected Cloudflare identity is `itsfahadahmed1234@gmail.com`.
- The connection exposes one account: **“Itsfahadahmed1234@gmail.com's Account”** (standard account; account ID `831422f51dea96c387ae8917d451a6bf`). Reuse this connected account; do not ask the user for an API token or reconnect unless the connector itself reports an authorization problem.
- Account Workers subdomain: `itsfahadahmed1234`.
- A read-only check found no zones currently attached to this account.
- A read-only check found an existing separate Worker named `flame-chick-platform`, created from a Dashboard template, without static assets or custom routes. **Do not edit, repurpose, rename, deploy over, or delete this existing Worker.** The POS needs its own separate Worker/project.
- User's exact requested POS host/project label is **`flamechickpos`**.

**Hostname boundary:** The expected initial validation hostname is `flamechickpos.itsfahamed1234.workers.dev`. Cloudflare recommends a custom domain/route rather than `workers.dev` for business-critical production. The connected account currently has no zones attached, and the user supplied only the label `flamechickpos`, not a registered full domain/TLD. Use the workers.dev hostname for initial testing only; do not invent a suffix, purchase/register a domain, add a zone, or change DNS. Record the exact full custom production hostname after the user connects the zone/domain.

- The possible default workers.dev hostname for a Worker with this name is `flamechickpos.itsfahadahmed1234.workers.dev`. Treat this as a candidate/test hostname until confirmed after creation and deployment.
- The user has not supplied a full custom domain (there is no TLD suffix in `flamechickpos`) and the connected account currently has no zones. Do **not** invent `.com`, `.pk`, or another suffix; do not buy/register a domain, add a zone, move nameservers, create DNS records, or make custom-domain changes without the exact domain and explicit authorization. Ask one direct question only if a full custom hostname is required to complete a later production DNS cutover.

## 3. Hosting architecture to evaluate and implement

- For a new static/SPA/full-stack app, Cloudflare currently recommends **Workers + Workers Static Assets**, not a new Pages project or deprecated Workers Sites. The POS is an appropriate static-asset app with one small dynamic server endpoint for QZ signing.
- Use the connected Cloudflare account and create a **new, separate** Worker/project whose name/slug is `flamechickpos`.
- The static assets should serve the POS UI and public files. The Worker must intercept `/api/qz/sign` and handle OPTIONS/POST itself, then serve normal paths from the static asset binding. Preserve the existing browser URLs unless an evidenced reason requires a client change.
- Design a safe production asset output directory (for example, a generated `dist/`); it must contain only the whitelisted browser assets, HTML, SVGs, and the public leaf certificate. Do not expose the Node source handler, server-side helper, tests, repository files, build metadata, secrets, local trust files, or hidden files as static assets. Do not upload the entire monorepo.
- Build output should be reproducible from the committed source and documented in the repository. Inspect all files and URL references before writing the copy/build script. The current static app has no build step, so keep the first build simple and deterministic; do not introduce a heavyweight framework/bundler without a concrete need.
- No existing Wrangler configuration is present. The Cloudflare guidance says to use the `cf` CLI for a new project/no Wrangler configuration (or the connected Cloudflare app tools); do not blindly add Wrangler or use Wrangler commands unless the project is deliberately switched to that workflow and its current docs/version are checked. The installed Cloudflare CLI skill is not present in this session, so use the connected Cloudflare tool or current official `cf` documentation rather than guessing CLI syntax.

## 4. QZ Tray signer — mandatory server-side migration

The current browser requires a signer at `/api/qz/sign`. Port the existing contract to a Cloudflare Worker handler before declaring the new host production-ready:

- Keep the private key server-side as an **encrypted Cloudflare Worker secret** named `QZ_SIGNING_PRIVATE_KEY`. Never place it in HTML/JS, the assets directory, a plaintext `vars` entry, Git, GitHub Actions logs/artifacts, chat, or any public deployment file. Never retrieve/decrypt the existing Vercel secret as a shortcut; use the user's secure original key source to enter the new Cloudflare secret through the secure host interface.
- Keep Supabase staff authentication: validate the Bearer token against Supabase Auth, then obtain the authorized staff context from `flame-chick-order-api?view=staff_context`. Permit only active Admin, Owner, Manager, or Cashier staff with a valid branch ID. Never trust role/branch assertions sent from the browser.
- Preserve the signed request size cap (262,144 characters), POST/OPTIONS methods, strict HTTPS origin-only validation, no-store response headers, no-sniff header, plain-text Base64 signature response, and the `X-QZ-Signature-Verified: true` header when certificate matching is verified.
- Preserve the RSA-SHA512 signature contract expected by QZ Tray. The current Node implementation uses `crypto.sign('RSA-SHA512', ...)` and verifies the result against the public leaf certificate. Implement the equivalent with APIs supported by the Cloudflare Workers runtime (for example Web Crypto with the correct RSA padding/encoding) and regression-test it. Do not silently drop the signer-key/public-certificate match check or change the signature algorithm.
- The current Vercel handler's `node:fs` file read and `X509Certificate` API cannot simply be assumed to work in Workers. Review current Workers crypto/runtime support and choose a supported implementation for reading the public certificate and verifying the key/certificate match.
- The current Node handler has an in-memory per-isolate IP request bucket. Do not assume this becomes a reliable account-wide rate limit in Workers. Preserve protection using a Cloudflare-supported rate-limiting mechanism that is available on the chosen plan, or document/test an equivalent secure design. Do not disable throttling silently.
- Add the new exact Cloudflare host to the QZ signer CORS/origin allowlist and tests. Keep the existing Vercel origin entries during the migration/fallback window; do not weaken the HTTPS/origin validation.
- Do not enable physical/kitchen printing as part of hosting. Continue synthetic QZ signer diagnostics only until the cashier computer/printer physical-output, alignment, cutter and root-trust checks are separately completed.

## 5. Production backend already deployed — do not repeat

Production Supabase project `adkrxfnawdiljhjaavnj` is healthy in Mumbai on Free plan. The current backend rollout has already completed:
- Migration `20261127090208_flame_chick_delivery_payment_preference_v1` applied and verified.
- `flame-chick-order-api` v12 ACTIVE.
- `flame-chick-delivery-api` v4 ACTIVE.
- Catalog API v4 and Staff Admin v7 unchanged.
- Existing Production data preserved at rollout verification: 25 orders and 14 payments. No order/payment was created as part of deployment.
- The new POS History/payment preference UI depends on this deployed backend contract. Do not re-apply the migration or redeploy these functions unless a fresh source/schema comparison proves a new dependency.

## 6. Previous Vercel state — keep as fallback, stop relying on it for the new host

- Current old live POS URL: `https://flamechick-pos.vercel.app/`.
- Vercel project: `flame-chick-pos-development`, root `apps/flame-chick-pos`.
- Its production alias still points to older deployment `dpl_6VuqJfbd89a7f1V6TTVL6L6n2CEjP`, source commit `f6ce0ea49aeb165fec382280dcc3f90c4747a706`.
- The new Vercel deployment was blocked by the Free plan daily API deployment cap (`api-deployments-free-per-day`, >100, retry-after 86400 seconds); this is not the same counter as the 32-build/hour limit. The Ignored Build Step was restored to `exit 0`.
- The user has now connected Cloudflare specifically to avoid depending on Vercel for the POS host. **Do not trigger new Vercel deployments, pay to upgrade Vercel, or attempt to bypass its quota** as part of the Cloudflare migration.
- Keep the existing Vercel production alias live as a fallback until the Cloudflare deployment and POS functionality are verified and the user confirms the hostname/cutover. Do not delete Vercel projects, detach domains or change existing aliases during the initial Cloudflare setup.

## 7. Free-plan / reliability guardrails

- Verify the connected Cloudflare account's actual Workers plan and current limits before deployment. As documented on 2026-11-27, Workers Free lists 100,000 dynamic Worker requests/day, 10 ms CPU time per invocation, 128 MB memory, 50 subrequests/request, 20,000 static asset files per Worker version and 25 MiB per individual static asset. Static asset requests are free/unlimited; requests that execute the QZ signer Worker code count against dynamic Worker request/CPU limits. Measure the RSA signer against the Free CPU limit; do not assume it fits without testing. Re-check current limits at deployment time.
- No Cloudflare paid upgrade, billable add-on, extra service or plan change without user approval.
- Do not add D1, KV, R2, Durable Objects, Queues or a separate database unless a concrete requirement is discovered and explained. The existing POS uses IndexedDB locally and Supabase for shared backend state.
- No new Supabase project, schema, secrets, Edge Function, role, policy, or data changes are part of the hosting creation task unless explicitly justified and approved.
- Keep GST deferred, existing role boundaries, existing order/payment/idempotency behavior, branch context and Asia/Karachi operating assumptions intact.
- No real orders/payments/refunds/cancellations for host testing. No clearing browser storage or local pending POS orders.

## 8. Immediate next-session execution checklist

1. Read `PROJECT_HANDOFF.md`, this continuation handoff, `docs/handoffs/2026-11-27-history-payment-log-volume-followup.md`, `docs/handoffs/2026-11-27-pos-dine-in-takeaway-sync-followup.md`, `apps/flame-chick-pos/README.md`, and the QZ diagnostics/root trust handoffs.
2. Re-verify the current branch HEAD and compare the complete `apps/flame-chick-pos/` subtree with source pin `41c8aea80febd434048e50c352b386c01b02e7d4`. If changed, inspect and validate the new latest code before upload.
3. Re-check the connected Cloudflare account, Workers subdomain, zones and existing Workers. Do not touch the existing `flame-chick-platform` Worker.
4. Create a separate Cloudflare Workers project/Worker named exactly `flamechickpos` in the connected account. Use Workers Static Assets and a secure Worker route for `/api/qz/sign`; do not create Pages or a replacement Supabase backend.
5. Prepare a deterministic safe static asset build and a Worker-compatible QZ signer with private-key secret handling, verified RSA-SHA512/certificate match, staff authorization, CORS and rate limiting. Add tests before upload.
6. Deploy first to the new Worker hostname available on the account and perform read-only/synthetic smoke checks: HTML/assets load, Supabase Auth/session works, History/board reads work, API route rejects missing/invalid auth, authorized signer test verifies against public certificate, and no secrets appear in client assets/logs.
7. Deploy the reviewed result as the intended Cloudflare POS host after checks pass. Record the final deployed Worker version and hostname. Retain Vercel fallback while testing. Do not make a public custom-domain cutover until the exact full domain is known, verified and authorized.
8. Update `PROJECT_HANDOFF.md`, this continuation handoff and the focused POS handoffs with exact Cloudflare project/Worker/version/hostname, source SHA, tests and remaining cutover gates.

## 9. Current official Cloudflare references

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Static asset billing and limitations: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Workers Free limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- `workers.dev` subdomain behavior and production hostname guidance: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/ (Cloudflare recommends custom domains/routes for business-critical production).
- Free plan limits and static asset billing: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

The product recommendation and limit information above was checked against current Cloudflare documentation on 2026-11-27. Re-check docs and current account limits at execution time.
