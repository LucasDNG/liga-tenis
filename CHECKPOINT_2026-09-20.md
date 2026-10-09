# Checkpoint de estabilización — 2026-09-20

Este checkpoint representa el estado real de LA RED inmediatamente antes del próximo push y de la búsqueda sistemática de inconsistencias/bugs.

## Versión de código de referencia
- candidato completo: `LA_RED_FINAL_2026-09-20_v11.zip`
- package: `5.0.9`
- motor: `wheel-v2`
- backend: Node + Express
- frontend: React + Vite
- DB: PostgreSQL / Neon
- timezone oficial: `America/Argentina/Buenos_Aires`

## Estado real ya probado localmente

### Base
- La Neon histórica fue eliminada accidentalmente antes del corte y ya no existe como backup.
- Se creó una Neon nueva y limpia.
- `database/schema.sql` fue cargado sobre la base nueva.
- La base recibió también los cambios posteriores de identidad documental/reenvío necesarios para llegar al esquema actual.
- La conexión local backend → Neon funciona.

### Backend
- `/api/health` funciona con `wheel-v2`.
- El error inicial de `DATABASE_URL` vieja fue resuelto.
- El crash por export faltante `requestIdentityResubmission` fue corregido.
- El error PostgreSQL `42P08` al verificar identidad fue corregido.
- La verificación administrativa real fue probada con éxito.
- La documentación temporal de DNI se purga al cerrar la verificación.

### Identidad y cuentas
- registro con DNI;
- frente + dorso obligatorios;
- cuenta `pending` hasta revisión;
- Admin puede ver frente/dorso;
- Admin puede verificar/rechazar;
- Admin puede pedir nuevas fotos sin rechazar la cuenta;
- jugador puede reenviar desde Mi cuenta;
- login jugador separado del login Admin;
- ruta Admin privada: `/admin-la-red`;
- primer propietario se promueve por consola.

### Frontend
- identidad visual de LA RED restaurada;
- cancha nocturna de pádel + azul/verde + glassmorphism;
- navegación Login ↔ Crear cuenta corregida;
- pasada global de espaciado/jerarquía aplicada a páginas internas;
- header autenticado y cards reorganizados.

### Admin
- acceso privado funcionando;
- panel visible;
- identidad pendiente funcionando;
- verificación real funcionando;
- auditoría/canchas/disputas/disciplina/salud del sistema están implementados y pendientes de recorrido completo con datos reales.

### Tests
- suite pura/simulación: 20/20 verde en el candidato actual.
- simulación larga incluida en la suite.
- los tests automáticos todavía no sustituyen las pruebas de integración PostgreSQL/concurrencia que faltan.

## No probado todavía de punta a punta
- formación de pareja completa con dos jugadores verificados;
- invariantes reales de membresía bajo concurrencia;
- primera asignación automática de rueda;
- propuesta/aceptación de fecha y cancha;
- extensión extraordinaria;
- no-show;
- carga/confirmación/disputa/auto-validación de resultado;
- ladder swap;
- ascenso/descenso;
- pausa/reactivación;
- disolución;
- disciplina real;
- WhatsApp real con Meta;
- TOTP Admin real;
- Render/Vercel contra la Neon nueva;
- build/gates de producción completos.

## Entorno local a normalizar antes del release
- El proyecto declara Node 22, pero durante pruebas se observó Node 24 local. Antes del release hay que probar con Node 22.
- La connection string actual genera un warning de `pg` por `sslmode=require`; antes del release se debe revisar la configuración recomendada y dejarla explícita/estable.
- WhatsApp y TOTP todavía pueden estar sin configurar localmente.

## Regla para continuar
Desde este checkpoint no se agregan funciones por intuición. El siguiente bloque es:

**push → verificar repo/CI → recorrer producto real → registrar bug/inconsistencia → corregir → actualizar docs/tests en el mismo cambio.**

Los `.md` son la memoria oficial del proyecto. Si chat y documentación difieren, primero se corrige la documentación y luego se implementa.

## Post-push: equilibrio de categorías
La auditoría por simulación cambió una regla: el descenso deja de ser completamente independiente de población. Mantiene 3 derrotas consecutivas como base, pero baja a 2 cuando la categoría tiene al menos 5 parejas activas más que la inmediatamente inferior. Ver `SIMULATION_AUDIT_2026-09-20.md`.


## Post-push: validación ampliada de equilibrio
La auditoría ampliada a 5/10/20 años confirmó la válvula vigente `gap >= 5 => 2 derrotas` frente a P3/R3, P3/R5, gaps 4/6 y P4/R3. R5 queda descartado. La suite sube a 20/20 con regresiones longitudinales. El siguiente bloque es integración PostgreSQL del movimiento real.


