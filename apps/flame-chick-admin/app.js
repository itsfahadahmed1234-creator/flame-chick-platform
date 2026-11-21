(() => {
"use strict";
const C=window.FLAME_CHICK_CONFIG, $=id=>document.getElementById(id);
const S={session:null,user:null,role:null,restaurant:null,branch:null,orders:[],products:[],variants:[],categories:[],subcategories:[],deals:[],dealComponents:[],drinkOptions:[],areas:[],settings:[],staffMembers:[],staffAudit:[],staffBranches:[],range:"7",dashboardData:null,dashboardBusy:false,dashboardMonth:new Intl.DateTimeFormat("en-CA",{timeZone:C.timezone,year:"numeric",month:"2-digit"}).format(new Date()),rushRange:"today",rushMonth:new Intl.DateTimeFormat("en-CA",{timeZone:C.timezone,year:"numeric",month:"2-digit"}).format(new Date())};
const roles=["owner","admin"], labels={new:"New",accepted:"Accepted",preparing:"Preparing",ready:"Ready",out_for_delivery:"On delivery",delivered:"Delivered",collected:"Collected",served:"Served",completed:"Completed",rejected:"Rejected",cancelled:"Cancelled"};
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cash=n=>new Intl.NumberFormat("en-PK",{style:"currency",currency:"PKR",maximumFractionDigits:0}).format(Number(n)||0);
const parts=d=>{let p={};new Intl.DateTimeFormat("en-CA",{timeZone:C.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d).forEach(x=>p[x.type]=x.value);return p.year+"-"+p.month+"-"+p.day;};
const hour=d=>Number(new Intl.DateTimeFormat("en-GB",{timeZone:C.timezone,hour:"2-digit",hourCycle:"h23"}).format(d));
const time=d=>new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,hour:"2-digit",minute:"2-digit"}).format(d);
const ago=d=>{let m=Math.max(0,Math.floor((Date.now()-new Date(d).getTime())/60000));return m<60?m+"m ago":Math.floor(m/60)+"h "+m%60+"m ago";};
const toast=(msg,bad)=>{let e=document.createElement("div");e.className="toast"+(bad?" error":"");e.textContent=msg;$("toastRoot").appendChild(e);setTimeout(()=>e.remove(),3500);};
const readSession=()=>{try{return JSON.parse(sessionStorage.getItem(C.sessionStorageKey)||"null");}catch{return null;}};
const saveSession=s=>{S.session=s;sessionStorage.setItem(C.sessionStorageKey,JSON.stringify(s));};
const clearSession=()=>{S.session=null;sessionStorage.removeItem(C.sessionStorageKey);};
const headers=()=>({apikey:C.publishableKey,...(S.session&&S.session.access_token?{Authorization:"Bearer "+S.session.access_token}:{}),"Content-Type":"application/json"});
async function authPost(path,body){let r=await fetch(C.supabaseUrl+"/auth/v1/"+path,{method:"POST",headers:{apikey:C.publishableKey,"Content-Type":"application/json"},body:JSON.stringify(body)});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.msg||d.message||d.error_description||"Authentication failed.");return d;}
async function refresh(){if(!S.session||!S.session.refresh_token)throw Error("Session expired. Please sign in again.");let x=await authPost("token?grant_type=refresh_token",{refresh_token:S.session.refresh_token});saveSession(Object.assign({},x,{expires_at:Date.now()+Number(x.expires_in||3600)*1000}));}
async function getUser(){if(!S.session)S.session=readSession();if(!S.session||!S.session.access_token)throw Error("Please sign in.");if(S.session.expires_at&&Date.now()>Number(S.session.expires_at)-60000)await refresh();let r=await fetch(C.supabaseUrl+"/auth/v1/user",{headers:headers(),cache:"no-store"});if(r.status===401){await refresh();return getUser();}let u=await r.json().catch(()=>({}));if(!r.ok||!u.id)throw Error("Sign-in expired. Please sign in again.");S.user=u;return u;}
async function db(path,opt){if(S.session&&S.session.expires_at&&Date.now()>Number(S.session.expires_at)-60000)await refresh();let h=headers();if(opt&&opt.prefer)h.Prefer=opt.prefer;let r=await fetch(C.supabaseUrl+"/rest/v1/"+path,{method:opt&&opt.method||"GET",headers:h,body:opt&&opt.body?JSON.stringify(opt.body):undefined,cache:"no-store"});let raw=await r.text(),d=null;try{d=raw?JSON.parse(raw):null;}catch{d=raw;}if(!r.ok){if(r.status===401){clearSession();throw Error("Session expired. Sign in again.");}throw Error(d&&d.message||"Database request failed ("+r.status+").");}return d;}

function managedMediaPath(path){return /^(products|categories|deals)\/[0-9a-f-]{36}\/[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(String(path||""));}
function imageLeaf(path){const p=String(path||"");return p.split("/").pop()||"No image";}
function fileExtension(path){const m=String(path||"").toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:null;}
async function storageUpload(kind,id,file){
 if(!file||!file.size)return null;
 if(!["products","categories","deals"].includes(kind))throw Error("Unsupported image type.");
 const types={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
 if(!types[file.type])throw Error("Choose a JPG, PNG or WebP image.");
 if(file.size>5*1024*1024)throw Error("Image must be 5 MB or smaller.");
 const unique=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2));
 const path=kind+"/"+id+"/"+Date.now()+"-"+unique+"."+types[file.type];
 const url=C.supabaseUrl+"/storage/v1/object/"+C.mediaBucket+"/"+path.split("/").map(encodeURIComponent).join("/");
 const response=await fetch(url,{method:"POST",headers:{apikey:C.publishableKey,Authorization:"Bearer "+S.session.access_token,"Content-Type":file.type,"x-upsert":"false"},body:file});
 const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
 if(!response.ok)throw Error(data.message||data.error||"Image upload failed ("+response.status+").");
 return {path,ext:types[file.type]};
}
async function storageRemove(path){
 if(!managedMediaPath(path))return;
 const url=C.supabaseUrl+"/storage/v1/object/"+C.mediaBucket;
 const r=await fetch(url,{method:"DELETE",headers:{apikey:C.publishableKey,Authorization:"Bearer "+S.session.access_token,"Content-Type":"application/json"},body:JSON.stringify({prefixes:[path]})});
 if(!r.ok){const raw=await r.text();throw Error("Could not delete the old backup ("+r.status+"): "+raw.slice(0,180));}
}
function imageEditor(kind,id,record){
 const current=kind==="deals"?record.image_path:record.image_current_path,previous=record.image_previous_path;
 return '<section class="image-editor"><div class="dialog-section-title">IMAGE & ONE BACKUP</div>'+
  '<p class="image-path-note">Current: '+esc(current?imageLeaf(current):"No image uploaded")+'</p>'+
  '<p class="image-path-note">Backup: '+esc(previous?imageLeaf(previous):"No backup yet")+'</p>'+
  '<label>Upload new image<input type="file" name="image_file" accept="image/jpeg,image/png,image/webp"></label>'+
  '<p class="image-path-note">JPG, PNG or WebP · maximum 5 MB. Replacing an image keeps the latest backup and removes the older managed file.</p>'+
  (id&&previous?'<button type="button" class="btn btn-outline btn-small" id="rollbackImageButton">↶ Restore backup image</button>':'')+'</section>';
}
async function replaceImage(kind,id,file,record){
 const uploaded=await storageUpload(kind,id,file);if(!uploaded)return;
 const current=kind==="deals"?record.image_path:record.image_current_path,previous=record.image_previous_path;
 let table,body;
 if(kind==="products"){table="products";body={image_current_path:uploaded.path,image_previous_path:current||null,image_extension:uploaded.ext,image_previous_extension:current?(record.image_extension||fileExtension(current)||"jpg"):null,image_published:true};}
 else if(kind==="categories"){table="categories";body={image_current_path:uploaded.path,image_previous_path:current||null};}
 else{table="deals";body={image_path:uploaded.path,image_previous_path:current||null};}
 try{await db(table+"?id=eq."+id,{method:"PATCH",body,prefer:"return=minimal"});}
 catch(error){try{await storageRemove(uploaded.path);}catch(cleanError){console.error("Uploaded image cleanup failed",cleanError);}throw error;}
 if(previous&&previous!==current&&managedMediaPath(previous)){try{await storageRemove(previous);}catch(error){toast("Image saved; older backup cleanup needs attention: "+error.message,true);}}
}
async function rollbackImage(kind,id){
 const row=kind==="products"?S.products.find(x=>x.id===id):kind==="categories"?S.categories.find(x=>x.id===id):S.deals.find(x=>x.id===id);
 if(!row||!row.image_previous_path)throw Error("No backup image is available.");
 const current=kind==="deals"?row.image_path:row.image_current_path,previous=row.image_previous_path;
 let table,body;
 if(kind==="products"){table="products";body={image_current_path:previous,image_previous_path:current||null,image_extension:row.image_previous_extension||fileExtension(previous)||"jpg",image_previous_extension:current?(row.image_extension||fileExtension(current)||"jpg"):null,image_published:true};}
 else if(kind==="categories"){table="categories";body={image_current_path:previous,image_previous_path:current||null};}
 else{table="deals";body={image_path:previous,image_previous_path:current||null};}
 await db(table+"?id=eq."+id,{method:"PATCH",body,prefer:"return=minimal"});
 await loadAll();closeEditor();toast("Backup restored. The former current image is now the backup.");
}
function wireImageRollback(kind,id){
 const btn=$("rollbackImageButton");if(!btn||!id)return;
 btn.onclick=async()=>{btn.disabled=true;btn.textContent="Restoring…";try{await rollbackImage(kind,id);}catch(error){toast(error.message,true);btn.disabled=false;btn.textContent="↶ Restore backup image";}};
}

function showAuth(show){$("authView").hidden=!show;$("appView").hidden=show;}
async function logout(){try{if(S.session)await fetch(C.supabaseUrl+"/auth/v1/logout",{method:"POST",headers:headers()});}catch{}clearSession();showAuth(true);$("loginError").textContent="";}
function tenantGate(){
 document.querySelectorAll(".page").forEach(x=>x.hidden=true);
 let g=$("tenantGate");if(!g){g=document.createElement("section");g.id="tenantGate";g.className="page";g.innerHTML='<div class="tenant-gate surface"><div class="tenant-gate-icon">!</div><span class="eyebrow">TENANT SETUP REQUIRED</span><h2 id="tenantTitle"></h2><p id="tenantText"></p><button id="tenantLogout" class="btn btn-outline">Sign out</button></div>';$("appView").querySelector(".main-area").appendChild(g);$("tenantLogout").onclick=logout;}
 $("tenantTitle").textContent="Flame Chick is not yet provisioned in this database";
 $("tenantText").textContent="Your account is authenticated, but no active Flame Chick restaurant record was found in this demo database. The Admin panel has stopped before loading or changing records. Check the Flame Chick restaurant setup and assigned staff role, then sign in again.";
 g.hidden=false;$("pageTitle").textContent="Setup required";$("crumb").textContent="SETUP";
}
async function bootstrap(){
 const u=await getUser(),context=await staffApi("GET");
 if(!context||context.ok!==true||!["admin","owner"].includes(context.actor_role))throw Error("This account does not have active Flame Chick Admin or Owner access.");
 S.user=u;S.role=context.actor_role;S.restaurant=context.restaurant||null;
 S.staffBranches=Array.isArray(context.branches)?context.branches:[];
 S.staffMembers=Array.isArray(context.staff)?context.staff:[];
 S.staffInvitations=Array.isArray(context.invitations)?context.invitations:[];
 S.staffAudit=Array.isArray(context.audit)?context.audit:[];
 S.branch=S.staffBranches.find(x=>x.is_active)||null;
 $("userName").textContent=(S.staffMembers.find(m=>m.user_id===u.id)?.display_name)||u.email||"Signed-in user";
 $("userRole").textContent=staffRoleLabel(S.role);
 $("userAvatar").textContent=(u.email||"FC").slice(0,2).toUpperCase();
 $("profileBadge").textContent=(u.email||"FC").slice(0,2).toUpperCase();
 showAuth(false);
 document.querySelectorAll(".nav-item[data-page]").forEach(button=>{
  const allowed=button.dataset.page==="staff";
  button.disabled=!allowed;
  if(!allowed){button.title="This module will be enabled after its secure production API is completed.";button.setAttribute("aria-disabled","true");}
 });
 const old=$("tenantGate");if(old)old.remove();
 nav("staff");
}

