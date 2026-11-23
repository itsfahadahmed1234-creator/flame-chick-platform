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

## Verification gate

The workflow triggered by the new test-file commit must complete. Do not claim delivery behavioral QA passes until the latest run succeeds. If it fails, inspect its exact job log and continue from the first failing assertion. Continue to preserve rollback assertions and the no-production-write boundary.
