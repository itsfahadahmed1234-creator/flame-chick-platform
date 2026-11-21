# Flame Chick — Batch 4 Staff Admin applied and QA
Date: 2026-11-21
Repository: itsfahadahmed1234-creator/flame-chick-platform
Working branch: work/production-source-audit
Supabase project: adkrxfnawdiljhjaavnj — Flame Chick Production, Mumbai ap-south-1, PostgreSQL 17.12, Free plan

## Status
Batch 4 database commands and invitation workflow are applied. The initial command implementation was corrected by two follow-up migrations before acceptance testing. Final live command functions passed the transactional contract test. Source files are being committed to the working branch. Edge Function is not deployed.

## Applied migrations
- 20261121053647_flame_chick_staff_admin_commands
- 20261121053712_flame_chick_staff_admin_command_qa_fixes
- 20261121053829_flame_chick_staff_admin_invitation_recovery

## Database API
- public.flame_chick_staff_admin_command(text,jsonb): authenticated command; actor derived from auth.uid(); EXECUTE only authenticated.
- public.flame_chick_staff_admin_system_command(text,jsonb): invitation finalizer; EXECUTE only service_role; JWT role context checked.
- Both postgres-owned SECURITY DEFINER, empty search_path.
- Actions: list, assign_role, deactivate_role, begin_invitation, cancel_invitation, retry_finalize, accept_invitation; system actions complete_invitation and fail_invitation.
- Invitation acceptance requires exact confirmed email, active issuer, unexpired invite, and active target branches.
- Retry Finalize recovers pending/failed invites with a recorded Auth UID and does not send another email.
- Initial Admin bootstrap remains manual postgres-only.

## QA
- Verified function owners, security definer, empty search_path, and grants.
- Verified five staff tables postgres-owned, RLS enabled, no direct app-role table privileges, no app_private USAGE.
- Rolled-back synthetic tests covered Admin list and non-admin denial, role assignment/idempotency, deactivation/idempotency, invitation finalization/acceptance/idempotency, failed invite retry-finalization, cancellation and failure metadata clearing.
- Synthetic fixtures rolled back; no test rows remain.
- Security Advisor: 7 INFO RLS-without-policy findings, intentional deny-by-default. Performance: 18 INFO unused indexes on empty tables. Health: 0 findings.

## Not done
No Edge Function deployed, no secrets set, no invitations sent, no Auth users, restaurants, branches, staff accounts or roles created, no initial Admin bootstrap, no Admin UI changes, no Vercel deployment.
