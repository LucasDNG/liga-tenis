# Auditoría funcional de estabilización — 2026-10-02

## Alcance y evidencia

Repositorio `LucasDNG/la-red-padle`, main. No se modifican reglas competitivas, migraciones ni datos productivos. La revisión comenzó el 2026-09-29 y se reanudó sobre `2fdd7e07ef6e5b6843ede72cb910b150edbf6ba1` el 2026-10-02, conservando los avances intermedios de WhatsApp y la etiqueta de dominio Meta.

- CI de esa base: [36963739285](https://github.com/LucasDNG/la-red-padle/actions/runs/36963739285), success; status Vercel success.
- Smoke HTTP nuevo: `ok:true`, `engine:wheel-v3`, `database:ok`, seis endpoints públicos, CORS, cabeceras, request ID y no-store correctos. Backend y frontend sirven el mismo SHA `2fdd7e0...` antes de publicar esta corrección.
- Render deploy `dep-davivkg473hc73f6i9s0`: live. Servicio `srv-damkrpid0e5s73fr6eu0` del workspace confirmado `la-red-padel`.
- El postcutover completo DB más reciente documentado es [36890116464](https://github.com/LucasDNG/la-red-padle/actions/runs/36890116464), del 2026-10-01. El smoke HTTP de este bloque no sustituye ese chequeo de invariantes DB.

## Cobertura funcional

- Ranking: pantalla pública y estados vacíos inspeccionados; filtros de circuito y categoría presentes. Se corrige la ausencia de mensaje para categoría vacía y se distinguen carga/error/vacío.
- Registro: formulario público, campos requeridos, frente/dorso del DNI y enlaces legales inspeccionados. No se envió un registro ficticio ni se aceptaron términos en nombre de otra persona.
- Formar pareja: contrato y estados de invitación/aceptación/cancelación revisados en código. La observación productiva con dos jugadores reales sigue pendiente.
- Mi Liga: contrato v3 revisado y pantalla corregida probada con API ficticia aislada; errores de carga visibles y reintento, sin pantalla permanentemente en “Cargando...”.
- Asignación/programación: no se cambia matching. Se prueba el envío de fecha/lugar desde navegador local y su representación de vuelta.
- Resultado: se prueba una versión recibida, la carga de una versión diferente y la pantalla final de disputa con ambas versiones visibles. La aplicación deportiva del resultado sigue cubierta por CI PostgreSQL, sin partidos ficticios en producción.
- Inactividad: se prueba que la pareja inactiva informa que no recibe asignaciones y ofrece el vínculo a Mi pareja; se muestra fecha de reactivación automática cuando el API la provee.
- Admin: indicador WhatsApp y estado inicial auditados en código. No hubo sesión Admin disponible para una nueva auditoría visual privada. El smoke autenticado histórico [36585954395](https://github.com/LucasDNG/la-red-padle/actions/runs/36585954395) cubrió Admin, jugador y separación de permisos; no se presenta como ejecución nueva.

## Bugs comprobados y correcciones

### Revisión de resultados bloqueada en frontend

Antes, `otherVersion && !myVersion` reemplazaba todo el formulario por un botón de confirmación. No mostraba el marcador a confirmar ni permitía cargar una versión discrepante, aunque el backend soporta esa operación.

Ahora se muestran ganador, marcador, orientación A/B con nombres, fecha jugada y vencimiento. Confirmar y enviar una versión propia son opciones accesibles. En disputa se muestran ambas versiones y se espera Administración. No se alteran plazos ni resolución deportiva.

### Horarios ambiguos y hora jugada inventada

Programación enviaba el texto de `datetime-local` sin zona. El backend usa `new Date(scheduledAt)`, por lo que la interpretación dependía de la zona del servidor. Resultado usaba solo un día y fijaba artificialmente las 12:00 de Argentina: un partido de la mañana podía rechazarse como futuro y se perdía la hora real.

Los dos controles ahora indican Argentina y envían timestamps ISO con UTC-03 explícito. La corrección de una versión precarga su hora de Argentina. Los plazos siguen determinados por PostgreSQL/backend; el dispositivo solo aporta la hora declarada del partido.

### Estados de UI engañosos

Una pareja inactiva sin assignment veía “La rueda está buscando tu próximo rival”. La pantalla ahora distingue la inactividad. Errores iniciales de Mi Liga/Mi pareja/perfil dejaban “Cargando...” sin mostrar el error; ahora permiten reintentar. Ranking sin filas tiene mensaje de vacío.

### Falso positivo de WhatsApp en Admin

Admin comprobaba solo tres variables, mientras el sender vigente exige cinco. Ahora Admin, sender y preflight comparten validación de presencia/formato. El API Admin devuelve solo nombres ausentes/inválidos, nunca valores. La UI dice “configurado · entrega no verificada”, sin presentar configuración como entrega comprobada. El panel no afirma salud antes de recibir datos.

## WhatsApp y operación

- Evidencia directa nueva: logs de Render del 2026-10-02 22:43:40 UTC (19:43:40 ART) indican ausentes `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE_LANGUAGE`.
- GitHub Environment production: [36893204527](https://github.com/LucasDNG/la-red-padle/actions/runs/36893204527) del 2026-10-01 confirmó los cinco inputs ausentes allí. No se releyeron valores secretos.
- El postcutover no inyecta variables Meta; su warning aislado no prueba configuración de Render. Los logs de arranque sí aportan evidencia de Render.
- No se configuraron variables, no se habilitaron envíos y no se ejecutó retry ni test WhatsApp. Habilitar Render puede despachar la cola automáticamente y necesita autorización explícita de envío.
- La etiqueta Meta del dominio está preservada; no equivale a configurar WhatsApp.
- Render real usa build `npm install`, auto-deploy por commit y healthCheckPath vacío. Difiere del Blueprint documentado. El endpoint `/api/health` funciona; alinear la configuración operativa en un bloque explícito, sin cambiarla silenciosamente durante esta auditoría.
- Vercel está success en la base actual; no se conserva el antiguo bloqueo de cuota como estado vigente.

## Validación de este bloque

- Tests unitarios y de regresión ejecutados localmente con Node 24; Node 22/PostgreSQL 16 se verifican en CI al publicar.
- Prueba de navegador aislada, sin DB ni requests productivas: rival cargó 6–4/6–3; se envió 4–6/4–6 con ganador alternativo y la pantalla pasó a “Esperar resolución”, mostrando ambas versiones.
- El fixture verificó el payload: jugado a las 09:15 ART se envió como 12:15Z; propuesta a las 21:30 ART se envió como 00:30Z del día siguiente y volvió a mostrarse a las 21:30.
- Estado inactivo y fallo HTTP de carga simulados: mensaje de inactividad y error con botón REINTENTAR visibles.
- Build de producción verificado; CI final y versión desplegada deben consultarse por el commit que publique esta auditoría. No declarar todos los recorridos reales completados: falta primera pareja/partido real y sesión Admin para nueva inspección visual privada.

## Continuidad

`NEXT_CHAT_HANDOFF.md` queda corto y vigente; el contenido anterior se conserva en `NEXT_CHAT_HANDOFF_HISTORY_2026-10-02.md`. Se actualizan los encabezados fuente que todavía declaraban v3 pendiente y la contradicción del runbook sobre quiesce manual.

## Cierre verificado — 2026-10-02

- Correcciones publicadas en main: `d9a289318f3042cf81a087cf5abab50ea4cc4a3c`.
- CI [37075045528](https://github.com/LucasDNG/la-red-padle/actions/runs/37075045528): backend y frontend success, incluyendo Node 22, PostgreSQL 16, verificación DB e integración.
- Smoke HTTP posterior al despliegue: ok, wheel-v3, DB ok, seis endpoints públicos, CORS/cabeceras/no-store correctos. Backend y frontend reportan el SHA d9a2893 completo.
- Ranking publicado comprobado en navegador: mensaje de categoría/circuito sin parejas visible.
- Este cierre no amplía la cobertura privada: nueva inspección visual Admin y primer partido real siguen pendientes. WhatsApp continúa sin las cinco variables; no se enviaron mensajes.
