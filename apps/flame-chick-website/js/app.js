/* LEGACY / INACTIVE — DO NOT LOAD IN THE PRODUCTION STOREFRONT.
   The current index.html does not load this file. This retained historical
   implementation contains HFP/Pizza Bite-era settings and HFP staging image
   URLs. Do not re-enable it or reuse its settings without a deliberate review.
   Current storefront runtime is documented in apps/flame-chick-website/README.md. */

let menu=[],categories=[],activeCategory="",pizzaGroups=[],siteConfig={},editingKey=null;let HFP_VIEW_DEALS=[];
/* Published site-image slots are authoritative only after the catalog settles
   (health + catalog, measured 2-8 s against the staging Apps Script). Until
   then the landing hero/gate must stay neutral instead of painting the
   built-in stand-in photo (assets/about-exterior.jpg) and swapping later. */
let catalogSettled=false;
let siteImagesCache=null;let siteImagesCacheRead=false;
let PCTX=null;let modalModifierGroups=[];let modalModifierProductId=null;let mgSelection={};let dealModalState=null;
const DEFAULT_ICONS={"Pizza":"🍕","Burger":"🍔","Shawarma":"🌯","Paratha Roll":"🌯","Deals":"🔥","Fries":"🍟","Fries Items":"🍟","Beverages":"🥤","Super Deals":"🎁","Popular":"⭐","Pasta":"🍝","Ice Cream":"🍦"};
let pizzaGroupActive="";
let pizzaGroupsApi=null;
function getPizzaGroups(){return pizzaGroupsApi||{}}
function buildPizzaGroupsFromApi(subcats,menuItems){
  const pizzaRows=menuItems.filter(m=>isPizzaCat(m.CategoryID));
  const allNames=[];
  pizzaRows.forEach(m=>{const n=String(m.Name||"").trim();if(n&&allNames.indexOf(n)===-1)allNames.push(n)});
  const fallback=allNames.length?{"All":allNames}:null;
  if(!Array.isArray(subcats)||!subcats.length)return fallback;
  const active=subcats.filter(s=>isTrue(s.Active));
  if(!active.length)return fallback;
  active.sort((a,b)=>(Number(a.SortOrder)||0)-(Number(b.SortOrder)||0));
  const idToName={},groups={};
  active.forEach(s=>{const nm=String(s.Name||"");idToName[String(s.ID)]=nm;groups[nm]=[]});
  let matched=0;
  pizzaRows.forEach(m=>{
    const gName=idToName[String(m.SubcategoryID||"")];
    if(gName&&groups[gName]){
      const n=String(m.Name||"").trim();
      if(n&&groups[gName].indexOf(n)===-1){groups[gName].push(n);matched++}
    }
  });
  if(!matched)return fallback;
  return groups;
}
function isPizzaCat(id){
  const c=categories.find(c=>String(c.ID)===String(id));
  return !!c&&/pizza/i.test(String(c.Name||""));
}
/* ===== Modifier groups (catalog contract: MG-1 Extra Topping, MG-2 Ice Cream Flavour) ===== */
function modifierGroupsFor(productId){return (PCTX&&productId)?HfpPricing.groupsForProduct(PCTX,String(productId),'standalone'):[]}
function loadModalModifiers(productId){modalModifierProductId=productId?String(productId):null;modalModifierGroups=modifierGroupsFor(modalModifierProductId);mgSelection={};return modalModifierGroups}
function selectedModifierRows(){
  const out=[];
  modalModifierGroups.forEach(g=>{
    (mgSelection[g.groupId]||[]).forEach(mid=>{
      const m=(g.modifiers||[]).find(x=>x.modifierId===mid);
      if(m)out.push({groupId:g.groupId,modifierId:mid,label:dispText(m.name,(m.modifier&&m.modifier.NameUr)||'')});
    });
  });
  return out;
}
function missingRequiredGroups(){return modalModifierGroups.filter(g=>g.minSelect>0&&!(mgSelection[g.groupId]||[]).length)}
function currentModalVariantId(){
  const optSel=document.querySelector('#pizzaBody .opt.sel');
  if(optSel&&document.getElementById('pizzaModal').classList.contains('open'))return String(optSel.dataset.id||'');
  if(document.getElementById('productModal').classList.contains('open'))return String(document.getElementById('productModal').dataset.itemId||'');
  return '';
}
function modifierPriceText(g,m){
  const itemId=currentModalVariantId();
  if(!PCTX||!itemId)return m.priceMode==='BY_SIZE'?'':'';
  const r=HfpPricing.priceLine(PCTX,{key:'preview',itemId,quantity:1,modifiers:[{groupId:g.groupId,modifierId:m.modifierId,label:m.name}]});
  const dm=(r.detail.modifiers||[])[0];
  if(!dm||dm.price===null)return tr('mod.naSize');
  /* Zero-price options (ice-cream flavours) show no price text: the "Free"
     label was misleading (the option is simply included). Paid modifiers
     keep "+ Rs.X"; BY_SIZE no-size keeps mod.naSize. */
  return dm.price>0?tr('mod.plusRs')+cur()+money(dm.price):'';
}
function modifierSectionHtml(){
  if(!modalModifierGroups.length)return '';
  const body=modalModifierGroups.map(g=>{
    const hint=g.minSelect>0?tr('mod.reqHint'):(g.maxSelect===1?tr('mod.oneHint'):tr('mod.optHint'));
    return '<div class="pizza-extras-group-title" data-group="'+esc(g.groupId)+'">'+esc(dispText(g.name,(g.group&&g.group.NameUr)||g.name||''))+' <span class="pizza-extras-group-sub">'+hint+'</span></div>'
      +'<div class="pizza-extras-opts">'+g.modifiers.map(m=>{
        const price=modifierPriceText(g,m);
        return '<button type="button" class="pizza-extra-opt" data-group="'+esc(g.groupId)+'" data-mod="'+esc(m.modifierId)+'" onclick="toggleModifier(\''+esc(g.groupId)+'\',\''+esc(m.modifierId)+'\')"><b>'+esc(dispText(m.name,(m.modifier&&m.modifier.NameUr)||''))+'</b><small data-mod-price="'+esc(m.modifierId)+'">'+esc(price)+'</small></button>';
      }).join('')+'</div>';
  }).join('');
  return '<div class="pizza-extras-section" id="modifierSection">'+body+'</div>';
}
function toggleModifier(groupId,modifierId){
  const g=modalModifierGroups.find(x=>x.groupId===groupId);if(!g)return;
  const sel=(mgSelection[groupId]||[]).slice();
  const i=sel.indexOf(modifierId);
  if(g.maxSelect===1){
    if(i>=0){if(g.minSelect<1)mgSelection[groupId]=[];}
    else mgSelection[groupId]=[modifierId];
  }else{
    if(i>=0)sel.splice(i,1);
    else if(sel.length<g.maxSelect)sel.push(modifierId);
    mgSelection[groupId]=sel;
  }
  syncModifierButtons();
  updateModalPriceDisplay();
}
function syncModifierButtons(){
  document.querySelectorAll('#modifierSection .pizza-extra-opt').forEach(btn=>{
    const sel=mgSelection[btn.dataset.group]||[];
    btn.classList.toggle('sel',sel.indexOf(btn.dataset.mod)!==-1);
  });
}
function refreshModifierPriceLabels(){
  document.querySelectorAll('#modifierSection [data-mod-price]').forEach(el=>{
    const g=modalModifierGroups.find(x=>(x.modifiers||[]).some(m=>m.modifierId===el.dataset.modPrice));
    if(!g)return;
    const m=g.modifiers.find(x=>x.modifierId===el.dataset.modPrice);
    el.textContent=modifierPriceText(g,m);
  });
}
function updateModalPriceDisplay(){
  if(document.getElementById('pizzaModal').classList.contains('open'))updatePizzaPickerPrice();
  else if(document.getElementById('productModal').classList.contains('open'))updateDetailTotal();
}
const WA_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
function shareWhatsApp(id){
  const item=menu.find(x=>String(x.ID)===String(id));if(!item)return;
  const base=cfg('website_url','').replace(/\/+$/,'')||location.origin+location.pathname;
  const url=base+'?product='+encodeURIComponent(id);
  const text='Check out '+String(item.Name)+' from Flame Chick:\n'+url;
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');
}
function updatePizzaPickerPrice(){
  const b=document.querySelector('#pizzaBody .opt.sel');const s=b?pizzaGroups.find(x=>String(x.id)===String(b.dataset.id)):null;
  const qty=Math.max(1,Number(document.getElementById('pizzaQty')?.textContent||1));
  const mods=selectedModifierRows();
  let lineTotal=(s?s.price:0)*qty;
  if(PCTX&&s){
    const line=HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(s.id),quantity:qty,modifiers:mods});
    lineTotal=line.lineTotal;
  }
  const btn=document.getElementById('pickerAddBtn');
  if(btn)btn.textContent=(editingKey?tr('btn.updateCart'):tr('btn.addToCart'))+cur()+money(lineTotal);
  const el=document.getElementById('pickerPrice');if(el)el.textContent=cur()+money(lineTotal);
}
const isTrue=v=>v===true||["true","1","yes"].includes(String(v).toLowerCase());
const money=n=>(Number(n)||0).toLocaleString("en-PK",{maximumFractionDigits:0});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const cfg=(k,fb)=>siteConfig[k]||fb;
/* Phase 2D i18n helpers */
const tr=(k,p)=>HFP_I18N.t(k,p);
const isUr=()=>HFP_I18N.isUrdu();
const cur=()=>tr('currency.rs');
const dispText=(en,ur)=>(isUr()&&ur&&String(ur).trim())?String(ur).trim():String(en||'');
const dispNameOf=(o)=>o?dispText(o.Name||o.name||'',o.NameUr||o.nameUr||''):'';
const issueLocal=(i)=>HFP_I18N.issueText(i);
function resolveImage(path,fallback){
  if(path&&(path.startsWith('http://')||path.startsWith('https://')||path.startsWith('data:image/')))return path;
  /* Site-local built-in assets are served by the website itself; they must
     never be prefixed with the remote images_base_url (that produced 404s
     and ORB blocks for assets/about-*.jpg and assets/logo.png). */
  if(path&&path.startsWith('assets/'))return path;
  if(path&&/^(products|categories|deals)\/[0-9a-f-]{36}\/.+\.(?:jpe?g|png|webp)$/i.test(path)){
    const supa=HFP_CONFIG.supabaseUrl||'';
    const bucket=HFP_CONFIG.mediaBucket||'flame-chick-media';
    if(supa)return supa.replace(/\/$/,'')+'/storage/v1/object/public/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/');
  }
  const base=cfg('images_base_url','')||HFP_CONFIG.imagesBaseUrl||'';
  if(path&&base)return base.replace(/\/$/,'')+'/'+path;
  if(path)return path;
  return fallback||'';
}
/* Site image slots: authoritative current refs come only from the backend
   (settings.site_images, published current-only). The browser never builds
   or guesses slot URLs; when a slot has no current ref the caller's fallback
   (legacy settings key or built-in asset) is used — the customer website
   keeps its built-in image. */
function slotImageUrl(images,slot){
  try{
    const entry=images&&typeof images==='object'?images[slot]:null;
    const c=entry&&entry.current&&typeof entry.current==='object'?entry.current:null;
    if(c){
      const url=typeof c.url==='string'?c.url.trim():'';
      if(url)return url;
      const p=typeof c.path==='string'?c.path.trim():'';
      if(p)return resolveImage(p,'');
    }
  }catch(e){}
  return '';
}
/* Startup value of a slot, used before the catalog settles:
   - the live catalog slot if it is already known;
   - else the validated local catalog cache (a returning visitor gets the real
     image on the first frame instead of a stand-in + later swap);
   - else '' so the caller keeps its neutral background.
   Once the catalog has settled, '' means "no slot published" and the caller's
   built-in fallback becomes the final state, not a transient one. */
function siteSlotStartup(slot){
  const live=slotImageUrl(siteConfig&&siteConfig.site_images,slot);
  if(live)return live;
  if(catalogSettled)return '';
  return slotImageUrl(cachedSiteImages(),slot);
}
/* Menu logo resolution. The brand mark used to be set only from
   applySiteContent(), which runs after the catalog settles, so an owner-
   uploaded menu-logo slot appeared late (the built-in logo painted first,
   then swapped). Resolve the same dependency at parse time instead:
   live slot -> validated cached slot (returning visitor) -> published
   logo_url once settled -> the static built-in logo already in the markup.
   This is independent of siteSlotStartup(): that helper serves the landing
   hero/gate and deliberately does not paint cached values on every path. */
function menuLogoSrc(){
  const s=siteConfig||{};
  const live=slotImageUrl(s.site_images,'menu-logo');
  if(live)return live;
  if(catalogSettled)return s.logo_url?resolveImage(s.logo_url,''):'';
  return slotImageUrl(cachedSiteImages(),'menu-logo');
}
function applyMenuLogo(){
  const src=menuLogoSrc();
  if(!src)return;
  const img=document.querySelector('.brand img');
  if(img&&img.getAttribute('src')!==src)img.src=src;
}
function cachedSiteImages(){
  if(!siteImagesCacheRead){
    siteImagesCacheRead=true;
    try{
      if(typeof HfpCatalog==='undefined'||typeof HfpCatalog.readCache!=='function'||typeof localStorage==='undefined'){
        siteImagesCache=null;
      }else{
        const key=(typeof HFP_CONFIG!=='undefined'&&(HFP_CONFIG.catalogCacheKey||'flame_chick_catalog_v1'))||'flame_chick_catalog_v1';
        const fv=(typeof HFP_CONFIG!=='undefined'&&HFP_CONFIG.cacheFormatVersion!==undefined)?HFP_CONFIG.cacheFormatVersion:1;
        const entry=HfpCatalog.readCache(localStorage,key,fv);
        const s=entry&&entry.snapshot&&entry.snapshot.settings;
        siteImagesCache=(s&&s.site_images&&typeof s.site_images==='object')?s.site_images:null;
      }
    }catch(e){siteImagesCache=null}
  }
  return siteImagesCache;
}


function pizzaBiteSettings(settings){
  const s=Object.assign({},settings||{});
  const base=String(HFP_CONFIG.imagesBaseUrl||'').replace(/\/$/,'');
  const deal=(file)=>base+'/deals/'+file;
  const d1=deal('DL-1-b80480b41cf8da6b.webp');
  const d4=deal('DL-4-feb4368c092108eb.webp');
  const sd1=deal('SD-1-4407031e7c447471.jpg');
  s.restaurant_name='Flame Chick';
  s.wa_phone='923245170776';
  s.wa_phone_display='+92 324 5170776';
  s.contact_phone='0324-5170776';
  s.contact_address='Waisa, Pakistan';
  s.address='Waisa, Pakistan';
  s.footer_text_en='Flame Chick · Waisa · 0324-5170776';
  s.meta_description='Flame Chick Waisa — order pizzas, burgers, shawarmas, fries and meal deals online.';
  s.inquiryText='Hello Flame Chick, I would like to make an inquiry about your menu.';
  /* Keep the menu hero banners published in Flame Chick's catalog settings.
     The previous empty override disabled the HFP-style rotating menu slider. */
  s.menu_hero_banners=(s.menu_hero_banners&&Array.isArray(s.menu_hero_banners.slides))?s.menu_hero_banners:{slides:[]};
  /* Preserve current admin-published HFP site imagery (landing hero, gate,
     about gallery and menu hero). Only keep the menu logo Flame Chick-branded. */
  s.site_images=Object.assign({},s.site_images||{}, {
    'menu-logo':{current:{url:'assets/flame-chick-logo.svg'}}
  });
  const wb={
    landing_hero:{title_accent:{en:'PIZZA',ur:'پیزا'},title_main:{en:'BITE',ur:'بائٹ'},support:{en:'Freshly prepared pizzas, burgers and more — made hot and fresh in Waisa.',ur:'ویسا میں تازہ پیزا، برگرز اور مزیدار کھانے — گرم اور تازہ تیار۔'}},
    menu_hero:{eyebrow:{en:'Flame Chick',ur:'پیزا بائٹ'}}
  };
  s.website_content=wb;
  s.landing_header_brand='Flame Chick';
  s.landing_hero_title_accent='PIZZA';
  s.landing_hero_title_main='BITE';
  s.landing_hero_support='Freshly prepared pizzas, burgers and more — made hot and fresh in Waisa.';
  s.landing_hero_image=d1;
  s.landing_hero_image_alt='Flame Chick meal deal';
  s.landing_gate_image=d4;
  s.landing_gate_brand='Flame Chick';
  s.landing_about_heading='About Flame Chick';
  s.landing_about_description='A local favourite in Waisa — serving fresh pizzas, burgers and delicious meal deals, made to order.';
  s.landing_about_images=[
    {id:'about-main',placement:'main',image:d1,alt:'Flame Chick deal',active:true,sortOrder:1},
    {id:'about-side',placement:'side',image:sd1,alt:'Flame Chick super deal',active:true,sortOrder:2}
  ];
  s.landing_hero_hours='Waisa · Cash on Delivery';
  s.landing_footer_brand='Flame Chick';
  s.landing_footer_contact='+92 324 5170776';
  return s;
}

