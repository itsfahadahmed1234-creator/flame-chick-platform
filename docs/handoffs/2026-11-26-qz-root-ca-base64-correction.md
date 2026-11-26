# Flame Chick POS — QZ root CA correction and development-PC checkpoint

**Date:** 2026-11-26  
**Scope:** Preview-only QZ certificate correction and development-workstation verification. All QZ connection, printer-discovery, and queue-submission checks described below were performed on the **development PC**, not the restaurant's PC. No Production deployment, Supabase change, key rotation, POS order workflow change, or physical print test.

## Confirmed evidence

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/production-source-audit`
- Corrected-certificate commit: `1e2c5901f793df91bebdcad0a29dfe9156243c02`
- Preview deployment: `dpl_CGF4Sr8Qe5s3pXV1VVM9idZZrNpZ`
- Preview URL: `https://flame-chick-pos-production-jtv058kdd-befahad1234-7050.vercel.app`
- QZ Tray runtime: 2.3.0+1
- QZ JavaScript client: 2.2.5
- The user's QZ Tray Details screenshot showed the expected Flame Chick POS leaf certificate, a valid request signature, but `Trusted: Untrusted website`.
- The screenshot's displayed SHA-1 fingerprint prefix `d11569a30fbb7b593b6c728d7ccef667` matches the SHA-1 fingerprint of the leaf certificate in the deployed POS bundle.
- The second PEM block (Flame Chick QZ Signing Root CA) had a Base64 body of 1,265 characters. A Base64 body cannot have length congruent to 1 modulo 4, so the root could not be decoded as X.509.
- The user's original installed `override.crt` had the same malformed root block.
- The malformed fragment was `CggEBAALZVRXUi`; the corrected fragment is `CggEBALZVRXUi` (remove one duplicated `A`).

## Cryptographic verification of corrected chain

The corrected root parses as an X.509 certificate, is self-issued, and its self-signature verifies. Its Subject Key Identifier matches the leaf certificate's Authority Key Identifier. The leaf issuer matches the root subject, and the leaf certificate signature verifies using the corrected root public key.

- Correct root SHA-256 fingerprint: `09:75:00:92:BE:AB:AD:F2:24:29:1F:9E:AB:5C:9E:6A:57:AF:13:71:53:CA:75:B0:6C:70:7D:3D:5D:A2:6D:C3`
- Correct root validity: 2026-11-26 03:10:09 UTC through 2036-11-23 03:10:09 UTC.
- Corrected root PEM file size: 1,338 bytes.
- No private key was read, changed, regenerated, or exposed.

## Source change

- Corrected only the duplicated Base64 character in `apps/flame-chick-pos/qz/digital-certificate.txt`.
- Added a regression test to parse both PEM blocks, verify the root self-signature, confirm the leaf/root issuer relationship, and verify the leaf signature using the root public key.
- Automated tests were authored but were not run in a Node test environment during this checkpoint.
- No changes to `qz-printing.js`, `api/qz/sign.js`, staff permissions, order code, Supabase, or `main`.

## Follow-up performed on the development PC

The corrected certificate and QZ connection flow were subsequently tested on the **development PC only**:

1. The user backed up the previous installed override certificate as `override-original-2026-11-26.crt` and installed the corrected `override.crt`.
2. QZ Tray was restarted. The troubleshooting log showed it loading the corrected CA: `CN=Flame Chick QZ Signing Root CA, O=Flame Chick`.
3. The POS initially could not establish its QZ connection. The official QZ demo connected successfully. After the user allowed the required app/local loopback access for the POS, the POS-to-QZ connection worked.
4. QZ Tray Site Manager showed both **QZ Industries, LLC** and **Flame Chick POS** in the **Allowed** list. Keep both entries; do not remove either.
5. **Find Windows Printers** successfully discovered Windows printer queues.
6. A synthetic diagnostic receipt test was submitted to the Windows print queue. This was a diagnostic test, not a customer order or kitchen job.

### What this does and does not prove

**Confirmed on the development PC:** QZ Tray was running; the corrected root CA was loaded; the POS connected after the required app/local access was allowed; the QZ identities were allowed; Windows printer discovery worked; and a synthetic test job was accepted into a Windows print queue.

**Not confirmed:** No physical printer was attached/available for this development-PC test, so no paper receipt was produced. Paper width, alignment, font rendering, character encoding on the target printer, cutter behavior, printer-driver compatibility, and final physical output remain untested. A Windows queue accepting a job is not proof that a printer physically printed it.

If the synthetic diagnostic job is still pending in a Windows queue, cancel it so it cannot unexpectedly print when a printer becomes available. Keep normal order direct-printing and kitchen printing disabled until the appropriate real hardware has been tested.

## Workstation boundary — important

The above is **development-PC validation only**. It must not be described as installation, setup, or successful testing on the restaurant's PC.

The restaurant's PC remains a separate pending workstation task. When work moves there, configure and verify QZ Tray, the corrected trust certificate, and the required browser/app local-network permissions on that PC itself. Then discover the restaurant PC's actual printer and perform a physical test only when its printer is connected and available. Do not infer restaurant-PC readiness from the development-PC result.

## Next task: match the restaurant's receipt styling

The next development task is to make the Flame Chick POS customer receipt match the restaurant's existing receipt style.

