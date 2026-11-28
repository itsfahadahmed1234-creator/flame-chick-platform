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
- Deployed Worker version: 8
- Version ID: `a6145175-caa0-4138-ba53-f5c7782d147d`
- Deployment ID: `79e98bf7-6bbb-480d-bcd0-6fb357c7a52f`
- Previous active rollback version: 7 (`ab9b5ed4-e5d0-4093-bc8b-8e3602906c7e`)
- GitHub deployment workflow run: [46128209921](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46128209921) — success.
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

- Isolated POS + Rider + Delivery release test workflow: [46127235072](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46127235072) — success.
- POS production deployment workflow: [46128209921](https://github.com/itsfahadahmed1234-creator/flame-chick-platform/actions/runs/46128209921) — success.
- POS Worker and refresh tests: 13 passed, 0 failed.
- Allowlisted asset build: success (10 approved public files).
- Wrangler dry-run: success.
- Wrangler production deployment: success; URL and version ID returned by Wrangler and confirmed against Cloudflare API.
- Delivery API mocked regression and POS refresh tests passed in the isolated release check.

## Manual verification pending

Do not mark the overall restaurant system as operational solely from automated checks. The user plans a manual rehearsal next.

Before opening the POS, hard-refresh the current POS browser tab (Ctrl+Shift+R); that tab was opened before the version 8 deployment and its last captured UI state is not a post-deployment verification.

Manual test sequence should use clearly identified test activity and test accounts, not real customer orders:
1. Sign in to the POS and confirm menu/branch access.
2. Verify Online Orders loads and its connection status is healthy.
3. Verify the delivery board and Rider portal show only the correct branch/rider scope.
4. With a clearly marked test delivery, test Ready → offer → rider accept → picked up → delivered, plus decline/reassignment and offer expiry where practical.
5. Confirm post-delivery Rider availability is correct and POS refreshes without redundant polling.
6. Test QZ Tray signing/printing separately with a test receipt. A browser snapshot from before the POS redeploy displayed “Failed to sign request”; because it predates version 8, retest after hard refresh. If it persists, treat it as an open QZ signing issue and stop printing tests until investigated.

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

This is one successful end-to-end test reported by the user. Do not overstate it as a complete multi-scenario acceptance rehearsal. It does not prove QZ Tray, the physical receipt printer, or network recovery on the actual restaurant cashier computer. The physical restaurant hardware and staff setup remain unverified.

See the new [Restaurant Installation & Test-Data Handoff](2026-11-28-restaurant-installation-and-test-data-handoff.md) for the next-chat plan. It covers the hardware/software installation sequence, separate kitchen-ticket printing limitation, staff roles, remaining restaurant rehearsals, test-order cleanup safeguards, and the Edge Function invocation baseline.

No test orders have been deleted. No test-data cleanup, SQL write, migration, Auth change, secret change, or schema change has been performed.

The next phase is supervised physical restaurant installation and completion of remaining rehearsals: dine-in, takeaway, concurrent orders, offer decline/expiry/reassignment, failed delivery and physical return confirmation, role isolation, printer restart, and network recovery. Do not start unrestricted restaurant operations until the user accepts the full rehearsal.

The absolute Supabase Logs restriction remains unchanged: do not access, run, edit, investigate, or otherwise touch the log query that previously exceeded 102 GB and was later observed at 106 GB. Do not use Logs Explorer or any equivalent log-query route.
