# Flame Chick Production — Application / Database Contract Map

**Status:** Source-derived contract map and Production design recommendations  
**Prepared:** 2026-11-20  
**Branch reviewed:** work/production-source-audit  
**Production changes:** None

## 1. Why this map exists

The Production schema must serve four existing applications and four Edge Functions without breaking their established workflows. This document records the current source contracts observed in the review branch and distinguishes them from the recommended Production contract.

It is not a final SQL schema. All identifiers and API request fields must be checked against the approved Production ERD before migrations are authored.

## 2. Application responsibilities and current data flows

### Customer website

**Current source files:** apps/flame-chick-website/index.html, js/config.js, js/catalog.js

- Loads the public catalog through the catalog Edge Function.
- Catalog loader currently requires schemaVersion 2 and validates: settings, categories, products, productVariants, subcategories, deals, dealComponents, modifierGroups, modifiers, modifierPriceRules, modifierGroupAssignments, deliveryAreas and drinkOptions.
- It performs a health check, checks the published/version state, downloads the catalog and uses a version-aware browser cache.
- Customer order request includes source=website, fulfillment_type, customer name/phone, notes, item IDs/quantities/options, and delivery address/area ID/name for delivery.
- Website currently represents Not Listed through a null/empty area ID plus a display name; Production should add the explicit selection discriminator described in delivery-pricing-contract.md.
- Website currently supports delivery and takeaway in this order flow; delivery fee display is based on the listed area fee or DefaultDeliveryFee for Not Listed.
- Do not expose raw customer, rider, staff or private operational rows to the website.

### POS

**Current source file:** apps/flame-chick-pos/index.html

- Requires catalog schemaVersion 2 and a fixed array contract matching the website catalog loader.
- Uses IndexedDB stores for catalog/menu/categories/settings, local orders and retry queues.
- Performs catalog health then catalog download, confirms matching version IDs, adapts the snapshot, and replaces the local menu.
- Current refresh clears existing menu/category/delivery-area stores before writing replacement data. A failure during writes could leave the last cache lost or incomplete. Production implementation must stage a full version then atomically switch the active-version pointer.
- POS submits product_id + variant_id, or deal_id + deal choices. It does not trust the displayed amount as the authoritative database price.
- POS creates cloud delivery orders through the order API with a deterministic idempotency key based on localOrderId. It records local order state and retries pending delivery-order submission.
- Current POS explicitly leaves takeaway and dine-in orders local rather than submitting them through this cloud delivery path. Preserve/clarify that boundary in the Production operating design; do not assume all POS order types are cloud-synced.
- POS Realtime currently subscribes to branch-filtered orders and delivery_tasks, but delivery_task_offers and delivery_assignments subscriptions do not specify a branch filter. Production must restrict these events to the POS branch (e.g. add reliable branch scope to those rows or use a branch-scoped event mechanism) and keep the agreed 15-second polling fallback.
- POS currently converts missing variant prices and area fees to zero in its adapter. Production adapters must distinguish unknown/unpriced from explicit zero and reject invalid published values.

### Admin

**Current source file:** apps/flame-chick-admin/app.js

- Authenticates with Supabase Auth, checks user_roles, resolves the Flame Chick restaurant and active branch, and loads order/catalog/settings data.
- Reads categories, subcategories, products, variants, deals, deal components, drink options, delivery areas and restaurant settings through direct PostgREST calls.
- Performs category/product/variant/deal/component/delivery-area writes as multiple direct REST requests from the browser. The current product and deal workflows can be partially written if a later request fails.
- Uses a dashboard RPC for reporting.
- Uses the staff-admin Edge Function for staff invitations and role activation. This endpoint is owner-only for invitations/role changes in the current code.
- Current Admin has basic category/product/variant/deal/area CRUD, but lacks full modifier group editing, complete existing deal-component editing, scheduled deal configuration, unpriced drafts, and a robust draft/preview/publish/rollback workflow.
- Production recommendation: all multi-record catalog commands (create/edit product+variants, deal+components, publish, rollback, fee configuration) should be server-side transactional commands with role and branch authorization. A UI button is never a security control.

