# Flame Chick Platform — Project Handoff

**Last updated:** 2026-11-20 (Asia/Karachi; source/schema audit, website-only quota and universal idempotency/security controls added)  
**Canonical project repository:** https://github.com/itsfahadahmed1234-creator/flame-chick-platform  
**Current working branch:** `work/production-source-audit`  
**Default branch:** `main`  
**Current stage:** Stage 1 and Stage 2 complete; Stage 3 schema/source consistency and database security design in progress. The field-level schema, source audit, universal Website/POS order idempotency, website-only customer quota, delivery/pricing contracts, role matrix and Free-plan operations/security controls are documented on the review branch. GST deliberately deferred; offline stale-order confirmation and core role/delivery decisions are owner-confirmed. Remaining deal/schedule/branch/locality/return-payment decisions and schema/API mapping must be resolved before migrations  
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

- Latest verified branch comparison at this checkpoint: `work/production-source-audit` is 55 commits ahead of `main`, 0 behind, with 17 changed paths. This is a point-in-time count; re-check before PR/merge. `main` remains unchanged.
- Branch: `work/production-source-audit`
- Created on 2026-11-20 from `main`.
- All review/design changes belong here; `main` remains unchanged.
- Older branch comparison (`44` ahead / `15` changed paths) is superseded by later role/security commits; do not rely on this historical count.
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

**Connection verified on 2026-11-20:** the currently connected Supabase organization is `Flamechic` (`ydlbinhyoutdqueilxnd`) and its project list contains only `Flame Chick Production` with exact ref `adkrxfnawdiljhjaavnj`, region `ap-south-1`, status `ACTIVE_HEALTHY`, and Free plan. Re-verify this exact ref before every future database mutation. Do not use HFP or Demo.

### Known applied Production migration

A security baseline is already applied to Production. Its live migration record and SQL were retrieved read-only on 2026-11-20:

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

The exact SQL was retrieved from `supabase_migrations.schema_migrations` and verified against the recorded version/name. A matching file has now been added to `supabase/migrations/20261119125153_flame_chick_postgres_default_privileges_hardening.sql` on `work/production-source-audit`. This file records an already-applied migration; **do not reapply it**. The file is for repository history/reconciliation only.

Read-only Production inspection on 2026-11-20 confirmed: no tables in `public`; no tables in `public` or `private`; zero rows in `auth.users`; no Edge Functions deployed; no Storage buckets; the only app migration is `20261119125153_flame_chick_postgres_default_privileges_hardening`; the security advisor returned zero lints. These are point-in-time findings. Do not infer that the app schema exists.

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
- Latest GitHub compare is recorded near the end of this handoff; treat it as a point-in-time count and re-check the branch head before writing. `main` has not been modified.
- Static review was performed through GitHub source reads. No app build, Deno type-check, browser test, or end-to-end test was run because no CI workflow/test harness is configured in this repository and no local project runtime was provisioned. Treat runtime/type validation as pending; do not describe this branch as fully tested.
- No live deployment was triggered.
- No Vercel settings/domains/Git connections were changed.
- No Supabase SQL, migration, function, secret, user, or data was changed.
- No original repository or branch was modified.
- No new backup repository was created.
- No automated test suite or app build was run in this documentation/source-only pass; record this as pending verification rather than treating it as tested.
- No merge to `main` has occurred.


### Stage 2 connection check on 2026-11-20 — superseded by successful verification below

- Read the installed Supabase skill before using Supabase tools.
- Read-only `list_organizations` returned only organization `hfp supabase` (org id `xzdklhvmheiewpnnqgsa`).
- Read-only `list_projects` returned only:
  - HFP `ycwzmgvljaskjfatresh` (ACTIVE_HEALTHY)
  - Pizza Bite `hrclruyrquzekjzyggpt` (INACTIVE)
  - Flame Chick Demo `nthtslzeqglcforbsirz` (ACTIVE_HEALTHY)
- The required Production ref `adkrxfnawdiljhjaavnj` is **not visible** to the currently connected Supabase account. The only connected organization is HFP. This confirms the existing connection warning.
- No database tables, migrations, SQL, functions, secrets, auth users, storage, or project settings were queried or changed for a guessed project. No migration was applied.
- At that earlier checkpoint Stage 2 was blocked. This was superseded after the user confirmed the Production account was connected. The successful connection/read-only inspection is recorded next.
- Do not use HFP `ycwzmgvljaskjfatresh` or Demo `nthtslzeqglcforbsirz` as a substitute.


### Stage 2 successful Production connection and migration reconciliation — 2026-11-20

- Read the Supabase skill before any Supabase operation.
- `list_organizations` now returns only `Flamechic` organization id `ydlbinhyoutdqueilxnd`.
- `list_projects` returns only `Flame Chick Production` (`adkrxfnawdiljhjaavnj`), region `ap-south-1`, status `ACTIVE_HEALTHY`. The project API URL is `https://adkrxfnawdiljhjaavnj.supabase.co`. Plan is Free per project details/context.
- `list_migrations` confirms exactly one application migration: version `20261119125153`, name `flame_chick_postgres_default_privileges_hardening`.
- Read `supabase_migrations.schema_migrations` and recovered the exact recorded SQL and migration name. It matches the security baseline SQL recorded in this handoff.
- Added matching repository file `supabase/migrations/20261119125153_flame_chick_postgres_default_privileges_hardening.sql` to branch `work/production-source-audit` (blob SHA `9ed6364ed5f7de9a16eb9e372d0c00ddcb98fb0a`). This is a history/reconciliation file for a migration that is already applied. Re-read and hash-verified the repository file after writing; Production still lists exactly the same one migration. **Do not apply/reapply it.**
- Read-only schema inspection: no `public` tables; no `public` or `private` application tables; `auth.users` has zero rows; no Edge Functions; no Storage buckets.
- Security advisor returned zero lints.
- The installed extensions list includes managed/preinstalled extensions. No extension was enabled, disabled, or changed.
- All operations were read-only except the GitHub file creation. No Supabase SQL, migration, secret, user, bucket, function, or project setting was changed.
- Stage 2 account verification and migration-history reconciliation are complete. Next: Stage 3 design the Production schema in small reviewed migrations. Before any DDL, inspect current source function contracts, reference Demo schema selectively, and document the proposed schema/migration plan. Do not mutate Production until the specific DDL batch is reviewed and approved.


### Stage 3 initial contract analysis — 2026-11-20

Read the four Production Edge Function source files on `work/production-source-audit` and inspected the Demo baseline migration as reference only. No Production database changes were made.

**Observed API-to-database contract dependencies:**

- Catalog API reads: `restaurants`, `categories`, `products`, `modifier_groups`, `deals`, `delivery_areas`, `restaurant_settings`, `drink_options`, `subcategories`, `product_variants`, `modifiers`, `modifier_group_assignments`, `deal_components`, and `modifier_price_rules`. It expects an active restaurant with slug `flame-chick` and requires at least one product and variant to publish a catalog.
- Order API directly reads `user_roles` and `orders`; it calls `hfp_check_website_order_rate_limit`, `hfp_create_order`, and `hfp_update_order_status`. It requires the Production main branch UUID in `FLAME_CHICK_MAIN_BRANCH_ID` and validates staff roles server-side.
- Delivery API directly reads/writes `delivery_tasks`, `rider_profiles`, `user_roles`, `delivery_task_offers`, and `rider_push_subscriptions`; it calls `hfp_manage_delivery`, `hfp_get_rider_push_config`, `hfp_verify_delivery_push_webhook`, `hfp_accept_delivery_offer`, and `hfp_decline_delivery_offer`. Rider scoping is branch-bound and role-bound.
- Staff Admin directly reads `restaurants`, `user_roles`, `staff_role_audit`, `user_profiles`, `rider_profiles`; it calls `hfp_manage_staff_role`. It resolves the active restaurant using slug `flame-chick` and selects a branch.
- These are only the direct HTTP/API references visible in function code. RPC bodies and triggers may depend on additional tables, columns, constraints, views, sequences, and helper routines; the migration design must include those transitive dependencies.

**Demo baseline reference audit:**

- The archived Demo baseline creates 45 tables: 42 in `public` and three in `private`.
- It is useful for understanding the prior data model, but includes Demo-specific defaults and identifiers. In particular, its `delivery_areas.delivery_fee` and `delivery_tasks.delivery_fee_snapshot` definitions default to zero; do not copy those defaults into Production without a deliberate business decision. Production delivery fees must remain unknown/unset when not configured, not silently treated as zero.
- The baseline includes `private.hfp_website_order_rate_limit_events`, `private.rider_push_config`, and `private.delivery_dispatch_settings`. Review whether each is still needed and how it should be provisioned before including it in Production.
- The source API still calls several `hfp_*` RPC names. Keep these identifiers for compatibility unless a full caller/function dependency review justifies a coordinated rename.

**Next Stage 3 work:**

1. Map all API table/column reads and writes, RPC signatures and payload contracts, triggers, views, and RLS expectations to the Demo reference SQL and existing app calls.
2. Identify missing/inconsistent columns and any Demo-only behaviors; explicitly design Production-safe defaults and tenant/branch scoping.
3. Produce a reviewed schema/migration plan and migration dependency order in docs before any DDL is applied.
4. Do not apply SQL, deploy functions, create users, seed menu data, or change Production settings until the design and the specific first migration batch are reviewed and explicitly approved.


## Production engineering quality bar — user requirement (2026-11-20)

The user explicitly requires a secure, reliable, maintainable database designed to run for years without avoidable data loss, leaks, damage, or operational failure. The implementation must prioritize security, correctness, resilience, recoverability, and compatibility with the NEW Flame Chick menu planned for launch in the coming weeks. Do not rush schema creation or copy the Demo schema blindly.

### Menu information gate

- The actual final launch menu planned for the coming weeks has **not yet been supplied**. Two images are available: the current published menu baseline and a separate future-capability reference sample. They inform catalog structure and compatibility; neither is an instruction to automatically seed Production.
- Known historical Demo context (five categories, about 24 regular products/variants plus a Platter Deal) is not an authoritative specification for the new menu. Do not assume its categories, product set, modifier structure, deal logic, pricing, or media are unchanged.
- Do not block schema design waiting for the final launch menu. Design the catalog so future menu items and rules can be created in Admin. The reference image and user clarification are documented in `docs/architecture/menu-management-design.md`; the current menu transcription is in `docs/architecture/current-menu-baseline.md`. Ask about unresolved business rules only where they change the schema.
- Continue schema/security design now. Do not create initial menu seed data from either image; once the Admin workflow is implemented, the actual launch menu can be entered and validated through Admin.

### Mandatory database/security/reliability design checklist

1. **Tenant and branch isolation:** every business record must be scoped to the Flame Chick restaurant and relevant branch where applicable. Enforce relationships with foreign keys/composite constraints and server-side authorization; never trust client-supplied restaurant, branch, role, user, fee, amount, or status values.
2. **Default-deny access:** enable RLS on every exposed application table. Keep internal/private tables and sensitive helper functions outside exposed schemas. Define narrow role-specific policies and grants; authenticated alone is not authorization. Use app-controlled authorization sources, not user-editable auth metadata.
3. **RPC/function hardening:** review every API/RPC for authentication, role/branch scoping, input validation, idempotency, bounded payloads, safe errors, rate limits, replay protection for webhooks, and least privilege. Avoid unnecessary SECURITY DEFINER; where essential, constrain search_path, ownership, execution grants, and authorization checks. Do not expose privileged keys.
4. **Data-leak resistance:** prevent cross-branch/tenant IDOR, enumerate/list leaks, verbose database errors, private customer address/phone exposure, staff/rider data leakage, public Storage listing, insecure object paths, and accidental secrets in logs. Use field minimization, explicit public catalog allowlists, safe response DTOs, and private Storage by default unless public product media is intentionally published.
5. **Order and financial correctness:** store immutable order/item/price/modifier/deal/delivery-fee snapshots so menu edits never rewrite past orders. Use numeric money types, currency rules, database constraints, server-calculated totals, idempotency keys, transactions, and explicit state-transition rules. Never rely on browser-calculated totals.
6. **Menu evolution:** support categories/subcategories, products, variants/sizes, modifiers and pricing rules, deals/bundles/components, drink options/add-ons, availability/schedule, media, Urdu/English fields, sort/display rules, and versioned publication only where the actual new menu requires them. Prefer a normalized source of truth plus an atomic/versioned published catalog snapshot so partially updated menus are not served. Confirm actual menu requirements before locking this model.
7. **Delivery and pricing correctness:** unset/unknown delivery fees must remain unknown, not default to zero. Snapshot the fee and area at checkout. Validate delivery area, branch, fee, and fulfillment server-side. Never inherit Demo zero-fee behavior.
8. **Auditing and accountability:** record security-sensitive staff/role/configuration changes and order/delivery state transitions with actor, timestamp, reason, and minimal safe metadata. Restrict audit reads and prevent ordinary app clients from rewriting history.
9. **Operational reliability:** use explicit constraints, indexes aligned with real queries, lock/transaction strategy, bounded retries, timeouts, health checks, structured redacted logs, monitoring, and safe failure behavior. Avoid unbounded Realtime subscriptions; retain the agreed targeted POS/Rider subscriptions and 15-second POS polling fallback.
10. **Backups and recovery:** define encrypted database and Storage backups, retention, integrity checks, restore drills, and a documented recovery runbook. Verify actual Free-plan backup/retention limitations; external backups do not guarantee zero downtime or prevent an inactive project from pausing. Test restores rather than only checking that backup files exist.
11. **Migration safety:** small ordered migrations, reviewable diff, preflight checks, stable migration history, forward-fix/rollback strategy where feasible, backups before risky changes, and post-migration verification. Never edit/reapply an already-applied migration. Test schema changes in an isolated non-production environment before Production application.
12. **Long-term maintainability:** document invariants, role matrix, data lifecycle/retention, operational procedures, ownership of secrets, key rotation, and dependency/version strategy. Design for evolving menu and operational workflows without prematurely overgeneralizing.

