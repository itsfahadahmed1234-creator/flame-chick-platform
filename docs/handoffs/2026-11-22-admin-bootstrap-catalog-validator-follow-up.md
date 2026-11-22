# 2026-11-22 — Admin bootstrap and catalog publication validation follow-up

## Admin account

The intended Auth user `itsfahadahmed1234@gmail.com` was created and email-confirmed in the correct Flame Chick Production Supabase project. A trusted postgres transaction created the active `user_profiles` row and a restaurant-wide `admin` role with `branch_id = NULL` and `assignment_method = 'initial_bootstrap'`. The role trigger wrote an audit event with action `activated` and actor equal to the Admin user. The separate Owner account remains uncreated.

## Admin readiness

The Admin web app is not yet operational. Its bootstrap requires the `flame-chick-staff-admin` Edge Function, which is not deployed. Exact allowed origins, invitation redirect URL and server-only secret configuration remain outstanding. The new Vercel Admin production project has not been deployed. Keep all non-Staff modules disabled: source still contains legacy direct REST CRUD/storage operations that must be replaced by secure command APIs before those modules can be enabled.

## Admin security readiness — origin policy and plan limits

The Flamechic Supabase organization remains on the Free plan. Current Supabase documentation states that leaked-password protection (HaveIBeenPwned screening) is available on Pro and above. No upgrade was made and no external password-checking substitute was added. The invitation page retains its 12-character minimum; Admin/Owner should use unique password-manager-generated passwords and enable MFA when the auth flow is ready.

The new Vercel Admin project `flame-chick-admin-production` has the verified default domain `flame-chick-admin-production.vercel.app`, but SSO protection applies to all except custom domains. There is no deployment yet. The old `flame-chick-admin.vercel.app` domain belongs to a legacy project and is not the new callback.

The Staff Admin Edge Function source now imports a strict origin policy:
- exact HTTPS origins only in production; explicitly listed loopback HTTP only for local development;
- wildcard hostnames, paths, query strings, fragments and credentials rejected;
- CORS headers returned only for exact allowlisted origins, without wildcard or credentials;
- invite redirects limited to the exact `/accept-invitation.html` page on an allowed HTTPS origin;
- malformed/missing origin configuration fails closed, and disallowed browser origins receive 403.

JWT verification remains enabled. User commands continue with the caller JWT and database-derived `auth.uid()`; service-only invite finalization uses the secret only in the `apikey` header. The database trigger was reviewed and protects the last active Owner (`LAST_ACTIVE_OWNER_PROTECTED`).

CI tests were added for origin parsing/CORS/redirect safety and the role/security contract. Latest Admin static CI: [45020282242 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45020282242). Deno type check: [45020278858 — success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45020278858).

No Auth settings, secrets, deployments, domains, DNS, or aliases have been changed. After the public custom Admin domain is selected and verified, set the Site URL to its root, allow only the exact `/accept-invitation.html` redirect, and configure `FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS` and `FLAME_CHICK_STAFF_INVITE_REDIRECT_URL` to match. Do not deploy or invite staff before this gate is complete.


## Catalog publication validator fix — applied and verified

### Migration

- Supabase project ref: `adkrxfnawdiljhjaavnj`, Flame Chick Production, Mumbai `ap-south-1`, Free.
- Working branch: `work/production-source-audit`.
- Applied ledger version: `20261122105821`.
- Ledger name: `flame_chick_catalog_publication_validation_fixes_v1`.
- Repository file: `supabase/migrations/20261122105821_flame_chick_catalog_publication_validation_fixes_v1.sql`.
- GitHub Actions: [run 45015289131 — completed / success](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45015289131).

The migration changed only the bodies of:
- `app_private.flame_chick_catalog_publication_validate(uuid)`
- `app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)`

### Behavior

