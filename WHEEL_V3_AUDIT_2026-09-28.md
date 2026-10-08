# LA RED Tenis — Auditoría lógica y simulación preliminar Wheel v3
Fecha: 2026-09-28

## Alcance

Esta auditoría se realiza **antes de tocar el motor competitivo**. El runtime sigue en `wheel-v2`.

Objetivos:
- buscar deriva poblacional;
- buscar deadlocks de ataque/defensa;
- buscar estados imposibles;
- detectar reglas explotables por disolución/re-formación, inactividad o incumplimientos;
- convertir hallazgos en tests antes de implementar.

## 1. Población — Monte Carlo preliminar

Se ejecutó un modelo poblacional simplificado, separado del código productivo.

Supuestos del modelo:
- 7 categorías;
- 12 parejas activas iniciales por categoría;
- 20 años;
- 1.000 corridas por escenario;
- oportunidades mensuales aproximadas de ascenso/descenso;
- probabilidades de resultado 0,50 / 0,55 / 0,60;
- requisito 3/2/1 según porcentaje;
- un movimiento solo se acelera si reduce la desviación conjunta de origen+destino respecto de 14,2857%;
- el movimiento sigue requiriendo resultado deportivo;
- no se modelaron todavía inactividad real, calendario de 30 días, disoluciones ni matching completo.

Resultado medio final por categoría:

| Probabilidad del evento | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª | Corridas con categoría vacía | RMSE medio |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0,50 | 11,986 | 12,076 | 11,964 | 11,943 | 11,976 | 12,021 | 12,034 | 0,1% | 2,375 |
| 0,55 | 12,014 | 12,093 | 11,988 | 11,823 | 12,013 | 12,015 | 12,054 | 0,1% | 2,396 |
| 0,60 | 12,061 | 12,099 | 12,002 | 11,777 | 12,006 | 12,006 | 12,049 | 0,2% | 2,424 |

### Lectura

No aparece una deriva sistemática hacia arriba o abajo bajo esta interpretación del balance. Esto es una señal favorable, **no una aprobación final**: falta incorporar el motor real de roles, inactividad, altas/bajas y comportamiento humano.

## 2. Ataque/defensa — prueba sintética de flujo

Se probó un scheduler greedy de referencia con:
- #1 forzado a defensa;
- último forzado a ataque;
- prioridad por mayor espera;
- búsqueda en ventanas crecientes de 3;
- atacante -> defensa / defensor -> ataque;
- balance aproximado;
- límite blando de 2 roles iguales.

En 50.000 partidos sintéticos no apareció deadlock estructural.

Métrica de espera medida en cantidad de eventos del simulador, **no en días reales**:

| Parejas activas en categoría | espera máxima observada | percentil 99 |
|---|---:|---:|
| 10 | 40 | 12 |
| 20 | 109 | 28 |
| 50 | 478 | 76 |

### Lectura

La rueda puede fluir incluso con categorías grandes, pero la dispersión de espera crece con la población. El test final debe proteger:
- que nadie elegible quede permanentemente hambriento;
- que la prioridad por tiempo gane sobre cercanía cuando corresponda;
- que el límite de 2 roles no cree deadlock;
- que el límite pueda romperse si hace falta para jugar.

## 3. Invariantes que ya se pueden convertir en tests

1. Una categoría con 1 activa no crea assignment.
2. Con 2 activas, #1 defensa / #2 ataque produce cruce válido.
3. Un atacante nunca recibe rival por debajo.
4. Ventanas 3/6/9 se expanden en el mismo ciclo, sin espera artificial.
5. Si dos atacantes quieren al mismo defensor, gana el que lleva más tiempo sin partido real.
6. Una victoria administrativa no reinicia `waiting_since`.
7. Una victoria administrativa no cuenta para ascenso ni para salir de descenso.
8. Lesión/abandono iniciado sí cuenta como partido real.
9. 7ª nunca entra en período de descenso.
10. Tres incumplimientos atribuibles => 30 días inactiva y reactivación automática.
11. #1 que se inactiva vuelve como máximo #2.
12. Inactividad >3 meses degrada solo posición de retorno, nunca categoría.
13. Descendido entra #2 salvo inexistencia material de #1.
14. **HISTÓRICO / SUPERADO:** durante la primera auditoría se evaluó `floor(N/2)+1`. La decisión vigente posterior reemplazó esa fórmula por ingreso **anteúltimo**: N=0 => #1; N=1 => #2; N>=2 => posición N.
15. Primer partido de una pareja 0 PJ al activarse zonas no cuenta para el 0/3.
16. Resultado cargado abre 7 días desde la carga y luego auto-valida por silencio.
17. Masculino y Femenino forman y equilibran población de manera independiente.
18. El récord de Primera es por reinado; un nuevo reinado empieza en 0.

