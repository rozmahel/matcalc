/* =====================================================================
   MatCalc – service worker (offline režim pro PWA)
   Strategie: vše se při instalaci uloží do cache, aplikace pak běží
   i bez internetu. Při každém načtení se soubory na pozadí stáhnou znovu
   (stale-while-revalidate), takže nová verze z GitHubu se projeví
   při příštím otevření. Pro úplné vyčištění cache zvyš VERSION.

   Při nahrání nové verze zvyš VERSION a stejné číslo dej do index.html
   (css/style.css?v=…, js/….js?v=…). Vlastní soubory mají verzi v adrese,
   takže se nikdy nesmíchají staré a nové (stará verze js/graphics.js
   s novou js/app.js).
   ===================================================================== */
const VERSION = '5';
const CACHE = 'matcalc-v' + VERSION;
const V = '?v=' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css' + V,
  './js/engine.js' + V,
  './js/graphics.js' + V,
  './js/data.js' + V,
  './js/dataview.js' + V,
  './js/examples.js' + V,
  './js/plot.js' + V,
  './js/plotcode.js' + V,
  './js/app.js' + V,
  './js/pwa.js' + V,
  './vendor/math.min.js',
  './vendor/plotly-basic.min.js',
  './vendor/codemirror/codemirror.css',
  './vendor/codemirror/show-hint.css',
  './vendor/codemirror/codemirror.js',
  './vendor/codemirror/octave.js',
  './vendor/codemirror/matchbrackets.js',
  './vendor/codemirror/closebrackets.js',
  './vendor/codemirror/comment.js',
  './vendor/codemirror/active-line.js',
  './vendor/codemirror/show-hint.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('matcalc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigace (otevření aplikace) – vždy index.html, i s parametry v adrese.
  // Ostatní soubory přesně podle adresy včetně ?v=… (verze se nesmí smíchat).
  const isNav = req.mode === 'navigate';
  const key = isNav ? './index.html' : req;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: isNav });
      // aktualizace vždy ověří soubor na serveru (ne starou kopii z mezipaměti prohlížeče)
      const network = fetch(isNav ? new Request('./index.html', { cache: 'no-cache' }) : new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);   // aktualizace na pozadí
        return cached;
      }
      const res = await network;
      return res || new Response('Offline – soubor není v cache.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