## Integración PostgreSQL automatizada
Se incorpora un job de CI con PostgreSQL 16 y `npm run test:integration`. El bloque cubre frontera gap 4/5, entrada de descenso #2, deuda remanente, métrica posicional legacy, ascenso al fondo, retry concurrente exactamente una vez, movimientos concurrentes hacia la misma categoría y no-show objetado sin strike atribuible. CI confirmado en Node 22 + PostgreSQL 16: 20/20 tests puros y 7/7 tests de integración PostgreSQL verdes; frontend build verde.


## Bloque pareja → rueda concurrente
Se prepararon correcciones de orden de locks en `acceptInvitation()`, serialización por categoría de destino y prioridad explícita de bye por antigüedad. Se agregaron 5 pruebas PostgreSQL adicionales: la integración queda en 12/12 escenarios verdes en CI sobre Node 22 + PostgreSQL 16; frontend build verde.


## Bloque programación → resultado en validación
Se agregaron 7 escenarios PostgreSQL end-to-end para programación, revisión de resultado, confirmación rival, versiones coincidentes/incompatibles, resolución Admin, auto-validación por silencio y deadline de 30 días. También se corrigió la falta de notificación al resolver una disputa administrativa. CI confirmado: 20/20 tests puros + 19/19 integración PostgreSQL verdes en Node 22/PostgreSQL 16; frontend build verde.


## Bloque edge cases competitivos en validación
Se prepararon correcciones para límite superior de la ventana de extensión, atribución cuando ambas parejas actuaron pero una tarde y recálculo de una métrica posicional legacy al pausar voluntariamente. Se agregaron 10 escenarios PostgreSQL de vencimiento, extensión, no-show, pausa y disolución. CI confirmado: 20/20 tests puros + 29/29 integración PostgreSQL verdes en Node 22/PostgreSQL 16; frontend build verde.


## Hardening lateral en validación
Se corrigió `verify.sql` para distinguir correctamente el estado de reenvío de DNI y se agregó `npm run verify:db` como gate destructivo exclusivo de `TEST_DATABASE_URL`. Se prepararon 6 pruebas adicionales sobre disciplina, reloj global, dedupe, TOTP y reenvío de identidad. CI confirmado: `verify:db` verde, 20/20 tests puros, 35/35 integración PostgreSQL y frontend build verde.


## Preflight de producción en validación
Se eliminó el `rejectUnauthorized:false` productivo y se preparó `npm run preflight:prod`. También se agregaron tests puros de configuración para SSL, JWT, HTTPS/CORS, TOTP y WhatsApp. CI confirmado: 26/26 tests puros, 35/35 integración PostgreSQL, `verify:db` y frontend build verdes. El preflight real contra Neon sigue pendiente hasta cargar variables/credenciales reales.


## Lesión / abandono en validación
Se detectó que el match oficial no persistía quién abandonó aunque la versión cargada sí lo hacía. Se agregó `matches.abandoned_pair_id`, patch para la base existente, verificación de consistencia y 4 escenarios PostgreSQL que cubren cero games, ladder, rachas, ascenso/descenso y validación del abandonante. CI confirmado: 26/26 tests puros + 39/39 integración PostgreSQL + `verify:db` + frontend build verdes.


## Hardening de logs y outbox en validación
La revisión de release detectó que el middleware global hacía `console.error(err)`; errores PostgreSQL pueden incluir en `detail` valores conflictivos como un DNI. Se reemplaza por logging estructurado/sanitizado que en producción no conserva mensaje, SQL, detail ni valores de usuario.

También:
- el rate limit de auth se separa por IP + endpoint para no compartir cupo entre login/registro/recuperación;
- se agregan regresiones puras de sanitización y claves de rate limit;
- se agrega integración de outbox que prueba fallo Meta 500 -> `failed` -> retry -> `sent`;
- se actualiza el checklist de release: disciplina y retries/outbox ya estaban cubiertos, pero la documentación había quedado atrasada.

CI confirmado: 29/29 tests puros + 40/40 integración PostgreSQL + `verify:db` + frontend build verdes.


## Deploy/migración/health — VERDE
CI confirmó:
- 30/30 tests puros;
- 42/42 integración PostgreSQL;
- `verify:db` verde;
- frontend build verde;
- migración de abandono idempotente;
- health DB-aware;
- errores 500 productivos genéricos;
- Blueprint Render parseable por el repo y alineado con los campos oficiales usados.

