# Flame Chick Website Order API → local PostgreSQL E2E checkpoint

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Source head:** `c90e592f6c76ea0769c6c7fc921ab12afd22de1a`  
**Workflow:** [45311516506 — SUCCESS](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45311516506)

## Actual request path tested

The test imports and calls the real `handleOrderApiRequest(req)` from `supabase/functions/flame-chick-order-api/index.ts`. Supabase REST/RPC dependencies are not mocked. The handler connects to the fresh local Supabase API/PostgREST and invokes the actual PostgreSQL RPCs after the complete migration chain has been replayed.

The disposable catalog is synthetic. A real local catalog publication row is inserted with its checksum computed inside PostgreSQL. The test inserts a synthetic restaurant/branch, menu category, product, standalone variant, branch availability and delivery area. It uses synthetic customer/order data only.

## Checks that passed

1. Read actual current local catalog publication metadata.
2. Request a signed quote for a listed delivery area and verify current database fee.
3. Change the local delivery-area fee after quote; submit the old token and verify HTTP 409 stale-quote rejection.
4. Restore the fee; alter the token signature and verify HTTP 409 invalid-token rejection.
5. Submit a valid signed quote and commit through actual local PostgREST/RPC.
6. Retry the exact request; verify the original order is returned without a second insert.
7. Reuse the idempotency key with changed customer facts; verify conflict rejection.
8. Verify persisted PostgreSQL rows and order financial/operational state.
9. Verify test fixture cleanup boundary, then stop the entire local Supabase stack with `--no-backup`.

Deno reported `1 passed | 0 failed`. The route-test log states:
`Real local Order API → PostgREST → PostgreSQL: stale fee, tamper, commit, replay and conflict checks passed.`

The SQL verifier confirms one website order, one order item, one initial status-history row, one delivery task, one phone quota success event, and zero payment rows. It confirms `status=new`, `payment_status=unpaid`, `paid_amount=0`, `completed_at=NULL`, and delivery task `dispatch_pending`.

## Full workflow results

The same run also passed:
- full migration replay;
- staff ACL/RLS and role-boundary suites;
- operational-schema V1 security/constraint checks;
- delivery command and website order SQL tests (idempotency + 3/minute, 3/10-minute, 15/hour quotas);
- four delivery race cases;
- two payment collection concurrency races, including prevention of duplicate or excessive payment collection;
- disposable local Supabase teardown.

## Business rule preserved

Rider marking Delivered does not collect payment. The created order remains `new/unpaid` during the synthetic website create test; only Cashier payment collection completes an order and moves it to History. No automatic payment or tax behaviour was added. GST stays deferred.

## Release gate

This successful local run does **not** apply migrations or deploy code to Production. Production is still missing the operational order/delivery/payment tables/RPCs. Do not deploy the Order API until migration reconciliation, the server-only `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET`, delivery-area/default-fee setup, and a separate release review are complete.

## Next task

Read-only migration reconciliation: compare the complete current branch migration set and embedded preflight hashes with Production's migration ledger and live function source hashes. Do not change Production, alter its ledger, or push migrations during this audit.
