# 🚫 MANDATORY NEW-CHAT SAFETY DIRECTIVE — DO NOT TOUCH THE 102 GB SUPABASE LOG QUERY

**This is an explicit user instruction. Read and obey it before carrying out Supabase diagnostics. It supersedes older logging wording in historical notes below.**

- The Supabase log query that exceeded **102 GB** is prohibited. Do not rerun, open, edit, clone, recreate, broaden, sample, filter, optimize, troubleshoot, or reproduce that query or its workload.
- Do not use Supabase Logs Explorer, `query_logs`, log-query APIs, CLI commands, connectors, SDKs, dashboards, browser interfaces, or alternative/indirect tools to run or retrieve Supabase log queries. Do not attempt a smaller or filtered version.
- **Log Ingestion is separate and may be accessed read-only when relevant.** The user explicitly permits accessing Log Ingestion data/usage for relevant checks. This does not permit access to the prohibited log query.
- Historical distinction: Log Ingestion usage was **0.10 GB out of a 1 GB allowance**. The **102 GB** amount was the log query, not Log Ingestion.
- Do not create/change/disable log drains or alter ingestion configuration, retention, routing, or telemetry without separate explicit user authorization.
- Do not generate Production traffic to produce telemetry. Prefer source inspection, static analysis, local/disposable tests, scoped non-log metadata reads, and browser-visible errors.

---

# CURRENT CONTINUATION — SUPABASE EDGE FUNCTION OPTIMIZATION (2026-11-28)

## Latest Delivery Edge invocation investigation — 2026-11-28

### Usage evidence supplied by the user

- Supabase Usage displayed **5,915 Edge Function invocations** for the 19 Nov–19 Dec 2026 billing cycle, with 500,000 included on the Free plan and 0 overage.
- The user changed the project selector to Flame Chick Production and confirmed the same total. Treat 5,915 as this project's total, not a Delivery API-only count.
- The 28 Nov daily figure displayed **170 invocations**, and the user confirmed that **no orders had been placed that day**. Background/app traffic is therefore a material contributor; the dashboard refreshes hourly, so the visible total may have been a partial day.
- Do not use the prohibited log-query path to attribute invocation traffic. Log Ingestion data may be read when relevant, subject to the separate access/configuration boundary above.

### Source-based background traffic estimate

On the existing production-source code, when Realtime is healthy and one Rider session plus one POS session are left open:

- Rider presence sends an immediate `action:"presence"` request and repeats every 120 seconds — about **30 Delivery API invocations/hour**.
- Rider jobs/offers safety refresh runs immediately after Realtime subscription and then every 120 seconds — about **30 Delivery API invocations/hour**.
- Before the POS fix, the POS 120-second safety refresh invoked dispatch twice because `loadInitialOnlineInbox()` already calls `loadDeliveryDispatch()` and the scheduler then called dispatch again — about **60 Delivery API invocations/hour**.
- The isolated POS fix removes that duplicate. The same POS safety refresh now makes one dispatch request per two-minute cycle — about **30 Delivery API invocations/hour**.
- Updated illustrative total after the POS fix: approximately **90 Delivery API invocations/hour**, plus about **30 Order API requests/hour**, before event-driven requests, login/resume, multiple sessions, and fallback polling. This is a source-based estimate, not a measured endpoint breakdown. When Realtime is unhealthy, 30-second fallback polling can raise the rate.

### Isolated POS duplicate-refresh fix committed on the feature branch

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `supabase-edge-optimization-2026-11-28` (do not continue the diverged `supabase-edge-optimization-2026-11-27` branch).
- Code commit containing the tested POS fix: `393f6f8625a5b84c8a3d07f63d75298b3f7ffa49`.
- POS Realtime events are scoped: `orders_changed` requests the inbox refresh; `delivery_changed` requests dispatch refresh.
- The scheduler no longer runs `loadInitialOnlineInbox()` and then redundantly calls `loadDeliveryDispatch()`. The inbox loader refreshes dispatch once; a delivery-only event refreshes dispatch directly.
- POS assignment and return-confirmation actions schedule their delivery refresh rather than immediately forcing a full inbox plus dispatch reload.
- Existing 120-second healthy safety refresh and 30-second Realtime fallback are preserved. Authentication, authorization, branch scoping, offer expiry, delivery state rules, and server RPCs are unchanged.
- Added `apps/flame-chick-pos/tests/delivery-refresh-optimization.test.cjs`; included it in `npm run test:cloudflare` and the POS regression workflow for this branch.
- GitHub Actions run **46112617777** passed the existing mocked POS/receipt/QZ/business-contract checks and the new delivery-refresh optimization regression.
- This fix is **not deployed**. Production Delivery API and POS remain unchanged. No Production requests, orders, writes, migrations, secrets/Auth changes, or customer data changes were performed for this optimization.

