# Flame Chick Production — Source / Schema Consistency Audit V1

**Status:** Targeted source-to-schema audit; findings and required contract changes  
**Date:** 2026-11-20  
**Audited ref:** work/production-source-audit  
**Boundary:** Read-only source review. No application source or live service was modified.

## 1. Audit scope and evidence

Reviewed the active customer website checkout, its catalog client, POS order creation and online-order reads, Admin REST data model and role guard, Rider portal reads/actions, all four current Edge Function handlers, Supabase function config, the Production field-level schema draft, and the archived Demo baseline SQL as reference only.

Key paths:
- apps/flame-chick-website/index.html and js/catalog.js
- apps/flame-chick-pos/index.html
- apps/flame-chick-admin/app.js
- apps/flame-chick-rider/index.html
- supabase/functions/flame-chick-catalog/index.ts
- supabase/functions/flame-chick-order-api/index.ts
- supabase/functions/flame-chick-delivery-api/index.ts
- supabase/functions/flame-chick-staff-admin/index.ts
- supabase/config.toml
- supabase/demo-reference/migrations/20261117000000_flame_chick_schema_baseline_v1.sql

The Demo SQL is historical design evidence only. It is not the Production schema and must never be copied or applied wholesale.

## 2. Executive findings

| Priority | Finding | Required response |
|---|---|---|
| Critical | Order API calls a website limiter RPC, but Production was last verified with no application tables/functions. The referenced RPC exists only in Demo reference SQL. | The initial Production migration must implement the required rate-limit contract before the website order endpoint is enabled. Until then, fail closed rather than accept unchecked orders. |
| High | Demo limiter currently permits 3 per phone / 10 minutes and 10 per phone / hour; it has no 3-per-minute phone cap. IP caps in Demo are 20 / 10 minutes and 60 / hour. | Replace with owner's exact rolling caps: 3 / minute, 3 / 10 minutes, 15 / hour per normalized phone. |
| High | Current Demo limiter records an attempt in a separate RPC before the order-create RPC. Failed validation/order creation can therefore consume a quota slot. | Move quota check and event insert into the same order-creation transaction; count only newly committed customer website orders. |
| High | Existing phone limiter uses unsalted SHA-256 of normalized phone. | Use a server-side HMAC digest from an Edge Function secret; persist no raw phone in rate-limit events and do not use a fast unsalted phone hash. |
| High | Website and POS payloads do not include explicit delivery selection type or catalog publication/version. | Update both request contracts before enforcing delivery-area pricing snapshots and stale-catalog confirmation. |
| High | Field-level schema draft uses several generic column names that do not match direct REST fields currently used by apps. | Preserve source-compatible names where sensible or add an explicit API adapter; never create SQL columns that the current apps cannot read. |
| High | Delivery source uses legacy task/offer/assignment field and state names that differ from the conceptual delivery contract. | Normalize through a versioned API/data adapter and coordinated rollout; do not rename a live status in isolation. |
| High | Order API board query selects legacy tax/service/tip columns while GST/tax has been deferred from V1. | Remove unused legacy fields from the read DTO/query; do not create tax tables/columns just to satisfy a stale select list. |
| High | Rider return UI wording currently asks Rider to confirm that food has physically been returned, while owner decision gives the Rider authority only to report/choose return and gives Cashier/Manager the physical receipt confirmation. | Correct wording and map return intent separately from staff physical receipt confirmation. |
| High | Admin frontend currently grants Admin-panel access to owner, admin and manager. This conflicts with confirmed Manager no-Admin policy. | Change the Admin route guard and deny Manager at staff-admin API/database layer before release. |
| Medium | Admin performs multi-request direct REST CRUD for catalog/settings, and has deletion buttons guarded by UI checks. | Move compound writes and protected administration into transactional, role-checked commands. UI checks and pre-delete lookups are not security boundaries. |
| Medium | POS polling/order reads and Rider own-job reads can be direct RLS-protected Data API calls; routing every refresh through Edge Functions would consume invocation quota unnecessarily. | Use Data API reads with pagination/RLS for frequent reads; keep Edge Functions for protected commands. |