El siguiente gate ya no es simulación: ejecutar migración/preflight contra Neon real y validar Render/Vercel/Meta/TOTP.


## Smoke público automatizado en validación
Vercel reportó status `success` sobre el commit actual. Se agrega smoke no destructivo de producción para health DB-aware, CORS, endpoints públicos y frontend SPA, disponible como `npm run smoke:prod` y workflow manual. Render sigue pendiente de deploy/status real. CI confirmado: 32/32 tests puros + 42/42 integración PostgreSQL + `verify:db` + frontend build verdes.


## TOTP/CORS fail-closed en validación
Se elimina el bypass implícito de TOTP en producción, se sube el mínimo del secreto a ~160 bits, se impide reutilizar JWT/TOTP y se valida/normaliza `FRONTEND_URL` como origen CORS real. CI confirmado: 36/36 tests puros + 43/43 integración PostgreSQL + `verify:db` + frontend build; Vercel `success`.


## TOTP/CORS — VERDE
CI confirmó 34/34 tests puros + 42/42 integración PostgreSQL + `verify:db` + frontend build. Vercel reportó `success`.

Además se prepara un generador local de secretos JWT/TOTP para evitar creación manual o exposición en chats. Estado del generador: pendiente de CI.


## Migración startup multi-plan en validación
Se corrige la dependencia de `preDeployCommand` de Render: la migración corre antes de abrir el puerto en producción y usa advisory lock para serializar instancias concurrentes. Se agrega regresión PostgreSQL concurrente. CI confirmado: 36/36 tests puros + 44/44 integración PostgreSQL + `verify:db` + frontend build; Vercel `success`.


## Login Admin HTTP en validación
Se prepara prueba end-to-end del login Admin en producción y se hace obligatorio el código TOTP de seis dígitos en el frontend. CI confirmado: 37/37 tests puros + 44/44 integración PostgreSQL + `verify:db` + frontend build; Vercel `success`.


## WhatsApp configurable/sanitizado en validación
Se parametriza la versión Graph, se valida configuración Meta y se sanitizan errores del outbox. Estado: pendiente de CI.


## Preflight DB explícito en validación
Se extrae un preflight DB read-only con chequeo explícito de patch y reloj global. Se agrega integración que valida estado sano, reloj pausado y constraint ausente. Estado: pendiente de CI.


## Paridad schema/patch en validación
El primer CI del preflight reforzado detectó que el CHECK de abandono era anónimo en `schema.sql`, mientras el patch productivo lo crea con nombre. Se normaliza el schema base a `matches_abandonment_consistency`. Estado: pendiente de CI.


## Preflight DB explícito — VERDE
CI confirmado: 37/37 tests puros + 46/46 integración PostgreSQL + `verify:db` + frontend build; Vercel `success`. El preflight sano pasa y falla explícitamente ante reloj pausado o patch incompleto.


## Gate VITE_API_URL — VERDE
Confirmado sobre `b4640a863b8f41ae744798731b0184becaa02d85`:
- 39/39 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

El frontend de producción ya no puede compilar con fallback silencioso a `/api`.


## Workflow de preflight real — VERDE
Confirmado sobre `a29c047a8233671d5126345444a483b86359bb4d`:
- 39/39 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

El workflow manual de preflight de producción está listo y es read-only. Siguiente gate: cargar secretos/variables reales en GitHub Environment `production` y ejecutarlo contra Neon.


## Bootstrap de Environment production — VERDE
Confirmado sobre `4a6508001ff6a1fa3e63b5b2af3035d75cce49c2`:
- 39/39 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

La guía `PRODUCTION_ENVIRONMENT_SETUP.md` y la validación previa de inputs del workflow están listas. El siguiente gate requiere cargar secretos/variables reales en GitHub Environment `production` y ejecutar el preflight contra Neon.


## Preflight core/full — VERDE
Confirmado sobre `495902ce8950eabcc4fde18435e7ae0bc3e6f072`:
- 39/39 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

El preflight `core` permite validar Neon/Render/TOTP/CORS sin bloquearse por Meta. El modo `full` conserva WhatsApp como gate obligatorio antes del release público.


## Comandos explícitos de preflight — VERDE
Confirmado sobre `7836e8854eb0a4150cfe6391e073b891e0f24c39`:
- 39/39 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

Los comandos `preflight:core` y `preflight:full` quedaron validados. El siguiente gate requiere infraestructura real.


## Smoke Environment — VERDE
Confirmado sobre `079272a061d150db2c712e1a64f2474cc17bcc4e`:
- 40/40 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

