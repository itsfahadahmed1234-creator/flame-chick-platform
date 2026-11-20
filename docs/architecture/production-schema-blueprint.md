# Flame Chick Production — Schema and Reliability Blueprint

**Status:** Draft architecture for review; not SQL and not approval to apply DDL  
**Prepared:** 2026-11-20  
**Targets:** Flame Chick Production, customer website, POS, Admin and Rider portal

## 1. Purpose and key decisions

The Production database is to support long-lived restaurant operations and let authorized staff make routine menu changes entirely through Admin. Adding a category, product, size, price, modifier, deal, schedule, image or availability change must not require SQL or a schema migration once the agreed feature model is installed.

This design uses:
- A normalized relational catalog as the editable source of truth.
- A validated, immutable catalog publication snapshot as the only menu read by customers and POS.
- Database-enforced ownership, pricing, selection and state-transition invariants.
- Server-side transactional commands for multi-record menu and order operations.
- Append-only order, audit and publication history.
- Narrow, branch-scoped access and private operational data.

The current menu baseline is recorded separately in current-menu-baseline.md. The earlier menu image is a capability reference only. Neither image is a request to seed data into Production.

## 2. Product and catalog entities

### Core restaurant / branch boundary

- restaurants: restaurant identity, slug, currency and timezone.
- branches: a restaurant's operational locations and branch-specific configuration.
- Every business entity belongs to one restaurant; branch-operated data additionally belongs to a branch.
- Branch-wide records and restaurant-wide records must be distinguishable. Nullable branch_id should mean restaurant-wide only when explicitly designed, not as a shortcut that weakens access control.

### Category and product hierarchy

- categories: the top-level menu sections shown in the menu/POS (e.g. Starters, Injected Broast, Wraps, Burgers). Name, translated name, description, image, sort order, active/archive state and display metadata are data, not code constants.
- subcategories: optional product filters nested under a category. They can be omitted when a category does not need them.
- products: sellable menu concepts, with stable ID, restaurant, category, optional subcategory, internal code, English/Urdu name and description, image references, sort order, featured flag, publication/active state and availability.
- product_variants: one or more customer-selectable forms/prices for a product (portion, size, volume, flavor, or another option). Labels and keys are data, not enums. For a single-price product, retain the current app's internal single REGULAR variant convention unless a better adapter-compatible contract is agreed.

The current published artwork presents Quarter, Half and Full Broast as three named items. It does not prove whether the current database represents them as three products or one product with three variants. The schema must support either; inspect actual catalog identities before migration/import.

### Price rules

- Store monetary values as numeric with an explicit restaurant currency context. Do not use floating point.
- A missing/TBD draft price must be represented as NULL or an explicit unpriced draft state, never silently converted to zero.
- An intentional free item is numeric zero and is distinct from missing price.
- Price fields on product variants, deal bundle prices and delivery fees must not have a silent zero default where zero would conceal missing configuration.
- A publish validator must reject a purchasable published product/variant/deal when its required price is unknown. It should report the precise offending records.
- GST/tax is explicitly deferred from the initial Production schema. Do not create tax-rule tables, tax-category fields, tax schedules, tax-line tables, rate engines or tax-calculation RPCs in this phase. Do not infer a GST rate from the menu image. Revisit GST later through a separately reviewed forward migration when the owner provides the applicable policy.

### Modifiers and reusable options

- modifier_groups: reusable selection groups, with translated labels, required/optional flag, selection mode, min/max selections, sort order and active state.
- modifiers: choices within a group, with translated labels, active state and pricing mode.
- modifier_group_assignments: links a group to products (and, if needed later, selected variants).
- modifier_price_rules: prices for an option when the price varies by selected product variant. Prefer a real product_variant_id FK over an unvalidated free-text size_key for Production.
- Validate min/max counts, assignment membership, uniqueness, active state and price mode in one server-side order command.

The reference image does not establish whether any particular flavor is a variant, modifier, or separate product. Admin must support these patterns without schema changes, but the actual product modelling convention should remain consistent and be confirmed during menu entry.

### Deals and bundles

