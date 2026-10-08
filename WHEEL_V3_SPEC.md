# LA RED Tenis — Diseño Wheel v3
Fecha: 2026-09-28

## Estado
Este documento captura las decisiones funcionales acordadas antes de tocar el motor competitivo.

- Estado: **implementado y activo en producción desde 2026-09-29**.
- Producción usa `wheel-v3`; el runtime v2 se conserva temporalmente como compatibilidad legacy.
- Para cualquier conflicto sobre asignación automática, ataque/defensa, fase de formación, equilibrio poblacional, inactividad, ascenso/descenso, incumplimientos o historial visible, **este archivo prevalece sobre las reglas anteriores**.
- El reglamento funcional base está cerrado y tiene cobertura de simulaciones y pruebas PostgreSQL. Cambiarlo solo ante un bug comprobado y con regresión.
- No modificar el motor por intuición fuera de estas reglas.

## 1. Objetivo del motor
La rueda debe favorecer tres cosas, en este orden conceptual:

1. que las parejas activas jueguen y no queden estancadas;
2. que una pareja pueda progresar hacia arriba ganando partidos;
3. que quien ocupa una posición también deba defenderla.

No se busca un emparejamiento aleatorio de toda la categoría.

## 2. Ranking estructural
- El ranking sigue siendo una escalera.
- Si una pareja ubicada más abajo vence en un partido real a una pareja ubicada más arriba, intercambian las **posiciones actuales al momento de aplicar el resultado**.
- Si gana la pareja que ya estaba arriba, no hay intercambio.
- Mientras todavía **no exista ninguna versión de resultado cargada**, si se invierte la relación competitiva y el atacante deja de estar debajo del defensor, el assignment se cancela automáticamente.
- Mientras todavía no exista ninguna versión de resultado cargada, si una de las parejas cambia de categoría, el assignment se cancela automáticamente.
- Si la relación cambia pero el atacante sigue debajo del defensor, el assignment continúa.
- Desde que existe una primera versión de resultado cargada, los movimientos posteriores del ranking ya no cancelan ese partido: el resultado sigue su flujo de confirmación/disputa.
- Al aplicar un resultado ya cargado, **el ganador nunca puede bajar por culpa de movimientos ocurridos después del partido**:
  - si el ganador está actualmente debajo del perdedor, intercambian posiciones;
  - si el ganador ya está actualmente arriba del perdedor, no se lo vuelve a bajar y no hay intercambio adicional.
- Si el partido **ya se había jugado mientras el assignment era válido**, puede cargarse aunque el sistema haya cancelado el assignment antes de que se ingresara el resultado. La fecha/hora real jugada debe ser anterior a la cancelación; el resultado sigue el flujo normal de confirmación/disputa.
- Si al aplicar ese resultado el ganador ya quedó por encima del perdedor por cambios intermedios del ranking, **no se aplica ningún intercambio adicional**: el ganador nunca baja.
- En ese caso se informa en app y WhatsApp: `No se aplican cambios de posición porque el ganador pasaría a estar abajo por un cambio previo en el ranking.`
- Si el partido no se había jugado antes de la cancelación, la cancelación sí es definitiva para efectos competitivos; pueden jugar luego solo de forma amistosa.
- La cancelación conserva el rol ataque/defensa de cada pareja y su antigüedad de espera; la reasignación debe ejecutarse de inmediato con prioridad alta.

## 3. Fase de formación
Cada circuito tiene su propia fase inicial de formación.

- Masculino y Femenino se calculan **por separado**: uno puede salir de formación aunque el otro todavía no.
- Dentro de cada circuito, la fase termina cuando **cada una de sus 7 categorías tiene al menos 5 parejas activas**.
- Mientras dura:
  - se juega normalmente dentro de cada categoría;
  - funciona la escalera interna;
  - no hay ascensos ni descensos entre categorías.
