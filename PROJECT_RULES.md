# LA RED Tenis — Reglas funcionales definitivas

Este archivo es la **fuente de verdad funcional**. Código, base, frontend, tests y documentación deben coincidir con estas reglas.


> **Wheel v3 — reglamento adoptado para LA RED Tenis**
>
> Para asignación automática, ataque/defensa, fase de formación, equilibrio poblacional, inactividad, ascenso/descenso, incumplimientos, no-show y movimientos visibles, leer primero `WHEEL_V3_SPEC.md`.
> Ese archivo contiene las decisiones acordadas y **prevalece sobre las secciones antiguas que entren en conflicto**. El motor es `wheel-v3`. No hay ranking Elo ni desafío manual. El reglamento base está cerrado; cualquier cambio del motor requiere evidencia de bug y una regresión.

## 1. Alcance
- Liga continua de tenis por parejas en San Pedro, Buenos Aires.
- Circuitos masculino y femenino.
- Categorías 1ª a 7ª, sin cupos máximos.
- No existen temporadas ni resets anuales.
- Zona horaria oficial: `America/Argentina/Buenos_Aires`.

## 2. Ranking
- La posición estructural manda.
- Si una pareja ubicada más abajo vence a una ubicada más arriba, intercambian posiciones.
- Si gana la que ya estaba arriba, no hay intercambio.
- No existe reordenamiento global por estadísticas, victorias o games. La posición real dentro de la categoría es el ranking.
- Principio: **Las estadísticas desempatan; no gobiernan el ranking. El ranking se conquista en cancha mediante intercambio de posiciones.**

## 3. Ranking y récord especial de Primera
- No existe una métrica numérica paralela al ranking.
- La posición estructural de la pareja dentro de su categoría es su ranking real.
- No se muestran valores actuales, máximos ni históricos alternativos al puesto.
- El único récord deportivo histórico especial es el de **defensas exitosas del puesto #1 de Primera**, separado por circuito.
- Cada defensa real en la que la pareja ya ocupa el #1 de Primera y conserva la punta suma 1.
- La sección pública que antes representaba otro récord se reutiliza exclusivamente para mostrar este dato.

## 4. Ascenso, descenso y equilibrio poblacional
- Wheel v3 tiene una fase de formación **separada por circuito**: Masculino y Femenino avanzan independientemente. Hasta que un circuito tenga al menos 5 activas en cada una de sus 7 categorías no hay movimientos entre categorías en ese circuito.
- Terminada la formación, el requisito base de ascenso/descenso es 3 resultados deportivos correspondientes.
- El requisito puede bajar a 2 o 1 según desvío poblacional de parejas activas, usando el esquema vigente de `WHEEL_V3_SPEC.md`, y se recalcula al confirmar cada nuevo resultado.
- La población por sí sola nunca mueve una pareja: siempre hace falta un resultado posterior que materialice el movimiento.
- En 7ª no existe período de descenso.
- Una pareja que asciende entra **anteúltima** en la categoría superior y desplaza hacia abajo desde ese punto. No entra en período de descenso solo por ingresar: debe llegar posteriormente al último puesto por movimiento deportivo.
- Una pareja nueva también entra **anteúltima** y se rige por la misma protección inicial.
- Si hay 0 activas, la nueva/ascendida entra #1; si hay exactamente 1 activa, entra #2 y no desplaza al único #1.
- Descenso entra base #2 en la categoría inferior; si no existe #1 material, entra #1.
- Los movimientos entre categorías son siempre adyacentes.
- Al terminar la formación, los #1 de 2ª–7ª y los últimos de 1ª–6ª que ya tienen al menos un partido real previo entran inmediatamente en 0/3 de ascenso/descenso. Si tienen 0 partidos, primero deben disputar uno; **ese primer resultado no cuenta** para la zona y, al cerrarlo, recién ingresan en 0/3.

## 5. Categoría individual y categoría de pareja
- La pareja compite en la categoría individual más fuerte de sus dos jugadores (número más bajo); dos jugadores sin categoría previa pueden elegir libremente 1ª–7ª.
- Ejemplo: jugador de 2ª + jugador de 5ª => la pareja compite en 2ª.
- Formar pareja con alguien más fuerte **no cambia automáticamente** la categoría individual del jugador arrastrado hacia arriba.
- Un ascenso deportivo real de la pareja mejora la categoría individual de ambos integrantes al nivel alcanzado.
- Al disolverse, cada jugador conserva su categoría individual real.
- Un descenso real también puede empeorar la categoría individual necesaria para impedir evasión: si 2ª + 5ª descienden a 3ª, quedan individualmente 3ª y 5ª.
- La misma dupla que se disuelve y luego se vuelve a formar se trata competitivamente como una pareja nueva.

