import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import importer from '../apps/flame-chick-admin/catalog-v3-importer.js';
import contract from '../apps/flame-chick-website/js/catalog-v3.js';
import { buildCatalogRpcCall } from '../supabase/functions/flame-chick-staff-admin/catalog-actions.mjs';
import admin from '../apps/flame-chick-admin/catalog-v3-admin.js';

const DATABASE_URL = process.env.FLAME_CHICK_QA_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const RESTAURANT_ID = 'f1111111-1111-4111-8111-111111111111';
const BRANCH_ID = 'f2222222-2222-4222-8222-222222222222';
const ADMIN_ID = 'a1111111-1111-4111-8111-111111111111';
const DRAFT_ID = 'flame-chick-published-menu-2026-11-23';
const DRAFT_PATH = fileURLToPath(new URL('../ops/catalog-drafts/flame-chick-published-menu-2026-11-23.v3-draft.json', import.meta.url));
const draft = JSON.parse(await readFile(DRAFT_PATH, 'utf8'));

function sqlQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function psql(sql) {
  return execFileSync('psql', [
    DATABASE_URL, '-X', '-A', '-t', '-q',
    '--set', 'ON_ERROR_STOP=1',
    '-c', sql
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

function psqlJson(sql) {
  const output = psql(sql);
  const lines = output.split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length, 'Postgres returned no result.');
  return JSON.parse(lines.at(-1));
}

function setupFixture() {
  const sql = `
BEGIN;
DO $setup$
DECLARE
  v_now timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug='flame-chick')
     OR EXISTS (SELECT 1 FROM public.restaurants WHERE id='${RESTAURANT_ID}')
     OR EXISTS (SELECT 1 FROM public.branches WHERE id='${BRANCH_ID}')
     OR EXISTS (SELECT 1 FROM auth.users WHERE id='${ADMIN_ID}') THEN
    RAISE EXCEPTION 'CATALOG_V3_IMPORTER_QA_FIXTURE_ID_CONFLICT';
  END IF;

  INSERT INTO public.restaurants(id,name,slug,currency_code,timezone,is_active)
  VALUES('${RESTAURANT_ID}','Flame Chick Importer QA','flame-chick','PKR','Asia/Karachi',true);

  INSERT INTO public.branches(id,restaurant_id,branch_code,name,is_active,timezone)
  VALUES('${BRANCH_ID}','${RESTAURANT_ID}','qa-main','QA Main',true,'Asia/Karachi');

  INSERT INTO auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    is_sso_user,is_anonymous
  ) VALUES(
    '${ADMIN_ID}','authenticated','authenticated',
    'qa-catalog-v3-importer@example.invalid','',v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
    v_now,v_now,false,false
  );

  INSERT INTO public.user_profiles(user_id,display_name,is_active)
  VALUES('${ADMIN_ID}','Catalog V3 Importer QA Admin',true);

  INSERT INTO public.user_roles(
    restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,
    reason,request_id,assignment_method
  ) VALUES(
    '${RESTAURANT_ID}','${ADMIN_ID}','admin',NULL,true,'${ADMIN_ID}',
    'Disposable Catalog V3 importer integration QA',
    'b1111111-1111-4111-8111-111111111111','initial_bootstrap'
  );
END
$setup$;
COMMIT;
`;
  psql(sql);
}

function sqlArg(name, value) {
  let type = 'text';
  if (name === 'p_payload') type = 'jsonb';
  else if (name.endsWith('_id')) type = 'uuid';
  else if (name === 'p_expected_revision') type = 'bigint';
  else if (name === 'p_limit') type = 'integer';

  if (value === null || value === undefined) return 'NULL::' + type;
  if (type === 'jsonb') return sqlQuote(JSON.stringify(value)) + '::jsonb';
  if (type === 'uuid') return sqlQuote(value) + '::uuid';
  if (type === 'bigint' || type === 'integer') {
    assert.ok(Number.isSafeInteger(value) && value >= 0, 'Invalid numeric RPC argument: ' + name);
    return String(value) + '::' + type;
  }
  return sqlQuote(value) + '::text';
}

let draftRevision = 0;
let readCount = 0;
let writeCount = 0;

async function request(action, payload = {}, mutation = false) {
  const input = mutation
    ? { action, payload, expected_revision: draftRevision, request_id: randomUUID() }
    : { action, ...(payload || {}) };
  const route = buildCatalogRpcCall(input);
  assert.match(route.rpc, /^[a-z][a-z0-9_]*$/, 'RPC name must come from the finite allow-list.');

  const args = Object.entries(route.args).map(([name, value]) => sqlArg(name, value));
  const statement = `SELECT public.${route.rpc}(${args.join(', ')})::text;`;
  const authenticatedSql = `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
SELECT pg_catalog.set_config('request.jwt.claim.sub','${ADMIN_ID}',true);
${statement}
COMMIT;
`;
  const result = psqlJson(authenticatedSql);
  assert.equal(result.ok, true, 'Catalog RPC failed: ' + action + ' ' + JSON.stringify(result));
  if (Number.isSafeInteger(result.draft_revision)) {
    draftRevision = Math.max(draftRevision, result.draft_revision);
  }
  if (mutation) writeCount++;
  else readCount++;
  return result;
}

function countsFromDatabase() {
  return psqlJson(`
SELECT pg_catalog.jsonb_build_object(
  'categories',(SELECT count(*) FROM public.categories WHERE restaurant_id='${RESTAURANT_ID}'),
  'products',(SELECT count(*) FROM public.products WHERE restaurant_id='${RESTAURANT_ID}'),
  'variants',(SELECT count(*) FROM public.product_variants WHERE restaurant_id='${RESTAURANT_ID}'),
  'collections',(SELECT count(*) FROM public.deal_collections WHERE restaurant_id='${RESTAURANT_ID}'),
  'deals',(SELECT count(*) FROM public.deals WHERE restaurant_id='${RESTAURANT_ID}'),
  'deal_variants',(SELECT count(*) FROM public.deal_variants WHERE restaurant_id='${RESTAURANT_ID}'),
  'component_groups',(SELECT count(*) FROM public.deal_component_groups WHERE restaurant_id='${RESTAURANT_ID}'),
  'component_options',(SELECT count(*) FROM public.deal_component_options WHERE restaurant_id='${RESTAURANT_ID}'),
  'variant_mappings',(SELECT count(*) FROM public.deal_variant_component_options WHERE restaurant_id='${RESTAURANT_ID}'),
  'schedules',(SELECT count(*) FROM public.catalog_schedule_sets WHERE restaurant_id='${RESTAURANT_ID}'),
  'schedule_windows',(SELECT count(*) FROM public.catalog_schedule_windows WHERE restaurant_id='${RESTAURANT_ID}'),
  'schedule_assignments',(SELECT count(*) FROM public.deal_schedule_assignments WHERE restaurant_id='${RESTAURANT_ID}'),
  'deal_only_null_variants',(
    SELECT count(*) FROM public.product_variants pv
    JOIN public.products p ON p.id=pv.product_id AND p.restaurant_id=pv.restaurant_id
    WHERE pv.restaurant_id='${RESTAURANT_ID}' AND pv.price IS NULL AND NOT pv.is_standalone_sellable
  ),
  'standalone_null_variants',(
    SELECT count(*) FROM public.product_variants pv
    WHERE pv.restaurant_id='${RESTAURANT_ID}' AND pv.price IS NULL AND pv.is_standalone_sellable
  ),
  'active_deals',(
    SELECT count(*) FROM public.deals WHERE restaurant_id='${RESTAURANT_ID}' AND is_active AND is_available
  ),
  'active_deal_variants',(
    SELECT count(*) FROM public.deal_variants WHERE restaurant_id='${RESTAURANT_ID}' AND is_active
  ),
  'included_surcharge_violations',(
    SELECT count(*) FROM public.deal_variant_component_options
    WHERE restaurant_id='${RESTAURANT_ID}'
      AND (pricing_treatment<>'INCLUDED' OR unit_surcharge<>0 OR NOT is_active)
  ),
  'flame_hour_assignments',(
    SELECT count(*) FROM public.deal_schedule_assignments dsa
    JOIN public.catalog_schedule_sets s ON s.id=dsa.schedule_set_id
    WHERE dsa.restaurant_id='${RESTAURANT_ID}' AND dsa.is_active
      AND dsa.branch_id IS NULL AND s.name='Flame Hour daily'
  ),
  'publication_rows',(SELECT count(*) FROM public.catalog_publications WHERE restaurant_id='${RESTAURANT_ID}'),
  'revision',(SELECT COALESCE(max(revision),0) FROM public.catalog_draft_state WHERE restaurant_id='${RESTAURANT_ID}'),
  'idempotency_rows',(SELECT count(*) FROM app_private.catalog_command_idempotency WHERE restaurant_id='${RESTAURANT_ID}')
)::text;
`);
}

function verifyDatabaseCounts(counts) {
  const expected = {
    categories:8,products:25,variants:28,collections:1,deals:6,deal_variants:6,
    component_groups:18,component_options:18,variant_mappings:18,
    schedules:1,schedule_windows:7,schedule_assignments:2,
    deal_only_null_variants:5,standalone_null_variants:0,
    active_deals:6,active_deal_variants:6,included_surcharge_violations:0,
    flame_hour_assignments:2,publication_rows:0
  };
  for (const [key,value] of Object.entries(expected)) {
    assert.equal(Number(counts[key]),value,'Unexpected database count for '+key);
  }
}

function verifyMenuSpecificMappings() {
  const result=psqlJson(`
SELECT pg_catalog.jsonb_build_object(
  'generic_burger_components',(
    SELECT count(*) FROM public.deal_component_groups g
    JOIN public.deal_component_options o ON o.component_group_id=g.id AND o.deal_id=g.deal_id AND o.restaurant_id=g.restaurant_id
    JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id
    WHERE g.restaurant_id='${RESTAURANT_ID}' AND g.name_en='Burger'
      AND p.legacy_id='${'flame-chick:'+DRAFT_ID+':product:deal_burger'}'
  ),
  'little_crunch_og_crunch_components',(
    SELECT count(*) FROM public.deal_component_groups g
    JOIN public.deal_component_options o ON o.component_group_id=g.id AND o.deal_id=g.deal_id AND o.restaurant_id=g.restaurant_id
    JOIN public.products p ON p.id=o.product_id AND p.restaurant_id=o.restaurant_id
    JOIN public.deals d ON d.id=g.deal_id AND d.restaurant_id=g.restaurant_id
    WHERE g.restaurant_id='${RESTAURANT_ID}' AND d.title='Little Crunch' AND g.name_en='OG Crunch'
      AND p.legacy_id='${'flame-chick:'+DRAFT_ID+':product:og_crunch'}'
  ),
  'flame_hour_offer_prices',(
    SELECT pg_catalog.jsonb_object_agg(d.title,dv.base_price)
    FROM public.deals d JOIN public.deal_variants dv ON dv.deal_id=d.id AND dv.restaurant_id=d.restaurant_id
    WHERE d.restaurant_id='${RESTAURANT_ID}' AND d.title LIKE 'Flame Hour — %'
  )
)::text;
`);
  assert.equal(Number(result.generic_burger_components),3,'Generic Burger must link only to the deal-only Burger product.');
  assert.equal(Number(result.little_crunch_og_crunch_components),1,'Little Crunch must link its named OG Crunch product.');
  assert.deepEqual(result.flame_hour_offer_prices,{
    'Flame Hour — The Injector + Cold Drink':699,
    'Flame Hour — Quarter Broast + Burger + Cold Drink':1599
  });
}

setupFixture();
console.log('Created disposable Flame Chick Admin actor and tenant for local catalog QA.');

const summary=importer.validatePublishedMenuDraft(draft);
assert.equal(summary.products,25);
assert.equal(summary.deals,6);

// Exercise the actual Admin workspace import button and confirmation path
// against disposable Supabase, not only the importer module in isolation.
const previousWindow=globalThis.window;
const previousFetch=globalThis.fetch;
let approveImport=false;
const confirmationMessages=[];
let first;
try {
  globalThis.window={
    FlameChickCatalogV3Importer:importer,
    confirm(message){confirmationMessages.push(message);return approveImport;}
  };
  globalThis.fetch=async(resource,options={})=>{
    assert.equal(resource,'./flame-chick-published-menu-2026-11-23.v3-draft.json');
    assert.equal(options.cache,'no-store');
    assert.equal(options.credentials,'same-origin');
    return {ok:true,json:async()=>draft};
  };

  const root={innerHTML:'',onclick:null,onchange:null,onsubmit:null};
  const workspace=admin.createWorkspace();
  await workspace.mount(root,request);
  assert.equal(typeof root.onclick,'function');
  assert.match(root.innerHTML,/Import published menu draft/);

  const importButton={dataset:{action:'import-menu'},disabled:false};
  const clickImport=()=>root.onclick({
    target:{closest(selector){assert.equal(selector,'[data-action]');return importButton;}}
  });

  // A dismissed confirmation must not send any mutation RPC.
  await clickImport();
  assert.equal(writeCount,0,'Cancelling the Admin confirmation must perform zero catalog writes.');
  assert.match(workspace.getState().notice,/cancelled/i);

  // Confirm the same Admin action and run the real importer through the
  // authenticated catalog command request handler.
  approveImport=true;
  await clickImport();
  const uiState=workspace.getState();
  first=uiState.lastImportResult;
  assert.equal(first&&first.ok,true,'The Admin workspace did not complete the catalog importer.');
  assert.equal(first.publicationPerformed,false,'Admin importer must never publish the catalog.');
  assert.equal(uiState.importProgress.phase,'complete');
  assert.match(uiState.notice,/remains unpublished/i);
  assert.equal(confirmationMessages.length,2);
  assert.match(confirmationMessages[1],/UNPUBLISHED/);
  assert.match(confirmationMessages[1],/will NOT publish the catalog/i);
  assert.match(confirmationMessages[1],/selectable \+price upgrades/i);
} finally {
  if(previousWindow===undefined) delete globalThis.window;
  else globalThis.window=previousWindow;
  if(previousFetch===undefined) delete globalThis.fetch;
  else globalThis.fetch=previousFetch;
}
verifyDatabaseCounts(countsFromDatabase());
verifyMenuSpecificMappings();
assert.ok(readCount>0);
assert.ok(writeCount>0);

// The unpublished compiler returns the deterministic catalog payload. The
// production publisher normally adds immutable publication metadata after
// computing the checksum. Build that response envelope in memory only for the
// V3 contract test; do not insert a publication or move the current pointer.
const compiledEnvelope=psqlJson(`
WITH compiled AS MATERIALIZED (
  SELECT app_private.flame_chick_catalog_compile_snapshot(
    '${RESTAURANT_ID}'::uuid,pg_catalog.transaction_timestamp()
  ) AS snapshot
)
SELECT pg_catalog.jsonb_build_object(
  'snapshot',compiled.snapshot,
  'snapshotSha256',pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(compiled.snapshot::text,'UTF8'),'sha256'),'hex'
  ),
  'draftRevision',(
    SELECT revision FROM public.catalog_draft_state
    WHERE restaurant_id='${RESTAURANT_ID}'
  )
)::text
FROM compiled;
`);
const snapshot=compiledEnvelope.snapshot;
snapshot.snapshotSha256=compiledEnvelope.snapshotSha256;
snapshot.versionId='sha256:'+compiledEnvelope.snapshotSha256;
snapshot.publicationId=randomUUID(); // QA-only envelope; no publication row is created.
snapshot.publicationNumber=1;        // QA-only envelope; no publication sequence is consumed.
snapshot.draftRevision=Number(compiledEnvelope.draftRevision);
snapshot.pricingEngineVersion='flame-chick-pricing-v1';
const snapshotResult=contract.validateSnapshot(snapshot);
assert.equal(snapshotResult.ok,true,JSON.stringify(snapshotResult.errors,null,2));
assert.equal(snapshot.products.length,25);
assert.equal(snapshot.productVariants.length,28);
assert.equal(snapshot.deals.length,6);
assert.equal(snapshot.dealVariants.length,6);
assert.equal(snapshot.dealComponentGroups.length,18);
assert.equal(snapshot.dealComponentOptions.length,18);
assert.equal(snapshot.dealVariantComponentOptions.length,18);
assert.equal(snapshot.productVariants.filter(row=>row.price===null&&!row.standaloneSellable).length,5);

const validation=psqlJson(`SELECT app_private.flame_chick_catalog_publication_validate('${RESTAURANT_ID}'::uuid)::text;`);
const errors=Array.isArray(validation.errors)?validation.errors:[];
assert.equal(validation.ok,true,'The imported unpublished draft must pass publication validation: '+JSON.stringify(errors,null,2));
assert.equal(errors.length,0,'The imported unpublished draft must have zero publication validation errors.');
for(const forbiddenCode of ['ACTIVE_VARIANT_PRICE_MISSING','DEAL_ONLY_VARIANT_NOT_MAPPED']){
  assert.equal(errors.some(item=>item&&item.code===forbiddenCode),false,'Publication validation reported '+forbiddenCode);
}

const countsBeforeResume=countsFromDatabase();
const revisionBeforeResume=draftRevision;
const writesBeforeResume=writeCount;
const second=await importer.runPublishedMenuImport(draft,{request});
assert.equal(second.ok,true);
const countsAfterResume=countsFromDatabase();
assert.deepEqual(countsAfterResume,countsBeforeResume,'A second import must not change any database row counts, revision or idempotency ledger.');
assert.equal(draftRevision,revisionBeforeResume,'A fully completed retry must not increment catalog draft revision.');
assert.equal(writeCount,writesBeforeResume,'A fully completed retry must not issue mutation RPCs.');
verifyDatabaseCounts(countsAfterResume);

console.log(JSON.stringify({
  ok:true,
  summary,
  firstRunWrites:writesBeforeResume,
  reads:readCount,
  snapshotValid:snapshotResult.ok,
  publicationValidationOk:validation.ok,
  publicationValidationErrorCount:errors.length,
  publicationPriceErrors:errors.filter(item=>item&&['ACTIVE_VARIANT_PRICE_MISSING','DEAL_ONLY_VARIANT_NOT_MAPPED'].includes(item.code)),
  secondRunMutationCount:0,
  databaseCounts:countsAfterResume
},null,2));
