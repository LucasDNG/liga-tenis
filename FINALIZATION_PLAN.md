# Plan actual de estabilización y salida a web

## 1. Estado consolidado
- package `5.0.9`;
- motor productivo `wheel-v3` desde 2026-09-29;
- Neon nueva como base actual; la histórica fue eliminada;
- 71/71 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db` verde;
- frontend build verde;
- Node 22/PostgreSQL 16 verdes en CI;
- Vercel `success` en el último checkpoint verificado.

El corazón funcional y el hardening automatizable están cerrados. No seguir agregando hardening especulativo si no responde a un fallo o riesgo demostrado.

## 2. Orden de gates reales

### Gate A — Environment production
Configurar según `PRODUCTION_ENVIRONMENT_SETUP.md` los secrets/variables core sin imprimir valores.

### Gate B — Preflight core
Ejecutar `npm run preflight:core` o el workflow `LA RED production preflight` en modo `core`.

Debe validar, sin modificar datos:
- TLS PostgreSQL;
- JWT/TOTP/configuración;
- engine `wheel-v3`;
- timezone;
- reloj global;
- patch de abandono;
- Admin verificado;
- patch de lugares libres;
- invariantes de `verify.sql`.

### Gate C — Render
Confirmar startup productivo contra la Neon real. Las migraciones corren antes de `app.listen()` y están serializadas con advisory lock.

Health:
- `/api/live`: liveness sin DB;
- `/api/health`: readiness DB-aware y engine `wheel-v3`.

Si Render se administra mediante Blueprint, sincronizar `render.yaml`. Si el servicio existente es manual, mantener branch `main`, build `npm ci --ignore-scripts`, start `npm start` y health `/api/health`.

### Gate D — Production smoke
Ejecutar `LA RED production smoke` usando:
- `PROD_API_URL`;
- `PROD_FRONTEND_URL`.

El smoke es no destructivo y valida liveness/readiness, CORS, endpoints públicos, headers, no-store, request ID y frontend SPA.

### Gate E — TOTP real
Cargar el URI generado localmente en un autenticador y probar un login Admin real.

Generación:
```bash
npm run generate:secrets -- --account=admin
```

### Gate F — Recuperación Neon
Seguir `PRODUCTION_RECOVERY.md`:
- confirmar plan y restore window reales;
- definir RPO/RTO;
- ejecutar drill aislado;
- definir backup externo si se requiere más retención.

### Gate G — WhatsApp Meta
Configurar Phone Number ID, token, template, Graph version y language. Entregar un mensaje de prueba aprobado.

### Gate H — Preflight full
Ejecutar `npm run preflight:full` o el workflow en modo `full`. Es obligatorio antes del release público.

### Gate I — Smoke UX autenticado
Smoke autenticado read-only real: **VERDE** (`36585954395`). Admin, jugador y aislamiento de permisos verificados. El flujo `Mi Liga` real se comprobará con la primera pareja verificada productiva, sin fabricar datos.

Los flujos mutantes completos siguen cubiertos por tests/integración; los primeros usos reales deben observarse sin forzar datos ficticios.

### Gate J — Legal/seguro
Revisión profesional en Argentina de términos, privacidad/DNI, riesgos, conducta y seguro/RC/accidentes.

## 3. Vercel
Root: `frontend`.

Variable productiva:
`VITE_API_URL=https://la-red-padle-api.onrender.com/api`.

El build de producción falla cerrado si falta o es inválida.

## 4. Regla de corte
Solo después de todos los gates obligatorios verdes se considera LA RED lista para lanzamiento público.

## 5. Deuda no bloqueante
Generar legítimamente `frontend/package-lock.json` y recién entonces sustituir `npm install` por `npm ci` en el job frontend.


## Actualización 2026-09-22 — gate de producción inmediato
Antes de continuar con smoke/TOTP/WhatsApp:
1. Render debe desplegar el HEAD vigente.
2. Startup debe aplicar `PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql`.
3. Ejecutar un workflow **nuevo** `LA RED production preflight` en modo `core`.
4. El preflight ya no requiere ninguna cancha comercial activa.
5. Una vez verde, continuar con production smoke y los gates externos restantes.


## Estado real de gates — 2026-09-22
- Gate A Environment production core: VERDE.
- Gate B Preflight core real: VERDE.
- Gate C Render startup + health: VERDE.
- Gate D Production smoke real: VERDE.
- Gate E TOTP Admin real: VERDE.
- Wheel v3 productivo + postcutover: VERDE.
- Smoke autenticado read-only: VERDE.
- WhatsApp Meta real: PENDIENTE por 5 entradas externas faltantes.
- Preflight full: PENDIENTE de WhatsApp.
- Legal/seguro: PENDIENTE externo.
- Recuperación Neon: ventana histórica confirmada; RPO/RTO + drill aislado siguen pendientes.


## Recuperación Neon — estado 2026-09-22
- Backup & Restore disponible en producción.
- Ventana histórica real observada: 8 horas.
- Preview/restore desde historial y snapshots manuales disponibles.
- Drill aislado diferido intencionalmente hasta que existan cambios/datos útiles para comprobar la recuperación.
- No tocar `production` para una prueba artificial sin valor.


## Service Worker productivo
Bug de fallback observado en navegador real y corregido. La navegación SPA offline/transitoria ya no devuelve valores inválidos; regresión automática incluida. Estado: 71/71 puros + 46/46 PostgreSQL, frontend y Vercel verdes.


## Estado vigente 2026-09-30

No quedan gates funcionales internos conocidos de Wheel v3. No seguir cambiando reglas por prevención.

Orden restante:
1. configurar Meta WhatsApp en GitHub + Render;
2. ejecutar preflight full;
3. enviar mensaje controlado de prueba;
4. cerrar revisión legal/seguro;
5. acordar RPO/RTO y realizar drill de recuperación aislado cuando sea útil;
6. observar primer onboarding/pareja/partido real y corregir sólo bugs demostrados;
7. después de estabilidad suficiente, retirar runtime/campos legacy Wheel v2.
