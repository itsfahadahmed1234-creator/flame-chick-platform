/* Small, testable request primitives for the Flame Chick Admin browser. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.FlameChickAdminConnection=api;
})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function createUuid(cryptoImpl=globalThis.crypto){
    if(cryptoImpl&&typeof cryptoImpl.randomUUID==="function"){
      const value=cryptoImpl.randomUUID();
      if(typeof value==="string"&&UUID_RE.test(value))return value;
      throw new Error("The secure UUID provider returned an invalid identifier.");
    }
    if(!cryptoImpl||typeof cryptoImpl.getRandomValues!=="function")throw new Error("Secure random identifiers are unavailable in this browser.");
    const bytes=new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    bytes[6]=(bytes[6]&0x0f)|0x40;
    bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("");
    const value=hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
    if(!UUID_RE.test(value))throw new Error("Could not generate a secure UUID.");
    return value;
  }

  function createPendingMutationStore(storage,key){
    if(!storage||typeof storage.getItem!=="function"||typeof storage.setItem!=="function"||typeof storage.removeItem!=="function")throw new TypeError("A persistent storage adapter is required.");
    if(typeof key!=="string"||!key)throw new TypeError("A persistent storage key is required.");
    function validate(record){
      if(!record||typeof record!=="object"||Array.isArray(record)||record.version!==1||
         typeof record.user_id!=="string"||!UUID_RE.test(record.user_id)||
         typeof record.fingerprint!=="string"||!Number.isSafeInteger(record.created_at)||record.created_at<0||
         !record.body||typeof record.body!=="object"||Array.isArray(record.body)||
         typeof record.body.action!=="string"||!/^catalog_[a-z0-9_]+$/.test(record.body.action)||
         !record.body.payload||typeof record.body.payload!=="object"||Array.isArray(record.body.payload)||
         !Number.isSafeInteger(record.body.expected_revision)||record.body.expected_revision<0||
         typeof record.body.request_id!=="string"||!UUID_RE.test(record.body.request_id)){
        throw new Error("The saved catalog recovery record is invalid. No new catalog save will be sent.");
      }
      const expected=JSON.stringify({action:record.body.action,payload:record.body.payload});
      if(record.fingerprint!==expected)throw new Error("The saved catalog recovery record failed its integrity check. No new catalog save will be sent.");
      const encoded=JSON.stringify(record);
      if(new TextEncoder().encode(encoded).byteLength>81920)throw new Error("The saved catalog recovery record exceeds the safe size limit.");
      return record;
    }
    function read(){
      const raw=storage.getItem(key);
      if(raw==null)return null;
      let record;
      try{record=JSON.parse(raw);}catch{throw new Error("The saved catalog recovery record cannot be read. No new catalog save will be sent.");}
      return validate(record);
    }
    function write(record){
      const valid=validate(record),encoded=JSON.stringify(valid);
      storage.setItem(key,encoded);
      if(storage.getItem(key)!==encoded)throw new Error("Could not verify the catalog recovery record was saved. The catalog mutation was not sent.");
      return valid;
    }
    function clear(requestId){
      const current=read();
      if(current&&current.body.request_id!==requestId)throw new Error("A different catalog recovery record is stored; it was not removed.");
      if(current)storage.removeItem(key);
      if(storage.getItem(key)!=null)throw new Error("Could not clear the reconciled catalog recovery record.");
    }
    return Object.freeze({read,write,clear});
  }

  function createSingleFlight(operation){
    if(typeof operation!=="function")throw new TypeError("A refresh operation is required.");
    let inFlight=null;
    return function(...args){
      if(inFlight)return inFlight;
      const work=Promise.resolve().then(()=>operation.apply(this,args));
      const shared=work.finally(()=>{if(inFlight===shared)inFlight=null;});
      inFlight=shared;
      return shared;
    };
  }

  function isAmbiguousRequestFailure(error){
    if(!error)return false;
    if(error.name==="TimeoutError"||error.name==="TypeError")return true;
    return error.name==="HttpRequestError"&&[408,425,429,500,502,503,504].includes(Number(error.status));
  }

  class CatalogMutationUncertainError extends Error{
    constructor(cause){
      super("Save result is still uncertain. Retry the same unchanged save to reconcile it; a new request ID will not be generated.",{cause});
      this.name="CatalogMutationUncertainError";
    }
  }

  async function sendWithOneRetry(send,requestBody){
    if(typeof send!=="function")throw new TypeError("A request sender is required.");
    try{
      return await send(requestBody);
    }catch(error){
      if(!isAmbiguousRequestFailure(error))throw error;
      try{
        return await send(requestBody);
      }catch(retryError){
        if(isAmbiguousRequestFailure(retryError))throw new CatalogMutationUncertainError(retryError);
        throw retryError;
      }
    }
  }

  async function requestText(url,options={},timeoutMs=12000,fetchImpl=fetch){
    if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw new RangeError("Request timeout must be a positive number of milliseconds.");
    const controller=new AbortController();
    let timedOut=false,abortListener=null;
    const timeoutError=()=>{const error=new Error("The request timed out. Check your connection and retry safely.");error.name="TimeoutError";return error;};
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    const aborted=new Promise((resolve,reject)=>{
      abortListener=()=>reject(timeoutError());
      controller.signal.addEventListener("abort",abortListener,{once:true});
    });
    try{
      const response=await Promise.race([fetchImpl(url,{...options,signal:controller.signal}),aborted]);
      const text=await Promise.race([Promise.resolve().then(()=>response.text()),aborted]);
      return {response,text};
    }catch(error){
      if(timedOut||controller.signal.aborted)throw timeoutError();
      throw error;
    }finally{
      clearTimeout(timer);
      if(abortListener)controller.signal.removeEventListener("abort",abortListener);
    }
  }

  async function requestResponse(url,options={},timeoutMs=12000,fetchImpl=fetch){
    const {response,text}=await requestText(url,options,timeoutMs,fetchImpl);
    const noBody=[204,205,304].includes(response.status);
    const headers=new Headers(response.headers);
    for(const name of ["content-length","content-encoding","transfer-encoding"])headers.delete(name);
    return new Response(noBody?null:text,{status:response.status,statusText:response.statusText,headers});
  }

  return Object.freeze({createUuid,createPendingMutationStore,createSingleFlight,isAmbiguousRequestFailure,sendWithOneRetry,CatalogMutationUncertainError,requestText,requestResponse});
});
