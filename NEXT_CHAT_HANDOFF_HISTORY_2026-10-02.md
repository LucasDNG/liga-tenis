# Archivo histórico del handoff

Este archivo conserva el handoff anterior completo. Contiene decisiones y estados superados; no usarlo como instrucción operativa actual. Leer `NEXT_CHAT_HANDOFF.md` primero.

# NEXT_CHAT_HANDOFF.md — LA RED Tenis

## Instrucción obligatoria

Continuar desde el repositorio `LucasDNG/la-red-padle`, rama `main`. No reconstruir el proyecto desde memoria del chat ni desde ZIPs históricos.

Primera acción en un chat nuevo: obtener el HEAD real de `main` y comprobar GitHub Actions + status Vercel de ese HEAD. No afirmar CI verde antes de verificarlo.

Después leer, como mínimo:

1. `WHEEL_V3_SPEC.md`
2. `WHEEL_V3_AUDIT_2026-09-28.md`
4. `CHECKPOINT_2026-09-20.md`
4. `PROJECT_RULES.md`
5. `DECISIONS.md`
6. `SIMULATION_AUDIT_2026-09-20.md`
7. `AUDIT_2026-09-20.md`
8. `TEST_SCENARIOS.md`
9. `ARCHITECTURE.md`
10. `PROJECT_JOURNEY.md`
11. `RELEASE_MANIFEST.md`
12. `RELEASE_CHECKLIST.md`
13. `FINALIZATION_PLAN.md`
14. `PRODUCTION_ENVIRONMENT_SETUP.md`
15. `PRODUCTION_RECOVERY.md`

## ESTADO ACTUAL PRIORITARIO — CUTOVER COMPLETADO 2026-09-29

> **Esta sección prevalece sobre cualquier checkpoint histórico posterior que diga que producción sigue en Wheel v2. Esas menciones se conservan sólo como bitácora cronológica.**

- Producción está en `app_settings.engine='wheel-v3'` desde `2026-09-29T04:36:57.554Z`.
- Cutover GitHub Actions run: `36522396511`, resultado `success` completo.
- Backend verificado durante el switch: `209f8164920a20fa6ee3a540b0c1d4b205112e70`.
- Frontend verificado durante el switch: `87532489ca44d8ed5cd9378a5e17db64f360c032`.
- Precutover real inmediatamente anterior: `ready:true`, `blockers:[]`, engine v2, DB ok, 0 assignments vivos/legacy, 0 transiciones pendientes y 0 estados v3 faltantes.
- Activación: write barrier exclusivo + locks de asignador/mantenimiento + recheck dentro de la transacción + update atómico v2→v3.
- Postcutover real: `ok:true`, engine v3, DB ok, readiness v3 verde, 0 assignments legacy/malformados y 0 estado preparatorio faltante.
- Barrera de concurrencia: escrituras competitivas toman advisory lock compartido `8675311`; cutover toma el mismo lock en exclusivo. Ya no se necesita apagar Render para un switch futuro equivalente.
- Las ramas temporales `wheel-v3-precutover-run` y `wheel-v3-cutover-run` quedaron neutralizadas (sin push-trigger automático); el probe temporal de Render fue eliminado.
- Advertencia: no volver a `wheel-v2` cambiando sólo `app_settings.engine`. Cualquier rollback posterior debe conservar semántica v3 o tener una migración de recuperación explícita.
- Próximo trabajo: observación/monitoreo de producción v3 y, sólo después de estabilidad suficiente, retiro del runtime/campos legacy.
- Estado único vigente de salida pública: `PUBLIC_LAUNCH_STATUS.md`. Usarlo antes que listas históricas dispersas.

### WhatsApp y estabilidad verificados — 2026-10-01 13:11 ART
Actualización 13:36 ART: chequeo aislado de inputs `preflight:full` run `36893204527` confirmó que las cinco entradas Meta siguen ausentes en GitHub Environment `production`. Falló exclusivamente `Validate production environment inputs`; checkout, instalación y preflight DB quedaron omitidos. No hubo envío. Render no fue inspeccionado. Rama `verify-meta-2026-10-01` neutralizada en `7ad646a`, sin push-trigger. El siguiente paso requiere cargar Meta en GitHub; no habilitar Render/dispatcher ni lanzar prueba real sin autorización explícita.

- HEAD inicial real: `34190582f916efa65743594a6c20dfbf01fc6375`; Actions `36774226465` y Vercel success.
- El bloque original de sender/script/tests/workflow WhatsApp (`ca916aa1be1a3de950ebf79bcc20a9bb0d55ac8a`) ya tenía CI success: run `36586440051`.
- Bug comprobado corregido en `9a7c1a022a2d3a3fe3983e29d4db24999093dde9`: el preflight full y el sender/dispatcher exigían solo cuatro variables Meta y usaban idioma implícito. Ahora exigen las cinco, incluido `WHATSAPP_TEMPLATE_LANGUAGE`; no se llama a Meta si falta cualquiera.
- La confirmación del workflow se pasa por variable de entorno, evitando interpretar el input como código shell; sigue exigiendo exactamente `SEND-WHATSAPP-TEST`.
- CI de la corrección run `36890000756`: success (check, 153 tests puros, verify:db, integración PostgreSQL y frontend build). Pruebas locales check + 153/153 verdes; runtime local Node 24, CI autoritativo Node 22.
- Postcutover + smoke reales run `36890116464`: success, backend y frontend `9a7c1a022a2d3a3fe3983e29d4db24999093dde9`. DB/TLS/migraciones ok, reloj activo, readiness `true`, blockers `[]`, legacy/malformed assignments y estados pair/duo/league faltantes todos `0`; 24 controles DB y 6 endpoints públicos verdes; outbox failed `0`.
- Rama temporal `verify-production-2026-10-01` neutralizada en `e0cb593`: solo workflow_dispatch, sin push-trigger. No se fusiona a main.
- No se cambiaron reglas competitivas ni se enviaron mensajes WhatsApp reales. La carga actual de Meta en GitHub/Render no fue revalidada por este postcutover (no inyecta variables Meta); el pendiente externo anterior sigue abierto hasta verificar las cinco en ambos lugares.
- Próximo gate: cinco variables Meta configuradas en GitHub Environment `production` y Render, preflight full verde y confirmación explícita del propietario antes de cualquier envío real. Configurar Render puede activar automáticamente el dispatcher; coordinar esa habilitación con la autorización de envío.

