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
