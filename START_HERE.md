# START_HERE.md — LA RED Tenis

Este archivo es un índice de continuidad de LA RED Tenis. El sistema competitivo es la rueda de `LucasDNG/la-red-padle`, adaptada a tenis por parejas. No se usa Elo.

Los documentos de despliegue que nombran Render, Neon o dominios de pádel describen ese proyecto de origen. No son el entorno de LA RED Tenis.

## Orden para retomar

1. Verificar el HEAD actual de `main` y sus checks.
2. Leer `NEXT_CHAT_HANDOFF.md`.
3. Leer `CHECKPOINT_2026-09-20.md`.
4. Leer `PROJECT_RULES.md`.
5. Leer `DECISIONS.md`.
6. Leer `SIMULATION_AUDIT_2026-09-20.md`.
7. Leer `AUDIT_2026-09-20.md`.
8. Leer `TEST_SCENARIOS.md`.
9. Si corresponde: `ARCHITECTURE.md`, `PROJECT_JOURNEY.md`, `RELEASE_CHECKLIST.md`, `FINALIZATION_PLAN.md`.

Si un resumen de chat contradice el repo, manda el repo. Si dos documentos se contradicen, prevalece el checkpoint/handoff más reciente y se corrige la documentación antes de tocar reglas.

## Estado técnico actual

- package: `5.0.9`.
- motor único: `wheel-v2`.
- runtime objetivo: Node 22.
- PostgreSQL de CI: 16.
- tests puros: 70/70 verdes en el último checkpoint verificado.
- integración PostgreSQL: 46/46 verdes.
- `verify:db`: verde.
- frontend build: verde.
- Vercel: status `success` en el último checkpoint verificado.
- corazón deportivo y edge cases críticos: cubiertos automáticamente.
- `frontend/.vite/`: eliminado del repo y agregado a `.gitignore`.

No asumir un CI nuevo como verde hasta consultarlo directamente en GitHub Actions.

## Reglas de trabajo

- No reconstruir desde memoria ni desde ZIPs.
- No cambiar reglas deportivas por un fallo de test sin compararlo con `PROJECT_RULES.md` y `DECISIONS.md`.
- Primero simulaciones/tests, luego PostgreSQL, manual solo para UX/smoke.
- Distinguir fixture/test debt de bugs reales.
- Push directo a `main`.
- Después de cambios importantes, actualizar checkpoint/handoff.
- No tocar, imprimir ni pegar secretos reales en chats.
- No interpretar limitaciones DNS del entorno del chat como caída de producción.

## Lo que queda

Los gates principales ya requieren infraestructura/credenciales reales:

1. cargar secrets/variables core del GitHub Environment `production`;
2. ejecutar `preflight:core` contra Neon real;
3. confirmar startup Render + `/api/health`;
4. ejecutar production smoke real;
5. probar TOTP con autenticador real;
6. confirmar restore window/RPO/RTO y hacer drill de recuperación Neon;
7. configurar Meta WhatsApp y entregar un mensaje real;
8. ejecutar `preflight:full`;
9. smoke UX autenticado;
10. revisión legal/seguro en Argentina.

Deuda técnica no bloqueante: generar legítimamente `frontend/package-lock.json` y recién entonces migrar el job frontend a `npm ci`.


## Estado UX vigente — 2026-09-22
- Rival: lo asigna la rueda automática; no existe desafío manual.
- Programación: lugar libre escrito por jugadores, sin cancha precargada obligatoria.
- Canchas adheridas: capa comercial separada, publicada solo por decisión Admin.
- La auditoría `USER_JOURNEY_AUDIT_2026-09-22.md` documenta cada flujo visible.
- Producción debe desplegar el patch de lugares libres y correr un preflight core nuevo.
