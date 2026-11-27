# Flame Chick — Cloudflare Hosting Migration Handoff

**Updated:** 27 November 2026, 15:24 PKT  
**Scope:** Move the four Flame Chick frontend applications from Vercel to Cloudflare Pages while keeping GitHub as the source of truth and Supabase Production as the shared backend.  
**Current status:** Customer Website is deployed to Cloudflare Pages Production at flamechick.pages.dev. POS is managed by a separate conversation; Admin and Rider remain pending. The initial root Worker remains a separate failed setup resource.

## Read this first in the next chat

1. Repository README.md — project entry point and safety rules.
2. PROJECT_HANDOFF.md — overall project history, roles, Supabase architecture and non-negotiable business rules.
3. docs/handoffs/WEBSITE_PARALLEL_CONTEXT_INDEX.md — current Website context and branch/deployment references.
4. docs/handoffs/2026-11-27-website-ui-reliability-next-session.md — OpenCode C1–C10 UI findings, outstanding work and QA boundaries.
5. This file — latest Cloudflare migration and Vercel Production checkpoint.
6. docs/operations/2026-11-26-new-vercel-website-production-handoff.md — earlier Vercel environment history, superseded where this newer checkpoint explicitly says so.
7. docs/handoffs/2026-11-25-website-parallel-audit.md and docs/audits/FLAME_CHICK_WEBSITE_AUDIT_2026-11-27.md — source architecture and prior application/backend audit.

Do not restart the project or assume old hosting instructions are current. First report the exact Cloudflare account/repository connection, the failed Worker build, the still-live Vercel Production deployment, the latest tested source candidate, and the next hosting actions.

## User's current direction

The user wants all four apps configured on Cloudflare Pages. Once the four Pages projects have the correct app roots, build/output settings and required environment variables, the user wants the **latest intended application changes deployed to Cloudflare Production** so the apps are current. Do not stop after connecting GitHub or creating empty projects.

Keep the existing Vercel deployment available as a fallback while Cloudflare projects are built and verified. Do not disconnect Vercel from GitHub, delete Vercel projects, remove aliases or change DNS until the Cloudflare apps have passed their smoke tests and the user is ready for cutover.

This handoff is documentation only. No Cloudflare Pages project has been created, no successful Cloudflare application deployment has occurred, no Vercel Production deployment or alias was changed, and no Vercel project was deleted.

## Cloudflare account and GitHub connection — verified 27 November 2026

- Cloudflare authenticated session is connected and accessible.
- Cloudflare account ID: 831422f51dea96c387ae8917d451a6bf.
- GitHub repository: itsfahadahmed1234-creator/flame-chick-platform.
- GitHub repository ID: 1464312723.
- Cloudflare's Workers Builds configuration confirms the GitHub provider, repository owner and repository name. Therefore the repository connection itself succeeded.
- The Worker build configuration currently watches branch main. This is not automatically the right production branch for the current Flame Chick Website release.

### Important: the first Cloudflare resource is a Worker, not Pages

Cloudflare currently has a Worker script named flame-chick-platform with a Git-connected Workers Build configuration. The Pages projects list was checked directly and returned **zero Pages projects**.

Worker build configuration found:
- Root directory: /
- Build command: empty
- Deploy command: npx wrangler deploy
- Git branch filter: main
- Path include: *
- Environment variables: none configured

Latest Worker build:
- Build ID: 2c2b8b0f-c9af-4848-94ce-05654bbf117d
- Result: failed
- Exact log error: "Could not detect a directory containing static files (e.g. html, css and js) for the project"
- Wrangler then reported: "Failed: error occurred while running deploy command"

This is a deployment-type/configuration mismatch. Cloudflare attempted to run a Worker deployment from the repository root with no static assets directory configured. It is **not evidence that the Flame Chick applications or GitHub repository are broken**.

Do not treat the existing Worker as one of the four Pages sites. Do not delete it without checking with the user; leave this failed setup resource in place while creating the correct Pages projects.

## Required Cloudflare Pages projects

Create four separate Pages projects from the connected GitHub repository:

| Application | Repository root directory |
|---|---|
| Customer Website | apps/flame-chick-website |
| POS | apps/flame-chick-pos |
| Admin | apps/flame-chick-admin |
| Rider portal | apps/flame-chick-rider |

Use the Pages product, not the Workers Build flow that produced the failed flame-chick-platform Worker build.

Before saving each project, inspect its actual folder and any package/build configuration. These are existing HTML/CSS/JavaScript applications; do not invent a build command, output directory or framework preset. Set each root directory to its corresponding app folder and choose the output/build settings that match the files actually present. Configure per-app path filters where supported so a change to one app does not unnecessarily rebuild all four.