/* ===== Phase 2B boot: catalog-driven; no embedded menu data ===== */
function setMenuLoading(){
  const sec=document.getElementById('menuSections');
  if(sec)sec.innerHTML='<div class="menu-loading" role="status"><span class="ml-spin"></span> '+tr('menu.loading')+'</div>';
}
function inquiryHref(){
  const phone=String(WA_PHONE||'');
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent('Hello Flame Chick, I would like to make an inquiry about your menu.');
}
/* Automated-test flag (?wa_test=1): staging-guard.js then forces the test
   number on every destination and waLaunch() below keeps tests on the
   interceptable window.open path instead of the Android intent hand-off. */
function hfpWaTestMode(){
  return /(?:\?|&)wa_test=1(?:&|$)/.test(String(location.search||''));
}
/* Footer contact + footer line derive from the single authoritative config
   source (js/config.js window.WA_PHONE / PHONE_DISPLAY) — never hardcoded.
   Published settings.footer_text* (admin) still wins once the catalog loads. */
function setFooterContact(){
  const ca=document.querySelector('.footer-contact a');
  if(ca){ca.href='tel:'+String(WA_PHONE||'');ca.textContent=String(PHONE_DISPLAY||'')}
  const ft=document.querySelector('.footer');
  if(ft&&!ft.hasAttribute('data-catalog-text'))ft.textContent='Flame Chick · Waisa · '+String(PHONE_DISPLAY||'');
}
/* Test-seam navigation sink: automated tests may replace window.hfpNavigate
   to observe (and block) the Android intent hand-off. Real devices navigate
   here, which — unlike window.open — cannot be dropped by popup blockers or
   in-app browsers (the root cause of orders never reaching WhatsApp). */
window.hfpNavigate=function(url){window.location.href=String(url||'')};
function openWhatsAppUrl(url){
  const launch=HfpPricing.waLaunch(String(url||''),navigator.userAgent,hfpWaTestMode());
  if(launch.mode==='intent'){
    if(typeof window.hfpNavigate==='function')window.hfpNavigate(launch.url);
    else window.location.href=launch.url;
    return;
  }
  window.open(launch.url,'_blank','noopener');
}
setFooterContact();
function renderUnavailablePanel(state){
  document.body.classList.add('catalog-down');
  const pop=document.getElementById('popularSection');
  if(pop)pop.innerHTML='';
  const mh=document.getElementById('menuHeroFeatured');
  if(mh){mh.innerHTML='';mh.style.display='none'}
  const sec=document.getElementById('menuSections');
  if(!sec)return;
  const callHref='tel:'+String(PHONE_DISPLAY||'').replace(/[^+\d]/g,'');
  sec.innerHTML='<section class="menu-unavailable" role="status" data-state="'+esc(state)+'">'
    +'<img class="mu-logo" src="assets/flame-chick-logo.svg" alt="Flame Chick">'
    +'<h3>'+tr('na.heading')+'</h3>'
    +'<p>'+tr('na.desc')+'</p>'
    +'<div class="mu-actions">'
    +'<a class="mu-btn mu-primary" href="'+esc(inquiryHref())+'">'+tr('na.waInquiry')+'</a>'
    +'<a class="mu-btn" href="'+esc(callHref)+'">'+tr('na.call',{phone:esc(PHONE_DISPLAY)})+'</a>'
    +'<button type="button" class="mu-btn mu-retry" id="muRetry">'+tr('na.retry')+'</button>'
    +'</div></section>';
  const retry=document.getElementById('muRetry');
  if(retry)retry.addEventListener('click',function(){bootCatalog(true)});
}
function handleCatalogState(result){
  if(result&&result.state==='ready'&&result.view){
    try{
      document.body.classList.remove('catalog-down');
      applyCatalogSnapshot(result.snapshot,result.view);
      return;
    }catch(err){
      console.error('catalog apply failed',err);
      result={state:'error',error:{code:'APPLY_FAILED',message:String(err&&err.message||err)}};
    }
  }
  initUnavailableView(result||{state:'error'});
}
function initUnavailableView(result){
  const state=result.state==='unpublished'?'unpublished':'error';
  if(result.error)console.warn('Flame Chick catalog unavailable:',result.error.code||'',result.error.message||'');
  PCTX=null;
  menu=[];
  categories=[];
  activeCategory='';
  pizzaGroupsApi=null;
  pizzaGroupActive='';
  HFP_VIEW_DEALS=[];
  renderUnavailablePanel(state);
  /* The catalog settled with no data: re-run the landing renderer so the hero
     and gate end up on their built-in image as a FINAL state (no later swap)
     instead of staying on the neutral background. Same for the menu hero. */
  applyLandingWebsiteConfig();
  renderMenuHero();
}
function bootCatalog(isRetry){
  if(isRetry)setMenuLoading();
  HfpCatalog.load().then(function(res){
    catalogSettled=true;
    handleCatalogState(res);
  }).catch(function(err){
    console.error('catalog load crashed',err);
    catalogSettled=true;
    initUnavailableView({state:'error',error:{code:'LOAD_CRASH',message:String(err&&err.message||err)}});
  });
}
addEventListener("DOMContentLoaded",()=>{
  applyStaticI18n();
  if(location.hash==="#menu"){sessionStorage.setItem("flame_chick_fulfillment_type","Delivery");}
  const gate=document.getElementById('fulfillmentGate');
  if(location.hash==="#menu"){setTimeout(function(){enterMenu();},600);}
  if(sessionStorage.getItem('flame_chick_fulfillment_type')){
    gate.classList.add('hidden');
  }
  renderHours();
  setMenuLoading();
  bootCatalog(false);
});

/* ===== Catalog snapshot -> demo view-model wiring ===== */
function applyCatalogSnapshot(snap,view){
  const brandSettings=pizzaBiteSettings(view.settings||snap.settings||{});
  const brandedSnap=Object.assign({},snap,{settings:brandSettings});
  PCTX=HfpPricing.buildCatalog(brandedSnap);
  siteConfig=brandSettings;
  view.settings=brandSettings;
  /* Published bilingual website content (admin website content editor) must be
     installed BEFORE any tr()/lpText()/data-i18n render below, so landing hero,
     welcome gate and menu hero pick the EN/UR overrides for the active
     language. Empty/missing values keep the built-in dictionary copy. */
  HFP_I18N.applyContent(view.settings&&view.settings.website_content);
  /* WhatsApp/phone destination is intentionally NOT taken from the catalog:
     js/config.js window.WA_PHONE / PHONE_DISPLAY are the single authoritative
     source (owner decision 2026-10-28). settings.wa_phone in the published
     catalog is informational only and no longer decides where orders go. */
  renderHours();
  menu=view.menu.slice();
  categories=view.categories.slice();
  deliveryAreasData=view.deliveryAreas.slice();
  updateFulfillmentUI(); /* refresh selector visibility after catalog load */
  HFP_VIEW_DEALS=view.deals.slice();
  modalModifierGroups=[];modalModifierProductId=null;mgSelection={};dealModalState=null;
  pizzaGroupsApi=buildPizzaGroupsFromApi(view.subcategories,menu);
  pizzaGroupActive=Object.keys(getPizzaGroups())[0]||'';
  activeCategory='';
  editingKey=null;
  const featured=menu.filter(x=>isTrue(x.Featured));
  if(featured.length)categories.unshift({ID:'popular',Name:'Popular',SortOrder:-1,Active:true,Image:'',Subtitle:''});
  applySiteContent();
  applyLandingWebsiteConfig();
  /* Re-apply data-i18n nodes (menu hero, gate, header) AFTER the content
     renderers so published overrides win over any legacy settings text. */
  applyStaticI18n();
  if(view.settings&&view.settings.footer_text_en)lpText('lpFooterContact',view.settings.footer_text_en);
  if(view.settings&&view.settings.address)injectLocationInfoCard(view.settings.address);
  const note=document.getElementById('menuNote');
  if(note)note.textContent=view.products.length+' live items';
  if(categories.length){activeCategory=String((categories.find(c=>String(c.ID)!=='popular')||categories[0]).ID)}
  const restored=restoreStoredCart(PCTX);
  renderCategories();render();renderCart();observeSections();
  if(restored.restored&&restored.dropped&&restored.dropped.length){
    showToast(tr('toast.cartUpdated'),restored.dropped.map(d=>d.message).slice(0,2).join(' '));
  }else if(restored.restored&&restored.versionChanged){
    showToast(tr('toast.cartRefreshed'),tr('toast.cartRefreshedSub'));
  }
  handleSharedProductLink();
}
/* ===== Find Us card graphics (owner request 2026-11-08, inline SVG only) ===== */
/* Every known info-card kind paints a soft hand-authored background graphic
   (data-info-kind) plus a crisp SVG badge icon instead of the emoji: Location
   = stylized map with a brand-red pin, Call Us = red-tinted "sound wave"
   background, WhatsApp = green-tinted background, and the 4th card (Opening
   Hours, also 2026-11-08) = amber-tinted background with a clock badge.
   Unknown/admin-configured cards keep the emoji rendering unchanged. The
   SVGs carry their own tints, so no kind-specific CSS paint is needed. */
const LP_INFO_ART={
  location:'<svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="140" fill="#f4efe6"/><path d="M0 52h200v18H0z" fill="#ffffff"/><path d="M76 0h20v140H76z" fill="#ffffff"/><path d="M146 0h12v140h-12z" fill="#ffffff"/><path d="M0 118h200v22H0z" fill="#ffffff" opacity=".65"/><rect x="118" y="12" width="34" height="30" rx="4" fill="#7d9b6a" opacity=".3"/><rect x="158" y="98" width="30" height="26" rx="4" fill="#C8102E" opacity=".1"/><ellipse cx="95" cy="78" rx="9" ry="3" fill="#000000" opacity=".12"/><path d="M95 78c8.5-9.8 14-16.6 14-23.2a14 14 0 1 0-28 0C81 61.4 86.5 68.2 95 78z" fill="#C8102E"/><circle cx="95" cy="54.5" r="5.4" fill="#ffffff"/></svg>',
  call:'<svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="140" fill="#f7f3f4"/><circle cx="176" cy="16" r="46" fill="#C8102E" opacity=".08"/><circle cx="16" cy="128" r="52" fill="#C8102E" opacity=".07"/><circle cx="100" cy="70" r="34" fill="none" stroke="#C8102E" stroke-width="10" opacity=".06"/><path d="M138 32a38 38 0 0 1 0 48" stroke="#C8102E" opacity=".16" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M152 24a58 58 0 0 1 0 64" stroke="#C8102E" opacity=".09" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M62 108a38 38 0 0 1 0-48" stroke="#C8102E" opacity=".16" fill="none" stroke-width="5" stroke-linecap="round"/></svg>',
  whatsapp:'<svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="140" fill="#f1f7f3"/><circle cx="176" cy="16" r="46" fill="#25D366" opacity=".1"/><circle cx="16" cy="128" r="52" fill="#1DAB54" opacity=".08"/><circle cx="100" cy="70" r="34" fill="none" stroke="#25D366" stroke-width="10" opacity=".07"/><path d="M138 32a38 38 0 0 1 0 48" stroke="#25D366" opacity=".16" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M152 24a58 58 0 0 1 0 64" stroke="#25D366" opacity=".09" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M62 108a38 38 0 0 1 0-48" stroke="#25D366" opacity=".16" fill="none" stroke-width="5" stroke-linecap="round"/></svg>',
  hours:'<svg viewBox="0 0 200 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="140" fill="#f7f4ed"/><circle cx="176" cy="16" r="46" fill="#F59E0B" opacity=".1"/><circle cx="16" cy="128" r="52" fill="#B45309" opacity=".07"/><circle cx="100" cy="70" r="34" fill="none" stroke="#F59E0B" stroke-width="10" opacity=".07"/><path d="M138 32a38 38 0 0 1 0 48" stroke="#F59E0B" opacity=".18" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M152 24a58 58 0 0 1 0 64" stroke="#F59E0B" opacity=".1" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M62 108a38 38 0 0 1 0-48" stroke="#F59E0B" opacity=".18" fill="none" stroke-width="5" stroke-linecap="round"/></svg>'
};
const LP_INFO_ICON={
  location:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/></svg>',
  call:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
  whatsapp:WA_SVG,
  hours:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
/* Which visual kind a Find Us card is. Admin cards (cashOnDelivery etc.) keep
   their emoji: only the id/kind values below get graphics. */
function lpInfoKindOf(c){
  const k=String(c&&c.kind||'').toLowerCase();
  if(LP_INFO_ART[k])return k;
  const id=String(c&&c.id||'').toLowerCase();
  if(id==='location')return 'location';
  if(id==='phone'||id==='callus')return 'call';
  if(id==='whatsapp')return 'whatsapp';
  if(id==='hours')return 'hours';
  return '';
}
/* Card inner layout: background art, badge icon, label, value — and the
   merged-hours note for the Opening Hours card. The hours card is fully
   code-generated (c.value ignored) per the owner rule 2026-11-04: one merged
   section whose "Delivery until" cut-off is always present so the site never
   implies delivery after 10 PM. The .js-hours / .js-hours-delivery spans are
   filled by renderHours() so settings.opening_hours / delivery_hours still
   win once the catalog supplies them. Everything else is escaped. */
function lpInfoCardElems(c){
  const kind=String(c&&c.kind||'');
  const art=kind?'<div class="lp-info-art">'+LP_INFO_ART[kind]+'</div>':'';
  const icon=kind
    ?'<div class="lp-info-icon lp-info-icon-badge">'+(LP_INFO_ICON[kind]||esc(c.icon||''))+'</div>'
    :'<div class="lp-info-icon">'+esc(c.icon||'')+'</div>';
  const label='<div class="lp-info-label">'+esc(c.label||c.name||'')+'</div>';
  let valueHtml=esc(c.value||c.description||'');
  let noteHtml='';
  if(kind==='hours'){
    valueHtml='<span class="js-hours"></span>';
    noteHtml='<div class="lp-info-note">'+esc(tr('hours.deliveryUntil'))+' <span class="js-hours-delivery"></span></div>';
  }
  return art+icon+label+'<div class="lp-info-value">'+valueHtml+'</div>'+noteHtml;
}
function injectLocationInfoCard(address){
  const grid=document.getElementById('lpInfoGrid');if(!grid)return;
  if(grid.querySelector('[data-info-card="location"]'))return;
  const card=document.createElement('a');
  card.href='https://maps.google.com/?q='+encodeURIComponent(String(address));
  card.target='_blank';card.rel='noopener';
  card.className='lp-info-card';card.setAttribute('data-info-card','location');
  /* Same Find Us card treatment as renderLandingInfo: inline-SVG map graphic
     as the card background + a crisp map-pin badge (no emoji). */
  card.setAttribute('data-info-kind','location');
  card.innerHTML=lpInfoCardElems({kind:'location',label:tr('landing.info.location'),value:String(address)});
  grid.insertBefore(card,grid.firstChild);
}
function handleSharedProductLink(){
  const sharedId=new URLSearchParams(location.search).get('product');
  if(!sharedId)return;
  const sharedItem=menu.find(x=>String(x.ID)===String(sharedId));
  if(sharedItem){
    const group=menu.filter(x=>String(x.CategoryID)===String(sharedItem.CategoryID)&&String(x.Name).trim()===String(sharedItem.Name).trim()).sort((a,b)=>(Number(a.Price)||0)-(Number(b.Price)||0));
    if(group.length>1)openPizza(String(sharedItem.Name),group.map(x=>({id:String(x.ID),label:String(x.Description||''),price:Number(x.Price)||0})),String(sharedItem.ID));
    else openProduct(String(sharedItem.ID),false);
  }
  history.replaceState(null,'',location.pathname);
}

/* Menu hero background — same discipline as the landing hero:
   - while the catalog is loading the box stays fully NEUTRAL: no stock photo
     and no cached slot image (owner decision 2026-11-06 — the old pizza photo
     must not flash before the slider comes up);
   - the stock photo (.hero-stock in css/styles.css) is applied only once the
     catalog has settled (or failed) with no slot published — a FINAL state,
     never an intermediate one.
   - If menu_hero_banners are present in settings, the slider REPLACES the
     hero-food entirely (no flash: slider is hidden in markup, shown only after
     banner data is confirmed). The hero-food.hero-stock remains as final fallback.
*/
function renderMenuHero(){
  const slider = document.querySelector('.hero-slider');
  const fallback = document.querySelector('.hero-food.hero-bg');
  if(!slider && !fallback) return;

  const s = siteConfig || {};
  const bannerSlides = s.menu_hero_banners && Array.isArray(s.menu_hero_banners.slides) ? s.menu_hero_banners.slides.filter(function (slide) { return slide && slide.enabled !== false; }) : [];

  /* Catalog still loading: keep the box fully neutral — no stock photo and no
     cached slot image. Owner-facing rule: nothing paints until the data is in
     (the old pizza photo must never flash while the slider is coming up). */
  if (!catalogSettled) {
    if (slider) slider.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.style.backgroundImage = '';
      fallback.removeAttribute('data-hero-src');
      fallback.classList.remove('hero-stock');
    }
    return;
  }

  // If we have banner slides, initialize the slider and hide fallback
  if (bannerSlides && bannerSlides.length && window.HfpHeroSlider) {
    if (fallback) fallback.hidden = true;
    slider.hidden = false;
    window.HfpHeroSlider.init(bannerSlides);
    return;
  }

  // No banner slides: destroy any existing slider, show fallback with existing logic
  if (window.HfpHeroSlider) window.HfpHeroSlider.destroy();
  if (slider) slider.hidden = true;
  if (fallback) fallback.hidden = false;

  // Original single-image logic for fallback (only runs once catalogSettled,
  // so siteSlotStartup('menu-hero') resolves to '' here by design)
  const src = siteSlotStartup('menu-hero') || (catalogSettled && s.hero_image ? resolveImage(s.hero_image, '') : '');
  if (src) {
    fallback.classList.remove('hero-stock');
    if (fallback.getAttribute('data-hero-src') === src) return;
    const p = new Image();
    p.onload = function(){
      fallback.style.backgroundImage = 'url("' + src + '")';
      fallback.setAttribute('data-hero-src', src);
    };
    p.src = src;
  } else if (catalogSettled) {
    fallback.style.backgroundImage = '';
    fallback.removeAttribute('data-hero-src');
    fallback.classList.add('hero-stock');
  }
}
function applySiteContent(){
  const s=siteConfig;
  if(s.hero_heading)document.querySelector(".hero h1").textContent=s.hero_heading;
  if(s.hero_subtitle)document.querySelector(".hero p").textContent=s.hero_subtitle;
  if(s.hero_button_label)document.querySelector(".hero .order").textContent=s.hero_button_label;
  renderMenuHero();
  if(s.hero_eyebrow)document.querySelector(".eyebrow").textContent=s.hero_eyebrow;
  if(s.restaurant_name){const bt=document.querySelector(".brand-text");if(bt)bt.textContent=s.restaurant_name}
  {applyMenuLogo()}
  if(s.footer_text||s.footer_text_en){const ft=document.querySelector(".footer");if(ft){ft.setAttribute("data-catalog-text","1");ft.textContent=s.footer_text||s.footer_text_en}}
  {setFooterContact()}
  if(s.meta_description)document.querySelector('meta[name="description"]').content=s.meta_description;
}
/* Owner-approved business hours, shown as ONE merged section (2026-11-04):
   the headline window is the restaurant's 11:00 AM – 11:00 PM and delivery's
   10:00 PM cutoff is an explicit "Delivery until" note, so the site never
   implies delivery after 10 PM. settings.opening_hours / settings.delivery_hours
   win when a catalog supplies them; older catalogs fall back to config.js. The
   values are language-neutral; the labels localize via hours.both /
   hours.deliveryUntil. */
