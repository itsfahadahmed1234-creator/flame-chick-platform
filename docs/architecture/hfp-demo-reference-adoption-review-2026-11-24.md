# HFP and Flame Chick Demo Reference Adoption Review

Date: 2026-11-24  
Target: Flame Chick Production (new system; no live restaurant order history)  
Working branch: `work/production-source-audit`

## Executive decision

**Yes: adopt selected patterns from HFP and the Flame Chick demo, but do not copy their Edge Functions, SQL migrations, Realtime subscriptions, or POS sync code wholesale.**

The reference projects are useful for domain/API separation, rider offer lifecycle, session-aware Realtime client lifecycle, IndexedDB local persistence and retry/reconciliation ideas. The current Flame Chick Production schema, V3 catalog, role model, command RPCs and delivery/payment state model are newer and must remain authoritative.

A particularly important finding: the reference POS clients do **not** provide a proven end-to-end IndexedDB-to-Supabase sync for all POS order types. The HFP POS's current `syncPending()` short-circuits when `HFP_ORDER_API_READY` is true and reports "cloud sync not enabled"; the Flame Chick demo POS explicitly says local POS orders stay on the device and cloud sync is not enabled. Therefore, they cannot be treated as a finished solution to the Production priority: Dine-in, Takeaway and Delivery must all sync.

## Sources inspected

The repositories and refs were inspected at pinned commits so this assessment does not rely on moving branch contents.

### HFP source
Repository: `befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS`

- HFP handoffs main snapshot: `1b26a263767f37a767449a7493f53b666cd14df3`
- Simultaneous rider offer/PWA snapshot: `becf1a407224ed7546f51823c1719d2c54a8d506`
- POS: [HFP POS Staging v12](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/1b26a263767f37a767449a7493f53b666cd14df3/apps/pos/Hassan_Food_Point_POS_Staging_v12.html)
- Order API: [hfp-order-api](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/1b26a263767f37a767449a7493f53b666cd14df3/supabase/functions/hfp-order-api/index.ts)
- Delivery API: [hfp-delivery-api](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/1b26a263767f37a767449a7493f53b666cd14df3/supabase/functions/hfp-delivery-api/index.ts)
- Rider simultaneous offer/atomic acceptance migration: [20261113041148](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/becf1a407224ed7546f51823c1719d2c54a8d506/supabase/migrations/20261113041148_pizza_bite_rider_lock_atomic_accept_and_offer_retry_v1.sql)

### Flame Chick demo source
Same HFP handoff repository, demo snapshot: `e32943f928a905914b4aad7abc90feabf39c0c70`