**Required source before styling changes:** obtain a clear, straight, full-length photo or scan of an actual restaurant receipt (top/header through the bottom/footer). Redact customer names, phone numbers, addresses, order identifiers, and payment details where possible. Do not invent the visual design or assume the paper width.

Once the reference is available:

1. Inspect the receipt's actual layout and compare it with the current POS receipt renderer and QZ payload.
2. Record the reference's paper width/printable area where known, header/logo treatment, text sizing and alignment, separators, item and modifier layout, quantities and prices, totals/fees, and footer.
3. Make the styling changes on `work/production-source-audit` and verify the generated synthetic receipt payload/preview in Preview. Preserve the existing order behavior and keep kitchen printing disabled.
4. Defer physical alignment, paper-feed, encoding, and cutter verification until the actual restaurant printer is available.

Do not begin by assuming a standard 80 mm or 58 mm format; use the restaurant's physical receipt/reference and printer configuration as the source of truth.

## Safety boundary

Preview and development PC only. No Production deployment, production-domain change, Vercel production-target change, Supabase change, real customer order/payment, order-workflow or role change, or kitchen-printing enablement is authorized by this checkpoint. Preserve the production branch `main` and the ongoing shared-branch work.


## Receipt styling checkpoint — 2026-11-26

**Commit:** `5b635460c21e6be2a8e794f308923aea7dff5bb6`  
**Branch:** `work/production-source-audit`  
**Vercel Preview:** `https://flame-chick-pos-production-9521jd4ym-befahad1234-7050.vercel.app`  
**Deployment:** `dpl_D75dtbwpfrUY451RPfFKQYUPstWW` — READY, built from the exact commit above. This is a Preview deployment; no Production promotion or deployment was performed.

### Reference images

- Restaurant receipt: `docs/reference/restaurant reciept  reference.jpeg`
- Existing faulty browser print: `docs/reference/flamechick pos browser print  that not cuts the paper + bad layout .jpeg`

Both images were read directly from GitHub `main` as JPEG data. They were uploaded in main-only commit `ffff5d21debe2900ab0e08246a0727c139cc0da8`; they were not merged into the working branch.

### Files changed in receipt commit

- `apps/flame-chick-pos/index.html`
- `apps/flame-chick-pos/qz-printing.js`
- `apps/flame-chick-pos/tests/qz-printing-diagnostics.test.js`
- `apps/flame-chick-pos/tests/pos-receipt-print-contract.test.mjs` (new)

A follow-up refinement adds `apps/flame-chick-pos/assets/flame-chick-receipt-mark.svg` from the existing Flame Chick brand icon and changes the HTML receipt to show the standalone mark above the wordmark (avoid showing the full horizontal brand SVG twice).

### Implementation

- Reworked browser receipt preview, online-order print fallback, and local POS print fallback to use the same receipt HTML builder.
- Reworked QZ ESC/POS text layout to follow the photographed bill hierarchy: centered Flame Chick header, Original Bill, invoice, fulfillment heading, placed date/time, optional cashier/guest/table rows, customer/delivery details when relevant, aligned item/price rows, subtotal, optional surcharge/delivery/discount, grand total, payment method/amount, and PAID/UNPAID status.
- Removed the literal unwrapped `remove old History modal` text node from the POS HTML; it was visible in the faulty browser print.
- Removed the stale `#thermalPrintFrame` print CSS reference (no corresponding element exists in this POS document).
- Browser print isolates the receipt area on the existing 80 mm page setting, with a 72 mm content width inherited from the existing renderer. This is not a measured printer specification; confirm against the restaurant printer.
- Existing QZ signing, certificate loading, connection, printer discovery, and diagnostic controls were not intentionally changed. The QZ diagnostics export now also exposes a receipt-payload builder for automated tests.

### Data fidelity / unresolved receipt details

The POS order snapshot does not currently provide dedicated cashier-name, guest-count, or surcharge fields in the paths inspected. The receipt renderer displays these only if supplied and does not invent them. No database/schema change was made.

The photo's email address, P-NTN and powered-by footer were too blurred to transcribe confidently, so they were not fabricated or added. Confirm exact text if those must appear. The QZ ESC/POS receipt currently reproduces the text hierarchy; a raster logo/footer image has not yet been implemented for direct thermal printing.

### Verification

Pre-commit checks completed in the code orchestration environment:

- QZ JavaScript syntax compilation: passed.
- Synthetic Dine-in QZ receipt payload with two items, aligned item amounts, surcharge, Easypaisa, and PAID: passed.
- Synthetic unpaid delivery receipt and omission of unavailable cashier/guest/surcharge fields: passed.
- POS inline script syntax compilation: passed.
- Source contract checks for stray text removal and shared browser receipt rendering: passed.

The Node `node:test` suites were added/extended but were **not executed in a Node runtime** during this task. The Vercel Preview build reached READY for commit `5b635460c21e6be2a8e794f308923aea7dff5bb6`; this verifies build/deployment, not the Node test suites or browser print output. No physical printer was available, so paper width, alignment, paper feed, driver behavior, and cutter behavior remain unverified. No actual order/payment or kitchen print was created.

### Safety / branch boundary

- Working branch only; `main` was not modified by the receipt commits.
- No Supabase schema/data/role/policy changes.
- No private QZ signing key accessed, logged, or committed.
- No Production deployment, domain change, kitchen-print enablement, real order/payment, or restaurant-PC setup/test.
- QZ physical output remains unverified on both development and restaurant PCs.
