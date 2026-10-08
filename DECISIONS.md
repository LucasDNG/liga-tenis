# LA RED Tenis — Decisiones vigentes

Este archivo contiene **solo decisiones que siguen vigentes**. Las decisiones reemplazadas se documentan en `PROJECT_JOURNEY.md`.

> **Wheel v3 — 2026-09-28:** el diseño funcional nuevo está consolidado en `WHEEL_V3_SPEC.md`. El reglamento base está cerrado. Wheel v3 está implementado y activo en producción desde 2026-09-29; no modificar reglas salvo bug comprobado.

## Ranking y competencia

1. La posición estructural dentro de la categoría es el único ranking competitivo.
2. No existe una puntuación numérica paralela al puesto.
3. Si una pareja ubicada abajo vence a una ubicada arriba en un partido real, intercambian posiciones; el resto no se reordena globalmente.
4. La rueda ordinaria es automática; no existe un flujo normal de buscar rival, desafiar y esperar aceptación.
5. Cada pareja puede tener como máximo un compromiso abierto.
6. El assignment da 30 días corridos para jugar y cargar una primera versión de resultado.
7. No existe extensión extraordinaria de 15 días en Wheel v3.
8. Si el resultado fue cargado dentro del plazo, existe una ventana adicional fija de 7 días desde la primera carga para confirmar o discutir; el silencio al vencer auto-valida.
9. La selección Wheel v3 usa roles ataque/defensa, prioridad por tiempo sin partido real y ventanas crecientes hacia arriba para el atacante.
10. La repetición de rival se evita cuando existe alternativa, pero nunca debe bloquear la rueda.
11. La fase de formación se calcula por circuito y termina irreversiblemente cuando las 7 categorías de ese circuito tienen al menos 5 parejas activas.
12. Después de la formación, la población activa puede modificar el requisito deportivo 3/2/1, pero la población por sí sola nunca mueve una pareja.
13. Todos los ascensos/descensos entre categorías son adyacentes.
14. Una pareja que **asciende** entra anteúltima de la tabla activa de la categoría superior; con N=0 entra #1 y con N=1 entra #2.
15. Una pareja nueva también entra anteúltima de su categoría, con los mismos bordes N=0 => #1 y N=1 => #2.
16. Una pareja que desciende entra normalmente #2 en la categoría inferior; si no existe #1 material, entra #1.
17. En 7ª no existe zona/período de descenso.

## Récord histórico de Primera

18. El único récord deportivo histórico especial es la cantidad de defensas exitosas del puesto #1 de Primera.
19. Masculino y Femenino tienen récords separados.
20. Una defensa exitosa exige que la pareja ya sea #1 de Primera, dispute una defensa y conserve el #1.
21. Si varias parejas empatan el máximo histórico, el récord se muestra como compartido.
22. La sección pública histórica se dedica únicamente a este récord.
23. No se muestra un historial estadístico acumulado de partidos/victorias/derrotas por pareja.
24. El jugador puede ver hasta los últimos 5 movimientos reales de ranking/categoría, con fecha y explicación simple.

## Inactividad

