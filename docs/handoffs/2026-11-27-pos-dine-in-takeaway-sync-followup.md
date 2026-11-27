# Flame Chick POS — next-session handoff: Dine-in / Takeaway sync and table payment error

**Updated:** 2026-11-27 (Asia/Karachi)  
**Repository:** itsfahadahmed1234-creator/flame-chick-platform  
**Working branch:** work/production-source-audit  
**POS root:** apps/flame-chick-pos  
**Current Production URL:** https://flamechick-pos.vercel.app/

## 1. Exact current release state

- Vercel account: imfahad0123-5106
- Team: FahaD — Hobby / Free — team_whJsonilovUt4vVCoIBD6L1m
- POS Vercel project: flame-chick-pos-development — prj_oWxuLLIJBMutlBzVX4Ko5N4jBWEw
- Root Directory: apps/flame-chick-pos
- GitHub repository: itsfahadahmed1234-creator/flame-chick-platform
- Production deployment: dpl_6VuqJfbd89a7f1V6TTV6L6n2CEjP
- Deployment state: READY; target: production
- Deployed code commit: f6ce0ea49aeb165fec382280dcc3f90c4747a706
- Deployed source branch: work/production-source-audit
- Production alias: https://flamechick-pos.vercel.app/
- Deployment immutable URL: https://flame-chick-pos-development-3bbhwr2uj-faha-d.vercel.app/
- The Vercel project is on Hobby / Free. Do not upgrade or add paid services without explicit approval.
- Vercel Production Branch is configured as main, but the approved POS deployment was created manually from the working branch at the exact SHA above. Do not deploy main or change the Production Branch.
- The first Production-release handoff was recorded in commit c1ffbbf7a1af3697d7ef47abb5be6290aa0493cd. This POS bug handoff was then added in commit 62f06ba0672de5a1f71b315425fedb93aebedbb1, and the primary PROJECT_HANDOFF pointer was updated in commit 2a304d908fe64c623b6a9fe5cee8f3c2d78328f4. Verify the current branch head before making source changes.
- The user's former account's flamechickpos.vercel.app hostname is separate and was not detached, transferred or modified. Do not touch that old account/domain.

## 2. Vercel deployment guard / quota protection

- Project commandForIgnoringBuildStep is restored to exit 0 after the intentional manual Production deployment. This prevents routine Git pushes from creating automatic builds.
- To create an explicitly approved manual Preview after a fix: temporarily set the Ignored Build Step to null, create one deployment from the exact working-branch SHA with target preview, then immediately restore exit 0 and verify the setting.
- Do not create repeated previews or production deployments for every small change. Batch tested fixes and conserve Vercel build/deployment quota.
- No Production deployment is authorized by this handoff. A future Production deployment requires explicit approval after the user has verified the Preview.

## 3. Production environment / QZ state

- QZ_SIGNING_PRIVATE_KEY is configured as a Sensitive Vercel environment variable for Production. Its value was not decrypted, read, logged or exposed.
- Before Production release, the QZ signing CORS allowlist and regression test were updated to allow https://flamechick-pos.vercel.app and reject the incorrect .vercel.com host.
- Previous Preview diagnostics proved QZ Tray could connect, trust the Flame Chick certificate, receive a valid signature from the server and submit a job to the Windows print queue on the development PC.
- The user has no physical printer connected at the development PC. Actual paper output, paper alignment and cutter operation remain unverified. A job appearing in Windows' print queue is not proof of physical printing/cutting.
- Keep kitchen printing disabled. Do not claim physical printer readiness. Do not enable unattended / automatic direct printing until the actual printer has been tested.
- Production-host QZ signing should be smoke-tested with a signed-in authorized staff account after the POS issues are safely resolved. Use synthetic diagnostics only, not real customer orders.

## 4. New user-reported POS bugs — next task

The user reports these issues on the POS and wants the next session to focus on fixing them.

### A. Takeaway orders are not syncing to the database

- Orders entered as Takeaway in POS are not appearing / syncing to the Supabase database.
- Do not infer yet whether local save succeeds, the sync queue enqueues, the client sends the request, the Order Edge Function accepts it, or the database insert is rejected.
- Trace the complete path from UI action → local persistence → sync queue / retry state → HTTP request/payload → Edge Function validation and DB command → authoritative row read-back.
- Identify how Dine-in / Takeaway are represented (fulfillment_type, source, table fields, payment state, etc.) from actual code/schema, not assumptions.
- Check idempotency and retries before attempting a second sync. Do not create duplicate orders to test.

### B. Dine-in orders are not syncing to the database

- Dine-in orders entered through the POS also are not appearing / syncing to Supabase.
- Diagnose separately from Takeaway first. They may share a common sync function, or fail for different fulfilment-specific validation or table metadata. Prove which path from source and logs.
- Verify table number / table identifier and fulfilment fields survive local normalization and the server payload without being lost or mapped into the wrong fields.

### C. Dine-in table cannot be completed — JavaScript runtime error

- User opens a Dine-in table, clicks Complete the Payment, and the UI fails with this exact error: “Assignment to constant variable.”
- This is a runtime JavaScript assignment-to-const error. Do not guess which variable or rewrite the payment flow without evidence.
- Inspect the exact click handler and every function it calls. Capture/locate the browser console stack and line number; identify the const binding that is later reassigned. Check for related state mutations and whether the payment action has already partially changed local state before the exception.
- Fix the narrow root cause, preserve table/order/payment invariants, and add a regression test that reproduces this path.
- Confirm whether the same broken handler prevents both local completion and cloud synchronization, or whether these are independent defects.

