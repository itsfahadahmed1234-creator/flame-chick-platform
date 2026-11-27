**Hostname boundary:** The expected initial validation hostname is `flamechickpos.itsfahadahmed1234.workers.dev`. Cloudflare recommends a custom domain/route rather than `workers.dev` for business-critical production. The connected account currently has no zones attached, and the user supplied only the label `flamechickpos`, not a registered full domain/TLD. Use the workers.dev hostname for initial testing only; do not invent a suffix, purchase/register a domain, add a zone, or change DNS. Record the exact full custom production hostname after the user connects the zone/domain.

# HOSTING DIRECTION UPDATE — 2026-11-27

The immediate next-session task is now the Cloudflare POS host, not another Vercel Preview/Production deployment. Read `docs/handoffs/2026-11-27-cloudflare-pos-hosting-continuation.md` and the current top of `PROJECT_HANDOFF.md` first.

- Latest validated POS app source candidate: commit `41c8aea80febd434048e50c352b386c01b02e7d4`, root `apps/flame-chick-pos`. The later `7a818860` commit only updated docs; all 19 POS code/static-asset inputs (excluding README.md) were identical; README.md was updated for hosting documentation only.
- Create a new isolated Cloudflare Workers + Workers Static Assets project/Worker named `flamechickpos` in the connected account. No Cloudflare POS project exists yet.
- The connected Cloudflare account has workers.dev subdomain `itsfahadahmed1234`, no zones, and a separate pre-existing `flame-chick-platform` Worker that must not be touched. Full custom-domain TLD remains unknown.
- Port `/api/qz/sign` to Workers securely; keep `QZ_SIGNING_PRIVATE_KEY` as a Cloudflare encrypted secret and preserve staff auth / RSA-SHA512 / certificate verification / CORS / rate limit. Do not expose it or ship Node signer sources as assets.
- Existing Supabase Production migration `20261127090208`, Order API v12 and Delivery API v4 are already deployed. No backend change is required for simple host creation.
- Keep the current Vercel production alias as fallback until Cloudflare is verified. No Vercel deployment/upgrade/quota bypass, DNS/domain purchase, paid Cloudflare plan change, or unrelated app hosting change is authorized.

---

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

## 4. Verified requirements and Production findings — 2026-11-27

The user confirmed that Takeaway remains receipt-gated: sync begins only after the cashier clicks **Print & Complete**. Do not move Takeaway sync to Place Order.

### A. Rs. 1,348 — active Dine-in table conflict

Read-only PostgreSQL logs at 2026-11-27 02:04:05 UTC (07:04:05 Asia/Karachi) show duplicate-key rejection on `orders_one_active_dine_in_check_per_table_idx`. Production currently has active Dine-in checks:
- FC-261125-0007 — Table 1 / `T1`, `served`, `unpaid`, balance PKR 3,998.
- FC-261125-0002 — Table 2 / `T2`, `served`, `unpaid`, balance PKR 2,198.

The table selector originally checked local IndexedDB only. A server-side check missing locally could appear available and be rejected on sync. The uniqueness constraint is intentional; do not alter either Production row.

### B. Rs. 599 — matching completed/paid Production order

Production contains POS Pickup FC-261127-0002, created at 2026-11-27 02:06:15 UTC (07:06:15 PKT), total PKR 599, `completed`, `paid`, method `bank`. Exactly one successful PKR 599 payment entry exists.

The supplied local error matches `POS_ORDER_NO_LONGER_EDITABLE`. The timestamp/amount are consistent, but the exact local-to-server mapping cannot be proven from the legacy display ID because the database identity is a separate sync UUID. Do not submit another order or payment. Reconcile only after read-only checks of the sync UUID, fulfilment, completion/payment state, total, amount and method.

### C. Dine-in payment defects

- `takePaymentAndCloseTable()` used `const order` and reassigned it after preparing the sync identity, throwing before persistence.
- `finalizeReceiptOrder()` returned early for an already-synced order before attaching the payment request or syncing a pending checkout.
- Table payment also unnecessarily advanced the local revision. The database already supports an idempotent same-revision/same-hash payment request against a served/unpaid Dine-in check. Preserve that revision for payment-only close.

### D. Backend contract

Production `flame-chick-order-api` version 8 is active. The existing unified POS RPC supports Pickup, Dine-in and idempotent payment. The separate collection RPC remains Delivery-only. Production records, migrations and Edge Functions were not changed. No diagnostic orders/payments were created.

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


## 10. Working-branch implementation — validation pending

