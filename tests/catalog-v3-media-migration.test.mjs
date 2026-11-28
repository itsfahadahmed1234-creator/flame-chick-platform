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
