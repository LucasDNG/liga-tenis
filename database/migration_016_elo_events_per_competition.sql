-- ============================================================
-- MIGRATION 016
-- ELO EVENTS POR COMPETICIÓN
-- ============================================================
--
-- LA RED - TENIS
--
-- Objetivo:
--   cada evento Elo pertenece a una competición concreta.
--
-- Esto separa definitivamente:
--   singles masculino
--   singles femenino
--   dobles masculino
--   dobles femenino
--
-- NO agrega pádel.
-- ============================================================


-- ============================================================
-- 1. COLUMNA
-- ============================================================

ALTER TABLE elo_events
ADD COLUMN IF NOT EXISTS competition_id BIGINT;


-- ============================================================
-- 2. BACKFILL DESDE MATCH
-- ============================================================

UPDATE elo_events ee
SET competition_id = m.competition_id
FROM matches m
WHERE
  ee.match_id = m.id
  AND ee.competition_id IS NULL
  AND m.competition_id IS NOT NULL;


-- ============================================================
-- 3. BACKFILL DESDE CHALLENGE
-- ============================================================

UPDATE elo_events ee
SET competition_id = c.competition_id
FROM challenges c
WHERE
  ee.challenge_id = c.id
  AND ee.competition_id IS NULL
  AND c.competition_id IS NOT NULL;


-- ============================================================
-- 4. BACKFILL HISTÓRICO SIN MATCH/CHALLENGE
--
-- Para eventos antiguos ligados solamente al usuario,
-- resolvemos la competición histórica de singles según
-- ciudad + género.
--
-- Esto es válido porque antes de esta migración la app
-- solamente tenía ranking individual de tenis.
-- ============================================================

UPDATE elo_events ee
SET competition_id = c.id
FROM users u,
     competitions c
WHERE
  ee.user_id = u.id
  AND ee.competition_id IS NULL
  AND c.format = 'singles'
  AND c.gender = u.gender
  AND c.city = u.city;


-- ============================================================
-- 5. BLINDAJE
-- ============================================================

DO $$
DECLARE
  missing_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM elo_events
  WHERE competition_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'No se puede completar migration_016: % elo_events siguen sin competition_id',
      missing_count;
  END IF;
END
$$;


-- ============================================================
-- 6. FOREIGN KEY
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_events_competition_fk'
  ) THEN
    ALTER TABLE elo_events
    ADD CONSTRAINT elo_events_competition_fk
    FOREIGN KEY (competition_id)
    REFERENCES competitions(id);
  END IF;
END
$$;


-- ============================================================
-- 7. NOT NULL
-- ============================================================

ALTER TABLE elo_events
ALTER COLUMN competition_id SET NOT NULL;


-- ============================================================
-- 8. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_elo_events_competition
ON elo_events (competition_id);


CREATE INDEX IF NOT EXISTS idx_elo_events_user_competition
ON elo_events (
  user_id,
  competition_id
);


CREATE INDEX IF NOT EXISTS idx_elo_events_competition_created
ON elo_events (
  competition_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS idx_elo_events_user_competition_created
ON elo_events (
  user_id,
  competition_id,
  created_at DESC
);


-- ============================================================
-- 9. VERIFICACIÓN
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE
  table_schema = 'public'
  AND table_name = 'elo_events'
  AND column_name = 'competition_id';


SELECT
  COUNT(*) AS total_eventos,
  COUNT(competition_id) AS con_competicion,
  COUNT(*) - COUNT(competition_id) AS sin_competicion
FROM elo_events;


SELECT
  competition_id,
  event_type,
  COUNT(*) AS total
FROM elo_events
GROUP BY
  competition_id,
  event_type
ORDER BY
  competition_id,
  event_type;