# Flame Chick POS / Rider / Delivery Release Checkpoint

Date: 2026-11-28 (Asia/Karachi)

## Release branch and isolation

- Release branch: `release/pos-rider-delivery-optimization-2026-11-28`
- Release branch is based directly on production source commit `eee6d501703f3d5a71e11dadc3cfc63d7982b238`.
- The isolated release diff is limited to POS UI/package and POS regression test, Rider UI, Delivery API and its mocked test, plus release-specific CI/deployment workflows and this checkpoint.
- No Website, Admin, Order API or Staff Admin source was carried into this release.
- Existing feature branch `supabase-edge-optimization-2026-11-28` and source branch `work/production-source-audit` were not rebased, merged, force-pushed or rewritten.
- The shared `PROJECT_HANDOFF.md` was not edited; this checkpoint is dedicated to this deployment stream.

## Production deployments

### POS Cloudflare Worker

- Worker: `flamechickpos`
- Production URL: https://flamechickpos.itsfahadahmed1234.workers.dev
- Active Worker version: **9**
- Version ID: `8b2f6ac4-0df4-4f74-84d2-c3f2b68c51d4`
- Deployment ID: `ca57b6b0-bcdb-4ade-9c92-657fa613dafe`
- Previous Worker version available for rollback: 8 (`a6145175-caa0-4138-ba53-f5c7782d147d`)
- GitHub deployment workflow run: [46140147550](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147550) — success.
- The POS public-asset builder prepared exactly 10 allowlisted browser assets. Wrangler found 1 modified asset (`index.html`) and reused 9 unchanged assets.
- Worker settings kept the existing compatibility date, ASSETS binding and observability configuration. No Worker secret value was read or changed.
- Cloudflare secret inventory after deploy still contains `QZ_SIGNING_PRIVATE_KEY` as a `secret_text` binding.

### Rider portal

- Production URL: https://flamechickrider.pages.dev
- Deployed from the Rider production branch at commit `4e45de24fe56fe81436a538b28a21e8cf69121c3`.
- Cloudflare Pages deployment: `4ddbf528-6c16-455f-9601-8d0ca43a21a9`, active.

### Supabase Delivery API

- Project: Flame Chick Production (`adkrxfnawdiljhjaavnj`, Mumbai).
- Function: `flame-chick-delivery-api`, version 5, ACTIVE.
- `verify_jwt=false` preserved because the function performs its existing Auth validation and OPTIONS handling internally.
- No migrations, Auth changes, secret changes, or database writes were part of this deployment.

## Automated verification

- Isolated POS + Rider + Delivery release test workflow: [46140147656](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147656) — success for merged receipt release.
- POS production deployment workflow: [46140147550](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147550) — success; deployed Worker version 9.
- Earlier POS Worker and refresh tests: 13 passed, 0 failed. The v9 receipt-release workflow also passed the full configured POS test suite, build, Wrangler production dry-run, and deployment.
- Allowlisted asset build: success (10 approved public files).
- Wrangler dry-run: success.
- Wrangler production deployment: success; URL and version ID returned by Wrangler and confirmed against Cloudflare API.
- Delivery API mocked regression and POS refresh tests passed in the isolated release check.

## Manual verification pending

Do not mark the overall restaurant system as operational solely from automated checks. The user plans a manual rehearsal next.

The version 9 release is now deployed. Hard-refresh the POS (Ctrl+Shift+R) on any terminal still holding an older browser asset cache.

Manual test sequence should use clearly identified test activity and test accounts, not real customer orders:
1. Sign in to the POS and confirm menu/branch access.
2. Verify Online Orders loads and its connection status is healthy.
3. Verify the delivery board and Rider portal show only the correct branch/rider scope.
4. With a clearly marked test delivery, test Ready → offer → rider accept → picked up → delivered, plus decline/reassignment and offer expiry where practical.
5. Confirm post-delivery Rider availability is correct and POS refreshes without redundant polling.
6. The user has since physically tested the restaurant printer with the deployed QZ path and reported that printing works. Treat printer connectivity/basic printing as confirmed by the user. The next task is receipt-output optimization: refine the printed layout, spacing, logo rendering, long-item wrapping, delivery details/charges, totals and paper-feed/cut behavior based on the user's actual print sample and observations.

No real restaurant order/test order was created by this release deployment.

## Hard boundaries retained

- Never access, run, edit, recreate, troubleshoot, or otherwise touch the Supabase log query that exceeded 102 GB. Do not open Supabase Logs Explorer or use query_logs / equivalent log query paths.
- Log Ingestion is distinct; no configuration was changed.
- Remain on Supabase Free plan.
- Do not deploy or edit the Website/Admin streams or shared Order API / Staff Admin components without explicit separate direction.
- Do not start live restaurant operations until the user completes and accepts the manual end-to-end rehearsal.


---

## Addendum — 2026-11-28 manual test and restaurant-installation handoff

