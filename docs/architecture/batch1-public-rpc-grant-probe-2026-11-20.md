# Flame Chick — Explicit public RPC grant probe

**Date:** 2026-11-20  
**Project:** `adkrxfnawdiljhjaavnj`, PostgreSQL 17.12  
**Execution role:** `postgres`  
**Status:** Disposable function created and permission-tested inside a transaction; intentional exception rolled back all changes.

## Test
Created a temporary SECURITY INVOKER function in `public`, revoked EXECUTE from PUBLIC, anon and authenticated, and explicitly granted EXECUTE to service_role.

Observed ACL/effective permissions:
- PUBLIC EXECUTE ACL entry: false
- anon EXECUTE: false
- authenticated EXECUTE: false
- service_role EXECUTE: true
- function owner: postgres
- SECURITY DEFINER: false

All assertions passed. The probe then raised an intentional exception to roll back.

## Rollback verification
A subsequent read-only query confirmed:
- Probe function does not exist.
- Probe function count is zero.

## Advisors
After rollback, Supabase Security, Performance and Health advisors each returned zero lints.

## Conclusion
The explicit public-wrapper grant pattern works for the tested SECURITY INVOKER/service_role case. This does not yet approve any real RPC or authorize persistent schema changes. Real wrappers still require exact signature grants, input validation, schema-qualified internal calls, and per-function threat review.
