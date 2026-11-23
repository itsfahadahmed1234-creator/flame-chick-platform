import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import importer from '../apps/flame-chick-admin/catalog-v3-importer.js';

const draft = JSON.parse(await readFile(
  new URL('../ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json', import.meta.url),
  'utf8'
));

test('Admin-served review draft asset is byte-for-byte the authoritative menu draft', async () => {
  const served = await readFile(new URL('../apps/flame-chick-admin/flame-chick-published-menu-2026-11-23.v3-draft.json', import.meta.url), 'utf8');
  const source = await readFile(new URL('../ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json', import.meta.url), 'utf8');
  assert.equal(served, source);
});

test('approved review draft validates as the complete current fixed-price menu', () => {
  const result = importer.validatePublishedMenuDraft(draft);
  assert.equal(result.ok, true);
  assert.equal(result.categories, 8);
  assert.equal(result.products, 25);
  assert.equal(result.variants, 28);
  assert.equal(result.standaloneVariants, 23);
  assert.equal(result.dealOnlyVariants, 5);
  assert.equal(result.deals, 6);
  assert.equal(result.offers, 6);
  assert.equal(result.components, 18);
});

test('the current draft has no selectable upgrades or component surcharges', () => {
  const altered = structuredClone(draft);
  altered.deals[0].variants[0].components[0].pricingTreatment = 'SURCHARGE';
  altered.deals[0].variants[0].components[0].unitSurcharge = 50;
  assert.throws(() => importer.validatePublishedMenuDraft(altered), /fixed INCLUDED components/i);
});

test('draft rejects orphaned unpriced deal-only variants and standalone null prices', () => {
  const orphan = structuredClone(draft);
  const fries = orphan.products.find(product => product.key === 'deal_fries');
  orphan.deals.forEach(deal => deal.variants.forEach(variant => {
    variant.components = variant.components.filter(component => component.productKey !== 'deal_fries');
  }));
  assert.throws(() => importer.validatePublishedMenuDraft(orphan), /not used by any current deal/i);

  const badStandalone = structuredClone(draft);
  badStandalone.products.find(product => product.key === 'og_crunch').variants[0].price = null;
  assert.throws(() => importer.validatePublishedMenuDraft(badStandalone), /must have its own price/i);
});

test('stable import keys are scoped to this published menu draft and item identity', () => {
  const a = importer.legacyId(draft, 'product', 'og_crunch');
  const b = importer.legacyId(draft, 'product', 'deal_burger');
  assert.match(a, /^flame-chick:flame-chick-published-menu-2026-11-23:product:og_crunch$/);
  assert.notEqual(a, b);
  assert.equal(a, importer.legacyId(draft, 'product', 'og_crunch'));
});

test('deal-only variant import payload keeps price NULL and standalone selling disabled', () => {
  const product = draft.products.find(item => item.key === 'deal_burger');
  const payload = importer.buildProductPayload(draft, { ...product, _importSortOrder: 21 }, '11111111-1111-4111-8111-111111111111', null);
  assert.equal(payload.legacy_id, importer.legacyId(draft, 'product', 'deal_burger'));
  assert.equal(payload.variants.length, 1);
  assert.equal(payload.variants[0].price, null);
  assert.equal(payload.variants[0].is_standalone_sellable, false);
});

test('existing variant identities must match exactly before an import retry may reuse them', () => {
  const product = draft.products.find(item => item.key === 'og_crunch');
  const variant = product.variants[0];
  const existing = {
    id: '22222222-2222-4222-8222-222222222222',
    legacy_id: importer.legacyId(draft, 'variant', 'og_crunch:REGULAR'),
    size_key: 'REGULAR',
    size_label: 'Regular',
    variant_kind: 'standard',
    price: 599,
    pack_quantity: null,
    pack_unit: null,
    is_standalone_sellable: true,
    is_active: true,
    is_available: true
  };
  const payload = importer.buildProductPayload(draft, { ...product, _importSortOrder: 1 }, '11111111-1111-4111-8111-111111111111', { variants: [existing] });
  assert.equal(payload.variants[0].id, existing.id);
  assert.equal(payload.variants[0].legacy_id, existing.legacy_id);
  assert.throws(() => importer.buildProductPayload(draft, { ...product, _importSortOrder: 1 }, '11111111-1111-4111-8111-111111111111', {
    variants: [{ ...existing, price: 650 }]
  }), /differs from the approved draft/i);
});