1. Required deal component groups (`min_units > 0`) require a per-deal-variant option map; optional groups may omit one.
2. An active deal collection's fallback schedule remains a real snapshot reference even when it has no active deals. An inactive/invalid referenced schedule blocks publication.
3. Unreferenced active schedule drafts do not block publication and are omitted from the public snapshot.
4. Inactive-deal schedule assignments are ignored and omitted; active-deal timezone mismatches still reject publication.
5. Active deal schedule assignments targeting inactive branches are rejected, and the assignment plus its otherwise-unreferenced schedule set are omitted from the snapshot.
6. Existing validation rejecting active component groups with no eligible options remains.

### Pre-apply and post-apply fingerprints

The exact pre-apply source hashes were:
- Validator: `018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712`
- Snapshot compiler: `b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2`

The exact post-apply source hashes are:
- Validator: `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750`
- Snapshot compiler: `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808`

Post-apply metadata was independently read back:
- Owner `postgres`; ACL `{postgres=X/postgres}`.
- `SECURITY DEFINER = true`; `search_path = ""`.
- VOLATILE, non-strict, PARALLEL UNSAFE, non-leakproof, cost 100, rows 0.
- No EXECUTE for `anon`, `authenticated` or `service_role`.

### Revised disposable CI rehearsal — PASSED

The final workflow run replays the complete migration history through the candidate, runs the candidate rollback-only fixture, manually executes the recovery template outside the migrations directory, and verifies the original helper hashes/security metadata are restored. The fixture tenant count is zero and the disposable Supabase stack stopped successfully.

[GitHub Actions run 45015289131](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45015289131)

### Intended production-build project state after apply

- Migration ledger: 24 entries, latest `20261122105821_flame_chick_catalog_publication_validation_fixes_v1`.
- One restaurant and one branch.
- Zero categories, products, product variants, deals, schedule sets, publications and current-publication pointers.
- Zero QA fixture tenants.
- No menu data or publication, customer orders, Edge Function deployment, Admin app deployment, customer Website cutover or Vercel alias change.

Flame Chick remains in the production-build phase. The Supabase project is being prepared for future operations; the customer-facing platform is not live.

## Recovery readiness

- Template: `ops/recovery-migrations/catalog-publication-validation-restore-v1.sql` (outside `supabase/migrations`).
- Recovery fixture: `supabase/tests/catalog_publication_validation_recovery_v1.sql`.
- Runbook: `docs/architecture/catalog-validator-recovery-v1.md`.

The compensation is forward-only and transactional. It requires the exact post-candidate hashes and the expected postgres owner, ACL, SECURITY DEFINER, empty search_path and execution metadata. It restores the exact original helper bodies and verifies the original hashes.

The template is intentionally outside `supabase/migrations` so a routine migration push cannot automatically apply the reversal. If recovery is required, generate a new timestamped migration newer than the latest remote ledger entry, copy the reviewed template into it, dry-run to confirm only that migration is pending, and obtain separate explicit approval before applying. Never delete or repair away the already-applied candidate migration.

## Advisor results and remaining gates

- Security advisor: INFO `rls_enabled_no_policy` notices are expected under deny-by-default; WARN `auth_leaked_password_protection` remains disabled. Enable before broad staff onboarding.
- Performance advisor: unused-index INFO notices are expected while business catalog tables are empty; do not remove indexes based on zero-traffic statistics.
- Health advisor: no findings.

Next work:
1. Enable Auth leaked-password protection and configure exact Admin Site URL/redirect allowlist.
2. Configure Staff Admin Edge Function exact origins and server-only secret; deploy with JWT verification and test role boundaries.
3. Deploy Admin only to a protected preview; keep non-Staff modules disabled until secure command APIs replace legacy direct REST operations.
4. Continue catalog/order/delivery APIs and pricing/quote engine; do not cut over Website while the V3 public snapshot still has deliveryAreas/promotions stubs and the existing Website DTO remains V2.
5. Keep real-menu seeding/publication, customer Website cutover, POS/Rider deployment and Vercel changes separately gated.

## Security hygiene

A legacy POS browser tab previously exposed a credential in its URL query string. Treat it as compromised, rotate it if still valid, clear browser history/screenshots/logs where possible, and never place credentials in URLs. This was not established to be the new Admin password.