## 4. Hallazgos de lógica que todavía conviene cerrar

### A. Disolver y re-formar puede borrar un período de descenso

Escenario:
- una dupla está en período de descenso con 2 derrotas;
- resuelve su assignment;
- se disuelve;
- los mismos dos jugadores vuelven a formar pareja;
- la regla actual dice que es una pareja competitivamente nueva y entra a mitad de tabla.

Así puede evitar el descenso sin conseguir la victoria real que exigía el período.

**Propuesta simple:** la pareja nueva no conserva estadísticas ni historial, pero si son exactamente los mismos dos jugadores y existía un período de descenso abierto, ese estado anti-abuso sobrevive a la re-formación hasta una victoria real o descenso.

### B. Un descenso real puede deshacerse disolviendo y re-formando

Ejemplo:
- jugador individual 2ª + jugador individual 5ª => pareja en 2ª;
- la pareja desciende deportivamente a 3ª;
- si el jugador de 2ª sigue figurando individualmente en 2ª, al disolver y volver a formar los mismos dos, la regla de “mayor nivel” los devuelve a 2ª.

Eso anula el descenso.

**Propuesta:** recuperar la regla anterior: cuando la pareja desciende por debajo de la categoría individual vigente de un integrante, la categoría individual de ese integrante empeora hasta la nueva categoría. El integrante que ya tenía una categoría inferior no empeora innecesariamente.

Ejemplo:
- 2ª + 5ª descienden a 3ª => individuales quedan 3ª y 5ª.
- si vuelven a formar, arrancan en 3ª.

### C. Resultado ya cargado vs. cancelación automática posterior

Escenario:
- A ataca válidamente a B;
- juegan;
- A carga el resultado;
- antes de que B confirme, otro movimiento de ranking invierte A/B.

La regla de cancelación por inversión no debería borrar un partido que ya fue jugado y cargado válidamente.

**Propuesta:** desde la primera versión de resultado cargada, el assignment queda fuera de la cancelación automática por cambios posteriores de ranking/categoría. Si la inversión ocurrió **antes** de cualquier versión cargada, sí se cancela.

### D. Qué reinicia los 3 incumplimientos

La frase vigente “cualquier assignment cerrado sin incumplimiento atribuible reinicia a 0” incluye técnicamente una cancelación automática del sistema.

Eso permitiría:
- 2 incumplimientos;
- assignment nuevo;
- el ranking cambia y el sistema lo cancela;
- la racha vuelve a 0 sin que la pareja haya demostrado cumplimiento.

**Propuesta:** una cancelación automática por ranking/categoría **no reinicia** la racha. La reinicia un assignment resuelto deportivamente sin incumplimiento propio o un cierre donde el incumplimiento fue atribuible únicamente al rival.

## 5. Reglas técnicas que no necesitan una decisión deportiva nueva

Estas deberían fijarse como invariantes de implementación:

### Primer partido tras formación
Si una pareja con 0 PJ juega el partido habilitante:
- ese resultado no cuenta para el 0/3;
- después de aplicar el resultado se vuelve a mirar su **posición actual**;
- solo entra 0/3 si sigue ocupando #1 de 2ª–7ª o último de 1ª–6ª.

### Tercer incumplimiento + otra consecuencia
Si el tercer incumplimiento también provoca movimiento deportivo (por ejemplo último activo que desciende):
1. primero se aplica resultado/penalización/movimiento de categoría;
2. después se aplican los 30 días de inactividad.

Así la sanción no puede impedir materializar el descenso.

### Retorno fuera del tamaño actual
Si la posición de retorno calculada es mayor que la cantidad de activas + 1:
- vuelve al fondo de su misma categoría;
- nunca se crea un hueco de posiciones.

### Balance poblacional direccional
Para cada posible movimiento origen -> destino:
1. calcular porcentajes actuales por circuito;
2. comprobar si mover 1 pareja reduce la desviación conjunta origen+destino respecto de 14,2857%;
3. solo entonces permitir requisito acelerado;
4. la severidad se toma de la necesidad direccional:
   - origen sobrepoblado favorece salida;
   - destino subpoblado favorece entrada;
5. si no mejora el equilibrio conjunto, requisito 3.

Esto evita acelerar una promoción desde una categoría ya vacía o hacia una ya sobrecargada.

## 6. Tests que deben existir antes de implementar

