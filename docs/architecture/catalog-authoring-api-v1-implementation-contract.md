# Flame Chick Catalog Authoring API — implementation contract

Date: 2026-11-21
Status: implementation specification; no SQL or deployment authorization
Target branch: work/production-source-audit
Target project: adkrxfnawdiljhjaavnj (Mumbai, Supabase Free)

## 1. Purpose and boundary

Implement the Admin/Owner catalog workflow against the already-applied menu V1 schema. The browser must never write catalog tables directly. The browser calls the authenticated `flame-chick-catalog` Edge Function; that function validates a finite action contract and forwards the caller's user JWT and publishable key to narrowly scoped Postgres RPCs. Postgres derives the actor using `auth.uid()`, resolves the active Flame Chick restaurant, and independently verifies the caller has an active restaurant-wide Admin or Owner role.

No service/secret key is used for user-initiated catalog commands. No client-provided actor ID, role, restaurant ID, audit actor, or trusted price is accepted.

## 2. Database command surface

Use explicit, versioned aggregate commands rather than generic table CRUD. Each command:
- runs in one database transaction;
- requires a UUID request_id and expected_revision;
- locks the restaurant's `catalog_draft_state` row before checking the revision;
- rejects stale revisions with a stable `CATALOG_REVISION_CONFLICT` code and current revision;
- validates every referenced row belongs to the same restaurant and correct parent aggregate;
- validates strict JSON object keys/types, text lengths, numeric ranges and array bounds;
- increments draft revision exactly once for a successful aggregate change;
- appends one immutable `catalog_audit_log` event in the same transaction, with actor derived from `auth.uid()`;
- stores an idempotency record/result so retries with the same request_id and same canonical payload return the original result; request_id reuse with different payload is rejected;
- does not leak SQL text, constraint names, or private data in error messages.

