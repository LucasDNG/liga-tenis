# LA RED Tenis — Continuidad actual

Actualizado: 2026-10-02. Repositorio: `LucasDNG/la-red-padle`, rama `main`.

## Antes de continuar

- Obtener HEAD real y comprobar Actions y status Vercel de ese SHA. No reutilizar el verde de otro commit.
- Leer `PUBLIC_LAUNCH_STATUS.md`, `FUNCTIONAL_AUDIT_2026-10-02.md`, `WHEEL_V3_SPEC.md`, `PROJECT_RULES.md` y `DECISIONS.md`.
- Para cambios del motor, leer además las auditorías v3, arquitectura y tests. No cambiar reglas por intuición.
- El handoff anterior completo está en `NEXT_CHAT_HANDOFF_HISTORY_2026-10-02.md`; sus checkpoints previos al cutover son históricos.

## Producción

- Wheel v3 activo desde 2026-09-29T04:36:57.554Z; cutover run `36522396511` success.
- Postcutover completo del 2026-10-01: run `36890116464` success; DB/TLS/migraciones, 24 controles DB, readiness y 6 endpoints públicos verdes, sin assignments legacy/malformados ni estados v3 faltantes.
- Al retomar el 2026-10-02, HEAD `2fdd7e07ef6e5b6843ede72cb910b150edbf6ba1`; CI `36963739285` success y Vercel success.
- Smoke HTTP nuevo del 2026-10-02: wheel-v3, DB ok, CORS, cabeceras y no-store correctos; backend y frontend sirven ese mismo SHA. La cuota de Vercel ya no figura como bloqueo actual.
- Render: workspace autorizado `la-red-padel` / `tea-dairbou7bikc739q0j1g`; servicio `srv-damkrpid0e5s73fr6eu0`, deploy `dep-davivkg473hc73f6i9s0` live al iniciar esta auditoría.
- No repetir el cutover ni volver a v2 cambiando solo el engine. No retirar legacy durante esta estabilización.

## Auditoría funcional actual

- Se corrige la revisión de resultados: mostrar versiones, marcador A/B con nombres, ganador, fecha y vencimiento; permitir enviar otra versión cuando el rival cargó primero.
- Programación y fecha/hora jugada se envían explícitamente en Argentina UTC-03. Se elimina la fecha de resultado inventada a las 12:00.
- Inactividad muestra que no se buscan rivales; errores de carga en Mi Liga/Mi pareja/perfil se muestran con reintento; ranking vacío tiene mensaje explícito.
- Admin y dispatcher comparten validación de las cinco variables de WhatsApp. Configurado no se presenta como prueba de entrega. El estado inicial del panel no afirma salud sin datos.
- Se preservaron todos los avances posteriores de main: vencimiento del outbox, cinco variables obligatorias, smoke autenticado y verificación de dominio Meta.
- No se cambiaron reglas competitivas, schema ni datos productivos.
- Validación y seguimiento del commit de esta auditoría: ver `FUNCTIONAL_AUDIT_2026-10-02.md`; comprobar CI del HEAD antes de continuar.

## WhatsApp: bloqueo externo confirmado

- GitHub Environment production: run `36893204527` (2026-10-01) confirmó ausencia de los cinco inputs Meta.
- Render: logs del 2026-10-02 22:43:40 UTC confirman ausencia de PHONE_NUMBER_ID, ACCESS_TOKEN, TEMPLATE_NAME, GRAPH_VERSION y TEMPLATE_LANGUAGE (prefijo WHATSAPP_).
- La etiqueta de verificación del dominio Meta no configura el envío de WhatsApp.
- Cargar los cinco valores en GitHub con prefijo PROD_ y en Render sin PROD_. No guardar ni imprimir valores en Git/chat.
- Configurar Render puede activar envíos automáticos: obtener autorización explícita para habilitar el dispatcher y para el mensaje de prueba. Este bloque solo inspeccionó, no envió mensajes.
- Después: preflight full, workflow de prueba autorizado y confirmación de recepción. `sent` del outbox indica aceptación por Meta, no entrega comprobada.

## Pendientes y límites

- El smoke autenticado productivo histórico `36585954395` pasó Admin, jugador y separación de permisos.
- No hay sesión Admin disponible en este chat; el intento manual del 2026-09-29 mostró acceso no autorizado. No inferir de eso una caída del sistema de autenticación.
- Según el último smoke documentado no existía pareja real verificada: observar primera pareja, assignment, programación, confirmación y reasignación cuando existan. No crear fixtures en producción.
- La prueba local de UI usa datos ficticios y no sustituye la observación del primer partido real.
- Legal/seguro y RPO/RTO/drill Neon siguen pendientes externos; consultar estado de lanzamiento. No borrar avisos de borrador legal.
- Configuración real de Render observada: build npm install, auto-deploy por commit, healthCheckPath vacío. Difiere de render.yaml; registrar y alinear en un trabajo operativo explícito. El endpoint /api/health responde correctamente.

## Método

- Fuente de verdad: GitHub main y documentación vigente, no ZIPs ni memoria del chat.
- Push directo a main autorizado; cambios solo por bugs comprobados; validar con CI Node 22/PostgreSQL 16.
- Runtime local disponible Node 24: distinguir sus pruebas del CI autoritativo.
- No imprimir secretos ni datos personales; no enviar WhatsApp sin autorización explícita.

## Cierre verificado — 2026-10-02

- Correcciones publicadas en main: `d9a289318f3042cf81a087cf5abab50ea4cc4a3c`.
- CI [37075045528](https://github.com/LucasDNG/la-red-padle/actions/runs/37075045528): backend y frontend success, incluyendo Node 22, PostgreSQL 16, verificación DB e integración.
- Smoke HTTP posterior al despliegue: ok, wheel-v3, DB ok, seis endpoints públicos, CORS/cabeceras/no-store correctos. Backend y frontend reportan el SHA d9a2893 completo.
- Ranking publicado comprobado en navegador: mensaje de categoría/circuito sin parejas visible.
- Este cierre no amplía la cobertura privada: nueva inspección visual Admin y primer partido real siguen pendientes. WhatsApp continúa sin las cinco variables; no se enviaron mensajes.