## 3. Customer website checkout contract (observed)

The active website entrypoint contains the checkout logic. It collects:
- Customer name and phone number.
- Delivery/takeaway mode.
- For delivery, full address and a selected listed area or Not Listed choice.
- Notes and selected product/deal lines.

The website request currently sends:
- source = website
- a sessionStorage-backed idempotency key
- fulfillment_type = delivery or pickup
- customer.name and customer.phone
- payment_method = cod
- delivery.address, delivery.area_id and delivery.area_name
- product or deal IDs, quantities and selected product modifiers/choices

Observed safety/reliability behavior:
- The browser validates phone length as 10–13 digits after removing punctuation, but does not verify phone ownership with OTP.
- The website stores a pending order payload and idempotency key in sessionStorage; an identical retry reuses that key. This is useful for safe retry and must be preserved.
- The website keeps the cart when the order API returns an error.
- Delivery selection is represented by area_id/area_name; there is no explicit selection_type field today.
- The request does not include catalog publication ID/version.
- The website sends no delivery fee amount, which is correct: the backend must calculate it.

Required changes before the new Production contract:
1. Add explicit delivery.selection_type = listed_area or not_listed; NULL area_id must not imply Not Listed.
2. Include the catalog publication/version used for order calculation. The server still calculates prices from the published snapshot.
3. Map stable RATE_LIMITED response and Retry-After into helpful checkout text while preserving the cart and idempotency key.
4. Keep phone normalization consistent between browser validation, Edge HMAC generation and server order validation.

## 4. Owner-confirmed customer ordering limit

The owner explicitly set these rolling limits for customer website ordering:

| Rolling window | Maximum newly committed orders per normalized customer phone |
|---|---:|
| 1 minute | 3 |
| 10 minutes | 3 |
| 1 hour | 15 |

These caps apply only to `source=website`; POS, POS delivery and authenticated staff-created order sources are exempt. The 3-per-10-minute cap mathematically implies the 3-per-minute cap is not normally the tighter one, but record/enforce all three explicitly. The 15-per-hour window is independently important.

### Identity and scope

- The current website requires a customer phone number, so the primary rate-limit subject is the server-normalized phone number.
- The present website does not verify phone ownership. The rule therefore limits orders per normalized phone number entered, not a proven natural person. Do not describe this as identity verification or claim that phone switching cannot bypass it.
- Do not add OTP/SMS authentication in this change; that would require a separate UX, provider, deliverability and possible cost decision.
- Apply this quota ONLY to customer website submissions (`source=website`). POS orders are exempt, including POS delivery orders that use the same Order API. Authenticated staff-created phone/WhatsApp/manual/third-party orders are also exempt. Do not gate POS on the website phone counter. Universal idempotency protection remains required for Website and POS.
- IP is not the person identity. The current Edge Function reads cf-connecting-ip as a best-effort secondary signal and ignores X-Forwarded-For. Do not rely on IP for the per-person cap or add a hard shared-IP block until the hosted ingress header is tested for spoofing and shared-network effects.

### Exact counting semantics

Count successful, newly committed customer website orders only, not failed attempts. POS and staff-entered sources are exempt from this quota but must still be idempotent:
- A new order consumes one slot only when the order and its rate-limit event commit in the same database transaction.
- Invalid JSON, invalid phone, invalid cart, unavailable product, failed price/area validation or any rolled-back order does not consume the customer-order quota.
- A retry with the same idempotency key and the same canonical request returns the already-created order and does not count again.
- Reusing an idempotency key with a different request returns a conflict and does not create another order.
- A different idempotency key represents a new order and consumes a slot after successful commit.
- Rate checks use database time and sliding rolling windows, not calendar minute/hour boundaries.
- If one or more windows are exceeded, return the maximum wait remaining among the exceeded windows as Retry-After seconds. Return a stable 429 code such as RATE_LIMITED.
- Concurrent order submissions for the same phone must serialize on a database transaction lock so two simultaneous requests cannot both pass a count check and exceed a cap.
- The event insert must roll back if any later order/item/delivery-task write fails.

