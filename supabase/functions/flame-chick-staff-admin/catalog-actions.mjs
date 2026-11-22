const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid() {
  const error = new Error("The catalog request is invalid.");
  error.name = "CatalogRequestError";
  throw error;
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function onlyKeys(value, allowed) {
  if (!isObject(value)) invalid();
  const set = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!set.has(key)) invalid();
  }
}

function uuid(value, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) invalid();
  return value;
}

function integer(value, min, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}

function pageArgs(input, maxLimit = 50, defaultLimit = 25) {
  return {
    p_after_id: uuid(input.after_id, true),
    p_limit: integer(input.limit, 1, maxLimit, defaultLimit)
  };
}

function mutationArgs(input) {
  if (!isObject(input.payload)) invalid();
  const payloadBytes = new TextEncoder().encode(JSON.stringify(input.payload)).byteLength;
  if (payloadBytes === 0 || payloadBytes > 196608) invalid();
  return {
    p_payload: input.payload,
    p_expected_revision: integer(input.expected_revision, 0, Number.MAX_SAFE_INTEGER),
    p_request_id: uuid(input.request_id)
  };
}

const MUTATION_RPCS = Object.freeze({
  catalog_category_upsert: "flame_chick_catalog_category_upsert",
  catalog_subcategory_upsert: "flame_chick_catalog_subcategory_upsert",
  catalog_product_upsert: "flame_chick_catalog_product_upsert",
  catalog_modifier_group_upsert: "flame_chick_catalog_modifier_group_upsert",
  catalog_modifier_assignment_upsert: "flame_chick_catalog_modifier_assignment_upsert",
  catalog_deal_collection_upsert: "flame_chick_catalog_deal_collection_upsert",
  catalog_deal_upsert: "flame_chick_catalog_deal_upsert",
  catalog_deal_components_upsert: "flame_chick_catalog_deal_components_upsert",
  catalog_deal_variant_options_upsert: "flame_chick_catalog_deal_variant_options_upsert",
  catalog_deal_schedule_assignment_upsert: "flame_chick_catalog_deal_schedule_assignment_upsert",
  catalog_deal_branch_availability_upsert: "flame_chick_catalog_deal_branch_availability_upsert",
  catalog_schedule_set_upsert: "flame_chick_catalog_schedule_set_upsert"
});

const READ_ACTIONS = Object.freeze({
  catalog_categories_list: {
    rpc: "flame_chick_catalog_draft_read",
    args: (input) => ({ p_entity_type: "categories", ...pageArgs(input, 100, 50) }),
    keys: ["action", "after_id", "limit"]
  },
  catalog_subcategories_list: {
    rpc: "flame_chick_catalog_draft_read",
    args: (input) => ({ p_entity_type: "subcategories", ...pageArgs(input, 100, 50) }),
    keys: ["action", "after_id", "limit"]
  },
  catalog_products_list: {
    rpc: "flame_chick_catalog_product_draft_read",
    args: (input) => pageArgs(input),
    keys: ["action", "after_id", "limit"]
  },
  catalog_modifier_groups_list: {
    rpc: "flame_chick_catalog_modifier_draft_read",
    args: (input) => pageArgs(input),
    keys: ["action", "after_id", "limit"]
  },
  catalog_modifier_assignments_read: {
    rpc: "flame_chick_catalog_modifier_assignment_draft_read",
    args: (input) => ({ p_product_id: uuid(input.product_id) }),
    keys: ["action", "product_id"]
  },
  catalog_deal_collections_list: {
    rpc: "flame_chick_catalog_deal_collection_read",
    args: (input) => pageArgs(input),
    keys: ["action", "after_id", "limit"]
  },
  catalog_deals_list: {
    rpc: "flame_chick_catalog_deal_list_read",
    args: (input) => ({
      p_collection_id: uuid(input.collection_id),
      ...pageArgs(input)
    }),
    keys: ["action", "collection_id", "after_id", "limit"]
  },
  catalog_deal_detail_read: {
    rpc: "flame_chick_catalog_deal_detail_read",
    args: (input) => ({ p_deal_id: uuid(input.deal_id) }),
    keys: ["action", "deal_id"]
  },
  catalog_schedule_sets_list: {
    rpc: "flame_chick_catalog_schedule_set_read",
    args: (input) => pageArgs(input),
    keys: ["action", "after_id", "limit"]
  },
  catalog_schedule_detail_read: {
    rpc: "flame_chick_catalog_schedule_detail_read",
    args: (input) => ({ p_schedule_set_id: uuid(input.schedule_set_id) }),
    keys: ["action", "schedule_set_id"]
  },
  catalog_publication_history: {
    rpc: "flame_chick_catalog_publication_history",
    args: (input) => ({
      p_after_number: input.after_number == null
        ? null
        : integer(input.after_number, 1, Number.MAX_SAFE_INTEGER),
      p_limit: integer(input.limit, 1, 50, 20)
    }),
    keys: ["action", "after_number", "limit"]
  }
});

export function buildCatalogRpcCall(input) {
  if (!isObject(input) || typeof input.action !== "string") invalid();
  const action = input.action;

  if (Object.hasOwn(MUTATION_RPCS, action)) {
    onlyKeys(input, ["action", "payload", "expected_revision", "request_id"]);
    return { rpc: MUTATION_RPCS[action], args: mutationArgs(input), kind: "mutation" };
  }

  if (Object.hasOwn(READ_ACTIONS, action)) {
    const route = READ_ACTIONS[action];
    onlyKeys(input, route.keys);
    return { rpc: route.rpc, args: route.args(input), kind: "read" };
  }

  // Publish/rollback intentionally remain unavailable through this API until
  // the Website DTO and launch/cutover gates have been completed.
  invalid();
}

export function isCatalogAction(action) {
  return typeof action === "string" &&
    (Object.hasOwn(MUTATION_RPCS, action) || Object.hasOwn(READ_ACTIONS, action));
}
