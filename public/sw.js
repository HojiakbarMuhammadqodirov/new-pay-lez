/*
 * The service worker, and all it does is show a push.
 *
 * There is deliberately **no `fetch` handler**: a worker that caches is a
 * worker that can serve last week's bundle after a deploy, and this site's
 * deploys already have one cache to fight (`index.html` with no
 * Cache-Control). This file exists only because a browser will not deliver a
 * push to a page — it delivers it to a worker — and the daily game reminder is
 * the one push the site sends.
 *
 * The payload is `{ title, body, url }`, encrypted by the server to this
 * browser's subscription (`server/ports/webpush.ts`); the browser decrypts it
 * before this runs.
 */
self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = typeof message.title === 'string' && message.title ? message.title : 'paylez';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === 'string' ? message.body : '',
      icon: '/logo/logo-dark.jpg',
      /* One reminder on screen at a time: a second evening's replaces the
         first rather than stacking under it. */
      tag: 'paylez-daily-game',
      data: { url: typeof message.url === 'string' ? message.url : '/l-earn' },
    }),
  );
});

/* A press opens Play — in a tab already on this site if there is one, rather
   than a second copy of the site beside it. Only same-origin paths are
   followed: the URL came over the network and is not a place to send
   somebody blindly. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/l-earn';
  const target = new URL(raw, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/l-earn';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.navigate(url).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
