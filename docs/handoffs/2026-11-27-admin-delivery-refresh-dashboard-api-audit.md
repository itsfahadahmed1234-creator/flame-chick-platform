# Flame Chick Admin — delivery-area refresh fix and dashboard API audit

Date: 2026-11-27
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Production Admin branch: `cloudflare/admin-production`
Production Admin origin: `https://flamechickadmin.pages.dev`
Supabase Production project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Delivery-area permission message — root cause

The area mutation itself is already routed through the existing protected RPC:

- Browser calls `POST /rest/v1/rpc/flame_chick_delivery_configuration_command` with the publishable key and the signed-in user's Bearer JWT.
- The public wrapper is `SECURITY INVOKER`; it delegates to the private command implementation.
- The private implementation is `SECURITY DEFINER`, has an empty search path, obtains the actor from `auth.uid()`, and checks for an active restaurant-wide Admin/Owner assignment before reading or changing delivery configuration.
- The command accepts only `list`, `area_upsert`, and `default_fee_set`.

The misleading `permission denied for table product_variants` occurred after a successful area upsert:

1. `editArea` called `deliveryConfigCommand("area_upsert", payload)`.
2. The shared `openEditor` submit handler then unconditionally called `loadAll()`.
3. `loadAll()` runs a parallel set of legacy direct PostgREST reads, including `product_variants`.
4. Production deliberately grants `product_variants` SELECT to `service_role`, not `authenticated`; direct browser reads must remain denied.
5. `Promise.all` rejects on that read, and the generic editor displays the error even though the earlier delivery-area transaction has already committed.

## Narrow application fix

- Shared `openEditor` now accepts an optional post-save refresh callback, defaulting to the former `loadAll` behaviour for unrelated editors.
- `editArea` passes `loadDeliveryConfig` as its post-save refresh.
- Delivery area create/edit still uses the same `area_upsert` command, payload, validation, branch binding, role checks and database transaction.
- The refresh calls the same authorized delivery-configuration RPC with `list`, then redraws the areas and default-fee state.
- No table grants, RLS policies, delivery SQL, Edge Functions, schema, data, prices or area records were changed.

A regression assertion was added to the existing Admin navigation/access test, and the Admin static CI workflow now also runs on `cloudflare/admin-production`.

## Admin API connection map — verified 2026-11-27

### Current frontend connections

- **Sign-in/session:** Supabase Auth REST endpoints using the browser-safe publishable key. The user access token is stored in session storage and refreshed as needed.
- **Staff context and staff actions:** `flame-chick-staff-admin` Edge Function, with publishable key plus the signed-in user's Bearer JWT. Production function version 8 has `verify_jwt=true`.
- **Catalog V3 authoring:** finite actions sent through the same Staff Admin Edge Function; the function forwards allowlisted database RPCs using the caller's JWT. It does not require browser table grants.
- **Delivery areas/default fee:** direct PostgREST call to the dedicated `flame_chick_delivery_configuration_command` RPC using the signed-in JWT; the UI does not need direct delivery-table permissions.
- **Legacy pages:** `loadAll()` still contains direct PostgREST reads for orders/catalog/settings and the `product_variants` table. Those navigation pages remain gated. Do not open them by granting broad authenticated table access.

### Deployed Supabase Edge Functions

The Production project lists these four functions as ACTIVE:

| Function | Version | JWT gateway setting |
|---|---:|---|
| `flame-chick-staff-admin` | 8 | Required |
| `flame-chick-catalog` | 4 | Not required at gateway; public-read route |
| `flame-chick-order-api` | 12 | Not required at gateway; handler must enforce per-route auth |
| `flame-chick-delivery-api` | 4 | Not required at gateway; handler must enforce per-route auth |

This is deployment inventory only; it does not certify every route or the POS/Rider workflows end-to-end.

## Dashboard opening/API investigation

The Dashboard is intentionally disabled in `bootstrap()`. Only `staff`, `catalog-v3`, and `delivery` are enabled, and login initially navigates to Staff.

The Dashboard code is present, but it currently calls:

`POST /rest/v1/rpc/flame_chick_admin_dashboard`

with a branch ID and prepared time windows for today, selected period, previous period, current/previous week and rush-hour analysis. The frontend expects one aggregate result containing `today`, `period`, `previous_period`, `week`, `previous_week`, rush-period values and `updated_at`.

A read-only Production catalog scan of database functions across schemas found no `flame_chick_admin_dashboard` function. The Dashboard therefore must not simply be enabled: its current RPC target is missing, and the screen would fail when opened.

### Safe implementation design

