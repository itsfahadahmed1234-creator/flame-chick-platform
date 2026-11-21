# Flame Chick Catalog Authoring Command API V1

Date: 2026-11-21
Status: implementation contract; no RPC or Edge Function deployed
Target project: `adkrxfnawdiljhjaavnj`
Working branch: `work/production-source-audit`

## 1. Scope of this implementation slice

Implement the secure Admin/Owner command boundary for the menu catalog. The browser must never write catalog tables directly. The first command slice covers draft reads, categories/subcategories, products/variants, modifier groups/options/assignments/variant pricing, and branch sellability. Deal authoring and publication are separate subsequent slices because they need complete aggregate validation and snapshot compilation.

No business data is seeded by this work.

## 2. Verified live database facts

Read-only inspection on 2026-11-21 confirmed:
- Project is ACTIVE_HEALTHY, PostgreSQL 17.12, Mumbai.
- Catalog and menu V1 tables are owned by postgres and RLS-enabled with no app-role direct CRUD grants.
- `catalog_draft_state`, `catalog_audit_log`, `catalog_publications`, and `catalog_current_publication` already exist.
- `product_variants.price` is nullable NUMERIC; NULL is TBD, never silently converted to zero.
- `product_variants.variant_kind`, `pack_quantity`, `pack_unit`, and `is_standalone_sellable` exist.
- `modifier_price_rules.product_variant_id` is the required exact variant key.
- `branches.timezone` can override `restaurants.timezone`.
- Existing Staff Admin uses a public SECURITY INVOKER wrapper that calls a private SECURITY DEFINER implementation. The private implementation derives `auth.uid()`, uses an empty search_path and fully-qualified references. Catalog commands should follow this established boundary.

## 3. Security boundary

### Public PostgREST wrapper
- One fixed RPC: `public.flame_chick_catalog_admin_command(p_action text, p_payload jsonb)`.
- Wrapper is SECURITY INVOKER, owned by postgres, `SET search_path = ''`.
- Wrapper delegates only to `app_private.flame_chick_catalog_admin_command_internal`.
- EXECUTE granted only to `authenticated`; revoked from PUBLIC, anon and service_role unless a separately reviewed system command is later justified.
- No generic table-name, SQL, schema-name, or function-name input.

### Private implementation
- SECURITY DEFINER, owner postgres, `SET search_path = ''`, every object schema-qualified.
- Derives actor only from `auth.uid()`; ignores/rejects client actor IDs and role claims.
- Resolves the active Flame Chick restaurant from the database; never trusts restaurant_id from the client.
- Requires active user profile and active restaurant-wide `admin` or `owner` role (`branch_id IS NULL`). Manager/Cashier/Rider are denied.
- Verifies Auth user is not deleted.
- Validates all IDs and relationships belong to the resolved restaurant; branch IDs must be active branches of that restaurant.
- Never returns secrets, Auth metadata, unrelated staff data, or raw database errors.
- All write actions execute in one database transaction.

### API request safety
- Maximum JSON body 64 KiB at Edge Function; maximum nesting/array sizes validated in SQL.
- UUIDs parsed strictly; unknown keys rejected per action schema.
- Request ID is a client-generated UUID. Same request ID + same canonical action/payload returns the prior result; reuse with different content is a conflict.
- Every write requires `expected_revision`. Lock the restaurant's draft row with `FOR UPDATE`; compare revision, apply the full aggregate, append audit, and increment revision atomically.
- Audit actor, role, action, entity, request ID, revision before/after and compact before/after state in the same transaction.
- No direct UPDATE/DELETE/TRUNCATE privileges or permissive RLS policies are added to catalog tables.

## 4. Command contract

| Action | Purpose | Atomic behavior |
|---|---|---|
| `get_draft` | Read bounded draft catalog for Admin UI | Admin/Owner only; paginated/bounded response |
| `upsert_category` | Create/update menu or deal category | Validate category_kind and unique name/order constraints |
| `archive_category` | Soft archive category | Reject while active products/subcategories remain unless included in same aggregate |
| `upsert_subcategory` | Create/update subcategory | Parent category kind/tenant must match |
| `upsert_product` | Create/update product and complete variants | Product + variants + revision + audit all-or-nothing |
| `archive_product` | Soft archive product | Preserve variants and historical publication snapshots |
| `upsert_modifier_group` | Save group, options, assignments and exact-variant price rules | Entire modifier aggregate atomic; validate selection bounds |
| `set_branch_sellability` | Set product/variant availability for branch | Validate branch and product tenant; variant must belong to product |
| `upsert_deal_collection` | Later slice | Not exposed until deal validation is complete |
| `upsert_deal` | Later slice | Deal + groups + allowlist options + schedule assignment atomic |
| `publish` / `rollback` | Later slice | Not exposed until immutable snapshot compiler and validation are tested |

