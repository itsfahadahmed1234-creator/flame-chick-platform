/* Flame Chick POS — QZ Tray raw ESC/POS bridge.
 * Browser signing uses the public certificate and the authenticated server signer.
 * The diagnostic flow is synthetic-only and aborts before a printer job is submitted.
 */
(function () {
  'use strict';

  const CERTIFICATE_URL = '/qz/digital-certificate.txt';
  const SIGN_URL = '/api/qz/sign';
  const PRINTER_ENCODING = 'CP437';
  const DIAGNOSTIC_ABORT_MESSAGE = 'Flame Chick diagnostic: intentionally rejected before printer submission.';
  let tokenProvider = function () { return ''; };
  let securityConfigured = false;
  let diagnosticState = null;

  function addDiagnosticStage(state, stage, detail) {
    if (!state) return;
    const entry = {
      timestamp: new Date().toISOString(),
      elapsedMs: Math.max(0, Date.now() - state.startedAtMs),
      stage: stage
    };
    if (detail && typeof detail === 'object') {
      Object.keys(detail).forEach(function (key) {
        entry[key] = detail[key];
      });
    }
    state.stages.push(entry);
  }

  function safeError(error) {
    const message = String(error && error.message ? error.message : error || 'Unknown error')
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
      .replace(/\s+/g, ' ')
      .slice(0, 220);
    return {
      name: String(error && error.name ? error.name : 'Error').slice(0, 60),
      message: message
    };
  }

  function addDiagnosticError(state, stage, error) {
    if (!state) return;
    const safe = safeError(error);
    state.errors.push({
      timestamp: new Date().toISOString(),
      stage: stage,
      name: safe.name,
      message: safe.message
    });
    addDiagnosticStage(state, 'error', {
      failedStage: stage,
      errorName: safe.name,
      message: safe.message
    });
  }

  function loadCertificate(resolve, reject) {
    const state = diagnosticState;
    if (state) {
      state.certificate.qzPromiseInvoked = true;
      state.certificate.status = 'loading';
      addDiagnosticStage(state, 'qz-certificate-promise-started');
    }

    fetch(CERTIFICATE_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'text/plain' }
    }).then(function (response) {
      if (state) state.certificate.httpStatus = response.status;
      if (!response.ok) {
        throw new Error('Could not load the Flame Chick QZ certificate (' + response.status + ').');
      }
      return response.text().then(function (certificateText) {
        const value = String(certificateText || '').trim();
        const pemValid = value.indexOf('-----BEGIN CERTIFICATE-----') === 0 &&
          value.slice(-'-----END CERTIFICATE-----'.length) === '-----END CERTIFICATE-----';
        if (state) {
          state.certificate.status = 'loaded';
          state.certificate.pemFormatValid = pemValid;
          state.certificate.characterCount = value.length;
          addDiagnosticStage(state, 'qz-certificate-promise-resolved', {
            httpStatus: response.status,
            pemFormatValid: pemValid,
            characterCount: value.length
          });
        }
        resolve(certificateText);
      });
    }).catch(function (error) {
      if (state) {
        state.certificate.status = 'failed';
        addDiagnosticError(state, 'qz-certificate-load', error);
      }
      reject(error);
    });
  }

  function requestSignature(toSign, onResult) {
    const token = String(tokenProvider() || '');
    if (!token) {
      return Promise.reject(new Error('Sign in to the Flame Chick POS before using QZ Tray.'));
    }

    return fetch(SIGN_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'text/plain'
      },
      body: JSON.stringify({ request: String(toSign) })
    }).then(function (response) {
      return response.text().then(function (body) {
        const signature = String(body || '').trim();
        const verificationHeader = response.headers.get('X-QZ-Signature-Verified');
        const result = {
          called: true,
          httpStatus: response.status,
          ok: response.ok,
          signatureReturned: response.ok && !!signature,
          signatureLength: response.ok && signature ? signature.length : 0,
          signatureVerifiedAgainstServedCertificate: verificationHeader === null
            ? null
            : verificationHeader.toLowerCase() === 'true'
        };
        if (typeof onResult === 'function') onResult(result);
        if (!response.ok) {
          throw new Error(body || 'The POS signing service rejected the QZ request (' + response.status + ').');
        }
        if (!signature) {
          throw new Error('The POS signing service returned an empty signature.');
        }
        return signature;
      });
    });
  }

  function configureSecurity() {
    if (securityConfigured) return;
    if (!window.qz || !qz.security) throw new Error('QZ Tray library did not load.');

    qz.security.setCertificatePromise(loadCertificate);
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise(function (toSign) {
      return function (resolve, reject) {
        const state = diagnosticState;

        if (state && state.phase === 'capture-print') {
          state.signatureCallbackReached = true;
          state.capturedToSign = String(toSign);
          state.signatureRequestCharacterLength = state.capturedToSign.length;
          addDiagnosticStage(state, 'print-signature-callback-reached', {
            toSignCharacterLength: state.signatureRequestCharacterLength
          });

          if (!String(tokenProvider() || '')) {
            state.signerHttpResult = {
              called: false,
              httpStatus: null,
              ok: false,
              signatureReturned: false,
              reason: 'No authenticated POS staff session token was available.'
            };
            addDiagnosticStage(state, 'signer-request-skipped-no-session');
            state.intentionalAbort = true;
            addDiagnosticStage(state, 'diagnostic-signature-rejected-before-qz-submit');
            reject(new Error(DIAGNOSTIC_ABORT_MESSAGE));
            return;
          }

          requestSignature(toSign, function (result) {
            state.signerHttpResult = result;
            addDiagnosticStage(state, 'signer-http-response', {
              httpStatus: result.httpStatus,
              ok: result.ok,
              signatureReturned: result.signatureReturned,
              signatureLength: result.signatureLength,
            signatureVerifiedAgainstServedCertificate: result.signatureVerifiedAgainstServedCertificate
            });
          }).then(function () {
            state.intentionalAbort = true;
            addDiagnosticStage(state, 'diagnostic-signature-rejected-before-qz-submit');
            reject(new Error(DIAGNOSTIC_ABORT_MESSAGE));
          }).catch(function (error) {
            if (!state.signerHttpResult) {
              state.signerHttpResult = {
                called: true,
                httpStatus: null,
                ok: false,
                signatureReturned: false,
                transportError: safeError(error).message
              };
            }
            addDiagnosticError(state, 'diagnostic-signer-request', error);
            state.intentionalAbort = true;
            addDiagnosticStage(state, 'diagnostic-signature-rejected-before-qz-submit');
            reject(new Error(DIAGNOSTIC_ABORT_MESSAGE));
          });
          return;
        }

        if (state && state.phase === 'connecting') {
          addDiagnosticStage(state, 'connection-signature-callback-reached');
          requestSignature(toSign, function (result) {
            state.connectionSignerHttpResult = result;
            addDiagnosticStage(state, 'connection-signer-http-response', {
              httpStatus: result.httpStatus,
              ok: result.ok,
              signatureReturned: result.signatureReturned
            });
          }).then(resolve).catch(function (error) {
            addDiagnosticError(state, 'connection-signer-request', error);
            reject(error);
          });
          return;
        }

        requestSignature(toSign).then(resolve).catch(reject);
      };
    });

    securityConfigured = true;
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wrap(value, width) {
    const text = cleanText(value);
    if (!text) return [''];
    const words = text.split(' ');
    const rows = [];
    let row = '';
    words.forEach(function (word) {
      if (!row) {
        row = word.slice(0, width);
        if (word.length > width) {
          const chunks = word.match(new RegExp('.{1,' + width + '}', 'g')) || [];
          row = chunks.pop() || '';
          rows.push.apply(rows, chunks);
        }
      } else if ((row + ' ' + word).length <= width) {
        row += ' ' + word;
      } else {
        rows.push(row);
        row = word;
      }
    });
    if (row) rows.push(row);
    return rows.length ? rows : [''];
  }

  function center(value, width) {
    const text = cleanText(value).slice(0, width);
    const left = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(left) + text;
  }

  function rightPair(label, value, width) {
    const right = cleanText(value);
    const left = cleanText(label);
    const gap = Math.max(1, width - left.length - right.length);
    if (left.length + right.length + gap <= width) return left + ' '.repeat(gap) + right;
    return wrap(left, width).concat(wrap(right, width)).join('\n');
  }

  function money(value) {
    const amount = Number(value);
    return 'Rs. ' + (Number.isFinite(amount) ? amount : 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  }

  function lineTotal(item) {
    const quantity = Math.max(1, Number(item.quantity ?? item.Quantity) || 1);
    const price = Number(item.price ?? item.Price) || 0;
    const total = Number(item.lineTotal ?? item.LineTotal ?? item['Line Total']);
    return Number.isFinite(total) && total > 0 ? total : price * quantity;
  }

  function receiptCommands(order, label) {
    const width = 48;
    const ESC = '\x1B';
    const rows = [
      ESC + '\x40',
      ESC + '\x74' + '\x00',
      ESC + '\x61' + '\x01',
      ESC + '\x45' + '\x01',
      center('FLAME CHICK', width),
      ESC + '\x45' + '\x00',
      center(label || 'Order Receipt', width),
      '',
      ESC + '\x61' + '\x00',
      '-'.repeat(width)
    ];

    const orderNumber = order.serverOrderNumber || order.OrderNumber || order.serverOrderId ||
      order.OrderID || order.localOrderId || order.LocalOrderID || 'POS Order';
    const createdAt = order.createdAt || order.DateTime || new Date().toISOString();
    const date = new Date(createdAt);
    const dateText = Number.isNaN(date.getTime()) ? cleanText(createdAt) :
      date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    [
      ['Order', orderNumber],
      ['Date', dateText],
      ['Type', order.fulfillmentType || order.FulfillmentType || 'Takeaway'],
      ['Payment', order.paymentMethod || order.PaymentMethod || 'Cash']
    ].forEach(function (pair) {
      wrap(rightPair(pair[0], pair[1], width), width).forEach(row => rows.push(row));
    });

    const customerName = order.customerName || order.CustomerName;
    const phone = order.phone || order.Phone;
    const address = order.address || order.Address;
    const area = order.area || order.Area;
    if (customerName) wrap('Customer: ' + customerName, width).forEach(row => rows.push(row));
    if (phone) wrap('Phone: ' + phone, width).forEach(row => rows.push(row));
    if (address) wrap('Address: ' + address, width).forEach(row => rows.push(row));
    if (area) wrap('Area: ' + area, width).forEach(row => rows.push(row));

    rows.push('-'.repeat(width));
    rows.push('ITEM / QTY / AMOUNT');
    rows.push('-'.repeat(width));

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) rows.push('Item details unavailable');
    items.forEach(function (item) {
      const name = item.itemName || item['Item Name'] || item.ItemName || item.name || 'Item';
      const quantity = Math.max(1, Number(item.quantity ?? item.Quantity) || 1);
      wrap(quantity + ' x ' + name, width).forEach(row => rows.push(row));
      const details = Array.isArray(item.contents) ? item.contents.join(', ') : (item.description || item.Description || '');
      if (details) wrap('  ' + details, width).forEach(row => rows.push(row));
      rows.push(rightPair('', money(lineTotal(item)), width));
    });

    rows.push('-'.repeat(width));
    const subtotal = Number(order.subtotal ?? order.Subtotal) || 0;
    const deliveryFee = Number(order.deliveryFee ?? order.DeliveryFee) || 0;
    const discount = Number(order.discount ?? order.Discount) || 0;
    const total = Number(order.total ?? order.Total) || (subtotal + deliveryFee - discount);
    [
      ['Subtotal', money(subtotal)],
      ['Delivery', money(deliveryFee)],
      ['Discount', money(discount)]
    ].forEach(pair => rows.push(rightPair(pair[0], pair[1], width)));
    rows.push(ESC + '\x45' + '\x01');
    rows.push(rightPair('TOTAL', money(total), width));
    rows.push(ESC + '\x45' + '\x00');

    const notes = order.notes || order.Notes;
    if (notes) {
      rows.push('-'.repeat(width));
      wrap('Note: ' + notes, width).forEach(row => rows.push(row));
    }
    rows.push('');
    rows.push(ESC + '\x61' + '\x01');
    rows.push('Thank you for ordering from Flame Chick');
    rows.push(ESC + '\x61' + '\x00');
    rows.push('', '', '', '');
    return rows.join('\n') + '\n';
  }

  function testCommands() {
    const ESC = '\x1B';
    const width = 48;
    return [
      ESC + '\x40',
      ESC + '\x74' + '\x00',
      ESC + '\x61' + '\x01',
      ESC + '\x45' + '\x01',
      center('FLAME CHICK', width),
      ESC + '\x45' + '\x00',
      center('QZ TRAY TEST PRINT', width),
      '',
      ESC + '\x61' + '\x00',
      'Printer: iTech 80mm (ESC/POS test)',
      'POS direct thermal print connection OK',
      '-----------------------------------------------',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789  Rs. 12345',
      '',
      '',
      '',
      ''
    ].join('\n') + '\n';
  }

  function encodeCp437Ascii(value) {
    const text = String(value == null ? '' : value);
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code > 0x7F) {
        throw new Error('Diagnostic payload contains a non-ASCII character; CP437 byte mapping cannot be verified safely.');
      }
      bytes[index] = code;
    }
    return bytes;
  }

  function formatEscPosPayload(value) {
    const text = String(value == null ? '' : value);
    const visible = [];
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 0x1B) visible.push('<ESC>');
      else if (code === 0x1D) visible.push('<GS>');
      else if (code === 0x0A) visible.push('<LF>\n');
      else if (code === 0x0D) visible.push('<CR>');
      else if (code === 0x09) visible.push('<TAB>');
      else if (code === 0x00) visible.push('<NUL>');
      else if (code < 0x20 || code === 0x7F) {
        visible.push('[0x' + code.toString(16).padStart(2, '0').toUpperCase() + ']');
      } else {
        visible.push(text.charAt(index));
      }
    }
    return visible.join('');
  }

  function getQzJavascriptLibraryVersion() {
    if (typeof document === 'undefined' || !document.getElementsByTagName) return null;
    const scripts = document.getElementsByTagName('script');
    for (let index = 0; index < scripts.length; index += 1) {
      const src = String(scripts[index].src || scripts[index].getAttribute && scripts[index].getAttribute('src') || '');
      if (src.indexOf('qz-tray') === -1) continue;
      const match = src.match(/qz-tray@([^/]+)\//i);
      return match ? match[1] : 'version-not-identifiable-from-script-url';
    }
    return null;
  }

  async function readQzTrayRuntimeVersion() {
    if (!window.qz || !qz.api || typeof qz.api.getVersion !== 'function') {
      return { status: 'unavailable-from-loaded-qz-javascript-api', value: null };
    }
    try {
      const details = await qz.api.getVersion({ details: true });
      if (typeof details === 'string') return { status: 'available', value: details };
      const value = details && typeof details === 'object'
        ? String(details.version || details.appVersion || details.name || '')
        : '';
      return { status: value ? 'available' : 'returned-no-version', value: value || null };
    } catch (error) {
      return { status: 'query-failed', error: safeError(error).message, value: null };
    }
  }

    async function verifyCertificateResource(state) {
    if (state.certificate.qzPromiseInvoked) return;
    addDiagnosticStage(state, 'certificate-resource-check-started');
    try {
      const response = await fetch(CERTIFICATE_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'text/plain' }
      });
      const certificateText = await response.text();
      const value = String(certificateText || '').trim();
      const pemValid = value.indexOf('-----BEGIN CERTIFICATE-----') === 0 &&
        value.slice(-'-----END CERTIFICATE-----'.length) === '-----END CERTIFICATE-----';
      state.certificate.resourceCheck = {
        httpStatus: response.status,
        ok: response.ok,
        pemFormatValid: pemValid,
        characterCount: value.length,
        note: 'Resource fetch only; this does not prove QZ Tray trust validation.'
      };
      addDiagnosticStage(state, 'certificate-resource-check-finished', {
        httpStatus: response.status,
        ok: response.ok,
        pemFormatValid: pemValid
      });
    } catch (error) {
      state.certificate.resourceCheck = {
        ok: false,
        error: safeError(error).message,
        note: 'Resource fetch only; this does not prove QZ Tray trust validation.'
      };
      addDiagnosticError(state, 'certificate-resource-check', error);
    }
  }

  function downloadFile(filename, blob) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      window.URL.revokeObjectURL(url);
    }, 30000);
  }

  async function downloadDiagnosticFiles(selectedPrinterName) {
    const payload = testCommands();
    const selectedPrinter = String(selectedPrinterName || '').trim();
    const state = {
      startedAtMs: Date.now(),
      browserTimestamp: new Date().toISOString(),
      previewHostname: String(window.location && window.location.hostname || ''),
      selectedPrinterName: selectedPrinter || null,
      qzJavascriptLibraryVersion: getQzJavascriptLibraryVersion(),
      qzTrayRuntimeVersion: { status: 'not-queried', value: null },
      websocket: {
        initiallyActive: null,
        connected: false,
        finallyActive: false
      },
      certificate: {
        qzPromiseInvoked: false,
        status: 'not-requested',
        httpStatus: null,
        pemFormatValid: null,
        characterCount: null,
        resourceCheck: null
      },
      signatureCallbackReached: false,
      signatureRequestCharacterLength: 0,
      signerHttpResult: null,
      connectionSignerHttpResult: null,
      payload: {
        encoding: PRINTER_ENCODING,
        stringCharacterLength: payload.length,
        byteCount: 0,
        asciiOnly: false,
        lineEnding: 'LF (0x0A)',
        qzDataShape: "raw / command / plain / data:[payload]"
      },
      diagnosticPrint: {
        attempted: false,
        diagnosticPrinterName: null,
        realSelectedPrinterUsed: false,
        signatureRejected: false,
        qzPrintPromiseResult: 'not-attempted',
        physicalPrinterTargeted: false
      },
      stages: [],
      errors: [],
      phase: 'starting',
      intentionalAbort: false,
      capturedToSign: null
    };
    diagnosticState = state;
    addDiagnosticStage(state, 'diagnostic-started', {
      syntheticReceiptOnly: true,
      physicalPrintDisabled: true
    });

    let payloadBytes = new Uint8Array(0);
    let payloadEncodingVerified = false;
    try {
      payloadBytes = encodeCp437Ascii(payload);
      payloadEncodingVerified = true;
      state.payload.byteCount = payloadBytes.length;
      state.payload.asciiOnly = true;
      addDiagnosticStage(state, 'synthetic-escpos-payload-built', {
        stringCharacterLength: payload.length,
        byteCount: payloadBytes.length,
        encoding: PRINTER_ENCODING,
        asciiSubsetMappingVerified: true
      });
    } catch (error) {
      addDiagnosticError(state, 'payload-byte-encoding', error);
    }

    try {
      if (!window.qz || !qz.websocket) throw new Error('QZ Tray JavaScript library or WebSocket API is unavailable.');
      configureSecurity();

      state.phase = 'connecting';
      state.websocket.initiallyActive = !!qz.websocket.isActive();
      addDiagnosticStage(state, 'websocket-state-checked', {
        initiallyActive: state.websocket.initiallyActive
      });

      if (state.websocket.initiallyActive && typeof qz.websocket.disconnect === 'function') {
        try {
          await qz.websocket.disconnect();
          addDiagnosticStage(state, 'existing-websocket-disconnected-for-fresh-certificate-check');
        } catch (disconnectError) {
          addDiagnosticError(state, 'websocket-disconnect-before-diagnostic', disconnectError);
        }
      }

      if (!qz.websocket.isActive()) {
        addDiagnosticStage(state, 'websocket-connect-started');
        await connect();
      }
      state.websocket.connected = !!qz.websocket.isActive();
      addDiagnosticStage(state, 'websocket-connect-finished', {
        connected: state.websocket.connected
      });
      if (!state.websocket.connected) throw new Error('QZ Tray did not report an active WebSocket connection.');
    } catch (error) {
      addDiagnosticError(state, 'websocket-connect', error);
      state.websocket.connected = !!(window.qz && qz.websocket && qz.websocket.isActive && qz.websocket.isActive());
    }

    if (state.websocket.connected && payloadEncodingVerified) {
      state.qzTrayRuntimeVersion = await readQzTrayRuntimeVersion();
      addDiagnosticStage(state, 'qz-tray-runtime-version-checked', {
        status: state.qzTrayRuntimeVersion.status,
        value: state.qzTrayRuntimeVersion.value
      });

      const diagnosticPrinterName = selectedPrinter || 'Flame Chick QZ Diagnostic (No Print)';
      state.diagnosticPrint.diagnosticPrinterName = selectedPrinter ? '[selected printer; signing is deliberately rejected]' : diagnosticPrinterName;
      state.diagnosticPrint.attempted = true;
      state.phase = 'capture-print';
      addDiagnosticStage(state, 'synthetic-qz-print-call-started', {
        encoding: PRINTER_ENCODING,
        selectedPrinterAvailable: !!selectedPrinter,
        signatureWillBeRejectedBeforeQzSubmission: true
      });

      try {
        const config = qz.configs.create(diagnosticPrinterName, { encoding: PRINTER_ENCODING });
        const printData = [{
          type: 'raw',
          format: 'command',
          flavor: 'plain',
          data: [payload]
        }];
        await qz.print(config, printData);
        state.diagnosticPrint.qzPrintPromiseResult = 'resolved';
        if (!state.signatureCallbackReached) {
          addDiagnosticError(state, 'signature-callback-not-reached', new Error('QZ print call resolved without reaching the diagnostic signature callback.'));
        } else {
          addDiagnosticError(state, 'diagnostic-safety-guard', new Error('The QZ diagnostic print call unexpectedly resolved. Review QZ security callback behaviour before any further printing.'));
        }
      } catch (error) {
        if (state.intentionalAbort) {
          state.diagnosticPrint.qzPrintPromiseResult = 'intentionally-rejected-before-qz-submit';
          state.diagnosticPrint.signatureRejected = true;
          addDiagnosticStage(state, 'qz-print-promise-rejected-by-diagnostic-guard');
        } else {
          state.diagnosticPrint.qzPrintPromiseResult = 'rejected-before-diagnostic-abort';
          addDiagnosticError(state, 'qz-print-request', error);
        }
      } finally {
        state.phase = 'finished';
      }
    } else if (!state.websocket.connected) {
      state.diagnosticPrint.qzPrintPromiseResult = 'not-attempted-websocket-not-connected';
      addDiagnosticStage(state, 'qz-print-not-attempted-websocket-not-connected');
    } else {
      state.diagnosticPrint.qzPrintPromiseResult = 'not-attempted-payload-encoding-unverified';
      addDiagnosticStage(state, 'qz-print-not-attempted-payload-encoding-unverified');
    }

    await verifyCertificateResource(state);
    state.websocket.finallyActive = !!(window.qz && qz.websocket && qz.websocket.isActive && qz.websocket.isActive());
    state.diagnosticPrint.physicalPrinterTargeted = false;
    state.diagnosticPrint.realSelectedPrinterUsed = false;
    state.finishedTimestamp = new Date().toISOString();
    state.durationMs = Math.max(0, Date.now() - state.startedAtMs);
    addDiagnosticStage(state, 'diagnostic-capture-finished', {
      signatureCallbackReached: state.signatureCallbackReached,
      signerHttpStatus: state.signerHttpResult ? state.signerHttpResult.httpStatus : null,
      signatureVerifiedAgainstServedCertificate: state.signerHttpResult ? state.signerHttpResult.signatureVerifiedAgainstServedCertificate : null,
      physicalPrinterTargeted: false
    });

    const readableText = [
      'FLAME CHICK — SYNTHETIC QZ TRAY DIAGNOSTIC',
      'Printer encoding: ' + PRINTER_ENCODING,
      'Payload characters: ' + payload.length,
      'Payload bytes: ' + payloadBytes.length,
      'Control bytes are represented visibly. Each <LF> marker is followed by its actual line break.',
      '',
      formatEscPosPayload(payload)
    ].join('\n');

    const signRequestText = state.signatureCallbackReached && state.capturedToSign !== null
      ? state.capturedToSign
      : 'NOT CAPTURED: the QZ signature callback for the synthetic print request was not reached. See flame-chick-qz-diagnostic.json for the failure stage.';

    const json = {
      schemaVersion: 1,
      browserTimestamp: state.browserTimestamp,
      finishedTimestamp: state.finishedTimestamp,
      durationMs: state.durationMs,
      previewHostname: state.previewHostname,
      selectedPrinterName: state.selectedPrinterName,
      qzJavascriptLibraryVersion: state.qzJavascriptLibraryVersion,
      qzTrayRuntimeVersion: state.qzTrayRuntimeVersion,
      websocket: state.websocket,
      certificate: state.certificate,
      signatureCallbackReached: state.signatureCallbackReached,
      signatureRequestCharacterLength: state.signatureRequestCharacterLength,
      signerHttpResult: state.signerHttpResult,
      connectionSignerHttpResult: state.connectionSignerHttpResult,
      payload: state.payload,
      diagnosticPrint: state.diagnosticPrint,
      physicalPrintSent: false,
      stages: state.stages,
      errors: state.errors
    };

    addDiagnosticStage(state, 'diagnostic-files-generated');
    json.stages = state.stages;
    json.errors = state.errors;
    json.finishedTimestamp = state.finishedTimestamp;

    try {
      downloadFile('flame-chick-qz-print-request.txt', new Blob([readableText], { type: 'text/plain;charset=utf-8' }));
      downloadFile('flame-chick-qz-print-request.bin', new Blob([payloadBytes], { type: 'application/octet-stream' }));
      downloadFile('flame-chick-qz-sign-request.txt', new Blob([signRequestText], { type: 'text/plain;charset=utf-8' }));
      downloadFile('flame-chick-qz-diagnostic.json', new Blob([JSON.stringify(json, null, 2)], { type: 'application/json;charset=utf-8' }));
    } catch (downloadError) {
      addDiagnosticError(state, 'diagnostic-file-download', downloadError);
    }

    const userMessage = state.signatureCallbackReached
      ? 'Diagnostic files downloaded. The synthetic QZ signing callback was captured and the signer result recorded; the signature was deliberately rejected before QZ submission. No real printer was targeted.'
      : 'Diagnostic files downloaded, but the synthetic QZ signing callback was not reached. The JSON identifies the last completed stage. No real printer was targeted.';

    diagnosticState = null;
    return {
      signatureCallbackReached: state.signatureCallbackReached,
      signerHttpResult: state.signerHttpResult,
      qzPrintPromiseResult: state.diagnosticPrint.qzPrintPromiseResult,
      userMessage: userMessage
    };
  }

  async function connect() {
    if (!window.qz || !qz.websocket) throw new Error('QZ Tray JavaScript library is unavailable. Refresh the POS page.');
    configureSecurity();
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    return true;
  }

  async function scanPrinters() {
    await connect();
    const found = await qz.printers.find();
    if (Array.isArray(found)) return found;
    return found ? [found] : [];
  }

  async function send(printerName, data) {
    const name = String(printerName || '').trim();
    if (!name) throw new Error('Select the installed iTech printer first.');
    await connect();
    const config = qz.configs.create(name, { encoding: PRINTER_ENCODING });
    await qz.print(config, [{
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: [data]
    }]);
    return true;
  }

  function setTokenProvider(provider) {
    tokenProvider = typeof provider === 'function' ? provider : function () { return ''; };
    configureSecurity();
  }

  window.FlameChickQZ = {
    setTokenProvider: setTokenProvider,
    connect: connect,
    scanPrinters: scanPrinters,
    printReceipt: function (order, label, printerName) {
      return send(printerName, receiptCommands(order || {}, label || 'Counter Receipt'));
    },
    testPrint: function (printerName) {
      return send(printerName, testCommands());
    },
    downloadDiagnosticFiles: downloadDiagnosticFiles,
    diagnostics: {
      buildTestPayload: testCommands,
      encodeCp437Ascii: encodeCp437Ascii,
      formatEscPosPayload: formatEscPosPayload
    }
  };
})();
