# Liga de Tenis San Pedro v2

Versión completa con dos ligas separadas:

- Liga Masculina
- Liga Femenina

## Cambios principales

- Registro con elección de liga.
- Ranking separado por sexo (`gender=male|female`).
- Un jugador solo puede desafiar rivales de su propia liga.
- El ranking se calcula por Elo dentro de cada liga.
- Los usuarios antiguos que no tengan `gender` pueden elegirlo desde Mi perfil.
- Home dark nueva inspirada en el boceto aprobado.
- Top 10 con selector Masculina / Femenina.
- Responsive para celular.
- Se conservan DNI, teléfono/WhatsApp, desafíos, partidos, resultados y confirmación.

## 1. Base de datos existente

Ejecutar en Neon/DBeaver:

```sql
\i database/migration_006_gender_leagues.sql
```

Si DBeaver no acepta `\i`, abrir el archivo y ejecutar su contenido.

Los usuarios existentes quedan sin liga hasta elegirla desde **Mi perfil**.

## 2. Backend

Copiar `.env.example` a `.env` y completar:

```env
PORT=3000
DATABASE_URL=...
JWT_SECRET=...
FRONTEND_URL=http://localhost:5173
```

Instalar y arrancar:

```bash
npm install
npm run dev
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## 4. Usuarios de prueba

```bash
npm run seed
```

Contraseñas: nombre + `123`.

Ejemplos:
- Marcos: `Marcos123`
- Sofia: `Sofia123`

## Nota sobre DNI

Las imágenes se guardan en `uploads/dni` para desarrollo local.
Para producción conviene usar almacenamiento privado persistente.
