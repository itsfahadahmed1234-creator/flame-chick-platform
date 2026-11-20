# Flame Chick Production — Customer Live Location Data Contract V1

**Status:** Future-ready database design; no live tracking is enabled  
**Date:** 2026-11-20  
**Branch:** `work/production-source-audit`  
**Scope:** Customer-shared delivery location visible to the assigned Rider and authorized branch POS staff  
**Production boundary:** Documentation only. No GPS permissions, app code, Realtime publication, database tables, RPCs, secrets or Production settings have been created or enabled.

## 1. Product boundary

Flame Chick may later let a customer share the phone/browser's location for a specific delivery so the assigned Rider and authorized POS staff can find the customer more accurately.

This is **customer-to-Rider/POS location sharing**, not Rider GPS tracking. Rider GPS tracking is a separate future feature and must not be inferred from this design.

Model two distinct capabilities:

1. **Drop-off location pin:** a one-time GPS coordinate voluntarily shared by the customer at checkout or order tracking. It supplements the written delivery address.
2. **Live customer location:** an optional, time-limited stream of updated customer-device coordinates for that one active delivery.

A written address remains required for delivery. GPS permission denied, unavailable or inaccurate must not block checkout. The customer can use the address and map pin/manual instructions instead.

## 2. Consent, start, stop and expiry

- Location sharing is opt-in, order-specific and purpose-limited to completing that delivery. Do not collect coordinates just because the customer opens the website or places an order.
- Explain that the assigned Rider and authorized branch POS staff can see the shared location, and that sharing can be stopped.
- Record consent time and a consent/privacy notice version. A one-time drop-off pin and continuous live sharing require distinct consent choices.
- A live session is eligible only for a delivery order. It becomes active only during the actual delivery journey (recommended trigger: task is `out_for_delivery` and there is a current accepted assignment). Do not continuously track customers while an order is merely queued, preparing or awaiting a Rider.
- A customer can revoke sharing at any time. Stop accepting updates immediately when revoked.
- Automatically stop access on delivered, returned, cancelled, failed/closed or otherwise terminal delivery outcome; also stop at explicit expiry or session revocation.
- Use database time for activation, expiry and freshness. A device clock must never extend a session.
- If the browser/app is closed, backgrounded or loses GPS permission, updates may pause. Show the last update time and mark the location stale; never imply it is still live. The written address / last voluntarily shared pin remains the fallback.

## 3. Database placement and minimum data

Keep precise customer coordinates and share credentials in non-exposed `app_private`; do not grant browser table access.

### 3.1 `app_private.customer_location_share_sessions`

One scoped session per delivery/order sharing period.

Suggested fields:
- `id uuid primary key`
- `restaurant_id uuid not null`, `branch_id uuid not null`
- `order_id uuid not null unique`, `delivery_task_id uuid not null unique`
- `share_mode text not null` — `dropoff_pin` or `live`
- `status text not null` — `consented`, `waiting_for_delivery`, `active`, `revoked`, `stopped`, `expired`
- `consented_at timestamptz not null`, `consent_notice_version text not null`
- `started_at timestamptz null`, `last_update_at timestamptz null`, `expires_at timestamptz not null`, `ended_at timestamptz null`
- `share_token_digest bytea null`, `token_key_version smallint null` (only for guest/customer write capability)
- `created_at timestamptz not null`

Use composite FKs to the matching restaurant/branch order and delivery task, so a session cannot point to a different branch's order/task. Only delivery orders can have a location-share session. A random high-entropy, single-session write capability may be used because the website customer is not necessarily signed in. Store only its cryptographic digest, never the raw token. It must authorize **location updates only**, not order reads, status changes or refunds.

### 3.2 `app_private.customer_delivery_location_current`

One current coordinate per active session; update in place rather than retaining a trail.

Suggested fields:
- `session_id uuid primary key references customer_location_share_sessions(id)`
- `latitude numeric(9,6) not null` with CHECK `-90 <= latitude <= 90`
- `longitude numeric(9,6) not null` with CHECK `-180 <= longitude <= 180`
- `accuracy_m numeric(9,2) null` with CHECK `accuracy_m >= 0`
- `captured_at timestamptz null` (client-provided diagnostic timestamp; untrusted)
- `received_at timestamptz not null` (database/server time; authoritative)
- `sequence_no bigint not null` (monotonic per session)

Reject invalid coordinates, impossible accuracy values, oversized inputs, expired/revoked sessions and out-of-order sequence numbers. Do not rely on client timestamps for authorization, freshness or expiry. Report the accuracy radius to map clients; don't present low-accuracy GPS as an exact address.

### 3.3 Minimal audit metadata

Record consent, revocation, activation, completion and security-relevant access events without copying coordinates, raw tokens, full addresses or device fingerprints into audit rows. Do not write a permanent breadcrumb history by default.

## 4. Write path and abuse controls

