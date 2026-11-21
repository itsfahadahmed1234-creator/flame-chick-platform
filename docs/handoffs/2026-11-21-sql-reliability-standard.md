# SQL reliability standard adopted — 2026-11-21

Commit: c2aa9733507194fdd52f1f09e9026722e16b8aed
Branch: work/production-source-audit
Standard: docs/standards/sql-engineering-long-term-reliability.md

User direction: SQL must be lightweight and optimized without compromising quality; the database must be reliable for years.

This is now mandatory for all future Flame Chick migrations, RPCs, Edge Function database contracts and operational event tables.

Highlights:
- correctness and constraints before micro-optimization;
- relational invariants and tenant isolation enforced by PostgreSQL;
- SECURITY INVOKER by default; narrowly scoped SECURITY DEFINER only with empty search_path and qualified names;
- atomic aggregate writes, expected revisions, idempotency and same-transaction audit;
- indexes justified by real query paths; bounded projections and keyset pagination;
- immutable order/publication snapshots;
- transactional outbox for must-not-lose operational events;
- selective private Realtime for POS/Rider; no catalog draft chatter;
- append-only migrations, staged compatibility and restore-tested recovery;
- tests for permissions, cross-tenant access, concurrency, retries, boundaries and query plans;
- Free-tier optimization must never weaken integrity or security.

No SQL migration, database schema, business data, Edge Function deployment or Vercel project was changed by this standards task.
Next: implement the first catalog command migration against the exact live DDL and this standard, then review and test before applying.
