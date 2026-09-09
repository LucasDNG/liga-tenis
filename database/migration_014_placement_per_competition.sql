-- ============================================================
-- LA RED
-- MIGRATION 014
-- NIVELATORIOS POR COMPETICIÓN
-- ============================================================
--
-- Objetivo:
--
-- - Cada jugador tiene sus 5 nivelatorios por competición.
-- - Singles y dobles no comparten progreso.
-- - La evidencia histórica queda asociada a la competición
--   del partido original.
--
-- IMPORTANTE:
-- Esta migración corresponde a cambios ya aplicados
-- manualmente en producción.
-- No volver a ejecutar completa en Neon sin revisar estado.
-- ============================================================


-- ============================================================
-- 1. COLUMNA competition_id
-- ============================================================

ALTER TABLE placement_match_evidence
ADD COLUMN IF NOT EXISTS competition_id BIGINT;


-- ============================================================
-- 2. MIGRAR EVIDENCIA HISTÓRICA
-- ============================================================

UPDATE placement_match_evidence pme
SET competition_id = m.competition_id
FROM matches m
WHERE
  m.id = pme.match_id
  AND pme.competition_id IS NULL;


-- ============================================================
-- 3. FOREIGN KEY
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'placement_match_evidence_competition_fk'
  ) THEN
    ALTER TABLE placement_match_evidence
    ADD CONSTRAINT placement_match_evidence_competition_fk
    FOREIGN KEY (competition_id)
    REFERENCES competitions(id);
  END IF;
END
$$;


-- ============================================================
-- 4. competition_id OBLIGATORIO
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM placement_match_evidence
    WHERE competition_id IS NULL
  ) THEN
    ALTER TABLE placement_match_evidence
    ALTER COLUMN competition_id SET NOT NULL;
  END IF;
END
$$;


-- ============================================================
-- 5. ELIMINAR UNICIDAD GLOBAL ANTERIOR
-- ============================================================
--
-- Antes:
--
--   jugador + número nivelatorio
--
-- Eso impedía:
--
--   Singles -> nivelatorio 1
--   Dobles  -> nivelatorio 1
--
-- para el mismo jugador.
-- ============================================================

ALTER TABLE placement_match_evidence
DROP CONSTRAINT IF EXISTS
  placement_match_evidence_user_number_unique;


-- ============================================================
-- 6. NUEVA UNICIDAD POR COMPETICIÓN
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'placement_match_evidence_user_competition_number_unique'
  ) THEN
    ALTER TABLE placement_match_evidence
    ADD CONSTRAINT
      placement_match_evidence_user_competition_number_unique
    UNIQUE (
      user_id,
      competition_id,
      placement_match_number
    );
  END IF;
END
$$;


-- ============================================================
-- 7. ÍNDICE DE CONSULTA
-- ============================================================

CREATE INDEX IF NOT EXISTS
  idx_placement_evidence_user_competition
ON placement_match_evidence (
  user_id,
  competition_id,
  placement_match_number
);


-- ============================================================
-- 8. VERIFICACIONES
-- ============================================================

SELECT
  COUNT(*) AS total_evidencias,
  COUNT(competition_id) AS con_competicion,
  COUNT(*) - COUNT(competition_id) AS sin_competicion
FROM placement_match_evidence;


SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE
  conrelid =
    'public.placement_match_evidence'::regclass
ORDER BY conname;


SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE
  schemaname = 'public'
  AND tablename = 'placement_match_evidence'
ORDER BY indexname;