Changes prepared on `work/production-source-audit`:
- Keep Takeaway receipt-gated; sync only after **Print & Complete**.
- Fix the Dine-in const reassignment and already-synced receipt early return.
- Retain the existing order revision for payment-only close and reuse its payment request UUID.
- Add read-only reconciliation for an exact server order match that is completed and fully paid.
- Include active Production Dine-in table checks in the POS table picker; a conflict preserves the local record and offers a change-table action.
- Drain a new sync request received during an in-progress sync pass rather than dropping it.
- Add payment helper, receipt workflow, table occupancy, reconciliation and concurrent-sync tests.

CI has not yet run at this handoff point. No Preview or Production deployment was created. No Production database records, migrations, Edge Functions or Vercel settings were changed.


## 11. CI and Preview verification — 2026-11-27

- Latest source commit: `76b1b7980b36f5c8e6ee0d0729c1a5ac0cb36e72`.
- GitHub Actions POS/Rider Static Checks run `45931459757`: **success** (job `140284822480`). Includes the new executed Dine-in payment-handler regression.
- Vercel Preview deployment: `dpl_Hi7thZMHjsPhfr4pjpaka3btfwMz`, URL `https://flame-chick-pos-development-br2jk4hll-faha-d.vercel.app`, state **READY**, exact source SHA `76b1b7980b36f5c8e6ee0d0729c1a5ac0cb36e72`.
- Vercel build event confirms the Preview-only ignored-build-step condition passed and `vercel build` completed. The original project Ignored Build Step has been restored to `exit 0`.
- One earlier deployment attempt on the same SHA was canceled because the restored `exit 0` guard took effect before the build step. The final READY deployment above is the one to inspect.
- Production deployment remains `dpl_6VuqJfbd89a7f1V6TTV6L6n2CEjP`, READY on SHA `f6ce0ea49aeb165fec382280dcc3f90c4747a706`; `flamechick-pos.vercel.app` was not reassigned. No Production deployment, database mutation, migration or Edge Function deployment was made.

### Preview test boundary

The Preview is on a different origin from `flamechick-pos.vercel.app`, so its browser IndexedDB is separate. It will not show the two pending local queue rows saved under the Production hostname. Do not create duplicate rows to transfer them. Test the corrected interaction using the Preview and explicitly disposable QA data only; the existing local orders require safe recovery on the originating browser after a separately approved Production release.


## 13. Dine-in revision/content repair — validation pending

The second Preview test correlated with Production FC-261127-0007: local amount PKR 5,346 versus server amount PKR 4,647 on Table 3. Production remains `new/unpaid`, local revision 1, with no payment ledger entry. The local checkout copied changed cart details while reusing the already-accepted revision, so PostgreSQL correctly returned `POS_ORDER_REVISION_CONFLICT`.

Working-branch repair stores canonical sync-content fingerprints, compares legacy local orders to the read-only Production order, bumps the revision only when an editable check's content changed, and preserves the accepted revision/catalog for unchanged payment-only closure. Changed carts are blocked after Production advances the order. The receipt no longer reports success unless the order is actually synced, paid and completed.

CI and Preview validation remain pending. No Production rows, migrations, Edge Functions or deployment settings changed.


## 14. CI and Preview validation — 2026-11-27

- Final working-branch source/test commit: `72ef877cc9c5956b15395bc7f65234db8d2f7d51`.
- GitHub POS/Rider Static Checks run `45936014733`: **success**, job `140299275688`. This is the run after correcting the Dine-in total fixture and conditional-revision static assertion.
- Vercel Preview deployment: `dpl_HTgEAgGjMPBnZkzthV5hLcXDUKAo`, URL `https://flame-chick-pos-development-xvmiukqrq-faha-d.vercel.app`, state **READY**, source SHA `72ef877cc9c5956b15395bc7f65234db8d2f7d51`.
- The Preview build passed its Preview-only ignored-build condition and completed. The original Ignored Build Step was restored to `exit 0`.
- Production domain `flamechick-pos.vercel.app` still routes to `dpl_6VuqJfbd89a7f1V6TTV6L6n2CEjP`, SHA `f6ce0ea49aeb165fec382280dcc3f90c4747a706`. No Production deployment, alias reassignment, database write, migration or Edge Function deployment occurred.

### Transaction testing boundary

The Preview app is served from a different browser origin and has separate IndexedDB from the Production POS. It also uses the shared Flame Chick Production Supabase backend. Therefore, do not create a new order or take payment from Preview for QA. Preview is available for visual/source smoke review only; an end-to-end payment rehearsal requires an explicitly approved safe test environment or an approved Production release/test plan. The existing Production order FC-261127-0007 remains new/unpaid at PKR 4,647 with no payment ledger entry; the local PKR 5,346 pending order remains in the originating Production browser's IndexedDB and should not be duplicated.