The user has now reported the following manual checks after the Worker v8 deployment:
1. Entered the POS and confirmed QZ Tray was working on the computer being used for that test.
2. Placed a test order through the deployed customer website.
3. Followed the order through POS, Rider delivery, and the payment-collection stage.
4. Reported that the complete workflow ran smoothly.

This is one successful end-to-end test reported by the user. Do not overstate it as a complete multi-scenario acceptance rehearsal. It does not prove QZ Tray, the physical receipt printer, or network recovery on the actual restaurant cashier computer. The user has now confirmed that the restaurant printer has been tested and is working. Remaining hardware-specific receipt appearance refinements and broader staff/restaurant rehearsals are still pending.

See the new [Restaurant Installation & Test-Data Handoff](2026-11-28-restaurant-installation-and-test-data-handoff.md) for the next-chat plan. It covers the hardware/software installation sequence, separate kitchen-ticket printing limitation, staff roles, remaining restaurant rehearsals, test-order cleanup safeguards, and the Edge Function invocation baseline.

No test orders have been deleted. No test-data cleanup, SQL write, migration, Auth change, secret change, or schema change has been performed.

The next phase is supervised physical restaurant installation and completion of remaining rehearsals: dine-in, takeaway, concurrent orders, offer decline/expiry/reassignment, failed delivery and physical return confirmation, role isolation, printer restart, and network recovery. Do not start unrestricted restaurant operations until the user accepts the full rehearsal.

The absolute Supabase Logs restriction remains unchanged: do not access, run, edit, investigate, or otherwise touch the log query that previously exceeded 102 GB and was later observed at 106 GB. Do not use Logs Explorer or any equivalent log-query route.


---

## Addendum — 2026-11-28 QZ receipt release and physical printer test

The QZ receipt-layout release has now been merged and deployed to the existing production POS Cloudflare Worker.

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- PR: [#2 — POS branded QZ delivery receipt](https://github.com/itsfahadah1234-creator/flame-chick-platform/pull/2)
- Merge commit: `50eb6e40143dd8f2bf7a824001a1de50a9de7d21`
- Isolated release branch: `release/pos-rider-delivery-optimization-2026-11-28`
- Feature branch merged: `feature/pos-qz-receipt-layout-2026-11-28`
- Cloudflare Worker: `flamechickpos`
- Production URL: https://flamechickpos.itsfahadah1234-creator.workers.dev
- Active Worker version: **9**
- Version ID: `8b2f6ac4-0df4-4f74-84d2-c3f2b68c51d4`
- Deployment ID: `ca57b6b0-bcdb-4ade-9c92-657fa613dafe`
- Cloudflare reports 100% of production traffic on version 9.
- Previous Worker version 8 remains available for rollback: `a6145175-caa0-4138-ba53-f5c7782d147d`.
- Deployment workflow: [46140147550](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147550) — success.
- Release regression workflow: [46140147656](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46140147656) — success.
- The receipt release test workflow passed its POS regressions, build and Wrangler dry-run before deploying.

### Receipt changes included in v9

- Uses the existing Flame Chick receipt mark/logo in QZ ESC/POS printing.
- Aligns the direct-print receipt structure with the POS receipt renderer.
- Includes delivery/customer information for delivery orders when available.
- Uses a Delivery Charges line for delivery orders and omits delivery-only details/charges for dine-in and takeaway.
- Removes the legacy surcharge line from the receipt presentation.
- Preserves payment details, totals, ESC/POS feed and cut command.
- No Website, Admin, Rider, Supabase schema, Auth, Edge Function, database, secret or shared API changes were included.

### Physical printer confirmation

The user reports that the actual restaurant printer has now been tested and is working with the current setup. Record basic printer connectivity/printing as confirmed by the user. Do not assume this means every receipt layout detail is final: the user explicitly wants to continue optimizing the printed receipt in the next chat.

### Next task — receipt printing optimization

The next chat must begin with **optimization of the QZ thermal receipt output on the deployed POS**, not a new installation or unrelated system redesign.

Start by reading both handoffs, then inspect the current production release branch and the exact v9 receipt implementation before editing. Preserve the existing working QZ connection and do not replace the printer driver or certificate without evidence of a problem. Compare the actual printed result with the intended reference and refine:
- 80mm printable width, margins, line spacing and alignment;
- use, size and clarity of the existing Flame Chick logo;
- restaurant heading/contact block and invoice/order metadata;
- delivery customer name, phone, address, area and instructions;
- Delivery Charges row and totals, without bringing back Surcharge;
- long item names, modifiers, quantities, prices and wrapping;
- payment method/status, grand total, footer spacing, paper feed and cutter command.

Use a real printed sample/photo or the user's specific observations to guide visual refinement. Keep receipt-only code changes isolated to POS printing source/tests, run the full POS regression/build/dry-run suite, and deploy only when verified. Keep the current v9 deployment available as the rollback point. Do not claim pixel-perfect layout until the user confirms the updated physical print.

Other pending restaurant rehearsals and the test-order cleanup safeguards below remain unchanged.
