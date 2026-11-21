# Flame Chick — Batch 3 concurrency test handoff addendum
Date: 2026-11-21
Branch: `work/production-source-audit`
Production project: `adkrxfnawdiljhjaavnj` (existing project, Mumbai, Free plan)

## Owner instruction
Do not create a Supabase development branch and do not upgrade the plan. The concurrency test was run on the existing project while it contained no business or staff records, using synthetic disposable fixtures only.

## Concurrency test
Three independent last-active-Owner races were executed. Each race used one synthetic restaurant-wide Admin, two synthetic restaurant-wide Owners, a third database request holding the exact restaurant advisory transaction lock, and two concurrent UPDATE requests deactivating separate Owner assignments.

All three trials passed:
- One Owner-deactivation statement committed.
- The competing statement was rejected with SQLSTATE `23514`, `LAST_ACTIVE_OWNER_PROTECTED`.
- Exactly one active restaurant-wide Owner remained after each race.

The trigger function is marked PL/pgSQL VOLATILE. Its internal count query behaved correctly after waiting on the advisory transaction lock in the tested PostgreSQL 17.12 / READ COMMITTED scenarios. The earlier stale-snapshot concern was incorrect and is withdrawn.

## Cleanup / final state
The Batch 3 candidate was temporarily installed without recording a migration. Afterwards all five Batch 3 relations and all eight candidate trigger functions were removed. Three synthetic restaurants and three synthetic Auth users were deleted.

Final database verification:
- Auth users: 0
- Restaurants: 0
- Branches: 0
- Batch 3 relations: 0
- Batch 3 functions: 0
- Batch 3 migration entries: 0
- Batch 3 Realtime entries: 0
- Migration history unchanged: hardening migration, Batch 1 and Batch 2 only

No Supabase branch or plan upgrade occurred. No real staff/business data or app/Vercel settings were changed.

## Files
- `scripts/tests/batch3_last_owner_concurrency.sh` — hardened runnable test harness.
- `docs/drafts/batch3_last_owner_concurrency_test.md` — detailed test protocol and results.
- `docs/drafts/batch3_staff_identity_roles_acceptance_review.md` — Batch 3 acceptance review with concurrency results.
- `docs/drafts/batch3_staff_identity_roles_candidate.sql` — schema candidate, not permanently installed.

## Remaining status
Batch 3 remains candidate-only and has not been applied permanently. Explicit owner approval is required before the migration is applied. Future Staff Admin API/JWT authorization, command idempotency and broader load testing remain separate implementation and verification work.
