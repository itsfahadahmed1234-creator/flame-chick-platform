# Flame Chick — GitHub Actions to Vercel Preview Deployments

Date: 2026-11-21
Branch: `work/production-source-audit`
Repository: `itsfahadahmed1234-creator/flame-chick-platform`

## Why this pipeline exists

Vercel's current GitHub login connection cannot see the private production repository under the second personal GitHub account. Rather than disconnect the existing GitHub account, transfer repository ownership, make the repository public, or upgrade the Vercel Hobby plan, these four new Vercel projects can be deployed through the Vercel CLI from GitHub Actions.

This setup is preview-only. It does not configure Vercel Git integration.

## Vercel targets

All targets are in the existing Vercel Hobby team `team_lrFy9ILYEz9umsBy98GCyQjI`.

| App | Local app root | Vercel project | Project ID |
|---|---|---|---|
| Admin | `apps/flame-chick-admin` | `flame-chick-admin-production` | `prj_139YvQ8CHvwSXsZ2xrno5x55STfz` |
| POS | `apps/flame-chick-pos` | `flame-chick-pos-production` | `prj_gWdAt4laY3HDNPKRScmBWuYzQLmR` |
| Rider | `apps/flame-chick-rider` | `flame-chick-rider-production` | `prj_YxlMceDeGpdVmMneGs5GhhPI2hbl` |
| Website | `apps/flame-chick-website` | `flame-chick-website-production` | `prj_jwin4eFY0BXIgZUgcZGAuntybqkI` |

The Vercel team ID is used as `VERCEL_ORG_ID`; project IDs are pinned in their corresponding workflow files.

## Workflow behavior

- Admin: `.github/workflows/deploy-flame-chick-admin-preview.yml`
- POS: `.github/workflows/deploy-flame-chick-pos-preview.yml`
- Rider: `.github/workflows/deploy-flame-chick-rider-preview.yml`
- Website: `.github/workflows/deploy-flame-chick-website-preview.yml`

Each workflow:
- Runs only on `work/production-source-audit`.
- Watches only its app folder for push-triggered runs and supports manual dispatch on that branch.
- Has an explicit fail-closed repository Actions variable gate.
- Uses the shared GitHub Environment `flame-chick-preview`.
- Uses pinned GitHub Actions and Vercel CLI `65.17.0`.
- Deploys only with `--target=preview`; no production deploy, promotion, domain assignment, Supabase migration, or production release command exists.
- Deploys from its app's own static root.
- Reads the Vercel token only from the protected GitHub Environment secret. No token is stored in Git.

## Required GitHub configuration — not yet performed

Before a preview workflow can deploy:

1. Open repository Settings → Environments and create `flame-chick-preview`.
2. Add at least one required reviewer (the release owner); prevent self-review if available. Do not bypass protection rules.
3. Add the secret `VERCEL_TOKEN` to this environment. Create a Vercel token scoped to the existing Hobby team where possible. Never paste it into chat, source, workflow files, or logs.
4. In repository Settings → Secrets and variables → Actions → Variables, create only the app-specific variable after that app passes its readiness review:
   - Admin: `FLAME_CHICK_ADMIN_PREVIEW_DEPLOY_ENABLED=true`
   - POS: `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true`
   - Rider: `FLAME_CHICK_RIDER_PREVIEW_DEPLOY_ENABLED=true`
   - Website: `FLAME_CHICK_WEBSITE_PREVIEW_DEPLOY_ENABLED=true`

   Keep all four variables absent or false until their app-specific review. These must be repository-level Actions variables: job-level conditions need to evaluate them before environment approval.
5. Verify the Vercel token has access to the intended team and all four project IDs. Do not add Supabase secret/service-role keys to GitHub Actions; browser apps must use only the public publishable key.

GitHub Actions secrets and variables are configured by the repository owner/maintainer. This setup does not claim they have been created.

## Readiness gates — do not bypass

The workflow existing does not mean an app is production-ready. Current app documentation records:
- Production schema/menu/backend migrations are not yet fully complete and verified.
- Staff Admin Edge Function is not deployed, and invitation acceptance route is outstanding.
- Admin dashboard, orders, menu, deals, delivery, media and settings APIs are incomplete; those panels remain disabled.
- POS needs schema/menu, branch/staff-role setup and controlled checkout/dispatch end-to-end testing.
- Rider needs Production onboarding/Auth/role/profile setup and full assignment-to-return workflow testing.
- Website needs schema, published menu, storage assets, delivery areas and checkout/availability testing.

Enable one preview gate only after its app-specific review. Keep Vercel SSO protection enabled while testing.

## Validation and release policy

- The current working branch is the only permitted deployment source. Do not merge these workflows into `main` or widen branch filters without a separate release approval.
- Preview deployments are for protected QA only. Verify the generated URL is HTTPS on `.vercel.app` and test functionality, authentication, CORS and role isolation.
- No production deployment or custom domain assignment is authorized by this pipeline.
- Before designing a production pipeline, establish protected `main`, required checks, a production environment with reviewers, final custom domains, per-app environment configuration, rollback plan and release approval.
- Never deploy Supabase migrations from these app workflows. Database changes require a separate reviewed and approved migration process.
- Do not put customer, order, staff, rider or operational data in build artifacts.

## Current status

- Four new Vercel projects exist and were verified in the intended Hobby team.
- No Git integration is connected to those projects.
- No deployment has been made.
- No Vercel token, GitHub Environment secret, repository variable, or app environment variable has been created by this setup.
- Four workflow files have been committed to `work/production-source-audit` with deploy-enable variables absent by default.
- Existing Vercel projects and the existing `befahad1234-cmyk` GitHub connection were not changed.
