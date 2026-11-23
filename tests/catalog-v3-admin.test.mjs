import test from 'node:test';
import assert from 'node:assert/strict';
import admin from '../apps/flame-chick-admin/catalog-v3-admin.js';

test('deal-only product variant accepts a null standalone price and remains non-standalone', () => {
  const payload = admin.normalizeProductDraft({
    category_id: '10000000-0000-4000-8000-000000000001',
    name_en: 'Burger',
    is_active: true,
    is_available: true,
    variants: [{
      size_key: 'INCLUDED',
      size_label: 'Included',
      variant_kind: 'standard',
      price: '',
      is_standalone_sellable: false,
      is_active: true,
      is_available: true
    }]
  });
  assert.equal(payload.name_en, 'Burger');
  assert.equal(payload.variants[0].price, null);
  assert.equal(payload.variants[0].is_standalone_sellable, false);
  assert.equal(payload.variants[0].is_active, true);
});

test('standalone variants still require a normal price', () => {
  assert.throws(() => admin.normalizeProductDraft({
    category_id: '10000000-0000-4000-8000-000000000001',
    name_en: 'OG Crunch',
    variants: [{
      size_key: 'REGULAR',
      size_label: 'Regular',
      variant_kind: 'standard',
      price: '',
      is_standalone_sellable: true
    }]
  }), /required for a standalone-sellable variant/i);
});

test('pack variants require pack quantity/unit and only pack variants may use pack metadata', () => {
  assert.throws(() => admin.normalizeProductDraft({
    category_id: '10000000-0000-4000-8000-000000000001',
    name_en: 'Classic Nuggets',
    variants: [{
      size_key: 'PACK_12', size_label: '12 pcs', variant_kind: 'pack',
      price: 699, pack_quantity: 12, pack_unit: ''
    }]
  }), /pack quantity and unit/i);

  assert.throws(() => admin.normalizeProductDraft({
    category_id: '10000000-0000-4000-8000-000000000001',
    name_en: 'Regular Product',
    variants: [{
      size_key: 'REGULAR', size_label: 'Regular', variant_kind: 'standard',
      price: 100, pack_quantity: 2, pack_unit: 'pcs'
    }]
  }), /only pack variants/i);
});

test('product variants are unique and standalone pricing is not confused with deal pricing', () => {
  assert.throws(() => admin.normalizeProductDraft({
    category_id: '10000000-0000-4000-8000-000000000001',
    name_en: 'Water',
    variants: [
      { size_key: 'REGULAR', size_label: 'Regular', variant_kind: 'standard', price: 99, is_standalone_sellable: true },
      { size_key: 'REGULAR', size_label: 'Large', variant_kind: 'volume', price: 150, is_standalone_sellable: true }
    ]
  }), /unique valid key/i);
});

test('current deal editor produces only fixed component groups with one linked option each', () => {
  const result = admin.buildFixedComponentGroups([
    { display_name: 'Burger', product_variant_id: '20000000-0000-4000-8000-000000000001', quantity: 2 },
    { display_name: 'Quarter Broast', product_variant_id: '20000000-0000-4000-8000-000000000002', quantity: 1 }
  ]);
  assert.deepEqual(result.groups.map(group => ({
    name: group.name_en,
    min: group.min_units,
    max: group.max_units,
    repeat: group.allow_repeat_option,
    maxPerOption: group.max_units_per_option,
    optionCount: group.options.length,
    active: group.is_active
  })), [
    { name: 'Burger', min: 2, max: 2, repeat: true, maxPerOption: 2, optionCount: 1, active: true },
    { name: 'Quarter Broast', min: 1, max: 1, repeat: false, maxPerOption: null, optionCount: 1, active: true }
  ]);
});

test('fixed deal mapping builder enforces INCLUDED treatment and zero surcharge only', () => {
  const detail = {
    component_groups: [
      { group: { name_en: 'Burger', min_units: 2, max_units: 2 }, options: [{ id: '30000000-0000-4000-8000-000000000001' }] },
      { group: { name_en: 'Cold Drink', min_units: 2, max_units: 2 }, options: [{ id: '30000000-0000-4000-8000-000000000002' }] }
    ],
    variants: [{ variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE' } }]
  };
  const mapping = admin.buildIncludedMappings(detail);
  assert.equal(mapping.options.length, 2);
  assert.ok(mapping.options.every(option =>
    option.pricing_treatment === 'INCLUDED' &&
    option.unit_surcharge === 0 &&
    option.is_active === true
  ));
  assert.deepEqual(mapping.options.map(option => option.max_quantity_per_deal), [2, 2]);
});

test('mapping builder fails closed for missing component options or non-fixed deal variants', () => {
  assert.throws(() => admin.buildIncludedMappings({
    component_groups: [{ group: { min_units: 1, max_units: 1 }, options: [] }],
    variants: [{ variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE' } }]
  }), /exactly one linked product variant/i);

  assert.throws(() => admin.buildIncludedMappings({
    component_groups: [],
    variants: [{ variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'BASE_PLUS_SELECTED_ITEMS' } }]
  }), /one fixed-price variant/i);
});

test('the Admin workspace exposes only finite catalog actions, with no publish or rollback action', () => {
  assert.deepEqual(Object.keys(admin.READ).sort(), [
    'categories', 'collections', 'dealDetail', 'deals', 'products', 'scheduleDetail', 'schedules'
  ]);
  assert.deepEqual(Object.keys(admin.WRITE).sort(), [
    'assignment', 'category', 'collection', 'components', 'deal', 'mappings', 'product', 'schedule'
  ]);
  assert.equal(Object.values(admin.WRITE).includes('catalog_publish'), false);
  assert.equal(Object.values(admin.WRITE).includes('catalog_rollback'), false);
});
