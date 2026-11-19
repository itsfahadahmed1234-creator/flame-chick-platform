# Flame Chick platform architecture

## System boundary

Flame Chick has one isolated Supabase Production project used by all four applications. The repository is owned by the separate Flame Chick GitHub account. It does not contain HFP/Pizza Bite application roots, credentials, operational rows, or order data.

## Applications

- Customer website: menu browsing and customer checkout.
- POS: cashier order entry and live operational order updates.
- Admin: menu/catalog publishing, delivery configuration, staff and operational administration.
- Rider portal: assigned offers, delivery lifecycle, and rider availability.

All app source remains static HTML/CSS/JavaScript today. Vercel projects use their matching `apps/<app>` directory as root.

## Backend boundaries

The four Supabase Edge Functions provide distinct API surfaces:

- `flame-chick-catalog`: public catalog snapshot only.
- `flame-chick-order-api`: customer order creation and authenticated staff/POS order actions.
- `flame-chick-delivery-api`: dispatch board, rider offer and delivery status workflows.
- `flame-chick-staff-admin`: owner/admin staff and rider account management.

Postgres remains the source of truth for menu publication, availability, order snapshots, delivery fee snapshots, role authorization, and idempotency.

## Realtime and polling

Use Realtime only for operational updates where it materially helps: POS and Rider portal new/assigned offers, accept/reject, pickup, progress, failure/return, and manager dispatch. Keep Order History, reports and other non-live screens on normal fetch/manual refresh. The POS retains a 15-second polling fallback.

## Production separation

- Supabase Production project ref: `adkrxfnawdiljhjaavnj`
- Region: `ap-south-1` (Mumbai)
- Plan: Free

The earlier Demo SQL is reference material only. Production schema and catalog migrations must be created from reviewed requirements and applied to the Production target separately.
