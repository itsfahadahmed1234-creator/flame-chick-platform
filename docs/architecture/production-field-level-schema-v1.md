# Flame Chick Production — Field-Level Schema Specification V1

**Status:** Design specification for owner review; not SQL and not authorization to apply DDL  
**Prepared:** 2026-11-20  
**Target:** Flame Chick Production, project ref adkrxfnawdiljhjaavnj, Mumbai region, Supabase Free  
**Working branch:** work/production-source-audit

## 1. Purpose and design boundary

This document turns the current ERD and application contracts into a field-level database proposal. It covers table responsibilities, candidate columns/types, constraints, indexes, grants/RLS, transactional commands, rate limiting, Edge Function usage and Free-plan reliability.

It incorporates decisions already confirmed by the owner:

- Admin and Owner have full business access with distinct identities/audit attribution.
- Manager uses restricted POS only; no Admin panel, catalog/pricing/staff/settings administration or deletion. Manager may supervise branch operations, assign/reassign riders and confirm physical returns.
- Cashier uses POS only; may process orders, assign/reassign riders, reject newly received/unaccepted orders with audit, and confirm physical receipt of returned orders. Cashier cannot delete records; general cancellation of accepted/in-progress orders remains denied.
- Rider uses only the Rider portal and may act only on their own offers/assignments. Rider can report a failed delivery and choose return; only Cashier or Manager (and Admin/Owner) can confirm physical receipt.
- Rider rejection and 60-second no-response expiry return the task to POS for manual reassignment. There is no automatic rider rotation.
- Rider marking a successful delivery completes the order immediately. A confirmed physical return is a separate returned/failed outcome.
- Delivery fee is determined server-side from a named branch area or the Admin-configured Not Listed default; missing default is not zero. Explicitly configured zero is valid.
- An offline POS order whose catalog publication is stale and whose price/availability changed is held for explicit Cashier/Manager confirmation. Never silently reprice.
- GST/tax is deliberately excluded from initial schema. No ingredient inventory is assumed.
- No hard deletion of orders or operational history through normal apps.

**Safety boundary:** no Production DDL, migration, role, row, setting, function, Storage bucket, Edge Function deployment, Vercel deployment or live-app change is authorized by this document. The already-applied default-privilege hardening migration must not be reapplied.

## 2. Current Free-plan constraints verified against official Supabase docs

As checked on 2026-11-20, current published Free-plan allowances relevant to this design are:

| Resource | Free allowance / limit | Design response |
|---|---:|---|
| Edge Function invocations | 500,000 per month | Retain four domain functions; minimize repeat calls; measure usage monthly |
| Edge Functions per project | 100 | Do not create a function per CRUD action; current four are enough |
| Edge Function memory | 256 MB | Keep handlers small; bound payloads; no image processing in Edge Functions |
| Edge Function CPU | 2 seconds per request | No CPU-heavy reports, image transforms, large loops or expensive sync work |
| Edge Function worker wall-clock | 150 seconds | Keep request handlers short; no long-running workers |
| Database size | 500 MB per project | Avoid unnecessary event duplication; apply only approved retention policy |
| Storage | 1 GB | Compress assets before upload; no duplicate unversioned media |
| Egress | 5 GB | Cache published catalog and images; return minimal DTOs |
| Realtime messages | 2 million per month | Only POS/Rider operational events; no Order History stream |
| Realtime peak connections | 200 | Expected staff/rider connections fit comfortably, but monitor |
| Realtime message throughput | 100 per second | Avoid noisy heartbeats and broad row-change broadcasts |
| Auth MAU | 50,000 | Above expected staff/customer use; still retain Auth rate limits |
| API requests | Advertised as unlimited | Data API reads still consume database CPU, connections and egress |
| Project inactivity | Free projects may pause after one week of inactivity | Maintain operational reactivation/backup plan; Free has no uptime SLA |
| Log retention | 1 day | Do not treat hosted logs as the permanent audit record |

Important billing details:
- Edge Function invocation quota is an organization-level usage item. Check organization usage and filter by Flame Chick project; other projects in the organization can consume the shared allowance.
- An invocation counts regardless of HTTP response status. Returning 401, 403, 429 or 500 from a function does not make the request free. CORS preflight OPTIONS requests are not billed.
- An application-level rate limiter protects database work and business workflows, but cannot by itself prevent the invocation itself from being counted. Volumetric abuse against the public function URL remains an upstream/platform protection concern.
- Do not assume the Free project will automatically scale, provide daily backups, preserve uptime or alert before a quota is reached.

Official references are listed in Section 21. Verify again before launch; quotas and product limits can change.

## 3. Architecture and schema namespaces

### 3.1 Table placement

Use two database schemas deliberately.

**public** — exposed through the Supabase Data API, but still default-deny:
- Application tables that the current website/POS/Admin/Rider need to read directly with RLS.
- Narrow RPC endpoints only where a client must invoke a transactional command.
- Public views only when an explicit allowlisted projection is required and the view is safe under caller privileges.

**app_private** — not exposed through the Data API:
- Rate-limit buckets and internal limiter configuration.
- Rider push subscription endpoints/keys and private delivery notification details.
- Internal notification outbox and private helper tables that browser apps do not need.

Do not expose app_private merely to make a browser query work. Edge Functions may use server-side credentials or a deliberately authenticated SQL/RPC path. No browser client receives app_private schema access.

### 3.2 Database API exposure rules

- RLS is enabled explicitly on every public application table, even if a table is intended to be used only by Edge Functions.
- No anonymous SELECT on mutable products, variants, deal drafts, orders, customers, users, settings, delivery tasks, offers, assignments, payments, or audits.
- Public menu access is through a narrow published-catalog response or explicitly allowlisted published snapshot projection.
- Public order submission is a command, never permission to read or update orders.
- All high-risk writes are transactional server commands. Do not perform multi-row catalog/order/delivery writes as several browser REST mutations.
- A view must use security_invoker = true where appropriate (PostgreSQL 15+) and must not accidentally bypass base-table RLS. Otherwise keep it unexposed or revoke client access.
- No table is considered protected merely because its UI route is hidden.

### 3.3 Default privileges already applied

Production has a baseline migration that revoked default table, sequence and function privileges from PUBLIC, anon, authenticated and service_role for objects created by postgres in public. It also revoked execution on public.rls_auto_enable().

Therefore every new migration must explicitly:
1. Revoke unnecessary privileges.
2. Grant schema USAGE only where required.
3. Grant table SELECT/INSERT/UPDATE/DELETE privileges individually to the exact callers.
4. Grant sequence privileges only if a sequence is actually used.
5. Grant EXECUTE on every RPC/function only to its intended role.
6. Enable RLS explicitly and add policies separately from grants.
7. Verify actual grants and RLS after each migration.

Never assume service_role automatically has table or function privileges after this hardening. Never use blanket ALL grants to fix an application error.

## 4. Common conventions and data types

- Primary keys: UUID generated by gen_random_uuid().
- Times: timestamptz, generated by the database. Store UTC instants; restaurant timezone is a data setting (currently Asia/Karachi).
- Money: numeric(12,2), non-negative where it represents a charged amount. Never use floating-point for currency.
- Currency: char(3) or constrained text, store PKR for the current restaurant. Do not scatter currency literals through app logic.
- Quantities: numeric(10,3) only where fractional quantity is needed; otherwise integer. Current menu/order quantity should default to integer.
- User identities: reference auth.users(id), never accept a client-supplied actor identity as proof.
- Statuses: prefer constrained text values/check constraints and explicit transition commands rather than hard-to-change PostgreSQL enums. Exact values must match the current app contract before migrations are written.
- All tenant-owned tables carry restaurant_id. Operational records also carry branch_id. Use composite foreign keys so a branch, order, rider, area, offer and task cannot cross tenant/branch boundaries.
- Do not use NULL branch_id as an ambiguous “all branches” permission. Restaurant-wide Admin/Owner roles use an explicitly documented restaurant scope; operational roles require a branch.
- created_at/updated_at are database-managed. Protect immutable snapshots and event rows from updates.
- Use JSONB only for versioned snapshot payloads, bounded allowlisted event metadata and safe flexible configuration; do not turn core relational facts into opaque JSON.

