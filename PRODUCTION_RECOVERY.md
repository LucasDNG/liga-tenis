# PRODUCTION_RECOVERY.md — LA RED Tenis

## Objetivo
Cerrar el gate de recuperación de la Neon final con evidencia real, no por suposición.

## Qué hay que confirmar
Antes del lanzamiento registrar:
- plan actual de Neon;
- ventana efectiva de Instant Restore;
- RPO aceptado;
- RTO objetivo;
- fecha de una prueba de recuperación exitosa.

La capacidad exacta debe comprobarse en la Neon final. La documentación pública de Neon puede cambiar y no sustituye esa verificación.

## Referencia de planes publicada por Neon
La información pública vigente al preparar este documento describe, de forma orientativa:
- Free: Instant Restore de hasta 6 horas o 1 GB de cambios, lo que ocurra primero;
- Launch: posibilidad de configurar hasta 7 días;
- Scale: hasta 30 días.

Verificar siempre el valor real visible en la consola antes del release.

## Drill seguro
La prueba de recuperación debe hacerse sobre una restauración o branch aislada, sin cambiar la conexión productiva.

Comprobar en esa recuperación:
- `app_settings.engine = wheel-v3`;
- tablas críticas presentes;
- columna `matches.abandoned_pair_id`;
- constraint `matches_abandonment_consistency`;
- una muestra de usuarios, parejas y canchas;
- consultas básicas sin errores.

Registrar el timestamp recuperado y el tiempo necesario para dejar los datos utilizables.

## Retención más larga
Si el negocio necesita conservar una copia más antigua que la ventana de Instant Restore, definir además una política de backup lógico externo y cifrado. La frecuencia debe surgir del RPO requerido, no de una constante arbitraria en el código.

## Criterio de release
Marcar recuperación/backup como verde solamente cuando:
- el plan y restore window reales estén confirmados;
- RPO/RTO estén definidos;
- exista una prueba de recuperación aislada exitosa;
- si hace falta más retención, exista una política de backup externo.


## Estado 2026-09-30

- producción actual: Wheel v3;
- ventana histórica observada en Neon: 8 horas;
- el drill debe restaurar a un branch/base aislada y comprobar Wheel v3, no Wheel v2;
- no cambiar `DATABASE_URL` productivo para la prueba;
- todavía faltan acordar RPO/RTO y registrar una prueba aislada útil.
