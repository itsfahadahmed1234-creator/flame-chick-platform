# Flame Chick Edge API, Secure Calls & Realtime Architecture V1

Date: 2026-11-21
Status: Architecture baseline; staged implementation required
Target: Supabase Free, Mumbai \`ap-south-1\`
Project: \`adkrxfnawdiljhjaavnj\`
Branch: \`work/production-source-audit\`

## 1. Current verified platform state

- Supabase organization \`Flamechic\` is on the Free plan.
- Project \`Flame Chick Production\` is \`ACTIVE_HEALTHY\`, Postgres 17.12, Mumbai.
- No Edge Functions are currently deployed.
- Current schema contains restaurant/branch/staff identity, catalog authoring tables and menu V1 publication tables.
- No business restaurant, branch, staff, orders, delivery, rider, order-item, offer, assignment, rate-limit or coupon data/schema has been provisioned yet.
- Existing Edge Function source exists in GitHub, but it is not deployed and several routes still reference missing business tables and earlier catalog shapes.
- Existing POS/Rider HTML clients contain Realtime subscriptions, but no business tables are currently in \`supabase_realtime\` publication and no Realtime authorization policies exist.
- POS currently subscribes to branch-filtered \`orders\` and \`delivery_tasks\`, but also has unfiltered \`delivery_task_offers\` and \`delivery_assignments\` subscriptions. Remove those broad subscriptions before business launch.
- Rider currently uses user-filtered Postgres Changes for its offers/assignments. Replace with private rider Broadcast after server-side event authorization is implemented.
- POS and Rider currently perform direct authenticated PostgREST reads. They must be migrated to narrowly-scoped, user-context RPC/Edge APIs where access is sensitive or the response is broader than the actor's minimum need.

## 2. Supabase Free plan operating envelope

The Supabase documentation currently lists these Free allowances at the organization level where applicable:

| Usage item | Free allowance | Flame Chick operating rule |
|---|---:|---|
| Edge Function invocations | 500,000 / month | Keep calls action-based; no polling endpoints |
| Realtime messages | 2,000,000 / month | Broadcast only meaningful state changes; avoid fan-out |
| Realtime peak connections | 200 | One socket per active app session; no duplicate clients |
| Egress | 5 GB / month | Paginate boards, select only needed fields, avoid repeated full order payloads |
| Database size | 500 MB / project | Keep audit/event rows compact; retention for non-financial telemetry |
| Storage | 1 GB | Compress menu images; no redundant originals/variants |
| MAU | 50,000 / month | Staff Auth usage expected to be modest |

Realtime message and peak-connection allowances are shared across the organization. Free has no automatic overage billing for these quotas; usage limits can restrict service when exceeded. Free does not provide the Pro Spend Cap feature. Monitor actual usage in the Supabase dashboard; do not infer capacity from a theoretical order count.

Reference: https://supabase.com/docs/guides/platform/billing-on-supabase
Realtime pricing: https://supabase.com/docs/guides/realtime/pricing

## 3. Function boundaries

Four domain functions remain the target; do not create a separate Edge Function for each button or table.

### A. \`flame-chick-catalog\` — public read-only
- Public GET only, no user write operations.
- Reads only the current immutable publication snapshot and explicitly allowed branch availability projection.
- Branch discovery is a separate allowlisted projection; never expose raw private branch address/phone fields.
- ETag/version-aware responses; public catalog may be cached at CDN/browser with short bounded freshness because it is immutable by publication ID.
- No service-role table fan-out to mutable authoring tables.
- Return a stable DTO schema version and publication ID.

### B. \`flame-chick-order-api\` — guest checkout + staff order actions
- Guest website order creation is the only unauthenticated business action.
- Staff order creation/status changes require a valid user JWT; database command derives \`auth.uid()\`, checks restaurant/branch role and order transition.
- One atomic submit RPC validates current published prices, options, promotions/coupons, branch, rate limits, idempotency and creates order snapshots in one transaction.
- Do not trust client price, subtotal, discount, total, actor ID, branch role, or source identity.
- Guest rate limit is website-only: 3 successful orders/minute, 3/10 minutes, 15/hour; enforce atomically in the order submission transaction, not with a separate check-then-create race.
- Use client-supplied idempotency UUID for retries; same key + same canonical request returns prior result, same key + different request conflicts.
- Board reads are staff-only, branch-scoped, paginated and compact. Avoid returning customer PII to kitchen-only roles.
- Cashier cannot delete orders. Cancellation/rejection records actor, time and reason.

### C. \`flame-chick-delivery-api\` — rider + dispatch
- User JWT required for all rider/staff actions. Internal push webhook is a separate path with its own high-entropy Vault-held token and constant-time comparison; never accept a browser-supplied rider ID as identity.
- Rider identity comes from \`auth.uid()\`; role and branch are loaded server-side.
- Rider can see only their own offers, assignments and active delivery snapshots.
- Accept/decline/pick-up/deliver/fail/return are atomic database commands with row locks, ownership checks, expiry checks and idempotency.
- Cashier/Manager/Admin/Owner dispatch permissions are checked in DB; Manager/Admin/Owner return confirmation only.
- Push notifications are a best-effort wake-up path, never the source of truth. The Rider app must fetch its authorized offer/task after notification.
- Do not poll presence through Edge Function heartbeat. Use Realtime Presence while online; persist only meaningful availability preference/state changes and task lifecycle transitions.

### D. \`flame-chick-staff-admin\` — staff management
- Admin/Owner-only command surface.
- Keep \`verify_jwt = true\`; gateway verifies user JWT and private database command independently derives \`auth.uid()\` and checks active Admin/Owner role.
- Staff invitation external Auth operations use secret key only server-side; recoverable saga and idempotency remain.
- No direct client CRUD for \`user_roles\`, invitations, audit, or profiles.

## 4. Secure API call pattern

- Client sends \`apikey: sb_publishable_...\` and \`Authorization: Bearer <user JWT>\` for authenticated functions.
- Publishable key is not identity. JWT is identity. Never use a publishable key as bearer token.
- Secret key/service-role key exists only in Edge Function environment and is never shipped to browser/PWA.
- \`verify_jwt = true\` for user-only functions (Staff Admin and authenticated command endpoints).
- Mixed guest/internal webhook endpoints may use \`verify_jwt = false\`, but the handler must strictly validate the specific route's auth contract before processing.
- CORS allowlist per application origin, explicit methods/headers, reject unknown browser origins. CORS is not authentication.
- Bound request body size; validate schema, UUIDs, enum values, integer ranges, arrays and nested item counts.
- Rate limit abuse-prone guest endpoints and invitation/push endpoints. IP is only a secondary signal; never trust browser-provided forwarding headers.
- Use short generic client errors; log structured request IDs and safe error codes only. Never log JWTs, API keys, addresses, phone/email, raw order payloads or push subscription secrets.
- No generic RPC proxy. Each function maps a finite allowlist of actions to specific RPC names/payloads.
- SECURITY DEFINER functions: empty search_path, schema-qualify every object, owner postgres, explicit EXECUTE grants, verify actor and tenant inside the function. Prefer invoker wrappers to private implementations.
- Use user JWT context for user-scoped reads. Secret-key reads must be limited to trusted server-only tasks where an explicit user-context RPC is not practical.

## 5. Realtime event architecture

### Principle

Realtime is a notification that state changed, not a replicated database and not an authorization bypass. Database remains source of truth. Every client receiving an event refetches the smallest authorized projection through its API.

### POS

- One authenticated socket/channel per signed-in POS session.
- Private branch topic: \`fc:branch:<branch_uuid>:pos\`.
- Subscribe to branch order and dispatch events only after DB authorization verifies an active POS-capable role for that branch.
- Events: \`order.created\`, \`order.status_changed\`, \`delivery.dispatch_changed\`, \`delivery.return_reported\`, \`delivery.return_confirmed\`.
- Payload should contain only \`event_id\`, \`order_id\`, \`branch_id\`, \`aggregate_version\`, \`occurred_at\`; no customer name, phone, address, order lines or payment data.
- A new order triggers a bounded inbox refresh; a status change refreshes only the affected order/task or the active board, with debounce/coalescing.
- Do not subscribe to every delivery offer/assignment across the restaurant. Remove current unfiltered POS subscriptions.

### Rider

- One private topic per rider: \`fc:rider:<auth.uid()>\`.
- Rider subscribes only while signed in and online/accepting jobs.
- Events: \`offer.created\`, \`offer.expiring\`, \`offer.withdrawn\`, \`assignment.changed\`, \`task.changed\`.
- Payload contains offer/task IDs and event version only. Rider fetches the full authorized data through Rider API.
- Rider never subscribes to a branch-wide offer topic and never sees other riders' offers.
- Push notification is used only as background wake-up when the PWA is not connected; Realtime is the in-app live path.

### Presence

- Realtime Presence is ephemeral: online socket, last connected indication, tab/device presence.
- Durable preference (accepting jobs) is written only when rider explicitly changes it.
- Do not write \`last_seen_at\` every 120 seconds via Edge Function. If an operational last-seen timestamp is needed, use a coarse bounded update and measure invocation/database write cost first.
- A disconnected client is not proof the rider is offline or has declined a task.

### Broadcast vs Postgres Changes

- Prefer private Broadcast for compact domain events. A transactional outbox row is written in the same DB transaction as the business state change; a trusted server publisher broadcasts it, then marks it delivered. Retry is idempotent; events carry stable IDs and aggregate versions.
- Do not call an external HTTP webhook synchronously from a database trigger for every order update. Keep transaction path short.
- Postgres Changes may be used temporarily for low-volume, narrowly filtered internal events, but it has per-subscriber fan-out and depends on table publication/RLS. Never subscribe unfiltered.
- Realtime authorization policies on \`realtime.messages\` must verify the exact private topic against \`auth.uid()\`, active role and branch membership. Disable public channel access at project level before relying on private channels.
- Avoid expensive policy queries on every connection. Add indexed helper membership lookup with stable SECURITY DEFINER design only after security review; policy must be least privilege.
- Broadcast sender is trusted server-side only; clients must not be allowed to publish operational events.

References:
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/pricing

## 6. Free-tier message and invocation budget

Planning target, not a guaranteed capacity statement:

- POS: 1 connection per active cashier/manager/kitchen device; rider: 1 connection per online rider device.
- For a typical order lifecycle, publish only a handful of events: created, accepted, preparing/ready, dispatch changed, delivered/collected or cancelled. Coalesce intermediate changes.
- One broadcast to a branch topic is one publication but may fan out to each subscriber; track actual Realtime message accounting in usage dashboard.
- No 5-second/10-second polling loops. On reconnect, app resumes with one paginated snapshot refresh.
- Rider presence does not invoke Edge Function on an interval.
- Staff boards refresh on explicit user action, reconnect, or event; not every few seconds.
- Catalog immutable snapshot is cached by version; no per-request multi-table N+1 reads.
- API invocations should be proportional to user actions, not UI render cycles.

## 7. Database event delivery design

When order/delivery schema is introduced, add:
- \`private.realtime_outbox\` or \`app_private.realtime_outbox\` with UUID event ID, tenant, branch, event type, aggregate ID/version, minimal JSON payload, created_at, delivered_at, attempt_count, next_attempt_at.
- No client privileges or RLS policies for app roles.
- Transactional write from order/delivery command; unique idempotency key.
- Publisher claims small batches using \`FOR UPDATE SKIP LOCKED\`, sends private Broadcast, marks delivery. Failed events back off; poison events alert and stop retrying after a bounded threshold.
- Do not create a permanent event log duplicating every order row. Keep short retention for delivered operational outbox rows; business audit remains separate and append-only.
- If Free tier does not provide a suitable scheduled worker without additional service complexity, use a bounded DB webhook/Edge hook only for meaningful events and retain outbox retry/reconciliation. Do not add a paid queue service.

## 8. Implementation order and release gates

1. **API foundation:** shared CORS/JSON/error/request-id helpers; verify_jwt config; request validation; remove redundant auth round-trips only where gateway + DB actor checks are proven.
2. **Catalog:** Admin/Owner command RPCs, atomic revision and audit, publication compiler and current-pointer swap; public catalog reads only immutable snapshots.
3. **Orders:** orders/items/modifiers/components, atomic quote/submit/status RPCs, idempotency, website-only rate limiter, branch-safe staff read projection.
4. **Delivery:** rider profile, tasks, offers, assignments, atomic rider commands, return confirmation, push recovery.
5. **Realtime:** private topic policies, outbox/publisher, POS branch and rider user subscriptions, reconnect/refetch, removal of broad legacy subscriptions.
6. **Client integration:** replace direct REST table reads/writes in POS/Rider/Admin with the exact command/query endpoints; retain read-only low-risk RLS reads only if proven necessary.
7. **QA:** unauthorized role matrix, branch isolation, cross-rider isolation, expired offer race, duplicate submit/commands, event replay, disconnect/reconnect, no Realtime event data leakage, Free-tier load estimates.
8. **Deploy:** deploy only after migration/API/client contracts agree. Functions are not deployed at present.

## 9. Immediate code change already made

- Staff Admin Edge Function no longer performs an extra \`/auth/v1/user\` request on every call.
- This function has \`verify_jwt = true\`; the gateway validates the user JWT and \`flame_chick_staff_admin_command\` derives \`auth.uid()\` and enforces Admin/Owner. Missing bearer token is still rejected by the handler.
- Commit: \`6e21262ce052189e196332db464014b02435b3fc\`.
- Static CI run was triggered: https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/44907048541

## 10. Explicit blockers — do not bypass

- The current catalog function is incompatible with the new publication architecture and references tables/columns not present in current schema (\`delivery_areas\`, \`restaurant_settings\`, \`deal_components\`, old \`size_key\` modifier price rules). Do not deploy it.
- The current order/delivery Edge Function sources reference order and delivery tables/functions not yet present in the live project. Do not deploy them.
- No Realtime tables are published, and no Realtime private-channel policies exist. Do not switch the existing client subscriptions on against operational data before these controls are implemented.
- POS has broad, unfiltered delivery subscriptions; rider uses Postgres Changes; these are migration targets, not a production-ready authorization model.
- The database is currently a schema foundation, not an operational restaurant backend.
