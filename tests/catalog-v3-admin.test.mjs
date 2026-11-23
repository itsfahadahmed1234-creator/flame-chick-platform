import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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


test('Admin read/write actions match the finite authenticated Staff Admin routes', async () => {
  const source = await readFile(new URL('../supabase/functions/flame-chick-staff-admin/catalog-actions.mjs', import.meta.url), 'utf8');
  for (const action of Object.values(admin.READ)) {
    assert.ok(source.includes(action + ':'), 'Unmapped read action: ' + action);
  }
  for (const action of Object.values(admin.WRITE)) {
    assert.ok(source.includes(action + ':'), 'Unmapped write action: ' + action);
  }
  assert.doesNotMatch(source, /catalog_publish\s*:/);
  assert.doesNotMatch(source, /catalog_rollback\s*:/);
});

test('Catalog V3 navigation remains restricted to verified Admin and Owner sessions', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/app.js', import.meta.url), 'utf8');
  assert.match(source, /\["admin","owner"\]\.includes\(context\.actor_role\)/);
  assert.match(source, /\["staff","catalog-v3"\]\.includes\(button\.dataset\.page\)/);
});

test('deal inspection renders the exact product-name field returned by the database detail DTO', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source, /product_name_en/);
  assert.match(source, /variant_label/);
  assert.doesNotMatch(source, /product_name\)/);
});


test('deal read-back verifier requires exact fixed contents and INCLUDED mappings before and after activation', () => {
  const optionA = {
    id: '30000000-0000-4000-8000-000000000001',
    product_variant_id: '20000000-0000-4000-8000-000000000001',
    is_active: true
  };
  const optionB = {
    id: '30000000-0000-4000-8000-000000000002',
    product_variant_id: '20000000-0000-4000-8000-000000000002',
    is_active: true
  };
  const detail = active => ({
    deal: { is_active: active },
    component_groups: [
      { group: { name_en: 'Burger', min_units: 2, max_units: 2, is_active: true }, options: [optionA] },
      { group: { name_en: 'Quarter Broast', min_units: 1, max_units: 1, is_active: true }, options: [optionB] }
    ],
    variants: [{
      variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE', base_price: 2099, is_active: active },
      allowed_options: [
        { component_option_id: optionA.id, product_variant_id: optionA.product_variant_id, is_active: true, pricing_treatment: 'INCLUDED', unit_surcharge: 0, max_quantity_per_deal: 2 },
        { component_option_id: optionB.id, product_variant_id: optionB.product_variant_id, is_active: true, pricing_treatment: 'INCLUDED', unit_surcharge: 0, max_quantity_per_deal: 1 }
      ]
    }],
    schedule_assignments: [{
      branch_id: null, schedule_set_id: '50000000-0000-4000-8000-000000000001', is_active: true
    }]
  });
  const expected = {
    basePrice: 2099,
    components: [
      { display_name: 'Burger', product_variant_id: optionA.product_variant_id, quantity: 2 },
      { display_name: 'Quarter Broast', product_variant_id: optionB.product_variant_id, quantity: 1 }
    ],
    flameHour: true,
    scheduleId: '50000000-0000-4000-8000-000000000001'
  };
  assert.equal(admin.verifyFixedDealDetail(detail(false), { ...expected, active: false }), true);
  assert.equal(admin.verifyFixedDealDetail(detail(true), { ...expected, active: true }), true);
});

test('deal read-back verifier rejects altered prices, components, surcharge mappings and missing Flame Hour schedule', () => {
  const option = {
    id: '30000000-0000-4000-8000-000000000001',
    product_variant_id: '20000000-0000-4000-8000-000000000001',
    is_active: true
  };
  const base = {
    deal: { is_active: false },
    component_groups: [{
      group: { name_en: 'Burger', min_units: 1, max_units: 1, is_active: true },
      options: [option]
    }],
    variants: [{
      variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE', base_price: 699, is_active: false },
      allowed_options: [{
        component_option_id: option.id,
        product_variant_id: option.product_variant_id,
        is_active: true,
        pricing_treatment: 'INCLUDED',
        unit_surcharge: 0,
        max_quantity_per_deal: 1
      }]
    }],
    schedule_assignments: []
  };
  const expected = {
    basePrice: 699,
    components: [{ display_name: 'Burger', product_variant_id: option.product_variant_id, quantity: 1 }],
    flameHour: false,
    scheduleId: null,
    active: false
  };
  assert.throws(() => admin.verifyFixedDealDetail({ ...base, variants: [{
    ...base.variants[0], variant: { ...base.variants[0].variant, base_price: 799 }
  }] }, expected), /fixed base price/i);
  assert.throws(() => admin.verifyFixedDealDetail({ ...base, variants: [{
    ...base.variants[0], allowed_options: [{
      ...base.variants[0].allowed_options[0], pricing_treatment: 'SURCHARGE', unit_surcharge: 50
    }]
  }] }, expected), /INCLUDED/i);
  assert.throws(() => admin.verifyFixedDealDetail(base, {
    ...expected, flameHour: true, scheduleId: '50000000-0000-4000-8000-000000000001'
  }), /schedule assignment/i);
  assert.throws(() => admin.verifyFixedDealDetail({
    ...base, component_groups: [{
      group: { ...base.component_groups[0].group, min_units: 2, max_units: 2 },
      options: [option]
    }]
  }, expected), /component failed read-back/i);
});