### Current decision / next action

- Do not apply Production DDL or seed data yet.
- Current menu baseline and future-capability reference have been received and documented. Final launch menu entry is a later Admin task, not a prerequisite for schema design. Continue the ERD, resolve decisions that affect the table model, then prepare the field-level migration spec.
- In parallel, continue documenting API-to-database contracts and security boundaries without changing Production.
- The user expects this handoff to be updated after every meaningful project step. Update it with menu source/version, design decisions, migrations, commits, tests, risks, and precise next action.


### Menu capability reference received — 2026-11-20

- User supplied a menu image (WhatsApp image dated 2026-11-19). It is explicitly **not** the menu to publish and must not be seeded. Its purpose is to demonstrate the structures the new Admin-managed catalog must support.
- User clarified the primary goal: design the schema so the owner/staff can add and manage the actual upcoming menu through the Admin panel without routine database changes.
- Added design specification: `docs/architecture/menu-management-design.md` (commit `8b77c9d418e0a93494fc80d007dd94a6a863c9cc`). This is design documentation only, not DDL.
- The reference demonstrates category/section variety; simple priced products; portion variants; flavor/style choices; beverage volumes; TBD/unpriced items; configurable bundles with multiple components; deal families; and time-window promotions (3 PM–5 PM shown). These examples do not determine final business rules.
- Current Admin code audit: basic category/subcategory CRUD, product single/multiple variant pricing, product availability/images, deal creation with fixed product/variant, subcategory choice and included drink, and deal-level editing. Gaps include mandatory numeric product/deal prices (no unpriced draft), no schedule editor/API schedule output, no full modifier management UI despite modifier tables/catalog serialization, no full existing deal component editing, and multi-request browser-side writes that can leave partial state. Public catalog currently builds from source tables at request time, not a committed atomic published version.
- Target design covers Admin-managed categories, products/variants, NULL/unpriced draft prices distinct from genuine zero, reusable modifier/option groups, flexible combo components and selection constraints, recurring/dated schedules in explicit timezone, media privacy, draft/preview/validate/publish/rollback, immutable order snapshots, audit history, and transactional server-side writes.
- Do not hardcode category names, size labels, flavors, drink volumes, deal names or menu-specific logic. They must be data configured through Admin.
- The design file records unresolved business choices; do not invent whether flavors are variants/modifiers/products, whether combo choices are fixed/curated, how substitutions/surcharges work, schedule recurrence/scope, channel availability, stock/tax/allergen needs, or who can publish.
- Next: complete the API/schema contract map; review existing Demo publication tables only as reference; then draft a concrete Production ERD/migration sequence and Admin/API work plan. Keep Production read-only. No menu data or Production DDL was created.
- Ask the user for clarification only on business rules that materially affect the model, not for the final menu itself. The final menu can later be entered through Admin if the designed capabilities cover it.


### Current published menu baseline received — 2026-11-20

- User supplied the current Flame Chick menu image. This is the current published-menu baseline, distinct from the earlier future-capability reference image.
- Inventory transcription is recorded in `docs/architecture/current-menu-baseline.md` (commit `64ca4e6263de50e0b5ee23e6acadd36c6a63f00c`). It records 25 named entries from the image: 5 Starters (including Platter), 3 Injected Broast entries, 3 Wraps, 4 Burgers, and 10 beverage-list entries. All 25 show numeric PKR prices. The artwork says prices are exclusive of applicable GST; the user explicitly deferred GST implementation from the initial schema, so this is retained only as source context.
- The menu artwork's beverage list is displayed below Burgers without a visible separate “Beverages” heading; verify the intended category in live Admin/catalog before importing.
- Platter is described as 6 Classic Nuggets, 6 Injected Nuggets, 6 Fire Wings, 6 Injected Wings, Fries & Dips, priced PKR 1,499. Confirm whether Fries & Dips are tracked catalog components or only description/inclusions.
- “NEW” labels appear on Platter, Sunset Splash, 1.5 Ltr Water Bottle, and Cold Drinks 1.5 Ltr. Artwork does not define automatic expiry or badge rules.
- Artwork shows Quarter/Half/Full Broast as separately named priced entries; do not assume their current backend representation is product variants until live catalog records are inspected.
- This image is evidence of displayed menu content only, not proof of live backend IDs, exact current Admin data, tax configuration, stock rules, or checkout calculations.
- No menu rows have been inserted into Production. No Production schema or live app was changed.
- Next: compare this artwork with the actual current catalog/export from the live system (where available), then map stable product identities and order snapshots. Incorporate these requirements into the proposed ERD and Admin authoring workflow. Keep Production read-only.


### Production schema/reliability blueprint drafted — 2026-11-20

- Added `docs/architecture/production-schema-blueprint.md`, `docs/architecture/delivery-pricing-contract.md`, `docs/architecture/database-application-contract-map.md` (commit `d0e58a68cdda582b02d9bf198fdcc58c7cc43e71`). Design only; no SQL created/applied.
- Reviewed archived Demo baseline SQL and follow-on security, media, offer expiry, staff audit/index, helper-usage, Admin connection, and Demo-only manual-address/zero-fee migrations. Confirmed Demo baseline contains 45 tables (42 public, 3 private), 33 functions, 35 triggers, 108 RLS policies and 103 explicit indexes. Treat Demo as a reference, not a Production migration set.
- Inspected current POS adapter and catalog refresh: schemaVersion 2, required arrays for categories/products/productVariants/subcategories/deals/dealComponents/modifierGroups/modifiers/modifierPriceRules/modifierGroupAssignments/deliveryAreas/drinkOptions; health then catalog fetch; IndexedDB cache. POS currently clears menu/category/delivery-area stores before repopulating them, so a failed cache update could lose the previous working cache. It converts missing variant prices and delivery fees to zero in the adapter. Blueprint requires version-staged cache writes, an atomic active-version pointer and no silent zero fallback.
- POS offline delivery orders currently submit product/variant/deal IDs plus idempotency key; the existing order API prices using current mutable catalog values. Production must bind orders to a publication version and implement the now-confirmed hold/explicit cashier-manager confirmation policy before order DDL.
- Catalog function currently builds from mutable source tables and its health check does not enforce a separate approved publication pointer. Blueprint specifies immutable publication snapshots, a current pointer, validated publish/rollback, checksum and schema-version contract.
- Demo raw catalog tables have anon SELECT policies and authenticated table grants. Production should use narrow allowlisted public catalog DTOs, private operational schemas, least-privilege grants, tenant/branch composite constraints and server-checked roles rather than copy policies blindly.
- Demo order function writes zero tax and contains a Demo-specific manual-address/zero-fee path. Neither is approved for Production. Current published menu artwork mentions GST, but the user explicitly deferred GST from the initial schema; do not add tax schema or calculation in this phase.
- Existing Admin writes compound catalog changes through multiple browser REST calls and lacks full modifier/schedule editors, unpriced draft support and complete deal-component editing. Blueprint recommends transactional server-side commands, concurrency checks, audit, and full Admin workflow.
- Key schema domains: restaurant/branch tenancy; categories/subcategories/products/variants; modifier groups/options/assignments/pricing; deals/components/choice pools/schedules; draft and immutable publication; orders/items/modifiers/components/payments and immutable price snapshots; delivery/rider; staff/access/audit; POS devices/registers; settings/media/outbox.
- No Production database, Storage, Function, role, settings or app deployment was changed.
- At this earlier checkpoint, the next work was contract mapping and open decisions. Subsequent documents now contain the contract map, V1 ERD and confirmed offline stale-order policy. Remaining decisions are publication/price role boundaries, deal choice rules, schedule recurrence/scope, branch-specific menu visibility/pricing, inventory need, and whether Not Listed collects a separate locality field. GST is deferred from the initial schema. Do not apply Production DDL yet.


### Owner decision — defer GST/tax from initial schema — 2026-11-20

- User explicitly agreed to keep GST out of the initial database/schema design to avoid unnecessary complexity. GST/tax is deferred until the user specifically asks to implement it.
- Do **not** create tax configuration/rule tables, tax categories, tax schedules, order tax-line tables, tax snapshots, tax-rate/effective-date engines, or tax-calculation RPCs in the initial Production migrations.
- Keep the first order financial model focused on item/variant/deal prices, quantities, subtotal, explicit discounts only where required, delivery fee, and total. Preserve immutable price and order snapshots.
- Do not guess or hardcode a GST rate. The current menu artwork's note that prices exclude applicable GST is retained as reference context only; it does not authorize GST calculation or schema additions in this phase.
- When GST becomes necessary, design it as a separate, reviewed forward migration and coordinated API/website/POS change. Do not retroactively rewrite completed order snapshots.
- Blueprint updated to reflect this decision: `docs/architecture/production-schema-blueprint.md`, commit `cc0c917869ab4f7480049e8824f829332d967283`.

- Final documentation consistency pass removed deferred tax requirements from the current-menu capability bullets and order snapshot descriptions: `docs/architecture/current-menu-baseline.md` commit `dd83b49f270593ba4f3ef7c153ac9238efe403a5`; `docs/architecture/menu-management-design.md` commit `7d25e673fa2703b2a0342c12442af78f95fa083e`. The artwork's GST wording remains transcribed as source context only. No tax schema/calculation is in the initial design.
- No Production database changes were made.

- After the owner decision, aligned both menu design records with the GST deferral: `docs/architecture/current-menu-baseline.md` (commit `4cb4fe5b001713633a7f51d99a32fb38df0b4771`) now treats the GST phrase as source context only, and `docs/architecture/menu-management-design.md` (commit `8385e29a62688e3190b0a6d510ed263a9d1118e8`) marks tax as out of scope for the initial schema.

### Owner decision — Delivery area pricing logic confirmed — 2026-11-20

The user confirmed the Production delivery-fee behavior:

- Admin manages a list of named delivery areas/localities, each with its own explicit delivery fee. Examples discussed: fee amounts such as Rs. 0 to Rs. 500; no fee bands or formula are implied by that phrase.
- Customer selects their matching listed area and the backend uses that area's configured fee.
- If their locality is not in the list, customer can select **Not Listed / Other**. This uses the separate default delivery fee configured by Admin.
- Not Listed is a distinct selection mode, not a distance calculation, geolocation calculation, nearest-area match or client-supplied fee.
- Default fee can deliberately be zero, but an unset/missing default is not zero and must block Not Listed checkout. Explicit zero means the Admin saved zero on purpose.
- Listed and Other fee values must be read and enforced server-side; never trust price/fee from the website/POS request.
- Snapshot fee source, selected area/Other classification, displayed area label and exact calculated fee on the order and delivery task. Later changes to Admin fees affect new orders only, never historic orders.
- Keep area and default-fee scope aligned to the selected branch. Current single-main-branch configuration may use one branch default; do not allow branch A's area list/default to leak into branch B if multi-branch support is activated.
- A manually typed locality/mohalla for an Other selection is recommended for rider/manager context, but the user has not explicitly confirmed whether this field is mandatory. Confirm UI requirement before implementing it; it must never determine the fee.

**Existing source audit findings (current branch code, not changes to live apps):**
- Admin already manages delivery_areas CRUD and a separate restaurant_settings key DefaultDeliveryFee. The current UI stores this default as restaurant-wide (branch_id IS NULL, is_public=true) and area rows against the selected branch.
- Existing Admin's new-area fee form is prefilled with 0; make the initial field blank/required, and accept zero only after explicit input.
- Current customer website already displays each active area's fee and a Not Listed choice, reads DefaultDeliveryFee from the catalog settings, and blocks checkout when that default is unset.
- Current POS resolves the entered area against active area rows or uses DefaultDeliveryFee for the explicit Not Listed label, and blocks delivery order submission when default is unset.
- Current POS catalog adapter converts a missing area fee to zero (Number(value) || 0). Production contract must not do this for a required fee.
- Current POS delivery-order payload sends null area_id with area_name: Not Listed for Other; the Production order contract should add an explicit selection discriminator (e.g. delivery.selection_type = listed_area | not_listed) rather than infer Other from NULL area_id alone. Server must reject ambiguous/missing selection.
- Current catalog Edge Function reads active areas for the restaurant without selecting a branch. Production catalog must expose only area choices and default fee applicable to the selected fulfilment branch. The public response may expose area names and delivery prices only, not unrelated restaurant settings or staff/internal data.
- No live app code or Production database was changed during this audit.

