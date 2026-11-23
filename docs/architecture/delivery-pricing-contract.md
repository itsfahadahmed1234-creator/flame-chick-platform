# Flame Chick Production — Delivery Pricing Contract

**Status:** Confirmed business rule and proposed technical contract; design only  
**Prepared:** 2026-11-20  
**Production changes:** None

## 1. Confirmed business rule

The owner confirmed:

1. Admin maintains a list of named delivery areas/localities.
2. Each active listed area has its own explicit delivery fee.
3. At checkout, a customer selects their matching listed area. The system applies that area's configured fee.
4. If their locality is not in the list, the customer can explicitly select **Not Listed / Other**.
5. Not Listed / Other uses a separate default delivery fee configured in Admin.
6. The default is not calculated from distance or coordinates and is not supplied by the customer.
7. An intentionally configured Rs. 0 fee is valid. An unset/missing fee is not Rs. 0.
8. Not Listed orders must be blocked if the default fee is unconfigured.
9. Later fee changes must not alter fees on orders already accepted.

The phrase "0 to 500" was an example of fee amounts, not an instruction to create automatic price bands or distance tiers.

## 2. Recommended database model

### delivery_areas

One row per listed area and branch:

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Stable area ID |
| restaurant_id | uuid | Tenant boundary |
| branch_id | uuid | Fulfilment branch |
| name_en | text | Customer/staff display name |
| name_ur | text nullable | Urdu display name |
| delivery_fee | numeric(12,2) | Explicit area fee, non-negative |
| sort_order | integer | Checkout/Admin order |
| is_active | boolean | Can customers select it? |
| created_at / updated_at | timestamptz | Audit timestamps |

Recommended constraints:
- delivery_fee is NOT NULL and CHECK (delivery_fee >= 0). No default zero.
- Composite foreign key (branch_id, restaurant_id) to the same branch/restaurant, preventing cross-tenant area rows.
- A branch-scoped unique normalized name, so the same area cannot be accidentally created twice with different capitalization/spacing.
- Retain/archive referenced areas rather than hard-deleting them.

### branch_delivery_settings

A dedicated typed setting is preferred over storing a fee in a generic JSON settings row:

| Column | Type | Purpose |
|---|---|---|
| branch_id | uuid primary key | One delivery-fee configuration per branch |
| not_listed_delivery_fee | numeric(12,2) nullable | Default fee for Not Listed / Other |
| updated_by | uuid nullable | Admin actor |
| updated_at | timestamptz | Change timestamp |

Rules:
- NULL means the default is not configured; it does not mean free delivery.
- 0 means Admin explicitly configured free delivery for Not Listed.
- CHECK (not_listed_delivery_fee IS NULL OR not_listed_delivery_fee >= 0).
- Restrict direct browser reads/writes. Admin should update it through an authenticated, role-checked server command. The public catalog endpoint returns only the safe fee value for the selected branch.
- This branch-scoped design avoids accidentally applying another branch's default fee if Flame Chick later adds branches. For the initial single branch, it still behaves as one default fee.

### Order and delivery snapshots

Each accepted delivery order should preserve:
- delivery_selection_type: listed_area or not_listed.
- delivery_area_id: selected area UUID for listed choices; NULL for Not Listed.
- delivery_area_name_snapshot: the listed area name or the display label Not Listed.
- delivery_other_locality_snapshot: optional customer-entered locality/mohalla when Not Listed, if the UI collects it.
- delivery_fee: the exact server-calculated fee charged on the order.
- The delivery task stores the same fee and area/selection snapshots.

A database CHECK should enforce:
- listed_area => delivery_area_id IS NOT NULL.
- not_listed => delivery_area_id IS NULL.
- The selected area belongs to the order's branch and restaurant.

Avoid storing two competing copies of the same charged fee without a defined invariant. Use one canonical order fee amount; the delivery task keeps its own immutable operational snapshot copied at task creation.

Do not allow an Admin fee update to rewrite an order or delivery task snapshot.

## 3. Checkout request contract

The browser/POS chooses a selection type; it never sends an authoritative fee.

**Listed area request:**

