# ACTIVE ADMIN MEDIA IMPLEMENTATION CHECKPOINT — 2026-11-28

This checkpoint supersedes older statements below that say the category/deal media editor or frontend media workflow has not yet been implemented. It does **not** authorize deployment, real-image upload, catalog publication or any additional Production DB write.

## Current review-branch implementation

- Work remains isolated on `work/admin-catalog-media-review` in `itsfahadahmed1234-creator/flame-chick-platform`.
- New module: `apps/flame-chick-admin/catalog-v3-media.js`. It uses the existing signed-in Admin/Owner JWT plus the publishable key, the existing `flame-chick-media` bucket and existing Storage RLS policies. It adds no Edge Function, broad table grant, service-role browser key or direct PostgREST table write.
- The Catalog V3 edit forms now include media panels for existing products, categories and deals: current/backup previews, upload, restore and remove-current-reference controls. Newly created entities must first be saved to obtain their permanent UUID.
- File validation is client-side and backed by the existing Storage bucket constraints: JPG/JPEG/PNG/WebP, maximum 5 MiB, binary signature check, SHA-256 fingerprint. Uploads use a new UUID object key under `products/{uuid}/`, `categories/{uuid}/` or `deals/{uuid}/`, disable overwrite, and verify the resulting Storage object size/MIME before the catalog metadata command is invoked.
- Metadata is written only through the existing revisioned/idempotent Catalog V3 commands. Category/deal media uses the four functions changed by `20261128092721_flame_chick_category_deal_media_v1`; product media uses the already-existing product media command.
- Upload recovery is account-bound in `sessionStorage`. An interrupted upload may be resumed only with the same file fingerprint and the original reserved object path. A confirmed catalog write with failed read-back is recorded as `committed_unverified` and is never blindly replayed with a new request ID. If its exact pending idempotency body is still present, only that body/request ID can be retried.
- Replacing/restoring/removing metadata never deletes old current/previous Storage objects. The only automated Storage delete is the newly-created orphan object after a definite metadata rejection or a recorded cleanup-required state. Older paths may remain referenced by immutable published snapshots.
- Product `image_published` meaning was checked against the current Website view: it controls whether the product’s current image path is emitted to the public catalogue DTO. The Admin sets it true when attaching/restoring a current product image and false when the current product image is removed. This is **not** a menu publication command; draft changes remain unpublished until a separate catalog publish.
- Existing Website view consumes product and deal image paths. The current Website template does **not** render category artwork yet. This limitation is displayed in the category media panel. Website source and deployment were not changed.
- Media reference changes update only the unpublished Catalog V3 draft. No image change triggers publish/rollback or moves the publication pointer.

## Verification completed

- Admin Static Checks run **`46133225905`** passed on source commit **`f15300e07e3ea6a85bf9e78d2100ef571e0cc309`**.
- Latest run summary: **144 tests passed, 0 failed**. It includes the media signature/MIME/size checks, Storage API mock tests, same-size/different-content fingerprint rejection, ambiguous upload and object verification cases, account-bound recovery record validation, static Catalog V3/Storage boundary assertions, JavaScript syntax and Admin regression suite.
- The earlier fingerprint test run `46133082301` failed because its first mock File fixture lacked `arrayBuffer()`; fixture support was added and subsequent runs passed, including the latest run above.
- Product/deal Website DTO consumption was source-checked; category artwork non-consumption was also source-checked.

## Still not ready for image uploads or release

- No actual image has been uploaded to Production Storage. No live Storage API write/delete was attempted.
- No end-to-end browser test against the authenticated Admin session and Storage RLS has been run. CI uses mocks/static checks, not a live Storage sandbox.
- No staff role matrix test against an isolated bucket has been run in this media slice. Existing Storage RLS policies were only read; they were not changed.
- No real file preview/replacement/restore/failed-upload recovery has been exercised in a browser.
- The Admin Pages and Staff Admin Edge Function have not been deployed from this branch. The currently deployed Admin cannot show these new media controls until a separately approved release.
- Do not invite image uploads yet. Before release/first image upload, complete browser acceptance for Admin and Owner, prove Manager/Cashier/Rider and anonymous denial, exercise upload/info/metadata success, interrupted upload resume, definite metadata rejection cleanup, ambiguous commit reconciliation, restore, remove-current-reference and failure to clean up. Keep publication unchanged during those tests.
- Do not touch Supabase Logs Explorer, the 102 GB log query or Log Ingestion. No POS, Rider or Website deployments/source changes. No Production menu rows, Storage objects, publication pointer, order or payment changes.

## Next controlled step

Continue reviewing the current Admin source and tests on this branch. Only after the media workflow is complete and the browser/role acceptance plan is ready should the user be asked for separate approval to deploy Admin/Staff Admin. Keep the first actual menu image upload as a separate explicit acceptance step.

---

# ACTIVE PRODUCTION MIGRATION CHECKPOINT — 2026-11-28

**This checkpoint supersedes older instructions in this file that prohibit the already-approved category/deal media migration.** The user explicitly approved applying the pending category/deal media database patch because the restaurant is not yet running real production orders.

## What is now applied

- Supabase project: `adkrxfnawdiljhjaavnj` — Flame Chick Production, Mumbai `ap-south-1`, Free plan, PostgreSQL 17.
- Applied migration: `20261128092721_flame_chick_category_deal_media_v1`.
- The exact applied SQL is preserved at `supabase/migrations/20261128092721_flame_chick_category_deal_media_v1.sql` in this review branch.
- Only these four existing `app_private` functions were replaced:
  - `flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)`
  - `flame_chick_catalog_draft_read_internal(text,uuid,integer)`
  - `flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)`
  - `flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)`
- Category/deal current/previous image paths now participate in their existing authenticated write/read command flow. Supplied paths must use the matching entity UUID folder, an allowed JPG/JPEG/PNG/WebP suffix, and an existing object in `flame-chick-media`. New entities must be created before media metadata can be attached. Omitted path fields preserve their current values; null/empty clears the respective value.
- Verification after apply: migration appears in the production migration ledger; all four function definitions contain both image-path fields; owner remains `postgres`; `SECURITY DEFINER` and empty `search_path` remain; ACLs are unchanged (`authenticated` can execute, `anon` cannot).
- Regex smoke checks accepted JPG/WebP/PNG examples and did not match a traversal-style path or GIF suffix.
- Security advisor returned 51 existing RLS-enabled/no-policy informational findings and the existing leaked-password-protection warning. This migration changed no RLS policy, grant, bucket, Storage object, publication pointer, catalog row, or Auth setting.

## What is not complete