## 6. Identidad y acceso
- Registro: nombre, apellido, DNI, foto del frente y dorso del DNI, WhatsApp, contraseña y circuito.
- Login: DNI + contraseña.
- DNI único, privado y no público. El frente y dorso se usan únicamente para la verificación administrativa inicial.
- Cuenta nueva queda `pending` hasta verificación administrativa.
- Pendiente puede entrar, pero no formar pareja ni competir.
- DNI solo puede corregirse por administración y queda auditado.
- Las imágenes del DNI se purgan de la base activa al verificar o rechazar la identidad; no forman parte del perfil ni del historial deportivo.
- Recuperación de contraseña por código enviado al WhatsApp registrado.
- Cambio de WhatsApp valida el número nuevo y, cuando es posible, avisa al anterior.
- Primera versión competitiva: mayores de 18 años.

## 7. Formación de pareja
- Requiere invitación + aceptación.
- Una invitación saliente activa por jugador.
- Expira a los 10 días y puede cancelarse.
- La invitación muestra la categoría resultante.
- La base impide pertenecer a dos parejas competitivamente vigentes.
- La misma dupla que se disuelve y después vuelve a formarse se considera competitivamente una pareja nueva para ingreso/estadísticas, aunque la implementación pueda reutilizar una identidad técnica interna.
- Un período de descenso pendiente de esa combinación exacta de dos personas **no se borra** por disolución ni por crear otras parejas en el medio.
- Si vuelven a juntarse antes de resolverlo, regresan excepcionalmente a la misma categoría donde se abrió y retoman el mismo contador. Una vez resuelto por victoria real o descenso, futuras formaciones usan las categorías individuales vigentes.
- No se expone un historial estadístico acumulado de la pareja.

## 8. Estados
### Competencia de pareja
- `active`: compite.
- `paused`: existe pero sale temporalmente de la rueda.
- `inactive`: disuelta/archivada.

### Disciplina
- Separada para pareja y jugador: `clear`, `observed`, `review`.
- Disciplina abierta bloquea nuevas asignaciones.
- Disciplina individual acompaña a la persona al cambiar de compañero.

## 9. Inactividad temporal
- Alcanza con que **uno de los dos integrantes** solicite pasar a inactiva en nombre de la pareja.
- Si tiene un compromiso abierto, primero debe resolverse la situación de ese compromiso.
- No se la obliga físicamente a jugar: si decide no disputarlo, se aplica primero la consecuencia deportiva correspondiente.
- Si la incumplidora estaba por encima del rival, intercambian posiciones; si estaba por debajo, no hay intercambio. Incumplir nunca puede hacer subir a la incumplidora.
- Una vez inactiva, sale de la rueda, no recibe assignments y no participa del balance ataque/defensa ni del cálculo poblacional activo.
- Durante los primeros 3 meses completos conserva su posición de retorno.
- Desde el 4º mes completo pierde 1 posición de retorno por cada mes completo adicional, sin poder bajar de categoría por inactividad.
- Si se inactivó siendo #1 de cualquier categoría, pierde inmediatamente el derecho a volver #1: dentro de los primeros 3 meses vuelve como máximo #2; luego ese #2 base baja un puesto por cada mes completo adicional.
- Al reactivar se inserta en la posición calculada y desplaza hacia abajo a las activas desde ese punto.
- Si dos inactivas tienen el mismo puesto de retorno, cada una se inserta allí cuando vuelve; la que reactiva más tarde desplaza hacia abajo a la que había vuelto antes.
- Si estaba en período de descenso, ese estado y contador quedan congelados durante la inactividad y se retoman al volver.
- La inactividad por sí sola nunca genera descenso de categoría.
- Técnicamente puede conservarse `paused` para esta inactividad temporal y `inactive` para disolución/archivo, mientras la UI hable de “inactiva”.
- Tras 3 incumplimientos atribuibles consecutivos, la pareja pasa automáticamente a inactiva y queda 30 días sin nuevas asignaciones; al día 30 se reactiva automáticamente. Cualquier assignment cerrado sin incumplimiento atribuible reinicia la racha a 0.

## 10. Disolución
- Puede iniciarla cualquiera.
- Si ambos confirman y no hay obligaciones, puede cerrarse inmediatamente.
- Si el otro no responde, existe salida a 7 días.
- Obligaciones abiertas se resuelven antes.
- Assignment sin jugar todavía abierto al vencer el plazo => derrota deportiva de la pareja que se disuelve, sin games inventados.
- Resultado ya cargado sigue su flujo normal.
- La disciplina no se borra por disolución.