### Product aggregate payload
- Product identity and editable fields (category, optional subcategory, English/Urdu names and descriptions, image metadata allowlist, featured, sort order, active/available).
- Complete variant array: stable variant ID for updates, typed `variant_kind`, label/key, nullable price, sort order, active/available, pack quantity/unit, standalone-sellable.
- Reject duplicate variant keys; reject unknown fields; reject a variant whose ID belongs to another product/restaurant.
- A variant with NULL price may exist as a draft but cannot pass publication validation or checkout.
- A genuine zero price remains valid and distinct from NULL.

### Modifier aggregate payload
- Group selection mode, min/max selections, active state and sort order.
- Modifier options and price modes; no client-computed prices.
- Product assignments explicitly identify eligible products.
- Variant price rules key by exact `product_variant_id`, modifier ID and product ID; verify the variant belongs to that product and modifier belongs to the same restaurant.
- Missing required price rule is a validation error; never treat it as free.
- Keep modifier quantities and free allowance outside this first authoring slice until the pricing engine's golden tests are complete.

## 5. Revision and idempotency model

- Lock order: restaurant draft row first, then entity rows in deterministic UUID order.
- Check expected revision after acquiring the lock.
- Persist a request fingerprint (SHA-256 over normalized action + canonical payload) alongside the audit request ID, or introduce a dedicated private idempotency table if the current audit constraints cannot safely serve this role.
- On retry, identical fingerprint returns the original result; a different fingerprint for the same request ID raises `CATALOG_IDEMPOTENCY_CONFLICT`.
- Increment revision exactly once per successful aggregate write.
- Failed validation leaves no entity changes, audit row, or revision increment.
- Avoid long-running external calls inside the database transaction.

## 6. Edge Function contract

Function: `flame-chick-catalog-admin` (new authenticated command surface) OR an explicit authenticated POST route on the existing catalog function after its public snapshot route is reconciled. Preferred: retain the four-domain-function architecture and add authenticated POST to `flame-chick-catalog`, with separate finite action allowlist.

- `verify_jwt = true`.
- Client uses publishable key + user access token. Publishable key is not identity.
- Edge Function uses the caller's bearer token for the public wrapper RPC; it must not substitute service-role/secret key for user context.
- CORS allowlist comes from environment configuration, exact origin matching, no wildcard.
- Methods GET/POST/OPTIONS only; explicit content-type; body <= 64 KiB; reject unknown action and unknown payload keys.
- Generic, stable error envelopes; no raw Postgres details returned.
- Request ID propagated for correlation but never logged with personal data.
- No second `/auth/v1/user` call; gateway verifies JWT and DB command independently derives actor from `auth.uid()`.
- Do not deploy until function config, DTO contract and command RPC are present and verified.

## 7. Tests required before enabling Admin catalog UI

### Authorization
- anon denied; authenticated without role denied; Manager/Cashier/Rider denied; inactive profile denied; deleted Auth user denied.
- Admin and Owner accepted.
- forged actor/restaurant/role fields ignored or rejected.
- cross-restaurant category/product/variant/modifier/branch IDs rejected.

### Atomicity and concurrency
- stale expected revision conflicts.
- same request ID + same payload is idempotent.
- same request ID + different payload conflicts.
- concurrent edits at same revision: exactly one succeeds; loser gets revision conflict.
- injected failure after parent write rolls back child rows, audit and revision.

### Catalog integrity
- duplicate category/product/variant keys rejected.
- subcategory category-kind mismatch rejected.
- product variant cannot be reassigned across product.
- modifier price rule requires exact same-product variant.
- missing BY_VARIANT price rule blocks validation; NULL price is not zero.
- archived parents cannot receive active children.
- branch availability cannot reference another tenant or mismatched product/variant.

### Audit and publication
- actor and role are derived from DB, not payload.
- audit is append-only and records request ID + revision transition.
- no public direct CRUD privileges or new RLS policies.
- draft writes never mutate existing publication snapshots/current pointer.
- later publish test proves immutable snapshot checksum and atomic pointer swap.

## 8. Implementation and release gates

1. Complete exact live constraint/index/ACL inventory for each aggregate table.
2. Implement private command function + invoker wrapper in a new migration.
3. Run SQL syntax, role, tenant, idempotency, revision and rollback tests against the actual pre-launch project using controlled test fixtures inside a rollback-only transaction where feasible.
4. Run Supabase security and performance advisors; inspect function owner, search_path, grants, RLS, policies and FK indexes.
5. Implement the Edge Function route and typed request/response DTO.
6. Replace Admin direct REST CRUD only after command QA is green.
7. Keep catalog modules disabled until publication compiler and public snapshot reader are complete.

No Production schema changes, function deployments, menu seeding or UI enablement are authorized by this design document.