### Required implementation shape

1. Website submits customer phone and its stable idempotency key. Authenticated POS submits its own stable idempotency key derived from the local order ID; other staff sources use a stable command key.
2. Order Edge Function computes phone HMAC context only for `source=website`; never apply or require the website quota context for POS or other staff-created sources. Do not persist raw phone/IP in limiter records; do not store an unsalted SHA-256 of phone.
3. Edge Function invokes one service-role-only order-creation RPC. Strip/reject any browser-supplied internal rate context.
4. Inside the same transaction, the database:
   - checks the existing order idempotency record first for every source and returns an exact replay without repeating any write;
   - only for source=website, obtains an advisory transaction lock derived from the phone HMAC digest, counts website rate events newer than now minus 1 minute, 10 minutes and 1 hour, and denies if a cap is met;
   - POS and authenticated staff sources bypass the website quota check and event insert;
   - validates and creates order/items/delivery task using server-side prices and fees;
   - inserts one website rate event linked uniquely to the created order before commit only for a website order.
5. A unique website rate event per order prevents duplicate counting. HMAC key version is stored with the digest; key rotation must support a dual-key grace period at least as long as the longest window (one hour) so a rotation cannot reset a customer's active allowance.
6. Keep the private event table inaccessible to anon/authenticated. Grant the limiter helper only to the server transaction that needs it. Do not create a public limiter RPC callable directly by browsers.
7. Remove the current separate pre-order limiter RPC call once the atomic order command is implemented; the API will then do one order RPC per website submission instead of a rate-check RPC followed by the create-order RPC.

### Suggested private event table

app_private.website_order_rate_limit_events:
- order_id uuid PRIMARY KEY / UNIQUE FK to the committed order
- restaurant_id uuid NOT NULL
- branch_id uuid NOT NULL
- phone_subject_digest bytea NOT NULL
- digest_key_version smallint NOT NULL
- occurred_at timestamptz NOT NULL DEFAULT database clock
- optional client_ip_digest bytea NULL, only if ingress trust is proven and a separate abuse policy is approved

Index: (phone_subject_digest, occurred_at DESC). The event is append-only and retained for 48 hours (longer than the one-hour enforcement window, allowing diagnosis without indefinite pseudonymous tracking). Delete expired event rows in bounded batches; no continuous worker is required for correctness.

A separate short-term request-attempt throttle may be considered for malformed traffic after ingress/IP trust is proven. It is not the order quota and must not silently consume one of the customer's 3/10m or 15/hour successful-order slots.

### Important Free-plan cost caveat

Every request that invokes the Order Edge Function still counts toward the Supabase Edge Function invocation quota, including a 429 response. This customer quota reduces committed order writes and duplicate business processing; it cannot shield the Edge Function invocation allowance from a volumetric flood. Protect the invocation allowance by avoiding duplicate Edge calls, retaining client idempotency, caching reads, minimizing function count and using upstream/platform mitigation if there is measured abuse.

## 5. POS source contract (observed)

The POS creates customer delivery orders through the shared Order API with:
- source = pos
- idempotency key derived from the local POS order ID
- fulfillment_type = delivery
- customer.name and customer.phone
- payment method
- delivery.address, area_id and area_name
- product/deal identifiers, quantities and modifiers

The POS requires a signed-in staff session before submitting a delivery order, and keeps local order data if the cloud submission fails. This retry-safe local-order behavior must be retained.

Source gaps:
- It does not send explicit delivery.selection_type.
- It does not send the catalog publication/version used to price the offline/local order.
- The proposed owner-confirmed stale-catalog hold therefore is not yet implemented in this request contract.
- The POS currently normalizes selected area names/IDs locally; the server must still validate exact branch ownership and calculate the fee.
- Do not apply the public guest phone quota to staff source=pos without a separate decision; counter/POS operations are authenticated staff commands and are not the same abuse surface.

Required changes:
- Add explicit selection_type.
- Add publication ID/version captured when the local order was created.
- On stale price/availability, retain local order and require explicit cashier/manager confirmation; after confirmation use a new idempotency key bound to the confirmed revision.
- Server validates authenticated staff, active role and branch; never trust local totals.