async function loadAll(){
 let id=S.restaurant.id,b=S.branch.id;
 let out=await Promise.all([
 db("orders?branch_id=eq."+b+"&select=id,order_number,customer_name,fulfillment_type,status,total,paid_amount,balance_due,payment_status,created_at,placed_at,source&order=created_at.desc&limit=1000"),
 db("products?restaurant_id=eq."+id+"&select=id,legacy_id,category_id,subcategory_id,name_en,name_ur,description_en,image_current_path,image_previous_path,image_extension,image_previous_extension,image_published,featured,sort_order,is_active,is_available&order=sort_order.asc"),
 db("product_variants?select=id,product_id,legacy_id,size_key,size_label,price,sort_order,is_active,is_available&order=sort_order.asc"),
 db("categories?restaurant_id=eq."+id+"&select=id,legacy_id,name_en,name_ur,image_current_path,image_previous_path,sort_order,is_active&order=sort_order.asc"),
 db("subcategories?select=id,category_id,legacy_id,name_en,name_ur,sort_order,is_active&order=sort_order.asc"),
 db("deals?restaurant_id=eq."+id+"&select=id,legacy_id,category_id,title,title_ur,description_en,description_ur,bundle_price,featured,sort_order,is_active,is_available,image_path,image_previous_path,metadata&order=sort_order.asc"),
 db("deal_components?select=id,deal_id,legacy_id,component_type,ref_type,product_id,product_variant_id,pool_subcategory_id,size_key,sort_order,quantity,price_delta,display_name,volume_key,description_phrase,description_phrase_ur,metadata&order=sort_order.asc"),
 db("drink_options?restaurant_id=eq."+id+"&select=id,legacy_id,product_variant_id,display_name,display_name_ur,volume_key,volume_ml,is_active,sort_order&order=sort_order.asc"),
 db("delivery_areas?restaurant_id=eq."+id+"&branch_id=eq."+b+"&select=id,legacy_id,name,delivery_fee,sort_order,is_active&order=sort_order.asc"),
 db("restaurant_settings?restaurant_id=eq."+id+"&select=id,setting_key,value_json,is_public,description&order=setting_key.asc")
 ]);
 [S.orders,S.products,S.variants,S.categories,S.subcategories,S.deals,S.dealComponents,S.drinkOptions,S.areas,S.settings]=out;renderAll();
}
function renderAll(){renderOrders();renderProducts();renderCategories();renderDeals();renderAreas();renderSettings();loadDashboard().catch(()=>{});}

async function staffApi(method,query,body){
 if(!S.session||!S.session.access_token)throw Error("Your session has expired. Sign in again.");
 if(S.session.expires_at&&Date.now()>Number(S.session.expires_at)-60000)await refresh();
 const response=await fetch(C.supabaseUrl+"/functions/v1/flame-chick-staff-admin",{method,headers:{apikey:C.publishableKey,Authorization:"Bearer "+S.session.access_token,"Content-Type":"application/json"},body:method==="GET"?undefined:JSON.stringify(body||{}),cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){clearSession();showAuth(true);throw Error("Your session expired. Sign in again.");}
 if(!response.ok||data.ok===false)throw Error(data.error&&data.error.message||"Staff request failed ("+response.status+").");
 return data;
}
function staffRoleLabel(role){return ({owner:"Owner",admin:"Admin",manager:"Manager",cashier:"Cashier",rider:"Rider"})[role]||role;}
function staffRequestId(){return crypto.randomUUID?crypto.randomUUID():"b4-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);}
function selectedStaffBranches(){return Array.from($("staffBranch").selectedOptions).map(o=>o.value).filter(Boolean);}
function syncStaffBranchControl(){
 const global=["admin","owner"].includes($("staffRoleSelect").value);
 $("staffBranchField").hidden=global;$("staffBranch").required=!global;
 $("staffBranchHint").textContent=global?"Admin and Owner access applies across the restaurant.":"Select every active branch this person should access.";
}
function renderStaff(){
 const body=$("staffTable"),branches=new Map(S.staffBranches.map(b=>[b.id,b.name+(b.branch_code?" · "+b.branch_code:"")]));
 if(!body)return;
 body.innerHTML=S.staffMembers.length?S.staffMembers.map(m=>{
  const global=["admin","owner"].includes(m.role_key),self=m.user_id===S.user.id;
  const scope=global?"All branches":branches.get(m.branch_id)||"Branch unavailable";
  const actions=m.is_active&&!self?'<button class="action-link danger-link" data-staff-deactivate="'+esc(m.role_id)+'">Deactivate</button>'+(!global?'<button class="action-link" data-staff-scope="'+esc(m.role_id)+'">Add branch access</button>':""):self?'<span class="muted">Your own role</span>':'<span class="muted">Inactive</span>';
  return '<tr><td><div class="order-code">'+esc(m.display_name||"Team member")+'</div><div class="order-name">'+esc(m.email||"No email")+'</div>'+(m.phone?'<small class="subtle-line">'+esc(m.phone)+'</small>':"")+'</td><td><span class="role-pill role-'+esc(m.role_key)+'">'+esc(staffRoleLabel(m.role_key))+'</span></td><td>'+esc(scope)+'</td><td><span class="state-text '+(m.is_active?"good":"bad")+'">'+(m.is_active?"Active":"Inactive")+'</span><small class="subtle-line">'+(m.email_confirmed?"Email confirmed":"Email not confirmed")+(m.last_sign_in_at?" · Last sign-in "+esc(time(new Date(m.last_sign_in_at))):"")+'</small></td><td class="right staff-actions">'+actions+'</td></tr>';
 }).join(""):'<tr><td colspan="5" class="empty-cell">No staff roles are assigned yet.</td></tr>';
 body.querySelectorAll("[data-staff-deactivate]").forEach(button=>button.onclick=async()=>{
  const m=S.staffMembers.find(x=>x.role_id===button.dataset.staffDeactivate);if(!m)return;
  const reason=window.prompt("Reason for deactivating "+(m.display_name||m.email)+" as "+staffRoleLabel(m.role_key)+":");
  if(reason===null)return;if(!reason.trim()){toast("A reason is required.",true);return;}
  if(!window.confirm("Deactivate this role? The account and order history will be kept. This action cannot be reversed from the Admin panel."))return;
  button.disabled=true;
  try{await staffApi("POST",null,{action:"deactivate_role",role_id:m.role_id,reason:reason.trim(),request_id:staffRequestId()});toast("Role deactivated and audited.");await loadStaff();}
  catch(e){toast(e.message,true);button.disabled=false;}
 });
 body.querySelectorAll("[data-staff-scope]").forEach(button=>{button.onclick=()=>{const m=S.staffMembers.find(x=>x.role_id===button.dataset.staffScope);if(m)openStaffDialog(m,"scope");};});
 const inv=$("staffInvitations");
 if(inv){
  inv.innerHTML=S.staffInvitations.length?S.staffInvitations.map(i=>{
   const scope=["admin","owner"].includes(i.role_key)?"All branches":(i.branches||[]).map(b=>b.name).join(", ");
   const retry=i.status==="failed"&&i.auth_user_id?'<button class="action-link" data-invite-retry="'+esc(i.id)+'">Retry finalize</button>':"";
   const cancel=["pending","sent","failed"].includes(i.status)?'<button class="action-link danger-link" data-invite-cancel="'+esc(i.id)+'">Cancel</button>':"";
   return '<tr><td><div class="order-code">'+esc(i.display_name||i.email)+'</div><div class="order-name">'+esc(i.email)+'</div></td><td>'+esc(staffRoleLabel(i.role_key))+'</td><td>'+esc(scope||"—")+'</td><td>'+esc(i.status)+'<small class="subtle-line">Expires '+esc(new Date(i.expires_at).toLocaleDateString("en-PK"))+'</small></td><td class="right staff-actions">'+retry+cancel+'</td></tr>';
  }).join(""):'<tr><td colspan="5" class="empty-cell">No pending invitations.</td></tr>';
  inv.querySelectorAll("[data-invite-cancel]").forEach(button=>button.onclick=async()=>{if(!confirm("Cancel this invitation?"))return;button.disabled=true;try{await staffApi("POST",null,{action:"cancel_invitation",invitation_id:button.dataset.inviteCancel});toast("Invitation cancelled.");await loadStaff();}catch(e){toast(e.message,true);button.disabled=false;}});
  inv.querySelectorAll("[data-invite-retry]").forEach(button=>button.onclick=async()=>{button.disabled=true;try{await staffApi("POST",null,{action:"retry_finalize",invitation_id:button.dataset.inviteRetry});toast("Invitation finalization recovered.");await loadStaff();}catch(e){toast(e.message,true);button.disabled=false;}});
 }
 const audit=$("staffAudit");
 if(audit)audit.innerHTML=S.staffAudit.length?S.staffAudit.slice(0,40).map(a=>{
  const person=S.staffMembers.find(x=>x.user_id===a.target_user_id);
  return '<div class="staff-audit-row"><div><b>'+esc(a.action)+'</b><span>'+esc(person?.display_name||String(a.target_user_id||"Team member").slice(0,8))+' · '+esc(a.old_role_key?staffRoleLabel(a.old_role_key)+" → ":"")+esc(staffRoleLabel(a.new_role_key||""))+'</span>'+(a.reason?'<small>'+esc(a.reason)+'</small>':"")+'</div><small>'+esc(new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(a.occurred_at)))+'</small></div>';
 }).join(""):'<div class="empty-state">No staff activity recorded yet.</div>';
 $("staffPageNote").textContent="Admin and Owner can manage restaurant-wide staff access. Manager, Cashier and Rider roles are branch-scoped. Role changes and deactivations are audited; deactivation does not delete accounts or history.";
}
async function loadStaff(){
 const data=await staffApi("GET");
 S.staffMembers=Array.isArray(data.staff)?data.staff:[];
 S.staffInvitations=Array.isArray(data.invitations)?data.invitations:[];
 S.staffAudit=Array.isArray(data.audit)?data.audit:[];
 S.staffBranches=Array.isArray(data.branches)?data.branches:[];
 $("staffBranch").innerHTML=S.staffBranches.filter(b=>b.is_active).map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+(b.branch_code?" · "+esc(b.branch_code):"")+'</option>').join("");
 renderStaff();
}
function openStaffDialog(member,mode){
 const dlg=$("staffDialog"),form=$("staffForm");if(!dlg||!form)return;
 form.reset();const scope=mode==="scope";
 $("staffDialogTitle").textContent=scope?"Add branch access":"Invite team member";
 $("staffFullName").value=member?member.display_name||"":"";
 $("staffEmail").value=member?member.email||"":"";
 $("staffPhone").value=member?member.phone||"":"";
 $("staffRoleSelect").value=member?member.role_key:"cashier";
 $("staffRoleSelect").disabled=scope;$("staffEmail").readOnly=!!member;$("staffFullName").readOnly=!!member;$("staffPhone").readOnly=!!member;
 $("staffReason").value=scope?"Additional branch access":"Staff access requested";
 $("staffDialogSave").textContent=scope?"Add access":"Send invitation";$("staffFormError").textContent="";
 dlg.dataset.mode=scope?"scope":"invite";dlg.dataset.targetUserId=member?member.user_id:"";
 Array.from($("staffBranch").options).forEach(o=>o.selected=scope?false:o.value===(S.branch?.id||""));
 syncStaffBranchControl();if(scope){$("staffBranchField").hidden=false;$("staffBranch").required=true;}dlg.showModal();
}
async function saveStaffForm(e){
 e.preventDefault();const btn=$("staffDialogSave"),mode=$("staffDialog").dataset.mode;
 const display_name=$("staffFullName").value.trim(),email=$("staffEmail").value.trim().toLowerCase(),phone=$("staffPhone").value.trim(),role_key=$("staffRoleSelect").value;
 const branch_ids=["admin","owner"].includes(role_key)?[]:selectedStaffBranches(),reason=$("staffReason").value.trim();
 if(!reason){$("staffFormError").textContent="A reason is required.";return;}
 if(!["admin","owner"].includes(role_key)&&!branch_ids.length){$("staffFormError").textContent="Select at least one active branch.";return;}
 if(mode==="invite"&&(!display_name||!email)){$("staffFormError").textContent="Enter a name and valid email.";return;}
 btn.disabled=true;btn.textContent="Saving…";$("staffFormError").textContent="";
 try{
  const result=mode==="scope"?await staffApi("POST",null,{action:"assign_role",target_user_id:$("staffDialog").dataset.targetUserId,role_key,branch_ids,reason,request_id:staffRequestId()}):await staffApi("POST",null,{action:"invite",display_name,email,phone:phone||null,role_key,branch_ids,reason,request_id:staffRequestId()});
  $("staffDialog").close();toast(result.existing_account?"Invitation recorded. Ask the existing user to open the acceptance link on Admin sign-in and sign in with the exact confirmed email.":mode==="scope"?"Branch access added.":"Invitation request submitted.");await loadStaff();
 }catch(error){$("staffFormError").textContent=error.message;toast(error.message,true);}
 finally{btn.disabled=false;btn.textContent=$("staffDialog").dataset.mode==="scope"?"Add access":"Send invitation";}
}

