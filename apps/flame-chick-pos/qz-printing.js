/* Flame Chick POS — QZ Tray 2.3.0 local ESC/POS bridge.
 * Only a public certificate is loaded in the browser. Signing is performed by
 * /api/qz/sign after the server verifies the current POS staff session.
 */
(function () {
  'use strict';

  const CERTIFICATE_URL = '/qz/digital-certificate.txt';
  const SIGN_URL = '/api/qz/sign';
  let tokenProvider = function () { return ''; };
  let securityConfigured = false;

  function configureSecurity() {
    if (securityConfigured) return;
    if (!window.qz || !qz.security) throw new Error('QZ Tray library did not load.');

    qz.security.setCertificatePromise(function (resolve, reject) {
      fetch(CERTIFICATE_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'text/plain' }
      }).then(function (response) {
        if (!response.ok) throw new Error('Could not load the Flame Chick QZ certificate (' + response.status + ').');
        return response.text();
      }).then(resolve).catch(reject);
    });

    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise(function (toSign) {
      return function (resolve, reject) {
        const token = String(tokenProvider() || '');
        if (!token) {
          reject(new Error('Sign in to the Flame Chick POS before using QZ Tray.'));
          return;
        }
        fetch(SIGN_URL, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            Accept: 'text/plain'
          },
          body: JSON.stringify({ request: String(toSign) })
        }).then(function (response) {
          if (!response.ok) {
            return response.text().then(function (message) {
              throw new Error(message || 'The POS signing service rejected the QZ request (' + response.status + ').');
            });
          }
          return response.text();
        }).then(function (signature) {
          const cleanSignature = String(signature || '').trim();
          if (!cleanSignature) throw new Error('The POS signing service returned an empty signature.');
          resolve(cleanSignature);
        }).catch(reject);
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
    const GS = '\x1D';
    const rows = [
      ESC + '\x40',              // Initialize
      ESC + '\x74' + '\x00',     // PC437 code page; all text is ASCII-safe
      ESC + '\x61' + '\x01',     // Center
      ESC + '\x45' + '\x01',     // Bold on
      center('FLAME CHICK', width),
      ESC + '\x45' + '\x00',     // Bold off
      center(label || 'Order Receipt', width),
      '',
      ESC + '\x61' + '\x00',     // Left
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
    rows.push('', '', '', ''); // Feed paper; no cutter command until model is confirmed
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

  async function connect() {
    if (!window.qz || !qz.websocket) throw new Error('QZ Tray library is unavailable. Refresh the POS page.');
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
    const config = qz.configs.create(name, { encoding: 'CP437' });
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

  return {
    setTokenProvider: setTokenProvider,
    connect: connect,
    scanPrinters: scanPrinters,
    printReceipt: function (order, label, printerName) {
      return send(printerName, receiptCommands(order || {}, label || 'Counter Receipt'));
    },
    testPrint: function (printerName) {
      return send(printerName, testCommands());
    }
  };
})();