- Cuando se cumple la condición:
  - se informa por web/app y WhatsApp que finalizó la fase de formación;
  - se activan ascensos y descensos para ese circuito;
  - los #1 de 2ª a 7ª con al menos un partido real previo entran inmediatamente en zona de ascenso en 0/3;
  - los últimos de 1ª a 6ª con al menos un partido real previo entran inmediatamente en período de descenso en 0/3;
  - una pareja sin ningún partido real previo debe disputar primero un partido antes de activar su zona correspondiente;
  - ese primer partido **no suma** victoria ni derrota de zona: al cerrarlo entra recién en 0/3;
  - la fase de formación **no vuelve a activarse jamás**, aunque después una categoría caiga por debajo de 5 activas.

## 4. Equilibrio poblacional entre categorías
Hay 7 categorías por circuito. El reparto teórico uniforme se calcula **separadamente en Masculino y Femenino**:

- `100 / 7 = 14,2857 %` de las parejas activas de ese mismo circuito por categoría.

El sistema no exige cupos exactos. Busca una distribución razonablemente pareja.

### 4.1 Qué parejas cuentan
- Solo cuentan las parejas **activas**.
- Las inactivas no cuentan para el porcentaje.
- Una categoría puede contener muchas inactivas sin considerarse superpoblada deportivamente.

### 4.2 Zona normal
- Entre **10 % y 19 %** de las parejas activas totales: población normal.
- En esa zona, ascenso/descenso usa el requisito base de 3.

### 4.3 Ajuste oculto de umbrales
El motor puede reducir el requisito para mover población, pero **la población por sí sola nunca mueve una pareja**.

Regla acordada:
- zona normal 10–19 %: requisito 3;
- desvío moderado: 7–<10 % o >19–22 %: requisito 2;
- desvío fuerte: <7 % o >22 %: requisito 1.

Cuando una categoría necesita recibir o expulsar población:
- el motor queda a la espera de resultados deportivos;
- puede resolverse por ascenso del #1 de la categoría inferior o descenso del último/período de descenso de la superior, según quién alcance primero el requisito aplicable;
- todos los movimientos son únicamente entre categorías adyacentes;
- si el porcentaje vuelve a zona normal, la ayuda poblacional se apaga;
- si sigue fuera de zona, el motor continúa esperando nuevos resultados.

Antes de acelerar un movimiento entre categorías vecinas, el motor debe comprobar que ese movimiento **mejora o, como mínimo, no empeora el equilibrio conjunto** de las dos categorías respecto del objetivo teórico de 14,2857 %. Un empate exacto del desvío conjunto es admisible porque reduce presión de la categoría que necesita expulsar/recibir población sin empeorar el par. Si el movimiento aumenta el desvío conjunto, no se reduce el requisito y se conserva el umbral normal.

El requisito 1/2/3 se **recalcula al confirmar cada nuevo resultado** usando la población activa existente en ese momento; no queda congelado cuando comenzó una racha.

Los umbrales exactos son lógica interna; no deben exponerse públicamente como una fórmula explotable por jugadores.

## 5. Estados de rueda: ataque y defensa
La rueda se basa en dos roles.

### Ataque
- Una pareja en ataque busca **solo hacia arriba**.
- Nunca cumple un ataque jugando contra una pareja ubicada debajo.
- El atacante es el impulsor del emparejamiento.

### Defensa
- Una pareja en defensa **no busca**.
- Queda disponible para recibir un ataque de una pareja ubicada debajo.

### Balance global
- El motor intenta mantener una cantidad razonablemente pareja de atacantes y defensores entre parejas:
  - activas;
  - libres;
  - sin assignment pendiente.
- Las parejas inactivas y las que ya tienen partido abierto no participan del balance.
- No se exige 50/50 exacto.
- Después de un partido real, normalmente:
  - atacante -> defensa;
  - defensor -> ataque.
- Para evitar bloqueos, el motor puede repetir un rol cuando haga falta:
  - defensa -> defensa;
  - ataque -> ataque.
- Como regla de equilibrio, se intenta no superar **2 ataques consecutivos ni 2 defensas consecutivas** para una misma pareja.
- Ese límite es blando: puede superarse si es necesario para que la rueda no se trabe.
- La prioridad sigue siendo que las parejas jueguen y no queden estancadas.

