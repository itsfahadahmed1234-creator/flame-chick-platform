# Flame Chick Production — Customer Drop-Off Pin Data Contract V1

**Status:** Future-ready database design; one-time location pin only  
**Date:** 2026-11-20  
**Branch:** `work/production-source-audit`  
**Scope:** Customer supplies one fixed delivery destination coordinate. The assigned Rider and authorized branch POS staff can open it in Google Maps.  
**Supersedes:** The earlier draft `customer-live-location-data-contract-v1.md`. Treat that draft's live-session, coordinate-stream, update-throttle and location-Realtime proposals as withdrawn.  
**Production boundary:** Documentation only. No GPS permission prompts, map UI, location collection, database tables, RPCs, Realtime publication, secrets or Production settings have been enabled or created.

## 1. Explicit product boundary

This is **not live location tracking**:
- Flame Chick will not collect the Rider's live GPS location.
- Flame Chick will not continuously track or stream the customer's location.
- The customer may optionally provide one fixed delivery-destination pin.
- The pin is the intended drop-off point, not a moving/current position.
- Rider opens Google Maps directions to that exact coordinate.
- Authorized POS staff can view the same pin and open the same directions destination.
- No Rider tracking dashboard, route history, geofencing or turn-by-turn tracking is included.

The written delivery address remains required and is the fallback. A missing pin, denied geolocation permission, GPS error or unsupported device must never block checkout.

## 2. How the customer supplies a point

At checkout the customer can either:
1. Share the device's current coordinate once, after a clear browser permission prompt; or
2. Place/move a pin manually on a map, without granting device-location permission.

The customer confirms that the pin is the delivery destination and consents to sharing it with the assigned Rider and authorized POS staff for that order. Record the consent timestamp and privacy-notice version. Do not request location permission merely because the website is opened.

The customer may skip the pin and continue with the written address. Do not repeatedly prompt or block checkout.

V1 stores one accepted destination point per delivery. It does not maintain a sequence of customer movements. Any later correction feature must be a separate authorized and audited operation.

## 3. Database representation

Store precise coordinates in the non-exposed `app_private` schema. Do not add latitude/longitude to a broadly readable order table or public order response.

### `app_private.delivery_dropoff_locations`

At most one current customer-shared destination point per delivery order.

Suggested fields:
- `id uuid primary key`
- `restaurant_id uuid not null`
- `branch_id uuid not null`
- `order_id uuid not null unique`
- `delivery_task_id uuid not null unique`
- `latitude numeric(9,6) not null` with CHECK `-90 <= latitude AND latitude <= 90`
- `longitude numeric(9,6) not null` with CHECK `-180 <= longitude AND longitude <= 180`
- `accuracy_m numeric(9,2) null` with CHECK `accuracy_m >= 0`; only meaningful when device GPS supplies it
- `location_source text not null` — `device_once` or `manual_map_pin`
- `customer_consented_at timestamptz not null`
- `consent_notice_version text not null`
- `created_at timestamptz not null` (database/server time)

Composite foreign keys bind the location to the same restaurant, branch, order and delivery task. Only delivery orders may have this row. No row means no pin; it must not be interpreted as coordinate 0,0.

The server validates coordinates, consent and order/task/branch linkage. A client-captured timestamp is not authoritative and is not required in V1.

## 4. Google Maps directions link

Do not accept and persist an arbitrary customer-supplied Google Maps URL as the authoritative destination.

Generate the Rider/POS directions link from the validated coordinates using a fixed trusted template, for example:

`https://www.google.com/maps/dir/?api=1&destination=<latitude>,<longitude>`

Safely URL-encode the coordinate pair. Show an explicit "Open directions" action. If no coordinate exists, display the written address instead.

The link is a navigation convenience, not a security token or proof of identity. Never open a user-supplied URL or allow an arbitrary destination domain. Revalidate coordinates before generating the link.

## 5. Write path and validation

