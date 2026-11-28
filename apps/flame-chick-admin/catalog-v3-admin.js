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
  function buildFixedComponentGroups(components,existingGroups=[]){
    if(!Array.isArray(components)||components.length<1||components.length>40)throw Error('A fixed deal needs 1–40 component groups.');
    const retainedGroupIds=new Set();
    const groups=components.map((c,i)=>{
      const label=text(c.display_name,120,'Component label',true),q=Number(c.quantity);
      if(!Number.isSafeInteger(q)||q<1||q>100)throw Error('Component quantity must be a whole number from 1 to 100.');
      const burger=/burger/i.test(label),submitted=Array.isArray(c.options)?c.options:[{option_id:c.option_id,product_variant_id:c.product_variant_id}];
      if(!submitted.length||submitted.length>40)throw Error(label+' needs between 1 and 40 active choices.');
      if(submitted.length>1&&!burger)throw Error('Only Burger groups may contain multiple included choices.');
      const repeat=c.allow_repeat_option===undefined?q>1:c.allow_repeat_option===true,maxPer=repeat?Number(c.max_units_per_option??q):null;
      if(repeat&&(!Number.isSafeInteger(maxPer)||maxPer<1||maxPer>q))throw Error(label+' has an invalid per-choice repeat limit.');
      if(burger&&repeat&&maxPer!==q)throw Error(label+' must allow each burger choice up to the required quantity ('+q+').');
      if(!repeat&&q>submitted.length)throw Error(label+' needs at least '+q+' distinct choices because repeats are disabled.');
      if(c.group_id)retainedGroupIds.add(c.group_id);
      const priorGroup=existingGroups.find(doc=>doc&&doc.group&&doc.group.id===c.group_id),priorOptions=priorGroup&&Array.isArray(priorGroup.options)?priorGroup.options:[];
      const seen=new Set(),representedIds=new Set(),representedVariants=new Set();
      const options=submitted.map((option,optionIndex)=>{
        const variant=text(option.product_variant_id,64,'Product variant',true);
        if(seen.has(variant))throw Error(label+' contains the same product variant more than once.');
        seen.add(variant);
        const old=priorOptions.find(row=>(option.option_id&&row.id===option.option_id)||row.product_variant_id===variant),id=option.option_id||(old&&old.id)||null;
        if(id)representedIds.add(id);representedVariants.add(variant);
        return {...(id?{id}:{}),product_variant_id:variant,sort_order:optionIndex+1,is_active:true};
      });
      priorOptions.forEach(old=>{
        if(!old||!old.id||representedIds.has(old.id)||representedVariants.has(old.product_variant_id))return;
        options.push({id:old.id,product_variant_id:old.product_variant_id,sort_order:Number(old.sort_order)||options.length+1,is_active:false});
      });
      return {...(c.group_id?{id:c.group_id}:{}),name_en:label,name_ur:null,min_units:q,max_units:q,
        allow_repeat_option:repeat,max_units_per_option:maxPer,sort_order:i+1,is_active:true,options};
    });
    for(const doc of existingGroups){
      const group=doc&&doc.group,rows=doc&&doc.options;
      if(!group||!group.id||retainedGroupIds.has(group.id))continue;
      if(!Array.isArray(rows))throw Error('Existing deal component options could not be read safely.');
      groups.push({id:group.id,name_en:group.name_en,name_ur:group.name_ur??null,min_units:Number(group.min_units),max_units:Number(group.max_units),
        allow_repeat_option:group.allow_repeat_option===true,max_units_per_option:group.max_units_per_option??null,
        sort_order:Number(group.sort_order)||0,is_active:false,
        options:rows.map(option=>({id:option.id,product_variant_id:option.product_variant_id,sort_order:Number(option.sort_order)||0,is_active:false}))});
    }
    return {groups};
  }
  function optionQuantityCap(group){return group.allow_repeat_option===true?Number(group.max_units_per_option??group.max_units??group.min_units??1):1;}
  function buildIncludedMappings(detail){
    if(!isObj(detail)||!Array.isArray(detail.component_groups)||!Array.isArray(detail.variants)||detail.variants.length!==1)throw Error('Saved deal structure could not be verified.');
    const variantDoc=detail.variants[0],variant=variantDoc&&variantDoc.variant;
    if(!variant||!variant.id||variant.pricing_mode!=='FIXED_BUNDLE')throw Error('Deal must have one fixed-price variant.');
    const prior=Array.isArray(variantDoc.allowed_options)?variantDoc.allowed_options:[],options=[];let activeCount=0;
    detail.component_groups.forEach(doc=>{
      const group=doc&&doc.group,rows=doc&&doc.options;
      if(!group||!Array.isArray(rows))throw Error('A saved deal component could not be read.');
      const active=rows.filter(row=>row&&row.is_active===true);
      if(group.is_active===true){
        const q=Number(group.min_units),max=Number(group.max_units);
        if(!Number.isSafeInteger(q)||q<1||max!==q||!active.length)throw Error('Each active component group must have a fixed quantity and at least one linked choice.');
        if(active.length>1&&!/burger/i.test(String(group.name_en||'')))throw Error('Only Burger groups may contain multiple included choices.');
        if(group.allow_repeat_option!==true&&q>active.length)throw Error('A non-repeat group needs enough distinct choices to satisfy its quantity.');
        const cap=optionQuantityCap(group);if(!Number.isSafeInteger(cap)||cap<1||cap>q)throw Error('A component group has an invalid per-choice quantity limit.');
        if(/burger/i.test(String(group.name_en||''))&&group.allow_repeat_option===true&&cap!==q)throw Error('Burger choices must allow each selected burger up to the required group quantity ('+q+').');
        activeCount+=active.length;
      }
      for(const row of rows){
        if(!row||!row.id)throw Error('A saved deal component option has no identity.');
        const previous=prior.find(item=>item.component_option_id===row.id);
        if(group.is_active!==true&&row.is_active!==true&&!previous)continue;
        options.push({...(previous&&previous.id?{id:previous.id}:{}),component_option_id:row.id,pricing_treatment:'INCLUDED',unit_surcharge:0,
          max_quantity_per_deal:group.is_active===true?optionQuantityCap(group):(previous&&previous.max_quantity_per_deal!=null?Number(previous.max_quantity_per_deal):optionQuantityCap(group)),
          sort_order:options.length+1,is_active:group.is_active===true&&row.is_active===true});
      }
    });
    if(!activeCount)throw Error('Deal has no active included components.');
    if(options.filter(item=>item.is_active).length!==activeCount)throw Error('Every active component choice must have exactly one INCLUDED mapping.');
    return {deal_variant_id:variant.id,options};
  }
  function buildFixedDealEditDraft(detail,schedules=[],scheduleDetail=null,expectedDealId=null,expectedTitle=null){
    if(!isObj(detail)||!isObj(detail.deal)||!Array.isArray(detail.component_groups)||!Array.isArray(detail.variants)||detail.variants.length!==1)throw Error('The saved deal is not a supported single-variant fixed bundle.');
    if(expectedDealId)assertDealIdentity(detail,expectedDealId,expectedTitle);
    const variantDoc=detail.variants[0],variant=variantDoc&&variantDoc.variant,deal=detail.deal;
    if(!variant||!variant.id||variant.pricing_mode!=='FIXED_BUNDLE'||deal.is_active!==variant.is_active||!moneyMatches(variant.base_price,variant.base_price))throw Error('Only consistent fixed-price deal records can be edited here.');
    const groups=detail.component_groups.filter(doc=>doc&&doc.group&&doc.group.is_active===true);
    const mappings=Array.isArray(variantDoc.allowed_options)?variantDoc.allowed_options.filter(item=>item.is_active===true):[];
    const activeCount=groups.reduce((n,doc)=>n+(doc.options||[]).filter(option=>option&&option.is_active===true).length,0);
    if(!groups.length||activeCount!==mappings.length)throw Error('The active deal contents or choice mappings are incomplete; inspect before editing.');
    const components=groups.map(doc=>{
      const group=doc.group,active=(doc.options||[]).filter(row=>row&&row.is_active===true),q=Number(group.min_units);
      if(!Number.isSafeInteger(q)||q<1||Number(group.max_units)!==q||!active.length)throw Error('This deal uses a variable component quantity that is not enabled in the fixed-price editor.');
      if(active.length>1&&!/burger/i.test(String(group.name_en||'')))throw Error('Only Burger groups may contain multiple included choices in this editor.');
      if(group.allow_repeat_option!==true&&q>active.length)throw Error('A non-repeat component group does not have enough distinct choices to satisfy its quantity.');
      const cap=optionQuantityCap(group);if(!Number.isSafeInteger(cap)||cap<1||cap>q)throw Error('A component group has an invalid per-choice quantity limit.');
      const options=active.map(option=>{
        const mapping=mappings.find(item=>item.component_option_id===option.id);
        if(!mapping||mapping.pricing_treatment!=='INCLUDED'||Number(mapping.unit_surcharge)!==0||Number(mapping.max_quantity_per_deal)!==cap||mapping.product_variant_id!==option.product_variant_id)throw Error('This deal has a non-INCLUDED or inconsistent choice mapping and cannot be edited safely.');
        return {option_id:option.id,product_id:option.product_id,product_variant_id:option.product_variant_id};
      });
      const repeat=group.allow_repeat_option===true,isBurger=/burger/i.test(String(group.name_en||''));
      return {group_id:group.id,display_name:group.name_en,quantity:q,allow_repeat_option:repeat,
        max_units_per_option:repeat&&isBurger?q:(group.max_units_per_option??null),options};
    });
    const activeAssignments=(detail.schedule_assignments||[]).filter(item=>item.is_active===true);
    if(activeAssignments.length>1||activeAssignments.some(item=>item.branch_id!==null))throw Error('This deal has multiple or branch-specific schedules. The current editor will not overwrite them.');
    const assignment=activeAssignments[0]||null;
    if(assignment){
      const schedule=schedules.find(item=>item.id===assignment.schedule_set_id);
      if(!schedule||schedule.name!=='Flame Hour daily'||schedule.timezone!=='Asia/Karachi')throw Error('This deal uses a schedule other than the supported Flame Hour daily schedule.');
      if(!isObj(scheduleDetail)||!isObj(scheduleDetail.schedule_set)||scheduleDetail.schedule_set.id!==schedule.id||!Array.isArray(scheduleDetail.windows)||scheduleDetail.windows.length!==7||
         !scheduleDetail.windows.every((w,index)=>w.window_kind==='WEEKLY'&&Number(w.weekday_iso)===index+1&&w.local_start==='15:00:00'&&w.local_end==='17:00:00'&&!w.is_all_day))throw Error('The Flame Hour schedule does not match the approved daily 3 PM–5 PM definition.');
    }
    return {dealDraft:{id:deal.id,collection_id:deal.collection_id,title:deal.title,description_en:deal.description_en||'',base_price:String(variant.base_price),is_active:deal.is_active===true,is_available:deal.is_available!==false,flame_hour:!!assignment,scheduleId:assignment?assignment.schedule_set_id:null},components};
  }
  function isApprovedFlameHourSchedule(item,detail){
    if(!isObj(item)||item.name!=='Flame Hour daily'||item.is_active!==true||item.timezone!=='Asia/Karachi'||
       !isObj(detail)||!isObj(detail.schedule_set)||detail.schedule_set.id!==item.id||
       detail.schedule_set.name!=='Flame Hour daily'||detail.schedule_set.timezone!=='Asia/Karachi'||
       !Array.isArray(detail.windows)||detail.windows.length!==7)return false;
    return detail.windows.every((window,index)=>window&&window.window_kind==='WEEKLY'&&
      Number(window.weekday_iso)===index+1&&window.local_start==='15:00:00'&&
      window.local_end==='17:00:00'&&window.is_all_day===false);
  }
  function moneyMatches(actual, expected) {
    const a = Number(actual), b = Number(expected);
    return Number.isFinite(a) && Number.isFinite(b) && Math.round(a * 100) === Math.round(b * 100);
  }
  function verifyFixedDealDetail(detail, expected) {
    if(!isObj(detail)||!isObj(detail.deal)||!Array.isArray(detail.component_groups)||!Array.isArray(detail.variants)||detail.variants.length!==1)throw Error('The saved deal did not return a complete, single-variant detail record.');
    const deal=detail.deal,variantDoc=detail.variants[0],variant=variantDoc&&variantDoc.variant,expectedActive=expected&&expected.active===true;
    if(expected.dealId&&deal.id!==expected.dealId)throw Error('The saved deal ID did not match the selected editor deal.');
    if(expected.title&&deal.title!==expected.title)throw Error('The saved deal title did not match the editor.');
    if(!variant||variant.pricing_mode!=='FIXED_BUNDLE'||deal.is_active!==expectedActive||variant.is_active!==expectedActive||!moneyMatches(variant.base_price,expected.basePrice)||(typeof expected.isAvailable==='boolean'&&deal.is_available!==expected.isAvailable))
      throw Error('The deal activation state, availability or fixed base price did not match the saved draft.');
    const wanted=(expected.components||[]).map(item=>item.options?item:{...item,options:[{product_variant_id:item.product_variant_id}]});
    const activeGroups=detail.component_groups.filter(doc=>doc&&doc.group&&doc.group.is_active===true);
    if(activeGroups.length!==wanted.length)throw Error('The saved deal component group count did not match the fixed deal draft.');
    const expectedById=new Map();let expectedCount=0;
    activeGroups.forEach((doc,index)=>{
      const group=doc.group,rows=doc.options,wantedGroup=wanted[index],activeRows=Array.isArray(rows)?rows.filter(row=>row&&row.is_active===true):[];
      const expectedRepeat=typeof (wantedGroup&&wantedGroup.allow_repeat_option)==='boolean'?wantedGroup.allow_repeat_option:undefined;
      const expectedLimit=wantedGroup&&wantedGroup.max_units_per_option!==undefined?wantedGroup.max_units_per_option:undefined;
      const actualLimit=group.max_units_per_option==null?null:Number(group.max_units_per_option);
      const repeatMismatch=expectedRepeat!==undefined&&(group.allow_repeat_option===true)!==expectedRepeat;
      const limitMismatch=expectedLimit!==undefined&&actualLimit!==(expectedLimit==null?null:Number(expectedLimit));
      if(!wantedGroup||group.name_en!==wantedGroup.display_name||Number(group.min_units)!==Number(wantedGroup.quantity)||Number(group.max_units)!==Number(wantedGroup.quantity)||!Array.isArray(rows)||activeRows.length!==wantedGroup.options.length||repeatMismatch||limitMismatch)
        throw Error('A fixed deal component group failed read-back verification: '+(wantedGroup&&wantedGroup.display_name||index+1));
      const expectedCap=expectedRepeat===undefined?optionQuantityCap(group):(expectedRepeat?Number(expectedLimit):1);
      if(!Number.isSafeInteger(expectedCap)||expectedCap<1||expectedCap>Number(wantedGroup.quantity))throw Error('The expected per-choice quantity limit is invalid for '+wantedGroup.display_name+'.');
      const seen=new Set();
      wantedGroup.options.forEach(expectedOption=>{
        const row=activeRows.find(option=>option.product_variant_id===expectedOption.product_variant_id);
        if(!row||seen.has(row.product_variant_id))throw Error('A burger choice failed read-back verification: '+(wantedGroup.display_name||index+1));
        if(expectedOption.product_id&&row.product_id!==expectedOption.product_id)throw Error('A burger choice product identity failed read-back verification: '+(wantedGroup.display_name||index+1));
        seen.add(row.product_variant_id);expectedById.set(row.id,{row,cap:expectedCap});expectedCount++;
      });
    });
    const mappings=Array.isArray(variantDoc.allowed_options)?variantDoc.allowed_options.filter(item=>item.is_active===true):[];
    if(mappings.length!==expectedCount)throw Error('The saved deal did not return the complete active INCLUDED mapping set.');
    for(const mapping of mappings){
      const linked=expectedById.get(mapping.component_option_id);
      if(!linked||mapping.product_variant_id!==linked.row.product_variant_id||mapping.pricing_treatment!=='INCLUDED'||Number(mapping.unit_surcharge)!==0||Number(mapping.max_quantity_per_deal)!==linked.cap)
        throw Error('A saved deal component choice mapping is not active, included and within its repeat limit.');
    }
    const assignments=(detail.schedule_assignments||[]).filter(item=>item.is_active===true&&item.branch_id===null);
    if(expected.flameHour===true){if(!assignments.some(item=>item.schedule_set_id===expected.scheduleId))throw Error('The Flame Hour daily schedule assignment could not be verified.');}
    else if(assignments.length)throw Error('An unexpected active global schedule assignment remains on this deal.');
    return true;
  }
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash=v=>v==null?'No standalone price':'Rs. '+Number(v).toLocaleString('en-PK',{maximumFractionDigits:2});
  function assertDealIdentity(detail,expectedDealId,expectedTitle){
    const deal=detail&&detail.deal;
    if(!deal||!deal.id||!expectedDealId||deal.id!==expectedDealId)throw Error('The deal detail response did not match the selected deal ID.');
    if(expectedTitle&&deal.title!==expectedTitle)throw Error('The selected deal title did not match the deal card.');
    return true;
  }
  function eligibleChoiceProducts(products,categories,groupName){
    const rows=Array.isArray(products)?products:[],categoryRows=Array.isArray(categories)?categories:[];
    const isBurger=/burger/i.test(String(groupName||''));
    const chickenBurgerIds=new Set(categoryRows.filter(category=>category&&category.category_kind==='menu'&&category.is_active!==false&&category.name_en==='Chicken Burgers').map(category=>category.id));
    return rows.filter(product=>product&&product.is_active!==false&&Array.isArray(product.variants)&&
      product.variants.some(variant=>variant&&variant.is_active!==false)&&
      (!isBurger||(chickenBurgerIds.has(product.category_id)&&String(product.name_en||'').trim().toLowerCase()!=='burger')));
  }
  function checkbox(name,label,checked){return '<label class="fcv3-check"><input type="checkbox" name="'+name+'" data-field="'+name+'"'+(checked?' checked':'')+'> '+label+'</label>';}
  function createWorkspace(){
    let el=null,request=null;
    const s={loading:false,saving:false,error:null,notice:null,revision:null,categories:[],products:[],collections:[],deals:[],schedules:[],editor:null,editorLoadingDealId:null,components:[],detail:null,partial:null,importProgress:null,pages:{categories:{hasMore:false,cursor:null},products:{hasMore:false,cursor:null},collections:{hasMore:false,cursor:null},deals:{}}};
    async function read(action,args){const r=await request(action,args||{},false);if(!isObj(r)||r.ok===false)throw Error('Catalog read failed.');if(Number.isSafeInteger(r.draft_revision))s.revision=r.draft_revision;return r;}
    async function readPage(action,args){
      const r=await request(action,args||{},false);
      if(!isObj(r)||r.ok===false||!Array.isArray(r.items))throw Error('Catalog page response is invalid.');
      if(!Number.isSafeInteger(r.draft_revision)||r.draft_revision<0)throw Error('Catalog page has no valid draft revision.');
      if(r.has_more===true&&(!r.next_cursor||typeof r.next_cursor!=='string'))throw Error('Catalog page cursor is invalid.');
      return r;
    }
    async function write(action,payload){const r=await request(action,payload,true);if(!isObj(r)||r.ok===false)throw Error('Catalog save failed.');if(Number.isSafeInteger(r.draft_revision))s.revision=r.draft_revision;return r;}
    async function refresh(){
      if(!el)return;s.loading=true;s.error=null;render();
      try{
        const [cats,prods,cols,schedules]=await Promise.all([
          readPage(READ.categories,{limit:100}),readPage(READ.products,{limit:50}),readPage(READ.collections,{limit:50}),readPage(READ.schedules,{limit:50})
        ]);
        const baseRevision=cats.draft_revision;
        if([prods,cols,schedules].some(x=>x.draft_revision!==baseRevision))throw Error('The draft changed while the catalog was loading. Refresh to load one consistent revision.');
        const collections=cols.items;
        const lists=await Promise.all(collections.map(c=>readPage(READ.deals,{collection_id:c.id,limit:50})));
        if(lists.some(x=>x.draft_revision!==baseRevision))throw Error('The draft changed while deal lists were loading. Refresh to load one consistent revision.');
        s.categories=cats.items;s.products=prods.items;s.collections=collections;s.schedules=schedules.items;
        s.pages={categories:{hasMore:cats.has_more===true,cursor:cats.next_cursor||null},
          products:{hasMore:prods.has_more===true,cursor:prods.next_cursor||null},
          collections:{hasMore:cols.has_more===true,cursor:cols.next_cursor||null},deals:{}};
        s.deals=lists.flatMap(x=>x.items);
        lists.forEach((x,index)=>{s.pages.deals[collections[index].id]={hasMore:x.has_more===true,cursor:x.next_cursor||null};});
        s.revision=baseRevision;
      }catch(e){s.error=e.message||'Unable to load catalog draft.';}
      finally{s.loading=false;render();}
    }
    async function loadMore(kind,collectionId){
      const page=kind==='deals'?s.pages.deals[collectionId]:s.pages[kind];
      if(!page||page.hasMore!==true||!page.cursor)throw Error('No next page is available for this catalog list.');
      const revision=s.revision;
      const action=kind==='categories'?READ.categories:kind==='products'?READ.products:kind==='collections'?READ.collections:READ.deals;
      const args={after_id:page.cursor,limit:kind==='categories'?100:50};
      if(kind==='deals')args.collection_id=collectionId;
      const result=await readPage(action,args);
      if(result.draft_revision!==revision){
        await refresh();
        throw Error('The draft changed while loading another page. Catalog lists were refreshed; review them before editing.');
      }
      const added=kind==='collections'?result.items.filter(c=>c&&c.id):[];
      const lists=kind==='collections'?await Promise.all(added.map(c=>readPage(READ.deals,{collection_id:c.id,limit:50}))):[];
      if(lists.some(x=>x.draft_revision!==revision)){
        await refresh();
        throw Error('The draft changed while loading newly discovered deal collections. Catalog lists were refreshed.');
      }
      const target=kind==='categories'?s.categories:kind==='products'?s.products:kind==='collections'?s.collections:s.deals;
      const seen=new Set(target.map(item=>item.id));
      for(const item of result.items)if(item&&item.id&&!seen.has(item.id)){target.push(item);seen.add(item.id);}
      page.hasMore=result.has_more===true;page.cursor=result.next_cursor||null;
      if(kind==='collections'){
        const knownDeals=new Set(s.deals.map(d=>d.id));
        lists.forEach((list,index)=>{
          for(const deal of list.items)if(deal&&deal.id&&!knownDeals.has(deal.id)){s.deals.push(deal);knownDeals.add(deal.id);}
          s.pages.deals[added[index].id]={hasMore:list.has_more===true,cursor:list.next_cursor||null};
        });
      }
      render();
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
    function categoryForm(category){
      const editing=!!(category&&category.id);
      return '<form class="fcv3-editor" data-form="category">'+(editing?'<input type="hidden" name="id" value="'+esc(category.id)+'">':'')+'<div class="fcv3-form-grid">'+
        (editing?'<input type="hidden" name="category_kind" value="'+esc(category.category_kind)+'"><label>Kind<input value="'+(category.category_kind==='deal'?'Deals':'Menu')+'" disabled></label>':
          '<label>Kind<select name="category_kind"><option value="menu">Menu</option><option value="deal">Deals</option></select></label>')+
        '<label>English name<input name="name_en" maxlength="120" required value="'+esc(category&&category.name_en)+'"></label><label>Urdu name<input name="name_ur" maxlength="120" value="'+esc(category&&category.name_ur)+'"></label>'+
        '<label>Sort order<input name="sort_order" type="number" min="0" step="1" value="'+esc(category?category.sort_order:0)+'"></label>'+
        (editing?'<label class="fcv3-check"><input type="checkbox" name="is_active"'+(category.is_active?' checked':'')+'> Active</label>':'')+'</div>'+
        '<div class="fcv3-editor-actions"><button type="button" class="fcv3-button fcv3-muted" data-action="editor-cancel">Cancel</button><button type="submit" class="fcv3-button fcv3-primary">'+(editing?'Save category changes':'Save category')+'</button></div></form>';
    }
    function burgerCategoryAnchor(){
      const matches=s.categories.filter(category=>category&&category.category_kind==='menu'&&category.is_active!==false&&category.name_en==='Chicken Burgers');
      if(matches.length!==1)return null;
      const category=matches[0];
      const products=s.products.filter(product=>product&&product.category_id===category.id&&product.is_active!==false&&String(product.name_en||'').trim().toLowerCase()==='burger');
      if(products.length!==1)return null;
      const product=products[0];
      const variants=(product.variants||[]).filter(variant=>variant&&variant.is_active!==false&&variant.is_standalone_sellable===false&&String(variant.size_label||'').trim().toLowerCase()==='included');
      if(variants.length!==1)return null;
      return {category,product,variant:variants[0]};
    }
    function componentChoiceForm(option,group){
      const products=eligibleChoiceProducts(s.products,s.categories,group.display_name);
      const used=new Set((group.options||[]).filter(x=>x!==option&&x.product_variant_id).map(x=>x.product_variant_id));
      let product=products.find(p=>p.id===option.product_id)||null,variants=product?product.variants.filter(v=>v.is_active!==false):[];
      let variant=variants.find(v=>v.id===option.product_variant_id)||variants.find(v=>!used.has(v.id))||variants[0]||null;
      const savedProduct=s.products.find(item=>item&&item.id===option.product_id)||null;
      const invalidSavedProduct=/burger/i.test(String(group.display_name||''))&&!!option.product_id&&!product;
      const savedPlaceholder=invalidSavedProduct&&savedProduct&&String(savedProduct.name_en||'').trim().toLowerCase()==='burger';
      const placeholderText=savedPlaceholder
        ? 'Saved product “Burger” is a placeholder — choose a real burger'
        : (invalidSavedProduct?'Saved product is not an eligible Chicken Burger — choose a real burger':'Choose a burger product');
      const placeholder='<option value=""'+(!product?' selected':'')+' disabled>'+esc(placeholderText)+'</option>';
      const variantOptions=(variants.length
        ?'<option value=""'+(!variant?' selected':'')+' disabled>Choose a variant</option>'+variants.map(v=>'<option value="'+esc(v.id)+'"'+(variant&&v.id===variant.id?' selected':'')+'>'+esc(v.size_label)+(v.is_standalone_sellable===false?' · Deal-only':'')+'</option>').join('')
        :'<option value="" selected disabled>Choose a product first</option>');
      return '<article class="fcv3-choice-row" data-choice-row>'+(option.option_id?'<input type="hidden" data-field="option_id" value="'+esc(option.option_id)+'">':'')+
        '<label>Choice product<select data-field="product_id" data-choice-product required>'+placeholder+products.map(p=>'<option value="'+esc(p.id)+'"'+(product&&p.id===product.id?' selected':'')+'>'+esc(p.name_en)+'</option>').join('')+'</select></label>'+
        '<label>Product variant<select data-field="product_variant_id" data-choice-variant required>'+variantOptions+'</select></label>'+
        '<small class="fcv3-choice-help">Choose a real Chicken Burger from the product list, then select its variant. Use “+ Add choice” to include another burger alternative in this deal.</small>'+
        '<button type="button" class="fcv3-button fcv3-danger" data-action="component-choice-remove">Remove choice</button></article>';
    }
    function componentForm(c,index){
      const group={...c,options:Array.isArray(c.options)?c.options:[]},repeat=group.allow_repeat_option===true;
      const burger=/burger/i.test(String(group.display_name||'')),anchor=burger?burgerCategoryAnchor():null;
      const anchorOptionId=group.options.find(option=>option&&option.option_id)?.option_id||'';
      const choiceEditor=burger
        ? '<div class="fcv3-choice-source"><strong>Customer burger choices</strong><span>'+(anchor?esc(anchor.category.name_en):'Chicken Burgers category unavailable')+'</span>'+
          '<small>Customers choose each required burger themselves from active products and variants in this category. The Burger / Included reference is not shown to customers.</small>'+
          '<input type="hidden" data-field="burger-anchor-option-id" value="'+esc(anchorOptionId)+'"></div>'
        : (group.options.length
          ? '<div class="fcv3-choice-list">'+group.options.map(option=>componentChoiceForm(option,group)).join('')+'</div>'
          : '<div class="fcv3-choice-empty">No component choice configured.</div><button type="button" class="fcv3-button" data-action="component-choice-add">+ Add component choice</button>');
      return '<article class="fcv3-component-row" data-component-group data-group-index="'+index+'">'+(group.group_id?'<input type="hidden" data-field="group_id" value="'+esc(group.group_id)+'">':'')+
        '<div class="fcv3-component-grid"><label>Component group<input data-field="display_name" maxlength="120" required value="'+esc(group.display_name)+'"></label>'+
        '<label>Required quantity<input data-field="quantity" type="number" min="1" max="100" step="1" required value="'+esc(group.quantity||1)+'"></label>'+
        '<label class="fcv3-check"><input type="checkbox" data-field="allow_repeat_option"'+(repeat?' checked':'')+'> Allow the same burger more than once</label>'+
        '<label>Maximum quantity per choice<input data-field="max_units_per_option" type="number" min="1" max="'+esc(group.quantity||1)+'" step="1" value="'+(repeat?esc(group.max_units_per_option??group.quantity??1):'')+'" '+(repeat?'required':'disabled')+'></label></div>'+
        (repeat&&burger?'<small>For '+esc(group.quantity)+' burgers, set this to '+esc(group.quantity)+' so the same burger may fill every required slot.</small>':'')+
        choiceEditor+
        '<button type="button" class="fcv3-button fcv3-danger" data-action="component-remove">Remove component group</button></article>';
    }
    function readComponentGroups(form,options={}){
      const validate=options.validate!==false;
      const groups=Array.from(form.querySelectorAll('[data-component-group]')).map(group=>{
        const displayName=group.querySelector('[data-field="display_name"]').value;
        const burger=/burger/i.test(String(displayName||'')),anchor=burger?burgerCategoryAnchor():null;
        const anchorOptionId=group.querySelector('[data-field="burger-anchor-option-id"]')?.value||null;
        const choiceRows=Array.from(group.querySelectorAll('[data-choice-row]')).map(row=>({
          option_id:row.querySelector('[data-field="option_id"]')?.value||null,
          product_id:row.querySelector('[data-field="product_id"]').value,
          product_variant_id:row.querySelector('[data-field="product_variant_id"]').value
        }));
        return {
          group_id:group.querySelector('[data-field="group_id"]')?.value||null,
          display_name:displayName,
          quantity:Number(group.querySelector('[data-field="quantity"]').value),
          allow_repeat_option:group.querySelector('[data-field="allow_repeat_option"]').checked,
          max_units_per_option:group.querySelector('[data-field="allow_repeat_option"]').checked?Number(group.querySelector('[data-field="max_units_per_option"]').value):null,
          options:burger?(anchor?[{option_id:anchorOptionId,product_id:anchor.product.id,product_variant_id:anchor.variant.id}]:[]):choiceRows
        };
      });
      if(!validate)return groups;
      groups.forEach(group=>{
        if(!Number.isSafeInteger(group.quantity)||group.quantity<1)throw Error(group.display_name+' needs a valid required quantity.');
        if(group.allow_repeat_option){
          if(!Number.isSafeInteger(group.max_units_per_option)||group.max_units_per_option<1||group.max_units_per_option>group.quantity)
            throw Error(group.display_name+' needs a valid maximum quantity per choice.');
          if(/burger/i.test(group.display_name)&&group.max_units_per_option!==group.quantity)
            throw Error('Burger groups must set Maximum quantity per choice equal to the required burger quantity ('+group.quantity+').');
        }
        if(/burger/i.test(group.display_name)){
          const anchor=burgerCategoryAnchor(),option=group.options[0];
          if(!anchor||group.options.length!==1||option.product_id!==anchor.product.id||option.product_variant_id!==anchor.variant.id)
            throw Error('Burger group must use the Chicken Burgers category source. Customer choices are loaded automatically from that category.');
        }
      });
      return groups;
    }
    function dealForm(){
      const editing=!!(s.dealDraft&&s.dealDraft.id),dealId=editing?s.dealDraft.id:'';
      return '<form class="fcv3-editor" data-form="deal" data-deal-id="'+esc(dealId)+'">'+
        (editing?'<input type="hidden" name="deal_id" value="'+esc(dealId)+'"><div class="fcv3-warning"><strong>Editing: '+esc(s.dealDraft.title)+'</strong><small>Confirm this exact deal before saving. Deal ID: '+esc(dealId)+'</small></div>':'')+
        '<div class="fcv3-warning">Fixed-price bundle. Burger groups can contain multiple included choices; customers choose each burger in a compact dropdown. Every choice is INCLUDED with zero surcharge. The deal price stays fixed.</div>'+
        '<div class="fcv3-form-grid"><label>Deal title<input name="title" maxlength="160" required value="'+esc(s.dealDraft&&s.dealDraft.title)+'"></label>'+
        '<label>Deal price (PKR)<input name="base_price" type="number" min="0" step="0.01" required value="'+esc(s.dealDraft&&s.dealDraft.base_price)+'"></label>'+
        '<label class="fcv3-wide">Description<textarea name="description_en" maxlength="3000" rows="2">'+esc(s.dealDraft&&s.dealDraft.description_en)+'</textarea></label>'+
        '<label class="fcv3-check"><input type="checkbox" name="flame_hour"'+(s.dealDraft&&s.dealDraft.flame_hour?' checked':'')+'> Flame Hour daily 3–5 PM (Asia/Karachi)</label>'+
        (editing?'<label class="fcv3-check"><input type="checkbox" name="deal_available"'+(s.dealDraft.is_available?' checked':'')+'> Available to order</label><p class="fcv3-wide">Active status is preserved automatically. The deal is temporarily disabled while its contents are being verified.</p>':'')+'</div>'+
        '<div class="fcv3-subhead"><div><h4>Component groups</h4><p>Set each group quantity. Only Burger groups may contain multiple included choices.</p></div><button type="button" class="fcv3-button" data-action="component-add">+ Add component group</button></div>'+
        '<div class="fcv3-components">'+s.components.map(componentForm).join('')+'</div>'+
        '<div class="fcv3-editor-actions"><button type="button" class="fcv3-button fcv3-muted" data-action="editor-cancel">Cancel</button><button type="submit" class="fcv3-button fcv3-primary">'+(editing?'Save '+esc(s.dealDraft.title)+' changes':'Create fixed deal')+'</button></div></form>';
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
        const deals=s.deals.filter(d=>d.collection_id===c.id),page=s.pages.deals[c.id];
        return '<section class="fcv3-collection"><h4>'+esc(c.name_en)+'</h4><div class="fcv3-deals">'+
          (deals.length?deals.map(d=>'<article class="fcv3-deal-card"><div><strong>'+esc(d.title)+'</strong><small>'+(d.active_variant_count||0)+' active variant(s) · '+(d.is_active?'Active':'Draft / hidden')+'</small></div>'+
          '<div class="fcv3-card-actions"><button class="fcv3-button" data-action="deal-detail" data-id="'+esc(d.id)+'">Inspect</button><button class="fcv3-button" data-action="deal-edit" data-id="'+esc(d.id)+'" data-title="'+esc(d.title)+'" aria-label="Edit '+esc(d.title)+'"'+(s.editorLoadingDealId?' disabled':'')+'>Edit</button></div></article>').join(''):'<p class="fcv3-empty">No deals in this collection.</p>')+
          (page&&page.hasMore&&page.cursor?'<button class="fcv3-button" data-action="load-more" data-kind="deals" data-collection-id="'+esc(c.id)+'">Load 50 more deals</button>':'')+'</div></section>';
      }).join('');
      el.innerHTML='<div class="fcv3-head"><div><span class="fcv3-kicker">AUTHENTICATED COMMAND API</span><h2>Catalog V3 workspace</h2><p>Draft authoring through secured Admin/Owner commands; no direct PostgREST table writes.</p></div>'+
        '<div class="fcv3-head-actions"><span class="fcv3-revision">'+(s.revision==null?'Revision not loaded':'Draft revision '+s.revision)+'</span>'+
        '<button class="fcv3-button" data-action="refresh"'+(s.loading||s.saving?' disabled':'')+'>Refresh</button>'+
        '<button class="fcv3-button fcv3-primary" data-action="import-menu"'+(s.loading||s.saving?' disabled':'')+'>Import published menu draft</button></div></div>'+
        (s.importProgress?'<div class="fcv3-notice" role="status"><strong>'+esc(s.importProgress.phase)+'</strong> · '+esc(s.importProgress.completed)+' / '+esc(s.importProgress.total)+' · '+esc(s.importProgress.message)+'</div>':'')+
        (s.editorLoadingDealId?'<div class="fcv3-notice" role="status">Loading the selected deal by its exact ID…</div>':'')+
        (s.error?'<div class="fcv3-error" role="alert">'+esc(s.error)+'</div>':'')+(s.notice?'<div class="fcv3-notice" role="status">'+esc(s.notice)+'</div>':'')+
        (s.partial?'<div class="fcv3-warning">A deal operation stopped and the deal may remain inactive. ID: '+esc(s.partial.id)+'. Do not create a duplicate; inspect this draft before continuing.</div>':'')+
        '<div class="fcv3-summary-grid"><article><small>Menu categories</small><strong>'+s.categories.filter(c=>c.category_kind==='menu').length+'</strong></article><article><small>Products</small><strong>'+s.products.length+'</strong></article>'+
        '<article><small>Deal-only variants</small><strong>'+s.products.reduce((n,p)=>n+p.variants.filter(v=>v.is_standalone_sellable===false).length,0)+'</strong></article><article><small>Fixed deals</small><strong>'+s.deals.length+'</strong></article></div>'+
        '<div class="fcv3-toolbar"><div><h3>Products and variants</h3><p>Standalone variants require prices. Deal-only variants may be unpriced and stay out of standalone menu cards.</p></div><button class="fcv3-button fcv3-primary" data-action="product-add">+ Add product</button></div>'+
        '<div class="fcv3-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Standalone prices</th><th>Status</th><th></th></tr></thead><tbody>'+(productRows||'<tr><td colspan="5">No products in draft.</td></tr>')+'</tbody></table></div>'+
        (s.pages.products.hasMore&&s.pages.products.cursor?'<button class="fcv3-button" data-action="load-more" data-kind="products">Load 50 more products</button>':'')+
        '<div class="fcv3-toolbar"><div><h3>Categories</h3><p>Menu and deal categories are distinct.</p></div><button class="fcv3-button" data-action="category-add">+ Add category</button></div>'+
        '<div class="fcv3-category-grid">'+s.categories.map(c=>'<article><strong>'+esc(c.name_en)+'</strong><small>'+esc(c.category_kind)+' · '+(c.is_active?'Active':'Inactive')+'</small><button class="fcv3-button" data-action="category-edit" data-id="'+esc(c.id)+'">Edit</button></article>').join('')+'</div>'+
        (s.pages.categories.hasMore&&s.pages.categories.cursor?'<button class="fcv3-button" data-action="load-more" data-kind="categories">Load 100 more categories</button>':'')+
        '<div class="fcv3-toolbar"><div><h3>Deals and offers</h3><p>Fixed prices with INCLUDED component choices. Burger groups support per-burger dropdown selections.</p></div><button class="fcv3-button fcv3-primary" data-action="deal-add">+ Create fixed deal</button></div>'+
        (collectionHtml||'<p class="fcv3-empty">No deal collection yet. The first deal creates the Deals category and collection.</p>')+
        (s.pages.collections.hasMore&&s.pages.collections.cursor?'<button class="fcv3-button" data-action="load-more" data-kind="collections">Load 50 more deal collections</button>':'')+
        (s.editor?'<div class="fcv3-editor-shell"><div class="fcv3-editor-head"><div><span class="fcv3-kicker">DRAFT EDITOR</span><h3>'+
          (s.editor.type==='product'?(s.editor.product?'Edit product':'Add product'):s.editor.type==='category'?(s.editor.category?'Edit category':'Add category'):(s.dealDraft&&s.dealDraft.id?'Edit fixed deal · '+esc(s.dealDraft.title):'Create fixed deal'))+'</h3></div><button class="fcv3-button fcv3-muted" data-action="editor-cancel">Close</button></div>'+
          (s.editor.type==='product'?productForm(s.editor.product):s.editor.type==='category'?categoryForm(s.editor.category):dealForm())+'</div>':'')+
        (s.detail?'<div class="fcv3-detail"><h3>Deal inspection</h3><strong>'+esc(s.detail.deal.title)+'</strong><small>'+esc(s.detail.deal.id)+'</small>'+
          '<div>'+s.detail.component_groups.filter(g=>g.group&&g.group.is_active).map(g=>'<p>'+esc(g.group.name_en)+' × '+g.group.min_units+' — '+(g.options[0]?esc(g.options[0].product_name_en)+' / '+esc(g.options[0].variant_label):'No option')+'</p>').join('')+'</div>'+
          '<button class="fcv3-button" data-action="deal-edit" data-id="'+esc(s.detail.deal.id)+'">Edit fixed deal</button> <button class="fcv3-button" data-action="detail-close">Close inspection</button></div>':'');
    }
    function openProduct(p){s.editor={type:'product',product:p?JSON.parse(JSON.stringify(p)):null};s.notice=null;s.error=null;render();}
    function openDeal(){
      if(!s.products.some(p=>p.is_active!==false&&p.variants.some(v=>v.is_active!==false))){s.error='Add active products and variants before creating a deal.';render();return;}
      s.editor={type:'deal'};s.editorRevision=s.revision;s.components=[{display_name:'Burger',quantity:1,allow_repeat_option:false,max_units_per_option:null,options:[{}]}];s.dealDraft={title:'',description_en:'',base_price:'',flame_hour:false,is_available:true};s.notice=null;s.error=null;s.partial=null;render();
    }
    async function openDealEdit(dealId,expectedTitle){
      if(s.editorLoadingDealId)return;
      const selectedId=String(dealId||'').trim(),card=s.deals.find(item=>item.id===selectedId);
      if(!selectedId||!card)throw Error('The selected deal card could not be matched to a loaded deal ID.');
      const title=String(expectedTitle||card.title||'');
      if(!title||title!==card.title)throw Error('The selected deal title does not match its deal card. Refresh and reopen it.');
      s.editorLoadingDealId=selectedId;s.editor=null;s.dealDraft=null;s.components=[];s.detail=null;s.notice=null;s.error=null;s.partial=null;render();
      try{
        const detail=await read(READ.dealDetail,{deal_id:selectedId});
        assertDealIdentity(detail,selectedId,title);
        const assignment=(detail.schedule_assignments||[]).find(item=>item.is_active===true&&item.branch_id===null);
        const scheduleDetail=assignment?await read(READ.scheduleDetail,{schedule_set_id:assignment.schedule_set_id}):null;
        const draft=buildFixedDealEditDraft(detail,s.schedules,scheduleDetail,selectedId,title);
        if(s.editorLoadingDealId!==selectedId)return;
        s.editor={type:'deal',deal:true};s.editorRevision=s.revision;s.components=draft.components;s.dealDraft=draft.dealDraft;
      }finally{
        if(s.editorLoadingDealId===selectedId)s.editorLoadingDealId=null;
        render();
      }
    }
    async function ensureDealCollection(){
      let categories=s.categories.filter(c=>c.category_kind==='deal');
      if(categories.length>1)throw Error('Multiple deal categories exist. Resolve the duplicate categories before creating a deal.');
      let cat=categories[0]||null;
      if(cat&&cat.name_en!=='Deals')throw Error('An existing deal category has a different name. Review it instead of creating a second Deals category.');
      if(!cat){
        const created=await write(WRITE.category,{category_kind:'deal',name_en:'Deals',name_ur:null,sort_order:90,is_active:true});
        await refresh();cat=s.categories.find(c=>c.id===created.entity_id);
      }else if(!cat.is_active){
        await write(WRITE.category,{id:cat.id,category_kind:'deal',name_en:cat.name_en,name_ur:cat.name_ur??null,sort_order:cat.sort_order,is_active:true});
        await refresh();cat=s.categories.find(c=>c.id===cat.id);
      }
      if(!cat||cat.is_active!==true)throw Error('Active Deals category could not be verified.');
      let collections=s.collections.filter(c=>c.category_id===cat.id);
      if(collections.length>1)throw Error('Multiple Deals collections exist for this category. Resolve the duplicates before creating a deal.');
      let col=collections[0]||null;
      if(col&&col.name_en!=='Deals')throw Error('An existing deal collection has a different name. Review it instead of creating another.');
      if(!col){
        const created=await write(WRITE.collection,{category_id:cat.id,name_en:'Deals',name_ur:null,sort_order:0,is_active:true,schedule_set_id:null});
        await refresh();col=s.collections.find(c=>c.id===created.entity_id);
      }else if(!col.is_active){
        await write(WRITE.collection,{id:col.id,category_id:cat.id,name_en:col.name_en,name_ur:col.name_ur??null,
          sort_order:col.sort_order,is_active:true,schedule_set_id:col.schedule_set_id??null});
        await refresh();col=s.collections.find(c=>c.id===col.id);
      }
      if(!col||col.is_active!==true)throw Error('Active Deals collection could not be verified.');
      return col;
    }
    async function ensureFlameHourSchedule(){
      const matches=s.schedules.filter(item=>item.name==='Flame Hour daily');
      if(matches.length>1)throw Error('Multiple Flame Hour daily schedules exist. Resolve the duplicates before attaching this deal.');
      if(matches.length===1){
        const item=matches[0];
        const detail=await read(READ.scheduleDetail,{schedule_set_id:item.id});
        if(!isApprovedFlameHourSchedule(item,detail))
          throw Error('An existing Flame Hour daily schedule has different settings. It will not be replaced or duplicated.');
        return item.id;
      }
      const windows=Array.from({length:7},(_,i)=>({window_kind:'WEEKLY',weekday_iso:i+1,local_start:'15:00:00',local_end:'17:00:00',is_all_day:false,starts_at:null,ends_at:null,effective_from:null,effective_to:null}));
      const created=await write(WRITE.schedule,{name:'Flame Hour daily',timezone:'Asia/Karachi',is_active:true,windows});
      await refresh();
      const found=s.schedules.find(x=>x.id===created.entity_id);
      if(!found||found.is_active!==true)throw Error('Flame Hour schedule saved but could not be verified.');
      const detail=await read(READ.scheduleDetail,{schedule_set_id:found.id});
      if(!isApprovedFlameHourSchedule(found,detail))throw Error('New Flame Hour schedule failed exact read-back verification.');
      return found.id;
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
        let scheduleId=null;
        if(form.flame_hour){scheduleId=await ensureFlameHourSchedule();await write(WRITE.assignment,{deal_id:dealId,branch_id:null,schedule_set_id:scheduleId,is_active:true});}
        const beforeActivation=await read(READ.dealDetail,{deal_id:dealId});
        verifyFixedDealDetail(beforeActivation,{dealId,title,basePrice:base,components:s.components,flameHour:form.flame_hour===true,scheduleId,active:false});
        await write(WRITE.deal,{id:dealId,title,description_en:desc,is_active:true,is_available:true,
          variants:[{id:dealVariantId,variant_key:'BUNDLE',label_en:title,label_ur:null,pricing_mode:'FIXED_BUNDLE',base_price:base,sort_order:1,is_active:true}]});
        const afterActivation=await read(READ.dealDetail,{deal_id:dealId});
        verifyFixedDealDetail(afterActivation,{dealId,title,basePrice:base,components:s.components,flameHour:form.flame_hour===true,scheduleId,active:true});
        s.partial=null;s.editor=null;s.notice='Fixed deal saved and read-back verified. Components are locked and use INCLUDED pricing.';await refresh();
      }catch(error){if(dealId)s.partial={id:dealId,variantId:dealVariantId};throw error;}
    }
    async function editDeal(form,submittedDealId){
      const dealId=s.dealDraft&&s.dealDraft.id;
      if(!dealId)throw Error('The deal ID is missing. Reopen the deal before saving.');
      if(submittedDealId!==dealId)throw Error('The submitted deal ID does not match the deal currently open in the editor. No changes were made.');
      const latest=await read(READ.dealDetail,{deal_id:dealId});
      assertDealIdentity(latest,dealId);
      if(Number.isSafeInteger(s.editorRevision)&&s.revision!==s.editorRevision)
        throw Error('This catalog changed while the deal editor was open. Reload the deal before saving; no edit was made.');
      const assignmentBefore=(latest.schedule_assignments||[]).find(item=>item.is_active===true&&item.branch_id===null);
      const scheduleDetailBefore=assignmentBefore?await read(READ.scheduleDetail,{schedule_set_id:assignmentBefore.schedule_set_id}):null;
      const currentDraft=buildFixedDealEditDraft(latest,s.schedules,scheduleDetailBefore,dealId);
      const groups=buildFixedComponentGroups(s.components,latest.component_groups);
      const base=amount(form.base_price,'Deal base price',true);
      const title=text(form.title,160,'Deal title',true);
      const desc=text(form.description_en,3000,'Description',false);
      const isAvailable=form.is_available===true;
      const wasActive=currentDraft.dealDraft.is_active===true;
      const variant=latest.variants[0].variant;
      let stage='deactivate';
      try{
        await write(WRITE.deal,{
          id:dealId,title,description_en:desc,is_active:false,is_available:isAvailable,
          variants:[{id:variant.id,variant_key:variant.variant_key,label_en:title,
            label_ur:variant.label_ur??null,pricing_mode:'FIXED_BUNDLE',base_price:base,
            sort_order:variant.sort_order,is_active:false}]
        });
        stage='components';
        await write(WRITE.components,{deal_id:dealId,groups:groups.groups});
        stage='mappings';
        const afterComponents=await read(READ.dealDetail,{deal_id:dealId});
        const mapped=buildIncludedMappings(afterComponents);
        await write(WRITE.mappings,{deal_id:dealId,deal_variant_id:variant.id,options:mapped.options});
        stage='schedule';
        const oldAssignment=(latest.schedule_assignments||[]).find(item=>item.is_active===true&&item.branch_id===null);
        if(form.flame_hour===true){
          if(!oldAssignment){
            const scheduleId=await ensureFlameHourSchedule();
            await write(WRITE.assignment,{deal_id:dealId,branch_id:null,schedule_set_id:scheduleId,is_active:true});
          }
        }else if(oldAssignment){
          await write(WRITE.assignment,{id:oldAssignment.id,deal_id:dealId,branch_id:null,
            schedule_set_id:oldAssignment.schedule_set_id,is_active:false});
        }
        stage='pre-activation verification';
        const beforeActivation=await read(READ.dealDetail,{deal_id:dealId});
        const activeSchedule=(beforeActivation.schedule_assignments||[]).find(item=>item.is_active===true&&item.branch_id===null);
        verifyFixedDealDetail(beforeActivation,{
          basePrice:base,components:s.components,flameHour:form.flame_hour===true,
          dealId,title,scheduleId:activeSchedule?activeSchedule.schedule_set_id:null,active:false,isAvailable
        });
        stage='restore activation state';
        await write(WRITE.deal,{
          id:dealId,title,description_en:desc,is_active:wasActive,is_available:isAvailable,
          variants:[{id:variant.id,variant_key:variant.variant_key,label_en:title,
            label_ur:variant.label_ur??null,pricing_mode:'FIXED_BUNDLE',base_price:base,
            sort_order:variant.sort_order,is_active:wasActive}]
        });
        const finalDetail=await read(READ.dealDetail,{deal_id:dealId});
        const finalSchedule=(finalDetail.schedule_assignments||[]).find(item=>item.is_active===true&&item.branch_id===null);
        verifyFixedDealDetail(finalDetail,{
          basePrice:base,components:s.components,flameHour:form.flame_hour===true,
          dealId,title,scheduleId:finalSchedule?finalSchedule.schedule_set_id:null,active:wasActive,isAvailable
        });
        s.partial=null;s.editor=null;s.editorRevision=null;
        s.notice='Fixed deal changes saved, read back and verified. Removed components are inactive; all active components remain INCLUDED with zero surcharge.';
        await refresh();
      }catch(error){
        s.partial={id:dealId,variantId:variant.id,editStage:stage};
        throw new Error((error&&error.message||'Deal edit failed.')+' The deal may remain inactive at stage "'+stage+'". Inspect this exact deal before retrying; do not create a replacement.');
      }
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
      if(type==='category'){
        await write(WRITE.category,{
          ...(fd.get('id')?{id:fd.get('id')}:{}),
          category_kind:fd.get('category_kind'),
          name_en:text(fd.get('name_en'),120,'Category name',true),
          name_ur:text(fd.get('name_ur'),120,'Urdu name',false),
          sort_order:Number(fd.get('sort_order')||0),
          is_active:fd.get('id')?fd.has('is_active'):true
        });
        s.editor=null;s.editorRevision=null;s.notice='Category saved to catalog draft.';await refresh();return;
      }
      if(type==='product'){
        const payload=normalizeProductDraft({id:fd.get('id')||undefined,category_id:fd.get('category_id'),name_en:fd.get('name_en'),name_ur:fd.get('name_ur'),description_en:fd.get('description_en'),description_ur:fd.get('description_ur'),sort_order:Number(fd.get('sort_order')||0),featured:fd.has('featured'),is_active:fd.has('is_active'),is_available:fd.has('is_available'),variants:readVariantRows(form)});
        await write(WRITE.product,payload);s.editor=null;s.notice='Product and variants saved to catalog draft.';await refresh();return;
      }
      if(type==='deal'){
        const existing=s.dealDraft&&s.dealDraft.id?s.dealDraft:null;
        const submittedDealId=String(fd.get('deal_id')||''),formDealId=String(form.dataset.dealId||'');
        if(submittedDealId!==formDealId||submittedDealId!==(existing?existing.id:''))throw Error('The deal identity in this form no longer matches the selected deal. Reopen the intended deal; no changes were made.');
        s.components=readComponentGroups(form);
        s.dealDraft={
          ...(existing?existing:{}),title:fd.get('title'),description_en:fd.get('description_en'),
          base_price:fd.get('base_price'),flame_hour:fd.has('flame_hour'),
          is_available:existing?fd.has('deal_available'):true
        };
        if(existing)await editDeal(s.dealDraft,submittedDealId);
        else await createDeal(s.dealDraft);
      }
    }
    async function importPublishedMenuDraft(){
      const importer=window.FlameChickCatalogV3Importer;
      if(!importer||typeof importer.runPublishedMenuImport!=='function')throw Error('The secured Catalog V3 importer module is unavailable.');
      const response=await fetch('./flame-chick-published-menu-2026-11-23.v3-draft.json',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw Error('The review-only published menu draft could not be loaded.');
      const draft=await response.json();
      const summary=importer.validatePublishedMenuDraft(draft);
      const message=[
        'Import this reviewed menu into the UNPUBLISHED Flame Chick catalog draft?',
        '',
        summary.products+' products ('+summary.standaloneVariants+' standalone variants; '+summary.dealOnlyVariants+' deal-only variants)',
        summary.deals+' fixed deals / '+summary.offers+' fixed-price offers',
        summary.components+' fixed INCLUDED components',
        '',
        'This writes catalog draft records only. Burger choices remain INCLUDED at zero surcharge. It will NOT publish the catalog, deploy an app, or enable checkout.',
        '',
        'If interrupted, the import can be resumed using stable identities. Conflicting or unexpected existing records will stop the process for inspection.',
        '',
        'Proceed with draft import?'
      ].join('\n');
      if(!window.confirm(message)){s.notice='Menu draft import was cancelled. No catalog writes were made.';render();return;}
      s.saving=true;s.error=null;s.notice=null;s.importProgress={phase:'starting',completed:0,total:summary.categories+summary.products+summary.deals,message:'Starting review-only catalog draft import.'};render();
      try{
        const result=await importer.runPublishedMenuImport(draft,{
          request,
          onProgress:function(progress){s.importProgress=progress;render();}
        });
        s.notice='Published menu draft imported and read-back verified. It remains unpublished; no deployment or checkout change occurred.';
        s.importProgress={phase:'complete',completed:summary.categories+summary.products+summary.deals,total:summary.categories+summary.products+summary.deals,message:'Unpublished catalog draft import finished. Publication was not performed.'};
        s.lastImportResult=result;
        await refresh();
      }catch(error){
        s.error=(error&&error.message||'Catalog draft import failed.')+' Any completed records remain in the unpublished draft. Refresh and retry only after reviewing the reported mismatch; stable import keys prevent blind duplicate creation.';
      }finally{
        s.saving=false;
        render();
      }
    }

    function bind(){
      el.onclick=async event=>{
        const b=event.target.closest('[data-action]');if(!b||b.disabled||s.saving||s.editorLoadingDealId)return;const a=b.dataset.action;
        try{
          if(s.error&&a!=='refresh')throw Error('Catalog data is not verified. Refresh successfully before making any changes.');
          if(a==='refresh')await refresh();
          else if(a==='load-more')await loadMore(b.dataset.kind,b.dataset.collectionId||null);
          else if(a==='import-menu')await importPublishedMenuDraft();
          else if(a==='category-add'){s.editor={type:'category'};s.editorRevision=s.revision;render();}
          else if(a==='category-edit'){const category=s.categories.find(c=>c.id===b.dataset.id);if(!category)throw Error('Category could not be found.');s.editor={type:'category',category};s.editorRevision=s.revision;render();}
          else if(a==='product-add')openProduct(null);
          else if(a==='product-edit')openProduct(s.products.find(p=>p.id===b.dataset.id));
          else if(a==='deal-add')openDeal();
          else if(a==='variant-add'){if(!s.editor.product)s.editor.product={variants:[]};s.editor.product.variants=s.editor.product.variants||[];s.editor.product.variants.push({size_key:'OPTION_'+(s.editor.product.variants.length+1),size_label:'Option '+(s.editor.product.variants.length+1),price:'',variant_kind:'standard',is_standalone_sellable:true,is_active:true,is_available:true});render();}
          else if(a==='variant-remove'){b.closest('[data-variant-row]')?.remove();}
          else if(a==='component-add'){
             const form=el.querySelector('form[data-form="deal"]');if(form)s.components=readComponentGroups(form,{validate:false});
             s.components.push({display_name:'',quantity:1,allow_repeat_option:false,max_units_per_option:null,options:[{}]});render();
           }
           else if(a==='component-choice-add'){
             const form=el.querySelector('form[data-form="deal"]');if(form)s.components=readComponentGroups(form,{validate:false});
             const index=Number(b.closest('[data-component-group]')?.dataset.groupIndex),group=s.components[index];
             if(!group||/burger/i.test(group.display_name))throw Error('Burger choices are loaded automatically from the Chicken Burgers category.');
             if(group.options.length!==0)throw Error('This component already has a configured choice.');
             group.options.push({});render();
           }
           else if(a==='component-choice-remove'){
             const form=el.querySelector('form[data-form="deal"]');if(form)s.components=readComponentGroups(form,{validate:false});
             const groupEl=b.closest('[data-component-group]'),index=Number(groupEl?.dataset.groupIndex);
             const choiceIndex=Array.from(groupEl.querySelectorAll('[data-choice-row]')).indexOf(b.closest('[data-choice-row]'));
             if(choiceIndex<0||!s.components[index]||!s.components[index].options[choiceIndex])throw Error('The selected component choice could not be found.');
             s.components[index].options.splice(choiceIndex,1);render();
           }
           else if(a==='component-remove'){
             const form=el.querySelector('form[data-form="deal"]');if(form)s.components=readComponentGroups(form,{validate:false});
             const index=Number(b.closest('[data-component-group]')?.dataset.groupIndex);s.components.splice(index,1);render();
           }
           else if(a==='editor-cancel'){s.editor=null;render();}
          else if(a==='deal-detail'){s.detail=await read(READ.dealDetail,{deal_id:b.dataset.id});render();}
          else if(a==='deal-edit'){await openDealEdit(b.dataset.id,b.dataset.title);}
          else if(a==='detail-close'){s.detail=null;render();}
        }catch(e){s.error=e.message||'Catalog action failed.';render();}
      };
      el.onchange=event=>{
        if(event.target.matches('[data-choice-product]')){
          const row=event.target.closest('[data-choice-row]'),p=s.products.find(x=>x.id===event.target.value),select=row.querySelector('[data-choice-variant]');
          const variants=p?p.variants.filter(v=>v.is_active!==false):[];
          select.innerHTML=(p?'<option value="" selected disabled>Choose a variant</option>':'<option value="" selected disabled>Choose a product first</option>')+
            variants.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.size_label)+(v.is_standalone_sellable===false?' · Deal-only':'')+'</option>').join('');
          select.required=true;
          if(variants.length)select.value=variants[0].id;
        }
        if(event.target.matches('[data-field="allow_repeat_option"]')){
          const group=event.target.closest('[data-component-group]'),input=group.querySelector('[data-field="max_units_per_option"]');
          input.disabled=!event.target.checked;
          if(event.target.checked){
            const quantity=group.querySelector('[data-field="quantity"]').value||1;
            if(/burger/i.test(group.querySelector('[data-field="display_name"]').value))input.value=quantity;
            else if(!input.value)input.value=quantity;
          }
        }
        if(event.target.matches('[data-field="quantity"]')){
          const group=event.target.closest('[data-component-group]'),input=group.querySelector('[data-field="max_units_per_option"]');
          input.max=event.target.value;
          if(group.querySelector('[data-field="allow_repeat_option"]').checked&&/burger/i.test(group.querySelector('[data-field="display_name"]').value))input.value=event.target.value;
          else if(Number(input.value)>Number(event.target.value))input.value=event.target.value;
        }
        if(event.target.matches('[data-field="variant_kind"]')){const row=event.target.closest('[data-variant-row]'),pack=event.target.value==='pack';row.querySelector('[data-field="pack_quantity"]').disabled=!pack;row.querySelector('[data-field="pack_unit"]').disabled=!pack;}
      };
      el.onsubmit=async event=>{
        const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(s.saving)return;
        if(s.error){s.notice='Catalog data is not verified. Refresh successfully before saving.';render();return;}
        s.saving=true;s.error=null;
        const formDataSnapshot=new FormData(form);
        try{await submit(form);}catch(e){s.error=e.message||'Catalog save failed.';}
        finally{s.saving=false;render();}
      };
    }
    return {mount:async(element,requestFn)=>{if(!element||typeof requestFn!=='function')throw Error('Catalog V3 workspace requires a root and authenticated request handler.');el=element;request=requestFn;bind();await refresh();},refresh,getState:()=>JSON.parse(JSON.stringify(s))};
  }
  return {READ,WRITE,normalizeProductDraft,buildFixedComponentGroups,buildIncludedMappings,buildFixedDealEditDraft,isApprovedFlameHourSchedule,assertDealIdentity,eligibleChoiceProducts,verifyFixedDealDetail,createWorkspace};
});
