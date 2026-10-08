# LA RED Tenis — Escenarios obligatorios

## Integridad
- usuario no puede estar en dos parejas vigentes;
- pareja no puede tener dos assignments abiertos;
- posiciones vivas únicas por categoría;
- mismo resultado no puede aplicarse dos veces;
- misma penalización con misma fuente no puede aplicarse dos veces;
- retries de WhatsApp no duplican mensajes.

## Ranking
- #7 vence #4 => #7 ocupa #4, antigua #4 ocupa #7, #5/#6 no cambian;
- #4 vence #7 => no hay intercambio;
- estadísticas no reordenan escalera;
- penalización no cuenta como derrota deportiva.

## Categorías
- 5ª + 2ª => pareja 2ª; individuales 5ª y 2ª;
- ascenso 2ª→1ª => ambos individuales 1ª;
- descenso 2ª→3ª => el 2ª pasa a 3ª, el 5ª sigue 5ª;
- descenso posterior a 6ª => ambos 6ª;
- ascendido entra fondo activo;
- descenso a categoría vacía entra #1.

## Rueda
- 100+ parejas sin límite;
- un solo assignment por pareja;
- nunca jugado antes que rematch;
- luego cruce más antiguo;
- categoría impar rota la espera;
- una sola pareja elegible espera sin sanción;
- terminar rápido habilita otro assignment.

## Programación
- una propuesta pendiente por assignment;
- tiene 48 h para aceptar;
- vieja programación sigue oficial hasta aceptar cambio;
- primera propuesta a 6 h del vencimiento no convierte al rival en único responsable;
- propuesta exactamente a 48 h sí puede servir como evidencia;
- horario/lugar público solo tras doble aceptación.

## Vencimiento
- ninguno actuó => ambos penalizados;
- uno actuó correctamente con margen y otro no respondió => solo no respondedor;
- ambos actuaron sin acuerdo => ambos;
- programación oficial vence sin resultado/no-show => ambos;
- última posición penalizada => deuda;
- dos incumplimientos atribuibles consecutivos => pausa automática.

## Extensión
- al vencer los 30 días existe una ventana técnica de 48 h para completar la doble confirmación;
- requiere confirmación de ambas;
- una sola extensión de 15 días;
- segunda causa no crea otra;
- vencimiento de extensión => ambos pierden posición/deuda;
- no suma derrota ni strike de pausa.

## No-show
- solo después del horario oficial;
- 48 h para objetar;
- silencio => penalización responsable;
- objeción sin evidencia objetiva => ambos penalizados, sin resultado deportivo.

## Resultado
- carga dentro de los 30 días;
- confirmación puede ocurrir luego dentro de sus 15 días;
- silencio 15 días => auto-validación;
- dos versiones idénticas => confirmar;
- diferentes => disputa;
- primera versión editable antes de respuesta sin reiniciar reloj;
- después de respuesta, versiones congeladas.

## Score
- sets imposibles rechazados;
- 2-0 no permite tercer parcial;
- 2-1 requiere 1-1 previo;
- super tie-break solo tercer parcial;
- super tie-break no suma games.

## Lesión / abandono
- victoria/derrota deportiva normal;
- cero games y score oficial nulo;
- `abandoned_pair_id` queda persistido en el match oficial;
- intercambio de escalera si corresponde;
- rachas y ascenso/descenso aplican;
- sin deuda, strike ni penalización extra;
- el ganador nunca puede ser la pareja declarada como abandonante.

### Integración PostgreSQL de lesión/abandono
- abandono de la pareja superior + victoria del challenger => swap de escalera, 0 games y rachas normales;
- tercera victoria por lesión/abandono => ascenso real;
- segunda derrota de la última con gap poblacional 5 => descenso adaptativo real;
- abandonante inválido => rechazo sin crear versión.

## Pausa y disolución
- pausa no borra deuda/racha/historial;
- pausa voluntaria conserva strike previo;
- `pause_after_current` no cancela compromiso;
- disolución con assignment no lo borra;
- al vencer 7 días sin jugar => forfeit deportivo antes de archivar;
- resultado ya cargado termina su flujo.

## Identidad
- DNI duplicado bloqueado;
- cuenta pendiente no compite;
- DNI nunca público;
- recuperación requiere control de WhatsApp;
- cambio de teléfono valida nuevo y avisa anterior;
- corrección de DNI solo admin y auditada.

## Disciplina
- 3 reporters distintos => observed;
- 5 => review;
- violencia/amenazas => review inmediato;
- disciplina individual sigue al jugador;
- nueva pareja no hereda como historial propio la falta del compañero;
- resolución no se reabre por los mismos hechos previos.