25. Alcanza con que un integrante solicite la inactividad en nombre de la pareja.
26. Si ya existe un partido asignado, primero debe resolverse la situación del compromiso.
27. Si la pareja decide no jugar ese compromiso, se aplica la consecuencia deportiva antes de quedar inactiva.
28. Si la incumplidora estaba por encima del rival, intercambian posiciones; si estaba por debajo, no hay intercambio. Incumplir nunca puede hacer subir a la incumplidora.
29. Una inactiva no recibe assignments ni participa del balance ataque/defensa ni del cálculo de población activa.
30. Durante los primeros 3 meses completos conserva su posición de retorno.
31. Desde el 4º mes completo pierde 1 posición de retorno por cada mes completo adicional, sin bajar de categoría por inactividad.
32. Si se inactivó siendo #1 de cualquier categoría, dentro de los primeros 3 meses vuelve como máximo #2; luego ese #2 base pierde una posición por cada mes completo adicional.
33. Al reactivar se inserta en la posición calculada y desplaza hacia abajo desde ese punto.
34. Si dos inactivas tienen el mismo puesto de retorno, la que reactiva más tarde se inserta igualmente allí y desplaza a la que había vuelto antes.
35. Si ya estaba en período de descenso, el estado y contador se congelan durante la inactividad y se retoman al volver.
36. La inactividad por sí sola nunca produce descenso de categoría.
37. Tras 3 incumplimientos atribuibles consecutivos, la pareja pasa automáticamente a inactiva y queda 30 días sin nuevas asignaciones.
38. La sanción de 30 días se reactiva automáticamente al vencer por reloj autoritativo; la racha se reinicia solo con cierre real sin incumplimiento propio o cuando el único incumplimiento fue del rival.

## No-show, incumplimientos y resultados

39. Cualquiera de los dos integrantes puede marcar `No pude jugar` en nombre de toda la pareja.
40. La UI y auditoría deben mostrar quién realizó esa acción.
41. Una victoria administrativa no cuenta como victoria real para ascenso ni para salir de período de descenso.
42. Solo un partido real reinicia la antigüedad de “hace cuánto no juega”.
43. Un no-show reconocido expresamente por la pareja reportada se resuelve inmediatamente; no espera las 48 horas.
44. Un no-show unilateral no reconocido o contradicho pasa a Administración después de la ventana de reconsideración.
45. Una disputa real de resultado requiere intervención administrativa.
46. Lesión/abandono después de iniciado el partido se considera partido real: la victoria cuenta para ascenso/salir de descenso, la derrota cuenta para descenso y puede sumar defensa exitosa del #1 de Primera.

## Parejas y categorías individuales

47. Formar pareja requiere invitación + aceptación; Admin no aprueba parejas.
48. Un usuario no puede pertenecer a dos parejas competitivas vigentes.
49. Si los integrantes tienen categorías individuales distintas, la pareja compite en la del jugador de mayor nivel (número más bajo).
50. Ejemplo: 2ª + 5ª => la pareja juega en 2ª.
51. Dos jugadores sin categoría previa pueden elegir libremente 1ª–7ª.
52. Formar pareja con alguien más fuerte no cambia por sí solo la categoría individual del jugador de nivel inferior.
53. Un ascenso deportivo real de la pareja mejora la categoría individual de ambos al nivel alcanzado.
54. Al disolverse, cada jugador conserva/recupera su categoría individual propia, incluyendo mejoras obtenidas por ascensos reales.
55. Si la misma dupla se disuelve y luego vuelve a formarse, se trata competitivamente como pareja nueva.
56. Disolución nunca borra obligaciones abiertas.

## Identidad, seguridad y administración

45. DNI es único y privado; login jugador usa DNI + contraseña.
46. Registro exige DNI + frente + dorso para verificación inicial.
47. Las imágenes del DNI son temporales y se eliminan de la base activa al cerrar la revisión.
48. Una foto defectuosa se resuelve con `PEDIR NUEVAS FOTOS`, sin crear otra cuenta.
49. Login Admin está separado: frontend `/admin-la-red`, backend `/api/auth/admin-login`.
50. Una cuenta Admin no puede autenticarse por el endpoint normal de jugadores.
51. Conocer la ruta Admin no otorga acceso: siguen siendo obligatorios rol, contraseña y TOTP cuando corresponda.
52. El primer propietario se promueve explícitamente; no existe alta pública de administradores.
53. Admin es una cola de excepciones: identidad, disputas reales, disciplina, canchas, correcciones, auditoría y contingencias.
54. Admin no elige rivales ni ordena manualmente el ranking.
55. Toda acción administrativa sensible queda auditada.

## Producto, UX y negocio