function hoursEnd(v){
  const p=String(v).split(/\s*[–—-]\s*/);
  return (p.length>1?p[p.length-1]:p[0]).trim();
}
function renderHours(){
  const open=String((siteConfig&&siteConfig.opening_hours)||OPENING_HOURS||RESTAURANT_HOURS);
  const del=String((siteConfig&&siteConfig.delivery_hours)||DELIVERY_HOURS);
  document.querySelectorAll('.js-hours').forEach(function(el){el.textContent=open});
  document.querySelectorAll('.js-hours-delivery').forEach(function(el){el.textContent=hoursEnd(del)});
}

/* ===== Delivery areas (searchable picker uses the authoritative Area ID) ===== */
/* Flame Chick demo: free-form locality/address; no zone lookup is required. */
function renderAreaList(){closeAreaList()}
function closeAreaList(){const el=document.getElementById('areaList');if(el)el.classList.remove('open')}
function pickArea(id,name){
  const input=document.getElementById('areaInput');
  if(input)input.value=name||'';
  renderCart();
}

function renderCategories(){
  const bar=document.getElementById("categoryBar");
  let html='';
  categories.filter(c=>String(c.ID)!=="popular"&&!/extra/i.test(c.Name)).forEach(c=>{
    html+='<button class="cat-pill '+(activeCategory===String(c.ID)?'active':'')+'" data-cat="'+esc(String(c.ID))+'" onclick="chooseCategory(\''+esc(String(c.ID))+'\')">'+(DEFAULT_ICONS[c.Name]||'\ud83c\udf7d\ufe0f')+' '+esc(dispNameOf(c))+'</button>';
  });
  bar.innerHTML=html;
  centerActiveCategory(bar);
}
/* Give the strip start/end padding of half the strip minus the edge pill, so
   the FIRST and LAST pills also have room to scroll into the exact middle
   (without it, pills near the content edges are always clamped off-center).
   The padding is kept in sync with pill widths via a cheap change-guard. */
function fitCategoryBarEnds(bar){
  const strip=bar&&bar.id?bar:document.getElementById("categoryBar");
  if(!strip)return;
  const pills=strip.querySelectorAll(".cat-pill");
  if(!pills.length){strip.style.paddingInline="";delete strip.dataset.fitPad;return;}
  const boxW=strip.getBoundingClientRect().width;
  /* Hidden strip (landing page): measure nothing and record no key, so the
     next call once the menu is visible computes the real padding. */
  if(boxW<1)return;
  const firstW=pills[0].getBoundingClientRect().width;
  const lastW=pills[pills.length-1].getBoundingClientRect().width;
  const start=Math.max(0,Math.round((boxW-firstW)/2));
  const end=Math.max(0,Math.round((boxW-lastW)/2));
  const key=start+"|"+end;
  if(strip.dataset.fitPad===key)return;
  strip.dataset.fitPad=key;
  strip.style.paddingInline=start+"px "+end+"px";
}
function centerActiveCategory(bar){
  if(!bar)bar=document.getElementById("categoryBar");
  if(!bar)return;
  fitCategoryBarEnds(bar);
  const activeBtn=bar.querySelector('.cat-pill.active');
  if(!activeBtn)return;
  const barRect=bar.getBoundingClientRect();
  const btnRect=activeBtn.getBoundingClientRect();
  /* ALWAYS center the selected pill (not only when it is out of view).
     The strip scrolls horizontally so the active category ends up in the
     middle of the bar. Measured empirically in ltr and rtl: moving the
     strip scroll by -delta shifts the pill by +delta. The result is
     clamped to the strip's scroll range, so first/last pills stop at
     the nearest reachable position instead of bouncing. */
  const delta=(bar.clientWidth-btnRect.width)/2-(btnRect.left-barRect.left);
  if(Math.abs(delta)<1)return;
  const rtl=getComputedStyle(bar).direction==='rtl';
  let left=bar.scrollLeft-delta;
  const max=Math.max(0,bar.scrollWidth-bar.clientWidth);
  const lo=rtl?-max:0,hi=rtl?0:max;
  left=Math.max(lo,Math.min(left,hi));
  if(Math.abs(left-bar.scrollLeft)<1)return;
  bar.scrollTo({left:left,behavior:'smooth'});
}
/* Target-aware programmatic navigation state: set by chooseCategory while a
   section smooth-scroll is in flight, cleared when the scroll completes
   (scrollend), when the user takes over scrolling (wheel/touch), or via a
   bounded fallback timer. While set, the section observer must not change the
   active pill — intermediate observer ticks are what used to revert the pill
   to Super Deals mid-navigation. */
let navTarget=null;
let navFallbackTimer=0;
function endCategoryNav(){
  if(navFallbackTimer){clearTimeout(navFallbackTimer);navFallbackTimer=0}
  const target=navTarget;
  navTarget=null;
  if(!target)return;
  activeCategory=target;
  document.querySelectorAll('.cat-pill').forEach(p=>p.classList.toggle('active',String(p.dataset.cat)===target));
  centerActiveCategory();
}
addEventListener('scrollend',()=>{if(navTarget)endCategoryNav()});
addEventListener('wheel',()=>{if(navTarget)endCategoryNav()},{passive:true});
addEventListener('touchmove',()=>{if(navTarget)endCategoryNav()},{passive:true});

/* Refit the strip's centering padding when layout inputs change (device
   rotation/resizing, and the Urdu webfont finishing loading alters pill
   widths). Debounced; idempotent when widths did not change. */
let catFitTimer=null;
addEventListener('resize',()=>{
  if(catFitTimer)clearTimeout(catFitTimer);
  catFitTimer=setTimeout(()=>centerActiveCategory(document.getElementById('categoryBar')),150);
},{passive:true});
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(()=>centerActiveCategory(document.getElementById('categoryBar')));
}
function chooseCategory(id){
  activeCategory=String(id);renderCategories();
  const el=document.getElementById("section-"+id);
  if(!el)return;
  navTarget=String(id);
  if(navFallbackTimer)clearTimeout(navFallbackTimer);
  navFallbackTimer=setTimeout(endCategoryNav,3000);
  el.scrollIntoView({behavior:"smooth",block:"start"});
}
function choosePizzaGroup(name){pizzaGroupActive=name;render()}

function render(){
  const popularSections=[];
  const menuSections=[];
  categories.forEach(cat=>{
    if(String(cat.ID)==="popular"){
      const items=menu.filter(x=>isTrue(x.Featured));
      if(items.length)popularSections.push(sectionHtml(cat,items));
      return;
    }
    const items=menu.filter(x=>String(x.CategoryID)===String(cat.ID)&&(!isPizzaCat(cat.ID)||pizzaGroupVisible(x)));
    const catDeals=HFP_VIEW_DEALS.filter(d=>String(d.CategoryID)===String(cat.ID));
    if(!items.length&&!catDeals.length)return;
    let html='';
    if(items.length)html+=sectionHtml(cat,items);
    if(catDeals.length)html+=dealSectionHtml(cat,catDeals);
    menuSections.push(html);
  });
  document.getElementById("popularSection").innerHTML=popularSections.join("");
  document.getElementById("menuSections").innerHTML=menuSections.join("")||'<div style="padding:24px;text-align:center;color:#888">'+tr('menu.noMatch')+'</div>';
  requestAnimationFrame(observeSections);
}
function pizzaGroupVisible(x){
  const gn=getPizzaGroups()[pizzaGroupActive]||[];
  return gn.indexOf(String(x.Name||'').trim())!==-1;
}

function sectionHtml(cat,items){
  const isPizza=isPizzaCat(cat.ID);
  const isPopular=String(cat.ID)==="popular";
  const body=groupCards(items);
  const iconSrc=resolveImage(cat.Image,'');
  const icon=iconSrc?'<img src="'+esc(iconSrc)+'" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:6px" onerror="this.parentNode.textContent=\''+(DEFAULT_ICONS[cat.Name]||'\ud83c\udf7d\ufe0f')+'\'">':(DEFAULT_ICONS[cat.Name]||'\ud83c\udf7d\ufe0f');
  const tabs=isPizza?'<div class="pizza-tabs">'+Object.keys(getPizzaGroups()).map(n=>'<button class="pizza-tab '+(n===pizzaGroupActive?'active':'')+'" onclick="choosePizzaGroup(\''+esc(n)+'\')">'+esc(n)+'</button>').join('')+'</div>':'';
  return '<section class="category-section" id="section-'+esc(String(cat.ID))+'" data-cat-id="'+esc(String(cat.ID))+'"><div class="section-head"><div class="section-title-wrap"><div class="section-icon">'+icon+'</div><h3 class="section-title">'+esc(dispNameOf(cat))+'</h3></div><button class="view-all" onclick="chooseCategory(\''+esc(String(cat.ID))+'\')">'+(isPopular?tr('menu.seeAll'):tr('menu.browse'))+'</button></div>'+tabs+'<div class="grid">'+body+'</div></section>';
}
function groupByName(items){const g={};items.forEach(x=>(g[String(x.Name||'').trim()]??=[]).push(x));return Object.values(g).map(a=>a.sort((x,y)=>(Number(x.Price)||0)-(Number(y.Price)||0)))}

function groupCards(items){
  return groupByName(items).map(group=>{
    const first=group[0];
    if(group.length<2)return productCard(first,cur()+money(first.Price),false,null,null);
    const sizes=group.map(x=>({id:String(x.ID),label:String(x.Description||''),price:Number(x.Price)||0}));
    const rawName=String(first.Name||'');
    const sizesHtml='<div class="card-sizes">'+sizes.map(s=>{
      const call='openPizza('+JSON.stringify(rawName)+','+JSON.stringify(sizes)+','+JSON.stringify(s.id)+')';
      return '<button type="button" class="card-size-btn" onclick="event.stopPropagation();'+esc(call)+'">'+esc(shortSize(s.label))+'</button>';
    }).join('')+'</div>';
    return productCard(first,cur()+money(sizes[0].price),true,sizes,sizesHtml);
  }).join("");
}

