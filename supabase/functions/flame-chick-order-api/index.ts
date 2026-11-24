import "../../../apps/flame-chick-website/js/catalog-v3.js";
import "../../../apps/flame-chick-website/js/catalog-v3-deal-view.js";
import { calculateWebsiteOrder } from "../_shared/flame-chick-order-pricing.mjs";
import {
  createWebsiteOrderQuoteToken,
  verifyWebsiteOrderQuoteToken,
} from "../_shared/website-order-quote-token.mjs";

// Flame Chick order API v1.
// Guest website order creation plus authenticated staff POS status controls.
// All order writes are executed through service-role-only PostgreSQL RPCs.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function readKeyMap(name: string): Record<string, string> {
  const raw = Deno.env.get(name);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const PUBLISHABLE_KEY_MAP = readKeyMap("SUPABASE_PUBLISHABLE_KEYS");
const SECRET_KEY_MAP = readKeyMap("SUPABASE_SECRET_KEYS");
const PUBLIC_KEYS = [
  "sb_publishable_89MQIj_drF15IrF05ZLt0w_txUjPMxy",
  ...Object.values(PUBLISHABLE_KEY_MAP),
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
].map(String).filter(Boolean);
const SERVICE_KEY = String(
  SECRET_KEY_MAP.default ??
  Object.values(SECRET_KEY_MAP)[0] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  ""
);
const WEBSITE_QUOTE_SECRET = Deno.env.get("FLAME_CHICK_WEBSITE_QUOTE_HMAC_SECRET") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function response(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rpcErrorStatus(code: string, message: string): number {
  if (code === "23505" || message.startsWith("IDEMPOTENCY_KEY_REUSED")) return 409;
  if (code === "P0002" || message.startsWith("ORDER_NOT_FOUND") || message.startsWith("FLAME_CHICK_BRANCH_NOT_FOUND")) return 404;
  if (code === "42501" || message.startsWith("STAFF_AUTH_REQUIRED") || message.startsWith("STAFF_ROLE_REQUIRED")) return 403;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

function safeErrorCode(message: string): string {
  const first = String(message || "").split(":")[0].trim();
  return /^[A-Z0-9_]{3,64}$/.test(first) ? first : "ORDER_API_ERROR";
}

async function verifyStaffUser(token: string, apiKey: string): Promise<{ id: string } | null> {
  if (!token || !apiKey || !SUPABASE_URL) return null;
  const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "GET",
    headers: { apikey: apiKey, Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const user = await res.json();
  return isObject(user) && typeof user.id === "string" ? { id: user.id } : null;
}

const FLAME_CHICK_MAIN_BRANCH_ID = Deno.env.get("FLAME_CHICK_MAIN_BRANCH_ID") ?? "";

async function readAsService(path: string): Promise<{ ok: true; data: unknown } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const raw = await res.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }
  return res.ok ? { ok: true, data } : { ok: false, status: res.status, data };
}


type V3CatalogContract = {
  validateSnapshot(snapshot: unknown): { ok: boolean; code?: string; message?: string };
  isBranchOrderingEnabled(snapshot: unknown, branchId: string, fulfillmentType: string): boolean;
  minorUnits(value: unknown): number | null;
  resolveProductAvailability(snapshot: unknown, branchId: string, productId: string): boolean;
  resolveVariantAvailability(snapshot: unknown, branchId: string, productId: string, variantId: string): boolean;
};
type V3DealView = {
  buildDealViewModel(snapshot: unknown, context: Record<string, unknown>, contract: V3CatalogContract): any;
  buildProductModifierGroups(snapshot: unknown, productId: string, variantId: string, contract: V3CatalogContract, options?: Record<string, unknown>): any[];
  validateModifierSelections(groups: any[], selections: Record<string, string[]>): any;
  validateDealSelections(variant: any, selections: Record<string, Array<{componentOptionId: string; quantity: number}>>): any;
};
const V3_RUNTIME = globalThis as unknown as {
  FlameChickCatalogV3?: V3CatalogContract;
  FlameChickCatalogV3DealView?: V3DealView;
};

function websiteError(code: string, message: string, status = 400) {
  return { ok:false as const, status, body:{ok:false,error:{code,message}} };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2,"0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function normalizeCustomerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g,"");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 12) {
    digits = "92" + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith("3")) {
    digits = "92" + digits;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

async function hmacPhoneDigest(normalizedPhone: string): Promise<string | null> {
  const secret = Deno.env.get("FLAME_CHICK_ORDER_PHONE_HMAC_SECRET") ?? "";
  if (secret.length < 32) return null;
  const key = await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(normalizedPhone));
  return toHex(new Uint8Array(signed));
}

async function readPublishedV3Catalog(): Promise<
  {ok:true;snapshot:Record<string,unknown>} |
  {ok:false;status:number;body:Record<string,unknown>}
> {
  const contract = V3_RUNTIME.FlameChickCatalogV3;
  if (!SUPABASE_URL || !SERVICE_KEY || !contract) {
    return websiteError("CATALOG_RUNTIME_UNAVAILABLE","The current published menu is not available.",503);
  }
  const endpoint = new URL("/rest/v1/rpc/flame_chick_catalog_public_read",SUPABASE_URL);
  const res = await fetch(endpoint,{
    method:"POST",
    headers:{
      apikey:SERVICE_KEY,
      Authorization:"Bearer "+SERVICE_KEY,
      "Content-Type":"application/json",
      Accept:"application/json"
    },
    body:JSON.stringify({p_restaurant_slug:"flame-chick"}),
    cache:"no-store"
  });
  const raw = await res.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok || !isObject(data)) {
    return websiteError("CATALOG_READ_FAILED","The published menu could not be verified. Please try again.",503);
  }
  if (data.published !== true || !isObject(data.snapshot)) {
    return websiteError("CATALOG_UNPUBLISHED","The Flame Chick menu is not currently published.",503);
  }
  if (
    typeof data.publicationId !== "string" ||
    !Number.isSafeInteger(data.publicationNumber) ||
    data.schemaVersion !== 3 ||
    typeof data.snapshotSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(data.snapshotSha256) ||
    typeof data.databaseNow !== "string"
  ) {
    return websiteError("CATALOG_METADATA_INVALID","The published menu metadata could not be verified.",503);
  }
  const snapshot = {
    ...data.snapshot,
    versionId:"sha256:"+data.snapshotSha256,
    publicationId:data.publicationId,
    publicationNumber:data.publicationNumber,
    draftRevision:data.draftRevision,
    pricingEngineVersion:data.pricingEngineVersion,
    snapshotSha256:data.snapshotSha256,
    publishedAt:data.publishedAt,
    databaseNow:data.databaseNow
  } as Record<string,unknown>;
  const checked = contract.validateSnapshot(snapshot);
  if (!checked || checked.ok !== true) {
    return websiteError("CATALOG_INVALID","The published menu failed validation. Online ordering is temporarily unavailable.",503);
  }
  return {ok:true,snapshot};
}