function nav(p){document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.page===p));document.querySelectorAll(".page").forEach(x=>x.hidden=x.id!=="page-"+p);$("pageTitle").textContent=({dashboard:"Dashboard",orders:"Orders",menu:"Menu & products",categories:"Categories",deals:"Deals & offers",delivery:"Delivery areas",staff:"Staff & riders",media:"Website images",settings:"Website settings"})[p]||"Dashboard";$("crumb").textContent=p.toUpperCase();if(p==="staff")loadStaff().catch(e=>toast(e.message,true));if(p==="media")renderSiteMedia();if(p==="dashboard")loadDashboard().catch(()=>{});}
function renderDashboard(){
 let today=parts(new Date()),n=S.range==="today"?1:Number(S.range),start=parts(new Date(Date.now()-(n-1)*86400000));
 let os=S.orders.filter(o=>parts(new Date(o.created_at||o.placed_at))>=start),valid=os.filter(o=>!["cancelled","rejected"].includes(o.status));
 $("metricOrders").textContent=os.length;$("metricGross").textContent=cash(os.reduce((a,o)=>a+Number(o.total||0),0));$("metricValid").textContent=cash(valid.reduce((a,o)=>a+Number(o.total||0),0));$("metricPaid").textContent=cash(os.reduce((a,o)=>a+Math.max(0,Number(o.paid_amount||0)),0));
 $("greeting").textContent="Good "+(new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening");
 $("todayLabel").textContent=new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date())+" · "+(S.branch.name||"Main branch");
 let chart=[];
 if(S.range==="today"){
   chart=Array.from({length:12},(_,i)=>{let h=i+10,v=valid.filter(o=>parts(new Date(o.created_at||o.placed_at))===today&&Number(new Intl.DateTimeFormat("en-GB",{timeZone:C.timezone,hour:"2-digit",hourCycle:"h23"}).format(new Date(o.created_at||o.placed_at)))===h).reduce((a,o)=>a+Number(o.total||0),0);return{label:h+":00",value:v};});
 }else{chart=Array.from({length:n},(_,i)=>{let k=parts(new Date(Date.now()-(n-1-i)*86400000)),v=valid.filter(o=>parts(new Date(o.created_at||o.placed_at))===k).reduce((a,o)=>a+Number(o.total||0),0);return{label:new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,day:"numeric",month:"short"}).format(new Date(k+"T12:00:00+05:00")),value:v};});}
 let max=Math.max(1,...chart.map(x=>x.value));$("trendChart").innerHTML=chart.map(x=>'<div class="trend-col" title="'+esc(x.label)+' · '+cash(x.value)+'"><span class="trend-value">'+(x.value?cash(x.value):"")+'</span><div class="trend-bar-track"><div class="trend-bar" style="height:'+Math.max(2,x.value/max*100)+'%"></div></div><span class="trend-day">'+esc(x.label)+'</span></div>').join("");
 let counts={};os.forEach(o=>counts[o.status]=(counts[o.status]||0)+1);let order=["new","accepted","preparing","ready","out_for_delivery","delivered","collected","served","completed","rejected","cancelled"],mx=Math.max(1,...Object.values(counts));
 $("statusBreakdown").innerHTML=order.filter(k=>counts[k]).map(k=>'<div class="status-row"><span class="status-label">'+(labels[k]||k)+'</span><div class="status-track"><div class="status-fill" style="width:'+(counts[k]/mx*100)+'%"></div></div><span class="status-num">'+counts[k]+'</span></div>').join("")||'<div class="empty-state">No orders in this period.</div>';
 $("recentOrders").innerHTML=S.orders.slice(0,8).map(o=>'<tr><td><div class="order-code">'+esc(o.order_number||String(o.id).slice(0,8))+'</div><div class="order-name">'+esc(o.customer_name||"Customer")+'</div></td><td>'+esc(time(new Date(o.created_at||o.placed_at)))+'</td><td>'+esc(({delivery:"Delivery",pickup:"Takeaway",dine_in:"Dine-in"})[o.fulfillment_type]||o.fulfillment_type)+'</td><td><span class="status-chip '+esc(o.status)+'">'+esc(labels[o.status]||o.status)+'</span></td><td class="right"><b>'+cash(o.total)+'</b></td></tr>').join("")||'<tr><td colspan="5" class="empty-cell">No orders yet.</td></tr>';
 let wait=S.orders.filter(o=>["new","accepted","preparing","ready"].includes(o.status)).slice(0,6);$("watchCount").textContent=wait.length;
 $("watchList").innerHTML=wait.map(o=>'<div class="watch-item"><div class="watch-main"><b>'+esc(o.order_number||String(o.id).slice(0,8))+' · '+esc(o.customer_name||"Customer")+'</b><span>'+esc(labels[o.status]||o.status)+' · '+cash(o.total)+'</span></div><span class="watch-age">'+ago(o.created_at||o.placed_at)+'</span></div>').join("")||'<div class="empty-state">Nothing waiting right now.</div>';
}
function renderOrders(){
 let q=($("orderSearch").value||"").toLowerCase(),st=$("orderStatusFilter").value;
 let rows=S.orders.filter(o=>(!q||String(o.order_number||"").toLowerCase().includes(q)||String(o.customer_name||"").toLowerCase().includes(q))&&(!st||o.status===st));
 $("ordersTable").innerHTML=rows.map(o=>'<tr><td><div class="order-code">'+esc(o.order_number||String(o.id).slice(0,8))+'</div><div class="order-name">'+esc(o.customer_name||"Customer")+'</div></td><td>'+esc(new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(o.created_at||o.placed_at)))+'</td><td>'+esc(({delivery:"Delivery",pickup:"Takeaway",dine_in:"Dine-in"})[o.fulfillment_type]||o.fulfillment_type)+'</td><td>'+esc(o.source||"—")+'</td><td><span class="status-chip '+esc(o.status)+'">'+esc(labels[o.status]||o.status)+'</span></td><td>'+esc(o.payment_status||"unpaid")+'</td><td class="right"><b>'+cash(o.total)+'</b></td></tr>').join("")||'<tr><td colspan="7" class="empty-cell">No orders match this search.</td></tr>';
}
function vFor(id){return S.variants.filter(v=>v.product_id===id);}
function isDefaultPriceVariant(v){return /^regular$/i.test(String(v&&v.size_label||"").trim())||String(v&&v.size_key||"").trim().toUpperCase()==="REGULAR";}
function productPriceSummary(id){
 const active=vFor(id).filter(v=>v.is_active!==false);
 if(!active.length)return "No price";
 if(active.length===1&&isDefaultPriceVariant(active[0]))return cash(active[0].price);
 return active.map(v=>(String(v.size_label||"").trim()?esc(v.size_label)+" ":"")+cash(v.price)).join(" · ");
}
function catName(id){let c=S.categories.find(x=>x.id===id);return c?c.name_en:"Uncategorised";}
function dealGroupLabel(id){const c=S.categories.find(x=>x.id===id);return c&&c.legacy_id==="CAT-DEALS"?"Normal Deals":c?c.name_en:"Unknown deal type";}
function subcatName(id){const s=S.subcategories.find(x=>x.id===id);return s?s.name_en:"";}
function canDelete(){return S.role==="owner"||S.role==="admin";}
function activeArchive(table,id){return async()=>db(table+"?id=eq."+id,{method:"PATCH",body:{is_active:false},prefer:"return=minimal"});}
function dealCategories(){return S.categories.filter(c=>c.is_active&&(/deal/i.test(c.name_en)||["CAT-SD","CAT-1","CAT-DEALS"].includes(c.legacy_id)));}
function dealGroupOptions(selected){return dealCategories().map(c=>{const label=c.legacy_id==="CAT-DEALS"?"Normal Deals":c.name_en;return '<option value="'+c.id+'" '+(c.id===selected?"selected":"")+'>'+esc(label)+'</option>';}).join("");}
function subcategoryOptions(categoryId,selectedId){return S.subcategories.filter(s=>s.is_active&&(!categoryId||s.category_id===categoryId)).map(s=>'<option value="'+s.id+'" '+(s.id===selectedId?"selected":"")+'>'+esc(s.name_en)+'</option>').join("");}
async function namedDelete(kind,name,remove,archive){
 if(!canDelete())throw Error("Only an Owner or Admin can permanently delete catalog records.");
 if(!window.confirm("Permanently delete this "+kind+"? This cannot be undone."))return false;
 const entered=window.prompt("Type the exact "+kind+" name to confirm deletion:\n"+name);
 if(entered!==name){toast("Name did not match. Nothing was deleted.",true);return false;}
 try{await remove();toast(kind+" deleted.");await loadAll();return true;}
 catch(error){
  const message=String(error.message||error);
  if(archive&&(/foreign key|violates|23503|referenced|409|still contains|previous orders|used in a deal or previous order/i.test(message))){
   if(window.confirm("This "+kind+" is referenced by other records or history. Archive it instead, keeping previous orders intact?")){
    await archive();toast(kind+" archived; historical records were preserved.");await loadAll();return true;
   }
  }
  throw error;
 }
}
async function deleteProductSafely(p){
 const variants=vFor(p.id),variantIds=variants.map(v=>v.id);
 const checks=await Promise.all([
  db("order_items?product_id=eq."+p.id+"&select=id&limit=1"),
  db("deal_components?product_id=eq."+p.id+"&select=id&limit=1"),
  variantIds.length?db("deal_components?product_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1"):Promise.resolve([]),
  variantIds.length?db("order_items?product_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1"):Promise.resolve([]),
  variantIds.length?db("order_item_components?selected_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1"):Promise.resolve([])
 ]);
 if(checks.some(x=>Array.isArray(x)&&x.length))throw Error("This product is used in a deal or previous order. archive required because it is used in a deal or previous order.");
 await db("products?id=eq."+p.id,{method:"DELETE",prefer:"return=minimal"});
}
async function deleteVariantSafely(v){
 const [orders,deals,componentOrders]=await Promise.all([
  db("order_items?product_variant_id=eq."+v.id+"&select=id&limit=1"),
  db("deal_components?product_variant_id=eq."+v.id+"&select=id&limit=1"),
  db("order_item_components?selected_variant_id=eq."+v.id+"&select=id&limit=1")
 ]);
 if(orders.length||deals.length||componentOrders.length)throw Error("This variant is used in a deal or previous order; archive required to preserve its history.");
 await db("product_variants?id=eq."+v.id,{method:"DELETE",prefer:"return=minimal"});
}
async function archiveVariant(v){await db("product_variants?id=eq."+v.id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});}
async function archiveProduct(p){
 await db("products?id=eq."+p.id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});
 await db("product_variants?product_id=eq."+p.id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});
}
async function deleteCategorySafely(c){
 const [products,subs,deals]=await Promise.all([
  db("products?category_id=eq."+c.id+"&select=id&limit=1"),
  db("subcategories?category_id=eq."+c.id+"&select=id&limit=1"),
  db("deals?category_id=eq."+c.id+"&select=id&limit=1")
 ]);
 if(products.length||subs.length||deals.length)throw Error("This category still contains products, subcategories or deals. Archive it or move those records first.");
 await db("categories?id=eq."+c.id,{method:"DELETE",prefer:"return=minimal"});
}
async function deleteSubcategorySafely(s){
 const [products,components]=await Promise.all([
  db("products?subcategory_id=eq."+s.id+"&select=id&limit=1"),
  db("deal_components?pool_subcategory_id=eq."+s.id+"&select=id&limit=1")
 ]);
 if(components.length)throw Error("A deal uses this subcategory as a selectable pool. Edit that deal first; the subcategory has not been deleted.");
 if(products.length)await db("products?subcategory_id=eq."+s.id,{method:"PATCH",body:{subcategory_id:null},prefer:"return=minimal"});
 await db("subcategories?id=eq."+s.id,{method:"DELETE",prefer:"return=minimal"});
}
async function deleteDealSafely(d){
 const refs=await db("order_items?deal_id=eq."+d.id+"&select=id&limit=1");
 if(refs.length)throw Error("This deal appears in previous orders. It must be archived to preserve order history.");
 await db("deals?id=eq."+d.id,{method:"DELETE",prefer:"return=minimal"});
}
async function deleteAreaSafely(a){await db("delivery_areas?id=eq."+a.id,{method:"DELETE",prefer:"return=minimal"});}

function renderProducts(){
 let q=($("productSearch").value||"").toLowerCase(),cat=$("productCategoryFilter").value,st=$("productStateFilter").value;
 if($("productCategoryFilter").options.length!==S.categories.length+1)$("productCategoryFilter").innerHTML='<option value="">All categories</option>'+S.categories.map(c=>'<option value="'+c.id+'">'+esc(c.name_en)+'</option>').join("");
 let rows=S.products.filter(p=>(!q||[p.name_en,p.name_ur,p.legacy_id].some(x=>String(x||"").toLowerCase().includes(q)))&&(!cat||p.category_id===cat)&&(st==="all"||(st==="active"&&p.is_active)||(st==="hidden"&&!p.is_active)||(st==="unavailable"&&!p.is_available)));
 $("productsTable").innerHTML=rows.map(p=>'<tr><td><div class="product-name"><div class="product-thumb">✦</div><div><b>'+esc(p.name_en)+'</b><small>'+esc(p.legacy_id||"")+'</small></div></div></td><td>'+esc(catName(p.category_id))+(subcatName(p.subcategory_id)?'<small class="subtle-line"> / '+esc(subcatName(p.subcategory_id))+'</small>':'')+'</td><td class="variant-price">'+productPriceSummary(p.id)+'</td><td><span class="state-text '+(p.is_active&&p.is_available?"good":"bad")+'">'+(p.is_active?(p.is_available?"Visible":"Unavailable"):"Hidden")+'</span></td><td class="right"><button class="action-link" data-edit-product="'+p.id+'">Edit</button>'+(canDelete()?'<button class="action-link danger-link" data-delete-product="'+p.id+'">Delete</button>':'')+'</td></tr>').join("")||'<tr><td colspan="5" class="empty-cell">No matching products.</td></tr>';
 $("productsTable").querySelectorAll("[data-edit-product]").forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
 $("productsTable").querySelectorAll("[data-delete-product]").forEach(b=>b.onclick=()=>{const p=S.products.find(x=>x.id===b.dataset.deleteProduct);if(p)namedDelete("product",p.name_en,()=>deleteProductSafely(p),()=>archiveProduct(p)).catch(e=>toast(e.message,true));});
}

