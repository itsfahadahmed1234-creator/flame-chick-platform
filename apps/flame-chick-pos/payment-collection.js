/* Flame Chick POS cashier collection-method contract.
 * UI choices map to the database's constrained payment-method values:
 * COD -> cash, Card -> card, Online/bank transfer -> bank.
 * This records a staff-confirmed collection; it is not a card/bank gateway.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlameChickPosPaymentCollection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const METHODS = Object.freeze([
    Object.freeze({ value: 'cash', label: 'COD' }),
    Object.freeze({ value: 'card', label: 'Card' }),
    Object.freeze({ value: 'bank', label: 'Online/bank transfer' })
  ]);

  function normalizeMethod(value) {
    const method = String(value || '').trim().toLowerCase();
    if (method === 'cod') return 'cash';
    if (method === 'online' || method === 'online/bank transfer' || method === 'bank_transfer') return 'bank';
    return METHODS.some(row => row.value === method) ? method : null;
  }

  function methodLabel(value) {
    const method = normalizeMethod(value);
    return METHODS.find(row => row.value === method)?.label ||
      (String(value || '').trim().toLowerCase() === 'mixed' ? 'Mixed' : 'Not recorded');
  }

  function createFullBalanceRequest(input) {
    if (!input || typeof input !== 'object') throw new Error('Payment details are required.');
    const orderId = String(input.orderId || '').trim();
    const requestId = String(input.requestId || '').trim();
    const amount = Number(input.balance);
    const method = normalizeMethod(input.method);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      throw new Error('A valid server order ID is required.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new Error('A unique payment request ID is required.');
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      throw new Error('The outstanding balance is not a valid collection amount.');
    }
    if (!method) throw new Error('Choose COD, Card or Online/bank transfer.');
    return Object.freeze({
      action: 'collect_payment',
      order_id: orderId,
      amount,
      payment_method: method,
      request_id: requestId
    });
  }

  return Object.freeze({ METHODS, normalizeMethod, methodLabel, createFullBalanceRequest });
});