### Rider sync design context and safeguards

- Rider app sends presence immediately and every 120 seconds. With healthy Realtime it also refreshes jobs/offers immediately after subscription and then every 120 seconds. If Realtime fails, a 30-second fallback refresh is used.
- Rider `loadJobs` retrieves active assigned jobs and offers; the Delivery API returns these through separate reads in one Rider view request. State-changing Rider actions currently trigger a follow-up `loadJobs(true)` request.
- The database availability check rejects a Rider as stale when `last_seen_at` is older than **240 seconds (4 minutes)**, null, or more than 15 seconds in the future. A proposed 5-minute online threshold would conflict with this existing rule; do not adopt it without a reviewed change to the full POS/Rider availability contract.
- Do not simply lengthen or disable the heartbeat. A safer candidate is a single authenticated Rider sync operation/RPC that uses server time for `last_seen_at`, preserves the rider's availability preference, derives busy/active-task state safely, and returns only that authenticated rider's current jobs/offers.
- Do not implement a direct browser update to `rider_profiles` or loosen RLS. Preserve current authenticated role checks, single-branch Rider restriction, active task/busy calculation, Rider-only offer visibility, and updates for existing assigned work even when the online preference is off.
- The 60-second offer expiry remains client-visible, while the server expiry sweep is reached through POS Dispatch view activity. Preserve both safeguards.
- Keep private Supabase Realtime Broadcast; do not switch to broad `postgres_changes` subscriptions without a separate security/performance review.
- A Rider POST followed by a GET may be consolidated only if the action response can safely return refreshed jobs/offers or the UI can otherwise reconcile state when Realtime is disconnected. A broadcast alone is not sufficient.

### Next optimization candidates — assess carefully

1. Design and test a single authenticated Rider sync request/RPC that can reconcile presence and current jobs/offers without exposing other Riders' data. Keep server-set timestamps and the existing four-minute freshness contract unless the entire contract is deliberately redesigned and tested.
2. Remove immediate post-action Rider GETs only when the response safely supplies refreshed state or an equivalent reliable reconciliation path.
3. Keep the 30-second fallback needed to recover time-limited offers when Realtime is unavailable. Do not blindly lengthen or disable it.
4. Keep POS delivery refresh event-scoped and avoid refreshing delivery for unrelated non-delivery order updates when this can be proven safe.
5. Build mocked request-count tests for an idle POS, an idle Rider, and one complete delivery lifecycle. Report background and per-order budgets separately. The target of 8 or fewer invocations is a goal for a normal completed delivery, not a claim that every exceptional lifecycle (reassignment, expiry, failed/returned delivery) must fit the same count.

### Ongoing safety boundaries

- **Log-query boundary:** absolutely do not touch the 102 GB query or use Logs Explorer, `query_logs`, or equivalent query surfaces. No tiny, filtered, sampled, or recreated query.
- **Log Ingestion boundary:** read/access Ingestion data when relevant is permitted by the user. Do not alter drains, retention, routing, telemetry, or ingestion configuration without separate explicit authorization.
- A separate ChatGPT conversation owns Website and Admin work. Do not edit or deploy Website/Admin app files or shared APIs/RPCs/contracts that can affect them.
- Continue isolated POS/Rider/Delivery work only on the existing feature branch. Do not merge, rebase, cherry-pick, or deploy without a complete review and explicit user approval.
- Keep Production on the Free plan. No Production deployment, migration, secret/Auth change, test traffic, or order/customer write is authorized.
- Preserve Delivery API `verify_jwt=false`, internal Supabase Auth validation, and unauthenticated OPTIONS preflight unless a separate full security review supports a change.

