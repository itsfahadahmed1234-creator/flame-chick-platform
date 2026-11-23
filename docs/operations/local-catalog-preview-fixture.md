# Local synthetic V3 catalog preview

This is an isolated browser-review harness for `apps/flame-chick-website/catalog-preview.html`. It exists only for local UI/interaction review while the real Production catalog is still unpublished.

## Safety boundary

- Run only from the repository checkout. The server binds specifically to IPv4 loopback (`127.0.0.1`) and validates the request host and assigned port.
- The script is stored under `scripts/`, outside the Vercel Website project root (`apps/flame-chick-website`). It is not a page or asset that Vercel can deploy from that project root.
- It serves only an explicit allowlist of the preview page's CSS, logo and JavaScript modules. It does not serve `index.html`, `js/config.js`, the old storefront, admin routes, order routes, or arbitrary repository files.
- It transforms the preview HTML to load a local-only config and a fixture loader. The ordinary Production `config.js` is never loaded. The fixture config has a deliberately invalid API base, so falling back to the real catalog client fails its HTTPS configuration check before a request can be made.
- The local loader fetches one synthetic JSON fixture from the same loopback origin and validates it with the actual V3 contract before the preview orchestrator receives it.
- The HTML is visibly labelled **LOCAL SYNTHETIC FIXTURE**. The fixture is not the actual menu, does not represent published business prices, and must not be used for customer or order testing.
- Responses are no-store and carry restrictive browser security headers. The server accepts only GET/HEAD and has no write or order endpoint.

This is a local development aid, not authentication, and must not be exposed through a tunnel, port-forward, reverse proxy, or public host.

## Run it (Node.js 22)

From the repository root:

```powershell
node scripts/local-catalog-preview-fixture.mjs
```

Open exactly the address printed by the server, normally:

```text
http://127.0.0.1:4179/catalog-preview
```

Do not replace `127.0.0.1` with `localhost`; the server intentionally checks the host header. If port 4179 is already occupied, use PowerShell:

```powershell
$env:PORT = "4180"
node scripts/local-catalog-preview-fixture.mjs
```

Stop the server with **Ctrl+C**.

## What to review

The synthetic dataset contains one enabled branch, a sample burger product with a variant-specific extra-cheese modifier, and a sample meal deal with a required component selection. The deal schedule has an all-day window for each weekday so the sample is not tied to one weekday.

Review the page at desktop and narrow/mobile widths. Select delivery and pickup separately, inspect the product modifier, open the deal configurator, try valid and invalid selections, validate the selections, close the configurator, and reload the fixture. Confirm that the page remains visibly marked as synthetic and that no cart, checkout, quote, payment, or order action appears.

The current fixture is deliberately small. It is suitable for checking the page wiring, layout, branch/fulfilment flow, basic product modifier UI and deal configurator. It is not evidence that real multi-branch production data, full menu volume, image storage, checkout, or end-to-end operations are ready.

## Automated isolation checks

Run:

```powershell
node --test tests/local-catalog-preview-fixture.test.mjs
```

The Website Static Checks workflow also runs the test and checks the server script syntax. These automated checks prove the fixture server's local binding, explicit route allowlist, synthetic data contract, production-config exclusion, request-method restrictions and response headers. They do not replace a human visual review in a browser.
