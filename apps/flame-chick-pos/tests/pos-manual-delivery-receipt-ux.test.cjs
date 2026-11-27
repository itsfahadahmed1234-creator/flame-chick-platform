'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function functionSource(name, nextMarker) {
  const start = source.indexOf('async function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' must exist');
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, 'end marker for ' + name + ' must exist');
  return source.slice(start, end).trim();
}

function makeButton(innerHTML) {
  const attributes = new Map();
  const classes = new Set();
  return {
    innerHTML,
    disabled: false,
    attributes,
    classes,
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); }
    },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function loadGuard(button, orderType = 'Delivery') {
  const sandbox = {
    orderActionInProgress: false,
    $: (id) => id === 'placeBtn' || id === 'printThermalBtn' ? button : ({ value: orderType }),
    showToast() {},
    console: { error() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(functionSource('guardedOrderAction', '\n\nfunction setupCashierControls'), sandbox);
  return sandbox;
}

test('rapid Place Order clicks share one submission, show a spinner immediately, and restore markup after success', async () => {
  const button = makeButton('PLACE ORDER');
  const sandbox = loadGuard(button);
  const pending = deferred();
  let submitCalls = 0;
  const submit = () => { submitCalls += 1; return pending.promise; };

  const first = sandbox.guardedOrderAction('placeBtn', submit);
  const second = sandbox.guardedOrderAction('placeBtn', submit);

  assert.equal(submitCalls, 1, 'only one manual order submission may start');
  assert.equal(button.disabled, true);
  assert.equal(button.hasAttribute('aria-busy'), true);
  assert.equal(button.classList.contains('is-loading'), true);
  assert.match(button.innerHTML, /button-spinner/);
  assert.match(button.innerHTML, /PLACING ORDER/);

  pending.resolve(true);
  await Promise.all([first, second]);

  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'PLACE ORDER');
  assert.equal(button.hasAttribute('aria-busy'), false);
  assert.equal(button.classList.contains('is-loading'), false);
});

test('Place Order button is restored after a handled submission failure and can be retried', async () => {
  const button = makeButton('PLACE ORDER');
  const sandbox = loadGuard(button);
  let calls = 0;

  const failed = await sandbox.guardedOrderAction('placeBtn', async () => {
    calls += 1;
    throw new Error('mock order submission failed');
  });

  assert.equal(failed, false);
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'PLACE ORDER');
  assert.equal(button.hasAttribute('aria-busy'), false);

  const retried = await sandbox.guardedOrderAction('placeBtn', async () => {
    calls += 1;
    return 'retry-ok';
  });
  assert.equal(retried, 'retry-ok');
  assert.equal(calls, 2);
});

test('non-editable receipt closes only after the mocked QZ print promise confirms success', async () => {
  const status = { textContent: 'Ready', classList: { add(value) { this.error = value; } } };
  const pending = deferred();
  let closeCalls = 0;
  let printCalls = 0;
  const sandbox = {
    $: (id) => id === 'receiptStatusText' ? status : null,
    printThermalReceipt: async () => { printCalls += 1; return pending.promise; },
    closeModal: (id) => { assert.equal(id, 'receiptModal'); closeCalls += 1; },
    setReceiptPrintError: (message) => { status.textContent = message; },
    lastReceiptPrintError: '',
    showToast() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(functionSource('printReceiptFromModal', '\nfunction openLocalReceipt'), sandbox);

  const result = sandbox.printReceiptFromModal({ localOrderId: 'LOCAL-MOCK' });
  await Promise.resolve();
  assert.equal(printCalls, 1);
  assert.equal(closeCalls, 0, 'popup must remain open while printing is pending');

  pending.resolve(true);
  assert.equal(await result, true);
  assert.equal(closeCalls, 1, 'successful print closes the popup exactly once');
});

test('failed or cancelled receipt printing leaves the popup open and permits a deliberate retry', async () => {
  const status = { textContent: 'Ready', classList: { add(value) { this.error = value; } } };
  let closeCalls = 0;
  let printCalls = 0;
  const sandbox = {
    $: (id) => id === 'receiptStatusText' ? status : null,
    printThermalReceipt: async () => {
      printCalls += 1;
      if (printCalls === 1) throw new Error('mock QZ print cancelled');
      return true;
    },
    closeModal: () => { closeCalls += 1; },
    setReceiptPrintError: (message) => { status.textContent = message; },
    lastReceiptPrintError: '',
    showToast() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(functionSource('printReceiptFromModal', '\nfunction openLocalReceipt'), sandbox);

  assert.equal(await sandbox.printReceiptFromModal({ localOrderId: 'LOCAL-MOCK' }), false);
  assert.equal(closeCalls, 0);
  assert.match(status.textContent, /mock QZ print cancelled/);

  assert.equal(await sandbox.printReceiptFromModal({ localOrderId: 'LOCAL-MOCK' }), true);
  assert.equal(printCalls, 2);
  assert.equal(closeCalls, 1);
});

test('rapid receipt-print clicks invoke one mocked print request and restore the print button', async () => {
  const button = makeButton('Print Thermal Receipt');
  const sandbox = loadGuard(button);
  const pending = deferred();
  let calls = 0;
  const print = () => { calls += 1; return pending.promise; };

  const first = sandbox.guardedOrderAction('printThermalBtn', print);
  const second = sandbox.guardedOrderAction('printThermalBtn', print);
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);

  pending.resolve(true);
  await Promise.all([first, second]);
  assert.equal(button.disabled, false);
});

test('print preview stays open while pending, closes on confirmation, and remains retryable after failure', async () => {
  const button = makeButton('Print');
  const status = { textContent: 'Ready', classList: { remove() {}, add(value) { this.error = value; } } };
  const pending = deferred();
  let closeCalls = 0;
  let calls = 0;
  const sandbox = {
    printPreviewInProgress: false,
    $: (id) => id === 'printPreviewConfirmBtn' ? button : status,
    _pendingPrintOrder: { localOrderId: 'MOCK' },
    doPrintOrder: () => { calls += 1; return pending.promise; },
    closeModal: (id) => { assert.equal(id, 'printPreviewModal'); closeCalls += 1; },
    setReceiptPrintError: (message) => { status.textContent = message; },
    lastReceiptPrintError: '',
    showToast() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(functionSource('confirmPrintPreview', '\nasync function doPrintOrder'), sandbox);

  const first = sandbox.confirmPrintPreview();
  const second = sandbox.confirmPrintPreview();
  assert.equal(calls, 1, 'a second rapid click must not dispatch another print');
  assert.equal(button.disabled, true);
  assert.equal(closeCalls, 0);

  pending.resolve(true);
  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.equal(closeCalls, 1);
  assert.equal(button.disabled, false);

  sandbox._pendingPrintOrder = { localOrderId: 'MOCK-RETRY' };
  sandbox.doPrintOrder = async () => false;
  assert.equal(await sandbox.confirmPrintPreview(), false);
  assert.equal(closeCalls, 1, 'failed/cancelled print leaves the preview open');
  assert.match(status.textContent, /PRINT NOT CONFIRMED/);
  assert.equal(button.disabled, false);
});