- deals: title, translations, description, category/display group, image, bundle price, active/available/featured state and sort order.
- deal_components: ordered component groups belonging to a deal. A component can be a fixed product, fixed variant, required included item, or a customer-choice group. Each group has quantity, required state, selection min/max, label, and explicit surcharge/substitution rules.
- deal_component_choices: curated choices for a selectable group, each linked through typed foreign keys to a valid product/variant/option. Do not rely on a generic table-name plus arbitrary row-ID reference that cannot enforce a foreign key.
- A choice pool may optionally be restricted by a category/subcategory and required variant. Dynamic pools must be validated at order time.
- Deal creation and editing must be transactional: the deal is not publishable until all component rows validate and save successfully.
- The current Platter is a candidate fixed-component bundle. Its artwork lists nuggets, wings, fries and dips; confirm whether Fries and Dips are separate sellable catalog products or descriptive inclusions before configuring its final component graph.

### Deal schedules and channels

- deal_schedules: one-off date ranges and/or recurring local-time windows, scoped to the restaurant or a branch.
- recurring day selections should be structured/queryable, not encoded only in a label or arbitrary JSON.
- Store an explicit IANA timezone (the current app config uses Asia/Karachi) and define behaviour for overnight windows, schedule overlaps, effective dates and branch overrides.
- Support optional channel/fulfilment eligibility (website, POS, delivery, takeaway, dine-in) only through explicit data fields/relations.
- No menu-specific hardcoded schedule logic (e.g. Flame Hour) should be required.

The final policy for recurring schedules, branch scope, and channel availability remains to be confirmed. The example image alone is not enough to choose those rules.

## 3. Draft and publication architecture

### Required behaviour

Admin edits must not immediately change the menu a customer or POS is using. The public website and POS read only an approved published version.

Recommended lifecycle:
1. Admin edits the relational working catalog.
2. Admin requests validation and preview.
3. A server-side validator checks categories, products, variants, prices, modifiers, deal components, schedules, availability and media references.
4. It builds a canonical catalog snapshot and calculates a cryptographic checksum.
5. In one database transaction, the system inserts an immutable publication record and updates the restaurant's current-publication pointer.
6. The old publication remains immutable and retained for rollback.
7. A rollback changes the current pointer to a previously approved publication and records an audit event; it does not rewrite the old snapshot.

### Suggested publication entities

- menu_publications: immutable publication metadata, version number, catalog schema version, snapshot payload, checksum, created/published actors and timestamps, validation result.
- restaurant_catalog_state: one row per restaurant (and, if truly required, branch/channel) pointing to the current publication.
- menu_publication_audit: append-only draft/validate/publish/rollback events, actor, revision, publication version and safe details.

A single JSONB snapshot can be the initial storage choice if measured menu size fits. Retain chunked storage only if real payload-size/performance tests justify it. Do not add complex chunking just because the Demo implementation used chunks.

The catalog API's health response must report the actual current publication pointer/version. Its catalog response must read that exact immutable version, not rebuild output from mutable draft tables. It must return the same version/checksum in health and download calls.

### POS offline cache protection

The current POS:
- Requires catalog schemaVersion 2.
- Fetches health, then downloads the catalog and checks that the version IDs match.
- Stores a local IndexedDB cache.
- Clears the current menu/category/delivery-area stores and writes replacement rows in separate operations.

Production improvement required:
- Introduce version-keyed local catalog stores (or equivalent staging records).
- Download and validate the entire snapshot into a staged version.
- Commit all staged records and atomically switch one active-version pointer only after every write succeeds.
- Keep the last known-good version until the new version is fully committed.
- If download, validation, or IndexedDB writes fail, continue using the previous verified local version and show a clear stale/offline status.
- Store the publication version on each local order.
- Never convert a null/unpriced product price or unknown delivery fee to zero in the POS adapter. Treat missing required values as validation failure.

### API version compatibility

The current POS adapter only accepts schemaVersion 2 and requires arrays for categories, products, variants, subcategories, deals, deal components, modifier groups, modifiers, modifier price rules, assignments, delivery areas and drink options. It currently converts variant prices and delivery fees using Number(value) || 0, which can collapse missing values into a zero price/fee.

Any contract change must use an explicit catalog schema version and a staged compatibility rollout:
1. Define and test the next response contract.
2. Update POS and website adapters to understand it while the API still serves the old contract.
3. Deploy compatible app previews and test online/offline catalog refresh and order flows.
4. Only then switch the API's active response to the new version; retain a controlled compatibility window where needed.
5. Do not break offline POS clients simply because the server began returning a new schema version.