Continue the existing Flame Chick Production project. Do not restart, rebuild the project from assumptions, or deploy unreviewed changes.

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Production branch: `work/production-source-audit`
- Current optimization feature branch: `supabase-edge-optimization-2026-11-28` (based on the latest production-source handoff; do not continue the diverged 2026-11-27 branch)
- Production Supabase project: `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai `ap-south-1`, Free plan)
- Production Edge Function versions observed during the prior source audit: Order API v12, Delivery API v4, Catalog API v4, Staff Admin v10. Re-check deployed source/version metadata only when needed; **do not inspect logs**.
- User asked to optimize Supabase Edge Functions and related backend paths. No permission to upgrade the Supabase plan or make unrelated product/schema changes is implied.
- No Production Edge Function deployment, migration, secret/Auth modification, or order/customer data write was made during the prior optimization audit.
- GST remains deferred.

## Important branch and test status

The earlier branch `supabase-edge-optimization-2026-11-27` diverged from the latest production-source branch and is not the active work branch. Continue on `supabase-edge-optimization-2026-11-28`, verifying its exact head and test results before relying on it.

Earlier CI attempts were not fully green:
- A source-contract assertion referenced a stale website quote error name.
- A local order test failed because the disposable test DB did not have the required published catalog fixture.
- A Vercel deployment/build status also failed because of an existing Vercel Free-plan build/deployment limit; that is not evidence of a Supabase defect.
- A proposed Delivery API gateway JWT shortcut was reverted. Keep Delivery API `verify_jwt=false` unless a complete auth/CORS review proves a change safe; its handler performs internal Supabase Auth validation. In particular, do not break unauthenticated browser OPTIONS preflight.
- Do not report the optimization branch or its tests as successful without checking the current commit, source and actual test results.

## Optimization areas already identified

Treat these as review candidates, not approved changes. Inspect the current source and preserve existing behavior before editing.

1. **Order API independent reads:** candidate parallelization in `readBranchDeliveryConfiguration` (delivery areas and branch delivery settings) and `buildWebsiteContext` (independent catalog publication and restaurant metadata reads). Per-branch configuration reads may be parallelized after branch retrieval while preserving deterministic order and existing fail-closed behavior.
2. **Delivery API independent reads:** rider profile/preference and active-task lookups may be candidates for `Promise.all`, but assess consistency and race implications first. Do not weaken rider assignment isolation or authorization.
3. **Authentication and CORS:** Order API supports public anonymous Website requests and authenticated staff requests; do not add blanket JWT gateway enforcement. Delivery API currently requires its internal Auth validation because gateway JWT verification is disabled. Preserve the existing browser preflight behavior and staff/rider role/branch boundaries.
4. **Catalog reads:** `flame_chick_catalog_public_read` recomputes a SHA-256 checksum over published catalog JSONB. Review payload size, query plan and immutable publication/version semantics before proposing caching. Never introduce stale menu, price, availability, or checksum responses.
5. **Staff Admin RPC:** review the relatively more expensive `flame_chick_staff_admin_command` path and dashboard implementation only against the current source/schema. Do not combine calls into a broader SECURITY DEFINER RPC or widen privileges without a concrete security review and tests.
6. **Indexes:** the prior advisor surfaced 41 foreign-key index candidates, but many affected tables were tiny. Do not blindly create every suggested index. Inspect existing index prefixes, actual query patterns, table growth and write/storage cost before recommending targeted indexes.
7. **RLS:** prior review found RLS-enabled tables without policies but no direct anon/authenticated DML grants on the reviewed tables; the architecture was RPC-oriented. Do not add broad policies or remove RLS merely to silence advisor notices. Re-check actual privileges if a relevant change is proposed.

## Safe working method

- Read `PROJECT_HANDOFF.md`, this file, and the current source files/tests before edits.
- Inspect the repository/branch state and deployed function source versions through GitHub/Supabase function metadata as needed, but do not rerun or reproduce the specific 102 GB log query; obtain explicit approval before any new log-query activity.
- Prefer static checks, unit/contract tests and controlled local tests using disposable fixtures. Keep test requests off Production.
- Production SQL, if genuinely needed, must be read-only and narrowly scoped to schema/catalog/privilege/index inspection. Do not run migrations, writes, statistics resets, synthetic traffic, or heavy diagnostics as part of an optimization audit without explicit approval.
- Keep secrets out of source, output and handoffs. Never read or print service-role credentials.
- Preserve current authentication, CORS, idempotency, pricing, order/payment, rider isolation, cancellation/return audit, and staff role behavior.
- Stay on the Supabase Free plan. Do not enable paid features or add infrastructure without explicit approval.
- Do not deploy Edge Functions or apply migrations until the source review and tests pass and the user explicitly approves the rollout.

## Latest optimization checkpoint — 2026-11-28

- Active feature branch: `supabase-edge-optimization-2026-11-28`. The older `supabase-edge-optimization-2026-11-27` branch diverged and is not the active working branch.
- First optimization scope is deliberately narrow: parallelize independent, read-only Order API and Delivery API requests; do not change database schema, caching, authentication strategy, or order business rules in this stage.
- Order API change: parallelize the independent `delivery_areas` and `branch_delivery_settings` reads; in Website context, parallelize catalog publication and restaurant metadata reads, and load each branch's independent delivery configuration concurrently while preserving branch order and fail-closed errors.
- Delivery API change: parallelize active-delivery-task and rider `accepting_jobs` reads during presence updates. The same checks still gate the single profile update. Unused `token` and `apiKey` parameters were removed from `isActiveRider`; this does not remove Auth validation.
- Auth/CORS boundaries remain unchanged: Order API and Delivery API both remain `verify_jwt=false`; Delivery still performs `/auth/v1/user` validation internally and answers browser OPTIONS before authentication. Staff Admin remains `verify_jwt=true`.
- Staff Admin branch parity: its `index.ts`, `origin-policy.mjs`, `catalog-actions.mjs`, and `dashboard-actions.mjs` now match deployed Staff Admin v10 exactly. The base production-source branch had stale copies of two files and lacked the dashboard helper; no Staff Admin behavior optimization is included.
- Regression coverage added: mocked Order API concurrency/fail-closed test; Delivery Rider presence/Auth/OPTIONS/push fail-closed test; Node source-contract tests; Staff Admin dashboard RPC argument validator tests. The old DB-backed local order test is not part of the new CI job because it failed when the disposable DB had no published catalog fixture.
- Local verification: Node 22 ran the three dashboard validator unit tests successfully (3 passed, 0 failed). In addition, 12 scripted source-contract assertions against the actual GitHub branch files passed (12/12). Deno handler tests were authored but not run locally because Deno is not installed in the current environment. A GitHub Actions workflow was added; no confirmed Actions run result has been obtained, so do not report Deno or CI tests as passed until that result is verified. The available combined commit-status response showed two Vercel `build-rate-limit` contexts only; those are not results for the new Supabase test workflow.
- Current deployed source versions checked by Edge Function metadata: Order API v12, Delivery API v4, Staff Admin v10. Order API's supporting catalog/pricing/quote modules match deployed v12 byte-for-byte; Delivery API's sole runtime difference is the described concurrency/unused-parameter change; Staff Admin's four files match deployed v10 byte-for-byte.
- No Edge Function deployment, SQL migration, Production data write, secret/Auth change, or production request was performed. Do not deploy without completing tests and obtaining explicit user approval.

## Catalog API review — 2026-11-28

- Deployed Catalog API v4 is byte-for-byte identical to the repository source. It reads only the current immutable publication and validates its schema/metadata before returning it.
- The `flame_chick_catalog_public_read(text)` RPC is `SECURITY DEFINER` with an empty search path and execute privilege granted to `service_role` only (not `anon` or `authenticated`).
- Current published V3 snapshot size observed through a narrow read-only query: **51,548 bytes as JSON text** (15,840 bytes stored as JSONB). The current publication is number 2.
- `catalog_publications` has BEFORE UPDATE/DELETE and BEFORE TRUNCATE immutability triggers. `service_role` has SELECT only on this table and no INSERT/UPDATE/DELETE privilege; only the database owner can write. The publication table and current-publication pointer have PK/unique/index coverage on the join keys, and restaurants has a unique slug index.
- Decision: **no Catalog API, checksum, cache, or index change in this stage.** The existing SHA-256 recomputation is an integrity guard; the snapshot is small, publication immutability is already enforced, and no new evidence justifies weakening the integrity check or risking stale menu/pricing data. Do not cache public menu/price/availability responses without a separately designed publication-aware invalidation mechanism.
- These were read-only schema/metadata checks. No table write, migration, log query, synthetic Production request, or ingestion-setting change was performed.

## Next concrete step

**The Deno verification gate is now complete.** GitHub Actions workflow run [46108163974](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46108163974), testing commit `eed5d102f00b5fb38d00f4c1646335fd6c48798a`, completed successfully on 2026-11-28:

- Node.js source-contract and dashboard-validator tests: **6 passed, 0 failed**.
- Deno mocked Order API and Delivery API regression tests: **5 passed, 0 failed** (Delivery: 1; Order: 4).
- Total verified in the actual workflow logs: **11 passed, 0 failed**.
- The current optimization branch head at this checkpoint is `03a52c499829d343c5fbf297e6889e826184b4b9`; the workflow-tested code is an ancestor of that head and subsequent commits only synchronized handoff documentation.

## Staff Admin and database-path review — 2026-11-28

- Reviewed the Staff Admin Edge Function, dashboard request allowlist, origin policy, staff command migrations, definer isolation, role projection RPC, rider provisioning migration, SQL security assertions, and existing staff indexes.
- The dashboard public RPC is an invoker wrapper with an empty search path. Its private implementation is Postgres-owned, `SECURITY DEFINER`, uses an empty search path, and is executable by `authenticated` only (not `anon` or `service_role`).
- The dashboard query runs several bounded date/status reads against `public.orders`. A narrow read-only production catalog inspection estimated `orders` at **33 rows / 3 heap pages**. Existing indexes cover branch/date, branch/status/date, and related operational keys. No dashboard rewrite or extra index is justified at this table size.
- Staff roles, invitations, and audit paths already have targeted unique/partial indexes and supporting FK indexes. Do not add another index without evidence of table growth and a measured query bottleneck.
- Order API and Delivery API source review confirms the independent HTTP reads identified in the plan already run concurrently: Website catalog/restaurant, per-branch delivery areas/settings, Rider active-task/profile reads, Rider tasks/offers, and Dispatch tasks/riders. Remaining sequences depend on prior authentication, authorization, state checks, transactional results, or fail-closed decisions.
- The large order, payment, and delivery RPCs are single PostgREST calls executed as database transactions. Their internal SQL statements are not separate Edge-to-Postgres network round trips; avoid combining/reordering them without a concrete plan and regression coverage. The production RPCs inspected are Postgres-owned privileged functions with execution restricted to `service_role`.
- **Decision:** no further Staff Admin, dashboard, index, or transactional RPC change is justified by current evidence. Keep the Catalog API checksum and immutable publication behavior unchanged.

## Parallel work boundary — Website and Admin ownership

**A separate ChatGPT conversation is actively working on the Flame Chick Website and Admin panel. Treat those workstreams as owned by that conversation.**

- Do not edit, replace, refactor, reformat, or deploy any Website or Admin panel application files.
- Do not change their UI, routes, API payloads/contracts, catalog/admin workflows, auth/session behavior, CORS allowlists, environment variables, secrets, Cloudflare Pages/Workers/Vercel projects, hostnames, DNS, aliases, or deployment configuration.
- Do not make backend/API/database changes that could alter Website or Admin panel behavior while that work is in progress. In particular, defer Order API, Catalog API, Staff Admin API/RPC, dashboard RPC, and shared Website/Admin contract changes unless the owner of that parallel work explicitly coordinates and approves the exact change.
- Do not cherry-pick, merge, rebase, force-push, or overwrite commits from the parallel workstream. Keep optimization work isolated on `supabase-edge-optimization-2026-11-28`.
- Safe continuation is limited to read-only review and isolated backend areas that do not serve or change the Website/Admin workstream. Before any shared-surface edit, stop and coordinate rather than guessing.
- This boundary does not authorize deployment or Production traffic. The no-log-query restriction remains absolute unless the user explicitly approves a new log-query activity.

## Safety and release status

- **Zero Supabase log-query use in this continuation.** No Logs Explorer, `query_logs`, log API/CLI, broad diagnostic query, log-drain setting, or log-ingestion setting was accessed or changed.
- The only Supabase SQL used here was narrow, read-only catalog inspection (`pg_proc`, `pg_class`, `pg_indexes`) to inspect deployed function definitions, grants, and table/index metadata. No customer/order rows were selected or changed.
- No Production test traffic, Edge Function deployment, migration, SQL write, secret/Auth change, or paid-plan change was made.
- The 102 GB figure remains the expensive **log query** amount. Log ingestion remains **0.10 GB of 1 GB**. Do not conflate these measurements.

Further optimization should be driven by source-level evidence, controlled local/disposable tests, or narrowly scoped read-only schema metadata—not by Supabase log queries. Do not merge, rebase, deploy, or apply migrations without a complete final review and the user's explicit approval.