### Estabilización verificada — 2026-09-29 11:53 ART
- Postcutover real de estabilidad run `36584434874`: success; `engine=wheel-v3`, DB ok, readiness `true`, `blockers=[]`, 0 assignments legacy/malformados y 0 estados v3 faltantes.
- Backend observado en ese smoke: `0678256544ee23cf64dcab5944bf9823d24852c3`; frontend: `87532489ca44d8ed5cd9378a5e17db64f360c032`.
- Smoke autenticado productivo run `36585954395`: success. Acceso anónimo rechazado; Admin verificado; 7 superficies privadas/Admin GET verdes; jugador real autenticado verde.
- Producción no tiene todavía un jugador verificado con pareja, por lo que `/api/me/league` no pudo auditarse contra una pareja real. No crear datos ficticios en producción sólo para cubrir ese smoke; verificarlo cuando exista la primera pareja real.
- `preflight:full` de WhatsApp run `36585295135` falla únicamente porque faltan las 5 entradas externas de Meta en GitHub Environment `production`: `PROD_WHATSAPP_PHONE_NUMBER_ID`, `PROD_WHATSAPP_ACCESS_TOKEN`, `PROD_WHATSAPP_TEMPLATE_NAME`, `PROD_WHATSAPP_GRAPH_VERSION`, `PROD_WHATSAPP_TEMPLATE_LANGUAGE`.
- Siguiente trabajo real: configurar Meta WhatsApp, ejecutar `preflight:full`, enviar un mensaje de prueba controlado y observar el primer flujo real de pareja/Mi Liga. No cambiar reglas competitivas.

## Diseño competitivo nuevo — HISTÓRICO / YA IMPLEMENTADO

### Actualización prioritaria 2026-09-28 — ranking e inactividad
- La posición real es el único ranking; eliminar cualquier métrica numérica paralela y sus referencias.
- El único récord histórico especial es defensas exitosas del #1 de Primera.
- La rueda asigna automáticamente los partidos.
- Inactividad correctamente aplicada: sin partidos y sin descenso de categoría por el mero paso del tiempo.
- Posición de retorno: hasta 3 meses completos conserva puesto; desde el 4º mes pierde 1 puesto de retorno por mes completo, siempre dentro de la misma categoría.
- Si se inactivó siendo #1 de cualquier categoría, vuelve como máximo #2 durante los primeros 3 meses y luego ese #2 base también baja 1 puesto por mes completo adicional.
- Si dos inactivas vuelven al mismo puesto objetivo, la que reactiva más tarde se inserta allí y desplaza hacia abajo a la anterior.
- Si había período de descenso, queda congelado y se retoma al volver.
- Tres incumplimientos atribuibles consecutivos provocan 30 días sin assignments y paso automático a inactiva; al día 30 se reactiva automáticamente y la racha se reinicia solo con un cierre real sin incumplimiento propio.
- Nuevas/ascendidas entran **anteúltimas**, no a mitad ni al fondo. No activan descenso solo por ingresar.
- Una dupla disuelta y re-formada se trata competitivamente como pareja nueva.
- Formación y porcentajes son independientes por circuito.
- La antigua fórmula de mitad queda reemplazada. Con N=0 entra #1; con N=1 entra #2.
- 3 incumplimientos => 30 días inactiva; reactivación automática; cualquier assignment sin incumplimiento atribuible resetea la racha.
- Resultado cargado abre inmediatamente 7 días de revisión y luego auto-valida por silencio.
- Todos los cambios operativos relevantes se notifican por WhatsApp.
- El récord del #1 de Primera es por reinado, no acumulativo entre reinados; empate = récord compartido.
- El primer partido de una pareja 0 PJ al activarse la zona no cuenta y luego entra en 0/3. La entrada nueva/ascendida es anteúltima; N=0 => #1 y N=1 => #2.
- No quedan preguntas funcionales abiertas. Próximo paso obligatorio: simulaciones/tests del diseño antes de tocar el motor.

- El propietario redefinió la rueda automática en una conversación extensa el 2026-09-28.
- Todo quedó consolidado en `WHEEL_V3_SPEC.md`.
- El código sigue en `wheel-v2`; **no implementar parcialmente desde memoria del chat**.
- La spec nueva sustituye, cuando haya conflicto, la selección de rival anterior, la válvula poblacional anterior, la pausa/inactividad anterior y partes de no-show/asignación.
- Los bordes funcionales detectados en la auditoría están cerrados. No reabrirlos por intuición; validar mediante tests/simulación antes de migración/código.
- Después: consolidar `PROJECT_RULES.md` + `DECISIONS.md`, escribir tests/simulación y recién entonces implementar.