async function readFlameChickRestaurant(): Promise<{id:string;currencyCode:string;timezone:string}|null> {
  const query = new URLSearchParams();
  query.set("select","id,currency_code,timezone");
  query.set("slug","eq.flame-chick");
  query.set("is_active","eq.true");
  query.set("limit","1");
  const result = await readAsService("restaurants?"+query.toString());
  if(!result.ok||!Array.isArray(result.data)||result.data.length!==1)return null;
  const row = result.data[0];
  if(!isObject(row)||typeof row.id!=="string"||typeof row.currency_code!=="string"||typeof row.timezone!=="string")return null;
  return {id:row.id,currencyCode:row.currency_code,timezone:row.timezone};
}

async function readActiveWebsiteBranches(restaurantId:string, branchId?:string): Promise<{ok:true;branches:Array<Record<string,unknown>>}|{ok:false}> {
  const query = new URLSearchParams();
  query.set("select","id,branch_code,name,is_active,website_ordering_enabled,website_delivery_enabled,website_pickup_enabled");
  query.set("restaurant_id","eq."+restaurantId);
  query.set("is_active","eq.true");
  query.set("website_ordering_enabled","eq.true");
  if(branchId)query.set("id","eq."+branchId);
  query.set("order","branch_code.asc");
  query.set("limit","20");
  const result = await readAsService("branches?"+query.toString());
  if(!result.ok||!Array.isArray(result.data))return {ok:false};
  return {ok:true,branches:result.data.filter(isObject)};
}

async function readBranchDeliveryConfiguration(
  restaurantId: string,
  branchId: string
): Promise<{ok:true;areas:Array<Record<string,unknown>>;notListedFee:number|null}|{ok:false}> {
  const query = new URLSearchParams();
  query.set("select","id,name,name_ur,delivery_fee,sort_order");
  query.set("restaurant_id","eq."+restaurantId);
  query.set("branch_id","eq."+branchId);
  query.set("is_active","eq.true");
  query.set("order","sort_order.asc,name.asc");
  query.set("limit","100");
  const areas = await readAsService("delivery_areas?"+query.toString());
  if (!areas.ok || !Array.isArray(areas.data)) return {ok:false};
  const settingsQuery = new URLSearchParams();
  settingsQuery.set("select","not_listed_delivery_fee");
  settingsQuery.set("restaurant_id","eq."+restaurantId);
  settingsQuery.set("branch_id","eq."+branchId);
  settingsQuery.set("limit","1");
  const settings = await readAsService("branch_delivery_settings?"+settingsQuery.toString());
  if (!settings.ok || !Array.isArray(settings.data)) return {ok:false};
  const rawFee = isObject(settings.data[0]) ? settings.data[0].not_listed_delivery_fee : null;
  const parsedFee = rawFee === null || rawFee === undefined ? null : Number(rawFee);
  if (parsedFee !== null && (!Number.isFinite(parsedFee) || parsedFee < 0)) return {ok:false};
  return {ok:true,areas:areas.data.filter(isObject),notListedFee:parsedFee};
}

type WebsiteOrderQuote = {
  canonical: Record<string,unknown>;
  presentation: Record<string,unknown>;
  databaseNow: string;
};

async function buildWebsiteOrderQuote(body: Record<string,unknown>): Promise<
  {ok:true;quote:WebsiteOrderQuote} |
  {ok:false;status:number;body:Record<string,unknown>}