### Rider portal

**Current source file:** apps/flame-chick-rider/index.html

- Authenticates the rider, validates their active rider role/profile, and updates rider presence through delivery API.
- Uses rider-specific Realtime filters on delivery_task_offers and delivery_assignments by rider_user_id.
- Refreshes rider jobs and performs accept/decline offer and delivery lifecycle actions through the delivery Edge Function.
- Production must preserve rider-only access to offers, current assignments and the minimum order/address information necessary to fulfil active delivery jobs.
- Rider must not be able to browse branch-wide customer orders, other riders' jobs, push subscriptions or private staff data.

## 3. Edge Function contracts observed

### flame-chick-catalog

- Reads restaurant, categories, products, variants, subcategories, modifier groups/options/pricing, deal rows/components, delivery areas, drink options and selected public settings.
- Returns a schemaVersion 2 catalog snapshot plus a health response containing published state/version ID.
- Current published state is calculated from restaurant active state and the presence of products/variants; it does not enforce a separate owner-approved publication pointer.
- Current catalog query reads delivery areas by restaurant without filtering to one branch.
- Current public settings allowlist contains DefaultDeliveryFee alongside other public settings. Production should expose a narrow, branch-aware delivery-pricing projection and only explicitly public fields.
- Production catalog should read an immutable publication snapshot and its current pointer, not reconstruct public output from mutable draft rows.

### flame-chick-order-api

- For website orders, rate-limit check is performed before order creation.
- For non-website sources, verifies a staff Auth user and an allowed staff role before order creation.
- Calls hfp_create_order for order creation and hfp_update_order_status for staff state changes.
- The database RPC must remain the source of truth for product/deal availability, price, selection validation, delivery fee, idempotency and branch authorization.
- Production order RPC must validate the explicit delivery selection type and resolve fees from server-side records only.

### flame-chick-delivery-api

- Validates rider role/profile for presence and rider-scoped actions.
- Calls hfp_manage_delivery for manager/staff dispatch and delivery lifecycle commands.
- Calls hfp_accept_delivery_offer / hfp_decline_delivery_offer for rider offer decisions.
- Manages rider push subscriptions through privileged server operations.
- Reads delivery tasks, offers, assignments, order summaries and rider profiles.
- Production must keep every action role-checked and branch-scoped, with idempotent transitions and strict validation of task/offer ownership.

### flame-chick-staff-admin

- Uses verified actor identity and service-side operations.
- Resolves branch ownership and checks owner role before inviting users or changing role activation.
- Uses hfp_manage_staff_role for role assignment and activation.
- Production must not treat client-supplied branch/user/role identity as authoritative; service function derives actor from verified Auth and verifies branch membership.

## 4. Database domain map