## Continuidad
- 31 dic → 1 ene no resetea ranking/rachas/deuda/récords;
- todos los plazos usan Buenos Aires.

## Simulación
Antes de release deben correrse miles de rondas con 101+ parejas y verificarse:
- permutación de posiciones;
- no doble assignment;
- variedad de cruces;
- no starvation;
- no duplicación de eventos.


## Regresión visual / PWA
- Home usa `clay-court-hero.png` y no un placeholder geométrico.
- Header se mantiene utilizable en desktop, tablet y móvil.
- Top 10 no desborda.
- Ranking conserva lectura clara en móvil ocultando columnas secundarias.
- Formularios y cards pasan de múltiples columnas a una columna en pantallas angostas.
- Manifest referencia iconos PNG existentes de 192 y 512.
- `index.html` referencia favicon y Apple touch icon existentes.
- Service worker de desarrollo sigue desregistrado; producción usa un cache con versión nueva tras cambios visuales.


## Verificación documental de identidad
- Registro sin frente => rechazado.
- Registro sin dorso => rechazado.
- Archivo que no sea JPG/PNG/WEBP => rechazado.
- Imagen mayor a 5 MB => rechazada.
- Admin puede ver frente/dorso solo autenticado.
- Endpoint público nunca expone documentación.
- No se puede marcar `verified` si faltan las dos imágenes.
- Al verificar => la fila temporal de `identity_documents` se elimina.
- Al rechazar => la fila temporal de `identity_documents` también se elimina.
- El DNI numérico permanece para login/unicidad.


## Login administrativo separado
- Login público no muestra ningún campo ni enlace de administración.
- Cuenta `player` inicia sesión por `/api/auth/login`.
- Cuenta `admin` es rechazada por `/api/auth/login`.
- Cuenta `player` es rechazada por `/api/auth/admin-login`.
- Admin válido entra por `/admin-la-red`.
- Con `ADMIN_TOTP_SECRET` configurado, código inválido o ausente rechaza el acceso Admin.
- Conocer `/admin-la-red` sin credenciales no concede ninguna capacidad administrativa.


## Login / registro dentro de la SPA
- Abrir `/ingresar` muestra login.
- Desde login, pulsar `Crear una cuenta` cambia inmediatamente a registro sin recargar.
- Desde registro, pulsar `Ya tengo cuenta` vuelve inmediatamente al login.
- Estando en `/ingresar`, pulsar `Crear cuenta` en el header actualiza el formulario aunque React reutilice el mismo componente.
- Estando en `/ingresar?registro=1`, pulsar `Ingresar` en el header vuelve al login.
- Refrescar cualquiera de las dos URLs conserva el modo correcto.


## Consistencia visual de páginas internas
- Todas las páginas internas respetan un margen claro entre header, título y primera card.
- Cards hermanas nunca quedan pegadas: grids y stacks conservan separación visible.
- Formularios dejan espacio entre explicación, labels, inputs y CTA.
- `Mi pareja` en estado sin pareja muestra formulario y guía separados; invitaciones viven en una sección independiente.
- `Mi pareja` con pareja activa muestra pausa y no reactivación; con pareja pausada muestra reactivación y no pausa.
- `Mi liga` sin pareja muestra onboarding, estado de identidad y secuencia de próximos pasos.
- `Mi liga` con assignment separa claramente partido, programación, resultado e incidentes.
- Cuenta, Avisos, Perfil, Próximos, Ranking, Instalar y Admin mantienen jerarquía de título/subtítulo/contenido.
- El chip de cuenta del header no desborda en móvil.


## Reenvío de DNI
- Admin ve foto borrosa y pulsa `PEDIR NUEVAS FOTOS`.
- Motivo vacío => rechazado.
- Solicitud elimina la fila temporal de `identity_documents`.
- Usuario permanece `pending`.
- Usuario recibe notificación con el motivo.
- Mi liga muestra `FOTOS A REENVIAR`.
- Mi cuenta permite subir nuevo frente + dorso.
- Reenvío sin uno de los dos lados => rechazado.
- Reenvío válido crea/reemplaza la fila temporal y limpia el motivo de reenvío.
- Admin vuelve a ver las nuevas imágenes.
- Usuario `verified` no puede volver a subir documentación por ese endpoint.
- Usuario pendiente puede reemplazar voluntariamente las imágenes antes de la revisión.


## Integridad de módulos y reenvío de DNI
- Todo import nombrado relativo en `src/` debe existir como export en su módulo destino.
- `POST /api/admin/identity/:id/resubmit` requiere identidad `pending`.
- Pedir nuevas fotos elimina las imágenes anteriores.
- Se guardan motivo y fecha de solicitud.
- La cola Admin muestra el motivo.
- El jugador recibe aviso.
- La acción queda auditada.