### Extremos
- Si una categoría tiene una sola pareja activa, esa pareja simplemente espera; no se fuerza un rol efectivo ni un assignment hasta que exista otra activa.
- El #1 activo siempre queda en defensa: no tiene rival arriba para atacar.
- El último activo siempre queda en ataque: no tiene rival debajo para defender.
- Si una defensa obligatoria resulta estructuralmente imposible por estar último, se libera esa defensa y pasa a ataque.
- Excepción más fuerte: después de la fase de formación, **último activo + incumplimiento propio = descenso directo**.

## 6. Prioridad de espera
La prioridad principal de la rueda es el tiempo sin jugar.

- Primero se intenta resolver a la pareja activa/libre que lleva más tiempo sin un partido real.
- Para una pareja nueva, la antigüedad empieza al ingresar a la rueda.
- Para una pareja reactivada, empieza al reactivarse.
- Una cancelación por cambio de ranking/categoría no debe borrar la antigüedad de espera.
- La reasignación tras cancelación es inmediata, pero la **antigüedad absoluta sigue mandando**: una pareja cancelada no pasa por delante de otra que ya llevaba todavía más tiempo sin jugar.
- Una victoria administrativa 6-0 6-0 no reinicia el reloj de “hace cuánto no juega”; solo un partido real lo reinicia.

## 7. Selección de rival para un atacante
El atacante mira hacia arriba.

### Ventanas dinámicas
1. primero revisa hasta 3 puestos hacia arriba;
2. dentro de esa ventana, entre defensores elegibles, prioriza al que también lleva más tiempo sin jugar;
3. si no existe defensor elegible, amplía inmediatamente otros 3 puestos;
4. repite la expansión sin esperar días hasta encontrar rival o agotar la categoría.

Ejemplo:
- #8 ataca;
- #7 defensor jugó ayer;
- #6 defensor hace 12 días;
- #5 defensor hace 20 días;
- el rival preferido es #5 porque los tres están dentro de la primera ventana y prima la antigüedad sin jugar.

Si #8 y #9 quieren al mismo defensor:
- prima el atacante que lleva más tiempo sin jugar, aunque el otro esté más cerca;
- el atacante que pierde ese rival continúa buscando inmediatamente más arriba.

### Repetición de rival
- Se evita jugar dos partidos consecutivos contra la misma pareja si existe otra alternativa razonable.
- Si no existe otra opción, se repite inmediatamente.
- La protección contra repetición no puede bloquear la rueda.

### Única espera aceptada
Si un atacante no encuentra **ningún defensor superior** disponible, espera hasta que aparezca uno. No se lo manda hacia abajo.

## 8. Assignment automático
- No existe etapa de aceptación del assignment.
- El sistema asigna automáticamente el partido.
- WhatsApp/app informa la asignación.
- Máximo un assignment abierto por pareja.
- Desde la asignación corren **30 días corridos para jugar y cargar el resultado**.
- No existe extensión extraordinaria de 15 días en Wheel v3: 30 días y listo.
- Las dos parejas quedan ocupadas durante el assignment.
- Si una versión de resultado fue cargada dentro de los 30 días, desde **ese mismo momento de carga** comienza una ventana de **7 días** para que la otra pareja confirme o discuta ese resultado.
- Ejemplo: si se carga el día 8, la revisión vence 7 días después de esa carga; no espera al día 30.
- Si la otra pareja no responde dentro de esos 7 días, la versión se auto-valida.
- Esa ventana no permite jugar un partido que no fue jugado dentro de los 30 días.
- Resolver/cerrar libera inmediatamente a las parejas y dispara una nueva evaluación de la rueda.

## 9. Programación y cambios de fecha
- Dentro de los 30 días se pueden cambiar fecha/hora/lugar las veces que las parejas acuerden.
- Cambiar fecha no reinicia el plazo general de 30 días.
- Una programación oficial sirve como referencia para no-show.
- Un assignment cancelado por inversión de posiciones o cambio de categoría deja de ser competitivo aun si ya tenía cancha y horario.

Mensaje conceptual ante cancelación:
- LA RED explica que el ranking cambió y el cruce dejó de ser competitivo;
- pueden jugarlo amistosamente si desean;
- no podrán cargar ese resultado;
- se asignará un nuevo rival.

## 10. "No pude jugar"
Una pareja puede reconocer antes del vencimiento que no pudo cumplir.

