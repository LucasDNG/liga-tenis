# CHAT_HANDOFF_PROTOCOL.md — Protocolo anti-inconsistencias

## Objetivo

Que un chat nuevo retome LA RED desde el estado real del repositorio, no desde memoria conversacional ni desde una cronología vieja.

## Antes de cerrar un chat largo

Actualizar, según corresponda:
- `NEXT_CHAT_HANDOFF.md`;
- `CHECKPOINT_2026-09-20.md`;
- `AUDIT_2026-09-20.md` si hubo hallazgo/bug;
- `DECISIONS.md` solo si hubo decisión nueva;
- `PROJECT_RULES.md` solo si cambió una regla;
- `PROJECT_JOURNEY.md` si cambió el rumbo.

Luego commit/push directo a `main` y verificar los checks antes de declarar el checkpoint verde.

## Al abrir un chat nuevo

Orden:
1. consultar HEAD real de `main`;
2. comprobar GitHub Actions + Vercel de ese HEAD;
3. leer `NEXT_CHAT_HANDOFF.md`;
4. continuar con los documentos que ese handoff enumera.

Prompt recomendado:

> Continuemos `LucasDNG/la-red-padle`, rama `main`. No reconstruyas nada de memoria. Primero verificá el HEAD real y sus checks. Después leé completo `NEXT_CHAT_HANDOFF.md` y los documentos que enumera. Los `.md` del repo son la fuente de verdad. No afirmes CI verde sin comprobarlo y no cambies reglas deportivas sin contrastarlas con `PROJECT_RULES.md` y `DECISIONS.md`.

## Regla de seguridad de contexto

Si el chat no puede leer el repo, no debe inventar el estado. Debe trabajar con los archivos que el usuario adjunte o explicar esa limitación.

## Buen checkpoint

Debe dejar claro:
- HEAD/commit;
- qué está realmente verde;
- qué cambió;
- bugs/deudas abiertas;
- gates externos;
- próximo paso.

## Mala práctica

No usar como fuente principal:
- ZIPs históricos;
- versiones `v1`…`v11`;
- resumen automático del chat;
- cifras viejas al principio de un documento cronológico;
- asumir que el último deploy sigue vigente sin comprobarlo.

La continuidad se apoya en repo + HEAD + checks + documentos vigentes.
