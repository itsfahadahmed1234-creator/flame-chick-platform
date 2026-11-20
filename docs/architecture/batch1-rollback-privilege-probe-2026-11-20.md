# Flame Chick — Batch 1 rollback-only privilege probe

**Date:** 2026-11-20  
**Project:** Flame Chick Production `adkrxfnawdiljhjaavnj` (Mumbai, PostgreSQL 17.12, Free plan)  
**Execution identity:** `current_user=postgres`, `session_user=postgres`  
**Status:** Disposable SQL probes only; all probe DDL/default-privilege changes were rolled back. No persistent database changes.

## Pre-test baseline

- Project status ACTIVE_HEALTHY.
- Existing application migration remains `20261119125153 flame_chick_postgres_default_privileges_hardening`.
- No application relations in `public` or `app_private`; `app_private` does not exist.
- The only public routine remains `public.rls_auto_enable()`; its existing owner is postgres and its execute ACL is restricted to postgres.
- The `ensure_rls` event trigger remains enabled and its function body was inspected read-only. It applies automatic RLS to newly created tables in `public`, not arbitrary private schemas.
- Postgres schema-specific defaults in `public` remain hardened for tables, sequences and functions.
- No global default-ACL row exists for postgres. The built-in implicit PUBLIC defaults therefore still apply to newly created functions and types unless explicitly revoked globally.
- Existing internal `supabase_admin` defaults in `public` remain broad; do not create application objects as that role or try to alter its managed defaults.

## Probe A — schema-only revokes (rolled back)

Created a uniquely named temporary schema inside a transaction, revoked client schema access, and added schema-specific default ACL revokes for tables, sequences, functions and types. Created one disposable table, sequence, function and enum type, then deliberately raised an exception to roll back.

Observed effective privileges:
- anon/authenticated/service_role schema USAGE: false
- client table SELECT: false
- client sequence USAGE: false
- client function EXECUTE: **true**
- client type USAGE: **true**
- all probe objects owned by postgres: true

**Finding:** schema-specific default ACL revokes do not cancel PostgreSQL's implicit global PUBLIC grants for functions and types. The previous Batch 1 spec was incomplete on these two object types.

## Probe B — global PUBLIC revokes plus private-schema revokes (rolled back)

Repeated the disposable probe after also applying, inside the same rollback transaction:
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE USAGE ON TYPES FROM PUBLIC`

Observed effective privileges:
- anon/authenticated/service_role schema USAGE: false
- client table SELECT: false
- client sequence USAGE: false
- client function EXECUTE: false
- client type USAGE: false
- all probe objects owned by postgres: true

The test ended with an intentional exception. A subsequent read-only query confirmed the probe schema does not exist, there are zero probe relations, no schema-specific probe default ACLs remain, and no global postgres default ACL rows remain. This confirms the probe changes were rolled back.

## Advisor checks

After rollback, Supabase advisors returned zero lints for:
- Security
- Performance
- Health

Advisor cleanliness is supplemental and does not replace explicit permission tests.

## Decision and caution

Batch 1 must revoke the implicit PUBLIC defaults for future postgres-created functions and types globally, then apply the private-schema-specific revokes for application roles. This global scope affects future postgres-created functions/types in every schema; any intentionally callable public RPC must be explicitly granted after review. This is a deliberate security-hardening choice and must be reflected in migration review.

No migration was applied, no persistent schema or default privileges were changed, no data was written, and no Auth, Edge Functions, Storage, Realtime, application code, Vercel, or deployments were touched.