- Cualquiera de los dos integrantes puede marcar `No pude jugar` en nombre de toda la pareja; no requiere confirmación del compañero.
- La UI/auditoría debe mostrar quién realizó la acción, por ejemplo: `No pude jugar (informado por Nombre Apellido)`.
- Si una sola pareja marca `No pude jugar`:
  - el assignment se cierra inmediatamente;
  - esa pareja recibe derrota administrativa 6-0 6-0;
  - la otra recibe victoria administrativa;
  - si corresponde por posición actual, puede existir intercambio;
  - la victoria administrativa **no cuenta** como victoria real para ascenso ni para salir de período de descenso;
  - la derrota administrativa sí cuenta como incumplimiento/derrota cuando corresponda;
  - no requiere confirmación del rival.
- El incumplidor pasa a defensa.
- Si ya estaba en defensa, queda en defensa obligatoria hasta cumplir una defensa real, salvo imposibilidad estructural.
- La pareja que sí estaba disponible conserva su rol anterior porque no pudo disputar un partido real.

Si ambas parejas reconocen que no pudieron jugar:
- ambas reciben penalización de posición;
- ambas se consideran incumplidoras;
- se aplica la deuda necesaria para que cada una pierda realmente un puesto sin que una sancionada beneficie a otra;
- si alguna es la última activa después de la fase de formación, aplica la regla especial de descenso directo.

Si vencen los 30 días sin resultado ni declaración:
- se trata como incumplimiento de ambas;
- no existe espera indefinida ni renovación automática del plazo.

### Tres incumplimientos consecutivos
- Esta regla es general para todas las categorías, no solo 7ª.
- Una pareja que acumula **3 incumplimientos atribuibles consecutivos** recibe una penalización de **30 días sin nuevas asignaciones** y pasa a estado inactivo durante esa penalización.
- Al cumplirse exactamente los 30 días, la pareja se **reactiva automáticamente**.
- La racha de incumplimientos pertenece a la **dupla exacta**, no a cada jugador individualmente.
- Disolver la pareja o formar otras parejas en el medio no borra esa racha: si los mismos dos vuelven a juntarse, recuperan el contador que tenían pendiente.
- Al re-formarse, la UI/WhatsApp debe advertir el contador pendiente; por ejemplo: `Esta pareja tuvo 2 incumplimientos consecutivos. Un incumplimiento más aplicará 30 días sin asignaciones.`
- La racha se reinicia a 0 cuando esa misma dupla tiene un cierre real sin incumplimiento propio: partido resuelto correctamente o cierre donde el incumplimiento fue atribuible únicamente al rival.
- Una cancelación automática del sistema por ranking/categoría **no reinicia** la racha.
- En 7ª esta regla resuelve especialmente el caso de la última pareja, que no puede descender ni perder más posición.

## 11. Penalización simultánea y deuda de posición
La penalización debe hacer perder **exactamente un puesto efectivo** por incumplimiento ordinario.

Ejemplo con #5 y #6 sancionadas a la vez:
- #7 -> #5;
- #5 -> #6;
- #6 -> #7;
- #8 permanece #8.

No se debe castigar a #5 y #6 con dos puestos por haber sido sancionadas juntas.

La implementación puede usar deuda de posición para materializar este principio de forma idempotente y bajo concurrencia.

## 12. No-show
- Puede reportarse después de la fecha/hora oficial acordada.
- El reporte tiene una ventana de **48 horas para ser cancelado por quien lo emitió**.
- Durante esa ventana las parejas todavía pueden arrepentirse, reprogramar dentro del plazo original o cargar el resultado si corresponde.
- Pasadas las 48 horas, un no-show unilateral no se auto-valida: pasa a Administración.
- Si existe contradicción entre las parejas, pasa a Administración.
- Si la pareja reportada reconoce expresamente que no pudo presentarse, se resuelve **inmediatamente** como incumplimiento/6-0 6-0; no se espera a que termine la ventana de arrepentimiento del denunciante.
- Mientras existe una disputa real de no-show, el assignment permanece bloqueado hasta resolución.

