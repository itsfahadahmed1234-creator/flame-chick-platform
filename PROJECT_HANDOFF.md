# Flame Chick Platform — Project Handoff

**Last updated:** 2026-11-20 (Asia/Karachi)  
**Canonical project repository:** https://github.com/itsfahadahmed1234-creator/flame-chick-platform  
**Current working branch:** `work/production-source-audit`  
**Default branch:** `main`  
**Current stage:** Stage 1 source hygiene complete; Stage 2 is blocked pending connection to the separate Flame Chick Supabase Production account  
**Live customer website:** https://flame-chick.vercel.app/

> **Start here in every new ChatGPT conversation.** Read this file first and continue from the recorded state. Do not restart a broad repository scan or ask the user to repeat facts already recorded here. Verify only the specific live state or files needed for the next action, because remote services can change after this handoff was written.

---

## 1. Project purpose and product boundaries

Flame Chick is a standalone restaurant platform with four applications sharing one dedicated Supabase Production backend:

1. Customer website
2. POS
3. Admin panel
4. Rider portal

This is **not** Hassan Food Point (HFP) and **not** Pizza Bite. Never mix their tenants, Supabase refs, credentials, data, assets, app folders, or deployments into Flame Chick Production.

The website containing Pizza Bite branding and a pizza-bite icon is an unused demo/reference site. It is **not** the live Flame Chick customer website. The actual customer website is the Vercel deployment at https://flame-chick.vercel.app/.

The user wants a careful, incremental implementation. They explicitly said: **“proceed safely dont want to ruin work.”** Treat preservation of working applications and the live site as a hard requirement.

## 2. Non-negotiable operating rules for the assistant

Follow these rules in every future chat and tool session:

- Read this handoff before asking questions or scanning files.
- Continue from the recorded stage and branch. Do not redo completed audits without a concrete reason.
- Prefer targeted verification over broad rescans. If a live fact could have changed (deployment, branch head, database migration history, permissions), verify that fact before acting.
- **Never modify `main` directly.** Work on a clearly named feature/review branch and open a PR for review when appropriate.
- Keep the original source repository and all its branches unchanged as an archive until the new repo, deployments, and rollback plan are fully verified.
- Do not deploy, promote, switch aliases/domains, change Vercel Git connections, alter Production environment variables, apply SQL, run migrations, deploy Edge Functions, seed users/data, or change database settings without a separate explicit approval for that specific stage/action.
- Never assume the currently connected Supabase account is the Flame Chick Production account. Verify the exact project ref `adkrxfnawdiljhjaavnj` before any database work.
- Use Free plans unless the user explicitly approves a paid upgrade.
- Keep all secrets out of Git, chat, browser apps, and documentation. Never ask the user to paste a service-role/secret key into chat.
- Do not bulk rename `HFP_*` identifiers or SQL RPC names just because of the legacy prefix. Determine whether they are internal compatibility contracts before changing them.
- Do not copy Demo UUIDs, owner accounts, branch IDs, menu/order/customer data, or Demo-only business rules into Production.
- Keep the four-app architecture below. Do not redesign it without a clear technical reason and user agreement.
- Explain changes, risks, verification results, and rollback path plainly. If an action is blocked by permissions or a missing connection, report that rather than improvising a risky workaround.

## 3. Agreed repository architecture

This structure was proposed by the user and agreed. Preserve it:

```text
flame-chick-platform/
├── apps/
│   ├── flame-chick-website/
│   ├── flame-chick-pos/
│   ├── flame-chick-admin/
│   └── flame-chick-rider/
├── supabase/
│   ├── config.toml
│   ├── migrations/              # reviewed Production migrations only
│   ├── functions/
│   │   ├── flame-chick-catalog/
│   │   ├── flame-chick-order-api/
│   │   ├── flame-chick-delivery-api/
│   │   └── flame-chick-staff-admin/
│   └── demo-reference/          # historical Demo SQL; never apply automatically
├── docs/
│   ├── architecture/
│   ├── deployment/
│   └── operations/
├── .github/workflows/
├── .gitignore
├── .env.example
├── README.md
├── SECURITY.md
└── PROJECT_HANDOFF.md
```

The root README currently contains an outdated illustrative `docs/legacy-demo/` directory in its tree. The actual agreed docs folders are `architecture/`, `deployment/`, and `operations/`; update that small documentation mismatch on the working branch when convenient.