**Blueprint:** Delivery fee model has been documented in docs/architecture/production-schema-blueprint.md (commit 703df0269b76a689a489ea29ec617d99671dfd41). It covers Admin CRUD, listed/Other fee resolution, explicit zero vs unset, server enforcement, snapshots, branch scope, and current source gaps.

**Test cases required before launch:**
1. Listed active area with a configured positive fee -> fee matches DB area record.
2. Listed active area with explicitly saved Rs. 0 -> order may proceed at zero only if that is the actual Admin setting.
3. Inactive/unknown area ID -> rejected; never treated as Other.
4. Explicit Not Listed with configured default positive fee -> use default.
5. Explicit Not Listed with explicitly configured zero default -> use zero.
6. Not Listed with NULL/missing/invalid default -> blocked; no order or delivery task.
7. Client sends tampered area fee/default fee -> ignored; server-calculated fee wins.
8. Client sends NULL area_id without explicit Not Listed selection -> rejected.
9. Area belonging to another branch/restaurant -> rejected.
10. Admin fee changed after an order was placed -> prior order and delivery-task snapshots unchanged; next new order uses new fee.
11. Public catalog for a branch must not include other branch's restricted areas/default.
12. Takeaway/pickup does not incur delivery fee and does not require an area selection.
### Delivery pricing contract documented — 2026-11-20

- Added `docs/architecture/delivery-pricing-contract.md` (commit `55b7e3350a5666f9eabf7cac31605c8446783899`). It is a detailed design/API contract; no Production SQL or live app code was changed.
- Delivery areas are named, branch-scoped records with their own explicit non-negative fee. No automatic distance bands or geolocation pricing are implied by the user's '0 to 500' example.
- Not Listed / Other is an explicit selection using a separate Admin-configured default. NULL/unset default blocks checkout; an explicitly saved zero is a legitimate zero fee.
- The database, not the browser/POS, must resolve and calculate the fee. Do not accept client-supplied fee amounts. A null area ID without explicit `selection_type = not_listed` must be rejected.
- Proposed typed configuration: `branch_delivery_settings` with one row per branch and nullable `not_listed_delivery_fee`, instead of a generic JSON setting. This is a recommendation in the design, not yet approved/applied SQL.
- Orders and delivery tasks preserve immutable delivery selection, area label and exact fee snapshots. Later Admin fee changes apply only to new orders.
- Current code audit: Admin already has area CRUD and a separate DefaultDeliveryFee setting, but the new-area form prefills zero. Website already has listed areas + Not Listed and blocks an unset default. POS already uses the default for explicit Not Listed but coerces missing area fees to zero and sends null area ID/display name rather than an explicit selection type. Catalog Edge Function queries areas without branch filtering and exposes DefaultDeliveryFee via general public settings allowlist. These are implementation gaps, not deployed Production changes.
- Added required acceptance tests for listed area fee, explicit zero, unknown/inactive/cross-branch ID rejection, Not Listed positive/zero/unset default, fake client fee, fee changes after order, branch catalog isolation and takeaway.
- Updated `docs/architecture/production-schema-blueprint.md` to link the detailed delivery contract (commit `add4f436214c1e1d529e790c75b16ffb0dbdeb9f`).
- The only user decision still open on this delivery flow is whether Not Listed should collect a separate locality/mohalla field; the full delivery address is already required. If not collected separately, the address snapshot still carries the destination information.
- Production remains read-only. No Supabase tables, rows, functions, settings, buckets, secrets or app deployments were changed.

### Cross-application/database contract map drafted — 2026-11-20

- Added `docs/architecture/database-application-contract-map.md` (commit `93ec46bcb3bd5ed658a046a80691ed9d18d09785`). It maps the four applications, four Edge Functions, database domains, current request/response contracts, required Production changes and unresolved decisions.
- Website: schemaVersion 2 catalog loader with version-aware cache; creates web orders using product/variant/deal IDs and area selection. Production catalog should return immutable published snapshots; delivery selection must be explicit.
- POS: schemaVersion 2, IndexedDB local catalog/order queues; only POS delivery orders are cloud-submitted in the current source, while takeaway and dine-in remain local. Cache refresh must be staged/versioned and atomic. POS realtime currently branch-filters orders/tasks but not offers/assignments; Production needs branch-specific event scope.
- Admin: direct PostgREST CRUD for catalog/deals/areas/settings; multiple requests for compound writes can leave partial data. Production needs transactional server-side catalog commands plus revision checks. Admin currently has basic product/deal/area forms but not full modifiers, deal editing, schedules or publication workflow.
- Rider: rider-specific Realtime subscriptions for offers and assignments by rider_user_id; retain own-job-only access.
- Catalog Edge Function: currently builds from mutable rows and treats active product/variant existence as published; queries delivery areas by restaurant without branch filtering; general public settings allowlist includes DefaultDeliveryFee. Production must read immutable published snapshot and branch-specific delivery pricing projection.
- Order Edge Function: rate limits website orders, verifies staff for non-website orders, calls order RPCs. Database command remains authoritative for prices, item eligibility, delivery fees, branch scope and idempotency.
- Delivery Edge Function: validates rider role/profile and routes presence, offers, push subscriptions and task lifecycle through service RPCs. Preserve strict rider/branch authorization.
- The map documents source observations and recommendations only. No Production schema, app code, deployed functions, Storage, Vercel config or live app was changed.
- At this earlier checkpoint, the ERD was still a proposal and publication/price role boundaries were unresolved. The offline POS stale-price decision has since been confirmed and the ERD/map/blueprint were updated.

### Production ERD and V1 table proposal drafted — 2026-11-20

- Added `docs/architecture/production-erd-v1.md` (commit `c09989ccff7ea6d5bfab98c15a8e155f7078d295`). This is a conceptual ERD/table proposal only, not SQL and not permission to apply DDL.
- Core domains: restaurants/branches and roles; categories/products/variants; modifier groups/options/variant pricing; deals/components/choice lists/schedules; immutable menu publications/current pointer/audit; branch-scoped delivery areas/default fee; orders/items/modifiers/components/payments/status history; delivery tasks/offers/assignments/rider profiles; private push/outbox/rate-limit records only where required.
- V1 order financial scope deliberately excludes GST/tax and focuses on item price, subtotal, delivery fee and total, plus existing payment fields required by POS.
- No ingredient inventory or unconfirmed optional operations tables are assumed. POS resources such as registers/tables/cash movements are included only where active app workflows require them.
- ERD uses branch-scoped delivery area/configuration, but restaurant-wide catalog products/prices initially. Branch-specific product pricing is not added unless confirmed as a V1 requirement.
- Proposed publication uses one JSONB immutable snapshot initially; no chunking until payload-size/performance tests justify it. Public catalog health must read the true publication pointer, not infer publication from active item count.
- Offline POS stale-order policy has since been explicitly approved by the owner: hold stale orders and require authenticated cashier/manager confirmation before repricing/resubmission. The ERD and blueprint have been updated; see the owner decision section below.
- Remaining schema decisions: Not Listed locality/mohalla field requirement; publish/price permission roles; deal choice pool rules; recurring schedule scope; whether branch-specific catalog pricing/availability is required; whether inventory is needed in V1.
- Production remains read-only. No DDL, seeds, app changes or deployments were made.
- Next: resolve only the decisions that materially affect table shape, then produce the field-level migration specification and test it on an isolated disposable Supabase project before requesting approval for Production DDL.

### Production default-privilege migration safeguard added — 2026-11-20

- Updated `docs/architecture/production-schema-blueprint.md` (commit `69ad4f83bb6e14b2d9745c6d7bccf9057268a306`) to record the exact implications of the already-applied Production hardening baseline.
- Because default privileges for postgres-created public tables, sequences and functions were revoked from PUBLIC, anon, authenticated and service_role, every future migration must explicitly enable RLS and explicitly grant only the permissions each intended role requires.
- Service-role Edge Functions will not be assumed to have object permissions automatically; table/schema/sequence access and function EXECUTE grants must be explicit and verified after each migration.
- Do not depend on rls_auto_enable to secure new tables; explicitly ENABLE ROW LEVEL SECURITY and verify it from PostgreSQL catalogs.
- Test both SQL grants and RLS using anon, authenticated role variants and service_role; server-side functions must still authorize actor, tenant and branch even when using service_role.

### Owner decision — offline POS stale-catalog orders require explicit confirmation — 2026-11-20

The user explicitly approved this policy:
- Every locally created offline POS delivery order must retain the catalog publication/version used when it was built.
- On reconnect, the server compares that version and the server-calculated price/availability with the current published catalog.
- If the version is stale and the charge/availability would change, the server must HOLD the order and return a stable conflict such as `CATALOG_VERSION_STALE`; it must not silently reprice or create a normal submitted order.
- POS keeps the local order and retry queue record, marks it `needs_confirmation`, and presents the old quote versus the current server quote.
- An authenticated cashier/manager must explicitly confirm the changed total before resubmission. Cancellation or editing remains available. The confirmed submission uses a new idempotency key tied to the confirmed request/version so the original failed/held attempt cannot be mistaken for a successful order.
- Record the actor, old/new publication versions, old/new totals and confirmation time in an audit event. Do not let an untrusted browser claim that a different user approved it.
- This is a confirmed owner policy, not merely a recommendation. Implement it in the POS local-order state machine, Order API contract and database order RPC in a coordinated schema-versioned change.
- Offline stale-price decision is no longer open. The ERD (`production-erd-v1.md`, updated commit `7bd7f870105024b78da0d43f5e3c90640b1d3be0`), schema blueprint (updated commit `cadf35831a65143eb23448fe9324cabfcf950a94`) and application contract map (updated commit `b8071be4c93774cdfd1e6f4cc12068346dcc2278`) now all reflect the user's explicit confirmation/hold requirement.
- The performance/security plan's latest verified content was corrected after official docs review; it explicitly avoids claiming an unsupported one-day log retention period and records the current Free-plan quotas, actual Production empty-schema status, and no-upgrade operational recommendations.

### Security, performance and Free-plan guidance reviewed — 2026-11-20

- Added `docs/architecture/performance-security-operations-plan.md` (commit `34a6255e214bf9a3958a31894af235b765fac21e`, subsequently corrected and expanded in commit `aaee2e0ad33ae7fcdcb4bc37f73fd609de5196d5`). This compares the user's pasted security/performance advice with current Flame Chick source and current official Supabase documentation.
- Useful guidance retained: RLS + grants; role/branch authorization; no secret/service_role in browser; server-side price/fee computation; isolated staging; encrypted DB and Storage backups; query-specific indexes; server-side pagination; bounded/filter Realtime; menu/media caching; responsive WebP images; redacted error telemetry.
- The generic index SQL from the conversation is NOT to be copied. Flame Chick uses `branch_id`, `placed_at`, task/offer/assignment relations rather than assuming `rider_id` on orders. Candidate composite/partial indexes must be checked with actual query plans and RLS filters.
- Workload context recorded: Free plan, approximately 100–150 orders/day, 3–4 months of live operational history, one POS, one Admin and 8–10 riders. Approximate order count is 9,000–18,000 over 90–120 days. This does not guarantee DB size; item/modifier/component/audit/index/snapshot overhead must be measured.
- Official Free quotas checked 2026-11-20: 500 MB database/project; 1 GB Storage; 5 GB uncached and 5 GB cached bandwidth; 500,000 Edge Function invocations; 2 million Realtime messages/month; 200 peak Realtime connections; 100 Realtime messages/second; 100 channel joins/second; up to 100 channels per connection. Free plan permits two projects across organizations where user is owner/admin; inactive projects may be paused after about 7 days of low user DB activity, with a 90-day restore window. Re-check limits before launch.
- Corrected an earlier unverified claim: this plan no longer asserts a fixed one-day log retention period. Verify current Dashboard log retention for the project and do not rely on Dashboard logs as durable audit history.
- Current source review: website has a version-aware localStorage catalog cache; POS stores catalog in IndexedDB and queues offline delivery orders; POS Realtime cleanup removes channels; Rider Realtime is rider-filtered and cleanup disconnects; Admin currently loads up to 1,000 orders at boot and should move to server-side pagination; POS Realtime does not branch-filter delivery_task_offers/assignments; POS catalog refresh currently clears live local stores before writing a new version; current catalog/order adapters coerce missing prices/fees to zero in places.
- Existing POS Realtime should be branch-filtered for offers/assignments. Keep one POS live channel while signed in and Rider channels only while rider is online/accepting jobs. Keep 15-second POS polling fallback; no broad Realtime for customer website or Order History.
- Current browser apps call Supabase Data API/PostgREST. The generic instruction to put these existing calls behind Supavisor is not applicable. Supavisor transaction mode is relevant only if future Edge Functions open direct PostgreSQL connections. Use direct connection for migrations/pg_dump where supported.
- Backups: Free plan has no automated downloadable daily DB backups. DB backup exports do not include Storage objects; back up Storage separately. Encrypted off-site DB+Storage exports and verified restore drills remain mandatory. A staging project consumes one of the two Free project slots; use an isolated project only after confirming capacity, or a local Supabase stack. Do not include Production customer PII in test data unnecessarily.
- Important RLS claim distinction: the archived Demo SQL enables RLS across its application tables and defines 108 policies, but also permits anonymous SELECT on a set of raw public catalog tables. This may be intentional for public catalog data, but it is broader than a narrow published-catalog API and must not be copied blindly. The Admin browser app directly performs PostgREST CRUD, so its protection depends on actual grants and row/role policies, not just frontend login.
- User's security statements (RLS, Supabase Auth and server-side pricing) are treated as context, not a substitute for verification. The live Production check below is the source of truth for the current Production project state.