> {
  const catalog = await readPublishedV3Catalog();
  if (!catalog.ok) return catalog;
  const snapshot = catalog.snapshot;
  const contract = V3_RUNTIME.FlameChickCatalogV3;
  const dealView = V3_RUNTIME.FlameChickCatalogV3DealView;
  if (!contract || !dealView) return websiteError("CATALOG_RUNTIME_UNAVAILABLE","The trusted menu validator is unavailable.",503);

  const publicationId = typeof body.publication_id === "string" ? body.publication_id : body.publicationId;
  const versionId = typeof body.version_id === "string" ? body.version_id : body.versionId;
  const branchId = typeof body.branch_id === "string" ? body.branch_id : body.branchId;
  const fulfillmentType = typeof body.fulfillment_type === "string" ? body.fulfillment_type : body.fulfilmentType;
  if(typeof branchId!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(branchId)){
    return websiteError("BRANCH_NOT_FOUND","Choose a valid Flame Chick branch.",400);
  }
  const restaurant = await readFlameChickRestaurant();
  if(!restaurant)return websiteError("RESTAURANT_UNAVAILABLE","Flame Chick is not accepting online orders.",503);
  const branchRead = await readActiveWebsiteBranches(restaurant.id,branchId);
  if(!branchRead.ok)return websiteError("BRANCH_CONFIGURATION_UNAVAILABLE","Branch ordering configuration could not be verified.",503);
  const branchConfiguration = branchRead.branches[0];
  if(!branchConfiguration)return websiteError("BRANCH_FULFILMENT_UNAVAILABLE","The selected branch is not accepting website orders.",409);
  const snapshotBranches = Array.isArray(snapshot.branches)?snapshot.branches:[];
  const selectedSnapshotBranch = snapshotBranches.find((row:any)=>row&&row.branchId===branchId);
  if(!selectedSnapshotBranch)return websiteError("BRANCH_NOT_FOUND","Choose a valid published Flame Chick branch.",400);
  const pricingSnapshot = {
    ...snapshot,
    branches:snapshotBranches.map((row:any)=>row&&row.branchId===branchId?{
      ...row,
      websiteOrderingEnabled:branchConfiguration.website_ordering_enabled===true,
      websiteDeliveryEnabled:branchConfiguration.website_delivery_enabled===true,
      websitePickupEnabled:branchConfiguration.website_pickup_enabled===true
    }:row)
  };

  const sourceCustomer = isObject(body.customer) ? body.customer : {};
  const customerName = typeof sourceCustomer.name === "string" ? sourceCustomer.name.trim() : "";
  const customerPhone = normalizeCustomerPhone(sourceCustomer.phone);
  const customerEmail = typeof sourceCustomer.email === "string" ? sourceCustomer.email.trim().toLowerCase() : null;
  if (!customerName || customerName.length > 160 || !customerPhone ||
      (customerEmail && (customerEmail.length>254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)))) {
    return websiteError("CUSTOMER_DETAILS_INVALID","Enter a valid customer name and phone number.");
  }

  const snapshotSettings=isObject(snapshot.settings)?snapshot.settings:{};
  if(snapshotSettings.currency_code!==restaurant.currencyCode){
    return websiteError("CATALOG_CURRENCY_MISMATCH","The published menu currency does not match the active restaurant currency.",503);
  }
  const pricingRequest = {
    schemaVersion:3,
    publicationId,
    versionId,
    branchId,
    fulfilmentType:fulfillmentType,
    customer:{name:customerName,phone:customerPhone,email:customerEmail},
    notes:typeof body.notes === "string" ? body.notes.trim() : null,
    items:body.items
  };
  const priced = calculateWebsiteOrder(pricingSnapshot,pricingRequest,{contract,dealView,databaseNow:snapshot.databaseNow});
  if (!isObject(priced)) {
    return websiteError("ORDER_QUOTE_INVALID","The selected menu items could not be validated.",400);
  }
  if (priced.ok !== true) {
    const err: Record<string,unknown> = isObject(priced.error) ? priced.error : {};
    const code = String(err.code ?? "ORDER_QUOTE_INVALID");
    const status = code === "CATALOG_PUBLICATION_CHANGED" ? 409 :
      ["BRANCH_FULFILMENT_UNAVAILABLE","PRODUCT_UNAVAILABLE","DEAL_UNAVAILABLE","DEAL_VARIANT_UNAVAILABLE"].includes(code) ? 409 : 400;
    return websiteError(code,String(err.message ?? "The selected menu items could not be validated."),status);
  }
  if (!isObject(priced.data)) {
    return websiteError("ORDER_QUOTE_INVALID","The published menu could not be priced safely.",503);
  }

  const branch = {
    branchId,
    name:String(branchConfiguration.name??selectedSnapshotBranch.name??""),
    branchCode:String(branchConfiguration.branch_code??selectedSnapshotBranch.branchCode??"")
  };
  const restaurantId = restaurant.id;

  const deliveryRaw: Record<string,unknown>|null = isObject(body.delivery) ? body.delivery : null;
  let deliveryFee = 0;
  let delivery: Record<string,unknown>|null = null;
  let publicAreas: Array<Record<string,unknown>> = [];
  let notListedDeliveryFee: number|null = null;
  if (fulfillmentType === "delivery") {
    if (!deliveryRaw) return websiteError("DELIVERY_DETAILS_REQUIRED","Enter your delivery address and choose a delivery area.");
    const config = await readBranchDeliveryConfiguration(restaurantId,branchId as string);
    if (!config.ok) return websiteError("DELIVERY_CONFIGURATION_UNAVAILABLE","Delivery areas could not be loaded for this branch.",503);
    publicAreas = config.areas;
    notListedDeliveryFee = config.notListedFee;
    const selectionType = String(deliveryRaw.selection_type ?? deliveryRaw.selectionType ?? "").trim();
    const address = typeof deliveryRaw.address === "string" ? deliveryRaw.address.trim() : "";
    const instructions = typeof deliveryRaw.instructions === "string" ? deliveryRaw.instructions.trim() : "";
    if (address.length < 5 || address.length > 1000 || instructions.length > 500) {
      return websiteError("DELIVERY_ADDRESS_INVALID","Enter a complete delivery address.");
    }
    let areaId: string|null = null;
    let areaName: string;
    let otherLocality: string|null = null;
    if (selectionType === "listed_area") {
      const candidate = typeof deliveryRaw.area_id === "string" ? deliveryRaw.area_id : deliveryRaw.areaId;
      if (typeof candidate !== "string") return websiteError("DELIVERY_AREA_REQUIRED","Choose a delivery area from this branch.");
      const area = publicAreas.find(row => row.id === candidate);
      if (!area) return websiteError("DELIVERY_AREA_UNAVAILABLE","This delivery area is not currently available.",409);
      areaId = String(area.id);
      areaName = String(area.name);
      deliveryFee = Number(area.delivery_fee);
      if (!Number.isFinite(deliveryFee) || deliveryFee < 0) return websiteError("DELIVERY_FEE_INVALID","The delivery fee is not configured correctly.",503);
    } else if (selectionType === "not_listed") {
      otherLocality = typeof deliveryRaw.other_locality === "string" ? deliveryRaw.other_locality.trim() :
        typeof deliveryRaw.otherLocality === "string" ? deliveryRaw.otherLocality.trim() : "";
      if (!otherLocality || otherLocality.length>120) return websiteError("DELIVERY_LOCALITY_REQUIRED","Enter your locality for a Not Listed delivery.");
      if (notListedDeliveryFee === null) return websiteError("DELIVERY_DEFAULT_FEE_UNCONFIGURED","Not Listed delivery is not configured. Choose a listed area.",409);
      areaName = "Not Listed / Other";
      deliveryFee = notListedDeliveryFee;
    } else {
      return websiteError("DELIVERY_AREA_SELECTION_INVALID","Choose a listed area or Not Listed / Other.");
    }
    delivery = {
      selection_type:selectionType,
      area_id:areaId,
      area_name_snapshot:areaName,
      other_locality:otherLocality,
      address,
      instructions:instructions || null
    };
  } else if (fulfillmentType === "pickup") {
    if (deliveryRaw && Object.keys(deliveryRaw).length) {
      return websiteError("PICKUP_DELIVERY_FIELDS_INVALID","Pickup orders cannot include delivery details.");
    }
  } else {
    return websiteError("FULFILMENT_INVALID","Choose Delivery or Pickup.");
  }

  const subtotal = Number(priced.data.subtotal);
  const total = subtotal + deliveryFee;
  if (!Number.isFinite(subtotal)||subtotal<0||!Number.isFinite(total)||total>9999999999.99) {
    return websiteError("ORDER_TOTAL_INVALID","The order total exceeds the supported amount.");
  }
  const canonical = {
    source:"website",
    schema_version:3,
    publication_id:snapshot.publicationId,
    catalog_publication_id:snapshot.publicationId,
    catalog_version:snapshot.publicationNumber,
    version_id:snapshot.versionId,
    branch_id:branchId,
    fulfillment_type:fulfillmentType,
    currency_code:restaurant.currencyCode,
    customer_name:customerName,
    customer_phone:customerPhone,
    customer_email:customerEmail,
    notes:typeof body.notes === "string" ? body.notes.trim() || null : null,
    subtotal,
    discount_amount:0,
    delivery_fee:deliveryFee,
    total,
    delivery,
    items:priced.data.items
  };
  const presentation = {
    publicationId:snapshot.publicationId,
    publicationNumber:snapshot.publicationNumber,
    versionId:snapshot.versionId,
    branch:{id:branchId,name:branch.name,branchCode:branch.branchCode},
    fulfillmentType,
    currencyCode:restaurant.currencyCode,
    items:priced.data.items,
    subtotal,
    deliveryFee,
    total,
    delivery,
    deliveryAreas:publicAreas.map(row=>({
      id:row.id,name:row.name,nameUr:row.name_ur??null,deliveryFee:Number(row.delivery_fee)
    })),
    notListedDeliveryFee
  };
  return {ok:true,quote:{canonical,presentation,databaseNow:String(snapshot.databaseNow)}};
}


