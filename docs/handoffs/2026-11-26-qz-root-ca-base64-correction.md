# Flame Chick POS — QZ root CA Base64 correction

**Date:** 2026-11-26  
**Scope:** Preview-only QZ certificate-bundle correction. No Production deployment, Supabase change, key rotation, POS order workflow change, or physical print test.

## Confirmed evidence

- Repository: `itsfahadahmed1234-creator/flame-chick-platform`
- Branch: `work/production-source-audit`
- Pre-fix branch head: `bdf6bcdd41038b28d185d5cdcdf582575b231c18`
- QZ Tray runtime: 2.3.0+1
- QZ JavaScript client: 2.2.5
- The user's QZ Tray Details screenshot showed the expected Flame Chick POS leaf certificate, a valid request signature, but `Trusted: Untrusted website`.
- The screenshot's displayed SHA-1 fingerprint prefix `d11569a30fbb7b593b6c728d7ccef667` matches the SHA-1 fingerprint of the leaf certificate in the deployed POS bundle.
- The second PEM block (Flame Chick QZ Signing Root CA) had a Base64 body of 1,265 characters. A Base64 body cannot have length congruent to 1 modulo 4, so the root could not be decoded as X.509.
- The user's installed `override.crt` had the same malformed root block.
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
- No changes to `qz-printing.js`, `api/qz/sign.js`, staff permissions, order code, Supabase, or `main`.

## Next verification

1. Verify the new GitHub commit and its Vercel Preview deployment are READY.
2. Download the corrected second certificate block from the new Preview or use the supplied corrected `override.crt` artifact.
3. Back up the currently installed override file (the backup made before the first replacement must remain intact).
4. Replace the malformed installed override with the corrected root.
5. Fully exit and restart QZ Tray.
6. Refresh the Preview and run **Find Windows Printers**.
7. Inspect QZ Details. Expected: Signature Valid and Trusted/Verified.
8. Only if QZ shows the certificate as trusted, select Remember and Allow. Confirm it moves to the Allowed list.
9. Do not run another physical print until the trust result is verified. Kitchen printing stays disabled.

## Safety boundary

This is a certificate-encoding correction, not a certificate/key rotation. Preview only. Production branch `main`, production domains, Vercel production target, Supabase, customer orders, payments, and Windows trust stores other than the user's explicit QZ `override.crt` replacement remain untouched.