## 4. Orders, price snapshots and offline consistency

### Order entities

- orders: branch, order identity, customer/contact/address snapshots, fulfilment, source, status, totals, currency, payment state and lifecycle timestamps.
- order_items: product or deal reference plus immutable name/variant/price/quantity/discount snapshots.
- order_item_modifiers: immutable selected modifier and price snapshots.
- order_item_components: immutable deal component/selected product/variant/option snapshots.
- order_status_history and order_events: append-only operational history, with actor, timestamp and reason.
- payments: separate payment attempts/settlements/refunds with idempotency and provider references.

Historical orders must never be re-priced or renamed when the menu changes. Catalog references may be retained for traceability, but snapshots are the historical truth.

### Server-side calculation

The browser/POS must submit item IDs, quantities and selected option IDs; it must not be trusted for prices or totals. The server/database validates that the submitted items/options belong to the applicable publication and are eligible, then calculates subtotal, discount, delivery fee and total inside one transaction. GST/tax calculation is deferred from this initial schema phase and must not be inferred or silently introduced.

The current Demo order function:
- Reads live mutable products/variants/deals and uses their current prices.
- Writes zero tax amounts to order and item records; no GST calculation is present in that function.
- Contains a Demo manual-address/zero-delivery-fee path.
These behaviours must not be carried into Production unchanged.

### Offline POS stale-price policy — unresolved

The current POS saves local delivery orders and later submits product/variant/deal IDs when connectivity returns. The server then calculates against the current database prices. If a catalog price or availability changed while the POS was offline, the submitted local quote may not match the server's live price.

Production should store catalog_publication_id and the publication version on each local order and include it in the server request. The server must detect stale versions and must not silently charge a different price. A business policy is still required:
- Option A: reject/hold a stale offline order for cashier/manager review and explicit re-price confirmation before submission.
- Option B: honour the exact retained publication snapshot used when the local order was started, subject to availability/validity safeguards.
Do not implement silent re-pricing. This policy affects the order RPC and must be decided before Production order DDL is finalized.

## 5. Delivery and basic financial configuration

### GST / tax deliberately deferred

The user explicitly decided on 2026-11-20 to leave GST for a later phase and avoid complicating the initial schema.

- Do not create tax-rule tables, product/deal tax categories, tax schedules, tax-line tables, rate/effective-date engines or GST calculation RPCs in the initial schema.
- Do not invent a GST rate or tax treatment.
- Keep the initial order-money model focused on the required basics: item prices, quantity, subtotal, discounts only where confirmed, delivery fee and total.
- The current menu artwork says prices are exclusive of applicable GST. That statement is recorded as a business requirement to revisit before changing customer-facing checkout/accounting behaviour, but it does not authorize implementing a tax model now.
- When the user is ready, GST can be added through a separately reviewed forward migration and coordinated API/website/POS changes without rebuilding the catalog schema.

### Delivery fee model: listed areas + Admin-configured Not Listed default

The user confirmed the intended business rule on 2026-11-20:

- Admin maintains an explicit list of delivery areas/localities. Each active listed area has its own delivery fee in PKR.
- During checkout, the customer selects a matching listed area. The fee is the configured fee for that exact area.
- If the customer's locality is not in the list, the customer can explicitly choose **Not Listed / Other**. The fee for this selection comes from one default delivery fee configured in the Admin panel.
- The default fee is not a distance calculation, automatic geofence estimate, or client-entered amount. It is a controlled Admin setting.
- The Not Listed default is distinct from every listed area's fee and is not copied into listed-area rows.
- Both a listed-area fee and the default fee may intentionally be PKR 0, but zero is valid only when an Admin explicitly saves zero. Missing/unconfigured is not zero.

**Admin workflow**
- Add, edit, reorder, activate/pause and archive delivery areas; store a clear area name, optional Urdu name, explicit non-negative fee, sort order and branch scope.
- Maintain a separate DefaultDeliveryFee setting for Not Listed / Other.
- Show clear status when the default is not configured.
- Allow clearing/unsetting the default. When it is unset, Not Listed checkout is blocked with a helpful message; listed areas continue to work.
- A newly created area must require an explicit fee entry. Do not prefill a new area with zero; the Admin must deliberately enter 0 if delivery is free.