function productCard(x,priceText,isPizza,sizes,sizesHtml){
  const featured=isTrue(x.Featured),cat=categoryName(x.CategoryID);
  const photo=productImage(cat,String(x.Name),String(x.ID));
  const tag=featured?'<span class="tag">'+tr('menu.popularTag')+'</span>':'';
  const avail=isTrue(x.Available);
  const open=avail?esc('openProduct('+JSON.stringify(String(x.ID))+','+(isPizza?'true':'false')+')'):'';
  const btn=avail?(isPizza?'<button type="button" class="add" onclick="event.stopPropagation();'+open+'">'+tr('menu.selectSize')+'</button>':'<button type="button" class="add" onclick="event.stopPropagation();'+open+'">'+tr('menu.add')+'</button>'):'<span class="unavailable-chip">'+tr('menu.unavailable')+'</span>';
  const desc=esc(dispText(x.Desc||x.Description||'',x.DescUr||''));
  const priceHtml='<span class="price">'+esc(priceText)+'</span>';
  return '<article class="card" tabindex="0" role="button" data-menu-id="'+esc(String(x.ID))+'" onclick="'+open+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+open+'}"><div class="art">'+tag+'<img class="product-photo" src="'+photo+'" alt="'+esc(dispNameOf(x))+'" loading="lazy" referrerpolicy="no-referrer"></div><div class="card-body"><div class="name">'+esc(dispNameOf(x))+'</div>'+(desc?'<div class="desc">'+desc+'</div>':'')+(sizesHtml||'')+'<div class="bottom">'+priceHtml+btn+'</div></div></article>';
}
function shortSize(s){const t=String(s||'').toLowerCase().trim();if(t.includes('extra large')||t.startsWith('x.')||t==='xl'||t.startsWith('x '))return'XL';if(t.includes('small'))return'S';if(t.includes('regular'))return'R';if(t.includes('large'))return'L';if(t.includes('jumbo'))return'J';if(t.includes('medium'))return'M';return t.replace(/\s+/g,' ').slice(0,5)}
function categoryName(id){return (categories.find(c=>String(c.ID)===String(id))||{}).Name||''}

function productImage(category,name,id){
  const key=String(name||'').toLowerCase().trim();
  /* Neutral, locally served fallback (assets/placeholder.svg). Used where no
     approved Flame Chick product photo exists (Ice Cream, Shawarma's removed hotlink)
     and as the never-empty safety net so a card can't render src="". It must
     not be a stock food photo standing in for an Flame Chick product. */
  const PLACEHOLDER='assets/placeholder.svg';
  const item=menu.find(x=>String(x.ID)===String(id));
  const apiImg=resolveImage(item&&item.Image?String(item.Image).trim():'','');
  if(apiImg)return apiImg;
  /* Published GitHub image (ImagePublished=true from the catalog snapshot).
     The server records the exact stored path in ImageCurrentPath
     (images/<folder>/<group>[-<hash16>].<ext>); the extension is
     server-controlled (jpg|png|webp) from byte-signature detection. The
     previous (backup) image is never displayed here. */
  if(item&&item.ImagePublished){
    const cur=item.ImageCurrentPath?String(item.ImageCurrentPath).trim():'';
    if(cur){const u=resolveImage(cur,'');if(u)return u}
    if(item.ImageFolderKey&&item.ImageGroupID){
      const ext=(item.ImageExtension||'jpg').toLowerCase().trim();
      const pubPath='images/'+String(item.ImageFolderKey).trim()+'/'+String(item.ImageGroupID).trim()+'.'+ext;
      const pubUrl=resolveImage(pubPath,'');
      if(pubUrl)return pubUrl;
    }
  }
  const pizza={
    'chicken supreme':'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
    'chicken tikka':'https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=600&q=80',
    'chicken fajita':'https://images.unsplash.com/photo-1566843972142-a7fcb70de55a?auto=format&fit=crop&w=600&q=80',
    'hot & spicy':'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=600&q=80',
    'malai boti':'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=600&q=80',
    'crown crust pizza':'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'
  };
  if(category==='Pizza') return pizza[key] || pizza['chicken supreme'];
  if(category==='Burger'){
    const map={
      'zinger burger':'https://images.unsplash.com/photo-1778449690398-25637cfdb822?auto=format&fit=crop&w=600&q=80',
      'zinger cheese burger':'https://images.unsplash.com/photo-1777634659945-fae3d53ea1dd?auto=format&fit=crop&w=600&q=80',
      'chicken burger':'https://images.unsplash.com/photo-1778449690398-25637cfdb822?auto=format&fit=crop&w=600&q=80',
      'chicken cheese burger':'https://images.unsplash.com/photo-1777634659945-fae3d53ea1dd?auto=format&fit=crop&w=600&q=80'
    };
    return map[key] || 'https://images.unsplash.com/photo-1778449690398-25637cfdb822?auto=format&fit=crop&w=600&q=80';
  }
  if(category==='Shawarma') return PLACEHOLDER;
  if(category==='Paratha Roll') return 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80';
  if(category==='Fries'||category==='Fries Items') return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80';
  if(category==='Crispy Crunch') return 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=600&q=80';
  if(category==='Pasta') return 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=600&q=80';
  if(category==='Ice Cream') return PLACEHOLDER;
  return PLACEHOLDER;
}

function openPizza(name,sizes,selectedId){
  pizzaGroups=sizes;
  const chosen=sizes.find(s=>String(s.id)===String(selectedId))||sizes[0];
  const chosenRow=menu.find(x=>String(x.ID)===String(chosen.id));
  loadModalModifiers(chosenRow?chosenRow.ProductID:'');
  const photo=productImage(categoryName((chosenRow||{}).CategoryID),String(name),String(chosen.id));
  const extrasHtml=modifierSectionHtml();
  document.getElementById("pizzaTitle").textContent=name;
  const shareId=String(chosen.id);
  const initTotal=PCTX?HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(chosen.id),quantity:1,modifiers:[]}).lineTotal:chosen.price;
  document.getElementById("pizzaBody").innerHTML='<div class="pizza-detail"><div class="pizza-detail-media"><img src="'+photo+'" alt="'+esc(name)+'" loading="eager" referrerpolicy="no-referrer"></div><div class="pizza-detail-copy"><h4>'+esc(name)+'</h4>'+(String(chosen.Desc||'').trim()?'<p>'+esc(chosen.Desc)+'</p>':'')+'</div></div><div class="option-title">'+tr('menu.chooseSize')+'</div><div class="options">'+sizes.map(s=>'<button type="button" class="opt '+(String(s.id)===String(chosen.id)?'sel':'')+'" data-id="'+esc(s.id)+'" onclick="selectPizzaSize(this)"><b>'+esc(shortSize(s.label))+'</b><small>'+cur()+money(s.price)+'</small></button>').join('')+'</div>'+(extrasHtml?'<div class="pizza-extras-section-host">'+extrasHtml+'</div>':'')+'<div class="special-instructions"><label>'+tr('modal.specialInstructions')+'</label><textarea id="pizzaNote" placeholder="'+tr('modal.specialPhLong')+'" rows="2"></textarea></div><div class="picker-bottom"><a class="picker-whatsapp" href="javascript:void(0)" onclick="shareWhatsApp(\''+esc(shareId)+'\')">'+WA_SVG+' '+tr('modal.share')+'</a><div class="picker-qty"><button type="button" onclick="changePizzaQty(-1)">−</button><span id="pizzaQty">1</span><button type="button" onclick="changePizzaQty(1)">+</button></div><button type="button" class="picker-add" onclick="confirmPizza(\''+esc(name)+'\')" id="pickerAddBtn">'+(editingKey?tr('btn.updateCart'):tr('btn.addToCart'))+cur()+money(initTotal)+'</button></div>';
  openModal('pizzaModal');
  refreshModifierPriceLabels();
}

function changePizzaQty(delta){
  const el=document.getElementById('pizzaQty');if(!el)return;
  const next=Math.max(1,Number(el.textContent||1)+delta);
  el.textContent=next;
  updatePizzaPickerPrice();
}
function selectPizzaSize(btn){
  document.querySelectorAll('#pizzaBody .opt').forEach(x=>x.classList.remove('sel'));
  btn.classList.add('sel');
  updatePizzaPickerPrice();
  refreshModifierPriceLabels();
  tapFeedback(btn);
}
function confirmPizza(name){
  const b=document.querySelector('#pizzaBody .opt.sel');if(!b)return;
  const s=pizzaGroups.find(x=>String(x.id)===String(b.dataset.id));if(!s)return;
  const missing=missingRequiredGroups();
  if(missing.length){
    showToast(tr('mod.choose',{name:missing[0].name}),tr('mod.selectOne',{name:missing[0].name}));
    const sec=document.getElementById('modifierSection');
    if(sec)sec.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const mods=selectedModifierRows();
  const img=document.querySelector('#pizzaModal .pizza-detail-media img');
  const note=(document.getElementById('pizzaNote')?.value||'').trim();
  const qty=Math.max(1,Number(document.getElementById('pizzaQty')?.textContent||1));
  if(PCTX){
    const priced=HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(s.id),quantity:qty,modifiers:mods});
    if(!priced.ok){showToast(tr('toast.cannotAdd'),issueLocal(priced.issues[0]));return}
  }
  const newKey=productLineKey(String(s.id),mods.map(m=>m.modifierId));
  if(editingKey){cart=cart.filter(x=>x.key!==editingKey);editingKey=null;storeCart()}
  const srcRow=menu.find(x=>String(x.ID)===String(s.id));
  addLine({kind:'product',key:newKey,itemId:String(s.id),productId:modalModifierProductId||'',name,variant:s.label,quantity:qty,price:s.price,category:srcRow?categoryName(srcRow.CategoryID):'Pizza',note,modifiers:mods.length?mods:undefined});
  mgSelection={};
  flyToCart(img);
  closeModal('pizzaModal');
}

