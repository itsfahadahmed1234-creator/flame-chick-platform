# Flame Chick SQL Engineering Standards — Long-Term Reliability

Status: mandatory engineering standard for all future Flame Chick migrations, RPCs and database functions.
Target: Supabase Free, PostgreSQL 17, Mumbai.
Working branch: work/production-source-audit.

## Guiding principle
Optimize for correctness, predictable performance and maintainability over years. Do not optimize for shortest SQL, fewest tables, or benchmark-only speed. Never trade away authorization, transactional integrity, auditability, or data correctness to save a query or function invocation.

## 1. Schema and data integrity
- Use relational constraints for invariants: NOT NULL, CHECK, UNIQUE, FK and appropriate ON DELETE behavior. Do not rely solely on Edge Function validation.
- Choose exact types: UUID for identifiers, timestamptz for instants, date for local effective dates, IANA timezone text validated against pg_timezone_names, bigint for revisions/counters, NUMERIC for currency and percentages. Never use float/double for money.
- Define currency semantics explicitly; do not silently assume all future restaurants use PKR.
- Distinguish NULL/unpriced from zero/free; never coerce unknown price to zero.
- Use soft archive for catalog entities referenced by published snapshots/orders. Hard-delete only short-lived dependent rows where lifecycle is explicit.
- Keep immutable order and publication snapshots separate from mutable catalog authoring rows.
- Add FK indexes based on actual query/delete/update paths. Avoid duplicate indexes already covered by a leading unique/primary-key index.
- Use explicit uniqueness scopes that include restaurant/tenant and relevant parent identifiers. Prevent cross-tenant references with composite FKs or equivalent database-enforced checks where appropriate.
- Avoid premature generic EAV/JSON-only schemas. JSONB is appropriate for immutable compiled snapshots and bounded command payloads, not as a replacement for queryable relational business facts.

## 2. SQL function safety
- SECURITY INVOKER by default. Use SECURITY DEFINER only where a documented privilege boundary requires it.
- Every SECURITY DEFINER function: owner postgres, SET search_path = '', fully schema-qualified object references, minimal EXECUTE grants, no dynamic SQL unless strictly necessary and safely identifier-quoted.
- Revoke EXECUTE from PUBLIC by default; grant only the exact intended roles. Review default privileges and function ownership.
- Derive actor with auth.uid(); never trust client-supplied actor, role, tenant or authorization claims from user_metadata.
- Verify restaurant/tenant scope inside the database command. Edge Function checks are defense-in-depth, not the authority.
- Keep public wrappers SECURITY INVOKER where possible. Do not expose internal helper functions to application roles.
- Return stable, bounded error codes; never return raw SQL errors, constraint internals, tokens or private data.

## 3. Transactions, concurrency and retries
- Multi-row aggregate saves must be one transaction; partial success is unacceptable.
- Use row locks only on the smallest aggregate/state row needed, with a consistent lock order across commands to avoid deadlocks.
- Use expected_revision optimistic concurrency for catalog draft edits. Reject stale writes instead of last-write-wins.
- Use idempotency keys for retryable commands and checkout. Bind a key to a canonical request hash; same key/same payload returns the stored result, same key/different payload is rejected.
- Keep audit events in the same transaction as the mutation they describe.
- Use unique constraints and atomic writes for coupon redemption, rate limiting, rider offer acceptance and other contention-sensitive operations. Never implement these as read-count-then-insert without locking/uniqueness.
- Keep transactions short. No network calls, user interaction, file uploads or external service requests inside database transactions.
- Define explicit lifecycle and retention for idempotency keys, rate-limit buckets, outbox events and temporary reservations.

## 4. Query and index performance
- Select only needed columns; avoid SELECT * in production APIs.
- Bound every list query with stable ordering and a maximum page size.
- Avoid N+1 query patterns; fetch bounded projections or use purpose-built aggregate queries.
- Use keyset pagination for growing audit/order histories where offset pagination would become expensive.
- Index actual predicates and sort keys, including tenant/restaurant scope. Do not create speculative indexes without a query path.
- Review EXPLAIN (ANALYZE, BUFFERS) on representative data before adding complex indexes or claiming performance improvements.
- Avoid unbounded recursive queries, wildcard searches over large tables, and per-row function calls in hot paths.
- Keep public catalog reads to immutable snapshot lookup plus bounded branch overlay data. Cache by immutable publication/version identifiers.
- Use set-based SQL when clearer and more efficient, but do not hide complex business rules in opaque SQL.
- Use statement and lock timeouts appropriate to operation class; do not apply arbitrary ultra-low timeouts that cause normal work to fail.

## 5. Realtime and event reliability
- Realtime is for operational notifications, not the source of truth. Database rows remain authoritative.
- Use transactional outbox records for events that must not be lost; event creation commits with the state transition.
- Broadcast minimal identifiers/version data; clients refetch authorized details.
- Enforce branch/rider isolation for private channels. Never broadcast customer PII or sensitive order details broadly.
- Keep catalog drafts off Realtime unless a specific collaborative-editing need is demonstrated.

## 6. Data lifecycle, migrations and recoverability
- Migrations are append-only after application. Correct mistakes with forward migrations; never rewrite applied history.
- Make migrations deterministic, bounded and restart-safe where feasible. Avoid broad table rewrites or long exclusive locks on growing tables.
- Separate schema changes from bulk data backfills; batch large backfills and monitor locks.
- Preserve old published snapshots and order pricing snapshots; rollback means pointer/state transition, not destructive mutation.
- Document backup and restore expectations within the Free plan's limits. A backup not restore-tested is not a proven recovery plan.
- Keep schema evolution compatible with deployed clients/functions during staged rollouts (expand, migrate, contract).
- Never claim years-long reliability from schema design alone; operational monitoring, backups, restore drills and upgrade reviews remain necessary.

## 7. Testing and release gates
Every meaningful migration/function needs:
- clean application to the target project with migration ledger verified;
- schema ownership, RLS, grants and SECURITY DEFINER audit;
- positive and negative authorization tests for each role;
- cross-tenant access tests;
- concurrency and duplicate-retry tests;
- boundary tests for prices, quantities, dates/timezones and lifecycle transitions;
- representative query-plan and index review for hot paths;
- rollback/recovery test where applicable;
- Supabase Security and Performance Advisor review, triaging INFO findings rather than weakening deny-by-default controls.

Do not apply a migration to the project until SQL has been reviewed against the live schema and the migration's purpose, lock behavior, grants, tests and recovery path are documented. Do not deploy an Edge Function until its RPC contract and auth behavior are tested.

## 8. Free-tier-aware design
- Prefer fewer well-defined domain Edge Functions, not a function per button.
- Batch Admin aggregate changes into explicit user-triggered saves; no network call per keystroke.
- Cache immutable public catalog versions; avoid repeated full-catalog reads.
- Use Realtime selectively for POS/Rider operational state only.
- Avoid needless cron jobs, polling and background fan-out.
- Measure actual DB size, egress, function invocations and Realtime usage; do not build around assumed headroom.
- Free-tier limits are constraints, not reasons to omit integrity or security.

## Review checklist for each SQL artifact
1. What invariant does the database enforce?
2. Can any request cross a restaurant/branch boundary?
3. What happens on duplicate retry or concurrent update?
4. Does the transaction remain atomic and short?
5. Which query paths use each new index?
6. Are permissions least-privilege and verified?
7. Are NULL, zero, missing and archived states distinct?
8. Can this schema evolve without destructive rewrites?
9. How will we test, monitor, back up and restore it?
10. Is the complexity justified by a real menu or operational requirement?