### Auditoría Wheel v3 — 2026-09-28
- `WHEEL_V3_AUDIT_2026-09-28.md` contiene la auditoría y debe leerse antes de tocar el motor.
- Los hallazgos anti-abuso A–D quedaron resueltos: descenso pendiente de la dupla, categoría individual tras descenso, resultado cargado protegido y cancelación automática sin reset de incumplimientos.
- La simulación longitudinal ya fue rehecha con ingreso **anteúltimo** y no mostró deriva peligrosa ni categorías vacías en los escenarios modelados.
- Se agregaron `scripts/simulate-wheel-v3.js`, `tests/wheel-v3-simulation.test.js`, `scripts/wheel-v3-rule-model.js` y `tests/wheel-v3-rules.test.js`.
- Los cuatro bordes nuevos quedaron cerrados: N=1 => #2; descenso pendiente vuelve a su categoría original; strikes pertenecen a la dupla exacta; partido jugado antes de cancelación puede cargarse después.
- Próximo paso: diseñar estado/migración DB (incluyendo tiempo autoritativo de servidor) y ampliar tests puros/PostgreSQL antes de implementar el runtime Wheel v3.

### Tiempo autoritativo — NUEVA DECISIÓN
- Ningún plazo oficial puede depender del reloj de la PC/teléfono/navegador.
- Backend/Neon son la autoridad temporal; guardar/comparar UTC y usar preferentemente PostgreSQL `CURRENT_TIMESTAMP/NOW()` para vencimientos transaccionales.
- La API debe devolver deadlines absolutos + `server_now` (o equivalente); el frontend solo presenta countdowns.
- Cambiar la hora local jamás altera 7 días, 30 días, 48 h, meses de inactividad ni sanciones.
- Mostrar al usuario en horario de Argentina cuando corresponda, sin cambiar la lógica UTC.

### Código todavía contradictorio que NO representa la regla vigente
- `frontend/src/App.jsx` todavía muestra la puntuación numérica legacy y estadísticas acumuladas en varias superficies.
- `src/core.js` y `src/competitionEngine.js` todavía calculan/persisten esa métrica y el récord antiguo.
- `src/pairs.js` todavía la recalcula al pausar/reactivar/formar.
- `database/schema.sql` todavía contiene columnas/tablas legacy relacionadas.
- tests existentes todavía validan esa lógica.
- **No corregir parcialmente** antes de cerrar las preguntas de `WHEEL_V3_SPEC.md`; luego eliminarla de forma transversal en código, DB, API, frontend y tests.

## Estado consolidado

- package: `5.0.9`.
- motor activo: `wheel-v3` (producción desde 2026-09-29).
- Neon histórica: eliminada; no asumir recuperable.
- Neon nueva: base de referencia actual.
- runtime objetivo: Node 22.
- 71/71 tests puros verdes en el último checkpoint verificado.
- 46/46 integración PostgreSQL verdes.
- `verify:db` verde.
- frontend build verde.
- Vercel `success` en el último checkpoint verificado.
- el corazón deportivo, concurrencia, edge cases y lesión/abandono están cubiertos automáticamente.
- liveness/readiness, migrations startup, shutdown, pool errors, seguridad HTTP, no-store, request correlation, preflight y production smoke están implementados y testeados.
- backend/preflight/smoke usan `npm ci`.
- workflows tienen `contents: read` y timeouts.
- `frontend/.vite/` ya no está versionado.

El último commit de código/higiene verificado antes de esta normalización documental fue `5ad90c16f2e000d3ceb2f6bfed4d7e737563402b` (`Limpia cache generada de Vite`): GitHub Actions y Vercel terminaron `success`. Si `main` está más adelante, verificar el HEAD nuevo en lugar de reutilizar ese estado.

## Equilibrio competitivo: diseño anterior reemplazado

La válvula `gap >= 5 => descenso con 2` pertenece a Wheel v2 y **no debe usarse como regla funcional futura**.

Wheel v3 define:
- fase de formación hasta 5 parejas activas en cada una de las 7 categorías;
- luego distribución objetivo porcentual sobre activas;
- zona normal 10–19 %;
- umbrales 3/2/1 según desvío normal/moderado/fuerte;
- la población nunca mueve parejas sin un resultado;
- `WHEEL_V3_SPEC.md` es la referencia vigente de diseño.

`SIMULATION_AUDIT_2026-09-20.md` sigue siendo evidencia histórica de por qué se descartaron alternativas anteriores, no la definición final del nuevo motor.

## Metodología

- `.md` > memoria informal del chat.
- No cambiar reglas por fallas de tests sin compararlas con docs.
- Primero tests/simulaciones automáticas, después PostgreSQL, manual solo para UX/smoke.
- Distinguir fixture/test debt de bugs reales.
- Push directo a `main`.
- Actualizar checkpoint/handoff después de cambios importantes.
- No tocar ni imprimir secretos reales.
- Avanzar autónomamente todo lo posible.
- No agregar hardening especulativo si no responde a evidencia.
- No interpretar DNS bloqueado del entorno del chat como caída de Render/Vercel.

## Pendientes externos reales

Cerrados en producción real:
- Environment `production` core cargado;
- preflight core real verde;
- Render startup/health verde;
- production smoke real verde;
- TOTP Admin real probado con autenticador.

Pendientes:
1. confirmar plan/restore window Neon, definir RPO/RTO y completar drill aislado;
2. configurar Meta WhatsApp + mensaje real;
3. ejecutar `preflight:full`;
4. smoke UX autenticado final;
5. revisión legal/seguro Argentina.

## Deuda técnica no bloqueante

Generar legítimamente `frontend/package-lock.json` con npm y solo después cambiar el frontend de CI de `npm install` a `npm ci`. No fabricar el lock manualmente.

## Nota de continuidad

La cronología extensa está en `AUDIT_2026-09-20.md`, `CHECKPOINT_2026-09-20.md` y `PROJECT_JOURNEY.md`. Este handoff debe mantenerse corto y representar únicamente el estado vigente.


