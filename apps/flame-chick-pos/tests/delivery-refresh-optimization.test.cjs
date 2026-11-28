'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function schedulerSource() {
  const start = source.indexOf('let flameChickRealtimePendingOrders=false,flameChickRealtimePendingDelivery=false;');
  assert.notEqual(start, -1, 'scoped POS Realtime scheduler state must exist');
  const end = source.indexOf('function startFlameChickRealtimeFallback()', start);
  assert.notEqual(end, -1, 'scoped POS Realtime scheduler must have an end marker');
  return source.slice(start, end);
}

function makeScheduler() {
  const timers = new Map();
  let nextTimerId = 1;
  const calls = { orders: 0, delivery: 0 };
  const sandbox = {
    navigator: { onLine: true },
    flameChickStaffSession: { access_token: 'mock-session' },
    flameChickRealtimeRefreshRunning: false,
    flameChickRealtimeRefreshDebounce: null,
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback) {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    },
    console: { warn() {} },
    async loadDeliveryDispatch() { calls.delivery += 1; },
    async loadInitialOnlineInbox() {
      calls.orders += 1;
      // The production inbox loader already performs one dispatch refresh.
      await sandbox.loadDeliveryDispatch();
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(schedulerSource(), sandbox);
  return {
    calls,
    async flush() {
      const entry = timers.entries().next().value;
      assert.ok(entry, 'a scheduled refresh callback must exist');
      timers.delete(entry[0]);
      await entry[1]();
    },
    schedule: (scope) => sandbox.scheduleFlameChickRealtimeRefresh(scope)
  };
}

test('POS order and delivery Realtime events request only their required refresh path', async () => {
  const order = makeScheduler();
  order.schedule('orders');
  await order.flush();
  assert.deepEqual(order.calls, { orders: 1, delivery: 1 });

  const delivery = makeScheduler();
  delivery.schedule('delivery');
  await delivery.flush();
  assert.deepEqual(delivery.calls, { orders: 0, delivery: 1 });
});

test('POS coalesces order and delivery events into one inbox/dispatch refresh', async () => {
  const scheduler = makeScheduler();
  scheduler.schedule('orders');
  scheduler.schedule('delivery');
  await scheduler.flush();
  assert.deepEqual(scheduler.calls, { orders: 1, delivery: 1 });
});

test('POS Realtime listeners distinguish order changes from delivery changes', () => {
  assert.match(source, /channel\.on\('broadcast',\{event:'orders_changed'\},\(\)=>scheduleFlameChickRealtimeRefresh\('orders'\)\)/);
  assert.match(source, /channel\.on\('broadcast',\{event:'delivery_changed'\},\(\)=>scheduleFlameChickRealtimeRefresh\('delivery'\)\)/);
});

test('POS refresh scheduler does not run the inbox and dispatch loaders sequentially', () => {
  const scheduler = schedulerSource();
  assert.doesNotMatch(scheduler, /await loadInitialOnlineInbox\(\);\s*await loadDeliveryDispatch\(\)/);
  assert.match(scheduler, /if\(refreshOrders\)await loadInitialOnlineInbox\(\);\s*else if\(refreshDelivery\)await loadDeliveryDispatch\(\)/);
});

test('POS keeps the 120-second healthy safety refresh and 30-second Realtime fallback', () => {
  assert.match(source, /flameChickRealtimeRefreshTimer=setInterval\([\s\S]{0,220}?\},120000\)/);
  assert.match(source, /flameChickRealtimeRefreshTimer=setInterval\([\s\S]{0,220}?\},30000\)/);
});
