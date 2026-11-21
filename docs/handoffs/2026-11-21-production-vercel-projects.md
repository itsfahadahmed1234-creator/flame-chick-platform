# Flame Chick — Production Vercel project setup
Date: 2026-11-21
Repository: itsfahadahmed1234-creator/flame-chick-platform
Branch: work/production-source-audit
Current source commit before this update: e21ab984f70c7a0b7e97a85142ce5c0a2ac60229
Supabase Production: adkrxfnawdiljhjaavnj (Mumbai ap-south-1, Free plan)

## Created Vercel projects

Four separate, empty Vercel projects were created in the existing Vercel Hobby team. Each project was verified by ID after creation.

| App | Vercel project | Project ID | Root directory |
|---|---|---|---|
| Admin | flame-chick-admin-production | prj_139YvQ8CHvwSXsZ2xrno5x55STfz | apps/flame-chick-admin |
| POS | flame-chick-pos-production | prj_gWdAt4laY3HDNPKRScmBWuYzQLmR | apps/flame-chick-pos |
| Rider | flame-chick-rider-production | prj_YxlMceDeGpdVmMneGs5GhhPI2hbl | apps/flame-chick-rider |
| Website | flame-chick-website-production | prj_jwin4eFY0BXIgZUgcZGAuntybqkI | apps/flame-chick-website |

## Important boundaries

- These projects were created as independent production-named projects. The legacy Vercel projects were not modified, disconnected, renamed, or deleted.
- No Git repository is connected to the new projects yet.
- No deployments were created. Each project's latestDeployment remains null.
- No environment variables or secrets were added.
- No custom URLs or custom domains were configured. Vercel automatically assigned its default generated domains:
  - flame-chick-admin-production.vercel.app
  - flame-chick-pos-production.vercel.app
  - flame-chick-rider-production.vercel.app
  - flame-chick-website-production.vercel.app
  These are generated defaults, not the final custom production URLs.
- The project root directories were set to the corresponding monorepo app folders.
- Vercel team is Hobby: team_lrFy9ILYEz9umsBy98GCyQjI.
- All four projects retain Vercel's default SSO protection for all except custom domains; keep this protection until intended production URLs and access model are confirmed.
- No changes were made to existing project flame-chick-admin, flamechic-pos, flamechicks, or flamechicksrider, which remain linked to the old be fahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS repository.

## GitHub/Vercel access verification — 2026-11-21

- User reported completing installation of the Vercel GitHub App on the GitHub account that owns the private production repository.
- Rechecked Vercel Git namespaces after that step. The Vercel connection still exposes only the GitHub namespace be fahad1234-cmyk; the production repository owner namespace is not present in that result.
- Searched Vercel's connected Git repositories for flame-chick-platform; the result was empty.
- The previous Vercel Git-linked project creation attempt returned repo_not_found. Do not retry the same Git linking action without a change in connection/access.
- The GitHub App installation and a Vercel GitHub login connection are distinct. Vercel's current documentation says a Hobby Vercel team has one login connection per third-party provider; connecting a private personal-account repository through Git integration requires the connected Git account to be the repository owner, not merely a collaborator. The current Vercel Git namespace mismatch therefore remains unresolved.
- Do not disconnect befahad1234-cmyk, change the Vercel login connection, transfer repository ownership, expose the repository publicly, or upgrade to Pro as part of this fix.

## Next steps

1. Stop trying to connect the second personal GitHub account through the current Vercel Git integration unless Vercel's dashboard explicitly exposes the correct owner namespace.
2. Preferred path to preserve the private canonical repository and existing Vercel Hobby account: prepare GitHub Actions workflows that deploy each monorepo app to its already-created Vercel project using Vercel CLI and a Vercel token stored only as a GitHub Actions secret. Vercel supports CLI deployments without a Git connection and documents CLI-based CI/CD deployments.
3. Before enabling production automation, prepare and validate the four app-specific workflows, with their existing root directories and project IDs. Use preview-only deployment verification first; do not assign production domains or push a production deployment until release checks are approved.
4. Configure required GitHub Actions secrets securely. Never commit or paste Vercel tokens, Supabase secret keys, or service-role credentials into source code or chat.
5. Configure app environment variables per project, using publishable client keys only in browser bundles and keeping secret/service-role credentials server-side.
6. For Staff Admin Edge Function, set exact allowed origins and invitation redirect after the final Admin production URL is chosen; deploy the function only after config and runtime QA.
7. Assign final custom domains later, then test auth, CORS, routing, build output, and role restrictions before production traffic.

## Verification state

- All four project IDs and names exist in the intended Hobby team.
- latestDeployment is null for all four projects.
- Generated default vercel.app domains exist; no custom domains are configured.
- No project environment variables or secrets were added during project creation.
- No deployment, production-domain assignment, DNS change, repository transfer, or changes to the existing legacy Vercel projects were made.
