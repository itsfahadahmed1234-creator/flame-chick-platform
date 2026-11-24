# Flame Chick Website V3 — Signed quote protection checkpoint

**Date:** 2026-11-24  
**Repository:** `itsfahadahmed1234-creator/flame-chick-platform`  
**Branch:** `work/production-source-audit`  
**Commit:** `520e79e0276bfea205d7a3ebdb2bf6931e947b86`

## Intent

Ensure the customer has explicitly reviewed the exact server-calculated cart, branch, fulfilment and delivery fee before an order can be committed. A changed price or delivery fee must require a fresh quote and customer review.

## Server flow

1. `quote_website_order` loads the current published V3 catalog and current branch/delivery configuration.
2. The pricing module validates IDs and choices and calculates the authoritative canonical order using integer/minor-unit-safe pricing and DB time.
3. The Order API returns the visible quote and a signed, three-minute HMAC-SHA-256 token. The opaque token carries no raw customer or delivery data.
4. `create_website_order` first checks idempotent replay. For a new request, the API recalculates the canonical order from current source data and verifies that the signed token represents that exact canonical order and is not expired.
5. The server then derives the phone privacy digest and calls the service-only database commit RPC.
6. The database transaction independently rechecks current publication, branch settings, delivery fee, totals, duplicate request identity and the rolling phone quotas. This is the final authority.

## Browser flow

- Website V3 will not submit until the quote response includes a non-empty token and expiry.
- The quote token, quote and checkout body stay in page memory.
- Only a random checkout request UUID is stored in sessionStorage. No customer information, address or cart is stored persistently.
- A new secure random UUID and a successful sessionStorage write/read are required before submitting.
- Uncertain same-page responses preserve the exact request ID/body and offer a retry. Definite conflict/rate-limit failures clear the retry ID and force a fresh quote.

## Test evidence

- Website Static Checks run 45308055860 — success on current commit: 103 core tests, 25 preview tests, JavaScript syntax and inline-script parsing all passed.
- Edge Function Static Checks run 45233268331 — success on parent code commit 38d4501bc8f372eceed0e4316dadd8e7348b4081: Deno checks and 42 Edge/RPC/pricing/quote tests passed.
- Quote token tests explicitly prove exact canonical binding, no raw customer/address leakage, stale order/fee rejection, exact expiry rejection, tampered-signature rejection, missing-token rejection, and fail-closed behavior for unavailable secret/invalid DB time.

## Configuration and deployment prerequisites

- New required Edge Function secret: `FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET`. Use a separate unpredictable random secret of at least 32 bytes. Do not reuse a Supabase service/secret key; do not store it in Git or browser config.
- The secret has **not** been configured in Supabase yet.
- Production operational migrations have **not** been applied; order/delivery/payment tables and RPCs are not yet live.
- `flame-chick-order-api` and `flame-chick-catalog` are not deployed to Production from this source.
- Website ordering flags remain disabled; branch delivery areas and default fee still require setup in the operational schema.
- Do not enable checkout or deploy until these prerequisites, end-to-end tests and explicit release review are complete.

## Out of scope

No GST implementation, online payment gateway, refunds, secret mutation, Production migration, Edge Function deployment, Vercel deployment, Realtime activation, catalog publication or checkout activation was performed.

## Next step

Build and run a disposable end-to-end harness around the actual Order API route handlers and database RPCs. Exercise successful quote/commit, changed fee/publication, altered/expired quote, request replay, concurrent duplicate checkout, quota boundaries, and rollback/cleanup.

