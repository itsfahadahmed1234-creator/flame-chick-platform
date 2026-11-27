# Flame Chick Platform

Source repository for the Flame Chick customer Website, POS, Admin panel, Rider portal, and shared Supabase backend.

## Start every new work session here

1. Read [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the project-wide history, decisions, Supabase state and safety rules. It is a large historical handoff; use its headings and search to find the latest relevant checkpoints.
2. Read the newest [Cloudflare hosting transition handoff](docs/operations/2026-11-27-cloudflare-hosting-transition-handoff.md) for the verified GitHub connection, failed Worker build, four Pages setup plan and latest Vercel Production source.
3. Read the [Website context index](docs/handoffs/WEBSITE_PARALLEL_CONTEXT_INDEX.md).
4. Read the [27 November Website UI reliability continuation handoff](docs/handoffs/2026-11-27-website-ui-reliability-next-session.md), including the completed OpenCode Playwright findings and pending correction plan.
5. Read the [26 November FahaD Website Production environment handoff](docs/operations/2026-11-26-new-vercel-website-production-handoff.md) for the earlier Vercel environment history.
6. Read the complete [Website parallel-development audit](docs/handoffs/2026-11-25-website-parallel-audit.md) before editing Website code.

The 27 November Cloudflare transition handoff is the newest hosting record. The Customer Website now runs on Cloudflare Pages at flamechick.pages.dev; Vercel C57 remains available and unchanged as fallback. POS hosting is managed by a separate conversation; Admin and Rider Cloudflare hosting remain pending. The 26 November Vercel handoff retains historical project/domain context. The earlier [one-step checkout addendum](docs/operations/2026-11-26-website-preview-one-step-checkout.md) remains historical checkout context, not the active hosting configuration. The [local-preview fixture checkpoint](docs/operations/2026-11-23-local-preview-fixture-checkpoint.md) remains relevant only to its synthetic local test harness.

## Current platform

- **Supabase Production:** Flame Chick Production
- **Project ref:** \`adkrxfnawdiljhjaavnj\`
- **Region:** Mumbai (\`ap-south-1\`)
- **Plan:** Free
- **Backend:** shared by the four applications.

The top-level Production handoff records the seven operational migrations as applied on 24 November 2026, bringing the recorded Production migration count to 33. That is a dated handoff checkpoint, not proof of the current live state. Before any Place Order runtime test, independently verify the live schema, relevant RPCs, active Edge Function version, server-only secrets (presence only), branch website flags and delivery configuration using read-only checks. Older Website notes contain statements that the schema was not yet migrated; treat those statements as superseded by the newer Production migration checkpoint, while still verifying the live system.

## Active Website environment

- **Cloudflare Pages Production:** project flamechick, https://flamechick.pages.dev/
- **Production branch:** work/website-reliability-phase1-review
- **Deployed commit:** 2a63046e1e5d81ced272acc08b17c1a3021b779d
- **Deployment:** 07297e8b-e79d-46ae-9696-78be7f28c7f8 (READY; all Cloudflare stages successful)
- **Vercel fallback:** project flame-chick-website-production; unchanged Production deployment dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy, commit c57be50d1674e597693117d1f39867c4c042f43a.

The new Pages hostname has an exact allowlist entry for Website order writes; arbitrary Pages previews/deployment hostnames remain blocked. The user has confirmed that the live Website interactions work and that submitted Website orders reach POS. Treat this as user-verified operational behaviour; the assistant has not independently inspected POS order records. Do not submit Place Order or Retry against Production without a separately approved safe test procedure. No DNS/domain cutover has occurred.

## Repository layout

\`\`\`text
apps/
  flame-chick-website/
  flame-chick-pos/
  flame-chick-admin/
  flame-chick-rider/
supabase/
  config.toml
  functions/
  migrations/              # Production migrations only
  demo-reference/          # Historical Demo SQL; never push automatically
docs/
  architecture/
  deployment/
  handoffs/
  operations/
\`\`\`

## Vercel project roots

| App | Root Directory |
|---|---|
| Customer Website | \`apps/flame-chick-website\` |
| POS | \`apps/flame-chick-pos\` |
| Admin | \`apps/flame-chick-admin\` |
| Rider portal | \`apps/flame-chick-rider\` |

Keep the four apps separate. Do not change POS, Admin or Rider projects while working on the Website Place Order task.

## Supabase and application security

All browser apps use the Production project URL and a **publishable** key only. Never put a Supabase secret/service-role key in browser code, Git, client-side Vercel variables or documentation.

Privileged Edge Functions read credentials from Supabase Function Secrets. Do not paste secret values into chat or documentation; verify presence without printing values.

- Function source is in \`supabase/functions/\`.
- Only reviewed Production SQL belongs in \`supabase/migrations/\`.
- Historical Demo migrations are archived under \`supabase/demo-reference/migrations/\` and must never be pushed to Production.

## Current hosting transition

The Customer Website is now deployed to Cloudflare Pages Production:

- Pages project: flamechick
- Production URL: https://flamechick.pages.dev/
- Immutable deployment URL: https://07297e8b.flamechick.pages.dev/
- Project ID: 5daf4460-c018-4115-af98-3093e2b280ef
- Production deployment ID: 07297e8b-e79d-46ae-9696-78be7f28c7f8
- Production branch: work/website-reliability-phase1-review
- Exact deployed commit: 2a63046e1e5d81ced272acc08b17c1a3021b779d
- Build root: apps/flame-chick-website
- Build command: blank (plain static HTML/CSS/JavaScript)
- Output directory: .
- GitHub source: itsfahadahmed1234-creator/flame-chick-platform
- Production deployments enabled; Website Preview branch: work/website-parallel-development
- Build watch include: apps/flame-chick-website/*; exclusions: none

The matching Website Static Checks run 45981432738 passed for the exact deployed commit. Cloudflare reports queued, initialize, clone_repo, build and deploy all successful, and this deployment is canonical Production. The project has no Pages environment variables: browser code uses only the existing Supabase Production URL and public publishable key.

The prior Pages project has been retained as flamechick-legacy at https://flame-chick-website.pages.dev/. Its existing deployment was preserved, and new automatic Production/Preview deployments have been disabled so it does not duplicate builds. Vercel Website Production is also still online and unchanged as fallback: deployment dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy, commit c57be50d1674e597693117d1f39867c4c042f43a, branch work/website-parallel-development.

The new Pages hostname was added to the strict checkout-host allowlist. The old Pages hostname remains allowed, while arbitrary Pages preview/deployment hostnames remain blocked. No Place Order or Retry action has been used. The new hostname has not yet had a full interactive browser/checkout walkthrough; treat the Cloudflare deployment API as verified and the interactive application smoke test as pending.

POS is managed in a separate conversation; do not touch its Worker, app code or deployment. Admin and Rider hosting remain pending. Keep Vercel intact and do not change DNS or customer domains without explicit approval.

## Deployment discipline

The Website Vercel project is connected to this shared Git repository. A Git push can create a Vercel deployment automatically. The user requires minimal deployments: do not trigger manual/API/CLI deployments, promote deployments, or retry failed deployment requests without explicit approval. Before any source push, check whether it will automatically deploy the Website project. Prefer local/static tests first and group related changes into one reviewed change. A docs-only change is not a reason to deploy the Website.

Before changing Production data, applying migrations, deploying Edge Functions, changing domains or testing a live Place Order submission, verify the exact target and obtain approval for that operation.

## Local work

These applications are plain HTML/CSS/JavaScript. For the synthetic local catalogue preview, use the [loopback-only fixture runbook](docs/operations/local-catalog-preview-fixture.md). It is separate from the Production-backed customer storefront.

For Supabase CLI reference:

\`\`\`bash
supabase --help
supabase status
supabase migration list
\`\`\`

## Source history and separation

The repository is the canonical Flame Chick application source. Preserve the separate historical repository/branches as source archives; do not merge, cherry-pick, reset or overwrite parallel Production/POS work without explicit approval.

## Security

See [SECURITY.md](SECURITY.md). Never commit \`.env\`, \`.env.local\`, Vercel tokens, OIDC tokens, database passwords, Supabase secret keys, service-role keys, signing keys or recovery codes.