### Cancelación de invitación saliente — CORREGIDA
`Mi pareja` ya muestra la invitación saliente activa, su vencimiento/categoría, permite cancelarla y bloquea el envío de otra mientras siga pendiente. Se agregó regresión automática. No cambia reglas deportivas.


### Acciones pausa/reactivación en Mi pareja — CORREGIDAS
La UI muestra PAUSAR solo para pareja `active` y REACTIVAR solo para pareja `paused`. Se agregó regresión automática.


### Preflight TLS Neon — CORREGIDO
La primera ejecución real de `preflight:core` alcanzó Neon pero `pg_stat_ssl` dio un falso negativo de TLS. El preflight ahora valida el `TLSSocket` real de `node-postgres`; CI quedó verde. Falta ejecutar un workflow manual NUEVO sobre el HEAD actualizado para validar producción real.


### Lugar libre y surface audit — IMPLEMENTADOS
- Programación usa `location_text` libre escrito por jugadores; ya no exige una cancha precargada.
- `venues` es una capa comercial separada. Solo active+associated se publica como “Cancha adherida”.
- No existe desafío manual por diseño: la rueda asigna rival.
- Pausa/disolución, extensión, no-show, resultados/disputas y disciplina post-partido tienen flujos visibles.
- `tests/frontend-user-journey.test.js` verifica paridad entre endpoints funcionales y frontend.
- Estado verificado: 71/71 puros + 46/46 PostgreSQL + verify:db + frontend build + Actions/Vercel verdes.
- Producción necesita desplegar el HEAD nuevo para aplicar `PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql`, y después ejecutar un preflight core NUEVO.


### Gates productivos reales — 2026-09-22
- `LA RED production preflight` core sobre HEAD vigente: success.
- salida del preflight: `ok:true`, `wheel-v2`, TLS 1.3, migrations ready, reloj activo, 1 admin, 0 sedes comerciales válidas, outbox limpio.
- `LA RED production smoke`: success; Render/Vercel/CORS/headers/request-id/no-store/endpoints públicos verdes.
- Login Admin real con TOTP confirmado por el propietario.


### Recuperación Neon — estado actual
- Backup & Restore real verificado en consola.
- Ventana histórica: 8 horas.
- Snapshots manuales disponibles; schedules requieren upgrade.
- Drill de recuperación aislado diferido por decisión del propietario hasta que haya datos/cambios que permitan comprobar algo útil.
- Próximo gate externo: WhatsApp Meta real, luego preflight full.


### Service Worker /liga — CORREGIDO
Se corrigió un fallo real de producción: ante error transitorio de red, el Service Worker podía devolver `undefined` para una navegación como `/liga`, causando `Failed to convert value to 'Response'`. Ahora solo intercepta GET same-origin no-API, usa shell `/` como fallback de navegación y siempre devuelve una `Response`. Regresión automática agregada. Estado verificado: 71/71 puros + 46/46 PostgreSQL + frontend build + Vercel success.


### Preparación DB Wheel v3 — 2026-09-28
- Se agregó `WHEEL_V3_DB_DESIGN.md`.
- Se agregó `database/PATCH_WHEEL_V3_STATE_2026-09-28.sql` y fue incorporado a `src/migrations.js`.
- `database/schema.sql` ya contiene el estado preparatorio Wheel v3 para instalaciones limpias.
- Nuevas estructuras: `league_wheel_state`, `pair_wheel_state`, `pair_duo_state`, `first_place_reigns`.
- `wheel_assignments` suma `attacker_pair_id`, `defender_pair_id`, `cancelled_at` y `first_result_at`.
- Triggers aditivos mantienen creado el estado v3 para parejas/duplas nuevas mientras el runtime sigue en `wheel-v2`.
- La migración no traduce ELO/rachas legacy a contadores v3 porque no son semánticamente equivalentes; posiciones/categorías/partidos se conservan.
- Se ampliaron tests puros de meses completos, cancelación tardía y deadlines absolutos.
- Se agregó `tests/integration/wheel-v3-state-postgres.test.js` para schema, idempotencia, constraints, reloj DB, reinados y sincronización de nuevas parejas.
- **El engine sigue en `wheel-v2`; no se implementó todavía el runtime Wheel v3.**
- Validación local desde este entorno no pudo ejecutarse por bloqueo DNS hacia GitHub; confirmar GitHub Actions del HEAD antes de dar este bloque por verde.


### Endurecimiento de migración Wheel v3 — 2026-09-28
- La suite PostgreSQL ya no prueba solo el patch sobre el schema final.
- Se agregó un caso que construye un esquema mínimo pre-v3 tipo `wheel-v2`, carga una pareja pausada con datos reales, aplica `PATCH_WHEEL_V3_STATE_2026-09-28.sql` dos veces y verifica:
  - `engine` sigue en `wheel-v2`;
  - posición/categoría/estado competitivo se conservan;
  - se crea estado de inactividad/retorno;
  - se crea estado canónico de dupla;
  - la segunda ejecución es idempotente.
- `database/verify.sql` ahora falla si alguna pareja no tiene `pair_wheel_state`, una dupla exacta no tiene `pair_duo_state`, una pausada carece de snapshot de retorno o una sanción de 30 días carece de timestamps.
- Siguiente paso: confirmar CI PostgreSQL del HEAD y ampliar tests de comportamiento/concurrencia v3 antes de tocar el runtime.

