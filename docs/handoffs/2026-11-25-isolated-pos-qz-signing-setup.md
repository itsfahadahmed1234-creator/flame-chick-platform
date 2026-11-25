# Isolated Flame Chick POS — QZ signing bootstrap (2026-11-25)

## Scope and current state

This checkpoint concerns only the isolated Vercel project:

- Team: `team_lrFy9ILYEz9umsBy98GCyQjI` (Hobby / Free)
- Project: `flamechickpos`
- Project ID: `prj_Ce8GbSsG5VZApCyEVCh9zC0qfeRv`
- Root directory: `apps/flame-chick-pos`
- POS source branch: `work/production-source-audit`
- Initial deployment: `dpl_39MTRxFTrDRdtideDwKwVVdfFNC8`, Production target, READY, no aliases; SSO protection remains enabled.
- Temporary bootstrap repository variable has been manually set to `false`.
- Preview enable variable remains `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true`.

No live POS deployment/domain, restaurant domain, Supabase data/configuration, or production restaurant operations were changed.

## QZ signer implementation

The POS uses:

- Public chain served at `/qz/digital-certificate.txt`
- SHA-512 signing at `POST /api/qz/sign`
- Server-only `QZ_SIGNING_PRIVATE_KEY` (PKCS#8 RSA-2048)
- Authenticated Supabase staff session and active staff-role verification before signing.
- Origin policy explicitly recognizes Vercel preview deployment hostnames for the isolated `flamechickpos` project.

Source changes committed on `work/production-source-audit`:

- `912b94453cb5565d318e148eb37abb3e83fc9b04` — allow isolated Vercel POS preview deployment origin pattern in QZ signer.
- `7ccbc6670f3454e7f8188517f589d61c1d04d224` — replace the public QZ certificate chain with a new chain matching the newly generated private key.

The new leaf certificate is valid 2026-11-25 through 2028-11-24 UTC. The local OpenSSL verification passed: leaf chains to the provided root CA, and public keys derived from the leaf and private key match.

## Secret-handling rules

A fresh private key was generated locally for this isolated POS QZ signer. It is not committed to Git, not stored in any repository variable/secret, and not configured in Vercel yet. The old Vercel Preview key is deliberately not reused or decrypted.

The connected Vercel environment-variable API rejected branch scoping because this temporary project is not linked to the Git repository. Configure the key manually in the isolated Vercel project:

- Name: `QZ_SIGNING_PRIVATE_KEY`
- Value: contents of the separately supplied `flamechick-qz-signing-private-key.pem` secure file
- Type: Encrypted
- Target: Preview only
- Do not select Production or Development.
- Do not paste the key into GitHub, commit it, put it in a client-side bundle, or send it in chat.

## Local QZ Tray trust requirement

The generated certificate is issued by a new private local root CA, not a QZ Industries public signing CA. QZ Tray will not silently trust that root by default. Official QZ documentation describes a custom trusted-root override using an `override.crt` file or the `authcert.override` property. On the cashier PC, inspect the current QZ Tray trust configuration first. Do not overwrite any existing `override.crt` without making a backup and preserving any existing trusted roots. The supplied `flamechick-qz-local-root-ca.crt` is the public root certificate to add to the appropriate trust configuration. Restart QZ Tray after any approved trust change.

Official references:
- https://qz.io/docs/signing
- https://qz.io/docs/provisioning

## Remaining work (do not mark QZ complete yet)

1. User adds `QZ_SIGNING_PRIVATE_KEY` to the isolated Vercel project as an encrypted Preview-only variable.
2. Add `FLAME_CHICK_POS_PREVIEW_PROJECT_READY=true` to GitHub repository Actions variables. Existing `FLAME_CHICK_POS_PREVIEW_DEPLOY_ENABLED=true` stays enabled and bootstrap stays false.
3. The current POS Preview workflow is manual-dispatch-only and branch-gated. Because it is not present on the default branch, arrange a narrow push-path trigger on `work/production-source-audit` (still gated by both Preview repository variables), then push a harmless POS/handoff update to create a Preview deployment. Do not change the Production target.
4. Verify Preview is READY and SSO-protected; inspect `/qz/digital-certificate.txt` and authenticated signer behavior. Verify missing/invalid staff session is rejected and authorized staff can obtain a valid SHA-512 signature. No production variable is needed.
5. Only after a verified Preview signer handshake, configure the local QZ root trust safely, restart QZ Tray, discover the installed `Generic / Text Only` iTech 900UL queue, and run a test print with explicit user approval.
6. Keep kitchen printing disabled, no cutter command, and browser fallback. No real restaurant orders or live operational use until the separate end-to-end POS rehearsal is completed.

## Explicitly not done

- New key is not in Vercel yet.
- No QZ runtime handshake has passed.
- No local CA trust setting was changed.
- No test receipt has been printed.
- No Preview deployment containing the new QZ certificate/origin commits has been created.
