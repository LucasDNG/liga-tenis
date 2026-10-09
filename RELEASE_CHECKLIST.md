# Release checklist

## Checkpoint actual
- [x] Neon nueva creada.
- [x] Backend local conectado a Neon.
- [x] Registro DNI + frente/dorso.
- [x] Admin privado.
- [x] Verificación de identidad real.
- [x] Purga documental al verificar.
- [x] Reenvío documental implementado.
- [x] Layout/identidad visual recuperados.
- [x] Tests puros actuales 65/65 verdes.
- [x] Simulación longitudinal 5/10/20 años con variantes y válvula 2/3 validada.
- [x] Push del checkpoint actual.
- [x] CI del checkpoint actual verde.

## Funcional deportivo pendiente
- [x] flujos con dos jugadores verificados cubiertos automáticamente; producción real todavía no tiene una pareja verificada formada;
- [x] invitación/aceptación;
- [x] pareja única;
- [x] categoría/posición;
- [x] primera asignación de rueda;
- [x] propuesta/aceptación de programación;
- [x] carga de resultado;
- [x] confirmación/auto-validación;
- [x] movimiento de ranking;
- [x] ascenso/descenso;
- [x] no-show;
- [x] Wheel v3 sin extensión extraordinaria; la compatibilidad v2 queda sólo como legacy no productivo;
- [x] lesión/abandono;
- [x] pausa/reactivación;
- [x] disolución;
- [x] disciplina.

## Seguridad/operación
- [x] probar con Node 22 real;
- [x] backend/preflight/smoke usan `npm ci` y lock raíz alineado;
- [x] workflows con `contents: read` explícito y timeouts máximos validados;
- [ ] generar y versionar `frontend/package-lock.json` para poder usar `npm ci` también en frontend;
- [x] eliminar bypass `rejectUnauthorized:false` y validar TLS por configuración; conexión Neon final todavía debe pasar preflight real;
- [x] TOTP fail-closed y requisitos de secreto automatizados;
- [x] generador local de secretos JWT/TOTP preparado;
- [x] TOTP Admin real configurado y probado con autenticador;
- [x] WhatsApp sender con retries/dedupe y Graph version configurable;
- [ ] WhatsApp Meta real configurado y mensaje de prueba entregado;
- [x] retries/outbox probados;
- [x] rate limiting revisado; contador por IP + endpoint en auth, con limitación conocida de memoria local por instancia;
- [x] store de rate limit acotado y fail-closed ante saturación;
- [x] jobs background aislados entre mantenimiento/outbox y logs sanitizados;
- [x] procedimiento `PRODUCTION_RECOVERY.md` preparado;
- [x] restore window real de Neon confirmada: 8 horas; plan exacto todavía pendiente;
- [ ] RPO/RTO de recuperación acordados;
- [ ] prueba de recuperación aislada completada; diferida intencionalmente hasta que haya datos/cambios útiles para validar;
- [ ] backup externo definido si se necesita más retención que Instant Restore;
- [x] suite PostgreSQL/concurrencia verde en CI tras Wheel v3 y barrera global de writes;
- [x] logs de errores sanitizados para no persistir PII/SQL/details en producción;
- [x] CORS de producción validado como orígenes HTTPS puros.
- [x] headers HTTP de seguridad backend/Vercel validados en CI y deploy;
- [x] respuestas auth/me/admin con `no-store` y startup fatal sanitizado validados en CI;
- [x] shutdown gracioso SIGTERM/SIGINT + handlers fatales sanitizados validados en CI;
- [x] errores idle del pool PostgreSQL conectados al shutdown sanitizado y validados en CI;
- [x] `X-Request-ID` server-side + correlación segura de errores validada en CI/smoke;

## Migración producción
- [x] migración de abandono automatizada al startup, idempotente y serializada con advisory lock; `npm run migrate:prod` disponible manualmente;
- [x] liveness `/api/live` separada de readiness DB-aware `/api/health`;
- [x] Blueprint con shutdown budget de 15 s preparado;
- [x] confirmar startup productivo exitoso contra la Neon real y patch presente;

## Preflight
- [x] preflight bloquea reloj global pausado y patch de abandono incompleto;
- [x] workflow manual de preflight productivo preparado y validado en CI con GitHub Environment `production`;
- [x] modo `core`/`full` validado en CI;
- [x] comandos `preflight:core` / `preflight:full` preparados y verdes en CI;
- [x] guía exacta `PRODUCTION_ENVIRONMENT_SETUP.md` y validación de inputs preparadas y verdes en CI;
- [x] secrets/variables core cargados en el Environment `production`;
- [x] preflight `core` verde contra Neon real;
- [ ] secrets/variables WhatsApp cargados en GitHub Environment `production` y Render;
- [ ] preflight `full` verde antes del release público; run `36585295135` confirmó que hoy falla sólo por las 5 entradas Meta faltantes.