### Lesión / abandono como partido real
- Si el partido comenzó y luego existe lesión/abandono, se considera **partido real**.
- La victoria cuenta como victoria real para ascenso y para salir de período de descenso.
- La derrota cuenta como derrota real para descenso.
- Si el #1 de Primera conserva la punta mediante ese partido, cuenta como defensa exitosa.
- No se inventan games parciales ni se agrega una sanción administrativa extra por el abandono deportivo.

## 13. Ascenso
Después de la fase de formación:

- al alcanzar el #1 activo de una categoría se entra en zona/período de ascenso;
- el contador comienza en 0 al llegar a #1;
- requisito base: 3 victorias reales;
- el requisito puede bajar a 2 o 1 por equilibrio poblacional;
- una victoria administrativa/no-show no cuenta como victoria real de ascenso;
- en Primera no hay ascenso de categoría;
- en Primera no existe una métrica numérica paralela al ranking;
- el único récord especial es la cantidad histórica de defensas exitosas del puesto #1 de Primera;
- si el #1 deja de ocupar el #1 antes de completar el ascenso, su racha de ascenso se reinicia; cuando recupere la punta empieza de 0;
- si el #1 pasa a inactividad:
  - pierde inmediatamente el liderazgo;
  - su mejor retorno posible pasa a #2;
  - pierde la racha actual de ascenso;
  - el récord histórico de Primera no se borra.
- Una pareja que **asciende** entra **anteúltima** de la tabla activa de la nueva categoría y desplaza hacia abajo desde ese punto.
- No entra automáticamente en período de descenso solo por ese ingreso.
- Para entrar en período de descenso debe llegar efectivamente al último puesto por un movimiento deportivo posterior; por ejemplo, si el último le gana y le intercambia la posición.
- Si no hay activas, la ingresante ocupa #1 por imposibilidad material.
- Si hay exactamente 1 activa, la nueva/ascendida entra #2: no desplaza al único #1 sin haber jugado.

## 14. Período de descenso
Después de la fase de formación:

### Entrada
- **Tocar el último puesto activo activa inmediatamente el período de descenso**, incluso con 0 derrotas.
- El estado de descenso viaja con la pareja:
  - no desaparece porque luego suba posiciones;
  - no desaparece por inactividad;
  - no desaparece porque aparezca otra pareja debajo.

### Salida
- Para salir del período de descenso hace falta **una victoria real**.
- Una victoria administrativa 6-0 6-0 puede mover ranking, pero no salva del período.
- Requisito base para descender: acumular 3 derrotas antes de conseguir una victoria real.
- El requisito puede reducirse a 2 o 1 por equilibrio poblacional.
- Una reducción poblacional nunca causa descenso instantáneo sin un nuevo resultado.
- Si la pareja es última activa e incumple: descenso directo, aunque estuviera 0/3, **salvo en 7ª**.
- En 7ª no existe período de descenso: la categoría no tiene nivel inferior y la pareja continúa en la rueda normal ataque/defensa.

### Ruta de descenso
Mientras una pareja sigue en período de descenso:
- conserva la arquitectura ataque/defensa siempre que sea posible;
- cuando le toca atacar, la selección de rivales se hace siguiendo una **ruta desde la parte baja de la categoría hacia arriba**;
- los intentos buscan ser de menor a mayor dificultad;
- si perdió contra un rival, el siguiente intento intenta un escalón más difícil usando las posiciones actuales;
- si solo existe una opción, puede repetir rival;
- si movimientos administrativos la llevaron muy arriba, su posición visual no elimina la ruta de descenso;
- cada nueva selección recalcula posiciones actuales;
- una victoria real la saca inmediatamente del período y desde el siguiente ciclo vuelve a la rueda normal desde su posición actual.

## 15. Descenso de categoría
- Una pareja que desciende entra base #2 en la categoría inferior.
- Si no existe una pareja activa que pueda ocupar #1, entra #1 por imposibilidad material.
- Si dos descensos ocurren muy próximos, se procesan secuencialmente; el segundo descenso entra #2 y desplaza al descenso anterior a #3.
- Al descender:
  - se termina el período de descenso anterior;
  - los contadores de ascenso/descenso de la nueva categoría parten de cero;
  - el próximo rol es ataque.

