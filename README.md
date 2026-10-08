# LA RED Tenis · San Pedro

Liga continua de tenis por parejas en San Pedro. El ranking es la posición en la escalera: si una pareja de abajo le gana a una de arriba, intercambian lugares. La rueda asigna el rival. No hay Elo ni desafíos manuales.

El motor es el de LA RED Pádel (`wheel-v3`), con las mismas reglas de categorías, ataque y defensa. La marca, los textos y la cancha son de tenis.

## Stack
- Node.js 22 + Express 5
- PostgreSQL / Neon
- React 19 + Vite 7
- Render + Vercel
- Meta WhatsApp Cloud API mediante outbox

## Motor
`wheel-v3` es el motor competitivo. La base puede conservar `wheel-v2` como compatibilidad, igual que en el sistema de origen.

## Fuente de verdad
Empezar por `START_HERE.md` y `NEXT_CHAT_HANDOFF.md`. Reglas y decisiones viven en `PROJECT_RULES.md` y `DECISIONS.md`; el estado validado en `CHECKPOINT_2026-09-20.md`; hallazgos en `AUDIT_2026-09-20.md`.

## Estado automatizado confirmado
- package `5.0.9`;
- 67/67 tests puros;
- 46/46 integración PostgreSQL;
- `verify:db` verde;
- frontend build verde;
- Node 22/PostgreSQL 16 verdes en CI;
- Vercel status `success` en el último checkpoint verificado;
- motor deportivo, concurrencia y edge cases principales cubiertos;
- seguridad HTTP, no-store, request correlation, graceful shutdown, liveness/readiness y migrations startup cubiertos;
- preflight core/full y production smoke preparados.

No asumir un commit nuevo como verde sin consultar GitHub Actions.

## Pendiente principal
Los bloqueos principales ya son operativos: Environment `production`, preflight real contra Neon, Render health, production smoke, TOTP real, recuperación Neon, Meta WhatsApp, smoke UX y revisión legal/seguro.

## Local

Backend:
```bash
npm ci
npm start
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Frontend sigue usando `npm install` porque todavía no existe un `frontend/package-lock.json` generado legítimamente.

## Tests
```bash
npm run check
npm test
npm run verify:db
npm run test:integration
npm run simulate:balance
```

## Administración
- login reservado: `/admin-la-red`;
- guía: `ADMIN_GUIDE.md`;
- primer propietario: `npm run admin:promote -- <DNI>`.

## Producción
LA RED Tenis todavía no tiene dominio ni servicio propios. No reutilizar los hosts de LA RED Pádel.

Cuando existan, el smoke usa las variables del entorno de tenis:

```bash
PROD_API_URL=https://api.ejemplo-tenis \
PROD_FRONTEND_URL=https://app.ejemplo-tenis \
npm run smoke:prod
```

No pegar secretos en Git ni en chats. Generarlos localmente con:
```bash
npm run generate:secrets -- --account=admin
```


## Flujo visible actual
La pareja se forma por invitación + aceptación y la rueda automática asigna el rival; no existe selección manual de desafío. Desde `Mi liga` se coordinan fecha y lugar libre, aceptación de propuesta, resultado, corrección/confirmación, no-show, extensión extraordinaria e incidentes. `Mi pareja` expone pausa, confirmación, disolución y reactivación.

Los lugares escritos por jugadores son solo referencias de coordinación. El catálogo `venues` queda reservado para canchas adheridas/comerciales que administración decida publicar explícitamente.
