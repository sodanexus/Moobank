const APP_VERSION = '2.5.0';
const CACHE_PREFIX = 'moobank-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const versioned = path => `${path}?v=${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  versioned('./version.json'),
  versioned('./manifest.json'),
  versioned('./assets/css/app.css'),
  versioned('./assets/css/v2.css'),
  './assets/brand/moobank-mark.svg',
  versioned('./assets/js/core.js'),
  versioned('./assets/js/trajectory-core.js'),
  versioned('./assets/js/app.js'),
  versioned('./assets/js/history-import.js'),
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(
      APP_SHELL.map(url => new Request(url, { cache: 'reload' }))
    ))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;
  const mustStayFresh = request.mode === 'navigate' ||
    request.destination === 'script' || request.destination === 'style' ||
    pathname.endsWith('/version.json') || pathname.endsWith('/manifest.json');

  if (mustStayFresh) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const cacheKey = request.mode === 'navigate' ? './index.html' : request;
          // IMPORTANT : cloner tout de suite, de façon synchrone. Si on clone à
          // l'intérieur du .then() de caches.open() (async), la réponse d'origine
          // a déjà été transmise au navigateur et son corps est en cours de
          // lecture -> "Response body is already used" au moment du clone.
          const responseToCache = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, responseToCache)));
          return response;
        })
        .catch(async () => {
          if (request.mode === 'navigate') return (await caches.match('./index.html')) || caches.match('./');
          return (await caches.match(request)) || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }))
  );
});
