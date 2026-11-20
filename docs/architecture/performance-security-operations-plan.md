# Flame Chick Production — Security, Performance and Free-Plan Operations Plan

**Status:** Review of owner-provided guidance against current source and official Supabase limits  
**Prepared:** 2026-11-20  
**Owner constraints:** Supabase Free plan; no planned upgrade; approx. 100–150 orders/day; retain approx. 3–4 months of orders; 1 POS, 1 Admin panel, and 8–10 riders  
**Production changes:** None

## 1. Executive assessment

The owner-provided advice is directionally useful. Keep its security, server-side validation, backup, query-efficiency, Realtime-filtering, menu-caching, and image-optimization ideas.

Do not copy its generic SQL indexes or estimated connection arithmetic without adapting them to the actual Flame Chick schema and queries. Do not add connection-pooler work for code that already uses Supabase Data API/PostgREST. Do not add customer-facing website Realtime subscriptions just for decoration or theoretical order tracking; the current website does not have that feature requirement.

The target workload is modest in order count, but the system still needs good query plans, explicit security policies, tested recovery, bounded Realtime subscriptions, and safe offline-order behavior. A low daily order count does not protect against data leaks, broken migrations, lost local POS data, or Free-plan inactivity pauses.

## 2. Capacity context and current Free-plan quotas

Official Supabase pages checked 2026-11-20 report the following Free-plan allowances:

| Resource | Current Free allowance | Design implication |
|---|---:|---|
| PostgreSQL database | 500 MB per project | Measure real usage including indexes, history and JSON snapshots; do not estimate from order count alone |
| Storage | 1 GB | Menu/product images and other objects need size control and lifecycle management |
| Egress | 5 GB | Avoid repeatedly sending full catalogs and oversized images |
| Cached egress | 5 GB | Keep cacheable public assets stable and cache-friendly |
| Realtime peak connections | 200 | Current expected operator/rider clients are far below the plan cap, but count actual browser tabs and devices |
| Realtime messages | 2 million/month | Avoid broad/unfiltered subscriptions and message storms |
| Edge Function invocations | 500,000/month | Current volume is not expected to approach this from ordinary order creation alone; measure catalog/health polling and retries |
| Logs retention | 1 day | Do not rely on Dashboard logs as long-term incident history |
| Automatic database backups | Not included | External encrypted backup and tested restore remain mandatory |
| Project inactivity pause | Can pause after 1 week of inactivity | A real active restaurant should generate activity, but holiday/closure periods need a pause/recovery awareness process |

Sources:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/free-project-pausing

The user's rough order-history volume:
- 100 orders/day × 90 days = 9,000 orders.
- 150 orders/day × 120 days = 18,000 orders.

That arithmetic is correct. It is not a database-size guarantee: order items, modifiers, deal components, status/audit rows, indexes, snapshots, media metadata and logs add storage. Measure database size and table/index growth after the first realistic test load and periodically thereafter.

## 3. Security guidance: what to keep and what is already evidenced

### Keep these requirements

- RLS enabled on every table in an exposed schema.
- Specific policies for each role and row scope; never assume TO authenticated alone means authorized.
- Separate grants and RLS review. A table can be inaccessible because grants are missing, or accessible with overly broad policy if grants are permissive.
- Private schemas for internal/security-sensitive tables. Keep push subscription secrets, rate-limit hashes, dispatch internals and sensitive audit data inaccessible to browser roles.
- SECURITY DEFINER functions only where necessary, with fixed search_path, explicit actor/branch checks, safe owner and narrow EXECUTE grants. SECURITY DEFINER bypasses normal RLS enforcement and must be treated as a privileged endpoint.
- Views must be reviewed for security_invoker behavior or kept unexposed/restricted.
- UPDATE policies need both USING and WITH CHECK; test update/select behavior, not only SELECT.
- Never trust browser-supplied price, total, delivery fee, actor ID, role, branch, product status or workflow transition.
- Use the Supabase publishable key in browser apps. A publishable key is public by design; it is not an authorization mechanism. Never expose a secret/service_role key in browser code, HTML, JS bundles, source maps or frontend environment variables.
- Edge Functions using service_role must perform their own verified-user, role, restaurant and branch authorization, because service_role bypasses RLS.

### What current source/repository evidence shows

