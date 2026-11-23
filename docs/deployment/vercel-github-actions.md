# Flame Chick — Vercel Preview Deployment Targets

Date: 2026-11-23  
Repository: `itsfahadahmed1234-creator/flame-chick-platform`  
Working branch: `work/production-source-audit`

## Verified Vercel target mapping

Vercel team: `fahad-7455` (`team_Rpf9jeGg9r3cmMguFXHtziqz`).

| App | Vercel project | Project ID | App root |
|---|---|---|---|
| Website | `flame-chick-website-production` | `prj_izBWyrFmPZIm63FHAT4jaLHUTLzu` | `apps/flame-chick-website` |
| Admin | `flame-chick-admin-production` | `prj_kPEqsepRzivOJhNeA32Io3netjav` | `apps/flame-chick-admin` |
| POS | `flame-chick-pos-production` | `prj_gh1UnkZKnFnehWEs5eYhiXa40Xj5` | `apps/flame-chick-pos` |
| Rider | `flame-chick-rider-production` | `prj_U3djCTfZK0Ubl808umChQn7MPPNg` | `apps/flame-chick-rider` |

All four Vercel project records are linked to the GitHub repository `itsfahadahmed1234-creator/flame-chick-platform`. The project detail records show SSO protection enabled, no custom domains and no latest deployment. The project deployment lists were empty at the time of this checkpoint.

## Workflow behavior

- `.github/workflows/deploy-flame-chick-website-preview.yml`
- `.github/workflows/deploy-flame-chick-admin-preview.yml`
- `.github/workflows/deploy-flame-chick-pos-preview.yml`
- `.github/workflows/deploy-flame-chick-rider-preview.yml`

Each workflow is pinned to `work/production-source-audit`, runs from its app working directory, and uses `vercel@65.17.0` with `--target=preview`. No production deployment, domain assignment or promotion command is present.

## Required GitHub configuration (not yet configured)

Each workflow uses a fail-closed gate. Before any preview is deployed, the repository owner must configure:

1. GitHub Environment `flame-chick-preview`, with a required reviewer.
2. Environment secret `VERCEL_TOKEN`, scoped to the verified Vercel team.
3. Repository Actions variables:
   - `FLAME_CHICK_WEBSITE_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_ADMIN_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_RIDER_PREVIEW_DEPLOY_ENABLED=true`

Do not set an app variable until that app's backend and app-specific readiness gate passes. The GitHub connector available during this checkpoint could not create Actions secrets or variables. The deployment workflows therefore skipped; do not report them as deployed.

## Current limitations

- Vercel project environment variable listings were empty. App configuration currently embeds only public Supabase URL/publishable key values; no service-role/secret key is included in the apps.
- An update request was sent to set each Vercel project root directory to its app root. The project-summary API response omits `rootDirectory`, so the setting could not be independently verified; the workflows explicitly use each app's working directory.
- No Vercel deployment exists yet.
- Deployment of the customer website, POS and Rider is not a functional release until their required Supabase Edge Functions and operational database tables/RPCs are implemented and verified.
- Admin's current production Staff Admin Edge Function is version 1; the current Catalog V3 function source has not been deployed.
- Keep the SSO protection enabled for previews. No custom domain or production alias changes are authorized by this document.

## Release policy

Production database migrations/import/publication, Edge Function replacement, Auth/Storage/Realtime configuration, custom domains, Vercel production deploy/promotion and checkout activation require a separate reviewed and approved release step. Keep `main` untouched until the PR/release review is completed.
