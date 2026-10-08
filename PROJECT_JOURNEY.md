# LA RED Tenis — El camino hasta la versión final

LA RED empezó como una liga con desafíos manuales y fue transformándose al detectar contradicciones reales: múltiples compromisos simultáneos, reglas 30/90, una métrica numérica secundaria mezclada con el ranking, estados de disciplina y competencia superpuestos, resultados fuera de orden y demasiada intervención administrativa.

La conclusión fue construir una liga **autónoma, explicable y continua**.

El ranking se convirtió en una escalera: la posición se gana en cancha. La rueda dejó de depender de que alguien desafíe. Cada pareja tiene un solo compromiso, un reloj claro y un rival asignado por variedad histórica. La coordinación se volvió estructurada, pero WhatsApp sigue siendo el canal humano natural.

La identidad pasó a ser seria: DNI único, verificación antes de competir, privacidad estricta y recuperación por WhatsApp. La pareja dejó de poder formarse unilateralmente y apareció la diferencia entre categoría individual y categoría temporal de la dupla.

También se separó la disciplina de la competencia. Una persona no puede “lavar” una conducta cambiando de compañero. Una pausa no borra historia ni obligaciones. Una disolución tampoco.

La experiencia se centró en una pregunta: **“¿Qué me toca hacer ahora?”**. Las reglas importantes se explican en el momento en que afectan al jugador.

Más adelante apareció el horizonte comercial: primero comunidad y adopción; luego acuerdos con canchas, reservas y pagos. Esa capa se diseñó separada del motor deportivo para que monetizar nunca cambie quién ganó ni quién ocupa una posición.

La parte legal también pasó a formar parte del producto: mayores de 18, aceptación versionada, riesgos deportivos, conducta, privacidad, WhatsApp, auditoría y revisión profesional antes del lanzamiento.

Finalmente se decidió dejar de apilar migraciones sobre el runtime histórico y reconstruir LA RED de forma limpia. La versión final conserva el aprendizaje, no la deuda técnica: un único `wheel-v2`, un único esquema PostgreSQL, un frontend/PWA único, tests, CI y documentación consolidada.

A partir de esta versión, cualquier cambio futuro debe modificar en el mismo commit: regla vigente, implementación, tests y documentación.


## Recuperación de la identidad visual final

Durante la reconstrucción limpia se detectó una regresión visual: el primer frontend consolidado conservaba la funcionalidad nueva, pero había reemplazado el diseño aprobado por un layout genérico y había dejado afuera los assets de identidad ya seleccionados.

La corrección no revierte el motor nuevo. Se mantiene `wheel-v2`, sus rutas, DNI, rueda, resultados, perfiles, próximos partidos, administración y seguridad; solamente se vuelve a colocar por encima la identidad visual que el proyecto ya había alcanzado.

Queda nuevamente como sistema visual oficial:
- cancha real de tenis como hero;
- azul marino, azul eléctrico y verde brillante;
- transparencias/glassmorphism;
- encabezado y espaciados responsive;
- tarjeta Top 10;
- bloques públicos de cartelera, resultados y récords;
- assets PWA aprobados.

Regla de trabajo: una reconstrucción técnica no autoriza a rediseñar silenciosamente la identidad visual aprobada. Backend/reglas y presentación deben evolucionar sin destruirse entre sí.


## Verificación documental de identidad

Durante el recorrido real del alta se detectó que la cuenta pedía el número de DNI pero no permitía adjuntar frente y dorso. Se corrigió el flujo para que la verificación administrativa tenga evidencia suficiente sin convertir la documentación en un dato permanente.

La decisión final equilibra identidad y privacidad: se solicita frente + dorso, administración los revisa y las imágenes se eliminan automáticamente al cerrar la verificación. El número de DNI continúa como usuario único de acceso.

## Administración operativa final
Al recorrer el alta real se detectó que existía lógica administrativa pero faltaba cerrar el acceso práctico del propietario y hacer visible el panel como producto. Se consolidó el bootstrap del primer admin, la auditoría visible y el tablero de excepciones. La autonomía deportiva se mantiene: el administrador no reemplaza el consentimiento de los jugadores ni el motor competitivo.


## Entrada administrativa separada

Durante la primera prueba del propietario se detectó que el formulario público mostraba un campo “Código admin”, exponiendo innecesariamente la existencia del acceso administrativo. Se separó completamente el ingreso: el jugador ve solo DNI + contraseña y la administración entra por una ruta reservada no enlazada. El backend también separa ambos endpoints para impedir que una cuenta Admin use el login público.


## Corrección de navegación Login / Registro

En la prueba manual del alta apareció un bug propio de navegación SPA: cambiar entre `/ingresar` y `/ingresar?registro=1` modificaba la URL pero no siempre el formulario porque React mantenía montado el mismo componente. Se corrigió sincronizando el estado visual con `location.search`, de modo que header, botón interno, historial del navegador y recarga muestran siempre el modo correcto.


