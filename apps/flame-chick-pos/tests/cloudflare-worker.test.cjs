'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { X509Certificate, generateKeyPairSync, verify: verifySignature } = require('node:crypto');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'worker.mjs'), 'utf8');
const certificateBundle = fs.readFileSync(path.join(root, 'qz/digital-certificate.txt'), 'utf8');
const certificatePem = certificateBundle.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];

test('public asset build includes only the approved POS browser assets', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-cloudflare.mjs')], { cwd: root });
  const files = [];
  const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
    else files.push(relative);
  });
  walk(path.join(root, 'dist'));
  assert.deepEqual(files.sort(), [
    'assets/flame-chick-brand.svg','assets/flame-chick-receipt-mark.svg',
    'catalog-v3-adapter.js','catalog-v3-deal-view.js','catalog-v3.js',
    'index.html','payment-collection.js','qz-printing.js',
    'qz/digital-certificate.txt','sync-v3.js'
  ].sort());
  assert.equal(files.some((file) => file.startsWith('api/') || file.startsWith('tests/')), false);
});

test('public leaf certificate subject and issuer are the expected Flame Chick QZ certificates', () => {
  const cert = new X509Certificate(certificatePem);
  assert.match(cert.subject, /Flame Chick POS QZ Signing Certificate/);
  assert.match(cert.issuer, /Flame Chick QZ Signing Root CA 2026/);
  assert.equal((certificateBundle.match(/-----BEGIN CERTIFICATE-----/g) || []).length, 1);
});

test('Worker uses the exact POS signing route and current production Supabase backend', () => {
  assert.match(workerSource, /const SIGN_PATH = '\/api\/qz\/sign'/);
  assert.match(workerSource, /const CERTIFICATE_PATH = '\/qz\/digital-certificate\.txt'/);
  assert.match(workerSource, /https:\/\/adkrxfnawdiljhjaavnj\.supabase\.co/);
  assert.match(workerSource, /flame-chick-order-api\?view=staff_context/);
});

test('Worker preserves all authorized POS roles, branch validation, RSA-SHA512 and certificate verification', () => {
  ['admin', 'owner', 'manager', 'cashier'].forEach((role) => assert.ok(workerSource.includes("'" + role + "'")));
  assert.match(workerSource, /staff\.branch_id/);
  assert.match(workerSource, /RSASSA-PKCS1-v1_5/);
  assert.match(workerSource, /SHA-512/);
  assert.match(workerSource, /crypto\.subtle\.verify/);
  assert.match(workerSource, /X-QZ-Signature-Verified/);
});

test('Worker enforces strict HTTPS origins, no-store, no-sniff, bounded bodies and request throttling', () => {
  assert.match(workerSource, /url\.protocol === 'https:'/);
  assert.match(workerSource, /url\.origin === value/);
  assert.match(workerSource, /!url\.port/);
  assert.match(workerSource, /262144/);
  assert.match(workerSource, /RATE_LIMIT_PER_MINUTE = 90/);
  assert.match(workerSource, /CF-Connecting-IP/);
  assert.match(workerSource, /Cache-Control/);
  assert.match(workerSource, /X-Content-Type-Options/);
});

test('Worker keeps private signer source out of the static asset allowlist', () => {
  const buildSource = fs.readFileSync(path.join(root, 'scripts/build-cloudflare.mjs'), 'utf8');
  assert.match(buildSource, /const PUBLIC_FILES = \[/);
  assert.doesNotMatch(buildSource, /api\/qz\/sign\.js/);
  assert.doesNotMatch(buildSource, /certificate-utils\.js/);
  assert.doesNotMatch(buildSource, /tests\//);
});

test('Wrangler config deploys the isolated Worker and routes only the signer through the Worker first', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.name, 'flamechickpos');
  assert.equal(config.assets.binding, 'ASSETS');
  assert.deepEqual(config.assets.run_worker_first, ['/api/qz/sign']);
  assert.equal(config.assets.directory, './dist');
});