### Live Production state rechecked — 2026-11-20 (read-only)

- Connected Supabase list still returns only the `Flame Chick Production` project, ref `adkrxfnawdiljhjaavnj`, organization `ydlbinhyoutdqueilxnd`, Mumbai `ap-south-1`, Free, status `ACTIVE_HEALTHY`, PostgreSQL `17.12.0.000`.
- Exactly one application migration remains recorded: `20261119125153_flame_chick_postgres_default_privileges_hardening`.
- Read-only list across all non-system schemas shows no application tables in `public` or `private`; `auth.users` is empty; `storage.buckets` is empty. Production has no deployed app Edge Functions at the previous function-list check.
- Supabase Security, Performance and Health advisors each returned zero lints. Since the application schema is not yet present, zero lints must not be represented as proof that the future application has been secured or optimized.
- The applied migration remains a default privilege hardening base only; new table RLS, grants, function execute rights and policies must be set explicitly in each future migration.
- No Production tables, rows, roles/users, buckets, functions, secrets, settings, project configuration or app deployments were changed during this audit.

### Security access matrix drafted — 2026-11-20

- Added `docs/architecture/security-access-matrix-v1.md` (commit `7dfece6b9f2770f340e2ff43a4390f04543c2f69`). It distinguishes public customer/guest, authenticated non-staff, owner, admin, manager, cashier, kitchen, rider and server-side service_role. It is a security design proposal, not RLS SQL.
- Key boundary: a valid Supabase authenticated session is not automatically a Flame Chick staff role. Business authorization must use an active controlled user_roles assignment and branch scope; never user-editable metadata.
- The owner subsequently confirmed the main role boundaries in a later section below: Admin and Owner full business access; Manager no Admin panel and no deletion rights; Cashier POS-only with rider assignment and order rejection; Rider portal-only with strict own-offer/assignment isolation. Do not use this earlier generic summary as the final matrix.
- Current-source findings: Admin allows owner/admin/manager; permanent deletes are limited to owner/admin; staff invitations and role activation changes are owner-only in the staff-admin function; order API accepts owner/admin/manager/cashier for staff order creation; kitchen can advance permitted preparation statuses; rider function provides own-job access. Production must formalize these in RLS + grants + server commands, not rely on UI buttons.
- The role access matrix is now updated with owner-confirmed Admin/Owner/Manager/Cashier/Rider boundaries. Remaining workflow clarifications are listed in `security-access-matrix-v1.md`; do not assume unconfirmed Manager POS or Cashier cancellation powers.
- The archived Demo SQL has RLS enabled across its application tables and 108 policies, but also has anonymous SELECT policies on raw public catalog tables. This is a source-level observation, not proof of a leak; Production should return an explicit public catalog projection and must not copy policies mechanically.

### Owner-confirmed role and permission policy — 2026-11-20

The user's role instructions are now the authoritative design requirements and have been incorporated into `docs/architecture/security-access-matrix-v1.md` (latest role matrix update commit `57ae617e35e3b65bc44a1089d6fc618c00a88ed8`). Do not revert to the older generic proposals above.

