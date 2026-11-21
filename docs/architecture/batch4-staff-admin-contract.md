# Flame Chick Staff Admin API — Batch 4

- Edge Function accepts a signed-in Supabase user JWT and publishable API key; platform JWT verification is enabled.
- Handler validates the token with Auth. Normal database commands use the original user JWT so Postgres derives the actor from auth.uid().
- No browser-supplied actor ID or role claim is trusted.
- Only active restaurant-wide Admin and Owner roles may manage staff.
- Service secret is used only for Auth invitations and the service-only finalizer. New sb_secret keys go in apikey only, never Authorization: Bearer.
- Exact CORS allowlist: FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS. Invitation redirect: FLAME_CHICK_STAFF_INVITE_REDIRECT_URL; must be HTTPS and on an allowed origin.
- No Auth directory listing, tokens, magic links, passwords, or raw provider errors stored.

## Actions
GET: branches, staff role assignments, active/pending/failed invitations, recent audit.
POST invite: email, display_name, optional phone, role_key, branch_ids, request_id, optional reason.
POST assign_role: target_user_id, role_key, branch_ids, request_id, reason.
POST deactivate_role: role_id, request_id, reason.
POST cancel_invitation: invitation_id.
POST retry_finalize: invitation_id; retries DB finalization without sending another email.
POST accept_invitation: invitee must be signed in with the exact confirmed email; inviter must remain active.

Admin/Owner are restaurant-wide. Manager/Cashier/Rider are branch-scoped. Same operational role can span branches; conflicting roles are rejected. Self-assignment and self-deactivation are denied. Last active Owner is protected.

## Invitation saga
1. Create private pending invitation with idempotency request ID.
2. Ask Supabase Auth to send invitation.
3. Finalize Auth UID through service-only DB command.
4. On failure record stable failure code and Auth UID when available; retry finalization without sending another email.
5. If Auth reports an existing account, do not enumerate users or send a duplicate invite. Existing account holder signs in and accepts with exact confirmed email.

## Required environment
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS (legacy fallbacks supported), FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS, FLAME_CHICK_STAFF_INVITE_REDIRECT_URL.