## Orden visual de todas las pantallas

Las pruebas reales mostraron que conservar los colores y el hero no era suficiente: varias pantallas nuevas de `wheel-v2` seguían pareciendo formularios técnicos. Se hizo una pasada transversal de diseño para dar un mismo ritmo a toda LA RED: títulos con aire, cards separadas, textos legibles, secciones reconocibles y acciones con jerarquía.

La regla queda fijada: una pantalla funcional no se considera terminada si el usuario no puede entender visualmente qué bloque está leyendo, qué sigue y cuál es la acción principal.


## Reenvío de documentación de identidad

Al probar la revisión real apareció un caso cotidiano que faltaba modelar: una foto puede estar borrosa, cortada o mal tomada sin que la identidad sea inválida. Se separó entonces “pedir nuevas fotos” de “rechazar cuenta”.

Admin puede pedir un reenvío con motivo; LA RED elimina las imágenes anteriores, mantiene la cuenta pendiente y avisa al jugador. El usuario vuelve a cargar frente y dorso desde Mi cuenta, sin registrarse nuevamente.


## Integración del reenvío documental

La prueba local encontró un error que la validación de sintaxis aislada no detectaba: una ruta nueva importaba una función todavía no exportada. A partir de este hallazgo, el release incorpora también un control estático de imports/exports relativos entre módulos del backend.


## Verificación real de identidad y tipado PostgreSQL

La prueba administrativa encontró un error de tipado que no aparecía en los tests puros: reutilizar el mismo parámetro SQL para una columna `varchar` y una comparación con literal `text` hacía que PostgreSQL rechazara la consulta. Se separó la decisión booleana de “es verificación” del valor textual del estado y se reforzó la transacción completa.


## Primer checkpoint de estabilización real

Después de reconstruir LA RED se hizo una primera recorrida manual como usuario y como propietario. Esa recorrida fue deliberadamente más valiosa que seguir agregando funciones: expuso fallas de identidad, navegación, estilos, acceso Admin, integración de módulos y tipado SQL.

El circuito **registro → documentación → Admin → verificación** finalmente quedó funcionando de punta a punta. En este punto se decidió frenar los cambios, pushear y fijar la memoria del proyecto en `.md` antes de entrar al corazón deportivo.

La próxima etapa no es “seguir construyendo por construir”; es buscar inconsistencias y bugs de forma ordenada empezando por **pareja → rueda → programación → resultado → ranking**.

## Ajuste longitudinal de descenso
Después del primer push limpio se dejó de depender de pruebas manuales largas y se empezó a simular años completos. La regla 3/3 mostró una deriva de población hacia arriba. Se consideró bajar con 5 derrotas, pero el cálculo de rachas demostró que cinco consecutivas harían el descenso mucho más raro. Se adoptó una válvula más conservadora: 3 derrotas por defecto y 2 únicamente cuando la categoría superior inmediata acumula una diferencia de cinco o más parejas activas sobre la inferior.


## Validación longitudinal ampliada
La primera válvula de equilibrio no se dio por buena solo por una corrida a 20 años. Se amplió el modelo para medir 5/10/20 años, conservar las mismas semillas y comparar alternativas de ascenso/descenso. La hipótesis de cinco derrotas quedó descartada con matemática de rachas y Monte Carlo; endurecer el ascenso a cuatro victorias mostró la sobrecorrección opuesta. Entre gaps 4/5/6, el gap 5 vigente quedó como el compromiso más estable a largo plazo. La regla no cambió: cambió la calidad de la evidencia y quedaron regresiones automáticas para impedir que una futura edición reintroduzca la deriva.


## Cierre automatizado del corazón deportivo
La estabilización dejó de depender de recorridas manuales largas. El ciclo pareja → rueda → programación → resultado → ranking → movimiento de categoría → vencimientos → pausa/disolución quedó cubierto por PostgreSQL real en CI, incluyendo concurrencia e idempotencia. Los tests automáticos encontraron y corrigieron problemas que una simulación pura no podía revelar: orden de locks, posiciones transitorias, atribución tardía, ventana de extensión, strikes de no-show y un valor posicional derivado desactualizado al pausar.

El checkpoint alcanza 20/20 tests puros y 29/29 tests PostgreSQL en Node 22/PostgreSQL 16. Desde aquí el trabajo cambia de foco: hardening de módulos laterales y operación real, seguido por smoke UX en vez de años de liga manuales.


## Hardening lateral automatizado
Después de cerrar el corazón deportivo, se extendió el gate a disciplina, pausa global del reloj, deduplicación de notificaciones/WhatsApp, TOTP y coherencia de identidad. También se convirtió `database/verify.sql` en un gate ejecutable sobre una base de prueba reconstruida desde cero, evitando depender de inspección manual del schema.