## 6. Admin source contract and schema-name reconciliation

The current Admin app reads/writes Supabase REST tables directly. Names in the field-level proposal must be adjusted to the current data/API contract or an explicit adapter must translate them.

Observed current names include:

| Domain | Current source fields / contracts | Field-level draft difference |
|---|---|---|
| user_roles | role, user_id, branch_id, is_active, created_at, created_by | role_key in proposal |
| user_profiles | id, full_name, phone, is_active | user_id and display_name in proposal |
| categories | name_en, name_ur, legacy_id, sort_order, is_active, image_current_path, image_previous_path | name / name_ur / image_asset_id |
| subcategories | category_id, name_en, name_ur, legacy_id, sort_order, is_active | name / name_ur |
| products | category_id, subcategory_id, name_en, name_ur, description_en, legacy_id, featured, sort_order, is_active, is_available, image_current_path, image_previous_path, image_extension, image_previous_extension, image_published | name / description / is_featured / image_asset_id |
| product_variants | product_id, legacy_id, size_key, size_label, price, sort_order, is_active, is_available | variant_key and label |
| deals | category_id, title, title_ur, description_en, description_ur, bundle_price, featured, sort_order, is_active, is_available, image_path, image_previous_path, metadata | display_category_id / generic description and image_asset_id |
| deal_components | component_type, ref_type, product_id, product_variant_id, pool_subcategory_id, size_key, sort_order, quantity, price_delta, display_name, volume_key, description_phrase, description_phrase_ur, metadata | component_kind / fixed_* names |
| drink_options | product_variant_id, display_name, display_name_ur, volume_key, volume_ml, is_active, sort_order | Not fully represented in generic modifier proposal |
| delivery_areas | name, delivery_fee, branch_id, restaurant_id, sort_order, is_active | fee/name are close but snapshot/API labels need compatibility |
| restaurant_settings | setting_key, value_json, is_public, description, branch_id | Generic settings not yet mapped to typed domain settings |

Decision for schema implementation:
- Preserve the names/semantics needed by existing clients initially unless there is a compelling security/integrity reason to change them.
- Where a rename or normalization is needed, introduce a versioned adapter and coordinated Preview rollout; do not create a new database with generic names while the current app expects legacy columns.
- Do not copy retired demo-era identifiers into new business concepts without checking whether they are internal compatibility contracts.
- Current Admin direct REST CRUD is multi-step and may partially succeed. Production should route compound changes through atomic server commands and preserve Admin-compatible response DTOs during migration.

## 7. Order and order-history schema mismatch

The active POS and Order API currently use a legacy-shaped order projection including:
- order_number, local_order_id, source, source_reference, fulfillment_type, status
- customer_name, customer_phone, customer_email
- delivery_address, delivery_area_id, delivery_area_name_snapshot, delivery_area_fee_snapshot, delivery_instructions
- subtotal, discount_amount, delivery_fee, total, payment_status, payment_method_summary
- placed_at, created_at, updated_at and lifecycle timestamps
- cashier_id and other optional POS operational references
- order_items with product/variant/deal identifiers, item name/variant/price snapshots, modifiers and components

The field-level draft used customer_name_snapshot, delivery_area_label_snapshot and generic snapshot naming. Align the exact REST projection and API DTO before DDL. Keep immutable snapshots, but use source-compatible column aliases or adapter fields as needed.

The Order API GET board currently selects legacy tax_amount, service_charge and tip_amount columns. GST/tax is deferred from initial Production schema. Remove unused tax/service/tip selections from the API read projection and POS display contract; do not add tax structures merely to satisfy an obsolete query. Verify any real service-charge/tip feature separately before deciding to retain it.

The Order API board query uses the signed-in user's JWT for REST reads. Branch isolation must be enforced by RLS even if a query omits an explicit branch filter; UI/API branch selection is not a security boundary.

## 8. Delivery source and state-name reconciliation