- **Admin (user's role) and Owner:** both receive full Flame Chick business access, including Admin panel and POS, menu/catalog, pricing, publishing, delivery fee configuration, staff administration, orders, dispatch and reports. They must remain distinct accounts so audit history identifies the actual person. “Full access” does not mean browser access to service-role secrets or Supabase credentials.
- **Manager:** must not enter the Admin panel and has no deletion capability. Manager has confirmed restricted POS access for branch operations, dispatch/reassignment and physical-return confirmation; see the owner decision below.
- **Cashier:** POS only. May process orders, assign/reassign riders and reject orders. May not hard-delete any order or other business record. Do not grant Admin panel, catalog management, staff management or system-settings powers.
- **Rider:** Rider portal only. May see/accept/decline only offers addressed to that rider and only their own active assignments. Must never see another rider's offers, assignments, customer details or private activity by changing a UUID or API request.
- **Order preservation:** do not hard-delete orders through ordinary application workflows. Rejection/cancellation/state changes update the order transactionally and append an immutable audit event with order ID, prior/new status, action, authenticated actor ID, role-at-time, server timestamp, mandatory reason where applicable and request/correlation ID. Preserve associated items, payment references, delivery history and audit events.
- **Cashier cancellation after order acceptance is not yet approved.** Until clarified, Cashier may reject a new/unaccepted incoming order but may not cancel an accepted/preparing/ready order. Admin and Owner retain full authority for audited rejection/cancellation.
- **Current implementation mismatch:** source audit found current Admin login allows `owner`, `admin` and `manager` into the Admin panel. That current behavior conflicts with the new policy. It must be changed in the Admin UI and, critically, denied by server-side APIs/database before the revised role model is released. Current source has not yet been changed for this role policy.
- **Rider lifecycle:** now owner-confirmed. Rider accepts/rejects own offer, records pickup/out-for-delivery, marks delivered (immediate order completion), or reports failed delivery and chooses return. Cashier or Manager confirms physical return. See `docs/architecture/delivery-lifecycle-contract.md`.
- **Kitchen role:** not yet confirmed for V1; do not automatically grant Kitchen broad POS access.

## 11. Implementation roadmap — continue in this order

### Stage 1 — Source hygiene and durable handoff (COMPLETE)

- Separate review branch created; source cleanup and handoff documentation committed.
- Main branch and original source repository remain unchanged.
- Static/build/runtime testing remains a known gap to complete before merge.

### Stage 2 — Production account and migration reconciliation (COMPLETE)

- Verified exact project `adkrxfnawdiljhjaavnj` in the separate Flamechic organization, Mumbai region, Free plan.
- Retrieved the exact applied migration `20261119125153_flame_chick_postgres_default_privileges_hardening` from live migration history and added its matching historical SQL file to the review branch.
- Never reapply that migration. Production still has no application schema, business data, users, Storage buckets or Edge Functions as of the last read-only inspection; recheck before any future DDL.

### Stage 3 — Schema design and security review (CURRENT)

- Continue from `docs/architecture/production-erd-v1.md`, `docs/architecture/production-schema-blueprint.md`, `docs/architecture/database-application-contract-map.md` and `docs/architecture/delivery-pricing-contract.md`.
- Resolve only decisions that materially affect table shape or server contract.
- Produce the field-level schema/migration specification, permission matrix and adversarial test plan.
- Keep Production read-only. Do not write or apply SQL yet.

### Stage 4 — Migration authoring and isolated validation (AFTER STAGE 3 APPROVAL)

- Author small ordered SQL migrations in the review branch; preserve the already-applied baseline file untouched.
- Test the complete migration chain on an isolated disposable Supabase project using the same PostgreSQL/Supabase feature set.
- Verify explicit grants required by the Production hardening baseline, RLS, composite tenant constraints, RPC EXECUTE grants, function security, indexes and advisors.
- Run negative tests as anon, authenticated users across roles/branches, and service_role. Do not treat service_role as a substitute for server-side actor authorization.
- Apply to Production only after the user separately approves the exact migration batch and exact project ref.

### Stage 5 — Edge Function configuration and security

- Review each function's authentication, authorization, tenant/branch scoping, input validation, CORS, error handling and secrets.
- Configure secrets only in verified Production. Deploy functions after schema readiness and specific approval.

### Stage 6 — Connect and test all four apps

- Connect website, POS, Admin and Rider to Production using browser-safe publishable keys only.
- Test authentication, catalog, Admin CRUD, publish/rollback, website checkout, POS online/offline delivery orders, dispatch, rider accept/reject, pickup, delivered, failure, return and role restrictions.
- Preserve catalog schema compatibility, targeted Realtime and the POS 15-second polling fallback.

### Stage 7 — Vercel previews and project wiring

- Connect four Vercel projects to the correct app root directories only after backend readiness.
- Use Preview deployments first. Resolve canonical POS/Admin/Rider domain assignments with the user before changing aliases or links.
- Keep the existing live customer website untouched until a separately approved cutover.

### Stage 8 — End-to-end verification and cutover

- Run full end-to-end tests, security checks, rollback rehearsal and backup restore test.
- Switch production traffic/domains only after a separate explicit cutover approval. Retain previous deployments/source as rollback.

## 12. Immediate next action

Stage 1 and Stage 2 are complete. Stage 3 (schema design/security review) is current. The key design artifacts are:

- `docs/architecture/production-erd-v1.md`
- `docs/architecture/production-schema-blueprint.md`
- `docs/architecture/database-application-contract-map.md`
- `docs/architecture/delivery-pricing-contract.md`
- `docs/architecture/security-access-matrix-v1.md`
- `docs/architecture/performance-security-operations-plan.md`
- `docs/architecture/menu-management-design.md`
- `docs/architecture/current-menu-baseline.md`

Next work: complete the field-level schema/column/index/constraint/RLS/grant specification using the confirmed delivery contract; then resolve remaining menu/deal/schedule/branch and Not Listed locality questions. Prepare migrations and isolated validation only after design review. The offline stale-catalog policy is resolved. No Production SQL, seeds, secrets, buckets, Functions or app deployments until the exact changes are reviewed and approved.

**New-chat instruction:** Read this file first, then read `production-erd-v1.md`, `production-schema-blueprint.md`, `production-field-level-schema-v1.md`, `source-schema-consistency-audit-v1.md`, `production-database-security-reliability-controls-v1.md`, `delivery-pricing-contract.md`, `delivery-lifecycle-contract.md`, `database-application-contract-map.md`, `security-access-matrix-v1.md`, `performance-security-operations-plan.md`, `menu-management-design.md`, and `current-menu-baseline.md`. Continue from Stage 3. Enforce owner-confirmed role boundaries: Admin and Owner full business access; Manager no Admin panel/no deletion; Cashier POS only with order processing, rider dispatch/reassignment, new-order rejection and narrow physical-return confirmation/no deletion; Rider portal only with own-offer/assignment isolation. Offline stale-catalog orders require explicit cashier/manager confirmation. Do not repeat the original repository/source audit or Production account/migration check unless the repo/project identity changes. Always update this handoff after meaningful work. Keep `main`, the original source repo and all live deployments unchanged until separate approvals.


### Owner decision — Manager restricted POS access confirmed — 2026-11-20

The user approved restricted Manager access to the POS application. This supersedes all earlier pending/awaiting-confirmation notes about whether Manager may enter POS.

**Manager may:**
- Sign into the POS application only; no Admin panel access.
- View and supervise branch operational orders and preparation/status.
- Oversee dispatch and assign/reassign riders.
- Confirm physical returned deliveries and record the return outcome/reason.
- View only the operational fields and branch-scoped history needed for these duties.

**Manager may not:**
- Access the Admin panel or its administration APIs.
- Manage categories, products, variants, modifiers, deals, menu publication or prices.
- Manage staff accounts/roles or invitations.
- Change delivery areas, listed fees, Not Listed default fee, or sensitive settings.
- Delete orders or records.
- Reject/cancel orders unless that authority is separately approved; deny by default for now.
- Access full payment reconciliation or unrelated rider/customer records.

**Other confirmed role boundaries remain:**
- Admin (the user) and Owner: equivalent full Flame Chick business access, with distinct identities and audit attribution.
- Cashier: POS only; process orders, assign/reassign riders, and reject newly received/unaccepted orders with an audit reason. Cannot delete orders. Cancellation of accepted/in-progress orders remains unapproved and denied by default.
- Rider: Rider portal only; may accept/reject only their own offers and update only their own assigned delivery. Must not view another rider's offers/assignments.
- No role, including Admin/Owner, physically deletes orders through normal business applications. Rejections, cancellations, corrections and returns are state transitions with append-only audit events.

**Return confirmation security contract:** Rider can report failed delivery/physical return; Manager confirms physical return. The confirmation must be a transactional, server-authorized command recording order/task, previous and new state, authenticated actor derived from verified JWT, actor role, server timestamp, reason/outcome and request/correlation ID. No client-supplied actor ID is trusted.

**Implementation implications:** POS route guards must admit Manager but expose only approved operational capabilities; Admin routes/APIs must reject Manager independently of UI; SQL grants, RLS, Edge Functions/RPCs and Realtime subscriptions must enforce branch scope and the same capability set. Add adversarial tests for Manager direct API/RPC calls, attempted catalog/staff/settings access, order deletion, cross-branch reads and unauthorized rejection/cancellation.

**Current Stage 3 next action:** finish field/status/API compatibility mapping against the source audit, complete RLS/grant and command-authorization matrix, and resolve remaining non-delivery decisions: rejection/failure reason requirements, Not Listed locality, publication/price authority, deal choices, schedule recurrence/branch scope, branch-specific menu needs, Kitchen/inventory scope and returned-order notification/payment treatment. Manager POS, Rider lifecycle and Website-only order quota are confirmed. Universal idempotency applies to Website and POS; POS is exempt from the customer website quota. No Production SQL or live app deployment is authorized.

## Owner decision — delivery lifecycle confirmed (2026-11-20)

The owner has now confirmed all five delivery lifecycle choices. This supersedes the earlier open delivery lifecycle questions in Section 13 and any earlier draft alternatives:

1. **Rider rejects an offer:** mark that offer rejected and return the task to the POS dispatch queue. Cashier or Manager manually assigns another rider. Do not auto-offer the next rider.
2. **Rider does not respond:** offer expires after exactly **60 seconds** from server-recorded creation and returns to POS for manual reassignment.
3. **Delivery fails:** the assigned Rider may report failure and choose to return the order. This only starts a return-pending-physical-confirmation state; it does not mean the restaurant has received the order.
4. **Delivery succeeds:** Rider marks delivered and the order completes immediately in the same transaction. No Cashier/Manager confirmation or OTP/photo proof is required in V1.
5. **Physical return confirmation:** either Cashier or Manager may confirm the returned order has physically arrived. The Rider cannot self-confirm receipt.

### Lifecycle design implications

- Keep order status and delivery-task status separate. A successful delivery is a delivered/completed order. A confirmed return is a distinct returned/failed terminal order outcome; never mark it delivered.
- Preserve each offer attempt (pending/accepted/rejected/expired), with server `offered_at` and `expires_at = offered_at + 60 seconds`. A rejection/expiry does not erase the offer; the next dispatch creates a new offer attempt.
- The database accept command must reject at or after `expires_at`, regardless of delayed background expiry processing. Use atomic row locking/conditional transitions so accept, reject and expiry cannot race into conflicting outcomes.
- Expiry processing is idempotent and updates the POS dispatch queue; missed Realtime events are recovered by POS normal fetch/15-second polling. Only the addressed Rider sees/responds to an offer.
- Rider acceptance atomically activates the single current assignment. Rider-only commands govern pickup, out-for-delivery, delivery success and failed-delivery/return intent.
- Return confirmation is a narrow POS command for Cashier or Manager, valid only after return is pending. It atomically closes the task and updates the order to returned/failed, appending immutable audit/history with task/order, prior/new states, verified JWT actor and role, server timestamp, reason/outcome and correlation ID. Duplicate confirmation must not duplicate effects.
- This specific Cashier permission does not confer Admin-panel access or general authority to cancel accepted/in-progress orders. Existing hard-delete prohibition remains for all roles.

### Updated design documents

- `docs/architecture/production-erd-v1.md`: lifecycle states, offer expiry, atomic acceptance, immediate delivered completion and return confirmation model.
- `docs/architecture/security-access-matrix-v1.md`: role capabilities; Cashier and Manager can confirm physical return, Rider cannot.
- `docs/architecture/database-application-contract-map.md`: event-to-application/database contract.

All are design-only updates on `work/production-source-audit`. No SQL migration was authored/applied, no Production schema/data/functions/settings changed, and no Vercel deployment or `main` branch change occurred.

### Next schema-design work

1. Reconcile the ERD's delivery-task, offer and assignment state model into a precise transition table, including order/task atomicity and event/audit payloads.
2. Specify exact offer-expiry execution: database-enforced 60-second acceptance cutoff plus idempotent expiry sweep/event delivery, without assuming a paid Supabase plan or depending on Realtime for correctness.
3. Complete the field-level table/column/constraint/index/RLS/grant specification and function contracts for delivery commands.
4. Finish the remaining business decisions that materially affect schema: cashier rejection reason requirement; Not Listed locality field; menu publish/price authority; deal choice model; schedule recurrence/branch scope; branch-specific menu needs; kitchen role/inventory needs. Preserve the already-confirmed decisions and do not reopen them.
5. Only after the schema specification is reviewed, create isolated test migrations. Production remains read-only until explicit approval.


## Delivery schema design checkpoint — 2026-11-20

- Added `docs/architecture/delivery-lifecycle-contract.md` (commit `5fa5392fba6968fc59996316b6c338a5c2b7f9d3`) as the field-level proposal for delivery tasks, immutable offer attempts, assignments, append-only delivery events, command authorization, transitions, expiry and adversarial tests.
- The conceptual ERD, schema blueprint and security matrix now link to/summarize that contract. The contract separates order state from task state; rider failure/return intent is not physical receipt; successful delivery completes the order immediately; confirmed physical return closes it as returned.
- Expiry correctness does not depend on a scheduler: accept checks database time against the exact 60-second deadline. A bounded idempotent expiry sweep on POS dispatch-queue fetch makes expired offers visible; optional scheduled processing is only an optimization and must be verified against the actual Free plan before use. POS polling remains the recovery path when Realtime is missed.
- No SQL migration has been authored or applied. Production remains read-only; no Vercel deployment, main branch, original source repo or live app was changed.

### Current next action

Complete the remaining field-level schema dependency matrix (tenant/branch identity, orders, order snapshots, delivery, publication, catalog and role/audit), then reconcile the outstanding business decisions: rejection/failure reason requirements; Not Listed locality field; publication/price authority; deal choice model; schedule recurrence and branch scope; branch-specific menu requirements; Kitchen role/inventory needs; returned-order notification/payment treatment. Do not reopen the five confirmed delivery lifecycle decisions or the confirmed role/offline-order policies. Once the schema spec is internally consistent, present it for review before authoring isolated test migrations. Production DDL still requires separate explicit approval.

### Schema consistency pass — 2026-11-20

- Added the detailed delivery lifecycle specification: `docs/architecture/delivery-lifecycle-contract.md`, commit `5fa5392fba6968fc59996316b6c338a5c2b7f9d3`.
- Linked the delivery contract from the Production ERD (commit `782b9d20ab458279133fd25e41027c43df817d15`). Updated the schema blueprint to mark the lifecycle confirmed (commit `cac6c3ce0b755e062104734d0456aec345d3a581`) and the security matrix with the narrow Cashier/Manager return-confirmation permission (commit `8195c32e36d5d46ce39834bce8b2c331f63c99ef`).
- Corrected superseded open-decision wording: Manager restricted POS access, Rider lifecycle and offline stale-catalog policy are confirmed, not pending. Relevant consistency commits: `4f41085bd82805f7708708250cbcef0bb2cdefee` (security matrix), `4a8a02571a4b9feb4d1805656cf72ec0181c7e43` (schema blueprint), `d655088af126a97de5d81ab44955297b7907c4a1` (ERD), and `a556e0c5a0fb1666f9db58362ab093f845d93a97` (handoff next action).
- No Production SQL, database, Supabase settings, Edge Functions, Storage, users, Vercel deployment, `main`, or original source repository was changed.

## Field-level schema + Free-plan security checkpoint — 2026-11-20

### New canonical design document

- Added `docs/architecture/production-field-level-schema-v1.md` on `work/production-source-audit`.
- File creation commit: `b7dd21ff4fd96940fd3440464c32a512bc62a3c7`.
- Verified the saved file exists, has all 21 expected sections, includes rate-limiting and Edge Function budget guidance, and contains no SQL DDL statements. Latest verified file blob SHA at verification: `19b979d77075987f62e3a7929b3ca9e3ccbc0025`.
- It defines candidate fields/types/constraints for tenant/branch, staff roles, catalog, modifiers, deals/schedules, immutable menu publications, delivery pricing, orders and snapshots, payments (without inventing a payment gateway), delivery tasks/offers/assignments/events, internal notification outbox, private rate-limit buckets, RLS/grants, indexes, migration order and tests.
- It deliberately leaves unresolved business decisions marked open; it does not seed menu data or infer GST/inventory/payment refund rules.

### Supporting documents updated

- `docs/architecture/production-erd-v1.md` — links to the field-level schema. Commit `0b4e0696823e56ac409a05d562143346528c2e35`.
- `docs/architecture/production-schema-blueprint.md` — adds Free-plan and rate-limit implications. Commit `9def86b47face3ab7fec2587aee13bf5551ae27e`.
- `docs/architecture/database-application-contract-map.md` — records function/read path budget. Commit `3fc860aba51c516423e1c96a69900280bb47644a`.
- `docs/architecture/performance-security-operations-plan.md` — records current invocation limits, rate-limit proposal, usage thresholds and official references. Commit `39472371c485ade276d11ddd668df68abac69c5a`.

### Free-plan / Edge Function design decisions

- Retain the four existing domain functions: catalog, order, delivery and staff-admin. No function-per-CRUD, no function chaining, no extra worker for V1.
- Current official Free allowance checked 2026-11-20: 500,000 Edge Function invocations/month; function count ceiling 100/project; 256 MB memory; 2 seconds CPU/request; 150 seconds worker wall clock. Invocation allowance is shared at organization usage level, so inspect usage by project. A function 401/403/429/500 still counts; CORS preflight OPTIONS is not billed.
- High-frequency POS 15-second polling and safe Rider reads should use RLS-protected Data API reads, not Edge invocations. Rider gets own-offer/assignment filtering; POS Realtime stays branch-filtered. Order History remains normal paginated fetch/manual refresh.
- Cache immutable published catalog by version/checksum. Coordinate any combined health+catalog response with an API schema-version change; preserve last-known-good POS IndexedDB cache until new cache is fully staged and atomically switched.
- Retain Supabase Auth native rate limits. The owner-approved customer phone quota is Website-only (source=website): 3 committed orders per rolling minute, 3 per rolling 10 minutes, 15 per rolling hour. POS is explicitly exempt, including POS delivery. Universal idempotency remains required for Website and POS. Any additional Rider/dispatch/staff rate limits remain test proposals, not approved Production policies. Use private HMAC subject digests where applicable; do not store raw IP/phone/email. Do not add Redis/Upstash or continuous workers at current scale.
- Candidate test thresholds for non-order actions only (not Production enforcement): Rider 20 actions/min; staff dispatch 30/min; staff invitations 5/hour. Customer website-order caps are separately owner-approved as 3/rolling minute, 3/rolling 10 minutes and 15/rolling hour per normalized phone. This supersedes earlier generic guest-order thresholds.
- Validate actual trusted client-IP header at Supabase ingress with spoofed forwarding-header tests before relying on IP rate buckets. If trust cannot be established, don't claim IP rate limiting works; use actor/phone limits and consider verified Turnstile step-up after evidence. Application 429 does not save function invocation quota; sustained volumetric abuse needs upstream/platform mitigation.
- Warning thresholds: 50%/250k invocations investigate; 70%/350k optimize; 85%/425k prepare degradation response; 95%/475k stop nonessential calls while protecting essential order/delivery writes. These are internal manual thresholds, not platform alerts.

### Safety / state

- Documentation-only changes on the review branch. No Production SQL, schema, data, secrets, Supabase settings, Auth users, Storage, Edge Functions, Vercel deployment, `main`, or original source repo was changed.
- No migration file has been created or applied. Production remains read-only.

### Next work (in order)

1. Conduct a consistency review of the new field-level specification against the current four application source contracts and existing schema/ERD. Fix any mismatched fields, enum/status values, request/response payloads or permission assumptions before writing SQL.
2. Resolve the remaining owner decisions: rejection/failure reason requirements; Not Listed locality label; menu price/publish/rollback authority; deal choice model; schedule recurrence/branch scope; branch-specific menu/pricing needs; Kitchen/inventory needs; returned-order payment/customer-notification treatment; Rider arrival event.
3. Produce the complete RLS/grant/function authorization matrix and adversarial test matrix from the field-level spec.
4. Review the schema with the owner. Only then create isolated test migrations. Check project slot availability; use local Supabase if no safe Free test project slot exists.
5. Production remains read-only until the user explicitly approves a specific reviewed migration batch.

## Source/schema audit and owner correction — website-only quota — 2026-11-20

### Correct customer order limit scope

The owner clarified that the three customer phone limits apply **only to customer website checkout**:
- 3 committed website orders per rolling minute.
- 3 committed website orders per rolling 10 minutes.
- 15 committed website orders per rolling hour.
- Keyed by server-normalized customer phone with server-side HMAC digest.
- POS orders are exempt, including POS delivery orders that use the shared Order API. Authenticated staff-entered phone/WhatsApp/manual/third-party sources are also exempt.
- Do not rate-limit POS by customer phone. The Website quota branch is invoked only for a server-verified source=website route.
- Count only successful new website orders that commit. Exact idempotent replay is free; later restaurant reject/cancel does not refund a committed order slot; invalid/rolled-back attempts do not consume it.
- This is per phone number entered, not verified human identity; no OTP/SMS requirement is being added.

### Universal idempotency is separate and applies to Website + POS

- Website retains its stable pending idempotency key and payload in sessionStorage until confirmed success.
- POS retains its stable idempotency key derived from localOrderId across network retry, page/device restart and offline resubmission.
- Both sources use server-generated canonical request fingerprints and unique database scope (restaurant, branch, source, idempotency_key).
- Exact same key + same canonical payload returns the existing order without duplicate order items, task, payment, status event or notification. Same key + changed payload returns HTTP 409.
- Retry after timeout reuses the same key; clients do not create a new key merely because the response was lost.
- Command IDs/deduplication also required for retryable status, dispatch, Rider, return, staff and catalog mutations. Notifications use unique transactional outbox keys.
- POS remains exempt from the website phone quota while retaining all idempotency, authorization, transactional and price-validation controls.

### Source/schema consistency audit

- Added [source-schema-consistency-audit-v1.md](docs/architecture/source-schema-consistency-audit-v1.md). Latest audit correction commit: 5cd9f953d8dec540b41e12c8c43900ec9a11cb90.
- Created [production-database-security-reliability-controls-v1.md](docs/architecture/production-database-security-reliability-controls-v1.md). Commit: a9ad95d50ce900ba6eb165a3fd1608333f62eb56.
- Updated [production-field-level-schema-v1.md](docs/architecture/production-field-level-schema-v1.md). Latest idempotency/quota scope commit: a4fbf4350748678e93000feee019015d8497e80b.
- Updated [performance-security-operations-plan.md](docs/architecture/performance-security-operations-plan.md). Latest quota clarification commit: f986d4b5d014a93baa197f9b75158e2f1ec7b3d5.
- Updated [database-application-contract-map.md](docs/architecture/database-application-contract-map.md). Website-only scope and reliability link commit: a91ed837e0231187eeffdf4dd4e2ebd21860fdb0.

### Security/reliability items added to the design

- Universal order idempotency: stable source-scoped keys, server canonical fingerprints, database uniqueness, transaction locks, exact replay behavior, 409 on changed payload, concurrency/ambiguous-timeout tests.
- Command idempotency for status, dispatch, Rider, return, staff, publish/rollback and payments/webhooks when implemented.
- RLS default-deny for every public app table, verified branch/tenant checks, Rider own-resource isolation, Manager Admin denial, explicit SECURITY DEFINER hardening, and explicit service_role grants after existing default-privilege revocation.
- Immutable order/item/fee/catalog snapshots; append-only status/delivery/staff audit events; no normal-app hard deletion.
- Atomic multi-row order/dispatch/return/publish commands; DB row locks and database time for transition rules.
- Transactional notification outbox with uniqueness and bounded retry; notification failure cannot roll back a committed order/delivery event.
- Bounded retry/backoff, stable offline POS localOrderId, preserve queue until server confirmation, and last-known-good catalog cache with atomic switch.
- Server-side money calculation, delivery area/default fee validation, idempotency and catalog-version checks; no client-supplied authority.
- Encrypted off-project DB and Storage backups, restore tests, additive expand/migrate/contract migrations, and security/concurrency/recovery verification gates.
- Free-plan-conscious read paths, pagination, focused indexes, narrow Realtime and four-function architecture.

### Safety and current implementation status

These are design and documentation updates only. The source audit was read-only; no application code was modified. No Production SQL/schema/data, Auth users, settings/secrets, Edge Functions, Storage, Vercel, main branch or original source repository was changed. No website quota is active yet. No universal idempotency hardening has been deployed yet; the existing source already has client order keys and an order idempotency mechanism, but the stronger canonical fingerprint, transaction-safe all-source verification and command-level idempotency remain implementation requirements. Production remains read-only.

### Next actions

1. Resolve exact application schema names/status mappings and introduce versioned DTO adapters rather than blindly renaming fields.
2. Complete the exact RLS/grant/function execution matrix and test cases against the security access matrix.
3. Define the service-only atomic order RPC: universal idempotency for Website and POS; website-only HMAC phone quota; POS bypass.
4. Finalize remaining menu/deal/schedule/branch/locality/return-payment decisions.
5. Only after owner schema review, create isolated test migrations and test against local Supabase or a verified safe test project. Production requires explicit separate approval.

## RLS, grants and Edge Function authorization matrix — 2026-11-20

- Added [production-rls-grant-function-matrix-v1.md](docs/architecture/production-rls-grant-function-matrix-v1.md), initial commit 3d7b43707f80d26c7ba763a3a2eadd809863dd5a; Manager permission corrections commits 589dd1273b3b5e3fb21b429e5173550165869888 and final Cashier-only POS order-create boundary b67356f390c539d047b81756375384405e1952ae.
- It maps public roles, all schema table groups, direct Data API grants, private service-only tables, four Edge Function action gates, RLS policy rules and adversarial verification.
- It explicitly grants full Admin + Owner business authority, denies Manager Admin API and general cashier order-processing rights, allows Manager approved branch operational monitoring/dispatch/reassignment/return confirmation, and keeps Cashier order processing/new-order rejection/dispatch/return confirmation without deletion.
- Website public order creation is the only phone-quota path. POS, including POS delivery, bypasses that quota but still uses universal order idempotency, verified staff/branch checks, server-side prices/fees and database transactions.
- Source mismatches remain documented, including the current Admin UI Manager route guard, staff-admin Owner-only behavior that must align with Admin + Owner authority, source DTO field/status differences, direct Admin REST multi-request writes and Rider return wording. No source code was changed by the audit.

### Next design/implementation gate

Finish field/status compatibility and decide the remaining business details. Then prepare a migration-specific RLS/grant inventory and SQL only for an isolated test database. No Production SQL, RLS, grants, Edge Function changes or deployments are authorized yet.


## 2026-11-20 — Customer website security threat model added

User clarified that security review must not blindly enforce only previously stated preferences or ignore additional risks. Treat security as a system-wide, defense-in-depth objective: the owner's requirements are constraints and business decisions, not a complete threat model. Independently identify threats, make security recommendations, explain trade-offs, and verify controls before claiming the website is secure. No "fully secure" guarantee.

New canonical document:
- \`docs/architecture/website-security-threat-model-v1.md\`

This document establishes a customer-website threat model covering assets and trust boundaries; public API validation; secret leakage; broken access control/IDOR; source and role spoofing; server-side price/fee validation; replay/idempotency; bot/volumetric abuse; SQL/HTML injection and XSS; CSRF/CORS; order enumeration; PII/log leakage; Storage abuse; webhook replay (future); dependency/deployment risks; database resource exhaustion; availability/backup/restore; audit integrity; security headers/CSP; release gates and tests.

Important distinctions:
- Existing owner-approved website-only quotas remain 3/minute, 3/10 minutes, 15/hour per normalized submitted phone; POS remains exempt. These controls do not prevent Edge Function invocation exhaustion or verify phone ownership.
- Evaluate trustworthy IP signals carefully; do not trust client-supplied X-Forwarded-For. Consider managed challenge only if measured abuse justifies friction/dependency/cost.
- Public site should expose published catalog only, never raw customer orders or order history. Any future customer tracking endpoint requires separate high-entropy expiring capability design.
- All prices, discounts, delivery fees, availability and state transitions must be computed/validated server-side. No browser-supplied actor, role, branch or source authority.
- Add/verify CSP, HSTS (after domain/HTTPS checks), nosniff, Referrer-Policy, Permissions-Policy, frame policy, exact CORS allowlists, cache isolation and source-map hygiene.
- Audit third-party scripts, dependencies, secrets, build artifacts, Git/Vercel permissions and deployed headers.
- No Redis/Upstash/OTP/SMS/WAF/Turnstile or other paid/dependency addition is assumed; assess cost and evidence first.
- Threat model is design only, not evidence the controls currently exist. Actual live headers, dependency/XSS audit, route security tests, isolated implementation and release testing remain outstanding.
- No live application, Production database, Supabase function/Storage policy/secret, Vercel setting, header, domain or deployment was changed. Work remains confined to documentation on \`work/production-source-audit\`.

Next recommended work: perform a focused source-level review of the customer website and public Order API for XSS sinks, unsafe DOM rendering, third-party scripts, exposed config/secrets, PII leakage, CORS/input/body bounds and cache behavior; then inspect deployed response headers and build artifacts. Keep Production read-only and do not implement or deploy changes without explicit approval.

## 2026-11-20 — Website security audit deferred until database integration

The owner explicitly deferred the detailed customer-website audit. Do not spend the current work stage auditing or modifying website code. Continue the Production database design and validation work first: schema consistency, field/status/API mapping, RLS/grants/function authorization, transactional commands, idempotency, auditability, migration safety and adversarial/recovery tests.

**Mandatory integration-stage gate:** When the project is ready to connect/attach the customer website to the database (or enable its live database-backed ordering path), remind the owner and stop before integration. Perform the full website security audit from `docs/architecture/website-security-threat-model-v1.md`, including website source, public Order API, deployed headers/build artifacts and end-to-end authorization/input/cache tests. Do not silently skip this gate, and do not claim website security based on the threat-model document alone. No website audit or code changes are authorized in the current database-focused stage.

**Current next work:** continue the database-only consistency pass: reconcile actual application DTOs and status/field names with the proposed schema using versioned adapters; identify exact command boundaries and transaction invariants; then finish the RLS/grant/function matrix and executable adversarial test plan. Resolve only business choices that materially affect schema shape. After design review, prepare isolated test migrations; Production remains read-only and requires separate explicit approval.

## 2026-11-20 — Database-first continuation and authority consistency correction

- The owner reiterated: defer the website audit until the website is being attached/connected to the database. The integration-stage security audit is a mandatory stop-gate; do not audit or modify website code during the current database-focused stage. This reminder is recorded here for future chats; no calendar date was specified because the trigger is a project milestone.
- Continue database work now: schema/DTO consistency, tenant and branch integrity, transactional command boundaries, RLS/grants/function authorization, idempotency, audit invariants, and isolated adversarial/recovery tests.
- During a targeted consistency read, found one stale sentence in `production-field-level-schema-v1.md` that still said to preserve Owner-only staff role assignment. This contradicted the owner's explicit Admin + Owner full-business-authority model and the RLS matrix. Corrected it: both Admin and Owner can invite, assign/change roles and branches, and deactivate staff; all actions remain transactionally audited and guarded against self-escalation and removal of the last active Owner. Manager/Cashier/Rider remain barred from staff administration.
- Schema correction commit: `a67ce86245d92cd4f5f7882f5166721204974637`.
- Handoff reminder/gate commit: `53adbe2baf140e91c98ec1fd01b0f8e92f9c901e`.
- No website audit/code change, application code change, SQL migration, Production DDL/data/settings change, Edge Function deployment, Storage change, Vercel deployment, `main` change or original-repository change was made.

**Next database-only action:** continue targeted cross-document consistency review, starting with staff-role and tenant/branch constraints, then catalog publication/version integrity and order/delivery transaction boundaries. Record each correction in the canonical design docs and this handoff. Do not begin migrations until the schema and authorization contracts are internally consistent and reviewed; any test migration must be isolated from Production.

## 2026-11-20 — Database integrity review progress

Continued database-only review as requested. Re-read the canonical handoff, field-level schema, ERD, delivery lifecycle contract, application/database contract map and RLS/function matrix before making targeted edits. No broad source rescan and no website audit were performed.

### Changes committed on `work/production-source-audit`
- `d66a26236696a281a54443d763e58600296fb4df`: aligned the contract map's staff-admin target with Admin + Owner authority and explicitly recorded unresolved branch-specific catalog/pricing scope.
- `7b97e79f96b208bfea2be38d78d5c28cccca068b`: strengthened field-level schema with Admin/Owner catalog publish authority, atomic publication pointer/revision requirements, trusted canonical snapshot checksum, strict listed-area/Not-Listed consistency, and bounded/versioned server-side idempotency fingerprint requirements.
- `8fb9b2f643be497180f202a32c1fdfc9ace8d92b`: serialized last-active-Owner protection with a restaurant-level staff-authority lock to prevent concurrent demotion/deactivation races.
- `db4410242ffe1d55d5caaa4aa49999788be0e234`: documented staff invitations as a recoverable idempotent workflow across Supabase Auth and PostgreSQL; no false claim of one cross-system ACID transaction.
- `d6e93fc37d64a415de17ec97b56597c2e46c4010`: prevented anonymous website idempotency replay from becoming an order-data disclosure/lookup mechanism.
- `84a1c2d74c27b6cfd9740e7a6ceb18f133a5b71c`: added `docs/architecture/database-integrity-review-v1.md` with tenant/branch invariants, catalog/order/delivery/staff transaction rules, adversarial tests and schema-freeze blockers.

### Key findings / blockers before schema freeze
1. Define how the public website resolves exactly one branch; never trust arbitrary browser branch IDs.
2. Decide whether menu/prices/availability are restaurant-wide or branch/channel-specific; current proposal has restaurant-level publication pointer but branch-level delivery pricing.
3. Confirm deal choice structure, Not Listed locality input, returned-order payment/notification behavior, arrival event, POS local-only order scope and staff role multiplicity.
4. Validate that every composite FK, RLS predicate, grant, SECURITY DEFINER execution grant, command transaction and audit/outbox effect is represented in executable migration tests.

### Next database work
- Continue targeted contract review for role multiplicity, branch resolution and catalog publication scope.
- Reconcile decisions that alter key structure before schema freeze.
- Then create a clean migration plan and test only on a verified isolated database. Production remains read-only and requires separate explicit approval.

### Safety / deferred website audit
The customer website security audit remains deferred until the website is about to be attached to the database. At that milestone, stop and run the complete website threat-model audit before integration. No website source was audited or changed in this step. No SQL/migration, Production schema/data/Auth/settings, Edge Function deployment, Storage, Vercel, `main`, or original repository was changed.

## 2026-11-20 — Customer drop-off pin scope clarified

Owner clarified that Flame Chick will **not** collect Rider live location and does **not** want continuous customer location tracking. The earlier customer live-location draft was therefore superseded.

### Approved future feature
- Customer may optionally provide one fixed delivery destination pin: either one-time device coordinate (with browser permission) or manually placed map pin.
- Written delivery address remains required; pin is optional and declining location permission never blocks checkout.
- Assigned Rider and authorized POS staff may view that fixed pin and open a Google Maps directions link generated by the server/app from validated latitude/longitude.
- Store at most one current pin per delivery order in private `app_private`, bound by composite tenant/branch/order/task keys. No arbitrary customer-supplied maps URL.
- Rider can read only their own current active assignment; POS access is role/branch-scoped. Reassignment immediately removes previous Rider access.
- No Rider GPS, continuous customer GPS, location sessions, update streams, movement history, background tracking, location polling, location Realtime channel, geofencing or route tracking.
- Proposed precise-coordinate retention is 24 hours after terminal delivery state; confirm operational/legal need before implementation.

### Documentation
- New canonical design: `docs/architecture/customer-dropoff-pin-data-contract-v1.md` — commit `97188d00922ea0ad2cf1985f5ecb4a5bebfd0bb6`.
- V1 product decisions updated with the static drop-off pin rule — commit `343ed113b4d8f16441dbe8dbbfebcfc218316555`.
- The previous `docs/architecture/customer-live-location-data-contract-v1.md` is an obsolete draft. Do not implement it; the new static drop-off pin contract supersedes it. If possible, rename/archive it in a later docs hygiene pass; no live tracking design should remain normative.

No application code, SQL/migrations, Production schema/data/settings, Edge Functions, Realtime, Vercel, `main`, or original source repository was changed. Website security audit remains deferred until immediately before website/database integration and is a mandatory stop-gate.

**Next database action:** incorporate the static drop-off location row and narrow Rider/POS read permissions into the canonical ERD and RLS/function matrix. Do not add any live tracking or location-stream structures. Continue documentation/test design first; Production remains read-only.


## 2026-11-20 — Static customer drop-off pin integrated into database design

Completed the next database-only step for the owner-approved one-time customer delivery pin. Re-read the handoff and canonical schema, ERD, RLS matrix, integrity review, product decisions and drop-off pin contract before editing. No website audit was performed.

### Exact approved feature
- Customer may optionally share one fixed delivery destination pin using one-time device coordinates or a manually placed map pin.
- Written delivery address remains required; skipping the pin or denying GPS permission must not block checkout.
- The assigned Rider and authorized POS staff can retrieve the same point and open Google Maps directions generated from validated coordinates.
- No Rider GPS/live location, no continuous customer tracking, no location update streams, no movement history, no geofencing, no location Realtime, no polling, no background tracking.
- Coordinates are private and bound to the exact restaurant, branch, order and delivery task. At most one current pin per delivery.
- Rider can read only their current active assignment; reassignment removes the previous Rider's access. POS Manager/Cashier access is branch-scoped; Admin/Owner access follows restaurant-wide business authority.
- Public clients cannot read private coordinates. Optional pin writes are part of the existing validated website order transaction; no direct table write or separate location endpoint.
- Google Maps URL is generated from validated coordinates; arbitrary customer-provided URLs are never persisted/opened.
- Proposed precise-coordinate retention is 24 hours after terminal delivery outcome; confirm support/legal needs before implementation.

### Documentation updated
- docs/architecture/customer-dropoff-pin-erd-authorization-addendum-v1.md — commit d9625236ece0110e8647e9e767502dd57ec6d780.
- docs/architecture/production-erd-v1.md — ERD relationship extension, commit 3d4bbd259865faa9b74afc765db1b118ef7b13ee.
- docs/architecture/production-field-level-schema-v1.md — private table/constraints/transaction/retention, commit 7b8ed35fb05314efcc5b5512fcf5d024d2aa29a9.
- docs/architecture/production-rls-grant-function-matrix-v1.md — no direct grants; narrow Rider/POS read rules, commit 23e4ab00c45b8ddb6434ffa3c0260555965f6212.
- docs/architecture/database-integrity-review-v1.md — integrity invariants and adversarial tests, commit fc3dd7affa88430ea1255d8e84e3e48f97420e20.
- docs/architecture/customer-live-location-data-contract-v1.md — explicitly marked OBSOLETE / DO NOT IMPLEMENT, commit 668b746718bb369d217d17820daab92eb15dde0f. Use only the static drop-off pin docs as normative.
- This handoff entry records the integration.

### Remaining design checks
- Confirm whether Admin/Owner can access pin after terminal state for customer support; default is no Rider access and operational POS access ends with terminal task.
- Confirm 24-hour coordinate retention against actual support/legal requirements before migration.
- During SQL design, ensure matching composite unique keys exist on orders/tasks to support tenant/branch/order/task foreign keys without weakening isolation.
- Add precise pin only to the authorized Rider/branch POS delivery-detail projection; verify existing Delivery API DTO does not accidentally return customer coordinates to any other role.
- Website security audit remains a mandatory stop-gate immediately before attaching website to database.

No application source, SQL migration, Production schema/data/Auth/settings, Edge Function, Realtime publication, Storage, Vercel, main, or original source repository was changed. Production remains read-only.

**Next database-only step:** complete a cross-document consistency check for the static pin design and then proceed with the wider migration-readiness/test plan. Do not implement continuous location tracking.



## 2026-11-20 — Database V1 consistency and migration-readiness review

Completed a database-only consistency pass across the canonical field-level schema, ERD, RLS/function matrix, product decisions, delivery lifecycle/pricing contracts, integrity review and existing handoff.

### Resolved design now reflected in schema/ERD/RLS
- Website branch resolution: one eligible branch auto-resolves; multiple eligible branches require customer choice; zero fail closed; branch ID is revalidated server-side.
- Restaurant-wide products/deals/base prices with branch-specific variant/deal availability and delivery pricing. Orders bind publication version and branch availability revision. No branch price override in V1.
- One role identity per user per restaurant. Manager/Cashier/Rider may hold same role in multiple branches; Admin/Owner is restaurant-wide and exclusive. Same-role-across-branches requires serialized command + database guard; partial unique index alone is insufficient. Last active Owner protected under restaurant lock.
- Curated deal choices only, explicit non-negative surcharge, no category pools/free-text substitutions; ambiguous variant resolution rejected.
- Returned order settlement: COD not collected -> closed-uncollected/no refund; actual collection immutable; refund is a separate append-only ledger entry only after payout, Admin/Owner only, idempotent and locked against over-refund.
- Optional fixed customer drop-off pin only; no Rider GPS or continuous customer tracking.

### Documents updated
- `docs/architecture/production-field-level-schema-v1.md` — branch capabilities, role identity/consistency, branch availability overlays/revision, payment collection/refund ledger and remaining open holds. Latest commit `3c8c0e362da3b4a67d10d619dc926585b5e08590`.
- `docs/architecture/production-erd-v1.md` — resolved decisions and remaining true open questions. Commit `3d85728c3731cf2cf00c6c3ca47408d97476ef60`.
- `docs/architecture/production-rls-grant-function-matrix-v1.md` — role/branch invariants, branch availability and payment/drop-off access controls. Commit `74e27f33c98abd678d57c5f13a680a3bf1905ffd`.
- `docs/architecture/database-integrity-review-v1.md` — reconciled resolved decisions, blockers and new concurrency/privacy tests. Commit `fe8df898cfb4bdca6dd164ece69d54673f5e2a65`.
- New `docs/architecture/database-v1-migration-readiness-review.md` — consolidated security baseline, migration sequence, engineering blockers, test plan and Production boundary. Commit `9a1a1d4069f011df2950fb3964e577cc2c3bbc05`.

### Remaining genuine holds
1. Not Listed locality/mohalla label in addition to full address.
2. Deal schedule recurrence/overnight/timezone/overlap/branch semantics.
3. Kitchen role approval and exact access (deny by default).
4. Ingredient inventory (excluded unless approved).
5. Rider arrival-at-restaurant as separate event vs pickup next.
6. Drop-off pin retention (proposed 24 hours after terminal state) and exceptional Admin/Owner access after terminal state.
7. Exact legacy source/status/fulfillment/payment DTO mapping and API versioning.
8. Website security audit remains intentionally deferred, mandatory immediately before website/database integration.

### Migration-readiness outcome
The design is ready for the next **controlled DDL specification and isolated migration prototype**, not Production. Next begin with read-only verification of the already-applied baseline, then write exact SQL for private schema/privilege rules, tenant/branch keys and identity/role foundation. First confirm an isolated local/test database; do not use Production for tests. Verify backup/restore of both PostgreSQL and Storage. Production remains read-only and every Production change requires separate explicit approval.

No SQL migration was created or applied. No app source, Edge Function, Auth, Storage, Realtime, Vercel, main or original source repository was changed.



## 2026-11-20 — Batch 0 read-only Production baseline verified

After the migration-readiness review, performed read-only verification against Flame Chick Production project ref `adkrxfnawdiljhjaavnj`.

Verified:
- Project ACTIVE_HEALTHY; PostgreSQL 17.12.0; Mumbai ap-south-1.
- Exactly one application migration: `20261119125153 flame_chick_postgres_default_privileges_hardening`. Never reapply.
- No application base tables in `public`; `app_private` schema does not exist yet.
- No app tables published to Realtime.
- Only public routine is `public.rls_auto_enable()`; its current EXECUTE ACL is postgres only.
- Security, performance and health advisors each returned zero lints during this read-only check.
- Extensions observed: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp.
- Public schema USAGE exists for anon/authenticated/service_role; this is not itself table DML access.

**Important residual risk confirmed:** pg_default_acl still has broad anon/authenticated/service_role defaults for objects created by internal role `supabase_admin` in public. The applied hardening has removed application-role defaults for objects created by normal `postgres`, but does not remove the internal `supabase_admin` defaults. No application tables currently exist, so no application data exposure was observed. Before first migration, prove migration sessions create application objects as `postgres`; verify object owner, ACL and RLS on every created object. Never create Flame Chick application objects as `supabase_admin`. Do not try to alter Supabase-managed internal defaults without a supported approved route.

Read-only queries and advisors only. No SQL writes, migrations, Production settings, app source, functions, Auth, Storage, Realtime, Vercel or deployments changed.

### Current readiness status
- Database V1 business decisions reconciled.
- Migration-readiness review written.
- Batch 0 read-only baseline verified.
- Production remains read-only; zero advisor lints are not proof of future schema security.
- Next: prepare the exact DDL/constraint/index/trigger/function/grant specification for private schema, tenant/branch foundation and role identity. Before isolated testing, confirm the local/test environment and verify migration execution role. No Production SQL without separate explicit approval.



### Follow-up consistency corrections and latest verification

- Application/database contract map updated to remove resolved business questions from its open list and align branch catalog/role/payment decisions — commit `bf5e50e6299cb865d83ddb648ade8fc7e8bf3398`.
- Field-level schema restored explicit cross-links/reminders for the website-only quota, universal Website/POS idempotency and static drop-off pin after the V1 open-decision section — commit `f9f717046dd02cfc9f00010f8ac85f11ca8202fc`.
- Migration-readiness report appended with actual Batch 0 read-only Production findings and the internal `supabase_admin` default-ACL caveat — commit `348041f9df6a48d334f00c8cc6f658c3b1377bb1`.
- Latest readiness report path: `docs/architecture/database-v1-migration-readiness-review.md`.
- Latest handoff commit after recording Batch 0: `ba0ad951b68f41dfc8054d26f1a807671c386b30`.

The nine principal schema/readiness/location/handoff documents were fetched again after edits. Core branch/role/payment/pin decisions and Batch 0 findings were verified. Some simple keyword checks were inconclusive because headings/phrasing differ; content was inspected directly where needed. No SQL writes were made.



## 2026-11-20 — Foundation DDL specification prepared (Batches 1–3)

Prepared `docs/architecture/database-v1-ddl-spec-batches-1-3.md` — commit `bef7937c885b44599a28d5a75426c67f34abb2c6`, then tightened invitation parent keys and role lifecycle consistency — latest commit `024924d932a91dab42b28d2ba99e1c1d5f9d0638`.

The specification covers:
1. Private `app_private` schema, privilege boundary, postgres-owned default ACL expectations and exact public RPC wrapper policy.
2. Restaurant/branch tables, website eligibility flags, composite tenant keys and no seed data.
3. User profiles, one-role-per-user/restaurant rule, same-role multi-branch assignments, serialized role changes, last-active-Owner protection, append-only staff audit and normalized private invitation workflow.

No SQL migration file has been created or applied. The document is a reviewed DDL specification, not executable SQL.

### Test-environment constraint
The current execution environment did not expose a local Supabase CLI, Docker or psql binary. Do not create a Supabase cloud branch/project without checking Free-plan availability/cost and obtaining the required user confirmation. The Production project must not be used as a migration test target.

### Next action
Before turning this specification into SQL migrations, establish a verified isolated local/test database and prove migrations run as `postgres`, not `supabase_admin`. Then implement/test Batch 1 first, inspect object ownership/default ACL/RLS/grants, and continue to Batches 2–3 only after passing. Website audit remains deferred until immediately before website/database integration.



## 2026-11-20 — Owner confirmed migration execution-role safeguard

The owner agreed to the following mandatory rule for all Flame Chick application migrations:
- Run migrations using the normal `postgres` migration owner role.
- Never create Flame Chick application objects as internal `supabase_admin`.
- After every migration, verify object ownership, RLS enabled state for exposed tables, table/schema grants, function EXECUTE ACLs and default ACL behavior.
- If the migration session role cannot be proven to be `postgres`, stop before applying SQL.
- Do not attempt unsupported changes to Supabase-managed internal `supabase_admin` defaults.

This is an owner-confirmed safety gate, not an instruction to change Production. Production remains read-only unless separately approved.



## 2026-11-20 — Isolated database test-environment assessment

No database test environment has been created and no SQL has been executed.

Execution environment inspection:
- Linux x86_64, kernel 6.18.57.
- glibc 2.41.
- Node.js 22.16.0 and npm available.
- Supabase CLI, Docker, Podman, psql and pg_isready are not installed.
- Docker socket unavailable.
- Approximately 5.8 GiB RAM and 30 GB free disk at inspection time.
- Attempt to query the npm registry for the current Supabase CLI timed out; no CLI installation was performed.

Current safe route:
- Supabase documents an experimental native local runtime for Linux x86_64/arm64 that does not require Docker, provided the CLI version is at least 2.119.0 and experimental stack mode is enabled.
- This execution environment meets the documented OS/architecture/glibc floor, but the runtime has not yet been installed or tested.
- Hosted Preview Branching is not included in the Supabase Free plan and can incur compute/usage charges. Do not create a hosted branch or incur cost without explicit review and approval.
- Prefer the no-cost local native runtime. If the CLI cannot be obtained or the runtime proves unsuitable, stop and present alternatives before using any cloud resources.

Next action:
1. Obtain the official current Supabase CLI without changing the application repository or Production.
2. Verify CLI version and native-runtime support from official documentation.
3. Initialize/use a local-only test stack in a disposable workspace, not the Production-linked project.
4. Test Batch 1 before proceeding to Batches 2–3.
5. Record test results and update this handoff after each meaningful milestone.

Production remains read-only. No migration files were added to the deployable migrations directory, no test branch/project was created, and no application SQL was applied.


## 2026-11-20 — Batch 1 rollback-only privilege probe

The owner approved proceeding carefully against the connected Flame Chick Supabase project because it is pre-launch, has no business data/application tables, and is on the Free plan. The connected project was used only for disposable, rollback-only SQL probes—not as a persistent application schema deployment.

### Read-only preflight
- Project `adkrxfnawdiljhjaavnj` ACTIVE_HEALTHY, PostgreSQL 17.12, Mumbai `ap-south-1`.
- SQL execution identity verified as both `current_user=postgres` and `session_user=postgres`.
- Existing migration remains exactly `20261119125153 flame_chick_postgres_default_privileges_hardening`; it was not reapplied.
- No application relations exist in `public` or `app_private`; `app_private` absent.
- Existing `ensure_rls` event trigger and `public.rls_auto_enable()` were inspected read-only; no trigger/function altered.
- Existing broad `supabase_admin` default ACL caveat remains; application migrations must never run as `supabase_admin`.

### Rollback-only probe results
- Probe A used a uniquely named temporary schema, schema revokes and schema-specific default ACL revokes, created disposable table/sequence/function/type, then intentionally raised an exception.
- Probe A showed client schema USAGE/table SELECT/sequence USAGE denied, but client function EXECUTE and type USAGE unexpectedly remained **true** due PostgreSQL's implicit global PUBLIC defaults.
- Probe B repeated the test with global postgres-creator default revokes for function EXECUTE and type USAGE from PUBLIC, plus private-schema role-specific revokes. All tested client privileges were **false** and every disposable object owner was postgres.
- Both probes intentionally rolled back. A follow-up read-only check confirmed the probe schema and relations do not exist and no probe default ACL changes remain. No persistent DB change was made.

### Specification correction
- Corrected `docs/architecture/database-v1-ddl-spec-batches-1-3.md`: Batch 1 now calls for global default revocation of implicit PUBLIC EXECUTE on future postgres-created functions and PUBLIC USAGE on future postgres-created types, plus private-schema-specific client role revokes.
- Important scope: these global defaults affect all future objects created by postgres in every schema. Any intentionally callable public RPC must receive explicit reviewed EXECUTE grants.
- Detailed report: `docs/architecture/batch1-rollback-privilege-probe-2026-11-20.md`.

### Advisor results and boundaries
- Supabase Security Advisor: zero lints.
- Performance Advisor: zero lints.
- Health Advisor: zero lints.
- These checks do not replace custom privilege tests.
- No migration applied, no persistent schema/default privilege change, no business data write, and no Auth, Edge Functions, Storage, Realtime, website, POS, Rider, Vercel or deployment changes.

### Next
Review the broader implications of the global function/type default revokes and test explicit public RPC grant behavior in another rollback-only probe. Then complete Batch 1 acceptance tests. Do not persist the foundation schema until the corrected specification and all test cases are reviewed. Production/live launch safeguards and the deferred website audit remain unchanged.



## 2026-11-20 — Explicit public RPC grant probe

A second rollback-only test validated the public wrapper permission pattern:
- Created a disposable SECURITY INVOKER function in `public` as `postgres`.
- Explicitly revoked EXECUTE from PUBLIC, anon and authenticated.
- Explicitly granted EXECUTE only to service_role.
- Verified PUBLIC ACL entry absent; anon=false; authenticated=false; service_role=true; owner=postgres; SECURITY DEFINER=false.
- All assertions passed. Intentional exception rolled back the function.
- Follow-up read-only check confirmed the probe function does not exist.
- Security, Performance and Health advisors each returned zero lints.
- Detailed report: `docs/architecture/batch1-public-rpc-grant-probe-2026-11-20.md`.

### Current Batch 1 status
The two key PostgreSQL default-privilege semantics are now experimentally validated:
1. Global default revokes are required to suppress implicit PUBLIC EXECUTE on future postgres-created functions and PUBLIC USAGE on future postgres-created types.
2. An explicitly granted public SECURITY INVOKER wrapper can be callable by service_role while remaining unavailable to PUBLIC, anon and authenticated.

No persistent DB changes were made. The project remains pre-launch and has no application tables. Next: complete the Batch 1 acceptance matrix with rollback-only probes for schema exposure, PostgREST exposure, Realtime publication absence, default ACL behavior for all object types, and exact ownership; review whether global function/type default revokes have any implications for Supabase-managed objects created by postgres before preparing the first persistent foundation migration. Do not proceed to Batch 2/3 until Batch 1 acceptance passes and the owner has reviewed the migration plan.


## 2026-11-20 — Batch 1 acceptance probe

### Disposable DB acceptance test
A single rollback-only acceptance probe created a uniquely named temporary schema plus table, sequence, function and enum type; applied candidate schema-specific defaults and the tested global PUBLIC revokes; enabled RLS on the disposable table; and asserted effective permissions/ownership/Realtime membership.

All assertions passed:
- anon/authenticated/service_role have no schema USAGE, table SELECT/INSERT/UPDATE/DELETE, sequence USAGE/SELECT/UPDATE, function EXECUTE or custom type USAGE.
- Schema and all objects owned by postgres.
- RLS enabled on the disposable table.
- No Realtime publication membership.
- No PUBLIC EXECUTE on the test function or PUBLIC USAGE on the test type.
- Intentional exception rolled back all DDL/default ACL changes. Read-only verification confirmed probe schema absent, zero probe relations, app_private absent, zero Realtime tables, and zero application relations in public/app_private.

### Additional platform observations
- Realtime publication is not set to publish all tables and currently contains zero published tables.
- Existing postgres default ACL rows include public and storage. The global revokes remove implicit PUBLIC defaults; they do not remove existing explicit schema-specific storage grants to anon/authenticated/service_role. Supabase-managed storage ACLs are not to be modified as part of Batch 1.
- Existing supabase_admin default ACLs remain broad across Supabase-managed schemas. Never create Flame Chick application objects as supabase_admin.
- Supabase Data API exposed-schema configuration cannot be proven through available SQL catalog access. Supabase docs say custom schemas must be separately added in Project Settings → API → Exposed schemas. Manual gate: verify app_private is not exposed, and after its creation test negative PostgREST access.
- Existing ensure_rls event trigger must not be assumed to cover app_private. DDL spec now explicitly requires RLS enabled on each app_private table as defense in depth.

### Specification and report
- Updated DDL spec with manual API exposure verification and explicit private-table RLS requirement.
- Detailed report: `docs/architecture/batch1-acceptance-probe-2026-11-20.md`.
- Advisors after rollback: Security 0, Performance 0, Health 0.

### Decision
Database-side Batch 1 rollback-only acceptance probe passes. This is not approval to persist the migration yet. Before persistent foundation DDL: manually verify Data API exposed schemas, review final migration SQL, and establish a suitable recovery/backup plan. Production schema remains empty; no persistent database changes, no Auth/Edge Functions/Storage/Realtime/Vercel/app code changes.


## 2026-11-20 — Batch 1 pre-deployment review, candidate SQL and recovery plan

### Dashboard/API exposed-schema gate
- The currently connected browser Dashboard tab was inspected read-only. It belongs to the separate organization `hfp supabase` (org ref `xzdklhvmheiewpnnqgsa`) and lists Flame Chick Demo, HFP and Pizza Bite projects; it is NOT the `Flamechic` organization (`ydlbinhyoutdqueilxnd`) containing Flame Chick Production.
- Therefore no API exposed-schema setting was inspected or changed. Do not use the HFP org tab as evidence. Correct production Dashboard path still must be checked: Project Settings → API → Exposed schemas; `app_private` must not be listed.
- The SQL integration remains connected to Flame Chick Production ref `adkrxfnawdiljhjaavnj` for read-only and rollback-only database checks.

### Important narrowing of privilege plan
- Initial rollback-only probes showed schema-specific default ACL revokes do not remove PostgreSQL implicit global PUBLIC EXECUTE on new functions or PUBLIC USAGE on new types.
- A prior proposed global revoke for postgres-created functions/types would affect every schema, not only Flame Chick `app_private`. On review, this broad global change is rejected for Batch 1.
- Candidate design is now narrow: schema-specific defaults for app roles, private schema has no client USAGE, and every future `app_private` function/type migration must immediately revoke PUBLIC and all client roles on that exact object and assert effective permissions. Public RPCs receive only exact explicit grants after review.
- DDL specification updated accordingly. This is a deliberate correction: previous acceptance probe proved global revokes work, but not that global scope is appropriate for this project.

### Candidate SQL and recovery
- Added review-only candidate SQL: `docs/drafts/batch1-private-schema-bootstrap-candidate.sql`. It is NOT under `supabase/migrations`, has not been applied, and creates only the empty `app_private` schema plus scoped defaults.
- Added recovery plan: `docs/operations/database-batch1-recovery-plan.md`.
- Supabase Free plan does not include automatic daily database backups per current official documentation. Before persistent migration, preferred protection is a Supabase CLI schema-only logical dump stored encrypted off-site; available environment currently has no Supabase CLI, Docker or pg_dump, and no backup artifact has been created.
- If external backup cannot be created, this limitation must be explicitly accepted before the schema-only transactional change. Candidate is intentionally narrow and empty; recovery uses a guarded `DROP SCHEMA ... RESTRICT` only while no objects exist. Never use CASCADE.

### Current status / next gate
- No persistent Batch 1 migration applied; no new schema or defaults persisted; no changes to app code, API settings, Auth, Storage, Realtime, Functions, secrets or Vercel.
- Before execution: open the correct Flamechic organization/project in Dashboard, verify `app_private` is absent from Exposed schemas, establish/export an encrypted schema-only backup if possible, then review and approve candidate SQL. Reconfirm project ref and postgres identity immediately before apply.
