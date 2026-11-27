import test from 'node:test';
import assert from 'node:assert/strict';
import payment from '../apps/flame-chick-pos/payment-collection.js';

const ORDER='99000000-0000-4000-8000-000000000001';
const REQUEST='aa000000-0000-4000-8000-000000000001';

test('offers exactly COD, Card and Online/bank transfer',()=>{
  assert.deepEqual(payment.METHODS.map(x=>x.label),['COD','Card','Online/bank transfer']);
  assert.deepEqual(payment.METHODS.map(x=>x.value),['cash','card','bank']);
});

test('maps UI collection labels to database payment method values',()=>{
  assert.equal(payment.normalizeMethod('COD'),'cash');
  assert.equal(payment.normalizeMethod('Card'),'card');
  assert.equal(payment.normalizeMethod('Online/bank transfer'),'bank');
  assert.equal(payment.normalizeMethod('wallet'),null);
  assert.equal(payment.methodLabel('bank'),'Online/bank transfer');
});

test('creates a full-balance idempotent collection request without accepting a partial amount',()=>{
  assert.deepEqual(payment.createFullBalanceRequest({
    orderId:ORDER,requestId:REQUEST,balance:1250,method:'COD'
  }),{
    action:'collect_payment',order_id:ORDER,amount:1250,payment_method:'cash',request_id:REQUEST
  });
  assert.throws(()=>payment.createFullBalanceRequest({
    orderId:ORDER,requestId:REQUEST,balance:0,method:'cash'
  }));
  assert.throws(()=>payment.createFullBalanceRequest({
    orderId:ORDER,requestId:REQUEST,balance:1250,method:'wallet'
  }));
  assert.throws(()=>payment.createFullBalanceRequest({
    orderId:'bad',requestId:REQUEST,balance:1250,method:'card'
  }));
});


test('attaches a payment-only request without changing the server order identity or revision',()=>{
  const order={localOrderId:'LOCAL-1',syncOrderId:ORDER,localRevision:7,total:599,status:'Open'};
  const next=payment.attachPendingPayment(order,{
    requestId:REQUEST,amount:599,method:'Online',createdAt:'2026-11-27T02:00:00.000Z'
  });
  assert.equal(next.localOrderId,'LOCAL-1');
  assert.equal(next.syncOrderId,ORDER);
  assert.equal(next.localRevision,7);
  assert.deepEqual(next.pendingPayment,{requestId:REQUEST,amount:599,method:'bank',createdAt:'2026-11-27T02:00:00.000Z'});
  assert.equal(Object.hasOwn(order,'pendingPayment'),false);
});

test('retries reuse the existing payment request ID and reject changed amount or method',()=>{
  const order={syncOrderId:ORDER,localRevision:4,total:599,pendingPayment:{requestId:REQUEST,amount:599,method:'bank',createdAt:'2026-11-27T02:00:00.000Z'}};
  const retry=payment.attachPendingPayment(order,{requestId:'bb000000-0000-4000-8000-000000000001',amount:599,method:'bank'});
  assert.equal(retry.pendingPayment.requestId,REQUEST);
  assert.throws(()=>payment.attachPendingPayment(order,{requestId:REQUEST,amount:600,method:'bank'}),/different payment details/);
  assert.throws(()=>payment.attachPendingPayment(order,{requestId:REQUEST,amount:599,method:'cash'}),/different payment details/);
});


test('attaches a payment-only request without changing the server order identity or revision',()=>{
  const order={localOrderId:'LOCAL-1',syncOrderId:ORDER,localRevision:7,total:599,status:'Open'};
  const next=payment.attachPendingPayment(order,{
    requestId:REQUEST,amount:599,method:'Online',createdAt:'2026-11-27T02:00:00.000Z'
  });
  assert.equal(next.localOrderId,'LOCAL-1');
  assert.equal(next.syncOrderId,ORDER);
  assert.equal(next.localRevision,7);
  assert.deepEqual(next.pendingPayment,{requestId:REQUEST,amount:599,method:'bank',createdAt:'2026-11-27T02:00:00.000Z'});
  assert.equal(Object.hasOwn(order,'pendingPayment'),false);
});

test('retries reuse the existing payment request ID and reject changed amount or method',()=>{
  const order={syncOrderId:ORDER,localRevision:4,total:599,pendingPayment:{requestId:REQUEST,amount:599,method:'bank',createdAt:'2026-11-27T02:00:00.000Z'}};
  const retry=payment.attachPendingPayment(order,{requestId:'bb000000-0000-4000-8000-000000000001',amount:599,method:'bank'});
  assert.equal(retry.pendingPayment.requestId,REQUEST);
  assert.throws(()=>payment.attachPendingPayment(order,{requestId:REQUEST,amount:600,method:'bank'}),/different payment details/);
  assert.throws(()=>payment.attachPendingPayment(order,{requestId:REQUEST,amount:599,method:'cash'}),/different payment details/);
});
