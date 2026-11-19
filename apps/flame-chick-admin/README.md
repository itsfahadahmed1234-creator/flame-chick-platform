# Flame Chick Admin

Static administration app.

- Entrypoint: `index.html`
- Client modules: `app.js`, `config.js`, `styles.css`
- Uses only the Production Project URL and publishable key in browser code.
- Server-side staff administration is handled by `flame-chick-staff-admin`; never put the Supabase service-role/secret key in this folder.

Before live use, migrate the Admin schema and RPC dependencies, provision the first owner safely, configure the media bucket, and test login, staff management, settings, product editing, and image uploads.
