import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20261122174500_flame_chick_catalog_database_time_metadata_v1.sql', import.meta.url);

test('candidate migration adds database time outside the immutable publication snapshot', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /clock_timestamp\(\) AT TIME ZONE 'UTC'/i);
  assert.match(sql, /'databaseNow', v_database_now/i);
  assert.match(sql, /extensions\.digest\(/i);
  assert.match(sql, /v_snapshot::text/i);
  assert.match(sql, /CATALOG_CURRENT_PUBLICATION_CHECKSUM_MISMATCH/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.flame_chick_catalog_public_read\(p_restaurant_slug text\)/i);
});

test('candidate migration preserves the server-only security boundary', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.flame_chick_catalog_public_read\(text\)\s+FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.flame_chick_catalog_public_read\(text\)\s+TO service_role/i);
  assert.match(sql, /CATALOG_PUBLICATION_TABLE_GRANTS_MUST_REMAIN_CLOSED/i);
  assert.match(sql, /COMMIT;/i);
});

test('candidate migration explicitly remains unapplied until separately approved', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /repository candidate only/i);
  assert.match(sql, /Do not apply to Supabase until/i);
});