## Resolución administrativa de identidad
- Verificar una cuenta `pending` con frente/dorso actualiza `verification_status=verified`.
- `verified_at` se completa al verificar.
- Rechazar no necesita comparar un placeholder varchar contra un literal text.
- La operación no debe producir PostgreSQL `42P08`.
- La documentación temporal se elimina dentro de la misma transacción.
- La auditoría se crea dentro de la misma transacción.
- Si la acción termina bien pero falla el refresco del dashboard, la UI conserva el mensaje de éxito y avisa que debe recargarse.


## Próximo bloque obligatorio después del checkpoint

### Pareja
- dos players `verified` del mismo circuito;
- A invita a B;
- A ve la invitación saliente pendiente y puede cancelarla antes de que expire;
- mientras exista una invitación saliente activa, el frontend no ofrece enviar otra;
- B ve categoría resultante;
- B acepta;
- queda una sola pareja;
- ambos quedan en una sola `active_pair_membership`;
- la pareja nueva no recibe una puntuación numérica paralela;
- posición válida al final del bloque activo;
- invitaciones incompatibles quedan invalidadas;
- sin rival no corre plazo.

### Rueda
- segunda pareja en misma categoría provoca assignment automático;
- máximo un assignment por pareja;
- ambas parejas/categoría coinciden;
- deadline 30 días;
- ambos integrantes reciben el estado;
- resolver rápido habilita nueva rueda;
- odd/byes no penalizan.

### Programación/resultado
- propuesta 48 h;
- fecha oficial solo al aceptar;
- resultado dentro de 30 días;
- rival confirma o carga versión;
- silencio 15 días auto-valida;
- resultado oficial mueve ladder exactamente una vez;
- reintentos no duplican match/evento/penalización.

Estos escenarios deben recorrerse manualmente y luego convertirse/confirmarse como tests de integración.

## Equilibrio longitudinal de categorías
- con diferencia de 0–4 parejas activas respecto de la categoría inferior, la última necesita 3 derrotas consecutivas para descender;
- con diferencia de 5 o más, necesita 2 derrotas consecutivas;
- 7ª nunca desciende;
- el cambio de umbral no mueve parejas por sí mismo: solo afecta una derrota deportiva posterior de la última;
- al bajar la diferencia por debajo de 5, el umbral vuelve a 3;
- `npm run simulate:balance` compara P3/R3, P3/R5, gaps 4/5/6 y P4/R3 a 5/10/20 años;
- la simulación conserva las 84 parejas y mide población, ascensos, descensos, categorías vacías y RMSE de estabilidad;
- R5 debe permanecer como regresión negativa: a 20 años no puede comportarse mejor que la válvula vigente;
- test automático: gap 5 debe balancear ascensos/descensos y superar a gap 4/6 como compromiso a 20 años bajo las semillas de auditoría;
- siguiente bloque de integración PostgreSQL: frontera exacta 4/5, descenso exactamente una vez, entrada base #2/deuda, renumeración e idempotencia/concurrencia.


## Integración PostgreSQL automática
- gap 4 + segunda derrota de la última => no desciende;
- gap 5 + segunda derrota de la última => desciende;
- descenso entra base #2;
- deuda empuja la entrada y conserva deuda no materializable;
- la posición estructural queda consistente después del movimiento;
- ascenso entra al fondo activo;
- dos retries simultáneos del mismo resultado crean exactamente un match/evento y una sola actualización de rachas;
- promoción y descenso concurrentes hacia una misma categoría conservan posiciones únicas y contiguas;
- no-show objetado penaliza posición a ambas sin sumar `monthly_miss_streak`;
- estos casos corren en PostgreSQL 16 dentro de CI, no mediante simulación manual.


## Pareja y rueda bajo concurrencia
- dos aceptaciones independientes en la misma categoría pueden completarse en paralelo y terminan con posiciones únicas/contiguas;
- dos invitaciones concurrentes que comparten un jugador no producen deadlock y solo una puede crear membresía vigente;
- un usuario conserva como máximo una fila en `active_pair_memberships`;
- dos ejecuciones simultáneas de `assignWheel()` no duplican assignments;
- cada pareja aparece como máximo en un assignment abierto;
- assignment nuevo conserva deadline de 30 días;
- con cantidad impar, el bye corresponde a la pareja con menor antigüedad de espera;
- una sola pareja elegible sigue esperando sin deadline, deuda ni strike.


