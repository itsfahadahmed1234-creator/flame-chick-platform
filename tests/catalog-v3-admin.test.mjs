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

test('fixed deal editor supports multiple INCLUDED burger choices while preserving fixed quantity and repeat policy', () => {
  const result = admin.buildFixedComponentGroups([
    { display_name: 'Burger', quantity: 2, allow_repeat_option: true, max_units_per_option: 2, options: [
      { product_variant_id: '20000000-0000-4000-8000-000000000001' },
      { product_variant_id: '20000000-0000-4000-8000-000000000002' },
      { product_variant_id: '20000000-0000-4000-8000-000000000003' }
    ] },
    { display_name: 'Quarter Broast', quantity: 1, allow_repeat_option: false, options: [
      { product_variant_id: '20000000-0000-4000-8000-000000000004' }
    ] }
  ]);
  assert.deepEqual(result.groups.map(group => ({
    name: group.name_en, min: group.min_units, max: group.max_units, repeat: group.allow_repeat_option,
    maxPerOption: group.max_units_per_option, optionCount: group.options.filter(x => x.is_active).length, active: group.is_active
  })), [
    { name: 'Burger', min: 2, max: 2, repeat: true, maxPerOption: 2, optionCount: 3, active: true },
    { name: 'Quarter Broast', min: 1, max: 1, repeat: false, maxPerOption: null, optionCount: 1, active: true }
  ]);
  assert.throws(() => admin.buildFixedComponentGroups([{display_name:'Cold Drink',quantity:1,options:[
    {product_variant_id:'20000000-0000-4000-8000-000000000005'},
    {product_variant_id:'20000000-0000-4000-8000-000000000006'}
  ]}]),/Only Burger groups/);
});

test('fixed deal mapping builder creates one INCLUDED zero-surcharge mapping per burger choice', () => {
  const burgerOne = { id:'30000000-0000-4000-8000-000000000001',product_variant_id:'20000000-0000-4000-8000-000000000001',is_active:true };
  const burgerTwo = { id:'30000000-0000-4000-8000-000000000002',product_variant_id:'20000000-0000-4000-8000-000000000002',is_active:true };
  const drink = { id:'30000000-0000-4000-8000-000000000003',product_variant_id:'20000000-0000-4000-8000-000000000003',is_active:true };
  const detail = {
    component_groups: [
      { group:{name_en:'Burger',min_units:2,max_units:2,allow_repeat_option:true,max_units_per_option:2,is_active:true},options:[burgerOne,burgerTwo] },
      { group:{name_en:'Cold Drink',min_units:2,max_units:2,allow_repeat_option:true,max_units_per_option:2,is_active:true},options:[drink] }
    ],
    variants:[{variant:{id:'40000000-0000-4000-8000-000000000001',pricing_mode:'FIXED_BUNDLE'}}]
  };
  const mapping=admin.buildIncludedMappings(detail);
  assert.equal(mapping.options.length,3);
  assert.ok(mapping.options.every(option=>option.pricing_treatment==='INCLUDED'&&option.unit_surcharge===0&&option.is_active===true));
  assert.deepEqual(mapping.options.map(option=>option.max_quantity_per_deal),[2,2,2]);
});

test('mapping builder fails closed for missing component options or non-fixed deal variants', () => {
  assert.throws(() => admin.buildIncludedMappings({
    component_groups: [{ group: { min_units: 1, max_units: 1, is_active: true }, options: [] }],
    variants: [{ variant: { id: '40000000-0000-4000-8000-000000000001', pricing_mode: 'FIXED_BUNDLE' } }]
  }), /at least one linked choice/i);

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
  assert.match(source, /\["staff","catalog-v3","delivery"\]\.includes\(button\.dataset\.page\)/);
});

test('deal inspection renders the exact product-name field returned by the database detail DTO', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source, /product_name_en/);
  assert.match(source, /variant_label/);
  assert.doesNotMatch(source, /product_name\)/);
});