### Auditoría de estado persistente Wheel v3 — 2026-09-28
- Se detectó y corrigió un error real de delimitadores PL/pgSQL en los triggers preparatorios.
- Se agregó `defense_required_until_real` para persistir la defensa obligatoria posterior a incumplimiento.
- Se agregó `relegation_route_step` para que la ruta de descenso no se pierda por reinicio/disolución.
- Se agregó `awaiting_zone_kind` para distinguir el partido habilitante de ascenso vs descenso al cerrar formación.
- El patch preparatorio ahora también evoluciona instalaciones que ya hubieran recibido una versión anterior de las tablas v3 mediante `ALTER ... ADD COLUMN IF NOT EXISTS`.
- Se agregaron regresiones PostgreSQL para persistencia de descenso por dupla, múltiples encarnaciones de la misma dupla, sanción de 30 días, circuito correcto, cancelación/resultados y evolución de schema.
- `verify.sql` valida coherencia de zona habilitante y ruta de descenso vacía.
- El runtime continúa en `wheel-v2`.

### Antigüedad real de espera Wheel v3 — 2026-09-28
- `pairs.waiting_since` queda como dato legacy de wheel-v2.
- Wheel v3 usa `pair_wheel_state.real_waiting_since`.
- La migración inicializa activas desde el último match real (`normal` o `injury_abandonment`) o desde creación si nunca jugaron.
- Un match real actualiza la espera; `dissolution_forfeit` no.
- Nueva pareja, reactivación y reformación desde `inactive` reinician la espera con `CURRENT_TIMESTAMP` de PostgreSQL.
- Se agregaron regresiones PostgreSQL para estas transiciones.

### Correcciones del patch preparatorio
- Se reordenó `PATCH_WHEEL_V3_STATE_2026-09-28.sql` para crear `pair_duo_state` antes de alterarla.
- Se corrigieron delimitadores `DO $$` y funciones PL/pgSQL.
- El patch conserva idempotencia y puede evolucionar instalaciones que recibieron una versión preparatoria anterior.

### Núcleo puro Wheel v3 — 2026-09-28
- Se agregó lógica pura para cierre de formación por circuito (7 categorías con >=5 activas).
- Se fijaron roles estructurales: #1 defensa, último ataque, una sola activa sin rol efectivo.
- Se agregó transición post partido real atacante->defensa / defensor->ataque con respeto de extremos.
- Se agregó prioridad absoluta por `real_waiting_since`.
- Se agregó selección de defensor solo hacia arriba, ventanas dinámicas de 3, prioridad por espera y expansión inmediata.
- Se agregó evitación blanda de rival inmediato: se evita si hay alternativa, nunca bloquea la rueda.
- Se agregó resolución de colisiones: el atacante con mayor espera toma primero el defensor y el otro continúa buscando.
- Se agregó rebalance inicial de roles con extremos forzados.
- La matemática de población 3/2/1 y mejora conjunta quedó centralizada en `wheel-v3-rule-model.js`; la simulación reutiliza esa misma fuente.
- Se agregó `entryPositionPenultimate`; el alias legacy `entryPositionAntepenultimate` se conserva solo para no romper tests/simulaciones existentes.
- `delayedResultMovement` también quedó centralizado en el modelo puro.
- Todo este bloque sigue aislado: todavía no se conectó al runtime productivo ni se cambió `engine=wheel-v2`.

### Motor Wheel v3 aislado — avance 2026-09-28
- Las reglas puras dejaron de vivir solo en `scripts/`: fuente productiva nueva `src/wheelV3Rules.js`; `scripts/wheel-v3-rule-model.js` reexporta por compatibilidad.
- `npm run check` incluye `src/wheelV3Rules.js` y `src/wheelV3Engine.js`.
- Se agregaron transiciones puras de ascenso, descenso, incumplimientos, defensa obligatoria, ruta de descenso, cancelación estructural, récord por reinado, inactividad y deadlines.
- Se corrigió el edge del partido habilitante de descenso: solo abre 0/3 si la pareja sigue última después de ese partido.
- Se agregó planificador puro de categoría con normalización de roles, prioridad de espera, ventanas de 3, no-repeat blando y colisiones.
- Se agregó adaptador PostgreSQL aislado `src/wheelV3Engine.js`.
- El adaptador puede leer formación por circuito, planificar una categoría, persistir roles, crear assignments con atacante/defensor y deadlines DB, y consultar último rival real.
- La creación de assignments bloquea la categoría y conserva máximo un compromiso por pareja mediante `wheel_assignment_participants`.
- Se agregó cierre de formación persistente e irreversible.
- El cierre de formación ahora inicializa en la misma transacción zonas 0/3 o estado `awaiting_zone_kind` para parejas con 0 PJ.
- Se agregó cancelación estructural previa a primera carga, liberación de participantes y preservación de roles/antigüedad.
- Se agregó `registerWheelV3FirstResult`: fija `first_result_at` y revisión de 7 días con reloj PostgreSQL; desde ahí el assignment queda protegido de cancelación por ranking/categoría.
- Se agregó elegibilidad de resultado cargado después de cancelación usando `played_at <= cancelled_at`.
- Se agregó `refreshWheelV3Category` para cancelar inválidos y reevaluar asignación inmediatamente.
- Todo lo anterior sigue AISLADO: `wheel.js` productivo no llama a `wheelV3Engine.js` y `app_settings.engine` continúa en `wheel-v2`.
- Se ampliaron regresiones puras y PostgreSQL para formación, assignments concurrentes, cancelación, primera carga y zonas.


### Wheel v3 aislado — checkpoint ampliado 2026-09-28
- Fuente pura productiva: `src/wheelV3Rules.js`; el script histórico solo reexporta.
- Motor PostgreSQL aislado: `src/wheelV3Engine.js`.
- Ya están implementados en aislamiento: formación, matching, assignments, resultados, 7d, 30d, ascenso/descenso, población, incumplimientos, deuda, inactividad, disolución/reforma exacta, no-show, programación, resolución admin, reinados de Primera, historial de 5 movimientos y notificaciones.
- Se agregó vínculo assignment -> reinado de Primera para acreditar correctamente defensas tardías.
- Se corrigió el planificador para calcular #1/último sobre toda la tabla activa aunque alguna pareja esté ocupada/bloqueada.
- Se limpió `DECISIONS.md` de reglas supersedidas de mitad de tabla/bordes pendientes.
- Auditoría detallada de cobertura: `WHEEL_V3_IMPLEMENTATION_AUDIT_2026-09-28.md`.
- **No activar todavía:** producción sigue en `wheel-v2`.
- Próximo bloque: fachada/API y routing por engine, después frontend/background/health, ejecución real de suites y cutover.