test('fixed-deal edit builder preserves retained identities and disables removed groups without deleting them', () => {
  const groupOne = {
    group: { id: '61000000-0000-4000-8000-000000000001', name_en: 'Burger', name_ur: null,
      min_units: 2, max_units: 2, allow_repeat_option: true, max_units_per_option: 2,
      sort_order: 1, is_active: true },
    options: [{ id: '62000000-0000-4000-8000-000000000001',
      product_variant_id: '63000000-0000-4000-8000-000000000001', sort_order: 1, is_active: true }]
  };
  const removedGroup = {
    group: { id: '61000000-0000-4000-8000-000000000002', name_en: 'Cold Drink', name_ur: null,
      min_units: 1, max_units: 1, allow_repeat_option: false, max_units_per_option: null,
      sort_order: 2, is_active: true },
    options: [{ id: '62000000-0000-4000-8000-000000000002',
      product_variant_id: '63000000-0000-4000-8000-000000000002', sort_order: 1, is_active: true }]
  };
  const result = admin.buildFixedComponentGroups([{
    group_id: groupOne.group.id,
    option_id: groupOne.options[0].id,
    display_name: 'Burger',
    product_variant_id: '63000000-0000-4000-8000-000000000003',
    quantity: 3
  }], [groupOne, removedGroup]);

  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].id, groupOne.group.id);
  assert.equal(result.groups[0].options[0].id, groupOne.options[0].id);
  assert.equal(result.groups[0].options[0].product_variant_id, '63000000-0000-4000-8000-000000000003');
  assert.equal(result.groups[0].min_units, 3);
  assert.equal(result.groups[0].max_units, 3);
  assert.equal(result.groups[0].is_active, true);
  assert.equal(result.groups[1].id, removedGroup.group.id);
  assert.equal(result.groups[1].is_active, false);
  assert.equal(result.groups[1].options[0].id, removedGroup.options[0].id);
  assert.equal(result.groups[1].options[0].is_active, false);
});

test('fixed-deal edit mapping builder keeps active INCLUDED maps and deactivates removed component maps', () => {
  const optionOne = { id: '62000000-0000-4000-8000-000000000001',
    product_variant_id: '63000000-0000-4000-8000-000000000003', is_active: true };
  const optionTwo = { id: '62000000-0000-4000-8000-000000000002',
    product_variant_id: '63000000-0000-4000-8000-000000000002', is_active: false };
  const detail = {
    component_groups: [
      { group: { id: '61000000-0000-4000-8000-000000000001', is_active: true, min_units: 3, max_units: 3 },
        options: [optionOne] },
      { group: { id: '61000000-0000-4000-8000-000000000002', is_active: false, min_units: 1, max_units: 1 },
        options: [optionTwo] }
    ],
    variants: [{
      variant: { id: '64000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE' },
      allowed_options: [
        { id: '65000000-0000-4000-8000-000000000001', component_option_id: optionOne.id,
          is_active: true, product_variant_id: optionOne.product_variant_id },
        { id: '65000000-0000-4000-8000-000000000002', component_option_id: optionTwo.id,
          is_active: true, product_variant_id: optionTwo.product_variant_id }
      ]
    }]
  };
  const result = admin.buildIncludedMappings(detail);
  assert.equal(result.options.length, 2);
  assert.equal(result.options[0].id, '65000000-0000-4000-8000-000000000001');
  assert.equal(result.options[0].is_active, true);
  assert.equal(result.options[0].pricing_treatment, 'INCLUDED');
  assert.equal(result.options[0].unit_surcharge, 0);
  assert.equal(result.options[1].id, '65000000-0000-4000-8000-000000000002');
  assert.equal(result.options[1].is_active, false);
  assert.equal(result.options[1].unit_surcharge, 0);
});