### Parejas nuevas y categoría individual
- Una pareja completamente nueva también ingresa **anteúltima** de su categoría y desplaza hacia abajo desde ese punto.
- Igual que una ascendida, no entra automáticamente en período de descenso por ser nueva; solo entra si posteriormente llega al último puesto por un movimiento deportivo.
- Dos jugadores sin categoría individual previa pueden elegir libremente una categoría inicial entre 1ª y 7ª.
- Si los jugadores ya tienen categorías individuales distintas, la pareja compite en la categoría del jugador de nivel más alto (número de categoría más bajo).
- Ejemplo: jugador de 2ª + jugador de 5ª => la pareja compite en 2ª.
- Al disolverse, cada jugador conserva su categoría individual real.
- Un ascenso deportivo real mejora la categoría individual de ambos integrantes al nivel alcanzado.
- Un descenso deportivo real también actualiza categorías individuales para impedir que se borre separándose:
  - cada integrante cuya categoría individual era mejor que la nueva categoría descendida empeora hasta esa nueva categoría;
  - quien ya tenía una categoría individual inferior no empeora adicionalmente.
  - ejemplo: 2ª + 5ª descienden a 3ª => las categorías individuales quedan 3ª y 5ª.
- Una misma dupla que se disuelve y luego vuelve a formarse se trata **competitivamente como una pareja nueva** para estadísticas/ingreso, aunque pueda reutilizarse una identidad técnica interna.
- **Excepción anti-abuso:** si esa combinación exacta de dos personas tenía un período de descenso abierto al disolverse, ese estado y sus derrotas pendientes sobreviven a la disolución.
- El sistema recuerda también la **categoría en la que estaba abierto ese período de descenso**.
- Si esas dos personas vuelven a formar pareja antes de resolver ese período, regresan excepcionalmente a esa misma categoría y retoman el mismo estado de descenso, aunque en el medio hayan formado otras parejas o sus categorías individuales hayan cambiado.
- Esta excepción existe solo hasta resolver aquel período mediante victoria real o descenso efectivo.
- Una vez resuelto el período, futuras formaciones vuelven a usar la regla normal de categoría individual más alta. Si después ambos mejoraron legítimamente sus categorías individuales, la nueva pareja entra donde corresponda por esas categorías.

## 16. Inactividad
La inactividad es voluntaria y sale de la rueda; también puede ser aplicada automáticamente como sanción de 30 días por 3 incumplimientos consecutivos.

### Solicitud
- **Alcanza con que uno de los dos integrantes la solicite** en nombre de la pareja.
- Si existe un assignment abierto, primero debe resolverse la situación de ese compromiso.
- No se obliga físicamente a jugar: si decide no disputar el partido pendiente, se aplica primero la consecuencia deportiva y recién después pasa a inactiva.
- Si la pareja que incumple estaba **por encima** de su rival, intercambian posiciones: el rival sube y la incumplidora baja.
- Si la pareja que incumple estaba **por debajo**, no se intercambian posiciones; incumplir nunca puede hacerla subir.
- Técnicamente `paused` puede seguir representando la inactividad temporal y `inactive` quedar reservado para disolución/archivo; en superficie se muestra “Pareja inactiva”.
- Una pareja inactiva:
  - no recibe assignments;
  - no participa del balance ataque/defensa;
  - no cuenta para el porcentaje poblacional;
  - no acumula nuevas derrotas ni incumplimientos simplemente por estar inactiva;
  - nunca desciende de categoría por el mero paso del tiempo.

### Bloque visual
Cada categoría muestra:
1. bloque de parejas activas con ranking competitivo;
2. debajo, bloque separado `Parejas inactivas`.

### Posición de retorno
- Durante los primeros **3 meses completos** de inactividad conserva su posición de retorno.
- Desde el 4º mes completo, pierde **1 posición de retorno por cada mes completo adicional**.
- Ejemplo: se inactiva siendo #5 y vuelve a los 6 meses completos => vuelve #8.
- La pérdida por tiempo se detiene en el fondo de la **misma categoría**; la inactividad nunca provoca descenso de categoría.
- Si se inactivó siendo #1 de cualquier categoría, pierde inmediatamente el derecho a volver #1:
  - si vuelve dentro de los primeros 3 meses, vuelve como máximo #2;
  - desde el 4º mes, ese #2 base también pierde una posición por cada mes completo adicional.