## 5. Tenant, branch and identity tables

### 5.1 restaurants

One row for the Flame Chick tenant.

| Column | Type | Rules / purpose |
|---|---|---|
| id | uuid PK | Tenant identity |
| name | text NOT NULL | Display name |
| slug | text NOT NULL UNIQUE | Stable identifier |
| currency_code | char(3) NOT NULL | PKR for current tenant |
| timezone | text NOT NULL | IANA timezone; currently Asia/Karachi |
| is_active | boolean NOT NULL DEFAULT true | Tenant lifecycle |
| created_at, updated_at | timestamptz NOT NULL | Database-managed |

No public role may enumerate tenant rows.

### 5.2 branches

V1 website-routing fields and rules:
- `website_ordering_enabled` boolean NOT NULL DEFAULT false
- `website_delivery_enabled` boolean NOT NULL DEFAULT false
- `website_pickup_enabled` boolean NOT NULL DEFAULT false
- Public branch discovery returns only opaque ID, customer-facing name and supported fulfilment modes.
- Server auto-resolves exactly one eligible branch, requires customer selection for multiple eligible branches, and fails closed for zero.
- Revalidate the selected branch's tenant, active state and fulfilment capability before branch-scoped reads/writes. A browser-supplied branch ID is a selector, never authority.


| Column | Type | Rules / purpose |
|---|---|---|
| id | uuid PK | Branch identity |
| restaurant_id | uuid NOT NULL FK | Tenant owner |
| branch_code | text NOT NULL | Unique within restaurant |
| name | text NOT NULL | Branch label |
| address | text | Private operational address |
| phone | text | Private operational phone |
| is_active | boolean NOT NULL DEFAULT true | Only active branch is eligible |
| website_ordering_enabled | boolean NOT NULL DEFAULT false | Explicit public website-order eligibility |
| website_delivery_enabled | boolean NOT NULL DEFAULT false | Website delivery capability |
| website_pickup_enabled | boolean NOT NULL DEFAULT false | Website pickup capability |
| created_at, updated_at | timestamptz NOT NULL | Database-managed |

Constraints: UNIQUE(id, restaurant_id); UNIQUE(restaurant_id, branch_code). All child records use a composite FK to (branch_id, restaurant_id).

### 5.3 user_profiles

Minimal staff profile extension for auth.users. Do not mirror every Auth field.

| Column | Type | Rules / purpose |
|---|---|---|
| user_id | uuid PK/FK auth.users | Identity |
| display_name | text NOT NULL | Staff-facing name |
| phone | text NULL | Private contact; normalize/validate |
| is_active | boolean NOT NULL DEFAULT true | Local profile state |
| created_at, updated_at | timestamptz NOT NULL | Database-managed |

Email remains in Supabase Auth unless a specific operational need requires a verified snapshot. No public profile access.

### 5.4 user_roles

Server-controlled staff role assignment. Authorization must not depend on user-editable user_metadata.

| Column | Type | Rules / purpose |
|---|---|---|
| id | uuid PK | Assignment identity |
| restaurant_id | uuid NOT NULL FK | Tenant |
| user_id | uuid NOT NULL FK auth.users | Staff identity |
| role_key | text NOT NULL | owner, admin, manager, cashier, rider |
| branch_id | uuid NULL | NULL only for restaurant-wide owner/admin; manager/cashier/rider require branch |
| is_active | boolean NOT NULL DEFAULT true | Immediate authorization toggle |
| assigned_by | uuid NOT NULL FK auth.users | Verified administrator actor |
| created_at | timestamptz NOT NULL | Assignment time |
| disabled_at | timestamptz NULL | Revocation time |

Constraints:
- CHECK role_key is in the approved V1 set.
- CHECK owner/admin have branch_id NULL; manager/cashier/rider have branch_id NOT NULL.
- Composite branch/tenant FK.
- Partial unique indexes: one active restaurant-wide assignment per (restaurant_id,user_id) where branch_id IS NULL; one active assignment per (restaurant_id,user_id,branch_id) where branch_id IS NOT NULL.
- Operational roles may have multiple branch rows only when every active row for that (restaurant_id,user_id) has the same role_key. Admin/Owner have exactly one restaurant-wide row and no branch rows. Enforce the one-role-across-branches invariant inside the staff-admin transaction under a transaction-scoped lock keyed by (restaurant_id,user_id); add a database trigger/guard as defense in depth so a future server path cannot bypass it.
- A role change closes all prior active assignments and creates the new role/branch set atomically with audit. Never allow simultaneous Admin+Owner or operational roles across branches.
- Prevent self-escalation. Serialize role/branch changes and deactivation by locking a restaurant-level staff-authority guard row before checking the last-active-Owner invariant; concurrent Admin actions must not both remove or demote the final active Owner. Enforce this in the database command, not only the Edge Function.
- Role assignment changes use an audited command. Admin and Owner may both invite staff, assign/change roles, change branch assignments and deactivate staff, subject to the same safeguards and immutable audit trail. This follows the owner-confirmed rule that Admin and Owner have equivalent full business authority with distinct audit identities. Manager, Cashier and Rider cannot administer staff or roles. Prevent self-escalation, enforce the last-active-Owner safeguard, and require a reason for privileged role/branch changes.

No Kitchen role is created in V1. Current source code contains a Kitchen role read path; deny it until the role and exact fields/actions are explicitly approved and the source function is adapted.

**Staff invitation is a cross-system workflow, not one ACID transaction.** Supabase Auth invitation and PostgreSQL role assignment cannot be assumed to commit atomically. Use a recoverable invitation state machine with a unique command key: record pending request, call Auth invite from the server, then bind/activate the role through an idempotent database command after the invited identity is verified. Record pending/sent/accepted/failed/expired outcomes without exposing invite tokens. If Auth succeeds but the role write fails, reconcile/retry the same invitation command rather than creating duplicate users or invitations. Never activate a role for an unverified or mismatched Auth identity.

### 5.4A user_role_branch consistency guard

The logical rule is one active role_key per (restaurant_id,user_id). Operational roles may have that same role assigned to multiple branches; Admin/Owner are restaurant-wide and cannot coexist with branch-scoped rows. Enforce this in the transactional staff command under a per-user/restaurant advisory lock and add a constraint-trigger/guard as defense in depth. A plain partial unique index cannot enforce a cross-row same-role invariant by itself. Concurrent role changes must serialize. Role audit and assignment changes commit together.

### 5.5 staff_role_audit

Append-only staff identity/role history.

| Column | Type | Rules / purpose |
|---|---|---|
| id | uuid PK | Event |
| restaurant_id | uuid NOT NULL | Tenant |
| branch_id | uuid NULL | Scope affected |
| target_user_id | uuid NOT NULL | Staff member changed |
| old_role, new_role | text NULL | Before/after |
| action | text NOT NULL | invited, activated, deactivated, role_changed, branch_changed |
| actor_user_id | uuid NOT NULL | Derived from verified JWT |
| actor_role | text NOT NULL | Role snapshot |
| reason | text NOT NULL | Mandatory bounded reason for role/branch/deactivation changes |
| occurred_at | timestamptz NOT NULL | Server time |
| request_id | uuid NULL | Correlation/idempotency |

No client INSERT/UPDATE/DELETE. Staff role change and audit insert occur in one transaction.

## 6. Catalog authoring tables

The Admin panel must support future menu changes through data, not schema edits. New category/product/variant/modifier/deal names and labels are not hardcoded in code or database enums.

### 6.1 categories

- id uuid PK
- restaurant_id uuid NOT NULL
- name text NOT NULL; name_ur text NULL
- description text NULL; image_asset_id uuid NULL
- sort_order integer NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- archived_at timestamptz NULL
- created_by, updated_by uuid NOT NULL
- created_at, updated_at timestamptz NOT NULL

Unique stable category key within restaurant where needed. Archive rather than hard-delete when referenced.

### 6.2 subcategories

- id uuid PK
- restaurant_id uuid NOT NULL
- category_id uuid NOT NULL
- name text NOT NULL; name_ur text NULL
- sort_order integer NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- created_at, updated_at timestamptz NOT NULL