1. Add one purpose-built, read-only Admin dashboard summary endpoint. Prefer a finite route in the existing Staff Admin domain API (no new Edge Function needed), backed by a narrowly scoped database RPC.
2. Require the signed-in user JWT; derive the actor from `auth.uid()` in PostgreSQL. Require an active restaurant-wide Admin or Owner role. Do not accept an actor ID or role from the browser.
3. Validate that the requested branch belongs to the same active restaurant and that the time windows are bounded and use the restaurant's `Asia/Karachi` timezone.
4. Aggregate orders and financial/status/fulfilment metrics inside PostgreSQL. Return only summary numbers and date buckets; do not expose raw order rows, customer PII, item snapshots or payment details to the dashboard.
5. Keep raw table SELECT privileges and RLS protections unchanged. Use an invoker wrapper and a separately reviewed narrowly-scoped private implementation only if the aggregation requires controlled access to protected tables; the private implementation must have an empty search path, fully qualified objects and explicit actor/tenant/branch checks.
6. Match the existing Dashboard DTO, then test empty data, synthetic order fixtures, cancelled/rejected handling, date boundaries, role denial, invalid/cross-tenant branches and repeated read performance.
7. Only after the endpoint is deployed and browser-tested should the Dashboard navigation entry be enabled. Do not enable Orders, Menu, Media or Settings as a side effect.

## Deployment and verification record

- App change: editor-specific refresh callback for Delivery Areas only.
- No Supabase SQL, grants, RLS, Edge Function, Auth setting, secret, POS, Rider or Website changes.
- CI and Cloudflare deployment results are recorded in the follow-up completion section once available.


---

## Implementation checkpoint — database function installed (2026-11-27)

The earlier section records the pre-implementation investigation. The design is now implemented in Supabase Production and the Admin app/Edge route is prepared on isolated branch `work/admin-dashboard-release`.

### Database implementation

Migration: `20261127164728_flame_chick_admin_dashboard_summary_v1` on Production project `adkrxfnawdiljhjaavnj`.

- `app_private.flame_chick_admin_dashboard_internal(jsonb)` is `SECURITY DEFINER`, fixed empty search path. It derives the actor only from `auth.uid()`; requires an active profile/Auth user and an active restaurant-wide `admin` or `owner` role for the Flame Chick tenant; validates the requested active branch belongs to that tenant.
- `public.flame_chick_admin_dashboard(jsonb)` is `SECURITY INVOKER`. Execute is granted only to `authenticated`; execute is revoked from `PUBLIC`, `anon` and `service_role`. The private helper is not directly API exposed.
- No table SELECT grants, RLS policy changes, table/index additions or data writes were made.
- Exactly 13 payload keys are required. Additional keys (including caller-supplied actor/role fields) are rejected. Database validates UUID/timestamps and bounded ordered windows.
- The function returns a minimal DTO matching the Admin dashboard renderer: today/status/order mix, selected-period and previous-period totals, Karachi-local daily series, weekly/previous-week metrics, 11:00–23:00 rush buckets, latest eight orders, and six oldest operationally active orders plus a total count.
- Counts include all order statuses; order value and average order value exclude `cancelled` and `rejected`. "Sales" here means order value from `orders.total`, not actual collection/settlement. GST and tax logic remain deferred. Fulfilment values are canonical `delivery`, `pickup`, `dine_in`.
- The active-order queue uses status values `new`, `accepted`, `preparing`, `ready`, `out_for_delivery`; it carries no delay threshold and is correctly titled **Oldest active orders**.

### Verification

- Authenticated Admin smoke test succeeded against the Production Main branch and returned the full expected JSON shape (today: 22 orders / PKR 67,691 order value; selected seven-day period: 35 orders / PKR 93,618).
- Rider negative check was rejected by the database with `ADMIN_DASHBOARD_ADMIN_REQUIRED`.
- Privilege audit confirmed `authenticated` execution allowed, `anon` execution denied for both functions; public wrapper is invoker and private aggregate function is definer.
- No test orders/payments were created, updated or cancelled. Smoke checks were read-only and used a transaction rollback.
- These are a database/API contract validation, not a browser end-to-end check.

### Rollout gates — implementation complete; browser acceptance pending