Current code and Demo schema use:
- delivery_tasks.id and delivery_task_id as foreign-key field name in offers/actions
- delivery_task_offers.status values such as offered, plus offer_round, offered_at, expires_at and rider_user_id
- task statuses including dispatch_pending, offering, assigned, accepted, arrived_at_restaurant, out_for_delivery and failed
- delivery_tasks fields such as address_snapshot, area_name_snapshot, delivery_fee_snapshot, dispatch_started_at, assigned_at, picked_up_at, out_for_delivery_at, delivered_at, failed_at, failure_reason, return_reported_at and return_confirmed_at
- delivery_assignments fields including status, is_current, assigned_at, accepted_at, arrived_at, picked_up_at, delivered_at, ended_at and end_reason
- rider_profiles fields including user_id, branch_id, rider_code, display_name, phone, availability_status, accepting_jobs, last_seen_at and is_active

The conceptual delivery contract uses clearer normalized names like task_id, awaiting_assignment, return_pending_confirmation and returned. These semantics are right for the owner decision, but existing frontends and Edge Functions depend on the current names. Before SQL:
1. Choose the canonical database status set and explicitly map each current status/action to it.
2. Use a versioned delivery API response/action adapter if changing field names.
3. Keep offer.status and task.status distinct.
4. Enforce the 60-second cutoff inside accept RPC using database time; Rider's client countdown is display only.
5. A rejected/expired offer returns the task to POS for manual reassignment; do not auto-dispatch.
6. Rider return intent must be a distinct report/command, not physical receipt confirmation. Cashier or Manager confirms physical receipt.
7. Rider UI currently prompts the user to confirm they have physically returned the order when selecting return_reported; revise this copy to say they are choosing/reporting a return and must hand the order to staff. The separate confirm_return action is for authorized Cashier/Manager only.
8. The current delivery Edge Function action allowlist includes assign, accept, arrive, picked_up, delivered, reject, failed, return_reported and confirm_return, plus accept_offer/decline_offer. The delivery RPCs must enforce role/branch/ownership for every action; do not rely only on the allowlist.

## 9. Staff/Admin role contract mismatch

- The Admin UI currently defines its allowed Admin-panel roles as owner, admin and manager. This conflicts with owner-confirmed Manager POS-only/no-Admin access.
- The Staff Admin Edge Function currently enforces Owner-only staff invitations and role changes. This remains a deliberate least-privilege rule in the project handoff pending a separate owner decision; do not broaden it automatically just because Admin has full general business access.
- Staff API responses and user_profiles field names currently use full_name and role. Keep compatibility or add response mapping.
- The role matrix must be enforced inside database/API commands and RLS. Admin UI route guard alone is insufficient.
- User-editable Auth metadata must never grant business permissions.

## 10. Catalog/API publication and cache mismatch

The website and POS use catalog schemaVersion 2 arrays with keys such as categories, products, productVariants, subcategories, deals, dealComponents, modifierGroups, modifiers, modifierPriceRules, modifierGroupAssignments, deliveryAreas and drinkOptions.

The current Catalog Edge Function builds from mutable data tables and does not enforce an approved immutable publication pointer. The field-level proposal includes immutable menu_publications/current pointer. Required rollout:
1. Implement draft/publish/rollback behind the versioned catalog API.
2. Return an explicit publication ID/version and checksum in the payload.
3. Update website/POS adapters to accept the new version while old API contract is still supported.
4. POS writes the local order's exact publication ID/version; server detects price/availability changes and holds for explicit confirmation.
5. Only then switch the active catalog API payload version; preserve the previous POS cache until the new cache is fully staged and atomically activated.

No code currently proves the owner-confirmed stale POS price hold is implemented end-to-end.

## 11. Immediate consistency fixes before SQL authoring

