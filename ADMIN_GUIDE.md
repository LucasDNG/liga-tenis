# ADMIN_GUIDE.md — Administración de LA RED

## Acceso privado

El login administrativo no aparece en el login de jugadores ni en la navegación pública. La entrada reservada es:

`/admin-la-red`

La ruta no sustituye la seguridad real: el backend exige rol `admin`, contraseña y, cuando `ADMIN_TOTP_SECRET` está configurado, TOTP. Una cuenta admin no puede iniciar sesión por `/api/auth/login`; debe usar `/api/auth/admin-login`.

## Primer administrador

La cuenta de propietario se crea como una cuenta normal de LA RED y se eleva una única vez desde consola:

```bash
npm run admin:promote -- <DNI>
```

El comando:
- cambia `role` a `admin`;
- deja la identidad `verified`;
- elimina cualquier frente/dorso temporal que hubiera quedado pendiente;
- registra un evento de seguridad;
- no imprime contraseñas.

Después hay que cerrar sesión y volver a ingresar para que el cliente reciba el rol actualizado.

Para producción se configura `ADMIN_TOTP_SECRET`; con ese secreto activo el login Admin exige el código TOTP además de DNI y contraseña.

## Qué hace Admin

El panel `/admin` muestra:
- identidades pendientes, con frente/dorso;
- búsqueda y corrección auditada de DNI;
- disputas reales de resultados;
- disciplina;
- canchas/lugares;
- salud de la rueda;
- estado de WhatsApp/outbox;
- suspensión/reanudación global de relojes;
- mantenimiento manual excepcional;
- auditoría administrativa.

## Qué NO hace Admin

Admin no:
- elige rivales;
- ordena el ranking;
- modifica manualmente el ranking;
- decide ascensos/descensos ordinarios;
- acepta una invitación de pareja en nombre de un jugador;
- aprueba una pareja deportiva.

La pareja se forma por consentimiento de sus dos integrantes. Admin verifica identidades y actúa únicamente en excepciones humanas.

## Objetivo

El estado normal del panel debe ser:

**Todo funcionando normalmente.**

Si no existen excepciones, administrar LA RED no debe transformarse en un trabajo cotidiano.


### Foto de DNI mal tomada

No se rechaza la cuenta por una foto borrosa/cortada.

En **Identidad pendiente**:
1. usar `PEDIR NUEVAS FOTOS`;
2. escribir un motivo breve;
3. LA RED elimina las imágenes anteriores y avisa al jugador;
4. el jugador reenvía frente + dorso desde **Mi cuenta**;
5. la persona vuelve a aparecer lista para revisión.

`RECHAZAR CUENTA` se reserva para una identidad que no corresponde o una cuenta que no debe habilitarse.


## Estado probado en este checkpoint
Se probó manualmente:
- acceso privado;
- cola de identidad;
- frente/dorso;
- verificación `pending -> verified`;
- purga documental;
- auditoría asociada.

Disputas, disciplina, relojes, canchas y correcciones se recorrerán con datos reales en la etapa de auditoría posterior al push.