function openProduct(id,isPizza){
  const item=menu.find(x=>String(x.ID)===String(id));
  if(!item)return;
  const cat=categoryName(item.CategoryID);
  const group=menu.filter(x=>String(x.CategoryID)===String(item.CategoryID)&&String(x.Name).trim()===String(item.Name).trim()).sort((a,b)=>(Number(a.Price)||0)-(Number(b.Price)||0));
  if(group.length>1){
    openPizza(String(item.Name),group.map(x=>({id:String(x.ID),label:String(x.Description||''),price:Number(x.Price)||0})),String(item.ID));
    return;
  }
  loadModalModifiers(item.ProductID);
  const price=Number(item.Price)||0;
  const photo=productImage(cat,String(item.Name),String(item.ID));
  const desc=dispText(item.Desc||'',item.DescUr||'');
  const groupsHtml=modifierSectionHtml();
  const initTotal=PCTX?HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(item.ID),quantity:1,modifiers:[]}).lineTotal:price;
  document.getElementById('productTitle').textContent=dispNameOf(item);
  document.getElementById('productBody').innerHTML='<div class="product-detail"><div class="product-detail-media"><img src="'+photo+'" alt="'+esc(dispNameOf(item))+'" loading="eager" referrerpolicy="no-referrer"></div><div class="product-detail-info"><h2>'+esc(dispNameOf(item))+'</h2>' + (desc?'<div class="product-description">'+esc(desc)+'</div>':'') + '<div class="detail-price">'+cur()+money(price)+'</div><div class="detail-label">'+tr('modal.qty')+'</div><div class="detail-qty"><div class="qty"><button type="button" onclick="changeDetailQty(-1)">−</button><span id="detailQty">1</span><button type="button" onclick="changeDetailQty(1)">+</button></div></div>'+groupsHtml+'</div></div><div class="special-instructions"><label>'+tr('modal.specialInstructions')+'</label><textarea id="productNote" placeholder="'+tr('modal.specialPh')+'" rows="1"></textarea></div><div class="detail-bottom"><a class="detail-share whatsapp" href="javascript:void(0)" onclick="shareWhatsApp(\''+esc(String(item.ID))+'\')">'+WA_SVG+' '+tr('modal.whatsapp')+'</a><button type="button" class="detail-add" onclick="confirmProduct(\''+esc(String(item.ID))+'\')">'+(editingKey?tr('btn.updateCartDot'):tr('btn.addToCartDot'))+cur()+'<span id="detailTotal">'+money(initTotal)+'</span></button></div>';
  document.getElementById('productModal').dataset.itemId=String(item.ID);
  document.getElementById('productModal').dataset.price=String(price);
  openModal('productModal');
  refreshModifierPriceLabels();
}
function changeDetailQty(delta){
  const qtyEl=document.getElementById('detailQty');if(!qtyEl)return;
  const next=Math.max(1,Number(qtyEl.textContent||1)+delta);qtyEl.textContent=next;
  updateDetailTotal();
}
function updateDetailTotal(){
  const qtyEl=document.getElementById('detailQty');if(!qtyEl)return;
  const qty=Math.max(1,Number(qtyEl.textContent||1));
  const id=document.getElementById('productModal').dataset.itemId;
  const mods=selectedModifierRows();
  let total=Number(document.getElementById('productModal').dataset.price||0)*qty;
  if(PCTX&&id){
    const line=HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(id),quantity:qty,modifiers:mods});
    total=line.lineTotal;
  }
  const totalEl=document.getElementById('detailTotal');if(totalEl)totalEl.textContent=money(total);
  const btn=document.querySelector('.detail-add');
  if(btn)btn.innerHTML=(editingKey?tr('btn.updateCartDot'):tr('btn.addToCartDot'))+cur()+'<span id="detailTotal">'+money(total)+'</span>';
}
function displayVariantLabel(value){
  const label=String(value??'').trim();
  // "Regular" is the internal default price row, not a customer-selectable size.
  return /^regular$/i.test(label)?'':label;
}
function confirmProduct(id){
  const item=menu.find(x=>String(x.ID)===String(id));if(!item)return;
  const missing=missingRequiredGroups();
  if(missing.length){
    showToast(tr('mod.choose',{name:missing[0].name}),tr('mod.selectOne',{name:missing[0].name}));
    const sec=document.getElementById('modifierSection');
    if(sec)sec.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const mods=selectedModifierRows();
  const quantity=Math.max(1,Number(document.getElementById('detailQty').textContent||1));
  if(PCTX){
    const priced=HfpPricing.priceLine(PCTX,{key:'preview',itemId:String(item.ID),quantity,modifiers:mods});
    if(!priced.ok){showToast(tr('toast.cannotAdd'),issueLocal(priced.issues[0]));return}
  }
  const img=document.querySelector('#productModal .product-detail-media img');
  const note=(document.getElementById('productNote')?.value||'').trim();
  const newKey=productLineKey(String(item.ID),mods.map(m=>m.modifierId));
  if(editingKey){cart=cart.filter(x=>x.key!==editingKey);editingKey=null;storeCart()}
  addLine({kind:'product',key:newKey,itemId:String(item.ID),productId:String(item.ProductID||''),name:String(item.Name),variant:displayVariantLabel(item.Description),quantity,price:Number(item.Price)||0,category:categoryName(item.CategoryID),note,modifiers:mods.length?mods:undefined});
  mgSelection={};
  flyToCart(img);
  closeModal('productModal');
}

function addItem(id){const x=menu.find(m=>String(m.ID)===String(id));if(!x)return;addLine({kind:'product',key:productLineKey(String(x.ID),[]),itemId:String(x.ID),productId:String(x.ProductID||''),name:String(x.Name),variant:displayVariantLabel(x.Description),quantity:1,price:Number(x.Price)||0,category:categoryName(x.CategoryID)})}

function dealSectionHtml(cat,deals){
  return '<section class="category-section deals-section" id="section-'+esc(String(cat.ID))+'" data-cat-id="'+esc(String(cat.ID))+'"><div class="section-head"><div class="section-title-wrap"><div class="section-icon">'+(DEFAULT_ICONS[cat.Name]||'\ud83c\udf8e')+'</div><h3 class="section-title">'+esc(dispNameOf(cat))+'</h3></div></div><div class="grid">'+deals.map(function(d){return catalogDealCardHtml(d,cat)}).join('')+'</div></section>';
}
function catalogDealCardHtml(d,cat){
  const price=Number(d.Price)||0;
  const avail=isTrue(d.available);
  const emoji=DEFAULT_ICONS[cat&&cat.Name]||'\ud83c\udf8e';
  /* Deal images use the current ImagePath in the public catalog row.
     Accept only the known deals/ filename shape and resolve it against the
     public staging image repository; never build a URL from untrusted markup. */
  const dealPath=String(d.ImagePath||'').trim();
  const safeDealPath=/^(?:deals\/[A-Za-z0-9._-]+|deals\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+)\.(?:webp|jpe?g|png)$/i.test(dealPath)?dealPath:'';
  const dealImgUrl=safeDealPath?resolveImage(safeDealPath,''):'';
  const dealArt=dealImgUrl?
    '<img class="deal-art-img" src="'+esc(dealImgUrl)+'" alt="" loading="lazy" decoding="async">':
    '<span class="deal-art-emoji" aria-hidden="true">'+emoji+'</span>';
  const openCall=avail?esc('openDeal('+JSON.stringify(String(d.DealID))+')'):'';
  const interactive=openCall?' role="button" tabindex="0" onclick="'+openCall+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+openCall+'}"':'';
  return '<article class="card deal-card'+(avail?'':' card-unavailable')+(avail?' deal-card-open':'')+'"'+interactive+'><div class="art"><span class="deal-tag">'+tr('deal.tag')+'</span>'+dealArt+'</div><div class="card-body"><div class="name">'+esc(dispText(String(d.Title||'Deal'),d.TitleUr||''))+'</div>'+(d.Description?'<div class="desc">'+esc(dispText(String(d.Description),d.DescriptionUr||''))+'</div>':'')+'<div class="bottom"><span class="price">'+cur()+money(price)+'</span>'+(avail?'<button type="button" class="add" onclick="event.stopPropagation();'+openCall+'">'+tr('deal.view')+'</button>':'<span class="unavailable-chip">'+tr('menu.unavailable')+'</span>')+'</div></div></article>';
}

/* ===== Deal builder modal (slots derived from DealComponents, pool = SUB-REG) ===== */
function openDeal(dealId,pre){
  if(!PCTX)return;  const d=PCTX.deals[String(dealId)];
  if(!d)return;
  dealModalState={dealId:String(dealId),choices:(pre&&pre.choices)?Object.assign({},pre.choices):{},qty:Math.max(1,Number((pre&&pre.quantity)||1))};
  renderDealModal();
  openModal('dealModal');
}
function renderDealModal(){
  const st=dealModalState;if(!st||!PCTX)return;
  const d=PCTX.deals[st.dealId];if(!d)return;
  const rows=HfpPricing.dealRows(PCTX,st.dealId);
  const availIssue=HfpPricing.dealAvailabilityIssue(PCTX,st.dealId);
  const compsHtml=rows.map(r=>{
    const phrase=esc(r.DescriptionPhrase||r.DisplayName||'');
    if(r.RefType==='CHOICE_BY_SIZE'){
      const opts=HfpPricing.choiceOptions(PCTX,r);
      const chosen=st.choices[r.ComponentID]||'';
      const options='<option value="">'+tr('deal.choose')+'</option>'+opts.map(o=>'<option value="'+esc(o.variantId)+'"'+(String(o.variantId)===String(chosen)?' selected':'')+'>'+esc(o.name+' ('+o.sizeLabel+')')+' — '+cur()+money(o.price)+'</option>').join('');
      const warn=opts.length?'':'<div class="deal-slot-warn">'+tr('deal.noOptions',{size:esc(String(r.SizeKey||'selection').toLowerCase())})+'</div>';
      return '<div class="deal-comp deal-slot" data-slot="'+esc(r.ComponentID)+'"><div class="slot-phrase">'+phrase+'</div><select class="deal-slot-select" aria-label="'+esc(phrase)+'" onchange="selectDealChoice(\''+esc(r.ComponentID)+'\',this.value)"'+(opts.length?'':' disabled')+'>'+options+'</select>'+warn+'</div>';
    }
    const suffix=r.RefType==='DRINK_INCLUDED'?' <span class="deal-included">'+tr('deal.included')+'</span>':'';
    return '<div class="deal-comp"><span class="dc-qty">×'+esc(String(r.Quantity||1))+'</span><span class="dc-name">'+phrase+suffix+'</span></div>';
  }).join('');
  const missing=HfpPricing.dealMissingChoices(PCTX,st.dealId,st.choices);
  const unit=Number(d.BundlePrice)||0;
  const blocked=!!availIssue||missing.length>0;
  const banner=availIssue?'<div class="deal-block-banner" role="alert">'+esc(issueLocal(availIssue))+'</div>':'';
  const hint=(!availIssue&&missing.length)?'<div class="deal-block-banner deal-hint">'+tr('deal.chooseAll',{n:missing.length})+'</div>':'';
  document.getElementById('dealTitle').textContent=dispText(String(d.Title||'Deal'),d.TitleUr||'');
  document.getElementById('dealBody').innerHTML='<div class="deal-modal-head"><div class="deal-price-big">'+cur()+money(unit)+'</div><div class="deal-modal-desc">'+esc(dispText(String(d.Description||''),d.DescriptionUr||''))+'</div></div>'
    +banner+hint
    +'<div class="option-title">'+tr('deal.includes')+'</div><div class="deal-components deal-modal-comps">'+compsHtml+'</div>'
    +'<div class="picker-bottom"><div class="picker-qty"><button type="button" onclick="changeDealQty(-1)">−</button><span id="dealQty">'+st.qty+'</span><button type="button" onclick="changeDealQty(1)">+</button></div>'
    +'<button type="button" class="picker-add" id="dealAddBtn"'+(blocked?' disabled':'')+' onclick="confirmDeal()">'+(editingKey?tr('btn.updateCart'):tr('btn.addToCart'))+cur()+money(unit*st.qty)+'</button></div>';
}
function selectDealChoice(componentId,variantId){
  if(!dealModalState)return;
  if(variantId)dealModalState.choices[componentId]=String(variantId);
  else delete dealModalState.choices[componentId];
  renderDealModal();
}
function changeDealQty(delta){
  if(!dealModalState)return;
  dealModalState.qty=Math.max(1,dealModalState.qty+delta);
  renderDealModal();
}
function confirmDeal(){
  const st=dealModalState;if(!st||!PCTX)return;
  const d=PCTX.deals[st.dealId];if(!d)return;
  const availIssue=HfpPricing.dealAvailabilityIssue(PCTX,st.dealId);
  if(availIssue){showToast(tr('deal.unavailableToast'),issueLocal(availIssue));return}
  const missing=HfpPricing.dealMissingChoices(PCTX,st.dealId,st.choices);
  if(missing.length){showToast(tr('deal.completeToast'),tr('deal.chooseSlot'));return}
  const key=dealLineKey(st.dealId,st.choices);
  if(editingKey){cart=cart.filter(x=>x.key!==editingKey);editingKey=null;storeCart()}
  addLine({kind:'deal',isDeal:true,key,dealId:st.dealId,name:dispText(String(d.Title||'Deal'),d.TitleUr||''),quantity:st.qty,choices:Object.assign({},st.choices),category:categoryName(d.CategoryID)});
  dealModalState=null;
  closeModal('dealModal');
}

function editCartItem(key){
  var item=cart.find(function(x){return x.key===key});
  if(!item)return;
  editingKey=key;
  if(item.kind==='deal'||item.isDeal){
    openDeal(item.dealId,{choices:item.choices,quantity:item.quantity});
    return;
  }
  var srcRow=menu.find(function(x){return String(x.ID)===String(item.itemId)});
  if(!srcRow){editingKey=null;return}
  var group=menu.filter(function(x){return String(x.CategoryID)===String(srcRow.CategoryID)&&String(x.Name).trim()===String(srcRow.Name).trim()});
  var preselectModifiers=function(){
    mgSelection={};
    (item.modifiers||[]).forEach(function(m){
      if(!m||!m.groupId)return;
      if(!mgSelection[m.groupId])mgSelection[m.groupId]=[];
      if(mgSelection[m.groupId].indexOf(m.modifierId)===-1)mgSelection[m.groupId].push(m.modifierId);
    });
    syncModifierButtons();
  };
  if(group.length>1){
    openPizza(String(srcRow.Name),group.map(function(x){return{id:String(x.ID),label:String(x.Description||''),price:Number(x.Price)||0}}),item.itemId);
    preselectModifiers();
    var qtyEl=document.getElementById('pizzaQty');
    if(qtyEl)qtyEl.textContent=String(item.quantity);
    var noteEl=document.getElementById('pizzaNote');
    if(noteEl)noteEl.value=item.note||'';
    updatePizzaPickerPrice();
    refreshModifierPriceLabels();
  }else{
    openProduct(String(item.itemId),false);
    preselectModifiers();
    var qtyEl2=document.getElementById('detailQty');
    if(qtyEl2)qtyEl2.textContent=String(item.quantity);
    var noteEl2=document.getElementById('productNote');
    if(noteEl2)noteEl2.value=item.note||'';
    updateDetailTotal();
  }
}

function cartItemsHtml(){
  if(!cart.length)return '<div class="empty-cart"><span class="empty-ico">\u{1F6D2}</span><strong>'+tr('cart.empty')+'</strong><small>'+tr('cart.emptySub')+'</small></div>';
  const t=totals();
  const priced={};(t.lines||[]).forEach(l=>{priced[l.key]=l});
  const trashSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  const editSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const qtyHtml=(x,lineTotal)=>'<div class="line-row"><div class="qty"><button onclick="qty(\''+esc(x.key)+'\',-1)">−</button><span>'+x.quantity+'</span><button onclick="qty(\''+esc(x.key)+'\',1)">+</button></div><span class="line-price">'+cur()+money(lineTotal)+'</span></div>';
  const actionsHtml=(x)=>'<div style="text-align:right;margin-top:2px;display:flex;gap:4px;justify-content:flex-end"><button class="edit-btn" onclick="editCartItem(\''+esc(x.key)+'\')">'+editSvg+' '+tr('cart.edit')+'</button><button class="remove" onclick="removeLine(\''+esc(x.key)+'\')">'+trashSvg+' '+tr('cart.remove')+'</button></div>';
  return cart.map(x=>{
    const p=priced[x.key];
    const isDealLine=(x.kind==='deal'||x.isDeal);
    const lineTotal=p&&p.ok?p.lineTotal:(Number(x.price)||0)*x.quantity;
    const issue=p&&p.issues.length?p.issues[0].message:'';
    const issueHtml=issue?'<div class="cart-line-issue">⚠ '+esc(uiIssueMsg(p&&p.issues[0]||{message:issue}))+'</div>':'';
    if(isDealLine){
      const comps=(p&&p.detail&&p.detail.components)||[];
      const compsHtml=comps.map(c=>'<div class="deal-comp"><span class="dc-name">'+esc(c)+'</span></div>').join('');
      const unit=p&&p.ok?p.unitTotal:(Number(x.price)||0);
      return '<div class="cart-line cart-line-deal"><div class="thumb">'+dealThumbHtml(x.dealId)+'</div><div><div class="cart-name">'+esc(x.name)+'</div><div class="cart-meta">'+tr('cart.comboDeal')+'</div><div class="deal-components">'+compsHtml+'</div><div class="deal-price-row">'+tr('cart.dealPrice')+' <strong>'+cur()+money(unit)+'</strong></div>'+issueHtml+qtyHtml(x,lineTotal)+actionsHtml(x)+'</div></div>';
    }
    const mods=(p&&p.detail&&p.detail.modifiers)||[];
    const modsHtml=mods.length?'<div class="cart-extras">'+mods.map(m=>'<div class="cart-extra-line">+ '+esc(m.label)+(m.price>0?' (+'+cur()+money(m.price)+')':'')+'</div>').join('')+'</div>':'';
    const noteHtml=x.note?'<div class="cart-note">'+tr('cart.special')+' '+esc(x.note)+'</div>':'';
    const variantLabel=displayVariantLabel(x.variant);
    const variantHtml=variantLabel?'<div class="cart-meta">'+esc(variantLabel)+'</div>':'';
    return '<div class="cart-line"><div class="thumb"><img class="cart-photo" src="'+productImage(x.category,x.name,x.itemId)+'" alt="'+esc(x.name)+'" loading="lazy" referrerpolicy="no-referrer"></div><div><div class="cart-name">'+esc(x.name)+'</div>'+variantHtml+noteHtml+modsHtml+issueHtml+qtyHtml(x,lineTotal)+actionsHtml(x)+'</div></div>';
  }).join('');
}
function dealThumbHtml(dealId){
  if(PCTX){
    const rows=HfpPricing.dealRows(PCTX,dealId);
    for(const r of rows){
      if(r.RefType!=='FIXED_VARIANT'&&r.RefType!=='FIXED_PRODUCT')continue;
      const v=HfpPricing.resolveComponentVariant(PCTX,r);
      if(!v)continue;
      const row=menu.find(m=>String(m.ID)===String(v.VariantID))||menu.find(m=>String(m.ProductID)===String(v.ProductID));
      if(row)return '<img class="cart-photo" src="'+productImage(categoryName(row.CategoryID),String(row.Name),String(row.ID))+'" alt="'+esc(row.Name)+'" loading="lazy" referrerpolicy="no-referrer">';
    }
  }
  return '<span class="deal-art-emoji" aria-hidden="true">\u{1F381}</span>';
}
function summaryRows(t,withFulfillment){let rows='';if(withFulfillment)rows+='<div class="sumrow"><span>'+tr('checkout.fulfillment')+'</span><strong>'+esc(tr('fulfillment.'+fulfillmentType))+'</strong></div>';rows+='<div class="sumrow"><span>'+tr('checkout.subtotal')+'</span><strong>'+cur()+money(t.subtotal)+'</strong></div>';if(t.discount>0)rows+='<div class="sumrow"><span>'+tr('checkout.discount')+'</span><strong>-'+cur()+money(t.discount)+'</strong></div>';rows+='<div class="sumrow"><span>'+tr('checkout.delivery')+'</span><strong>'+(t.delivery>0?cur()+money(t.delivery):tr('checkout.free'))+'</strong></div>';rows+='<div class="sumrow total"><span>'+tr('checkout.total')+'</span><strong>'+cur()+money(t.total)+'</strong></div>';return rows}
function summaryHtml(){const t=totals();return '<div class="cart-summary">'+summaryRows(t,false)+(cart.length?'<button class="checkout" onclick="startCheckout()">'+esc(cfg('checkout_button_text',tr('checkout.proceed')))+'</button>':'')+'<div class="secure">'+tr('checkout.secureShort')+'</div></div>'}
function renderCart(){const count=cart.reduce((s,x)=>s+x.quantity,0),t=totals();document.getElementById('cartCount').textContent=count;document.getElementById('mobileCount').textContent=count+' '+tr(count===1?'cart.item':'cart.items');document.getElementById('mobileTotal').textContent=cur()+money(t.total);document.getElementById('cartPopoverBody').innerHTML=cartItemsHtml()+summaryHtml();document.getElementById('cartModalBody').innerHTML=cartItemsHtml()+summaryHtml();const mc=document.querySelector('.mobile-cart');if(mc){if(cart.length>0){mc.classList.remove('cart-empty')}else{mc.classList.add('cart-empty')}}}
function toggleCart(){if(window.matchMedia('(max-width:900px)').matches){openCart();return}const p=document.getElementById('cartPopover');const btn=document.querySelector('.cart-head');const open=p.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false');renderCart()}
function openCart(){if(!window.matchMedia('(max-width:900px)').matches){const p=document.getElementById('cartPopover');p.classList.add('open');document.querySelector('.cart-head').setAttribute('aria-expanded','true');renderCart();return}openModal('cartModal');renderCart()}
function closeCartPopover(){const p=document.getElementById('cartPopover');p.classList.remove('open');document.querySelector('.cart-head').setAttribute('aria-expanded','false')}
function startCheckout(){if(!cart.length)return;closeModal('cartModal');renderCheckout();openModal('checkoutModal')}
function renderCheckout(){
  const res=validateCartForCheckout();
  const t=totals();
  let html='';
  if(!res.ok){
    html+='<div class="checkout-issues" role="alert"><strong>'+tr('checkout.resolveIssues')+'</strong><ul>'+res.items.map(i=>'<li><span>'+esc(i.message)+'</span>'+(i.key?'<button type="button" class="issue-remove" onclick="issueRemove(\''+esc(i.key)+'\')">'+tr('cart.remove')+'</button>':'')+'</li>').join('')+'</ul></div>';
  }
  html+=summaryRows(t,true);
  document.getElementById('checkoutSummary').innerHTML=html;
  const mh=document.querySelector('#checkoutModal .mh h3');
  if(mh)mh.textContent=tr('checkout.titleType',{type:tr('fulfillment.'+fulfillmentType)});
  const btn=document.querySelector('#checkoutForm .checkout.whatsapp');
  if(btn){
    btn.disabled=!res.ok;
    btn.textContent=res.ok?tr('checkout.sendWA'):tr('checkout.resolveToSend');
  }
}
function issueRemove(key){
  removeLine(key);
  if(!cart.length){closeModal('checkoutModal');return}
  renderCheckout();
}

function hfpCheckoutOrderPayload(formData){
  const name=String(formData.get('customerName')||'').trim();
  const phone=String(formData.get('phone')||'').trim();
  const address=String(formData.get('address')||'').trim();
  const notes=String(formData.get('notes')||'').trim();
  const areaName=String(formData.get('area')||'').trim();
  const fulfillment=String(fulfillmentType||'Delivery').toLowerCase();
  const fulfillmentTypeDb=fulfillment==='delivery'?'delivery':(fulfillment==='dine-in'?'dine_in':'pickup');
  const lines=cart.map(line=>{
    if(line.kind==='deal'||line.isDeal){
      return {kind:'deal',deal_id:String(line.dealId),quantity:Number(line.quantity)||1,choices:Object.assign({},line.choices||{})};
    }
    return {kind:'product',product_id:String(line.productId||''),variant_id:String(line.itemId||''),quantity:Number(line.quantity)||1,notes:String(line.note||''),modifiers:(line.modifiers||[]).map(m=>({group_id:String(m.groupId||''),modifier_id:String(m.modifierId||'')}))};
  });
  return {
    source:'website',
    idempotency_key:'',
    fulfillment_type:fulfillmentTypeDb,
    customer:{name,phone},
    payment_method:'cod',
    notes,
    delivery:fulfillmentTypeDb==='delivery'?{address,area_name:areaName,area_id:''}: {},
    items:lines
  };
}
async function hfpSubmitWebsiteOrder(payload){
  const stable=JSON.stringify(payload);
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem('flame_chick_pending_order_v1')||'null')}catch(e){}
  if(pending&&pending.fingerprint===stable)payload=pending.payload;
  else{payload.idempotency_key='flame-chick-web-'+crypto.randomUUID();try{sessionStorage.setItem('flame_chick_pending_order_v1',JSON.stringify({fingerprint:stable,payload}))}catch(e){}}
  const response=await fetch(HFP_CONFIG.orderApiBase,{method:'POST',headers:{'Content-Type':'application/json','apikey':HFP_CONFIG.publishableKey},body:JSON.stringify(payload),cache:'no-store'});
  let data={};try{data=await response.json()}catch(e){}
  if(!response.ok||!data.ok||!data.order)throw new Error(data?.error?.message||'We could not submit your order. Please try again.');
  return data;
}
document.getElementById('checkoutForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!cart.length)return;
  const res=validateCartForCheckout();
  if(!res.ok){renderCheckout();showToast(tr('toast.cartAttention'),issueLocal(res.items[0]));return;}
  const formData=new FormData(e.target);
  if(fulfillmentType==='Delivery'&&!String(formData.get('address')||'').trim()){
    showToast('Please enter your delivery address');document.querySelector('[name="address"]')?.focus();return;
  }
  const btn=e.target.querySelector('button[type="submit"]');
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='Submitting order…';}
  try{
    const payload=hfpCheckoutOrderPayload(formData);
    const result=await hfpSubmitWebsiteOrder(payload);
    const order=result.order;
    try{sessionStorage.removeItem('flame_chick_pending_order_v1')}catch(e){}
    closeModal('checkoutModal');
    const success=document.getElementById('successContent');
    success.innerHTML='<div class="success"><div class="ok">✓</div><h2>Order received!</h2><p>Your order has been received by Flame Chick.</p><p style="margin-top:12px;font-weight:800">Order '+esc(order.order_number||'')+'</p><p>We will contact you on '+esc(String(formData.get('phone')||''))+' if needed.</p><button style="margin-top:16px;background:var(--brand);color:#fff;padding:12px 32px;border-radius:10px;font-weight:800;font-size:14px;min-height:44px;border:none;cursor:pointer" onclick="closeModal(\'successModal\')">Done</button></div>';
    openModal('successModal');playSuccessSound();
    cart=[];storeCart();e.target.reset();
    
    updateFulfillmentUI();renderCart();
  }catch(err){
    console.error('Flame Chick order submission failed',err);
    showToast(err.message||'Order could not be submitted. Your cart is safe; please retry.');
  }finally{
    if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||tr('checkout.sendWA');delete btn.dataset.originalText;}
  }
});
function showWaFallback(msg){
  const body=document.getElementById('waFallbackBody');
  if(!body)return;
  body.innerHTML='<p class="wa-fallback-note">'+tr('waFallback.note')+'</p>'
    +'<textarea id="waFallbackText" readonly rows="12" aria-label="Complete order message"></textarea>'
    +'<div class="wa-fallback-actions"><button type="button" class="wa-copy-btn" id="waCopyBtn">'+tr('waFallback.copy')+'</button>'
    +'<a class="wa-open-link" href="https://wa.me/'+esc(WA_PHONE)+'" target="_blank" rel="noopener">'+tr('waFallback.open')+'</a></div>';
  const ta=document.getElementById('waFallbackText');
  ta.value=msg;
  window.__waFallbackMsg=msg;
  document.getElementById('waCopyBtn').addEventListener('click',function(){
    ta.focus();ta.select();ta.setSelectionRange(0,999999);
    let copied=false;
    try{copied=document.execCommand('copy')}catch(err){}
    if(!copied&&navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(msg).then(function(){showToast(tr('toast.copied'),tr('toast.copiedSub'))},function(){showToast(tr('toast.copyManually'),tr('toast.copyManuallySub'))});
      return;
    }
    showToast(copied?tr('toast.copied'):tr('toast.copyManually'),copied?tr('toast.copiedSub'):tr('toast.copyManuallySub'));
  });
  openModal('waFallbackModal');
}
document.querySelectorAll('#checkoutForm input, #checkoutForm textarea, #checkoutForm select').forEach(function(el){el.addEventListener('focus',function(){setTimeout(function(){el.scrollIntoView({behavior:'smooth',block:'center'})},350)})});

