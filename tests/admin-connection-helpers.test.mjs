import test from 'node:test';
import assert from 'node:assert/strict';
import connection from '../apps/flame-chick-admin/connection-helpers.js';
const { createUuid, createPendingMutationStore, createSingleFlight, isAmbiguousRequestFailure, sendWithOneRetry, CatalogMutationUncertainError, requestText, requestResponse } = connection;

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

test('requestResponse preserves HTTP status and JSON interface after bounded body read',async()=>{
  const response=await requestResponse('/test',{},100,async()=>new Response('{"ok":true}',{status:201,headers:{'content-type':'application/json'}}));
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{ok:true});
});
test('requestResponse handles bodyless success responses',async()=>{
  const response=await requestResponse('/test',{},100,async()=>new Response(null,{status:204}));
  assert.equal(response.status,204);
  assert.equal(await response.text(),'');
});


test('secure UUID generation uses randomUUID or RFC 4122 v4 getRandomValues and fails closed without crypto',()=>{
  const known='123e4567-e89b-42d3-a456-426614174000';
  assert.equal(createUuid({randomUUID:()=>known}),known);
  const generated=createUuid({getRandomValues(bytes){bytes.fill(0);}});
  assert.match(generated,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.throws(()=>createUuid({}),/Secure random identifiers/);
  assert.throws(()=>createUuid({randomUUID:()=>'not-a-uuid'}),/invalid identifier/);
});

test('pending mutation store persists, validates and clears only the exact request ID',()=>{
  const values=new Map(),storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const store=createPendingMutationStore(storage,'pending');
  const body={action:'catalog_product_upsert',payload:{id:'p1',name_en:'Test'},expected_revision:4,request_id:'123e4567-e89b-42d3-a456-426614174000'};
  const record={version:1,user_id:'123e4567-e89b-42d3-a456-426614174001',fingerprint:JSON.stringify({action:body.action,payload:body.payload}),created_at:123,body};
  store.write(record);
  assert.deepEqual(store.read(),record);
  assert.throws(()=>store.clear('123e4567-e89b-42d3-a456-426614174002'),/different catalog recovery record/);
  assert.deepEqual(store.read(),record);
  store.clear(body.request_id);
  assert.equal(store.read(),null);
});

test('pending mutation store fails closed on malformed or tampered recovery data',()=>{
  const values=new Map([['pending','{bad json']]);
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const store=createPendingMutationStore(storage,'pending');
  assert.throws(()=>store.read(),/cannot be read/);
  values.set('pending',JSON.stringify({version:1,user_id:'123e4567-e89b-42d3-a456-426614174001',fingerprint:'tampered',created_at:123,body:{action:'catalog_product_upsert',payload:{},expected_revision:1,request_id:'123e4567-e89b-42d3-a456-426614174000'}}));
  assert.throws(()=>store.read(),/integrity check/);
});

test('pending mutation store verifies durable write before allowing request',()=>{
  const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  const store=createPendingMutationStore(storage,'pending');
  const body={action:'catalog_product_upsert',payload:{},expected_revision:0,request_id:'123e4567-e89b-42d3-a456-426614174000'};
  const record={version:1,user_id:'123e4567-e89b-42d3-a456-426614174001',fingerprint:JSON.stringify({action:body.action,payload:body.payload}),created_at:123,body};
  assert.throws(()=>store.write(record),/could not verify/i);
});