## 5. Important payment semantics — avoid conflating flows

Read these before changing anything:
- docs/handoffs/2026-11-23-cashier-payment-collection-v1.md
- docs/handoffs/2026-11-25-pos-history-delivery-payment-checkpoint.md
- docs/handoffs/2026-11-25-pos-production-delivery-sync-hotfix.md

The existing server-side Delivery collection flow is deliberately scoped to delivered orders and has payment-ledger/idempotency protections. A Dine-in table's Complete the Payment action may be a different workflow. Do not route it into the Delivery-only cashier collection RPC or alter Delivery settlement semantics unless source/schema proves that is intended and the user explicitly approves any required backend change.

Existing business rule for Delivery remains: Rider marking Delivered does not itself collect payment or complete the order; authorized staff must collect the outstanding amount. Same request ID retries must remain idempotent. GST remains deferred.

## 6. Mandatory next-session reading

Start with:
1. PROJECT_HANDOFF.md — primary current project checkpoint. This handoff has been updated to point to this task.
2. This file: docs/handoffs/2026-11-27-pos-dine-in-takeaway-sync-followup.md.
3. docs/handoffs/2026-11-26-new-vercel-pos-preview-project.md — current new-account POS Vercel project and release configuration.
4. docs/handoffs/2026-11-25-pos-history-delivery-payment-checkpoint.md.
5. docs/handoffs/2026-11-25-pos-production-delivery-sync-hotfix.md.
6. docs/handoffs/2026-11-23-cashier-payment-collection-v1.md.
7. docs/handoffs/2026-11-25-rider-access-admin-main-branch-fix.md — staff roles, private Realtime and current operational state.
8. docs/handoffs/2026-11-26-qz-tray-synthetic-diagnostics.md and docs/handoffs/2026-11-26-qz-root-ca-base64-correction.md — QZ setup/limits if printing behavior is touched.

Also inspect README.md, docs/architecture/overview.md, docs/operations/production-readiness-checklist.md, and relevant POS source/tests. Historical handoffs may contain earlier statuses and older Vercel hosts; prefer the newest dated handoff and this explicit current state. Do not assume every old handoff is current or repeat already-completed work.

## 7. Required investigation / implementation method

1. Verify repository, current branch head, deployed Production SHA and Vercel project identity. Continue on work/production-source-audit; do not switch to or change main.
2. Read the current full apps/flame-chick-pos/index.html plus imported JS modules, API routes, sync/reconciliation code, local stores and relevant tests. Search for the table payment handler and sync path. Read the matching Supabase Edge Function and migration/RPC definitions as needed.
3. Build a data-flow map for Dine-in and Takeaway separately. Examine existing Production schema/constraints and current API contracts. Do not infer table names or columns from old Demo code.
4. Determine whether the bug is client-side, Edge Function validation, RPC/database constraints, role/access context, or a mismatch between client and deployed server bundle. Verify the live deployed Edge Function version and exact file contents before concluding a server mismatch.
5. Use code-level static / unit / disposable integration tests first. Any diagnostic must use synthetic data and must not create real customer orders or payments. Prefer a rollback-only/disposable Supabase fixture for inserts and payment-state tests.
6. Check uncertain network outcomes and preserve the existing order/request idempotency key on retry. Never manually insert duplicate cloud rows to "see if sync works."
7. Do not mutate Production rows, apply migrations, deploy/replace Edge Functions, or change Vercel Production as a diagnostic shortcut. If a schema/API change is genuinely required, explain the evidence and request explicit approval for that Production mutation.
8. Implement the smallest correct fix with regression coverage. Run all relevant existing POS/Rider tests and CI checks.
9. Only after checks pass, prepare one intentional Preview deployment from the exact working branch SHA, restore the Ignored Build Step to exit 0, and have the user verify both fixes on Preview. No Production rollout unless the user separately approves.
10. Update PROJECT_HANDOFF.md and this/latest focused handoff after every completed stage. Record exact SHAs, tests, deployments and what remains unverified.

## 8. Project-wide hard boundaries

- Supabase Production: adkrxfnawdiljhjaavnj, Mumbai ap-south-1, Free plan.
- Keep existing Production database, orders, payments, catalog, branch and staff data intact. No arbitrary deletions or data repair.
- No service-role key or Supabase secret in browser source, Git, chat or client environment variables.
- Server-side authorization and pricing remain authoritative. Do not trust client-calculated totals or role claims.
- Admin and Owner have full business authority. Manager has POS and return-confirmation access but no Admin panel / deletion permission. Cashier can use POS / assign riders / reject as allowed but cannot delete. Rider sees only their own offers.
- One active Main branch and Asia/Karachi timezone are in the current Production context; verify before relying on branch assumptions.
- Free-plan constraints apply; no paid upgrade without approval.
- GST implementation is explicitly deferred.
- Full controlled E2E rehearsal, backup/restore readiness, role/cancellation/return/payment checks and physical printer verification are still required before real restaurant operations. Production deployment does not equal launch approval.
- Preserve existing local order receipt / pending order data if any failure occurs. Do not clear local storage, delete failed orders or rebuild the local database without user approval.

## 9. Current status / first action

No source fix for these newly reported Takeaway / Dine-in sync failures or the Dine-in Assignment to constant variable error has been applied in this handoff. No new Preview or Production deployment was created for these issues. The next chat should first read the handoffs and inspect the source / current API contracts, then report the evidenced root cause(s) and a safe fix plan before mutating Production.