- [Demo POS](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/apps/flame-chick-pos/index.html)
- [Demo Rider PWA](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/apps/flame-chick-rider/index.html)
- [Demo Catalog function](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/supabase/flame-chick/functions/flame-chick-catalog/index.ts)
- [Demo Order function](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/supabase/flame-chick/functions/flame-chick-order-api/index.ts)
- [Demo Delivery function](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/supabase/flame-chick/functions/flame-chick-delivery-api/index.ts)
- [Demo Staff Admin function](https://github.com/befahad1234-cmyk/-hfp-supabase-PROJECT_HANDOFFS/blob/e32943f928a905914b4aad7abc90feabf39c0c70/supabase/flame-chick/functions/flame-chick-staff-admin/index.ts)

### Current Production target
- [Production Edge API and Realtime architecture](edge-api-realtime-free-tier-v1.md)
- [Production POS order-sync migration](../../supabase/migrations/20261124050000_flame_chick_unified_pos_order_sync_v1.sql)
- [Production delivery command migration](../../supabase/migrations/20261124033422_flame_chick_delivery_commands_v1.sql)
- [Production POS order API](../../supabase/functions/flame-chick-order-api/index.ts)
- [Production delivery API](../../supabase/functions/flame-chick-delivery-api/index.ts)

## Findings and adoption decisions

| Area | Reference behavior | Decision for Production |
|---|---|---|
| Domain APIs | Separate catalog, order, delivery and staff-admin functions | **Adopt the separation.** Production already has the four-domain boundary; keep it. |
| Catalog | HFP and demo functions are schema-V2 table aggregators using direct multi-table service reads | **Do not copy.** Production uses immutable published V3 snapshots and the V3 public read contract. |
| Order creation | HFP and demo Order API sources are nearly identical (280 of 300 line positions match); demo retains HFP-specific branch/RPC conventions | **Do not copy.** Keep Production's V3 server-side price resolver, branch-derived staff context, local order ID/revision/hash and POS sync RPC. |
| API action routing | Allowlisted actions, input validation, stable errors and RPC-backed writes | **Adopt the style, not the tenant-specific code.** Preserve strict finite action allowlists and typed request/response contracts. |
| Rider actions | Rider identity is verified from Auth; offer reads are scoped to the signed-in rider; accept/decline call atomic database commands | **Adopt the use case.** Production already has rider-specific role/profile checks and lock-serialized accept/decline/expiry logic. Continue testing branch and own-rider isolation. |
| Simultaneous offers | Task row then offer row locking; unique active assignment / rider guard; idempotent acceptance | **Keep the concept.** Production delivery commands already lock the task before the offer, verify the offer belongs to the authenticated rider and profile/branch, and support request IDs. Do not port Pizza Bite constraints or function names. |
| Rider push | Server-side VAPID push, short-lived internal webhook authorization and push as a wake-up signal | **Adapt later.** Use Production's own secret names, allowlisted push action, encrypted/server-side subscription storage and delivery command IDs. Push must never be the source of truth. |
| POS Realtime lifecycle | One client/channel per session, refresh Realtime JWT, cleanly remove channels, debounce/coalesce refresh, refresh after reconnect and retain manual/poll fallback | **Adopt these client lifecycle techniques.** They are useful and compatible with the Production design. |
| POS Realtime data model | POS listens to branch-filtered orders/tasks, but HFP/demo code also subscribes to all delivery offers and assignments without a rider filter | **Do not copy broad subscriptions.** Production requires one private branch topic with an authorized active POS-capable role. |
| Rider Realtime | Rider-specific Postgres Changes filters for own offers/assignments | **Do not use the table filter as the security boundary.** Production requires a private per-user topic authorized against `auth.uid()`, active Rider role/profile and branch. Use IDs/versions in event payloads and fetch full data through the Rider API. |
| IndexedDB | Stores local orders and queue/status queues, with local-first writes and sync-state UI | **Adapt storage model and UX.** Retain stable UUID, revision, pending/attempt state, last error and server order ID concepts. |
| Cloud sync | HFP POS current code short-circuits `syncPending()` when its API-ready flag is true; Flame Chick demo POS states local POS orders remain on-device and cloud sync is not enabled | **Build the Production unified outbox ourselves.** Do not import or claim the demo sync as complete. One queue must cover Dine-in, Takeaway and Delivery, persist before network I/O, retry automatically after reconnect, use server-priced/idempotent V3 sync, reconcile lost responses, and mark synced only after server acknowledgement. |
| CORS / secrets | HFP/demo order and delivery code uses wildcard CORS and legacy service key patterns; demo staff code has old broad-origin/redirect assumptions | **Do not copy.** Use environment-managed secrets server-side, exact browser-origin allowlists where required, JWT + database authorization, and never embed secrets in client code. Public read-only catalog may have a separate intentionally public CORS policy. |

## Additional implementation observations

### 1. The Flame Chick demo Order API is not a Production-ready Flame Chick implementation

The demo `flame-chick-order-api` is nearly line-for-line aligned with the HFP `hfp-order-api`; inspected constants and RPCs include HFP branch and `hfp_*` conventions. It is a historical demo artifact, not a valid base for Production V3 order sync.

The demo Delivery API is more extensively adapted and includes rider push and rider action paths, but still uses legacy HFP-named RPCs such as `hfp_manage_delivery`, wildcard CORS and the demo's previous data model. Reuse the workflow semantics only; Production already has its own command migration and API contract.

### 2. Realtime findings

The demo POS uses a branch channel for `orders` and `delivery_tasks`, but its subscriptions to `delivery_task_offers` and `delivery_assignments` are unfiltered. The HFP POS has the same broad subscription pattern. The Rider PWA filters offer/assignment subscriptions to its current Auth user, refreshes its token and reloads authorized jobs after events/reconnect.

These are useful for client lifecycle and UX, but Production's architecture is intentionally stricter:

- POS private topic: `fc:branch:<branch_uuid>:pos`
- Rider private topic: `fc:rider:<auth.uid()>`
- Private channel authorization checks active role/profile and branch membership.
- Server-only Broadcast publisher; clients cannot publish operational events.
- Small event envelope only (`event_id`, entity IDs, branch ID, aggregate version, timestamp).
- Client uses event as a signal to refetch the minimum authorized projection through the API.
- Transactional outbox makes state change + event intent atomic; bounded publisher retries.
- No broad Postgres Changes or branch-wide Rider offer subscription.

No operational tables are currently enabled in the Production `supabase_realtime` publication. Do not turn on raw table subscriptions as a shortcut.

### 3. Offline POS sync finding

HFP POS Staging v12 includes useful IndexedDB stores (`orders`, `queue`, `statusQueue`, catalog/menu stores), attempt/error state, exponential retry and server reconciliation after a lost response. However, its current `syncPending()` function exits early when `HFP_ORDER_API_READY` is true and displays "Local POS orders · cloud sync not enabled". The Flame Chick demo POS similarly says "Local POS orders stay on this device. Incoming website orders are managed separately in Online Orders."

Therefore neither source meets the Production acceptance criterion. Production must deliver and test a new unified outbox:
- local transaction stores the order snapshot and outbox item before sending;
- stable UUID local order identity and monotonically increasing revision;
- canonical server-computed payload hash and idempotency;
- one code path for Dine-in, Takeaway and Delivery;
- automatic resume on `online`, app focus and bounded retry/backoff;
- timeout/lost-response lookup before retrying;
- server acknowledgement stored locally before removing pending item;
- status/payment mutations have their own idempotency keys and do not overwrite newer server state;
- sync tests cover duplicate/reordered requests, reconnect, concurrent terminals and changed payload at same revision.

## Production implementation plan based on the review

1. **Preserve existing Production API/SQL contracts.** Use HFP/demo to compare UX and edge cases, not as migration input.
2. **Finish deployment prerequisites** (server-only Supabase secrets, branch ID, quote and phone HMAC secrets, Staff Admin origins/invite redirect, Vercel public environment values).
3. **Deploy and smoke-test current Production functions** only after required secrets and exact function source are assembled. Current deploy targets are `flame-chick-catalog`, `flame-chick-order-api`, `flame-chick-delivery-api`, with Staff Admin updated only after final origin/Auth configuration.
4. **Complete the private Broadcast implementation** described above: `realtime.messages` authorization, transactional outbox, server publisher, reconnect/refetch and isolation tests. Remove legacy raw Postgres Changes paths from clients before enabling operational Realtime.
5. **Integrate the existing POS with the unified IndexedDB outbox** for all three fulfilment modes. Use the Production V3 sync RPC, not HFP or demo sync APIs.
6. **Integrate Rider offer notifications** with private Rider Broadcast and optional Web Push wake-up, keeping API/database fetch authoritative.
7. **Run automated disposable DB and Edge Function tests**, then manual preview tests with test identities and test orders.
8. **Only after all manual workflows pass** can real-restaurant go-live be considered.

## Explicit prohibitions

- Do not deploy the Flame Chick demo's old functions.
- Do not copy HFP/Pizza Bite migrations or function names into Production.
- Do not copy old catalog V2 DTOs or IDs into the V3 catalog.
- Do not copy wildcard CORS, hard-coded branch IDs, old project URLs, old tenant slugs, browser service keys, or demo redirect origins.
- Do not claim HFP/demo proves the new POS outbox or Production Realtime is complete.
- No Production schema migration, edge function deployment, secret change, Auth setting change or Realtime publication change was made as part of this review.
