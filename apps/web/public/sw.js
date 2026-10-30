/* Altıkod CRM service worker: phone/desktop notifications only. It deliberately has no fetch handler and caches
   nothing, so signed-in pages and API data never persist on the device. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const safePath = url => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') ? url : '/notifications';

self.addEventListener('push', event => {
  let data;
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const badge = Number.isInteger(data.badge) && data.badge >= 0 ? data.badge : undefined;
  event.waitUntil(Promise.all([
    self.registration.showNotification(typeof data.title === 'string' ? data.title : 'Altıkod CRM', {
      body: typeof data.body === 'string' ? data.body : 'Yeni bildirim',
      icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'tr',
      tag: typeof data.tag === 'string' ? data.tag : undefined, renotify: typeof data.tag === 'string',
      data: { url: safePath(data.url) },
    }),
    badge !== undefined && 'setAppBadge' in self.navigator ? self.navigator.setAppBadge(badge).catch(() => undefined) : undefined,
  ]));
});

/** Focus an open app window and navigate it, or open a new one, always within this site. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if ('navigate' in client) return client.navigate(target);
      return client.postMessage({ type: 'open', url: target });
    }
    return self.clients.openWindow(target);
  })());
});
