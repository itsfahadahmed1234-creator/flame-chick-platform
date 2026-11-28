/* Flame Chick POS — QZ Tray raw ESC/POS bridge.
 * Browser signing uses the public certificate and the authenticated server signer.
 * The diagnostic flow is synthetic-only and aborts before a printer job is submitted.
 */
(function () {
  'use strict';

  const CERTIFICATE_URL = '/qz/digital-certificate.txt';
  const SIGN_URL = '/api/qz/sign';
  const PRINTER_ENCODING = 'CP437';
  const RECEIPT_LOGO_URL = '/assets/flame-chick-receipt-mark.svg';
  let receiptLogoBase64Promise = null;
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

  function receiptDateText(value) {
    const date = new Date(value || new Date().toISOString());
    if (Number.isNaN(date.getTime())) return cleanText(value || '');
    const day = date.getDate();
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    return date.toLocaleDateString('en-US',{weekday:'short'})+', '+date.toLocaleDateString('en-US',{month:'long'})+' '+day+suffix+', '+
      date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).replace(/\s/g,'');
  }
  function loadReceiptLogoBase64() {
    if (receiptLogoBase64Promise) return receiptLogoBase64Promise;

    receiptLogoBase64Promise = new Promise(function (resolve) {
      try {
        if (typeof window.Image !== 'function' || typeof document === 'undefined') {
          resolve('');
          return;
        }
        const image = new window.Image();
        image.onload = function () {
          try {
            // Match the on-screen 19 mm square logo box while preserving the original mark ratio.
            const canvas = document.createElement('canvas');
            canvas.width = 132;
            canvas.height = 152;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas rendering is unavailable.');
            context.clearRect(0, 0, canvas.width, canvas.height);
            const sourceWidth = Number(image.naturalWidth || image.width) || canvas.width;
            const sourceHeight = Number(image.naturalHeight || image.height) || canvas.height;
            const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
            const width = Math.max(1, Math.round(sourceWidth * scale));
            const height = Math.max(1, Math.round(sourceHeight * scale));
            const left = Math.floor((canvas.width - width) / 2);
            const top = Math.floor((canvas.height - height) / 2);
            context.drawImage(image, left, top, width, height);
            const dataUrl = canvas.toDataURL('image/png');
            const comma = dataUrl.indexOf(',');
            const encoded = comma >= 0 ? dataUrl.slice(comma + 1) : '';
            resolve(encoded || '');
          } catch (_) {
            resolve('');
          }
        };
        image.onerror = function () { resolve(''); };
        image.decoding = 'async';
        image.src = RECEIPT_LOGO_URL;
      } catch (_) {
        resolve('');
      }
    });
    return receiptLogoBase64Promise;
  }

  function buildReceiptImageEntry(base64) {
    const encoded = String(base64 || '').trim();
    if (!encoded) return null;
    return {
      type: 'raw',
      format: 'image',
      flavor: 'base64',
      data: encoded,
      options: {
        language: 'ESCPOS',
        dotDensity: 'double'
      }
    };
  }

  function receiptCommands(order, label) {
    const width = 48;
    const ESC = '\x1B';
    const GS = '\x1D';
    const fmt = function (value) {
      return 'Rs ' + (Number(value) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
    };
    const rows = [
      ESC + '\x40',
      ESC + '\x74' + '\x00',
      ESC + '\x61' + '\x01',
      ESC + '\x45' + '\x01',
      center('FLAME CHICK', width),
      ESC + '\x45' + '\x00'
    ];

    function addField(fieldLabel, value) {
      if (value === undefined || value === null || String(value).trim() === '') return;
      wrap(fieldLabel + ': ' + value, width).forEach(function (row) { rows.push(row); });
    }

    function itemPriceRows(itemLabel, amount) {
      const right = cleanText(amount);
      const available = Math.max(1, width - right.length - 1);
      const leftRows = wrap(itemLabel, available);
      const out = leftRows.slice(0, -1);
      const last = leftRows[leftRows.length - 1] || '';
      out.push(last + ' '.repeat(Math.max(1, width - last.length - right.length)) + right);
      return out;
    }

    [
      'Flame Chick, Main Kamra Road Opposite to Zellbury, Attock',
      'Phone: +923358044164'
    ].forEach(function (value) {
      wrap(value, width).forEach(function (row) { rows.push(row); });
    });

    rows.push(
      '',
      ESC + '\x45' + '\x01',
      center('*** ORIGINAL BILL ***', width),
      ESC + '\x45' + '\x00'
    );

    const id = order.serverOrderNumber || order.OrderNumber || order.invoiceNumber ||
      order.InvoiceNumber || order.serverOrderId || order.OrderID || order.localOrderId || 'POS Order';
    rows.push(center('Invoice #' + id, width));

    const fulfillment = String(order.fulfillmentType || order.FulfillmentType || 'Takeaway').toLowerCase();
    const isDelivery = fulfillment.indexOf('delivery') >= 0;
    const isDineIn = fulfillment.indexOf('dine') >= 0;
    rows.push(
      ESC + '\x45' + '\x01',
      center(isDineIn ? 'DINE-IN' : (isDelivery ? 'DELIVERY' : 'TAKEAWAY'), width),
      ESC + '\x45' + '\x00',
      '',
      ESC + '\x61' + '\x00'
    );

    const metadata = [
      ['Placed', receiptDateText(order.createdAt || order.DateTime)],
      ['Cashier', order.cashierName || order.CashierName || '']
    ];
    if (isDineIn) {
      metadata.push(['Guests Served', order.guestsServed ?? order.GuestsServed ?? '']);
      metadata.push(['Table', order.tableNumber || order.TableNumber || '']);
    }
    metadata.forEach(function (pair) {
      if (pair[1] !== '' && pair[1] !== null && pair[1] !== undefined) {
        wrap(rightPair(pair[0], pair[1], width), width).forEach(function (row) { rows.push(row); });
      }
    });

    if (isDelivery) {
      addField('Customer', order.customerName || order.CustomerName || '');
      addField('Phone', order.phone || order.Phone || '');
      addField('Address', order.address || order.Address || '');
      addField('Area', order.area || order.Area || '');
      addField('Locality', order.deliveryLocality || order.DeliveryLocality || order.locality || order.Locality || '');
      addField('Delivery Instructions',
        order.deliveryInstructions || order.DeliveryInstructions ||
        order.customerInstructions || order.CustomerInstructions || '');
    }

    rows.push(
      '-'.repeat(width),
      rightPair('Item', 'Price', width),
      '-'.repeat(width)
    );

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) rows.push('Item details unavailable');
    items.forEach(function (item) {
      const name = item.itemName || item['Item Name'] || item.ItemName || item.name || 'Item';
      const quantity = Math.max(1, Number(item.quantity ?? item.Quantity) || 1);
      const price = Number(item.price ?? item.Price) || 0;
      const labelText = quantity + 'x ' + name +
        (price > 0 ? ' @' + price.toLocaleString('en-PK', { maximumFractionDigits: 0 }) : '');
      itemPriceRows(labelText, fmt(lineTotal(item))).forEach(function (row) { rows.push(row); });
      const detail = Array.isArray(item.contents)
        ? item.contents.join(', ')
        : (item.description || item.Description || '');
      if (detail) wrap('  ' + detail, width).forEach(function (row) { rows.push(row); });
    });

    rows.push('-'.repeat(width));
    const rawSubtotal = order.subtotal ?? order.Subtotal;
    const suppliedSubtotal = Number(rawSubtotal);
    const hasSuppliedSubtotal = rawSubtotal !== undefined && rawSubtotal !== null && rawSubtotal !== '';
    const itemSubtotal = items.reduce(function (sum, item) { return sum + lineTotal(item); }, 0);
    const subtotal = hasSuppliedSubtotal && Number.isFinite(suppliedSubtotal) && suppliedSubtotal >= 0
      ? suppliedSubtotal
      : itemSubtotal;
    const deliveryFee = isDelivery ? Math.max(0, Number(order.deliveryFee ?? order.DeliveryFee) || 0) : 0;
    const discount = Math.max(0, Number(order.discount ?? order.Discount) || 0);
    const rawTotal = order.total ?? order.Total;
    const suppliedTotal = Number(rawTotal);
    const hasSuppliedTotal = rawTotal !== undefined && rawTotal !== null && rawTotal !== '';
    const total = hasSuppliedTotal && Number.isFinite(suppliedTotal) && suppliedTotal >= 0
      ? suppliedTotal
      : Math.max(0, subtotal + deliveryFee - discount);

    rows.push(rightPair('Price', fmt(subtotal), width));
    if (isDelivery) rows.push(rightPair('Delivery Charges', fmt(deliveryFee), width));
    if (discount > 0) rows.push(rightPair('Discount', fmt(discount), width));
    rows.push(
      ESC + '\x45' + '\x01',
      rightPair('Grand Total', fmt(total), width),
      ESC + '\x45' + '\x00'
    );

    const method = order.paymentMethod || order.PaymentMethod || 'Cash';
    const status = String(order.paymentStatus || order.PaymentStatus || '').toLowerCase();
    const rawPaid = Number(order.paidAmount ?? order.PaidAmount);
    const hasPaid = Number.isFinite(rawPaid) && rawPaid > 0;
    const isPaid = status === 'paid' || (hasPaid && rawPaid >= total && total > 0);
    const paid = hasPaid ? rawPaid : (isPaid ? total : 0);
    rows.push('');
    if (isPaid || paid > 0) rows.push(rightPair(method, fmt(paid), width));
    else rows.push(rightPair('Payment', method, width));

    if (isPaid) {
      rows.push(
        ESC + '\x61' + '\x01',
        ESC + '\x45' + '\x01',
        center('* PAID *', width),
        ESC + '\x45' + '\x00',
        ESC + '\x61' + '\x00'
      );
    } else if (status === 'unpaid' || status === 'pending' || paid > 0) {
      const balanceValue = Number(order.balanceDue ?? order.BalanceDue);
      const balance = Number.isFinite(balanceValue) ? balanceValue : Math.max(0, total - paid);
      rows.push(
        rightPair('Balance Due', fmt(balance), width),
        center('* UNPAID *', width)
      );
    }

    const notes = order.notes || order.Notes;
    if (notes) {
      rows.push('-'.repeat(width));
      addField('Note', notes);
    }

    rows.push('', '', '', '');
    // Preserve the previously verified feed and partial-cut command for the iTech cutter.
    const cutterCommand = GS + '\x56\x42\x00';
    return rows.join('\n') + '\n' + cutterCommand;
  }

  async function buildReceiptData(order, label) {
    const base64 = await loadReceiptLogoBase64();
    const logoEntry = buildReceiptImageEntry(base64);
    if (!logoEntry) return [receiptCommands(order, label)];

    // Set centered alignment before QZ inserts the ESC/POS raster logo.
    return [
      '\x1B\x40' + '\x1B\x61\x01',
      logoEntry,
      '\n',
      receiptCommands(order, label)
    ];
  }

  function testCommands() {
    const ESC = '\x1B';
    const GS = '\x1D';
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
    ].join('\n') + '\n' + GS + '\x56\x42\x00';
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
    const printData = Array.isArray(data) ? data : [{
      type: 'raw',
      format: 'command',
      flavor: 'plain',
      data: [data]
    }];
    await qz.print(config, printData);
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
      return buildReceiptData(order || {}, label || 'Counter Receipt')
        .then(function (data) { return send(printerName, data); });
    },
    testPrint: function (printerName) {
      return send(printerName, testCommands());
    },
    downloadDiagnosticFiles: downloadDiagnosticFiles,
    diagnostics: {
      buildTestPayload: testCommands,
      buildReceiptPayload: receiptCommands,
      buildReceiptImageEntry: buildReceiptImageEntry,
      buildReceiptData: buildReceiptData,
      encodeCp437Ascii: encodeCp437Ascii,
      formatEscPosPayload: formatEscPosPayload
    }
  };
})();
