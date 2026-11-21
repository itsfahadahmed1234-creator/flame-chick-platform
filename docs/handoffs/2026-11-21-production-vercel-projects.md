# Flame Chick — Production Vercel project setup
Date: 2026-11-21
Repository: itsfahadahmed1234-creator/flame-chick-platform
Branch: work/production-source-audit
Base commit: dba6538504599faff1676fe875330e93f66d0ccd
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
- No deployments were created. Each project has latestDeployment=null and domains=[] at verification.
- No environment variables or secrets were added.
- No custom URLs/domains were added. Exact production URLs will be selected later.
- The project root directories were set to the corresponding monorepo app folders.
- Vercel Git namespace discovery currently exposes only the GitHub namespace `befahad1234-cmyk`. The private production repo is owned by `itsfahadahmed1234-creator`. Attempting Vercel Git-linked project creation returned `repo_not_found`; do not retry unchanged. The Vercel GitHub App must be granted access to the production repository / owner namespace before linking.
- Team is Vercel Hobby (`team_lrFy9ILYEz9umsBy98GCyQjI`). All four projects have Vercel's default SSO protection enabled for all except custom domains; keep this protection until intended production URLs and access model are confirmed.
- No changes were made to existing project `flame-chick-admin`, `flamechic-pos`, `flamechicks`, or `flamechicksrider`, which remain linked to the old `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS` repo.

## Next steps

1. In Vercel Git integration, grant the Vercel GitHub App access to `itsfahadahmed1234-creator/flame-chick-platform` (private).
2. Link each of the four projects to that repository and retain the root directories above.
3. Configure production branch intentionally (do not assume current working branch is production; review and merge only after release checks).
4. Configure environment variables per app, using publishable client keys only in browser bundles and keeping secret/service-role credentials server-side.
5. For Staff Admin Edge Function, set exact allowed origins and invitation redirect after the final Admin production URL is chosen; deploy the function only after config and runtime QA.
6. Assign exact domains later, then test auth, CORS, routing, build output and role restrictions before production traffic.

## Verification state

Verified using Vercel project reads after creation:
- All four project IDs and names exist in the intended team.
- latestDeployment is null.
- domains is empty.
- No Vercel project environment variables exist on the previously inspected legacy Admin project; the new projects were created without environmentVariables.
- No deployments or DNS/domain changes were made.