## 11. Rueda automática
- Máximo un partido abierto por pareja.
- El sistema asigna automáticamente el rival cuando las reglas permiten determinarlo.
- No existe un flujo ordinario de buscar rival → desafiar → esperar aceptación.
- Solo se enfrentan parejas habilitadas de la misma categoría.
- Wheel v3 usa roles `ataque` y `defensa`.
- El ataque busca únicamente hacia arriba; la defensa queda disponible para recibir ataques.
- La prioridad principal es el tiempo sin partido real.
- La búsqueda del atacante comienza en una ventana de hasta 3 puestos hacia arriba y se amplía inmediatamente de a 3 si no hay defensor elegible.
- Se evita repetir rival consecutivo si existe alternativa, pero nunca se bloquea la rueda por esa preferencia.
- Las parejas inactivas y las que ya tienen assignment abierto no participan del balance de roles.
- Se intenta no superar 2 ataques ni 2 defensas consecutivas para una misma pareja, salvo que sea necesario para evitar que la rueda se trabe.
- Si una categoría tiene una sola activa, esa pareja espera sin rol efectivo hasta que exista otra.
- Desde la asignación hay 30 días corridos para **jugar y cargar** una primera versión de resultado.
- Resolver rápido libera inmediatamente para una nueva evaluación de la rueda.

## 12. Programación
- Una sola programación oficial vigente: día, hora y **lugar escrito libremente por los jugadores**.
- Proponer un partido no requiere que el lugar exista previamente en el catálogo de canchas de LA RED.
- El texto del lugar puede ser un club, complejo, cancha particular u otra referencia útil para coordinar; se limita a 160 caracteres.
- La mención escrita por un jugador **no crea una cancha adherida, no implica recomendación, patrocinio ni vínculo comercial con LA RED**.
- Una propuesta tiene 48 horas para responder.
- Aceptar la propuesta la convierte en programación oficial y la publica en Próximos partidos.
- Una nueva propuesta no borra la programación oficial anterior hasta que ambas acepten el cambio.
- Para atribuir unilateralmente un vencimiento al rival, la propuesta válida debe haberse hecho al menos 48 horas antes del vencimiento general.
- Propuestas posteriores siguen siendo válidas para acordar, pero no trasladan automáticamente toda la culpa.

## 13. Plazo general
- Wheel v3 usa un plazo único de 30 días para jugar y cargar una primera versión de resultado.
- No existe una extensión extraordinaria de 15 días.
- Una caída comprobada de LA RED puede suspender/compensar relojes sin sancionar jugadores.
- Si existe una versión cargada dentro del plazo, desde ese instante hay 7 días para confirmarla o discutirla; silencio al vencer auto-valida.

## 14. Incumplimientos
- Cualquiera de los dos integrantes puede marcar `No pude jugar` en nombre de toda la pareja; no requiere confirmación del compañero.
- La UI/auditoría registra quién lo informó: `No pude jugar (informado por Nombre Apellido)`.
- Una pareja puede marcar `No pude jugar` sin esperar al día 30.
- Si una sola pareja reconoce el incumplimiento, el compromiso se cierra y se aplica la consecuencia administrativa/deportiva vigente; la victoria administrativa del rival no cuenta como victoria real de ascenso ni para salir de período de descenso.
- Si ambas incumplen o vence el plazo sin resultado ni reconocimiento unilateral, se aplican las penalizaciones a ambas sin generar espera indefinida.
- Las penalizaciones simultáneas deben hacer perder exactamente un puesto efectivo a cada sancionada, usando deuda si hace falta.
- Después de la fase de formación, última activa + incumplimiento propio implica descenso directo salvo 7ª.
- En 7ª no hay descenso.
- El incumplidor pasa a defensa obligatoria cuando sea materialmente posible; una defensa imposible por estar último no debe bloquear la rueda.
- **Tres incumplimientos atribuibles consecutivos**, en cualquier categoría, provocan 30 días sin assignments y paso automático a inactiva. Al día 30 se reactiva automáticamente.
- La racha pertenece a la dupla exacta y sobrevive a disoluciones/parejas intermedias. Al re-formarse se muestra y notifica el contador pendiente.
- Se reinicia solo con un cierre real de esa dupla sin incumplimiento propio; una cancelación automática del sistema no la reinicia.