- The website configuration uses a Supabase publishable key and calls catalog/order Edge Functions.
- The Admin browser app uses the publishable key plus the signed-in user's access token to call PostgREST directly. Its safety therefore depends on correct grants and RLS on every table it reads/writes.
- Service-role usage is in server-side Edge Function source, not in the intended browser configuration. Earlier repository secret scans did not find committed service-role secret values. Re-run secret/build-artifact scans before each production deployment.
- Archived Demo migrations explicitly enable RLS on their application tables. The Demo security migration revokes public/anon/authenticated EXECUTE on public functions, grants public function EXECUTE to service_role, and selectively grants authenticated access to internal helper functions.
- The archived Demo order RPC is SECURITY DEFINER with an empty search_path and performs server-side product/variant/modifier/deal price lookup and total calculation, and uses an advisory transaction lock plus idempotency key/request hash to prevent duplicate orders.
- These are reference-source observations, not proof that every Demo policy is correct or that Production is protected. The verified Production project was empty of application tables and functions at the last inspection; its baseline hardening migration alone does not secure future app tables that do not yet exist.

### Required Production verification

For every table, view, function, Storage bucket and policy, test as:
- anon/customer website
- authenticated owner
- admin
- manager
- cashier
- kitchen
- rider
- a valid user from another branch/restaurant
- service_role

Include negative tests for IDOR, cross-branch IDs, changing row ownership, reading other customers' addresses/phones, reading other riders' jobs, calling privileged RPCs directly, and changing price/status/fee fields from the browser.

Do not describe Production as “RLS protected” until these tests pass on the actual Production schema.

## 4. Server-side order validation

Keep the advice that the server/database must calculate authoritative prices and totals.

The archived Demo hfp_create_order RPC already:
- loads product/variant/deal/modifier prices from database rows;
- calculates order-line and subtotal values server-side;
- validates item availability and modifier selections;
- uses an idempotency key and request hash;
- serializes concurrent retries with an advisory transaction lock;
- creates order/items within one PostgreSQL transaction.

Production should preserve and improve those ideas, but it must not copy Demo-only behavior:
- Demo treats missing delivery area ID as “Manual address (demo)” with zero fee. Production must instead require an explicit listed_area or not_listed selection and resolve the configured fee server-side.
- POS offline sync currently sends item IDs later, and the server prices using the then-current catalog. Production must attach the catalog publication version and enforce the confirmed stale-version hold/confirmation policy below.
- GST/tax is explicitly deferred from V1 by owner decision.

## 5. Confirmed offline POS stale-price policy

**Owner decision confirmed 2026-11-20:** if a POS delivery order was created offline using an older published catalog version and the server's current catalog version has changed, the order must be held for explicit cashier/manager confirmation before it is submitted using changed prices.

Required behavior:
1. Save the exact publication version used when the cashier built the order.
2. Include that publication version in the sync request and retain it in the local order record.
3. Server validates the submitted product/variant/deal IDs against that referenced publication and current business availability.
4. If the submitted version is no longer the current publication and the server would charge a different amount, return a stable error such as CATALOG_VERSION_STALE with a safe summary of the difference.
5. Do not create an order, create duplicate idempotency outcomes, or silently reprice the local order.
6. POS marks the local order as needs_confirmation, keeps it in the queue, and displays old vs current prices and totals.
7. An authenticated cashier/manager must explicitly confirm the new total (or cancel/edit the local order) before the client retries with a new idempotency key and confirmed current catalog version.
8. Preserve an audit record that the stale order was re-priced by an identified staff actor.
9. If the original publication is retained and the owner later chooses to honor the historical quoted amount instead, that is a separate policy change; do not silently implement it.

The exact UI should make it impossible to mistake a held order for a successfully submitted server order.

## 6. Query and index strategy

Do not run the generic index SQL from the supplied conversation. In particular:
- A column named rider_id may not exist on orders; the current model uses rider profiles, delivery_task_offers and delivery_assignments.
- A standalone status index may be less useful than a branch/status/time composite or partial index.
- customer_id may not exist for guest orders.
- PostgreSQL does not automatically create indexes on every foreign-key referencing column, but indexes should still be chosen from actual joins/filters and measured query plans.

### Current source query patterns observed

- POS orders: branch_id equality, active status IN list, created_at descending, limit 100.
- POS dispatch tasks: branch_id equality, status IN active delivery states, created_at ascending, limit 100.
- POS rider profiles: branch_id equality, active=true.
- Admin boot: branch-scoped orders ordered by created_at descending with limit 1000; menu tables loaded by restaurant/product/category IDs.
- Admin dashboard RPC: branch_id plus placed_at time ranges for daily/weekly/period reporting.
- Rider portal: a single authenticated rider jobs RPC returns the rider's active tasks and offers together.
- Rider Realtime: delivery_task_offers and delivery_assignments filtered by rider_user_id.
- POS Realtime: orders and delivery_tasks filtered by branch_id; current source does not branch-filter delivery_task_offers or delivery_assignments.

