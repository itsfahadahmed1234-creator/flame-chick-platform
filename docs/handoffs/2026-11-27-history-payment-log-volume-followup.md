# Flame Chick POS — History, payment preference and log-load follow-up

Date: 2026-11-27
Branch: `work/production-source-audit`

## History fix

History previously referenced undeclared `HISTORY_LIST_LIMIT` before its initial fetch and during fallback rendering. The POS now declares a 15-row page size and per-tab paging. The first request returns summary-only rows, server-filtered by source/status and ordered with a keyset cursor on `created_at,id`. The query does not fetch nested line/modifier/component/task data, use OFFSET or run a count. **Load 15 more orders** is explicit. Search is limited to rows already loaded. Full details are fetched only after opening a specific row. Existing IndexedDB records and strict duplicate matching are preserved.

## Payment semantics

For manual Delivery, the selected payment method is a customer preference. It is persisted as `orders.proposed_payment_method`, separate from `payment_method_summary` and `public.payments`. Unpaid Delivery cards/receipts distinguish “Not collected” from “Customer preference”. Actual Cashier collection remains tied to the post-Delivered collection workflow.

## Log-load reduction

The new private service-role-only `flame_chick_get_staff_context(uuid)` projection combines active role and branch resolution. Warm Edge isolates cache successful context for 15 seconds; Auth token/user validation remains per request. Delivery expiry sweeps are coalesced per branch for 15 seconds without changing the underlying 60-second offer-expiry rule. Platform request/runtime logs are not disabled.

## Validation and release gate

A control-flow issue in the initial Order API context cache was corrected in commit `43cf1b579801b8395aad7ab103e2a7780a3c4d18` after source review. The History/payment UI and regression tests are the next branch commit. No Production migration, Edge Function deployment, order/payment write or Production Vercel release has occurred. Preview functional verification must wait until a coordinated migration + Edge Function release is separately approved; no real orders/payments are to be created from Preview against the Production backend.