let toastTimer=null;
/* Flame Chick demo delivery address is entered directly in the checkout form. */
function showToast(title,text){const toast=document.getElementById('toast');document.getElementById('toastTitle').textContent=title;document.getElementById('toastText').textContent=text;toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600)}
function playAddSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C();const now=ctx.currentTime;const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(660,now);o.frequency.exponentialRampToValueAtTime(920,now+.12);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.18,now+.012);g.gain.exponentialRampToValueAtTime(.0001,now+.16);o.connect(g).connect(ctx.destination);o.start(now);o.stop(now+.18);setTimeout(()=>ctx.close().catch(()=>{}),250)}catch(e){}}
function playSuccessSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C();const now=ctx.currentTime;[523.25,659.25,783.99].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,now+i*.08);g.gain.exponentialRampToValueAtTime(.15,now+i*.08+.01);g.gain.exponentialRampToValueAtTime(.0001,now+i*.08+.16);o.connect(g).connect(ctx.destination);o.start(now+i*.08);o.stop(now+i*.08+.18)});setTimeout(()=>ctx.close().catch(()=>{}),450)}catch(e){}}

function tapFeedback(el){el.classList.remove('sel');void el.offsetWidth;el.classList.add('sel')}

function flyToCart(sourceEl){
  if(!sourceEl)return;
  const cartBtn=document.querySelector('.cart-head');
  if(!cartBtn)return;
  const src=sourceEl.getBoundingClientRect();
  const dst=cartBtn.getBoundingClientRect();
  const clone=sourceEl.cloneNode(true);
  clone.style.cssText='position:fixed;z-index:9999;pointer-events:none;width:60px;height:60px;border-radius:50%;object-fit:cover;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:all .45s cubic-bezier(.2,.8,.3,1);left:'+(src.left+src.width/2-30)+'px;top:'+(src.top+src.height/2-30)+'px;opacity:1;transform:scale(1)';
  document.body.appendChild(clone);
  requestAnimationFrame(()=>{requestAnimationFrame(()=>{
    clone.style.left=(dst.left+dst.width/2-30)+'px';
    clone.style.top=(dst.top+dst.height/2-30)+'px';
    clone.style.transform='scale(0.2)';
    clone.style.opacity='0.5';
  })});
  clone.addEventListener('transitionend',function handler(){clone.removeEventListener('transitionend',handler);clone.remove();cartBtn.classList.remove('cart-pulse');void cartBtn.offsetWidth;cartBtn.classList.add('cart-pulse')});
  setTimeout(()=>{if(clone.parentNode)clone.remove()},800);
}

function setVh(){const vh=window.visualViewport?window.visualViewport.height:window.innerHeight;document.documentElement.style.setProperty('--vh',vh+'px')}
if(window.visualViewport){window.visualViewport.addEventListener('resize',setVh)}
window.addEventListener('resize',setVh);
setVh();

let _savedScrollY=0;
function openModal(id){_savedScrollY=window.scrollY;document.getElementById(id).classList.add('open');document.body.classList.add('modal-open')}
function closeModal(id){document.getElementById(id).classList.remove('open');if(id==='pizzaModal'||id==='productModal'||id==='dealModal'){editingKey=null;if(id==='dealModal')dealModalState=null;}if(!document.querySelector('.modal-wrap.open')){document.body.classList.remove('modal-open');requestAnimationFrame(()=>window.scrollTo(0,_savedScrollY))}}
addEventListener('click',e=>{if(e.target.classList.contains('modal-wrap')){closeModal(e.target.id)}if(!e.target.closest('#cartAnchor')&&!e.target.closest('.cart-popover'))closeCartPopover()});
(function(){
  let sy=0,dragging=false,started=false;
  document.addEventListener('touchstart',e=>{
    const mb=e.target.closest('.mb');if(!mb)return;
    if(mb.scrollTop>0)return;
    sy=e.touches[0].clientY;started=true;dragging=false;
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!started)return;
    const dy=e.touches[0].clientY-sy;
    if(dy>10)dragging=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!started)return;started=false;
    if(!dragging)return;dragging=false;
    const mb=e.target.closest('.mb')||document.querySelector('.modal-wrap.open .mb');
    if(!mb)return;
    if(mb.scrollTop>0)return;
    const wrap=mb.closest('.modal-wrap');
    if(wrap&&wrap.id!=='successModal'&&wrap.id!=='checkoutModal')closeModal(wrap.id);
  },{passive:true});
})();