test('deal read-back verifier checks every burger choice and INCLUDED mapping before and after activation', () => {
  const optionA={id:'30000000-0000-4000-8000-000000000001',product_variant_id:'20000000-0000-4000-8000-000000000001',is_active:true};
  const optionC={id:'30000000-0000-4000-8000-000000000003',product_variant_id:'20000000-0000-4000-8000-000000000003',is_active:true};
  const optionB={id:'30000000-0000-4000-8000-000000000002',product_variant_id:'20000000-0000-4000-8000-000000000002',is_active:true};
  const detail=active=>({
    deal:{is_active:active},
    component_groups:[
      {group:{name_en:'Burger',min_units:2,max_units:2,allow_repeat_option:true,max_units_per_option:2,is_active:true},options:[optionA,optionC]},
      {group:{name_en:'Quarter Broast',min_units:1,max_units:1,allow_repeat_option:false,max_units_per_option:null,is_active:true},options:[optionB]}
    ],
    variants:[{variant:{id:'40000000-0000-4000-8000-000000000001',pricing_mode:'FIXED_BUNDLE',base_price:2099,is_active:active},
      allowed_options:[
        {component_option_id:optionA.id,product_variant_id:optionA.product_variant_id,is_active:true,pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:2},
        {component_option_id:optionC.id,product_variant_id:optionC.product_variant_id,is_active:true,pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:2},
        {component_option_id:optionB.id,product_variant_id:optionB.product_variant_id,is_active:true,pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:1}
      ]}],
    schedule_assignments:[{branch_id:null,schedule_set_id:'50000000-0000-4000-8000-000000000001',is_active:true}]
  });
  const expected={
    basePrice:2099,
    components:[
      {display_name:'Burger',quantity:2,allow_repeat_option:true,max_units_per_option:2,options:[{product_variant_id:optionA.product_variant_id},{product_variant_id:optionC.product_variant_id}]},
      {display_name:'Quarter Broast',quantity:1,allow_repeat_option:false,max_units_per_option:null,options:[{product_variant_id:optionB.product_variant_id}]}
    ],
    flameHour:true,scheduleId:'50000000-0000-4000-8000-000000000001'
  };
  assert.equal(admin.verifyFixedDealDetail(detail(false),{...expected,active:false}),true);
  assert.equal(admin.verifyFixedDealDetail(detail(true),{...expected,active:true}),true);
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
  }, expected), /component group failed read-back/i);
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
      { group: { id: '61000000-0000-4000-8000-000000000001', is_active: true, min_units: 3, max_units: 3, allow_repeat_option: true, max_units_per_option: 3 },
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
    display_name:'Burger',quantity:1,allow_repeat_option:false,max_units_per_option:null,
    options:[{option_id:optionId,product_id:'69000000-0000-4000-8000-000000000001',product_variant_id:productVariantId}]
  }]);
});
test('fixed-deal editor loads multiple included Burger choices', () => {
  const optionA={id:'62000000-0000-4000-8000-000000000001',product_id:'69000000-0000-4000-8000-000000000001',product_variant_id:'63000000-0000-4000-8000-000000000001',is_active:true};
  const optionB={id:'62000000-0000-4000-8000-000000000002',product_id:'69000000-0000-4000-8000-000000000002',product_variant_id:'63000000-0000-4000-8000-000000000002',is_active:true};
  const detail={
    deal:{id:'66000000-0000-4000-8000-000000000002',collection_id:'68000000-0000-4000-8000-000000000001',title:'Flame Duo',is_active:true,is_available:true},
    component_groups:[{group:{id:'61000000-0000-4000-8000-000000000002',name_en:'Burger',min_units:2,max_units:2,allow_repeat_option:true,max_units_per_option:2,is_active:true},options:[optionA,optionB]}],
    variants:[{variant:{id:'64000000-0000-4000-8000-000000000002',pricing_mode:'FIXED_BUNDLE',base_price:2099,is_active:true},
      allowed_options:[optionA,optionB].map((option,index)=>({id:'65000000-0000-4000-8000-00000000000'+(index+1),component_option_id:option.id,product_variant_id:option.product_variant_id,pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:2,is_active:true}))}],
    schedule_assignments:[]
  };
  const result=admin.buildFixedDealEditDraft(detail);
  assert.equal(result.components[0].options.length,2);
  assert.equal(result.components[0].allow_repeat_option,true);
  assert.deepEqual(result.components[0].options.map(option=>option.product_variant_id),[optionA.product_variant_id,optionB.product_variant_id]);
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
  }),/variable component quantity/i);
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