El checkpoint alcanza 20/20 tests puros, 35/35 integración PostgreSQL, `verify:db` y frontend build verdes. Desde aquí lo pendiente es principalmente configuración y operación real de producción más smoke UX/legal.


## Cierre del último caso deportivo
Lesión/abandono fue el último ítem funcional que quedaba explícitamente abierto. La auditoría detectó que el abandonante se conservaba en la versión cargada pero no en el match oficial. Se agregó persistencia oficial, constraint de consistencia, patch para la base existente y regresiones que prueban cero games, swap de escalera, rachas, ascenso y descenso. Con esto el checklist funcional deportivo queda cerrado en 26/26 tests puros y 39/39 tests PostgreSQL.


## Auditoría de superficie real de usuario — 2026-09-22

Al entrar en producción apareció una diferencia importante entre “el motor puede hacerlo” y “una persona puede hacerlo desde la página”. Se hizo entonces una recorrida transversal tomando las reglas y endpoints como inventario, no como garantía de UX.

La auditoría confirmó que LA RED **no usa desafíos manuales**: la pareja se forma por invitación/aceptación y la rueda asigna rival. Lo que sí debía quedar visible era todo lo que ocurre después. Se completaron estados y botones para pausa, confirmación de pausa, disolución, confirmación de disolución, reactivación, propuestas, aceptación, extensión, no-show, objeción, carga/corrección/confirmación de resultados, disputa y disciplina incluso durante los 15 días posteriores al cierre.

En paralelo se separó definitivamente la coordinación deportiva del negocio de canchas. El jugador escribe el lugar que acordó; eso no transforma al club mencionado en socio de LA RED. Las futuras sedes comerciales viven en un catálogo administrado aparte y solo aparecen públicamente si el propietario de LA RED las marca de forma explícita como adheridas.

Desde este punto existe además una regresión automática de paridad backend/frontend: salvo endpoints técnicos de salud, una capacidad ordinaria expuesta por API no puede quedar nuevamente sin una superficie de uso en el frontend.


## Rediseño de la rueda automática — 2026-09-28

Al revisar la experiencia real de la liga se detectó que `wheel-v2` había evolucionado hacia un emparejamiento demasiado general: priorizaba espera e historial de cruces, pero podía enfrentar parejas a cualquier distancia sin una ruta deportiva clara hacia arriba.

El propietario redefinió el objetivo: la rueda debe ayudar a que las parejas **jueguen sin quedar estancadas**, pero manteniendo una lógica de escalera comprensible. De esa conversación surgió el diseño `Wheel v3`, documentado en `WHEEL_V3_SPEC.md`.

Los cambios conceptuales principales son:
- roles de ataque y defensa;
- el ataque siempre busca hacia arriba;
- la defensa queda disponible para recibir ataques;
- prioridad por tiempo real sin jugar;
- ventanas de 3 puestos que se amplían inmediatamente si no hay rival;
- cancelación automática de cruces que pierden sentido por cambios de ranking/categoría;
- fase de formación hasta 5 parejas activas por categoría;
- equilibrio porcentual posterior usando solo parejas activas;
- período de descenso persistente desde que una pareja toca el último puesto;
- inactividad separada de la rueda activa, sin castigos periódicos por el mero paso del tiempo;
- incumplimientos que no pueden bloquear la rueda;
- eliminación del historial estadístico acumulado visible de pareja, dejando solo 5 movimientos recientes y auditoría interna.

La decisión metodológica es importante: **no se toca el código todavía**. Primero se cerrarán las preguntas abiertas de la spec, luego se consolidarán las reglas definitivas, se escribirán simulaciones/tests y recién después se reemplazará `wheel-v2`.

## Simplificación definitiva del ranking y la inactividad — 2026-09-28

Antes de implementar Wheel v3 se tomó una decisión de simplificación fuerte: **la posición de la pareja en su categoría es todo el ranking que necesita el jugador**. Se descarta cualquier puntuación numérica paralela, actual o histórica.

La antigua sección de récord numérico no desaparece visualmente: se reutiliza para algo directamente comprensible, el récord histórico de defensas exitosas del #1 de Primera. Es la única estadística histórica especial que se desea destacar.

También se simplifica la inactividad. Una pareja resuelve primero el compromiso automático que ya tenga abierto y luego sale de la rueda. Desde ese momento no se la castiga periódicamente por no jugar, no pierde puestos por meses transcurridos y no baja de categoría por permanecer inactiva.

La intención de producto queda resumida en una regla: **el motor puede ser complejo; la experiencia no**. Si LA RED sabe quién debe jugar, asigna el partido y le dice a la pareja qué hacer a continuación.


## Ajuste final de inactividad y entrada media — 2026-09-28

