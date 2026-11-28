/* Authenticated Admin catalog media client. Storage RLS is the authorization boundary. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.FlameChickAdminCatalogMedia=api;
})(typeof window!=="undefined"?window:typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const MAX_BYTES=5*1024*1024;
  const TYPES=Object.freeze({
    "image/jpeg":{extension:"jpg",signature:"jpeg"},
    "image/png":{extension:"png",signature:"png"},
    "image/webp":{extension:"webp",signature:"webp"}
  });
  const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CATALOG_KIND_RE=/^(products|categories|deals)$/;

  function fail(message,name="MediaStorageError",details={}){
    const error=new Error(message);
    error.name=name;
    Object.assign(error,details);
    return error;
  }
  function encodePath(path){
    return String(path).split("/").map(segment=>encodeURIComponent(segment)).join("/");
  }
  function isManagedPath(path){
    return typeof path==="string"&&/^(products|categories|deals)\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(jpg|jpeg|png|webp)$/i.test(path);
  }
  function isTarget(kind,id){
    return CATALOG_KIND_RE.test(String(kind||""))&&UUID_RE.test(String(id||""));
  }
  async function inspectImageFile(file){
    if(!file||typeof file!=="object"||!Number.isSafeInteger(file.size)||file.size<1)
      throw fail("Choose a non-empty image file.","MediaFileValidationError");
    const type=TYPES[file.type];
    if(!type)throw fail("Choose a JPG, PNG or WebP image.","MediaFileValidationError");
    if(file.size>MAX_BYTES)throw fail("Image must be 5 MB or smaller.","MediaFileValidationError");
    if(typeof file.slice!=="function")throw fail("This browser cannot verify the image file signature.","MediaFileValidationError");
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const jpeg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&
      bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a;
    const webp=bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&
      bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50;
    if((type.signature==="jpeg"&&!jpeg)||(type.signature==="png"&&!png)||(type.signature==="webp"&&!webp))
      throw fail("The file contents do not match the selected image type.","MediaFileValidationError");
    return {extension:type.extension,mimeType:file.type,size:file.size};
  }
  async function readJson(response){
    const raw=await response.text();
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch{}
    return {raw,data};
  }

  function createClient(options={}){
    const baseUrl=String(options.supabaseUrl||"").replace(/\/$/,"");
    const bucket=String(options.bucket||"");
    const apiKey=String(options.apiKey||"");
    const getAccessToken=options.getAccessToken;
    const refreshSession=options.refreshSession;
    const requestResponse=options.requestResponse;
    const createUuid=options.createUuid;
    const fetchImpl=options.fetchImpl||fetch;
    const timeoutMs=Number.isSafeInteger(options.timeoutMs)&&options.timeoutMs>0?options.timeoutMs:12000;
    if(!/^https:\/\//i.test(baseUrl)||!bucket||!apiKey||typeof getAccessToken!=="function"||
       typeof requestResponse!=="function"||typeof createUuid!=="function")
      throw new TypeError("Catalog media client configuration is incomplete.");

    async function send(url,requestOptions){
      async function once(){
        const token=await getAccessToken();
        if(typeof token!=="string"||!token)throw fail("Your signed-in session is unavailable. Sign in again.","MediaAuthError");
        return requestResponse(url,{
          ...requestOptions,
          headers:{apikey:apiKey,Authorization:"Bearer "+token,...(requestOptions.headers||{})},
          cache:"no-store"
        },timeoutMs,fetchImpl);
      }
      let response=await once();
      if(response.status===401){
        if(typeof refreshSession!=="function")throw fail("Your session expired. Sign in again.","MediaAuthError",{status:401});
        await refreshSession();
        response=await once();
      }
      return response;
    }
    async function info(path){
      const response=await send(baseUrl+"/storage/v1/object/info/"+encodeURIComponent(bucket)+"/"+encodePath(path),{method:"GET"});
      if(response.status===404)return null;
      const parsed=await readJson(response);
      if(!response.ok)throw fail(parsed.data.message||parsed.data.error||"Could not verify the uploaded image ("+response.status+").","MediaStorageError",{status:response.status});
      const row=parsed.data||{};
      const metadata=row.metadata&&typeof row.metadata==="object"?row.metadata:{};
      const size=Number(row.size??metadata.size??metadata.contentLength);
      const mimeType=String(row.mimetype??row.contentType??row.content_type??metadata.mimetype??"");
      if(!Number.isSafeInteger(size)||!mimeType)
        throw fail("Storage returned incomplete image metadata. The upload was not attached to the catalog.","MediaUploadUncertainError",{path,uncertain:true});
      return {size,mimeType};
    }
    async function remove(path){
      if(!isManagedPath(path))throw fail("Refusing to remove an unmanaged media path.","MediaPathValidationError");
      const response=await send(baseUrl+"/storage/v1/object/"+encodeURIComponent(bucket),{
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prefixes:[path]})
      });
      const parsed=await readJson(response);
      if(!response.ok)throw fail(parsed.data.message||parsed.data.error||"Uploaded image cleanup failed ("+response.status+").","MediaStorageError",{status:response.status,path});
      return true;
    }
    async function upload(kind,id,file){
      if(!isTarget(kind,id))throw fail("The selected catalog item has an invalid identity.","MediaPathValidationError");
      const inspected=await inspectImageFile(file);
      const fileId=createUuid();
      if(!UUID_RE.test(String(fileId||"")))throw fail("Secure image identifiers are unavailable.","MediaPathValidationError");
      const path=kind+"/"+id+"/"+fileId+"."+inspected.extension;
      const url=baseUrl+"/storage/v1/object/"+encodeURIComponent(bucket)+"/"+encodePath(path);
      let response=null,uploadFailure=null;
      try{
        response=await send(url,{
          method:"POST",
          headers:{
            "Content-Type":inspected.mimeType,
            "cache-control":"31536000",
            "x-upsert":"false"
          },
          body:file
        });
      }catch(error){uploadFailure=error;}
      if(response&&!response.ok){
        const parsed=await readJson(response);
        const status=Number(response.status);
        if(status<500&&![408,425,429].includes(status))
          throw fail(parsed.data.message||parsed.data.error||"Image upload was rejected ("+status+").","MediaStorageError",{status,path});
        uploadFailure=fail("The Storage upload response was uncertain ("+status+").","MediaUploadUncertainError",{status,path,uncertain:true});
      }
      let stored;
      try{stored=await info(path);}
      catch(error){
        throw fail("The image upload could not be verified. It was not attached to the catalog; keep this path for safe reconciliation: "+path,
          "MediaUploadUncertainError",{path,uncertain:true,cause:error});
      }
      if(!stored){
        if(uploadFailure)throw fail("The image upload did not complete; no catalog metadata was changed.","MediaStorageError",{path,cause:uploadFailure});
        throw fail("Storage accepted the upload but the file could not be found for verification. It was not attached; retain this path for reconciliation: "+path,
          "MediaUploadUncertainError",{path,uncertain:true});
      }
      if(stored.size!==inspected.size||stored.mimeType!==inspected.mimeType){
        let cleanupError=null;
        try{await remove(path);}catch(error){cleanupError=error;}
        throw fail("The uploaded object did not match the original file size and MIME type."+
          (cleanupError?" Cleanup failed; retain this orphan path: "+path:""),
          "MediaUploadValidationError",{path,cleanupError});
      }
      return {path,extension:inspected.extension,mimeType:inspected.mimeType,size:inspected.size};
    }
    function publicUrl(path){
      if(!isManagedPath(path))return null;
      return baseUrl+"/storage/v1/object/public/"+encodeURIComponent(bucket)+"/"+encodePath(path);
    }
    return Object.freeze({upload,remove,publicUrl,info});
  }

  return Object.freeze({MAX_BYTES,TYPES,isManagedPath,isTarget,inspectImageFile,createClient});
});
