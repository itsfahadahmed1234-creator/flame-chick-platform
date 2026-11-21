# GitHub Actions

The four application preview workflows are prepared but intentionally **disabled by default**:

- `.github/workflows/deploy-flame-chick-admin-preview.yml`
- `.github/workflows/deploy-flame-chick-pos-preview.yml`
- `.github/workflows/deploy-flame-chick-rider-preview.yml`
- `.github/workflows/deploy-flame-chick-website-preview.yml`

They deploy only to their separate Vercel projects, only from `work/production-source-audit`, and only to Vercel Preview (never Production). They run on app-folder pushes; manual dispatch is omitted until the workflows are present on the repository default branch. Each deploys from its own static app root.

Before enabling any workflow, follow [the Vercel GitHub Actions deployment guide](../../docs/deployment/vercel-github-actions.md). The app/backend readiness gates in each app README still apply. Do not enable deployment simply because the workflow exists.

Database backups belong in the separate private `flame-chick-backups` repository, not in this application repository. Never add backup archives or credentials here.