## 4. Repositories and source history

### New Production source repository

- Repository: https://github.com/itsfahadahmed1234-creator/flame-chick-platform
- Private repository; GitHub repository ID: `1464312723`
- Default branch: `main`
- Connected GitHub access was checked on 2026-11-20: pull/push available; repository admin permission is false.
- The repo already has the agreed four-app architecture, backend function folders, docs, and Demo-reference separation.
- Do not assume admin-level operations (settings, branch protection, secrets, integrations) are available.

### Current review branch

- Branch: `work/production-source-audit`
- Created on 2026-11-20 from `main`.
- Stage 1 changes belong here; `main` remains unchanged.
- Stage 1 commits on this branch include:
  - `0da616e0586213990bb43812855875c94d1fd1bd` — clean Pizza Bite catalog fallback labels/cache key.
  - `50096cf779dfd7b101a9445e42980b208c1f0067` — mark inactive legacy website `js/app.js` explicitly as legacy/inactive.
  - `4eaa173fea6e4117513ea258c1f98b1f292d8e3a` — document the active storefront scripts and inactive legacy module.
  - `8d1922b77249cf9d0a250e1cb5be4367314e61f1` — remove the invalid hardcoded POS URL from the Rider account setup message; direct staff to ask the owner/manager for the approved current POS address.
  - `f6d93ddfa5e8e3b17bae6a7c783ec8ef63817bd8` — route Web Push notification clicks using `FLAME_CHICK_RIDER_PORTAL_URL` rather than a stale hardcoded Rider URL; correct a user-facing HFP error label.
  - `70313d15953c98f4fd63f752dc72ca200a821852` — document the Rider URL's Web Push use and safe app-scope fallback.
  - Additional commits added and updated this handoff and the root README; see branch history for exact commit sequence.
- This commit changes only three legacy fallback strings/values: two Pizza Bite error labels become Flame Chick labels, and the fallback cache key becomes `flame_chick_catalog_v1`. The current Flame Chick config already explicitly sets that same cache key, so the normal configured path is unchanged. No live deployment was triggered.

### Original source/archive repository

- Private repository: https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS
- Selected source branch: `feature/flame-chick-wa-storefront`
- This is the source lineage for the current Flame Chick four-app storefront set.
- Keep it and its branches unchanged until the new repo and all app deployments are fully verified.
- Do not transfer Pizza Bite folders such as `apps/website-pizza-bite` or `apps/pizza-bite-admin`.
- The branch has stale/contradictory Demo-labelled root documentation. Use the actual app content and the Vercel production commit when identifying the live website source, not the old README heading alone.
- The historic `feature/flame-chick-demo` branch is Demo context, not the selected source of the current Vercel website.

### Transfer verification already completed

The source-to-destination comparison was completed before this handoff:

- All 99 files under the four `apps/flame-chick-*` roots from the selected source branch are present in the new repository.
- 88 of 99 app files were identical Git blobs; 11 were changed intentionally in the destination and should be reviewed, not blindly overwritten.
- All 72 website media files were present (59 scroll-sequence WebP frames, 11 product images, hero JPG/video).
- All nine historic Demo migration SQL files were byte-identical to their selected source-branch counterparts and are stored under `supabase/demo-reference/migrations/`.
- Pizza Bite app roots and legacy HFP/Pizza Bite roots were intentionally excluded from the new app repo.
- Repository secret scans did not find service-role/secret key values, private PEM keys, old Demo Supabase ref, or Pizza Bite project refs in the checked repository contents. This is a point-in-time scan, not a guarantee that future commits are safe.
- `.gitignore` excludes environment files (except `.env.example`), PEM/key files, `.vercel`, node_modules, and Supabase temp/branch state.

## 5. Live Vercel applications — current observed state

The user confirmed the real website is the Vercel app at https://flame-chick.vercel.app/. The four Vercel projects were inspected read-only on 2026-11-20. The projects still use the old source-repository setup; the new GitHub repo has **not** been connected to them. Do not switch their Git source or deploy from the new repo yet.

