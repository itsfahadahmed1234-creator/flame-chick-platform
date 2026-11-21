# Flame Chick — Secure Catalog Authoring API Handoff

Date: 2026-11-21
Branch: `work/production-source-audit`
Status: source audit complete; implementation not yet started
Production project: `adkrxfnawdiljhjaavnj` (Mumbai, Free)

## Verified Production state

- Core catalog migration `20261121061000_flame_chick_catalog_authoring_foundation` is recorded as applied.
- FK-index migration `20261121062000_flame_chick_catalog_fk_indexes` is recorded as applied.
- 11 core catalog tables exist, all owned by `postgres`, RLS enabled, zero policies, zero Realtime entries, and zero direct table grants to `anon`, `authenticated`, and `service_role`.
- All 15 reviewed FK indexes exist and are owned by `postgres`.
- All 11 catalog tables remain empty.
- No catalog command RPCs, publication tables/pointer, catalog audit log, deals schema, delivery-area schema, or Admin catalog API are deployed.
- No Edge Function has been deployed; Vercel projects remain unconfigured and undeployed.

## Source audit findings

### Admin source

Current file: `apps/flame-chick-admin/app.js`.

The UI bootstraps through `flame-chick-staff-admin`, then catalog navigation is disabled pending secure APIs. The source still contains direct browser PostgREST reads and writes. Direct writes include:
- Categories and subcategories: insert/update/delete.
- Products and variants: insert/update/archive/delete, including multi-row pricing-type conversion.
- Deals and deal components: create/update/archive/delete, currently sequential and potentially partially persisted.
- Delivery areas and restaurant settings: direct insert/update/delete.
- Product/category/deal image metadata updates are direct REST writes after browser-authenticated Storage upload/delete.

These direct table writes must not be enabled: the core catalog tables intentionally have no direct app-role grants. Replace with authenticated server commands; do not loosen RLS/table grants to make legacy code work.

### Current catalog Edge Function

File: `supabase/functions/flame-chick-catalog/index.ts`.

- Public GET only; CORS currently wildcard and method allowlist GET/OPTIONS.
- Uses server-side secret key to query mutable catalog tables and reconstruct schema-v2 DTO.
- Reads additional tables not created by the core foundation: `deals`, `deal_components`, `delivery_areas`, `restaurant_settings`.
- Computes published from restaurant active state and presence of products/variants; this is not a real publication workflow.
- Must not be deployed as the production public catalog until the published immutable snapshot/pointer is implemented and the DTO is reconciled.
- Future Admin commands must derive actor from verified JWT and authorize Admin/Owner in PostgreSQL using `auth.uid()` plus active `public.user_roles`. Never accept actor/role/restaurant IDs as authority from request JSON.
- Public GET should read only the immutable current publication. Admin draft commands must be a separate authenticated route and must never use the public read secret as authorization.

### Existing database authorization pattern

Batch 4 provides `public.flame_chick_staff_admin_command` as an authenticated public wrapper that uses `auth.uid()`, resolves the active Flame Chick tenant, verifies Admin/Owner from `public.user_roles`, and delegates privileged work under controlled ownership. Use it as a pattern only after inspecting exact ownership/grants; do not reuse its role-specific implementation blindly.

## Recommended implementation boundaries

1. Create a new migration for catalog draft state/revision, append-only catalog audit, publication snapshot, and current-publication pointer. Keep every object owned by `postgres`; RLS/ACL explicit; no direct table grants.
2. Add narrowly scoped RPCs with `SECURITY DEFINER`, empty search_path, verified `auth.uid()`, server-resolved tenant and role, explicit action allowlist, request idempotency, expected draft revision and transaction-level row locking.
3. First commands should cover category, subcategory, product+variants aggregate, modifier group+modifiers+size-price rules aggregate, branch availability override, archive, and draft read. Every multi-row operation is atomic.
4. Append audit rows in the same transaction with actor ID/role, action, entity IDs, request ID, revision before/after, safe before/after data and timestamp. Deny audit UPDATE/DELETE/TRUNCATE.
5. Add publish/rollback only after snapshot schema, complete catalog DTO and validation are settled. Snapshot immutable, checksum/versioned, pointer switch atomic.
6. Implement Edge Function Admin POST using user's Bearer JWT to call authenticated RPC; CORS exact origin allowlist; strict payload size/type/field allowlists; never accept client-supplied actor identity.
7. Keep public catalog GET separate and snapshot-only. Keep secret key server-side, no public direct table access.
8. Migrate Admin reads/writes in a disabled UI path; use server draft-read commands and aggregate mutations. Keep nav disabled until all routes and tests pass.
9. Keep deal schema, deal choice groups, schedules, delivery areas, restaurant settings, image lifecycle and storage cleanup as explicitly separated domain decisions. Do not pretend these are covered by the 11-table core schema.
10. Add tests for role denial (Manager/Cashier/Rider), tenant crossing, stale revision, concurrent edit serialization, request replay, partial write rollback, archived-reference protection, NULL-vs-zero pricing, image ownership/path validation, publication immutability and rollback pointer.

## Non-negotiable safeguards

- No service-role/secret key in browser code.
- No direct `anon`/`authenticated`/`service_role` grants on catalog tables.
- Admin and Owner only for catalog authoring/publish/rollback; Manager/Cashier/Rider denied.
- Browser-supplied IDs are selectors only; validate every ID belongs to resolved Flame Chick tenant and relationship graph.
- Do not trust browser prices, branch IDs, role, actor IDs, image paths, active flags, or publish state without server-side validation.
- Never hard-delete a product/variant referenced by orders or deals; archive instead.
- No seed rows until first Admin bootstrap and menu authoring flow are ready.
- No deployment or live Admin enablement before tests and explicit readiness review.