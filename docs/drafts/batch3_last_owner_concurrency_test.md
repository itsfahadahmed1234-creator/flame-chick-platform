# Batch 3 — Last active Owner concurrency regression test

**Status:** Executed successfully against the existing Flame Chick Supabase project using synthetic, disposable fixtures. No Supabase branch was created and no upgrade was requested. Batch 3 is still not applied permanently.
**Date:** 2026-11-21
**Test harness:** `scripts/tests/batch3_last_owner_concurrency.sh`

## Environment and safety

The owner explicitly instructed us not to create a Supabase development branch because that could require an upgrade. The test therefore used the existing project `adkrxfnawdiljhjaavnj`, after confirming the initial state had zero Auth users, restaurants, branches, Batch 3 objects and Batch 3 migrations.

The Batch 3 candidate was installed temporarily for the test, without a migration-history entry. All fixtures used deterministic synthetic UUIDs and `example.invalid` email addresses. No real staff or customer data was used.

No Supabase branch, plan upgrade, migration-history change or production application was created. All candidate relations/functions and synthetic Auth/restaurant records were removed after testing. The final database check confirmed:
- Auth users: 0
- Restaurants: 0
- Branches: 0
- Batch 3 relations: 0
- Batch 3 functions: 0
- Batch 3 migration records: 0
- Batch 3 Realtime publication entries: 0
- Existing migration history remains the hardening migration, Batch 1 and Batch 2 only.

## Test setup

Each race used:
- One synthetic active restaurant-wide Admin actor.
- Two synthetic active restaurant-wide Owner assignments.
- Two separate SQL requests attempting to deactivate a different Owner.
- A third database session holding the exact restaurant advisory transaction lock used by the trigger, forcing both statements to wait before trigger logic proceeded.

The competing SQL requests were launched concurrently as independent Supabase database executions. The lock holder was released after both requests had been started. The trigger then serialized the checks.

## Results

**Three independent race trials passed.**

For every trial:
1. One Owner-deactivation update committed.
2. The competing update was rejected with SQLSTATE `23514` and `LAST_ACTIVE_OWNER_PROTECTED`.
3. Exactly one active restaurant-wide Owner remained.

The initial race was run on the first disposable restaurant. Two additional independent disposable restaurants were then used for repeat trials.

This demonstrates that the current trigger-side advisory lock and last-Owner check behaved correctly under the tested PostgreSQL 17.12 / READ COMMITTED contention pattern. The earlier concern that a waiting UPDATE must necessarily use a stale snapshot was incorrect for this PL/pgSQL trigger: the trigger function is `VOLATILE`, and its internal SQL query can obtain a fresh snapshot under READ COMMITTED after waiting for the lock.

## Script correction

The harness now:
- Captures expected nonzero `psql` exit statuses without terminating before assertions.
- Requires exactly one successful update and one `LAST_ACTIVE_OWNER_PROTECTED` rejection.
- Verifies exactly one active Owner remains.
- Validates fixture UUID inputs and refuses connection strings not visibly marked localhost/127.0.0.1/staging/test.
- Explicitly warns that the supplied Owner assignments are modified and fixtures must be recreated before reruns.

## Limitations

This is a targeted regression test, not a general load benchmark. It tested three controlled simultaneous races with separate database sessions. It does not replace future tests of the Staff Admin Edge Function command path, JWT actor verification, request idempotency, transaction retries, multi-restaurant isolation or broader role mutation traffic.

## Approval status

**Batch 3 remains candidate-only and has not been applied as a permanent Production migration.** The temporary installation was removed. Separate explicit approval is still required before any permanent application.
