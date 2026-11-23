# Delivery behavioral QA fixture repair — 2026-11-23

- Active branch: `work/production-source-audit`
- Fixture repair commit: `99d1e92b326b852e2d3d57307d8754b4e5e18816`
- Production and `main` remain untouched.

## Root cause

The first delivery behavioral QA run, [45176716756](https://github.com/itsfahadah1234-creator/flame-chick-platform/actions/runs/45176716756), failed at fixture provisioning with `STAFF_ROLE_ASSIGN_FORBIDDEN`. The fixture directly inserted Rider/Manager rows into `public.user_roles`. The protected `app_private.enforce_user_role_rules()` correctly rejects this unless a trusted postgres bootstrap or an authorized Admin/Owner assignment path is used. The delivery command RPCs had not yet been reached in that failed run.

## Repair

The disposable test `supabase/tests/flame_chick_delivery_commands_v1.sql` now:
1. Requires the postgres migration/test identity.
2. Creates a synthetic Flame Chick tenant using the exact tenant slug expected by the Staff Admin command.
3. Creates synthetic Auth users and profiles, then creates only the first restaurant-wide Admin with the postgres-only `assignment_method='initial_bootstrap'`.
4. Switches to the authenticated DB role, sets the Admin JWT claims, and creates both Rider roles, Manager, and Cashier through the real `public.flame_chick_staff_admin_command('assign_role', ...)` command.
5. Asserts five role rows and five append-only staff audit rows before delivery tests.
6. Exercises wrong-rider rejection, accept idempotency, pickup, delivery, targeted manual dispatch, failed delivery, Rider return report, Rider denial of return confirmation, Cashier physical-return confirmation, return idempotency, unchanged payment ledger, status history, and delivery event audit.
7. Rolls back all fixture state and verifies tenant/Auth identity cleanup.

No production role trigger, grant, migration, or runtime code was weakened or changed for this repair.

## Verification status

The corrected commit pushes to the existing branch and the workflow is configured to trigger on this test-file path. The Actions result for commit `99d1e92b326b852e2d3d57307d8754b4e5e18816` must be checked before claiming the behavioral suite passes. The prior run is a known fixture setup failure, not a passing command test.

## Next action

Inspect the Actions run for commit `99d1e92b326b852e2d3d57307d8754b4e5e18816`. If it fails, inspect the exact SQL step/log and repair only a demonstrated fixture or delivery-command defect. Then confirm rollback. Continue with expiry-boundary and concurrency tests before POS/Rider return-queue integration. Keep Production, `main`, deployments, Realtime, checkout and catalog publication untouched.
