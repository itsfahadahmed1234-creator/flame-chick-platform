# 2026-11-21 — Catalog authoring API contract prepared

Working branch: `work/production-source-audit`
Commit: `369c545135ed909532ace1ab65111abfec6f281a`
Architecture contract: `docs/architecture/catalog-authoring-api-v1-implementation-contract.md`

## Live state rechecked
- Supabase project `adkrxfnawdiljhjaavnj` is ACTIVE_HEALTHY, Postgres 17.12, Mumbai.
- Migration ledger includes menu V1 version `20261121125542`.
- Menu V1 tables are present, postgres-owned and RLS-enabled.
- No restaurant/branch/catalog rows are seeded.
- Existing staff command functions were inspected: user-facing public wrapper is SECURITY INVOKER with empty search_path; internal authorization derives `auth.uid()`; system invitation wrapper is SECURITY DEFINER and restricts JWT role to service_role.
- Existing catalog Edge Function remains incompatible with the current schema and must not be deployed.

## Work completed
Prepared the detailed catalog authoring command and Edge Function contract, including:
- explicit aggregate RPC command list and strict allowlisted action routes;
- Admin/Owner-only actor and tenant validation;
- expected draft revision, idempotency and same-transaction audit;
- typed variants, exact variant-based modifier pricing and deal component rules;
- schedule/timezone validation;
- immutable snapshot publication and pointer-only rollback;
- private draft vs public catalog cache behavior;
- bounded payloads, paginated audit, no autosave-per-keystroke and no catalog Realtime churn;
- authorization, concurrency, pricing, schedule and publication acceptance tests.

## Not done / next
This is a specification commit only. No SQL functions/RPCs were created, no migration applied, no Edge Function deployed, and no Admin UI enabled.

Next implementation step: inspect the complete applied menu V1 DDL and exact check/unique/FK constraints, then author the first SQL command migration for draft read + category/product aggregate writes. Implement all commands incrementally with tests and explicit grants. After RPCs pass live schema/security verification, implement the Edge Function action router and update Admin to use it. Do not deploy the public catalog function until it reads the immutable snapshot contract.

No Production data or schema was changed in this task.