function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (isObject(value)) return "{" + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ":" + stableJson(value[key])
  ).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

function websiteRequestFingerprint(body: Record<string,unknown>, normalizedPhone: string): Record<string,unknown> {
  const customer = isObject(body.customer) ? body.customer : {};
  return {
    schema_version:3,
    publication_id:body.publication_id ?? body.publicationId ?? null,
    version_id:body.version_id ?? body.versionId ?? null,
    branch_id:body.branch_id ?? body.branchId ?? null,
    fulfillment_type:body.fulfillment_type ?? body.fulfilmentType ?? null,
    customer:{
      name:typeof customer.name==="string" ? customer.name.trim() : "",
      phone:normalizedPhone,
      email:typeof customer.email==="string" ? customer.email.trim().toLowerCase() || null : null
    },
    notes:typeof body.notes==="string" ? body.notes.trim() || null : null,
    items:body.items,
    delivery:body.delivery ?? null
  };
}

async function lookupWebsiteOrderRetry(
  branchId: string,
  requestId: string,
  requestHash: string
): Promise<{ok:true;found:boolean;data?:Record<string,unknown>}|{ok:false;status:number;body:Record<string,unknown>}> {
  const result = await callRpc("flame_chick_get_website_order_by_idempotency",{
    branch_id:branchId,idempotency_key:requestId,request_hash:requestHash
  });
  if(!result.ok) return {ok:false,status:503,body:{ok:false,error:{code:"WEBSITE_ORDER_RETRY_LOOKUP_FAILED",message:"The existing checkout result could not be verified safely. Please retry shortly."}}};
  if(!isObject(result.data)||result.data.ok!==true){
    const error = isObject(result.data)&&isObject(result.data.error)?result.data.error:{};
    const code = String(error.code??"WEBSITE_ORDER_RETRY_LOOKUP_FAILED");
    return {ok:false,status:code==="WEBSITE_ORDER_IDEMPOTENCY_CONFLICT"?409:400,body:{ok:false,error:{code,message:String(error.message??"The checkout retry could not be verified.")}}};
  }
  return {ok:true,found:result.data.found===true,data:result.data};
}

async function buildWebsiteContext(): Promise<
  {ok:true;data:Record<string,unknown>}|{ok:false;status:number;body:Record<string,unknown>}
