'use strict';

const APP_SCOPE = self.registration.scope;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Keep the live ordering and delivery portal online-first. The service worker
// is also the receiver for Web Push when the rider app is not in the foreground.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(request));
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = String(payload.title || 'Flame Chick · New delivery offer');
  const options = {
    body: String(payload.body || 'A new delivery is waiting. Open Flame Chick Rider to respond.'),
    icon: new URL('./icon.svg', APP_SCOPE).href,
    badge: new URL('./icon.svg', APP_SCOPE).href,
    tag: String(payload.tag || payload.offer_id || 'flame-chick-delivery-offer'),
    renotify: false,
    requireInteraction: true,
    data: { url: String(payload.url || APP_SCOPE), offer_id: payload.offer_id || null }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || APP_SCOPE, APP_SCOPE).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if (client.url !== target && 'navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