### Routing y frontend dual v2/v3 — 2026-09-28
- Se agregaron selectores centrales de runtime: `competitionRuntime.js`, `wheelRuntime.js`, `pairsRuntime.js` y `adminRuntime.js`.
- `app.js` y el mantenimiento de background ya despachan por `app_settings.engine`; el valor vigente sigue siendo `wheel-v2`.
- Se agregaron fachadas aisladas `wheelV3Api.js`, `pairsV3Api.js` y `adminV3Api.js`.
- Health, preflight y smoke aceptan `wheel-v3` sin activarlo.
- El mantenimiento v3 respeta la pausa global y la reanudación calcula duración con `CURRENT_TIMESTAMP` de PostgreSQL, no `Date.now()`.
- Se cerró el edge de disolución `awaiting_result`: al cerrar el assignment se archiva automáticamente la pareja si corresponde.
- El frontend quedó dual: v2 conserva sus controles legacy mientras v3 muestra inactividad directa, cancelar propuesta, `No pude jugar`, cancelar/aceptar/objetar no-show y resolución Admin v3.
- El frontend ya no muestra ni consulta el ranking numérico paralelo anterior; Ranking usa posición + rol + estadísticas deportivas.
- El récord de Primera muestra defensas por reinado y soporta holders compartidos.
- En v3 la habilitación visual de acciones temporales usa `server_now` + reloj monotónico del navegador; cambiar el reloj del dispositivo no altera la referencia.
- Resultado ya cargado bloquea nuevas asignaciones; además `No pude jugar` y un no-show nuevo quedan prohibidos después de la primera carga de resultado.
- El backend público v3 conserva formas compatibles para ranking, próximos, resultados y perfil de pareja.
- Aún falta ejecutar suites/build reales en un entorno con repo+PostgreSQL, corregir cualquier fallo, completar auditoría frontend/contratos y recién después considerar el switch de `engine`.

### CI real como gate de Wheel v3 — 2026-09-28
- Workflow: .github/workflows/ci.yml, nombre LA RED final checks.
- Los runs de push se consultan por la API de GitHub Actions; fetch_commit_workflow_runs no los mostraba porque filtra otro tipo de evento.
- Ya hubo ejecuciones reales con frontend build, npm run check, npm test y npm run verify:db en verde.
- CI detectó y permitió corregir dos fallos unitarios: contrato de liveness y desbalance de roles iniciales.
- CI también detectó una incompatibilidad v2 en no-show tras convertir la unicidad a índice parcial; wheel-v2 quedó compatible usando ON CONFLICT DO NOTHING.
- Se corrigieron errores de sintaxis en tests PostgreSQL v3 que antes impedían ejecutar esa suite.
- Run de confirmación en curso al escribir este checkpoint: 36497136449, SHA 6b8e7108745252197baafcba0ec3c4711706affd.
- No declarar la suite PostgreSQL completa verde hasta que ese run termine.

### CI PostgreSQL — diagnóstico de cuelgue 2026-09-28
- Los runs viejos no fallaban solo por assertions: `test:integration` quedaba colgado ~20 minutos y GitHub lo cancelaba.
- El log permitió localizar el self-deadlock exacto en el test `cancelled no-show can be reported again...`: una transacción con `client` retenía el lock del assignment y luego `pool.query` intentaba actualizar ese mismo assignment desde otra conexión.
- Ese UPDATE ahora usa el mismo `client` transaccional.
- También se corrigió en `wheelV3Engine.js` la persistencia de roles usando `$2::varchar` para evitar `inconsistent types deduced for parameter $2`.
- Próximo bloque: releer el nuevo run de Actions y corregir los fallos funcionales restantes (sanction deadline, migración pre-v3, inactividad/posición/deuda) uno por uno.

### CI completo verde — 2026-09-29
- GitHub Actions run `36509908405` sobre SHA `9fa38f9a0529bafd3c7d36f82c72ac0d70b85710` terminó `success`.
- Frontend build: verde.
- `npm run check`: verde.
- `npm test`: verde.
- `npm run verify:db`: verde.
- `npm run test:integration`: verde; la suite PostgreSQL completa terminó sin fallos.
- Los fallos descubiertos y corregidos en esta ronda incluyeron: self-deadlock de test no-show, casteo SQL de roles, score confirmado no normalizado, fixture de sanción duplicando `pair_wheel_state`, fixture pre-v3 incompleto, `return_position_base` sin cast entero, validación de `played_at` contra timestamp fijo de transacción y fixture de no-show sin `location_text`.
- Para validar `played_at` contra el presente se usa `clock_timestamp()` de PostgreSQL: sigue siendo reloj autoritativo del servidor y evita falsos 'futuro' cuando la transacción comenzó antes del timestamp cargado.
- `engine` continúa en `wheel-v2`; CI verde NO implica que el cutover ya haya sido ejecutado.
- Existe gate `wheelV3CutoverReadiness` / `npm run check:wheel-v3-cutover`; bloquea el switch si quedan assignments vivos, transiciones de pareja pendientes o estado v3 incompleto.