56. WhatsApp es el canal operativo principal; la app conserva el estado oficial.
57. Los eventos relevantes de un compromiso se notifican a ambos integrantes de las parejas afectadas.
58. La complejidad puede existir en el motor, pero la UX debe centrarse en “qué me toca hacer ahora”.
59. Todo flujo ordinario que requiera una acción humana debe poder completarse desde la web.
60. El lugar de un partido es texto libre acordado por jugadores y no crea vínculo comercial con la sede mencionada.
61. El catálogo de canchas adheridas es una capa comercial separada del motor deportivo.
62. LA RED es continua, sin temporadas ni resets anuales.
63. La primera versión competitiva es 18+ y usa aceptaciones legales versionadas.
64. LA RED no se define como sin fines de lucro ni promete gratuidad permanente.
65. La capa comercial futura de reservas/pagos/comisiones no puede alterar resultados ni ranking.
66. La identidad visual de LA RED Tenis usa la cancha de polvo de ladrillo. El sistema competitivo es el de la rueda, no un ranking Elo.
67. Los `.md` son la memoria oficial; toda regla implementada debe quedar alineada con código, tests y documentación.

## Estado de cierre

El reglamento funcional base de Wheel v3 está cerrado. La etapa siguiente es auditoría/simulación y conversión de hallazgos en tests antes de tocar el motor.


## Cierres adicionales — 2026-09-28
68. La fase de formación y el equilibrio poblacional se calculan por separado para Masculino y Femenino.
69. Nuevas y ascendidas ingresan anteúltimas: N=0 => #1; N=1 => #2; N>=2 => posición N.
70. Tres incumplimientos atribuibles consecutivos generan 30 días de inactividad sin assignments y reactivación automática al vencer el plazo.
71. La racha se reinicia con un partido real resuelto sin incumplimiento propio o cuando el incumplimiento fue únicamente del rival; una cancelación automática por ranking/categoría no la reinicia.
72. La revisión de un resultado dura 7 días desde el momento exacto en que una de las parejas lo carga; silencio al vencer auto-valida.
73. Todo movimiento operativo relevante debe notificarse por WhatsApp a los integrantes afectados.
74. Al terminar la formación, los #1 de 2ª–7ª y los últimos de 1ª–6ª entran en 0/3 si ya tienen al menos un partido real previo; con 0 partidos deben disputar uno antes de activar la zona.
75. El umbral poblacional 1/2/3 se recalcula al confirmar cada nuevo resultado.
76. El récord de defensas del #1 de Primera mide un reinado individual: al perder la punta el contador corriente termina; si la dupla vuelve a #1 empieza de 0.
77. Solo los reinados que superan o igualan el máximo quedan en el cuadro histórico; los empates se muestran como récord compartido.
78. Disolver y re-formar la misma dupla no acumula defensas entre reinados; un récord histórico ya logrado permanece acreditado a esos dos jugadores.


## Cierre funcional final de Wheel v3 — 2026-09-28
79. Si al terminar la fase de formación una pareja está en zona de ascenso/descenso pero tiene 0 partidos reales, debe jugar primero un partido; ese primer resultado no cuenta para la zona y recién después entra en 0/3.
80. La fórmula vigente de ingreso de nuevas/ascendidas es anteúltima: N=0 => #1; N=1 => #2; N>=2 => posición N.
81. Con estas decisiones no quedan preguntas funcionales abiertas de Wheel v3; el siguiente paso es validar el diseño mediante simulaciones/tests antes de implementar.

