# Delivery behavioral QA — expiry boundary extension — 2026-11-23

- Branch: `work/production-source-audit`
- Source commit: `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`
- Previous fully green lifecycle run: [45179371115](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45179371115)
- New expiry-boundary run: [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625)
- Production and `main` remain untouched.

## Source changes

- Added private `app_private.flame_chick_delivery_clock_now()`; production implementation delegates to `pg_catalog.clock_timestamp()`.
- Replaced direct delivery command and expiry-sweep clock calls with the private helper so the acceptance and sweep paths share one authoritative database clock.
- Revoked direct EXECUTE from PUBLIC, anon, authenticated and service_role; added privilege assertions.
- The SQL fixture overrides the private helper only inside its rollback-only transaction.
- Added deterministic boundary checks for one microsecond before expiry and exactly at expiry, including expired offer state, task reset, no assignment, and explicit manual reassignment (no automatic rotation).

## Verification status

At the time of this handoff, run `45182331625` was still in progress during disposable Supabase startup. It has not yet reached the complete migration replay or delivery fixture steps. **The new exact-boundary assertions are not yet verified.** Do not proceed on the assumption they pass; inspect the run first.

The earlier complete lifecycle fixture passed on run `45179371115`: targeted assignment, wrong-Rider denial, accept/idempotent retry, pickup, delivered/idempotent retry, failed report, return report, Rider return-confirm denial, Cashier physical-return confirmation/retry, unchanged payment ledger and audit history.

## Next

1. Verify/fix run `45182331625`.
2. Add true concurrent multi-session accept-vs-decline and accept-vs-expiry/sweep tests; these are not yet covered.
3. Then proceed to POS/Rider integration checks and Cashier return-confirm UI permissions.

No Production database writes, migration applications, function deployments, Vercel deployment, Realtime changes, checkout enablement or catalog publication occurred. Candidate migration remains source-only. GST remains deferred.
