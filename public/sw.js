const CACHE_NAME = 'prompthub-v1';
const STATIC_CACHE = 'prompthub-static-v1';
const API_CACHE = 'prompthub-api-v1';

const STATIC_ASSETS = [
  '/',
  '/leaderboard',
  '/request',
  '/admin',
  '/js/script.js',
  '/js/timeago.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  if (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/)
  ) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
});

async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    return offlineFallback(request);
  }
}

async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return offlineFallback(request);
  }
}

function offlineFallback(request) {
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) {
    return new Response(offlineHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  if (accept.includes('application/json')) {
    return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response('Offline', { status: 503 });
}

function offlineHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - AI Prompt Hub</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .container { max-width: 320px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    p { font-size: 0.85rem; color: #6b7280; line-height: 1.6; margin-bottom: 1.5rem; }
    button {
      background: #e5e5e5;
      color: #0f0f0f;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>Kamu Offline</h1>
    <p>Tidak ada koneksi internet. Pastikan kamu terhubung ke internet lalu coba lagi.</p>
    <button onclick="window.location.reload()">Coba Lagi</button>
  </div>
</body>
</html>`;
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    console.log('[SW] Background sync: analytics');
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'AI Prompt Hub', {
    body: data.body || 'Ada prompt baru!',
    icon: 'https://cdn.yupra.my.id/yp/xihcb4th.jpg',
    badge: 'https://cdn.yupra.my.id/yp/xihcb4th.jpg',
    data: { url: data.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
