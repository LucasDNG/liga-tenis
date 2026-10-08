# LA RED Tenis — Estado para lanzamiento público

Fecha de actualización: 2026-10-02

## Estado técnico

Wheel v3 está activo en producción desde 2026-09-29.

Verificado en producción:
- cutover v2 -> v3 exitoso;
- postcutover real verde;
- DB/TLS/migraciones/invariantes verdes;
- smoke público real verde;
- smoke autenticado read-only real verde;
- Admin/TOTP operativo;
- jugador real autenticado;
- aislamiento jugador/Admin correcto;
- UI v3 sin Elo ni desafío manual;
- extensión extraordinaria oculta fuera del runtime legacy v2;
- outbox WhatsApp saneado para no enviar recovery/cambios de teléfono/invitaciones vencidas;
- reloj competitivo autoritativo de backend/PostgreSQL.

## No cambiar reglas

El motor competitivo conserva sus reglas. La auditoría funcional de 2026-10-02 detectó defectos de interfaz de revisión de resultados, horarios y estados operativos; ver `FUNCTIONAL_AUDIT_2026-10-02.md` para correcciones y límites de validación.

Hasta que aparezca evidencia real de un defecto:
- no modificar matching;
- no modificar ascenso/descenso;
- no modificar roles;
- no modificar población;
- no modificar incumplimientos;
- no modificar inactividad.

## Bloqueantes externos antes de abrir al público

### 1. WhatsApp Meta

Faltan las cinco entradas productivas:
- PROD_WHATSAPP_PHONE_NUMBER_ID
- PROD_WHATSAPP_ACCESS_TOKEN
- PROD_WHATSAPP_TEMPLATE_NAME
- PROD_WHATSAPP_GRAPH_VERSION
- PROD_WHATSAPP_TEMPLATE_LANGUAGE

Confirmado en GitHub Environment `production` el 2026-10-01 13:36 ART: run `36893204527` detenido exclusivamente por ausencia de los cinco inputs full. Actualización 2026-10-02: los logs de arranque de Render a las 22:43:40 UTC (19:43:40 ART) confirman que también faltan las cinco variables en el servicio `la-red-padle-api`. No se habilitó el dispatcher ni se enviaron mensajes. CI de la corrección de WhatsApp y smoke/postcutover productivo están verdes; el bloqueo es externo de configuración.

Deben cargarse en:
1. GitHub Environment `production`;
2. Render.

Después:
1. ejecutar `preflight:full`;
2. obtener confirmación explícita del propietario antes de habilitar envíos en Render (el dispatcher puede enviar automáticamente) y ejecutar workflow `LA RED WhatsApp production test`;
3. confirmar recepción del mensaje.

### 2. Legal / seguro

Los documentos públicos siguen marcados correctamente como borradores sujetos a revisión profesional.

Pendiente:
- términos;
- privacidad y tratamiento de DNI;
- riesgos;
- conducta;
- seguro / RC / accidentes.

No eliminar las advertencias de borrador hasta completar esa revisión.

### 3. Recuperación Neon

Confirmado:
- restore histórico disponible;
- ventana observada: 8 horas.

Pendiente:
- acordar RPO;
- acordar RTO;
- drill aislado útil;
- definir backup externo sólo si se necesita más retención que la ventana de Neon.

## Validación diferida al primer uso real

Producción tiene jugador verificado, pero todavía no existe una pareja real verificada.

Por eso queda pendiente únicamente observar, con datos reales:
- formación de la primera pareja;
- `Mi Liga`;
- primera asignación automática;
- propuesta/aceptación de fecha;
- primer resultado confirmado;
- siguiente asignación y cambio de roles.

No crear datos ficticios en producción sólo para cubrir estos puntos.

## Criterio de salida

LA RED puede considerarse lista para lanzamiento público cuando:
1. WhatsApp full esté verde y se reciba un mensaje de prueba;
2. legal/seguro tenga revisión/decisión real;
3. recuperación tenga RPO/RTO definidos y un drill aislado registrado.

La ausencia de la primera pareja real no bloquea publicar el sitio; ese flujo se valida naturalmente con los primeros jugadores y debe observarse de cerca.