test('Flame Hour schedule validator accepts only seven exact daily 3–5 PM Asia/Karachi windows', () => {
  const item = { id:'67000000-0000-4000-8000-000000000001',
    name:'Flame Hour daily',timezone:'Asia/Karachi',is_active:true };
  const windows = Array.from({length:7},(_,i)=>({window_kind:'WEEKLY',weekday_iso:i+1,
    local_start:'15:00:00',local_end:'17:00:00',is_all_day:false}));
  const detail = {schedule_set:{id:item.id,name:item.name,timezone:item.timezone},windows};
  assert.equal(admin.isApprovedFlameHourSchedule(item,detail),true);
  assert.equal(admin.isApprovedFlameHourSchedule({...item,is_active:false},detail),false);
  assert.equal(admin.isApprovedFlameHourSchedule({...item,timezone:'UTC'},detail),false);
  assert.equal(admin.isApprovedFlameHourSchedule(item,{...detail,windows:windows.slice(0,6)}),false);
  assert.equal(admin.isApprovedFlameHourSchedule(item,{...detail,windows:windows.map((w,i)=>i===2?{...w,local_start:'14:00:00'}:w)}),false);
  assert.equal(admin.isApprovedFlameHourSchedule(item,{...detail,schedule_set:{...detail.schedule_set,id:'68000000-0000-4000-8000-000000000001'}}),false);
});

test('fixed-deal creation preflights duplicate Deals categories, collections and schedule names', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source,/Multiple deal categories exist/);
  assert.match(source,/Multiple Deals collections exist/);
  assert.match(source,/Multiple Flame Hour daily schedules exist/);
  assert.match(source,/An existing Flame Hour daily schedule has different settings/);
  assert.match(source,/isApprovedFlameHourSchedule\(found,detail\)/);
});


test('Burger choice products are restricted to active products in the Chicken Burgers category', () => {
  const categories = [
    { id: 'cat-burger', category_kind: 'menu', name_en: 'Chicken Burgers', is_active: true },
    { id: 'cat-broast', category_kind: 'menu', name_en: 'Whole Chicken Broast', is_active: true }
  ];
  const products = [
    { id: 'og', category_id: 'cat-burger', is_active: true, variants: [{ id: 'og-r', is_active: true }] },
    { id: 'injector', category_id: 'cat-burger', is_active: true, variants: [{ id: 'injector-r', is_active: true }] },
    { id: 'nashville-fire', category_id: 'cat-burger', is_active: true, variants: [{ id: 'nashville-fire-r', is_active: true }] },
    { id: 'placeholder-burger', name_en: 'Burger', category_id: 'cat-burger', is_active: true, variants: [{ id: 'placeholder-r', is_active: true }] },
    { id: 'nashville-broast', category_id: 'cat-broast', is_active: true, variants: [{ id: 'nashville-broast-r', is_active: true }] },
    { id: 'inactive-burger', category_id: 'cat-burger', is_active: false, variants: [{ id: 'inactive-r', is_active: true }] }
  ];
  assert.deepEqual(admin.eligibleChoiceProducts(products, categories, 'Burger').map(product => product.id),
    ['og', 'injector', 'nashville-fire']);
  assert.deepEqual(admin.eligibleChoiceProducts(products, categories, 'Half Broast').map(product => product.id),
    ['og', 'injector', 'nashville-fire', 'placeholder-burger', 'nashville-broast']);
});

