# Flame Chick POS — QZ Tray synthetic print diagnostics

**Date:** 2026-11-26  
**Scope:** Preview-only POS change. No Production deployment, Supabase change, order creation, payment, real printer job, or kitchen-printing change.

## Verified base

- Repository: \`itsfahadahmed1234-creator/flame-chick-platform\`
- Branch: \`work/production-source-audit\`
- Base commit: \`86c6df261f6d45aa3e5ad855d7e33d88b062db49\`
- Base Preview deployment: \`dpl_AfxTG4bMPu8cSBv27nu7MYM81ehE\` — READY
- Preview URL: \`https://flame-chick-pos-production-qk2ci2a3k-befahad1234-7050.vercel.app\`
- Vercel project: \`flame-chick-pos-production\`
- Root directory: \`apps/flame-chick-pos\`

## Source findings

- \`index.html\` loads \`qz-tray@2.2.5/qz-tray.js\`; the comment in \`qz-printing.js\` previously described 2.3.0. The diagnostic reads the JavaScript client version from the actual script URL. It also records the QZ Tray runtime version only if the loaded API exposes \`qz.api.getVersion({ details: true })\`.
- QZ 2.2.5 supports the existing \`setCertificatePromise\`, \`setSignaturePromise\` and SHA512 security APIs (these security methods are documented as available since 2.1.0).
- The current raw-print config specifies \`encoding: 'CP437'\`. QZ config documentation supports the \`encoding\` property. The synthetic test receipt is ASCII-only, so its CP437 bytes are exactly its ASCII code points (0x00–0x7F). The encoder fails closed if unexpected non-ASCII data appears.
- The QZ signing callback receives a serialized \`toSign\` string. This is separate from the receipt command string passed as \`data: [payload]\`.
- The existing server signer remains unchanged. It checks the Supabase user session and active staff context before signing. \`QZ_SIGNING_PRIVATE_KEY\` remains server-only.

References:
- https://qz.io/docs/signing
- https://qz.io/api/qz.security
- https://qz.io/api/qz.configs
- https://github.com/qzind/tray/releases

## Diagnostic implementation

System Settings → Printing now includes **Download QZ Diagnostic Files**. The control is enabled only on the Flame Chick POS Preview deployment host pattern.

The feature:
1. Builds only the existing synthetic QZ test receipt.
2. Creates a readable ESC/POS command file and exact CP437/ASCII-subset bytes.
3. Reconnects QZ Tray to exercise the certificate promise where possible.
4. Uses a unique, randomized diagnostic printer name that is not the selected physical printer.
5. Calls the real \`qz.print()\` serialization path with the same raw command object shape.
6. Captures the exact \`toSign\` string only in the print signature callback.
7. Calls the existing signer with that synthetic request, records HTTP status and whether a non-empty response was returned, but never writes the returned signature to a file.
8. Deliberately rejects the QZ signature promise. It never resolves the signature to QZ Tray and never uses the selected physical queue as the diagnostic request target.
9. Downloads four files locally. Nothing is uploaded to GitHub, Vercel or Supabase.

If the QZ signature callback is not reached, \`flame-chick-qz-sign-request.txt\` explicitly says **NOT CAPTURED**. The JSON differentiates a certificate resource HTTP check from actual QZ certificate-promise resolution and WebSocket connection.

## Downloaded files

- \`flame-chick-qz-print-request.txt\` — ESC/POS commands with visible control bytes.
- \`flame-chick-qz-print-request.bin\` — raw bytes for the synthetic payload.
- \`flame-chick-qz-sign-request.txt\` — exact captured \`toSign\`, or an explicit NOT CAPTURED marker.
- \`flame-chick-qz-diagnostic.json\` — timestamp, Preview hostname, selected printer metadata, QZ library/runtime version availability, WebSocket/certificate states, signature callback state, signer HTTP metadata, payload sizes, chronological stages and errors.

The JSON does not contain the request body, customer data, access tokens, certificate text, private keys or returned signatures. The signing-request text file contains only the synthetic QZ request string.

## Tests

Run from the repository root:

\`\`\`sh
node --test apps/flame-chick-pos/tests/qz-printing-diagnostics.test.js
node --check apps/flame-chick-pos/qz-printing.js
\`\`\`

The unit test covers synthetic payload content, exact ASCII-subset CP437 bytes, visible ESC/GS/LF/CR markers, and fail-closed handling of non-ASCII characters. The normal \`printReceipt()\` and \`testPrint()\` paths continue to use the same signer and \`CP437\` configuration when diagnostic mode is inactive.

## Next action

Open the Preview POS, sign in with an authorized staff account, open System Settings → Printing, and click **Download QZ Diagnostic Files**. Upload all four generated files into the chat. Do not click **Print Test Receipt** yet.

After inspecting the files, resolve the evidenced failure stage first. Only then proceed through the staged printer verification sequence. Do not modify Windows trust files, replace certificates, rotate keys, enable kitchen printing, or test with a real order without evidence and separate authorization.

## Outstanding verification

- Confirm the Git commit and resulting Preview deployment are READY.
- Run the Node tests and static checks against the committed source.
- Generate and inspect one diagnostic set from the user's signed-in Preview browser.
- Physical printer output and silent-print trust acceptance remain intentionally untested.


## Follow-up: verify the signing key matches the served certificate

The signer verifies each generated RSA-SHA512 signature in memory against the first (leaf) X.509 certificate in `qz/digital-certificate.txt` before returning it to the browser. PEM extraction uses explicit BEGIN/END boundary positions (not a regular expression). This checks the server-only `QZ_SIGNING_PRIVATE_KEY` / public-certificate pair without exposing either private material or signature bytes.

- If verification fails, the endpoint returns HTTP 503 with a generic mismatch message and does not return the signature.
- If verification succeeds, the endpoint returns the same Base64 signature as before and adds `X-QZ-Signature-Verified: true`.
- The browser diagnostic records only this boolean alongside the signer HTTP result.
- This verifies key/certificate correspondence; it does not inspect or change QZ Tray's local `override.crt`, Site Manager entries, or Windows trust state.
- No database, Supabase, Production branch, or Windows setting is changed.

- Regression note: the first verification deployment used an over-escaped PEM extraction expression and returned HTTP 503 before key comparison. The extraction was replaced with explicit PEM boundary detection and covered by tests against the actual two-certificate bundle.
- The additional tests also ensure a signature made by a different RSA key is rejected. A successful comparison with the configured server keypair is still confirmed only by the next authenticated Preview diagnostic.