## 15. Repeated Dine-in Save Table workflow — lifecycle QA — 2026-11-27

The user confirmed that incremental items before checkout are intended functionality. The expected cashier flow is:

1. Open a Dine-in table, add items and press **Save Table**.
2. Reopen the same table, add further items and press **Save Table** again as many times as necessary.
3. Each save updates the same Production check/local order identity and increments its revision only for changed content. The table remains occupied and unpaid.
4. When finished, **Complete Payment** queues payment against the latest accepted order content/revision. After the server confirms the payment and completed status, the table is released.
5. A retry must reuse the same pending payment request ID and never add another ledger row.

Working source path review:
- `saveLocalOrder()` reuses `activeDineCheckId` when editing an existing Dine-in table check, applies the changed cart and calls `prepareLocalPosSyncOrder(order,{bumpRevision:true})`, then writes both local order and queue under the same legacy local key. A fresh check is created only when no active local check is loaded.
- `getOpenDineCheckForTable_()` keeps unpaid/nonterminal Dine-in checks discoverable for the table selector; after reopening, `openOrStartTable()` reloads the same `localOrderId` and its cart.
- Successful sync persists `serverOrderId`, `serverLocalOrderId`, revision and canonical content fingerprint. Later saves retain the same server order/local sync identity and submit a higher revision.
- `takePaymentAndCloseTable()` checks the content against the latest accepted signature; unchanged checkout keeps the latest revision/catalog publication so payment is attached as a payment-only request. If cart contents changed since the latest accepted save, the current handler treats the edit as a changed revision and permits that only while Production status is still `new`/editable.
- `finalizeReceiptOrder()` writes a stable idempotent payment request into the same order and queue. The table is only considered closed after acknowledgement of `synced + paid + completed`; an error or pending result leaves it open.

Automated coverage was added in `tests/ops-source-hygiene.test.mjs` and run via GitHub Actions:
- Three saves on one table/order identity, revisions 1 → 2 → 3.
- No duplicate local check; same server local-order identity retained.
- Table remains occupied after each successful save.
- Latest revision 3 is retained for payment-only finalization.
- Payment completes the same server order, records one ledger entry, drains the queue and releases the table.
- Retrying finalization does not create a second payment.

CI run `45938023376`, job `140305632811`: **success**; 86 tests passed, 0 failed.

A fresh Preview build was created from branch `work/production-source-audit`, commit `e385d3246276847395330cb064e3471072b62cff`: deployment `dpl_TSCPgDhiZm4pokMgWB2RRd5cv2Ru`, URL `https://flame-chick-pos-development-keghy8uq6-faha-d.vercel.app`, **READY**. This build uses the already-corrected POS checkout source; the latest commit adds lifecycle regression coverage only. The original Vercel Ignored Build Step was restored to `exit 0`.

No Production deployment, alias switch, Supabase migration, Edge Function deployment, Production order or payment write was performed. End-to-end shared-Production transaction rehearsal remains prohibited until a safe isolated transaction environment or explicit test plan is approved.



## History paging, Delivery payment preference and log-load reduction — implementation in progress (2026-11-27)

- The strict-mode History failure was the undeclared `HISTORY_LIST_LIMIT`. The POS now uses a fixed `HISTORY_PAGE_SIZE = 15`; each tab fetches its own first page only. Summary rows omit item/modifier/component/delivery-task nesting. The API uses branch/source/cancelled filters, keyset cursor `(created_at,id)`, no OFFSET and no COUNT. A **Load 15 more orders** action fetches the next server page only when requested. The search placeholder states that it searches loaded rows. Full order details are fetched by order ID only when a row is opened. Existing local IndexedDB merge and legacy duplicate matching have been retained.
- Manual Delivery's chosen COD/Cash/Card/Online is recorded as a proposed preference, not a collection. Server-normalized POS rows now expose `ProposedPaymentMethod`; unpaid cards and receipts say payment is not collected and display the preference separately. The actual summary and payment ledger remain reserved for confirmed Cashier collections.
- Log-load source changes use the private staff-context projection, 15-second warm-isolate cache, and coalesced branch expiry sweep. Auth user validation still occurs for every request; the rider offer expiry deadline and Realtime fallback schedule are unchanged.
- A control-flow error in the Order API context cache was caught during review and repaired in commit `43cf1b579801b8395aad7ab103e2a7780a3c4d18`. The cache now stores a constructed `StaffContext` before returning it.
- These changes remain source-only. No migration has been applied, no Edge Function deployed, no Production order/payment created, and no Vercel Production deployment performed. Do not use the current Production backend to functionally test Preview until the migration and both Edge Functions are separately approved and deployed.
