const CACHE_NAME = 'pubic-ar-cache-v3';
const CDN_CACHE = 'cdn-cache-v3';

const urlsToCache = [
    '/',
    '/index.html'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== CDN_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // CDN resources - cache first, then network
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('unpkg.com')) {
        event.respondWith(
            caches.open(CDN_CACHE).then((cache) => {
                return cache.match(request).then((response) => {
                    return response || fetch(request).then((fetchedResponse) => {
                        // Cache successful responses
                        if (fetchedResponse.ok) {
                            cache.put(request, fetchedResponse.clone());
                        }
                        return fetchedResponse;
                    });
                });
            })
        );
        return;
    }

    // App resources - network first, fallback to cache
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful responses
                if (response.ok && request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(request);
            })
    );
});
