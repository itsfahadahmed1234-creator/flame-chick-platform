# Delivery behavioral QA — expiry boundary extension — 2026-11-23

- Branch: `work/production-source-audit`
- Source commit: `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`
- Handoff docs commit: `47eae3d3de20658cd1c3e95f0e678fa0cec4c4f4`
- Previous complete lifecycle run: [45179371115](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45179371115)
- Expiry-boundary QA: [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625)
- Production and `main` remain untouched.

## Source changes

- Added private `app_private.flame_chick_delivery_clock_now()`; production implementation delegates to `pg_catalog.clock_timestamp()`.
- Replaced direct delivery command and expiry-sweep clock calls with the private helper so accept and sweep paths share one authoritative database clock.
- Revoked direct EXECUTE from PUBLIC, anon, authenticated and service_role; added privilege assertions.
- The SQL fixture overrides the helper only inside its rollback-only transaction.
- Added deterministic boundary checks: acceptance one microsecond before the 60-second deadline succeeds; acceptance exactly at the deadline returns `OFFER_EXPIRED`, marks the offer expired, returns the task to `dispatch_pending`, and creates no current assignment. It then verifies staff must explicitly reassign; no automatic rotation occurs.

## Verification — passed

Run [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625) completed successfully on commit `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`. The workflow passed:
- disposable Supabase startup;
- complete migration history replay;
- staff ACL/RLS baseline;
- Admin, Owner and operational-role authorization;
- synthetic identity/role rollback checks;
- operational schema V1 constraints and security;
- delivery lifecycle and new deterministic expiry-boundary fixture;
- disposable Supabase stack cleanup.

The delivery lifecycle coverage continues to include targeted assignment, wrong-Rider denial, idempotent accept, pickup, delivered/idempotent retry, failed report, Rider return report, Rider denial of physical-return confirmation, Cashier physical-return confirmation/retry, unchanged payment ledger and audit history.

## Still outstanding

- Genuine multi-session race tests for accept-vs-decline and accept-vs-expiry/sweep are **not yet implemented or verified**. SQL row locks and `SKIP LOCKED` exist, but code inspection is not concurrency-test evidence.
- Next: add disposable concurrent-session tests, then continue POS/Rider integration checks and Cashier return-confirm UI permissions.

No Production database writes, migration applications, function deployments, Vercel deployment, Realtime changes, checkout enablement or catalog publication occurred. Candidate migration remains source-only. GST remains deferred.