### Candidate index families to validate with EXPLAIN (not approved SQL)

- orders: branch_id + created_at DESC, with a partial predicate for active operational statuses if EXPLAIN confirms benefit; separate branch_id + placed_at index if dashboard date-range scans require it.
- delivery_tasks: branch_id + status + created_at for dispatch board queries.
- delivery_task_offers: rider_user_id + status/expiry fields for rider offer lists and expiry processing.
- delivery_assignments: rider_user_id and delivery_task_id/current-assignment access paths; consider a partial unique index for one current assignment per task as an integrity constraint, not just speed.
- user_roles: user_id/branch_id/role with active filtering for authorization checks.
- order_items: order_id and line number for order detail/receipt joins.
- Foreign-key lookup columns used frequently in deal components, modifiers, variants and branch-scoped joins.

Before keeping any index:
1. Capture the exact query and relevant RLS predicate.
2. Run EXPLAIN (ANALYZE, BUFFERS) using representative data on an isolated environment.
3. Compare latency, rows scanned, buffers and write overhead.
4. Verify after index creation with query plan and Supabase advisors.
5. Avoid duplicate/overlapping indexes and indexes that do not improve measured workloads.

### Pagination and retention

- POS active inbox already requests only active statuses, newest 100.
- Rider RPC returns current assignments/offers, not full rider history.
- Admin currently loads up to 1,000 orders at boot and filters the result in browser. Add server-side pagination and date/status filtering rather than increasing the limit indefinitely.
- Target active order-history retention is approximately 3–4 months, per owner. Before automatic deletion is implemented, define what happens to related order items, payment/reconciliation references, delivery/audit events and backup copies. Confirm whether older orders are permanently deleted or archived outside the live operational database. Do not delete financial/audit records blindly or use retention as a substitute for indexes.

## 7. Realtime and connection management

Current official Free-plan limits are 200 peak concurrent connections and 2 million Realtime messages/month.

Current source audit:
- POS creates one channel per active staff branch session, filters orders/tasks by branch and coalesces bursts with a short fixed-window debounce.
- POS has stopHfpRealtime() that clears timers and removes the channel.
- POS currently listens to delivery_task_offers and delivery_assignments without branch filters. This must be fixed before Production to avoid cross-branch event processing and unnecessary message delivery.
- Rider opens Realtime only while signed in, online/accepting jobs, and has rider-specific filters on offers and assignments by rider_user_id.
- Rider cleanup removes its channel and explicitly disconnects the Realtime socket.
- Admin does not currently use a Realtime subscription in the inspected app.js.
- The customer website does not use Realtime for order tracking. Do not add a WebSocket for every website visitor. Its catalog is version-cached and the current order flow submits once to the order API.

Keep the agreed policy:
- Realtime only for live operational POS/Rider updates.
- No Realtime for Order History or non-live reporting screens.
- POS keeps the 15-second polling/manual recovery fallback.
- Filter subscriptions by branch/rider, coalesce bursts, remove subscriptions on sign-out/offline/teardown, and monitor messages as well as peak connections.
- Estimate sockets from actual browser tabs/devices. One POS + 8–10 active rider phones is not 12–15 guaranteed connections; duplicate tabs and reconnect overlap change the real count.

## 8. Connection pooling applicability

The current browser apps use Supabase Data API/PostgREST, and the inspected Edge Functions generally call PostgREST HTTP endpoints. They are not opening a direct PostgreSQL connection per browser/device, so the generic advice to “put the apps on Supavisor” is not applicable to these existing request paths.

Official Supabase guidance:
- Frontend apps use the Data API.
- Serverless/Edge Functions that open direct PostgreSQL connections should use the shared pooler in transaction mode, with driver settings appropriate to that mode.
- Migrations, pg_dump/restore and similar single-session admin tasks use a direct connection where supported.

If future Edge Functions add a direct PostgreSQL driver, review pool size, transaction pooler compatibility, prepared statements and SSL before deployment. Do not add a new database driver/pooler layer without a concrete use case.

## 9. Website catalog caching and image bandwidth

Current source observations:
- Website catalog loader uses localStorage with a format-versioned cache and a version-aware health/catalog flow. It can reuse the last valid cached snapshot rather than download the complete catalog on every page load.
- POS stores catalog/menu/category/delivery-area data in IndexedDB and can operate with its last local menu while offline.
- The existing POS refresh clears live menu/category/delivery-area stores before writing the downloaded version. Replace this with a staging version and atomic active-version switch so a write failure leaves the last known-good menu intact.
- The website uses Supabase Storage public media URLs for published assets; Supabase Free Storage has 1 GB and egress quotas.

