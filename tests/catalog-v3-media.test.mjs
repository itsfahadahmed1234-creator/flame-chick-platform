import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import media from '../apps/flame-chick-admin/catalog-v3-media.js';

const ENTITY_ID='11111111-1111-4111-8111-111111111111';
const USER_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID='22222222-2222-4222-8222-222222222222';

function imageFile(bytes,type='image/jpeg'){
  const data=Uint8Array.from(bytes);
  return {
    size:data.byteLength,
    type,
    name:'test-image',
    slice(start,end){
      const part=data.slice(start,end);
      return {arrayBuffer:async()=>part.buffer.slice(part.byteOffset,part.byteOffset+part.byteLength)};
    },
    arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)
  };
}
function memoryStorage(){
  const values=new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    values
  };
}
function fakeResponse(data,status=200){
  return new Response(data==null?'':JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json'}
  });
}
function mockClient(options={}){
  const objects=new Map(),calls=[],tokens=[];
  let postCount=0,unauthorizedUsed=false,refreshCount=0;
  const tokenProvider=async()=>{const value='token-'+(tokens.length+1);tokens.push(value);return value;};
  const fetchImpl=async(url,request)=>{
    calls.push({url,method:request.method,headers:request.headers});
    if(request.method==='POST'&&url.includes('/storage/v1/object/')){
      postCount++;
      const path=decodeURIComponent(url.split('/storage/v1/object/flame-chick-media/')[1]||'');
      if(options.rejectUpload)return fakeResponse({message:'upload rejected'},options.rejectUpload);
      if(options.ambiguousUpload){
        objects.set(path,{size:request.body.size,mimeType:request.headers['Content-Type']});
        throw new Error('connection reset after upload');
      }
      if(options.noObjectAfterUpload)return fakeResponse({Key:path});
      objects.set(path,{size:request.body.size,mimeType:request.headers['Content-Type']});
      return fakeResponse({Key:path});
    }
    if(request.method==='GET'&&url.includes('/storage/v1/object/info/')){
      const path=decodeURIComponent(url.split('/storage/v1/object/info/flame-chick-media/')[1]||'');
      if(options.infoError)return fakeResponse({message:'info denied'},options.infoError);
      const stored=objects.get(path);
      if(!stored)return fakeResponse({message:'not found'},404);
      return fakeResponse({size:options.reportSize??stored.size,mimetype:options.reportMime??stored.mimeType});
    }
    if(request.method==='DELETE'&&url.endsWith('/storage/v1/object/flame-chick-media')){
      const body=JSON.parse(request.body);
      body.prefixes.forEach(path=>objects.delete(path));
      return fakeResponse([]);
    }
    return fakeResponse({message:'unexpected request'},500);
  };
  const requestResponse=async(url,request,timeout,impl)=>{
    if(options.unauthorizedOnce&&request.method==='POST'&&!unauthorizedUsed){
      unauthorizedUsed=true;
      return fakeResponse({message:'expired'},401);
    }
    return impl(url,request);
  };
  const client=media.createClient({
    supabaseUrl:'https://example.supabase.co',
    bucket:'flame-chick-media',
    apiKey:'publishable-key',
    getAccessToken:tokenProvider,
    refreshSession:async()=>{refreshCount++;},
    requestResponse,
    createUuid:()=>UUID,
    fetchImpl,
    timeoutMs:12000
  });
  return {client,objects,calls,tokens,getPostCount:()=>postCount,getRefreshCount:()=>refreshCount};
}

test('managed paths are restricted to supported media folders and filenames',()=>{
  assert.equal(media.isManagedPath('products/'+ENTITY_ID+'/asset.jpg'),true);
  assert.equal(media.isManagedPath('categories/'+ENTITY_ID+'/asset.webp'),true);
  assert.equal(media.isManagedPath('deals/'+ENTITY_ID+'/asset.png'),true);
  assert.equal(media.isManagedPath('categories/'+ENTITY_ID+'/../asset.jpg'),false);
  assert.equal(media.isManagedPath('products/'+ENTITY_ID+'/asset.gif'),false);
  assert.equal(media.isManagedPath('site/'+ENTITY_ID+'/asset.jpg'),false);
  assert.equal(media.isTarget('products',ENTITY_ID),true);
  assert.equal(media.isTarget('subcategories',ENTITY_ID),false);
});

