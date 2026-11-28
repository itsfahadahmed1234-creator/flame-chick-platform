import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('recovered product media migration contains the exact audited metadata patch', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261127090849_flame_chick_catalog_product_media_v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /flame_chick_catalog_product_upsert_internal\(jsonb,bigint,uuid\)/);
  assert.match(sql, /image_current_path = v_image_current_path/);
  assert.match(sql, /CATALOG_PRODUCT_IMAGE_OBJECT_INVALID/);
  assert.match(sql, /CATALOG_PRODUCT_PREVIOUS_IMAGE_OBJECT_INVALID/);
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /CATALOG_PRODUCT_IMAGE_REQUIRES_EXISTING_PRODUCT/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|SCHEMA|FUNCTION)/i);
});


test('category/deal media review draft patches only the four existing audited functions', async () => {
  const sql = await readFile(new URL('../docs/drafts/2026-11-28-flame-chick-category-deal-media-v1.sql', import.meta.url), 'utf8');
  for (const signature of [
    'flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)',
    'flame_chick_catalog_draft_read_internal(text,uuid,integer)',
    'flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)',
    'flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)'
  ]) assert.ok(sql.includes(signature), 'Missing guarded function patch: ' + signature);
  assert.equal((sql.match(/EXECUTE v_definition;/g) || []).length, 4);
  assert.equal((sql.match(/v_occurrences <> 1/g) || []).length, 14);
  for (const token of [
    'image_current_path', 'image_previous_path',
    'CATALOG_CATEGORY_IMAGE_OBJECT_INVALID',
    'CATALOG_CATEGORY_PREVIOUS_IMAGE_OBJECT_INVALID',
    'DEAL_IMAGE_OBJECT_INVALID', 'DEAL_PREVIOUS_IMAGE_OBJECT_INVALID',
    "categories/' || v_id::text", "deals/' || v_id::text",
    "o.bucket_id = 'flame-chick-media'", 'storage.objects',
    'search_path=""', 'SECURITY_BASELINE_MISMATCH'
  ]) assert.ok(sql.includes(token), 'Missing media safety guard: ' + token);
  assert.match(sql, /CATALOG_CATEGORY_IMAGE_REQUIRES_EXISTING_CATEGORY/);
  assert.match(sql, /DEAL_IMAGE_REQUIRES_EXISTING_DEAL/);
  assert.match(sql, /IMAGE_PATHS_MUST_DIFFER/);
  assert.doesNotMatch(sql, /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?storage\.objects/i);
  assert.doesNotMatch(sql, /CREATE\s+POLICY|ALTER\s+POLICY|\bGRANT\b|\bREVOKE\b/i);
  assert.match(sql, /DO NOT APPLY TO PRODUCTION/);
});

test('category image read patch is scoped only to category_kind rows, not subcategories', async () => {
  const sql = await readFile(new URL('../docs/drafts/2026-11-28-flame-chick-category-deal-media-v1.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_original := \$old\$\s*'category_kind', s\.category_kind,[\s\S]*?'is_active', s\.is_active,[\s\S]*?'created_at', s\.created_at,\$old\$;\s*v_replacement := \$new\$\s*'category_kind', s\.category_kind,[\s\S]*?'image_current_path', s\.image_current_path,[\s\S]*?'image_previous_path', s\.image_previous_path,[\s\S]*?'created_at', s\.created_at,\$new\$;/);
  assert.match(sql, /CATEGORY_MEDIA_READ_JSON_ANCHOR_MISMATCH/);
});


test('applied category/deal media migration is guarded and limited to four existing functions', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261128092721_flame_chick_category_deal_media_v1.sql', import.meta.url), 'utf8');
  const signatures = [
    'app_private.flame_chick_catalog_command_internal(text,jsonb,bigint,uuid)',
    'app_private.flame_chick_catalog_draft_read_internal(text,uuid,integer)',
    'app_private.flame_chick_catalog_deal_upsert_internal(jsonb,bigint,uuid)',
    'app_private.flame_chick_catalog_deal_list_read_internal(uuid,uuid,integer)'
  ];
  for (const signature of signatures) {
    assert.ok(sql.includes("'" + signature + "'::regprocedure"), 'Migration must target the exact audited function: ' + signature);
  }
  assert.equal((sql.match(/IF v_occurrences <> 1 THEN RAISE EXCEPTION/g) || []).length, 14,
    'Every literal source replacement must have an exact-one anchor guard.');
  assert.equal((sql.match(/EXECUTE v_definition;/g) || []).length, 4,
    'Only the four guarded function definitions may be replaced.');
  assert.equal((sql.match(/SECURITY_BASELINE_MISMATCH/g) || []).length, 4,
    'Each target function must have a pre-replacement security baseline check.');
  assert.equal((sql.match(/SECURITY_POSTCONDITION_FAILED/g) || []).length, 4,
    'Each target function must retain its security baseline after replacement.');
  for (const token of [
    'search_path="',
    'SECURITY DEFINER',
    'image_current_path',
    'image_previous_path',
    'CATALOG_CATEGORY_IMAGE_OBJECT_INVALID',
    'CATALOG_CATEGORY_PREVIOUS_IMAGE_OBJECT_INVALID',
    'DEAL_IMAGE_OBJECT_INVALID',
    'DEAL_PREVIOUS_IMAGE_OBJECT_INVALID',
    "'^categories/' || v_id::text",
    "'^deals/' || v_id::text",
    "o.bucket_id = 'flame-chick-media'",
    'storage.objects',
    'CATALOG_CATEGORY_IMAGE_REQUIRES_EXISTING_CATEGORY',
    'DEAL_IMAGE_REQUIRES_EXISTING_DEAL',
    'IMAGE_PATHS_MUST_DIFFER'
  ]) assert.ok(sql.includes(token), 'Missing applied-migration safety condition: ' + token);
  assert.match(sql, /image_current_path = v_image_current_path/);
  assert.match(sql, /image_current_path=v_image_current_path/);
  assert.match(sql, /ELSE\s+v_image_current_path\s*:=\s*v_category\.image_current_path;/);
  assert.match(sql, /ELSIF v_id IS NOT NULL THEN\s+v_image_current_path\s*:=\s*v_row\.image_current_path;/);
  assert.match(sql, /'image_current_path', s\.image_current_path/);
  assert.match(sql, /'image_current_path',d\.image_current_path/);
  assert.doesNotMatch(sql, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+storage\.objects/i);
  assert.doesNotMatch(sql, /CREATE\s+POLICY|ALTER\s+POLICY|\bGRANT\b|\bREVOKE\b/i);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|SCHEMA|FUNCTION)/i);
});