Do not blindly copy root-level Worker settings (root /, empty build command, npx wrangler deploy) into the Pages projects. The four Pages production branches must be deliberately selected after comparing the latest source branches and establishing the release commit; do not assume main is the right production source merely because the failed Worker configuration currently watches main.

## Latest verified Vercel Website Production deployment — 27 November 2026

Vercel remains the currently serving Website host. Read-only Vercel inspection reconfirmed:

- Team: FahaD, Hobby plan.
- Project: flame-chick-website-production
- Project ID: prj_zv5EB2w4yZHagZ2uZuwk0YUeXsiA
- Latest verified **Production-target** deployment: dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy
- Deployment URL: https://flame-chick-website-production-d8hn72gzf-faha-d.vercel.app/
- State: READY; target: production.
- Production source branch: work/website-parallel-development
- Production source commit: c57be50d1674e597693117d1f39867c4c042f43a
- Commit message: fix(website): retain delivery details and enable email checkout
- Production aliases verified on this deployment:
  - flame-chick-website-production.vercel.app
  - flame-chick-website-production-faha-d.vercel.app
  - flame-chick-website-production-git-work-website-p-ecbe0f-faha-d.vercel.app

**Important Vercel distinction:** The Vercel project's latestDeployment field points to a later READY Preview, not the latest Production release:
- Preview deployment: dpl_FUiromQAXcEUw71k2F2dJscUzEU7
- URL: https://flame-chick-website-production-rb6umnbdz-faha-d.vercel.app/
- Branch: work/production-source-audit
- Commit: b878a60c847abdd017bb292793c55bc5f5070ce9
- Target: Preview (Vercel API target is null).
- This Preview is not the customer Website Production release. Do not promote it or describe it as Production.

As of this checkpoint, C57 remains the latest verified Vercel Production deployment. Do not state that the newer review-branch Website changes have reached the live Vercel site.

## Latest Website changes and candidate release source

A newer Website reliability change set is on:
- Branch: work/website-reliability-phase1-review
- Latest known commit: 9bd5f81ca59d80da7192c96d6aa8e694bfbb03e5
- Parent implementation commit: 762be621923974a58628f9abcfc6e2825fa820ec
- Matching GitHub Actions Website Static Checks run: 45971366391 — SUCCESS.
- Reported test results: 151 core tests passed, 25 Preview tests passed, JavaScript syntax checks passed, and inline homepage scripts parsed successfully.

The implementation commit includes Website checkout/customer-facing copy cleanup, Admin product image upload/current-image/restore controls, supporting tests and the product media SQL migration. Migration source file: supabase/migrations/20261127084500_flame_chick_catalog_product_media_v1.sql. It was applied to Flame Chick Production and the product media command was verified enabled. Do not reapply it. Check the Supabase migration ledger before any further migration work.

**Release-source caution:** 9bd5f81 is the latest known tested Website reliability branch checkpoint, but it is not the source commit currently serving on Vercel Production and it is not the same branch as work/website-parallel-development. It must be compared with the current Website source and the pending UI reliability findings before selecting the Cloudflare Production branch/commit. Do not blindly deploy stale main, C57, or the unrelated work/production-source-audit branch. The user has directed the next chat to publish the latest intended changes to Cloudflare Production after the four Pages projects are correctly configured; complete the source comparison as part of that release preparation rather than silently choosing a stale branch.

The Vercel deployment attempt for the 9bd5f81 branch was blocked by the Vercel API Free-plan daily deployment limit (HTTP 402, api-deployments-free-per-day, retry window 24 hours). No Vercel deployment was created for that commit. This is one reason the user is moving hosting to Cloudflare; do not keep retrying Vercel deployments.

The 27 November OpenCode Playwright audit also recorded C1–C10 UI findings against C57. Read the current UI reliability continuation handoff and verify which findings are addressed by the newer branch. Do not claim all ten have been resolved merely because the 9bd5f81 static CI passed.

## Runtime configuration and security

- Keep Supabase Production as the shared backend: project ref adkrxfnawdiljhjaavnj, Mumbai (ap-south-1), Free plan.
- The Website, POS, Admin and Rider applications remain separate frontends using the same existing Supabase backend and current API/auth contracts.
- Identify each app's required public environment values by reading the source and current Vercel project variables. Transfer only what the app actually needs.
- Browser code may contain the Supabase project URL and publishable/anon key only. Never move a service_role/secret key into browser code, a Pages build artifact, Git or documentation.
- Server-only Order API and other privileged credentials remain in Supabase Function Secrets. Do not copy their values into Cloudflare Pages frontend variables.
- Record only environment-variable names and whether they were configured; never record secret values.
- Do not change Supabase schema, RLS, Edge Functions, secrets, roles, Realtime, catalogue publication, orders or payments as part of frontend hosting migration unless a separate requirement is found and explicitly handled.
- GST/tax implementation remains deferred.

