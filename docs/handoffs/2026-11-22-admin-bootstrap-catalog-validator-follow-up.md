# 2026-11-22 — Admin bootstrap and catalog publication validation follow-up

## Admin account

The intended Auth user `itsfahadahmed1234@gmail.com` was created and email-confirmed in the correct Flame Chick Production Supabase project. A trusted postgres transaction created the active `user_profiles` row and a restaurant-wide `admin` role with `branch_id = NULL` and `assignment_method = 'initial_bootstrap'`. The role trigger wrote an audit event with action `activated` and actor equal to the Admin user. The separate Owner account remains uncreated.

## Production readiness

The Admin web app is not yet operational. Its bootstrap requires the `flame-chick-staff-admin` Edge Function, which is not deployed. Exact allowed origins, invitation redirect URL and server-only secret configuration remain outstanding. The new Vercel Admin production project has not been deployed. Keep all non-Staff modules disabled: source still contains legacy direct REST CRUD/storage operations that must be replaced by secure command APIs before those modules can be enabled.

## Catalog validator candidate

Migration candidate:
`supabase/migrations/20261122035721_flame_chick_catalog_publication_validation_fixes_v1.sql`

Candidate commit:
`36423a0e481095f306bdd02eaf5ee6d85f31b80c`

Changes:
1. Only active schedule sets referenced by an active deal collection or an active schedule assignment for an active deal are validated and included in the published snapshot.
2. Per-deal-variant option-map completeness is enforced only for required component groups (`min_units > 0`). Optional groups do not require a map.

The migration uses preflight and postflight guards to preserve PostgreSQL ownership, ACL, SECURITY DEFINER and function configuration. A rollback-only Production smoke test had already confirmed an unreferenced active schedule set was ignored and omitted from the compiled snapshot; that transaction was rolled back.

## Disposable migration-chain QA — PASSED

GitHub Actions run:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45010662936

- Run `45010662936` completed successfully on `work/production-source-audit`, commit `24964d22116f74b74a80ebd2fd31684db1ba9c9a`.
- The disposable local Supabase database successfully replayed every migration file on the work branch, including the validator candidate. The workflow checked that the local migration ledger count matched the migration-file count.
- The dedicated rollback-only fixture passed all four intended cases: optional group without variant map accepted; required group without map rejected; referenced active empty schedule rejected; unreferenced active empty schedule accepted and not compiled.
- Fixture SQL explicitly rolled back. A follow-up check confirmed no QA tenant remained, and local Supabase stopped successfully.

CI/work-branch corrections:
- Added a disposable-database-only no-op compatibility function for hosted-managed `public.rls_auto_enable()`, which is not present in the local Supabase stack. No event trigger is created, and Production was not changed.
- Added the missing top-level semicolons after the three function definitions in the repository copy of `20261121053647_flame_chick_staff_admin_commands.sql`, allowing PostgreSQL to replay it. This did not edit or reapply any historical Production migration.
- Expanded CI path filtering so changes to any SQL migration run the migration-chain QA; added manual workflow dispatch.

Production safety status:
- The validator candidate is still NOT applied to Production.
- Production ledger remains at 23 migrations, latest `20261122031027_flame_chick_catalog_publish_rollback_v1`.
- A read-only post-run check reported zero QA fixture tenants and zero QA schedules in Production.
- No production menu data, publication, Edge Function deployment, or Website change resulted from this QA.

Next: final review of the candidate migration and its guarded Production preflight/postflight/ACL checks. Obtain separate approval before applying it to Production.
## Advisor results

- Security: INFO notices for RLS-enabled/no-policy tables are expected under the current deny-by-default model; WARN that leaked-password protection is disabled.
- Performance: unused-index INFO notices are expected while the business schema is empty; do not remove indexes based on these measurements.
- Health: no findings.

## Security hygiene

A legacy POS browser tab previously exposed a credential in its URL query string. Treat it as compromised, rotate it if valid, clear browser history/screenshots/logs where possible, and never place credentials in URLs. This was not established to be the new Admin password.

## Next

1. Complete final review of the validator candidate's Production preflight/postflight, function ownership, ACL and SECURITY DEFINER checks. The migration remains unapplied until separate explicit approval.
2. Enable Auth leaked-password protection and configure the exact Admin Site URL/redirect allowlist.
3. Configure the Staff Admin Edge Function's exact origins and server-only secret, deploy with JWT verification enabled, and test role boundaries.
4. Deploy Admin to a protected preview; test login and staff operations. Do not enable other modules.
5. Build secure catalog/order/delivery/media command APIs before enabling those modules.
6. Keep customer Website cutover and real-menu seeding separately gated.
