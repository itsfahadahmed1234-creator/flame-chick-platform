import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pairs = [
  ['apps/flame-chick-website/js/catalog-v3.js','supabase/functions/flame-chick-order-api/catalog-v3.js'],
  ['apps/flame-chick-website/js/catalog-v3-deal-view.js','supabase/functions/flame-chick-order-api/catalog-v3-deal-view.js'],
  ['supabase/functions/_shared/flame-chick-order-pricing.mjs','supabase/functions/flame-chick-order-api/flame-chick-order-pricing.mjs'],
  ['supabase/functions/_shared/website-order-quote-token.mjs','supabase/functions/flame-chick-order-api/website-order-quote-token.mjs']
];

test('Order API deployment bundle is byte-for-byte aligned with canonical shared modules',()=>{
  for(const [canonical,bundled] of pairs){
    assert.equal(readFileSync(bundled,'utf8'),readFileSync(canonical,'utf8'),bundled+' drifted from '+canonical);
  }
});

test('Order API uses only self-contained local imports for deployment',()=>{
  const source=readFileSync('supabase/functions/flame-chick-order-api/index.ts','utf8');
  assert.match(source,/import "\.\/catalog-v3\.js"/);
  assert.match(source,/import "\.\/catalog-v3-deal-view\.js"/);
  assert.match(source,/from "\.\/flame-chick-order-pricing\.mjs"/);
  assert.match(source,/from "\.\/website-order-quote-token\.mjs"/);
  assert.doesNotMatch(source,/\.\.\/_shared|\.\.\.\/apps\/flame-chick-website/);
});
