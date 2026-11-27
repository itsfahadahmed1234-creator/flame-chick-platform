# Flame Chick Website — Current Environment Index

> Entry point for continuing the customer Website. Read the linked handoffs and establish an overview before editing code.

## Latest hosting checkpoint — 27 November 2026 — Website on flamechick.pages.dev

Customer Website Cloudflare Pages Production is now READY:
- Project flamechick; ID 5daf4460-c018-4115-af98-3093e2b280ef.
- URL https://flamechick.pages.dev/.
- Canonical deployment 07297e8b-e79d-46ae-9696-78be7f28c7f8; immutable URL https://07297e8b.flamechick.pages.dev/.
- Branch work/website-reliability-phase1-review; deployed commit 2a63046e1e5d81ced272acc08b17c1a3021b779d.
- Build root apps/flame-chick-website; blank build command; output directory .; GitHub source itsfahadahmed1234-creator/flame-chick-platform.
- Production auto-deploy enabled; preview branch work/website-parallel-development; path include apps/flame-chick-website/*.
- Matching Website Static Checks run 45981432738 passed.
- Exact flamechick.pages.dev hostname is allowed by the strict checkout guard; arbitrary Pages previews stay blocked.
- The old Pages URL remains preserved under flamechick-legacy, with automatic deployments disabled. Vercel C57 remains unchanged fallback.
- Cloudflare API deployment stages all passed. The earlier Pages hostname rendered the catalogue in-browser; full interactive testing of the new hostname and checkout/API connectivity remain pending. Do not click Place Order/Retry on Production without a separately approved procedure.
- POS is handled in another conversation. Admin/Rider remain pending. Supabase and DNS/Vercel are unchanged.

## Historical hosting checkpoint — 27 November 2026 — initial Cloudflare Git connection and Pages plan

Read [Cloudflare hosting transition handoff](../operations/2026-11-27-cloudflare-hosting-transition-handoff.md) first for the exact connection state and next steps. Cloudflare is authenticated to the expected account and has confirmed the GitHub repository connection through a Workers Build configuration. That first resource is a Worker, not Pages, and its build failed because Wrangler could not find a static assets directory at the repository root. The Pages project inventory remains empty. Create four separate Pages projects for the Website, POS, Admin and Rider apps; do not repeat the root-level Worker deployment setup.

Latest verified Vercel Website Production remains deployment `dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy`, READY / Production, branch `work/website-parallel-development`, commit `c57be50d1674e597693117d1f39867c4c042f43a`. A newer project-level `latestDeployment` is only a Preview from `work/production-source-audit`; it is not Production. Keep Vercel available until all four Cloudflare Pages apps are built, smoke-tested and the user approves cutover.

A newer Website reliability candidate exists on `work/website-reliability-phase1-review` at `9bd5f81ca59d80da7192c96d6aa8e694bfbb03e5`; matching Website CI passed, but the candidate is not live Vercel Production and must be compared/reconciled before Cloudflare Production release. Do not blindly deploy `main`, C57 or unrelated POS/production-source-audit work.

## Historical UI audit checkpoint — 27 November 2026 — before reliability release

The live customer Website was tested by OpenCode with Playwright/Chrome at 1440×900, 390×844, 360×800 and 320×568. The production snapshot used for the audit is commit `c57be50d1674e597693117d1f39867c4c042f43a` and deployment URL `https://flame-chick-website-production.vercel.app`. The audit confirmed 10 UI defects (C1–C10), while catalogue selection, cart calculations, fulfilment switching and delivery-fee calculations passed. No source files, cookies/storage or Production data were changed; no Place Order/Retry action or non-GET request occurred. Read the new [27 November Website UI reliability continuation handoff](2026-11-27-website-ui-reliability-next-session.md) for exact findings, source causes, test coverage and the phased correction plan. The prior [source/catalogue/API audit](../audits/FLAME_CHICK_WEBSITE_AUDIT_2026-11-27.md) remains complementary background.

The original C57 audit is historical evidence. The Website reliability candidate was subsequently reviewed, updated and deployed to Cloudflare as recorded above. Do not repeat the old 'corrections pending' wording as current. Full interactive functional QA remains outstanding.

## Read-first sequence

1. Read the repository root [PROJECT_HANDOFF.md](../../PROJECT_HANDOFF.md) and repository [README](../../README.md).
2. Read the latest [Cloudflare hosting transition handoff](../operations/2026-11-27-cloudflare-hosting-transition-handoff.md).
3. Read this Website context index.
4. Read the [27 November Website UI reliability continuation handoff](2026-11-27-website-ui-reliability-next-session.md) for current Playwright findings and pending fixes.
5. Read the [26 November FahaD Website Production environment handoff](../operations/2026-11-26-new-vercel-website-production-handoff.md) for prior environment history, using the newer Cloudflare handoff for current deployment identities.
6. Read the complete [25 November Website parallel-development audit](2026-11-25-website-parallel-audit.md) for the Website architecture and file map.
7. Use the earlier [Preview/one-step checkout addendum](../operations/2026-11-26-website-preview-one-step-checkout.md) as historical context only; its Vercel project/team/host details are superseded.

**Before making changes:** provide the user with a concise, evidence-based project overview, state which exact deployment and branch are active, identify relevant dependencies and unresolved risks, and confirm the proposed Place Order fix scope. Do not start by rebuilding the Website or making speculative edits.

## Repository and branch

- Repository: [itsfahadahmed1234-creator/flame-chick-platform](https://github.com/itsfahadahmed1234-creator/flame-chick-platform)
- Website source branch: \`work/website-parallel-development\`
- Website root: \`apps/flame-chick-website\`
- Other work exists on \`work/production-source-audit\`; do not switch, merge, rebase, cherry-pick or overwrite it.

The current source checkpoint used by the selected Production deployment is recorded in the latest environment handoff. After documentation updates, the branch HEAD may move while the deployed Website remains on its previously verified source commit; always report both separately.

## Selected Vercel target

The user explicitly selected the exact READY Production-target deployment URL in the latest environment handoff. Continue reviewing that same URL. A separate Preview deployment was created from \`work/production-source-audit\`; it is not the user's selected target. Do not confuse the project's \`latestDeployment\` with the exact Production deployment the user named.

## Next task: diagnose and fix Place Order

The leading source-level finding is that the current exact-host checkout guard does not include the new FahaD Production deployment hostname. On the deployment's source commit, \`preview-checkout-guard.js\` allows only \`flamechick.vercel.app\` as a Production order host plus two old Preview hosts. The new deployment host is absent, so \`canSubmitOrders()\` will return false and the V3 controller blocks non-GET Order API requests. Verify this against the rendered page and browser runtime before changing the guard.

Inspect, at minimum:

- \`apps/flame-chick-website/js/preview-checkout-guard.js\`
- \`apps/flame-chick-website/js/website-order-v3.js\`
- \`apps/flame-chick-website/js/config.js\`
- \`apps/flame-chick-website/index.html\` and its script loading order
- \`supabase/functions/flame-chick-order-api/index.ts\`
- the Production SQL/RPC and deployed Edge Function state, read-only first.

Preserve the one-step contract: the browser submits one \`place_website_order\` request with catalog IDs and customer/fulfilment details; the server freshly validates the published menu, current prices, availability, branch and delivery charge, enforces idempotency/rate limits, and commits through the server-side database RPC. Retries must preserve the same request ID. Never accept a browser-supplied total as authoritative, bypass server validation, weaken RLS, expose service-role credentials or remove idempotency controls.

A successful Place Order request writes a real order to Production and sends it to the live POS. Do not submit an order during diagnosis without the user's explicit approval for that live test. For an approved rehearsal, keep the test marker \`[TEST ORDER - ADMIN DELETE]\`, confirm the user understands it is a real Production order, and have Admin remove rehearsal orders before the first customer is invited.

## Hard boundaries

- Minimal Vercel deployments. No deployment, promotion, domain switch or retry without explicit user approval. Git pushes to the connected repository may auto-trigger deployments; check this before pushing.
- Work only on the customer Website unless a shared-backend issue is found. Do not independently change POS, Admin, Rider, shared pricing/catalogue modules, Edge Functions, migrations or database schema without explaining the dependency and obtaining the required approval.
- The new Vercel environment is separate from the previous Vercel account/team. Do not reuse old project IDs or old team IDs.
- \`flamechick.vercel.app\` remains unattached/unresolved; do not claim it points to the new project.
- Production Supabase is the intended backend; there is no staging Supabase environment for this work.
- GST/tax implementation remains deferred.

## Completion criteria for this task

The Place Order button must behave correctly on the selected URL; the UI must explain validation failures accurately; one request must create at most one order; uncertain retries must not duplicate; server-side pricing and delivery checks must remain authoritative; and POS receipt of the order must be verified under an approved test procedure. Do not call it production-ready merely because the button becomes enabled.


## Current working method — OpenCode browser QA

The user uses OpenCode + DeepSeek 4.1 Flash with Playwright/Chrome because ChatGPT Work mode is not available in their Free-mode setup. Use OpenCode for active browser interaction and return screenshots, JSON evidence, console/network results and exact reproduction steps. ChatGPT should read the evidence, inspect current repository source, guide changes and verify that tests match the intended behaviours. Do not tell the user to switch to Work mode.

The OpenCode audit completed read-only on 27 November 2026. Its full findings and test matrix are in [the current Website continuation handoff](2026-11-27-website-ui-reliability-next-session.md). No application code corrections from C1–C10 have been implemented just by recording that handoff.
