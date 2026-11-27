# Newer hosting checkpoint — Cloudflare transition (27 November 2026, 14:37 PKT)

This 27 November update supersedes older deployment identity/status statements below where they conflict. The older material is retained as environment history.

## Current Vercel Production truth

Read-only Vercel checks on 27 November reconfirmed that Website Production is still:
- Project: `flame-chick-website-production`, ID `prj_zv5EB2w4yZHagZ2uZuwk0YUeXsiA`, FahaD Hobby team `team_whJsonilovUt4vVCoIBD6L1m`.
- Latest verified Production deployment: `dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy`, READY, target Production.
- Deployment URL: https://flame-chick-website-production-d8hn72gzf-faha-d.vercel.app/
- Production branch: `work/website-parallel-development`.
- Production commit: `c57be50d1674e597693117d1f39867c4c042f43a`.
- Stable aliases verified: `flame-chick-website-production.vercel.app`, `flame-chick-website-production-faha-d.vercel.app`, `flame-chick-website-production-git-work-website-p-ecbe0f-faha-d.vercel.app`.

The project-level latest deployment at that inspection was `dpl_FUiromQAXcEUw71k2F2dJscUzEU7`, READY but Preview (API target null), branch `work/production-source-audit`, commit `b878a60c847abdd017bb292793c55bc5f5070ce9`. It is not Production and must not be confused with C57.

## Newer Website code candidate — not Production

Website reliability branch: `work/website-reliability-phase1-review`. Latest known candidate commit: `9bd5f81ca59d80da7192c96d6aa8e694bfbb03e5`. Its matching Website Static Checks run `45971366391` succeeded (151 core tests, 25 Preview tests, syntax checks and inline-script parse). This branch's latest changes have **not** been released to the Vercel Production project. A Vercel deployment attempt for this commit was blocked by the Free-plan API daily deployment cap (HTTP 402); no deployment was created. It is a candidate for the Cloudflare migration after the current source branch, pending work and branch dependencies are inspected. Do not simply point Cloudflare Production at an arbitrary branch or at the C57/old main commit.

## Cloudflare status

Cloudflare account and GitHub connection were checked directly:
- Authenticated Cloudflare email: `itsfahadahmed1234@gmail.com`.
- Cloudflare account: `Itsfahadahmed1234@gmail.com's Account`, ID `831422f51dea96c387ae8917d451a6bf`.
- GitHub repository linked in Workers Builds: `itsfahadahmed1234-creator/flame-chick-platform` (repository ID `1464312723`), branch `main`.
- Cloudflare Pages project inventory: zero projects.
- A Worker named `flame-chick-platform` was created by the dashboard flow. Its Workers Build root is `/`, build command blank, deploy command `npx wrangler deploy`; it is not one of the desired frontend Pages apps.
- Its first build `2c2b8b0f-c9af-4848-94ce-05654bbf117d` failed with exact error: `Could not detect a directory containing static files (e.g. html, css and js) for the project`. This indicates incorrect Worker/static-assets deployment configuration, not a broken GitHub repository or proof that app source is invalid.
- Do not delete the Worker yet; leave it as an unsuccessful setup artifact until the four Pages projects are operating.
- Create four separate Pages projects rooted at `apps/flame-chick-website`, `apps/flame-chick-pos`, `apps/flame-chick-admin`, and `apps/flame-chick-rider`. Inspect the app files to configure real build command/output directories. Do not reuse root Worker command `npx wrangler deploy`.

Full procedure, environment/security rules, domain cutover and next-session order are in [Cloudflare hosting transition handoff](2026-11-27-cloudflare-hosting-transition-handoff.md).

## Deployment outcome requested by the user

The user's goal is not simply to connect GitHub or create project shells: after the four correct Pages projects are configured, deploy the latest intended/reviewed application changes to Cloudflare Production, so the four hosted apps remain current. First compare the current live C57 release, Website reliability candidate and all relevant branches; identify the correct release source per app. Then configure per-app branch/path filters and only deploy the approved latest changes. Record each Pages production deployment's branch, source SHA, URL and build result.

Keep Vercel Production online as fallback until all four Cloudflare apps pass smoke tests and domains are deliberately cut over. Do not disconnect Vercel GitHub integration, delete Vercel projects, or change DNS while testing. Supabase Production remains the shared backend; no backend migration is part of this frontend-hosting change. Never put Supabase service-role/secret keys in frontend environment variables or bundles.

---

# Flame Chick Website — New FahaD Vercel Production Environment Handoff

**Updated:** 26 November 2026, 20:06 PKT  
**Scope:** Customer Website only. Current work target is the exact Vercel deployment selected by the user. The next implementation task is the Place Order fix.  
**No application code or database writes were made as part of this handoff update.**