function renderCategories(){
 $("categoryGrid").innerHTML=S.categories.map(c=>'<article class="category-card"><h3>'+esc(c.name_en)+'</h3><p>'+esc(c.legacy_id||"")+' · Order '+c.sort_order+'</p><div class="category-meta"><span class="state-text '+(c.is_active?"good":"bad")+'">'+(c.is_active?"Visible on website":"Hidden")+'</span><button class="action-link" data-edit-category="'+c.id+'">Edit</button>'+(canDelete()?'<button class="action-link danger-link" data-delete-category="'+c.id+'">Delete</button>':'')+'</div></article>').join("")||'<div class="surface empty-state">No categories configured.</div>';
 $("categoryGrid").querySelectorAll("[data-edit-category]").forEach(b=>b.onclick=()=>editCategory(b.dataset.editCategory));
 $("categoryGrid").querySelectorAll("[data-delete-category]").forEach(b=>b.onclick=()=>{const c=S.categories.find(x=>x.id===b.dataset.deleteCategory);if(c)namedDelete("category",c.name_en,()=>deleteCategorySafely(c),()=>activeArchive("categories",c.id)).catch(e=>toast(e.message,true));});
 renderSubcategories();
}
function renderSubcategories(){
 const box=$("subcategoryGrid");if(!box)return;
 box.innerHTML=S.subcategories.map(s=>{const c=S.categories.find(x=>x.id===s.category_id);return '<article class="category-card"><h3>'+esc(s.name_en)+'</h3><p>'+esc(c?c.name_en:"Unknown category")+' · Order '+s.sort_order+'</p><div class="category-meta"><span class="state-text '+(s.is_active?"good":"bad")+'">'+(s.is_active?"Active":"Hidden")+'</span><button class="action-link" data-edit-subcategory="'+s.id+'">Edit</button>'+(canDelete()?'<button class="action-link danger-link" data-delete-subcategory="'+s.id+'">Delete</button>':'')+'</div></article>';}).join("")||'<div class="surface empty-state">No subcategories configured yet.</div>';
 box.querySelectorAll("[data-edit-subcategory]").forEach(b=>b.onclick=()=>editSubcategory(b.dataset.editSubcategory));
 box.querySelectorAll("[data-delete-subcategory]").forEach(b=>b.onclick=()=>{const s=S.subcategories.find(x=>x.id===b.dataset.deleteSubcategory);if(s)namedDelete("subcategory",s.name_en,()=>deleteSubcategorySafely(s),()=>activeArchive("subcategories",s.id)).catch(e=>toast(e.message,true));});
}

function renderDeals(){
 $("dealsList").innerHTML=S.deals.map(d=>'<div class="deal-row"><div class="deal-mark">✳</div><div class="deal-copy"><b>'+esc(d.title)+'</b><small>'+esc(d.legacy_id||"")+' · '+esc(dealGroupLabel(d.category_id))+' · '+(S.dealComponents.filter(x=>x.deal_id===d.id).length)+' components</small></div><div class="deal-price">'+cash(d.bundle_price)+'</div><span class="state-text '+(d.is_active&&d.is_available?"good":"bad")+'">'+(d.is_active?(d.is_available?"Available":"Paused"):"Hidden")+'</span><button class="action-link" data-edit-deal="'+d.id+'">Edit</button>'+(canDelete()?'<button class="action-link danger-link" data-delete-deal="'+d.id+'">Delete</button>':'')+'</div>').join("")||'<div class="surface empty-state">No deals configured.</div>';
 $("dealsList").querySelectorAll("[data-edit-deal]").forEach(b=>b.onclick=()=>editDeal(b.dataset.editDeal));
 $("dealsList").querySelectorAll("[data-delete-deal]").forEach(b=>b.onclick=()=>{const d=S.deals.find(x=>x.id===b.dataset.deleteDeal);if(d)namedDelete("deal",d.title,()=>deleteDealSafely(d),()=>db("deals?id=eq."+d.id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"})).catch(e=>toast(e.message,true));});
}

function renderDefaultDeliveryFee(){
 const input=$("defaultDeliveryFeeInput"),status=$("defaultDeliveryFeeStatus");
 if(!input)return;
 const row=setting("DefaultDeliveryFee"),value=row?row.value_json:null;
 input.value=value===null||value===undefined||value===""?"":String(value);
 if(status)status.textContent=input.value===""?"Not configured. Not Listed delivery orders will be blocked until a fee is saved.":"Current default fee for Not Listed: "+cash(Number(value));
}
async function saveDefaultDeliveryFee(){
 const input=$("defaultDeliveryFeeInput"),button=$("saveDefaultDeliveryFeeButton");
 if(!input)return;
 const raw=input.value.trim();
 let value=null;
 if(raw!==""){value=Number(raw);if(!Number.isFinite(value)||value<0)throw Error("Enter a valid non-negative default delivery fee, or leave it blank to keep it unset.");}
 if(button){button.disabled=true;button.textContent="Saving…";}
 try{
  const row=setting("DefaultDeliveryFee");
  const payload={value_json:value,is_public:true,description:"Default delivery fee used only when the customer selects Not Listed.",updated_by:S.user.id,updated_at:new Date().toISOString()};
  if(row){
   await db("restaurant_settings?id=eq."+row.id,{method:"PATCH",body:payload,prefer:"return=minimal"});
  }else{
   await db("restaurant_settings",{method:"POST",body:Object.assign({},payload,{restaurant_id:S.restaurant.id,branch_id:null,setting_key:"DefaultDeliveryFee"}),prefer:"return=minimal"});
  }
  await loadAll();
  toast(value===null?"Default fee left unset. Not Listed delivery remains unavailable.":"Default delivery fee saved.");
 }finally{if(button){button.disabled=false;button.textContent="Save default fee";}}
}

function renderAreas(){
 $("areasList").innerHTML=S.areas.map(a=>'<div class="area-row"><div class="deal-mark">⌁</div><div class="area-copy"><b>'+esc(a.name)+'</b><small>'+esc(a.legacy_id||"")+' · Order '+a.sort_order+'</small></div><div class="area-fee">'+cash(a.delivery_fee)+'</div><span class="state-text '+(a.is_active?"good":"bad")+'">'+(a.is_active?"Active":"Paused")+'</span><button class="action-link" data-edit-area="'+a.id+'">Edit</button>'+(canDelete()?'<button class="action-link danger-link" data-delete-area="'+a.id+'">Delete</button>':'')+'</div>').join("")||'<div class="surface empty-state">No delivery areas configured.</div>';
 $("areasList").querySelectorAll("[data-edit-area]").forEach(b=>b.onclick=()=>editArea(b.dataset.editArea));
 $("areasList").querySelectorAll("[data-delete-area]").forEach(b=>b.onclick=()=>{const a=S.areas.find(x=>x.id===b.dataset.deleteArea);if(a)namedDelete("delivery area",a.name,()=>deleteAreaSafely(a),()=>activeArchive("delivery_areas",a.id)).catch(e=>toast(e.message,true));});
 renderDefaultDeliveryFee();
}


function localDayShift(day,delta){const d=new Date(String(day)+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+Number(delta||0));return d.toISOString().slice(0,10);}
function localMonthShift(month,delta){const [y,m]=String(month).split("-").map(Number),d=new Date(Date.UTC(y,m-1+Number(delta||0),1));return d.toISOString().slice(0,7);}
function karachiMidnight(day){return new Date(String(day)+"T00:00:00+05:00").toISOString();}
function dateRangeFor(choice,monthChoice){
 const today=parts(new Date()),tomorrow=localDayShift(today,1);let start=today,end=tomorrow,ps=localDayShift(today,-1),pe=today,label="Today";
 if(["7","14","30"].includes(choice)){const days=Number(choice);start=localDayShift(today,-days+1);ps=localDayShift(start,-days);pe=start;label="Last "+days+" days";}
 else if(choice==="this_month"){start=today.slice(0,8)+"01";const p=localMonthShift(today.slice(0,7),-1);ps=p+"-01";pe=start;label="This month";}
 else if(choice==="previous_month"){const p=localMonthShift(today.slice(0,7),-1),pp=localMonthShift(today.slice(0,7),-2);start=p+"-01";end=today.slice(0,8)+"01";ps=pp+"-01";pe=start;label="Previous month";}
 else if(choice==="month"){const m=monthChoice||today.slice(0,7);start=m+"-01";end=localMonthShift(m,1)+"-01";ps=localMonthShift(m,-1)+"-01";pe=start;label=new Intl.DateTimeFormat("en-PK",{month:"long",year:"numeric",timeZone:C.timezone}).format(new Date(m+"-01T12:00:00+05:00"));if(m===today.slice(0,7))end=tomorrow;}
 else if(choice==="yesterday"){start=localDayShift(today,-1);end=today;ps=localDayShift(start,-1);pe=start;label="Yesterday";}
 return{start:karachiMidnight(start),end:karachiMidnight(end),previousStart:karachiMidnight(ps),previousEnd:karachiMidnight(pe),label};
}
function currentWeekRange(){const today=parts(new Date()),d=new Date(today+"T12:00:00Z"),dow=d.getUTCDay(),offset=dow===0?6:dow-1,start=localDayShift(today,-offset),end=localDayShift(start,7),prev=localDayShift(start,-7);return{start:karachiMidnight(start),end:karachiMidnight(end),previousStart:karachiMidnight(prev),previousEnd:karachiMidnight(start)};}
async function loadDashboard(){
 if(!S.branch||S.dashboardBusy)return;S.dashboardBusy=true;
 try{
  const today=parts(new Date()),period=dateRangeFor(S.range,S.dashboardMonth),week=currentWeekRange(),rush=dateRangeFor(S.rushRange,S.rushMonth);
  const body={p_branch_id:S.branch.id,p_today_start:karachiMidnight(today),p_today_end:karachiMidnight(localDayShift(today,1)),p_period_start:period.start,p_period_end:period.end,p_previous_period_start:period.previousStart,p_previous_period_end:period.previousEnd,p_week_start:week.start,p_week_end:week.end,p_previous_week_start:week.previousStart,p_previous_week_end:week.previousEnd,p_rush_start:rush.start,p_rush_end:rush.end};
  S.dashboardData=await db("rpc/hfp_admin_dashboard",{method:"POST",body});renderDashboard();
 }catch(e){if($("dashboardUpdated"))$("dashboardUpdated").textContent="Could not refresh";if(!S.dashboardData)toast("Dashboard: "+e.message,true);}
 finally{S.dashboardBusy=false;}
}
function percentChange(c,p){c=Number(c)||0;p=Number(p)||0;if(!p)return c?"+100%":"0%";const v=(c-p)/Math.abs(p)*100;return(v>0?"+":"")+v.toFixed(1)+"%";}
function fulfilmentLabel(v){return({delivery:"Delivery",pickup:"Takeaway",takeaway:"Takeaway",dine_in:"Dine-in","dine-in":"Dine-in"})[v]||String(v||"Other");}
function renderDashboard(){
 const d=S.dashboardData;if(!d)return;const t=d.today||{},p=d.period||{},pp=d.previous_period||{},w=d.week||{},pw=d.previous_week||{},set=(id,v)=>{const el=$(id);if(el)el.textContent=v;},num=(o,k)=>Number(o&&o[k])||0,fmt=new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,hour:"numeric",minute:"2-digit"});
 set("greeting","Today at "+(S.branch.name||"Flame Chick"));set("todayLabel",new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date())+" · "+(S.branch.name||"Main branch"));set("dashboardUpdated","Updated "+fmt.format(new Date(d.updated_at||Date.now())));
 const count=num(t,"orders");set("todayOrders",count);set("todayOrdersCaption",count+" orders today");set("todaySales",cash(t.sales));set("todayDelivery",num(t,"delivery"));set("todayDeliveryCaption",num(t,"delivery")+" of "+count+" orders");set("todayTakeaway",num(t,"takeaway"));set("todayTakeawayCaption",num(t,"takeaway")+" of "+count+" orders");set("todayDineIn",num(t,"dine_in"));set("todayDineInCaption",num(t,"dine_in")+" of "+count+" orders");
 set("statusCaption",count+" orders today");set("statusTotal",count+" ORDERS");
 const prep=num(t.status||{},"accepted")+num(t.status||{},"preparing"),sv={new:num(t.status||{},"new"),preparing:prep,ready:num(t.status||{},"ready"),out_for_delivery:num(t.status||{},"out_for_delivery"),completed:["delivered","collected","served","completed"].reduce((a,k)=>a+num(t.status||{},k),0),cancelled_rejected:num(t.status||{},"cancelled")+num(t.status||{},"rejected")},mx=Math.max(1,...Object.values(sv));
 const rows=[["new","Pending","Waiting to be accepted"],["preparing","Preparing","Being prepared in the kitchen"],["ready","Ready","Waiting for collection or dispatch"],["out_for_delivery","Out for Delivery","Dispatched to customer"],["completed","Completed","Delivered, collected or served"],["cancelled_rejected","Cancelled / rejected","Not included in order value"]];
 $("statusBreakdown").innerHTML=rows.map(([k,l,desc])=>'<div class="dashboard-status-row"><div class="dashboard-status-copy"><b>'+l+'</b><small>'+desc+'</small></div><div class="status-track"><div class="status-fill" style="width:'+(sv[k]/mx*100)+'%"></div></div><strong>'+sv[k]+'</strong></div>').join("");
 const mix=[["Delivery",num(t,"delivery")],["Takeaway",num(t,"takeaway")],["Dine-in",num(t,"dine_in")]];
 $("todayMix").innerHTML=mix.map(([l,v])=>'<div class="mix-row"><div><b>'+l+'</b><span>'+v+'</span></div><div class="mix-track"><i style="width:'+(count?v/count*100:0)+'%"></i></div><small>'+(count?Math.round(v/count*100):0)+'%</small></div>').join("");
 const range=dateRangeFor(S.range,S.dashboardMonth);set("salesRangeCaption",range.label);set("periodSales",cash(p.sales));set("periodOrders",num(p,"orders"));const days=p.daily||[];set("periodAverage",cash(days.length?days.reduce((a,x)=>a+num(x,"sales"),0)/days.length:0));
 const best=days.reduce((a,x)=>num(x,"sales")>num(a||{},"sales")?x:a,null);set("periodBestDay",best&&num(best,"sales")?new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,weekday:"short"}).format(new Date(best.day+"T12:00:00+05:00"))+" · "+cash(best.sales):"—");
 const pct=percentChange(p.sales,pp.sales);set("periodComparison",pct+" vs previous period");$("periodComparison").className="period-change "+(pct.startsWith("-")?"negative":"positive");
 const max=Math.max(1,...days.map(x=>num(x,"sales")));$("trendChart").innerHTML=days.map(x=>{const dt=new Date(x.day+"T12:00:00+05:00"),lab=new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,day:"numeric",month:days.length>14?"numeric":"short"}).format(dt);return'<div class="trend-col" title="'+esc(lab+" · "+cash(x.sales)+" · "+x.orders+" orders")+'"><span class="trend-value">'+(num(x,"sales")?cash(x.sales):"")+'</span><div class="trend-bar-track"><div class="trend-bar" style="height:'+Math.max(2,num(x,"sales")/max*100)+'%"></div></div><span class="trend-day">'+esc(lab)+'</span></div>';}).join("")||'<div class="empty-state">No orders in this period.</div>';
 const wk=new Date(w.start||Date.now()),we=new Date(new Date(w.end||Date.now()).getTime()-86400000);set("weekCaption",new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,day:"numeric",month:"short"}).format(wk)+" – "+new Intl.DateTimeFormat("en-PK",{timeZone:C.timezone,day:"numeric",month:"short"}).format(we));set("weekOrders",num(w,"orders"));set("weekSales",cash(w.sales));set("weekAov",cash(w.average_order_value));set("weekDelivery",num(w,"delivery"));set("weekDeliveryCaption",num(w,"delivery")+" of "+num(w,"orders"));set("weekTakeaway",num(w,"takeaway"));set("weekTakeawayCaption",num(w,"takeaway")+" of "+num(w,"orders"));set("weekDineIn",num(w,"dine_in"));set("weekDineInCaption",num(w,"dine_in")+" of "+num(w,"orders"));
 const comps=[["Sales",w.sales,pw.sales,true],["Orders",w.orders,pw.orders,false],["Avg order value",w.average_order_value,pw.average_order_value,true]];$("weekComparison").innerHTML=comps.map(([l,c,pr,m])=>'<div class="comparison-row"><span>'+l+'</span><b>'+(m?cash(c):Number(c)||0)+'</b><span class="comparison-versus">vs '+(m?cash(pr):Number(pr)||0)+'</span><strong class="'+(percentChange(c,pr).startsWith("-")?"negative":"positive")+'">'+percentChange(c,pr)+'</strong></div>').join("");
 const recent=d.recent_orders||[];$("recentOrders").innerHTML=recent.map(o=>'<tr><td><div class="order-code">'+esc(o.order_number)+'</div></td><td><div class="order-name">'+esc(o.customer_name||"Customer")+'</div></td><td>'+esc(fulfilmentLabel(o.fulfillment_type))+'</td><td><b>'+cash(o.total)+'</b></td><td><span class="status-chip '+esc(o.status)+'">'+esc(labels[o.status]||o.status)+'</span></td><td>'+esc(time(new Date(o.placed_at)))+'</td></tr>').join("")||'<tr><td colspan="6" class="empty-cell">No orders placed yet.</td></tr>';
 const latest=recent[0];$("latestOrder").innerHTML=latest?'<div class="latest-order-copy"><small>JUST PLACED</small><b>'+esc(latest.order_number)+' · '+esc(latest.customer_name||"Customer")+'</b><span>'+esc(fulfilmentLabel(latest.fulfillment_type))+' · '+esc(time(new Date(latest.placed_at)))+' ('+esc(ago(latest.placed_at))+')</span></div><div class="latest-order-side"><b>'+cash(latest.total)+'</b><span class="status-chip '+esc(latest.status)+'">'+esc(labels[latest.status]||latest.status)+'</span></div>':'<div class="empty-state">No orders yet.</div>';
 const att=d.attention_orders||[];set("watchCount",att.length);set("attentionCount",att.length);$("watchList").innerHTML=att.map(o=>'<div class="watch-item"><div class="watch-main"><b>'+esc(o.order_number)+' · '+esc(o.customer_name||"Customer")+'</b><span>'+esc(fulfilmentLabel(o.fulfillment_type))+' · '+esc(labels[o.status]||o.status)+'</span></div><span class="watch-age">'+num(o,"age_minutes")+'m</span></div>').join("")||'<div class="empty-state">No delayed orders need attention.</div>';
 renderRushHours();
}
function renderRushHours(){
 const rows=S.dashboardData&&S.dashboardData.rush_hours||[];
 const hourLabel=h=>String(h%12||12)+(h<12?" AM":" PM");
 const max=Math.max(1,...rows.map(x=>Number(x.orders)||0));
 const sorted=rows.slice().sort((a,b)=>Number(b.orders)-Number(a.orders));
 let bestWindow={orders:0,start:11,end:16};
 for(let i=0;i<=rows.length-5;i++){
   const sum=rows.slice(i,i+5).reduce((s,x)=>s+Number(x.orders||0),0);
   if(sum>bestWindow.orders)bestWindow={orders:sum,start:Number(rows[i].hour),end:Number(rows[i+4].hour)+1};
 }
 const total=rows.reduce((s,x)=>s+Number(x.orders||0),0);
 const sales=rows.reduce((s,x)=>s+Number(x.sales||0),0);
 const busy=sorted[0],second=sorted[1];
 const captions={today:"Today",yesterday:"Yesterday","7":"Last 7 days",this_month:"This month",previous_month:"Previous month",month:S.rushMonth};
 $("rushCaption").textContent="Orders by hour · 11 AM → 12 AM · "+(captions[S.rushRange]||"Today");
 $("rushSummary").innerHTML=`
   <div><small>BUSIEST HOUR</small><b>${busy&&Number(busy.orders)?hourLabel(Number(busy.hour)):"—"}</b><span>${busy?Number(busy.orders)+" orders":"No orders yet"}</span></div>
   <div><small>SECOND BUSIEST</small><b>${second&&Number(second.orders)?hourLabel(Number(second.hour)):"—"}</b><span>${second?Number(second.orders)+" orders":"—"}</span></div>
   <div><small>TOP 5-HOUR WINDOW</small><b>${hourLabel(bestWindow.start)} – ${hourLabel(bestWindow.end%24)}</b><span>${bestWindow.orders} orders</span></div>
   <div><small>PERIOD TOTAL</small><b>${total} orders</b><span>${cash(sales)} order value</span></div>`;
 $("rushChart").innerHTML=rows.map(x=>'<div class="rush-bar-col" title="'+esc(hourLabel(Number(x.hour))+" · "+x.orders+" orders · "+cash(x.sales))+'"><span>'+Number(x.orders||0)+'</span><div class="rush-bar-track"><i style="height:'+Math.max(2,Number(x.orders||0)/max*100)+'%"></i></div><small>'+esc(hourLabel(Number(x.hour)))+'</small></div>').join("");
 $("rushFoot").textContent=total?total+" orders in selected period · hover a bar for order value.":"No orders in the selected hourly period.";
}


