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
