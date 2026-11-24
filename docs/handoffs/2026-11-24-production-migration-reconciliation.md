# Flame Chick Production migration reconciliation — read-only

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Verified source checkpoint:** `1ea0b6762d0c16bc2efed3dcc2923cc2626eebea`  
**Disposable QA:** [45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)

## Migration inventory

- Source branch: 33 SQL migrations.
- Production ledger: 26 migrations.
- All 26 shared version/name pairs match exactly.
- No Production-only versions and no migration-name mismatches.
- Seven branch migrations are pending in Production:
  - `20261123160000 flame_chick_operational_schema_v1`
  - `20261123170000 flame_chick_staff_role_projection_rpc_v1`
  - `20261123171000 flame_chick_delivery_offer_identity_guard_v1`
  - `20261123172000 flame_chick_delivery_commands_v1`
  - `20261123173000 flame_chick_payment_collection_v1`
  - `20261123174000 flame_chick_website_order_create_v1`
  - `20261123174100 flame_chick_website_order_idempotency_lookup_v1`

## Corrected function-source hash chain

The previous warning was incorrect: it compared a migration's before-state preflight with the live after-state. Exact source function bodies were hashed using PostgreSQL-compatible UTF-8 and outer newlines. The hashes establish the intended chain:

| Stage | Function prosrc SHA-256 | Result |
|---|---|---|
| Catalog public read before time metadata | `450bb2ea8671bcc5812400f49323efeef2aa3f1d2e6e5c9dbe6c919e4` | Matches 23101105 preflight |
| Catalog public read after time metadata | `110dc450d835d15662a01bc72c7d750933ee145834a0abee75f45ea4700abab2` | Matches live Production |
| Validator after 22105821 fixes | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` | Matches 23101126 preflight |
| Snapshot compiler after 22105821 fixes | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` | Matches 23101126 preflight and live |
| Validator after deal-only pricing | `270133a76cb649e70190945028b87b916b9e946d63e2794550fef31ad3fec86d` | Matches live Production |

Live function ownership/security were also read-only inspected: owner `postgres`, SECURITY DEFINER and empty search path; public catalog read ACL is restricted to `service_role`.

## Live operational schema status

These Production objects remain absent (NULL): `public.orders`, `public.order_items`, `public.delivery_tasks`, `public.delivery_task_offers`, `public.rider_profiles`, website-order create RPC, delivery command RPC and payment collection RPC.

This is not drift: the seven operational migrations are not in the live ledger and are intentionally still source-only.

## Test proof

The full local QA [run 45311516506](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506) passed:
- full 33-migration replay on disposable Supabase;
- role/RLS/security, operational schema and delivery tests;
- actual Order API handler -> local PostgREST -> PostgreSQL quote/create/replay/stale-fee/tamper/conflict checks;
- 4 delivery and 2 payment concurrency races;
- full local stack teardown with `--no-backup`.

## Safety / next step

No Production migration, SQL, secret or deployment was performed. No live ledger editing or migration renumbering is required for the already-applied catalog migrations.

Next: make a read-only final rollout checklist for the seven pending migrations, including sequencing, grants/RLS, role checks, rollback/recovery and deployment dependencies. Do not push any migration, set secrets, deploy functions or enable checkout in this checkpoint.
