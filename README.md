# Flame Chick Platform

Private source repository for the Flame Chick customer website, POS, Admin panel, Rider portal, and Supabase backend.

## Project handoff

Start every new work session with [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). It records the verified project context, safety rules, current branch/stage, completed work, known risks, and next implementation steps. The latest local-preview stage is recorded in this [handoff addendum](docs/operations/2026-11-23-local-preview-fixture-checkpoint.md). Keep both current as the project changes.

## Current platform

- **Supabase Production:** `Flame Chick Production`
- **Project ref:** `adkrxfnawdiljhjaavnj`
- **Region:** Mumbai (`ap-south-1`)
- **Plan:** Free
- **Shared backend:** all four applications will use this one Production project.

The Production project has been created and its initial security baseline has been applied. The application schema, menu, production delivery configuration, and Edge Functions are **not yet migrated and verified**. Do not deploy these application roots to the active Vercel projects until the backend migration and end-to-end checks are complete.

## Repository layout

```text
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
  operations/
.github/
```

## Vercel project roots

| Vercel project | Root Directory |
|---|---|
| Customer website | `apps/flame-chick-website` |
| POS | `apps/flame-chick-pos` |
| Admin | `apps/flame-chick-admin` |
| Rider portal | `apps/flame-chick-rider` |

Keep the existing Vercel project settings and deployments unchanged until migration is ready. Each project must be connected to this repository and its corresponding root directory before changing its Git source.

## Supabase

All browser clients use the Production project URL and a **publishable** key only. Never put a Supabase secret/service-role key in browser code, Git, Vercel client-side variables, or documentation.

Edge Functions that need privileged database access read secrets from the Supabase Function Secrets store. Set these values in the Supabase Dashboard or another approved secret manager; do not commit them.

- Function source is in `supabase/functions/`.
- Only reviewed Production SQL belongs in `supabase/migrations/`.
- The original Demo migrations are archived under `supabase/demo-reference/migrations/` for audit/reference. They contain Demo-specific behavior and must **not** be applied directly to Production.

## Local work

These apps are currently plain HTML/CSS/JavaScript applications. Open each app folder with a static web server or use its Vercel preview after the backend is ready.

For a browser-only review of the separate V3 menu preview, use the [loopback-only synthetic fixture runbook](docs/operations/local-catalog-preview-fixture.md). That harness is outside the Website Vercel root, does not load the production config, and uses artificial catalog data only.

For Supabase CLI work:

```bash
supabase --help
supabase status
supabase migration list
```

Before applying or deploying anything to Production, review the migration, verify the target project ref, and obtain the required change approval.

## Source history and separation

The first organized source snapshot is based on the latest Flame Chick storefront branch in the previous shared repository. HFP/Pizza Bite applications, SQL migrations, secrets, customer/order data, and unrelated files are intentionally excluded.

The original repository and its branches remain unchanged as a source archive until the new repository and Vercel connections are fully verified.

## Security

See [SECURITY.md](SECURITY.md). Do not commit `.env`, `.env.local`, Vercel OIDC tokens, database passwords, Supabase secret keys, service-role keys, signing keys, or recovery codes.
