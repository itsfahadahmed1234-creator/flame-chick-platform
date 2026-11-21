# Flame Chick — Batch 4 Staff Admin applied and QA
Date: 2026-11-21
Repository: itsfahadahmed1234-creator/flame-chick-platform
Working branch: work/production-source-audit
Implementation commit: 0342f2eb6a9f6f8c34e6da4182d9af5cc7f60d37
Supabase project: adkrxfnawdiljhjaavnj — Flame Chick Production, Mumbai ap-south-1, PostgreSQL 17.12, Free plan

## Status
Batch 4 database commands and invitation workflow are applied and behaviorally tested with disposable rollback fixtures. The public RPC was hardened further: it is now an invoker wrapper around a postgres-owned SECURITY DEFINER implementation in non-exposed app_private. The security advisor no longer reports an authenticated SECURITY DEFINER function in public. The follow-up migration and handoff are in this commit. Edge Function source and config are committed to the working branch but are NOT deployed.

## Applied migrations
- 20261121053647_flame_chick_staff_admin_commands
- 20261121053712_flame_chick_staff_admin_command_qa_fixes
- 20261121053829_flame_chick_staff_admin_invitation_recovery
- 20261121054852_flame_chick_staff_command_definer_isolation

## Database API
- public.flame_chick_staff_admin_command(text,jsonb): SECURITY INVOKER PostgREST wrapper, execute only authenticated.
- app_private.flame_chick_staff_admin_command_internal(text,jsonb): postgres-owned SECURITY DEFINER, empty search_path, execute only authenticated; derives actor from auth.uid() and checks active restaurant-wide Admin/Owner.
- public.flame_chick_staff_admin_system_command(text,jsonb): postgres-owned SECURITY DEFINER, empty search_path, execute only service_role; checks service_role JWT context.
- Authenticated has USAGE on app_private only to call the private internal function. app_private is not Data API exposed. No app-role direct table privileges.
- Actions: list, assign_role, deactivate_role, begin_invitation, cancel_invitation, retry_finalize, accept_invitation; system actions complete_invitation and fail_invitation.
- Invitee acceptance requires exact confirmed email, active issuer, unexpired invite and active target branches.
- Retry Finalize recovers pending/failed invitations with a recorded Auth UID and does not send another email.
- Admin/Owner are restaurant-wide. Manager/Cashier/Rider are branch-scoped. Self-assignment and self-deactivation are denied. Last active Owner remains protected.
- Initial Admin bootstrap remains manual postgres-only; no API bypass exists.

## QA
- Verified function owners, SECURITY INVOKER/DEFINER split, empty search_path, and grants.
- Verified five staff tables remain postgres-owned and RLS-enabled; no direct application-role table privileges.
- Verified anon and service_role have no app_private USAGE; authenticated has only the schema USAGE needed to call the private function.
- Rolled-back synthetic tests exercised Admin list and non-admin denial, role assignment, deactivation, invitation creation/finalization/acceptance, acceptance idempotency, failed-invitation retry finalization, and cancellation.
- Test fixtures were rolled back; production counts remain zero for restaurants, branches, Auth users, profiles, roles, audit rows, invitations and targets.
- Security Advisor: seven INFO RLS-enabled-without-policy findings (intentional deny-by-default); no authenticated SECURITY DEFINER warning after isolation.
- Performance Advisor: 11 INFO unused indexes on empty tables; Health Advisor: zero findings.

## Source and deployment boundary
- Staff Admin source uses Batch 4 RPCs, Auth token validation, exact-origin CORS, environment-based keys, no Auth directory enumeration and sanitized provider errors.
- config.toml sets verify_jwt=true only for Staff Admin; catalog/order/delivery settings unchanged.
- Required before deployment: FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS and FLAME_CHICK_STAFF_INVITE_REDIRECT_URL. Confirm these are set and verified before deployment.
- No Edge Function deployed; no secrets set; no invitations sent; no Auth users, restaurant, branch or staff accounts created; no Admin bootstrap; no Admin UI or Vercel changes.