| App | Vercel project | Project ID | Observed assigned domain(s) |
|---|---|---|---|
| Customer website | `flamechicks` | `prj_ldHcRFVX0kadzR8jxVJz7pO1vPz5` | `flame-chick.vercel.app` |
| POS | `flamechic-pos` | `prj_0qb9GVxu8x046cAWKwEtKXd11EFN` | `flamechic-pos-two.vercel.app` |
| Admin | `flame-chick-admin` | `prj_PhyoAV8iNnVsiZ0R41j9HjUAIbc9` | `flame-chick-admin.vercel.app`, `flamechic-pos.vercel.app` |
| Rider | `flamechicksrider` | `prj_oE14rE4Rz1EJRbJuYawGeznzTuyo` | `flamechic-rider.vercel.app`, `flamechicksrider.vercel.app` |

Important domain mismatch findings (do not auto-fix):

- `flame-chick-pos.vercel.app` (with hyphens) was not found as an assigned Vercel domain.
- POS project currently has `flamechic-pos-two.vercel.app`.
- `flamechic-pos.vercel.app` (without the extra hyphen) is assigned to the Admin project, which looks suspicious.
- Rider code contains a link to `https://flame-chick-rider.vercel.app/`, while the Rider project was observed with `flamechic-rider.vercel.app` and `flamechicksrider.vercel.app`.
- Decide the intended canonical POS/Admin/Rider URLs with the user and inspect links before changing Vercel domains or code. Do not move a domain without an explicit plan and approval.

The actual website's observed Production deployment was READY and aliased to `flame-chick.vercel.app`; its source commit was `6ac16abf9195926a5cc7ac153fbd94d0b29c22a2` on `feature/flame-chick-wa-storefront`. Destination website HTML had intentional changes relative to that deployment commit, so do not claim that every new-repo file is byte-identical to the live deployed version.

## 6. Supabase Production — target and safety gate

**Intended Production project:**

- Name: Flame Chick Production
- Project ref: `adkrxfnawdiljhjaavnj`
- URL: `https://adkrxfnawdiljhjaavnj.supabase.co`
- Region: Mumbai (`ap-south-1`)
- Plan: Free
- It belongs to a separate Flame Chick Supabase account/org.

**Critical connection warning:** the previously connected Supabase context showed HFP and Flame Chick Demo, not this separate Production project. Do not run any Supabase command, SQL, migration, function deploy, secret write, or dashboard mutation until the correct Production account is connected and the exact ref is independently verified.

### Known applied Production migration

A security baseline was previously applied to Production:

`20261119125153_flame_chick_postgres_default_privileges_hardening`

Known SQL:

```sql
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
```

The matching migration SQL file was not present in the new repository at the last audit. Recover/verify the exact SQL and live migration history before adding a migration file to `supabase/migrations/`. Do not reapply this migration. First inspect the actual Production migration history in the correct account and reconcile the timestamp/file.

Earlier Production inspection reported no business schema tables, app functions, app users, or `flame-chick-media` bucket beyond baseline extensions/security state. That is historical context only; re-check current live state after connecting to the right account before making decisions.

### Reference projects — never target for Flame Chick Production

- Hassan Food Point (HFP): `ycwzmgvljaskjfatresh`
- Flame Chick Demo: `nthtslzeqglcforbsirz`
- Pizza Bite: `hrclruyrquzekjzyggpt`

These refs are reference-only. Never run Production migrations or app configuration against them.

### Demo data and rules that must not be copied blindly

Historic Flame Chick Demo has its own schema, owner, branch ID, seeded menu, policies, functions, and operational settings. In particular:

- Demo Main Branch UUID `f12a92da-2e6f-4a0a-a3f7-74b13f29888b` is Demo-only. Never copy it into Production.
- Do not copy Demo owner/auth users or customer/order records.
- Demo manual-address/zero-fee behavior is Demo-specific. Production must not silently inherit free delivery or a zero-fee fallback.
- Demo migrations are reference-only and live under `supabase/demo-reference/`, never the deployable `supabase/migrations/` directory.
- Historic Demo backend audit recorded 45 tables, 271 constraints, 187 indexes, 108 RLS policies, 33 routines, 35 triggers, three POS views, a menu seed, media bucket, cron task, and four deployed Edge Functions. Treat this as historical design reference, not proof of current Production state.
- HFP RPC prefixes such as `hfp_manage_staff_role` may be compatibility contracts. Review the schema/function contract before renaming.

## 7. Application source observations and known review items

### Customer website