test('mapping builder emits only INCLUDED with zero surcharge for fixed current bundles', () => {
  const detail = {
    variants: [{
      variant: { id: '33333333-3333-4333-8333-333333333333', pricing_mode: 'FIXED_BUNDLE' },
      allowed_options: []
    }],
    component_groups: [{
      group: { name_en: 'Burger', min_units: 2, max_units: 2 },
      options: [{ id: '44444444-4444-4444-8444-444444444444', product_variant_id: '55555555-5555-4555-8555-555555555555' }]
    }]
  };
  const built = importer.buildMappings(detail, [{
    display_name: 'Burger',
    product_variant_id: '55555555-5555-4555-8555-555555555555',
    quantity: 2
  }]);
  assert.equal(built.needsWrite, true);
  assert.equal(built.options[0].pricing_treatment, 'INCLUDED');
  assert.equal(built.options[0].unit_surcharge, 0);
  assert.equal(built.options[0].max_quantity_per_deal, 2);
});

function detail(active) {
  const optionId = '44444444-4444-4444-8444-444444444444';
  const variantId = '55555555-5555-4555-8555-555555555555';
  return {
    deal: { is_active: active },
    variants: [{
      variant: {
        variant_key: 'BUNDLE',
        pricing_mode: 'FIXED_BUNDLE',
        base_price: 2099,
        is_active: active
      },
      allowed_options: [{
        component_option_id: optionId,
        product_variant_id: variantId,
        is_active: true,
        pricing_treatment: 'INCLUDED',
        unit_surcharge: 0,
        max_quantity_per_deal: 2
      }]
    }],
    component_groups: [{
      group: {
        name_en: 'Burger',
        min_units: 2,
        max_units: 2,
        allow_repeat_option: true,
        max_units_per_option: 2,
        is_active: true
      },
      options: [{ id: optionId, product_variant_id: variantId, is_active: true }]
    }],
    schedule_assignments: [{
      branch_id: null,
      schedule_set_id: '66666666-6666-4666-8666-666666666666',
      is_active: true
    }]
  };
}

test('read-back verifier accepts staged inactive and already-active deals only in matching states', () => {
  const sourceDeal = {
    schedule: { timezone: 'Asia/Karachi' },
    variants: [{ variantKey: 'BUNDLE', basePrice: 2099 }]
  };
  const components = [{
    display_name: 'Burger',
    product_variant_id: '55555555-5555-4555-8555-555555555555',
    quantity: 2
  }];
  const scheduleId = '66666666-6666-4666-8666-666666666666';
  assert.equal(importer.verifyDealState(detail(false), sourceDeal, components, scheduleId, false), true);
  assert.equal(importer.verifyDealState(detail(true), sourceDeal, components, scheduleId, true), true);
  assert.throws(() => importer.verifyDealState(detail(true), sourceDeal, components, scheduleId, false), /active state/i);
});

test('read-back verifier rejects changed base price and any surcharge mapping', () => {
  const sourceDeal = { schedule: null, variants: [{ variantKey: 'BUNDLE', basePrice: 699 }] };
  const components = [{
    display_name: 'Burger',
    product_variant_id: '55555555-5555-4555-8555-555555555555',
    quantity: 2
  }];
  const active = detail(true);
  assert.throws(() => importer.verifyDealState({
    ...active,
    variants: [{ ...active.variants[0], variant: { ...active.variants[0].variant, base_price: 799 } }]
  }, sourceDeal, components, null, true), /price, variant identity/i);
  assert.throws(() => importer.verifyDealState({
    ...active,
    variants: [{ ...active.variants[0], allowed_options: [{
      ...active.variants[0].allowed_options[0], pricing_treatment: 'SURCHARGE', unit_surcharge: 50
    }] }]
  }, { ...sourceDeal, variants: [{ variantKey: 'BUNDLE', basePrice: 2099 }] }, components, null, true), /INCLUDED with zero surcharge/i);
});
