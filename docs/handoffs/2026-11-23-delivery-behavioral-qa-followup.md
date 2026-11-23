# Delivery concurrency QA — four real PostgreSQL-session races — 2026-11-23

**Authoritative delivery/payment workflow:** Rider marking **Delivered** confirms delivery only. POS keeps the order active in its Delivered / awaiting-payment queue; payment remains outstanding. Cashier must physically receive and mark payment **Collected**, recording amount, method, actor and time. Only then may POS set **Completed**, set `completed_at`, and move the order to history. Current candidate delivery SQL sets `completed_at` too early during Rider delivery; it must be corrected before app integration and tested in the order/payment stage. GST remains deferred.

- Branch: `work/production-source-audit`
- Previous expiry-boundary / lifecycle pass: [45182331625](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45182331625)
- First concurrency attempt: [45186758614](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45186758614) — existing tests passed, race-fixture setup failed because it used a non-canonical tenant slug. No production objects were changed.
- Corrected retry: [45187227803](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45187227803) — in progress at checkpoint time.
- Flame Chick is a pre-launch build. Supabase Production is the partly provisioned target environment; this workflow runs against disposable local Supabase.

## What the new harness tests

It provisions synthetic identities through the protected Admin bootstrap and Staff Admin role command, sets up four independent offers, then uses separate PostgreSQL `psql` sessions and application names to force lock contention:

1. Accept wins over simultaneous decline.
2. Decline wins over simultaneous accept.
3. Accept just before deadline holds the task lock; expiry sweep attempts expiry at the exact deadline and must return `expired_count=0` via `SKIP LOCKED`.
4. Expiry sweep wins at the deadline while Rider acceptance is blocked on the same task lock.

For every race, the runner checks a single coherent offer/task/order state, no more than one current assignment, Rider availability, and mutually exclusive accept/decline/expiry audit event counts. The fixture exists only in disposable local Supabase, which the workflow stops afterward.

**Verification remains pending.** First retry must finish migration replay, fixture setup and all four session races successfully before the handoff can say concurrency is passed.

## Already verified

Exact deadline: acceptance one microsecond before 60 seconds succeeds; acceptance exactly at the deadline fails closed as `OFFER_EXPIRED`. Existing lifecycle: wrong-Rider denial, accept/idempotency, pickup, delivery/idempotency, failed delivery/return reporting, Rider cannot confirm physical return, Cashier can confirm, and payment ledger remains unchanged. These passed in run `45182331625`.

No writes were made to the designated Supabase Production target in these QA stages. No Vercel/Edge deployment, Realtime configuration or checkout activation occurred.