test('deal editor identity guard rejects a different deal ID or mismatched card title', () => {
  const detail = { deal: { id: 'deal-feast', title: 'Flame Feast' } };
  assert.equal(admin.assertDealIdentity(detail, 'deal-feast', 'Flame Feast'), true);
  assert.throws(() => admin.assertDealIdentity(detail, 'deal-hour', 'Flame Hour'), /selected deal ID/i);
  assert.throws(() => admin.assertDealIdentity(detail, 'deal-feast', 'Flame Hour'), /deal title did not match/i);
});

test('fixed deal Burger repeat maximum must equal the required group quantity', () => {
  const result = admin.buildFixedComponentGroups([{
    display_name: 'Burger', quantity: 3, allow_repeat_option: true, max_units_per_option: 3,
    options: [{ product_variant_id: 'variant-og' }, { product_variant_id: 'variant-injector' },
      { product_variant_id: 'variant-nashville-fire' }]
  }]);
  assert.equal(result.groups[0].max_units_per_option, 3);
  assert.throws(() => admin.buildFixedComponentGroups([{
    display_name: 'Burger', quantity: 3, allow_repeat_option: true, max_units_per_option: 1,
    options: [{ product_variant_id: 'variant-og' }, { product_variant_id: 'variant-injector' },
      { product_variant_id: 'variant-nashville-fire' }]
  }]), /required quantity/i);
});

test('read-back rejects wrong Burger product identity and mismatched group or option mapping limits', () => {
  const dealId = 'deal-feast';
  const option = { id: 'option-og', product_id: 'product-og', product_variant_id: 'variant-og', is_active: true };
  const makeDetail = (groupLimit = 3, mappingLimit = 3, productId = 'product-og') => ({
    deal: { id: dealId, title: 'Flame Feast', is_active: true, is_available: true },
    component_groups: [{
      group: { name_en: 'Burger', min_units: 3, max_units: 3, allow_repeat_option: true,
        max_units_per_option: groupLimit, is_active: true },
      options: [{ ...option, product_id: productId }]
    }],
    variants: [{
      variant: { id: 'deal-variant', pricing_mode: 'FIXED_BUNDLE', base_price: 3599, is_active: true },
      allowed_options: [{
        id: 'mapping-og', component_option_id: option.id, product_variant_id: option.product_variant_id,
        is_active: true, pricing_treatment: 'INCLUDED', unit_surcharge: 0, max_quantity_per_deal: mappingLimit
      }]
    }],
    schedule_assignments: []
  });
  const expected = {
    dealId, title: 'Flame Feast', basePrice: 3599, isAvailable: true, active: true,
    components: [{
      display_name: 'Burger', quantity: 3, allow_repeat_option: true, max_units_per_option: 3,
      options: [{ product_id: 'product-og', product_variant_id: 'variant-og' }]
    }],
    flameHour: false, scheduleId: null
  };
  assert.equal(admin.verifyFixedDealDetail(makeDetail(), expected), true);
  assert.throws(() => admin.verifyFixedDealDetail(makeDetail(1, 1), expected), /component group failed read-back/i);
  assert.throws(() => admin.verifyFixedDealDetail(makeDetail(3, 1), expected), /choice mapping/i);
  assert.throws(() => admin.verifyFixedDealDetail(makeDetail(3, 3, 'product-broast'), expected), /product identity/i);
  assert.throws(() => admin.verifyFixedDealDetail({ ...makeDetail(), deal: { ...makeDetail().deal, id: 'deal-hour' } }, expected), /deal ID/i);
});

test('Burger edit draft repairs legacy per-choice default to the required group quantity', () => {
  const detail = {
    deal: { id: 'deal-feast', collection_id: 'deals', title: 'Flame Feast', is_active: true, is_available: true },
    component_groups: [{
      group: { id: 'burger-group', name_en: 'Burger', min_units: 3, max_units: 3, allow_repeat_option: true,
        max_units_per_option: 1, is_active: true },
      options: [{ id: 'option-og', product_id: 'product-og', product_variant_id: 'variant-og', is_active: true }]
    }],
    variants: [{
      variant: { id: 'deal-variant', pricing_mode: 'FIXED_BUNDLE', base_price: 3599, is_active: true },
      allowed_options: [{ id: 'mapping-og', component_option_id: 'option-og', product_variant_id: 'variant-og',
        pricing_treatment: 'INCLUDED', unit_surcharge: 0, max_quantity_per_deal: 1, is_active: true }]
    }],
    schedule_assignments: []
  };
  const draft = admin.buildFixedDealEditDraft(detail, [], null, 'deal-feast', 'Flame Feast');
  assert.equal(draft.dealDraft.id, 'deal-feast');
  assert.equal(draft.components[0].max_units_per_option, 3);
});

