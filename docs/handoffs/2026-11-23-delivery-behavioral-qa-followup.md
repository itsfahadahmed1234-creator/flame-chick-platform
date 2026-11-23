# Delivery behavioral QA — expiry boundary passed; concurrency next — 2026-11-23

- Branch: `work/production-source-audit`
- Verified expiry source commit: `355a7c38c2abb9232021ac1cfcf0c12796ba3df0`
- Passing exact-boundary/lifecycle run: [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625)
- Flame Chick is a pre-launch production build; no live restaurant operations system is running. The designated Supabase Production project is partly provisioned and is the target we're building toward. This disposable QA stage did not write to that target or change `main`.

## Passed verification

The disposable Supabase workflow passed complete migration replay, staff ACL/RLS and role boundary checks, synthetic fixture rollback, operational schema security/constraints, delivery lifecycle commands, exact 60-second expiry boundary tests, and disposable stack cleanup.

The exact expiry tests prove acceptance one microsecond before expiry succeeds; acceptance exactly at the deadline fails with `OFFER_EXPIRED`, marks the offer expired, resets the task to `dispatch_pending`, creates no current assignment, and requires manual reassignment.

## Concurrency tests still outstanding

The next work is true parallel PostgreSQL-session tests for:
1. Rider accept racing against Rider decline for the same targeted offer.
2. Rider accept racing against expiry/sweep at the deadline.

Assertions must prove a single valid terminal offer state, at most one current assignment, correct Rider/task/order state, and consistent event history. A test fixture draft was removed before running because its source-schema assumptions were not yet verified; it added no test coverage. Do not claim concurrency tests have passed until separate sessions are exercised and CI reports success.

## Release boundaries

This QA stage made no changes to the designated Supabase Production project. That project is a pre-launch build environment, not a live operations system. Earlier foundation/catalog setup remains in place. The new delivery command migration and QA fixture remain source-only at this checkpoint; GST remains deferred.
