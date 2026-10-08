# USER_JOURNEY_AUDIT_2026-09-22.md

## Objetivo
Verificar que una persona pueda usar LA RED desde la web sin consola, scripts ni llamadas manuales a API. La existencia de una función backend no cuenta como UX terminada si el usuario no puede descubrir y ejecutar la acción correspondiente.

## Resultado
El inventario automático de rutas confirma que todos los endpoints funcionales ordinarios tienen superficie frontend. Se excluyen únicamente `/api/live` y `/api/health`, porque son endpoints operativos.

## Recorrido de jugador

### 1. Descubrimiento público
- Inicio, ranking, próximos partidos, resultados recientes, perfiles y récords.
- Si existen sedes comerciales activas y marcadas como adheridas, Inicio muestra “Canchas adheridas a LA RED”.
- Un lugar escrito por jugadores en un partido nunca se incorpora automáticamente a esa sección.

### 2. Alta y acceso
- Crear cuenta con datos, DNI frente/dorso y aceptaciones legales.
- Login por DNI + contraseña.
- Recuperación de contraseña desde la web.
- Cuenta pendiente puede recorrer el sitio, pero no competir.
- Reenvío de documentación solicitado por Admin se resuelve desde Mi cuenta.

### 3. Formación de pareja
- Jugador verificado elige compañero disponible.
- Envía invitación, ve la invitación saliente y puede cancelarla.
- Receptor ve categoría resultante y acepta.
- No existe botón “desafiar”: una vez formada la pareja, la rueda automática asigna el rival.

### 4. Partido asignado
Mi liga muestra rival, plazo y WhatsApp de los integrantes del rival mientras el compromiso está abierto.

### 5. Coordinar
- Proponer fecha/hora.
- Escribir libremente Lugar / cancha.
- El rival ve la propuesta y la acepta.
- Solo la propuesta aceptada queda oficial y aparece en Próximos.
- Texto visible: la mención del lugar no implica vínculo comercial con LA RED.

### 6. Excepciones de plazo
- CAUSA EXTERNA aparece solo dentro de la ventana técnica válida de 48 h.
- El voto propio queda visible y no se ofrece duplicarlo.
- Si ambos votan, se informa la extensión de 15 días.

### 7. No-show
- REPORTAR NO-SHOW aparece solo después del horario oficial.
- La pareja reportada dispone de OBJETAR NO-SHOW.
- El reportante ve que el caso está pendiente.

### 8. Resultado
- Resultado normal: ganador, fecha y sets estructurados.
- Lesión/abandono: ganador + abandonante + fecha, sin inventar games.
- Si el rival cargó primero, aparece CONFIRMAR RESULTADO CARGADO.
- Si el usuario cargó primero y todavía puede editar, su versión vuelve precargada y aparece GUARDAR CORRECCIÓN.
- Si las versiones chocan, la pantalla indica disputa y espera de Admin.

### 9. Disciplina
- Durante un compromiso abierto puede reportarse pareja o jugador rival.
- Después de cerrar, Mi liga conserva hasta 15 días una lista de partidos reportables con formulario visible.

### 10. Pausa, disolución y reactivación
- PEDIR PAUSA sin compromiso abierto.
- PAUSAR AL TERMINAR con compromiso abierto.
- Compañero ve CONFIRMAR PAUSA.
- Estados de espera son visibles.
- Pareja pausada ve REACTIVAR.
- PEDIR DISOLUCIÓN y CONFIRMAR DISOLUCIÓN son visibles según quién inició.
- Se informa el estado de espera/cierre.

## Recorrido Admin
- Login privado con DNI, contraseña y TOTP.
- Verificación/reenvío/corrección de identidad.
- Resolución de disputas.
- Cola de disciplina.
- Pausa/reanudación global.
- Mantenimiento y outbox.
- Catálogo comercial de canchas: alta y edición de nombre, dirección, Instagram/web, link de reserva, activa, adherida, reservas y orden.
- Solo active+associated se publica al público.

## Regresión automática
`tests/frontend-user-journey.test.js` extrae las rutas de `src/app.js` y las llamadas API de `frontend/src/App.jsx`. Falla si un endpoint funcional ordinario queda sin llamada frontend.

## Estado verificado
- 70/70 tests puros.
- 46/46 tests PostgreSQL.
- `verify:db` verde.
- frontend build verde.
- GitHub Actions verde.
- Vercel success.

## Pendiente real de producción
El código está listo, pero Render debe desplegar este HEAD para que startup aplique `PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql`. Después se debe ejecutar un `preflight core` NUEVO desde GitHub Actions; reintentar el workflow anterior usaría su commit histórico y no valida esta versión.