- Customer location updates must go through one narrowly scoped server-validated command. No direct INSERT/UPDATE grants on private tables.
- For a guest website order, a high-entropy token is scoped to one location session/order; store only its digest. Keep it out of URLs, analytics, logs, browser error messages and referrer headers. It must not be interchangeable with an order-tracking credential.
- Validate session/order/task relation, current order/task state, session status, expiry, token digest, coordinate range, payload size and sequence number on every update.
- Apply a database-time minimum interval / write throttle per session (recommended initial target: no more than one accepted update every 10 seconds), plus bounded abuse throttling. Do not create a new Edge Function for every update; evaluate the safest transport and Free-plan request budget during implementation.
- The update command returns only success/failure and a safe freshness/sequence receipt; never returns the coordinate to the guest writer.
- Customer reads of the Rider/POS location view are not part of this feature. Customer may stop sharing but must not read Rider or staff data.

## 5. Read authorization: Rider and POS

Coordinates remain private. Read via an authenticated, server-authorized narrow projection or equivalent secure transport; never expose the private tables in the browser Data API.

- **Assigned Rider:** may read the latest location only for the Rider's own current active assignment and only while the delivery is eligible/live. Changing a task UUID or rider ID in a request must not widen access.
- **POS:** Admin/Owner and active Manager/Cashier roles may read the latest customer location for delivery orders in their authorized branch operational scope. No access to another branch.
- **Other Riders:** never see another Rider's customer's location.
- **Rider not assigned yet / assignment ended:** Rider cannot see the location. Authorized POS branch staff may retain access only while the task is still operational and the session has not ended.
- **Non-staff authenticated user / public guest:** no coordinate read.
- Every read checks current database role, branch, assignment, task state and session expiry. A cached token or stale JWT must not preserve access after reassignment or role removal.
- Do not broadcast raw coordinates to a branch-wide Realtime channel. A future private per-task notification may say only that a location changed; the client then fetches the latest coordinate through the authorized read path. Realtime membership must be scoped to the assigned Rider and authorized branch POS roles. Validate Realtime access controls before enabling it.
- Avoid continuous POS polling. Use throttled refresh/private notification and show a clear last-updated time.

## 6. Update frequency, freshness and storage retention

Initial design defaults, to be tested under real usage:
- Customer browser sends an update only while the customer has explicitly started live sharing and the page/device is able to provide location.
- Target accepted-update interval: at least 10 seconds between writes per session; client may send less often when stationary or GPS is unchanged.
- A coordinate older than 60 seconds is displayed as stale, not live.
- Session expiry is bounded to the order's delivery window and may not outlive the delivery task's terminal state.
- Immediately stop reads/writes on revoke or terminal outcome.
- Keep only the current coordinate. Delete coordinate rows within 24 hours after the session ends; retain consent and access metadata without coordinates according to the approved audit-retention schedule.
- Cleanup may run in bounded opportunistic batches; correctness must not depend on a paid scheduler or continuous worker.

These are design defaults, not currently active runtime settings. Revisit interval/retention after measuring delivery duration, Free-plan usage, support needs and applicable privacy obligations.

## 7. Relationship to the five V1 database decisions

- **Branch selection:** location session inherits the server-resolved order branch; customer coordinates cannot select or change a branch.
- **Shared menu/base prices:** coordinates do not affect catalog or pricing. Branch availability and delivery areas are checked independently.
- **Single role identity:** location read authorization uses the single active operational role and branch scope.
- **Curated deals:** location data is not included in catalog/deal snapshots.
- **Returned order/payment:** location session ends on return; refund/collection records remain separate and unchanged.

## 8. Required adversarial tests before enabling

1. Customer has not consented: no coordinates collected or session opened.
2. Customer revokes: next write/read is denied immediately.
3. Session token used on another order/session: denied.
4. Token replay after expiry/terminal state: denied.
5. Token used to read order/customer data or alter order state: impossible.
6. Anonymous caller queries private coordinate table directly: no schema/table access.
7. Rider changes another Rider's task/assignment UUID: no coordinate disclosure.
8. Rider loses assignment or is reassigned: previous Rider immediately loses location access.
9. Cashier/Manager requests another branch's delivery coordinate: denied.
10. Manager/Cashier has removed/inactive role: access denied even with an old browser session.
11. Invalid latitude/longitude/accuracy, oversized payload and out-of-order sequence: rejected.
12. Client sends future/backdated timestamp: server time determines freshness and expiry.
13. Rapid requests: server-side interval/throttle prevents write flooding.
14. Browser closes/permission denied/GPS unavailable: status becomes stale/unavailable; delivery continues using address/manual pin.
15. Delivered/returned/cancelled task: location access ends immediately and coordinate is purged on retention schedule.
16. Realtime subscription for another task/branch: denied; no raw coordinates leak through branch-wide broadcast.
17. Retention cleanup: only expired coordinate rows are deleted; order, delivery, financial and consent audit history remains intact.

## 9. Implementation boundary

This contract makes the database ready for a future feature. It does **not** authorize:
- requesting location permission now;
- adding maps or a location-sharing UI to the website, POS or Rider portal;
- enabling GPS collection, tracking, Realtime channels or background location;
- creating tables/RPCs in Production;
- deploying new Edge Functions or changing Vercel/Supabase settings.

Build the feature only after the database schema is approved and the customer-website security audit is completed at the previously recorded website/database integration gate.