## 15. No-show
- Solo puede reportarse después de la fecha/hora oficial.
- El denunciante dispone de una ventana de 48 horas para retirar el reporte y reprogramar dentro del plazo original si corresponde.
- Si la pareja reportada reconoce expresamente que no pudo presentarse, se resuelve inmediatamente sin esperar el fin de esas 48 horas.
- Si el no-show queda unilateral o existe contradicción, pasa a Administración; no se auto-valida por silencio.
- Una disputa real de no-show mantiene el compromiso bloqueado hasta resolución.

## 16. Resultados
- Si el partido ya se había jugado mientras el assignment era válido, puede cargarse aunque el sistema haya cancelado el assignment antes de la carga; debe declararse una fecha/hora de juego anterior a la cancelación y luego sigue confirmación/disputa normal.
- Desde que existe una primera versión de resultado cargada, cambios posteriores del ranking no cancelan ese partido.
- Al aplicar el resultado, el ganador nunca baja por movimientos posteriores: si actualmente está debajo del perdedor, intercambian; si ya está arriba, no hay intercambio adicional y se notifica por app/WhatsApp que no se aplican cambios porque el ganador pasaría a estar abajo por un cambio previo en el ranking.
- Cualquier integrante puede cargar una versión de resultado en nombre de su pareja, salvo que una acción específica quede definida como de doble confirmación en `WHEEL_V3_SPEC.md`.
- Una pareja carga ganador, fecha real y resultado estructurado.
- Si la primera versión se cargó dentro de los 30 días, desde ese instante la otra pareja dispone de 7 días para confirmar o discutir. El silencio al vencer auto-valida la versión.
- Versiones idénticas pueden confirmarse automáticamente.
- Versiones incompatibles generan una disputa administrativa real.
- La primera versión puede editarse hasta que el rival responda; editar no reinicia el plazo.
- Después de respuesta, las versiones quedan inmutables.
- Un resultado pendiente bloquea nuevas asignaciones hasta cerrar.

## 17. Marcador
- Sets estructurados.
- Super tie-break debe marcarse como tal y solo puede reemplazar al tercer set.
- Sus puntos no cuentan como games.
- Resultado normal debe terminar 2-0 o 2-1.

## 18. Lesión / abandono
- Si el partido comenzó y una pareja abandona: tipo `LESIÓN / ABANDONO`.
- Se registra quién abandona.
- Se considera **partido real**.
- Rival obtiene victoria real; abandonante derrota real.
- No se cargan sets parciales ni games.
- Aplica intercambio de escalera cuando corresponde.
- La victoria cuenta para ascenso y para salir de período de descenso; la derrota cuenta para descenso.
- Si el #1 de Primera conserva la punta mediante ese partido real, cuenta como defensa exitosa.
- Sin penalización administrativa extra.
- No se publican diagnósticos médicos.

## 19. Disciplina
- Reportes: mala conducta, violencia, amenazas, negativa reiterada a coordinar, no-show, otro.
- Un compromiso abierto puede reportarse mientras siga abierto; tras cerrar, ventana ordinaria de 15 días.
- Mismo reporter contra mismo objetivo/assignment cuenta una vez.
- Rolling window de 180 días.
- 3 reporters distintos => `observed`.
- 5 => `review`.
- Violencia o amenazas => `review` inmediato para jugador o pareja.
- Una resolución registra `discipline_resolved_at`; hechos anteriores no reabren automáticamente el caso.

## 20. WhatsApp y notificaciones
- La app es la fuente oficial.
- WhatsApp es canal operativo principal.
- Eventos importantes del compromiso llegan a ambos integrantes de las parejas afectadas.
- Push móvil puede agregarse sin cambiar el motor.
- La outbox es idempotente y reintenta fallos.
- Mensajes comerciales futuros se separan de los operativos.
- El teléfono del rival solo se utiliza/expone mientras existe un compromiso abierto.

## 21. Público
- Ranking, resultados, próximos partidos confirmados, perfiles deportivos y récords de Primera.
- Perfil deportivo simple: jugadores, categoría, posición actual, estado y hasta los últimos 5 movimientos reales con fecha. No se muestran acumulados de partidos, victorias, derrotas ni una métrica numérica paralela al puesto.
- No se publican DNI, teléfono, mensajes, reportes, disciplina ni datos médicos.
- Pausa puede mostrarse como estado neutro; nunca su motivo.