- This is a database metadata-command capability only. No Admin UI upload controls, preview, replace, restore, delete, orphan cleanup or failure compensation have been implemented.
- No Storage object upload or real image upload has been tested. Do not invite the user to upload menu images yet.
- No Admin Pages or Staff Admin Edge Function deployment was performed. The application branch remains isolated.
- No menu import, seed, draft publish/rollback, publication-pointer change, order creation or payment was performed.
- No POS, Rider, Website or other app branch was changed.
- Supabase Logs Explorer, the 102 GB log query and Log Ingestion remain untouched.

## Repository state

- Continue only on `work/admin-catalog-media-review`.
- Do not merge it into `cloudflare/admin-production`, deploy Pages or Edge Functions, or change any other app.
- The review-only draft `docs/drafts/2026-11-28-flame-chick-category-deal-media-v1.sql` is now historical source-review material and still contains a prominent DO NOT APPLY warning. The numbered migration above is the applied, tracked migration.
- Next: finish the Admin-side media workflow, using secure upload-first / metadata-commit / delayed-cleanup semantics, add failure-compensation coverage, run relevant tests, and seek separate approval before application deployment. User may perform their own Admin dashboard verification, but the UI does not yet expose this new capability.

---

# Flame Chick Admin — Catalog Editing & Media Management Continuation

**Updated:** 2026-11-28  
**Purpose:** Continue the existing Flame Chick Admin application and make catalog authoring and image management genuinely usable. This is a focused implementation handoff, not permission to publish a menu, mutate Production data, deploy an Edge Function, or deploy the Admin site.

## 1. Ownership and project boundaries — read first

The user corrected the previous conversation summary:

- The Website work was being done with the user in this conversation/thread. It is not owned by the POS/optimization chat.
- A separate concurrent ChatGPT conversation is handling **POS work and Supabase Edge Function/backend optimization**.
- This new continuation owns the **Admin application**: catalog editing, product/category/deal images, website media, and the reliability of those Admin workflows.
- Preserve the existing Website deployment and behavior. The known Cloudflare Pages Website is `https://flamechick.pages.dev`; the user previously confirmed the Website was interacting with POS and submitted orders reached POS. Do not rebuild, redeploy, or change the Website while working on Admin.
- Preserve the POS and Rider apps, their Cloudflare resources, and their production workflows. Do not overlap with the other chat's POS/optimization work.
- Admin's known canonical Cloudflare Pages URL is `https://flamechickadmin.pages.dev`. Verify current deployment metadata before any release action; do not assume an old deployment record is current.

Repository: `itsfahadahmed1234-creator/flame-chick-platform`  
Admin release branch: `cloudflare/admin-production`  
Admin app root: `apps/flame-chick-admin`  
Supabase Production project: `adkrxfnawdiljhjaavnj` — Mumbai `ap-south-1`, Free plan.

**Do not change `main` or another app's branch as a shortcut.** Work on the Admin release branch, inspect its current HEAD first, and keep all changes limited to Admin plus directly-required tests, Staff Admin API files, migrations (only if separately approved) and this handoff.

## 2. Absolute Supabase logging prohibition — ZERO usage

**There must be absolutely zero Supabase log-query usage and zero Log Ingestion access for this Admin work.** Not 0.00001, not a tiny sample, not one filtered record, not a one-off test. No usage at all.

- Never run or access Supabase Logs Explorer, `query_logs`, log-query APIs, CLI log commands, connectors, dashboards, SDKs, browser tools or any alternate/indirect interface for Supabase logs.
- Never inspect, read, retrieve, search, export, sample, filter, analyze, troubleshoot, or verify Supabase log data.
- Never inspect or modify Log Ingestion usage, log drains, retention, routing, telemetry, analytics, or related settings. Do not use logs as an Admin QA or deployment verification method.
- Historical figures only: the **log query exceeded 102 GB**; separately, **Log Ingestion was 0.10 GB out of 1 GB**. These are different measurements. Do not query either system to refresh them.
- No exceptions for debugging, performance optimization, verification, security or convenience. Use GitHub/source inspection, static analysis, browser-visible errors, local/disposable integration tests and narrowly scoped non-log metadata reads.
- This prohibition remains in force unless the user explicitly changes it. Do not propose or ask to use even a tiny amount.

## 3. Verified Admin source state

The following was verified from `cloudflare/admin-production` on 2026-11-28. Recheck current branch HEAD and deployed versions before relying on it; later work may supersede these notes.

### Existing Admin frontend modules

- `index.html`, `app.js`, `config.js`, `styles.css`
- `catalog-v3-admin.js` and `catalog-v3-admin.css`: existing authenticated Catalog V3 draft-authoring workspace.
- `catalog-v3-importer.js` and `flame-chick-published-menu-2026-11-23.v3-draft.json`: review-only, resumable importer which targets the unpublished draft only.
- Catalog authoring tests include `tests/catalog-v3-admin.test.mjs` and `tests/catalog-v3-importer.test.mjs`.

The current Admin/Owner navigation bootstrap allows Dashboard, Staff & Riders, Catalog V3 Draft and Delivery Areas. The old Menu & Products, Categories, Deals & Offers, Website Images and Website Settings screens remain disabled; do not enable them by removing the navigation guard.

### Existing Catalog V3 capability

The existing Catalog V3 workspace already has meaningful source implementation. Build on it rather than starting over:

- Category create/edit through the authenticated category upsert command.
- Product create/edit with variants, standalone-sellable versus deal-only variants, nullable prices only for deal-only variants, and pack quantity/unit validation.
- Fixed-price deal create/edit with exact product-variant references, fixed component quantities and INCLUDED/zero-surcharge mappings.
- Schedule creation/assignment for the currently supported Flame Hour daily schedule.
- Revision-aware mutations, UUID request IDs, read-back verification and safe inactive-first deal updates.
- Review-only menu importer with identity preflight, sequential writes and retry/idempotency simulation. It has passed real local/disposable Supabase integration QA in earlier work; this is not proof of current Production state.

The editor intentionally does **not** support arbitrary selectable flavours, product alternatives, optional paid upgrades, surcharge mappings, variable component groups, multiple/branch-specific schedules or general-purpose deal structures. Preserve these fail-closed limits unless the user approves a new catalog model and matching Website/POS pricing contracts.

### Existing Staff Admin API boundary

- The browser calls the single `flame-chick-staff-admin` Edge Function using the publishable key and the signed-in user's Bearer JWT.
- The Edge Function has `verify_jwt=true`; the database derives `auth.uid()` and enforces active restaurant-wide Admin/Owner authority.
- `supabase/functions/flame-chick-staff-admin/catalog-actions.mjs` contains a finite action-to-RPC allow-list. The client cannot choose arbitrary RPC names.
- Catalog mutations carry `expected_revision` and a UUID `request_id`; payload limits and read IDs/cursors/limits are validated in the function.
- The database command functions remain authoritative for role, tenant, relation, validation, revision, idempotency, transaction and audit behavior.
- No direct table grants or broad RLS policies were added for catalog authoring.
- The latest previously reported Production Staff Admin function version was **v10** with JWT verification enabled. Verify live version/source metadata read-only before proposing another deployment. The earlier Admin Pages rollout and dashboard changes have been reported complete; verify current canonical deployment and source alignment before any new build.

