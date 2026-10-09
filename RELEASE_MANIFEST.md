# Release Manifest — referencia histórica y estado actual

> Actualización 2026-10-02: producción usa Wheel v3 desde 2026-09-29. El estado vigente está en `PUBLIC_LAUNCH_STATUS.md` y `NEXT_CHAT_HANDOFF.md`; los conteos y pendientes del checkpoint inferior son históricos. La auditoría de UI actual está en `FUNCTIONAL_AUDIT_2026-10-02.md`.

## Candidato de referencia
- fuente de verdad: repositorio `LucasDNG/la-red-padle`, rama `main`;
- package: `5.0.9`;
- motor: `wheel-v2`;
- estado: **candidato técnicamente estabilizado, no release público final**.

Los ZIPs históricos `v1`…`v11` no son fuente de verdad y no deben reaplicarse sobre `main`.

## Validación automatizada vigente
- 67/67 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db` verde;
- frontend build verde;
- Node 22 + PostgreSQL 16;
- Vercel `success` en el último checkpoint verificado.

## Bloques cerrados
- motor deportivo `wheel-v2`;
- escalera/ascenso/descenso y válvula poblacional;
- pareja/rueda/programación/resultados;
- no-show/extensión/pausa/disolución/disciplina;
- lesión/abandono;
- concurrencia/idempotencia PostgreSQL;
- schema/patch/verify;
- identidad DNI + reenvío/purga;
- Admin privado + TOTP fail-closed en código;
- outbox WhatsApp con dedupe/retry y errores sanitizados;
- TLS/config preflight;
- migrations startup con advisory lock;
- liveness/readiness;
- graceful shutdown y pool errors;
- headers/no-store/request correlation;
- smoke público automatizado;
- backend/preflight/smoke con `npm ci`;
- workflows least-privilege/timeouts;
- caché generada `frontend/.vite/` fuera del repo.

## Pendientes de release
- secrets/variables core del Environment `production`;
- `preflight:core` real contra Neon;
- Render startup + `/api/health`;
- production smoke real;
- TOTP con autenticador real;
- restore window/RPO/RTO + drill Neon;
- Meta WhatsApp + mensaje real;
- `preflight:full`;
- smoke UX autenticado;
- revisión legal/seguro Argentina.

## Deuda no bloqueante
Generar legítimamente `frontend/package-lock.json` y después migrar el job frontend a `npm ci`.

Antes de declarar release, verificar el HEAD actual y sus checks; no reutilizar el estado de un commit anterior.


### UX / lugares — 2026-09-22
- free-text `location_text` para programación;
- migración `PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql`;
- catálogo comercial de canchas separado;
- auditoría de superficie `USER_JOURNEY_AUDIT_2026-09-22.md`;
- regresión de paridad API/frontend.
