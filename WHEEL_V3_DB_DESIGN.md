# LA RED Tenis — Diseño de estado y migración Wheel v3
Fecha: 2026-09-28

## Estado
Este documento define el estado persistente que debe existir **antes** de reemplazar el runtime `wheel-v2`.

Principios:
- la migración de preparación es aditiva;
- `app_settings.engine` permanece en `wheel-v2`;
- no se eliminan todavía columnas/tablas legacy que el runtime actual necesita;
- el cambio de motor y la limpieza legacy ocurren en una etapa posterior, con tests PostgreSQL verdes;
- todos los timestamps operativos usan `timestamptz` y las decisiones de vencimiento se resuelven con reloj de PostgreSQL/backend.

## 1. Estado por circuito

### `league_wheel_state`
Una fila por circuito.

Campos:
- `league_id`: PK/FK a `leagues`;
- `formation_completed_at`: NULL mientras el circuito sigue en formación; timestamp definitivo cuando las 7 categorías alcanzaron el mínimo de 5 activas;
- `created_at`, `updated_at`.

La formación, una vez cerrada, nunca vuelve a abrirse.

## 2. Estado competitivo Wheel v3 por pareja

### `pair_wheel_state`
Una fila por identidad técnica de pareja.

Campos:
- `pair_id`: PK/FK;
- `role`: `attack` / `defense` / NULL;
- `role_streak`: cantidad consecutiva del rol actual;
- `defense_required_until_real`: obligación persistente de defensa después de incumplimiento propio hasta completar una defensa real, salvo imposibilidad estructural;
- `real_waiting_since`: inicio de la antigüedad de espera Wheel v3; solo un partido real o una reactivación la reinicia;
- `promotion_wins`: victorias reales corrientes en zona de ascenso;
- `awaiting_zone_first_match`: indica que falta el partido real habilitante posterior a formación;
- `awaiting_zone_kind`: conserva si ese habilitante corresponde a `promotion` o `relegation`, evitando reinterpretarlo si la posición cambia antes del partido;
- `inactive_since`: inicio autoritativo de inactividad;
- `return_position_base`: posición base congelada al inactivarse;
- `inactive_reason`: `voluntary` o `three_failures`;
- `auto_reactivate_at`: solo para sanción automática de 30 días;
- timestamps de creación/actualización.

`pairs.waiting_since` queda como dato legacy de wheel-v2. Wheel v3 usa `pair_wheel_state.real_waiting_since` porque los cierres administrativos de v2 no tienen la misma semántica.

La posición de retorno se calcula desde `inactive_since` + `return_position_base`. “Mes completo” se interpreta como aniversario calendario del instante de inactividad, no como bloques fijos de 30 días.

## 3. Estado anti-abuso de la dupla exacta

### `pair_duo_state`
Estado ligado a las dos personas, independiente de que la pareja técnica esté activa, archivada o se vuelva a formar.

Clave canónica:
- `league_id`;
- `member_low_id`;
- `member_high_id`;
- CHECK `member_low_id < member_high_id`;
- UNIQUE por esos tres campos.

Campos:
- `failure_streak`: incumplimientos atribuibles consecutivos de esa dupla;
- `penalty_until`: fin autoritativo de la sanción de 30 días, cuando exista;
- `pending_relegation_category_id`: categoría donde nació un período de descenso no resuelto;
- `pending_relegation_losses`: derrotas acumuladas que cuentan para el período;
- `relegation_route_step`: progreso de dificultad de la ruta de ataque durante el período; avanza solo con derrotas reales jugadas y se reinicia al resolver el período;
- `pending_relegation_started_at`;
- timestamps.

Este estado sobrevive a disoluciones y parejas intermedias. Una victoria real que resuelve el período o un descenso efectivo limpia el pendiente. Un cierre real sin incumplimiento propio reinicia `failure_streak`; una cancelación automática no.

## 4. Assignment Wheel v3

Se agregan a `wheel_assignments`:
- `attacker_pair_id`;
- `defender_pair_id`;
- `cancelled_at`;
- `first_result_at`.