Composite FK ensures the category belongs to the same restaurant. A product subcategory must belong to its selected category.

### 6.3 products

- id uuid PK
- restaurant_id uuid NOT NULL
- category_id uuid NOT NULL
- subcategory_id uuid NULL
- sku text NULL
- name text NOT NULL; name_ur text NULL
- description text NULL; description_ur text NULL
- image_asset_id uuid NULL
- product_kind text NOT NULL (regular or another reviewed data-driven kind; do not hardcode menu category names)
- sort_order integer NOT NULL DEFAULT 0
- is_featured boolean NOT NULL DEFAULT false
- is_active boolean NOT NULL DEFAULT true
- created_by, updated_by uuid NOT NULL
- created_at, updated_at timestamptz NOT NULL
- archived_at timestamptz NULL

Constraints: composite category/subcategory relationship; unique SKU within restaurant when SKU is not null; indexes on restaurant/category/active/sort order. Archive referenced products; historical order snapshots remain readable.

### 6.4 product_variants

- id uuid PK
- restaurant_id uuid NOT NULL
- product_id uuid NOT NULL
- variant_key text NOT NULL
- label text NOT NULL; label_ur text NULL
- price numeric(12,2) NULL
- sort_order integer NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- is_available boolean NOT NULL DEFAULT true
- created_at, updated_at timestamptz NOT NULL

Constraints: UNIQUE(product_id, variant_key); composite FK to product; CHECK price IS NULL OR price >= 0. NULL means draft/unpriced. Zero means an intentionally free price entered by Admin. Do not default price to zero. Publication validation rejects any active purchasable variant with NULL price.

### 6.5 modifier_groups

- id uuid PK
- restaurant_id uuid NOT NULL
- name text NOT NULL; name_ur text NULL
- selection_mode text NOT NULL (single or multiple)
- is_active boolean NOT NULL DEFAULT true
- sort_order integer NOT NULL DEFAULT 0
- created_at, updated_at timestamptz NOT NULL

### 6.6 modifiers

- id uuid PK
- restaurant_id uuid NOT NULL
- group_id uuid NOT NULL
- name text NOT NULL; name_ur text NULL
- price_mode text NOT NULL (included, fixed_extra, variant_price)
- fixed_extra_price numeric(12,2) NULL
- is_active boolean NOT NULL DEFAULT true
- sort_order integer NOT NULL DEFAULT 0
- created_at, updated_at timestamptz NOT NULL

CHECK rules require fixed_extra_price >= 0 for fixed_extra and prevent ambiguous price combinations for other modes.

### 6.7 product_modifier_groups

- id uuid PK
- restaurant_id uuid NOT NULL
- product_id uuid NOT NULL
- modifier_group_id uuid NOT NULL
- is_required boolean NOT NULL DEFAULT false
- min_selections integer NOT NULL DEFAULT 0
- max_selections integer NOT NULL DEFAULT 1
- sort_order integer NOT NULL DEFAULT 0

CHECK min >= 0 and max >= min. Composite FKs ensure product/group same restaurant. UNIQUE(product_id, modifier_group_id).

### 6.8 modifier_variant_prices

- id uuid PK
- restaurant_id uuid NOT NULL
- modifier_id uuid NOT NULL
- product_variant_id uuid NOT NULL
- price_delta numeric(12,2) NOT NULL CHECK >= 0
- created_at, updated_at timestamptz NOT NULL

Unique modifier/variant pair. Server validates that the modifier group is assigned to the product of the selected variant. Do not trust client-supplied option price.

## 7. Deals and schedules

### 7.1 deals

- id uuid PK
- restaurant_id uuid NOT NULL
- display_category_id uuid NULL
- title text NOT NULL; title_ur text NULL
- description text NULL; description_ur text NULL
- image_asset_id uuid NULL
- bundle_price numeric(12,2) NULL
- is_active boolean NOT NULL DEFAULT true
- is_available boolean NOT NULL DEFAULT true
- is_featured boolean NOT NULL DEFAULT false
- sort_order integer NOT NULL DEFAULT 0
- created_by, updated_by uuid NOT NULL
- created_at, updated_at timestamptz NOT NULL
- archived_at timestamptz NULL

NULL bundle price is draft/unpriced; publish validation blocks it. Zero is explicit free only if saved intentionally.

### 7.2 deal_components

- id uuid PK
- restaurant_id uuid NOT NULL
- deal_id uuid NOT NULL
- component_key text NOT NULL
- display_label text NOT NULL; display_label_ur text NULL
- component_kind text NOT NULL (fixed_item or choice_group)
- fixed_product_id uuid NULL
- fixed_variant_id uuid NULL
- quantity integer NOT NULL DEFAULT 1 CHECK > 0
- is_required boolean NOT NULL DEFAULT true
- min_choices integer NOT NULL DEFAULT 0
- max_choices integer NOT NULL DEFAULT 1
- sort_order integer NOT NULL DEFAULT 0
- surcharge_mode text NOT NULL (none or selected_choice_delta)

Use typed FKs, never a generic table-name/string-ID reference. CHECKs ensure fixed_item has the appropriate product/variant and choice_group has selection bounds. Validate all cross-table relationships in the transaction.

### 7.3 deal_component_choices

- id uuid PK
- restaurant_id uuid NOT NULL
- component_id uuid NOT NULL
- product_id uuid NOT NULL
- product_variant_id uuid NULL only when the product has exactly one active sellable variant
- sort_order integer NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- surcharge numeric(12,2) NOT NULL CHECK >= 0 (explicit zero allowed)

V1 choice lists are curated only; category/subcategory pools and free-text substitutions are out of scope. Composite FKs prevent cross-restaurant choices. The order command requires the selected choice to be present and active in the published version, globally active, branch-available and within the component's min/max bounds. When product_variant_id is NULL, server resolution is allowed only if exactly one eligible variant exists; otherwise reject as ambiguous. The explicit surcharge is added to the bundle price; never infer a surcharge from standalone menu prices or accept it from the client.

### 7.4 deal_schedules and deal_schedule_days

deal_schedules:
- id uuid PK
- restaurant_id uuid NOT NULL
- deal_id uuid NOT NULL
- schedule_kind text NOT NULL (one_off or recurring)
- timezone text NOT NULL (IANA zone; currently Asia/Karachi)
- starts_at timestamptz NULL; ends_at timestamptz NULL
- local_start_time time NULL; local_end_time time NULL
- valid_from date NULL; valid_until date NULL
- is_active boolean NOT NULL DEFAULT true

deal_schedule_days:
- id uuid PK
- restaurant_id uuid NOT NULL
- schedule_id uuid NOT NULL
- weekday smallint NOT NULL CHECK BETWEEN 0 AND 6
- UNIQUE(schedule_id, weekday)

The exact recurrence, overlap, overnight and branch-scope rules remain open. Do not enable schedule rows in Production until those semantics are confirmed. No scheduler/Edge Function is required merely to represent a schedule; order/catalog commands check eligibility.


## 7.5 Branch availability overlays and catalog identity

V1 base menu definitions and base prices are restaurant-wide. Sellability may vary by branch; delivery pricing is already branch-specific. No branch price override is allowed in V1.

### `branch_variant_availability`
- restaurant_id, branch_id, product_variant_id uuid NOT NULL
- is_available boolean NOT NULL
- reason text NULL (bounded operational note; no customer PII)
- updated_by uuid NOT NULL; updated_at timestamptz NOT NULL
- PK (branch_id, product_variant_id)
- Composite FKs bind branch and variant to the same restaurant.
- Missing row inherits the global published variant availability. Global inactive/archived variant always remains unsellable; branch override cannot reactivate it.

### `branch_deal_availability`
- restaurant_id, branch_id, deal_id uuid NOT NULL
- is_available boolean NOT NULL
- updated_by uuid NOT NULL; updated_at timestamptz NOT NULL
- PK (branch_id, deal_id)
- Composite FKs bind branch and deal to the same restaurant.
- Missing row inherits global published deal availability. Global inactive/archived deal cannot be reactivated.

### `branch_catalog_state`
- restaurant_id, branch_id uuid PK (composite)
- availability_revision bigint NOT NULL DEFAULT 1
- updated_at timestamptz NOT NULL
- Increment atomically for every branch availability change; Admin/Owner only.

