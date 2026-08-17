-- Migración para una base existente.
-- Agrega Liga Masculina / Liga Femenina sin borrar datos.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS gender VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_gender_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_gender_check
    CHECK (gender IN ('male','female'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_city_gender_rating
ON users(city, gender, rating DESC);

-- Los usuarios que ya existían quedan con gender = NULL.
-- Al entrar a "Mi perfil" podrán elegir Liga Masculina o Femenina.
-- Los registros nuevos deben elegir la liga durante el registro.
