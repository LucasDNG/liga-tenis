const CACHE_NAME =
  "liga-tenis-v2";

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll(
            APP_SHELL,
          ),
        ),
    );

    self.skipWaiting();
  },
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !==
                  CACHE_NAME,
              )
              .map((key) =>
                caches.delete(
                  key,
                ),
              ),
          ),
        ),
    );

    self.clients.claim();
  },
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url,
      );

    /*
      Nunca cacheamos llamadas
      al backend/API.

      Ranking, partidos,
      desafíos y Elo deben
      mantenerse siempre frescos.
    */
    if (
      url.pathname.startsWith(
        "/api/",
      )
    ) {
      return;
    }

    /*
      Navegaciones:
      primero internet.

      Si no hay conexión,
      usamos la app cacheada.
    */
    if (
      request.mode ===
      "navigate"
    ) {
      event.respondWith(
        fetch(request).catch(
          () =>
            caches.match(
              "/",
            ),
        ),
      );

      return;
    }

    /*
      Recursos estáticos:
      cache primero.
    */
    event.respondWith(
      caches
        .match(request)
        .then(
          (
            cachedResponse,
          ) => {
            if (
              cachedResponse
            ) {
              return cachedResponse;
            }

            return fetch(
              request,
            ).then(
              (
                networkResponse,
              ) => {
                if (
                  !networkResponse ||
                  networkResponse.status !==
                    200 ||
                  networkResponse.type ===
                    "opaque"
                ) {
                  return networkResponse;
                }

                const copy =
                  networkResponse.clone();

                caches
                  .open(
                    CACHE_NAME,
                  )
                  .then(
                    (
                      cache,
                    ) => {
                      cache.put(
                        request,
                        copy,
                      );
                    },
                  );

                return networkResponse;
              },
            );
          },
        ),
    );
  },
);