### Matching
- extremos estructurales;
- ventanas crecientes;
- colisión de atacantes;
- repetición de rival;
- máximo blando de roles;
- categorías 1/2/3/N;
- fairness con 10/20/50 parejas.

### Ranking y movimiento
- swap por victoria inferior;
- resultado sin swap;
- cancelación antes de resultado;
- resultado cargado protegido de cancelación posterior;
- ascenso a mitad;
- descenso #2;
- movimientos concurrentes.

### Zonas
- inicio 0/3;
- 0 PJ;
- salida de descenso por victoria real;
- victoria administrativa no salva;
- umbral 1/2/3 recalculado por resultado;
- formación independiente por circuito.

### Inactividad
- voluntaria con/sin assignment;
- #1 -> retorno máximo #2;
- 3 meses exactos;
- 4/5/6 meses;
- dos inactivas con mismo target;
- descenso congelado;
- sanción de 30 días.

### Anti-abuso
- disolver/re-formar durante descenso;
- disolver/re-formar después de descenso;
- sanción de 30 días no evadible cambiando de pareja;
- cancelación automática no limpia strikes.

### Récord de Primera
- defensa 1/2/...;
- pérdida de #1 cierra reinado;
- nuevo reinado empieza 0;
- supera récord;
- empata récord;
- mismo dúo no se duplica como dos holders idénticos del mismo máximo.

## Estado

Wheel v3 sigue sin implementarse. La estructura general no muestra una deriva poblacional obvia ni un deadlock básico bajo modelos simplificados.

Antes de código conviene cerrar A–D y luego convertir esta auditoría en tests ejecutables.

## Resolución de hallazgos A–D — 2026-09-28

### A. Disolver/re-formar durante descenso — CERRADO
El período de descenso queda vinculado a la combinación exacta de dos personas. Sobrevive a la disolución aunque ambos formen y disuelvan otras parejas antes de volver a juntarse.

### B. Descenso y categoría individual — CERRADO
Un descenso real empeora la categoría individual únicamente de quien estaba individualmente por encima de la nueva categoría. Ejemplo: 2ª + 5ª descienden a 3ª => 3ª + 5ª.

### C. Resultado cargado vs. cambios posteriores — CERRADO
Una primera versión de resultado protege el partido de cancelaciones posteriores por ranking. Al aplicar el resultado nunca se baja al ganador: si ya está arriba del perdedor no hay swap adicional; si está abajo, intercambian.

### D. Cancelación automática y racha de incumplimientos — CERRADO
Una cancelación automática del sistema no reinicia la racha. La limpia un cierre real sin incumplimiento propio.

### Cambio estructural que invalida una parte de esta auditoría
Nuevas y ascendidas ya no ingresan a mitad de tabla: ahora ingresan **anteúltimas**. Por lo tanto:
- los tests y simulaciones de posición deben rehacerse con esta entrada;
- el Monte Carlo poblacional anterior se conserva solo como señal preliminar de la lógica 3/2/1, no como validación completa de Wheel v3;
- antes de implementar hay que volver a simular el ciclo ascenso -> entrada anteúltima -> posible caída a último -> descenso.

### Bordes nuevos detectados
1. Inserción anteúltima con N=1.
2. Descenso pendiente si la misma dupla reaparece en otra categoría.
3. Evasión de 3 incumplimientos mediante cambio de compañero.
4. Partido jugado válidamente pero no cargado antes de una cancelación por ranking.

## Resolución de bordes nuevos — 2026-09-28

1. **Anteúltima con N=1 — CERRADO:** si solo existe una activa, la nueva/ascendida entra #2. Con N=0 entra #1.
2. **Descenso pendiente tras parejas intermedias — CERRADO:** el pendiente queda atado a la dupla exacta y a la categoría donde nació. Si vuelven a juntarse antes de resolverlo, regresan allí. Una vez resuelto, futuras formaciones siguen categorías individuales vigentes.
3. **Incumplimientos y cambio de compañero — CERRADO:** la racha pertenece a la dupla exacta; no castiga al compañero nuevo, pero reaparece si la dupla original se re-forma. Debe avisarse al re-formarse.
4. **Partido jugado pero no cargado antes de cancelación — CERRADO:** si se jugó mientras el assignment era válido, puede cargarse después. Si el ganador ya está arriba por movimientos intermedios, no se aplica swap y se informa el motivo.

Con esto, los bordes funcionales detectados por esta auditoría quedan cerrados. El siguiente paso es rehacer las simulaciones con entrada anteúltima y después convertir invariantes en tests.


## Simulación longitudinal rehecha con ingreso anteúltimo — 2026-09-28

Se agregó un modelo ejecutable independiente del runtime productivo:

- `scripts/simulate-wheel-v3.js`
- comando: `npm run simulate:wheel-v3`
- regresiones: `tests/wheel-v3-simulation.test.js`

El simulador incorpora:
- escalera real por categoría;
- roles ataque/defensa;
- prioridad por espera;
- ventanas 3/6/9...;
- límite blando de roles repetidos;
- ascenso con ingreso anteúltimo;
- descenso con ingreso #2;
- período de descenso;
- umbral poblacional direccional 3/2/1;
- skill gaps entre categorías.

### Escenario equilibrado

Configuración:
- 12 parejas por categoría;
- 20 años;
- 120 corridas por skill gap;
- skill gaps 0 / 0,7 / 1,0.

| Skill gap | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª | P | R | Vacías | RMSE | 1ª−7ª |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0,0 | 12,31 | 12,27 | 12,28 | 12,02 | 11,51 | 12,01 | 11,61 | 139,1 | 135,7 | 0,0% | 2,29 | +0,70 |
| 0,7 | 12,01 | 11,91 | 12,37 | 11,64 | 12,28 | 11,82 | 11,97 | 134,2 | 133,8 | 0,0% | 2,36 | +0,03 |
| 1,0 | 11,75 | 12,37 | 12,43 | 12,07 | 11,79 | 11,88 | 11,71 | 140,2 | 138,4 | 0,0% | 2,29 | +0,04 |

### Lectura

Con ingreso anteúltimo **no reaparece la deriva estructural** que motivó las simulaciones históricas. En los tres escenarios:
- el total se conserva;
- ninguna corrida terminó con categoría vacía;
- ascensos y descensos quedan cercanos;
- Primera−7ª queda prácticamente neutral en los skill gaps 0,7 y 1,0;
- no hubo ciclos completos sin partidos en el modelo.

### Stress test desde poblaciones muy desparejas

Se probaron 80 corridas a 20 años con skill gap 0,7.

| Inicio 1ª→7ª | Final medio 1ª→7ª | RMSE inicial | RMSE final | 1ª−7ª final |
|---|---|---:|---:|---:|
| [20,16,14,12,10,7,5] | [15,03;14,90;14,04;11,75;10,30;9,34;8,65] | 4,81 | 2,99 | +6,38 |
| [5,7,10,12,14,16,20] | [9,39;10,04;10,16;12,03;13,21;14,54;14,64] | 4,81 | 2,82 | −5,25 |
| [24,10,10,10,10,10,10] | [14,28;13,72;13,10;11,82;10,79;10,31;9,97] | 4,90 | 2,66 | +4,30 |

La corrección poblacional es **estable pero deliberadamente lenta**: mejora fuertemente el desequilibrio sin mover parejas administrativamente ni forzar saltos de categoría. En pruebas de 50 años, los dos gradientes extremos siguieron acercándose al centro.

### Regresiones agregadas antes del motor

`tests/wheel-v3-simulation.test.js` protege:
1. ingreso anteúltimo y excepción N=1;
2. un resultado tardío nunca baja al ganador;
3. umbral poblacional direccional;
4. estabilidad longitudinal desde población equilibrada;
5. convergencia significativa desde poblaciones muy desparejas.

Estas pruebas son de **modelo**, no reemplazan los tests PostgreSQL que harán falta al implementar el motor real.

## Veredicto de esta etapa

El cambio de ingreso a **anteúltimo** no muestra, en el modelo longitudinal, una deriva poblacional peligrosa ni un bloqueo estructural.

No se recomienda tocar todavía `wheel-v2` directamente. El siguiente bloque debe ser:
1. convertir el resto de invariantes funcionales en tests puros;
2. diseñar la migración de estado/DB;
3. recién después implementar Wheel v3.


## Modelo ejecutable de reglas agregado — 2026-09-28

Además de la simulación longitudinal se agregó un modelo puro de reglas, separado del runtime:

- `scripts/wheel-v3-rule-model.js`
- regresiones: `tests/wheel-v3-rules.test.js`

Cubre actualmente:
- identidad estable de la dupla exacta para estados anti-abuso;
- categoría individual después de un descenso;
- prioridad de categoría pendiente al re-formar una dupla en descenso;
- qué cierres reinician o no la racha de incumplimientos;
- primer partido habilitante al finalizar formación;
- cálculo de posición de retorno por inactividad;
- récord de Primera por reinado y empate compartido.

Estos tests, junto con `tests/wheel-v3-simulation.test.js`, constituyen el primer contrato ejecutable de Wheel v3 sin modificar todavía `src/core.js`, `src/wheel.js`, `src/competitionEngine.js` ni la base productiva.