- Al reactivar, se inserta en su posición de retorno y desplaza hacia abajo a las parejas activas desde ese punto.
- Si dos parejas inactivas tienen calculada la misma posición de retorno:
  - la que se reactiva primero ocupa ese puesto;
  - cuando la otra se reactiva después, también se inserta en ese puesto y desplaza hacia abajo a la que había vuelto antes.
- La antigüedad de espera para la rueda comienza de nuevo al reactivarse.

### Inactividad y descenso
- Si la pareja ya estaba en período de descenso al inactivarse, ese estado y su contador quedan **congelados**.
- Mientras está inactiva no suma nuevas derrotas.
- Al reactivarse retoma el período de descenso desde el mismo estado.
- En 7ª no existe período de descenso.

### Sanción de 30 días por incumplimientos
- Tras 3 incumplimientos atribuibles consecutivos, la pareja pasa a inactiva y queda 30 días sin nuevas asignaciones.
- Esta inactividad sancionatoria sigue sin producir descenso por el simple paso del tiempo.
- Al día 30 se reactiva automáticamente.
- La racha se reinicia a 0 únicamente con un cierre real sin incumplimiento propio; una cancelación automática del sistema no la limpia.

## 17. Historial visible mínimo
No existe una ficha pública de historial estadístico acumulado de pareja.

No mostrar:
- partidos totales;
- victorias totales;
- derrotas totales;
- porcentaje de victorias;
- historial completo de rivales.

Sí mostrar:
- únicamente los **últimos 5 movimientos reales de ranking/categoría**;
- fecha `dd/mm/aaaa`;
- explicación genérica;
- origen -> destino cuando corresponda.

Ejemplos:
- `27/09/2026 · Victoria contra rival superior · #8 -> #5`
- `18/09/2026 · Penalización por incumplimiento · #5 -> #6`
- `04/09/2026 · Ascenso de categoría · 5ª -> 4ª`
- `22/08/2026 · Retorno de inactividad · #4 -> #7`

No registrar en esta lista partidos que no movieron ranking.

## 18. Auditoría interna
Aunque el jugador vea solo 5 movimientos, el sistema conserva internamente lo mínimo necesario para:
- seleccionar rivales;
- evitar repetición inmediata;
- medir tiempo desde último partido real;
- conservar roles;
- conservar período/contador de descenso;
- conservar contador de ascenso;
- calcular posición de retorno por inactividad;
- materializar deuda de posición;
- explicar cancelaciones/movimientos;
- resolver reclamos.

Administración debe conservar una auditoría técnica más completa de decisiones sensibles del motor.

## 19. Récord histórico de Primera
- El único récord deportivo histórico especial es la cantidad de **defensas exitosas del puesto #1 de Primera**, separado por circuito.
- El contador visible/corriente pertenece a un **reinado concreto en el #1**, no es acumulativo entre reinados.
- Cada vez que una pareja ocupa el #1 de Primera, juega una defensa y conserva el #1, suma 1 defensa en ese reinado.
- Cuando pierde el #1, ese contador corriente deja de existir para su nueva posición.
- Solo queda persistido como récord histórico si ese reinado alcanzó o igualó el máximo histórico.
- Si supera el máximo, pasa a ser el nuevo récord.
- Si iguala el máximo, el récord se muestra como **compartido**.
- Si queda por debajo del máximo, ese número no se conserva como estadística histórica de la pareja.
- Si la misma dupla vuelve a ser #1 meses después, su nuevo reinado empieza nuevamente en 0; **no suma** las defensas de su reinado anterior.
- Si la dupla se disuelve y luego vuelve a formarse, también empieza cualquier nuevo reinado desde 0. Un récord histórico ya logrado por esos dos jugadores no se borra del cuadro histórico.
- La antigua sección de máximo valor numérico se reutiliza para este récord y no conserva su significado anterior.
- No existe ninguna métrica numérica paralela al ranking.
- No crear un sistema general de estadísticas históricas de pareja.

