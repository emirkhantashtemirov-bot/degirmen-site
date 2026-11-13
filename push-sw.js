// Degirmen Navoi - service worker: push-уведомления («Заказ готов») + работа без интернета.
// Правила кэша:
//  - страница приложения (HTML): сначала сеть (новая версия подхватывается сразу), кэш только если сети нет;
//  - фото меню /media/p/*, значки, шрифты и библиотека supabase-js с CDN: из кэша, с ограничением по количеству;
//  - видео /media/v/*, запросы к базе (Supabase), функции, POST - никогда не кэшируются;
//  - аварийный выключатель: если /sw-off.txt отдаёт 200, worker удаляет кэши и снимает себя.
const VER = 'v3-4';
const SHELL = 'dn-shell-' + VER, MEDIA = 'dn-media-' + VER, LIB = 'dn-lib-' + VER;
const KEEP = [SHELL, MEDIA, LIB];
const MEDIA_MAX = 260, LIB_MAX = 30;
const PRE = ['/', '/app.webmanifest', '/media/logo-mill.svg', '/media/icon/icon-192-v2.png', '/media/p/splash.s.webp'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // предзагрузка оболочки: ошибка любого файла не ломает установку
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k.startsWith('dn-') && !KEEP.includes(k)) await caches.delete(k); } catch {}
    await self.clients.claim();
    killCheck();
  })());
});

let killT = 0;
async function killCheck() {
  if (Date.now() - killT < 10000) return; killT = Date.now();
  try {
    const r = await fetch('/sw-off.txt?' + Date.now(), { cache: 'no-store' });
    if (r.status === 200) {
      for (const k of await caches.keys()) if (k.startsWith('dn-')) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
    }
  } catch {}
}

async function trim(name, max) {
  try { const c = await caches.open(name), ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); } catch {}
}
async function cacheFirst(req, name, max) {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok) { c.put(req, r.clone()).then(() => trim(name, max)).catch(() => {}); }
  return r;
}
async function page(req) {
  try {
    const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'follow' });
    if (r && r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(SHELL).then(c => c.put('/', cp)).catch(() => {}); }
    killCheck();
    return r;
  } catch (err) {
    const c = await caches.open(SHELL);
    const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match('/'));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u; try { u = new URL(req.url); } catch { return; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
  if (/supabase\.co$/.test(u.hostname) || u.pathname.startsWith('/functions/') || u.pathname.startsWith('/rest/')) return;
  if (req.headers.has('range') || u.pathname.startsWith('/media/v/')) return;
  const same = u.origin === self.location.origin;
  // страница приложения (не трогаем отдельные разделы сайта: /brewsell, /avto, /jel, /guard, /glm)
  if (req.mode === 'navigate') {
    if (same && (u.pathname === '/' || u.pathname === '/index.html')) e.respondWith(page(req));
    return;
  }
  if (same && (u.pathname.startsWith('/media/p/') || u.pathname.startsWith('/media/icon/') || u.pathname === '/media/logo-mill.svg')) {
    e.respondWith(cacheFirst(req, MEDIA, MEDIA_MAX)); return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' || (u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/npm/@supabase/supabase-js@2.'))) {
    e.respondWith(cacheFirst(req, LIB, LIB_MAX)); return;
  }
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Degirmen Navoi', {
    body: d.body || '', tag: d.tag, renotify: true, icon: '/media/icon/icon-192-v2.png', badge: '/media/icon/icon-192-v2.png',
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