- Entrypoint: `apps/flame-chick-website/index.html`.
- It loads `js/config.js` and `js/catalog.js` plus inline scripts.
- It does **not** load `js/app.js` through a script tag in the reviewed entrypoint. Earlier audit also found no obvious app.js reference in the entrypoint.
- `js/config.js` points to Production ref `adkrxfnawdiljhjaavnj` and uses a public publishable key. The key is intended to be public, but verify that it belongs to the correct Production project/account before a new Production deployment. Do not confuse publishable keys with service-role secrets.
- Config sets `catalogCacheKey: 'flame_chick_catalog_v1'`.
- `js/catalog.js` is actively loaded. Stage 1 branch commit `0da616e...` updates its fallback error text and fallback cache key from Pizza Bite to Flame Chick. This does not change the normal configured cache key.
- The separate `js/app.js` file was found to contain stale Pizza Bite/HFP settings and raw image URLs from an HFP staging image repository. It was not loaded by the reviewed entrypoint. Do not delete it blindly: verify all HTML, imports, dynamic loaders, tests, service-worker references, and other apps for references first. Then decide whether to remove it or clearly archive it on a review branch.
- Some `HFP_*` identifiers remain as legacy internal names; don't bulk rename until compatibility is understood.

### POS, Admin and Rider

- POS entrypoint contains Supabase JS CDN and a large inline script.
- Admin entrypoint loads `config.js` and `app.js`; both are active and changes can affect Admin behavior.
- Rider entrypoint contains Supabase JS CDN and a large inline script.
- Be conservative when modifying these applications. Inspect the specific function and call chain before changing operational workflows.

### Edge Functions

There are four source functions under `supabase/functions/`:

- `flame-chick-catalog`
- `flame-chick-order-api`
- `flame-chick-delivery-api`
- `flame-chick-staff-admin`

Known review items:

- `supabase/config.toml` currently sets `verify_jwt = false` for these functions. Historic Demo code intentionally performs explicit API-key + user-JWT validation in handlers. Verify every function's authentication/authorization path before changing this setting; do not flip it automatically.
- Catalog function uses a server-side `SUPABASE_SERVICE_ROLE_KEY`; this is appropriate only in function secrets, never browser code.
- Order, delivery, and staff functions include a hardcoded public publishable key fallback in `PUBLIC_KEYS`. Verify it against the separate Production project and consider moving allowed public keys fully into configured function environment/secrets after understanding compatibility.
- Staff Admin reads `FLAME_CHICK_RIDER_PORTAL_URL` for invite redirects.
- Delivery API also needs review for the Rider portal URL used in notification/deep-link text. It must ultimately use the user-approved canonical Rider URL rather than a stale hardcoded domain.
- Required secret/config names documented in `docs/deployment/production-environment.md` include `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `FLAME_CHICK_MAIN_BRANCH_ID`, and `FLAME_CHICK_RIDER_PORTAL_URL`; legacy anon key is optional only if retained for compatibility. Never store their values in this handoff.

## 8. Realtime and operational constraints already agreed

Keep Supabase Realtime narrowly scoped to live operational updates:

- POS and Rider portal need live updates for new/assigned offers, accept/reject, pickup/receipt, delivery progress/failure/return, and manager dispatch changes.
- Rider subscriptions should be targeted to the rider's own offers/assignments, not branch-wide.
- Do not add Realtime to Order History, reports, or other screens that do not need live updates.
- POS keeps a 15-second polling fallback.
- Avoid adding `order_status_history` to Realtime unless a specific, justified requirement emerges.
- The user prefers conserving Free-plan Realtime quota and keeping the implementation simple.

Historic HFP reference used five Realtime tables (`orders`, `delivery_tasks`, `delivery_task_offers`, `delivery_assignments`, `order_status_history`). Do not assume all five should be enabled in Flame Chick Production.

## 9. Backup plan

- User selected an external encrypted backup approach.
- A separate private repository named `itsfahadahmed1234-creator/flame-chick-backups` is planned but had **not** been created at last check.
- Keep database backups and Storage object backups separate and encrypted.
- Intended retention: daily backups, seven daily restore points, weekly retained copies, and monthly restore tests.
- Check current GitHub limits and practical Free-plan constraints before implementing automation.
- External backups do not prevent a Supabase Free project from pausing due to inactivity. Do not promise that they do.

## 10. Work completed and current status

### Completed before Stage 1

- Agreed and recorded the four-app architecture.
- Identified the actual live customer website and distinguished it from the unused Pizza Bite demo site.
- Audited the new repo layout, all 12 Markdown files, selected source/handoff documents, app transfer, media transfer, Demo migration archive, and repository secret patterns.
- Compared the four app source roots against the selected source branch.
- Inspected the four Vercel projects/domains read-only.
- Identified the separate Flame Chick Production Supabase project ref and the mismatch with the connected reference account.
- Reviewed website entrypoint script loading and identified the inactive legacy `js/app.js` candidate.
- Confirmed that no Vercel or Supabase Production mutations were made during the audits.

### Stage 1 work completed on 2026-11-20

- Created review branch `work/production-source-audit` from `main`.
- Updated `apps/flame-chick-website/js/catalog.js` to remove Pizza Bite fallback error wording and use the Flame Chick fallback cache key. The current config already sets this same cache key, so the normal configured path is unchanged.
- Reviewed the website entrypoint: it loads `js/config.js`, `js/catalog.js`, and inline scripts only. It does not load `js/app.js`. Reviewed the website's sibling JS modules and the other three app entrypoints; no active HTML script reference to the legacy website `js/app.js` was found. The file is retained, not deleted, and its header now clearly marks it LEGACY / INACTIVE. Website README documents the actual active runtime and warns not to re-enable the old module without review.
- The inactive legacy `js/app.js` contains Pizza Bite/HFP-era settings and HFP staging image URLs. It remains in the repo only as historical source pending any future explicit removal decision.
- Rider app had a hardcoded POS URL `https://flame-chick-pos.vercel.app/` that was not an assigned Vercel domain. Replaced that link with safe owner/manager instructions; no final POS domain was guessed.
- Delivery API push notifications had a hardcoded Rider URL `https://flame-chick-rider.vercel.app/`, inconsistent with the observed Vercel Rider project domains. It now reads `FLAME_CHICK_RIDER_PORTAL_URL`. If the environment variable is unset, the payload omits the URL and the Rider service worker safely falls back to its own app scope. No Vercel domain or secret was changed.
- Corrected a user-facing delivery API configuration error label from HFP to Flame Chick. Legacy `hfp_*` RPC names remain untouched because they are database compatibility contracts until reviewed.
- Updated deployment documentation to explain that `FLAME_CHICK_RIDER_PORTAL_URL` controls staff invitation redirects and Web Push clicks, with a safe service-worker app-scope fallback.
- Added this handoff document at the repository root as the durable context entry point and linked it from the root README. Corrected the README's illustrative docs tree to the actual `operations/` folder.
- Branch diff against `main` at the last check: 11 commits ahead, 0 behind. Changed paths are limited to `PROJECT_HANDOFF.md`, root README, website README, website `js/app.js`, website `js/catalog.js`, Rider `index.html`, delivery API, and Production environment docs.
- Static review was performed through GitHub source reads. No app build, Deno type-check, browser test, or end-to-end test was run because no CI workflow/test harness is configured in this repository and no local project runtime was provisioned. Treat runtime/type validation as pending; do not describe this branch as fully tested.
- No live deployment was triggered.
- No Vercel settings/domains/Git connections were changed.
- No Supabase SQL, migration, function, secret, user, or data was changed.
- No original repository or branch was modified.
- No new backup repository was created.
- Latest branch comparison against `main` showed the review branch is ahead by 5 commits, behind by 0, with exactly three changed paths: this handoff, the root README, and the catalog loader.
- No automated test suite or app build was run in this documentation/source-only pass; record this as pending verification rather than treating it as tested.
- No merge to `main` has occurred.


### Stage 2 connection check on 2026-11-20

- Read the installed Supabase skill before using Supabase tools.
- Read-only `list_organizations` returned only organization `hfp supabase` (org id `xzdklhvmheiewpnnqgsa`).
- Read-only `list_projects` returned only:
  - HFP `ycwzmgvljaskjfatresh` (ACTIVE_HEALTHY)
  - Pizza Bite `hrclruyrquzekjzyggpt` (INACTIVE)
  - Flame Chick Demo `nthtslzeqglcforbsirz` (ACTIVE_HEALTHY)
