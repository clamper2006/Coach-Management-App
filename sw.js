/**
 * sw.js — Service Worker de Coach Management
 * Estrategia: Cache First para assets, Network First para datos
 */

const CACHE_NAME = 'coach-management-v1.2';
const CACHE_STATIC = 'coach-static-v1.2';

// Archivos críticos para funcionamiento offline
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './utils/storage.js',
  './utils/date-system.js',
  './utils/pdf-report.js',
  './utils/backup-system.js',
  './components/tutorial.js',
  './components/dashboard.js',
  './components/athletes.js',
  './components/payments.js',
  './components/calendar.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/logo.png',
  './assets/icons/player-icon.svg',
  './assets/icons/paid-icon.svg',
  './assets/icons/unpaid-icon.svg',
  './assets/icons/calendar-icon.svg',
  './assets/icons/report-icon.svg',
  './assets/icons/tutorial-icon.svg',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// ── Instalación: pre-cachear assets estáticos ──────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Coach Management SW...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      console.log('[SW] Pre-cacheando assets estáticos');
      // Cachear uno por uno para no fallar si alguno no carga
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] No se pudo cachear:', url, err);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activación: limpiar caches antiguas ───────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando nueva versión...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_STATIC && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Eliminando cache antigua:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia Cache First con fallback a red ─────────────────────
self.addEventListener('fetch', (event) => {
  // Solo interceptar GET requests
  if (event.request.method !== 'GET') return;

  // Omitir requests de extensiones del navegador
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Actualizar en background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }).catch(() => {});
        return cachedResponse;
      }

      // No está en cache: buscar en red y cachear
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_STATIC).then(cache => cache.put(event.request, responseClone));
        return networkResponse;
      }).catch(() => {
        // Offline y sin cache: retornar página principal como fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Mensaje: forzar actualización desde el cliente ───────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