## 22. Canchas y negocio
- El **lugar de un partido** y una **cancha adherida a LA RED** son conceptos separados.
- Los jugadores escriben libremente el lugar al coordinar. Ese texto no crea ni modifica una ficha comercial.
- Las canchas administrables por LA RED son una capa comercial separada: alta, edición, activa/inactiva, adherida, Instagram/web, reservas futuras y orden de aparición.
- Solo una cancha marcada explícitamente por administración como **adherida** y activa puede mostrarse públicamente en la sección de sedes adheridas.
- Una cancha mencionada por jugadores nunca se convierte automáticamente en sede adherida.
- Desactivar una ficha comercial no borra historial ni programaciones ya confirmadas.
- LA RED no se define como “sin fines de lucro” ni promete gratuidad permanente.
- Etapa inicial puede ser gratuita para jugadores.
- Evolución prevista: acuerdos comerciales con sedes, reservas/pagos de cancha y comisión mediante proveedor de pagos adecuado.
- La capa comercial nunca altera resultados, rueda o ranking.

## 23. Administración
Administración es una cola de excepciones, no operación diaria.

Interviene en:
- verificación/corrección de identidad;
- disputa real de resultado;
- disciplina;
- canchas;
- auditoría/correcciones excepcionales;
- pausa global de relojes por incidente general.

No interviene en asignaciones, vencimientos, sanciones deterministas, auto-validación, pausa automática, ascensos/descensos o coordinación ordinaria.

## 24. Seguridad y auditoría
- Acciones importantes generan eventos.
- Acciones admin quedan auditadas con quién/cuándo/qué.
- Admin usa sesión más corta y TOTP cuando se configura.
- Rol admin se valida contra DB en cada endpoint.
- Login/registro/recuperación tienen rate limiting básico.
- Backups/PITR de la base son requisito operativo.
- Código competitivo debe ser idempotente ante retries/concurrencia.

## Administración final
- El primer propietario se promueve desde consola; no existe registro público de administradores.
- Admin verifica identidad, resuelve disputas reales, disciplina, canchas, correcciones y contingencias del sistema.
- Admin no aprueba la formación de una pareja: la invitación y aceptación pertenecen a los dos jugadores.
- Toda acción administrativa sensible queda auditada.


## Acceso administrativo privado
- El login de jugadores no muestra ni acepta código de administrador.
- Las cuentas `admin` no pueden autenticarse por el endpoint normal de jugadores.
- El ingreso administrativo usa `/admin-la-red` en frontend y `/api/auth/admin-login` en backend.
- La ruta privada no se enlaza desde ninguna pantalla pública.
- Conocer la ruta no otorga acceso: siguen siendo obligatorios rol Admin, contraseña y TOTP cuando está configurado.


## Reenvío de DNI
- Una foto borrosa/cortada/incorrecta no rechaza automáticamente la cuenta.
- Admin dispone de `PEDIR NUEVAS FOTOS` con un motivo breve.
- Al pedir reenvío, las imágenes anteriores se eliminan de la base activa y la cuenta sigue `pending`.
- El jugador recibe aviso in-app y WhatsApp cuando esté configurado.
- El jugador reenvía frente + dorso desde `Mi cuenta`; no crea otra cuenta ni cambia DNI.
- Mientras la identidad esté `pending`, el propio jugador puede reemplazar voluntariamente ambas fotos antes de la revisión final.
- `RECHAZAR CUENTA` queda reservado para una identidad que no corresponde o una cuenta que no debe habilitarse.


## 25. Gobernanza de cambios
- Los `.md` son la memoria oficial del producto.
- Un cambio de regla exige actualizar `PROJECT_RULES.md`, `DECISIONS.md` y los tests correspondientes.
- Un bug real descubierto en recorrido se registra en `AUDIT_2026-09-20.md`.
- La evolución/razón del cambio se registra en `PROJECT_JOURNEY.md`.
- Antes de un bloque grande nuevo se hace checkpoint/push para no depender del contexto del chat.
- No se reintroducen módulos legacy ni reglas reemplazadas para resolver un bug local.

## 26. Estado de infraestructura de este checkpoint
- La instalación activa de desarrollo usa una Neon nueva.
- La Neon histórica fue eliminada accidentalmente y no debe asumirse disponible como backup.
- El target de runtime es Node 22 aunque una parte de las pruebas locales se haya realizado con Node 24.
- Antes de producción se debe normalizar Node 22, SSL, backups/PITR, TOTP y WhatsApp.## 21 ter. Tiempo autoritativo
- Todos los plazos oficiales se calculan con hora de servidor/base, nunca con el reloj del dispositivo del jugador.
- Persistencia y comparaciones en UTC; presentación localizable en Argentina.
- PostgreSQL `CURRENT_TIMESTAMP/NOW()` es la referencia preferida para decisiones transaccionales de vencimiento.
- El frontend recibe `deadline_at` y una referencia `server_now` (o equivalente) y solo presenta el tiempo restante.
- Cambiar la hora de PC/teléfono no modifica ningún vencimiento ni consecuencia deportiva.