1. Replace the Demo-only attempt limiter with the owner's 3/1m, 3/10m and 15/1h successful-order caps, atomically in the central customer order-creation transaction for `source=website` only. POS and staff sources bypass this quota but still use idempotency.
2. Update the field-level schema names or add adapters for existing Admin/POS/Rider columns.
3. Add explicit delivery selection_type to website/POS payloads and server DTO.
4. Add catalog publication/version fields to website/POS requests; implement stale-catalog hold on POS.
5. Align order response projection, remove stale tax/service/tip selects while tax is deferred.
6. Align delivery task/offer/assignment field and state names with the approved lifecycle contract.
7. Correct Rider return prompt and pass bounded reason data through return-report action.
8. Restrict Manager from Admin frontend and backend; confirm the role assignment policy remains Owner-only unless owner decides otherwise.
9. Verify RLS policies and grants cover every direct REST query; especially branch-scoped order reads and Rider's own offers/assignments.
10. Keep the four-function layout. Frequent reads stay on RLS-protected Data API; command writes go through the existing domain function and one atomic transaction.

## 12. Test matrix required before Preview / Production

### Ordering limit
- Fourth successful order within 1 minute from the same normalized phone is rejected with 429.
- Fourth successful order within 10 minutes is rejected.
- Sixteenth successful order within 1 hour is rejected.
- A later request succeeds when all exceeded rolling windows have expired.
- Phone formatting variants (+92..., 03..., 3...) normalize to the same subject.
- Different phone subjects do not share counters.
- Exact idempotent retry returns the original order and consumes no extra slot.
- New idempotency key creates a new counted order only after commit.
- Invalid payload, invalid area, missing price, failed database write or rolled-back order consumes no successful-order slot.
- Concurrent same-phone requests cannot exceed any cap.
- HMAC digest is stable across normal requests and no raw phone/IP appears in rate-limit table or logs.
- A 429 includes Retry-After and preserves website cart/pending idempotency key.
- Confirm staff POS source is not accidentally classified as public website guest order.

### Source/schema compatibility
- Verify exact REST projections for Admin, POS, Rider and Edge Functions against the proposed schema.
- Verify new catalog contract and version compatibility before switching active response.
- Verify delivery selection_type and all area/default fee tests.
- Verify offer accept exactly before and at/after expires_at with concurrent requests.
- Verify Rider cannot access another rider's offer, assignment, task or address.
- Verify Cashier and Manager can confirm physical return only for a return-pending task; Rider cannot confirm receipt.
- Verify role route and server permission tests, including Manager directly requesting Admin endpoints.
- Verify no tax/GST schema is introduced in V1.
- Verify Edge Function invocation count, Data API reads, egress and Realtime messages using a realistic Preview load profile.

## 13. Safety status

This is a source audit and design update. The archived Demo SQL was read for reference only. No Production SQL, application source code, migrations, Supabase project settings/secrets, deployed Edge Functions, Storage objects, Auth users, Vercel project or live deployment were modified.

The source mismatches listed above must be reconciled before initial Production migration and Preview rollout. The exact ordering caps are approved by the owner; rate-limit enforcement has not been deployed to Production by this audit.


### Universal order idempotency across Website and POS

The website phone quota is source-specific; order idempotency is not. Website and POS must both use stable idempotency keys, server-generated canonical request fingerprints, a database unique constraint scoped by restaurant/branch/source/key, and transaction-safe replay handling. Website preserves its pending key/payload in sessionStorage. POS preserves the key derived from localOrderId through retry/reload/offline recovery. Same key + same canonical request returns the existing order without repeating child writes or side effects; same key + changed request returns 409. POS, including POS delivery, bypasses the website phone quota entirely while keeping all idempotency and database integrity controls.



### Website quota scope and universal order idempotency

The owner has explicitly clarified that the 3 / 1 minute, 3 / 10 minutes and 15 / 1 hour limits apply only to customer website checkout submissions (source=website). POS is exempt even when a delivery order goes through the same Order API. Authenticated staff-created order channels are also exempt. Do not put a phone-quota check before common order creation without a verified website-only source boundary.

Idempotency is universal: Website retains the stable sessionStorage key/payload; POS retains its stable key derived from localOrderId. Both go through the same transaction-safe uniqueness and canonical fingerprint contract. Exact replay returns the original order; changed payload under the same key returns 409; neither creates duplicate order items, delivery task, status event, payment, notification or other side effect. POS continues to be accepted regardless of the website phone quota counters.
