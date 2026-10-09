# PRODUCTION_ENVIRONMENT_SETUP.md — LA RED Tenis

## Objetivo
Configurar una sola vez el GitHub Environment `production` para poder ejecutar el workflow manual `LA RED production preflight` contra la infraestructura real sin guardar secretos en Git ni pegarlos en chats.

## Dónde configurarlo
GitHub → repositorio `LucasDNG/la-red-padle` → Settings → Environments → `production`.

Si el Environment todavía no existe, crearlo con el nombre exacto `production`.

## Secrets
Cargar como **Environment secrets**:

| Nombre | Origen |
|---|---|
| `PROD_DATABASE_URL` | Connection string de la Neon final |
| `PROD_JWT_SECRET` | Salida `JWT_SECRET` de `npm run generate:secrets -- --account=admin` |
| `PROD_ADMIN_TOTP_SECRET` | Salida `ADMIN_TOTP_SECRET` del mismo comando |
| `PROD_WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API |
| `PROD_WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API |

## Variables
Cargar como **Environment variables**:

| Nombre | Valor esperado |
|---|---|
| `PROD_API_URL` | Origen HTTPS del backend Render, sin `/api`, por ejemplo `https://la-red-padle-api.onrender.com` |
| `PROD_FRONTEND_URL` | `https://la-red-padle.vercel.app` o el dominio final real |
| `PROD_WHATSAPP_TEMPLATE_NAME` | Nombre exacto de la plantilla aprobada |
| `PROD_WHATSAPP_GRAPH_VERSION` | Versión Graph configurada, formato `vN.N` |
| `PROD_WHATSAPP_TEMPLATE_LANGUAGE` | Normalmente `es_AR` |

## TOTP
El comando local:

```bash
npm run generate:secrets -- --account=admin
```

también imprime `ADMIN_TOTP_URI=otpauth://...`.

Cargar ese URI en la app autenticadora. No guardar el URI ni el secreto TOTP en el repositorio.

## Ejecutar el preflight
Desde GitHub: Actions → `LA RED production preflight` → Run workflow.

Desde una terminal que ya tenga cargadas las variables reales:

```bash
npm run preflight:core
npm run preflight:full
```

Los dos comandos son portables y no requieren definir `PREFLIGHT_MODE` manualmente.

El workflow permite elegir:

- `core`: valida Neon/TLS, JWT, frontend/CORS, TOTP, engine/timezone, reloj global, patch, Admin, cancha e invariantes DB. **No exige Meta WhatsApp.**
- `full`: ejecuta todo lo anterior y además exige la configuración completa de WhatsApp. **Este modo es obligatorio antes del release público.**

El primer paso valida solo los inputs requeridos por el modo elegido y, si falta alguno, muestra **solo los nombres faltantes**, nunca sus valores.

Estado 2026-09-29: `core` está verde con Wheel v3 activo. `full` sigue bloqueado únicamente por las cinco entradas de Meta WhatsApp todavía no cargadas.

Después `npm run preflight:prod` valida de forma read-only:
- configuración productiva;
- TLS de PostgreSQL;
- engine válido (`wheel-v3` en producción actual);
- timezone;
- reloj global no pausado;
- patch de abandono completo;
- al menos un Admin verificado;
- al menos una cancha activa;
- invariantes de `database/verify.sql`;
- estado del outbox WhatsApp.

## Qué no hace
Este workflow:
- no crea usuarios;
- no aplica migraciones;
- no modifica ranking;
- no mueve parejas;
- no escribe secretos;
- no envía mensajes WhatsApp.

Las migraciones productivas siguen ejecutándose al startup del backend o mediante `npm run migrate:prod`.

## Resultado esperado
Primero puede ejecutarse `core` para destrabar Neon/Render sin esperar Meta. Antes del release debe ejecutarse `full` y quedar verde. Si falla por un input ausente, cargar solo ese input y volver a ejecutarlo. Si falla dentro del preflight, corregir la infraestructura/configuración indicada antes de continuar con smoke de producción.


## Ejecutar el smoke público
Después de un `preflight:core` verde y con el backend desplegado:

GitHub → Actions → `LA RED production smoke` → Run workflow.

El workflow usa exclusivamente variables del Environment `production`:
- `PROD_API_URL`
- `PROD_FRONTEND_URL`

No se tipean URLs en cada ejecución. Ambas deben ser orígenes HTTPS puros, sin path/query/fragmento/credenciales. El backend se pasa **sin** `/api`; el smoke agrega los paths API internamente.

El smoke valida de forma no destructiva:
- health DB-aware;
- CORS;
- endpoints públicos críticos;
- frontend SPA.


## Nota 2026-09-22 — canchas
`preflight:core` ya no exige una fila activa en `venues`. Los jugadores escriben libremente el lugar de cada partido. `venues` es únicamente la capa de sedes adheridas/comerciales y puede permanecer vacía al lanzamiento.


