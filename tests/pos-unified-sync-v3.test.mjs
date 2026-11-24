import test from 'node:test';
import assert from 'node:assert/strict';
import sync from '../apps/flame-chick-pos/sync-v3.js';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import dealView from '../apps/flame-chick-website/js/catalog-v3-deal-view.js';
import fixture from './fixtures/catalog-v3-fixture.cjs';

const { IDS, createSnapshot } = fixture;
const ORDER = '99000000-0000-4000-8000-000000000001';
const PAYMENT = 'aa000000-0000-4000-8000-000000000001';
function snapshot() {
  const value = createSnapshot();
  value.databaseNow = '2026-11-24T08:00:00.000Z';
  return value;
}
function baseOrder(overrides={}) {
  const s = snapshot();
  return {
    localOrderId: 'LOCAL-LEGACY-001',
    syncOrderId: ORDER,
    localRevision: 1,
    fulfillmentType: 'Takeaway',
    customerName: 'QA Counter',
    phone: '03000000000',
    items: [{itemId:IDS.variant,variantId:IDS.variant,productId:IDS.product,quantity:1,modifiers:[]}],
    subtotal: 550,
    catalogPublicationId: s.publicationId,
    catalogVersion: s.publicationNumber,
    ...overrides
  };
}

test('preserves legacy local receipt key while assigning a separate stable UUID sync identity',()=>{
  const order=sync.ensureIdentity({localOrderId:'LOCAL-OLD-1'},()=>ORDER);
  assert.equal(order.localOrderId,'LOCAL-OLD-1');
  assert.equal(order.syncOrderId,ORDER);
  assert.equal(order.localRevision,1);
  assert.equal(sync.ensureIdentity(order,()=>{throw Error('must not replace stable UUID')}).syncOrderId,ORDER);
});
test('increments revisions monotonically after edits without changing cloud identity',()=>{
  const old={syncOrderId:ORDER,localRevision:8};
  const next=sync.ensureIdentity({syncOrderId:ORDER,localRevision:sync.nextRevision(old,old)},()=>{throw Error('unexpected UUID')});
  assert.equal(next.syncOrderId,ORDER);
  assert.equal(next.localRevision,9);
});
test('maps Delivery, Takeaway and Dine-in to canonical API fulfillment codes',()=>{
  assert.equal(sync.normalizeFulfillment('Delivery'),'delivery');
  assert.equal(sync.normalizeFulfillment('Takeaway'),'pickup');
  assert.equal(sync.normalizeFulfillment('Dine-in'),'dine_in');
  assert.throws(()=>sync.normalizeFulfillment('WhatsApp'));
});
test('builds a product payload using only V3 IDs and selected modifier group IDs',()=>{
  const s=snapshot();
  const order=baseOrder({items:[{
    itemId:IDS.variant,variantId:IDS.variant,productId:IDS.product,quantity:2,
    modifiers:[{groupId:IDS.modifierGroup,modifierId:IDS.modifier}]
  }]});
  const payload=sync.buildSyncPayload(order,s,IDS.branch,{contract,dealView});
  assert.equal(payload.action,'sync_pos_order');
  assert.equal(payload.local_order_id,ORDER);
  assert.equal(payload.local_revision,1);
  assert.equal(payload.fulfillment_type,'pickup');
  assert.equal(payload.publication_id,s.publicationId);
  assert.deepEqual(payload.items[0],{
    kind:'product',product_id:IDS.product,product_variant_id:IDS.variant,quantity:2,notes:'',
    modifiers:[{modifier_group_id:IDS.modifierGroup,modifier_ids:[IDS.modifier]}]
  });
  assert.equal(Object.hasOwn(payload,'subtotal'),false);
});
test('builds exact V3 deal variant and fixed component selections',()=>{
  const s=snapshot();
  const order=baseOrder({items:[{dealId:IDS.deal,dealVariantId:IDS.dealVariant,quantity:1,componentGroups:[]}]});
  const payload=sync.buildSyncPayload(order,s,IDS.branch,{contract,dealView});
  assert.equal(payload.items[0].kind,'deal');
  assert.equal(payload.items[0].deal_id,IDS.deal);
  assert.equal(payload.items[0].deal_variant_id,IDS.dealVariant);
  assert.deepEqual(payload.items[0].component_groups.map(g=>g.component_group_id),[IDS.componentGroup,IDS.drinkComponentGroup]);
  assert.deepEqual(payload.items[0].component_groups.map(g=>g.components[0].component_option_id),[IDS.componentOption,IDS.drinkComponentOption]);
});
test('requires review rather than syncing a stale publication',()=>{
  const s=snapshot();
  assert.throws(()=>sync.buildSyncPayload(baseOrder({catalogVersion:99}),s,IDS.branch,{contract,dealView}),e=>e.code==='POS_CATALOG_STALE');
});
test('adds full payment as a separate idempotent request for Takeaway/Dine-in',()=>{
  const s=snapshot();
  const order=baseOrder({pendingPayment:{requestId:PAYMENT,amount:550,method:'cash'}});
  const payload=sync.buildSyncPayload(order,s,IDS.branch,{contract,dealView});
  assert.deepEqual(payload.payment,{request_id:PAYMENT,amount:550,payment_method:'cash'});
  assert.equal(sync.acknowledgementMatches(payload,{ok:true,local_order_id:ORDER,local_revision:1,order_id:'99000000-0000-4000-8000-000000000002'}),true);
  assert.equal(sync.acknowledgementMatches(payload,{ok:true,local_order_id:ORDER,local_revision:2,order_id:'99000000-0000-4000-8000-000000000002'}),false);
});
test('builds Delivery with a published area ID and never collects payment at Rider delivery time',()=>{
  const s=snapshot();
  const areaId='bb000000-0000-4000-8000-000000000001';
  const order=baseOrder({
    fulfillmentType:'Delivery',area:'Gulshan',deliveryAreaId:areaId,
    address:'House 10, Gulshan, Karachi',deliveryInstructions:'Ring bell'
  });
  const payload=sync.buildSyncPayload(order,s,IDS.branch,{contract,dealView});
  assert.equal(payload.fulfillment_type,'delivery');
  assert.deepEqual(payload.delivery,{
    selection_type:'listed_area',area_id:areaId,other_locality:null,
    address:'House 10, Gulshan, Karachi',instructions:'Ring bell'
  });
  assert.equal(Object.hasOwn(payload,'payment'),false);
  assert.throws(()=>sync.buildSyncPayload({...order,pendingPayment:{requestId:PAYMENT,amount:550,method:'cash'}},s,IDS.branch,{contract,dealView}),e=>e.code==='POS_PAYMENT_FULFILLMENT_INVALID');
});
test('lost-response retries are safe and acknowledgement must match identity plus revision',()=>{
  const s=snapshot();
  const payload=sync.buildSyncPayload(baseOrder(),s,IDS.branch,{contract,dealView});
  assert.equal(sync.acknowledgementMatches(payload,{ok:true,local_order_id:ORDER,local_revision:1,order_id:'99000000-0000-4000-8000-000000000002'}),true);
  assert.equal(sync.isRecoverableHttpStatus(503),true);
  assert.equal(sync.isRecoverableHttpStatus(409),false);
});