**Checkout and server-side enforcement**
- The browser may send a selected listed area ID, or an explicit Not Listed/Other selection plus a user-entered locality label where appropriate. It must never be authoritative for the fee.
- For a listed area, the order command verifies that the area is active and belongs to the selected restaurant and fulfilment branch, then reads the fee from the database.
- For Not Listed/Other, the order command explicitly recognizes that selection, loads the Admin-configured default fee from the correct restaurant/branch setting, and rejects the order if the value is unset or invalid. A missing area ID by itself must never imply Not Listed or zero fee.
- Do not accept a client-submitted fee, even if it matches what the browser displayed. The server retrieves the canonical fee and calculates the order total transactionally.
- Record which fee path was used (listed_area versus not_listed_default) and preserve the customer's locality/address separately from the fee class. A typed locality/mohalla for Other is recommended so the rider and manager can identify the destination; the full delivery address remains required.
- Snapshot the selected area/Other label and exact fee on the order and delivery task. Later Admin fee changes apply to new orders only and never reprice an existing order.
- A genuinely zero fee is allowed only when the Admin explicitly configured zero. Keep database NOT NULL/CHECK constraints for configured listed fees and non-negative defaults; represent an unset Not Listed default as NULL/unconfigured rather than DEFAULT 0.

**Scope**
- Delivery areas should be scoped to the restaurant and fulfilment branch. The default fee must use a deliberate scope aligned with the branch's area list. For the initial single main branch, one Admin-configured default can serve that branch. For future multiple branches, use a branch-specific default or an explicitly documented restaurant-wide fallback; do not let one branch's areas or fee leak into another branch's checkout/catalog.
- The public catalog may expose the active area names and their prices, plus the Not Listed default, because these are checkout pricing facts. It must not expose staff-only settings or internal configuration.
- Do not implement distance tiers, route/geofence pricing, minimum-distance or postal-code logic unless the owner later requests it.

**Existing source observations to address**
- Current Admin already has area CRUD and a separate DefaultDeliveryFee setting. It stores the default at restaurant scope (branch_id IS NULL) and areas against the selected branch. New-area fee input currently defaults to 0; change this to blank/required so a fee cannot accidentally become free.
- Current website already displays listed area fees and a Not Listed option, and blocks checkout when the default is unconfigured. It reads the default from public catalog settings.
- Current POS already resolves the typed exact area or the Not Listed default and blocks Not Listed when no default exists. However, its delivery-area fee adapter converts missing values to zero and it sends a null area ID with the display label. Production order RPC must use an explicit selection type, not infer Other solely from NULL area_id.
- Current catalog API returns DefaultDeliveryFee and area fee rows, but it reads all delivery areas for the restaurant without filtering to a specific branch. Once Production catalog is branch-aware, filter areas to the correct fulfilment branch or provide a safe branch-specific catalog.
- Current catalog and browser adapters use Number(value) || 0 in places. Remove those zero fallbacks for required fees; validate missing values as an API/catalog error.
- The archived Demo order function accepts a missing area ID and sets manual-address fee to zero. Never copy this Demo behaviour into Production.
## 6. Security and access boundaries

### Data access model

- RLS enabled on every exposed business table; default deny when no policy matches.
- Private operational tables and helper functions live in non-exposed schemas. Do not grant schema usage or table privileges to browser roles without a concrete requirement.
- Public catalog access should be through a narrow catalog API that returns an explicit, allowlisted DTO from the current published snapshot. Do not expose all columns of mutable products, settings or deal tables directly to anon.
- Admin edits should use authenticated, role-checked transactional API/RPC commands. Do not assume a hidden button is a security boundary.
- POS reads only published catalog data and branch-scoped operational data it requires.
- Riders read only their own offers, current assignments and delivery details required for an active job.
- Customer/guest order access must use a scoped order lookup token or an authenticated staff path; do not expose broad order search/list APIs to anon.
- No browser application receives a service-role/secret key.

### Tenant and branch isolation

- Use composite unique keys and foreign keys so a product cannot point to a category from another restaurant; a branch-scoped setting/area/order cannot point to a branch from another restaurant; a deal component cannot reference another tenant's item.
- Validate branch membership again in server functions, not only through UI selection.
- Do not trust a branch_id, role, actor_user_id, price, discount, fee, state or selection supplied by the client.
- Use server-controlled role rows for authorization; do not use user-editable Auth metadata.

