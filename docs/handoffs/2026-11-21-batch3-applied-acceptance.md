# Flame Chick — Batch 3 applied and verified
Date: 2026-11-21
Repository: `itsfahadahmed1234-creator/flame-chick-platform`
Working branch: `work/production-source-audit`
Supabase project: `adkrxfnawdiljhjaavnj` — Flame Chick Production, Mumbai, PostgreSQL 17.12, Free plan

## Status
**Batch 3 database foundation is applied and verified.** No Supabase development branch was created and no plan upgrade was made.

## Applied migrations
The Supabase migration history now contains:
- `20261121043115_batch3_staff_identity_roles`
- `20261121043149_batch3_staff_fk_indexes`

Canonical repository files:
- `supabase/migrations/20261121043115_batch3_staff_identity_roles.sql`
- `supabase/migrations/20261121043149_batch3_staff_fk_indexes.sql`

The filenames intentionally match the actual versions assigned and returned by Supabase. The initial draft filenames were corrected in the working branch to match those recorded versions.

## Schema created
Five tables:
- `public.user_profiles`
- `public.user_roles`
- `public.staff_role_audit`
- `app_private.staff_invitation_requests`
- `app_private.staff_invitation_branch_targets`

Eight private trigger functions:
- `enforce_user_profile_rules`
- `guard_staff_role_audit_insert`
- `reject_staff_role_audit_mutation`
- `enforce_user_role_rules`
- `enforce_staff_invitation_request_rules`
- `enforce_staff_invitation_branch_target_rules`
- `check_staff_invitation_branch_targets`
- `reject_staff_truncate`

Role scope and controls:
- Admin and Owner are restaurant-wide.
- Manager, Cashier and Rider are branch-scoped.
- A staff identity can have multiple branches only when its active role key is identical across those branches.
- Conflicting role keys in one restaurant are rejected.
- Role assignments are revoked rather than deleted; actor, time, reason and request ID are retained.
- Role activation/deactivation writes append-only audit events within the same transaction.
- The last active Owner is protected.
- Initial bootstrap is restricted to a trusted postgres session and must never be exposed as a client command.
- Invitations are private workflow records; no tokens, magic links, passwords or raw provider responses are stored.
- Tenant/branch composite foreign keys prevent cross-restaurant branch references.

## Verification after application
Direct database checks confirmed:
- All five tables exist, are owned by `postgres`, and have RLS enabled.
- No RLS policies exist. This is intentional deny-by-default, not an oversight.
- No Realtime publication membership.
- `anon`, `authenticated` and `service_role` have no direct table privileges on these five tables.
- Those three application roles have no `app_private` schema USAGE.
- All eight trigger functions are postgres-owned SECURITY DEFINER functions with empty `search_path`.
- None of the eight trigger functions is directly executable by anon, authenticated or service_role.
- All 10 advisor-identified foreign-key index gaps were covered by the second migration.
- All tables remain empty: no Auth users, staff profiles, role assignments, audit rows, invitations or invitation targets were seeded.
- Restaurants and branches also remain empty.

## Advisor results
**Security:** 7 INFO `rls_enabled_no_policy` findings (2 existing Batch 2 tables plus the 5 new Batch 3 tables). These are intentional because no application role has direct table privileges and no policies are defined. Do not add broad grants or policies merely to silence these INFO notices. Revisit only when narrowly scoped read projections or command APIs are implemented.

**Performance:** 0 unindexed foreign-key findings after the FK-index migration. 18 INFO unused-index findings remain because the new tables are empty and no application workload uses the indexes yet. Preserve the indexes for now; reassess after real staff/operational traffic and query-plan review.

**Health:** 0 lints.

## Tests and cleanup
Before permanent application, the candidate passed:
- DDL/rollback validation.
- Behavioral acceptance tests for bootstrap, role conflicts, same-role multi-branch access, tenant/branch FK isolation, audit immutability, invitation state validation and last-Owner protection.
- Three independent concurrent last-Owner trials. Each trial allowed one Owner deactivation and rejected the competing request with `LAST_ACTIVE_OWNER_PROTECTED`; exactly one active Owner remained.

All temporary test objects and synthetic fixtures were removed after these tests. Following final migration application, checks again confirmed zero Auth users, restaurant rows, branches, profiles, role assignments, audit records and invitation records.

## Explicitly not implemented by Batch 3
This migration provides the secured database foundation, not the Staff Admin product/API. The following remain later work:
- Staff Admin Edge Function / command API.
- Verified JWT actor derivation and current role/branch authorization on every command.
- Invitation orchestration with Supabase Auth and recoverable saga/idempotency behavior.
- Narrow staff read projections and exact grants for the required UI/session bootstrap.
- Role-management UI and the initial staff bootstrap procedure.
- End-to-end API tests for all five roles and branch isolation.

No Auth invitation was sent; no staff accounts or restaurant/branch rows were created. No application code, domains, Vercel settings/deployments, API keys, exposed-schema configuration or paid resources were changed.

## Handoff note
The root `PROJECT_HANDOFF.md` update endpoint previously returned 404 despite reads succeeding. This dated addendum is the authoritative post-application Batch 3 status and supersedes earlier addenda saying Batch 3 was only a candidate. Read it after the root handoff when resuming.
