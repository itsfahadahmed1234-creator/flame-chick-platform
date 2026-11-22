import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildCatalogRpcCall, isCatalogAction } from "../supabase/functions/flame-chick-staff-admin/catalog-actions.mjs";

const requestId = "58c0c8e8-925d-48f8-a102-3a6df6c694b4";
const productId = "4582023d-62dd-4f69-a04a-6ba2c631850e";

test("catalog reads map only to the reviewed authenticated read RPCs", () => {
  const cases = [
    ["catalog_categories_list", "flame_chick_catalog_draft_read", { p_entity_type: "categories", p_after_id: null, p_limit: 50 }],
    ["catalog_subcategories_list", "flame_chick_catalog_draft_read", { p_entity_type: "subcategories", p_after_id: null, p_limit: 50 }],
    ["catalog_products_list", "flame_chick_catalog_product_draft_read", { p_after_id: null, p_limit: 25 }],
    ["catalog_modifier_groups_list", "flame_chick_catalog_modifier_draft_read", { p_after_id: null, p_limit: 25 }],
    ["catalog_modifier_assignments_read", "flame_chick_catalog_modifier_assignment_draft_read", { p_product_id: productId }],
    ["catalog_deal_collections_list", "flame_chick_catalog_deal_collection_read", { p_after_id: null, p_limit: 25 }],
    ["catalog_deals_list", "flame_chick_catalog_deal_list_read", { p_collection_id: productId, p_after_id: null, p_limit: 25 }],
    ["catalog_deal_detail_read", "flame_chick_catalog_deal_detail_read", { p_deal_id: productId }],
    ["catalog_schedule_sets_list", "flame_chick_catalog_schedule_set_read", { p_after_id: null, p_limit: 25 }],
    ["catalog_schedule_detail_read", "flame_chick_catalog_schedule_detail_read", { p_schedule_set_id: productId }],
    ["catalog_publication_history", "flame_chick_catalog_publication_history", { p_after_number: null, p_limit: 20 }]
  ];

  for (const [action, rpc, args] of cases) {
    const result = buildCatalogRpcCall({ action, ...(action === "catalog_modifier_assignments_read" ? { product_id: productId } : action === "catalog_deals_list" ? { collection_id: productId } : action === "catalog_deal_detail_read" ? { deal_id: productId } : action === "catalog_schedule_detail_read" ? { schedule_set_id: productId } : {}) });
    assert.equal(result.rpc, rpc, action);
    assert.deepEqual(result.args, args, action);
    assert.equal(result.kind, "read", action);
  }
});

test("every catalog mutation requires a revision, UUID request ID and object payload", () => {
  const actions = [
    ["catalog_category_upsert", "flame_chick_catalog_category_upsert"],
    ["catalog_subcategory_upsert", "flame_chick_catalog_subcategory_upsert"],
    ["catalog_product_upsert", "flame_chick_catalog_product_upsert"],
    ["catalog_modifier_group_upsert", "flame_chick_catalog_modifier_group_upsert"],
    ["catalog_modifier_assignment_upsert", "flame_chick_catalog_modifier_assignment_upsert"],
    ["catalog_deal_collection_upsert", "flame_chick_catalog_deal_collection_upsert"],
    ["catalog_deal_upsert", "flame_chick_catalog_deal_upsert"],
    ["catalog_deal_components_upsert", "flame_chick_catalog_deal_components_upsert"],
    ["catalog_deal_variant_options_upsert", "flame_chick_catalog_deal_variant_options_upsert"],
    ["catalog_deal_schedule_assignment_upsert", "flame_chick_catalog_deal_schedule_assignment_upsert"],
    ["catalog_deal_branch_availability_upsert", "flame_chick_catalog_deal_branch_availability_upsert"],
    ["catalog_schedule_set_upsert", "flame_chick_catalog_schedule_set_upsert"]
  ];

  for (const [action, rpc] of actions) {
    const result = buildCatalogRpcCall({
      action,
      payload: { name_en: "Test item" },
      expected_revision: 0,
      request_id: requestId
    });
    assert.equal(result.rpc, rpc, action);
    assert.equal(result.kind, "mutation", action);
    assert.deepEqual(result.args, {
      p_payload: { name_en: "Test item" },
      p_expected_revision: 0,
      p_request_id: requestId
    }, action);
  }
});