El smoke público queda ligado a variables del Environment `production` y valida orígenes HTTPS estrictos.


## Background/rate-limit hardening — VERDE
Confirmado sobre `f1dbea68dcbe3a347c13373a5352f171539cad8b`:
- 44/44 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

Los jobs background ya no bloquean uno al otro ante fallos y sus errores productivos se registran sin payload crudo. El rate limiter quedó acotado y fail-closed ante saturación.


## Security headers — VERDE
Confirmado sobre `023bc126308201b68bf0c3ea229e577b02753602`:
- 46/46 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

Backend oculta `X-Powered-By` y backend/frontend aplican headers de seguridad de bajo riesgo sin restringir recursos necesarios de la SPA.


## No-store/startup hardening — VERDE
Confirmado sobre `e2aa61e5d2c9472b8f8af292636de74903df1319`:
- 51/51 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

Tokens/respuestas privadas quedan explícitamente no-cacheables y los errores fatales de startup ya no imprimen payload crudo en producción.


## Hardening automatizable final — VERDE
Estado confirmado al cierre:
- 65/65 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db`;
- frontend build;
- Vercel `success`.

Últimos cierres:
- graceful shutdown SIGTERM/SIGINT;
- separación liveness/readiness;
- shutdown budget Render;
- manejo explícito de errores idle del pool PostgreSQL;
- production smoke de headers/no-store/request-id;
- installs backend/preflight/smoke con `npm ci`;
- `X-Request-ID` server-side y correlación segura;
- workflows con `contents: read` y timeouts.

A partir de este punto los gates principales restantes requieren infraestructura/credenciales reales.


## Limpieza de caché Vite versionada
Se detectó y eliminó `frontend/.vite/deps/`, que contenía artefactos generados de Vite y sourcemaps versionados accidentalmente. `.gitignore` ahora cubre `frontend/.vite/`.

Este cambio es de higiene/reproducibilidad y no modifica funcionalidad. La deuda de generar legítimamente `frontend/package-lock.json` sigue separada y pendiente.


## Cancelación visible de invitación de pareja
Se corrigió una omisión de UX: el backend ya permitía cancelar una invitación saliente, pero el frontend no ofrecía esa acción. `Mi pareja` ahora muestra la invitación enviada, permite cancelarla y evita ofrecer una segunda mientras la primera siga pendiente.


## Acciones de pareja coherentes con su estado
`Mi pareja` ya no muestra PAUSAR y REACTIVAR simultáneamente: activa => pausa; pausada => reactivación. Es un ajuste UX sobre reglas existentes, sin cambio de motor.


## Preflight TLS contra Neon
La primera ejecución real alcanzó Neon y reveló que `pg_stat_ssl` no era una prueba válida del tramo cliente→endpoint de Neon. Se reemplazó por verificación del socket TLS real de `node-postgres`. La exigencia TLS sigue siendo fail-closed y CI quedó verde.


## Lugar libre + recorrido completo de usuario
Se eliminó la dependencia funcional de una cancha precargada para coordinar partidos. Los jugadores proponen fecha y `location_text`; la mención no implica afiliación. `venues` queda como catálogo comercial separado y solo active+associated se publica.

La pasada de journey cerró huecos de UI en pausa/disolución, extensión, no-show, revisión/confirmación de resultados y reportes disciplinarios posteriores al partido. Existe una regresión que exige que todo endpoint funcional ordinario tenga superficie frontend.

Último código verificado antes de esta actualización documental: `fe67dbb3239d4c9490d0e2cd5fd82743bf0dde1c` — 71/71 puros, 46/46 PostgreSQL, verify:db, frontend build, Actions y Vercel verdes.


## Producción real — gates cerrados el 2026-09-22
Se validó la infraestructura real:
- preflight CORE: verde contra Neon;
- Render startup con migrations reales: verde;
- health DB-aware: verde;
- production smoke contra Render/Vercel: verde;
- CORS, headers, request-id y no-store efectivos: verdes;
- login Admin real con contraseña + TOTP: verde.

Próximo frente externo: recuperación Neon (plan/restore window + RPO/RTO + drill), luego WhatsApp Meta y preflight FULL.


## Service Worker de producción — VERDE
Se detectó en navegador real un error de fallback al navegar a `/liga`. Se corrigió el Service Worker para no interceptar APIs/otros orígenes, usar el shell SPA en navegaciones fallidas y devolver siempre una `Response`. CI confirmado: 71/71 tests puros + 46/46 PostgreSQL + frontend build verde; Vercel `success`.