## Ajustes de auditoría — 2026-09-28
82. Nuevas y ascendidas dejan de ingresar a mitad de tabla: ingresan **anteúltimas** y deben pelear desde abajo; no entran en período de descenso solo por ese ingreso.
83. Si el último vence luego a la nueva/ascendida y la manda al último puesto, recién ahí puede comenzar su período de descenso.
84. Un período de descenso pendiente pertenece a la combinación exacta de dos personas y sobrevive a la disolución y a cualquier cantidad de parejas intermedias; reunirse nuevamente no lo borra.
85. Un descenso real actualiza las categorías individuales necesarias para impedir evasión: 2ª + 5ª que descienden a 3ª quedan individualmente 3ª y 5ª.
86. Una vez cargada una primera versión de resultado, movimientos posteriores del ranking no cancelan el partido.
87. Al aplicar ese resultado, el ganador nunca puede bajar por movimientos posteriores: solo se intercambia si el ganador está actualmente debajo del perdedor.
88. Una cancelación automática por ranking/categoría no reinicia la racha de incumplimientos.
89. Los cuatro bordes específicos auditados quedaron cerrados: anteúltima con N=1, descenso pendiente de dupla exacta/categoría, racha exacta de incumplimientos y partido jugado antes de cancelación.

## Cierre de bordes de auditoría — 2026-09-28
90. Con 0 activas una nueva/ascendida entra #1; con exactamente 1 activa entra #2, sin desplazar al único #1.
91. Un período de descenso pendiente queda ligado a la dupla exacta y a la categoría donde se abrió. Si vuelven a juntarse antes de resolverlo, regresan excepcionalmente a esa categoría y retoman el contador.
92. Esa excepción termina cuando el período se resuelve por victoria real o descenso; después, una nueva formación usa las categorías individuales vigentes.
93. La racha de incumplimientos pertenece solo a la dupla exacta. No se transfiere al compañero nuevo, pero tampoco se borra por disolver o formar otras parejas.
94. Al re-formarse una dupla con incumplimientos pendientes, app/WhatsApp muestran el contador y advierten la consecuencia del siguiente incumplimiento.
95. Un partido jugado válidamente antes de una cancelación puede cargarse después de la cancelación y seguir confirmación/disputa normal.
96. Si al aplicar ese resultado el ganador ya está arriba por cambios previos, no se mueve el ranking y se avisa: no se aplican cambios porque el ganador pasaría a estar abajo.
97. Si el partido no se había jugado antes de la cancelación, la cancelación competitiva es definitiva.

## Tiempo autoritativo — 2026-09-28
98. Ningún plazo competitivo depende del reloj del dispositivo del jugador.
99. La autoridad temporal es backend/base de datos; timestamps y comparaciones se almacenan en UTC.
100. Para decisiones de vencimiento se prefiere PostgreSQL `CURRENT_TIMESTAMP/NOW()` dentro de la transacción correspondiente.
101. El frontend solo muestra deadlines y cuentas regresivas basadas en una referencia `server_now`; alterar la hora local no cambia reglas ni vencimientos.
102. Las fechas pueden mostrarse en horario de Argentina, pero la lógica permanece en UTC.

153. En el gate poblacional entre categorías adyacentes, un movimiento puede habilitar aceleración si reduce **o mantiene** el desvío conjunto respecto de 1/7; un empate exacto del desvío conjunto es admisible. Solo se bloquea la aceleración cuando el movimiento empeora ese desvío conjunto.

154. El cutover productivo Wheel v2 -> Wheel v3 se ejecutó exitosamente el 2026-09-29 a las 04:36:57.554Z; desde entonces `app_settings.engine='wheel-v3'`.
155. Todas las escrituras competitivas del runtime usan una barrera PostgreSQL compartida con advisory key `8675311`; el cutover toma ese lock en exclusivo antes de los locks de asignador/mantenimiento y antes de revalidar/cambiar engine. Esto reemplaza la necesidad de apagar el backend durante el switch.
156. El run de cutover `36522396511` verificó backend `209f8164920a20fa6ee3a540b0c1d4b205112e70` y frontend `87532489ca44d8ed5cd9378a5e17db64f360c032`; pre y postcutover quedaron verdes y ambos SHA fueron auditados.
157. Después del cutover v3 no se permite volver a Wheel v2 mediante un simple cambio de `app_settings.engine`; cualquier rollback necesita una estrategia compatible con el estado v3.