## Domains and cutover

- Cloudflare Pages deployments will receive Cloudflare hostnames (for example, project-name.pages.dev). The existing Vercel .vercel.app aliases are Vercel-managed and cannot be moved to Cloudflare.
- Confirm the user's own domain and desired app subdomains before changing DNS or attaching custom domains. The older requested flamechick.vercel.app hostname remains unresolved/unattached; do not assume it can be transferred.
- First build and test all four Pages projects on their Cloudflare hostnames. Verify login/session, role boundaries, catalogue loading, POS refresh, Rider offers, image loading and required Supabase Edge Function calls.
- For the customer Website, inspect checkout rendering and read-only quote behavior without clicking Place Order or Retry on the Production-backed site. Those actions create real Production orders and need a specifically safe test plan.
- Keep Vercel available during the Cloudflare smoke test. Only after all four apps pass should the user decide the custom-domain/DNS cutover and Vercel Git disconnection. Do not delete Vercel projects during migration.

## Exact next-session work sequence

1. Read the full read-first list at the top of this document and the project README/context index.
2. Refresh Cloudflare account and Pages project inventory; confirm the GitHub repository still appears under the intended Cloudflare account.
3. Create the four **Pages** projects, not another root-level Worker. Set each correct app folder and inspect build/output settings from source.
4. Set intentional production branches and path filters after comparing the candidate commits. Do not use the failed Worker build configuration.
5. Set each required environment variable securely. Confirm names and configured status without exposing any secret values.
6. Build and verify all four projects, then deploy the latest intended reviewed application changes to Cloudflare Production as the user requested. Keep a clear record of each Pages project, production branch, source commit, deployment URL and build result.
7. Smoke-test each application on its Cloudflare hostname. Keep Supabase Production unchanged.
8. Keep the Vercel Production Website online as fallback until all four Cloudflare deployments and required domains are verified.
9. Update this handoff and the project indexes with the exact Pages project/deployment IDs, domains, production branches, source SHAs, environment-variable names and remaining issues.

**Do not finish the task at GitHub connection or empty project creation. The target outcome is four working Cloudflare-hosted Flame Chick apps running the latest intended source, with Supabase still serving as their backend.**


---

## SUPERCEDING WEBSITE HOSTNAME RELEASE — 27 November 2026

The Customer Website is deployed under the exact requested Cloudflare hostname.

- Project: flamechick; project ID 5daf4460-c018-4115-af98-3093e2b280ef.
- Production hostname: https://flamechick.pages.dev/.
- Unique deployment URL: https://07297e8b.flamechick.pages.dev/.
- Deployment ID: 07297e8b-e79d-46ae-9696-78be7f28c7f8; Production; Cloudflare reports queued/initialize/clone_repo/build/deploy all SUCCESS and the project lists this as canonical deployment.
- Production branch: work/website-reliability-phase1-review.
- Deployed source SHA: 2a63046e1e5d81ced272acc08b17c1a3021b779d.
- Matching GitHub Website Static Checks: run 45981432738 — SUCCESS.
- Repository: itsfahadahmed1234-creator/flame-chick-platform (the owner string includes “ahmed”).
- Build settings: root apps/flame-chick-website, blank build command, output directory ., static HTML/CSS/JavaScript.
- Git deployment settings: Production deployment enabled on work/website-reliability-phase1-review; Preview branch work/website-parallel-development; build-watch include apps/flame-chick-website/*; no excludes.
- Pages env vars: none. Existing browser config uses Supabase Production URL and public publishable key only.
- The exact hostname flamechick.pages.dev is explicitly allowlisted for Website order writes. The former exact Pages hostname flame-chick-website.pages.dev remains accepted during transition; all other Pages hostnames remain blocked.

### Preserved previous hosting

- Previous Pages project renamed flamechick-legacy; ID de453d35-d86f-4c42-8f68-737f2bd77ab9; old hostname flame-chick-website.pages.dev remains assigned. The original successful deployment 778c220c-a7f6-49ac-be88-6ad27ec0b39b remains available. Legacy project's automatic Production/Preview builds are disabled to avoid duplicated builds.
- Vercel Website Production remains online and unchanged as fallback: dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy, commit c57be50d1674e597693117d1f39867c4c042f43a. No Vercel projects, aliases, custom domains or DNS were changed.

### Verification limits and scope

The new Cloudflare deployment is API-verified as canonical and successful. The former Pages hostname previously rendered the catalogue and deals in the connected browser; the new flamechick.pages.dev hostname still needs its own full interactive smoke test. No Place Order/Retry was clicked. Supabase Production was unchanged. POS belongs to the other conversation; Admin/Rider remain pending.