| Domain | Primary entities | Main consumers | Security/consistency requirement |
|---|---|---|---|
| Tenant | restaurants, branches | All apps/functions | Every business record belongs to Flame Chick; branch references must belong to same restaurant |
| Catalog navigation | categories, subcategories | Website, POS, Admin | Public response includes active published rows only; Admin can draft/reorder/archive |
| Products | products, product_variants | Website, POS, Admin, order RPC | Stable IDs, explicit price vs unpriced, no hard deletes after order reference |
| Customization | modifier_groups, modifiers, modifier_group_assignments, modifier_price_rules | Website/POS, Admin, order RPC | Server validates assignment and selection min/max; no client price trust |
| Deals | deals, deal_components, future typed choice groups | Website/POS, Admin, order RPC | Atomic editing; fixed refs/choice pools use real foreign keys |
| Menu publication | menu_publications, current pointer, publication audit | Catalog API, Admin, POS/website | Immutable approved version; atomic publish/rollback; checksum and schema version |
| Delivery pricing | delivery_areas, branch_delivery_settings | Website, POS, Admin, order RPC, Rider | Listed fee vs explicit Not Listed default; branch scope; immutable fee snapshots |
| Orders | orders, order_items, order_item_modifiers, order_item_components | Website, POS, Admin, Rider via task summary | Server price calculation; idempotency; immutable snapshots; restricted customer PII |
| Payments | payments, register/payment records if confirmed | POS, Admin/order RPC | Idempotent payment transitions; least-privilege financial reads |
| Dispatch | delivery_tasks, delivery_task_offers, delivery_assignments | POS, Admin, Rider, delivery API | No double assignment; strict rider scoping; branch-filtered realtime |
| Rider | rider_profiles, rider_locations, rider_status_history, rider_push_subscriptions | Rider, delivery API, Admin | Own-record access; sensitive location/push data private; retention policy |
| Staff/access | user_profiles, user_roles, staff_role_audit | Admin, POS, Rider/functions | Server-controlled roles; no user-editable Auth metadata authorization |
| POS operations | pos_devices, register_sessions, restaurant_tables, cash_register_movements | POS, Admin | Branch-scoped permissions; preserve offline-local behavior where applicable |
| Settings/media | restaurant_settings or typed settings, Storage objects | Website, Admin, catalog API | Explicit allowlist; private drafts; public media only after publication |
| Reliability | event_outbox, rate-limit data, audit events | Edge Functions/jobs | Idempotency, bounded retries, redacted logs, replay protection |

## 5. Contract changes required for Production

1. **Catalog publication:** replace the current "active products exist" published check with a true publication pointer and immutable snapshot.
2. **Catalog branch scope:** include the selected branch context where prices/areas/availability are branch-specific. Do not mix areas or branch fees into one cross-branch snapshot.
3. **Delivery selection:** add delivery.selection_type = listed_area | not_listed. Do not infer Not Listed from null area_id alone.
4. **Delivery fee source:** server reads either delivery_areas.delivery_fee or branch_delivery_settings.not_listed_delivery_fee; no fee amount accepted from client.
5. **Order catalog version:** POS includes the publication version used for its offline cart. The order command must detect stale versions and apply the owner-approved stale-price policy; no silent re-pricing.
6. **Offline POS cache:** stage catalog records under a new version and atomically activate only after validation/write completion. Keep the previous valid version on failure.
7. **Admin transactions:** replace sequential browser REST mutations for multi-row catalog changes with transactional server commands. Use revision checks to prevent concurrent edits from silently overwriting each other.
8. **Unpriced drafts:** Admin can save a draft with no price; publish validation blocks an active sellable product/variant/deal if its required price remains unknown.
9. **Modifiers and deals:** provide complete Admin editing for modifier groups/rules and every deal component/choice; validate all records transactionally.
10. **Schedule configuration:** add structured schedule entities only for confirmed recurrence/branch/channel needs; schedules must be validated server-side.
11. **RLS and grants:** every exposed table RLS-enabled; sensitive internal tables moved to private schema or denied client access; grants and function EXECUTE permissions reviewed independently from RLS.
12. **Realtime:** Rider subscriptions remain rider-targeted. POS subscriptions must be branch-specific for orders, tasks, offers and assignments. Keep 15-second POS polling fallback and avoid Order History realtime.
13. **Audit:** price, menu, availability, delivery fee, staff role, publication and rollback changes must create protected audit events.
14. **Backups:** database and Storage backups are separate; encrypted, retained, checksummed and restore-tested.

## 6. Open design dependencies (do not guess)