Every order snapshots both `catalog_publication_id/version` and `branch_availability_revision`. Website/POS catalog cache identity includes publication ID/version, branch ID, branch availability revision and catalog schema version. POS stale-cache hold/explicit confirmation checks both versions. Do not silently reprice; V1 base prices are identical across branches.

## 8. Draft revision and immutable publication

### 8.1 catalog_draft_state

One controlled draft revision per restaurant for the initial single-catalog model.

- restaurant_id uuid PK/FK
- revision bigint NOT NULL DEFAULT 1
- updated_by uuid NOT NULL
- updated_at timestamptz NOT NULL

Every successful Admin draft mutation increments revision transactionally. Admin/Owner sends expected revision; stale edits return a conflict instead of overwriting another user's work. V1 base menu and prices are restaurant-wide; branch-specific availability is stored separately. Branch/channel-specific price overrides are out of scope.

### 8.2 menu_publications

Immutable approved snapshots.

- id uuid PK
- restaurant_id uuid NOT NULL
- version bigint NOT NULL
- catalog_schema_version integer NOT NULL
- snapshot jsonb NOT NULL
- checksum_sha256 text NOT NULL
- published_by uuid NOT NULL
- source_draft_revision bigint NOT NULL
- published_at timestamptz NOT NULL
- validation_summary jsonb NOT NULL (allowlisted counts/warnings, no PII)

Constraints: UNIQUE(restaurant_id, version); unique id/version pair; checksum format/length validation. Block UPDATE/DELETE through grants and triggers/commands. Snapshot schema is explicitly versioned and has no private staff/customer/payment data. The checksum must be computed by trusted server/database code over a documented canonical serialization (not arbitrary JSON key order or browser-supplied checksum); verify it before serving and when loading a cached publication. Never treat a checksum as an authenticity signature.

### 8.3 restaurant_catalog_state

- restaurant_id uuid PK
- current_publication_id uuid NOT NULL
- current_version bigint NOT NULL
- updated_by uuid NOT NULL
- updated_at timestamptz NOT NULL

Publish/rollback command atomically inserts an immutable publication (when publishing), records event and moves the pointer. Rollback points to a previous valid snapshot; it never edits a prior publication.

### 8.4 menu_publication_events

- id uuid PK
- restaurant_id uuid NOT NULL
- event_type text NOT NULL (draft_validated, published, rollback)
- publication_id uuid NULL
- from_publication_id uuid NULL
- to_publication_id uuid NULL
- actor_user_id uuid NOT NULL
- actor_role text NOT NULL
- draft_revision bigint NULL
- occurred_at timestamptz NOT NULL
- safe_details jsonb NULL
- request_id uuid NULL

Append-only. Admin and Owner may both edit catalog drafts, prices, delivery pricing, publish and rollback, with distinct actor attribution and immutable audit events. Manager, Cashier and Rider have no catalog authoring or publication authority. Publish/rollback commands must lock or compare-and-set the catalog state pointer, validate the expected draft revision, create the immutable snapshot/event and move the pointer atomically; a failed step leaves the previous publication active.

## 9. Delivery pricing configuration

### 9.1 delivery_areas

- id uuid PK
- restaurant_id uuid NOT NULL
- branch_id uuid NOT NULL
- name text NOT NULL; name_ur text NULL
- fee numeric(12,2) NOT NULL CHECK (fee >= 0)
- sort_order integer NOT NULL DEFAULT 0
- is_active boolean NOT NULL DEFAULT true
- created_by, updated_by uuid NOT NULL
- created_at, updated_at timestamptz NOT NULL
- archived_at timestamptz NULL

A new area form must start blank and require explicit fee entry. Do not default to 0. UNIQUE(branch_id, normalized_name) where appropriate. Composite tenant/branch FK.

### 9.2 branch_delivery_settings

- branch_id uuid PK/FK
- restaurant_id uuid NOT NULL
- not_listed_delivery_fee numeric(12,2) NULL CHECK (fee IS NULL OR fee >= 0)
- updated_by uuid NOT NULL
- updated_at timestamptz NOT NULL

NULL means Not Listed is not configured; checkout must block. Explicit 0 is valid. Manager and Cashier cannot edit. Admin/Owner only.

The order command requires explicit selection_type = listed_area or not_listed. A NULL area_id does not imply Not Listed. It calculates the canonical fee from the database and snapshots it on both order and delivery task. Fee values supplied by the browser are ignored/rejected. For listed_area, require an active area belonging to the resolved branch; for not_listed, require area_id to be NULL and a configured branch default fee. Reject contradictory combinations.

## 10. Orders, line snapshots and payments

### 10.1 orders

| Column | Type | Purpose |
|---|---|---|
| id | uuid PK | Stable order identity |
| restaurant_id, branch_id | uuid NOT NULL | Tenant/branch |
| order_number | text NOT NULL | Human display number; unique within branch/business date as defined |
| source | text NOT NULL | website or pos; reconcile exact existing values |
| fulfillment_type | text NOT NULL | delivery, pickup, dine_in only where current flow uses it |
| status | text NOT NULL | Controlled by transition commands |
| customer_name_snapshot | text NOT NULL | Historical recipient/customer label |
| customer_phone_snapshot | text NOT NULL | Historical contact; private |
| customer_email_snapshot | text NULL | Only if used by current app |
| delivery_address_snapshot | text NULL | Required for delivery |
| delivery_instructions_snapshot | text NULL | Private operational text |
| delivery_selection_type | text NULL | listed_area or not_listed for delivery |
| delivery_area_id_snapshot | uuid NULL | Reference when listed |
| delivery_area_label_snapshot | text NULL | Immutable display label |
| delivery_fee_snapshot | numeric(12,2) NOT NULL | Server-calculated; 0 allowed when explicitly configured |
| catalog_publication_id | uuid NULL | Exact catalog version used |
| catalog_version | bigint NULL | Version for stale offline policy |
| subtotal | numeric(12,2) NOT NULL CHECK >= 0 | Server-calculated |
| discount_amount | numeric(12,2) NOT NULL DEFAULT 0 CHECK >= 0 | Only validated explicit discount; no automatic discount assumed |
| total | numeric(12,2) NOT NULL CHECK >= 0 | Server-calculated |
| currency_code | char(3) NOT NULL | Snapshot of currency |
| payment_status | text NOT NULL | Align to current payment flow |
| created_by_user_id | uuid NULL | Null for guest; otherwise server-verified staff |
| idempotency_key | text NOT NULL | Unique order creation request key; bounded length and strict format/entropy validation; not an authorization secret |
| request_fingerprint | text NOT NULL | Server-computed hash of normalized canonical business fields using a versioned canonicalization algorithm; prevents key reuse with changed payload; excludes transport noise and server-generated values |
| accepted_at, ready_at, completed_at | timestamptz NULL | Server-controlled lifecycle times |
| created_at, updated_at | timestamptz NOT NULL | Database-managed |

Constraints:
- UNIQUE(restaurant_id, branch_id, source, idempotency_key) or an equivalent tested scope.
- Composite branch/tenant FK; publication belongs to same tenant.
- Delivery-specific CHECK: delivery orders require full address, selection type and server-resolved fee; pickup/takeaway does not require an area.
- Total equals subtotal minus allowed discount plus delivery fee (no GST/tax in V1). Enforce calculation in the transactional order command; a CHECK may enforce simple row arithmetic if rounding/discount semantics are fixed.
- Client cannot set status, branch, actor, order number, subtotal, delivery fee, total or payment status as authority.

### 10.2 order_items

- id uuid PK
- restaurant_id, branch_id, order_id uuid NOT NULL
- line_number integer NOT NULL CHECK > 0
- line_kind text NOT NULL (product or deal)
- product_id uuid NULL; product_variant_id uuid NULL; deal_id uuid NULL
- product_name_snapshot text NOT NULL; variant_label_snapshot text NULL; deal_title_snapshot text NULL
- sku_snapshot text NULL
- quantity integer NOT NULL CHECK > 0
- unit_price_snapshot numeric(12,2) NOT NULL CHECK >= 0
- line_total_snapshot numeric(12,2) NOT NULL CHECK >= 0
- catalog_publication_id uuid NULL
- created_at timestamptz NOT NULL