- The customer order request may include the optional coordinate, location source and consent context.
- The server validates the coordinate range, consent, delivery fulfilment and resolved branch.
- Insert the location row in the same transaction as the order and delivery task. If order creation rolls back, the coordinate row must roll back too.
- The customer cannot set restaurant/branch/order/task IDs as authority, update another order's pin, or supply an arbitrary maps URL.
- No direct browser INSERT/UPDATE/SELECT grants on the private location table.
- Do not create a recurring location-update endpoint, polling loop, background geolocation permission, location session, bearer location token or coordinate sequence.
- If pin editing after checkout is later introduced, authorize it separately and audit the change. Retain only the current pin unless a documented legal/operational need requires a minimal history.

## 6. Read authorization: Rider and POS

Coordinates remain in `app_private` and are returned only through a narrow, server-authorized delivery-detail projection.

- **Assigned Rider:** may retrieve the pin only for their own current active delivery assignment. Reassignment immediately removes the previous Rider's access.
- **POS:** Admin, Owner, Manager and Cashier may retrieve the pin only for delivery tasks in their authorized restaurant/branch operational scope, consistent with their existing POS permissions.
- **Other Riders:** never see pins for another Rider's task or offer.
- **No active Rider assignment:** Rider has no access. Authorized branch POS staff may access the pin while the delivery task remains operational and non-terminal.
- **Non-staff authenticated users and public guests:** no coordinate read.
- Every read checks current Auth identity, active role, branch, assignment and task state. Do not rely on a hidden UI control or old JWT alone.
- No Realtime is required for a static pin. Fetch it when authorized Rider/POS opens delivery details. Never broadcast coordinates branch-wide.
- Keep coordinates and maps links out of public catalog data, analytics, general logs and broad notification payloads.

## 7. Retention and privacy

- Store one current destination point, not movement history.
- Proposed V1 retention: delete precise coordinates within 24 hours after delivery becomes delivered, returned, cancelled or otherwise terminal. Keep ordinary order address snapshots and non-coordinate audit metadata under their separate retention policy.
- Audit that a pin was shared and record authorized access/change metadata where practical. Do not copy raw coordinates, full address, browser fingerprint or map URL into audit events or logs.
- Confirm the proposed 24-hour cleanup window against operational support needs before implementation. Use bounded cleanup; correctness must not depend on a paid scheduler or continuous worker.

## 8. Relationship to the five V1 database decisions

- Branch is resolved by the server first; a customer coordinate cannot select or change it.
- Shared base prices, branch availability and delivery fees are determined independently of the coordinate. Do not infer delivery coverage from a point unless a separate service-area rule is designed.
- Staff role and branch permissions govern coordinate access.
- Deal selections and financial records never include or depend on coordinates.
- Completion/return ends Rider access to the pin. Payment/refund history remains separate.

## 9. Required adversarial tests before enabling

1. Customer declines device permission or skips the pin: checkout still works with written address.
2. Customer chooses a manual map pin: no device-location permission is needed.
3. Invalid coordinate, missing consent or malformed/oversized input is rejected.
4. Customer forges order/task/branch IDs: server rejects the scope.
5. Customer supplies a malicious/non-Google directions URL: it is never stored or opened.
6. Public caller queries `app_private` directly: denied.
7. Rider changes another Rider's task ID: no coordinate disclosure.
8. Rider is reassigned: previous Rider immediately loses access.
9. Manager/Cashier requests a different branch's pin: denied.
10. Staff role is disabled/revoked: old browser session cannot retrieve the pin.
11. No active assignment or terminal delivery task: Rider read is denied.
12. Delivery completes/returns/cancels: pin is no longer exposed and is purged under retention policy.
13. Logs, audit events, public responses, analytics and notifications contain no precise coordinates or reusable location token.
14. No periodic browser GPS request, background tracking, Rider GPS write, coordinate history, polling loop or Realtime coordinate broadcast exists.

## 10. Explicitly not included

- Rider GPS/live location.
- Customer GPS/live/continuous updates.
- Rider route history, customer movement history or geofencing.
- Automatic branch selection based on coordinates.
- Automatic delivery coverage determination based on coordinates.
- Live map updates, background tracking or continuous Realtime.
- Public order tracking or a customer-facing location lookup token.

This contract prepares the database for one-time customer-shared destination pins only. It does not enable the feature. Build it only after schema approval and completion of the previously recorded customer-website security audit gate before website/database integration.