> {
  const catalog = await readPublishedV3Catalog();
  if(!catalog.ok)return catalog;
  const snapshot = catalog.snapshot;
  const restaurant=await readFlameChickRestaurant();
  if(!restaurant)return websiteError("RESTAURANT_UNAVAILABLE","Flame Chick is not accepting online orders.",503);
  const branchRead=await readActiveWebsiteBranches(restaurant.id);
  if(!branchRead.ok)return websiteError("BRANCH_CONFIGURATION_UNAVAILABLE","Branch ordering options could not be loaded.",503);
  const branches: Array<Record<string,unknown>> = [];
  for(const branch of branchRead.branches){
    const branchId = typeof branch.id==="string"?branch.id:"";
    if(!branchId)continue;
    const config = await readBranchDeliveryConfiguration(restaurant.id,branchId);
    if(!config.ok)return websiteError("DELIVERY_CONFIGURATION_UNAVAILABLE","Branch ordering options could not be loaded.",503);
    branches.push({
      id:branchId,
      name:typeof branch.name==="string"?branch.name:"",
      branchCode:typeof branch.branch_code==="string"?branch.branch_code:"",
      websiteDeliveryEnabled:branch.website_delivery_enabled===true,
      websitePickupEnabled:branch.website_pickup_enabled===true,
      deliveryAreas:config.areas.map(row=>({
        id:row.id,name:row.name,nameUr:row.name_ur??null,deliveryFee:Number(row.delivery_fee)
      })),
      notListedDeliveryFee:config.notListedFee
    });
  }
  const settings=isObject(snapshot.settings)?snapshot.settings:{};
  return {ok:true,data:{
    schemaVersion:3,
    publicationId:snapshot.publicationId,
    publicationNumber:snapshot.publicationNumber,
    versionId:snapshot.versionId,
    databaseNow:snapshot.databaseNow,
    currencyCode:settings.currency_code??null,
    branches
  }};
}

type StaffContext = {
  user_id: string;
  role: string;
  branch_id: string;
  restaurant_id: string;
  roles: Array<{ role: string; branch_id: string | null }>;
};

async function resolveStaffContext(userId: string): Promise<StaffContext | null> {
  if (!userId || !SUPABASE_URL || !SERVICE_KEY) return null;

  const restaurantQuery = new URLSearchParams();
  restaurantQuery.set("select", "id");
  restaurantQuery.set("slug", "eq.flame-chick");
  restaurantQuery.set("is_active", "eq.true");
  restaurantQuery.set("limit", "2");
  const restaurantResult = await readAsService("restaurants?" + restaurantQuery.toString());
  if (!restaurantResult.ok || !Array.isArray(restaurantResult.data) || restaurantResult.data.length !== 1) return null;
  const restaurant = restaurantResult.data[0];
  if (!isObject(restaurant) || typeof restaurant.id !== "string") return null;

  const roleResult = await fetch(SUPABASE_URL + "/rest/v1/rpc/flame_chick_get_staff_role_rows", {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ p_user_id: userId }),
    cache: "no-store",
  });
  if (!roleResult.ok) return null;
  const roleData: unknown = await roleResult.json().catch(() => null);
  if (!Array.isArray(roleData)) return null;
  const roleRows = roleData.filter((row): row is Record<string, unknown> =>
    isObject(row) &&
    row.restaurant_id === restaurant.id &&
    typeof row.role_key === "string" &&
    ["owner", "admin", "manager", "cashier", "rider"].includes(row.role_key) &&
    row.is_active === true &&
    (row.branch_id === null || typeof row.branch_id === "string")
  );
  if (!roleRows.length) return null;

  const branchIds = [...new Set(roleRows.map((row) => typeof row.branch_id === "string" ? row.branch_id : null).filter((id): id is string => !!id))];
  const branchQuery = new URLSearchParams();
  branchQuery.set("select", "id,branch_code,is_active");
  branchQuery.set("restaurant_id", "eq." + restaurant.id);
  branchQuery.set("is_active", "eq.true");
  branchQuery.set("order", "branch_code.asc");
  branchQuery.set("limit", "100");
  if (branchIds.length && roleRows.every((row) => row.branch_id !== null)) {
    branchQuery.set("id", "in.(" + branchIds.join(",") + ")");
  }
  const branchResult = await readAsService("branches?" + branchQuery.toString());
  if (!branchResult.ok || !Array.isArray(branchResult.data)) return null;
  const branches = branchResult.data.filter((row): row is Record<string, unknown> =>
    isObject(row) && typeof row.id === "string" && row.is_active === true
  );
  if (!branches.length) return null;

  const globalRoles = roleRows.filter((row) => row.branch_id === null);
  const branchScopedRoles = roleRows.filter((row) => typeof row.branch_id === "string");
  const validBranchRoles = branchScopedRoles.filter((row) => branches.some((branch) => branch.id === row.branch_id));
  const scopedBranchIds = [...new Set(validBranchRoles.map((row) => String(row.branch_id)))];
  const scopedRoleKeys = [...new Set(validBranchRoles.map((row) => String(row.role_key)))];
  if (globalRoles.length && (globalRoles.length !== 1 || branchScopedRoles.length > 0)) return null;
  if (!globalRoles.length && (scopedBranchIds.length !== 1 || scopedRoleKeys.length !== 1)) return null;
  const usableRoles = [...globalRoles, ...validBranchRoles];
  if (!usableRoles.length) return null;

  // This first release is single-branch. Refuse to guess if a global role would
  // need to choose between multiple active branches; branch selection is a later
  // explicit UI feature, not a silent cross-branch default.
  if (globalRoles.length && branches.length !== 1) return null;
  const priority: Record<string, number> = { owner: 1, admin: 2, manager: 3, cashier: 4, rider: 5 };
  usableRoles.sort((a, b) => (priority[String(a.role_key)] ?? 99) - (priority[String(b.role_key)] ?? 99));
  const selected = usableRoles[0];
  const branchId = typeof selected.branch_id === "string" ? selected.branch_id : String(branches[0].id);
  if (!branches.some((branch) => branch.id === branchId)) return null;

  return {
    user_id: userId,
    role: String(selected.role_key),
    branch_id: branchId,
    restaurant_id: String(restaurant.id),
    roles: usableRoles.map((row) => ({
      role: String(row.role_key),
      branch_id: typeof row.branch_id === "string" ? row.branch_id : null,
    })),
  };
}

async function verifyStaffRole(
  userId: string,
  _token: string,
  _apiKey: string,
  allowedRoles: string[],
): Promise<boolean> {
  const context = await resolveStaffContext(userId);
  return !!context && allowedRoles.includes(context.role);
}

function getClientIp(req: Request): string {
  // Best-effort secondary signal only. Do not trust X-Forwarded-For from browser clients.
  const candidate = (req.headers.get("cf-connecting-ip") ?? "").trim();
  return candidate.length <= 45 && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : "";
}

