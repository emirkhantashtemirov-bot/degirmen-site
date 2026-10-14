// Degirmen Navoi — обработчик push-уведомлений («Заказ готов»).
// Специально НИЧЕГО не кэширует: приложение всегда загружается с сервера свежим, гости не застревают на старой версии.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Degirmen Navoi', {
    body: d.body || '', tag: d.tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    vibrate: [200, 100, 200], data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) { if (c.navigate) c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