1. Repository migration and both handoffs are synchronized to the release/production branches.
2. Admin Static Checks passed (run `46037397206`); Edge Function Static Checks passed (run `46026633659`).
3. `flame-chick-staff-admin` v9 is deployed with `verify_jwt=true`, its `dashboard-actions.mjs` dependency, exact existing CORS policy and caller Bearer JWT forwarding. Dashboard requests do not use service-role credentials.
4. Authenticated Admin SQL smoke test passed; Rider negative test was denied as expected.
5. The Admin-only change was promoted and one consolidated Pages production build/deployment completed successfully (deployment `61a8c7c1`).
6. A fresh signed-in browser hard-refresh check at `https://flamechickadmin.pages.dev` remains the final acceptance step. Keep the Vercel fallback in place until that is confirmed.

Do not modify POS, QZ signing Worker, Website, Rider, shared order lifecycle, Supabase tenant configuration, payment logic, GST/tax logic, or unrelated Cloudflare projects as part of this Admin dashboard rollout.


---

## Latest rollout checkpoint — Staff Admin v9 deployed; Pages promotion now complete (2026-11-27)

### Confirmed

- Supabase Production `flame-chick-staff-admin` deployed as **version 9**, with `verify_jwt=true`. The deployed bundle was inspected and contains the `dashboard_summary` POST dispatch, the fixed dashboard RPC helper module, existing CORS origin policy, and catalog RPC helper.
- Dashboard handler forwards only the caller's bearer JWT + public key to the fixed RPC; secret/service-role credentials are not used for dashboard summaries. Invitation flows continue to use their existing server-only secret path.
- Admin Static Checks pass on `5cdf47149200d36be12fcaf2d718cf235f94e6a2`, GitHub Actions run `46037397206`. The earlier two test failures were fixed by updating the navigation allowlist expectation to include Dashboard and the default exact-origin test to include Cloudflare Pages.
- Edge Function Static Checks pass on `18382fac91048c284066a4403d4f8e1a2ecbf0d5`, run `46026633659`; the Edge Function sources are unchanged since this pass.
- Database authenticated Admin smoke test and Rider-denial test passed (described in the previous section); grants remain authenticated-only and the public wrapper remains invoker.
- Cloudflare Pages project configuration was inspected: production branch `cloudflare/admin-production`, root `apps/flame-chick-admin`, no build command, output `.`, and preview deployments disabled. The new canonical production deployment is `61a8c7c1` on SHA `7a93cebec36a7c1bc248a2df6b325cb110350536`. Work-branch pushes show as skipped due existing production-only/path rules and do not represent Pages builds.

### Production Pages deployment — complete

- `cloudflare/admin-production` was verified at the expected base and fast-forwarded to `7a93cebec36a7c1bc248a2df6b325cb110350536`. Cloudflare Pages deployment `61a8c7c1` succeeded on that SHA; queued, initialize, clone_repo, build and deploy stages all succeeded. Canonical host: `https://flamechickadmin.pages.dev`.
- Pages project configuration, root, path includes and preview setting were not changed. No direct upload or intermediate build was run; skipped preview events did not consume a build.
- The browser tab available at rollout time predated the release and showed stale DOM. Therefore a fresh signed-in hard refresh and Dashboard data check remains pending; deployment success is confirmed, but UI acceptance is not being claimed.
- Keep the Vercel fallback. Do not deploy POS, Rider, Website, Workers, or unrelated Cloudflare projects. GST/tax remains deferred.

### Separate pre-existing Supabase security advisor notes

The post-migration security advisor still reports 51 informational `rls_enabled_no_policy` findings and one warning for disabled leaked-password protection. Those are pre-existing project posture findings, not created by this migration. No RLS policies, broad table grants, or Auth settings were changed as part of this dashboard work; assess these separately.


---

## Final production rollout — completed (2026-11-27)

- Cloudflare Pages project `flamechickadmin` deployed commit `7a93cebec36a7c1bc248a2df6b325cb110350536` from `cloudflare/admin-production`.
- Production deployment ID/short ID: `61a8c7c1-edfe-4fd0-88ca-286c0cf775cf` / `61a8c7c1`. All stages succeeded: queued, initialize, clone_repo, build, deploy.
- Canonical production host: `https://flamechickadmin.pages.dev`; deployment-specific host: `https://61a8c7c1.flamechickadmin.pages.dev`.
- Admin static CI: pass, run `46037397206`. Edge Function static CI: pass, run `46026633659`. Supabase Staff Admin deployed v9 with JWT verification enabled. Production database Admin/Rider authorization smoke checks passed/denied as expected.
- The previously open browser tab predated this production deployment. Its displayed state was stale and is not evidence of the newly deployed page. A fresh signed-in hard refresh and Dashboard visual/data acceptance check still remains; do not claim that browser test completed.
- One consolidated Pages production build/deployment was performed. No direct upload, preview build, POS/Rider/Website build, or Pages configuration change was made.
