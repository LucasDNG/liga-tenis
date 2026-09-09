-- ============================================================
-- MIGRATION 015
-- LA RED
-- Desafíos independientes por competición
-- ============================================================
--
-- IMPORTANTE:
-- Esta migración pertenece al historial/versionado del proyecto.
--
-- Si los bloques equivalentes ya fueron ejecutados manualmente
-- en Neon, NO volver a ejecutar este archivo completo.
-- ============================================================


BEGIN;


-- ============================================================
-- 1. AGREGAR competition_id
-- ============================================================

ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS competition_id BIGINT;


-- ============================================================
-- 2. BACKFILL DESDE PARTIDOS YA ASOCIADOS
-- ============================================================

UPDATE challenges ch
SET competition_id = m.competition_id
FROM matches m
WHERE
  m.challenge_id = ch.id
  AND ch.competition_id IS NULL
  AND m.competition_id IS NOT NULL;


-- ============================================================
-- 3. BACKFILL HISTÓRICO DE SINGLES
-- ============================================================

UPDATE challenges ch
SET competition_id = c.id
FROM users u1,
     users u2,
     competitions c
WHERE
  u1.id = ch.challenger_id
  AND u2.id = ch.challenged_id

  AND c.format = 'singles'

  AND c.gender = u1.gender
  AND c.city = u1.city

  AND ch.competition_id IS NULL

  AND u1.gender = u2.gender
  AND u1.city = u2.city;


-- ============================================================
-- 4. VALIDAR QUE NO QUEDE NINGÚN DESAFÍO SIN COMPETICIÓN
-- ============================================================

DO $$
DECLARE
  missing_count BIGINT;
BEGIN
  SELECT
    COUNT(*)
  INTO
    missing_count
  FROM challenges
  WHERE competition_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'No se puede completar migration_015: % desafíos siguen sin competition_id',
      missing_count;
  END IF;
END
$$;


-- ============================================================
-- 5. FOREIGN KEY
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'challenges_competition_fk'
  ) THEN
    ALTER TABLE challenges
    ADD CONSTRAINT challenges_competition_fk
    FOREIGN KEY (competition_id)
    REFERENCES competitions(id);
  END IF;
END
$$;


-- ============================================================
-- 6. NOT NULL
-- ============================================================

ALTER TABLE challenges
ALTER COLUMN competition_id SET NOT NULL;


-- ============================================================
-- 7. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_challenges_competition
ON challenges (
  competition_id
);


CREATE INDEX IF NOT EXISTS
  idx_challenges_competition_status
ON challenges (
  competition_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_challenges_competition_challenger
ON challenges (
  competition_id,
  challenger_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_challenges_competition_challenged
ON challenges (
  competition_id,
  challenged_id,
  status
);


COMMIT;


-- ============================================================
-- VERIFICACIONES
-- ============================================================

SELECT
  COUNT(*) AS total_desafios,
  COUNT(competition_id) AS con_competicion,
  COUNT(*) - COUNT(competition_id) AS sin_competicion
FROM challenges;


SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE
  table_schema = 'public'
  AND table_name = 'challenges'
  AND column_name = 'competition_id';


SELECT
  conname,
  pg_get_constraintdef(oid)
FROM pg_constraint
WHERE
  conrelid =
    'challenges'::regclass
ORDER BY
  conname;