Recommended RPCs in schema `app_private` (internal SECURITY DEFINER, owner postgres, `SET search_path = ''`, all objects schema-qualified):
1. `catalog_draft_read_internal()`
2. `catalog_category_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
3. `catalog_category_archive_internal(p_category_id uuid, p_expected_revision bigint, p_request_id uuid)`
4. `catalog_product_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
5. `catalog_product_archive_internal(p_product_id uuid, p_expected_revision bigint, p_request_id uuid)`
6. `catalog_modifier_group_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
7. `catalog_deal_collection_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
8. `catalog_deal_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
9. `catalog_branch_availability_upsert_internal(p_payload jsonb, p_expected_revision bigint, p_request_id uuid)`
10. `catalog_publish_internal(p_expected_revision bigint, p_request_id uuid)`
11. `catalog_rollback_internal(p_publication_id uuid, p_expected_revision bigint, p_request_id uuid)`

Expose only thin `SECURITY INVOKER` wrappers in `public`, with empty search_path and explicit EXECUTE grants to `authenticated`; revoke function EXECUTE from PUBLIC, anon and service_role unless a specific documented system caller requires it. A wrapper must not accept a caller-selected actor or tenant. The internal function repeats all authorization and tenant checks. Do not make a public SECURITY DEFINER function.

A private helper may resolve the actor and restaurant, but its output is not directly callable by app roles. Never rely on user_metadata for authorization. Do not add broad table grants or permissive RLS policies to make the Admin UI work.

## 3. Aggregate payload rules

### Category and subcategory
- `category_kind` is explicit: menu or deal. Never infer it from legacy IDs.
- Category/subcategory parent and restaurant must match.
- Archive is soft (is_active=false); historical snapshots and order references remain intact.

### Product and variants
- Product create/update is one aggregate transaction including its variants.
- Variant kind is an explicit finite enum from the applied schema; validate exact allowed values from the live constraint.
- Variant carries the menu meaning (portion, flavour, pack, volume, standard) and nullable price. NULL means TBD/unpriced and is not purchasable; numeric zero means intentionally free.
- Deal-only components must set `is_standalone_sellable=false`; public standalone checkout must reject them.
- Do not delete variants that are referenced by a published snapshot or historical order; archive instead.
- Branch availability is an overlay and must not mutate global base price.

### Modifier groups and prices
- Product assignments must reference same-restaurant product and modifier group.
- Modifier pricing uses exact `product_variant_id`, never `size_key` matching.
- BY_VARIANT rule missing for a selected variant is a validation error, never a zero price.
- Distinguish selection count from selected unit quantity in payload validation. Do not implement a generic free allowance until separately specified.
- A modifier group can be reused by multiple products only when each assignment is explicitly saved.

### Deals
- A deal is an individual purchasable offer; a deal collection is a display grouping (e.g. Flame Hour or Kids Deals).
- Each component group defines required/optional status, minimum/maximum selections, and component unit quantity bounds.
- Each option points to an exact eligible product variant, not a fuzzy category or size label.
- Pricing treatment is explicit: INCLUDED, SURCHARGE, or STANDALONE. INCLUDED adds zero; SURCHARGE adds configured nonnegative surcharge per component unit; STANDALONE adds the selected variant's standalone price. Never add component standalone price again to a fixed bundle price.
- Component-level modifier selections are validated against product modifier assignments and exact variant pricing.
- Reject cycles/nested deals in V1.
- Incomplete deals may be saved as drafts; publication validator blocks missing required groups/options/prices.

### Schedules and branch availability
- Use database timestamp captured once per validation/compile operation.
- Use restaurant IANA timezone unless branch override is configured.
- Weekly windows use ISO weekday; overnight windows belong to their start weekday and match after midnight against the prior weekday.
- Effective dates are local calendar dates; start is inclusive and end is exclusive.
- One-off windows use timestamptz start inclusive/end exclusive.
- No cron job toggles active flags; eligibility is evaluated at quote/checkout time.
- Flame Hour's 3–5 PM window may be entered, but publication must require weekdays to be configured.

## 4. Publication and rollback

Publish is one transaction:
1. Lock draft state and verify expected revision.
2. Run full graph validation: active category, products, variants, modifier groups/rules, deals, component groups/options, schedules and branch overlays.
3. Reject NULL prices on any purchasable product/variant/component path.
4. Reject references to inactive/missing/cross-tenant rows and deal cycles.
5. Compile canonical schema-versioned JSONB from normalized tables.
6. Compute SHA-256 over canonical JSON representation in the database and insert immutable `catalog_publications`.
7. Atomically update `catalog_current_publication` pointer.
8. Append publication audit entry.
9. Return publication ID, number, revision, checksum and warnings.

Rollback does not edit or delete a publication. It atomically points `catalog_current_publication` to an existing immutable publication after validating restaurant ownership and records who initiated the rollback. Historical publication rows remain immutable.

Branch availability overlays need a deterministic representation in the published contract. If operational availability must change without republishing, publish immutable base catalog plus a separately versioned branch-availability projection; quote/checkout captures both version IDs. Do not silently mix mutable availability into an otherwise immutable snapshot.

## 5. Edge Function contract

`flame-chick-catalog` is one domain function, not one function per button:
- GET `/catalog?branch=<uuid>`: public, reads current immutable publication and safe branch availability projection only; returns DTO schema version, publication ID/checksum, branch context and cache validators.
- POST `/admin/draft/read`: authenticated Admin/Owner only.
- POST `/admin/category/upsert`, `/admin/category/archive`
- POST `/admin/product/upsert`, `/admin/product/archive`
- POST `/admin/modifier-group/upsert`
- POST `/admin/deal-collection/upsert`, `/admin/deal/upsert`
- POST `/admin/branch-availability/upsert`
- POST `/admin/publish`, `/admin/rollback`

Each route maps to exactly one named RPC and an allowlisted payload. No generic RPC proxy, client-selected RPC name, arbitrary table name, or raw PostgREST forwarding.

Authenticated calls use `apikey: <publishable key>` and `Authorization: Bearer <user JWT>`. Keep `verify_jwt=true`; no redundant `/auth/v1/user` round trip when gateway verification plus database `auth.uid()` checks are present. The database command is authoritative. Public GET is the only unauthenticated catalog route; function gateway config may disable JWT only for this mixed public-read function, while every admin route must enforce a valid user JWT in the handler and DB.

CORS allowlist is exact configured website/admin origins, but CORS is not authentication. Reject unknown browser origins. Cap request body (16 KiB for simple commands; define a separately justified higher bound for deal aggregate), validate Content-Type, method, UUIDs, enum values and nesting. Return generic stable error envelopes and request IDs. Do not log tokens, PII, complete payloads, or secret configuration.

## 6. Performance and Free-tier constraints

- Keep four domain Edge Functions total; don't create one function per RPC.
- Admin saves are user actions, not autosave-per-keystroke. Debounce UI state locally and submit one aggregate save.
- Use a single RPC transaction per aggregate, avoiding sequential REST writes and partial saves.
- Read draft via bounded, purpose-built projection; page audit history (default 50, max 200).
- Public catalog reads one snapshot row plus one branch overlay query (or cached immutable snapshot); no per-product N+1 queries.
- Return only fields used by each screen. Use stable pagination and indexed filters.
- Cache public snapshots by publication ID with ETag/If-None-Match; private draft/admin responses are no-store.
- Avoid Realtime for catalog draft keystrokes. Use explicit refresh or a lightweight invalidation event only after publish if multiple Admin sessions need it.
- Do not add polling or scheduled jobs just to update offer active flags.

## 7. Acceptance tests before enabling Admin catalog

Authorization:
- anon denied for every admin RPC.
- authenticated customer/no role denied.
- manager/cashier/rider denied.
- Admin and Owner accepted.
- branch-scoped roles denied even if role key is Admin/Owner due to required restaurant-wide membership.
- forged actor/restaurant IDs ignored/rejected.
- cross-restaurant category/product/variant/modifier/deal references rejected.

Concurrency and integrity:
- two writes with same expected revision: one succeeds, other gets revision conflict.
- duplicate same request ID and identical payload returns same result without duplicate audit/revision.
- same request ID with altered payload conflicts.
- aggregate failure rolls back every child write, revision increment and audit.
- variant price NULL blocks publish but zero remains valid.
- modifier exact variant price rule missing blocks publish/quote.
- deal group cardinality, quantity and surcharge validation.
- schedule overnight prior-weekday, effective date, one-off boundary and branch timezone cases.
- publish snapshot checksum, immutability, pointer atomicity and rollback to older publication.
- no client direct table CRUD; no secret key in browser bundle.

Release gate:
- SQL functions and grants reviewed against live catalog schema.
- Supabase Security and Performance Advisors reviewed.
- Edge Function source-to-RPC contract test passes.
- Admin direct REST writes removed and all catalog UI modules remain disabled until API integration passes.
- No menu seed or Production deployment until explicit launch/data-entry approval.