test('file validation checks MIME, signature, empty data and the 5 MiB cap',async()=>{
  const inspected=await media.inspectImageFile(imageFile([0xff,0xd8,0xff,0x00]));
  assert.equal(inspected.extension,'jpg');
  assert.equal(inspected.mimeType,'image/jpeg');
  assert.equal(inspected.size,4);
  assert.match(inspected.fingerprint,/^[0-9a-f]{64}$/);
  await assert.rejects(()=>media.inspectImageFile(imageFile([0x00,0x00,0x00],'image/jpeg')),/contents do not match/);
  await assert.rejects(()=>media.inspectImageFile(imageFile([0xff,0xd8,0xff],'image/gif')),/JPG, PNG or WebP/);
  const tooLarge={size:5*1024*1024+1,type:'image/jpeg',slice(){throw new Error('must not inspect large file');}};
  await assert.rejects(()=>media.inspectImageFile(tooLarge),/5 MB or smaller/);
  await assert.rejects(()=>media.inspectImageFile(imageFile([])),/non-empty/);
});

test('upload uses a fresh UUID path and verifies exact Storage size and MIME',async()=>{
  const mock=mockClient();
  const file=imageFile([0xff,0xd8,0xff,0x01]);
  const result=await mock.client.upload('products',ENTITY_ID,file);
  assert.equal(result.path,'products/'+ENTITY_ID+'/'+UUID+'.jpg');
  assert.equal(result.size,file.size);
  assert.equal(result.mimeType,'image/jpeg');
  assert.match(result.fingerprint,/^[0-9a-f]{64}$/);
  assert.equal(mock.objects.size,1);
  assert.equal(mock.calls.some(call=>call.method==='POST'&&call.headers['x-upsert']==='false'),true);
  assert.equal(mock.calls.some(call=>call.method==='GET'&&call.url.includes('/object/info/')),true);
  assert.ok(mock.calls.every(call=>call.headers.apikey==='publishable-key'));
  assert.ok(mock.calls.every(call=>call.headers.Authorization.startsWith('Bearer token-')));
  assert.equal(mock.calls.some(call=>String(call.headers.Authorization).includes('service_role')),false);
});

test('a resumed upload rejects a different file even when MIME type and size match',async()=>{
  const mock=mockClient();
  const original=imageFile([0xff,0xd8,0xff,0x01]);
  const plan=await mock.client.prepareUpload('products',ENTITY_ID,original);
  const different=imageFile([0xff,0xd8,0xff,0x02]);
  await assert.rejects(()=>mock.client.uploadPrepared(plan,different),error=>{
    assert.equal(error.name,'MediaFileValidationError');
    return true;
  });
  assert.equal(mock.getPostCount(),0);
  assert.equal(mock.objects.size,0);
});

test('ambiguous upload response reconciles by checking the exact object before failing',async()=>{
  const mock=mockClient({ambiguousUpload:true});
  const result=await mock.client.upload('categories',ENTITY_ID,imageFile([0xff,0xd8,0xff,0x04]));
  assert.equal(result.path,'categories/'+ENTITY_ID+'/'+UUID+'.jpg');
  assert.equal(mock.objects.size,1);
  assert.equal(mock.getPostCount(),1);
});

