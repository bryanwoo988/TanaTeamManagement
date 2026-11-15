/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };
precacheAndRoute(self.__WB_MANIFEST);

/* Single-page app: every navigation (deep links such as /?date=… or /team/…/invoices, from a
   notification or the home screen) gets the precached shell, so they open offline too (spec §6.3).
   Firebase's reserved /__/ paths (auth handler, hosting init) always go to the network. */
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__\//] }));

/* Push payload from the server: {title, body, url, tag, kind}. A push that shows nothing makes the
   browser display its own generic notice, so an unparseable payload still shows something. */
self.addEventListener('push', (e) => {
  let d: { title?: string; body?: string; url?: string; tag?: string; kind?: string } = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Tana Team', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/', kind: d.kind ?? '' },
  }));
});

/* Tapping focuses an open window and sends it to the notification's url, else opens one. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const raw: unknown = e.notification.data && e.notification.data.url;
  const url = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (!('focus' in c)) continue;
      await c.focus();
      if ('navigate' in c) { try { await (c as WindowClient).navigate(url); } catch { /* cross-origin or detached */ } }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
