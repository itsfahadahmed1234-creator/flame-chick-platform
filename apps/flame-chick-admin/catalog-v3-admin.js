/* Authenticated Flame Chick catalog V3 workspace. No direct table writes. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FlameChickAdminCatalogV3=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const READ={categories:'catalog_categories_list',products:'catalog_products_list',collections:'catalog_deal_collections_list',schedules:'catalog_schedule_sets_list',deals:'catalog_deals_list',dealDetail:'catalog_deal_detail_read',scheduleDetail:'catalog_schedule_detail_read'};
  const WRITE={category:'catalog_category_upsert',product:'catalog_product_upsert',collection:'catalog_deal_collection_upsert',deal:'catalog_deal_upsert',components:'catalog_deal_components_upsert',mappings:'catalog_deal_variant_options_upsert',schedule:'catalog_schedule_set_upsert',assignment:'catalog_deal_schedule_assignment_upsert'};
  const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  function text(v,max,label,required){const s=String(v==null?'':v).trim();if(required&&!s)throw Error(label+' is required.');if(s.length>max)throw Error(label+' is too long.');return s||null;}
  function amount(v,label,required){const s=String(v==null?'':v).trim();if(!s){if(required)throw Error(label+' is required for a standalone-sellable variant.');return null;}const n=Number(s);if(!Number.isFinite(n)||n<0||Math.round(n*100)!==n*100)throw Error(label+' must be a non-negative amount with up to two decimals.');return n;}
  function normalizeProductDraft(form){
    if(!isObj(form))throw Error('Product form data is invalid.');
    const variants=Array.isArray(form.variants)?form.variants:[];
    if(!variants.length||variants.length>50)throw Error('Add between 1 and 50 variants.');
    const seen=new Set();
    const rows=variants.map((r,i)=>{
      const key=String(r.size_key||'').trim().toUpperCase();
      if(!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(key)||seen.has(key))throw Error('Variant '+(i+1)+' needs a unique valid key.');
      seen.add(key);
      const kind=r.variant_kind||'standard';
      if(!['standard','portion','flavour','pack','volume'].includes(kind))throw Error('Unsupported variant type.');
      const standalone=r.is_standalone_sellable!==false;
      const qty=r.pack_quantity===''||r.pack_quantity==null?null:Number(r.pack_quantity);
      const unit=text(r.pack_unit,24,'Pack unit',false);
      if(kind==='pack'){if(!Number.isSafeInteger(qty)||qty<1||!unit)throw Error('Pack variants need a positive pack quantity and unit.');}
      else if(qty!==null||unit!==null)throw Error('Only pack variants may have pack quantity and unit.');
      return {...(r.id?{id:r.id}:{}),size_key:key,size_label:text(r.size_label,80,'Variant label',true),
        price:amount(r.price,'Variant price',standalone),variant_kind:kind,pack_quantity:qty,pack_unit:unit,
        is_standalone_sellable:standalone,sort_order:i+1,is_active:r.is_active!==false,is_available:r.is_available!==false};
    });
    return {...(form.id?{id:form.id}:{}),category_id:text(form.category_id,64,'Menu category',true),
      name_en:text(form.name_en,120,'Product name',true),name_ur:text(form.name_ur,120,'Urdu name',false),
      description_en:text(form.description_en,2000,'Description',false),description_ur:text(form.description_ur,2000,'Urdu description',false),
      featured:form.featured===true,sort_order:Number.isSafeInteger(form.sort_order)&&form.sort_order>=0?form.sort_order:0,
      is_active:form.is_active!==false,is_available:form.is_available!==false,variants:rows};
  }
  function buildFixedComponentGroups(components){
    if(!Array.isArray(components)||components.length<1||components.length>40)throw Error('A fixed deal needs 1–40 components.');
    return {groups:components.map((c,i)=>{
      const label=text(c.display_name,120,'Component label',true),variant=text(c.product_variant_id,64,'Product variant',true);
      const q=Number(c.quantity);
      if(!Number.isSafeInteger(q)||q<1||q>100)throw Error('Component quantity must be a whole number from 1 to 100.');
      return {name_en:label,name_ur:null,min_units:q,max_units:q,allow_repeat_option:q>1,
        max_units_per_option:q>1?q:null,sort_order:i+1,is_active:true,
        options:[{product_variant_id:variant,sort_order:1,is_active:true}]};
    })};
  }
  function buildIncludedMappings(detail){
    if(!isObj(detail)||!Array.isArray(detail.component_groups)||!Array.isArray(detail.variants)||detail.variants.length!==1)throw Error('Saved deal structure could not be verified.');
    const variant=detail.variants[0]&&detail.variants[0].variant;
    if(!variant||!variant.id||variant.pricing_mode!=='FIXED_BUNDLE')throw Error('Deal must have one fixed-price variant.');
    const options=detail.component_groups.map(doc=>{
      const group=doc&&doc.group,rows=doc&&doc.options;
      if(!group||!Array.isArray(rows)||rows.length!==1||!rows[0].id)throw Error('Each fixed component must have exactly one linked product variant.');
      const q=Number(group.min_units);
      if(!Number.isSafeInteger(q)||q<1||Number(group.max_units)!==q)throw Error('Component quantity is not fixed.');
      return {component_option_id:rows[0].id,pricing_treatment:'INCLUDED',unit_surcharge:0,max_quantity_per_deal:q,sort_order:options.length+1,is_active:true};
    });
    if(!options.length)throw Error('Deal has no components.');
    return {deal_variant_id:variant.id,options};
  }
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash=v=>v==null?'No standalone price':'Rs. '+Number(v).toLocaleString('en-PK',{maximumFractionDigits:2});
  function checkbox(name,label,checked){return '<label class="fcv3-check"><input type="checkbox" data-field="'+name+'"'+(checked?' checked':'')+'> '+label+'</label>';}
  function createWorkspace(){
    let el=null,request=null;
    const s={loading:false,saving:false,error:null,notice:null,revision:null,categories:[],products:[],collections:[],deals:[],schedules:[],editor:null,components:[],detail:null,partial:null};
    async function read(action,args){const r=await request(action,args||{},false);if(!isObj(r)||r.ok===false)throw Error('Catalog read failed.');if(Number.isSafeInteger(r.draft_revision))s.revision=r.draft_revision;return r;}
    async function write(action,payload){const r=await request(action,payload,true);if(!isObj(r)||r.ok===false)throw Error('Catalog save failed.');if(Number.isSafeInteger(r.draft_revision))s.revision=r.draft_revision;return r;}
    async function refresh(){
      if(!el)return;s.loading=true;s.error=null;render();
      try{
        const [cats,prods,cols,schedules]=await Promise.all([
          read(READ.categories,{limit:100}),read(READ.products,{limit:50}),read(READ.collections,{limit:50}),read(READ.schedules,{limit:50})
        ]);
        s.categories=cats.items||[];s.products=prods.items||[];s.collections=cols.items||[];s.schedules=schedules.items||[];
        const lists=await Promise.all(s.collections.map(c=>read(READ.deals,{collection_id:c.id,limit:50})));
        s.deals=lists.flatMap(x=>x.items||[]);
      }catch(e){s.error=e.message||'Unable to load catalog draft.';}
      finally{s.loading=false;render();}
    }
    function categoryLabel(id){return s.categories.find(c=>c.id===id)?.name_en||'Unknown category';}
    function variantRows(product){
      const rows=product&&Array.isArray(product.variants)?product.variants:[{size_key:'REGULAR',size_label:'Regular',price:'',variant_kind:'standard',pack_quantity:null,pack_unit:null,is_standalone_sellable:true,is_active:true,is_available:true}];
      return rows.map(v=>'<article class="fcv3-variant-row" data-variant-row>'+
        (v.id?'<input type="hidden" data-field="id" value="'+esc(v.id)+'">':'')+
        '<div class="fcv3-variant-grid">'+
        '<label>Variant key<input data-field="size_key" maxlength="32" required value="'+esc(v.size_key)+'"></label>'+
        '<label>Label<input data-field="size_label" maxlength="80" required value="'+esc(v.size_label)+'"></label>'+
        '<label>Type<select data-field="variant_kind">'+['standard','portion','flavour','pack','volume'].map(k=>'<option value="'+k+'"'+((v.variant_kind||'standard')===k?' selected':'')+'>'+k+'</option>').join('')+'</select></label>'+
        '<label>Price (PKR)<input data-field="price" type="number" min="0" step="0.01" value="'+(v.price==null?'':esc(v.price))+'" placeholder="'+(v.is_standalone_sellable===false?'Optional (deal-only)':'Required')+'"></label>'+
        '<label>Pack quantity<input data-field="pack_quantity" type="number" min="1" step="1" value="'+esc(v.pack_quantity)+'" '+(v.variant_kind==='pack'?'':'disabled')+'></label>'+
        '<label>Pack unit<input data-field="pack_unit" maxlength="24" value="'+esc(v.pack_unit)+'" '+(v.variant_kind==='pack'?'':'disabled')+'></label>'+
        '</div><div class="fcv3-checks">'+checkbox('standalone','Standalone menu item',v.is_standalone_sellable!==false)+
        checkbox('variant_active','Active',v.is_active!==false)+checkbox('variant_available','Available',v.is_available!==false)+
        '<button type="button" class="fcv3-button fcv3-danger" data-action="variant-remove">Remove</button></div></article>').join('');
    }
    function productForm(p){
      return '<form class="fcv3-editor" data-form="product">'+(p&&p.id?'<input type="hidden" name="id" value="'+esc(p.id)+'">':'')+
        '<div class="fcv3-form-grid"><label>Menu category<select name="category_id" required><option value="">Select category</option>'+
        s.categories.filter(c=>c.category_kind==='menu').map(c=>'<option value="'+esc(c.id)+'"'+(p&&p.category_id===c.id?' selected':'')+'>'+esc(c.name_en)+'</option>').join('')+
        '</select></label><label>Product name<input name="name_en" maxlength="120" required value="'+esc(p&&p.name_en)+'"></label>'+
        '<label>Urdu name<input name="name_ur" maxlength="120" value="'+esc(p&&p.name_ur)+'"></label>'+
        '<label>Sort order<input name="sort_order" type="number" min="0" step="1" value="'+esc(p?p.sort_order:0)+'"></label>'+
        '<label class="fcv3-wide">Description<textarea name="description_en" maxlength="2000" rows="2">'+esc(p&&p.description_en)+'</textarea></label>'+
        '<label class="fcv3-wide">Urdu description<textarea name="description_ur" maxlength="2000" rows="2">'+esc(p&&p.description_ur)+'</textarea></label></div>'+
        '<div class="fcv3-checks">'+checkbox('featured','Featured',!!(p&&p.featured))+checkbox('is_active','Active',p?p.is_active!==false:true)+checkbox('is_available','Available',p?p.is_available!==false:true)+'</div>'+
        '<div class="fcv3-subhead"><div><h4>Variants</h4><p>Standalone prices are required; deal-only variant prices may be NULL.</p></div><button type="button" class="fcv3-button" data-action="variant-add">+ Add variant</button></div>'+
        '<div class="fcv3-variants">'+variantRows(p)+'</div><div class="fcv3-editor-actions"><button type="button" class="fcv3-button fcv3-muted" data-action="editor-cancel">Cancel</button><button type="submit" class="fcv3-button fcv3-primary">Save product</button></div></form>';
    }
    function categoryForm(){return '<form class="fcv3-editor" data-form="category"><div class="fcv3-form-grid">'+
      '<label>Kind<select name="category_kind"><option value="menu">Menu</option><option value="deal">Deals</option></select></label>'+
      '<label>English name<input name="name_en" maxlength="120" required></label><label>Urdu name<input name="name_ur" maxlength="120"></label>'+
      '<label>Sort order<input name="sort_order" type="number" min="0" step="1" value="0"></label></div>'+
      '<div class="fcv3-editor-actions"><button type="button" class="fcv3-button fcv3-muted" data-action="editor-cancel">Cancel</button><button type="submit" class="fcv3-button fcv3-primary">Save category</button></div></form>';}
    function componentForm(c){
      const product=s.products.find(p=>p.id===c.product_id)||s.products.find(p=>p.is_active!==false);
      const productId=c.product_id||(product&&product.id)||'';
      const variants=product&&product.variants?product.variants.filter(v=>v.is_active!==false):[];
      const variantId=c.product_variant_id||(variants[0]&&variants[0].id)||'';
      return '<article class="fcv3-component-row" data-component-row><div class="fcv3-component-grid">'+
        '<label>Displayed component name<input data-field="display_name" maxlength="120" required value="'+esc(c.display_name||(product&&product.name_en))+'"></label>'+
        '<label>Linked product<select data-field="product_id" data-component-product>'+s.products.filter(p=>p.is_active!==false).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===productId?' selected':'')+'>'+esc(p.name_en)+'</option>').join('')+'</select></label>'+
        '<label>Variant<select data-field="product_variant_id" data-component-variant>'+variants.map(v=>'<option value="'+esc(v.id)+'"'+(v.id===variantId?' selected':'')+'>'+esc(v.size_label)+(v.is_standalone_sellable===false?' · Deal-only':'')+'</option>').join('')+'</select></label>'+
        '<label>Quantity<input data-field="quantity" type="number" min="1" max="100" step="1" required value="'+esc(c.quantity||1)+'"></label></div>'+
        '<button type="button" class="fcv3-button fcv3-danger" data-action="component-remove">Remove component</button></article>';
    }
    function dealForm(){
      return '<form class="fcv3-editor" data-form="deal"><div class="fcv3-warning">Fixed-price deal only. Every component is locked and INCLUDED. No selectable upgrades or +price options are created.</div>'+
        '<div class="fcv3-form-grid"><label>Deal title<input name="title" maxlength="160" required value="'+esc(s.dealDraft&&s.dealDraft.title)+'"></label>'+
        '<label>Deal price (PKR)<input name="base_price" type="number" min="0" step="0.01" required value="'+esc(s.dealDraft&&s.dealDraft.base_price)+'"></label>'+
        '<label class="fcv3-wide">Description<textarea name="description_en" maxlength="3000" rows="2">'+esc(s.dealDraft&&s.dealDraft.description_en)+'</textarea></label>'+
        '<label class="fcv3-check"><input type="checkbox" name="flame_hour"'+(s.dealDraft&&s.dealDraft.flame_hour?' checked':'')+'> Flame Hour daily 3–5 PM (Asia/Karachi)</label></div>'+
        '<div class="fcv3-subhead"><div><h4>Fixed components</h4><p>Each component links to one exact product variant.</p></div><button type="button" class="fcv3-button" data-action="component-add">+ Add component</button></div>'+
        '<div class="fcv3-components">'+s.components.map(componentForm).join('')+'</div>'+
        '<div class="fcv3-editor-actions"><button type="button" class="fcv3-button fcv3-muted" data-action="editor-cancel">Cancel</button><button type="submit" class="fcv3-button fcv3-primary">Create fixed deal</button></div></form>';
    }
    function render(){
      if(!el)return;
      const productRows=s.products.map(p=>{
        const standalone=p.variants.filter(v=>v.is_standalone_sellable!==false);
        const dealOnly=p.variants.filter(v=>v.is_standalone_sellable===false);
        return '<tr><td><strong>'+esc(p.name_en)+'</strong><small>'+esc(p.description_en||'')+'</small></td><td>'+esc(categoryLabel(p.category_id))+'</td>'+
          '<td>'+(standalone.length?esc(standalone.map(v=>cash(v.price)+' ('+v.size_label+')').join(', ')):'—')+
          (dealOnly.length?'<small>'+dealOnly.length+' deal-only variant(s)</small>':'')+'</td><td>'+(p.is_active?(p.is_available?'Active':'Unavailable'):'Hidden')+'</td>'+
          '<td><button class="fcv3-button" data-action="product-edit" data-id="'+esc(p.id)+'">Edit</button></td></tr>';
      }).join('');
      const collectionHtml=s.collections.map(c=>{
        const deals=s.deals.filter(d=>d.collection_id===c.id);
        return '<section class="fcv3-collection"><h4>'+esc(c.name_en)+'</h4><div class="fcv3-deals">'+
          (deals.length?deals.map(d=>'<article class="fcv3-deal-card"><div><strong>'+esc(d.title)+'</strong><small>'+(d.active_variant_count||0)+' active variant(s) · '+(d.is_active?'Active':'Draft / hidden')+'</small></div>'+
          '<button class="fcv3-button" data-action="deal-detail" data-id="'+esc(d.id)+'">Inspect</button></article>').join(''):'<p class="fcv3-empty">No deals in this collection.</p>')+'</div></section>';
      }).join('');
      el.innerHTML='<div class="fcv3-head"><div><span class="fcv3-kicker">AUTHENTICATED COMMAND API</span><h2>Catalog V3 workspace</h2><p>Draft authoring through secured Admin/Owner commands; no direct PostgREST table writes.</p></div>'+
        '<div class="fcv3-head-actions"><span class="fcv3-revision">'+(s.revision==null?'Revision not loaded':'Draft revision '+s.revision)+'</span><button class="fcv3-button" data-action="refresh"'+(s.loading||s.saving?' disabled':'')+'>Refresh</button></div></div>'+
        (s.error?'<div class="fcv3-error" role="alert">'+esc(s.error)+'</div>':'')+(s.notice?'<div class="fcv3-notice" role="status">'+esc(s.notice)+'</div>':'')+
        (s.partial?'<div class="fcv3-warning">A deal record was created but remains inactive. ID: '+esc(s.partial.id)+'. Do not create a duplicate; inspect this draft before continuing.</div>':'')+
        '<div class="fcv3-summary-grid"><article><small>Menu categories</small><strong>'+s.categories.filter(c=>c.category_kind==='menu').length+'</strong></article><article><small>Products</small><strong>'+s.products.length+'</strong></article>'+
        '<article><small>Deal-only variants</small><strong>'+s.products.reduce((n,p)=>n+p.variants.filter(v=>v.is_standalone_sellable===false).length,0)+'</strong></article><article><small>Fixed deals</small><strong>'+s.deals.length+'</strong></article></div>'+
        '<div class="fcv3-toolbar"><div><h3>Products and variants</h3><p>Standalone variants require prices. Deal-only variants may be unpriced and stay out of standalone menu cards.</p></div><button class="fcv3-button fcv3-primary" data-action="product-add">+ Add product</button></div>'+
        '<div class="fcv3-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Standalone prices</th><th>Status</th><th></th></tr></thead><tbody>'+(productRows||'<tr><td colspan="5">No products in draft.</td></tr>')+'</tbody></table></div>'+
        '<div class="fcv3-toolbar"><div><h3>Categories</h3><p>Menu and deal categories are distinct.</p></div><button class="fcv3-button" data-action="category-add">+ Add category</button></div>'+
        '<div class="fcv3-category-grid">'+s.categories.map(c=>'<article><strong>'+esc(c.name_en)+'</strong><small>'+esc(c.category_kind)+' · '+(c.is_active?'Active':'Inactive')+'</small></article>').join('')+'</div>'+
        '<div class="fcv3-toolbar"><div><h3>Deals and offers</h3><p>Each deal has its own fixed price and fixed INCLUDED component list. No selectable upgrades are enabled.</p></div><button class="fcv3-button fcv3-primary" data-action="deal-add">+ Create fixed deal</button></div>'+
        (collectionHtml||'<p class="fcv3-empty">No deal collection yet. The first deal creates the Deals category and collection.</p>')+
        (s.editor?'<div class="fcv3-editor-shell"><div class="fcv3-editor-head"><div><span class="fcv3-kicker">DRAFT EDITOR</span><h3>'+
          (s.editor.type==='product'?(s.editor.product?'Edit product':'Add product'):s.editor.type==='category'?'Add category':'Create fixed deal')+'</h3></div><button class="fcv3-button fcv3-muted" data-action="editor-cancel">Close</button></div>'+
          (s.editor.type==='product'?productForm(s.editor.product):s.editor.type==='category'?categoryForm():dealForm())+'</div>':'')+
        (s.detail?'<div class="fcv3-detail"><h3>Deal inspection</h3><strong>'+esc(s.detail.deal.title)+'</strong><small>'+esc(s.detail.deal.id)+'</small>'+
          '<div>'+s.detail.component_groups.map(g=>'<p>'+esc(g.group.name_en)+' × '+g.group.min_units+' — '+(g.options[0]?esc(g.options[0].product_name_en)+' / '+esc(g.options[0].variant_label):'No option')+'</p>').join('')+'</div>'+
          '<button class="fcv3-button" data-action="detail-close">Close inspection</button></div>':'');
    }
    function openProduct(p){s.editor={type:'product',product:p?JSON.parse(JSON.stringify(p)):null};s.notice=null;s.error=null;render();}
    function openDeal(){
      if(!s.products.some(p=>p.is_active!==false&&p.variants.some(v=>v.is_active!==false))){s.error='Add active products and variants before creating a deal.';render();return;}
      s.editor={type:'deal'};s.components=[{display_name:'',product_id:'',product_variant_id:'',quantity:1}];s.dealDraft={title:'',description_en:'',base_price:'',flame_hour:false};s.notice=null;s.error=null;s.partial=null;render();
    }
    async function ensureDealCollection(){
      let cat=s.categories.find(c=>c.category_kind==='deal'&&c.is_active);
      if(!cat){const r=await write(WRITE.category,{category_kind:'deal',name_en:'Deals',name_ur:null,sort_order:90,is_active:true});await refresh();cat=s.categories.find(c=>c.id===r.entity_id);}
      if(!cat)throw Error('Active Deals category could not be verified.');
      let col=s.collections.find(c=>c.category_id===cat.id&&c.is_active);
      if(!col){const r=await write(WRITE.collection,{category_id:cat.id,name_en:'Deals',name_ur:null,sort_order:0,is_active:true,schedule_set_id:null});await refresh();col=s.collections.find(c=>c.id===r.entity_id);}
      if(!col)throw Error('Deals collection could not be verified.');
      return col;
    }
    async function ensureFlameHourSchedule(){
      for(const item of s.schedules){
        if(item.name!=='Flame Hour daily'||!item.is_active||item.timezone!=='Asia/Karachi')continue;
        const detail=await read(READ.scheduleDetail,{schedule_set_id:item.id});
        const wins=detail.windows||[];
        if(wins.length===7&&wins.every((w,i)=>w.window_kind==='WEEKLY'&&Number(w.weekday_iso)===i+1&&w.local_start==='15:00:00'&&w.local_end==='17:00:00'&&!w.is_all_day))return item.id;
      }
      const windows=Array.from({length:7},(_,i)=>({window_kind:'WEEKLY',weekday_iso:i+1,local_start:'15:00:00',local_end:'17:00:00',is_all_day:false,starts_at:null,ends_at:null,effective_from:null,effective_to:null}));
      const r=await write(WRITE.schedule,{name:'Flame Hour daily',timezone:'Asia/Karachi',is_active:true,windows});
      await refresh();const found=s.schedules.find(x=>x.id===r.entity_id);if(!found)throw Error('Flame Hour schedule saved but could not be verified.');return found.id;
    }
    async function createDeal(form){
      const title=text(form.title,160,'Deal title',true),desc=text(form.description_en,3000,'Description',false),base=amount(form.base_price,'Deal base price',true);
      const groups=buildFixedComponentGroups(s.components);
      const collection=await ensureDealCollection();
      let dealId=null,dealVariantId=null;
      try{
        const created=await write(WRITE.deal,{collection_id:collection.id,title,description_en:desc,featured:false,sort_order:s.deals.length+1,is_active:false,is_available:true,
          variants:[{variant_key:'BUNDLE',label_en:title,label_ur:null,pricing_mode:'FIXED_BUNDLE',base_price:base,sort_order:1,is_active:false}]});
        dealId=created.entity_id;if(!dealId)throw Error('Deal ID was not returned. Do not retry without inspecting the draft.');
        const before=await read(READ.dealDetail,{deal_id:dealId});
        if(!Array.isArray(before.variants)||before.variants.length!==1)throw Error('New deal variant could not be verified.');
        dealVariantId=before.variants[0].variant.id;
        await write(WRITE.components,{deal_id:dealId,groups:groups.groups});
        const detail=await read(READ.dealDetail,{deal_id:dealId});
        const mapped=buildIncludedMappings(detail);
        if(mapped.deal_variant_id!==dealVariantId)throw Error('Deal variant identity changed during component setup.');
        await write(WRITE.mappings,{deal_id:dealId,deal_variant_id:dealVariantId,options:mapped.options});
        if(form.flame_hour){const scheduleId=await ensureFlameHourSchedule();await write(WRITE.assignment,{deal_id:dealId,branch_id:null,schedule_set_id:scheduleId,is_active:true});}
        await write(WRITE.deal,{id:dealId,title,description_en:desc,is_active:true,is_available:true,
          variants:[{id:dealVariantId,variant_key:'BUNDLE',label_en:title,label_ur:null,pricing_mode:'FIXED_BUNDLE',base_price:base,sort_order:1,is_active:true}]});
        s.partial=null;s.editor=null;s.notice='Fixed deal saved. Components are locked and use INCLUDED pricing.';await refresh();
      }catch(error){if(dealId)s.partial={id:dealId,variantId:dealVariantId};throw error;}
    }
    function readVariantRows(form){
      return Array.from(form.querySelectorAll('[data-variant-row]')).map(row=>({
        id:row.querySelector('[data-field="id"]')?.value||undefined,
        size_key:row.querySelector('[data-field="size_key"]').value,
        size_label:row.querySelector('[data-field="size_label"]').value,
        variant_kind:row.querySelector('[data-field="variant_kind"]').value,
        price:row.querySelector('[data-field="price"]').value,
        pack_quantity:row.querySelector('[data-field="pack_quantity"]').value,
        pack_unit:row.querySelector('[data-field="pack_unit"]').value,
        is_standalone_sellable:row.querySelector('[data-field="standalone"]').checked,
        is_active:row.querySelector('[data-field="variant_active"]').checked,
        is_available:row.querySelector('[data-field="variant_available"]').checked
      }));
    }
    async function submit(form){
      const fd=new FormData(form),type=form.dataset.form;
      if(type==='category'){await write(WRITE.category,{category_kind:fd.get('category_kind'),name_en:text(fd.get('name_en'),120,'Category name',true),name_ur:text(fd.get('name_ur'),120,'Urdu name',false),sort_order:Number(fd.get('sort_order')||0),is_active:true});s.editor=null;s.notice='Category saved to catalog draft.';await refresh();return;}
      if(type==='product'){
        const payload=normalizeProductDraft({id:fd.get('id')||undefined,category_id:fd.get('category_id'),name_en:fd.get('name_en'),name_ur:fd.get('name_ur'),description_en:fd.get('description_en'),description_ur:fd.get('description_ur'),sort_order:Number(fd.get('sort_order')||0),featured:fd.has('featured'),is_active:fd.has('is_active'),is_available:fd.has('is_available'),variants:readVariantRows(form)});
        await write(WRITE.product,payload);s.editor=null;s.notice='Product and variants saved to catalog draft.';await refresh();return;
      }
      if(type==='deal'){s.dealDraft={title:fd.get('title'),description_en:fd.get('description_en'),base_price:fd.get('base_price'),flame_hour:fd.has('flame_hour')};await createDeal(s.dealDraft);}
    }
    function bind(){
      el.onclick=async event=>{
        const b=event.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action;
        try{
          if(a==='refresh')await refresh();
          else if(a==='category-add'){s.editor={type:'category'};render();}
          else if(a==='product-add')openProduct(null);
          else if(a==='product-edit')openProduct(s.products.find(p=>p.id===b.dataset.id));
          else if(a==='deal-add')openDeal();
          else if(a==='variant-add'){if(!s.editor.product)s.editor.product={variants:[]};s.editor.product.variants=s.editor.product.variants||[];s.editor.product.variants.push({size_key:'OPTION_'+(s.editor.product.variants.length+1),size_label:'Option '+(s.editor.product.variants.length+1),price:'',variant_kind:'standard',is_standalone_sellable:true,is_active:true,is_available:true});render();}
          else if(a==='variant-remove'){b.closest('[data-variant-row]')?.remove();}
          else if(a==='component-add'){s.components.push({display_name:'',product_id:'',product_variant_id:'',quantity:1});render();}
          else if(a==='component-remove'){b.closest('[data-component-row]')?.remove();}
          else if(a==='editor-cancel'){s.editor=null;render();}
          else if(a==='deal-detail'){s.detail=await read(READ.dealDetail,{deal_id:b.dataset.id});render();}
          else if(a==='detail-close'){s.detail=null;render();}
        }catch(e){s.error=e.message||'Catalog action failed.';render();}
      };
      el.onchange=event=>{
        if(event.target.matches('[data-component-product]')){
          const row=event.target.closest('[data-component-row]'),p=s.products.find(x=>x.id===event.target.value),select=row.querySelector('[data-component-variant]');
          select.innerHTML=(p?p.variants.filter(v=>v.is_active!==false):[]).map(v=>'<option value="'+esc(v.id)+'">'+esc(v.size_label)+(v.is_standalone_sellable===false?' · Deal-only':'')+'</option>').join('');
        }
        if(event.target.matches('[data-field="variant_kind"]')){const row=event.target.closest('[data-variant-row]'),pack=event.target.value==='pack';row.querySelector('[data-field="pack_quantity"]').disabled=!pack;row.querySelector('[data-field="pack_unit"]').disabled=!pack;}
      };
      el.onsubmit=async event=>{
        const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(s.saving)return;
        s.saving=true;s.error=null;
        const formDataSnapshot=new FormData(form);
        try{await submit(form);}catch(e){s.error=e.message||'Catalog save failed.';}
        finally{s.saving=false;render();}
      };
    }
    return {mount:async(element,requestFn)=>{if(!element||typeof requestFn!=='function')throw Error('Catalog V3 workspace requires a root and authenticated request handler.');el=element;request=requestFn;bind();await refresh();},refresh,getState:()=>JSON.parse(JSON.stringify(s))};
  }
  return {READ,WRITE,normalizeProductDraft,buildFixedComponentGroups,buildIncludedMappings,createWorkspace};
});
