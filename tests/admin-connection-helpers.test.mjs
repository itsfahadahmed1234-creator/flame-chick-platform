import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight, isAmbiguousRequestFailure, sendWithOneRetry, CatalogMutationUncertainError, requestText } from '../apps/flame-chick-admin/connection-helpers.js';

test('single-flight shares one refresh promise across concurrent callers', async () => {
  let calls=0,release; const gate=new Promise(resolve=>{release=resolve;});
  const refresh=createSingleFlight(async token=>{calls++;await gate;return token;});
  const a=refresh('refresh-token'),b=refresh('refresh-token');
  assert.equal(a,b); await Promise.resolve(); assert.equal(calls,1); release();
  assert.equal(await a,'refresh-token'); assert.equal(await refresh('next-token'),'next-token'); assert.equal(calls,2);
});
test('single-flight clears rejected work so a later refresh can recover', async () => {
  let calls=0; const refresh=createSingleFlight(async()=>{calls++;if(calls===1)throw Error('temporary');return 'ok';});
  await assert.rejects(refresh(),/temporary/); assert.equal(await refresh(),'ok'); assert.equal(calls,2);
});
test('only ambiguous failures qualify for one same-body retry',()=>{
  for(const error of [Object.assign(Error('timeout'),{name:'TimeoutError'}),Object.assign(Error('network'),{name:'TypeError'}),Object.assign(Error('gateway'),{name:'HttpRequestError',status:503})])assert.equal(isAmbiguousRequestFailure(error),true);
  assert.equal(isAmbiguousRequestFailure(Object.assign(Error('conflict'),{name:'HttpRequestError',status:409})),false);
  assert.equal(isAmbiguousRequestFailure(Error('validation')),false);
});
test('mutation retries exactly once with the identical request object',async()=>{
  const body={action:'product_upsert',request_id:'same-id',expected_revision:8},seen=[];
  const result=await sendWithOneRetry(async request=>{seen.push(request);if(seen.length===1)throw Object.assign(Error('gateway'),{name:'HttpRequestError',status:504});return {ok:true};},body);
  assert.deepEqual(result,{ok:true});assert.equal(seen.length,2);assert.equal(seen[0],body);assert.equal(seen[1],body);assert.equal(seen[0].request_id,seen[1].request_id);
});
test('two ambiguous mutation attempts preserve an explicit uncertain outcome',async()=>{
  let calls=0;const body={action:'product_upsert',request_id:'stable-id'};
  await assert.rejects(sendWithOneRetry(async request=>{calls++;assert.equal(request,body);throw Object.assign(Error('timeout'),{name:'TimeoutError'});},body),error=>error instanceof CatalogMutationUncertainError&&/same unchanged save/.test(error.message));
  assert.equal(calls,2);
});
test('definite failure is not retried',async()=>{
  let calls=0;await assert.rejects(sendWithOneRetry(async()=>{calls++;throw Object.assign(Error('revision conflict'),{name:'HttpRequestError',status:409});},{}),/revision conflict/);assert.equal(calls,1);
});
test('request timeout remains active while response body is read',async()=>{
  const fetchImpl=async()=>({text:()=>new Promise(resolve=>setTimeout(()=>resolve('late'),30))});
  await assert.rejects(requestText('/test',{},5,fetchImpl),error=>error.name==='TimeoutError');
});
test('requestText returns bounded response and body when completed in time',async()=>{
  const response={status:200,text:async()=>'ok'},result=await requestText('/test',{},100,async()=>response);
  assert.equal(result.response,response);assert.equal(result.text,'ok');
});