const SITE_IMAGE_SLOTS=[{key:"landing-hero",title:"Landing hero image",desc:"Large background image at the top of the homepage.",ratio:"16 / 9"},{key:"landing-gate",title:"Fulfilment gate image",desc:"Image behind Delivery / Takeaway choice.",ratio:"16 / 9"},{key:"about-main",title:"About — main image",desc:"Main image in the About section.",ratio:"4 / 3"},{key:"about-side",title:"About — secondary image",desc:"Supporting image alongside About.",ratio:"4 / 3"},{key:"menu-hero",title:"Menu hero fallback",desc:"Background when the rotating menu slider is empty.",ratio:"16 / 9"}];
function siteMediaUrl(path){return C.supabaseUrl+"/storage/v1/object/public/"+C.mediaBucket+"/"+String(path||"").split("/").map(encodeURIComponent).join("/");}
function isManagedSitePath(path){return /^(site|menu-slides)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(String(path||""));}
async function siteStorageUpload(folder,file,slot){if(!file||!file.size)throw Error("Choose an image first.");if(S.session&&S.session.expires_at&&Date.now()>Number(S.session.expires_at)-60000)await refresh();const types={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};if(!types[file.type])throw Error("Choose JPG, PNG or WebP.");if(file.size>5*1024*1024)throw Error("Image must be 5 MB or smaller.");const unique=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2),safe=String(slot||"image").replace(/[^A-Za-z0-9_-]/g,"-"),path=folder+"/"+safe+"/"+Date.now()+"-"+unique+"."+types[file.type],url=C.supabaseUrl+"/storage/v1/object/"+C.mediaBucket+"/"+path.split("/").map(encodeURIComponent).join("/");const r=await fetch(url,{method:"POST",headers:{apikey:C.publishableKey,Authorization:"Bearer "+S.session.access_token,"Content-Type":file.type,"x-upsert":"false"},body:file});const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}if(!r.ok)throw Error(data.message||data.error||"Image upload failed ("+r.status+").");return{path,url:siteMediaUrl(path),ext:types[file.type]};}
async function siteStorageRemove(path){if(!isManagedSitePath(path))return;const r=await fetch(C.supabaseUrl+"/storage/v1/object/"+C.mediaBucket,{method:"DELETE",headers:{apikey:C.publishableKey,Authorization:"Bearer "+S.session.access_token,"Content-Type":"application/json"},body:JSON.stringify({prefixes:[path]})});if(!r.ok)throw Error("Could not remove old site image ("+r.status+").");}
async function saveSettingObject(key,value){const row=setting(key);if(!row)throw Error("The "+key+" setting row is missing.");await db("restaurant_settings?id=eq."+row.id,{method:"PATCH",body:{value_json:value,updated_by:S.user.id,updated_at:new Date().toISOString()},prefer:"return=minimal"});row.value_json=value;}
function renderSiteMedia(){const box=$("siteMediaGrid"),slider=$("sliderManager");if(!box||!slider)return;const row=setting("site_images"),images=row&&row.value_json||{};box.innerHTML=SITE_IMAGE_SLOTS.map(slot=>{const e=images[slot.key]||{},c=e.current||{},b=e.previous||{},src=c.url||c.path||"";return'<article class="site-media-card"><div class="site-media-preview" style="aspect-ratio:'+slot.ratio+'">'+(src?'<img src="'+esc(src)+'" alt="'+esc(slot.title)+'" loading="lazy">':'<div class="site-media-empty">No image uploaded</div>')+'</div><div class="site-media-copy"><b>'+esc(slot.title)+'</b><p>'+esc(slot.desc)+'</p><small>Current: '+esc(c.path?imageLeaf(c.path):"Website fallback")+'</small><small>Backup: '+esc(b.path?imageLeaf(b.path):"No backup yet")+'</small></div><div class="site-media-actions"><label class="btn btn-outline btn-small">'+(src?"Replace image":"Upload image")+'<input type="file" accept="image/jpeg,image/png,image/webp" data-site-upload="'+slot.key+'" hidden></label>'+(b.url||b.path?'<button class="btn btn-outline btn-small" data-site-restore="'+slot.key+'" type="button">Restore backup</button>':"")+(src?'<button class="action-link danger-link" data-site-clear="'+slot.key+'" type="button">Use website fallback</button>':"")+'</div></article>';}).join("");wireSiteMedia(box);
 const srow=setting("menu_hero_banners"),slides=srow&&srow.value_json&&Array.isArray(srow.value_json.slides)?srow.value_json.slides:[];slider.innerHTML=slides.length?slides.map((s,i)=>{const src=s.url||s.path||"";return'<article class="slider-media-row"><span class="slider-order">'+(i+1)+'</span><div class="slider-thumb">'+(src?'<img src="'+esc(src)+'" alt="'+esc(s.alt||"Slider banner")+'" loading="lazy">':'No image')+'</div><div class="slider-row-copy"><b>'+esc(s.alt||("Slider image "+(i+1)))+'</b><small>'+esc(s.enabled===false?"Hidden from website":"Published on website")+'</small><small>'+esc(s.path?imageLeaf(s.path):"Legacy image URL")+'</small></div><div class="slider-row-actions"><label class="btn btn-outline btn-small">Replace<input type="file" accept="image/jpeg,image/png,image/webp" data-slide-replace="'+esc(s.id)+'" hidden></label><button class="btn btn-outline btn-small" data-slide-toggle="'+esc(s.id)+'">'+(s.enabled===false?"Enable":"Disable")+'</button><button class="btn btn-outline btn-small" data-slide-up="'+esc(s.id)+'" '+(i===0?"disabled":"")+' aria-label="Move up">↑</button><button class="btn btn-outline btn-small" data-slide-down="'+esc(s.id)+'" '+(i===slides.length-1?"disabled":"")+' aria-label="Move down">↓</button>'+(s.previous&&s.previous.url?'<button class="btn btn-outline btn-small" data-slide-restore="'+esc(s.id)+'" type="button">Restore backup</button>':"")+'<button class="action-link danger-link" data-slide-remove="'+esc(s.id)+'">Remove</button></div></article>';}).join(""):'<div class="empty-state">No slider images are configured. The website will use its menu hero fallback image.</div>';wireSliderManager(slider);}
