# Batch 3 — Last active Owner concurrency regression test

**Status:** Test harness created; not yet executed.  
**Target:** Disposable PostgreSQL staging database only. Never run against Flame Chick Production.

## Why this test exists

The current candidate's `app_private.enforce_user_role_rules()` obtains the restaurant advisory transaction lock from a row-level trigger. Under PostgreSQL `READ COMMITTED`, each `UPDATE` statement takes its snapshot before the trigger waits for that lock. Two concurrent statements can therefore wait in sequence but still evaluate the last-Owner count against snapshots that predate the other transaction's commit.

The harness deliberately holds the exact advisory lock used by the trigger, starts two independent Owner-deactivation statements, and releases the lock only after both statements have begun. This forces both statements to have an older statement snapshot before the trigger obtains the lock.

## Files

- `scripts/tests/batch3_last_owner_concurrency.sh` — two-session race harness.
- Candidate under test: `docs/drafts/batch3_staff_identity_roles_candidate.sql`.

## Prerequisites

1. A separate, disposable PostgreSQL staging database with Batch 1, Batch 2 and the current Batch 3 candidate installed.
2. `psql` and Bash.
3. A disposable restaurant with two active restaurant-wide Owner assignments and one active restaurant-wide Admin assignment.
4. The test Owner and Admin Auth/profile records must be synthetic. Do not use real staff accounts.
5. The test deactivates the two supplied Owner assignments if the defect is present. Recreate the disposable fixture before every run.

## Run

Set the following environment variables in the shell. Use a staging connection string whose hostname/database name visibly contains `localhost`, `127.0.0.1`, `staging`, or `test`; the script refuses other-looking targets.

```bash
export DATABASE_URL='postgresql://...@localhost:5432/flame_chick_staging'
export RESTAURANT_ID='...'
export OWNER_ROLE_ID_A='...'
export OWNER_ROLE_ID_B='...'
export ADMIN_USER_ID='...'
bash scripts/tests/batch3_last_owner_concurrency.sh
```

## Expected interpretation

- **FAIL with zero active Owners:** confirmed last-Owner race. Do not approve/apply the current Batch 3 candidate.
- **At least one active Owner remains:** the invariant survived this run, but repeat under load and inspect both session exit statuses and row changes before declaring the defect fixed.
- This test is intentionally adversarial and is a regression test, not a general throughput benchmark.

## Required design correction if the race reproduces

The lock must be acquired before the mutating statement obtains its MVCC snapshot, by the trusted Staff Admin command in the same transaction (explicit `SELECT pg_advisory_xact_lock(...)` followed by the `UPDATE`). Keep the trigger-side lock as defense in depth if useful, but do not rely on it as the only serialization mechanism for the last-Owner invariant. The command must also re-read/validate the actor and target after acquiring the lock. Re-test using two independent sessions after the correction.