### Image/media gap discovered in source

- `index.html` already contains a Website Images screen and guidance for JPG/PNG/WebP images up to 5 MB, with a current image and one previous backup.
- `config.js` names the intended Storage bucket `flame-chick-media`.
- The older `app.js` helpers `storageUpload`, `storageRemove`, `replaceImage` and `rollbackImage` use direct browser Storage calls and direct PostgREST table PATCH operations. **Do not wire these legacy helpers back into active pages or loosen Storage/table policies to make them work.**
- The previous security audit (2026-11-22) found no `flame-chick-media` bucket and no Storage policies. This is a historical observation; verify the current bucket/policy metadata with a narrow read-only check before deciding whether anything needs to be created.
- The current Catalog V3 editor does not yet integrate product/category/deal image upload into its secure command workflow. Website hero, fulfilment gate, About gallery and menu hero/slider settings also need a reviewed media workflow.
- The detailed historic Catalog Admin API contract is `docs/handoffs/2026-11-22-catalog-admin-api-contract.md`; it explicitly records that media upload/delete and settings commands were outside that API slice. Treat it as historical scope documentation, not as the current deployment status.

## Latest Admin dashboard checkpoint — 2026-11-27

This work is already completed and is not the focus of the next phase:

- Admin Pages UI was deployed to Cloudflare Pages at `https://flamechickadmin.pages.dev`; the recorded canonical deployment is `ee6b4f6f`, built from commit `acbb050413cc076c3cedc1715e7d1f467ab2f56e` on `cloudflare/admin-production`.
- Supabase `flame-chick-staff-admin` Edge Function version **10** was reported ACTIVE with `verify_jwt=true`.
- Dashboard startup is Today-first. The first summary request uses `p_include_period_history=false`; historical ranges are explicitly fetched only when selected. Recent orders are capped at eight. The operational unresolved-order watch remains separate (all-active count plus up to six oldest active order summaries) so older unresolved work is not hidden.
- The dashboard migration is `20261127172402_flame_chick_admin_dashboard_on_demand_history_v1`. It adds an optional boolean while preserving the legacy payload shape; authorization remains Admin/Owner and no table grants/RLS policies were widened.
- Historical SQL test numbers from 2026-11-27 are point-in-time only and must not be treated as today's figures. Do not query logs to re-confirm deployment or browser activity.

The next chat should verify current branch/deployment metadata using read-only control-plane/source inspection as needed, but should not repeat the dashboard work unless a user-reported issue or new code evidence warrants it.

## 4. Target outcome for this Admin phase

Make the Admin usable for day-to-day catalog maintenance without exposing privileged database access or causing unnecessary backend work.

### A. Catalog authoring

Complete and verify the authenticated Catalog V3 Draft experience for:

1. Categories and subcategories: create/edit, ordering, active/availability state where supported, clear validation and safe handling of categories that still contain products.
2. Products: create/edit bilingual names/descriptions, category assignment, featured/order/availability controls and image references.
3. Product variants: add/edit/reorder/deactivate variants, variant type, standalone-sellable flag, price, and pack metadata. Preserve the rule that each standalone-sellable variant requires its own price; deal-only variants may have a NULL price.
4. Deals: safe editing of the currently approved fixed-bundle shape, with read-back of exact price, component quantities, product variant IDs, active state and supported schedule. Do not invent unsupported deal options or price surcharges.
5. Schedule availability: expose only the schedule behaviors the current backend validates. Show understandable errors for unsupported or conflicting schedules.
6. Draft preview/review: show what is saved in the unpublished draft, clearly label it as a draft, and distinguish draft edits from what customers currently see.

Do not import the historic review-only JSON draft automatically. First establish whether that exact menu is still the user's intended catalog and whether Production already contains records; ask before any bulk import or seed.

### B. Secure image/media management

Implement a reviewed media workflow for:
- Product images.
- Category images.
- Deal images.
- Website landing hero, fulfilment gate, About/gallery images, menu hero fallback and promotional slider banners.

Before implementation, inspect only the relevant schema, existing media references, Storage bucket metadata, current Website media-consumption contract and the Staff Admin API. Choose the smallest secure design that the current Website can consume.

Requirements:
- Admin/Owner authorization for upload, replace, restore and delete. Manager/Cashier/Rider and anonymous callers must be denied.
- Never put a service-role/secret key in browser code, public assets, Git or client environment configuration.
- Do not introduce generic RPC proxies, direct browser PostgREST table writes, or broad `storage.objects` policies.
- Use fixed bucket/folder/object-key rules and allow only the intended image MIME types. Validate file size and type in both browser and server-side authorization/metadata path; current UI guidance is JPG/PNG/WebP up to 5 MB.
- Preserve the current/previous image backup behavior. Upload first, verify object creation, commit the metadata/reference through a secure command, and only then clean up an older backup. A failed metadata write must not leave the record pointing to a missing image; a failed cleanup must be visible and recoverable.
- Avoid destructive replacement: do not delete the currently referenced image until the replacement metadata is confirmed. Make restore/rollback swap the current and previous references safely.
- Decide public-read versus signed delivery based on the public Website's needs. Public image delivery must not imply public write/delete access.
- Use predictable cacheable object URLs/paths and avoid re-uploading unchanged images. Do not add a separate image-processing service or paid product without a clear need and approval.
- Website media settings and catalog product images may have different lifecycle/publication behavior; don't couple them unless the current schema/Website contract proves they are one resource type.

### C. Reliable connections and user workflow

Audit and harden the existing browser-to-Staff-Admin connection:

- Reuse the existing single Staff Admin Edge Function rather than adding multiple new functions by default.
- Keep the existing session/JWT model. Use one in-flight token refresh at a time; avoid parallel refresh races.
- Add bounded request timeouts/abort handling and clear user-visible errors. Do not leave save buttons spinning indefinitely.
- Retry only safe reads, and only a small bounded number of times. Do not blindly retry mutations.
- For mutations, keep the same `request_id` when reconciling an ambiguous timeout; re-read the affected entity/revision before deciding whether a new mutation is needed. Never create a new request ID and blindly resubmit a write after a timeout.
- Respect `expected_revision`. On conflict, show a reload/reconcile path and preserve the user's form values where safe.
- Serialize dependent multi-step mutations. Do not run writes concurrently with `Promise.all` when each write advances the shared draft revision.
- Disable the submit control while a mutation is active, show progress, and give a confirmed saved/read-back result.
- Handle offline/network loss gracefully. Do not create a background polling loop; refresh only on initial entry, explicit user action, successful mutation reconciliation and necessary focus/reconnect events.
- Preserve unsaved form state on read failures; do not clear the user's edits because a list refresh failed.