## Latest checkout-fix release checkpoint — 26 November 2026

**Status:** Website checkout correction released to the FahaD Production project.

- Source branch: `work/website-parallel-development`
- Source commit: `c57be50d1674e597693117d1f39867c4c042f43a`
- Production deployment: `dpl_7EzwXVHFsjG91oGixcWbrfWkFSiy`
- Production deployment URL: https://flame-chick-website-production-d8hn72gzf-faha-d.vercel.app/
- Verified stable Production aliases: `flame-chick-website-production.vercel.app` and `flame-chick-website-production-faha-d.vercel.app`
- Deployment state: **READY**, target **Production**, source SHA matches the commit above.
- Website static CI: **success**, including JavaScript syntax checks, core and preview regression tests, and inline-script parsing.
- Git-triggered Preview build for the same source SHA: **READY**. No extra manual Preview deployment was requested.
- The only application files changed were `apps/flame-chick-website/js/website-order-v3.js` and `tests/website-source-hygiene.test.mjs`.

### Checkout changes

1. The optional email validator now accepts standard email addresses and rejects malformed non-empty values. The same validator is used for button readiness and submit-time validation.
2. Delivery area, address, Not Listed locality and fee confirmation remain in the active page session when switching Delivery ↔ Takeaway on the same branch. If the branch changes and the previously selected area is no longer valid, the stale area and Not Listed confirmation are cleared; the typed address remains available for correction.
3. Customer delivery information is not written to localStorage or sessionStorage. Existing order API pricing, delivery-fee validation, idempotency and rate limits remain unchanged.

### Verification and remaining boundary

- The isolated checkout behavior suite passed **4/4** checks.
- Full Website static CI passed on the exact release commit.
- The Production deployment and stable aliases were verified read-only.
- No real Production order was submitted. No Supabase schema, Edge Function, secret, role, POS, Admin or Rider changes were made.
- A controlled end-to-end Production order rehearsal is still outstanding and requires separate explicit approval because it creates a real order visible to the live POS.

**Next step:** Ask the user to refresh the stable Production Website and verify the button and Delivery ↔ Takeaway retention with a non-submitted checkout. Do not place a real order during this check.

---

## 1. User direction and hard boundaries

The user has moved the Flame Chick production hosting work to a newly connected Vercel account/team and explicitly selected this exact Website deployment to continue with:

**Selected Website URL:**  
https://flame-chick-website-production-dsokjzvak-faha-d.vercel.app/

The user wants this same target made production-ready, with the next task being **diagnose and fix Place Order**. The user has explicitly warned that Vercel API/deployment limits are being consumed too quickly. Avoid unnecessary deployments, never repeatedly retry deployment calls, and ask before any new deployment, preview, promotion or production release. Keep POS, Admin and Rider projects untouched.

This handoff update is documentation only. No new deployment request, Promotion, Supabase write, Edge Function deployment, customer order or payment was initiated.

## 2. Verified new Vercel environment

