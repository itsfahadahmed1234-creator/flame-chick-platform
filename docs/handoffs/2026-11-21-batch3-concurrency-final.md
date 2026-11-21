# Flame Chick — Batch 3 concurrency test completion
Date: 2026-11-21
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Working branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` (Mumbai, Free plan)

## Owner instruction followed
No Supabase branch was created. No plan upgrade was requested or made. The test used the existing project because it contained no business/staff data at the start of the test.

## Test method
The Batch 3 candidate was temporarily installed without adding a migration-history entry. Synthetic data only was used:
- Three disposable restaurant records across three independent trials.
- One synthetic restaurant-wide Admin identity.
- Two synthetic restaurant-wide Owner identities.
- Three separate database requests per trial: one holding the restaurant advisory transaction lock, plus two concurrent Owner-deactivation UPDATE requests.

Three separate races were run. Each race used a different synthetic restaurant so the fixtures were independent.

## Result
**All 3/3 concurrency trials passed.**

For every trial:
1. One Owner deactivation committed.
2. The competing request was rejected with SQLSTATE `23514` and `LAST_ACTIVE_OWNER_PROTECTED`.
3. Exactly one active restaurant-wide Owner remained.

The candidate's trigger function is PL/pgSQL VOLATILE. Its internal owner-count statement behaved correctly after waiting on the advisory transaction lock in the tested PostgreSQL 17.12 / READ COMMITTED pattern. The previous stale-snapshot race concern was incorrect and withdrawn.

## Cleanup verification
The temporary schema install and synthetic fixtures were fully removed. Final read-only verification reported:
- Auth users: 0
- Restaurants: 0
- Branches: 0
- Batch 3 tables: 0
- Batch 3 trigger functions: 0
- Batch 3 migration history records: 0
- Batch 3 Realtime publication entries: 0

Only the previously existing hardening, Batch 1 and Batch 2 migrations remain. There was no permanent Batch 3 migration or data left behind.

## Current files
- Corrected reusable harness: `scripts/tests/batch3_last_owner_concurrency_verified.sh`
- Concurrency method and results: `docs/drafts/batch3_last_owner_concurrency_test.md`
- Batch 3 acceptance review: `docs/drafts/batch3_staff_identity_roles_acceptance_review.md`
- Schema candidate: `docs/drafts/batch3_staff_identity_roles_candidate.sql`

Use the **`_verified.sh`** script as the current reusable harness. The original `batch3_last_owner_concurrency.sh` is an earlier draft.

## GitHub recovery note
The correct private repository owner is `itsfahadahmed1234-creator` (the previous failed calls omitted the `med` portion of the owner name, resulting in 404s).

A later GitHub `update_file` call returned a commit but placed the updated script on `main` despite the requested work-branch argument. This was detected by comparing commits. The accidental script file was removed from `main`, then `main` was moved back with an expected-SHA lease to its exact pre-change commit `896a9479098d88e4a01b8f149fd40bb7af2d1102`. Final verification confirmed `main` is identical to that prior commit and the accidental script file is absent. No other files were changed on `main`.

The root `PROJECT_HANDOFF.md` could be fetched but its update endpoint continued returning 404; therefore this detailed, dated handoff addendum is saved separately rather than claiming the root file was updated. Start future handoff review with `PROJECT_HANDOFF.md`, then read this file for the 2026-11-21 Batch 3 concurrency status.

## Approval and next gates
Batch 3 is still a candidate and **has not been permanently applied**. Separate explicit approval is required for a permanent migration. The passing test covers the last-Owner race only; it does not replace later Staff Admin API/JWT actor-verification, command idempotency, authorization and broader load tests.
