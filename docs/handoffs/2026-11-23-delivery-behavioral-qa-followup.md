# Delivery behavioral QA — second fixture correction — 2026-11-23

- Branch: `work/production-source-audit`
- Latest fixture correction: `28ffba173a989f5f7cd9c3e378ce24a820b13520`
- Previous failed run: [45177981893](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45177981893)
- Production and `main` remain untouched.

## Latest failure and diagnosis

The previous fixture repair correctly established synthetic roles through the protected bootstrap and Staff Admin path. The run then passed:
- complete migration replay;
- staff ACL/RLS baseline;
- Admin/Owner/operational-role boundary checks;
- synthetic role cleanup checks;
- operational schema constraints/security checks.

It failed inside the delivery lifecycle fixture at the first intended Rider accept:
`RIDER_ACCEPT_FAILED: DELIVERY_OFFER_ALREADY_RESOLVED`.

The fixture had directly inserted an `offered` row but left its parent delivery task in `dispatch_pending`. The command correctly requires both offer status `offered` and task status `offering`; therefore the fixture created an impossible/inconsistent state. This is a fixture defect, not yet evidence of a delivery command defect.

## Correction

Commit `28ffba173a989f5f7cd9c3e378ce24a820b13520` changes the first offer setup to call the real POS `flame_chick_manage_delivery(action='assign')` command, which atomically creates the offer and transitions the task to `offering`. The wrong-Rider check now asserts the exact authorization error `DELIVERY_OFFER_NOT_ASSIGNED_TO_RIDER`, then the intended Rider acceptance proceeds against the valid state.

No production migration, role security rule, or delivery runtime function was changed in this correction.

## Verification result — passed

[Flame Chick Staff Admin Role Boundary QA run #26](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45179371115) completed successfully for commit `28ffba173a989f5f7cd9c3e378ce24a820b13520`.

The GitHub Actions job reports success for every step, including:
- complete migration history replay;
- staff ACL/RLS baseline;
- Admin, Owner and operational-role authorization;
- rollback checks for the earlier staff-role fixture;
- operational schema V1 constraints and security;
- **delivery offer, pickup, delivery and physical-return behavioral fixture**;
- disposable Supabase stack cleanup.

The delivery fixture now actually exercises the command path end-to-end: protected role bootstrap/assignment, targeted dispatch, wrong-Rider denial, intended Rider acceptance and idempotent retry, pickup, delivered and idempotent retry, failed delivery, Rider return reporting, Rider denial of physical-return confirmation, Cashier confirmation and retry, unchanged payment ledger, and history/event audit assertions. All synthetic fixture writes are rolled back.

This closes the initial delivery-command behavioral QA gate. It does **not** yet prove offer-expiry boundary behavior or concurrent accept/decline/expiry races; those remain separate adversarial tests before further integration. Production migrations/deployments, Realtime, checkout and catalog publication remain untouched.