## 5. Lightweight query and low-resource rules — mandatory

The user specifically wants lightweight database queries, low resource usage and reliable connections. Design for the Supabase Free plan and the shared production environment.

- Do not use the legacy `loadAll()` as a catalog loading strategy. It contains a historical 1,000-order query plus broad table reads and direct REST behavior. Do not load all orders or all modules simply to open the Admin dashboard/catalog.
- Use the finite Staff Admin/catalog commands, not direct table REST queries.
- Use explicit field projections; never `select=*` for application reads.
- Use bounded keyset pagination/cursors. Keep each page small (target 20–50 records; respect the existing action limits) and offer a user-controlled next page. Do not silently fetch every page in the background.
- Fetch the minimum list summaries for the active screen only. Load detailed deal/product/schedule records only when the user opens the corresponding editor.
- Audit the current Catalog V3 refresh path for N+1 reads: it currently loads bounded category/product/collection/schedule lists and then requests deal lists per collection. Replace with a bounded batch/list command or another compact query only if source/SQL review shows a real reduction without weakening authorization or consistency.
- Avoid duplicate bootstrap, repeated reads on every render, per-row API requests, full-catalog reloads after each small edit and aggressive refresh timers.
- Mutations should update the affected view from a verified command response where safe; otherwise re-read only that record/page and current revision.
- Use database indexes only when an actual bounded query needs them and source/query-plan evidence supports the change. No speculative indexing, broad table scans, analytics scans or expensive diagnostics.
- Prefer one small response containing the required view data over many chatty calls, but do not create giant denormalized payloads. Keep request/response payloads bounded.
- Keep image upload separate from catalog JSON reads; do not base64-encode large image files into an Edge Function request body. Use a secure direct Storage/signed-upload pattern only after its authorization model is reviewed.
- No continuous polling, no log-based diagnostics and no Production load tests. Use local/disposable integration tests for performance/call-count assertions.

## 6. Draft, publication and live Website safety

The catalog architecture intentionally separates mutable draft authoring from immutable customer publications.

- Catalog draft mutations must never update the live customer menu by themselves.
- Existing `catalog_publish` and `catalog_rollback` actions were deliberately excluded from the finite Staff Admin catalog route. Do not expose them as part of this task.
- Do not change the current publication pointer, seed/import a menu, publish/rollback a catalog, or enable checkout without separate explicit user approval.
- Before any future publish-related work, read the current Website handoff/source and verify the exact schema V3 DTO, pricing/deal compatibility, image path contract and browser behavior. A historical 2026-11-23 note recorded a V3-versus-V2 compatibility blocker; later Website work may have changed this. Verify the live/current Website source rather than assuming either state.
- Website changes are outside this Admin task. Only implement the secure authoring/media API contract needed by Admin and keep public Website behavior unchanged.

## 7. Suggested execution sequence for the new chat

1. Read this file and the current `PROJECT_HANDOFF.md`; then inspect the current GitHub HEAD of `cloudflare/admin-production`. Treat older dated records below as history unless newer evidence confirms them.
2. Read `apps/flame-chick-admin/README.md`, `index.html`, `app.js`, `catalog-v3-admin.js`, `catalog-v3-importer.js`, the Staff Admin `index.ts` and `catalog-actions.mjs`, the catalog API contract, and the matching Admin tests/workflows.
3. Verify read-only: the current Pages canonical deployment/commit, Staff Admin Edge Function version and `verify_jwt`, current Admin API action map, relevant catalog schema/RPCs, bucket/policy metadata and current publication metadata. Do not query logs; use only small focused metadata reads.
4. Produce a compact feature/gap matrix: already working, partially working, missing, unsafe legacy implementation, and blocked by backend/Website contract.
5. Build and test in small batches. First make Catalog V3 editing predictable and bounded; then implement the secure media service/storage authorization; then integrate images into category/product/deal and Website media screens.
6. Add static contract tests and a real local/disposable Supabase integration test for authorized/unauthorized roles, image upload/replace/restore/cleanup failure, revision conflict, duplicate/retry behavior, request counts and page-size limits. Do not test writes against Production.
7. Run relevant Admin static CI and Edge Function static/type checks. Do not consider tests green unless the exact run/commit is verified.
8. Present a concise review of code/schema changes and deployment plan. Obtain approval before any Production migration, Edge Function deployment, Storage bucket/policy change, menu import/publication, or Cloudflare Pages deployment. Preserve the current working Admin deployment until the replacement is approved and verified.

## 8. Acceptance criteria

The Admin phase is ready for user review when:

- Admin and Owner can sign in and open Catalog V3 Draft; non-Admin/Owner roles and unauthenticated callers are denied.
- Category, product, variant, price and supported fixed-deal changes can be added/edited with validation, revision protection and verified read-back.
- Product/category/deal images and requested Website media can be added, replaced and restored without direct table writes or broad Storage access.
- A partial failure never silently loses the current image or creates an ambiguous duplicate catalog mutation.
- The UI uses bounded reads, lazy detail loads, no full-table/order-history load, no polling and no unnecessary background requests.
- Network/session failures show clear recoverable states and do not lose unsaved edits.
- Draft changes do not alter the current public menu or Website deployment.
- Static and disposable integration QA pass; Production and Cloudflare deploy gates remain separately approved.
- The 102 GB log query is never repeated or inspected, and no Log Ingestion access/configuration is used.

## 9. Explicit exclusions

- No POS or Rider changes.
- No Supabase Edge Function optimization owned by the other conversation.
- No Website redesign, deployment, DNS, hosting or checkout change.
- No production menu seed/import/publication/rollback without approval.
- No order, payment, staff-role, customer or delivery data changes unrelated to Admin authoring.
- No GST/tax implementation; GST remains deferred.
- No paid Supabase/Cloudflare upgrade or new paid infrastructure.
- No service-role key in browser code.
- No access to the expensive 102 GB log query or Log Ingestion.

**The immediate next action is source/read-only audit of the current Admin release branch and a precise gap matrix—not a deployment and not a Production catalog write.**


---

## Isolated Admin review checkpoint — 2026-11-28

- Work is isolated on branch `work/admin-catalog-media-review`, created from Admin release HEAD `5f17dcce76f90fab4e94ceb1830b76987f702bc9`. The production branch `cloudflare/admin-production` was not modified.
- The only application source file changed so far is `apps/flame-chick-admin/app.js`:
  - Added a 12-second bounded fetch wrapper for Auth and Staff Admin requests.
  - Added single-flight refresh-token handling.
  - Limited an expired-session retry to one attempt.
  - Catalog mutation timeouts/network failures retry once using the exact same action, payload, expected revision and UUID request ID.
  - If the retry remains ambiguous, the same mutation identity is retained in memory and different edits are blocked until that exact save is retried. Definite server failures clear the pending marker.
