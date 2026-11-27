import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const files = ["apps/flame-chick-pos/index.html", "apps/flame-chick-rider/index.html"];
const source = files.map((file) => ({ file, html: readFileSync(file, "utf8") }));
const posCatalogAdapter = readFileSync("apps/flame-chick-pos/catalog-v3-adapter.js", "utf8");

test("POS and Rider source use Flame Chick identifiers only", () => {
  const all = source.map((x) => x.html).join("\n");
  const retiredBrand = ["Pizza", "Bite"].join(" ");
  const retiredGlobal = ["H", "F", "P"].join("");
  assert.equal(all.toLowerCase().includes(retiredBrand.toLowerCase()), false);
  assert.equal(new RegExp("\\b" + retiredGlobal + "\\b", "i").test(all), false);
  assert.equal(/service_role|sb_secret_/i.test(all), false);
});

test("POS and Rider inline JavaScript parses", () => {
  for (const { file, html } of source) {
    const chunks = html.split("<script").slice(1);
    let index = 0;
    for (const chunk of chunks) {
      const tagEnd = chunk.indexOf(">");
      if (tagEnd < 0) continue;
      const attrs = chunk.slice(0, tagEnd);
      if (attrs.toLowerCase().includes("src=")) continue;
      const close = chunk.indexOf("</script>", tagEnd + 1);
      if (close < 0) continue;
      const code = chunk.slice(tagEnd + 1, close).trim();
      if (code) new vm.Script(code, { filename: file + "-inline-" + index++ + ".js" });
    }
    assert.ok(index > 0, "No inline JavaScript checked in " + file);
  }
});

test("Rider delivery sequence is Accept offer, Picked up, then Delivered", () => {
  const html=source[1].html;
  assert.match(html,/data-offer-action="accept"/);
  assert.match(html,/data-action="picked_up"/);
  assert.match(html,/if\(s==='out_for_delivery'\)return[^\n]*data-action="delivered"/);
  assert.doesNotMatch(html,/arrived_at|arrived_at_restaurant|data-acceptance-deadline|pendingAcceptance|expiredAcceptanceRefreshes|acceptance-countdown/);
});

test("POS delivery dispatch uses the targeted offer state, not a second acceptance stage", () => {
  const html=source[0].html;
  assert.match(html,/task\.status==='offering'/);
  assert.doesNotMatch(html,/deliveryAcceptanceTicker|pos-acceptance-deadline|Awaiting acceptance|reassignPending|pendingReassignment/);
  assert.doesNotMatch(html,/arrived_at|arrived_at_restaurant/);
});

