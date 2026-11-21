# Batch 3 — Staff Identity & Roles Acceptance Review

**Date:** 2026-11-20  
**Status:** Candidate completed; DDL-only and behavioral rollback validation passed. **Not applied to Production.**  
**Candidate:** `docs/drafts/batch3_staff_identity_roles_candidate.sql`

## Production baseline

Read-only checks against Flame Chick Production `adkrxfnawdiljhjaavnj` confirmed PostgreSQL 17.12, Mumbai `ap-south-1`, Free plan. SQL identity was `current_user=postgres`, `session_user=postgres`.

After disposable tests: Auth users 0, restaurants 0, branches 0, Batch 3 public tables 0, Batch 3 private tables 0. Migration history remains unchanged (hardening baseline, Batch 1 and Batch 2 only). All candidate objects and test fixtures were rolled back.

## Candidate scope

- `public.user_profiles`: minimal profile linked to Auth.
- `public.user_roles`: restaurant-wide Admin/Owner and branch-scoped Manager/Cashier/Rider.
- `public.staff_role_audit`: append-only role and identity audit.
- `app_private.staff_invitation_requests`: private recoverable Auth invitation workflow.
- `app_private.staff_invitation_branch_targets`: tenant-safe branch targets for operational invitations.

No catalog, order, payment, delivery, rider-profile, Edge Function, Storage or Realtime objects are included.

## Implemented controls

- One active role identity per user/restaurant. Manager/Cashier/Rider may repeat the same role across branches; conflicting role keys are rejected. Admin/Owner are restaurant-wide and cannot coexist with operational assignments.
- Restaurant and user transaction advisory locks serialize role changes. Last active Owner cannot be disabled before a successor Owner is active.
- Initial Admin/Owner bootstrap is limited to a trusted postgres session and is not an application command.
- Assignment identity is immutable; revocation is one-way with actor, timestamp, reason and request ID. No hard delete or reactivation.
- Role activation/deactivation automatically writes audit rows in the same transaction. Audit rejects UPDATE, DELETE and TRUNCATE.
- Composite tenant/branch FKs prevent cross-restaurant role or invitation targets.
- Invitation branch-target consistency is deferred to transaction end.
- Invitation state is a recoverable Auth/database saga; no tokens, magic links, passwords or raw provider responses are stored.
- Acceptance checks Auth identity, normalized email match, confirmed email and expiry. Duplicate open invitations per restaurant/email are prevented.
- All five tables are postgres-owned, RLS-enabled, have no policies or direct grants to PUBLIC/anon/authenticated/service_role; app_private schema USAGE remains revoked. No Realtime membership.
- Internal trigger functions use postgres ownership, SECURITY DEFINER with empty search_path, and explicit application-role EXECUTE revokes.

## Disposable validation

Candidate DDL was executed alone inside a transaction and rolled back. A separate transaction re-applied it with temporary fixtures and tested:
1. Initial Admin bootstrap and Admin assigning an Owner.
2. Last-Owner deactivation denied; successor Owner assignment and safe transfer succeed.
3. Same-role multi-branch assignments succeed; different role across branches rejected.
4. Cross-tenant branch reference rejected.
5. Profile cannot be disabled while active roles remain.
6. Multi-branch invitation and deferred branch-target integrity.
7. Auth ID/email match and confirmed-email acceptance.
8. Duplicate open invitation rejected.
9. Role assignment/deactivation automatically writes audit rows.
10. Audit UPDATE and protected table TRUNCATE rejected.

The successful fixture transaction explicitly ended in ROLLBACK. Post-rollback checks confirmed zero Batch 3 objects/rows, zero Auth users and unchanged migration history.

## Remaining gates

- **Parallel concurrency testing is not yet done.** A true two-session race test (two Admin requests concurrently attempting to remove the last active Owner) must run in isolated staging before Production approval.
- This is a schema candidate, not the Staff Admin API. Verified JWT actor derivation, Admin + Owner command authorization, Auth invitation orchestration, staff read projections and exact command grants belong to a later function/RLS batch.
- The invitation saga must coordinate invitation audit and role creation idempotently. Invitation audit is written by the future trusted Staff Admin command after Auth returns the target UID; role assignment triggers write their own audit rows.
- Direct client access remains closed; do not add broad grants/policies to silence expected RLS-without-policy INFO findings.

## Approval gate

**Not applied to Production.** This candidate and review are not approval to apply it. Separate explicit approval is required before a permanent migration.

No external encrypted backup artifact was created. No app source, Vercel settings/deployments/domains, API keys, environment variables or exposed-schema settings were changed.


## 2026-11-21 concurrency regression result

The last-active-Owner concurrency test was run three times against the existing project using disposable synthetic fixtures. Each trial held the exact per-restaurant advisory transaction lock in a third session, then launched two separate competing Owner-deactivation SQL requests. In all three trials, one UPDATE committed, the other was rejected with `LAST_ACTIVE_OWNER_PROTECTED` (SQLSTATE 23514), and exactly one active Owner remained. The trigger function is VOLATILE; its internal count statement behaved correctly under the tested READ COMMITTED lock-wait pattern. The earlier suspicion of a stale-snapshot race was withdrawn.

After the trials, all temporary Batch 3 relations and functions plus synthetic Auth users and restaurants were removed. Final checks showed zero Auth users/restaurants/branches, zero Batch 3 relations/functions/migration entries/Realtime entries, and no migration-history changes. The detailed procedure and limitation notes are in `docs/drafts/batch3_last_owner_concurrency_test.md`.

Batch 3 remains a candidate only. No permanent migration was applied. Separate explicit approval is required for that step.
