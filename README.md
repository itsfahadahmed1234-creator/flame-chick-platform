# Flame Chick Platform

Source repository for the Flame Chick customer Website, POS, Admin panel, Rider portal, and shared Supabase backend.

## Start every new work session here

1. Read [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the project-wide history, decisions, Supabase state and safety rules. It is a large historical handoff; use its headings and search to find the latest relevant checkpoints.
2. Read the [Website context index](docs/handoffs/WEBSITE_PARALLEL_CONTEXT_INDEX.md).
3. Read the latest [new FahaD Website Production environment handoff](docs/operations/2026-11-26-new-vercel-website-production-handoff.md).
4. Read the current [27 November Website UI reliability continuation handoff](docs/handoffs/2026-11-27-website-ui-reliability-next-session.md), including the completed OpenCode Playwright findings and exact pending correction plan.
5. Read the complete [Website parallel-development audit](docs/handoffs/2026-11-25-website-parallel-audit.md) before editing Website code.

The 26 November new-environment handoff supersedes older Website Vercel project IDs, hostnames and Preview-only deployment instructions. The earlier [one-step checkout addendum](docs/operations/2026-11-26-website-preview-one-step-checkout.md) remains historical context, not the current hosting configuration. The earlier [local-preview fixture checkpoint](docs/operations/2026-11-23-local-preview-fixture-checkpoint.md) remains relevant only to its synthetic local test harness.

## Current platform

- **Supabase Production:** Flame Chick Production
- **Project ref:** \`adkrxfnawdiljhjaavnj\`
- **Region:** Mumbai (\`ap-south-1\`)
- **Plan:** Free
- **Backend:** shared by the four applications.

The top-level Production handoff records the seven operational migrations as applied on 24 November 2026, bringing the recorded Production migration count to 33. That is a dated handoff checkpoint, not proof of the current live state. Before any Place Order runtime test, independently verify the live schema, relevant RPCs, active Edge Function version, server-only secrets (presence only), branch website flags and delivery configuration using read-only checks. Older Website notes contain statements that the schema was not yet migrated; treat those statements as superseded by the newer Production migration checkpoint, while still verifying the live system.

## Active Website environment

The selected Website target is the READY Vercel Production deployment documented in [the current environment handoff](docs/operations/2026-11-26-new-vercel-website-production-handoff.md). It belongs to the separate FahaD Hobby team and uses the Website root directory \`apps/flame-chick-website\`.

The requested custom hostname \`flamechick.vercel.app\` is not attached to this project. Do not assume it is available or remove it from another project. The customer Place Order path is the next task; the current deployment must not be described as fully production-ready until that path is diagnosed and verified.

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