async function callRpc(name: "flame_chick_create_order" | "flame_chick_create_website_order" | "flame_chick_get_website_order_by_idempotency" | "flame_chick_update_order_status" | "flame_chick_check_website_order_rate_limit" | "flame_chick_collect_order_payment", payload: Record<string, unknown>) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_payload: payload }),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 500) }; }
  if (!res.ok) {
    const err = isObject(data) ? data : {};
    const message = String(err.message ?? err.details ?? ("Database request failed (" + res.status + ")"));
    const code = String(err.code ?? "");
    return {
      ok: false as const,
      status: rpcErrorStatus(code, message),
      body: { ok: false, error: { code: safeErrorCode(message), message: message.split(":").slice(1).join(":").trim() || "The order request could not be completed." } },
    };
  }
  return { ok: true as const, data };
}

async function readOrderBoard(board: string, limit: number, branchId: string, filters: { orderId?: string; source?: string } = {}) {
  const allowedBoards: Record<string, string[]> = {
    orders: ["new", "accepted"],
    preparing: ["preparing", "ready"],
    out_for_delivery: ["out_for_delivery"],
    active: ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered"],
    all: ["new", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "collected", "served", "completed", "rejected", "cancelled", "returned"],
  };
  const statuses = allowedBoards[board];
  if (!statuses) {
    return { ok: false as const, status: 400, body: { ok: false, error: { code: "BOARD_INVALID", message: "Choose orders, preparing, out_for_delivery, active or all." } } };
  }

  const query = new URLSearchParams();
  query.set(
    "select",
    "id,branch_id,order_number,local_order_id,source,source_reference,fulfillment_type,status,customer_name,customer_phone,customer_email,delivery_address,delivery_area_id,delivery_area_name_snapshot,delivery_area_fee_snapshot,delivery_instructions,table_id,table_number_snapshot,subtotal,discount_amount,tax_amount,service_charge,delivery_fee,tip_amount,total,paid_amount,balance_due,currency_code,payment_status,payment_method_summary,notes,internal_notes,placed_at,created_at,updated_at,accepted_at,preparing_at,ready_at,out_for_delivery_at,delivered_at,collected_at,served_at,completed_at,rejected_at,cancelled_at,rejection_reason,cancellation_reason,cashier_id,pos_device_id,register_session_id,last_status_changed_by,last_status_actor_type,last_status_change_reason,order_items(id,line_number,product_id,product_variant_id,deal_id,quantity,product_name_snapshot,variant_label_snapshot,deal_title_snapshot,unit_price_snapshot,discount_amount,tax_amount,line_total,item_notes,item_snapshot,order_item_modifiers(id,order_item_component_id,modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot),order_item_components(id,deal_component_id,component_type,selected_product_id,selected_variant_id,selected_drink_option_id,quantity,name_snapshot,variant_snapshot,volume_snapshot,unit_price_snapshot,component_snapshot,order_item_modifiers(id,modifier_group_id,modifier_id,quantity,modifier_group_name_snapshot,modifier_name_snapshot,unit_price_snapshot,total_price_snapshot,modifier_snapshot))),delivery_tasks(id,status,recipient_name_snapshot,recipient_phone_snapshot,address_snapshot,area_name_snapshot,delivery_fee_snapshot,delivery_instructions_snapshot,dispatch_started_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,failed_at,failure_reason)"
  );
  query.set("branch_id", "eq." + branchId);
  query.set("status", "in.(" + statuses.join(",") + ")");
  if (filters.orderId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.orderId)) {
      return { ok:false as const, status:400, body:{ok:false,error:{code:"ORDER_ID_INVALID",message:"A valid order id is required."}} };
    }
    query.set("id", "eq." + filters.orderId);
  }
  if (filters.source && ["website","pos","whatsapp","phone","third_party","manual","other"].includes(filters.source)) {
    query.set("source", "eq." + filters.source);
  }
  query.set("order", "created_at.desc");
  query.set("limit", String(Math.max(1, Math.min(limit, 100))));
  const result = await readAsService("orders?" + query.toString());
  if (!result.ok) {
    const err = isObject(result.data) ? result.data : {};
    const msg = String(err.message ?? ("Unable to load Flame Chick orders (" + result.status + ")."));
    return { ok:false as const, status:500, body:{ok:false,error:{code:"ORDER_READ_FAILED",message:msg}} };
  }
  return { ok:true as const, data:result.data };
}

