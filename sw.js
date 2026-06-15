// SMHB Service Worker v1.0
const CACHE_NAME = 'smhb-v1';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/src/app.js',
  '/src/db.js',
  '/src/notifications.js',
  '/src/style.css',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css',
];

// ─── Installation : mise en cache des assets ───────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// ─── Activation : nettoyage des anciens caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch : cache-first pour assets, network-first pour API ───────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Requêtes API Supabase → toujours réseau
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'Hors ligne' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Assets statiques → cache d'abord
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});

// ─── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'SMHB Handball';
  const options = {
    body: data.body || 'Nouvelle notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'smhb-notif',
    renotify: true,
    data: { url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: 'Voir' },
      { action: 'close', title: 'Fermer' },
    ],
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Clic sur notification ─────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ─── Background Sync (envoi différé si hors ligne) ─────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-registrations') {
    event.waitUntil(syncPendingRegistrations());
  }
});

async function syncPendingRegistrations() {
  // Récupère les inscriptions en attente stockées en IndexedDB
  // et les envoie à Supabase une fois la connexion rétablie
  console.log('[SW] Sync des inscriptions en attente...');
}