## Smoke autenticado read-only

Existe el workflow manual `LA RED authenticated production smoke`. Usa `PROD_DATABASE_URL`, `PROD_JWT_SECRET`, `PROD_API_URL` y `PROD_FRONTEND_URL` desde el Environment `production`; no necesita ni imprime contraseñas/DNI. Genera JWT efímeros sólo para GETs read-only y comprueba:
- rechazo de acceso anónimo;
- `/api/me` y notificaciones de un jugador verificado cuando exista;
- `Mi pareja` y, si existe una pareja verificada real, `Mi Liga`;
- `Admin status`, auditoría, identidad pendiente, canchas, disputas y disciplina;
- que un jugador no pueda entrar a Admin.

Run real 2026-09-29 `36585954395`: success. Había jugador verificado pero ninguna pareja verificada real, por lo que `Mi Liga` quedó correctamente pendiente de un caso real.


## Prueba controlada de WhatsApp

Una vez cargadas las cinco entradas de Meta, usar GitHub → Actions → `LA RED WhatsApp production test`.

Antes de ejecutarlo debe existir confirmación explícita del propietario para el envío real al destino elegido. No lanzar este workflow para comprobar solamente configuración o CI: envía un mensaje. `preflight:full` y postcutover son verificaciones sin envío.

Desde `9a7c1a022a2d3a3fe3983e29d4db24999093dde9`, las cinco variables son obligatorias también en la validación y en el sender/dispatcher. El idioma no tiene fallback: debe coincidir con el idioma aprobado de la plantilla Meta. En Render usar los mismos nombres sin el prefijo `PROD_`.

Coordinar la carga de la quinta variable en Render con la confirmación explícita de habilitación: el dispatcher de producción puede comenzar a enviar el outbox automáticamente cuando la configuración esté completa. El workflow de prueba no controla esa habilitación automática.

El workflow pide:
- `phone`: número de destino en formato internacional;
- `confirmation`: exactamente `SEND-WHATSAPP-TEST`.

Secuencia segura:
1. valida la confirmación;
2. ejecuta `npm run preflight:full`;
3. si todo está verde, ejecuta `npm run whatsapp:test:prod`;
4. envía una única plantilla de prueba al teléfono indicado.

No guarda ni imprime el token de Meta ni el número completo en el resultado del script.


## Seguridad del outbox antes de habilitar Meta

Antes de habilitar WhatsApp se corrigió el tratamiento de mensajes sensibles/temporales. El outbox admite `expired` y el dispatcher valida:
- `password_recovery`: código no usado y no vencido;
- `phone_change`: código no usado y no vencido;
- `pair_invitation`: invitación todavía `pending` y no vencida.

Estado productivo verificado el 2026-09-29: un recovery histórico fue marcado `expired`; queda una invitación de pareja todavía válida en `pending`. Esto evita que al cargar Meta se envíen códigos o invitaciones obsoletas.

Las cinco entradas de Meta deben existir en **dos lugares**:
1. GitHub Environment `production`, para `preflight:full` y el workflow de prueba;
2. Render, para que el backend productivo y su dispatcher realmente puedan enviar.

## Verificación 2026-10-01

Chequeo actualizado a las 13:36 ART: run `36893204527` falló únicamente al validar inputs full porque faltan las cinco entradas Meta en GitHub Environment `production`. No llegó a instalar dependencias ni a ejecutar el preflight DB; no envió mensajes. Este resultado confirma un pendiente de configuración, no un bug de aplicación. Render no fue inspeccionado. Cargar primero GitHub y comprobar full; coordinar la habilitación de Render con autorización explícita para el dispatcher/outbox.

- CI del bloque original WhatsApp: `36586440051`, success.
- Corrección de las cinco variables y manejo de confirmación: `9a7c1a022a2d3a3fe3983e29d4db24999093dde9`, CI `36890000756` success, incluyendo 153 tests puros, integración PostgreSQL, verify:db y frontend build.
- Postcutover productivo con smoke incluido: `36890116464`, success el 2026-10-01 13:11 ART; backend/frontend sirvieron esa misma corrección, engine wheel-v3, DB/TLS/migraciones verdes, readiness true, sin blockers ni estados faltantes/assignments legacy o malformados.
- El chequeo no inyectó variables Meta ni auditó su carga actual en GitHub/Render. No equivale a preflight full ni a confirmación de entrega de WhatsApp.
- No se ejecutó la prueba real ni se enviaron mensajes. Sigue pendiente verificar la configuración Meta en ambos lugares, ejecutar preflight full y obtener autorización explícita antes del envío.
- Disparador temporal de estabilidad neutralizado; no quedó ninguna verificación automática adicional por push.