test('an upload that cannot be found after an ambiguous response is not attached or deleted',async()=>{
  const mock=mockClient({noObjectAfterUpload:true});
  await assert.rejects(()=>mock.client.upload('deals',ENTITY_ID,imageFile([0xff,0xd8,0xff,0x05])),error=>{
    assert.equal(error.name,'MediaUploadUncertainError');
    assert.equal(error.uncertain,true);
    assert.match(error.path,/^deals\//);
    return true;
  });
  assert.equal(mock.objects.size,0);
  assert.equal(mock.calls.some(call=>call.method==='DELETE'),false);
});

test('a Storage object with mismatched metadata is removed through Storage API',async()=>{
  const mock=mockClient({reportMime:'image/png'});
  await assert.rejects(()=>mock.client.upload('products',ENTITY_ID,imageFile([0xff,0xd8,0xff,0x06])),error=>{
    assert.equal(error.name,'MediaUploadValidationError');
    return true;
  });
  assert.equal(mock.objects.size,0);
  assert.equal(mock.calls.some(call=>call.method==='DELETE'),true);
});

test('a definite upload rejection does not create a catalog link or delete an existing object',async()=>{
  const mock=mockClient({rejectUpload:413});
  await assert.rejects(()=>mock.client.upload('products',ENTITY_ID,imageFile([0xff,0xd8,0xff,0x07])),error=>{
    assert.equal(error.name,'MediaStorageError');
    assert.equal(error.status,413);
    return true;
  });
  assert.equal(mock.objects.size,0);
  assert.equal(mock.calls.some(call=>call.method==='DELETE'),false);
});

test('expired session refreshes once and retries the authenticated Storage request',async()=>{
  const mock=mockClient({unauthorizedOnce:true});
  const result=await mock.client.upload('deals',ENTITY_ID,imageFile([0xff,0xd8,0xff,0x08]));
  assert.equal(result.path,'deals/'+ENTITY_ID+'/'+UUID+'.jpg');
  assert.equal(mock.getRefreshCount(),1);
  assert.equal(mock.calls.filter(call=>call.method==='POST').length,1);
});

test('user-bound recovery records validate the entity path, stage and account',()=>{
  const storage=memoryStorage();
  const store=media.createRecoveryStore(storage,'pending-media',USER_ID);
  const record={
    version:1,user_id:USER_ID,kind:'products',entity_id:ENTITY_ID,
    path:'products/'+ENTITY_ID+'/'+UUID+'.jpg',
    extension:'jpg',mimeType:'image/jpeg',size:4,fingerprint:'a'.repeat(64),
    action:'catalog_product_upsert',
    payload:{id:ENTITY_ID,image_current_path:'products/'+ENTITY_ID+'/'+UUID+'.jpg',image_previous_path:null,
      image_extension:'jpg',image_previous_extension:null,image_published:true},
    stage:'uploaded',created_at:Date.now()
  };
  store.write(record);
  assert.deepEqual(store.read(),record);
  assert.throws(()=>media.createRecoveryStore(storage,'pending-media',OTHER_USER_ID).read(),/invalid/);
  assert.throws(()=>store.write({...record,path:'products/'+ENTITY_ID+'/../bad.jpg'}),/invalid/);
  assert.throws(()=>store.write({...record,stage:'delete_everything'}),/invalid/);
  assert.throws(()=>store.write({...record,action:'catalog_category_upsert'}),/invalid/);
  assert.throws(()=>store.write({...record,payload:{...record.payload,id:OTHER_USER_ID}}),/invalid/);
  assert.throws(()=>store.write({...record,payload:{...record.payload,image_published:false}}),/invalid/);
  assert.doesNotThrow(()=>store.write({...record,stage:'committed_unverified'}));
  store.clear(record.path);
  assert.equal(store.read(),null);
});

test('media recovery store refuses to clear a different operation',()=>{
  const storage=memoryStorage();
  const store=media.createRecoveryStore(storage,'pending-media',USER_ID);
  const record={
    version:1,user_id:USER_ID,kind:'deals',entity_id:ENTITY_ID,
    path:'deals/'+ENTITY_ID+'/'+UUID+'.png',
    extension:'png',mimeType:'image/png',size:4,fingerprint:'b'.repeat(64),
    action:'catalog_deal_upsert',payload:{id:ENTITY_ID,image_current_path:'deals/'+ENTITY_ID+'/'+UUID+'.png',image_previous_path:null},
    stage:'linking',created_at:Date.now()
  };
  store.write(record);
  assert.throws(()=>store.clear('deals/'+ENTITY_ID+'/different.png'),/different image recovery record/);
  assert.equal(store.read().path,record.path);
});

test('Catalog V3 wires media through secured catalog commands, not direct table writes',async()=>{
  const source=await readFile(new URL('../apps/flame-chick-admin/catalog-v3-admin.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../apps/flame-chick-admin/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../apps/flame-chick-admin/index.html',import.meta.url),'utf8');
  assert.match(source,/mediaEditor\('products'/);
  assert.match(source,/mediaEditor\('categories'/);
  assert.match(source,/mediaEditor\('deals'/);
  assert.match(source,/write\(mediaAction\(kind\),payload\)/);
  assert.match(source,/Check and resume image operation/);
  assert.match(source,/data-media-resume-upload/);
  assert.match(source,/resumePendingUpload/);
  assert.match(source,/committed_unverified/);
  assert.match(source,/getPendingMutation/);
  assert.match(source,/No Storage object was deleted/);
  assert.match(source,/unpublished catalog draft only/);
  assert.match(source,/does not yet display category artwork/);
  assert.doesNotMatch(source,/\/rest\/v1\/|\.from\(['"]storage['"]\)/);
  assert.match(app,/catalogV3MediaOptions/);
  assert.match(app,/catalog-media-pending/);
  assert.equal((html.match(/catalog-v3-admin\.js/g)||[]).length,1);
  assert.ok(html.indexOf('connection-helpers.js')<html.indexOf('catalog-v3-media.js'));
  assert.ok(html.indexOf('catalog-v3-media.js')<html.indexOf('catalog-v3-admin.js'));
});