## Deploy
- [x] GitHub Actions verde;
- [x] Render health verde contra health DB-aware;
- [x] Render productivo desplegando `main` y health verificado durante cutover/estabilización; no hace falta resolver Blueprint para operar Wheel v3 actual.
- [x] frontend productivo Vercel verificado por smoke. GitHub puede mostrar `build-rate-limit` en commits nuevos sin invalidar el artefacto actualmente servido.
- [x] `VITE_API_URL` validado en build productivo y Vercel nuevamente verde;
- [x] variables producción core correctas;
- [x] no se requiere cancha comercial activa al lanzamiento; los lugares de partido son texto libre;
- [x] smoke público automatizado preparado (`production-smoke.yml`);
- [x] smoke ligado al Environment `production` con URLs validadas como orígenes HTTPS;
- [x] smoke productivo valida headers de seguridad y `no-store` en el workflow preparado;
- [x] ejecutar ese smoke contra producción real y confirmar headers efectivos;
- [x] smoke público ejecutado contra Render/Vercel reales;
- [x] smoke autenticado read-only real en producción (`36585954395`); Admin/jugador/seguridad verdes. `Mi Liga` queda pendiente únicamente de que exista la primera pareja real verificada.

## Legal
- [ ] términos revisados profesionalmente en Argentina;
- [ ] privacidad/DNI revisados;
- [ ] riesgos revisados;
- [ ] conducta revisada;
- [ ] seguro/RC/accidentes evaluado.

Solo después de todo lo anterior: **lanzamiento público**.


## Lugar y surface audit — 2026-09-22
- [x] Lugar de partido libre, sin dependencia de cancha precargada.
- [x] Canchas comerciales separadas de menciones de jugadores.
- [x] Todos los endpoints funcionales ordinarios tienen superficie frontend.
- [x] Pausa/disolución tienen confirmación visible entre compañeros.
- [x] Extensión/no-show respetan ventanas temporales en UI.
- [x] Corrección/confirmación/disputa de resultado tienen estados visibles.
- [x] Reporte disciplinario post-partido accesible durante 15 días.
- [x] Render desplegó el HEAD que contiene `PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql`.
- [x] Nuevo `preflight:core` real verde después de ese deploy.


## Gates reales cerrados — 2026-09-22
- [x] Preflight CORE real contra Neon: `ok:true`, engine `wheel-v2`, timezone Argentina, reloj activo, migrations listas, TLS 1.3, 1 admin, outbox sin fallos.
- [x] Production smoke real contra Render + Vercel: `ok:true`, health/DB/CORS/headers/request-id/no-store/endpoints públicos verdes.
- [x] Login Admin real con contraseña + TOTP de 6 dígitos confirmado desde producción.

- [x] fallback SPA del Service Worker verificado y corregido para rutas como `/liga`;


## Estado real de lanzamiento — 2026-09-30

### Verde técnico
- [x] Wheel v3 activo en producción.
- [x] cutover y postcutover reales verdes.
- [x] smoke público real verde.
- [x] smoke autenticado read-only real verde.
- [x] Admin/TOTP real operativo.
- [x] DB/TLS/migraciones/invariantes verdes.
- [x] outbox WhatsApp saneado: mensajes temporales obsoletos expiran antes de enviar.
- [x] UI Wheel v3 sin Elo/desafío manual; extensión extraordinaria oculta fuera de v2.
- [x] documentación técnica fuente actualizada a Wheel v3.

### Bloqueantes externos antes del lanzamiento público
- [ ] cargar las 5 entradas Meta WhatsApp en GitHub Environment `production`;
- [ ] cargar las mismas credenciales/configuración en Render;
- [ ] ejecutar `preflight:full` verde;
- [ ] ejecutar workflow `LA RED WhatsApp production test` y confirmar recepción;
- [ ] revisión profesional en Argentina de términos, privacidad/DNI, riesgos y conducta;
- [ ] evaluar seguro/RC/accidentes y decidir cobertura;
- [ ] acordar RPO/RTO de Neon y completar drill aislado cuando haya una restauración útil que probar.

### Validación diferida a primer uso real
- [ ] verificar `Mi Liga` con la primera pareja real verificada; no crear datos ficticios en producción sólo para cubrir este punto.