test("Rider Go Offline keeps private Realtime for existing assigned deliveries", () => {
  const html=source[1].html;
  const start=html.indexOf("$('availabilityBtn').addEventListener");
  const end=html.indexOf("\n});",start);
  const handler=html.slice(start,end);
  assert.match(handler,/riderWantsOnline=false;\s*stopRiderPresence\(\);\s*\/\/ Keep the rider's own private channel alive[\s\S]*?startRiderRealtime\(\);/);
  assert.doesNotMatch(handler,/riderWantsOnline=false;[\s\S]*?stopRiderRealtime\(\)/);
});

test("Rider Realtime uses a private own-user Broadcast topic with automatic recovery", () => {
  const html=source[1].html;
  assert.ok(html.includes('const topic="fc:rider:"+riderId+":ops"'));
  assert.ok(html.includes('client.channel(topic,{config:{private:true}})'));
  assert.ok(html.includes('.on("broadcast",{event:"delivery_changed"},scheduleRiderJobsRefresh)'));
  assert.doesNotMatch(html, /\.on\("postgres_changes"/);
  assert.match(html, /function startRiderRealtimeFallback/);
  assert.match(html, /riderRealtimeFallbackTimer/);
  assert.doesNotMatch(html, /if\(!session\?\.access_token\|\|!user\?\.id\|\|!rider\?\.branch_id\|\|!riderWantsOnline\)return/);
  assert.match(html, /scheduleRiderJobsRefresh\(\)/);
});

test("POS listens to private branch Broadcast events and refreshes after reconnect", () => {
  const html=source[0].html;
  assert.ok(html.includes("client.channel('fc:branch:'+branch+':pos',{config:{private:true}})"));
  assert.ok(html.includes("channel.on('broadcast',{event:'orders_changed'},scheduleFlameChickRealtimeRefresh)"));
  assert.ok(html.includes("channel.on('broadcast',{event:'delivery_changed'},scheduleFlameChickRealtimeRefresh)"));
  assert.match(html, /scheduleFlameChickRealtimeRefresh\(\);\s*flameChickRealtimeRefreshTimer=setInterval/);
});

test("Realtime migration limits broadcasts to active POS staff and each rider's own topic", () => {
  const migration=readFileSync(
    "supabase/migrations/20261125092751_flame_chick_private_ops_realtime_broadcasts.sql",
    "utf8"
  );
  assert.match(migration, /CREATE POLICY flame_chick_private_ops_broadcast_select/);
  assert.match(migration, /realtime\.topic\(\)/);
  assert.match(migration, /ur\.role_key IN \('admin','owner'\)/);
  assert.match(migration, /ur\.role_key IN \('manager','cashier'\)/);
  assert.match(migration, /p_topic = 'fc:rider:'\|\|v_user_id::text\|\|':ops'/);
  assert.match(migration, /PERFORM realtime\.send\(v_payload,v_event,v_topic,true\)/);
  assert.match(migration, /delivery_task_offers/);
  assert.match(migration, /delivery_assignments/);
  assert.match(migration, /availability_status/);
  assert.doesNotMatch(migration, /CREATE PUBLICATION|ALTER PUBLICATION|ALTER TABLE .*REPLICA IDENTITY/);
});

test("Realtime trigger payload contains record identifiers, not customer or rider PII", () => {
  const migration=readFileSync(
    "supabase/migrations/20261125092751_flame_chick_private_ops_realtime_broadcasts.sql",
    "utf8"
  );
  assert.match(migration, /'record_id',v_record_id/);
  assert.match(migration, /'branch_id',v_branch_id::text/);
  assert.match(migration, /'delivery_task_id',v_delivery_task_id/);
  assert.doesNotMatch(migration, /recipient_name_snapshot|recipient_phone_snapshot|address_snapshot|customer_phone|customer_name/);
});


test("POS loads private staff context, orders, history, and dispatch only through authorized Edge APIs", () => {
  const html = source[0].html;
  assert.match(html, /API_URL\+'\?view=staff_context'/);
  assert.match(html, /flameChickOrderRequest\('GET',\{board:'active'/);
  assert.match(html, /flameChickOrderRequest\('GET',\{board:'all'/);
  assert.match(html, /flameChickDeliveryRequest\('GET',\{view:'dispatch'\}\)/);
  assert.match(html, /action:'assign',delivery_task_id:/);
  assert.doesNotMatch(html, /FLAME_CHICK_REST_URL/);
  assert.doesNotMatch(html, /flameChickDirectRest\(/);
  assert.doesNotMatch(html, /flameChickDirectRpc\(/);
});

test("Rider obtains its branch-scoped profile and account roles through authenticated APIs", () => {
  const html = source[1].html;
  assert.match(html, /DELIVERY_API\+'\?view=profile'/);
  assert.match(html, /ORDER_API\+'\?view=staff_context'/);
  assert.doesNotMatch(html, /REST_URL/);
  assert.doesNotMatch(html, /riderDirectRead\(/);
  assert.doesNotMatch(html, /user_roles\?select=role/);
  assert.doesNotMatch(html, /rider_profiles\?select=/);
});


test("POS delivery order payload sends explicit delivery selection without fee or display-name authority", () => {
  const html=source[0].html;
  assert.match(html,/selection_type:areaChoice==='not listed'\?'not_listed':'listed_area'/);
  assert.match(html,/area_id:areaChoice==='not listed'\?null:areaId/);
  assert.match(html,/address,/);
  const start=html.indexOf('function flameChickBuildPosDeliveryOrderPayload');
  const end=html.indexOf('async function flameChickCreatePosDeliveryOrder',start);
  const payload=html.slice(start,end);
  assert.doesNotMatch(payload,/area_name\s*:/);
  assert.doesNotMatch(payload,/delivery_fee\s*:/);
  assert.doesNotMatch(payload,/fee\s*:\s*area/);
});


test("POS keeps an unset delivery-area fee distinct from an explicitly free area", () => {
  const html=source[0].html;
  assert.match(posCatalogAdapter,/const fee = row\.deliveryFee === null \|\| row\.deliveryFee === undefined \? null : Number\(row\.deliveryFee\)/);
  assert.match(posCatalogAdapter,/Number\.isFinite\(fee\) && fee >= 0 \? fee : null/);
  assert.match(html,/if\(type==='Delivery'&&deliveryFee===null\)/);
  assert.match(html,/getDeliveryFeeForArea\(order\.area\)===null/);
  assert.doesNotMatch(html,/function deliveryAreaFee\(row\)[^\n]*:0\}/);
});


test("POS keeps Rider-delivered orders active until Cashier payment collection", () => {
  const html=source[0].html;
  assert.match(html,/return st==='Out for Delivery'\|\|st==='Delivered'\|\|st==='Served'/);
  assert.match(html,/Delivered · awaiting cashier payment collection/);
  assert.match(html,/\['Pending','Accepted','Preparing','Ready','Out for Delivery','Delivered','Served'\]/);
  assert.doesNotMatch(html,/status==='Delivered'[^\\n]*data-order-status="Completed"/);
});

test("POS status commands include a per-mutation idempotency UUID",()=>{
  const html=source[0].html;
  const start=html.indexOf("async function updateOnlineOrderStatus(orderId,status)");
  const end=html.indexOf("async function ",start+30);
  const mutation=html.slice(start,end);
  assert.match(mutation,/requestId:crypto\.randomUUID\(\)/);
  assert.match(mutation,/order_id:key,to_status:toStatus,reason,request_id:mutation\.requestId/);
});

test("POS distinguishes Dine-in Served from Takeaway Collected",()=>{
  const html=source[0].html;
  assert.match(html,/data-order-status="Served"/);
  assert.match(html,/data-detail-status="\$\{next\}"/);
  assert.match(html,/o\.FulfillmentType==='Dine-in'\?'Served':'Collected'/);
  assert.match(html,/st==='Out for Delivery'\|\|st==='Delivered'\|\|st==='Served'/);
});

test("POS allows Cashier and Manager to confirm physical returns", () => {
  const html=source[0].html;
  assert.match(html,/const manager=\['owner','admin','manager','cashier'\]\.includes\(role\)/);
  assert.match(html,/if\(!\['owner','admin','manager','cashier'\]\.includes\(role\)\)/);
  assert.match(html,/action:'confirm_return',delivery_task_id:taskId/);
});

test("POS routes physically returned orders into the Cancelled Orders history tab", () => {
  const html=source[0].html;
  assert.match(html,/returned:'Returned'/);
  assert.ok(html.includes("['cancelled','returned'].includes(String(o.status||'').trim().toLowerCase())"));
  assert.ok(html.includes("historyServerRows.cancelled=localRows.filter(o=>['cancelled','returned']"));
});

test("Rider delivered confirmation explicitly distinguishes delivery from cashier payment collection", () => {
  const html=source[1].html;
  assert.match(html,/Delivery marked delivered\. The order remains awaiting cashier payment collection\./);
});


test("POS exposes Cashier payment collection only for delivered orders and preserves safe retry identity", () => {
  const html=source[0].html;
  assert.match(html,/data-collect-payment=/);
  assert.ok(html.includes("async function openPaymentCollection(orderId)"));
  assert.ok(html.includes("await loadInitialOnlineInbox()"));
  assert.ok(html.includes("state.sent&&state.method!==method"));
  assert.match(html,/paymentRequest=window\.FlameChickPosPaymentCollection/);
  assert.match(html,/createFullBalanceRequest/);
  assert.match(html,/payment_method:method,request_id:state\.requestId/);
  assert.ok(html.includes("paymentCollectionState={orderId:key,requestId:crypto.randomUUID(),method:'cash',sent:false}"));
  assert.ok(html.includes("state.sent=true"));
  assert.match(html,/Successful collection completes the order and moves it to Order History/);
  assert.match(html,/order\.Status!=='Delivered'/);
  assert.match(html,/result\.completed!==true/);
  assert.match(html,/await refreshHistoryData\(\)/);
  assert.match(html,/option value="cash">COD/);
  assert.match(html,/option value="card">Card/);
  assert.match(html,/option value="bank">Online\/bank transfer/);
  assert.doesNotMatch(html,/public\.payments\?select=|flame_chick_collect_order_payment|INSERT INTO public\.payments/);
});

test("POS displays the authoritative outstanding balance rather than treating delivery as collection", () => {
  const html=source[0].html;
  assert.match(html,/BalanceDue:row\.balance_due===null/);
  assert.match(html,/PaidAmount:Number\(row\.paid_amount\)\|\|0/);
  assert.match(html,/Due Rs\. \$\{money\(balance\)\}/);
  assert.match(html,/Payment collected\. Order completed and moved to Order History\./);
});

test("POS loads only the published V3 catalog contract and rejects legacy V2 cache",()=>{
  const html=source[0].html;
  assert.match(html,/\.\/catalog-v3\.js/);
  assert.match(html,/\.\/catalog-v3-deal-view\.js/);
  assert.match(html,/\.\/catalog-v3-adapter\.js/);
  assert.match(html,/FlameChickCatalogV3\?\.validateHealth/);
  assert.match(html,/snapshot\.schemaVersion!==3/);
  assert.match(html,/schemaVersion:3,value:snapshot/);
  assert.match(html,/Never let an old V2 cache appear as the current Production menu/);
  const start=html.indexOf("function adaptFlameChickCatalog(snapshot)");
  const end=html.indexOf("function normalizeLookupText",start);
  const adapter=html.slice(start,end);
  assert.match(adapter,/FlameChickPosCatalogV3\?\.adapt/);
  assert.doesNotMatch(adapter,/schemaVersion\)!==2|LegacyProductID|LegacyVariantID/);
});

test("POS enables published V3 deal choices through the current variant/component-group model",()=>{
  const html=source[0].html;
  assert.match(html,/FlameChickCatalogV3DealView\.buildDealViewModel/);
  assert.match(html,/componentGroups/);
  assert.match(html,/dealVariantId/);
  assert.doesNotMatch(html,/const orderable=false/);
  assert.doesNotMatch(html,/catalogSnapshot\.dealComponents/);
});

test("POS uses one unified V3 sync path for Delivery, Takeaway and Dine-in",()=>{
  const html=source[0].html;
  assert.match(html,/\.\/sync-v3\.js/);
  assert.match(html,/syncPendingUnifiedPosOrders/);
  assert.match(html,/prepareLocalPosSyncOrder/);
  assert.match(html,/acknowledgementMatches/);
  assert.match(html,/syncStatus=permanent\?'needs_review':'failed'/);
  assert.match(html,/order\.serverOrderId/);
  assert.doesNotMatch(html,/Takeaway and dine-in orders remain local/);
});

test("POS loads branch-scoped delivery areas and Not Listed fee from the authenticated Order API",()=>{
  const html=source[0].html;
  assert.match(html,/view:'pos_delivery_context'/);
  assert.match(html,/not_listed_delivery_fee/);
  assert.match(html,/deliveryAreaId=type==='Delivery'/);
  assert.match(html,/deliveryLocality/);
  assert.doesNotMatch(html,/snapshot\.deliveryAreas\|\|\[\]/);
});

test("POS defines a private Realtime lifecycle and a safe automatic refresh fallback",()=>{
  const html=source[0].html;
  assert.match(html,/async function startFlameChickRealtime\(\)/);
  assert.match(html,/async function stopFlameChickRealtime\(\)/);
  assert.match(html,/fc:branch:/);
  assert.match(html,/config:\{private:true\}/);
  assert.match(html,/startFlameChickRealtimeFallback/);
  assert.match(html,/setInterval\(/);
});

test("POS saves server payment collection only after cashier confirms a non-delivery receipt",()=>{
  const html=source[0].html;
  assert.match(html,/pendingPayment/);
  assert.match(html,/requestId:crypto\.randomUUID\(\)/);
  assert.match(html,/String\(order\.paymentStatus\|\|''\)\.toLowerCase\(\)==='paid'/);
  assert.match(html,/await put\(STORES\.queue,current\)/);
});



test("POS renders live branch delivery areas as fee-labelled options and recalculates totals",()=>{
  const html=source[0].html;
  assert.match(html,/<select id="area"/);
  assert.match(html,/function renderDeliveryAreaOptions\(\)/);
  assert.match(html,/option\.textContent=deliveryAreaDisplayName\(name\)\+' — Rs\. '\+money\(fee\)/);
  assert.match(html,/option\.value='Not Listed \/ Other'/);
  assert.match(html,/\$\('area'\)\?\.addEventListener\('change'/);
  assert.match(html,/posDeliveryConfig\?\.branchId/);
  assert.match(html,/feeFallback=selectedArea\?'Fee unavailable':'Choose area'/);
  assert.doesNotMatch(html,/\$\('deliveryFee'\)\.textContent=feeKnown\?'Rs\. '\+money\(fee\):'Not configured'/);
});

test("POS deal Add Deal action is directly bound, validates price and reports failures",()=>{
  const html=source[0].html;
  assert.match(html,/data-pos-deal-add="true"/);
  assert.match(html,/const addDealButton=\$\('posDealAddBtn'\)/);
  assert.match(html,/addDealButton\.onclick=event=>/);
  assert.match(html,/event\.preventDefault\(\);event\.stopPropagation\(\);/);
  assert.match(html,/if\(!Number\.isFinite\(price\)\|\|price<0\)throw new Error/);
  assert.match(html,/showToast\(error\?\.message\|\|'The deal could not be added/);
  assert.match(html,/cart\.push\(\{key,itemId:st\.deal\.id,dealId:st\.deal\.id,dealVariantId:variant\.id,itemName:st\.deal\.title,quantity:1,price,type:'deal'/);
});

test("POS deal cart uses the declared contents array and never references an undefined content variable",()=>{
  const html=source[0].html;
  assert.match(html,/const contents=componentGroups\.flatMap/);
  assert.match(html,/type:'deal',contents,componentGroups/);
  assert.doesNotMatch(html,/const content=componentGroups\.flatMap/);
});

test("POS renders required Burger component slots as selectable dropdowns and preserves exact V3 option IDs",()=>{
  const html=source[0].html;
  assert.match(html,/burgerSlots=\{\}/);
  assert.match(html,/if\(group\.categoryDriven===true\|\|\(\/burger\/i\.test\(String\(group\.name\|\|''\)\)&&group\.options\.length>1\)\)\{/);
  assert.match(html,/data-pos-deal-burger-select/);
  assert.match(html,/data-pos-deal-slot/);
  assert.match(html,/st\.selections\[groupId\]=next/);
  assert.match(html,/componentOptionId:option\.id/);
  assert.match(html,/productVariantId:option\.productVariantId/);
  assert.match(html,/group\.allowRepeatOption/);
});


test("POS deal Burger selectors stay collapsed until Edit and summarize selected burger slots",()=>{
  const html=source[0].html;
  assert.match(html,/<details class="pos-deal-burger-picker"/);
  assert.match(html,/pos-deal-burger-summary-copy/);
  assert.match(html,/selectedNames\.join\(' \+ '\)/);
  assert.match(html,/st\.expandedBurgerGroupId/);
  assert.match(html,/st\.burgerSlots\[group\.id\]/);
  assert.match(html,/data-pos-deal-burger-select/);
  assert.match(html,/group\.allowRepeatOption/);
});

test("Website deal configurator uses a compact expandable Burger picker with slot-specific choices",async()=>{
  const configurator=readFileSync(new URL("../apps/flame-chick-website/js/catalog-v3-deal-configurator.js",import.meta.url),"utf8");
  const page=readFileSync(new URL("../apps/flame-chick-website/index.html",import.meta.url),"utf8");
  assert.match(configurator,/fc-deal-burger-picker/);
  assert.match(configurator,/burgerSlotValues/);
  assert.match(configurator,/Burger ' \+ \(slot \+ 1\)/);
  assert.match(configurator,/setOptionQuantity\(group\.id, option\.id, targetQuantity\)/);
  assert.match(configurator,/group\.allowRepeatOption/);
  assert.match(configurator,/expandedBurgerGroupId/);
  assert.match(page,/\.fc-deal-burger-picker\[open\]/);
  assert.match(page,/@media\(max-width:520px\)\{\.fc-deal-burger-slots\{grid-template-columns:1fr\}/);
});


test("POS Online Orders is strictly Delivery-only at API request and display layers",()=>{
  const html=source[0].html;
  assert.match(html,/fulfillment_type:'delivery'/);
  assert.match(html,/function isOnlineDeliveryOrder\(o\)/);
  assert.match(html,/fulfillment==='delivery'/);
  assert.match(html,/function isRecentWebsiteOrder\(o\)\{if\(!isOnlineDeliveryOrder\(o\)\)return false/);
  assert.match(html,/const orders=\[\.\.\.inboxOrders\.values\(\)\]\.filter\(isRecentWebsiteOrder\)/);
  assert.ok(html.includes('<h2>Online Orders</h2><p id="ordersMeta">Delivery orders only · Website and POS</p>'));
});

test("POS History is a primary page and not a modal that falls back to POS",()=>{
  const html=source[0].html;
  assert.match(html,/id="navHistory"/);
  assert.match(html,/let historyActiveTab='pos';/);
  assert.match(html,/let historyLoading=false;/);
  assert.match(html,/const historyServerRows=\{pos:\[\],online:\[\],all:\[\],cancelled:\[\]\};/);
  assert.match(html,/id="historyPage" class="page history-page"/);
  assert.match(html,/const isOrders=which==='orders',isHistory=which==='history'/);
  assert.match(html,/\$\('historyPage'\)\.classList\.toggle\('active',isHistory\)/);
  assert.match(html,/\$\('navHistory'\)\.classList\.toggle\('active',isHistory\)/);
  assert.match(html,/async function showHistory\(\)\{[\s\S]*showPage\('history'\);[\s\S]*await refreshHistoryData\(\);/);
  assert.match(html,/\$\('navHistory'\)\?\.addEventListener\('click',\(\)=>showHistory\(\)\)/);
  assert.match(html,/\$\('historyBtn'\)\?\.addEventListener\('click',\(\)=>showHistory\(\)\)/);
  assert.match(html,/historyBackBtn/);
  assert.doesNotMatch(html,/id="historyModal"/);
});


test("POS Takeaway remains receipt-gated and sync begins from Print & Complete",()=>{
  const html=source[0].html;
  const saveStart=html.indexOf('async function saveLocalOrder');
  const saveEnd=html.indexOf('async function reconcileLocalOrderOnServer',saveStart);
  const save=html.slice(saveStart,saveEnd);
  const takeaway=save.slice(save.indexOf('// Takeaway waits'));
  assert.match(takeaway,/await del\(STORES\.queue,order\.localOrderId\)/);
  assert.match(takeaway,/openLocalReceipt\(order,\{editable:true\}\)/);
  const finalizeStart=html.indexOf('async function finalizeReceiptOrder');
  const finalizeEnd=html.indexOf('async function printThermalReceipt',finalizeStart);
  const finalize=html.slice(finalizeStart,finalizeEnd);
  assert.match(finalize,/attachPendingPayment/);
  assert.match(finalize,/await put\(STORES\.queue,current\)/);
  assert.match(finalize,/await syncPending\(\)/);
});

test("Dine-in payment is payment-only and retains the server revision",()=>{
  const html=source[0].html;
  const start=html.indexOf('async function takePaymentAndCloseTable');
  const end=html.indexOf('async function saveLocalOrder',start);
  const handler=html.slice(start,end);
  assert.match(handler,/let order=await get\(STORES\.orders,activeDineCheckId\)/);
  assert.match(handler,/prepareLocalPosSyncOrder\(order\)/);
  assert.doesNotMatch(handler,/prepareLocalPosSyncOrder\(order,\{bumpRevision:true\}\)/);
  const finalize=html.slice(html.indexOf('async function finalizeReceiptOrder'),html.indexOf('async function printThermalReceipt'));
  assert.match(finalize,/current\.serverOrderId&&!current.checkoutPending&&!current.pendingPayment/);
  assert.match(finalize,/FlameChickPosPaymentCollection\.attachPendingPayment/);
});

test("POS prevents duplicate Dine-in table checks using Production occupancy",()=>{
  const html=source[0].html;
  assert.match(html,/remoteDineChecksByTable=new Map\(\)/);
  assert.match(html,/const serverRows=await fetchServerHistory\('POS',100\)/);
  assert.match(html,/TableID:row\.table_reference/);
  assert.match(html,/This local order and its recovery data are preserved/);
  assert.match(html,/data-edit-pos-order/);
  assert.match(html,/async function findActiveProductionDineInCheck/);
});

test("POS safely reconciles a paid server order and drains concurrent sync requests",()=>{
  const html=source[0].html;
  assert.match(html,/async function reconcileAlreadyPaidPosOrder/);
  assert.match(html,/error\?\.code!=='POS_ORDER_NO_LONGER_EDITABLE'/);
  assert.match(html,/latest\.pendingPayment\?\.requestId/);
  assert.match(html,/await del\(STORES\.queue,order\.localOrderId\)/);
  assert.match(html,/if\(syncInProgress\)\{syncRequested=true;return;\}/);
  assert.match(html,/if\(syncRequested\)\{[\s\S]*syncPendingUnifiedPosOrders\(\)/);
});


test("Dine-in Complete the Payment handler executes and persists the updated check",async()=>{
  const html=source[0].html;
  const start=html.indexOf('async function takePaymentAndCloseTable');
  const end=html.indexOf('async function saveLocalOrder',start);
  assert.ok(start>=0&&end>start,'Dine-in payment function boundaries must exist');
  const fn=html.slice(start,end);
  const writes=[];
  let opened=null,prepareOptions=null;
  const stored={
    localOrderId:'LOCAL-DINE-1',syncOrderId:'99000000-0000-4000-8000-000000000001',
    localRevision:8,fulfillmentType:'Dine-in',tableId:'T1',tableNumber:'Table 1',
    total:599,discount:0,items:[{itemName:'QA Burger',price:599,quantity:1}]
  };
  const elements={
    paymentMethod:{value:'Card'},customerName:{value:'Walk-in'},phone:{value:''},notes:{value:''}
  };
  const context={
    activeDineCheckId:'LOCAL-DINE-1',selectedTableId:'T1',cart:[{itemName:'QA Burger',price:599,quantity:1}],
    STORES:{orders:'orders',queue:'queue'},
    get:async(store,id)=>store==='orders'&&id==='LOCAL-DINE-1'?{...stored}:null,
    put:async(store,order)=>writes.push({store,order:{...order}}),
    findTable:()=>({id:'T1',name:'Table 1'}),
    $:id=>elements[id],
    prepareLocalPosSyncOrder:(order,options)=>{prepareOptions=options;return {...order,syncOrderId:stored.syncOrderId,localRevision:stored.localRevision};},
    renderCart:()=>{},
    openLocalReceipt:(order,options)=>{opened={order,options};},
    window:{editingLocalOrderId:''},
    receiptEditContext:null,
    JSON,Date,Math,Number,String,Array,Object,console,
  };
  const vmContext=vm.createContext(context);
  new vm.Script(fn+'\ntakePaymentAndCloseTable();',{filename:'takePaymentAndCloseTable.regression.js'}).runInContext(vmContext);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,2);
  assert.deepEqual(writes.map(x=>x.store),['orders','queue']);
  assert.equal(writes[0].order.localRevision,8);
  assert.equal(writes[0].order.paymentStatus,'Unpaid');
  assert.equal(writes[0].order.status,'Open');
  assert.equal(prepareOptions?.bumpRevision,undefined);
  assert.equal(opened?.options.editable,true);
  assert.equal(opened?.order.paymentStatus,'Paid');
  assert.equal(context.window.editingLocalOrderId,'LOCAL-DINE-1');
});
