# Flame Chick Platform — Project Handoff

**Last updated:** 2026-11-20 (Asia/Karachi; refreshed after the V1 ERD and roadmap consistency pass)  
**Canonical project repository:** https://github.com/itsfahadahmed1234-creator/flame-chick-platform  
**Current working branch:** `work/production-source-audit`  
**Default branch:** `main`  
**Current stage:** Stage 1 source hygiene complete; Stage 2 Production account verified and applied baseline reconciled; Stage 3 schema/security, menu requirements, Production schema/reliability blueprint, delivery pricing contract, cross-application contract map and V1 ERD drafted; GST deliberately deferred; remaining schema decisions and field-level migration specification next  
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
- All review/design changes belong here; `main` remains unchanged.
- Latest verified comparison after the V1 ERD and handoff roadmap updates: `work/production-source-audit` is 44 commits ahead of `main`, 0 behind, with 15 changed paths. `main` remains unchanged; re-check before any PR/merge because subsequent commits change these counts.
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
- POS offline delivery orders submit product/variant/deal IDs plus idempotency key; server prices using live mutable catalog values. Blueprint requires catalog publication version binding and an explicit stale-price policy before order DDL.
- Catalog function currently builds from mutable source tables and its health check does not enforce a separate approved publication pointer. Blueprint specifies immutable publication snapshots, a current pointer, validated publish/rollback, checksum and schema-version contract.
- Demo raw catalog tables have anon SELECT policies and authenticated table grants. Production should use narrow allowlisted public catalog DTOs, private operational schemas, least-privilege grants, tenant/branch composite constraints and server-checked roles rather than copy policies blindly.
- Demo order function writes zero tax and contains a Demo-specific manual-address/zero-fee path. Neither is approved for Production. Current published menu artwork mentions GST, but the user explicitly deferred GST from the initial schema; do not add tax schema or calculation in this phase.
- Existing Admin writes compound catalog changes through multiple browser REST calls and lacks full modifier/schedule editors, unpriced draft support and complete deal-component editing. Blueprint recommends transactional server-side commands, concurrency checks, audit, and full Admin workflow.
- Key schema domains: restaurant/branch tenancy; categories/subcategories/products/variants; modifier groups/options/assignments/pricing; deals/components/choice pools/schedules; draft and immutable publication; orders/items/modifiers/components/payments and immutable price snapshots; delivery/rider; staff/access/audit; POS devices/registers; settings/media/outbox.
- No Production database, Storage, Function, role, settings or app deployment was changed.
- Next: map current Admin/website/POS/catalog/order/delivery API field contracts to target columns/RPCs; refine ERD and migration dependencies; obtain owner decisions for offline stale-price policy, publication roles, schedule scope and deal choices. GST is deferred from the initial schema by explicit owner decision. Then create reviewed SQL in small migration batches for a disposable test project first. Do not apply Production DDL yet.


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
- Next: finalize the ERD and field-level schema design, decide offline POS stale-price handling and publication/price role boundaries, then prepare small migrations for isolated test execution before Production DDL.

### Production ERD and V1 table proposal drafted — 2026-11-20

- Added `docs/architecture/production-erd-v1.md` (commit `c09989ccff7ea6d5bfab98c15a8e155f7078d295`). This is a conceptual ERD/table proposal only, not SQL and not permission to apply DDL.
- Core domains: restaurants/branches and roles; categories/products/variants; modifier groups/options/variant pricing; deals/components/choice lists/schedules; immutable menu publications/current pointer/audit; branch-scoped delivery areas/default fee; orders/items/modifiers/components/payments/status history; delivery tasks/offers/assignments/rider profiles; private push/outbox/rate-limit records only where required.
- V1 order financial scope deliberately excludes GST/tax and focuses on item price, subtotal, delivery fee and total, plus existing payment fields required by POS.
- No ingredient inventory or unconfirmed optional operations tables are assumed. POS resources such as registers/tables/cash movements are included only where active app workflows require them.
- ERD uses branch-scoped delivery area/configuration, but restaurant-wide catalog products/prices initially. Branch-specific product pricing is not added unless confirmed as a V1 requirement.
- Proposed publication uses one JSONB immutable snapshot initially; no chunking until payload-size/performance tests justify it. Public catalog health must read the true publication pointer, not infer publication from active item count.
- Recommended stale offline POS policy in the ERD is fail/hold sync with a stable CATALOG_VERSION_STALE response and explicit cashier/manager price confirmation. This remains pending owner approval; no silent repricing.
- Remaining schema decisions: Not Listed locality/mohalla field requirement; publish/price permission roles; deal choice pool rules; recurring schedule scope; whether branch-specific catalog pricing/availability is required; whether inventory is needed in V1.
- Production remains read-only. No DDL, seeds, app changes or deployments were made.
- Next: resolve only the decisions that materially affect table shape, then produce the field-level migration specification and test it on an isolated disposable Supabase project before requesting approval for Production DDL.

### Production default-privilege migration safeguard added — 2026-11-20

- Updated `docs/architecture/production-schema-blueprint.md` (commit `69ad4f83bb6e14b2d9745c6d7bccf9057268a306`) to record the exact implications of the already-applied Production hardening baseline.
- Because default privileges for postgres-created public tables, sequences and functions were revoked from PUBLIC, anon, authenticated and service_role, every future migration must explicitly enable RLS and explicitly grant only the permissions each intended role requires.
- Service-role Edge Functions will not be assumed to have object permissions automatically; table/schema/sequence access and function EXECUTE grants must be explicit and verified after each migration.
- Do not depend on rls_auto_enable to secure new tables; explicitly ENABLE ROW LEVEL SECURITY and verify it from PostgreSQL catalogs.
- Test both SQL grants and RLS using anon, authenticated role variants and service_role; server-side functions must still authorize actor, tenant and branch even when using service_role.

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
- `docs/architecture/menu-management-design.md`
- `docs/architecture/current-menu-baseline.md`

Next work: resolve the offline POS stale-catalog price policy and the publication/price permission boundary; then produce the field-level migration specification and isolated validation plan. No Production SQL, seeds, secrets, buckets, Functions or app deployments until the exact changes are reviewed and approved.

**New-chat instruction:** Read this file first, then read the listed design artifacts. Continue from Stage 3 and the exact next action above. Do not repeat the original repository/source audit or Production account/migration check unless the repo/project identity changes. Always update this handoff after meaningful work. Keep `main`, the original source repo and all live deployments unchanged until separate approvals.
