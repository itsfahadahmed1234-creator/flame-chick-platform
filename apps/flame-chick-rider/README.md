# Flame Chick Rider Portal

Static Progressive Web App for delivery staff.

- Entrypoint: `index.html`
- PWA files: `manifest.webmanifest`, `sw.js`, `icon.svg`
- Uses the Flame Chick Production project and the `flame-chick-delivery-api`.
- Rider onboarding, Auth users, roles, profiles and push credentials must be configured for Production before live use.

No service-role or secret keys belong in browser code. Rider workflow must be tested from assignment through completion, failure and return before a live cutover.
