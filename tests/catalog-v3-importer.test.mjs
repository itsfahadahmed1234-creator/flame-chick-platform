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
  assert.throws(() => importer.validatePublishedMenuDraft(badStandalone), /must have its own numeric price/i);
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


function createFakeCatalogApi() {
  let nextId = 1, revision = 0, writes = 0;
  const categories = [], products = [], collections = [], schedules = [], deals = [];
  const makeId = () => '10000000-0000-4000-8000-' + String(nextId++).padStart(12, '0');
  const ok = extra => ({ ok: true, draft_revision: revision, ...extra });
  const findVariant = id => {
    for (const product of products) {
      const variant = product.variants.find(row => row.id === id);
      if (variant) return { product, variant };
    }
    return null;
  };
  const detail = deal => ({
    ok: true, draft_revision: revision, deal,
    component_groups: deal.component_groups || [],
    variants: deal.variants.map(variant => ({ variant, allowed_options: variant.allowed_options || [] })),
    schedule_assignments: deal.schedule_assignments || [],
    branch_availability: []
  });
  async function request(action, input = {}, mutation = false) {
    if (!mutation) {
      if (action === 'catalog_categories_list') return ok({ items: categories, has_more: false });
      if (action === 'catalog_products_list') return ok({ items: products, has_more: false });
      if (action === 'catalog_deal_collections_list') return ok({ items: collections, has_more: false });
      if (action === 'catalog_schedule_sets_list') return ok({ items: schedules, has_more: false });
      if (action === 'catalog_deals_list') return ok({ items: deals.filter(row => row.collection_id === input.collection_id), has_more: false });
      if (action === 'catalog_deal_detail_read') {
        const deal = deals.find(row => row.id === input.deal_id);
        if (!deal) throw new Error('fake deal missing');
        return detail(deal);
      }
      if (action === 'catalog_schedule_detail_read') {
        const schedule = schedules.find(row => row.id === input.schedule_set_id);
        if (!schedule) throw new Error('fake schedule missing');
        return ok({ schedule_set: schedule, windows: schedule.windows });
      }
      throw new Error('Unexpected fake read action: ' + action);
    }
    writes++;
    revision++;
    if (action === 'catalog_category_upsert') {
      const row = { id: makeId(), ...input }; categories.push(row);
      return ok({ entity_id: row.id });
    }
    if (action === 'catalog_product_upsert') {
      const row = { id: makeId(), ...input, variants: input.variants.map(variant => ({ id: makeId(), ...variant })) };
      products.push(row);
      return ok({ entity_id: row.id });
    }
    if (action === 'catalog_deal_collection_upsert') {
      const row = { id: makeId(), ...input }; collections.push(row);
      return ok({ entity_id: row.id });
    }
    if (action === 'catalog_schedule_set_upsert') {
      const row = { id: makeId(), ...input }; schedules.push(row);
      return ok({ entity_id: row.id });
    }
    if (action === 'catalog_deal_upsert') {
      let row = deals.find(item => item.id === input.id);
      if (!row) {
        row = { id: makeId(), component_groups: [], schedule_assignments: [], ...input };
        row.variants = (input.variants || []).map(variant => ({ id: makeId(), ...variant, allowed_options: [] }));
        deals.push(row);
      } else {
        Object.assign(row, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'variants')));
        if (input.variants) {
          for (const update of input.variants) {
            let variant = row.variants.find(item => item.id === update.id);
            if (!variant) { variant = { id: makeId(), allowed_options: [] }; row.variants.push(variant); }
            Object.assign(variant, update);
          }
        }
      }
      return ok({ entity_id: row.id });
    }
    if (action === 'catalog_deal_components_upsert') {
      const deal = deals.find(item => item.id === input.deal_id);
      if (!deal) throw new Error('fake deal missing for components');
      deal.component_groups = input.groups.map(group => ({
        group: {
          id: makeId(), name_en: group.name_en, name_ur: group.name_ur,
          min_units: group.min_units, max_units: group.max_units,
          allow_repeat_option: group.allow_repeat_option, max_units_per_option: group.max_units_per_option,
          sort_order: group.sort_order, is_active: group.is_active
        },
        options: group.options.map(option => {
          const found = findVariant(option.product_variant_id);
          if (!found) throw new Error('fake component variant missing');
          return { id: makeId(), product_id: found.product.id, product_variant_id: option.product_variant_id,
            is_active: option.is_active, sort_order: option.sort_order };
        })
      }));
      return ok({ entity_id: deal.id });
    }
    if (action === 'catalog_deal_variant_options_upsert') {
      const deal = deals.find(item => item.id === input.deal_id);
      const variant = deal && deal.variants.find(item => item.id === input.deal_variant_id);
      if (!variant) throw new Error('fake deal variant missing for mappings');
      variant.allowed_options = input.options.map(mapping => {
        const option = deal.component_groups.flatMap(doc => doc.options).find(row => row.id === mapping.component_option_id);
        if (!option) throw new Error('fake component option missing for mapping');
        return { id: makeId(), component_option_id: mapping.component_option_id, product_variant_id: option.product_variant_id,
          pricing_treatment: mapping.pricing_treatment, unit_surcharge: mapping.unit_surcharge,
          max_quantity_per_deal: mapping.max_quantity_per_deal, sort_order: mapping.sort_order, is_active: mapping.is_active };
      });
      return ok({ entity_id: deal.id });
    }
    if (action === 'catalog_deal_schedule_assignment_upsert') {
      const deal = deals.find(item => item.id === input.deal_id);
      if (!deal) throw new Error('fake deal missing for schedule');
      deal.schedule_assignments = [{ id: makeId(), branch_id: input.branch_id, schedule_set_id: input.schedule_set_id, is_active: input.is_active }];
      return ok({ entity_id: deal.id });
    }
    throw new Error('Unexpected fake write action: ' + action);
  }
  return {
    request,
    counts: () => ({
      writes, categories: categories.length, products: products.length,
      variants: products.reduce((sum, row) => sum + row.variants.length, 0),
      collections: collections.length, schedules: schedules.length, deals: deals.length,
      offers: deals.reduce((sum, deal) => sum + deal.variants.length, 0),
      scheduledDeals: deals.filter(deal => (deal.schedule_assignments || []).some(item => item.is_active)).length,
      allDealsActive: deals.every(deal => deal.is_active === true && deal.variants.length === 1 && deal.variants[0].is_active === true),
      allMappingsIncluded: deals.every(deal => deal.variants.every(variant =>
        variant.allowed_options.length === deal.component_groups.length &&
        variant.allowed_options.every(mapping => mapping.is_active && mapping.pricing_treatment === 'INCLUDED' && Number(mapping.unit_surcharge) === 0)
      ))
    })
  };
}

test('full mock catalog import stages and verifies the complete menu, then resumes without duplicate writes', async () => {
  const api = createFakeCatalogApi();
  const progress = [];
  const first = await importer.runPublishedMenuImport(draft, {
    request: api.request,
    onProgress: event => progress.push(event.phase)
  });
  assert.equal(first.ok, true);
  assert.equal(first.publicationPerformed, false);
  assert.equal(first.dealCount, 6);
  const afterFirst = api.counts();
  assert.equal(afterFirst.categories, 8);
  assert.equal(afterFirst.products, 25);
  assert.equal(afterFirst.variants, 28);
  assert.equal(afterFirst.collections, 1);
  assert.equal(afterFirst.schedules, 1);
  assert.equal(afterFirst.deals, 6);
  assert.equal(afterFirst.offers, 6);
  assert.equal(afterFirst.scheduledDeals, 2);
  assert.equal(afterFirst.allDealsActive, true);
  assert.equal(afterFirst.allMappingsIncluded, true);
  assert.ok(progress.includes('complete'));

  const second = await importer.runPublishedMenuImport(draft, { request: api.request });
  assert.equal(second.ok, true);
  assert.deepEqual(api.counts(), afterFirst);
});