### Privileged functions

- Grant EXECUTE only to the specific roles/functions that need it.
- SECURITY DEFINER only where justified; use a fixed/empty search_path with schema-qualified objects, safe owner, explicit actor/tenant/branch authorization and a careful grant review.
- Return stable error codes and non-sensitive messages. Do not return raw SQL errors, keys, tokens or private data.
- Rate-limit guest order creation and protect webhook actions with secret validation, replay protection and bounded payloads.
- Keep CORS origins restricted for authenticated/private APIs. Public catalog CORS can be separately considered because it is read-only and allowlisted.

### Proposed role separation (to confirm)

- Owner: full control, staff/security settings, publish and rollback.
- Admin: catalog and operational administration; publish/rollback may be restricted by owner policy.
- Manager: routine catalog drafting/availability and operations; publishing/price changes may require owner/admin depending on chosen policy.
- Cashier: read published menu, create/serve orders and permitted POS actions; no catalog edits.
- Kitchen: read minimum order/item information and update only permitted kitchen workflow actions.
- Rider: own rider profile/presence, offers and assigned delivery lifecycle only.
This is a proposed matrix. Reconcile it with the current role requirements and owner preference before writing RLS policies.

## 7. Media and privacy

- Draft uploads should be private and accessible only to authorized staff.
- Public customer menu images should be promoted to a separate public published-media area only when the catalog version is published, or delivered from a private bucket using refreshed signed URLs if that is proven compatible with offline caching.
- A public bucket is public for all objects in it; folder-level policies do not make draft objects private once the bucket is public.
- Use generated object names, validate MIME/size, retain immutable versioned filenames, and prevent browser clients deleting prior published images.
- Customer addresses, phone numbers, rider locations, push tokens and webhook secrets must never be stored in a public media bucket or public catalog response.
- Apply a retention policy to rider location history and sensitive logs.

## 8. Audit, concurrency and operational reliability

- Menu price, availability, category, modifier, deal, schedule, media publication, staff-role and delivery-fee changes should be auditable. GST/tax auditability is deferred until the later tax phase.
- Audit records should identify actor, action, target, timestamp and safe change summary; redact credentials and customer PII.
- Compound Admin actions must be atomic server-side transactions (e.g. create product + variants; create/edit deal + components; publish catalog + pointer switch).
- Use optimistic concurrency (revision/version checks) to prevent one Admin user silently overwriting another's edits.
- Idempotency keys for order creation, payment callbacks, webhook handlers and retryable server commands.
- Enforce unique constraints for business keys, order idempotency, one current delivery assignment, offer rounds and one current catalog publication pointer.
- Explicit state-transition validation for orders, offers, assignments, rider availability and publication state.
- Use indexes based on measured queries and branch filters. Review query plans and Supabase advisors after migrations.
- Use bounded retries, request timeouts, safe fallback behaviour and structured redacted logs.
- Realtime remains limited to operational POS/Rider updates; keep the agreed POS 15-second polling fallback. Menu publication refresh is version-based, not broad table subscriptions.

## 9. Backups and disaster recovery

- Back up database schema/data and Storage objects independently.
- Encrypt backups before leaving the project; do not commit unencrypted production data to a normal source repository.
- Keep daily restore points, seven daily copies, weekly retained versions and monthly restore tests as previously agreed, subject to verified Free-plan and GitHub limits.
- Verify backup integrity with checksums and periodic test restores in an isolated non-production project.
- Document who can restore, where keys are stored, how keys rotate, and how app traffic is safely returned after restoration.
- External backups do not guarantee zero downtime and do not prevent a Free project from pausing due to inactivity. State the Recovery Point Objective and Recovery Time Objective only after backup/restore measurements.

## 10. Preliminary migration dependency order

Do not apply these migrations until each SQL batch is authored, reviewed, tested against a disposable/non-production target and approved:

