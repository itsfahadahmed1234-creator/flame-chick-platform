# Flame Chick Website — Current Environment Index

> Entry point for continuing the customer Website. Read the linked handoffs and establish an overview before editing code.

## Read-first sequence

1. Read the repository root [PROJECT_HANDOFF.md](../../PROJECT_HANDOFF.md). It is a large historical record; search its current checkpoints and project-wide decisions instead of treating old statements as current.
2. Read this index.
3. Read the current [26 November FahaD Website Production environment handoff](../operations/2026-11-26-new-vercel-website-production-handoff.md).
4. Read the complete [25 November Website parallel-development audit](2026-11-25-website-parallel-audit.md) for the Website architecture and file map.
5. Use the earlier [Preview/one-step checkout addendum](../operations/2026-11-26-website-preview-one-step-checkout.md) as historical context only; its Vercel project/team/host details are superseded.

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
