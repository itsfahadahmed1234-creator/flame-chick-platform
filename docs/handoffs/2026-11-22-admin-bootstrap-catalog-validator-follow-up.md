# 2026-11-22 — Admin bootstrap and catalog publication validation follow-up

## Admin account

The intended Auth user `itsfahadahmed1234@gmail.com` was created and email-confirmed in the correct Flame Chick Production Supabase project. A trusted postgres transaction created the active `user_profiles` row and a restaurant-wide `admin` role with `branch_id = NULL` and `assignment_method = 'initial_bootstrap'`. The role trigger wrote an audit event with action `activated` and actor equal to the Admin user. The separate Owner account remains uncreated.

## Production readiness

The Admin web app is not yet operational. Its bootstrap requires the `flame-chick-staff-admin` Edge Function, which is not deployed. Exact allowed origins, invitation redirect URL and server-only secret configuration remain outstanding. The new Vercel Admin production project has not been deployed. Keep all non-Staff modules disabled: source still contains legacy direct REST CRUD/storage operations that must be replaced by secure command APIs before those modules can be enabled.

## Catalog validator candidate — final review complete; not applied

Candidate migration:
`supabase/migrations/20261122035721_flame_chick_catalog_publication_validation_fixes_v1.sql`

Working branch:
`work/production-source-audit`

Final reviewed branch commit:
`88c92ffed25e550d7a09cd38013a7d0db9d5cc8d`

The candidate changes only the bodies of the two same-signature private helpers:
- `app_private.flame_chick_catalog_publication_validate(uuid)`
- `app_private.flame_chick_catalog_compile_snapshot(uuid,timestamptz)`

### Behavior reviewed

1. Required deal component groups (`min_units > 0`) still require a per-deal-variant option map. Optional groups may omit it.
2. Active deal collection fallback schedules remain references in the published snapshot even when no active deals currently belong to the collection. An inactive or invalid schedule referenced by an active collection blocks publication; the compiler must not emit a dangling fallback reference.
3. Unreferenced active schedule drafts do not block publication and are omitted from the public snapshot.
4. Active-deal schedule assignments are validated and compiled; inactive-deal assignments are ignored and omitted. A timezone mismatch on an active deal remains a publication error.
5. Active deal schedule assignments referencing inactive branches are rejected. Both the assignment and its otherwise-unreferenced schedule set are omitted from the snapshot.
6. Existing validation rejecting active component groups with no eligible options remains unchanged.

### Live Production helper baseline — read-only verified

Both live function definitions were inspected directly in Production before reviewing this migration:

- Owner: `postgres`
- ACL: `{postgres=X/postgres}`
- `SECURITY DEFINER = true`
- `search_path = ""`
- No EXECUTE for `anon`, `authenticated`, or `service_role`
- Volatility, strictness, parallel-safety, leakproof, cost and row-estimate metadata were captured and checked.

SHA-256 fingerprints of the live function source bodies:

| Helper | SHA-256 |
| --- | --- |
| `flame_chick_catalog_publication_validate(uuid)` | `018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712` |
| `flame_chick_catalog_compile_snapshot(uuid,timestamptz)` | `b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2` |

The migration fails closed if the live source fingerprints, owner, ACL, `SECURITY DEFINER`, empty search path or other captured execution metadata differ from the expected baseline. It captures the metadata and verifies it again after replacement. The migration uses an explicit transaction; a preflight or postflight error aborts the whole change. It adds no persistent table/column/index, business data, publication or application-role grant. The temporary guard table is transaction-local.

### Final disposable migration-chain and fixture QA — PASSED

GitHub Actions run:
https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/45012702344

- Run `45012702344` completed successfully on the final reviewed work-branch revision `88c92ffed25e550d7a09cd38013a7d0db9d5cc8d`.
- The workflow checked the SHA-256 and security-baseline guards, confirmed the branch-schedule compiler predicate, and performed a clean local Supabase startup.
- The complete migration history, including the candidate, replayed successfully.
- The rollback-only SQL fixture passed all targeted cases: optional vs required group mappings; active collection fallback; inactive collection fallback rejection; unreferenced schedules; inactive-deal assignments; active-deal timezone mismatch; inactive-branch assignment rejection and omission from both assignment and schedule-set snapshot arrays.
- The fixture ended with `ROLLBACK`; the workflow verified the QA tenant count was zero and stopped the disposable stack successfully.