- The Admin Static Checks workflow was explicitly enabled for this isolated review branch by adding it to the workflow's branch filter. This workflow does not deploy Admin.
- First CI run `46115401615` failed because the pre-existing dashboard source assertion in `tests/admin-dashboard-api.test.mjs` over-escaped the dot in `S.range`. The application syntax check passed; 109/110 tests passed, with the single failure in that stale assertion. The assertion was corrected in commit `f1f489b6fb4702d802c61b87850f6faaa38db811`. A fresh CI result must be checked before treating this work as validated.
- The Catalog V3 pagination implementation was reviewed and planned but **not committed**; no partial pagination edits were written.
- The review-only JSON importer is still present in the source and has not been disabled yet. No menu import or catalog write occurred.
- No migration, Production database/API/Storage change, Edge Function deployment, Cloudflare Pages deployment, website/POS/Rider change, publication, or menu import occurred.
- The migration provenance discrepancy remains unresolved. The repository tree on the source branch does not contain `20261127090849_flame_chick_catalog_product_media_v1.sql`. Do not recreate or reapply it blindly.
- Supabase logging restrictions remain absolute: no log-query use and no Log Ingestion access, including settings/metadata.
- Next: verify the CI rerun for `f1f489b6fb4702d802c61b87850f6faaa38db811`; add focused tests for timeout retry/request-ID reuse and single-flight refresh; then implement explicit bounded pagination. Continue migration provenance from repository and authorized non-log source material only. Keep media backend/UI work blocked until the applied migration is recovered and the secure command contract is reviewed.


---

## Follow-on connection regression work — 2026-11-28

- Verified Admin Static Checks run `46115559510` for commit `f1f489b6fb4702d802c61b87850f6faaa38db811`: completed successfully. All workflow steps passed.
- Added `apps/flame-chick-admin/connection-helpers.js` with isolated helpers for single-flight refresh, ambiguous-failure classification, one same-request retry, explicit uncertain mutation result and a bounded response-body reader.
- Loaded the helper before `app.js` in the Admin page.
- Updated `app.js` to use the tested single-flight helper and same-body mutation retry helper. The pending mutation retains its original action, payload, expected revision and request ID while the result remains ambiguous.
- Staff Admin non-2xx responses now carry their HTTP status as `HttpRequestError`, allowing only selected ambiguous statuses (408, 425, 429, 500, 502, 503, 504) to qualify for one same-request retry. Definite conflicts/validation failures are not retried.
- Added `tests/admin-connection-helpers.test.mjs` covering concurrent refresh coalescing, refresh recovery after rejection, ambiguous versus definite errors, exact same-object retry, uncertain result after two ambiguous attempts, and timeout while reading the response body.
- **Important validation gap:** the new Node tests have not yet been executed by CI. The last verified green run predates these follow-on commits. Do not call the current branch green until the tests are wired into the static workflow and the exact new HEAD run passes.
- The bounded fetch wrapper in `app.js` still clears its timer after receiving the Response rather than after consuming its body. The new helper test covers body-read timeout, but the app wrapper has not yet been switched to that body-aware helper. Address this before marking request timeout handling complete.
- No Catalog V3 pagination changes were committed. No legacy importer change, DB/Storage/API/Edge Function changes, migration execution, publication, menu import or deployment occurred.
- GitHub connector reads intermittently returned 404/unknown repository errors after the latest commits. Reconfirm branch HEAD and workflow file before the next write; do not infer current state from a failed lookup.
- Continue respecting the absolute Supabase restriction: no Supabase Logs Explorer, no expensive 102 GB query, and no Log Ingestion access or configuration.
- Next: restore reliable source reads, wire and run `node --test tests/admin-connection-helpers.test.mjs` in the Admin static workflow, update the app request wrapper so the timeout covers response-body consumption, verify exact HEAD CI, then continue with pagination. Keep the migration/media workflow blocked pending provenance and backend command review.


---

## Admin reliability, pagination and migration provenance checkpoint — 2026-11-28

### Connection reliability

- The Admin browser now routes bounded requests through `connection-helpers.js`. Its 12-second timeout remains active until the response body has been consumed, not merely until fetch returns headers.
- The helper reconstructs a browser `Response` after bounded body consumption so existing `.json()` / `.text()` call sites retain their contract, including bodyless 204/205/304 responses.
- Single-flight refresh and exact same-body mutation retry are integrated. Ambiguous retry outcomes retain the original request ID and block different edits until reconciliation; definite conflicts are not retried.
- Added behavioral tests for concurrent refresh, refresh recovery, retry classification, exact request object reuse, uncertain outcomes, timeout during body read, response status/JSON compatibility and bodyless responses.
- CI failure diagnosis: the first new test run failed because the browser helper is CommonJS while the Node test used ESM named imports. The test now imports the CommonJS default and destructures the exports. No application defect was found in that failure.
- Verified green run `46121192429` for commit `f2dea919c9dc40e293579fce926ac5589bb90882`: all Admin Static Checks steps passed.

### Catalog V3 pagination

- Implemented bounded cursor pagination using the existing finite Staff Admin read actions and `after_id` cursor contract.
- Categories load 100 per page; products, collections and deals load 50 per page. Deal pagination state is independent for each collection.
- Next-page controls appear only when `has_more=true` and a non-null `next_cursor` are both present.
- Collection pagination loads the first deal page for each newly discovered collection. Results are appended with ID de-duplication.
- If the draft revision changes during a page fetch, the workspace refreshes and asks the user to review before editing.
- Added source-contract tests for cursor metadata, bounded requests, collection-specific deal cursors and UI controls.
- Verified green run `46121271285` for pagination commit `1718ea8e929c0f96a7c6759e38b2391cbc5be9bd`.
- Verified green run `46121281939` for pagination test commit `ae35a13ece61ff7105edf633351da9dca498c05b`.

### Recovered Production migration provenance