## Programación → resultado PostgreSQL
- propuesta crea ventana de respuesta de 48 h;
- una propuesta nueva no reemplaza la programación oficial anterior hasta doble aceptación;
- Próximos partidos solo publica una programación confirmada;
- primera versión abre exactamente una ventana de confirmación de 15 días;
- la primera versión puede editarse antes de respuesta sin reiniciar esa ventana;
- confirmación rival oficializa exactamente un match y aplica ladder una sola vez;
- dos versiones idénticas confirman automáticamente;
- dos versiones incompatibles llevan el assignment a `disputed`;
- Admin puede seleccionar una versión o cerrar sin resultado;
- resolución Admin notifica a los cuatro jugadores afectados;
- silencio durante 15 días auto-valida la única versión;
- después del deadline deportivo de 30 días no se admite una nueva carga de resultado.


## Vencimientos, extensión, no-show, pausa y disolución PostgreSQL
- una sola pareja propone con margen y el rival no actúa => solo rival penalizado;
- una propone con margen y la otra actúa tarde => ambas penalizadas;
- penalización administrativa no suma derrota deportiva;
- extensión solo puede votarse durante las 48 h posteriores al deadline original;
- doble voto dentro de ventana activa exactamente 15 días desde el deadline original;
- vencimiento de extensión penaliza posición/deuda a ambas sin sumar `monthly_miss_streak` ni derrota;
- no-show sin objeción penaliza solo a la reportada y puede disparar auto-pausa al segundo strike atribuible;
- pausa voluntaria conserva strike previo y recalcula el orden estructural de la categoría;
- `pause_after_current` mantiene la pareja activa hasta cerrar el resultado y recién entonces pausa;
- disolución vencida con assignment sin jugar aplica forfeit deportivo antes de archivar;
- disolución con versión de resultado cargada espera que el resultado se resuelva antes de archivar.


## Hardening lateral y gates de release
- tres reportantes distintos en 180 días => pareja `observed`;
- cinco reportantes distintos => pareja `review`;
- violencia o amenazas => revisión inmediata;
- revisión disciplinaria iniciada durante un assignment sin resultado lo cierra neutralmente, sin match ni sanción deportiva;
- pausa global del reloj desplaza deadlines vivos de assignment, extensión, confirmación, propuesta, no-show, invitación y disolución por la duración exacta de la pausa;
- pausar/reanudar el reloj deja auditoría administrativa;
- notificaciones y outbox WhatsApp respetan `dedupe_key`;
- TOTP válido es aceptado y código incorrecto rechazado;
- `verify.sql` permite pending sin fotos únicamente durante un reenvío solicitado;
- `npm run verify:db` reconstruye el esquema de prueba y exige cero inconsistencias.


## Recorrido de usuario visible — 2026-09-22
- todos los endpoints funcionales ordinarios del backend tienen al menos un flujo/llamada visible desde frontend; se excluyen solo `/api/live` y `/api/health` por ser operativos;
- no existe desafío manual: una pareja formada entra a la rueda y el rival se asigna automáticamente;
- una pareja propone fecha + lugar escrito libremente sin requerir ninguna fila en `venues`;
- la otra pareja ve y acepta la propuesta; solo entonces fecha/hora/lugar se vuelven oficiales y públicos;
- el texto libre del lugar no crea una cancha comercial;
- una sede solo aparece públicamente en “Canchas adheridas a LA RED” cuando Admin la marca activa + adherida;
- Admin puede crear y editar nombre, dirección, Instagram/web, link de reserva, estado activo, adherida, reservas y orden;
- solicitud de pausa muestra estado de espera y el compañero dispone de CONFIRMAR PAUSA;
- con assignment abierto, la pausa se ofrece como PAUSAR AL TERMINAR;
- solicitud de disolución muestra estado de espera y el compañero dispone de CONFIRMAR DISOLUCIÓN;
- reactivación solo aparece para pareja pausada;
- CAUSA EXTERNA solo aparece dentro de las 48 h posteriores al vencimiento original y deja de ofrecer doble voto;
- REPORTAR NO-SHOW solo aparece después de la fecha/hora oficial;
- la pareja reportada puede OBJETAR NO-SHOW desde la misma pantalla;
- resultado cargado por el rival ofrece CONFIRMAR RESULTADO CARGADO;
- resultado propio aún sin respuesta se precarga y ofrece GUARDAR CORRECCIÓN;
- versiones incompatibles muestran estado de disputa y no un formulario engañoso;
- lesión/abandono exige ganador, abandonante y fecha, sin sets;
- partidos cerrados de los últimos 15 días aparecen en Mi liga para reportes disciplinarios posteriores;
- la regresión `frontend-user-journey.test.js` impide que un endpoint funcional ordinario quede sin superficie frontend.
