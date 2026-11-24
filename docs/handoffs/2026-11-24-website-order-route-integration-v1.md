# Flame Chick Website Order API route integration checkpoint

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Source commit:** `a3774b80d0414ec20f71b6f2f5b9046ac28e1251`

## Route-level test

- Exported `handleOrderApiRequest(req)` from the Order API. The deployed entrypoint still calls `Deno.serve` when `import.meta.main` is true.
- Added `supabase/functions/flame-chick-order-api/index_test.ts`.
- The test sends real Request objects into the actual handler. It uses a synthetic published-menu fixture and mocked Supabase REST/RPC responses.
- Tests cover quote issue, price/fee binding, absence of raw PII in token, stale fee, tampering, exact expiry, valid create, retry after quote expiry and changed-facts request-ID conflict.

## CI results

- [Edge Function Static Checks run 45309012736](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012736): Deno check and new route test passed, as did existing Edge/RPC/pricing/token tests.
- [Admin Static Checks run 45309012932](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45309012932) passed.

## Important limitation

The route integration test mocks Supabase HTTP dependencies. The existing SQL fixture separately tests real PostgreSQL order create, delivery fee revalidation, idempotency and rolling phone quotas on disposable local Supabase. There is not yet one combined HTTP-to-real-Postgres test. The next QA step must run the local Edge route against disposable local Supabase with synthetic tenant data, complete migration replay and rollback/cleanup.

## Release boundary

`FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET` is required as a server-only Edge Function secret before Order API deployment. Production operational/order/delivery/payment migrations, delivery areas/default fee, Edge deployments and Vercel deployment remain outstanding. No Production or deployment changes occurred. GST remains deferred.
