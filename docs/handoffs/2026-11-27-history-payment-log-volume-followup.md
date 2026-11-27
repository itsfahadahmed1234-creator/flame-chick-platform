**Hostname boundary:** The expected initial validation hostname is `flamechickpos.itsfahadahmed1234.workers.dev`. Cloudflare recommends a custom domain/route rather than `workers.dev` for business-critical production. The connected account currently has no zones attached, and the user supplied only the label `flamechickpos`, not a registered full domain/TLD. Use the workers.dev hostname for initial testing only; do not invent a suffix, purchase/register a domain, add a zone, or change DNS. Record the exact full custom production hostname after the user connects the zone/domain.

> **Hosting continuation update — 2026-11-27:** The next task is now to create a separate POS host in the connected Cloudflare account. Follow `docs/handoffs/2026-11-27-cloudflare-pos-hosting-continuation.md` before any hosting edits. Upload candidate: `apps/flame-chick-pos/` at validated source pin `41c8aea80febd434048e50c352b386c01b02e7d4` (all 19 POS code/static-asset inputs (excluding README.md) match the validated source pin; README.md is documentation only). Target Worker/project name: `flamechickpos`. The account's workers.dev subdomain is `itsfahadahmed1234`, but no zones are currently attached and no full custom-domain TLD was supplied. Do not guess a suffix or touch the existing `flame-chick-platform` Worker. Backend migration 20261127090208 and Order API v12 / Delivery API v4 are already deployed; do not repeat them. Keep Vercel only as fallback.

# Flame Chick POS — History, payment preference and log-load follow-up

Date: 2026-11-27
Branch: `work/production-source-audit`

## Production rollout result

- Migration `flame_chick_delivery_payment_preference_v1` successfully applied; remote version `20261127090208`.
- `flame-chick-order-api` v12 and `flame-chick-delivery-api` v4 are ACTIVE in Production. Catalog v4 and Staff Admin v7 are unchanged.
- Schema/RPC security verification passed. Production counts remain 25 orders and 14 payments; no order/payment writes occurred in this rollout.
- Recent function edge logs show successful GET 200 responses from both deployed APIs.
- The Vercel POS release from source commit `41c8aea80febd434048e50c352b386c01b02e7d4` is blocked: API deployment creation returned HTTP 402 `api-deployments-free-per-day` (more than 100; retry after 86400 seconds). A deployment record was canceled by the Ignored Build Step; it is not live.
- The production domain `flamechick-pos.vercel.app` remains routed to old deployment `dpl_6VuqJfbd89a7f1V6TTVL6L6n2CEjP` (source `f6ce0ea49aeb165fec382280dcc3f90c4747a706`). The Ignored Build Step has been restored to `exit 0`. Do not trigger Vercel deployments again until the daily quota resets; do not upgrade or bypass the limit.
- User has already authorized the same direct Production POS release. After quota reset, continue the exact release without asking again, verify READY and alias mapping, then run read-only smoke checks. Do not create test/customer orders or payments.

## History fix

History previously referenced undeclared `HISTORY_LIST_LIMIT` before its initial fetch and during fallback rendering. The POS now declares a 15-row page size and per-tab paging. The first request returns summary-only rows, server-filtered by source/status and ordered with a keyset cursor on `created_at,id`. The query does not fetch nested line/modifier/component/task data, use OFFSET or run a count. **Load 15 more orders** is explicit. Search is limited to rows already loaded. Full details are fetched only after opening a specific row. Existing IndexedDB records and strict duplicate matching are preserved.

## Payment semantics

For manual Delivery, the selected payment method is a customer preference. It is persisted as `orders.proposed_payment_method`, separate from `payment_method_summary` and `public.payments`. Unpaid Delivery cards/receipts distinguish “Not collected” from “Customer preference”. Actual Cashier collection remains tied to the post-Delivered collection workflow.

## Log-load reduction

The new private service-role-only `flame_chick_get_staff_context(uuid)` projection combines active role and branch resolution. Warm Edge isolates cache successful context for 15 seconds; Auth token/user validation remains per request. Delivery expiry sweeps are coalesced per branch for 15 seconds without changing the underlying 60-second offer-expiry rule. Platform request/runtime logs are not disabled.

## Validation

- Edge Function Static Checks and synthetic Website Order API integration passed (GitHub run `45966924938`).
- Admin/POS/Rider static checks passed (GitHub run `45966924959`).
- Disposable full role/authorization, Dine-in/Takeaway/Delivery sync, website idempotency, payment, and delivery concurrency suite passed (GitHub run `45966592721`).
- Production migration, RPC grants, Edge Function versions, data counts and successful API GET responses verified after deployment.
- Vercel is the only remaining release blocker for the POS frontend: daily API deployment cap, not source test failure. No frontend deployment is live yet.

