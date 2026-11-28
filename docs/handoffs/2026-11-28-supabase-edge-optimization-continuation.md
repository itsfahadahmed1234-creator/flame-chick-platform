# 🚫 MANDATORY NEW-CHAT SAFETY DIRECTIVE — DO NOT TOUCH SUPABASE LOG INGESTION

**This is an explicit user instruction and a hard, project-wide restriction. It applies to every new ChatGPT conversation, every assistant/agent, and every Flame Chick task unless the user explicitly changes it. Read and obey it before using any Supabase tool.**

The user has expressly prohibited all further interaction with **Supabase Log Ingestion**. **Important clarification of the figures (confirmed by the user): it was the log query that exceeded 102 GB; separately, Log Ingestion usage was 0.10 GB out of a 1 GB allowance. These are different measurements and must never be conflated.** Do not investigate, inspect, query, read, retrieve, export, sample, filter, analyze, configure, enable, disable, or otherwise touch Supabase Log Ingestion again.

This prohibition includes, but is not limited to:

- **Never call** Supabase `query_logs`, Logs Explorer, project log-query endpoints, log search/export APIs, or equivalent functionality through a connector, dashboard, CLI, SDK, direct API, browser, or another tool.
- Do not read or query existing Supabase Edge Function, Postgres, Auth, API gateway, Realtime, or other project logs through the Log Ingestion system.
- Do not create, edit, enable, disable, test, or reconfigure log drains, log ingestion, log routing, telemetry, analytics, retention, or related integrations/settings.
- Do not generate synthetic requests, test traffic, retries, health checks, or diagnostic events against Production for the purpose of producing or examining logs.
- Do not run monitoring or diagnostics that are likely to create substantial log-ingestion volume. Do not try another interface or indirect route to obtain the same logs.
- Do not reset log/statistics data or make logging-related configuration changes.

**No exceptions based on convenience or diagnostic value.** Do not touch Log Ingestion even if it appears useful for debugging, performance analysis, security review, or verification. Do not ask the user to repeat this instruction. Only the user can explicitly lift or narrow this restriction.

For future optimization and troubleshooting, prefer GitHub source inspection, static analysis, local tests, disposable test environments, and carefully scoped read-only database catalog inspection where appropriate. Do not send test traffic to the Production project. Never claim that a check was performed if it was not. Historical observations gathered before this restriction may be treated only as historical context; do not refresh them by querying logs.

**Startup requirement:** Every new chat must read this directive in `PROJECT_HANDOFF.md` before using Supabase tools, and must read `docs/handoffs/2026-11-28-supabase-edge-optimization-continuation.md` when continuing the Edge Function optimization. If a proposed task appears to require Log Ingestion, stop and explain the limitation rather than accessing it.

---

# CURRENT CONTINUATION — SUPABASE EDGE FUNCTION OPTIMIZATION (2026-11-28)

Continue the existing Flame Chick Production project. Do not restart, rebuild the project from assumptions, or deploy unreviewed changes.

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Production branch: `work/production-source-audit`
- Optimization working branch to inspect before relying on it: `supabase-edge-optimization-2026-11-27`
- Production Supabase project: `adkrxfnawdiljhjaavnj` (Flame Chick Production, Mumbai `ap-south-1`, Free plan)
- Production Edge Function versions observed during the prior source audit: Order API v12, Delivery API v4, Catalog API v4, Staff Admin v10. Re-check deployed source/version metadata only when needed; **do not inspect logs**.
- User asked to optimize Supabase Edge Functions and related backend paths. No permission to upgrade the Supabase plan or make unrelated product/schema changes is implied.
- No Production Edge Function deployment, migration, secret/Auth modification, or order/customer data write was made during the prior optimization audit.
- GST remains deferred.

## Important branch and test status

A feature branch named `supabase-edge-optimization-2026-11-27` was created during the earlier attempt. Its exact current head and contents must be verified from GitHub before relying on it. Do not assume that its source, tests, CI or deployment state is valid.

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
- Inspect the repository/branch state and deployed function source versions through GitHub/Supabase function metadata as needed, but **never use log-reading functions or logging interfaces**.
- Prefer static checks, unit/contract tests and controlled local tests using disposable fixtures. Keep test requests off Production.
- Production SQL, if genuinely needed, must be read-only and narrowly scoped to schema/catalog/privilege/index inspection. Do not run migrations, writes, statistics resets, synthetic traffic, or heavy diagnostics as part of an optimization audit without explicit approval.
- Keep secrets out of source, output and handoffs. Never read or print service-role credentials.
- Preserve current authentication, CORS, idempotency, pricing, order/payment, rider isolation, cancellation/return audit, and staff role behavior.
- Stay on the Supabase Free plan. Do not enable paid features or add infrastructure without explicit approval.
- Do not deploy Edge Functions or apply migrations until the source review and tests pass and the user explicitly approves the rollout.

## Next concrete step

Re-open the current GitHub branch heads and inspect the optimization branch diff against `work/production-source-audit`. Confirm exactly which changes and tests exist, correct only evidenced issues, and run the relevant tests locally/disposably. **Do not query or otherwise touch Supabase Log Ingestion at any stage.** Report accurately what passed, what failed, and what remains before asking for deployment approval.

