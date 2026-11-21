# Catalog command implementation — first-slice preflight

Date: 2026-11-21
Branch: work/production-source-audit

## Live schema facts verified
- Existing catalog tables are postgres-owned, RLS-enabled, with no direct app-role table grants.
- `app_private` schema grants USAGE to authenticated but not anon/service_role; internal functions must have exact EXECUTE ACLs.
- Existing `flame_chick_staff_admin_command(text,jsonb)` is SECURITY INVOKER, empty search_path, and delegates to a postgres-owned SECURITY DEFINER internal function with empty search_path.
- `user_roles` contains restaurant_id, user_id, role_key, branch_id, is_active. Catalog writes require active restaurant-wide Admin/Owner membership (branch_id IS NULL), plus active restaurant and active user profile.
- `catalog_draft_state` has one row per restaurant, revision bigint and updated_by/updated_at.
- `catalog_audit_log` has unique (restaurant_id, request_id), actor identity/role, action/entity, before/after JSON, revision range and occurred_at. It does not store canonical request payload/hash or replay result.
- Product/variant/category/subcategory constraints and tenant-composite FKs were inspected directly in Production.
- Products are constrained to category_kind='menu'. Deal categories are separate; do not store deal items in products.

## Required design adjustment
The existing audit unique request key is insufficient for safe idempotent replay: a retry must prove the same canonical payload and return the original command result. Before exposing writes, add a private idempotency ledger (restaurant_id, request_id, payload_hash, response_json, created_at) with a unique restaurant/request key, restricted to postgres. Same request/same hash returns stored result; same request/different hash is rejected. Audit remains the immutable human-readable actor history.

## First implementation slice
1. Bounded authenticated draft read.
2. Category and subcategory aggregate upsert.
3. Product + variants aggregate upsert (variants change only when an explicit array is supplied; omitted means unchanged).
4. One draft revision lock/check/increment per aggregate command.
5. One append-only audit row in the same transaction.
6. Same-request/same-payload replay; same-request/different-payload conflict.
7. Admin/Owner restaurant-wide authorization derived from auth.uid().
8. Public SECURITY INVOKER wrappers and private SECURITY DEFINER internals with empty search_path.

## Guardrails
- Do not apply migration until command SQL has been linted and exercised with test fixtures inside a transaction that is rolled back.
- No restaurant, branch, staff or menu data seeding.
- No generic RPC proxy or direct table CRUD.
- Migrations remain forward-only.
- Existing API and Admin direct REST paths remain disabled until end-to-end integration passes.

## Workflow
Pinned Supabase CLI v3.2.0 scaffold workflow run:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/44909661936
It created empty migration `20261121133607_flame_chick_catalog_commands_v1.sql`; no database credentials were used.

No SQL command migration has been applied. No Edge Function has been deployed. No Production schema or data changed during this task.