test('fixed-deal editor loads only single-option INCLUDED bundles and preserves supported Flame Hour schedule', () => {
  const variantId = '64000000-0000-4000-8000-000000000001';
  const dealId = '66000000-0000-4000-8000-000000000001';
  const scheduleId = '67000000-0000-4000-8000-000000000001';
  const optionId = '62000000-0000-4000-8000-000000000001';
  const productVariantId = '63000000-0000-4000-8000-000000000001';
  const detail = {
    deal: { id: dealId, collection_id: '68000000-0000-4000-8000-000000000001',
      title: 'Flame Hour', description_en: 'Offer', is_active: true, is_available: false },
    component_groups: [{
      group: { id: '61000000-0000-4000-8000-000000000001', name_en: 'Burger', min_units: 1,
        max_units: 1, is_active: true },
      options: [{ id: optionId, product_id: '69000000-0000-4000-8000-000000000001',
        product_variant_id: productVariantId, is_active: true }]
    }],
    variants: [{
      variant: { id: variantId, pricing_mode: 'FIXED_BUNDLE', base_price: 699, is_active: true },
      allowed_options: [{ id: '65000000-0000-4000-8000-000000000001', component_option_id: optionId,
        product_variant_id: productVariantId, pricing_treatment: 'INCLUDED', unit_surcharge: 0,
        max_quantity_per_deal: 1, is_active: true }]
    }],
    schedule_assignments: [{ id: '71000000-0000-4000-8000-000000000001',
      branch_id: null, schedule_set_id: scheduleId, is_active: true }]
  };
  const schedules = [{ id: scheduleId, name: 'Flame Hour daily', timezone: 'Asia/Karachi' }];
  const windows = Array.from({length:7},(_,i)=>({window_kind:'WEEKLY',weekday_iso:i+1,
    local_start:'15:00:00',local_end:'17:00:00',is_all_day:false}));
  const result = admin.buildFixedDealEditDraft(detail,schedules,{
    schedule_set:{id:scheduleId},windows
  });
  assert.equal(result.dealDraft.id,dealId);
  assert.equal(result.dealDraft.base_price,'699');
  assert.equal(result.dealDraft.is_active,true);
  assert.equal(result.dealDraft.is_available,false);
  assert.equal(result.dealDraft.flame_hour,true);
  assert.equal(result.dealDraft.scheduleId,scheduleId);
  assert.deepEqual(result.components,[{
    group_id:'61000000-0000-4000-8000-000000000001',
    option_id:optionId,display_name:'Burger',
    product_id:'69000000-0000-4000-8000-000000000001',
    product_variant_id:productVariantId,quantity:1
  }]);
});

test('fixed-deal editor refuses variable, selectable, surcharge or branch-specific deal configurations', () => {
  const optionId = '62000000-0000-4000-8000-000000000001';
  const variantId = '64000000-0000-4000-8000-000000000001';
  const deal = {
    deal: { id:'66000000-0000-4000-8000-000000000001',collection_id:'68000000-0000-4000-8000-000000000001',
      title:'Deal',is_active:true,is_available:true },
    component_groups: [{ group:{id:'61000000-0000-4000-8000-000000000001',name_en:'Burger',
      min_units:1,max_units:1,is_active:true},options:[{id:optionId,product_id:'69000000-0000-4000-8000-000000000001',
      product_variant_id:'63000000-0000-4000-8000-000000000001',is_active:true}] }],
    variants: [{variant:{id:variantId,pricing_mode:'FIXED_BUNDLE',base_price:500,is_active:true},
      allowed_options:[{component_option_id:optionId,product_variant_id:'63000000-0000-4000-8000-000000000001',
        pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:1,is_active:true}]}],
    schedule_assignments:[]
  };
  assert.throws(()=>admin.buildFixedDealEditDraft({
    ...deal,component_groups:[{...deal.component_groups[0],group:{...deal.component_groups[0].group,max_units:2}}]
  }),/variable component structure/i);
  assert.throws(()=>admin.buildFixedDealEditDraft({
    ...deal,variants:[{...deal.variants[0],allowed_options:[{...deal.variants[0].allowed_options[0],
      pricing_treatment:'SURCHARGE',unit_surcharge:50}]}]
  }),/non-INCLUDED/i);
  assert.throws(()=>admin.buildFixedDealEditDraft({
    ...deal,schedule_assignments:[{branch_id:'72000000-0000-4000-8000-000000000001',schedule_set_id:'67000000-0000-4000-8000-000000000001',is_active:true}]
  }),/branch-specific schedules/i);
});

test('Admin workspace wires category and fixed-deal edit actions through the secured command API', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source,/data-action="category-edit"/);
  assert.match(source,/data-action="deal-edit"/);
  assert.match(source,/async function openDealEdit/);
  assert.match(source,/async function editDeal/);
  assert.match(source,/buildFixedComponentGroups\(s\.components,latest\.component_groups\)/);
  assert.match(source,/is_active:false,is_available:isAvailable/);
  assert.match(source,/stage='pre-activation verification'/);
  assert.match(source,/Removed components are inactive/);
  assert.match(source,/catalogV3Request|request\(action/);
  assert.doesNotMatch(source,/fetch\([^)]*rest\/v1|service_role|serviceRoleKey/i);
});