async function replaceSiteImage(key,file){const row=setting("site_images"),images=Object.assign({},row&&row.value_json||{}),entry=Object.assign({},images[key]||{}),uploaded=await siteStorageUpload("site",file,key),old=entry.current||null,older=entry.previous||null;images[key]={current:uploaded,previous:old};try{await saveSettingObject("site_images",images);}catch(e){try{await siteStorageRemove(uploaded.path);}catch{}throw e;}if(older&&older.path&&older.path!==old?.path)try{await siteStorageRemove(older.path);}catch(e){toast("Image saved; old backup cleanup needs attention.",true);}renderSiteMedia();toast("Website image updated. Refresh the public website to see it.");}
async function restoreSiteImage(key){const row=setting("site_images"),images=Object.assign({},row&&row.value_json||{}),e=images[key]||{};if(!e.previous)throw Error("No backup image is available.");images[key]={current:e.previous,previous:e.current||null};await saveSettingObject("site_images",images);renderSiteMedia();toast("Backup restored.");}
async function clearSiteImage(key){if(!window.confirm("Use the website built-in fallback? The current image will remain as backup."))return;const row=setting("site_images"),images=Object.assign({},row&&row.value_json||{}),e=images[key]||{};if(!e.current)return;images[key]={previous:e.current};await saveSettingObject("site_images",images);renderSiteMedia();toast("Website fallback enabled.");}
function wireSiteMedia(box){box.querySelectorAll("[data-site-upload]").forEach(input=>input.onchange=async()=>{const file=input.files&&input.files[0];if(!file)return;input.disabled=true;try{await replaceSiteImage(input.dataset.siteUpload,file);}catch(e){toast(e.message,true);}finally{input.disabled=false;input.value="";}});box.querySelectorAll("[data-site-restore]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await restoreSiteImage(b.dataset.siteRestore);}catch(e){toast(e.message,true);}finally{b.disabled=false;}});box.querySelectorAll("[data-site-clear]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await clearSiteImage(b.dataset.siteClear);}catch(e){toast(e.message,true);}finally{b.disabled=false;}});}
function currentSlides(){const row=setting("menu_hero_banners"),v=row&&row.value_json||{};return Array.isArray(v.slides)?v.slides.slice():[];}
async function saveSlides(slides){const row=setting("menu_hero_banners"),value=Object.assign({},row&&row.value_json||{},{slides});await saveSettingObject("menu_hero_banners",value);}
async function uploadNewSliderSlide(file){const slides=currentSlides();if(slides.length>=10)throw Error("The slider supports up to 10 images.");const up=await siteStorageUpload("menu-slides",file,"banner");slides.push({id:"PB-"+(crypto.randomUUID?crypto.randomUUID():Date.now()),ext:up.ext,url:up.url,path:up.path,kind:"custom",enabled:true,alt:"Flame Chick promotion"});await saveSlides(slides);renderSiteMedia();toast("Slider image added.");}
async function replaceSliderSlide(id,file){const slides=currentSlides(),i=slides.findIndex(s=>String(s.id)===String(id));if(i<0)throw Error("Slider image not found.");const up=await siteStorageUpload("menu-slides",file,"banner-"+String(id).replace(/[^A-Za-z0-9_-]/g,"-")),old=slides[i];slides[i]=Object.assign({},old,{previous:old.path?{path:old.path,url:old.url,ext:old.ext}:old.previous||null,path:up.path,url:up.url,ext:up.ext,kind:"custom"});await saveSlides(slides);if(old.previous&&old.previous.path)try{await siteStorageRemove(old.previous.path);}catch(e){toast("Old slider backup cleanup needs attention.",true);}renderSiteMedia();toast("Slider image replaced.");}
async function restoreSliderSlide(id){const slides=currentSlides(),i=slides.findIndex(s=>String(s.id)===String(id));if(i<0||!slides[i].previous||!slides[i].previous.url)throw Error("No slider backup is available.");const current=slides[i],backup=current.previous;slides[i]=Object.assign({},current,{path:backup.path,url:backup.url,ext:backup.ext,previous:current.path?{path:current.path,url:current.url,ext:current.ext}:null});await saveSlides(slides);renderSiteMedia();toast("Slider backup restored.");}
function wireSliderManager(box){box.querySelectorAll("[data-slide-restore]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{await restoreSliderSlide(b.dataset.slideRestore);}catch(e){toast(e.message,true);}finally{b.disabled=false;}});box.querySelectorAll("[data-slide-replace]").forEach(input=>input.onchange=async()=>{const file=input.files&&input.files[0];if(!file)return;input.disabled=true;try{await replaceSliderSlide(input.dataset.slideReplace,file);}catch(e){toast(e.message,true);}finally{input.disabled=false;input.value="";}});box.querySelectorAll("[data-slide-toggle]").forEach(b=>b.onclick=async()=>{const slides=currentSlides(),s=slides.find(x=>String(x.id)===String(b.dataset.slideToggle));if(!s)return;s.enabled=s.enabled===false;try{await saveSlides(slides);renderSiteMedia();}catch(e){toast(e.message,true);}});box.querySelectorAll("[data-slide-up],[data-slide-down]").forEach(b=>b.onclick=async()=>{const slides=currentSlides(),i=slides.findIndex(x=>String(x.id)===String(b.dataset.slideUp||b.dataset.slideDown)),j=i+(b.hasAttribute("data-slide-up")?-1:1);if(i<0||j<0||j>=slides.length)return;[slides[i],slides[j]]=[slides[j],slides[i]];try{await saveSlides(slides);renderSiteMedia();}catch(e){toast(e.message,true);}});box.querySelectorAll("[data-slide-remove]").forEach(b=>b.onclick=async()=>{if(!window.confirm("Remove this slider image?"))return;const slides=currentSlides(),i=slides.findIndex(x=>String(x.id)===String(b.dataset.slideRemove));if(i<0)return;const removed=slides.splice(i,1)[0];try{await saveSlides(slides);if(removed.path)try{await siteStorageRemove(removed.path);}catch(e){toast("Slider removed; current image cleanup failed.",true);}if(removed.previous&&removed.previous.path)try{await siteStorageRemove(removed.previous.path);}catch(e){toast("Slider removed; backup cleanup failed.",true);}renderSiteMedia();toast("Slider image removed.");}catch(e){toast(e.message,true);}});const add=$("addSliderImage");if(add)add.onchange=async()=>{const file=add.files&&add.files[0];if(!file)return;add.disabled=true;try{await uploadNewSliderSlide(file);}catch(e){toast(e.message,true);}finally{add.disabled=false;add.value="";}};}

function setting(key){return S.settings.find(s=>s.setting_key===key);}
function renderSettings(){[["settingRestaurantName","restaurant_name"],["settingPhoneDisplay","wa_phone_display"],["settingPhone","wa_phone"],["settingAddress","address"],["settingFooter","footer_text_en"]].forEach(x=>{let s=setting(x[1]);$(x[0]).value=s?String(s.value_json):"";});}
function openEditor(title,eyebrow,html,save){
 $("editorTitle").textContent=title;$("editorEyebrow").textContent=eyebrow;$("editorBody").innerHTML=html;let dlg=$("editorDialog"),form=$("editorForm");
 form.onsubmit=async e=>{e.preventDefault();let b=$("saveEditor");b.disabled=true;b.textContent="Saving…";try{await save(new FormData(form));dlg.close();await loadAll();toast("Changes saved to Flame Chick.");}catch(err){toast(err.message,true);}finally{b.disabled=false;b.textContent="Save changes";}};
 dlg.showModal();
}
function closeEditor(){if($("editorDialog").open)$("editorDialog").close();}
function categoryOptions(id){return S.categories.map(c=>'<option value="'+c.id+'" '+(c.id===id?"selected":"")+'>'+esc(c.name_en)+'</option>').join("");}
function editProduct(id){
 let p=S.products.find(x=>x.id===id),vs=p?vFor(id):[];
 const activeVs=vs.filter(v=>v.is_active!==false);
 const singleDefault=activeVs.length<=1&&(!activeVs[0]||isDefaultPriceVariant(activeVs[0]));
 const singleRow=activeVs.find(isDefaultPriceVariant)||activeVs[0]||{size_key:"REGULAR",size_label:"Regular",price:""};
 let currentMode=singleDefault?"single":"variants";
 let singlePrice=String(singleDefault?singleRow.price:"");
 let singleVariantId=singleDefault?(singleRow.id||""):"";
 let showCollapseNote=!singleDefault;
 let pricingRows=activeVs.map(v=>({label:v.size_label||"",key:v.size_key||"",price:String(v.price==null?"":v.price),id:v.id||""}));
 const initialCategory=p?p.category_id:(S.categories[0]?.id||"");
 let html='<div class="form-grid"><label>Product name<input name="name_en" required value="'+esc(p?p.name_en:"")+'"></label><label>Urdu name<input name="name_ur" dir="rtl" value="'+esc(p?p.name_ur:"")+'"></label><label class="full-field">Description<textarea name="description_en" rows="2">'+esc(p?p.description_en:"")+'</textarea></label><label>Category<select name="category_id" id="productCategorySelect" required>'+categoryOptions(initialCategory)+'</select></label><label>Subcategory<select name="subcategory_id" id="productSubcategorySelect"><option value="">No subcategory</option>'+subcategoryOptions(initialCategory,p?p.subcategory_id:null)+'</select></label><label>Sort order<input name="sort_order" type="number" value="'+(p?p.sort_order:0)+'"></label></div><div class="dialog-section-title">WEBSITE VISIBILITY</div><div class="form-grid"><label class="check-row"><input type="checkbox" name="active" '+(!p||p.is_active?"checked":"")+'> Active on menu</label><label class="check-row"><input type="checkbox" name="available" '+(!p||p.is_available?"checked":"")+'> Available to order</label><label class="check-row"><input type="checkbox" name="featured" '+(p&&p.featured?"checked":"")+'> Featured product</label></div><div class="dialog-section-title">PRICING TYPE</div><div class="pricing-mode-grid" role="radiogroup" aria-label="Pricing type"><label class="pricing-mode-card"><input type="radio" name="pricing_type" value="single" '+(currentMode==="single"?"checked":"")+'><span><b>Single price</b><small>One price for the product. No size or option is shown to customers.</small></span></label><label class="pricing-mode-card"><input type="radio" name="pricing_type" value="variants" '+(currentMode==="variants"?"checked":"")+'><span><b>Multiple variants</b><small>Different sizes or options, each with its own price.</small></span></label></div><div id="pricingEditor"></div>';
 html+=imageEditor("products",id,p||{});
 openEditor(p?"Edit product":"Add product",p?"MENU MANAGEMENT":"NEW MENU ITEM",html,async fd=>{
  const pricingType=String(fd.get("pricing_type")||"single");
  let priceRows=[];
  if(pricingType==="single"){
   const price=Number(fd.get("single_price"));
   if(!Number.isFinite(price)||price<0)throw Error("Enter a valid single product price.");
   priceRows=[{label:"Regular",key:"REGULAR",price}];
  }else if(pricingType==="variants"){
   const count=Number(fd.get("variant_count")||0);
   if(!Number.isInteger(count)||count<1||count>50)throw Error("Add at least one valid size or option.");
   for(let i=0;i<count;i++){
    const label=String(fd.get("vl"+i)||"").trim();
    const key=String(fd.get("vk"+i)||"").trim().toUpperCase();
    const price=Number(fd.get("vp"+i));
    if(!label||!key||!/^[A-Z0-9_]+$/.test(key)||!Number.isFinite(price)||price<0)throw Error("Check every option: enter a name, a unique key using letters/numbers/underscores, and a valid PKR price.");
    priceRows.push({label,key,price,id:String(fd.get("vi"+i)||"")});
   }
   if(priceRows.length<2&&!(activeVs.length===1&&!isDefaultPriceVariant(activeVs[0])))throw Error("Multiple variants needs at least two options. Add another size or option, or choose Single price.");
   const keys=priceRows.map(x=>x.key);
   if(new Set(keys).size!==keys.length)throw Error("Each option must have a unique option key.");
  }else throw Error("Choose Single price or Multiple variants.");
  const body={name_en:String(fd.get("name_en")||"").trim(),name_ur:String(fd.get("name_ur")||"").trim()||null,description_en:String(fd.get("description_en")||"").trim()||null,category_id:fd.get("category_id"),subcategory_id:fd.get("subcategory_id")||null,sort_order:Number(fd.get("sort_order")||0),is_active:fd.has("active"),is_available:fd.has("available"),featured:fd.has("featured")};
  if(!body.name_en||!body.category_id)throw Error("Product name and category are required.");
  if(body.subcategory_id&&!S.subcategories.some(s=>s.id===body.subcategory_id&&s.category_id===body.category_id))throw Error("Choose a subcategory belonging to the selected category.");
  const collapsingVariants=pricingType==="single"&&(activeVs.length>1||(activeVs.length===1&&!isDefaultPriceVariant(activeVs[0])));
  let preserveExistingVariantRows=false;
  if(collapsingVariants){
   const variantIds=activeVs.map(v=>v.id).filter(Boolean);
   if(variantIds.length){
    const refs=await db("deal_components?product_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1");
    if(refs.length)throw Error("These options are still linked to a deal. Update that deal first; the product's pricing type has not been changed.");
    const [orderRefs,componentRefs]=await Promise.all([
     db("order_items?product_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1"),
     db("order_item_components?selected_variant_id=in.("+variantIds.join(",")+")&select=id&limit=1")
    ]);
    preserveExistingVariantRows=!!(orderRefs.length||componentRefs.length);
   }
  }
  const expandingFromDefault=pricingType==="variants"&&activeVs.length===1&&isDefaultPriceVariant(activeVs[0])&&!!activeVs[0].id;
  if(expandingFromDefault){
   const defaultId=activeVs[0].id;
   const [dealRefs,orderRefs,componentRefs]=await Promise.all([
    db("deal_components?product_variant_id=eq."+defaultId+"&select=id&limit=1"),
    db("order_items?product_variant_id=eq."+defaultId+"&select=id&limit=1"),
    db("order_item_components?selected_variant_id=eq."+defaultId+"&select=id&limit=1")
   ]);
   if(dealRefs.length)throw Error("This single-price record is still linked to a deal. Update that deal first before changing its pricing type.");
   if(orderRefs.length||componentRefs.length){
    preserveExistingVariantRows=true;
    pricingRows[0].id="";
   }
  }
  let pid=id;
  if(p)await db("products?id=eq."+id,{method:"PATCH",body,prefer:"return=minimal"});
  else{
   const legacy="PB-"+Date.now().toString(36).toUpperCase();
   const created=await db("products",{method:"POST",body:Object.assign({},body,{restaurant_id:S.restaurant.id,legacy_id:legacy}),prefer:"return=representation"});
   pid=created&&created[0]&&created[0].id;
   if(!pid)throw Error("Product was saved but its ID was not returned.");
  }
  if(pricingType==="single"){
   const keep=preserveExistingVariantRows?null:(activeVs[0]||null);
   const singleBody={size_label:"Regular",size_key:"REGULAR",price:priceRows[0].price,sort_order:1,is_active:true,is_available:true};
   if(keep)await db("product_variants?id=eq."+keep.id,{method:"PATCH",body:singleBody,prefer:"return=minimal"});
   else await db("product_variants",{method:"POST",body:Object.assign({},singleBody,{product_id:pid,legacy_id:"PBV-"+Date.now().toString(36).toUpperCase()+"-1"}),prefer:"return=minimal"});
   for(const oldVariant of activeVs){
    if(preserveExistingVariantRows||!keep||oldVariant.id!==keep.id)await db("product_variants?id=eq."+oldVariant.id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});
   }
  }else{
   if(expandingFromDefault&&preserveExistingVariantRows){
    await db("product_variants?id=eq."+activeVs[0].id,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});
   }
   for(let i=0;i<priceRows.length;i++){
    const row=priceRows[i];
    const v={size_label:row.label,size_key:row.key,price:row.price,sort_order:i+1,is_active:true,is_available:true};
    if(row.id)await db("product_variants?id=eq."+row.id,{method:"PATCH",body:v,prefer:"return=minimal"});
    else await db("product_variants",{method:"POST",body:Object.assign({},v,{product_id:pid,legacy_id:"PBV-"+Date.now().toString(36).toUpperCase()+"-"+(i+1)}),prefer:"return=minimal"});
   }
  }
  const f=fd.get("image_file");if(f&&f.size)await replaceImage("products",pid,f,p||{});
 });
 function captureVariantRows(){
  return pricingRows.map((row,i)=>{
   const get=name=>$("editorBody").querySelector('[name="'+name+i+'"]');
   const label=get("vl"),key=get("vk"),price=get("vp"),variantId=get("vi");
   return {label:label?label.value:row.label,key:key?key.value:row.key,price:price?price.value:row.price,id:variantId?variantId.value:row.id};
  });
 }
 function renderPricingEditor(){
  const host=$("pricingEditor");
  if(!host)return;
  if(currentMode==="single"){
   host.innerHTML='<div class="variant-editor variant-editor-single"><div class="variant-editor-grid"><label>Product price (PKR)<input id="singleProductPrice" name="single_price" type="number" min="0" step="1" value="'+esc(singlePrice)+'" required></label></div><p class="data-note">'+(showCollapseNote?"Only the first option will become the single product price. Other active options will be archived, not deleted, so previous order records remain intact. This change is blocked while an option is used by a deal.":"One product, one price. The system keeps an internal Regular price record for website and POS order processing; customers will not see a size or option.")+'</p></div>';
   return;
  }
  const rows=pricingRows.map((v,i)=>'<div class="variant-editor"><div class="variant-editor-grid"><label>Size / option name<input name="vl'+i+'" value="'+esc(v.label)+'" placeholder="e.g. Small" required></label><label>Option key<input name="vk'+i+'" value="'+esc(v.key)+'" placeholder="e.g. SMALL" required></label><label>Price (PKR)<input name="vp'+i+'" type="number" min="0" step="1" value="'+esc(v.price)+'" required></label></div><input type="hidden" name="vi'+i+'" value="'+esc(v.id||"")+'">'+(v.id&&canDelete()?'<button type="button" class="action-link danger-link" data-remove-variant="'+v.id+'">Delete option</button>':(!v.id&&pricingRows.length>2?'<button type="button" class="action-link danger-link" data-remove-option="'+i+'">Remove option</button>':'') )+'</div>').join("");
  host.innerHTML='<input type="hidden" name="variant_count" value="'+pricingRows.length+'">'+rows+'<div class="pricing-editor-actions"><button type="button" class="btn btn-outline btn-small" id="addProductOption">+ Add size / option</button><p class="data-note">Give every option a clear name and a unique key. Example: Small / SMALL, Large / LARGE.</p></div>';
  const add=$("addProductOption");
  if(add)add.onclick=()=>{pricingRows=captureVariantRows();const next=pricingRows.length+1;pricingRows.push({label:"Option "+next,key:"OPTION_"+next,price:"",id:""});renderPricingEditor();};
  host.querySelectorAll("[data-remove-option]").forEach(btn=>btn.onclick=()=>{pricingRows=captureVariantRows();pricingRows.splice(Number(btn.dataset.removeOption),1);renderPricingEditor();});
  host.querySelectorAll("[data-remove-variant]").forEach(btn=>btn.onclick=async()=>{
   const v=vs.find(x=>x.id===btn.dataset.removeVariant);if(!v||!p)return;
   try{const done=await namedDelete("variant",p.name_en+" — "+v.size_label,()=>deleteVariantSafely(v),()=>archiveVariant(v));if(done)closeEditor();}
   catch(error){toast(error.message,true);}
  });
 }
 $("editorBody").querySelectorAll('input[name="pricing_type"]').forEach(radio=>radio.onchange=()=>{
  if(!radio.checked||radio.value===currentMode)return;
  if(radio.value==="variants"){
   const field=$("singleProductPrice");
   singlePrice=field?field.value:singlePrice;
   pricingRows=[{label:"Option 1",key:"OPTION_1",price:singlePrice,id:singleVariantId},{label:"Option 2",key:"OPTION_2",price:"",id:""}];
   currentMode="variants";
  }else{
   pricingRows=captureVariantRows();
   singlePrice=pricingRows.length?pricingRows[0].price:"";
   singleVariantId=pricingRows.length?pricingRows[0].id:"";
   currentMode="single";showCollapseNote=true;
  }
  renderPricingEditor();
 });
 renderPricingEditor();
 $("productCategorySelect").onchange=()=>{
  const cid=$("productCategorySelect").value,sub=$("productSubcategorySelect");
  sub.innerHTML='<option value="">No subcategory</option>'+subcategoryOptions(cid,null);
 };
 wireImageRollback("products",id);
}
function editCategory(id){
 let c=S.categories.find(x=>x.id===id);
 let html='<div class="form-grid"><label>Category name<input name="name_en" required value="'+esc(c?c.name_en:"")+'"></label><label>Urdu name<input name="name_ur" dir="rtl" value="'+esc(c?c.name_ur:"")+'"></label><label>Sort order<input name="sort_order" type="number" value="'+(c?c.sort_order:0)+'"></label><label class="check-row"><input type="checkbox" name="active" '+(!c||c.is_active?"checked":"")+'> Visible on website</label></div>';
 html+=imageEditor("categories",id,c||{});
 openEditor(c?"Edit category":"Add category","MENU STRUCTURE",html,async fd=>{
  let b={name_en:String(fd.get("name_en")||"").trim(),name_ur:String(fd.get("name_ur")||"").trim()||null,sort_order:Number(fd.get("sort_order")||0),is_active:fd.has("active")};
  if(!b.name_en)throw Error("Category name is required.");
  let cid=id;
  if(c)await db("categories?id=eq."+id,{method:"PATCH",body:b,prefer:"return=minimal"});
  else{let legacy="PBC-"+Date.now().toString(36).toUpperCase(),created=await db("categories",{method:"POST",body:Object.assign({},b,{restaurant_id:S.restaurant.id,legacy_id:legacy}),prefer:"return=representation"});cid=created&&created[0]&&created[0].id;if(!cid)throw Error("Category was saved but its ID was not returned.");}
  const f=fd.get("image_file");if(f&&f.size)await replaceImage("categories",cid,f,c||{});
 });
 wireImageRollback("categories",id);
}
function editSubcategory(id){
 let s=S.subcategories.find(x=>x.id===id),parent=s?s.category_id:(S.categories[0]?.id||"");
 let html='<div class="form-grid"><label>Subcategory name<input name="name_en" required value="'+esc(s?s.name_en:"")+'"></label><label>Urdu name<input name="name_ur" dir="rtl" value="'+esc(s?s.name_ur:"")+'"></label><label>Parent category<select name="category_id" required>'+categoryOptions(parent)+'</select></label><label>Sort order<input name="sort_order" type="number" value="'+(s?s.sort_order:0)+'"></label><label class="check-row"><input type="checkbox" name="active" '+(!s||s.is_active?"checked":"")+'> Active in POS and website</label></div><p class="data-note">Products assigned to this subcategory will appear under its parent category in the POS filters.</p>';
 openEditor(s?"Edit subcategory":"Add subcategory","MENU STRUCTURE",html,async fd=>{
  const body={name_en:String(fd.get("name_en")||"").trim(),name_ur:String(fd.get("name_ur")||"").trim()||null,category_id:fd.get("category_id"),sort_order:Number(fd.get("sort_order")||0),is_active:fd.has("active")};
  if(!body.name_en||!body.category_id)throw Error("Subcategory name and parent category are required.");
  if(s)await db("subcategories?id=eq."+id,{method:"PATCH",body,prefer:"return=minimal"});
  else await db("subcategories",{method:"POST",body:Object.assign({},body,{legacy_id:"PBS-"+Date.now().toString(36).toUpperCase()}),prefer:"return=minimal"});
 });
}
function dealComponentRowHtml(i){
 const productOpts=S.products.filter(p=>p.is_active).map(p=>'<option value="'+p.id+'">'+esc(p.name_en)+'</option>').join("");
 const variantOpts=S.variants.filter(v=>v.is_active).map(v=>{const p=S.products.find(x=>x.id===v.product_id);return '<option value="'+v.id+'">'+esc((p?p.name_en:"Product")+" — "+v.size_label+" ["+v.size_key+"]")+'</option>';}).join("");
 const poolOpts=S.subcategories.filter(s=>s.is_active).map(s=>{const p=S.categories.find(c=>c.id===s.category_id);return '<option value="'+s.id+'">'+esc((p?p.name_en:"Category")+" / "+s.name_en)+'</option>';}).join("");
 return '<div class="deal-component-editor" data-component-row="'+i+'"><div class="component-editor-head"><b>Component '+(i+1)+'</b><button class="action-link danger-link" type="button" data-remove-component="'+i+'">Remove</button></div><div class="form-grid"><label>Component kind<select name="component_type_'+i+'"><option value="PIZZA">Pizza</option><option value="ITEM" selected>Food / item</option><option value="DRINK">Drink</option></select></label><label>Selection method<select name="ref_type_'+i+'"><option value="FIXED_PRODUCT">Fixed product</option><option value="FIXED_VARIANT">Fixed size / variant</option><option value="CHOICE_BY_SIZE">Customer chooses from subcategory</option><option value="DRINK_INCLUDED">Included drink</option></select></label><label>Fixed product<select name="product_id_'+i+'"><option value="">Choose product…</option>'+productOpts+'</select></label><label>Fixed variant<select name="variant_id_'+i+'"><option value="">Choose variant…</option>'+variantOpts+'</select></label><label>Choice pool / subcategory<select name="pool_id_'+i+'"><option value="">Choose subcategory…</option>'+poolOpts+'</select></label><label>Required size key<input name="size_key_'+i+'" placeholder="SMALL, MEDIUM, LARGE"></label><label>Included drink<select name="volume_key_'+i+'"><option value="">Choose active drink volume…</option>'+S.drinkOptions.filter(x=>x.is_active).map(x=>'<option value="'+esc(x.volume_key)+'">'+esc(x.display_name||x.volume_key)+(x.volume_ml?' ('+x.volume_ml+' ml)':'')+'</option>').join('')+'</select></label><label>Quantity<input name="quantity_'+i+'" type="number" min="1" step="1" value="1" required></label><label class="full-field">Description / selection label<input name="description_phrase_'+i+'" placeholder="e.g. Choose your pizza"></label></div></div>';
}
function wireDealComponentEditor(){
 const box=$("dealComponentsEditor"),add=$("addDealComponentRow");
 if(!box||!add)return;
 let next=box.querySelectorAll("[data-component-row]").length;
 const wireRemove=()=>box.querySelectorAll("[data-remove-component]").forEach(b=>b.onclick=()=>{b.closest("[data-component-row]")?.remove();});
 add.onclick=()=>{box.insertAdjacentHTML("beforeend",dealComponentRowHtml(next++));wireRemove();};
 wireRemove();
}
function editDeal(id){
 let d=id?S.deals.find(x=>x.id===id):null;
 const dealCat=d?d.category_id:(dealCategories()[0]?.id||"");
 let components=d?S.dealComponents.filter(x=>x.deal_id===d.id):[];
 let html='<div class="form-grid"><label>Deal title<input name="title" required value="'+esc(d?d.title:"")+'"></label><label>Deal type<select name="category_id" required>'+dealGroupOptions(dealCat)+'</select></label><label>Bundle price (PKR)<input name="price" type="number" min="0" step="1" required value="'+(d?Number(d.bundle_price):0)+'"></label><label>Sort order<input name="sort_order" type="number" value="'+(d?Number(d.sort_order||0):0)+'"></label><label class="full-field">Deal description<textarea name="description_en" rows="2">'+esc(d?d.description_en:"")+'</textarea></label><label class="check-row"><input type="checkbox" name="active" '+(!d||d.is_active?"checked":"")+'> Active</label><label class="check-row"><input type="checkbox" name="available" '+(!d||d.is_available?"checked":"")+'> Available to order</label><label class="check-row"><input type="checkbox" name="featured" '+(d&&d.featured?"checked":"")+'> Featured</label></div>';
 if(d){
  html+='<div class="dialog-section-title">CURRENT DEAL COMPONENTS</div><div class="existing-component-list">'+(components.map(c=>'<div class="existing-component-line">'+esc(c.display_name||c.description_phrase||c.component_type)+' · '+esc(c.ref_type)+' · Qty '+c.quantity+'</div>').join("")||'<p class="data-note">No components are configured on this deal.</p>')+'</div><p class="data-note">This edit updates the title, type, price and availability. Existing order-linked components are left unchanged. Create a new deal to build a different bundle.</p>';
 }else{
  html+='<div class="dialog-section-title">BUILD THE DEAL</div><p class="data-note">Add each item included in this bundle. For customer choice (for example, choose one pizza from a subcategory), use “Customer chooses from subcategory” and enter a size key that exists on those products.</p><div id="dealComponentsEditor">'+dealComponentRowHtml(0)+'</div><button type="button" class="btn btn-outline btn-small" id="addDealComponentRow">＋ Add component</button>';
 }
 if(d)html+=imageEditor("deals",id,d);
 openEditor(d?"Edit "+d.title:"Create deal",d?"DEAL MANAGEMENT":"NEW DEAL",html,async fd=>{
  const body={title:String(fd.get("title")||"").trim(),category_id:fd.get("category_id"),description_en:String(fd.get("description_en")||"").trim()||null,bundle_price:Number(fd.get("price")),sort_order:Number(fd.get("sort_order")||0),is_active:fd.has("active"),is_available:fd.has("available"),featured:fd.has("featured")};
  if(!body.title||!body.category_id||!Number.isFinite(body.bundle_price)||body.bundle_price<0)throw Error("Enter a title, deal type and valid bundle price.");
  if(d){
   await db("deals?id=eq."+id,{method:"PATCH",body,prefer:"return=minimal"});
   const f=fd.get("image_file");if(f&&f.size)await replaceImage("deals",id,f,d);
   return;
  }
  const rows=[...$("dealComponentsEditor").querySelectorAll("[data-component-row]")];
  if(!rows.length)throw Error("A deal must contain at least one component.");
  const components=rows.map(row=>{
   const i=row.dataset.componentRow,ref=String(fd.get("ref_type_"+i)||""),kind=String(fd.get("component_type_"+i)||"ITEM"),qty=Number(fd.get("quantity_"+i)||0),delta=0;
   const c={component_type:kind,ref_type:ref,product_id:null,product_variant_id:null,pool_subcategory_id:null,size_key:null,volume_key:null,quantity:qty,price_delta:delta,description_phrase:String(fd.get("description_phrase_"+i)||"").trim()||null,display_name:null,sort_order:rows.indexOf(row)+1};
   if(!["PIZZA","ITEM","DRINK"].includes(kind)||!Number.isInteger(qty)||qty<1)throw Error("Check component type and quantity.");
   if(ref==="FIXED_PRODUCT"){c.product_id=String(fd.get("product_id_"+i)||"")||null;if(!c.product_id)throw Error("Choose a product for every fixed-product component.");}
   else if(ref==="FIXED_VARIANT"){c.product_variant_id=String(fd.get("variant_id_"+i)||"")||null;if(!c.product_variant_id)throw Error("Choose a variant for every fixed-variant component.");}
   else if(ref==="CHOICE_BY_SIZE"){c.pool_subcategory_id=String(fd.get("pool_id_"+i)||"")||null;c.size_key=String(fd.get("size_key_"+i)||"").trim().toUpperCase();if(!c.pool_subcategory_id||!c.size_key)throw Error("A choice component needs a subcategory and size key.");if(kind==="DRINK")throw Error("A drink cannot be configured as a pizza/item subcategory choice.");}
   else if(ref==="DRINK_INCLUDED"){c.component_type="DRINK";c.volume_key=String(fd.get("volume_key_"+i)||"").trim().toUpperCase();if(!c.volume_key)throw Error("An included drink requires a volume key, e.g. REGULAR.");}
   else throw Error("Choose a valid selection method for each component.");
   if(ref!=="DRINK_INCLUDED"&&kind==="DRINK")throw Error("Use 'Included drink' for drink components.");
   return c;
  });
  for(const c of components){
   if(c.ref_type==="FIXED_PRODUCT"&&!S.products.some(p=>p.id===c.product_id&&p.is_active&&p.is_available))throw Error("A fixed product must be active and available.");
   if(c.ref_type==="FIXED_VARIANT"){
    const v=S.variants.find(x=>x.id===c.product_variant_id),p=v&&S.products.find(x=>x.id===v.product_id);
    if(!v||!v.is_active||!v.is_available||!p||!p.is_active||!p.is_available)throw Error("A fixed variant must belong to an active, available product.");
   }
   if(c.ref_type==="CHOICE_BY_SIZE"){
    const pool=S.subcategories.find(x=>x.id===c.pool_subcategory_id&&x.is_active);
    const candidates=S.products.filter(p=>p.subcategory_id===c.pool_subcategory_id&&p.is_active&&p.is_available);
    const valid=candidates.some(p=>S.variants.some(v=>v.product_id===p.id&&v.size_key===c.size_key&&v.is_active&&v.is_available));
    if(!pool||!valid)throw Error("The selected subcategory must contain at least one active, available product with size "+c.size_key+".");
   }
   if(c.ref_type==="DRINK_INCLUDED"){
    const opts=await db("drink_options?restaurant_id=eq."+S.restaurant.id+"&volume_key=eq."+encodeURIComponent(c.volume_key)+"&is_active=eq.true&select=id&limit=1");
    if(!Array.isArray(opts)||!opts.length)throw Error("No active drink option uses volume key "+c.volume_key+". Check drink options before saving.");
   }
  }
  const legacy="PB-DL-"+Date.now().toString(36).toUpperCase();
  let made=await db("deals",{method:"POST",body:Object.assign({},body,{restaurant_id:S.restaurant.id,legacy_id:legacy,metadata:{deal_type:catName(body.category_id)},is_active:false,is_available:false}),prefer:"return=representation"});
  const did=made&&made[0]&&made[0].id;if(!did)throw Error("Deal draft could not be created.");
  try{
   for(let i=0;i<components.length;i++)await db("deal_components",{method:"POST",body:Object.assign({},components[i],{deal_id:did,legacy_id:legacy+"-C"+(i+1)}),prefer:"return=minimal"});
   await db("deals?id=eq."+did,{method:"PATCH",body:{is_active:body.is_active,is_available:body.is_available},prefer:"return=minimal"});
  }catch(error){
   try{await db("deals?id=eq."+did,{method:"PATCH",body:{is_active:false,is_available:false},prefer:"return=minimal"});}catch{}
   throw Error("The deal was saved as a hidden draft, but a component could not be saved: "+error.message);
  }
 });
 if(!d)wireDealComponentEditor();
 if(d)wireImageRollback("deals",id);
}