test('buildIncludedMappings refuses an incorrectly capped repeating Burger group', () => {
  const detail = {
    component_groups: [{
      group: { name_en: 'Burger', min_units: 3, max_units: 3, allow_repeat_option: true,
        max_units_per_option: 1, is_active: true },
      options: [{ id: 'option-og', product_variant_id: 'variant-og', is_active: true }]
    }],
    variants: [{ variant: { id: 'variant-bundle', pricing_mode: 'FIXED_BUNDLE' }, allowed_options: [] }]
  };
  assert.throws(() => admin.buildIncludedMappings(detail), /Burger choices must allow each selected burger/i);
});

test('Admin deal edit binds selected card ID/title through form, loader and secured read-back', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source, /data-action="deal-edit" data-id=/);
  assert.match(source, /data-title=/);
  assert.match(source, /aria-label="Edit /);
  assert.match(source, /async function openDealEdit\(dealId,expectedTitle\)/);
  assert.match(source, /assertDealIdentity\(detail,selectedId,title\)/);
  assert.match(source, /data-deal-id=/);
  assert.match(source, /name="deal_id"/);
  assert.match(source, /submittedDealId!==formDealId/);
  assert.match(source, /editorLoadingDealId/);
});

test('Burger selector form requires maximum-per-choice and validates selected Chicken Burger variants before writing', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source, /data-field="max_units_per_option" type="number"[^\n]*required/);
  assert.match(source, /eligibleChoiceProducts\(s\.products,s\.categories,group\.display_name\)/);
  assert.match(source, /Saved product “Burger” is a placeholder — choose a real burger/);
  assert.match(source, /data-field="product_id" data-choice-product required/);
  assert.match(source, /data-field="product_variant_id" data-choice-variant required/);
  assert.match(source, /Use “\+ Add choice” to include another burger alternative/);
  assert.match(source, /select\.required=true/);
  assert.match(source, /if\(variants\.length\)select\.value=variants\[0\]\.id/);
  assert.match(source, /const groups=buildFixedComponentGroups\(s\.components,latest\.component_groups\)/);
});


test('Burger editor CSS keeps the two choice selectors wide and moves help text out of the auto grid column', async () => {
  const css = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.css', import.meta.url), 'utf8');
  assert.match(css, /\.fcv3-choice-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(220px,1fr\)\)/s);
  assert.match(css, /\.fcv3-choice-row>\.fcv3-choice-help\s*\{[^}]*grid-column:\s*1\/-1/s);
  assert.match(css, /\.fcv3-choice-row>\.fcv3-button\s*\{[^}]*grid-column:\s*1\/-1/s);
  assert.match(css, /@media\(max-width:800px\)\s*\{[^}]*\.fcv3-choice-row\s*\{grid-template-columns:minmax\(0,1fr\)\}/s);
});


test('Burger groups use a Chicken Burgers category source and Remove choice bypasses unrelated incomplete-row validation', async () => {
  const source = await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js', import.meta.url), 'utf8');
  assert.match(source, /function burgerCategoryAnchor\(\)/);
  assert.match(source, /Customer burger choices/);
  assert.match(source, /options:burger\?\(anchor\?/);
  assert.match(source, /readComponentGroups\(form,\{validate:false\}\)/);
  assert.match(source, /s\.components\[index\]\.options\.splice\(choiceIndex,1\)/);
  assert.match(source, /choiceIndex<0\|\|!s\.components\[index\]/);
  assert.match(source, /if\(!group\|\/burger\/i\.test\(group\.display_name\)\)/);
});
