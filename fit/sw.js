// Superhero - работа без интернета: оболочка приложения и библиотеки из кэша, данные Supabase - всегда из сети.
const VER = 'sh-v3';
const SHELL = ['./', 'index.html', 'app.js?v=3', 'body3d.js?v=3', 'data/exercises.json', 'data/foods.json', 'app.webmanifest', 'icon.svg'];
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
