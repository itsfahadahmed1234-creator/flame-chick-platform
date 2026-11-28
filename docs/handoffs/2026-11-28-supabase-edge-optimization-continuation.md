# 🚫 MANDATORY NEW-CHAT SAFETY DIRECTIVE — DO NOT REPEAT THE 102 GB SUPABASE LOG QUERY

**This is an explicit user instruction. Read and obey it before carrying out Supabase diagnostics.**

- The **Supabase log query** exceeded **102 GB**. Do not rerun, edit, clone, recreate, broaden, optimize, or troubleshoot that specific query, and do not reproduce its workload through Logs Explorer, `query_logs`, an API, CLI, connector, or another interface.
- **Log ingestion was 0.10 GB out of a 1 GB allowance.** It did not exceed 102 GB. Never conflate query volume with ingestion usage.
- This restriction is about the expensive query, not a claim that ingestion exceeded its allowance. No ingestion configuration change is implied.
- If a task appears to require a new Supabase log query, stop and obtain the user's explicit approval first. Prefer source inspection, static analysis, local/disposable testing, and scoped read-only catalog checks. Avoid unnecessary Production test traffic and logging volume.

---
---

# CURRENT CONTINUATION — SUPABASE EDGE FUNCTION OPTIMIZATION (2026-11-28)

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

## Safety and release status

- **Zero Supabase log-query use in this continuation.** No Logs Explorer, `query_logs`, log API/CLI, broad diagnostic query, log-drain setting, or log-ingestion setting was accessed or changed.
- The only Supabase SQL used here was narrow, read-only catalog inspection (`pg_proc`, `pg_class`, `pg_indexes`) to inspect deployed function definitions, grants, and table/index metadata. No customer/order rows were selected or changed.
- No Production test traffic, Edge Function deployment, migration, SQL write, secret/Auth change, or paid-plan change was made.
- The 102 GB figure remains the expensive **log query** amount. Log ingestion remains **0.10 GB of 1 GB**. Do not conflate these measurements.

Further optimization should be driven by source-level evidence, controlled local/disposable tests, or narrowly scoped read-only schema metadata—not by Supabase log queries. Do not merge, rebase, deploy, or apply migrations without a complete final review and the user's explicit approval.