UNIQUE(order_id, line_number). Typed composite FKs ensure product/variant/deal pair matches. Historical snapshots are authoritative; archive catalog rather than remove referenced rows.

### 10.3 order_item_modifiers

- id uuid PK
- order_item_id uuid NOT NULL
- modifier_group_id uuid NULL
- modifier_id uuid NULL
- group_name_snapshot text NOT NULL
- modifier_name_snapshot text NOT NULL
- quantity integer NOT NULL CHECK > 0
- unit_price_snapshot numeric(12,2) NOT NULL CHECK >= 0
- total_price_snapshot numeric(12,2) NOT NULL CHECK >= 0

Preserve selected labels and charged amount even when the source modifier is later archived.

### 10.4 order_item_components

- id uuid PK
- order_item_id uuid NOT NULL
- deal_component_id uuid NULL
- selected_product_id uuid NULL
- selected_variant_id uuid NULL
- component_label_snapshot text NOT NULL
- selected_product_name_snapshot text NOT NULL
- selected_variant_label_snapshot text NULL
- quantity integer NOT NULL CHECK > 0
- surcharge_snapshot numeric(12,2) NOT NULL CHECK >= 0

Preserve what was selected in a deal; validate choices against active publication and deal rules at order time.

### 10.5 order_status_history

- id uuid PK
- restaurant_id, branch_id, order_id uuid NOT NULL
- from_status text NULL
- to_status text NOT NULL
- action text NOT NULL
- actor_user_id uuid NULL (null only for explicitly identified system action)
- actor_role text NULL
- reason_code text NULL; reason_note text NULL
- occurred_at timestamptz NOT NULL
- request_id uuid NULL

Append-only; status update and history insert must be one transaction. No normal app DELETE or UPDATE.

### 10.6 payments — immutable collection/refund ledger

Do not overwrite a collection row to represent a refund. Model every actual money movement as an append-only payment ledger entry.

- id uuid PK
- restaurant_id, branch_id, order_id uuid NOT NULL
- entry_type text NOT NULL CHECK IN ('collection','refund')
- payment_method text NOT NULL (source-confirmed cash/card/bank/other)
- amount numeric(12,2) NOT NULL CHECK (amount > 0)
- currency_code char(3) NOT NULL
- status text NOT NULL CHECK IN ('succeeded','failed','voided') only where source flow needs these; failed/voided rows never count as collected
- original_collection_id uuid NULL FK payments(id); required for refund, null for collection
- provider_reference text NULL (unique per provider/tenant when supplied)
- idempotency_key text NOT NULL
- received_by_user_id uuid NULL (verified actor for collection)
- refunded_by_user_id uuid NULL (verified Admin/Owner actor for refund)
- reason_code text NULL; reason_note text NULL
- occurred_at timestamptz NOT NULL (database time)
- created_at timestamptz NOT NULL

Constraints/commands:
- A collection is positive and has no original_collection_id. A refund is positive and references a succeeded collection for the same order, restaurant, branch and currency.
- Refund amount may not exceed the remaining refundable amount. The refund command locks the original collection row, sums prior succeeded refunds and inserts the new refund in the same transaction.
- Refund idempotency is scoped by restaurant/branch/command key; unique constraint is final race guard. Concurrent refunds cannot over-refund.
- Only Admin/Owner may authorize and record a refund in V1. Manager/Cashier/Rider cannot do this.
- Record a refund only after money was actually returned through the recorded method. A refund request or promised refund is not a completed refund.
- Payment/order status is a derived or command-maintained summary; it never rewrites/deletes ledger entries.
- Returned COD order with no successful collection is marked not_collected/closed_uncollected in the payment summary and creates no refund entry.
- No payment gateway, raw card data, CVV, bank credentials, wallet secrets, automatic refund, store credit or tax/GST implementation in V1.


## 11. Delivery and rider tables

The authoritative detailed delivery contract is docs/architecture/delivery-lifecycle-contract.md. This section adds the parent relationships and access model.

### 11.1 delivery_tasks

- id uuid PK
- restaurant_id, branch_id, order_id uuid NOT NULL; UNIQUE(order_id)
- status text NOT NULL (awaiting_assignment, offered, assigned, picked_up, out_for_delivery, return_pending_confirmation, delivered, returned; exact names reconciled before SQL)
- recipient_name_snapshot, recipient_phone_snapshot text NOT NULL
- delivery_address_snapshot text NOT NULL; delivery_instructions_snapshot text NULL
- delivery_area_id_snapshot uuid NULL; delivery_area_label_snapshot text NOT NULL
- delivery_selection_type_snapshot text NOT NULL
- delivery_fee_snapshot numeric(12,2) NOT NULL CHECK >= 0
- ready_for_dispatch_at, picked_up_at, delivered_at timestamptz NULL
- return_reported_at, return_confirmed_at timestamptz NULL
- return_reason_code text NULL; return_note text NULL
- return_confirmed_by uuid NULL
- created_at, updated_at timestamptz NOT NULL

Task/order branch must match. Creation is atomic with order acceptance/dispatch eligibility. Fee/contact/address snapshots are immutable after task creation except by an audited correction command.

### 11.1A delivery_dropoff_locations (app_private)

Optional single customer-shared fixed destination pin per delivery order/task; private schema, no Data API exposure.

- id uuid PK
- restaurant_id, branch_id, order_id, delivery_task_id uuid NOT NULL
- latitude numeric(9,6) NOT NULL CHECK BETWEEN -90 AND 90
- longitude numeric(9,6) NOT NULL CHECK BETWEEN -180 AND 180
- accuracy_m numeric(9,2) NULL CHECK IS NULL OR >= 0
- location_source text NOT NULL CHECK IN ('device_once','manual_map_pin')
- customer_consented_at timestamptz NOT NULL
- consent_notice_version text NOT NULL
- created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
- UNIQUE(order_id), UNIQUE(delivery_task_id)
- Composite FKs bind same restaurant, branch, order and delivery task; delivery task must reference the same order. Add parent composite unique keys where necessary rather than weakening tenant integrity.

Insert only as part of the atomic website delivery-order command. Written address remains required; pin is optional. No direct browser table grants. Rider can read only for their current active assignment; authorized POS reads are branch-scoped; Admin/Owner access follows restaurant-wide business authority. Reassignment immediately revokes previous Rider access. Generate Google Maps directions from validated coordinates; never store arbitrary customer URL.

No Rider GPS, continuous customer tracking, location sessions, updates, movement history, polling, geofencing or Realtime location channel. Proposed precise-coordinate cleanup within 24 hours after terminal delivery state remains pending operational/legal confirmation. No pin must never be treated as (0,0).

### 11.2 rider_profiles

- id uuid PK
- restaurant_id, branch_id uuid NOT NULL
- user_id uuid NOT NULL FK auth.users
- rider_code text NOT NULL
- display_name text NOT NULL
- is_active boolean NOT NULL DEFAULT true
- accepting_jobs boolean NOT NULL DEFAULT true
- last_seen_at timestamptz NULL (only if the current portal needs it)
- created_at, updated_at timestamptz NOT NULL

UNIQUE(user_id, branch_id); rider must have active rider role for same branch. Do not add GPS history/location table unless an actual feature is confirmed.

### 11.3 delivery_task_offers

Fields: id, restaurant_id, branch_id, task_id, rider_user_id, offer_round, status (pending/accepted/rejected/expired), offered_at, expires_at, responded_at, created_by, request_id. Server sets expires_at exactly offered_at + 60 seconds. Unique (task_id, offer_round); one pending offer per task; enforce deadline inside accept command even if expiry sweeper has not run.

### 11.4 delivery_assignments

Fields: id, restaurant_id, branch_id, task_id, offer_id UNIQUE, rider_user_id, status, assigned_at, accepted_at, picked_up_at, delivered_at, ended_at. Partial unique index permits only one current active assignment per task.

### 11.5 delivery_task_events