## 20. Principios de UX y notificaciones
- La complejidad puede existir en el motor, pero no debe trasladarse al jugador.
- Todo cambio operativo relevante debe generar aviso por WhatsApp a los integrantes afectados, además de quedar reflejado en la app cuando corresponda.
- Como mínimo se notifican: nuevo assignment, carga de resultado y sus 7 días de revisión, confirmación/auto-validación/disputa, cancelación y reasignación, movimiento de posición, ascenso/descenso, entrada/salida de inactividad, sanción de 30 días y finalización de fase de formación.
- Siempre que el sistema pueda determinar automáticamente el próximo partido, debe asignarlo sin pedir búsqueda de rival, desafío manual ni aceptación previa.
- La interfaz debe comunicar principalmente **qué le toca hacer ahora** a cada pareja.
- El sistema debe explicar siempre la próxima acción.
- No mostrar fórmulas internas explotables de equilibrio poblacional.
- Sí explicar de forma simple cuando:
  - un partido fue asignado;
  - un partido fue cancelado por cambio de ranking/categoría;
  - una pareja entró en período de descenso;
  - una pareja salió del período por victoria real;
  - una pareja entra/sale de inactividad;
  - se aplicó una penalización;
  - terminó la fase de formación.


## 20 bis. Tiempo autoritativo
- Ningún plazo competitivo puede depender del reloj del navegador, de Windows, del teléfono ni de la zona horaria configurada por el jugador.
- La **fuente autoritativa de tiempo es el servidor/base de datos**, almacenando y comparando timestamps en UTC.
- Para vencimientos y decisiones reales (30 días de assignment, 7 días de revisión, 48 horas de no-show, 30 días de sanción, meses de inactividad, etc.) el backend debe decidir usando hora de servidor/DB, preferentemente PostgreSQL `CURRENT_TIMESTAMP/NOW()` dentro de la misma transacción.
- El frontend solo muestra fechas, relojes o cuentas regresivas. Aunque el usuario cambie manualmente la hora de su equipo, eso no puede adelantar, atrasar ni evitar un vencimiento.
- La API debe devolver deadlines absolutos y una referencia de hora de servidor (`server_now` o equivalente) para que la UI pueda mostrar el tiempo restante sin confiar en el reloj local.
- Para cuentas regresivas visibles, el frontend puede calcular el desfase respecto del servidor y avanzar con un reloj monotónico local; al refrescar o ejecutar una acción vuelve a sincronizar contra el backend.
- Las fechas visibles pueden mostrarse en la zona horaria de Argentina, pero la persistencia y la lógica se mantienen en UTC.
- No se necesita consultar un servicio externo de “hora de internet” para cada operación: Render/Neon mantienen sus servidores sincronizados; la autoridad de LA RED debe ser su propio backend/DB.

## 21. Cierre de bordes de auditoría
No quedan preguntas funcionales abiertas de esta tanda.

- Anteúltima con tabla mínima: N=0 => entra #1; N=1 => entra #2.
- Descenso pendiente: queda atado a la combinación exacta de dos personas **y a la categoría donde se abrió**; si vuelven a juntarse antes de resolverlo, regresan allí y lo retoman. Una vez resuelto, futuras formaciones siguen las categorías individuales vigentes.
- Incumplimientos consecutivos: pertenecen a la dupla exacta, sobreviven a disoluciones y parejas intermedias, y se muestran/avisan al re-formarse.
- Partido jugado antes de una cancelación: puede cargarse después; si el ganador ya está arriba por movimientos intermedios, no hay swap y se notifica expresamente que no se mueve para evitar bajar al ganador.
## 22. Plan de implementación después de cerrar preguntas
1. Convertir este diseño en reglas definitivas dentro de `PROJECT_RULES.md` y `DECISIONS.md`.
2. Diseñar estado/migración DB mínima.
3. Escribir tests puros/simulaciones antes de tocar el motor.
4. Implementar selección de roles y rival.
5. Implementar cancelación/reasignación concurrente.
6. Implementar formación + equilibrio poblacional.
7. Implementar período de descenso/inactividad.
8. Implementar incumplimientos/no-show.
9. Implementar los 5 movimientos visibles + auditoría.
10. Integración PostgreSQL/concurrencia.
11. Frontend/UX/WhatsApp.
12. Simulación larga para buscar estancamientos, oscilaciones poblacionales y abuso de reglas.
13. Recién después desplegar.