1. Production migration reconciliation: keep the already-applied security-baseline migration file as historical only; never reapply it.
2. Core tenant tables: restaurants, branches, shared enums/domains and common updated-at/audit infrastructure; composite keys and tenant constraints.
3. Identity and access: user profiles, branch-scoped role assignments, staff audit, private helper functions and minimal grants/RLS.
4. Catalog foundation: categories, subcategories, products, variants, media metadata; nullable draft prices and validation constraints.
5. Options/customization: modifier groups, options, assignments and variant-bound pricing rules.
6. Deals and schedules: deal groups/components/choices, explicit schedule tables and selection validation.
7. Publication: immutable catalog snapshots, current publication pointer, validation/publish/rollback RPCs and audit.
8. Orders and finance: customers if needed, orders, items, components, modifiers, payments, idempotency and state transitions. GST/tax is excluded from this initial migration set.
9. POS resources: devices, registers/sessions, tables and cash movements only where current app flows require them.
10. Delivery and rider operations: areas/fees, tasks, offers, assignments, proofs, profiles, private push config, rate limit and outbox.
11. Storage policies, indexes, views and narrowly scoped Realtime publication.
12. Approved initial restaurant/branch/delivery configuration and menu entry through Admin (not bulk SQL seed from either image).

The actual migration split may change after full dependency mapping and the app contract review. Keep each migration focused and reversible where feasible.

## 11. Open decisions before final DDL

1. For stale offline POS orders, should the server hold for cashier confirmation when the locally cached catalog version is no longer current, or honor the retained historical version?
2. GST/tax is deliberately deferred. Do not add it to the initial schema; revisit through a later reviewed migration when requested.
3. Should product flavors/portion choices be represented as variants, modifiers, or separate products by menu family?
4. Should deals allow curated customer choices, category/subcategory pools, substitutions, surcharges and optional add-ons?
5. Are scheduled offers recurring daily/selected days or one-off date windows, and are they restaurant-wide or branch-specific?
6. Which roles may edit prices, approve/publish catalog versions, change tax/delivery fees and roll back?
7. Should website and POS share one restaurant-wide published catalog, or can branch/channel-specific availability and pricing differ?
8. Are stock counts, ingredient inventory, allergens or dietary labels required in the first production version?

Do not invent these rules. Record confirmed answers in the handoff before finalizing affected tables/RPCs.

## 12. Source-derived risks to address in implementation

These are observations from the current branch source and archived Demo SQL, not claims that Production already contains these defects:

- The old Demo schema is 45 tables, 33 routines, 35 triggers and 108 RLS policies. It is a reference implementation, not a safe one-to-one Production migration.
- Demo tables use independent tenant/branch foreign keys in several places; add composite constraints where necessary to prevent cross-restaurant or cross-branch references.
- Demo public policies allow anonymous SELECT on several raw catalog tables. Production should prefer a narrow published-catalog API rather than broad anonymous PostgREST reads.
- Demo table grants/policies need a full privilege review; RLS alone is not a substitute for table/sequence/function grants.
- Existing Admin uses multiple direct REST writes for product/variant and deal/component changes. Replace compound workflows with atomic server commands.
- Existing Admin does not yet provide full modifier management, schedule management, unpriced draft handling or full existing deal-component editing.
- The current catalog Edge Function reads mutable source tables and computes a version hash; its health response considers the catalog “published” when an active restaurant has at least one product and variant. It does not currently enforce a separate approval/published pointer.
- The current POS uses schemaVersion 2, requires a fixed array contract, and converts missing variant prices/delivery fees to zero in its adapter.
- The current POS's IndexedDB catalog replacement clears existing stores before writing the new cache version; use staged versioned storage and an atomic active-version switch.
- The current POS submits product/deal IDs after offline entry; the order function calculates using live database values. Add catalog version binding and a safe stale-price policy.
- The old Demo order function writes zero tax amounts. GST/tax is explicitly deferred from the initial Production schema at the user's direction; do not copy Demo's zero-tax behaviour as a claimed tax implementation or create tax structures now. Revisit separately later.
- The old Demo delivery/order functions include an explicit manual-address/zero-fee path and zero defaults; Production must not inherit those behaviours.
- The source contains legacy HFP/Pizza Bite internal identifiers and trigger names. Rename only as part of an explicitly coordinated contract migration; do not mass-rename.

## 13. Safety and implementation status

- This blueprint is a design document only.
- It does not create or apply SQL.
- No Production tables, functions, policies, Storage buckets, users, settings or data have been changed by preparing it.
- Next work: finish the table/column/RPC dependency matrix, confirm the open decisions that affect the schema, then convert this blueprint into small reviewed migration files and matching Admin/API implementation tasks.
