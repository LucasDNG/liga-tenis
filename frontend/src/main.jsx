import React from "react";
import ReactDOM from "react-dom/client";

import {
  BrowserRouter,
} from "react-router-dom";

import App from "./App";

import {
  AuthProvider,
} from "./context/AuthContext";

import "./index.css";
import "./clay-theme.css";
import "./HomeClay.css";


/*
  ==========================================================
  SERVICE WORKER
  ==========================================================

  DESARROLLO:
  No usamos Service Worker.

  Vite necesita servir siempre
  los módulos actuales y mantener
  correctamente el WebSocket HMR.

  Además eliminamos cualquier
  Service Worker viejo que haya
  quedado registrado en localhost.

  PRODUCCIÓN:
  Sí registramos sw.js para mantener
  la funcionalidad PWA.
*/

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener(
      "load",
      () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((error) => {
            console.error(
              "Error registrando Service Worker:",
              error,
            );
          });
      },
    );
  } else {
    /*
      Estamos ejecutando:

      npm run dev

      Eliminamos Service Workers
      previamente registrados.
    */

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach(
          (registration) => {
            registration.unregister();
          },
        );
      })
      .catch((error) => {
        console.error(
          "Error eliminando Service Worker de desarrollo:",
          error,
        );
      });

    /*
      También limpiamos las caches
      creadas por la PWA.

      Esto evita que localhost use
      chunks viejos de React/Vite.
    */

    if ("caches" in window) {
      caches
        .keys()
        .then((cacheNames) => {
          cacheNames.forEach(
            (cacheName) => {
              caches.delete(
                cacheName,
              );
            },
          );
        })
        .catch((error) => {
          console.error(
            "Error limpiando caches:",
            error,
          );
        });
    }
  }
}


ReactDOM.createRoot(
  document.getElementById(
    "root",
  ),
).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);