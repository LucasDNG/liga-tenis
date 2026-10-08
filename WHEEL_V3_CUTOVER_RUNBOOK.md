# Wheel v3 — Runbook de cutover

Fecha: 2026-09-29

## Principio

El cutover cambia únicamente cuando el código dual ya está desplegado y validado. No se mezclan assignments v2 y v3.

## Preconditions obligatorias

1. El commit a activar debe tener GitHub Actions completamente verde.
2. El backend desplegado debe ser la versión dual v2/v3.
3. `app_settings.engine` debe seguir en `wheel-v2`.
4. No puede haber assignments vivos (`open`, `result_pending`, `disputed`).
5. No puede haber pausas/disoluciones pendientes ni `pause_after_current`.
6. Todas las parejas, duplas exactas y circuitos deben tener su estado preparatorio v3.
7. La release desplegada debe incluir la barrera global de escrituras competitivas (`8675311`): writes normales toman lock compartido y el cutover lo toma en exclusivo. Esa barrera sustituye el quiesce manual de Render.

El chequeo recomendado previo al cambio es:

```
EXPECTED_BACKEND_SHA=<sha-backend> EXPECTED_FRONTEND_SHA=<sha-frontend> npm run precutover:wheel-v3
```

Combina configuración de producción, TLS, preflight de base, gate competitivo v3 y smoke HTTP. Exige el SHA exacto observado de Render (`EXPECTED_BACKEND_SHA`) y el SHA exacto observado de Vercel (`EXPECTED_FRONTEND_SHA`). Pueden ser distintos si la compatibilidad fue verificada explícitamente; ambos quedan auditados. Debe devolver `ok: true` y `cutover.ready: true`.

Si el frontend responde sin `la-red-release`, revisar en Vercel que estén expuestas las System Environment Variables y volver a desplegar. El build usa `VERCEL_GIT_COMMIT_SHA` / `VITE_VERCEL_GIT_COMMIT_SHA`; no se debe saltear el gate poniendo un SHA manual dentro del código.

El chequeo competitivo aislado sigue disponible con `npm run check:wheel-v3-cutover`.

## Activación

Con el precutover verde:

```
CONFIRM_WHEEL_V3_CUTOVER=YES EXPECTED_BACKEND_SHA=<sha-backend> EXPECTED_FRONTEND_SHA=<sha-frontend> CUTOVER_ADMIN_USER_ID=<admin_id> npm run activate:wheel-v3
```

Si existe exactamente un único Admin verificado, `CUTOVER_ADMIN_USER_ID` puede omitirse y el script lo resuelve de forma determinista.

El comando:
- abre una transacción;
- toma primero el lock exclusivo de la barrera global de writes (`8675311`), esperando cualquier escritura competitiva en curso;
- luego toma los advisory locks del asignador y mantenimiento;
- vuelve a comprobar todos los blockers;
- bloquea la fila de engine;
- cambia `wheel-v2 -> wheel-v3` de forma atómica;
- hace rollback ante cualquier error.

El backend permanece online durante todo el cambio; las escrituras competitivas quedan serializadas por la barrera PostgreSQL.

## Verificación inmediata

Ejecutar:

```
EXPECTED_BACKEND_SHA=<mismo-sha-backend> EXPECTED_FRONTEND_SHA=<mismo-sha-frontend> npm run postcutover:wheel-v3
```

Ese comando valida configuración productiva, TLS, preflight/estado operativo v3 y smoke HTTP exigiendo `engine=wheel-v3`.

Además confirmar:
- `/api/health` informa `engine: wheel-v3`;
- liveness está verde;
- ranking público responde;
- login y `/api/me/league` responden;
- Admin muestra `engine: wheel-v3`;
- no aparece extensión extraordinaria;
- no aparece puntuación numérica paralela;
- mantenimiento v3 puede crear assignments sólo con attacker/defender definidos.

## Rollback

### Antes del primer write deportivo v3

Si el engine fue cambiado pero aún no existe ningún assignment, resultado, sanción, movimiento o transición deportiva creada por v3, se puede evaluar volver a v2 mediante una operación explícita y auditada.

### Después del primer write deportivo v3

**No cambiar simplemente `app_settings.engine` a `wheel-v2`.**

Desde ese momento las semánticas de roles, assignments, ascenso/descenso, inactividad y resultados son v3. Un rollback de software debe mantener `engine=wheel-v3` y desplegar una versión de código compatible o aplicar una migración de recuperación diseñada específicamente.

## Estado validado antes del cutover

GitHub Actions run `36509908405`, commit `9fa38f9a0529bafd3c7d36f82c72ac0d70b85710`: frontend build, check, unit tests, verify DB e integración PostgreSQL completos en verde.


## Par compatible verificado antes del cutover

A fecha 2026-09-29:

- último build de Vercel observado como `success` con cambio real de frontend/config: `87532489ca44d8ed5cd9378a5e17db64f360c032`;
- candidato backend/cutover validado por CI: `eba415f82579d7dc763513531cbb7c6f4c35f831`;
- GitHub Actions run `36521118598`: frontend, check, unit, verify DB e integración PostgreSQL completos en verde;
- comparación Git `87532489… -> eba415f8…`: sin cambios en `frontend/` ni en `src/wheelV3Api.js`, `src/pairsV3Api.js`, `src/adminV3Api.js` o `src/app.js`.

Por eso ese par es compatible desde el punto de vista de código. **No asumir que Render ya sirve `eba415f8…`: el precutover debe comprobar el SHA real del backend antes de activar.**


## Ejecución desde GitHub Actions

Si no se usa una terminal con los secretos productivos, existen dos workflows manuales bajo **Actions**:

- `Wheel v3 production precutover`
- `Wheel v3 production postcutover`

Ambos usan el environment `production` y los secretos/variables ya configurados en GitHub. Piden dos inputs:

- `backend_sha`: SHA exacto que debe exponer Render;
- `frontend_sha`: SHA exacto que debe exponer Vercel.

El precutover es no destructivo: valida configuración, TLS, DB, blockers deportivos, health/smoke y ambos SHA. El postcutover hace la misma verificación exigiendo además `engine=wheel-v3`.

El switch ya se ejecutó. Para un procedimiento equivalente, usar la activación controlada con la barrera PostgreSQL exclusiva descrita arriba; el quiesce manual no es un requisito del mecanismo actual. No repetir el cutover sobre producción v3.


## Estado actual — CUTOVER COMPLETADO

El procedimiento se ejecutó exitosamente el 2026-09-29 mediante GitHub Actions run `36522396511`.

- activación: `2026-09-29T04:36:57.554Z`;
- engine: `wheel-v3`;
- backend del switch: `209f8164920a20fa6ee3a540b0c1d4b205112e70`;
- frontend del switch: `87532489ca44d8ed5cd9378a5e17db64f360c032`;
- precutover: `ready:true`, `blockers:[]`;
- postcutover: `ok:true`, DB ok, engine v3, readiness v3 verde.

Este runbook queda como procedimiento de recuperación/auditoría. No volver a ejecutar el switch v2→v3 sobre la producción ya activada.