- Vercel team: **FahaD**
- Team slug: \`faha-d\`
- Team ID: \`team_whJsonilovUt4vVCoIBD6L1m\`
- Plan: **Hobby**
- Website project: \`flame-chick-website-production\`
- Project ID: \`prj_zv5EB2w4yZHagZ2uZuwk0YUeXsiA\`
- Root directory configured at project creation: \`apps/flame-chick-website\`
- Connected Git repository: \`itsfahadahmed1234-creator/flame-chick-platform\`
- Website source branch: \`work/website-parallel-development\`

The repository owner spelling is exactly \`itsfahadahmed1234-creator\` (including \`ahmed\`). The GitHub repository listing and the Vercel deployment metadata both confirmed this owner/repository link.

### Exact selected deployment

- Deployment ID: \`dpl_Duei1CUZT1NeSxoBt6cDAW9wBLTY\`
- URL: https://flame-chick-website-production-dsokjzvak-faha-d.vercel.app/
- State: \`READY\`
- Target: \`production\`
- Source branch: \`work/website-parallel-development\`
- Source commit: \`7c0dfb60fa84f8f3a80109c7e625cf500aed6a53\`
- Commit message: \`Update Website source hygiene tests for controlled rehearsal\`
- Deployment aliases reported by Vercel:
  - \`flame-chick-website-production.vercel.app\`
  - \`flame-chick-website-production-faha-d.vercel.app\`
  - \`flame-chick-website-production-git-work-website-p-ecbe0f-faha-d.vercel.app\`

This is a Vercel **Production-target deployment**, not a Preview. It is not evidence that the Website's customer checkout is fully production-ready.

### Separate Preview deployment — do not confuse it with the selected target

The project metadata also reports a later READY Preview deployment:

- Deployment ID: \`dpl_4ED4Zr7LX3yYRc3RPbX5CCj6JRQF\`
- URL: https://flame-chick-website-production-eoe96ql5s-faha-d.vercel.app/
- Target: Preview (\`target: null\`)
- Branch: \`work/production-source-audit\`
- Commit: \`992a87c321e7d7d746f10af1573d39ecf4fec590\`
- Commit message: \`fix(pos): align QZ preview origins and leaf certificate tests\`

This Preview came from the other Production/POS branch. It is **not** the URL the user selected for Website work. The Vercel project's \`latestDeployment\` field points at this Preview, so do not rely on that field alone when identifying the selected Website target. Query the exact deployment ID/URL and verify its branch and target every time.

### Domain status

The requested custom hostname \`flamechick.vercel.app\` is **not attached** to the new Website project. Earlier Vercel assignment attempts reported that it was already assigned to another project/team. Do not assume it is available, remove it from the old project, or claim it points to the new project without explicit user direction and verified ownership. The default \`flame-chick-website-production.vercel.app\` alias is attached to the selected Production deployment.

Vercel SSO protection was verified enabled for Preview deployments / all deployments except custom domains. The selected deployment URL may therefore require the authorized Vercel session depending on current project protection settings.

## 3. GitHub branch and Website source checkpoint

The current Website branch HEAD at handoff time is:

\`work/website-parallel-development\`  
\`7c0dfb60fa84f8f3a80109c7e625cf500aed6a53\`

The selected Production deployment uses that same source commit. The key existing files for the next task are:

- \`apps/flame-chick-website/index.html\` — main customer Website page and script integration.
- \`apps/flame-chick-website/order-online-v3.html\` — separate V3 ordering page.
- \`apps/flame-chick-website/js/config.js\` — public browser API configuration.
- \`apps/flame-chick-website/js/preview-checkout-guard.js\` — exact-host browser write guard.
- \`apps/flame-chick-website/js/website-order-v3.js\` — V3 cart, customer details, fulfilment, submit and retry controller.
- \`supabase/functions/flame-chick-order-api/index.ts\` — shared server-side Order API source.

The app is an existing static HTML/CSS/JavaScript customer storefront. Continue in place; do not rebuild it or switch branches.

## 4. First Place Order diagnosis — known source-level mismatch

The currently deployed source commit contains the following exact browser allow-list in \`apps/flame-chick-website/js/preview-checkout-guard.js\`:

- Production order hosts: \`flamechick.vercel.app\` only.
- Controlled rehearsal Preview hosts:
  - \`flame-chick-website-production-p6r1gdef2-fahad-7455.vercel.app\`
  - \`flame-chick-website-production-git-work-websi-ecbe0f-fahad-7455.vercel.app\`

The new selected FahaD Production hostname, \`flame-chick-website-production-dsokjzvak-faha-d.vercel.app\`, is not in either list. The guard's \`canSubmitOrders(hostname)\` returns false for any other host. The V3 controller calls this guard before non-GET Order API operations and blocks writes when it returns false.

**This is a verified source-level cause and the first thing to verify in the browser.** It is not yet a completed runtime diagnosis: no browser click, live network trace or actual order submission was performed in this handoff step.

Do not solve this by wildcard-matching all \`.vercel.app\` hosts or disabling the guard. Decide explicitly whether the exact selected hostname is to be treated as the canonical Production order host or as a controlled rehearsal origin. The named deployment is Production-target, and a successful Place Order request creates a real Production order delivered to POS. The official custom host \`flamechick.vercel.app\` is still unresolved.

Before touching code, inspect the deployed page and source to confirm:
1. the actual hostname and loaded guard script version;
2. whether the Place Order button is disabled by \`orderWritesAllowed()\`;
3. browser console errors and the exact network path;
4. whether the page loads \`website-order-v3.js\` and the intended V3 checkout markup;
5. the API URL/configuration and the action/body actually sent.

## 5. Existing one-step checkout/API contract

The current V3 Website controller is designed for a **single Place order action**. Preserve this contract unless the actual reproduction proves a defect:

- On page entry it loads the current published catalogue and read-only Website branch/fulfilment context from Supabase.
- The cart stores catalogue IDs and explicit product/deal/modifier choices, not trusted client prices.
- The customer chooses Delivery or Pickup (Takeaway), provides name and phone, and supplies delivery area/address when Delivery is selected.
- The browser sends one POST with \`action: "place_website_order"\`, the selected branch, customer and fulfilment details, cart item IDs/choices, and a UUID request/idempotency ID.
- The Order API freshly rebuilds the quote server-side from current publication, catalogue prices, availability, branch and delivery configuration; it commits using the server-side \`flame_chick_create_website_order\` RPC.
- For \`place_website_order\`, the server performs fresh pricing and commit in the same request. Do not reintroduce a separate "Get verified total" quote step or require a browser quote token for this action. The older \`create_website_order\` action is a distinct legacy two-step path.
- The browser preserves the same idempotency request ID for an uncertain retry. A retry must not create a second order.
- Existing website order rate-limit controls must remain server/database enforced: 3 orders per minute, 3 per 10 minutes, and 15 per hour. Do not replace them with client-only checks or bypass them.
- Website payment choices are Cash on Delivery for Delivery and Cash at takeaway collection for Pickup. No online payment gateway is in scope.
- GST/tax implementation remains deferred.

The Edge Function source on the Website branch supports \`place_website_order\`, validates the request UUID and branch/customer information, calls \`buildWebsiteOrderQuote(body)\` to derive current server totals, then invokes \`flame_chick_create_website_order\`. This is source inspection only; the active deployed Production Edge Function version and secret presence must be independently checked before runtime testing. Never print or request secret values.

## 6. Production backend context and a documentation conflict to resolve

Intended Supabase backend:

- Project: Flame Chick Production
- Project ref: \`adkrxfnawdiljhjaavnj\`
- Region: Mumbai (\`ap-south-1\`)
- Plan: Free

The opening 24 November checkpoint in \`PROJECT_HANDOFF.md\` records that seven operational migrations were applied in Production, taking its recorded migration count to 33 and creating the order/payment/delivery schema and RPCs. It records that existing catalogue/setup records were preserved and that the operational order/payment/delivery tables had zero rows immediately after apply.

However, the older Website README and the 26 November Preview/one-step checkout addendum contain stale statements that the operational schema had not yet been migrated. Reconcile this documentation conflict with read-only checks against the live Production project before assuming the RPCs, Edge Function version, function secrets, branch ordering flags, delivery area fees, or order configuration are ready. Do not apply migrations or change database settings as part of the initial diagnosis.

No Supabase database write, Edge Function deployment, secret change, Realtime change, storage change, catalogue publication or order submission was made by this handoff update.

## 7. Deployment and change controls

- The user requires a low number of deployments because Vercel API/deployment limits have been reached quickly in the past.
- Do not call create-deployment/redeploy/promote/rollback APIs or CLI deployment commands without explicit approval.
- Do not retry a failed deployment automatically.
- Git pushes to the connected repository may themselves trigger Vercel deployments. Before pushing source, inspect the project's Git deployment settings and determine whether the exact commit will deploy. Group approved source changes and test locally/static first.
- A project update request was accepted to enable Vercel's \`enableAffectedProjectsDeployments: true\` option, intended to skip builds where no files in this Website root or its dependencies changed. The basic \`get_project\` readback does not expose this flag, so its value was not independently confirmed by the returned project snapshot.
- No other app/project should be changed during the Website Place Order task.
- The new handoff and entry-point updates are documentation only; the selected deployed commit remains \`7c0dfb60fa84f8f3a80109c7e625cf500aed6a53\` until an explicitly approved release is made.

## 8. Required next-session procedure

The next chat must **read the handoffs and produce a project overview before touching code**:

1. Follow the read-first sequence in the repository README and Website context index.
2. Verify the new FahaD Website project, selected Production deployment ID/URL, source commit, project root and domain state using read-only Vercel inspection.
3. Verify the current branch HEAD and compare it with the deployed commit. Documentation commits may make the branch HEAD newer without changing the currently deployed code.
4. Review the relevant Website files listed above and the complete 25 November Website audit.
5. Read the latest Supabase/Production checkpoints and reconcile the migration-state contradiction using read-only live inspection.
6. Give the user a concise overview: architecture, active environment, branch/deployment identities, current checkout design, confirmed Place Order blocker, shared-backend dependencies, safety risks and proposed fix.
7. Only then begin the Place Order diagnosis/fix. No live order test, database write, Edge Function deploy, Vercel deployment or domain change without the required explicit approval.

## 9. Handoff status

**Current stage:** New FahaD Vercel Website Production environment selected; current Production deployment READY; checkout is not yet confirmed on that hostname.  
**Next task:** Diagnose and fix Place Order using the exact selected deployment, with no unnecessary deployments.  
**Production readiness:** Not yet established. A READY Vercel deployment and a visible checkout button alone do not prove an end-to-end Production order succeeds safely.