function observeSections(){
  const bar=document.getElementById("categoryBar");
  if(!bar)return;

  let scrollTimeout=null;
  let lastActiveCat=null;

  function checkActiveSection(){
    if(navTarget) return; // don't interfere during programmatic navigation

    /* Query the sections LIVE on every check: menu sections are rebuilt by
       re-renders (language switch, catalog refresh) and a closure-captured
       NodeList silently goes stale — the handler then measures detached
       elements (all rects 0) and the highlight never changes. */
    const sections=document.querySelectorAll('.category-section');
    if(!sections.length) return;

    const vh=window.innerHeight;
    const centerY=vh * 0.5; // exact center of viewport
    let bestSection=null;
    let bestDistance=Infinity;

    sections.forEach(sec=>{
      const rect=sec.getBoundingClientRect();
      const secCenter=rect.top + rect.height / 2;
      const distance=Math.abs(secCenter - centerY);
      if(distance < bestDistance){
        bestDistance=distance;
        bestSection=sec;
      }
    });

    if(bestSection){
      const catId=String(bestSection.dataset.catId);
      /* Compare against BOTH the last value this handler saw and the pill
         actually highlighted in the DOM: other code paths (catalog
         re-apply, language switch) can reset activeCategory externally,
         and this check self-heals that instead of staying stale. */
      const currentPill=document.querySelector('.cat-pill.active');
      const currentCat=currentPill?String(currentPill.dataset.cat):'';
      if(catId && (catId !== lastActiveCat || catId !== currentCat || catId !== String(activeCategory))){
        lastActiveCat=catId;
        activeCategory=catId;
        document.querySelectorAll('.cat-pill').forEach(p=>{
          p.classList.toggle('active',String(p.dataset.cat)===activeCategory);
        });
        centerActiveCategory(bar);
      }
    }
  }

  // Dedup: every re-render calls observeSections — remove the previous
  // listener first so handlers with stale state never accumulate.
  if(window._categoryScrollHandler){
    window.removeEventListener('scroll',window._categoryScrollHandler);
    window._categoryScrollHandler=null;
  }

  // Throttled scroll listener
  const handler=()=>{
    if(scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout=setTimeout(checkActiveSection, 50);
  };
  window.addEventListener('scroll', handler, {passive:true});

  // Initial check
  checkActiveSection();

  // Store reference for cleanup
  window._categoryScrollHandler=handler;
}
addEventListener('error',e=>{const img=e.target;if(img&&img.tagName==='IMG'&&img.classList.contains('product-photo')){img.style.background='#f3dfc8';img.removeAttribute('src')}});
addEventListener('error',e=>{const img=e.target;if(img&&img.tagName==='IMG'&&img.classList.contains('cart-photo')){img.style.background='#f3dfc8';img.removeAttribute('src')}});

/* ===== WhatsApp order sent (success screen) ===== */
function renderWhatsAppSent(){
  const el=document.getElementById('successContent');
  el.innerHTML='<div class="success"><div class="ok">✓</div><h2>'+tr('success.title')+'</h2><p>'+tr('success.body')+'</p><p style="margin-top:12px;font-size:12px;color:var(--muted)">'+tr('success.help')+'<a href="tel:'+esc(String(WA_PHONE||''))+'" style="color:var(--brand);font-weight:700">'+esc(String(PHONE_DISPLAY||''))+'</a></p><button style="margin-top:16px;background:var(--brand);color:#fff;padding:12px 32px;border-radius:10px;font-weight:800;font-size:14px;min-height:44px;border:none;cursor:pointer" onclick="closeModal(\'successModal\')">'+tr('success.done')+'</button></div>';
  openModal('successModal');
}
// ===== LANDING PAGE JS =====
function findLandingCategoryMatch(name){
  var cats=categories||[];
  var q=String(name||'').toLowerCase();
  return cats.find(function(c){
    var n=(c.Name||'').toLowerCase();
    return n===q||n.indexOf(q)!==-1||q.indexOf(n)!==-1;
  });
}
function enterMenu(category){
  document.body.classList.add('in-menu');
  window.scrollTo(0, 0);
  /* The strip is hidden on the landing page, so its centering padding could
     not be measured there — refit and center the selected pill now that the
     menu is visible (reading rects also flushes the layout change). */
  centerActiveCategory(document.getElementById('categoryBar'));
  if(category){
    setTimeout(function(){
      var match=findLandingCategoryMatch(category);
      if(match){
        var sec=document.getElementById('section-'+match.ID);
        /* chooseCategory owns the programmatic section scroll (it also sets
           the nav-target guard); a second direct scrollIntoView here was
           redundant and could interleave with it. */
        if(sec)chooseCategory(match.ID);
      }
    },400);
  }
}
function backToLanding(){
  document.body.classList.remove('in-menu');
  window.scrollTo(0, 0);
  // Clean up category bar scroll listener
  if(window._categoryScrollHandler){
    window.removeEventListener('scroll', window._categoryScrollHandler, {passive:true});
    window._categoryScrollHandler=null;
  }
}

function landingDefaults(){
  return {
    header:{brand:tr('brand.name'),cta:tr('landing.header.menu')},
    hero:{
      titleAccent:tr('landing.hero.accent'),
      titleMain:tr('landing.hero.main'),
      titleHtml:"",
      support:tr('landing.hero.support'),
      cta:tr('landing.hero.cta'),
      image:"https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/DL-1-b80480b41cf8da6b.webp",
      imageAlt:tr('landing.hero.imageAlt'),
      imageActive:true
    },
    gate:{
      image:"https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/DL-1-b80480b41cf8da6b.webp",
      brand:tr('brand.short'),
      subtitle:tr('landing.gate.subtitle')
    },
    about:{
      heading:tr('landing.about.heading'),
      description:tr('landing.about.desc'),
      images:[
        {id:"about-main",placement:"main",image:"https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/DL-1-b80480b41cf8da6b.webp",alt:tr('landing.about.extAlt'),active:true,sortOrder:1},
        {id:"about-side",placement:"side",image:"https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/SD-1-4407031e7c447471.jpg",alt:tr('landing.about.intAlt'),active:true,sortOrder:2}
      ]
    },
    why:{
      heading:tr('landing.why.heading'),
      cards:[
        {id:"made-fresh",icon:"🔥",title:tr('landing.why.madeFresh'),active:true,sortOrder:1},
        {id:"clear-prices",icon:"💰",title:tr('landing.why.clearPrices'),active:true,sortOrder:2},
        {id:"quick-service",icon:"⚡",title:tr('landing.why.quickService'),active:true,sortOrder:3},
        {id:"fast-delivery",icon:"🚚",title:tr('landing.why.fastDelivery'),active:true,sortOrder:4}
      ]
    },
    how:{
      heading:tr('landing.how.heading'),
      steps:[
        {id:"choose",icon:'🛒',label:tr('landing.how.choose'),active:true,sortOrder:1},
        {id:"add",icon:'➕',label:tr('landing.how.add'),active:true,sortOrder:2},
        {id:"order",icon:'🧾',label:tr('landing.how.order'),active:true,sortOrder:3},
        {id:"enjoy",icon:'🍕',label:tr('landing.how.enjoy'),active:true,sortOrder:4}
      ]
    },
    menuCategories:{
      heading:tr('landing.menu.heading'),
      items:[
        {id:"pizza",menuRef:"Pizza",displayName:tr('landing.menu.pizza'),image:"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=400&q=80",alt:"Pizza",active:true,sortOrder:1},
        {id:"burgers",menuRef:"Burgers",displayName:tr('landing.menu.burgers'),image:"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80",alt:"Burgers",active:true,sortOrder:2},
        {id:"shawarmas",menuRef:"Shawarmas",displayName:tr('landing.menu.shawarma'),image:"https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=400&q=80",alt:"Shawarma",active:true,sortOrder:3},
        {id:"fried-items",menuRef:"Fried Items",displayName:tr('landing.menu.friedItems'),image:"https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=80",alt:"Fried Items",active:true,sortOrder:4}
      ]
    },
    info:{
      heading:tr('landing.info.heading'),
      cards:[
        {id:"phone",kind:"call",icon:"📞",label:tr('landing.info.callUs'),value:String(PHONE_DISPLAY||''),href:"tel:"+String(WA_PHONE||''),active:true,sortOrder:3},
        {id:"whatsapp",kind:"whatsapp",icon:"💬",label:tr('landing.info.whatsapp'),value:tr('landing.info.messageUs'),href:"https://wa.me/"+String(WA_PHONE||''),linkTarget:"_blank",active:true,sortOrder:4},
        {id:"hours",kind:"hours",icon:"🕒",label:tr('landing.info.hours'),value:"",active:true,sortOrder:5}
      ]
    },
    finalCta:{heading:tr('landing.cta.heading'),button:tr('landing.cta.button'),sub:String(PHONE_DISPLAY||'')},
    footer:{brand:tr('brand.name'),contact:String(PHONE_DISPLAY||'')}
  };
}

function lpVal(key,fb){
  const raw=siteConfig[key];
  if(raw===undefined||raw===null)return fb;
  if(typeof raw==='string'){
    const t=raw.trim();
    if(t==='')return fb;
    if(t[0]==='['||t[0]==='{'){
      try{return JSON.parse(t)}catch(e){return fb}
    }
    return raw;
  }
  return raw;
}
function lpDeepMerge(base,over){
  if(over===undefined||over===null)return base;
  if(Array.isArray(over))return over;
  if(typeof over!=='object')return over;
  const out=Object.assign({},base||{});
  Object.keys(over).forEach(k=>{out[k]=lpDeepMerge(base?base[k]:undefined,over[k])});
  return out;
}
function buildWebsiteConfig(){
  const d=landingDefaults();
  const nested=(siteConfig.landing&&typeof siteConfig.landing==='object'&&!Array.isArray(siteConfig.landing))?siteConfig.landing:{};
  const merged=lpDeepMerge(d,nested);
  const setAny=(path,val)=>{
    if(val===undefined||val===null)return;
    if(typeof val==='string'&&val.trim()==='')return;
    const keys=path.split('.');
    let o=merged;
    for(let i=0;i<keys.length-1;i++){
      if(!o[keys[i]]||typeof o[keys[i]]!=='object')o[keys[i]]={};
      o=o[keys[i]];
    }
    o[keys[keys.length-1]]=val;
  };
  setAny('header.brand',lpVal('landing_header_brand'));
  setAny('header.cta',lpVal('landing_header_cta'));
  setAny('hero.titleAccent',lpVal('landing_hero_title_accent'));
  setAny('hero.titleMain',lpVal('landing_hero_title_main'));
  setAny('hero.titleHtml',lpVal('landing_hero_title_html'));
  setAny('hero.support',lpVal('landing_hero_support'));
  setAny('hero.hours',lpVal('landing_hero_hours'));
  setAny('hero.cta',lpVal('landing_hero_cta'));
  setAny('hero.image',lpVal('landing_hero_image'));
  setAny('hero.imageAlt',lpVal('landing_hero_image_alt'));
  setAny('hero.imageActive',lpVal('landing_hero_image_active'));
  setAny('gate.image',lpVal('landing_gate_image'));
  setAny('gate.brand',lpVal('landing_gate_brand'));
  setAny('gate.subtitle',lpVal('landing_gate_subtitle'));
  setAny('gate.choices',lpVal('landing_gate_choices'));
  setAny('about.heading',lpVal('landing_about_heading'));
  setAny('about.description',lpVal('landing_about_description'));
  setAny('about.images',lpVal('landing_about_images'));
  setAny('why.heading',lpVal('landing_why_heading'));
  setAny('why.cards',lpVal('landing_why_cards'));
  setAny('how.heading',lpVal('landing_how_heading'));
  setAny('how.steps',lpVal('landing_how_steps'));
  setAny('menuCategories.heading',lpVal('landing_menu_categories_heading'));
  setAny('menuCategories.items',lpVal('landing_menu_categories'));
  setAny('info.heading',lpVal('landing_info_heading'));
  setAny('info.cards',lpVal('landing_info_cards'));
  setAny('finalCta.heading',lpVal('landing_cta_heading'));
  setAny('finalCta.button',lpVal('landing_cta_button'));
  setAny('finalCta.sub',lpVal('landing_cta_sub'));
  setAny('footer.brand',lpVal('landing_footer_brand'));
  setAny('footer.contact',lpVal('landing_footer_contact'));
  return {landing:merged};
}
function lpText(id,val){const el=document.getElementById(id);if(el&&val!=null&&val!==''&&!el.querySelector('img'))el.textContent=String(val)}
function lpHtml(id,val){const el=document.getElementById(id);if(el&&val!=null)el.innerHTML=String(val)}
function lpActiveList(arr){
  return (Array.isArray(arr)?arr:[])
    .filter(x=>x&&isTrue(x.active!==undefined?x.active:true))
    .slice()
    .sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0));
}
function renderLandingAbout(about){
  const el=document.getElementById('lpAboutGallery');if(!el)return;
  el.innerHTML=lpActiveList(about.images).map(img=>{
    const slotId=img.id||'';
    const fallback=resolveImage(img.image||img.src||img.url||'','');
    if(!slotId&&!fallback)return '';
    /* About must paint on the FIRST frame, exactly like the landing hero
       (which is loading="eager" and resolves its URL at parse time). Gating
       this on catalogSettled left the gallery with no src for the ~5 s the
       catalog request needs - measured on the live site: the hero download
       started at 881 ms, About at 5451 ms - so the hero was visible seconds
       before the About photos. siteSlotStartup() already resolves live slot
       -> the validated cached slot from the previous visit, so a returning
       visitor starts downloading the real image at parse time (no stand-in
       flash, no later swap); the approved built-in asset covers a first visit
       with no cache, so the gallery is never blank either. Once the catalog
       settles the live slot wins, and an absent slot is a final state, so the
       fallback stands. */
    const src=siteSlotStartup(slotId)||fallback;
    if(!src)return '';
    const placement=img.placement==='side'?'lp-about-img-wrap--side':'lp-about-img-wrap--main';
    return '<div class="lp-about-img-wrap '+placement+'"><img src="'+esc(src)+'" alt="'+esc(img.alt||'')+'" class="lp-about-img" loading="eager" data-admin-replaceable="'+esc(slotId)+'"></div>';
  }).join('');
}
function renderLandingWhy(why){
  const el=document.getElementById('lpWhyGrid');if(!el)return;
  el.innerHTML=lpActiveList(why.cards).map(c=>
    '<div class="lp-trust-card"><div class="lp-trust-icon">'+esc(c.icon||'')+'</div><h3 class="lp-trust-label">'+esc(c.title||c.name||'')+'</h3></div>'
  ).join('');
}
function renderLandingHow(how){
  const el=document.getElementById('lpHowSteps');if(!el)return;
  const arrow='<div class="lp-step-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></div>';
  el.innerHTML=lpActiveList(how.steps).map(s=>{
    const src=s.image||s.src?resolveImage(s.image||s.src,''):'';
    const imgHtml=src?'<img src="'+esc(src)+'" alt="'+esc(s.imageAlt||s.label||'')+'" class="lp-step-img">':'<span class="lp-step-emoji" aria-hidden="true">'+esc(s.icon||'🍕')+'</span>';
    return '<div class="lp-step"><div class="lp-step-icon">'+imgHtml+'</div><div class="lp-step-label">'+esc(s.label||s.name||'')+'</div></div>';
  }).join(arrow);
}
function renderLandingMenuCategories(mc){
  const el=document.getElementById('lpCatGrid');if(!el)return;
  el.innerHTML=lpActiveList(mc.items).map(it=>{
    const ref=String(it.menuRef||it.categoryRef||it.id||'');
    const auth=findLandingCategoryMatch(ref);
    const label=it.displayName||it.name||(auth?String(auth.Name||''):ref);
    /* Category tiles show a REAL Flame Chick product photo (first product of the
       category with a published/uploaded image) instead of a hardcoded
       stock photo. Falls back to the configured tile image (admin override)
       only when the category has no image at all. */
    const productImg=getFirstProductImageForCategory(ref);
    const fallbackSrc=resolveImage(it.image||it.src||it.url||'','');
    /* No stock photo while the catalog loads: the configured (old) image used
       to paint first and swap later — that flash is the delay the owner saw.
       Before settlement a returning visitor gets the REAL product photo from
       the local catalog cache on the first frame; a first-time visitor sees
       the neutral local placeholder instead of a wrong photo. The configured
       tile image is only a FINAL state, once the catalog has settled. */
    const src=productImg||(catalogSettled?fallbackSrc:TILE_PLACEHOLDER);
    const imgHtml=src?'<img src="'+esc(src)+'" alt="'+esc(it.alt||label)+'" class="lp-cat-img" loading="lazy">':'';
    return '<button class="lp-cat-card" type="button" data-menu-ref="'+esc(ref)+'"'+(auth?' data-category-id="'+esc(String(auth.ID))+'"':'')+' onclick="enterMenu(\''+esc(ref)+'\')"><div class="lp-cat-img-wrap">'+imgHtml+'</div><div class="lp-cat-name">'+esc(label)+'</div></button>';
  }).join('');
}

/* The neutral, locally served tile stand-in used while the catalog is still
   loading (same asset as product cards). Never a stock food photo. */
const TILE_PLACEHOLDER='assets/placeholder.svg';

/* Full catalog view read from the LOCAL cache once at parse time, so the
   landing category tiles can paint a REAL product photo on the very first
   frame (returning visitor) instead of waiting out the health + catalog round
   trip. Only consulted BEFORE the catalog settles: a settled catalog with no
   data is a final state and must never be painted from cache. */
let catalogViewCache=null;let catalogViewCacheRead=false;
function cachedCatalogView(){
  if(!catalogViewCacheRead){
    catalogViewCacheRead=true;
    try{
      if(typeof HfpCatalog==='undefined'||typeof HfpCatalog.readCache!=='function'
        ||typeof HfpCatalog.buildViewModel!=='function'||typeof localStorage==='undefined'){
        catalogViewCache=null;
      }else{
        const key=(typeof HFP_CONFIG!=='undefined'&&(HFP_CONFIG.catalogCacheKey||'flame_chick_catalog_v1'))||'flame_chick_catalog_v1';
        const fv=(typeof HFP_CONFIG!=='undefined'&&HFP_CONFIG.cacheFormatVersion!==undefined)?HFP_CONFIG.cacheFormatVersion:1;
        const entry=HfpCatalog.readCache(localStorage,key,fv);
        catalogViewCache=(entry&&entry.snapshot)?HfpCatalog.buildViewModel(entry.snapshot):null;
      }
    }catch(e){catalogViewCache=null}
  }
  return catalogViewCache;
}
/* Rows the tile lookup reads: the live catalog as soon as it is in, else the
   cached snapshot while it loads, else nothing (no product photo possible). */
function tileCatalogRows(){
  if(categories.length&&menu.length)return {cats:categories,items:menu};
  if(catalogSettled)return null;
  const v=cachedCatalogView();
  return (v&&v.categories&&v.menu)?{cats:v.categories,items:v.menu}:null;
}
function matchCategoryIn(cats,name){
  const q=String(name||'').toLowerCase();
  return (cats||[]).find(function(c){
    const n=String(c.Name||'').toLowerCase();
    return n===q||n.indexOf(q)!==-1||q.indexOf(n)!==-1;
  });
}

/* Resolve ONE product row to its photo URL: the same two real-photo branches
   as productImage() (catalog Image, then the published GitHub path) but
   without that function's per-category stock fallbacks and WITHOUT reading
   the live `menu` array — cached-snapshot rows are looked up before the
   catalog has settled. Empty string means "this row has no photo of its own". */
function tileProductImage(item){
  if(!item)return '';
  const api=resolveImage(item.Image?String(item.Image).trim():'','');
  if(api)return api;
  if(item.ImagePublished){
    const cur=item.ImageCurrentPath?String(item.ImageCurrentPath).trim():'';
    if(cur){const u=resolveImage(cur,'');if(u)return u}
    if(item.ImageFolderKey&&item.ImageGroupID){
      const ext=(item.ImageExtension||'jpg').toLowerCase().trim();
      const u=resolveImage('images/'+String(item.ImageFolderKey).trim()+'/'+String(item.ImageGroupID).trim()+'.'+ext,'');
      if(u)return u;
    }
  }
  return '';
}

/* Image of the FIRST product in a category that carries its own photo
   (catalog Image / published GitHub image), preferred from a Featured row.
   Empty string means "no real photo": the caller keeps its configured tile
   image (or the neutral placeholder while the catalog is still loading). */
function firstProductImageOfCategory(cat,rows){
  const catId=String(cat.ID);
  const items=(rows||menu).filter(x=>String(x.CategoryID)===catId);
  const ordered=items.filter(x=>isTrue(x.Featured)).concat(items.filter(x=>!isTrue(x.Featured)));
  for(const it of ordered){
    if(!(it.ImagePublished||it.ImageCurrentPath||it.Image||it.ImageFolderKey))continue;
    const u=tileProductImage(it);
    if(u)return u;
  }
  return '';
}

/* Landing tile ref -> product image, resolved against the live catalog (or
   the local cached snapshot while it loads — see tileCatalogRows).
   The ref may name a group that is NOT a catalog category (legacy "Sides"):
   try the ref, then each of its words, then the alias table pointing at the
   closest real categories, so every tile shows a genuine HFP photo. Returns
   '' when nothing resolves. */