Fields: id, restaurant_id, branch_id, task_id, offer_id NULL, assignment_id NULL, event_type, from_status, to_status, actor_user_id NULL only for system expiry, actor_role, reason_code, bounded note, occurred_at, request_id, safe_metadata JSONB.

Append-only. Rider cannot self-confirm return. Cashier and Manager may confirm only after return_pending_confirmation. Successful delivery updates order and task to delivered/completed in one transaction. Confirmed physical return updates task to returned and order to a distinct returned/failed state in one transaction.

### 11.6 rider_push_subscriptions (app_private)

- id uuid PK
- restaurant_id, branch_id uuid NOT NULL
- rider_user_id uuid NOT NULL
- endpoint_encrypted text NOT NULL
- p256dh_encrypted text NOT NULL
- auth_secret_encrypted text NOT NULL
- endpoint_hash text NOT NULL UNIQUE
- is_active boolean NOT NULL DEFAULT true
- created_at, updated_at, last_success_at timestamptz NULL

No browser SELECT of raw push secrets. Only the authenticated Rider may register/revoke their own subscription through a verified command; the server encrypts secrets. Logs never include endpoint or keys.

## 12. Reliability and internal operations tables

### 12.1 notification_outbox (app_private)

Transactional outbox for important offer/order notifications only.

- id uuid PK
- restaurant_id, branch_id uuid NOT NULL
- event_type text NOT NULL
- aggregate_type text NOT NULL; aggregate_id uuid NOT NULL
- recipient_user_id uuid NULL
- payload_safe jsonb NOT NULL (allowlisted IDs/labels only; no unnecessary PII)
- status text NOT NULL (pending, processing, delivered, retry, dead_letter)
- attempts integer NOT NULL DEFAULT 0
- next_attempt_at timestamptz NOT NULL
- locked_at timestamptz NULL
- delivered_at timestamptz NULL
- last_error_code text NULL (no secrets/stack/PII)
- created_at timestamptz NOT NULL

Unique event/idempotency key prevents duplicate notification queue entries. Insert outbox record in the same transaction as offer/order state change. The caller can attempt delivery after commit; if it fails, keep it retryable and retry during a later operational request. Do not add a continuously running Edge worker or a new function solely for notifications in V1. Cleanup/retention is bounded and documented.

### 12.2 app_private.api_rate_limit_buckets

Only for high-risk API throttling; no raw IP, phone or email stored.

- id uuid PK
- policy_code text NOT NULL
- subject_digest bytea NOT NULL (server-generated HMAC-SHA-256)
- tokens_remaining numeric(12,4) NOT NULL
- last_refill_at timestamptz NOT NULL
- last_seen_at timestamptz NOT NULL
- blocked_until timestamptz NULL
- UNIQUE(policy_code, subject_digest)

An atomic server-only consume function implements token-bucket refill using database time and returns only allowed/denied plus retry-after seconds. Policy capacities/refill rates are fixed, version-controlled server settings initially; no browser or Manager editing. Use separate HMAC namespaces for IP, authenticated user, and normalized phone. HMAC secret stored only as Edge Function secret; never commit it. Do not store unhashed IP, phone or full request payload in the limiter table.

The limiter function is not an auth check. Validate project, API key, JWT, role and branch independently. The limiter's service-only RPC must have an exact EXECUTE grant; app_private has no browser access.

Cleanup: retain only a short rolling window (proposed 24–48 hours) and delete stale buckets in bounded batches. Use a Postgres scheduler only if confirmed on the actual Free project and only for low-cost cleanup; otherwise use bounded opportunistic cleanup from a server-only maintenance command. Do not create an always-on worker.

### 12.3 settings audit

Use domain-specific append-only events for:
- delivery area/default fee changes,
- catalog draft/publish/rollback,
- staff role assignment changes,
- security-sensitive configuration changes.

Do not create duplicate generic audit rows for every ordinary read. Audit actor comes from verified auth, role snapshot from server, time from database. No hard deletion of audit records.

### 12.4 POS tables

Do not add registers, cash drawers, tables or device-management tables merely because they existed in the Demo schema. The current app map indicates takeaway/dine-in may remain local in the POS; add server tables only after a source-level workflow proves they are needed. If the final source audit confirms a POS device table, its minimum fields are id, restaurant_id, branch_id, device_code, display_name, active, last_seen_at, created_at; no secret/session token is exposed.

## 13. Authorization matrix and enforcement design

| Data/action | anon | Auth non-staff | Admin/Owner | Manager | Cashier | Rider |
|---|---|---|---|---|---|---|
| Published catalog | Narrow public projection | Narrow public projection | Full | POS projection only | POS projection only | No business need |
| Mutable catalog/draft | No | No | Full | No | No | No |
| Delivery fee config | No | No | Full | No | No | No |
| Branch operational orders | No | No | Full | Branch operational fields | POS fields | Own assigned/offered only |
| Reject newly received order | No | No | Yes | Not approved; deny | Yes with audit reason | No |
| Cancel accepted/in-progress order | No | No | Yes with audit | Deny by default | Deny by default | No |
| Dispatch/reassign rider | No | No | Yes | Yes | Yes | No |
| Accept/reject offer | No | No | No | No | No | Own pending offer only |
| Pickup/out-for-delivery/delivered | No | No | No | No | No | Own active assignment |
| Report failed delivery/return | No | No | No | No | No | Own active assignment |
| Confirm physical return | No | No | Yes | Yes | Yes | No |
| Staff roles | No | No | Controlled staff-admin command | No | No | No |
| Hard-delete orders/history | No | No | No through normal apps | No | No | No |
| Read another rider's offer/task data | No | No | Full operational audit as needed | Minimum branch dispatch fields | Minimum dispatch fields | Never |

Additional enforcement:
- Manager must fail Admin route guard and Admin API/RPC checks independently.
- Rider ownership always binds to auth.uid() and active rider profile, not client-supplied rider_user_id.
- Cashier physical-return confirmation is a narrow, separate capability, not a broad Manager role grant.
- Every protected write validates current role and branch inside the same transaction as the state change.
- Do not use user_metadata for role authorization. App metadata can be stale until JWT refresh; server-controlled user_roles is the authority.

## 14. Rate-limiting policy and implementation plan

### 14.1 First principles

- Rate-limit only endpoints where abuse can create meaningful cost, fraud, spam or operational load.
- Keep Supabase Auth's own endpoint rate limits enabled; do not create duplicate custom limits for password sign-in, token refresh or email/OTP operations unless evidence requires it.
- A rate-limit response is HTTP 429 with a bounded Retry-After value and safe error code.
- Always validate input size, schema, JWT, role, branch, idempotency and state transitions separately. Rate limits never replace validation or authorization.
- Make limits configurable in code/config with review, not editable by Cashier/Manager.
- Do not add Upstash/Redis at current volume. It creates a third-party dependency and possibly a new billable service. PostgreSQL is already the shared, atomic source of truth and is sufficient for current scale when used sparingly.
- Avoid rate-limiting every read through a DB write. Catalog and low-risk reads should be cached, paginated and RLS-protected first.
- Never trust a client-supplied user id, phone, IP, role, branch or arbitrary rate policy key as the subject.

### 14.2 Rate-limit targets (initial proposals for isolated testing)

Only the owner-approved ordering caps below are business requirements; other values in this table are initial test values, not Production settings:

| Route/action | Subject key(s) | Initial test limit | Purpose |
|---|---|---:|---|
| Customer website order creation (`source=website` only) | Server-normalized customer phone HMAC | **3 orders / rolling minute; 3 / rolling 10 minutes; 15 / rolling hour** | Owner-confirmed successful-order quota; checked atomically during website order creation |
| Public catalog read | Client cache first; no DB bucket by default | Add 60/minute/IP only if observed abuse justifies | Avoid extra DB write per view |
| Rider offer response/status | Authenticated rider HMAC | 20 actions / minute | Suppress retries/automation; state machine still decisive |
| Cashier/Manager dispatch writes | Authenticated staff HMAC | 30 actions / minute | Suppress duplicate/broken dispatch loops |
| Staff invite/role administration | Authenticated authorized actor HMAC | 5 invitations / hour | Reduce account abuse |
| Auth login/token operations | Supabase Auth's built-in IP/user policies | Keep current Supabase defaults unless verified need | Avoid duplicating Auth controls |