\`\`\`json
{
  "delivery": {
    "selection_type": "listed_area",
    "area_id": "selected-area-uuid",
    "address": "Full delivery address",
    "instructions": ""
  }
}
\`\`\`

**Not Listed / Other request:**

\`\`\`json
{
  "delivery": {
    "selection_type": "not_listed",
    "area_id": null,
    "other_locality": "Customer's locality (only if collected)",
    "address": "Full delivery address",
    "instructions": ""
  }
}
\`\`\`

There is deliberately no fee or delivery_fee in either request. If the client sends one, ignore it or reject the extra field; never use it to calculate the total.

## 4. Server-side fee resolution

The order command must resolve the fee inside the same transaction that creates the order:

1. Resolve authenticated/staff identity and the authorized restaurant/branch.
2. Validate the fulfilment type.
3. For listed_area:
   - Require a non-null area ID.
   - Load the area by ID, restaurant and branch.
   - Require is_active = true.
   - Read the fee from the database row.
   - Reject unknown, inactive, or cross-branch/cross-restaurant area IDs.
4. For not_listed:
   - Require the explicit selection type and a null area ID.
   - Load branch_delivery_settings.not_listed_delivery_fee for the authorized branch.
   - If NULL/missing, return a stable error such as NOT_LISTED_FEE_NOT_CONFIGURED; do not create an order or delivery task.
   - Accept zero only when stored explicitly as zero.
5. For takeaway/pickup:
   - Do not require a delivery area.
   - Do not charge a delivery fee.
6. Calculate total using the resolved server-side fee and item prices, and persist the immutable snapshots atomically.

A missing area ID by itself must never be interpreted as Not Listed. An unmatched area name must not silently receive the default fee; the customer must explicitly choose Not Listed.

## 5. Catalog response

The customer website and POS need area and fee information to display the choices. The catalog API should return a safe, branch-specific object, logically equivalent to:

\`\`\`json
{
  "deliveryPricing": {
    "areas": [
      { "id": "uuid", "name": "Area A", "name_ur": null, "fee": 150 }
    ],
    "notListed": {
      "enabled": true,
      "fee": 250
    }
  }
}
\`\`\`

- Include only active areas for the selected fulfilment branch.
- Include only the Not Listed fee for that branch.
- Do not expose the generic settings table or unrelated settings just to retrieve this value.
- enabled is false and fee is null when Not Listed is not configured.
- No missing fee is coerced into zero.
- Existing POS currently requires catalog schemaVersion 2 and expects deliveryAreas plus settings.DefaultDeliveryFee. Any response redesign needs an explicit schema-version compatibility rollout; do not break deployed/offline POS clients without a staged upgrade.

## 6. Current source mapping and remaining implementation (2026-11-23)

Source-only touchups now align both Website and POS payloads with the approved request contract:

- **Website:** delivery requests send `selection_type: listed_area | not_listed`, the area UUID for listed selections or NULL for Not Listed, plus address/instructions. The payload no longer sends an area display name or fee. The UI preserves a missing listed-area fee as NULL, labels it "Fee not configured", and blocks checkout for both an unset listed fee and an unset Not Listed default.
- **POS:** delivery requests use the same explicit selection type and omit any client fee/display name. The local adapter preserves NULL for missing/invalid area fees, accepts zero only when explicitly configured, and blocks taking/syncing a delivery order if its selected area's fee is missing.
- **Admin:** the Production schema currently has no `delivery_areas` or branch delivery-settings tables. Admin area CRUD/default-fee configuration is therefore not live in the current Production backend. The target remains a branch-scoped typed setting (or equivalently strict, scoped representation) with a blank/unset state, not an implicit zero.
- **Catalog / delivery API:** the current Production database has no delivery areas/default-fee records and no public branch-scoped delivery-pricing projection. The Catalog/Order/Delivery Edge Functions are not deployed. Implement an explicit safe projection and branch scoping when the operational migration is designed; do not expose generic settings.
- **Order API / database command:** the source Order API currently forwards the delivery object to `flame_chick_create_order`, but the Production database has no such RPC or operational order tables. The transactional command must validate the selection type, resolve the exact active area/default fee for the authorized branch, ignore/reject client-supplied fee fields, and persist immutable snapshots.
- **Rider:** the source Rider app reads task fee/area snapshots through the Delivery API, but Production has no `delivery_tasks` or `rider_profiles` tables yet. Preserve only the task's operational snapshot in Rider/Manager views once the operational schema exists.

The client payload/UI changes are committed on `work/production-source-audit` and covered by static tests. They are not a live feature until the additive operational schema, secure RPCs, API deployment and delivery-area Admin configuration are completed. No Production migration/data/API deployment occurred.

## 7. Required acceptance tests

| Case | Expected result |
|---|---|
| Listed active area, positive fee | Uses exact database fee |
| Listed active area, explicitly configured 0 | Uses 0 |
| Unknown or inactive area ID | Rejects; no fallback |
| Area from another branch/restaurant | Rejects |
| Explicit Not Listed, positive default | Uses branch default |
| Explicit Not Listed, explicitly configured 0 | Uses 0 |
| Not Listed with NULL/missing default | Blocks; no order or task |
| NULL area ID without explicit Not Listed type | Rejects |
| Client submits a fake fee | Server ignores/rejects; database fee wins |
| Admin changes area fee after an order | Existing snapshots unchanged |
| Admin changes default after an order | Existing snapshots unchanged |
| New order after a fee change | Uses new configured fee |
| Public catalog for branch A | Does not include branch B's areas/default |
| Takeaway/pickup | No delivery fee or area required |

## 8. Explicitly out of scope

- Distance-based or geolocation-based pricing.
- Automatic nearest-area matching.
- Automatic fee tiers or bands.
- Customer-proposed delivery fees.
- Automatic free delivery when a fee is missing.

## 9. Safety

This contract is design documentation only. No Production SQL, data, Admin app, website, POS, Edge Function, Vercel project or live deployment was changed.