function getFirstProductImageForCategory(ref){
  const q=String(ref||'').toLowerCase().trim();
  if(!q)return '';
  const rows=tileCatalogRows();
  if(!rows)return '';
  const aliases={
    'sides':['fried items','fries'],
    'sides & drinks':['fried items','fries'],
    'drinks':['beverages','fried items']
  };
  const candidates=[q].concat(q.split(/[^a-z0-9]+/).filter(w=>w.length>2));
  for(const c of candidates){
    const names=[c].concat(aliases[c]||[]);
    for(const n of names){
      const cat=matchCategoryIn(rows.cats,n);
      if(!cat)continue;
      const u=firstProductImageOfCategory(cat,rows.items);
      if(u)return u;
    }
  }
  return '';
}
function renderLandingInfo(info){
  const el=document.getElementById('lpInfoGrid');if(!el)return;
  el.innerHTML=lpActiveList(info.cards).map(c=>{
    const kind=lpInfoKindOf(c);
    const href=c.href||c.link||'';
    const inner=lpInfoCardElems({kind:kind,icon:c.icon,label:c.label||c.name,value:c.value||c.description});
    const kindAttr=kind?' data-info-kind="'+kind+'"':'';
    if(href){
      const target=c.linkTarget==='_blank'?' target="_blank" rel="noopener"':'';
      return '<a href="'+esc(href)+'"'+target+' class="lp-info-card"'+kindAttr+'>'+inner+'</a>';
    }
    return '<div class="lp-info-card"'+kindAttr+'>'+inner+'</div>';
  }).join('');
  /* The Opening-Hours card's spans were (re)created here — after renderHours()
     ran on DOMContentLoaded / applyCatalogSnapshot — so fill them now. */
  renderHours();
}

function renderGateChoices(choices){
  const el=document.getElementById('lpGateChoices');if(!el)return;
  const defaultChoices=[
    {id:'Delivery',label:tr('fulfillment.Delivery'),icon:'delivery',active:true},
    {id:'Takeaway',label:tr('fulfillment.Takeaway'),icon:'takeaway',active:true}
  ];
  const list=lpActiveList(choices).length?lpActiveList(choices):defaultChoices;
  const icons={
    delivery:'<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M15 6a1 1 0 100-2 1 1 0 000 2z" fill="#C8102E" stroke="none"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>',
    takeaway:'<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>'
  };
  el.innerHTML=list.map(c=>{
    const iconHtml=icons[c.icon]||'';
    return '<button class="ff-gate-choice" onclick="selectFulfillment(\''+esc(c.id)+'\')"><div class="ff-gate-icon">'+iconHtml+'</div><div class="ff-gate-label">'+esc(c.label)+'</div></button>';
  }).join('');
}

let websiteConfig={landing:null};
function applyLandingWebsiteConfig(){
  websiteConfig=buildWebsiteConfig();
  const L=websiteConfig.landing;
  // Fallback defaults if no admin data
  const D={
    header:{brand:tr('brand.name'),cta:tr('landing.header.menu')},
    hero:{
      titleHtml:'',
      titleAccent:tr('landing.hero.accent'),
      titleMain:tr('landing.hero.main'),
      support:tr('landing.hero.support'),
      cta:tr('landing.hero.cta'),
      image:'https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/DL-1-b80480b41cf8da6b.webp',
      imageActive:true,
      imageAlt:tr('landing.hero.imageAlt')
    },
    gate:{
      brand:tr('brand.short'),
      subtitle:tr('landing.gate.subtitle'),
      choices:[
        {id:'Delivery',label:tr('fulfillment.Delivery'),icon:'delivery',active:true},
        {id:'Takeaway',label:tr('fulfillment.Takeaway'),icon:'takeaway',active:true}
      ]
    },
    about:{
      heading:tr('landing.about.heading'),
      description:tr('landing.about.desc'),
      images:[
        {image:'https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/DL-1-b80480b41cf8da6b.webp',alt:tr('landing.about.extAlt'),placement:'main',active:true},
        {image:'https://raw.githubusercontent.com/itsfahadahmed1234-creator/hassan-food-point-images-staging/main/deals/SD-1-4407031e7c447471.jpg',alt:tr('landing.about.intAlt'),placement:'side',active:true}
      ]
    },
    why:{
      heading:tr('landing.why.heading'),
      cards:[
        {icon:'🍕',title:tr('landing.why.madeFresh'),active:true,sortOrder:1},
        {icon:'🚀',title:tr('landing.why.fastDelivery'),active:true,sortOrder:2},
        {icon:'⭐',title:tr('landing.why.quickService'),active:true,sortOrder:3},
        {icon:'🔥',title:tr('landing.why.clearPrices'),active:true,sortOrder:4}
      ]
    },
    how:{
      heading:tr('landing.how.heading'),
      steps:[
        {label:tr('landing.how.choose'),icon:'🛒',active:true,sortOrder:1},
        {label:tr('landing.how.order'),icon:'🧾',active:true,sortOrder:2},
        {label:tr('landing.how.enjoy'),icon:'🍕',active:true,sortOrder:3}
      ]
    },
    menuCategories:{
      heading:tr('landing.menu.heading'),
      items:[
        {name:tr('landing.menu.pizza'),menuRef:'Pizzas',image:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=400&q=80',active:true,sortOrder:1},
        {name:tr('landing.menu.burgers'),menuRef:'Burgers',image:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',active:true,sortOrder:2},
        {name:tr('landing.menu.shawarma'),menuRef:'Shawarmas',image:'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=400&q=80',active:true,sortOrder:3},
        {name:tr('landing.menu.friedItems'),menuRef:'Fried Items',image:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=80',active:true,sortOrder:4}
      ]
    },
    info:{
      heading:tr('landing.info.heading'),
      cards:[
        {label:tr('landing.info.cashOnDelivery'),value:tr('landing.info.payAtDoor'),icon:'💵',active:true,sortOrder:2},
        {label:tr('landing.info.hotFresh'),value:tr('landing.info.madeToOrder'),icon:'🔥',active:true,sortOrder:3},
        {id:'phone',kind:'call',label:tr('landing.info.callUs'),value:String(PHONE_DISPLAY||''),icon:'📞',href:'tel:'+String(WA_PHONE||''),active:true,sortOrder:4},
        {id:'hours',kind:'hours',label:tr('landing.info.hours'),value:'',icon:'🕒',active:true,sortOrder:5}
      ]
    },
    finalCta:{
      heading:tr('landing.cta.heading'),
      button:tr('landing.cta.button'),
      sub:String(PHONE_DISPLAY||'')
    },
    footer:{
      brand:tr('brand.name'),
      contact:String(PHONE_DISPLAY||'')
    }
  };
  // Merge admin data over defaults (shallow merge for each section)
  const merged={
    header:{...D.header,...(L.header||{})},
    hero:{...D.hero,...(L.hero||{})},
    gate:{...D.gate,...(L.gate||{})},
    about:{...D.about,...(L.about||{}),images:L.about?.images||D.about.images},
    why:{...D.why,...(L.why||{}),cards:L.why?.cards||D.why.cards},
    how:{...D.how,...(L.how||{}),steps:L.how?.steps||D.how.steps},
    menuCategories:{...D.menuCategories,...(L.menuCategories||{}),items:L.menuCategories?.items||D.menuCategories.items},
    info:{...D.info,...(L.info||{}),cards:L.info?.cards||D.info.cards},
    finalCta:{...D.finalCta,...(L.finalCta||{})},
    footer:{...D.footer,...(L.footer||{})}
  };
  const M=merged;
  lpText('lpHeaderBrand',M.header.brand);
  lpText('lpHeaderCta',M.header.cta);
  const heroTitle=M.hero.titleHtml||('<span>'+esc(M.hero.titleAccent)+'</span><br>'+esc(M.hero.titleMain));
  lpHtml('lpHeroTitle',heroTitle);
  lpText('lpHeroSupport',M.hero.support);
  lpText('lpHeroHours',M.hero.hours);
  lpText('lpHeroCta',M.hero.cta);
  const heroImg=document.getElementById('lpHeroImg');
  if(heroImg){
    /* Neutral start: the built-in stand-in photo (assets/about-exterior.jpg)
       is only used once the catalog has settled, so it can never be painted
       first and swapped later. While the real slot URL is unknown the <img>
       has no src and is transparent over .lp-hero's own dark background; as
       soon as the URL is known (cached slot at parse, or catalog apply) the
       element itself preloads it (loading="eager", script at end of body). */
    const heroSlot=siteSlotStartup('landing-hero');
    const heroSrc=heroSlot||(catalogSettled?resolveImage(M.hero.image||'',''):'');
    const heroOn=isTrue(M.hero.imageActive!==undefined?M.hero.imageActive:true)&&!!heroSrc;
    heroImg.style.display=heroOn?'':'none';
    if(heroOn){
      heroImg.onerror=function(){
        heroImg.onerror=null;
        const fb=resolveImage(landingDefaults().hero.image||'','');
        if(fb&&fb!==heroSrc)heroImg.src=fb;
      };
      if(heroImg.getAttribute('src')!==heroSrc)heroImg.src=heroSrc;
      if(M.hero.imageAlt)heroImg.alt=M.hero.imageAlt;
    }
  }
  const gate=document.getElementById('fulfillmentGate');
  if(gate){
    /* Same rule as the hero: dark neutral base until the gate slot is known. */
    const gateSlot=siteSlotStartup('landing-gate');
    const gateSrc=gateSlot||(catalogSettled?resolveImage(M.gate.image||'',''):'');
    gate.style.backgroundImage=gateSrc?'url("'+gateSrc+'")':'none';
  }
  lpText('lpGateBrand',M.gate.brand);
  lpText('lpGateSubtitle',M.gate.subtitle);
  renderGateChoices(M.gate.choices);
  lpText('lpAboutHeading',M.about.heading);
  lpText('lpAboutDesc',M.about.description);
  renderLandingAbout(M.about);
  lpText('lpWhyHeading',M.why.heading);
  renderLandingWhy(M.why);
  lpText('lpHowHeading',M.how.heading);
  renderLandingHow(M.how);
  lpText('lpCategoriesHeading',M.menuCategories.heading);
  renderLandingMenuCategories(M.menuCategories);
  lpText('lpInfoHeading',M.info.heading);
  renderLandingInfo(M.info);
  lpText('lpCtaHeading',M.finalCta.heading);
  lpText('lpCtaButton',M.finalCta.button);
  lpText('lpCtaSub',M.finalCta.sub);
  lpText('lpFooterBrand',M.footer.brand);
  lpText('lpFooterContact',M.footer.contact);
}

applyLandingWebsiteConfig();
/* Menu hero needs the same startup pass: cached slot = correct image on frame 1,
   otherwise neutral until the catalog settles (see renderMenuHero). */
renderMenuHero();
/* The brand mark is not part of applyLandingWebsiteConfig: resolve it on the
   first frame so an owner-uploaded menu-logo slot is never late. */
applyMenuLogo();

/* ===== Phase 2D static DOM i18n ===== */
function applyStaticI18n(){
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    var k=el.getAttribute('data-i18n');
    if(!k)return;
    var keepImg=el.querySelector('img');
    if(keepImg)return;
    el.textContent=tr(k);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
    var k=el.getAttribute('data-i18n-ph');
    if(k)el.setAttribute('placeholder',tr(k));
  });
  var ff=document.getElementById('ffTriggerLabel');
  if(ff)ff.textContent=tr('fulfillment.'+fulfillmentType);
  document.querySelectorAll('.ff-option').forEach(function(btn){
    var id=btn.getAttribute('data-ff')||'';
    if(id){
      var svg=btn.querySelector('svg');
      btn.innerHTML='';
      if(svg)btn.appendChild(svg);
      btn.appendChild(document.createTextNode(' '+tr('fulfillment.'+id)));
    }
  });
  var mobileCount=document.getElementById('mobileCount');
  if(mobileCount){
    var n=parseInt(mobileCount.textContent,10)||0;
    mobileCount.textContent=n+' '+tr(n===1?'cart.item':'cart.items');
  }
}
/* ===== Phase 2D language toggle + re-render ===== */
function setLanguageUI(){
  applyStaticI18n();
  document.querySelectorAll('[data-lang-toggle]').forEach(function(btn){
    const other=HFP_I18N.get()==='ur'?'en':'ur';
    btn.textContent=other==='ur'?'اردو':'English';
    btn.setAttribute('aria-label',tr('lang.label'));
    btn.title=tr('lang.label');  });
}
function toggleLanguage(){
  const next=HFP_I18N.get()==='ur'?'en':'ur';
  HFP_I18N.set(next);
}
/* Re-render any open dialog in the new language, preserving qty / note /
   modifier selections (openPizza/openProduct rebuild their bodies from
   scratch, so state is captured first and restored after). */
function refreshOpenDialogLanguage(){
  const pzM=document.getElementById('pizzaModal');
  if(pzM&&pzM.classList.contains('open')&&pizzaGroups&&pizzaGroups.length){
    const title=(document.getElementById('pizzaTitle')||{}).textContent||'';
    const selOpt=document.querySelector('#pizzaBody .opt.sel');
    const sizes=pizzaGroups.slice();
    const qty=(document.getElementById('pizzaQty')||{}).textContent||'1';
    const note=(document.getElementById('pizzaNote')||{}).value||'';
    const sel=JSON.parse(JSON.stringify(mgSelection));
    openPizza(title,sizes,selOpt?selOpt.dataset.id:'');
    const q=document.getElementById('pizzaQty');if(q)q.textContent=qty;
    const n=document.getElementById('pizzaNote');if(n)n.value=note;
    mgSelection=sel;syncModifierButtons();updateModalPriceDisplay();
    return;
  }
  const pm=document.getElementById('productModal');
  if(pm&&pm.classList.contains('open')&&pm.dataset.itemId){
    const qty=(document.getElementById('detailQty')||{}).textContent||'1';
    const note=(document.getElementById('productNote')||{}).value||'';
    const sel=JSON.parse(JSON.stringify(mgSelection));
    openProduct(pm.dataset.itemId,false);
    const q=document.getElementById('detailQty');if(q)q.textContent=qty;
    const n=document.getElementById('productNote');if(n)n.value=note;
    mgSelection=sel;syncModifierButtons();updateDetailTotal();
  }
}
window.onHfpLanguageChange=function(){
  setLanguageUI();
  applyStaticI18n();
  const sy=_savedScrollY;
  try{
    /* Landing copy must ALWAYS be rebuilt: its text comes from localized
       defaults via lpText()/renderLanding* (most nodes have no data-i18n),
       so skipping it left stale Urdu on the unpublished/Gate-0 site where
       menu+categories are empty (Bug 1). */
    applyLandingWebsiteConfig();
    if(siteConfig.footer_text_en)lpText('lpFooterContact',siteConfig.footer_text_en);
    if(siteConfig.address)injectLocationInfoCard(siteConfig.address);
    if(categories.length||menu.length){
      applySiteContent();
      renderCategories();render();renderCart();
      updateFulfillmentUI();
      if(document.getElementById('checkoutModal').classList.contains('open'))renderCheckout();
      if(document.getElementById('dealModal').classList.contains('open')&&dealModalState)renderDealModal();
    }else if(document.querySelector('.menu-unavailable')){
      renderUnavailablePanel(document.querySelector('.menu-unavailable').getAttribute('data-state')||'error');
      renderCart();
      updateFulfillmentUI();
    }else{
      if(document.querySelector('.menu-loading'))setMenuLoading();
      renderCart();
      updateFulfillmentUI();
    }
    refreshOpenDialogLanguage();
    if(document.getElementById('waFallbackModal').classList.contains('open'))showWaFallback(window.__waFallbackMsg||'');
    if(document.getElementById('successModal').classList.contains('open'))renderWhatsAppSent();
    const toast=document.getElementById('toast');
    if(toast&&toast.classList.contains('show'))toast.classList.remove('show');
  }catch(err){console.error('language re-render failed',err)}
  _savedScrollY=sy;
};
setLanguageUI();