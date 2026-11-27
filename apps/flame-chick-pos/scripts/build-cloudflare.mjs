import { copyFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(appRoot, 'dist');
const PUBLIC_FILES = [
  'index.html','catalog-v3.js','catalog-v3-deal-view.js','catalog-v3-adapter.js',
  'sync-v3.js','payment-collection.js','qz-printing.js','qz/digital-certificate.txt',
  'assets/flame-chick-brand.svg','assets/flame-chick-receipt-mark.svg'
];
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
for (const relativePath of PUBLIC_FILES) {
  const sourcePath = path.join(appRoot, relativePath);
  const destinationPath = path.join(outputRoot, relativePath);
  if (!statSync(sourcePath).isFile()) throw new Error('Missing public POS asset: ' + relativePath);
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
}
console.log('Prepared ' + PUBLIC_FILES.length + ' allowlisted public POS assets.');