Reglas:
- atacante y defensor son nulos juntos o ambos presentes;
- deben ser distintos;
- ambos deben pertenecer a `pair_a_id/pair_b_id`;
- `cancelled_at` permite validar un resultado cargado tarde cuando `played_at <= cancelled_at`;
- `first_result_at` fija el punto desde el que cambios posteriores de ranking/categoría ya no cancelan el partido;
- `confirmation_deadline_at` existente se reutiliza en Wheel v3 como deadline de revisión de 7 días.

Las columnas legacy de extensión extraordinaria se mantienen únicamente porque `wheel-v2` sigue activo; Wheel v3 no las utilizará.

## 5. Récord del #1 de Primera

### `first_place_reigns`
Representa reinados concretos, no un acumulado eterno.

Campos:
- `league_id`;
- `pair_id`;
- `started_at`;
- `ended_at`;
- `defenses`;
- timestamps.

Solo puede existir un reinado abierto por circuito. Cada regreso al #1 crea un reinado nuevo en cero. La consulta pública del récord usa el máximo de defensas y permite empate compartido.

`elo_record_history` se conserva temporalmente por compatibilidad con `wheel-v2`, pero no es la fuente del récord Wheel v3 y se retirará en la limpieza posterior al cutover.

## 6. Tiempo autoritativo

- PostgreSQL/backend son la autoridad del dominio.
- Defaults y deadlines se generan con `CURRENT_TIMESTAMP/NOW()`.
- No se persistirá un “reloj del cliente”.
- Las comparaciones sensibles deben ocurrir en SQL/transacción.
- La API Wheel v3 devolverá deadlines absolutos y `server_now`.
- El frontend podrá estimar countdowns, pero cualquier acción vuelve a validarse contra el reloj autoritativo.
- Presentación: `America/Argentina/Buenos_Aires`; persistencia/lógica: UTC/`timestamptz`.

## 7. Estrategia de transición desde Wheel v2

La migración de preparación:
1. crea las estructuras nuevas;
2. crea una fila de `league_wheel_state` por circuito;
3. crea `pair_wheel_state` para las parejas existentes;
4. para parejas actualmente `paused`, conserva la posición como base y usa el mejor timestamp de pausa disponible; si no existe evidencia histórica suficiente, usa el momento de migración para no castigar retroactivamente;
5. crea `pair_duo_state` para toda dupla exacta existente;
6. inicia en cero los contadores específicamente Wheel v3 que no tienen equivalencia semántica segura con Wheel v2;
7. no modifica posiciones, categorías, memberships, partidos oficiales ni el engine activo.

No se traducen automáticamente `consecutive_wins`, `consecutive_losses`, `monthly_miss_streak`, ELO ni récord legacy a contadores Wheel v3: sus semánticas no son equivalentes y hacerlo podría aplicar reglas nuevas retroactivamente.

## 8. Gates antes del cutover

Antes de cambiar `app_settings.engine` a `wheel-v3` deben estar verdes:
- instalación limpia desde `database/schema.sql`;
- migración ejecutada dos veces sin cambios inválidos;
- `database/verify.sql`;
- constraints de dupla/roles/reinados;
- reloj PostgreSQL para deadlines;
- retorno de inactividad;
- sanción de 30 días;
- período de descenso persistente por dupla;
- resultado jugado antes de cancelación;
- concurrencia de assignments/resultados/movimientos;
- suite pura Wheel v3;
- suite PostgreSQL Wheel v3.

La eliminación de columnas/tablas legacy es posterior al cutover estable.


## 9. Sincronización durante la convivencia temporal

Mientras `wheel-v2` siga aceptando formación de parejas:
- un trigger `AFTER INSERT` sobre `pairs` crea `pair_wheel_state`;
- un trigger `AFTER INSERT` sobre `pair_members` crea `pair_duo_state` al quedar identificados exactamente dos integrantes;
- ambos usan `ON CONFLICT DO NOTHING` para conservar idempotencia.

Esto evita que la base preparada quede incompleta entre la migración y el cutover.