Keep the following:
- Use WebP/AVIF where supported and provide appropriately sized responsive images.
- Compress menu/product thumbnails and avoid serving unnecessarily large source images to mobile checkout.
- Lazy-load below-the-fold menu images and avoid downloading hidden/unneeded galleries.
- Use cache-friendly immutable/versioned filenames for published media and explicit cache-control.
- Avoid replacing image objects in place when a versioned filename can protect cached customers from stale/mixed assets.
- Measure actual image payloads and mobile quality before enforcing a hard per-image byte target. The suggested 80–120 KB target is a useful optimization goal for many thumbnails, not a universal limit for all hero/product images.
- Keep published images in a deliberate public media area; draft/private uploads remain private and are not made public by hiding them in Admin.
- The current website's health check may still generate a small API request per visit; full catalog cache reduces larger downloads. Measure actual calls and egress before adding more cache complexity.

## 10. Error logging and monitoring

Free-plan Dashboard logs have only short retention (currently 1 day). Do not rely on them as the sole incident history.

Recommended first-release approach:
- Structured Edge Function logs with correlation/request IDs and stable error codes.
- Redact customer names, phone numbers, addresses, tokens, API keys and push subscription values.
- Record durable business audit events for price/menu/publication/staff/dispatch changes separately from technical error telemetry.
- Consider an external low-cost error monitor only after checking Free limits/privacy policy. Do not create an unbounded database error-log table containing raw request bodies or PII.
- Track operational metrics: order create latency/failure rate, POS queue age, stale-catalog holds, catalog publish/rollback failures, Edge Function errors, DB size, Storage size, egress, Realtime peak connections/messages and backup freshness.
- Alert on backup age, sustained order API failures, POS sync backlog, Realtime disconnects and nearing storage/egress/database quotas.

## 11. Backup, staging and disaster recovery

The supplied advice is especially important here. Official Supabase documentation confirms Free projects do not receive automatic downloadable daily backups. Database backups do not include Storage objects.

Keep the already-agreed Free-plan approach:
- Encrypted off-site database backups, including schema and data.
- Separate Storage-object backups and integrity checks.
- Daily restore points, seven daily versions, weekly retained versions, and monthly restore tests, subject to verified GitHub/backup storage limits.
- Test restores in an isolated project, not over the active Production project.
- Retain migration files and function source in GitHub.
- Keep the existing Production baseline migration history reconciled; never reapply it.
- A separate staging project is preferred, but Free plan allows only two active projects per organization at this current quota. Count the user's existing projects and use a disposable test project only if a slot is available; otherwise use an isolated local Supabase stack or a separate Free organization/project with explicit account separation.
- A staging project must never contain production customer PII unless properly minimized and protected.
- Free projects can pause after a week of inactivity; plan for reactivation and do not assume Free tier provides a production uptime SLA.

A backup is not complete until an isolated restore proves it can recover both database data and media objects.

## 12. Prioritized implementation checklist

### Required before Production launch
1. Explicit stale-catalog hold and staff confirmation UX/API/RPC.
2. Server-side item prices and listed/Not Listed delivery fee resolution.
3. Complete RLS/grant/function/Storage policy matrix and negative authorization tests.
4. Immutable catalog publication and atomic POS IndexedDB cache swap.
5. Branch-filter POS Realtime offers/assignments; retain rider-specific subscriptions and cleanup.
6. Server-side Admin pagination and measured indexes for POS/Admin/Rider queries.
7. Encrypted database + Storage backup/restore rehearsal.
8. Validate publishable/secret key separation in source, build artifacts and Vercel environment variables.

### Strongly recommended
1. Responsive WebP media, lazy loading and cache-control.
2. Structured redacted logs and operational metrics.
3. Defined 3–4 month order retention/archive policy after confirming financial/audit dependencies.
4. Load test using a realistic batch of concurrent order creation and active POS/Rider reads; 100–150 orders/day alone is not a stress-test.
5. Monitor Free database/storage/egress/Realtime quotas monthly.

### Not needed for this workload unless measurements change
- Paid dedicated connection pooler.
- Read replicas.
- Complex caching infrastructure.
- Broad Realtime on website or reporting screens.
- Premature sharding/partitioning.
- Large generic index sets copied from unrelated examples.

## 13. Safety and evidence boundary

This is an architecture/operations review only. No Production schema, settings, secrets, users, Storage, Edge Functions or live app deployments were changed.

The performance numbers and plan quotas in this document are point-in-time official Supabase information checked on 2026-11-20. Re-check before launch because plan limits can change.
