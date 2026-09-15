const CACHE_NAME = 'mapa-offline-v1';

// Intercepta requisições de rede para salvar e carregar mapas do cache local
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (event.request.url.includes('tile.openstreetmap.org') || event.request.url.includes('unpkg.com')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