### Cutover controlado listo — 2026-09-29
- Se agregó `activateWheelV3(client)` con advisory locks `8675309` (asignador) y `8675310` (mantenimiento), recheck del gate y update atómico de `app_settings.engine`.
- Comando explícito: `npm run activate:wheel-v3`.
- El comando exige `CONFIRM_WHEEL_V3_CUTOVER=YES` y `WHEEL_V3_BACKEND_QUIESCED=YES`; no debe ejecutarse con requests v2 en vuelo.
- Tests PostgreSQL verifican activación transaccional, rollback y rechazo si existe un assignment legacy vivo.
- Run `36510192308` sobre commit `423636f8e75b3d66469af3a1514d7a0578ff17e7` terminó verde incluyendo esas pruebas.
- Los scripts de check/activación quedaron incluidos en `npm run check`.
- Run `36510319476` sobre commit `a2da70eab1ea0d50137bfb123662a9353746a6d9` terminó `success`: frontend, check, unit, verify DB e integración PostgreSQL verdes.
- Runbook operativo: `WHEEL_V3_CUTOVER_RUNBOOK.md`.
- Vercel reportó `success` en el commit del runbook durante esta tanda.
- No se ejecutó el cutover productivo: el engine debe seguir en `wheel-v2` hasta correr el gate contra la DB real y quiescer el backend.

### Operación productiva Wheel v3 cerrada en tres comandos — 2026-09-29
- `npm run precutover:wheel-v3`: valida configuración productiva, TLS, preflight de DB y blockers competitivos. Debe devolver `ok: true` y `cutover.ready: true`.
- `npm run activate:wheel-v3`: exige `NODE_ENV=production`, configuración válida, `CONFIRM_WHEEL_V3_CUTOVER=YES` y `WHEEL_V3_BACKEND_QUIESCED=YES`; toma locks, revalida blockers y cambia engine atómicamente.
- `npm run postcutover:wheel-v3`: exige DB productiva en `wheel-v3`, ejecuta preflight operativo v3 y smoke HTTP con `EXPECTED_ENGINE=wheel-v3`.
- `databasePreflight()` ahora, si engine=`wheel-v3`, ejecuta `wheelV3OperationalReadiness()` y falla si existen assignments legacy/malformados o estado preparatorio faltante.
- `runProductionSmoke()` puede exigir un engine concreto y ahora incluye `/api/records` entre los endpoints públicos.
- CI `36514482250` quedó completamente verde con smoke esperado y readiness post-cutover incluidos.
- CI `36514763460` quedó completamente verde incluyendo los scripts postcutover y el runbook actualizado.
- El entorno de herramientas de esta sesión no pudo resolver DNS hacia Render, por lo que no se verificó el endpoint público vivo desde aquí; eso debe hacerse con `postcutover:wheel-v3` en el entorno productivo.
- `ARCHITECTURE.md` y `WHEEL_V3_IMPLEMENTATION_AUDIT_2026-09-28.md` fueron actualizados para reflejar el runtime dual real y eliminar afirmaciones obsoletas de 'frontend sólo v2'.
- Producción NO fue activada desde esta sesión; el engine debe seguir en `wheel-v2` hasta ejecutar el procedimiento real.

### Gate de paridad de deploy — 2026-09-29
- Render expone `RENDER_GIT_COMMIT`; Vercel expone `VERCEL_GIT_COMMIT_SHA` / `VITE_VERCEL_GIT_COMMIT_SHA`. El backend publica `release` en `/api/live` y `/api/health`; Vite inyecta `<meta name="la-red-release" ...>` en `index.html`.
- `runProductionSmoke()` puede exigir SHA exacto de backend y frontend.
- `precutover:wheel-v3` ahora exige `EXPECTED_RELEASE_SHA` (40 hex), `PROD_API_URL` y `PROD_FRONTEND_URL`; antes del switch comprueba engine v2 + paridad exacta de deploy.
- `postcutover:wheel-v3` exige el mismo SHA y engine v3.
- `activate:wheel-v3` exige además `CUTOVER_ADMIN_USER_ID` de un Admin verificado y registra `wheel_v3_cutover` en `admin_audit_events` con engine anterior/nuevo y release SHA dentro de la misma transacción.
- El estado actual de Vercel en varios commits recientes fue `build-rate-limit`; por diseño eso debe considerarse blocker hasta que el frontend productivo pueda demostrar el SHA esperado.

### Paridad exacta de releases — evidencia 2026-09-29
- Backend health/liveness exponen `release` usando metadata de deploy; frontend inyecta `<meta name="la-red-release">` desde metadata de Vercel.
- La lógica de meta se extrajo a `frontend/releaseMeta.js` para poder probarla desde la suite backend sin instalar Vite allí.
- Run `36515539015` sobre commit `6882784c356373cf618142730e3f5d27819d8705` terminó `success`: frontend, check, unit, verify DB e integración PostgreSQL verdes con el helper de release ya probado.
- Render documenta `RENDER_GIT_COMMIT`; Vercel documenta `VERCEL_GIT_COMMIT_SHA` y `VITE_VERCEL_GIT_COMMIT_SHA`. Si Vercel no expone esas variables, el precutover debe fallar hasta habilitar System Environment Variables y redeployar.
- No hacer cutover mientras Vercel siga en build-rate-limit o el frontend productivo no demuestre el mismo `EXPECTED_RELEASE_SHA` que backend.

