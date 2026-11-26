'use strict';

const crypto = require('node:crypto');

const BEGIN_CERTIFICATE = '-----BEGIN CERTIFICATE-----';
const END_CERTIFICATE = '-----END CERTIFICATE-----';

function extractFirstCertificatePem(certificateBundle) {
  const bundle = String(certificateBundle || '');
  const start = bundle.indexOf(BEGIN_CERTIFICATE);
  if (start < 0) return null;

  const endStart = bundle.indexOf(END_CERTIFICATE, start + BEGIN_CERTIFICATE.length);
  if (endStart < 0) return null;

  return bundle.slice(start, endStart + END_CERTIFICATE.length);
}

function verifyQzSignature(request, signature, certificatePem) {
  const certificate = new crypto.X509Certificate(String(certificatePem || ''));
  return crypto.verify(
    'RSA-SHA512',
    Buffer.from(String(request), 'utf8'),
    certificate.publicKey,
    signature
  );
}

module.exports = {
  extractFirstCertificatePem,
  verifyQzSignature
};
