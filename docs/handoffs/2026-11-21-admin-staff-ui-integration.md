# Flame Chick — Admin Staff UI integration handoff
Date: 2026-11-21
Repository: itsfahadahmed1234-creator/flame-chick-platform
Branch: work/production-source-audit
Batch 4 UI integration commit: 4a9ded5ea699e994e01ac0fdd2a05d21d6c5a33d
Follow-up staff refresh commit: 11688f8a2388f7020cc65fca1298ea2d8f1b44b8
Supabase project: adkrxfnawdiljhjaavnj (Flame Chick Production, Mumbai, Free plan)

## Scope
Updated only the existing static Admin app's Staff & riders screen and authentication/bootstrap dependency. No POS, Rider, Website, or other Admin business modules were changed.

## Findings before change
- Staff screen used obsolete fields and actions: full_name, role, set_active and members.
- Owner-only controls conflicted with Admin + Owner authority.
- Removed kitchen role and unsupported role reactivation were still present.
- Bootstrap directly queried user_roles, restaurants and branches; Batch 3/4 denies direct browser access to staff/role tables.
- Remaining Admin modules still use direct PostgREST table operations and need secure server APIs before activation.

## Changes
- Bootstrap uses authenticated Staff Admin API response: actor_role, restaurant, branches, staff, invitations and audit.
- Only Admin and Owner can enter the panel; operational roles stay in their respective portals.
- Staff list uses role_key, display_name, per-branch assignments, confirmed-email state and audit fields.
- Invitation form sends display_name, role_key, branch_ids, reason and an idempotency UUID.
- Admin/Owner invitations are restaurant-wide; Manager/Cashier/Rider invitations require one or more active branches.
- Added invitation cancellation and Retry Finalize (does not resend email).
- Added audited one-way role deactivation and same-role additional branch access.
- Removed kitchen and role-reactivation UI.
- Other Admin modules are disabled until their secure production APIs are implemented.
- Applied DB migration extends the list response with actor_role and restaurant metadata.

## Applied migration
- 20261121055722_flame_chick_admin_staff_context (canonical SQL stored at `supabase/migrations/20261121055722_flame_chick_admin_staff_context.sql`)

## Deployment boundary / next work
- Staff Admin Edge Function remains undeployed; origin, redirect and key secrets remain unconfigured.
- Invitation acceptance page/route is not implemented. Users are not onboarded until exact-email authenticated acceptance succeeds.
- Existing Auth users are not enumerated. Adding branch access is available for listed active members.
- Business modules (dashboard, orders, menu, categories, deals, delivery, media, settings) need server-side APIs before re-enabling.
- No Auth users, restaurant, branches, staff roles or invitations were created. No secrets set, no function deployed and no Vercel deployment started.

## Verification still required
- Full browser runtime and JavaScript syntax/build validation; source has been read back from GitHub, but the static app has no local build command configured.
- Cross-check UI actions against Edge Function and SQL payloads.
- Runtime testing after deployment/configuration and provisioning of an Admin/Owner plus active restaurant/branch.
