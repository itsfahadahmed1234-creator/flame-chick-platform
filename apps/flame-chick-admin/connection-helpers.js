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
    const controller=new AbortController();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
    try{
      const response=await fetchImpl(url,{...options,signal:controller.signal});
      const text=await response.text();
      return {response,text};
    }catch(error){
      if(timedOut||controller.signal.aborted){
        const timeout=new Error("The request timed out. Check your connection and retry safely.");
        timeout.name="TimeoutError";
        throw timeout;
      }
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  return Object.freeze({createSingleFlight,isAmbiguousRequestFailure,sendWithOneRetry,CatalogMutationUncertainError,requestText});
});
