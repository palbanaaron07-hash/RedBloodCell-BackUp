const CACHE_NAME = 'bloodconnect-pwa-v26';
const APP_SHELL = [
  '/',
  '/index.html',
  '/learn_more.html',
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/donor_registration.html',
  '/account_dashboard.html',
  '/recipient_donor_map.html',
  '/account_notifications.html',
  '/patient_dashboard.html',
  '/patient_donor_map.html',
  '/patient_notifications.html',
  '/admin_dashboard.html',
  '/manifest.webmanifest',
  '/pull-to-refresh.js',
  '/supabase-client.js',
  '/account_notifications.js',
  '/legacy-route-redirect.js'
];

function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response;

  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((asset) => cache.add(asset).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheSuccessfulResponse(event.request, response))
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          return cachedPage || caches.match('/index.html');
        })
    );
    return;
  }

  const cacheableDestinations = new Set(['style', 'script', 'image', 'font', 'manifest']);
  if (!cacheableDestinations.has(event.request.destination)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkRequest = fetch(event.request).then((response) =>
        cacheSuccessfulResponse(event.request, response)
      );

      if (cached) {
        event.waitUntil(networkRequest.catch(() => undefined));
        return cached;
      }

      return networkRequest;
    })
  );
});
