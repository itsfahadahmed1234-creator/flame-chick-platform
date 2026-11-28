// Flame Chick Staff Admin API — Batch 4.
import { getStaffInviteRedirect, isAllowedRequestOrigin, isSafeInviteRedirect, parseStaffAdminOrigins, staffCorsHeaders } from "./origin-policy.mjs";
import { buildCatalogRpcCall } from "./catalog-actions.mjs";
import { buildDashboardRpcCall } from "./dashboard-actions.mjs";
import { staffRpcErrorMessage } from "./invitation-error-messages.mjs";
const SUPABASE_URL=(Deno.env.get("SUPABASE_URL")??"").replace(/\/+$/,"");
function readKey(jsonName:string,fallback:string[]):string{
 try{const x=JSON.parse(Deno.env.get(jsonName)??"{}");const v=x?.default;if(typeof v==="string"&&v)return Deno.env.get(v)??v;}catch{}
 for(const n of fallback){const v=Deno.env.get(n);if(v)return v;}return "";
}
const PUBLIC_KEY=readKey("SUPABASE_PUBLISHABLE_KEYS",["SUPABASE_PUBLISHABLE_KEY","SUPABASE_ANON_KEY"]);
const SECRET_KEY=readKey("SUPABASE_SECRET_KEYS",["SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY"]);
let ORIGINS: Set<string> = new Set();
let ORIGIN_CONFIG_VALID = false;
try {
 ORIGINS = parseStaffAdminOrigins(Deno.env.get("FLAME_CHICK_STAFF_ADMIN_ALLOWED_ORIGINS") ?? "");
 ORIGIN_CONFIG_VALID = true;
} catch {
 // Fail closed without logging the environment value.
 ORIGINS = new Set();
}
type Obj=Record<string,unknown>;
class ApiError extends Error{constructor(public code:string,public status:number,message:string){super(message);}}
const obj=(x:unknown):x is Obj=>!!x&&typeof x==="object"&&!Array.isArray(x);
function response(body:Obj,status:number,origin:string|null):Response{
 const h=new Headers(staffCorsHeaders(origin,ORIGINS));
 return new Response(JSON.stringify(body),{status,headers:h});
}
function fail(e:unknown,origin:string|null):Response{
 if(e instanceof ApiError)return response({ok:false,error:{code:e.code,message:e.message}},e.status,origin);
 return response({ok:false,error:{code:"STAFF_API_ERROR",message:"The staff request could not be completed."}},500,origin);
}
function parse(s:string):unknown{try{return JSON.parse(s);}catch{return null;}}
async function body(r:Response):Promise<unknown>{const s=await r.text();return s?parse(s):null;}
function token(req:Request):string{const h=req.headers.get("authorization")??"";return h.startsWith("Bearer ")?h.slice(7).trim():"";}
// supabase/config.toml keeps verify_jwt=true for this function. The Edge Gateway
// validates the user JWT before the handler runs; the command RPC independently
// derives auth.uid() and checks the active Admin/Owner role. Do not make a second
// /auth/v1/user round trip here.
function rpcErr(x:unknown):ApiError{
 const v=obj(x)?x:{};const raw=String(v.message??v.details??"");const code=raw.split(":")[0].trim().match(/^[A-Z0-9_]{3,80}$/)?.[0]??"STAFF_COMMAND_FAILED";
 const status=/FORBIDDEN|DENIED|AUTH_REQUIRED/.test(code)?403:/NOT_FOUND/.test(code)?404:/INVALID|REQUIRED|PROTECTED|CONFLICT|EXPIRED|UNAVAILABLE|ALREADY/.test(code)?400:500;
 return new ApiError(code,status,staffRpcErrorMessage(code));
}
async function userRpc(t:string,action:string,payload:Obj={}):Promise<unknown>{
 const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/flame_chick_staff_admin_command",{method:"POST",headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({p_action:action,p_payload:payload}),cache:"no-store"});
 const x=await body(r);if(!r.ok)throw rpcErr(x);return x;
}
async function catalogRpc(t:string,call:{rpc:string;args:Obj}):Promise<unknown>{
 const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+call.rpc,{method:"POST",headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(call.args),cache:"no-store"});
 const x=await body(r);if(!r.ok)throw rpcErr(x);return x;
}
async function catalogAction(t:string,b:Obj):Promise<Obj>{
 let call:{rpc:string;args:Obj;kind:string};
 try{call=buildCatalogRpcCall(b);}catch(e){
  if(e instanceof Error&&e.name==="CatalogRequestError")throw new ApiError("CATALOG_REQUEST_INVALID",400,"The catalog request is invalid.");
  throw e;
 }
 return{ok:true,result:await catalogRpc(t,call)};
}
async function dashboardSummary(t:string,b:Obj):Promise<Obj>{
 let call:{rpc:string;args:Obj};
 try{call=buildDashboardRpcCall(b);}catch(e){
  if(e instanceof Error&&e.name==="DashboardRequestError")throw new ApiError("DASHBOARD_REQUEST_INVALID",400,"The dashboard request is invalid.");
  throw e;
 }
 const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+call.rpc,{method:"POST",headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(call.args),cache:"no-store"});
 const x=await body(r);if(!r.ok)throw rpcErr(x);
 return{ok:true,dashboard:x};
}
async function systemRpc(action:string,payload:Obj):Promise<unknown>{
 if(!SECRET_KEY)throw new ApiError("STAFF_ADMIN_NOT_CONFIGURED",503,"Staff invitations are not configured.");
 const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/flame_chick_staff_admin_system_command",{method:"POST",headers:{apikey:SECRET_KEY,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({p_action:action,p_payload:payload}),cache:"no-store"});
 const x=await body(r);if(!r.ok)throw rpcErr(x);return x;
}
function duplicate(status:number,x:unknown):boolean{if(![400,409,422].includes(status))return false;const v=obj(x)?x:{};const s=[v.code,v.error,v.msg,v.message,v.error_description].filter(y=>typeof y==="string").join(" ").toLowerCase();return /already.?registered|already.?exists|user.?exists|email.?exists/.test(s);}
async function sendInvite(email:string,name:string,phone:string|null,role:string):Promise<{kind:"sent";id:string}|{kind:"existing"}>{
 let redirect:string;
 try{redirect=getStaffInviteRedirect(role);}catch{throw new ApiError("STAFF_ROLE_INVALID",400,"Choose a supported staff invitation role.");}
 if(!SECRET_KEY||!isSafeInviteRedirect(redirect,ORIGINS))throw new ApiError("STAFF_INVITE_NOT_CONFIGURED",503,"The secure invitation destination is not configured.");
 const r=await fetch(SUPABASE_URL+"/auth/v1/invite?redirect_to="+encodeURIComponent(redirect),{method:"POST",headers:{apikey:SECRET_KEY,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({email,data:{display_name:name,...(phone?{phone}:{})}}),cache:"no-store"});
 const x=await body(r);if(!r.ok){if(duplicate(r.status,x))return{kind:"existing"};throw new ApiError("AUTH_INVITATION_FAILED",502,"Supabase Auth could not send the invitation. Retry from Staff Admin.");}
 const u=obj(x)&&obj(x.user)?x.user:x;if(!obj(u)||typeof u.id!=="string")throw new ApiError("AUTH_INVITATION_RESPONSE_INVALID",502,"The invitation response was incomplete. Check its status before retrying.");
 return{kind:"sent",id:u.id};
}
async function invite(t:string,b:Obj):Promise<Obj>{
 const email=String(b.email??"").trim().toLowerCase(),name=String(b.display_name??"").trim(),phone=b.phone==null||String(b.phone).trim()===""?null:String(b.phone).trim();
 const role=String(b.role_key??"").trim().toLowerCase(),requestId=String(b.request_id??"").trim(),reason=String(b.reason??"Staff invitation").trim(),branches=Array.isArray(b.branch_ids)?b.branch_ids:[];
 if(!requestId)throw new ApiError("STAFF_REQUEST_ID_REQUIRED",400,"A request ID is required for safe retries.");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new ApiError("STAFF_EMAIL_INVALID",400,"Enter a valid email address.");
 if(!name||name.length>120)throw new ApiError("STAFF_NAME_REQUIRED",400,"Enter the staff member's name.");
 if(phone&&(phone.length<7||phone.length>32))throw new ApiError("STAFF_PHONE_INVALID",400,"Enter a valid phone number or leave it blank.");
 if(!["admin","owner","manager","cashier","rider"].includes(role))throw new ApiError("STAFF_ROLE_INVALID",400,"Choose a supported staff role.");
 const begun=await userRpc(t,"begin_invitation",{email,display_name:name,phone,role_key:role,branch_ids:branches,request_id:requestId,reason});
 if(!obj(begun)||typeof begun.invitation_id!=="string")throw new ApiError("STAFF_INVITATION_CREATE_FAILED",500,"The invitation could not be prepared.");
 const id=begun.invitation_id,status=String(begun.status??"pending"),authId=typeof begun.auth_user_id==="string"?begun.auth_user_id:null;
 if(status==="sent"||status==="accepted")return{ok:true,invitation_id:id,status,idempotent:true};
 if(authId)return{ok:true,invitation_id:id,status:"sent",recovered:true,result:await systemRpc("complete_invitation",{invitation_id:id,auth_user_id:authId})};
 let sent:{kind:"sent";id:string}|{kind:"existing"};
 try{sent=await sendInvite(email,name,phone,role);}catch(e){try{await systemRpc("fail_invitation",{invitation_id:id,failure_code:"AUTH_PROVIDER_ERROR"});}catch{}throw e;}
 if(sent.kind==="existing")return{ok:true,invitation_id:id,status:"pending",existing_account:true,message:"This email already has an account. Its owner must sign in with the confirmed email and accept the invitation."};
 try{return{ok:true,invitation_id:id,status:"sent",result:await systemRpc("complete_invitation",{invitation_id:id,auth_user_id:sent.id})};}
 catch{try{await systemRpc("fail_invitation",{invitation_id:id,auth_user_id:sent.id,failure_code:"AUTH_FINALIZATION_FAILED"});}catch{}throw new ApiError("STAFF_INVITATION_FINALIZATION_PENDING",503,"The Auth invitation exists but needs database recovery. Use Retry Finalize before sending again.");}
}
async function post(req:Request,t:string):Promise<Obj>{
 const raw=await req.text();const rawBytes=new TextEncoder().encode(raw).byteLength;
 if(rawBytes>262144)throw new ApiError("REQUEST_TOO_LARGE",413,"The request is too large.");
 const b=parse(raw);if(!obj(b))throw new ApiError("INVALID_JSON",400,"A valid JSON object is required.");
 const a=String(b.action??"").trim().toLowerCase();
 if(a.startsWith("catalog_"))return await catalogAction(t,b);
 if(rawBytes>16000)throw new ApiError("REQUEST_TOO_LARGE",413,"The staff request is too large.");
 if(a==="dashboard_summary")return await dashboardSummary(t,b);
 if(a==="invite")return await invite(t,b);
 if(a==="accept_invitation")return{ok:true,result:await userRpc(t,a,{})};
 if(a==="retry_finalize"){
  const id=String(b.invitation_id??"");const pending=await userRpc(t,a,{invitation_id:id});
  if(!obj(pending)||typeof pending.auth_user_id!=="string"){if(obj(pending)&&pending.already_finalized===true)return{ok:true,result:pending};throw new ApiError("STAFF_FINALIZE_NOT_AVAILABLE",400,"This invitation is not ready for finalization.");}
  return{ok:true,result:await systemRpc("complete_invitation",{invitation_id:id,auth_user_id:pending.auth_user_id})};
 }
 if(["assign_role","deactivate_role","cancel_invitation"].includes(a)){const p:Obj={...b};delete p.action;return{ok:true,result:await userRpc(t,a,p)};}
 throw new ApiError("STAFF_ACTION_INVALID",400,"Choose a supported Staff Admin action.");
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");
 if(!isAllowedRequestOrigin(origin,ORIGINS))return response({ok:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"This application origin is not allowed."}},403,null);
 if(req.method==="OPTIONS"){if(!origin||!ORIGINS.has(origin))return response({ok:false,error:{code:"ORIGIN_NOT_ALLOWED",message:"This origin is not allowed."}},403,null);return response({ok:true},200,origin);}
 try{
  if(!ORIGIN_CONFIG_VALID)throw new ApiError("STAFF_ADMIN_ORIGIN_NOT_CONFIGURED",503,"Staff Admin origin settings are not configured safely.");
  if(!SUPABASE_URL||!PUBLIC_KEY)throw new ApiError("STAFF_ADMIN_NOT_CONFIGURED",503,"Staff Admin is not configured.");
  if(req.method!=="GET"&&req.method!=="POST")throw new ApiError("METHOD_NOT_ALLOWED",405,"Use GET or POST.");
  const t=token(req);if(!t)throw new ApiError("STAFF_AUTH_REQUIRED",401,"Sign in with your Flame Chick staff account.");
  if(req.method==="GET"){const x=await userRpc(t,"list",{});return response(obj(x)?x:{ok:true,result:x},200,origin);}
  return response(await post(req,t),200,origin);
 }catch(e){return fail(e,origin);}
});
