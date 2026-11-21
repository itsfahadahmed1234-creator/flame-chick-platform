# Flame Chick handoff — Vercel GitHub Actions preview pipeline

Date: 2026-11-21
Branch: `work/production-source-audit`
Repository: `itsfahadahmed1234-creator/flame-chick-platform`

## Work completed

Four GitHub Actions workflows were added for the four separately created Vercel projects:

| App | Workflow | App root | Vercel project ID |
|---|---|---|---|
| Admin | `.github/workflows/deploy-flame-chick-admin-preview.yml` | `apps/flame-chick-admin` | `prj_139YvQ8CHvwSXsZ2xrno5x55STfz` |
| POS | `.github/workflows/deploy-flame-chick-pos-preview.yml` | `apps/flame-chick-pos` | `prj_gWdAt4laY3HDNPKRScmBWuYzQLmR` |
| Rider | `.github/workflows/deploy-flame-chick-rider-preview.yml` | `apps/flame-chick-rider` | `prj_YxlMceDeGpdVmMneGs5GhhPI2hbl` |
| Website | `.github/workflows/deploy-flame-chick-website-preview.yml` | `apps/flame-chick-website` | `prj_jwin4eFY0BXIgZUgcZGAuntybqkI` |

The workflows:
- Are limited to `work/production-source-audit`.
- Watch only their app's folder for push triggers and support manual dispatch on that branch.
- Deploy from each app's own static root.
- Use the existing Vercel Hobby team ID and the matching project ID.
- Use pinned GitHub Actions and Vercel CLI `65.17.0`.
- Deploy to Preview only with `vercel deploy --yes --target=preview`.
- Have no production deploy, promotion, custom-domain assignment, Supabase migration or release command.
- Fail closed unless their own repository Actions variable is exactly `true`.

## GitHub configuration still required

No secrets or repository variables have been created by this work. Before any preview deploy:
1. Create GitHub Environment `flame-chick-preview`.
2. Add a required reviewer to that environment; prevent self-review if available.
3. Add `VERCEL_TOKEN` only as an environment secret, scoped to the existing Vercel Hobby team where possible.
4. After the corresponding app readiness review, add exactly one repository Actions variable:
   - `FLAME_CHICK_ADMIN_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_RIDER_PREVIEW_DEPLOY_ENABLED=true`
   - `FLAME_CHICK_WEBSITE_PREVIEW_DEPLOY_ENABLED=true`

Keep the variables absent/false until app-specific approval. Do not put tokens, Supabase secret keys, or service-role keys into Git or chat.

## Readiness remains blocking

The app READMEs document outstanding prerequisites. In particular, production schema/menu/backend readiness is not complete; Staff Admin function and invitation acceptance route are outstanding; Admin modules beyond staff management remain disabled; POS checkout/dispatch, Rider assignment/return, and Website menu/checkout flows still need end-to-end testing.

Do not enable workflows solely because they have been committed. No deployment was triggered or created by this change.

## Related documentation

- [Vercel GitHub Actions deployment guide](../deployment/vercel-github-actions.md)
- [Vercel project setup and Git integration diagnosis](2026-11-21-production-vercel-projects.md)

## Safety boundaries preserved

- Existing GitHub login connection `befahad1234-cmyk` was not disconnected.
- Existing Vercel projects were not changed.
- New Vercel projects remain without Git integration, environment variables, or deployments.
- No repository transfer, Vercel plan upgrade, production deployment, DNS/custom-domain assignment, or Supabase change was made.
