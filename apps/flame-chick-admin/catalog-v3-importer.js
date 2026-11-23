/* Review-only published-menu importer for Catalog V3.
 * Imports to the unpublished catalog draft only. Never publishes or deploys.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FlameChickCatalogV3Importer=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const READ={
    categories:'catalog_categories_list',
    products:'catalog_products_list',
    collections:'catalog_deal_collections_list',
    schedules:'catalog_schedule_sets_list',
    deals:'catalog_deals_list',
    dealDetail:'catalog_deal_detail_read',
    scheduleDetail:'catalog_schedule_detail_read'
  };
  const WRITE={
    category:'catalog_category_upsert',
    product:'catalog_product_upsert',
    collection:'catalog_deal_collection_upsert',
    deal:'catalog_deal_upsert',
    components:'catalog_deal_components_upsert',
    mappings:'catalog_deal_variant_options_upsert',
    schedule:'catalog_schedule_set_upsert',
    assignment:'catalog_deal_schedule_assignment_upsert'
  };

  function fail(message){throw new Error(message);}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function key(value,label){
    if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value))fail(label+' has an invalid key.');
    return value;
  }
  function moneyEqual(a,b){
    if(a==null||b==null)return a==null&&b==null;
    const x=Number(a),y=Number(b);
    return Number.isFinite(x)&&Number.isFinite(y)&&Math.round(x*100)===Math.round(y*100);
  }
  function legacyId(draft,type,itemKey){
    return 'flame-chick:'+draft.draftId+':'+type+':'+itemKey;
  }
  function uniqueBy(items,field,value,label){
    const matches=items.filter(item=>item&&item[field]===value);
    if(matches.length>1)fail('More than one '+label+' has the same stable import key. Stop and inspect the draft.');
    return matches[0]||null;
  }
  function validatePublishedMenuDraft(draft){
    if(!object(draft)||draft.formatVersion!==1||draft.status!=='REVIEW_ONLY_NOT_IMPORTED')fail('This is not an approved review-only V3 menu draft.');
    key(draft.draftId,'Draft ID');
    if(draft.currencyCode!=='PKR'||draft.timezone!=='Asia/Karachi')fail('The draft currency or timezone is not the Flame Chick menu setting.');
    if(!Array.isArray(draft.categories)||!Array.isArray(draft.products)||!Array.isArray(draft.deals)||!object(draft.dealCollection))fail('The draft is missing required catalog collections.');
    const categories=new Map();
    for(const category of draft.categories){
      key(category.key,'Category');
      if(categories.has(category.key)||!['menu','deal'].includes(category.categoryKind)||typeof category.nameEn!=='string'||!category.nameEn.trim())fail('Category keys, kinds and names must be valid and unique.');
      categories.set(category.key,category);
    }
    if(!categories.has(draft.dealCollection.categoryKey)||categories.get(draft.dealCollection.categoryKey).categoryKind!=='deal')fail('The Deals category reference is invalid.');
    const products=new Map(),variants=new Map();
    for(const product of draft.products){
      key(product.key,'Product');
      if(products.has(product.key)||!categories.has(product.categoryKey)||categories.get(product.categoryKey).categoryKind!=='menu'||
        typeof product.nameEn!=='string'||!product.nameEn.trim()||!Array.isArray(product.variants)||!product.variants.length)fail('A product has an invalid key, category, name or variant list.');
      products.set(product.key,product);
      const local=new Set();
      for(const variant of product.variants){
        key(variant.variantKey,'Variant');
        if(local.has(variant.variantKey)||typeof variant.sizeLabel!=='string'||!variant.sizeLabel.trim())fail('Product variant keys and labels must be valid and unique.');
        local.add(variant.variantKey);
        if(!['standard','portion','flavour','pack','volume'].includes(variant.variantKind))fail('A product variant has an unsupported kind.');
        if(variant.standaloneSellable===true){
          if(typeof variant.price!=='number'||!Number.isFinite(variant.price)||variant.price<0)fail('A standalone-sellable variant must have its own numeric price.');
        }else if(variant.standaloneSellable===false){
          if(variant.price!==null&&variant.price!==undefined&&(typeof variant.price!=='number'||!Number.isFinite(variant.price)||variant.price<0))fail('A deal-only variant price must be NULL or a valid non-negative numeric amount.');
        }else fail('Every product variant must explicitly declare standalone sellability.');
        if(variant.variantKind==='pack'){
          if(!Number.isSafeInteger(variant.packQuantity)||variant.packQuantity<1||typeof variant.packUnit!=='string'||!variant.packUnit.trim())fail('Pack variants require a valid quantity and unit.');
        }else if(variant.packQuantity!=null||variant.packUnit!=null)fail('Only pack variants may carry pack quantity/unit.');
        variants.set(product.key+':'+variant.variantKey,{product,variant});
      }
    }
    const referenced=new Set(),dealKeys=new Set(),scheduled=[];
    let offers=0,components=0;
    for(const deal of draft.deals){
      key(deal.key,'Deal');
      if(dealKeys.has(deal.key)||typeof deal.title!=='string'||!deal.title.trim()||!Array.isArray(deal.variants)||deal.variants.length!==1)fail('Each current deal must be one independent fixed-price offer with exactly one variant.');
      dealKeys.add(deal.key);
      const variant=deal.variants[0];
      if(typeof variant.basePrice!=='number'||!Number.isFinite(variant.basePrice)||variant.basePrice<=0||variant.pricingMode&&variant.pricingMode!=='FIXED_BUNDLE')fail('Each deal needs its own positive fixed bundle price.');
      if(!Array.isArray(variant.components)||!variant.components.length)fail('Every fixed deal needs at least one component.');
      for(const component of variant.components){
        if(typeof component.displayName!=='string'||!component.displayName.trim()||!Number.isSafeInteger(component.quantity)||component.quantity<1||component.quantity>100)fail('A deal component has an invalid name or quantity.');
        const ref=variants.get(component.productKey+':'+component.variantKey);
        if(!ref)fail('Deal '+deal.title+' references a product variant that is not in the draft.');
        if(component.pricingTreatment!=='INCLUDED'||Number(component.unitSurcharge)!==0)fail('Current published deals must use fixed INCLUDED components with zero surcharge. Selectable upgrades are not enabled.');
        referenced.add(component.productKey+':'+component.variantKey);
        components++;
      }
      offers++;
      if(deal.schedule){
        const schedule=deal.schedule;
        if(schedule.timezone!=='Asia/Karachi'||schedule.windowKind!=='WEEKLY_DAILY'||
          schedule.localStart!=='15:00:00'||schedule.localEnd!=='17:00:00')fail('Flame Hour must use the daily 3 PM–5 PM Asia/Karachi schedule.');
        scheduled.push(deal);
      }
    }
    if(scheduled.length!==2)fail('The two current Flame Hour offers must each carry the daily Flame Hour schedule.');
    for(const product of draft.products){
      for(const variant of product.variants){
        if(variant.standaloneSellable===false&&!referenced.has(product.key+':'+variant.variantKey))fail('A deal-only product variant is not used by any current deal.');
      }
    }
    return {
      ok:true,draftId:draft.draftId,categories:draft.categories.length,
      products:draft.products.length,variants:variants.size,
      standaloneVariants:Array.from(variants.values()).filter(x=>x.variant.standaloneSellable).length,
      dealOnlyVariants:Array.from(variants.values()).filter(x=>!x.variant.standaloneSellable).length,
      deals:draft.deals.length,offers,components
    };
  }

  function requireItems(result,label){
    if(!object(result)||result.ok!==true||!Array.isArray(result.items))fail(label+' could not be read from the catalog draft.');
    if(result.has_more===true)fail(label+' exceeds the safe importer read limit. Increase the bounded page review before importing.');
    return result.items;
  }
  function requireId(result,label){
    if(!object(result)||result.ok!==true||typeof result.entity_id!=='string'||!result.entity_id)fail(label+' was not confirmed by the catalog command response.');
    return result.entity_id;
  }
  function compareVariant(row,source,variantLegacy){
    return row.legacy_id===variantLegacy&&row.size_key===source.variantKey&&row.size_label===source.sizeLabel&&
      row.variant_kind===source.variantKind&&moneyEqual(row.price,source.price)&&
      (row.pack_quantity??null)===(source.packQuantity??null)&&(row.pack_unit??null)===(source.packUnit??null)&&
      row.is_standalone_sellable===source.standaloneSellable&&row.is_active===true&&row.is_available===true;
  }
  function buildProductPayload(draft,product,categoryId,existing){
    const variants=product.variants.map((variant,index)=>{
      const variantLegacy=legacyId(draft,'variant',product.key+':'+variant.variantKey);
      const found=existing?uniqueBy(existing.variants||[],'legacy_id',variantLegacy,'product variant'):null;
      const sizeCollision=existing&&(existing.variants||[]).find(row=>row.size_key===variant.variantKey&&row.legacy_id!==variantLegacy);
      if(sizeCollision)fail('Product '+product.nameEn+' has a variant key collision. Stop and inspect the existing draft.');
      if(found&&!compareVariant(found,variant,variantLegacy))fail('Existing variant '+product.nameEn+' / '+variant.sizeLabel+' differs from the approved draft. Stop for manual review.');
      return {
        ...(found?{id:found.id}:{}),legacy_id:variantLegacy,
        size_key:variant.variantKey,size_label:variant.sizeLabel,price:variant.price,
        variant_kind:variant.variantKind,pack_quantity:variant.packQuantity??null,pack_unit:variant.packUnit??null,
        is_standalone_sellable:variant.standaloneSellable,sort_order:index+1,is_active:true,is_available:true
      };
    });
    if(existing&&(existing.variants||[]).length!==variants.length)fail('Existing product '+product.nameEn+' has extra or missing variants. Stop for manual review.');
    return {
      ...(existing?{id:existing.id}:{}),
      legacy_id:legacyId(draft,'product',product.key),
      category_id:categoryId,name_en:product.nameEn,name_ur:null,
      description_en:product.descriptionEn??null,description_ur:null,
      featured:false,sort_order:product._importSortOrder,is_active:true,is_available:true,
      variants
    };
  }
  function existingComponentGroups(detail,components){
    if(!Array.isArray(detail.component_groups)||detail.component_groups.length>components.length)fail('Existing deal has extra component groups. Stop for manual review.');
    let needsWrite=detail.component_groups.length!==components.length;
    const groups=components.map((component,index)=>{
      const doc=detail.component_groups[index]||null;
      const group=doc&&doc.group;
      const options=doc&&doc.options;
      if(doc&&(!group||group.name_en!==component.display_name))fail('Existing deal component order/name differs from the approved draft. Stop for manual review.');
      if(doc&&(!Array.isArray(options)||options.length>1))fail('Existing deal component has multiple options. Stop for manual review.');
      const option=doc&&options[0]||null;
      const expectedVariantId=component.product_variant_id;
      if(!expectedVariantId)fail('A deal component variant could not be resolved.');
      if(option&&option.product_variant_id!==expectedVariantId)fail('Existing deal component points to a different product variant. Stop for manual review.');
      const quantity=component.quantity;
      if(!doc||Number(group.min_units)!==quantity||Number(group.max_units)!==quantity||
        group.allow_repeat_option!==(quantity>1)||Number(group.max_units_per_option??0)!==(quantity>1?quantity:0)||
        group.is_active!==true||!option||option.is_active!==true)needsWrite=true;
      return {
        ...(group?{id:group.id}:{}),
        name_en:component.display_name,name_ur:null,min_units:quantity,max_units:quantity,
        allow_repeat_option:quantity>1,max_units_per_option:quantity>1?quantity:null,
        sort_order:index+1,is_active:true,
        options:[{...(option?{id:option.id}:{}),product_variant_id:expectedVariantId,sort_order:1,is_active:true}]
      };
    });
    return {needsWrite,groups};
  }
  function mappingNeedsWrite(detail,expectedOptionIds,quantities){
    const variantDoc=detail.variants&&detail.variants[0];
    const mappings=variantDoc&&variantDoc.allowed_options;
    if(!Array.isArray(mappings))fail('Deal component pricing mappings could not be read.');
    if(mappings.length>expectedOptionIds.length)fail('Existing deal has unexpected component pricing mappings. Stop for manual review.');
    const byOption=new Map(mappings.map(row=>[row.component_option_id,row]));
    return expectedOptionIds.some((id,index)=>{
      const row=byOption.get(id);
      return !row||row.is_active!==true||row.pricing_treatment!=='INCLUDED'||
        Number(row.unit_surcharge)!==0||Number(row.max_quantity_per_deal)!==quantities[index];
    });
  }

  async function runPublishedMenuImport(draft,options){
    const summary=validatePublishedMenuDraft(draft);
    if(!object(options)||typeof options.request!=='function')fail('A secured catalog command request handler is required.');
    const request=options.request;
    const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};
    const progress=(phase,completed,total,message)=>onProgress({phase,completed,total,message});
    async function read(action,args){
      const result=await request(action,args||{},false);
      if(!object(result)||result.ok!==true)fail('Catalog read failed for '+action+'.');
      return result;
    }
    async function write(action,payload){
      const result=await request(action,payload,true);
      if(!object(result)||result.ok!==true)fail('Catalog write failed for '+action+'.');
      return result;
    }
    async function readCategories(){return requireItems(await read(READ.categories,{limit:100}),'Categories');}
    async function readProducts(){return requireItems(await read(READ.products,{limit:50}),'Products');}
    async function readCollections(){return requireItems(await read(READ.collections,{limit:50}),'Deal collections');}
    async function readSchedules(){return requireItems(await read(READ.schedules,{limit:50}),'Schedule sets');}
    async function readDeals(collectionId){return requireItems(await read(READ.deals,{collection_id:collectionId,limit:50}),'Deals');}
    async function readDeal(dealId){return read(READ.dealDetail,{deal_id:dealId});}
    async function readSchedule(id){return read(READ.scheduleDetail,{schedule_set_id:id});}
    function ensureOnlyManagedProducts(products){
      const prefix='flame-chick:'+draft.draftId+':product:';
      const unmanaged=products.filter(row=>typeof row.legacy_id!=='string'||!row.legacy_id.startsWith(prefix));
      if(unmanaged.length)fail('The catalog contains products outside this approved menu import. This importer will not merge the superseded menu or overwrite unrelated records.');
    }
    function ensureOnlyManagedDeals(deals){
      const prefix='flame-chick:'+draft.draftId+':deal:';
      const unmanaged=deals.filter(row=>typeof row.legacy_id!=='string'||!row.legacy_id.startsWith(prefix));
      if(unmanaged.length)fail('The Deals collection contains records outside this approved menu import. Stop and review before proceeding.');
    }
    async function loadFlameHourSchedule(schedules){
      const named=schedules.filter(item=>item.name==='Flame Hour daily');
      if(named.length>1)fail('Multiple Flame Hour daily schedules exist. Stop for manual review.');
      if(named.length===1){
        const item=named[0],detail=await readSchedule(item.id),windows=detail.windows||[];
        const valid=item.is_active===true&&item.timezone==='Asia/Karachi'&&windows.length===7&&windows.every((w,index)=>
          w.window_kind==='WEEKLY'&&Number(w.weekday_iso)===index+1&&w.local_start==='15:00:00'&&w.local_end==='17:00:00'&&!w.is_all_day
        );
        if(!valid)fail('An existing Flame Hour daily schedule has different settings. It will not be silently replaced.');
        return item.id;
      }
      const windows=Array.from({length:7},(_,index)=>({
        window_kind:'WEEKLY',weekday_iso:index+1,local_start:'15:00:00',local_end:'17:00:00',
        is_all_day:false,starts_at:null,ends_at:null,effective_from:null,effective_to:null
      }));
      const created=await write(WRITE.schedule,{name:'Flame Hour daily',timezone:'Asia/Karachi',is_active:true,windows});
      const id=requireId(created,'Flame Hour schedule');
      const detail=await readSchedule(id);
      if(detail.schedule_set?.name!=='Flame Hour daily'||detail.schedule_set?.timezone!=='Asia/Karachi'||
        !Array.isArray(detail.windows)||detail.windows.length!==7)fail('Flame Hour schedule creation could not be verified.');
      return id;
    }
    async function ensureCollection(categoryId){
      let collections=await readCollections();
      const matches=collections.filter(item=>item.category_id===categoryId&&item.name_en==='Deals');
      if(matches.length>1)fail('More than one Deals collection exists for the Deals category.');
      if(matches.length===1){
        const item=matches[0];
        if(item.is_active!==true){
          await write(WRITE.collection,{id:item.id,category_id:categoryId,name_en:'Deals',name_ur:null,sort_order:0,is_active:true,schedule_set_id:null});
          collections=await readCollections();
        }
        const found=collections.find(row=>row.id===item.id);
        if(!found||found.is_active!==true)fail('The existing Deals collection could not be activated and verified.');
        return found;
      }
      const result=await write(WRITE.collection,{category_id:categoryId,name_en:'Deals',name_ur:null,sort_order:0,is_active:true,schedule_set_id:null});
      const id=requireId(result,'Deals collection');
      collections=await readCollections();
      const found=collections.find(row=>row.id===id);
      if(!found||found.category_id!==categoryId||found.name_en!=='Deals'||found.is_active!==true)fail('Deals collection creation could not be verified.');
      return found;
    }

    progress('preflight',0,summary.categories+summary.products+summary.deals,'Reading current draft and checking for unrelated records.');
    let categories=await readCategories();
    let products=await readProducts();
    ensureOnlyManagedProducts(products);
    const categoryIds=new Map();
    const total=summary.categories+summary.products+summary.deals;
    let completed=0;

    // Preflight every category and product identity before the first write.
    for(const category of draft.categories){
      const stable=legacyId(draft,'category',category.key);
      const found=uniqueBy(categories,'legacy_id',stable,'category');
      if(found){
        if(found.category_kind!==category.categoryKind||found.name_en!==category.nameEn||found.is_active!==true){
          fail('Existing category '+category.nameEn+' differs from the approved draft. Stop before writing.');
        }
        categoryIds.set(category.key,found.id);
      }else{
        const collision=categories.find(row=>row.category_kind===category.categoryKind&&row.name_en===category.nameEn);
        if(collision)fail('A category named '+category.nameEn+' exists without the expected stable import key. Stop before writing.');
      }
    }
    for(const product of draft.products){
      const stable=legacyId(draft,'product',product.key);
      const existing=uniqueBy(products,'legacy_id',stable,'product');
      if(!existing)continue;
      const categoryId=categoryIds.get(product.categoryKey);
      if(!categoryId||existing.category_id!==categoryId||existing.name_en!==product.nameEn||
        (existing.description_en??null)!==(product.descriptionEn??null)||
        existing.is_active!==true||existing.is_available!==true){
        fail('Existing product '+product.nameEn+' differs from the approved draft. Stop before writing.');
      }
      buildProductPayload(draft,{...product,_importSortOrder:draft.products.indexOf(product)+1},categoryId,existing);
    }

    for(const [index,category] of draft.categories.entries()){
      const legacy=legacyId(draft,'category',category.key);
      let found=uniqueBy(categories,'legacy_id',legacy,'category');
      if(!found){
        const collision=categories.find(row=>row.category_kind===category.categoryKind&&row.name_en===category.nameEn);
        if(collision)fail('A category named '+category.nameEn+' exists without the expected stable import key. Stop for manual review.');
        const result=await write(WRITE.category,{
          category_kind:category.categoryKind,legacy_id:legacy,name_en:category.nameEn,name_ur:null,
          sort_order:index+1,is_active:true
        });
        const id=requireId(result,'Category '+category.nameEn);
        categories=await readCategories();
        found=categories.find(row=>row.id===id);
      }
      if(!found||found.category_kind!==category.categoryKind||found.name_en!==category.nameEn||found.is_active!==true)fail('Category '+category.nameEn+' does not match the approved draft.');
      categoryIds.set(category.key,found.id);
      completed++;
      progress('categories',completed,total,'Verified category: '+category.nameEn);
    }

    const productIds=new Map(),variantIds=new Map();
    for(const [index,product] of draft.products.entries()){
      const categoryId=categoryIds.get(product.categoryKey);
      const legacy=legacyId(draft,'product',product.key);
      let existing=uniqueBy(products,'legacy_id',legacy,'product');
      if(existing&&(
        existing.name_en!==product.nameEn||existing.category_id!==categoryId||
        (existing.description_en??null)!==(product.descriptionEn??null)||
        existing.is_active!==true||existing.is_available!==true
      ))fail('Existing product '+product.nameEn+' differs from the approved draft. Stop for manual review.');
      const payload=buildProductPayload(draft,{...product,_importSortOrder:index+1},categoryId,existing);
      if(!existing){
        const result=await write(WRITE.product,payload);
        const id=requireId(result,'Product '+product.nameEn);
        products=await readProducts();
        ensureOnlyManagedProducts(products);
        existing=products.find(row=>row.id===id);
      }
      if(!existing)fail('Product '+product.nameEn+' was not found after save.');
      const savedVariants=existing.variants||[];
      for(const sourceVariant of product.variants){
        const variantLegacy=legacyId(draft,'variant',product.key+':'+sourceVariant.variantKey);
        const saved=uniqueBy(savedVariants,'legacy_id',variantLegacy,'product variant');
        if(!saved||!compareVariant(saved,sourceVariant,variantLegacy))fail('Product variant '+product.nameEn+' / '+sourceVariant.sizeLabel+' failed read-back verification.');
        variantIds.set(product.key+':'+sourceVariant.variantKey,saved.id);
      }
      productIds.set(product.key,existing.id);
      completed++;
      progress('products',completed,total,'Verified product: '+product.nameEn);
    }

    const dealsCategoryId=categoryIds.get(draft.dealCollection.categoryKey);
    if(!dealsCategoryId)fail('The Deals category could not be resolved.');
    const collection=await ensureCollection(dealsCategoryId);
    let deals=await readDeals(collection.id);
    ensureOnlyManagedDeals(deals);
    let scheduleId=null;
    const hasFlameHour=draft.deals.some(deal=>!!deal.schedule);
    if(hasFlameHour)scheduleId=await loadFlameHourSchedule(await readSchedules());

    for(const deal of draft.deals){
      const dealLegacy=legacyId(draft,'deal',deal.key);
      let saved=uniqueBy(deals,'legacy_id',dealLegacy,'deal');
      if(saved&&(saved.title!==deal.title||saved.collection_id!==collection.id||saved.is_available!==true))fail('Existing deal '+deal.title+' differs from the approved draft. Stop for manual review.');
      let detail;
      if(!saved){
        const sourceVariant=deal.variants[0];
        const created=await write(WRITE.deal,{
          collection_id:collection.id,legacy_id:dealLegacy,title:deal.title,title_ur:null,
          description_en:deal.descriptionEn??null,description_ur:null,featured:false,sort_order:draft.deals.indexOf(deal)+1,
          is_active:false,is_available:true,
          variants:[{variant_key:sourceVariant.variantKey,label_en:sourceVariant.labelEn,label_ur:null,
            pricing_mode:'FIXED_BUNDLE',base_price:sourceVariant.basePrice,sort_order:1,is_active:false}]
        });
        const dealId=requireId(created,'Deal '+deal.title);
        deals=await readDeals(collection.id);
        saved=deals.find(row=>row.id===dealId);
        if(!saved)fail('Deal '+deal.title+' was not returned by the draft read after save.');
      }
      detail=await readDeal(saved.id);
      if(!detail.deal||detail.deal.legacy_id!==dealLegacy||detail.deal.title!==deal.title)fail('Deal identity does not match the review draft.');
      if(detail.deal.is_active===true){
        const source=deal.variants[0];
        const variantDoc=detail.variants&&detail.variants[0];
        if(!variantDoc||detail.variants.length!==1||variantDoc.variant.variant_key!==source.variantKey||
          !moneyEqual(variantDoc.variant.base_price,source.basePrice))fail('An active deal has an unexpected price or variant. Stop for manual review.');
      }else if(detail.variants&&detail.variants.length!==1){
        fail('An inactive imported deal must have exactly one variant before component reconciliation.');
      }
      const sourceVariant=deal.variants[0];
      const componentRefs=sourceVariant.components.map(component=>({
        display_name:component.displayName,
        product_variant_id:variantIds.get(component.productKey+':'+component.variantKey),
        quantity:component.quantity
      }));
      if(componentRefs.some(item=>!item.product_variant_id))fail('A deal component could not resolve to a saved product variant.');
      const componentState=existingComponentGroups(detail,componentRefs);
      if(detail.deal.is_active===true){
        verifyDealState(detail,deal,componentRefs,scheduleId,true);
        completed++;
        progress('deals',completed,total,'Verified already-active deal: '+deal.title);
        continue;
      }
      if(componentState.needsWrite){
        await write(WRITE.components,{deal_id:saved.id,groups:componentState.groups});
        detail=await readDeal(saved.id);
      }
      const mapping=buildMappings(detail,componentRefs);
      if(mapping.needsWrite){
        await write(WRITE.mappings,{deal_id:saved.id,deal_variant_id:mapping.dealVariantId,options:mapping.options});
        detail=await readDeal(saved.id);
      }
      if(deal.schedule){
        const globalAssignments=(detail.schedule_assignments||[]).filter(item=>item.branch_id==null);
        if(globalAssignments.length>1)fail('Deal '+deal.title+' has multiple restaurant-wide schedule assignments. Stop for manual review.');
        const assignment=globalAssignments[0]||null;
        if(!assignment||assignment.schedule_set_id!==scheduleId||assignment.is_active!==true){
          await write(WRITE.assignment,{...(assignment?{id:assignment.id}:{}),deal_id:saved.id,branch_id:null,schedule_set_id:scheduleId,is_active:true});
          detail=await readDeal(saved.id);
        }
      }
      verifyDealState(detail,deal,componentRefs,scheduleId,false);
      const variantToActivate=detail.variants[0].variant;
      await write(WRITE.deal,{
        id:saved.id,is_active:true,
        variants:[{
          id:variantToActivate.id,
          variant_key:sourceVariant.variantKey,
          label_en:sourceVariant.labelEn,
          label_ur:null,
          pricing_mode:'FIXED_BUNDLE',
          base_price:sourceVariant.basePrice,
          sort_order:1,
          is_active:true
        }]
      });
      detail=await readDeal(saved.id);
      verifyDealState(detail,deal,componentRefs,scheduleId,true);
      completed++;
      progress('deals',completed,total,'Imported and read-back verified deal: '+deal.title);
      deals=await readDeals(collection.id);
    }
    progress('complete',total,total,'All menu products and fixed deal offers are saved in the unpublished catalog draft.');
    return {ok:true,summary,categoryIds:Object.fromEntries(categoryIds),productIds:Object.fromEntries(productIds),dealCollectionId:collection.id,
      dealCount:draft.deals.length,scheduleId,publicationPerformed:false};
  }

  function buildMappings(detail,components){
    if(!Array.isArray(detail.variants)||detail.variants.length!==1)fail('The fixed deal variant could not be verified.');
    const variant=detail.variants[0].variant;
    if(!variant||variant.pricing_mode!=='FIXED_BUNDLE')fail('Current menu deals must use FIXED_BUNDLE pricing.');
    if(!Array.isArray(detail.component_groups)||detail.component_groups.length!==components.length)fail('The fixed deal groups are incomplete after save.');
    const options=[],ids=[],quantities=[];
    detail.component_groups.forEach((doc,index)=>{
      if(!doc.group||!Array.isArray(doc.options)||doc.options.length!==1)fail('Every current deal component must have exactly one saved product option.');
      if(doc.options[0].product_variant_id!==components[index].product_variant_id)fail('A saved deal component references an unexpected product variant.');
      options.push({component_option_id:doc.options[0].id,pricing_treatment:'INCLUDED',unit_surcharge:0,
        max_quantity_per_deal:components[index].quantity,sort_order:index+1,is_active:true});
      ids.push(doc.options[0].id);quantities.push(components[index].quantity);
    });
    const current=detail.variants[0].allowed_options;
    if(!Array.isArray(current))fail('The saved deal option mappings could not be read.');
    if(current.some(row=>!ids.includes(row.component_option_id)))fail('The deal has a mapping for an unknown component option.');
    const byOption=new Map(current.map(row=>[row.component_option_id,row]));
    const needsWrite=ids.some((id,index)=>{
      const row=byOption.get(id);
      return !row||row.is_active!==true||row.pricing_treatment!=='INCLUDED'||
        Number(row.unit_surcharge)!==0||Number(row.max_quantity_per_deal)!==quantities[index];
    });
    return {dealVariantId:variant.id,options,needsWrite};
  }

  function verifyDealState(detail,deal,components,scheduleId,expectedActive){
    const sourceVariant=deal.variants[0];
    if(!detail||!detail.deal||detail.deal.is_active!==expectedActive||detail.deal.is_available!==true)fail('Deal active state does not match the expected staged state.');
    if(!Array.isArray(detail.variants)||detail.variants.length!==1)fail('The saved deal must have exactly one fixed-price variant.');
    const variantDoc=detail.variants[0],savedVariant=variantDoc&&variantDoc.variant;
    if(!savedVariant||savedVariant.variant_key!==sourceVariant.variantKey||
      savedVariant.pricing_mode!=='FIXED_BUNDLE'||!moneyEqual(savedVariant.base_price,sourceVariant.basePrice)||
      savedVariant.is_active!==expectedActive)fail('The saved fixed deal price, variant identity or activation state does not match the approved draft.');
    if(!Array.isArray(detail.component_groups)||detail.component_groups.length!==components.length)fail('The saved deal component count does not match the approved draft.');
    for(let index=0;index<components.length;index++){
      const doc=detail.component_groups[index],wanted=components[index];
      if(!doc||!doc.group||doc.group.name_en!==wanted.display_name||
        Number(doc.group.min_units)!==wanted.quantity||Number(doc.group.max_units)!==wanted.quantity||
        doc.group.allow_repeat_option!==(wanted.quantity>1)||
        Number(doc.group.max_units_per_option??0)!==(wanted.quantity>1?wanted.quantity:0)||
        doc.group.is_active!==true||!Array.isArray(doc.options)||doc.options.length!==1||
        doc.options[0].product_variant_id!==wanted.product_variant_id||doc.options[0].is_active!==true){
        fail('A saved fixed deal component failed read-back verification: '+wanted.display_name);
      }
    }
    const mappings=variantDoc.allowed_options;
    if(!Array.isArray(mappings)||mappings.length!==components.length)fail('The deal mapping count does not match the fixed component count.');
    const optionIds=detail.component_groups.map(doc=>doc.options[0].id);
    for(let index=0;index<components.length;index++){
      const row=mappings.find(item=>item.component_option_id===optionIds[index]);
      if(!row||row.product_variant_id!==components[index].product_variant_id||
        row.is_active!==true||row.pricing_treatment!=='INCLUDED'||
        Number(row.unit_surcharge)!==0||Number(row.max_quantity_per_deal)!==components[index].quantity){
        fail('Every current deal mapping must be active INCLUDED with zero surcharge.');
      }
    }
    if(deal.schedule){
      const assignments=(detail.schedule_assignments||[]).filter(item=>
        item.branch_id==null&&item.is_active===true&&item.schedule_set_id===scheduleId
      );
      if(assignments.length!==1)fail('The Flame Hour daily schedule assignment failed read-back verification.');
    }
    return true;
  }

  return {READ,WRITE,validatePublishedMenuDraft,legacyId,buildProductPayload,buildMappings,verifyDealState,runPublishedMenuImport};
});