The local harness adds a no-op `public.rls_auto_enable()` function only to the disposable local DB because Supabase provides that helper in hosted projects but not in the local stack. It adds no event trigger and does not alter Production. The repository copy of `20261121053647_flame_chick_staff_admin_commands.sql` also received three missing top-level statement terminators on this work branch solely so the complete migration chain replays locally; no applied Production migration was changed or reapplied.

### Production remains unchanged

Read-only verification after CI reported:

- Migration ledger: 23 entries; latest `20261122031027_flame_chick_catalog_publish_rollback_v1`.
- One restaurant and one branch.
- Zero categories, products, product variants, deals, schedule sets, publications and current-publication pointers.
- Zero QA fixture tenants.
- Candidate migration is NOT applied to Production.
- No Edge Function, Admin deployment, customer Website, Vercel alias, menu data or publication was changed.

### Rollback readiness and review verdict

The forward-only compensation migration and recovery runbook are now prepared; see `docs/architecture/catalog-validator-recovery-v1.md`. The updated CI workflow rehearses candidate → behavior fixture → compensation → restored-state verification on the disposable local stack. Treat recovery as tested only after that new CI run is green. The compensation preserves append-only migration history and restores the original helper source hashes and security metadata.

**Verdict:** the candidate has passed the live-baseline security review and full disposable QA. It is conditionally ready for a separately approved Production migration. It has not been applied and this review is not permission to apply it.

## Advisor results

- Security: INFO notices for RLS-enabled/no-policy tables are expected under the current deny-by-default model; WARN that leaked-password protection is disabled.
- Performance: unused-index INFO notices are expected while the business schema is empty; do not remove indexes based on these measurements.
- Health: no findings.

## Security hygiene

A legacy POS browser tab previously exposed a credential in its URL query string. Treat it as compromised, rotate it if valid, clear browser history/screenshots/logs where possible, and never place credentials in URLs. This was not established to be the new Admin password.

## Recovery package prepared

## Forward-only validator recovery — prepared; CI rehearsal running/pending

The recovery package has now been added on `work/production-source-audit`:

- Compensation migration: `supabase/migrations/20261122050000_flame_chick_catalog_publication_validation_restore_v1.sql`
- Recovery verification fixture: `supabase/tests/catalog_publication_validation_recovery_v1.sql`
- Operational runbook: `docs/architecture/catalog-validator-recovery-v1.md`
- CI workflow updated to replay the full ordered migration history, then manually rehearse candidate → candidate regression fixture → compensation → restored-state fixture on the disposable local stack.

The compensation is forward-only and transactional. It requires the exact candidate helper source hashes and the expected postgres owner, ACL, SECURITY DEFINER, empty search_path, and execution attributes. It restores the original function definitions copied from the already-applied `20261122031027` migration, then verifies the original SHA-256 hashes and restrictive metadata. It adds no persistent business schema/data and does not erase either migration-ledger entry.

Exact helper fingerprints:

| Helper | Candidate body | Restored body |
| --- | --- | --- |
| Validator | `f179cc3b15b1d6ad5b07b90587513001bed97b752b09b13ce2d9c946e88a7750` | `018c71056df82ef92fb0aa92f87713e9a91cba156156c7e2f300c12584b04712` |
| Snapshot compiler | `1cee9543d131260f71573afc2f0a5a204422a59fa7f46ef0b24f4c2e277e3808` | `b79cd02dde2bca71dce7815516017bfc53b3f9e2e2c0deac1bd5c9a7ef2404e2` |

**Important:** this is prepared recovery code, not yet declared tested until the updated GitHub Actions run completes successfully. The intended production Supabase project remains untouched; neither the candidate nor compensation has been applied there. The recovery runbook requires a separate explicit approval for any future remote compensation and mandates a dry-run showing only the one intended migration.


## Next

1. Confirm the updated candidate → compensation CI rehearsal is green.
2. Obtain separate explicit approval before applying the candidate to the intended production Supabase project; it remains unapplied.
3. Enable Auth leaked-password protection and configure the exact Admin Site URL/redirect allowlist.
4. Configure the Staff Admin Edge Function's exact origins and server-only secret, deploy with JWT verification enabled, and test role boundaries.
5. Deploy Admin to a protected preview; test login and staff operations. Do not enable other modules.
6. Build secure catalog/order/delivery/media command APIs before enabling those modules.
7. Keep customer Website cutover and real-menu seeding separately gated.