- **RESOLVED by owner:** stale offline POS orders that would change price/availability are held with CATALOG_VERSION_STALE and require explicit authenticated cashier/manager confirmation before resubmission. No silent repricing; audit the confirmation. Detailed implementation requirements are in performance-security-operations-plan.md.
- Whether Not Listed needs a separate required locality/mohalla input in addition to the full address; the user has confirmed the fee behavior, not this extra field.
- Whether menu visibility/price differs by branch or channel in the first release.
- Whether deals need curated choice lists, category/subcategory pools, substitutions and surcharges.
- Which roles can edit prices, publish, rollback and change delivery defaults.
- Whether inventory/stock is part of the first Production version.
- The user explicitly deferred GST/tax; it is excluded from the initial schema.

## 7. Review boundaries and status

- This map is derived from the checked-in source on work/production-source-audit.
- It records current source behavior and proposed Production changes; it does not claim these changes are deployed.
- The current production Supabase project was previously inspected read-only and had no application business schema, users, buckets or Edge Functions, apart from its already-applied security baseline migration.
- No Production database, functions, secrets, Storage, Vercel configuration or live deployment has been changed while preparing this map.
- Next: refine remaining role/publication/deal/schedule/branch-scope decisions, then prepare a field-level schema specification and isolated migration test plan. The stale-offline-price policy is already confirmed.

## Owner-confirmed delivery lifecycle contract (2026-11-20)

| Event | Initiator | Result | Required enforcement |
|---|---|---|---|
| Offer created | Cashier/Manager | One rider-targeted pending offer, expires in 60 seconds | Server records offered_at/expires_at; rider-only visibility |
| Rider rejects | Addressed Rider | Offer rejected; task returns to POS awaiting manual reassignment | Immutable offer attempt; no automatic next rider |
| No response | System at 60 seconds | Offer expired; task returns to POS awaiting manual reassignment | Accept command rejects at/after expiry; idempotent expiry worker/event |
| Rider accepts | Addressed Rider | Offer accepted; one current assignment activated | Atomic compare/lock; prevent two riders accepting |
| Pickup / out for delivery | Assigned Rider | Task advances through delivery | Rider/task ownership + valid transition |
| Delivery succeeds | Assigned Rider | Rider marks delivered; order completes immediately | One transaction updates task/order and appends audit events |
| Delivery fails / rider chooses return | Assigned Rider | Return pending physical confirmation | Rider can report failure/return intent, not receipt |
| Returned order physically received | Cashier or Manager | Task closes as returned; order receives distinct returned/failed terminal state | Transactional confirmation, actor/role/time/reason/correlation audit |

POS is the reassignment control point after rejection/expiry. A later offer is a new attempt; never overwrite earlier attempts. Realtime events should update the POS dispatch queue and only the addressed Rider portal. Keep POS polling fallback and normal-fetch Order History behavior. A missed timeout event must not make an expired offer acceptable.

## Free-plan invocation and rate-limiting contract (2026-11-20)

See [production-field-level-schema-v1.md](./production-field-level-schema-v1.md) for the full budget and rate-limiting design. Application consequences:

- Keep four domain Edge Functions (catalog, order, delivery, staff-admin); route approved actions through them rather than creating one Function per CRUD operation.
- Keep frequent POS polling (15 seconds) and Rider own-job fetches on RLS-protected Data API reads where safe. Do not route each poll through Edge Functions.
- Use targeted Realtime for operational events; do not add it to Order History or reports.
- Combine catalog health/version and published snapshot requests into one response when the catalog contract can be upgraded safely. Preserve the POS's last-known-good IndexedDB catalog during refresh.
- High-risk guest order creation, dispatch and staff mutations may use atomic Postgres-backed rate-limit buckets. Auth endpoints keep Supabase Auth's native limits. Rate-limit 429s still count as Edge Function invocations, so this protects database/business operations rather than the invocation quota itself.
- Never trust browser-provided actor, role, branch, IP or phone identifiers. Hash rate-limit subjects with an HMAC secret in Edge Functions; do not persist raw IP/phone data in the limiter table.
- No Redis, continuously running worker or additional Edge Function is required for V1. Optional Turnstile/upstream WAF is a later response to measured abuse and needs a separate cost/security decision.