La conversación posterior refinó la simplificación anterior de inactividad. Se mantiene que una pareja inactiva no recibe partidos ni desciende de categoría por el mero paso del tiempo, pero sí se recupera una regla de **posición de retorno**: durante 3 meses conserva el puesto y desde el 4º pierde un puesto por cada mes completo, siempre dentro de la misma categoría. Si se inactivó siendo #1, su mejor retorno es #2.

También se cerró que nuevas parejas y ascendidas no ingresan al fondo: entran en la mitad de la tabla activa y desplazan hacia abajo. La fórmula exacta de “mitad” queda por definir.

Para cortar abusos de incumplimiento, 3 incumplimientos atribuibles consecutivos provocan 30 días sin nuevas asignaciones y paso automático a inactiva. Queda pendiente decidir si la reactivación al cumplir los 30 días es automática y qué evento reinicia la racha.

La misma dupla que se disuelve y luego vuelve a formarse se trata competitivamente como pareja nueva. Las categorías individuales de sus integrantes sobreviven a la disolución; un ascenso real mejora el nivel individual de ambos.


## Cierre casi definitivo de Wheel v3 — 2026-09-28

Se cerraron los principales bordes que quedaban: Masculino/Femenino forman y equilibran población por separado; la entrada a mitad usa `floor(N/2)+1`; tres incumplimientos generan 30 días de inactividad con reactivación automática; un cumplimiento posterior corta la racha; la revisión de resultados corre 7 días desde la carga; y los cambios relevantes se notifican por WhatsApp.

El récord de Primera quedó definitivamente desacoplado de cualquier acumulación general: cada etapa de una dupla en el #1 es un **reinado independiente**. Perder la punta cierra ese contador. Solo si ese reinado supera o empata el máximo histórico queda en el cuadro de récord; si vuelve a ser #1 en el futuro comienza nuevamente desde cero.

Antes de código quedan únicamente dos bordes pequeños documentados en `WHEEL_V3_SPEC.md`: qué hacer con el primer partido de una pareja 0 PJ cuando se activan las zonas, y el caso de una categoría con una sola activa al aplicar la fórmula de mitad.


## Reglamento Wheel v3 funcionalmente cerrado — 2026-09-28

Se cerraron los dos últimos bordes del diseño antes de implementación. Si una pareja queda #1/última al terminar la fase de formación pero todavía tiene 0 partidos reales, debe disputar primero un partido; ese resultado solo habilita la zona y recién después entra en 0/3. Además, la fórmula de ingreso a mitad de tabla mantiene `floor(N/2)+1`, con una excepción para categorías con una sola activa: la ingresante entra #2 y no desplaza al único #1.

Con esto Wheel v3 queda funcionalmente definido. La etapa siguiente no es escribir código de inmediato: primero corresponde modelar y simular el reglamento completo, buscar ciclos imposibles, bloqueos, abuso de sanciones y deriva poblacional, y convertir esos hallazgos en tests antes de reemplazar Wheel v2.

## Auditoría anti-abuso e ingreso anteúltimo — 2026-09-28

La primera auditoría de Wheel v3 detectó vías de evasión por disolución/re-formación y por resultados demorados. Se cerró que un período de descenso pendiente pertenece a la combinación exacta de dos personas y sobrevive aunque formen otras parejas en el medio; un descenso real también ajusta la categoría individual necesaria para que separarse no borre ese descenso.

También se fijó que, una vez cargada una primera versión de resultado, cambios posteriores del ranking no cancelan el partido y nunca pueden hacer bajar al ganador al aplicar el resultado. Una cancelación automática del sistema tampoco limpia la racha de incumplimientos.

A partir de esta revisión cambió la regla de ingreso: nuevas y ascendidas ya no entran a mitad de tabla sino **anteúltimas**, para que deban pelear desde abajo. Ese cambio obliga a rehacer la simulación longitudinal antes de implementar.

## Cierre anti-evasión final — 2026-09-28

Se cerraron los bordes que dejó la auditoría. Una dupla en descenso que se disuelve queda ligada a la categoría donde abrió ese período y, si vuelve a juntarse antes de resolverlo, regresa allí aunque haya formado otras parejas en el medio. La racha de incumplimientos también pertenece a la dupla exacta: no castiga a compañeros nuevos pero reaparece si los dos originales se re-forman.

También se permitió cargar un partido que efectivamente se había jugado mientras el assignment era válido aunque el ranking lo cancelara antes de cargar el resultado. Al aplicar ese resultado nunca se baja al ganador; si ya quedó arriba por un movimiento previo, el ranking no cambia y LA RED explica el motivo por app/WhatsApp.

Con N=1 se conserva la excepción de ingreso #2. Con estos cierres, la próxima etapa vuelve a ser simulación longitudinal completa usando la nueva entrada anteúltima.