- Read-only Supabase project discovery identified the existing Production project `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai, ACTIVE_HEALTHY).
- Read-only `list_migrations` confirmed Production has migration version `20261127090849`, name `flame_chick_catalog_product_media_v1`.
- Recovered the exact applied SQL from `supabase_migrations.schema_migrations.statements` using a read-only query. Restored it unchanged as `supabase/migrations/20261127090849_flame_chick_catalog_product_media_v1.sql` on this isolated review branch.
- Independently fetched the restored file and compared its bytes/content to the migration ledger statement: exact match (6,545 bytes). This is recovery of the applied SQL, not a recreation or reapplication.
- The recovered migration patches the existing product upsert command to validate product image paths, extension metadata and Storage object existence, preserve one previous image, and keep image changes inside the existing revision/idempotency/audit command.
- Read-only schema inspection confirmed the Production `flame-chick-media` bucket is public for image delivery, 5 MiB max, JPEG/PNG/WebP only; Storage read/write/delete policies require the authenticated active restaurant-wide Admin/Owner and restrict object paths to the permitted folders.
- Read-only function inspection confirmed the product draft read function includes current/previous image metadata and the product upsert function validates the referenced Storage objects. The existing category/deal read/upsert command functions do not yet expose the corresponding image metadata.
- Added a test for the recovered migration and wired the migration/test paths into Admin CI. A fresh run for commit `0b087f64440f9c92dcca9eb7521a8156bcf0109d` must be checked before treating that latest commit as validated.

### Legacy media code safety

- The old `app.js` contains legacy image upload and direct PostgREST table-patch helpers. The old Menu, Categories, Deals and Website Images navigation entries remain disabled in `index.html`; Catalog V3 is a separate module using the finite Staff Admin command API.
- Do not reuse the legacy `replaceImage()` / `storageUpload()` / `db(...PATCH)` workflow for Catalog V3. The new image editor must upload through the authenticated Storage policy and save metadata through Catalog V3 commands only.
- Website promotional images/settings remain a separate future project.

### Change boundary

- All work remains on `work/admin-catalog-media-review`; no changes to `cloudflare/admin-production`.
- No database writes, migrations, Storage writes/deletes, Edge Function deployments, Cloudflare Pages deployments, menu imports, publications or live image uploads occurred.
- Supabase work in this checkpoint was read-only schema, migration-ledger, function-definition, bucket and policy inspection. Supabase Logs Explorer, the 102 GB query and Log Ingestion were not accessed.
- No customer images have been uploaded; Admin is not yet ready for image upload.

### Next steps

1. Verify the latest CI run for `0b087f64440f9c92dcca9eb7521a8156bcf0109d`.
2. Recover/document the exact definitions of category/deal read/upsert functions and design a new additive migration for category/deal image metadata, without executing it against Production.
3. Add image metadata to the secure category/deal command contracts and tests.
4. Implement Catalog V3 product/category/deal upload, preview, replace, restore and remove using authenticated Storage and the secure command API; use compensation/reconciliation for interrupted uploads and metadata failures.
5. Add object-path validation, orphan cleanup review and complete authorization/role/revision/publication tests.
6. Keep Website promotional images separate. Do not deploy until the review branch is fully tested and explicitly approved.


### Latest validation and media backend clarification

- Verified latest CI run `46121443832` for commit `0b087f64440f9c92dcca9eb7521a8156bcf0109d`: all Admin Static Checks stages passed, including the recovered-migration test.
- The migration recovery test checks that the exact restored SQL contains the audited product image path/object validation and does not contain destructive table/schema/function drops.
- Read-only Production metadata confirms:
  - `public.products` has current/previous image paths, current/previous extensions and the compatibility `image_published` field.
  - `public.categories` and `public.deals` have current/previous image path columns.
  - The live product draft-read internal function returns image metadata; the live product upsert internal function accepts it and verifies object existence in `storage.objects`.
  - The live category/deal draft read and upsert functions do not currently expose or manage their image path columns. Their secure command functions need an additive patch before the same workflow can be offered for those entities.
- The legacy `app.js` image helpers are still present, but their old Menu, Categories, Deals and Website Images navigation controls remain disabled. They are not part of the Catalog V3 workspace. They must remain disabled and must not be reused.
- No image UI has been added to Catalog V3 yet. Product backend capability exists but is not yet wired into the V3 form. Category/deal backend capability is incomplete. **Do not ask the user to upload images yet.**
- The exact recovered migration is committed at `e5e679d323b774f20c3441883bddf6e85c72398e`; the file was verified byte-for-byte against the live migration ledger. The latest CI-covered commit is `0b087f64440f9c92dcca9eb7521a8156bcf0109d`; documentation-only follow-up commit `75bee04cdef2125f4eeb681debd6ff334461dbf7` does not change application source.
- Next implementation must first create a tested, additive category/deal media command migration based on the live function definitions, then wire one unified Catalog V3 media workflow for products/categories/deals. The workflow must save metadata through existing revisioned/idempotent Catalog V3 commands, upload only under the existing authenticated Admin/Owner Storage policy, and reconcile/clean up safely after interrupted uploads or metadata failures. Add preview, one-backup restore, replacement, remove, authorization, revision-conflict, and orphan-cleanup tests before considering it ready.


---

## Verification-first hardening checkpoint — 2026-11-28

### Branch and scope verification

- Re-verified repository owner/name: `itsfahadahmed1234-creator/flame-chick-platform` (owner spelling includes **ahmed**).
- Re-verified branch heads before editing:
  - Production Pages branch `cloudflare/admin-production`: `5f17dcce76f90fab4e94ceb1830b76987f702bc9`.
  - Isolated review branch `work/admin-catalog-media-review`: `6fef8a57f643dbd66239661ae260fb244d565204` before this hardening pass.
- GitHub compare confirmed review branch was 24 commits ahead and 0 behind Production at the start of the audit. All changes in this task remain isolated on the review branch.
- No PR merge, Pages deploy, Edge Function deploy, DB write, migration execution or Storage operation was performed.

### Concrete defects found and fixed

1. **Uncertain mutation lost on reload:** the previous implementation held the pending request only in JavaScript memory. A reload could lose the request ID after the server committed but before the browser received the response. Added a bounded, validated, sessionStorage-backed recovery record containing the exact action, payload, expected revision and request UUID, scoped to the authenticated user. Storage is read back after write before sending the mutation. Invalid/tampered records, unavailable storage, quota errors or account mismatch fail closed.
2. **Automatic exact replay after re-authentication:** when Catalog V3 opens, it checks for a pending record for the same user and replays the exact original request body with the same UUID through the one-retry helper. A successful original mutation is returned by backend idempotency; an uncertain outcome retains the record. The user cannot submit different catalog edits while a pending record exists.
3. **Non-UUID fallback:** replaced timestamp/random-string fallback with cryptographic RFC 4122 v4 generation using `crypto.randomUUID()` or `crypto.getRandomValues()`. If secure randomness is unavailable or malformed, the operation fails closed.
4. **Pagination partial commit:** collection page state and collection records were previously appended before their associated first deal-page reads completed. Now the page, related deal pages and their revisions are staged first; only after every dependent read succeeds are arrays and cursors committed.
5. **Mixed-revision refresh:** the initial four catalog lists and each collection's first deal page now must all report the same draft revision. Otherwise the refresh fails rather than showing a mixed snapshot.
6. **Stale data editable after failed refresh:** click and form-submit handlers now block catalog actions/saves until a refresh succeeds after a load error.
7. **Response reconstruction headers:** bounded response reconstruction removes transport/content-length headers whose values may no longer match the reconstructed body.

### Added tests and CI observations

- Added helper tests for secure UUID generation/fail-closed behavior; durable mutation persistence; request-ID-specific clearing; malformed/tampered recovery records; storage write verification; and atomic revision-consistent pagination source contract.
- Historical red CI runs during this work were caused by test issues, not silently ignored:
  - The first new store test used a case-sensitive assertion against an uppercase error string; corrected.
  - The first pagination hardening test run retained an assertion for the old collection-index expression; updated to the new staged collection list.
  - A prior CI run also exposed an old stale pagination source assertion; updated it.
- Green CI:
  - `46122189736` on `a9908e27f0bd44992504cbd6026d48a792ba29f0`: Admin Static Checks passed after durable-store tests and stale pagination assertion correction.
  - `46122223726` on `cba8e9135315bb88da085caadf4741db9d3785f7`: Admin Static Checks passed with automatic pending-mutation reconciliation.
  - Earlier baseline run `46121443832` on `0b087f64440f9c92dcca9eb7521a8156bcf0109d`: Admin Static Checks passed including recovered migration test.
- The newest source change `7fc9bcdc370060ba05c2f2f8adc49c338872379b` adds the failed-refresh edit/save guard; its CI run must be checked before considering this checkpoint fully green.

### Remaining verification limitations

- These are source-level and CI checks. No browser acceptance test against a disposable Supabase stack has yet exercised a deliberately interrupted real RPC commit/replay across reload. Do not describe that end-to-end scenario as proven by static tests.
- The product media migration was recovered byte-for-byte from the Production migration ledger and tested for expected structure, but it was not executed again (and must not be).
- Category/deal image commands remain incomplete. No Catalog V3 image upload/preview/restore/remove workflow exists yet.
- No customer image upload is ready. Do not invite the user to upload images until the complete product/category/deal workflow and failure-compensation tests are complete.

### Non-negotiable boundary reaffirmed

- Do not edit `cloudflare/admin-production`, merge, create a replacement project, or deploy.
- Do not apply/reapply migrations or write to Production database/Storage.
- Do not alter/deploy Staff Admin Edge Function or Pages.
- Do not access Supabase Logs Explorer, the 102 GB log query or Log Ingestion.
- Website promotional imagery remains a separate task.


---

## Senior-engineer review checkpoint — 2026-11-28 (response and authorization hardening)

### New client defects found and fixed

- A valid HTTP 200 with malformed/truncated JSON was previously converted to an empty object by `response.json().catch(()=>({}))`. The mutation wrapper could then treat it as a definite failure and clear the idempotency recovery record even if the database had committed. It now raises a typed ambiguous response error, retries the exact same request once, and retains the recovery record unless the server returns a verified success envelope or a typed/HTTP definitive rejection.
- A mutation success envelope is now required to include `ok === true`, the exact original `request_id`, and a non-negative safe-integer `draft_revision` before the recovery record can be cleared.
- Re-authentication reconciliation uses the same strict success-envelope checks. An unverified response retains the record.
- A second HTTP 401 with an empty/non-JSON response was at risk of being parsed before the session-expiry path, which could prevent the explicit sign-out handling. The second 401 is now handled before parsing its body.
- HTTP status classification distinguishes retryable/ambiguous 408, 425, 429 and 5xx outcomes from definitive 4xx validation/authorization/conflict outcomes. Business command errors returned in a valid error envelope are also classified as definite rejection.
- Added regression tests for malformed-success retry, exact same request object reuse, definitive-vs-ambiguous status classification, and second-401 ordering.

### Verified Production database contracts (read-only inspection only)

- Category authoring is implemented in `app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)`, reached through the public category wrapper. Its current allowlist does **not** accept image metadata. It uses actor-derived Admin/Owner authorization, a per-restaurant draft-state row lock, payload hashing, idempotency replay before revision conflict, audit log and response persistence.
- Deal authoring is implemented in `app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)`. Its current allowlist does **not** accept image metadata. It uses `flame_chick_catalog_command_context` and `flame_chick_catalog_command_finish` for actor context, revision lock, idempotency and audit behavior.
- Product authoring already accepts current/previous image paths and extensions and checks that each path is under the exact product UUID folder, uses an allowed extension, and exists in `storage.objects` in bucket `flame-chick-media`.
- Production categories and deals have `image_current_path` and `image_previous_path`; products additionally have `image_extension`, `image_previous_extension`, `image_folder_key`, `image_group_id` and `image_published`.
- Existing Storage object policies require authenticated Admin/Owner authorization and restrict paths to product/category/deal UUID folders (plus separate site/menu-slide folders). Read, insert, update and delete policies exist. No Storage object was read, created, updated or deleted in this audit.
- The database helper functions inspected use `SECURITY DEFINER` with empty `search_path` and explicit schema qualification. The public wrappers inspected are invoker SQL wrappers with empty `search_path`. Existing function ACLs were inspected read-only; no grants were changed.

### CI

- `46123163193` on `27491b74631c735f5fe95ebacd01138340c6fd6c`: success.
- `46123174032` on `5d4fe75f286648c205eaf3d9e931d449d9a300c6`: success.
- `46123253337` on `8b77a13f506389a9d73a5b9a343b48945a8b8f2d`: success.
- `46123260271` on `8a0b60c82a7f629b1f478746fa233b324b95fec7`: success; includes the new auth-ordering regression test and all static Admin checks.

### Media implementation decision / remaining work

- Do not add a broad generic media command or direct Storage metadata write shortcut. Extend the existing category and deal authoring contracts additively, preserving their established idempotency, revision and audit semantics.
- Category and deal read paths must expose current/previous paths to the draft editor; verify the exact page/list response shape and publication compiler behavior before changing them.
- Server validation must bind the path to the exact entity UUID and allowed entity folder, enforce the approved image suffix, and require an existing object in the exact `flame-chick-media` bucket. The client must not be trusted to assert ownership or Admin/Owner role.
- Implement upload/replace/restore/remove as a compensating workflow: upload new immutable object first, commit metadata with revision/idempotency, reconcile ambiguous metadata results using the exact request ID, and only then attempt deletion of objects no longer referenced by current/previous metadata or published snapshots. Never delete an object while the metadata result is uncertain.
- Keep the published image snapshot separate from draft image selection. Draft replacement/removal must not change the customer-visible published image until the existing publication process runs.
- Before any media UI is exposed, add integration tests for category/deal metadata authoring, wrong-entity-folder paths, missing objects, cross-restaurant IDs, role denial, idempotency replay, revision conflict, interrupted upload, ambiguous metadata commit, restore, removal and orphan cleanup. A disposable Supabase test environment is required for the database/RPC/Storage failure cases.
- No category/deal media migration has been authored or executed in this checkpoint. No media UI is ready. User image upload remains blocked until these contracts and tests are complete.

### Boundary reaffirmation

All Production database queries in this checkpoint were metadata/function-definition SELECTs only. No SQL writes, migration application, Storage object operations, Edge Function changes/deployments, Pages changes/deployments or production-branch edits occurred. Supabase Logs Explorer, the 102 GB query and Log Ingestion remain untouched.


---

## Category/deal image metadata contract draft — 2026-11-28

### Completed in the isolated review branch

- Added `docs/drafts/2026-11-28-flame-chick-category-deal-media-v1.sql` as a **review-only SQL draft**, not a numbered Supabase migration.
- The draft targets only these existing internal functions:
  - `app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)` — category image metadata write.
  - `app_private.flame_chick_catalog_draft_read_internal(text,uuid,integer)` — category image metadata read.
  - `app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)` — deal image metadata write.
  - `app_private.flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)` — deal image metadata read.
- Existing category/deal image columns and the current Storage object policies were verified read-only. No new table, column, policy, bucket, public API action or Edge Function is proposed in this draft.
- The draft preserves the existing function identity, `SECURITY DEFINER`, empty `search_path`, actor/restaurant authorization, revision lock, idempotency, audit flow and wrappers. Each text patch requires exactly one matching source anchor and checks the postcondition.
- Category and deal image paths are restricted to their exact entity UUID folder and JPG/JPEG/PNG/WebP suffix; the corresponding object must exist in the `flame-chick-media` bucket. Empty/null path values are supported for removal; omitted values preserve existing metadata; current and previous paths must differ.
- New categories/deals must first be created without media. The entity UUID is then available for the subsequent authenticated upload and metadata command.
- Category list reads and deal list reads now have planned current/previous path fields; deal detail already serializes the complete deal row. Draft metadata remains separate from the current published snapshot.

### Verification status and blockers

- The current database function definitions were re-read through focused read-only `pg_get_functiondef` queries. No data, schema, function, grant, Storage object or publication was modified.
- Supabase documentation was checked for function hardening and Storage metadata behavior. The draft only reads `storage.objects`; it does not insert, update or delete Storage metadata. Actual file operations remain Storage API operations under the existing policies.
- A static contract test was added for the draft's four function targets, guarded anchors, path/object checks and absence of Storage policy/grant/object mutations.
- A source-anchor replay was checked against the exact read-only Production `pg_get_functiondef` text. This found that the category list JSON fragment also appeared in the subcategory branch; the draft anchor is now category-specific (`category_kind`), so subcategory output is not patched. All 14 source anchors are required to match exactly once using PostgreSQL literal-replacement semantics. This is a text-source check only, not PostgreSQL compilation or execution.
- **Not yet validated by PostgreSQL or a disposable Supabase stack.** GitHub CI can validate the static contract only; it cannot prove the dynamic function text replacement compiles or that the behavior passes live RPC/Storage failure scenarios. The SQL is deliberately marked DO NOT APPLY and must not be run against Production.
- No Catalog V3 image upload, preview, replace, restore, remove or orphan-cleanup UI has been added. Product image metadata is still not wired into the editor. **Do not invite image uploads.**
- No workflow run has yet validated the new commit. Record the exact CI run and source commit after GitHub Actions completes.

### Required next gates

1. Review the SQL draft against the exact function definitions and run it only in a disposable Supabase environment with the full migration chain; exercise valid paths, wrong entity folders, absent objects, null/omitted values, cross-restaurant IDs, idempotent replay and revision conflicts.
2. Add RPC/Storage integration tests for replacement, restore, removal, upload interruption, ambiguous commit reconciliation and safe orphan cleanup. Never delete a current/previous path or anything referenced by a published snapshot.
3. Only after those tests pass, implement the unified Catalog V3 product/category/deal media workflow. Keep product category and deal image changes within the existing revisioned/idempotent command model.
4. Obtain separate approval before creating/applying a production migration, changing/deploying the Staff Admin Edge Function, modifying Storage policies, deploying Pages or uploading real menu images.

### Boundaries reaffirmed

- Work remains on `work/admin-catalog-media-review`; `cloudflare/admin-production` remains untouched.
- No Production database writes, migration applications, Storage object operations, Staff Admin Edge Function changes/deployments, Cloudflare Pages deployments, publication or menu imports occurred.
- Website promotional media remains separate.
- Supabase Logs Explorer, the 102 GB log query and Log Ingestion remain completely untouched.


---

## Latest review-draft verification — 2026-11-28

- GitHub owner spelling is confirmed as `itsfahadahmed1234-creator`; all work is on the pre-existing `work/admin-catalog-media-review` branch. The earlier 404s were caused by the owner-name mismatch, not a missing repository or branch.
- Latest application/test commit: `b39f9376da42cb82783be24b82a656556880d575`.
- Admin Static Checks run `46129930224` on that exact commit completed successfully. The run passed JavaScript syntax, the full Node regression suite (including the review-draft contract tests), static Admin assets and POS/Rider inline-script parsing. It does **not** execute SQL.
- A separate source-anchor replay used the current read-only Production `pg_get_functiondef` outputs and PostgreSQL-style literal string replacement semantics. All 14 of 14 guarded anchors matched exactly once across the four target functions. The resulting in-memory definitions retained `SECURITY DEFINER` and `search_path TO ''`. This is an anchor/source consistency check, not a PostgreSQL compile or execution test.
- Category read patch was tightened to include the category-only `category_kind` JSON context so it cannot also modify the similarly-shaped subcategory JSON block.
- No local Supabase CLI, PostgreSQL server/client, Docker runtime or disposable Supabase database is available in the current execution environment. The SQL draft has therefore **not** been compiled or executed, and must remain a review-only draft.
- No Catalog V3 media UI has been added. Product media remains unwired to the editor; category/deal metadata draft is not yet PostgreSQL-validated. The full upload/replace/restore/remove experience is **not ready**, and the user must not be asked to upload images yet.
- Next gate: obtain/use an isolated disposable Supabase/Postgres environment with the complete production-aligned migration chain, execute the draft only there inside a rollback-safe transaction, and cover wrong-folder, missing-object, null/omitted metadata, cross-restaurant, Admin/Owner vs other-role, idempotency, revision-conflict and interrupted/ambiguous mutation cases. Proceed to UI only after that integration suite passes.

No Production database write, migration execution, Storage object operation, policy/grant change, publication, Edge Function or Pages deployment, Website/POS/Rider modification, or log/Log Ingestion access occurred during this verification.
