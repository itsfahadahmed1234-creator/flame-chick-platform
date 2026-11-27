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