test("catalog route rejects unknown RPCs, unsupported publish/rollback and extra top-level fields", () => {
  for (const action of ["catalog_unknown", "catalog_publish", "catalog_rollback", "flame_chick_catalog_public_read"]) {
    assert.equal(isCatalogAction(action), false, action);
    assert.throws(() => buildCatalogRpcCall({ action }), /catalog request is invalid/i, action);
  }

  assert.throws(() => buildCatalogRpcCall({
    action: "catalog_product_upsert",
    payload: {},
    expected_revision: 0,
    request_id: requestId,
    rpc: "public.anything"
  }), /catalog request is invalid/i);
});

test("mutation route rejects missing/invalid idempotency and stale-revision parameters", () => {
  const base = { action: "catalog_category_upsert", payload: { name_en: "Burger" }, expected_revision: 2, request_id: requestId };
  for (const patch of [
    { request_id: undefined },
    { request_id: "not-a-uuid" },
    { expected_revision: -1 },
    { expected_revision: 1.5 },
    { expected_revision: Number.MAX_SAFE_INTEGER + 1 },
    { payload: [] },
    { payload: null }
  ]) {
    const value = { ...base, ...patch };
    assert.throws(() => buildCatalogRpcCall(value), /catalog request is invalid/i);
  }
});

test("catalog mutation payload size is capped before it reaches PostgREST", () => {
  const payload = { description_en: "x".repeat(66000) };
  assert.throws(() => buildCatalogRpcCall({
    action: "catalog_product_upsert",
    payload,
    expected_revision: 0,
    request_id: requestId
  }), /catalog request is invalid/i);
});

test("read limits and cursors are bounded and typed", () => {
  assert.deepEqual(buildCatalogRpcCall({ action: "catalog_products_list", limit: 50 }).args,
    { p_after_id: null, p_limit: 50 });
  assert.throws(() => buildCatalogRpcCall({ action: "catalog_products_list", limit: 51 }), /catalog request is invalid/i);
  assert.throws(() => buildCatalogRpcCall({ action: "catalog_products_list", after_id: "bad" }), /catalog request is invalid/i);
  assert.throws(() => buildCatalogRpcCall({ action: "catalog_publication_history", after_number: 0 }), /catalog request is invalid/i);
});

test("catalog action source uses a finite route map and user JWT, never the service secret", () => {
  const source = readFileSync("supabase/functions/flame-chick-staff-admin/index.ts", "utf8");
  const config = readFileSync("supabase/config.toml", "utf8");
  const helper = readFileSync("supabase/functions/flame-chick-staff-admin/catalog-actions.mjs", "utf8");
  assert.match(source, /buildCatalogRpcCall/);
  assert.match(source, /if\(a\.startsWith\("catalog_"\)\)return await catalogAction\(t,b\)/);
  assert.match(source, /async function catalogRpc[\s\S]*?apikey:PUBLIC_KEY,Authorization:"Bearer "\+t/);
  assert.match(config, /\[functions\.flame-chick-staff-admin\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(helper, /const MUTATION_RPCS = Object\.freeze/);
  assert.match(helper, /const READ_ACTIONS = Object\.freeze/);
  assert.doesNotMatch(helper, /service_role|SECRET_KEY|SUPABASE_SECRET/);
  assert.doesNotMatch(source.match(/async function catalogRpc[\s\S]*?\n\}/)?.[0] ?? "", /SECRET_KEY|SERVICE_ROLE/);
});
