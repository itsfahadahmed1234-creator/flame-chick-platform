/* Flame Chick store: fulfillment + cart primitives (catalog era, Phase 2C).
   Cart is session-scoped and versioned; every restore revalidates
   selections against the verified catalog (FlameChickPricing.parseCart).
   All totals come from the single pricing engine (FlameChickPricing.priceCart). */
let cart=[],deliveryAreasData=[];
const FLAME_CHICK_CART_KEY='flame_chick_cart_v1';
/* ===== Fulfillment State ===== */
let fulfillmentType=sessionStorage.getItem('flame_chick_fulfillment_type_v1')||'Delivery';
function selectFulfillment(type){
  fulfillmentType=type;
  sessionStorage.setItem('flame_chick_fulfillment_type_v1',type);
  document.getElementById('fulfillmentGate').classList.add('hidden');
  updateFulfillmentUI();
}
function toggleFulfillmentDropdown(){
  const dd=document.getElementById('ffDropdown');
  const tr=document.querySelector('.ff-trigger');
  dd.classList.toggle('open');
  tr.classList.toggle('open');
}
function setFulfillment(type){
  fulfillmentType=type;
  sessionStorage.setItem('flame_chick_fulfillment_type_v1',type);
  document.getElementById('ffDropdown').classList.remove('open');
  document.querySelector('.ff-trigger').classList.remove('open');
  updateFulfillmentUI();
}
function hasDeliveryAreas(){
  return Array.isArray(deliveryAreasData)&&deliveryAreasData.length>0;
}
function updateFulfillmentUI(){
  const label=document.getElementById('ffTriggerLabel');
  if(label)label.textContent=(typeof FLAME_CHICK_I18N!=='undefined')?FLAME_CHICK_I18N.t('fulfillment.'+fulfillmentType):fulfillmentType;
  document.querySelectorAll('.ff-option').forEach(b=>{
    const id=b.getAttribute('data-ff')||fulfillmentType;
    b.classList.toggle('active',id===fulfillmentType);
    const keep=b.querySelector('svg');
    const text=(typeof FLAME_CHICK_I18N!=='undefined')?FLAME_CHICK_I18N.t('fulfillment.'+id):id;
    if(b.dataset.ffLabel!==text){
      b.innerHTML='';
      if(keep)b.appendChild(keep);
      b.appendChild(document.createTextNode(' '+text));
      b.dataset.ffLabel=text;
    }
  });
  const isDelivery=fulfillmentType==='Delivery';
  const addrInput=document.querySelector('[name="address"]');
  const areaInput=document.querySelector('[name="area"]');
  if(addrInput){
    addrInput.closest('label').style.display=isDelivery?'':'none';
    addrInput.required=isDelivery;
  }
  if(areaInput){
    /* The area selector must stay visible whenever Delivery is selected —
       even if the published catalog currently has zero areas (the picker
       then offers only "Other / Not Listed" with the standard fee, instead
       of the whole field vanishing, which read as "the selector broke"). */
    const showArea=isDelivery;
    areaInput.closest('label').style.display=showArea?'':'none';
    /* Only force a choice when real areas exist; with none published the
       standard-fee fallback covers delivery and nothing blocks checkout. */
    areaInput.required=isDelivery&&hasDeliveryAreas();
    /* Validate the saved selection against the CURRENT published catalog. If the
       area was removed/replaced since the selection was made, reset it and say so
       instead of silently charging the wrong fee or hiding a stale pick. */
    const hidden=document.getElementById('areaIdInput');
    if(isDelivery&&hasDeliveryAreas()&&hidden){
      const saved=String(hidden.value||'').trim();
      if(saved){
        const stillThere=deliveryAreasData.find(function(a){return String(a.id)===saved;});
        if(!stillThere){
          hidden.value='';
          if(areaInput)areaInput.value='';
          if(typeof showToast==='function'){
            showToast(tr('area.gone'),tr('area.goneSub'));
          }
        }
      }
    }
  }
  if(document.getElementById('cartCount')){
    renderCart();
    if(cart.length&&document.getElementById('checkoutModal').classList.contains('open'))startCheckout();
  }
}
document.addEventListener('click',function(e){
  if(!e.target.closest('.ff-dropdown-wrap')){
    document.getElementById('ffDropdown')?.classList.remove('open');
    document.querySelector('.ff-trigger')?.classList.remove('open');
  }
});

