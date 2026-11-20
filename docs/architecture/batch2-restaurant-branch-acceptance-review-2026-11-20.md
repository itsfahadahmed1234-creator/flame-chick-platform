# Flame Chick Batch 2 — Restaurant and Branch Foundation

**Date:** 2026-11-20  
**Branch:** `work/production-source-audit`  
**Target:** Flame Chick Production, PostgreSQL 17.12, Supabase Free  
**Status:** Candidate and rollback-only acceptance test complete. No persistent DDL applied.

## Production identity and baseline

- Project: `adkrxfnawdiljhjaavnj` — Flame Chick Production
- Organization: `ydlbinhyoutdqueilxnd`
- Region: `ap-south-1`
- Execution identity confirmed as `current_user=postgres`, `session_user=postgres`.
- Existing migrations: Batch 0 hardening and Batch 1 private schema bootstrap.
- No application tables existed before this candidate.

## Candidate artifact

`docs/drafts/batch2_restaurant_branch_foundation_candidate.sql`

Creates exactly:
1. `public.restaurants`
2. `public.branches`

No other schema objects or data are included.

## Design details

### restaurants
- UUID primary key.
- Required trimmed name, lowercase slug unique across restaurants, 3-character uppercase currency code, required IANA timezone.
- `is_active` defaults false.
- Created/updated timestamps. Trusted server commands maintain `updated_at`.
- Timezone and supported ISO-4217 membership validated in trusted provisioning logic, not by fragile catalog-query CHECK constraints.

### branches
- UUID primary key and required restaurant FK with ON DELETE RESTRICT.
- Unique (id, restaurant_id) to support future composite tenant-safe foreign keys.
- Unique (restaurant_id, branch_code).
- Branch code lower-case ASCII, 1–32 characters, digits and single hyphen/underscore separators.
- Customer-facing branch name; operational address and phone private by default.
- `is_active`, `website_ordering_enabled`, `website_delivery_enabled`, `website_pickup_enabled` all default false.
- Delivery/pickup capability cannot be enabled unless the website master ordering gate is enabled.
- POS fulfilment modes are not governed by website flags. Canonical values remain delivery, pickup, dine_in; website only supports delivery/pickup currently.

## Security boundary

- RLS explicitly enabled on both public tables.
- Both table owners postgres.
- No direct privileges to PUBLIC, anon, authenticated or service_role.
- No policies, RPCs, views, functions, triggers, seeds, Auth users, Realtime publication entries, POS table config, catalog or order objects.
- Public branch discovery will later use an explicit safe projection; raw branch rows are not publicly queryable.
- No UI/application changes; POS Dine-in UI remains intentionally untouched.

## Acceptance test

The exact candidate SQL was executed within a disposable transaction. Temporary acceptance data tested:
- valid restaurant and branch insertion;
- fail-closed active/website defaults;
- invalid restaurant slug rejected;
- invalid currency format rejected;
- invalid branch code rejected;
- missing parent restaurant rejected by FK;
- duplicate branch code rejected by unique constraint;
- RLS, owner, no-client-privilege, no-policy and no-Realtime assertions.

One initial test fixture used an invalid branch capability combination, correctly triggering the CHECK before reaching the intended FK assertion. The fixture was corrected and the full suite then passed.

The transaction was explicitly rolled back. A subsequent read-only catalog query confirmed:
- zero Batch 2 tables;
- zero Batch 2 Realtime entries;
- only the already-applied Batch 1 migration record in the checked November migration set.

Supabase Security, Performance and Health Advisors each returned zero lints.

## Remaining gate

This is not a Production migration approval. Before applying, the owner must explicitly approve the exact candidate SQL. No backup artifact exists; owner previously approved proceeding without an external encrypted backup for the empty pre-launch Production environment. No UI, website security audit, POS sync implementation, Edge Function, Auth user, Vercel deployment or live setting was changed.
