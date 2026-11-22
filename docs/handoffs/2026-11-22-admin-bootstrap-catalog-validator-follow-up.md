# 2026-11-22 — Admin bootstrap and catalog publication validation follow-up

## Admin account

The intended Auth user `itsfahadahmed1234@gmail.com` was created and email-confirmed in the correct Flame Chick Production Supabase project. A trusted postgres transaction created the active `user_profiles` row and a restaurant-wide `admin` role with `branch_id = NULL` and `assignment_method = 'initial_bootstrap'`. The role trigger wrote an audit event with action `activated` and actor equal to the Admin user. The separate Owner account remains uncreated.

## Production readiness

The Admin web app is not yet operational. Its bootstrap requires the `flame-chick-staff-admin` Edge Function, which is not deployed. Exact allowed origins, invitation redirect URL and server-only secret configuration remain outstanding. The new Vercel Admin production project has not been deployed. Keep all non-Staff modules disabled: source still contains legacy direct REST CRUD/storage operations that must be replaced by secure command APIs before those modules can be enabled.

## Catalog validator candidate

Migration candidate:
`supabase/migrations/20261122035721_flame_chick_catalog_publication_validation_fixes_v1.sql`

Commit:
`36423a0e481095f306bdd02eaf5ee6d85f31b80c`

Changes:
1. Only active schedule sets referenced by an active deal collection or an active schedule assignment for an active deal are validated for timezone/windows and included in the published snapshot.
2. Per-deal-variant option-map completeness is enforced only for required component groups (`min_units > 0`). Optional groups do not require a map.

The migration uses preflight and postflight guards to preserve PostgreSQL ownership, ACL, SECURITY DEFINER and function configuration. A rollback-only Production smoke test covered an unreferenced active schedule set: it was not rejected and was omitted from the compiled snapshot. The transaction was rolled back and a separate query confirmed no fixture remained.

This is not full acceptance. A dedicated optional-group fixture and full disposable local Supabase migration-chain validation remain required. The migration is NOT applied to Production.

## Advisor results

- Security: INFO notices for RLS-enabled/no-policy tables are expected under the current deny-by-default model; WARN that leaked-password protection is disabled.
- Performance: unused-index INFO notices are expected while the business schema is empty; do not remove indexes based on these measurements.
- Health: no findings.

## Security hygiene

A legacy POS browser tab previously exposed a credential in its URL query string. Treat it as compromised, rotate it if valid, clear browser history/screenshots/logs where possible, and never place credentials in URLs. This was not established to be the new Admin password.

## Next

1. Finish full migration-chain and optional-group QA on a disposable local stack.
2. Enable Auth leaked-password protection and configure the exact Admin Site URL/redirect allowlist.
3. Configure the Staff Admin Edge Function's exact origins and server-only secret, deploy with JWT verification enabled, and test role boundaries.
4. Deploy Admin to a protected preview; test login and staff operations. Do not enable other modules.
5. Build secure catalog/order/delivery/media command APIs before enabling those modules.
6. Keep customer Website cutover and real-menu seeding separately gated.
