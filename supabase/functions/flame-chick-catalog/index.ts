// Flame Chick public catalog API, schema v2.
// The gateway validates the browser's public apikey. The database secret is
// read only from Supabase's standard server-side Edge Function environment.
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
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
// Prefer the current Supabase secret-key map; legacy service-role env is migration fallback.
const SECRET_KEY_MAP = readKeyMap("SUPABASE_SECRET_KEYS");
const DATABASE_KEY = String(
  SECRET_KEY_MAP.default ??
  Object.values(SECRET_KEY_MAP)[0] ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  ""
);
const SCHEMA_VERSION = 2;
const RESTAURANT_SLUG = "flame-chick";

function safeJson(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function inFilter(ids: string[]): string | null {
  const clean = ids.map((x) => String(x).trim()).filter(Boolean);
  return clean.length ? `in.(${clean.join(",")})` : null;
}

async function readRows(table: string, select: string, filters: Record<string, string> = {}, order = "sort_order.asc.nullslast,id.asc"): Promise<Record<string, any>[]> {
  const url = new URL(`${PROJECT_URL}/rest/v1/${table}`);
  url.searchParams.set("select", select);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  if (order) url.searchParams.set("order", order);
  const response = await fetch(url, { method: "GET", headers: { apikey: DATABASE_KEY, Authorization: `Bearer ${DATABASE_KEY}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Catalog query failed for ${table} (${response.status}): ${detail}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Catalog query for ${table} returned an invalid shape`);
  return rows;
}

function latestTimestamp(groups: Record<string, any>[][]): string | null {
  let latest = 0;
  for (const group of groups) for (const row of group) {
    const stamp = Date.parse(String(row.updated_at ?? row.created_at ?? ""));
    if (Number.isFinite(stamp) && stamp > latest) latest = stamp;
  }
  return latest ? new Date(latest).toISOString() : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicSettings(rows: Record<string, any>[]): Record<string, unknown> {
  const allow = new Set([
    "restaurant_name", "wa_phone_display", "wa_phone", "DefaultDeliveryFee", "address",
    "footer_text_en", "footer_text_ur", "opening_hours", "delivery_hours", "website_content",
    "site_images", "deal_images", "menu_hero_banners", "logo_url", "meta_description",
    "contact_phone", "contact_address",
  ]);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.is_public !== true || !allow.has(String(row.setting_key))) continue;
    settings[String(row.setting_key)] = row.value_json;
  }
  return settings;
}

async function buildCatalog() {
  if (!PROJECT_URL || !DATABASE_KEY) throw new Error("Catalog service credentials are not configured");

  const restaurants = await readRows(
    "restaurants",
    "id,name,slug,currency_code,timezone,phone,whatsapp_phone,address,is_active,updated_at,created_at",
    { slug: `eq.${RESTAURANT_SLUG}`, is_active: "eq.true", limit: "1" },
    "created_at.asc",
  );
  const restaurant = restaurants[0];
  if (!restaurant) return { published: false as const, versionId: null, snapshot: null };
  const restaurantId = String(restaurant.id);

  const [categoryRows, productRows, groupRows, dealRows, areaRows, settingRows, drinkRows] = await Promise.all([
    readRows("categories", "id,restaurant_id,legacy_id,name_en,name_ur,sort_order,category_folder_key,image_current_path,is_active,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
    readRows("products", "id,restaurant_id,category_id,subcategory_id,legacy_id,name_en,name_ur,description_en,description_ur,image_folder_key,image_group_id,image_published,image_extension,image_current_path,featured,sort_order,is_active,is_available,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
    readRows("modifier_groups", "id,restaurant_id,legacy_id,name_en,name_ur,standalone_only,selection_mode,min_select,max_select,sort_order,is_active,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
    readRows("deals", "id,restaurant_id,category_id,legacy_id,title,title_ur,description_en,description_ur,bundle_price,image_path,featured,sort_order,is_active,is_available,metadata,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
    readRows("delivery_areas", "id,restaurant_id,legacy_id,name,delivery_fee,sort_order,is_active,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
    readRows("restaurant_settings", "setting_key,value_json,is_public,updated_at,created_at", { restaurant_id: `eq.${restaurantId}`, is_public: "eq.true" }, "setting_key.asc"),
    readRows("drink_options", "id,restaurant_id,legacy_id,product_variant_id,display_name,display_name_ur,volume_key,volume_ml,is_active,sort_order,updated_at,created_at", { restaurant_id: `eq.${restaurantId}` }),
  ]);

  const productIds = productRows.map((x) => String(x.id));
  const categoryIds = categoryRows.map((x) => String(x.id));
  const groupIds = groupRows.map((x) => String(x.id));
  const dealIds = dealRows.map((x) => String(x.id));
  const none = "in.(00000000-0000-0000-0000-000000000000)";

  const [subcategoryRows, variantRows, modifierRows, assignmentRows, componentRows] = await Promise.all([
    readRows("subcategories", "id,category_id,legacy_id,name_en,name_ur,sort_order,is_active,updated_at,created_at", { category_id: inFilter(categoryIds) ?? none }),
    readRows("product_variants", "id,product_id,legacy_id,size_key,size_label,price,sort_order,is_active,is_available,updated_at,created_at", { product_id: inFilter(productIds) ?? none }),
    readRows("modifiers", "id,modifier_group_id,legacy_id,name_en,name_ur,price_mode,fixed_price,sort_order,is_active,updated_at,created_at", { modifier_group_id: inFilter(groupIds) ?? none }),
    readRows("modifier_group_assignments", "id,modifier_group_id,product_id,legacy_id,is_active,sort_order,updated_at,created_at", { product_id: inFilter(productIds) ?? none }),
    readRows("deal_components", "id,deal_id,legacy_id,component_type,ref_type,product_id,product_variant_id,pool_subcategory_id,size_key,sort_order,quantity,price_delta,display_name,volume_key,description_phrase,description_phrase_ur,metadata,updated_at,created_at", { deal_id: inFilter(dealIds) ?? none }),
  ]);

  const modifierIds = modifierRows.map((x) => String(x.id));
  const priceRuleRows = await readRows(
    "modifier_price_rules",
    "id,legacy_id,modifier_id,size_key,price,updated_at,created_at",
    { modifier_id: inFilter(modifierIds) ?? none },
    "modifier_id.asc,size_key.asc",
  );

  const settings = publicSettings(settingRows);
  settings.restaurant_name ??= restaurant.name;
  settings.address ??= restaurant.address;
  settings.wa_phone ??= restaurant.whatsapp_phone;
  settings.currency_code = restaurant.currency_code ?? "PKR";
  settings.timezone = restaurant.timezone ?? "Asia/Karachi";

  const categories = categoryRows.map((r) => ({
    CategoryID: String(r.id), LegacyID: r.legacy_id ?? null, NameEn: r.name_en ?? "",
    NameUr: r.name_ur ?? "", SortOrder: Number(r.sort_order) || 0, Active: r.is_active === true,
    CategoryFolderKey: r.category_folder_key ?? "", ImagePath: r.image_current_path ?? "",
  }));
  const subcategories = subcategoryRows.map((r) => ({
    SubcategoryID: String(r.id), LegacyID: r.legacy_id ?? null, CategoryID: String(r.category_id),
    NameEn: r.name_en ?? "", NameUr: r.name_ur ?? "", SortOrder: Number(r.sort_order) || 0,
    Active: r.is_active === true,
  }));
  const products = productRows.map((r) => ({
    ProductID: String(r.id), LegacyID: r.legacy_id ?? null, CategoryID: String(r.category_id),
    SubcategoryID: r.subcategory_id ? String(r.subcategory_id) : null, NameEn: r.name_en ?? "",
    NameUr: r.name_ur ?? "", DescriptionEn: r.description_en ?? "", DescriptionUr: r.description_ur ?? "",
    Active: r.is_active === true, Available: r.is_available === true, Featured: r.featured === true,
    SortOrder: Number(r.sort_order) || 0, ImageFolderKey: r.image_folder_key ?? "",
    ImageGroupID: r.image_group_id ?? "", ImagePublished: r.image_published === true,
    ImageExtension: r.image_extension ?? "", ImageCurrentPath: r.image_current_path ?? "",
  }));
  const productVariants = variantRows.map((r) => ({
    VariantID: String(r.id), LegacyID: r.legacy_id ?? null, ProductID: String(r.product_id),
    SizeKey: r.size_key ?? "", SizeLabel: r.size_label ?? "", Price: Number(r.price) || 0,
    Active: r.is_active === true, Available: r.is_available === true, SortOrder: Number(r.sort_order) || 0,
  }));
  const modifierGroups = groupRows.map((r) => ({
    ModifierGroupID: String(r.id), LegacyID: r.legacy_id ?? null, NameEn: r.name_en ?? "",
    NameUr: r.name_ur ?? "", SelectionMode: Number(r.max_select) === 1 ? "SINGLE" : "MULTIPLE",
    MinSelect: Number(r.min_select) || 0, MaxSelect: Number(r.max_select) || 1,
    Active: r.is_active === true, StandaloneOnly: r.standalone_only === true,
    SortOrder: Number(r.sort_order) || 0,
  }));
  const modifiers = modifierRows.map((r) => ({
    ModifierID: String(r.id), LegacyID: r.legacy_id ?? null, ModifierGroupID: String(r.modifier_group_id),
    NameEn: r.name_en ?? "", NameUr: r.name_ur ?? "", PriceMode: String(r.price_mode ?? "FREE").toUpperCase(),
    FixedPrice: r.fixed_price === null ? null : Number(r.fixed_price), Active: r.is_active === true,
    SortOrder: Number(r.sort_order) || 0,
  }));
  const modifierPriceRules = priceRuleRows.map((r) => ({
    ModifierID: String(r.modifier_id), SizeKey: String(r.size_key), Price: Number(r.price) || 0,
  }));
  const modifierGroupAssignments = assignmentRows.map((r) => ({
    TargetType: "PRODUCT", TargetID: String(r.product_id), ModifierGroupID: String(r.modifier_group_id),
    Active: r.is_active === true, SortOrder: Number(r.sort_order) || 0, LegacyID: r.legacy_id ?? null,
  }));
  const deals = dealRows.map((r) => {
    const metadata = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
    return {
      DealID: String(r.id), LegacyID: r.legacy_id ?? null, CategoryID: String(r.category_id),
      Title: r.title ?? "", TitleUr: r.title_ur ?? "", Description: r.description_en ?? "",
      DescriptionUr: r.description_ur ?? "", BundlePrice: Number(r.bundle_price) || 0,
      ImagePath: r.image_path ?? metadata.image_current_path ?? "", Featured: r.featured === true,
      Active: r.is_active === true, available: r.is_available === true, SortOrder: Number(r.sort_order) || 0,
    };
  });
  const dealComponents = componentRows.map((r) => {
    const refType = String(r.ref_type ?? "").toUpperCase();
    const refId = refType === "FIXED_VARIANT"
      ? (r.product_variant_id ? String(r.product_variant_id) : null)
      : refType === "FIXED_PRODUCT" ? (r.product_id ? String(r.product_id) : null) : null;
    return {
      ComponentID: String(r.id), LegacyID: r.legacy_id ?? null, DealID: String(r.deal_id),
      ComponentType: r.component_type ?? "", RefType: refType, RefID: refId,
      ProductID: r.product_id ? String(r.product_id) : null,
      ProductVariantID: r.product_variant_id ? String(r.product_variant_id) : null,
      PoolSubcategoryID: r.pool_subcategory_id ? String(r.pool_subcategory_id) : null,
      SizeKey: r.size_key ?? null, Quantity: Number(r.quantity) || 1, PriceDelta: Number(r.price_delta) || 0,
      DisplayName: r.display_name ?? "", VolumeKey: r.volume_key ?? "",
      DescriptionPhrase: r.description_phrase ?? "", DescriptionPhraseUr: r.description_phrase_ur ?? "",
      SortOrder: Number(r.sort_order) || 0,
    };
  });
  const deliveryAreas = areaRows.filter((r) => r.is_active === true).map((r) => ({
    ID: String(r.id), LegacyID: r.legacy_id ?? null, AreaName: r.name ?? "",
    AreaNameUr: "", Fee: Number(r.delivery_fee) || 0, Active: r.is_active === true,
    SortOrder: Number(r.sort_order) || 0,
  }));
  const drinkOptions = drinkRows.map((r) => ({
    ID: String(r.id), LegacyID: r.legacy_id ?? null,
    ProductVariantID: r.product_variant_id ? String(r.product_variant_id) : null,
    DisplayName: r.display_name ?? "", DisplayNameUr: r.display_name_ur ?? "",
    VolumeKey: r.volume_key ?? "", VolumeMl: r.volume_ml ?? null,
    Active: r.is_active === true, SortOrder: Number(r.sort_order) || 0,
  }));

  const sourceGroups = [restaurants, categoryRows, productRows, subcategoryRows, variantRows,
    groupRows, modifierRows, priceRuleRows, assignmentRows, dealRows, componentRows, areaRows, settingRows, drinkRows];
  const publishedAt = latestTimestamp(sourceGroups) ?? new Date().toISOString();
  const snapshotBase = {
    schemaVersion: SCHEMA_VERSION, publishedAt, settings, categories, subcategories, products,
    productVariants, deals, dealComponents, modifierGroups, modifiers, modifierPriceRules,
    modifierGroupAssignments, deliveryAreas, drinkOptions,
  };
  const versionId = "sha256:" + await sha256(JSON.stringify(snapshotBase));
  const snapshot = { ...snapshotBase, versionId };
  const published = restaurant.is_active === true && products.length > 0 && productVariants.length > 0;
  return { published, versionId: published ? versionId : null, snapshot: published ? snapshot : null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET only." } }, 405);
  if (!PROJECT_URL || !DATABASE_KEY) {
    return json({ ok: false, error: { code: "CONFIG_MISSING", message: "Catalog API is not configured." } }, 503);
  }
  const action = new URL(req.url).searchParams.get("action") ?? "catalog";
  if (action !== "health" && action !== "catalog") {
    return json({ ok: false, error: { code: "ACTION_NOT_FOUND", message: "Supported actions: health, catalog." } }, 404);
  }
  try {
    const result = await buildCatalog();
    if (action === "health") {
      return json({ ok: true, data: { schemaVersion: SCHEMA_VERSION, published: result.published, versionId: result.versionId, publishedAt: result.snapshot?.publishedAt ?? null } });
    }
    if (!result.published || !result.snapshot) {
      return json({ ok: false, error: { code: "CATALOG_NOT_PUBLISHED", message: "No active Flame Chick catalog is available." } }, 404);
    }
    return json({ ok: true, data: result.snapshot });
  } catch (error) {
    console.error("flame-chick-catalog error", error);
    return json({ ok: false, error: { code: "CATALOG_READ_FAILED", message: "The Flame Chick catalog could not be loaded." } }, 500);
  }
});