Tune with real staff behavior and controlled load tests before enforcing. Shared NAT/mobile carrier IPs can represent many legitimate customers; never rely on an IP threshold alone for an irreversible order denial. Phone-based limits are privacy-protective HMAC keys, not permanent identity records. The owner-confirmed caps are 3 per rolling minute, 3 per rolling 10 minutes, and 15 per rolling hour, keyed by canonical customer phone and applied ONLY when `source=website`. POS orders (including POS delivery) and staff-entered phone/WhatsApp/manual/third-party orders are explicitly exempt from this customer-website quota. Idempotency protections still apply to all order sources. A later restaurant rejection/cancellation does not erase a website order's consumed slot. Invalid/rolled-back submissions do not count. Exact idempotent retries return the original order without consuming another slot.

### 14.3 IP trust requirement

For a hosted Edge Function, do not blindly trust X-Forwarded-For or a browser-supplied custom header as the client's identity. Confirm exactly which header is overwritten by the actual Supabase ingress and run a deployment-preview spoofing test by sending forged forwarding headers. Only then enable IP-based buckets. If the authoritative IP cannot be established, rely on authenticated actor/phone limits and an optional verified CAPTCHA/Turnstile step-up rather than pretend the IP limit is secure. CORS is not an abuse-control boundary.

### 14.4 Invocation-quota protection

Because a 429 from an Edge Function still counts as an invocation:
- Do not claim the Postgres limiter prevents function-invocation exhaustion.
- Use function calls only for commands/public server operations; use direct RLS-protected Data API reads for frequent operational fetches where safe.
- Combine catalog metadata/health and snapshot into one request where possible; current separate health + catalog flow should be optimized only in a coordinated API schema-version rollout.
- Keep the POS 15-second polling fallback on RLS-protected Data API queries, not a new Edge invocation every poll.
- Rider own-offer/assignment reads should use targeted Realtime and RLS-protected reads; Edge Functions are for state-changing commands.
- Do not make one Edge Function call another. Avoid one function invocation per line item or modifier.
- Do not create separate functions for each CRUD action. Keep the four current domain functions unless a later security review proves a separate boundary is necessary.
- Cache public catalog response client-side and at supported CDN layers; use publication version/ETag and stale-while-revalidate only after testing actual cache behavior.
- Measure function invocations by project and organization monthly.

### 14.5 Escalation for abusive public traffic

If automated traffic appears, consider a verified Turnstile challenge for guest order creation after a risk threshold. Verify tokens server-side, hostname/action and one-time semantics. CAPTCHA is a second factor, not an authorization or price control. It also does not prevent the attempted Edge Function request from counting. For sustained volumetric attack that threatens the invocation quota, an upstream WAF/proxy or platform-level mitigation is required; application code alone cannot guarantee protection of the quota. Do not purchase Redis/WAF add-ons without an explicit cost decision.

## 15. Edge Function layout and security configuration target

Keep the four existing functions and use action routing with strict allowlists:

| Function | Purpose | Target authentication posture |
|---|---|---|
| flame-chick-catalog | Public read-only published catalog; only approved projection | Public route may need verify_jwt=false; validate project publishable key/route, rate-limit if necessary, expose no private data |
| flame-chick-order-api | Guest website orders plus authenticated POS/staff order commands | Mixed public/staff entrypoint; if verify_jwt=false remains necessary for guests, manually verify every staff JWT and active role; never infer staff from apikey |
| flame-chick-delivery-api | Dispatch, rider offers, pickup, delivery, failure/return, return confirmation | User JWT required; target verify_jwt=true after source/API compatibility tests; every action checks role, branch and rider ownership |
| flame-chick-staff-admin | Staff invitations/role changes and protected Admin commands | User JWT required; target verify_jwt=true after source/API compatibility tests; least privilege and exact role checks |

Current repository config has verify_jwt=false for these functions and handlers contain custom validation. Do not flip settings blindly. Review every handler, client auth header and service-to-service caller, then test platform JWT validation plus application authorization in Preview/local before changing configuration. For the mixed guest order endpoint, public guest submission requires a deliberate unauthenticated route; staff actions still require a verified JWT.

Supabase Function secrets:
- SUPABASE_URL, configured publishable keys, service-role/secret key (server only), branch/config IDs and Rider portal URL are set only in Supabase Function secrets.
- Additional HMAC rate-limit secret stays server-only.
- Never commit or reveal values; never embed service_role/secret in website/POS/Admin/Rider.
- Use built-in secret environment variables where appropriate and minimize custom secrets. Supabase reserves SUPABASE_ prefix for its own variable names; name custom secrets with FLAME_CHICK_ prefix.

Every function:
- Validates HTTP method, content type, body size and allowed action.
- Applies strict CORS allowlist; CORS does not replace auth/rate-limit.
- Validates JWT and calls auth.getUser or equivalent trusted verification for staff/rider paths.
- Validates role and branch on every command.
- Uses server-only secrets and narrow DTOs.
- Returns stable error codes, redacts internal DB errors and PII.
- Uses timeouts/abort signals and bounded result sets.
- Has idempotency on retryable writes.
- Never logs Authorization headers, API keys, full customer address/phone, push tokens, raw payment payload or request body.

### Function workload discipline

- Maximum 256 MB, 2 seconds CPU/request, 150 seconds worker wall-clock: treat these as hard limits, not targets.
- No image resizing, AI, video work, long exports or full catalog rebuild in a request handler.
- No recursive/nested function chain. Keep one request → one handler → one transaction/command.
- No process-wide mutable cache as the source of truth; isolates can be recycled or multiplied. Use DB version pointers and client cache.
- For every endpoint record average and p95 latency, error rate and invocation count using low-volume structured metrics. Do not log every successful request with verbose payloads.

## 16. Query, Realtime, cache and storage strategy

### Reads and database load

- POS order queue: branch-filtered Data API read under RLS with a small select list, pagination/limits and indexes. 15-second polling remains the recovery fallback. Never poll an Edge Function every 15 seconds.
- POS dispatch queue: branch-filtered queue query and bounded offer-expiry sweep only when queue is fetched. The accept command independently rejects at/after 60 seconds.
- Rider portal: own-offer/own-assignment reads under RLS and filtered Realtime; no branch-wide rider list.
- Admin orders: server-side pagination, not loading 1,000+ records at startup. Filter by branch/status/date and select needed columns only.
- Order History: normal paginated fetch/manual refresh; no Realtime subscription.
- Catalog: immutable publication snapshot, cache by version/checksum, one combined health+snapshot fetch where the app contract can be upgraded safely. Keep old valid POS IndexedDB cache until the new snapshot is fully staged and atomically activated.
- Add indexes only from exact query paths and EXPLAIN (ANALYZE, BUFFERS) on representative non-production data. Avoid indexing every filter field.

### Realtime

Current Free quota: 200 peak concurrent connections, 2 million messages/month and 100 messages/second. Keep the established narrow policy:
- POS: new/changed operational orders, delivery tasks and dispatch changes filtered by branch.
- Rider: only offers/assignments for auth.uid() and current rider role.
- Admin: subscribe only if a specific operational dashboard truly needs live updates.
- No website-wide subscriptions, reports or Order History.
- No frequent presence/location heartbeat unless current operations actually require it.
- Subscribe/unsubscribe cleanly; avoid duplicate channels on navigation. Keep POS 15-second polling recovery.
- Realtime events are hints, not authority. Fetch canonical row under RLS after notification.

### Storage and egress

- Keep draft images private; only versioned approved menu media is public.
- Compress/resize WebP/AVIF before upload; Free does not include hosted image transformations in current plan.
- Use immutable versioned filenames for published images and cache-control headers.
- Validate upload MIME, size and ownership; prevent a browser from overwriting/deleting published versions.
- Keep customer/staff/private rider files out of public buckets.
- Avoid serving original oversized photos on each POS/website session.

## 17. Index candidates

Final indexes require query-plan review. Initial candidates:

