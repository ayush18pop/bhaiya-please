/*
 * Bhaiya Please service worker (web push only). Shows the push an Arkiv Triggers worker sends for an
 * alert this phone subscribed to, and opens the app at the alert's link when it is tapped.
 *
 * Payload (docs/TRIGGERS.md §3): { title, body, href, trigger, firing, entity? }.
 * The notification tag is trigger + entity, so a duplicate firing from a second worker replaces the
 * first instead of buzzing twice.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (_) {
    try {
      return { body: event.data.text() };
    } catch (_) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const p = readPayload(event);
  const title = typeof p.title === 'string' && p.title ? p.title : 'Bhaiya Please';
  const tag = [p.trigger, p.entity || p.firing].filter(Boolean).join(':') || undefined;
  const href = typeof p.href === 'string' && p.href.startsWith('/') ? p.href : '/notifications';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof p.body === 'string' ? p.body : '',
      tag,
      renotify: false,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { href, trigger: p.trigger || null, firing: p.firing || null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/notifications';
  const url = new URL(href, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        try {
          await w.focus();
          if ('navigate' in w) await w.navigate(url);
          return;
        } catch (_) {
          /* fall through to openWindow */
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
