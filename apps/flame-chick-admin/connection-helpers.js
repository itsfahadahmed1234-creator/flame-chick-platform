/* Small, testable request primitives for the Flame Chick Admin browser. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.FlameChickAdminConnection=api;
})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

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
    return new Response(noBody?null:text,{status:response.status,statusText:response.statusText,headers:response.headers});
  }

  return Object.freeze({createSingleFlight,isAmbiguousRequestFailure,sendWithOneRetry,CatalogMutationUncertainError,requestText,requestResponse});
});