- The required Production ref `adkrxfnawdiljhjaavnj` is **not visible** to the currently connected Supabase account. The only connected organization is HFP. This confirms the existing connection warning.
- No database tables, migrations, SQL, functions, secrets, auth users, storage, or project settings were queried or changed for a guessed project. No migration was applied.
- Stage 2 is blocked. Ask the user to connect/authenticate the separate Flame Chick Supabase account/organization in ChatGPT, then re-run the read-only organization/project list. Proceed only when exact project ref `adkrxfnawdiljhjaavnj` is visible and its name/region/plan match the handoff.
- Do not use HFP `ycwzmgvljaskjfatresh` or Demo `nthtslzeqglcforbsirz` as a substitute.

## 11. Implementation roadmap — continue in this order

### Stage 1 — Source hygiene and durable handoff (current)

1. Keep working on `work/production-source-audit`.
2. Finish reviewing stale source references, active vs inactive files, hardcoded portal links, and documentation inconsistencies.
3. Do not delete or bulk-rename code until references and behavior are checked.
4. Run available static checks/tests where possible; record any test limitations.
5. Update this handoff after meaningful work, with exact branch/commit/file status.
6. Review the diff. Keep `main` unchanged until a reviewed PR is ready.

### Stage 2 — Reconcile Production migration history

1. Connect the correct separate Flame Chick Supabase Production account.
2. Verify exact ref `adkrxfnawdiljhjaavnj`, region, project name and plan.
3. Inspect current migration history and exact applied baseline migration SQL.
4. Add the matching historical migration file only after exact reconciliation; never reapply it.
5. Confirm no HFP or Demo project is the target.

### Stage 3 — Design and implement Production schema

Build reviewed Production migrations in dependency order: restaurant/branch tenant core, catalog/menu, staff roles/profiles, orders/checkout, delivery/dispatch, audit and supporting functions/RLS, Storage bucket and policies, and approved initial seed.
Use Demo migrations as reference only. Create fresh Production IDs. Keep delivery fees unknown until explicitly approved; do not infer zero fees.

### Stage 4 — Edge Function configuration and security

Review each function's authentication, authorization, tenant/branch scoping, input validation, CORS, error handling, and secrets. Configure secrets only in the verified Production project. Deploy functions only after schema readiness and explicit approval.

### Stage 5 — Connect and test all four apps

Connect website, POS, Admin, Rider to the Production project using browser-safe publishable keys only. Test authentication, catalog, checkout, POS order flow, dispatch, rider accept/reject, pickup, delivered, failure, return, and role restrictions. Keep Realtime narrow and preserve POS 15-second polling fallback.

### Stage 6 — Vercel previews and project wiring

After backend readiness, connect the four Vercel projects to this repo with the correct app root directories. Use Preview deployments first. Resolve canonical POS/Admin/Rider domain assignments with the user before changing any aliases or links. Keep the current live website untouched.

### Stage 7 — End-to-end verification and cutover

Run full end-to-end tests, security checks, rollback rehearsal, and backup restore test. Only switch production traffic/domains after a separate explicit cutover approval. Retain the previous deployments/source as rollback.

## 12. Immediate next action

**Stage 1 source-hygiene review is complete on `work/production-source-audit`.** Do not repeat the same source scans. The remaining Stage 1 limitation is that automated build/type/runtime tests have not been run; add an appropriate CI/test harness later when the app tooling is established, or run checks in a controlled local workspace before merge.

**Stage 2 is now blocked** because the connected Supabase account lists only the HFP organization and HFP, Pizza Bite, and Flame Chick Demo projects. The intended Production ref `adkrxfnawdiljhjaavnj` is not visible. Ask the user to connect/authenticate the separate Flame Chick Supabase account/organization in ChatGPT. After that, verify the exact Production ref, name, Mumbai region, and Free plan read-only. Never substitute HFP or Demo.

Once the correct Production project is visible:

1. Inspect migration history read-only and recover the exact applied migration `20261119125153_flame_chick_postgres_default_privileges_hardening`; compare it byte-for-byte with the expected SQL before adding its matching file to `supabase/migrations/`.
2. Do not apply/reapply SQL, migrate, deploy functions, create users, seed data, or change settings during this reconciliation stage without separate explicit approval.
3. Update this handoff with the exact verified account/project, migration history, file/commit changes, and next step.

**New-chat instruction:** Start by reading `PROJECT_HANDOFF.md`, then inspect the current branch head and continue the immediate next action above. Do not repeat the entire initial audit. Ask the user only for a decision that genuinely requires their preference or approval.