/* ===== Cart keys (selection-identity, used by merge + revalidation) ===== */
function productLineKey(itemId,modifierIds){
  let k='v'+itemId;
  if(Array.isArray(modifierIds)&&modifierIds.length)k+='|'+modifierIds.slice().sort().join(',');
  return k;
}
function dealLineKey(dealId,choices){
  const parts=Object.keys(choices||{}).sort().map(cid=>cid+':'+choices[cid]);
  return 'd'+dealId+'|'+parts.join(',');
}

/* ===== Cart persistence (session-scoped, format-versioned) ===== */
function storeCart(){
  try{
    const ctx=(typeof PCTX!=='undefined')?PCTX:null;
    if(ctx)sessionStorage.setItem(FLAME_CHICK_CART_KEY,FlameChickPricing.serializeCart(ctx,cart));
  }catch(e){/* storage full/blocked: cart keeps working in memory */}
}
function restoreStoredCart(ctx){
  let raw=null;
  try{raw=sessionStorage.getItem(FLAME_CHICK_CART_KEY);}catch(e){raw=null;}
  if(raw==null)return{lines:cart.slice(),dropped:[],versionChanged:false,changed:false,restored:false};
  const res=FlameChickPricing.parseCart(ctx,raw);
  cart=res.lines;
  res.restored=true;
  try{sessionStorage.setItem(FLAME_CHICK_CART_KEY,FlameChickPricing.serializeCart(ctx,cart));}catch(e){}
  return res;
}

function cartAddFx(){renderCart();closeCartPopover();const cc=document.getElementById('cartCount');cc.classList.remove('bump');void cc.offsetWidth;cc.classList.add('bump');const head=document.querySelector('.cart-head');head.classList.remove('cart-pulse');void head.offsetWidth;head.classList.add('cart-pulse');playAddSound()}
function addLine(line){
  const found=cart.find(x=>x.key===line.key);
  if(found){
    found.quantity+=Number(line.quantity||1);
    if(line.note)found.note=line.note;
    if(Array.isArray(line.modifiers))found.modifiers=line.modifiers;
    if(line.choices)found.choices=line.choices;
  }else cart.push({...line,quantity:Number(line.quantity||1)});
  storeCart();
  cartAddFx();
}
function qty(key,delta){const x=cart.find(a=>a.key===key);if(!x)return;x.quantity+=delta;if(x.quantity<=0)cart=cart.filter(a=>a.key!==key);storeCart();renderCart()}
function removeLine(key){cart=cart.filter(a=>a.key!==key);storeCart();renderCart()}
function clearCart(){if(!cart.length)return;cart=[];storeCart();renderCart()}

/* ===== Delivery fee (data-driven; engine is the source of truth) ===== */
function selectedAreaFee(){
  if(fulfillmentType!=='Delivery')return null;
  if(!hasDeliveryAreas())return null;
  const el=document.getElementById('areaIdInput');
  const areaId=el?String(el.value||''):'';
  if(areaId){const a=deliveryAreasData.find(x=>String(x.id)===areaId);if(a)return Number(a.fee)||0;}
  const ti=document.getElementById('areaInput');
  const txt=ti?String(ti.value||'').trim().toLowerCase():'';
  if(txt){const a=deliveryAreasData.find(x=>String(x.name||'').toLowerCase()===txt);if(a)return Number(a.fee)||0;}
  return null;
}
function engineContext(){
  return (typeof PCTX!=='undefined')?PCTX:null;
}
function currentDeliveryFee(){
  const ctx=engineContext();
  if(!ctx)return 0;
  return FlameChickPricing.deliveryFeeFor(ctx,{fulfillment:fulfillmentType,areaFee:selectedAreaFee()});
}
function cartFoodDiscount(subtotal){return 0}

/* ===== Totals: one engine for cart, sticky bar, checkout and WhatsApp ===== */
function totals(){
  const ctx=engineContext();
  if(!ctx||!FlameChickPricing)return{subtotal:0,delivery:0,discount:0,deliveryKnown:true,total:0,lines:[],issues:[]};
  const res=FlameChickPricing.priceCart(ctx,cart,{fulfillment:fulfillmentType,areaFee:selectedAreaFee()});
  return{subtotal:res.subtotal,delivery:res.deliveryFee,discount:0,deliveryKnown:true,total:res.total,lines:res.lines,issues:res.issues};
}
function validateCartForCheckout(){
  const ctx=engineContext();
  if(!ctx)return{ok:false,items:[{key:null,code:'NO_CATALOG',message:'Menu data is not ready yet.'}]};
  return FlameChickPricing.validateCart(ctx,cart,{fulfillment:fulfillmentType,areaFee:selectedAreaFee()});
}