function editArea(id){
 let a=S.areas.find(x=>x.id===id),html='<div class="form-grid"><label>Area name<input name="name" required value="'+esc(a?a.name:"")+'"></label><label>Delivery fee (PKR)<input name="fee" type="number" min="0" required value="'+(a?a.delivery_fee:0)+'"></label><label>Sort order<input name="sort" type="number" value="'+(a?a.sort_order:0)+'"></label><label class="check-row"><input type="checkbox" name="active" '+(!a||a.is_active?"checked":"")+'> Accept deliveries here</label></div>';
 openEditor(a?"Edit delivery area":"Add delivery area","DELIVERY COVERAGE",html,async fd=>{let b={name:String(fd.get("name")||"").trim(),delivery_fee:Number(fd.get("fee")),sort_order:Number(fd.get("sort")||0),is_active:fd.has("active")};if(!b.name||!Number.isFinite(b.delivery_fee)||b.delivery_fee<0)throw Error("Enter a valid area name and fee.");if(a)await db("delivery_areas?id=eq."+id,{method:"PATCH",body:b,prefer:"return=minimal"});else await db("delivery_areas",{method:"POST",body:Object.assign({},b,{restaurant_id:S.restaurant.id,branch_id:S.branch.id}),prefer:"return=minimal"});});
}
async function saveSettings(e){
 e.preventDefault();let pairs=[["restaurant_name","settingRestaurantName"],["wa_phone_display","settingPhoneDisplay"],["wa_phone","settingPhone"],["address","settingAddress"],["footer_text_en","settingFooter"]];
 for(let p of pairs){let s=setting(p[0]);if(!s)continue;let val=$(p[1]).value.trim();if(p[0]==="wa_phone"){val=val.replace(/\D/g,"");if(val)val=Number(val);}await db("restaurant_settings?id=eq."+s.id,{method:"PATCH",body:{value_json:val,updated_by:S.user.id,updated_at:new Date().toISOString()},prefer:"return=minimal"});}
 await loadAll();toast("Website settings saved.");
}
function wire(){
 $("loginForm").onsubmit=async e=>{e.preventDefault();let b=$("loginButton");b.disabled=true;b.textContent="Signing in…";$("loginError").textContent="";try{let s=await authPost("token?grant_type=password",{email:$("email").value.trim(),password:$("password").value});saveSession(Object.assign({},s,{expires_at:Date.now()+Number(s.expires_in||3600)*1000}));await bootstrap();}catch(err){$("loginError").textContent=err.message;clearSession();showAuth(true);}finally{b.disabled=false;b.innerHTML='Sign in <span>→</span>';};};
 $("logoutButton").onclick=logout;
 document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>nav(b.dataset.page));
 $("refreshButton").onclick=async()=>{let b=$("refreshButton");b.disabled=true;try{await loadStaff();toast("Staff records refreshed.");}catch(e){toast(e.message,true);}finally{b.disabled=false;}};
 $("rangeSwitch").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.range=b.dataset.range;$("rangeSwitch").querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));const m=$("dashboardMonth");m.hidden=S.range!=="month";if(S.range==="month")m.value=S.dashboardMonth;loadDashboard().catch(()=>{});});
  $("dashboardMonth").onchange=()=>{S.dashboardMonth=$("dashboardMonth").value||S.dashboardMonth;loadDashboard().catch(()=>{});};
  $("rushRangeSwitch").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.rushRange=b.dataset.rush;$("rushRangeSwitch").querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));const m=$("rushMonth");m.hidden=S.rushRange!=="month";if(S.rushRange==="month")m.value=S.rushMonth;loadDashboard().catch(()=>{});});
  $("rushMonth").onchange=()=>{S.rushMonth=$("rushMonth").value||S.rushMonth;loadDashboard().catch(()=>{});};
 $("orderSearch").oninput=renderOrders;$("orderStatusFilter").onchange=renderOrders;$("productSearch").oninput=renderProducts;$("productCategoryFilter").onchange=renderProducts;$("productStateFilter").onchange=renderProducts;
 $("addProductButton").onclick=()=>editProduct(null);$("addCategoryButton").onclick=()=>editCategory(null);$("addSubcategoryButton").onclick=()=>editSubcategory(null);$("addDealButton").onclick=()=>editDeal(null);$("addAreaButton").onclick=()=>editArea(null);
 $("saveDefaultDeliveryFeeButton").onclick=()=>saveDefaultDeliveryFee().catch(err=>toast(err.message,true));
 $("inviteStaffButton").onclick=()=>openStaffDialog(null);
 $("staffForm").onsubmit=e=>saveStaffForm(e);$("staffRoleSelect").onchange=syncStaffBranchControl;
 $("staffDialogClose").onclick=()=>$("staffDialog").close();
 $("staffDialogCancel").onclick=()=>$("staffDialog").close();
 $("settingsForm").onsubmit=e=>saveSettings(e).catch(err=>toast(err.message,true));
 $("closeEditor").onclick=()=>{if($("editorDialog").open)$("editorDialog").close();};$("cancelEditor").onclick=()=>{if($("editorDialog").open)$("editorDialog").close();};
}
async function init(){wire();let saved=readSession();if(saved&&saved.access_token){saveSession(saved);showAuth(false);try{await bootstrap();}catch(e){clearSession();showAuth(true);$("loginError").textContent=e.message;}}else showAuth(true);}
init();
})();