### Cierre de desarrollo Wheel v3 — 2026-09-29
- GitHub distingue actualmente dos check runs (`backend`, `frontend`) de GitHub Actions, ambos verdes en los HEADs validados, y un status separado de Vercel.
- Render `checksPass` espera los CI checks detectados; Vercel figura como commit status separado, por lo que el backend puede avanzar mientras Vercel quede viejo. El gate de SHA existe justamente para impedir cutover en ese estado.
- Vercel `ignoreCommand` quedó limitado a commits exclusivamente `.md`; cualquier cambio de código en backend o frontend sigue disparando build para conservar paridad exacta de SHA entre deploys.
- `ARCHITECTURE.md` ahora marca explícitamente las secciones de `competitionEngine.js`/`wheel.js` como legacy Wheel v2 de transición y no como reglas vigentes v3.
- `WHEEL_V3_IMPLEMENTATION_AUDIT_2026-09-28.md` ya declara que no quedan tareas funcionales conocidas; sólo resta el procedimiento operativo real de deploy/precutover/cutover/postcutover.

### CIERRE FUNCIONAL WHEEL V3 — 2026-09-29
- Candidato final de código validado: `8c4d0104bffd98df72ec473d1297c8f72832138e`.
- GitHub Actions run `36519976313`: **success completo** — frontend build, `npm run check`, `npm test`, `npm run verify:db` y `npm run test:integration` verdes.
- Corrección final de defensa obligatoria: una defensa real cumplida libera `defense_required_until_real` aunque la pareja permanezca #1/defensa; si la obligación es estructuralmente imposible por quedar última, se libera según la especificación.
- Repetición de rival: si el rival anterior es la única opción de la primera ventana pero existe otro defensor superior fresco en una ventana siguiente, la búsqueda se expande y evita la repetición. Solo repite si no existe alternativa superior elegible.
- Equilibrio poblacional: el gate vigente es no-empeorante. Un movimiento adyacente puede acelerar si reduce o mantiene exactamente el desvío conjunto respecto de 1/7; solo se bloquea si aumenta el desvío conjunto. `WHEEL_V3_SPEC.md` y `DECISIONS.md` quedaron explícitos.
- Se eliminó el alias/nombre confuso `antepenultimate`; simulación y tests usan `entryPositionPenultimate` / ingreso anteúltimo. La regla vigente sigue N=0=>#1, N=1=>#2, N>=2=>posición N.
- `WHEEL_V3_AUDIT_2026-09-28.md` marca la antigua fórmula `floor(N/2)+1` como histórica/superada.
- No quedan tareas funcionales conocidas de Wheel v3. Lo único pendiente es el procedimiento operativo de producción: lograr paridad de release Render/Vercel, ejecutar precutover, quiesce, activación atómica y postcutover.
- NO se activó producción en esta sesión; `app_settings.engine` debe continuar `wheel-v2` hasta completar el runbook.


### Releases separadas para terminar el cutover — 2026-09-29
- El gate ya no exige que Render y Vercel estén en el mismo commit, sino que exige y audita dos SHA explícitos: `EXPECTED_BACKEND_SHA` y `EXPECTED_FRONTEND_SHA`.
- Compatibilidad observada: Vercel tuvo `success` en `87532489ca44d8ed5cd9378a5e17db64f360c032`. Entre ese commit y `eba415f82579d7dc763513531cbb7c6f4c35f831` no cambió ningún archivo bajo `frontend/` ni las fachadas API consumidas por la app.
- Backend/cutover candidato: `eba415f82579d7dc763513531cbb7c6f4c35f831`.
- GitHub Actions run `36521118598` sobre ese commit terminó `success` completo.
- El cutover audita `backendReleaseSha` y `frontendReleaseSha` por separado dentro de `admin_audit_events`.
- Todavía falta confirmar el SHA realmente desplegado por Render; no se infiere como desplegado sólo porque Actions esté verde.
- Plugins opcionales de Render y Vercel fueron sugeridos para poder inspeccionar/activar deploys directamente desde ChatGPT; requieren conexión explícita del usuario.


### WhatsApp productivo — herramienta lista 2026-09-29
- `preflight:full` real run `36585295135` confirmó que faltan exactamente las 5 entradas externas de Meta en GitHub Environment `production`.
- Se agregó `npm run whatsapp:test:prod` y workflow manual `LA RED WhatsApp production test`.
- El workflow exige confirmación `SEND-WHATSAPP-TEST`, ejecuta primero `preflight:full` y sólo después envía una plantilla al teléfono indicado.
- No se envió ningún WhatsApp durante esta implementación.
- CI del tooling WhatsApp: run `36586440051` success completo; tests/unit/integración y frontend verdes.
- Para terminar WhatsApp: cargar `PROD_WHATSAPP_PHONE_NUMBER_ID`, `PROD_WHATSAPP_ACCESS_TOKEN`, `PROD_WHATSAPP_TEMPLATE_NAME`, `PROD_WHATSAPP_GRAPH_VERSION`, `PROD_WHATSAPP_TEMPLATE_LANGUAGE`; luego correr el workflow manual con un número de prueba propio.


### Outbox WhatsApp saneado antes de configurar Meta — 2026-09-29
- Main HEAD funcional: `259b7cd3d38dbd5db0a859d1dd27a0103d686a75`; GitHub Actions run `36588283933` success completo.
- Se agregó estado técnico `expired` a `notification_outbox` y migración `PATCH_WHATSAPP_OUTBOX_EXPIRY_2026-09-29.sql`.
- Antes de enviar, `password_recovery`, `phone_change` y `pair_invitation` se validan contra su registro origen; usados/vencidos/cancelados/aceptados pasan a `expired` y no salen por WhatsApp.
- Producción ya aplicó la migración: auditoría real sin PII mostró `password_recovery: expired = 1`, `pair_invitation: pending = 1`, `recovery_deliverable_queue = 0`, `valid_pair_invites = 1`.
- Render sigue con `whatsappConfigured=false`; outbox productivo no tiene mensajes fallidos y conserva sólo una invitación válida pendiente.
- No cargar Meta hasta tener listas las 5 entradas tanto en GitHub Environment `production` como en el servicio Render.