- branches: UNIQUE(restaurant_id, branch_code)
- user_roles: active assignment indexes on (restaurant_id, user_id) and (branch_id, role_key) with scope-aware partial indexes
- products: (restaurant_id, category_id, is_active, sort_order)
- variants: UNIQUE(product_id, variant_key)
- delivery_areas: (branch_id, is_active, sort_order)
- orders: (branch_id, status, created_at DESC), unique idempotency scope, (branch_id, order_number)
- order_items: UNIQUE(order_id, line_number), (order_id)
- order_status_history: (order_id, occurred_at DESC)
- delivery_tasks: UNIQUE(order_id), (branch_id, status, ready_for_dispatch_at)
- offers: UNIQUE(task_id, offer_round), one-pending-offer partial unique, (rider_user_id, status, expires_at), (branch_id, status, expires_at)
- assignments: one-current-assignment partial unique on task_id, (rider_user_id, status)
- delivery_task_events: (task_id, occurred_at DESC)
- menu_publications: UNIQUE(restaurant_id, version)
- notification_outbox: (status, next_attempt_at) partial index for pending/retry
- rate_limit_buckets: UNIQUE(policy_code, subject_digest), plus last_seen_at for TTL cleanup

Use IF NOT EXISTS only where migration idempotence requires it and verify the resulting index definition; never let that hide a mismatched prior index.

## 18. Migration order and validation gates

The sequence is dependency-oriented; it is not approval to run SQL.

1. Reconcile the already-applied baseline migration only; do not reapply it.
2. Create private schema and tightly restricted helper/limiter infrastructure, schema USAGE and exact function grants.
3. Tenant and branch foundation.
4. Identity and user_roles/staff audit.
5. Catalog authoring tables and constraints.
6. Modifier/customization tables.
7. Deals/components; schedule tables only after schedule decisions.
8. Draft revision and immutable publication tables/commands.
9. Delivery pricing tables and validation commands.
10. Orders, order items/modifier/component snapshots, payments and status history.
11. Delivery tasks/offers/assignments/rider profiles/events.
12. Notification outbox and push subscription handling if the current push workflow requires them.
13. Narrow public catalog projection/function, order/delivery/staff command functions, RLS and explicit grants.
14. Storage policies, selected indexes, targeted Realtime publication.
15. Controlled creation of Production restaurant/branch/owner configuration; menu entered through Admin, not image-seeded SQL.

Before Production:
- Author SQL only on the review branch after this specification is reviewed.
- Apply complete migration chain to an isolated disposable Supabase test project using the same Postgres feature set. Production must stay read-only.
- Current Free organizations allow two active projects and the user's account/project allocation must be checked before creating a second test project; use local Supabase if no safe slot exists.
- Run schema diff, grants catalog queries, Supabase advisors, RLS tests and transaction concurrency tests.
- Test anon, authenticated non-staff, Admin, Owner, Manager, Cashier, Rider and wrong-branch actors.
- Test idempotent retry/lost response, simultaneous offer acceptance, offer deadline boundaries, returned delivery, stale POS order holds and publication rollback.
- Verify backups and restore both database and Storage into a separate target.
- Only exact, reviewed migration batches can be applied to Production after separate explicit approval.

## 19. Operational guardrails and monitoring

Use conservative internal warning thresholds; they are not Supabase-enforced alerts and do not imply platform guarantees.

| Metric | Warning | Action |
|---|---:|---|
| Edge Function invocations | 50% of 500k (250k/month) | Inspect usage by function/route; remove duplicate health/catalog calls |
| Edge Function invocations | 70% (350k/month) | Investigate traffic, client loops, repeated errors and abuse |
| Edge Function invocations | 85% (425k/month) | Tighten caching and app call patterns; prepare degradation response |
| Edge Function invocations | 95% (475k/month) | Stop nonessential function calls and investigate immediately; retain essential order/delivery writes |
| Database size | 70% of 500 MB | Inspect indexes, dead tuples, event retention and snapshot sizes |
| Storage | 70% of 1 GB | Compress/clean orphaned draft media; never delete published assets without retention plan |
| Egress | 70% of 5 GB | Review image/catalog payload sizes and CDN caching |
| Realtime messages | 70% of 2m/month | Identify noisy subscriptions; fall back to polling where appropriate |
| Realtime connections | 70% of 200 | Inspect duplicate channels/stale rider sessions |

Free plan logs retain only one day; permanent audit is in append-only application tables. Keep operational logs structured and redacted. If free quota dashboards do not provide automated alerts, review them manually at least weekly during launch and monthly after stable operation. No claim of zero failures or guaranteed uptime is made.

## 20. Open decisions still requiring the owner

These items remain genuine blockers or implementation details and must not be silently inferred:

1. **Not Listed locality:** collect a separate locality/mohalla label in addition to full address? It must never determine fee.
2. **Deal schedules:** recurring weekday/date-range, overnight, timezone, overlap and branch-scope semantics. Keep schedule authoring disabled until settled.
3. **Kitchen role:** current source has a Kitchen read path; V1 denies it unless owner explicitly approves role and exact fields/actions.
4. **Inventory:** ingredient-level stock/inventory remains excluded unless approved.
5. **Rider arrival event:** does Rider need a distinct arrived-at-restaurant event, or is pickup the next recorded state?
6. **Customer pin retention:** proposed 24-hour precise-coordinate deletion after terminal state; confirm operational support/legal requirements before implementation.
7. **Terminal pin support access:** may Admin/Owner access a pin after terminal state for a support case? Default deny after terminal state until explicitly decided.
8. **Website security audit:** intentionally deferred; mandatory stop-gate immediately before attaching website to database. No website audit is part of this database-only stage.

**Resolved and removed from open questions:** branch resolution; restaurant-wide base menu/prices with branch availability overlays; one role identity per user/restaurant with same-role multi-branch assignment; curated deal choices and explicit surcharges; returned-order payment ledger/refund behavior; no Rider GPS/continuous customer tracking.

## 21. Cross-document implementation contracts

The detailed implementation contracts are maintained in their dedicated documents and remain normative:
- Website-only successful-order phone quota and HMAC event design: [production-database-security-reliability-controls-v1.md](./production-database-security-reliability-controls-v1.md), section 3; [source-schema-consistency-audit-v1.md](./source-schema-consistency-audit-v1.md).
- Universal Website/POS order idempotency, canonical payload fingerprint, replay privacy and command deduplication: [production-database-security-reliability-controls-v1.md](./production-database-security-reliability-controls-v1.md), sections 2 and 10.
- RLS, grants, SECURITY DEFINER and role/function action rules: [production-rls-grant-function-matrix-v1.md](./production-rls-grant-function-matrix-v1.md).
- Static customer drop-off pin, private storage, consent, generated Google Maps URL, Rider/POS authorization and tests: [customer-dropoff-pin-data-contract-v1.md](./customer-dropoff-pin-data-contract-v1.md) and [customer-dropoff-pin-erd-authorization-addendum-v1.md](./customer-dropoff-pin-erd-authorization-addendum-v1.md).
- Full migration readiness, dependency batches, blockers and isolated test plan: [database-v1-migration-readiness-review.md](./database-v1-migration-readiness-review.md).

### 21.1 Website-only quota reminder

Apply 3 rolling orders/minute, 3/10 minutes and 15/hour per normalized submitted phone only to newly committed source=website orders. POS and authenticated staff order sources are exempt. Idempotent replay consumes no additional slot. The event insert and order commit are atomic; failures do not consume quota. Phone HMAC secret is server-only and raw phone/IP are not stored in the limiter event.

### 21.2 Universal idempotency reminder

Website and POS both require server-computed canonical fingerprints and a unique restaurant/branch/source/idempotency key scope. Same key/same payload returns existing order; same key/changed payload conflicts. Exact replay creates no duplicate child rows or side effects. POS bypasses the website phone quota, not idempotency.

### 21.3 Static drop-off pin reminder

One optional fixed customer destination coordinate per delivery order, private in app_private, same transaction as order/task, no direct browser table access. The Rider sees only their current assignment; authorized POS reads follow branch/role. No Rider GPS or continuous customer tracking.

## 22. Official Supabase references

Reference links and plan limits are a dated planning snapshot, not guarantees. Recheck live official documentation and actual project usage before implementation:
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/api/securing-your-api

