self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Standalone PWA modunu korumak için varsayılan ağ geçişi
  event.respondWith(fetch(event.request));
});