export async function handleOrderApiRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The Flame Chick order API is not configured." } }, 503);
  }
  const apiKey = req.headers.get("apikey") ?? "";
  if (!PUBLIC_KEYS.includes(apiKey)) {
    return response({ ok: false, error: { code: "API_KEY_INVALID", message: "A valid Flame Chick publishable API key is required." } }, 401);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") ?? "").toLowerCase();
    if(view==="website_context"){
      const context=await buildWebsiteContext();
      if(!context.ok)return response(context.body,context.status);
      return response({ok:true,data:context.data});
    }
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with a Flame Chick staff account." } }, 401);
    // This authenticated self-context endpoint is also used by the Rider app;
    // it deliberately runs before POS-only order-board authorization.
    if (view === "staff_context") {
      const context = await resolveStaffContext(user.id);
      if (!context) return response({ ok: false, error: { code: "STAFF_ROLE_OR_BRANCH_REQUIRED", message: "Your account needs an active Flame Chick staff role and a single authorized branch." } }, 403);
      return response({ ok: true, staff: context });
    }
    const canReadBoard = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier"]);
    if (!canReadBoard) return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick Admin, Owner, Manager or Cashier role is required to view the order board." } }, 403);
    const context = await resolveStaffContext(user.id);
    if (!context || !["owner", "admin", "manager", "cashier"].includes(context.role)) {
      return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick POS role is required to view incoming orders." } }, 403);
    }
    const board = (url.searchParams.get("board") ?? "active").toLowerCase();
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100)) : 50;
    const orderId = (url.searchParams.get("order_id") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "").trim().toLowerCase();
    const result = await readOrderBoard(board, limit, context.branch_id, {
      ...(orderId ? {orderId} : {}),
      ...(source ? {source} : {})
    });
    if (!result.ok) return response(result.body, result.status);
    return response({ ok: true, data: result.data });
  }
  if (req.method !== "POST") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST only." } }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || PUBLIC_KEYS.length === 0) {
    return response({ ok: false, error: { code: "CONFIG_MISSING", message: "The Flame Chick order API is not configured." } }, 503);
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 128000) {
    return response({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "The order request is too large." } }, 413);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 128000) {
      return response({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "The order request is too large." } }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return response({ ok: false, error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } }, 400);
  }
  if (!isObject(body)) {
    return response({ ok: false, error: { code: "INVALID_REQUEST", message: "Request body must be a JSON object." } }, 400);
  }

  const action = String(body.action ?? "create").toLowerCase();

  if(action==="quote_website_order"){
    const quote=await buildWebsiteOrderQuote(body);
    if(!quote.ok)return response(quote.body,quote.status);
    const signed=await createWebsiteOrderQuoteToken({
      canonical:quote.quote.canonical,
      databaseNow:quote.quote.databaseNow,
      secret:WEBSITE_QUOTE_SECRET
    });
    if(!signed.ok){
      return response({ok:false,error:{
        code:signed.code,
        message:"A secure order quote could not be prepared. Online ordering is temporarily unavailable."
      }},503);
    }
    return response({
      ok:true,
      quote:quote.quote.presentation,
      quote_token:signed.token,
      quote_expires_at:signed.expiresAt
    },200);
  }

  if(action==="create_website_order"){
    const requestId=typeof body.request_id==="string"?body.request_id.trim():
      typeof body.idempotency_key==="string"?body.idempotency_key.trim():"";
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)){
      return response({ok:false,error:{code:"WEBSITE_ORDER_IDEMPOTENCY_REQUIRED",message:"A unique checkout request ID is required for safe retries."}},400);
    }
    const customer=isObject(body.customer)?body.customer:{};
    const normalizedPhone=normalizeCustomerPhone(customer.phone);
    if(!normalizedPhone){
      return response({ok:false,error:{code:"CUSTOMER_PHONE_INVALID",message:"Enter a valid customer phone number."}},400);
    }
    const branchValue=body.branch_id??body.branchId;
    if(typeof branchValue!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchValue)){
      return response({ok:false,error:{code:"WEBSITE_ORDER_BRANCH_REQUIRED",message:"Choose a valid Flame Chick branch."}},400);
    }
    const requestHash=await sha256Hex(stableJson(websiteRequestFingerprint(body,normalizedPhone)));
    const retry=await lookupWebsiteOrderRetry(branchValue,requestId,requestHash);
    if(!retry.ok)return response(retry.body,retry.status);
    if(retry.found&&retry.data){
      return response({
        ok:true,already_processed:true,
        order_id:retry.data.order_id,order_number:retry.data.order_number,
        status:retry.data.status,payment_status:retry.data.payment_status,
        subtotal:retry.data.subtotal,delivery_fee:retry.data.delivery_fee,
        total:retry.data.total,currency_code:retry.data.currency_code,
        created_at:retry.data.created_at
      },200);
    }

    const quote=await buildWebsiteOrderQuote(body);
    if(!quote.ok)return response(quote.body,quote.status);
    const quoteCheck=await verifyWebsiteOrderQuoteToken({
      token:typeof body.quote_token==="string"?body.quote_token:"",
      canonical:quote.quote.canonical,
      databaseNow:quote.quote.databaseNow,
      secret:WEBSITE_QUOTE_SECRET
    });
    if(!quoteCheck.ok){
      const status=quoteCheck.code==="WEBSITE_ORDER_QUOTE_SIGNING_UNAVAILABLE"?503:409;
      const message=quoteCheck.code==="WEBSITE_ORDER_QUOTE_EXPIRED"
        ?"Your quote expired. Request a new verified total before placing the order."
        :"The order details or delivery fee changed after the quote. Review a fresh verified total before placing the order.";
      return response({ok:false,error:{code:quoteCheck.code,message}},status);
    }
    const phoneDigest=await hmacPhoneDigest(normalizedPhone);
    if(!phoneDigest){
      return response({ok:false,error:{code:"WEBSITE_ORDER_PRIVACY_CONFIG_MISSING",message:"Online ordering is temporarily unavailable. Please try again shortly."}},503);
    }
    const payload={
      ...quote.quote.canonical,
      idempotency_key:requestId,
      request_hash:requestHash,
      phone_digest:phoneDigest
    };
    const result=await callRpc("flame_chick_create_website_order",payload);
    if(!result.ok)return response({ok:false,error:{code:"WEBSITE_ORDER_COMMIT_UNAVAILABLE",message:"Your order could not be safely confirmed. Please retry using the same checkout request."}},503);
    if(isObject(result.data)&&result.data.ok===false){
      const err=isObject(result.data.error)?result.data.error:{};
      const code=String(err.code??"WEBSITE_ORDER_CREATE_FAILED");
      const status=code==="WEBSITE_ORDER_RATE_LIMITED"?429:
        ["CATALOG_PUBLICATION_CHANGED","WEBSITE_DELIVERY_FEE_CHANGED","WEBSITE_DELIVERY_AREA_UNAVAILABLE","BRANCH_FULFILMENT_UNAVAILABLE","WEBSITE_ORDER_IDEMPOTENCY_CONFLICT"].includes(code)?409:
        ["WEBSITE_ORDER_BRANCH_UNAVAILABLE","WEBSITE_ORDER_RESTAURANT_UNAVAILABLE"].includes(code)?503:400;
      const retryAfter=code==="WEBSITE_ORDER_RATE_LIMITED"?
        Math.max(1,Math.min(3600,Number(err.retry_after_seconds)||60)):null;
      return response(
        {ok:false,error:{code,message:String(err.message??"The website order could not be created."),...(retryAfter?{retry_after_seconds:retryAfter}:{})}},
        status,
        retryAfter?{"Retry-After":String(retryAfter)}:{}
      );
    }
    if(!isObject(result.data)||result.data.ok!==true||typeof result.data.order_id!=="string"){
      return response({ok:false,error:{code:"WEBSITE_ORDER_RESPONSE_INVALID",message:"The order result could not be verified. Retry with the same checkout request ID."}},503);
    }
    return response(result.data,result.data.already_processed===true?200:201);
  }

  if (action === "create") {
    const sourceType = String(body.source ?? "website").toLowerCase();
    if (!["website", "pos", "whatsapp", "phone", "third_party", "manual", "other"].includes(sourceType)) {
      return response({ ok: false, error: { code: "INVALID_SOURCE", message: "Unsupported order source." } }, 400);
    }

    let actorId: string | null = null;
    if (sourceType !== "website") {
      const authorization = req.headers.get("authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      const user = await verifyStaffUser(token, apiKey);
      if (!user) {
        return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an Flame Chick staff account to create POS or phone orders." } }, 401);
      }
      const canCreateOrder = await verifyStaffRole(user.id, token, apiKey, ["owner", "admin", "manager", "cashier"]);
      if (!canCreateOrder) {
        return response({ ok: false, error: { code: "STAFF_ROLE_REQUIRED", message: "An active Flame Chick cashier, manager, admin or owner role is required to create staff orders." } }, 403);
      }
      actorId = user.id;
    }

    if(sourceType==="website"){
      return response({ok:false,error:{code:"WEBSITE_V3_CHECKOUT_REQUIRED",message:"Website orders must use the validated V3 quote and checkout flow."}},410);
    }

    const orderPayload: Record<string, unknown> = { ...body, source: sourceType, actor_user_id: actorId };
    delete orderPayload.action;
    const result = await callRpc("flame_chick_create_order", orderPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 201);
  }

  if (action === "collect_payment") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) {
      return response({ ok:false, error:{ code:"STAFF_AUTH_REQUIRED", message:"Sign in with a Flame Chick staff account to collect payment." } },401);
    }
    const canCollect = await verifyStaffRole(user.id, token, apiKey, ["owner","admin","manager","cashier"]);
    if (!canCollect) {
      return response({ ok:false, error:{ code:"PAYMENT_STAFF_REQUIRED", message:"An active Cashier, Manager, Admin or Owner role is required to collect payment." } },403);
    }
    const requestId = typeof body.request_id === "string"
      ? body.request_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return response({ ok:false, error:{ code:"PAYMENT_REQUEST_ID_REQUIRED", message:"A valid unique payment request ID is required for safe retries." } },400);
    }
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return response({ ok:false, error:{ code:"PAYMENT_AMOUNT_INVALID", message:"Enter a valid payment amount greater than zero." } },400);
    }
    const paymentMethod = String(body.payment_method ?? "").trim().toLowerCase();
    if (!["cash","card","bank","wallet","other"].includes(paymentMethod)) {
      return response({ ok:false, error:{ code:"PAYMENT_METHOD_INVALID", message:"Choose cash, card, bank, wallet or other." } },400);
    }
    const result = await callRpc("flame_chick_collect_order_payment", {
      order_id: body.order_id,
      actor_user_id: user.id,
      request_id: requestId,
      amount: body.amount,
      payment_method: paymentMethod,
    });
    if (!result.ok) return response(result.body, result.status);
    if (isObject(result.data) && result.data.ok === false) {
      const err = isObject(result.data.error) ? result.data.error : {};
      const code = String(err.code ?? "PAYMENT_COLLECTION_FAILED");
      const status = code === "PAYMENT_ORDER_NOT_FOUND" ? 404 :
        ["PAYMENT_STAFF_REQUIRED"].includes(code) ? 403 :
        ["PAYMENT_ALREADY_SETTLED","PAYMENT_AMOUNT_EXCEEDS_BALANCE","PAYMENT_IDEMPOTENCY_CONFLICT","PAYMENT_ORDER_STATE_INVALID","PAYMENT_FINANCIAL_STATE_INVALID"].includes(code) ? 409 :
        ["PAYMENT_REQUEST_INVALID","PAYMENT_IDENTIFIERS_INVALID","PAYMENT_AMOUNT_INVALID","PAYMENT_METHOD_INVALID"].includes(code) ? 400 : 500;
      return response({ ok:false, error:{ code, message:String(err.message ?? "Payment collection could not be completed.") } },status);
    }
    return response(result.data,200);
  }

  if (action === "update_status" || action === "cancel" || action === "reject") {
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const user = await verifyStaffUser(token, apiKey);
    if (!user) {
      return response({ ok: false, error: { code: "STAFF_AUTH_REQUIRED", message: "Sign in with an Flame Chick staff account to update order statuses." } }, 401);
    }
    // flame_chick_update_order_status checks the verified actor's active role and the
    // order's branch inside the row-locked database transaction. Avoid a second
    // user_roles REST query here; actor_user_id is derived from Auth, never the
    // client-supplied request body.
    const toStatus = action === "cancel" ? "cancelled" : action === "reject" ? "rejected" : String(body.to_status ?? "").toLowerCase();
    const statusPayload = {
      order_id: body.order_id,
      to_status: toStatus,
      reason: body.reason ?? null,
      actor_user_id: user.id,
    };
    const result = await callRpc("flame_chick_update_order_status", statusPayload);
    if (!result.ok) return response(result.body, result.status);
    return response(result.data, 200);
  }

  return response({ ok: false, error: { code: "ACTION_NOT_FOUND", message: "Supported actions are website_context (GET), quote_website_order, create_website_order, collect_payment, update_status, cancel and reject." } }, 404);
}

if (import.meta.main) {
  Deno.serve(handleOrderApiRequest);
}
