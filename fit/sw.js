// Superhero - работа без интернета: оболочка приложения и библиотеки из кэша, данные Supabase - всегда из сети.
const VER = 'sh-v7';
const SHELL = ['./', 'index.html', 'app.js?v=6', 'body3d.js?v=4', 'data/exercises.json', 'data/foods.json', 'app.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sh-') && k != VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method != 'GET' || u.hostname.endsWith('supabase.co')) return;
  const lib = /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if (lib) { // библиотеки и шрифты: сначала кэш
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(VER).then(x => x.put(e.request, c)); return res; })));
    return;
  }
  if (u.origin == location.origin) { // свои файлы: сначала сеть, без сети - кэш
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(VER).then(x => x.put(e.request, c)); } return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  }
});
// уведомления: напоминания с сервера (fit-remind) и конец отдыха
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Superhero', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Superhero', { body: d.body || '', tag: d.tag || 'fit', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' }, vibrate: [120, 60, 120] }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { const w = ws.find(x => x.url.includes('/fit')); if (w) return w.focus(); return self.clients.openWindow(e.notification.data?.url || './'); }));
});
