BEGIN;


/* =========================================================
   MIGRATION 009
   INFRAESTRUCTURA PARA REPLAY HISTÓRICO DE ELO

   Esta migración NO recalcula Elo.
   NO cambia ratings.
   NO cambia matches_played.
   NO anula partidos.

   Prepara:
   - lotes de replay
   - trazabilidad de eventos recalculados
   - unicidad de match_result ACTIVO
   - índices necesarios para reconstrucción histórica
   ========================================================= */


/* =========================================================
   1. VALIDAR DUPLICADOS ACTIVOS
   ========================================================= */

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT
      match_id,
      user_id
    FROM elo_events
    WHERE
      match_id IS NOT NULL
      AND event_type = 'match_result'
      AND reversed_at IS NULL
    GROUP BY
      match_id,
      user_id
    HAVING COUNT(*) > 1
  ) duplicated;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'migration_009 cancelada: existen % match_result activos duplicados.',
      duplicate_count;
  END IF;
END
$$;


/* =========================================================
   2. LOTES DE REPLAY
   ========================================================= */

CREATE TABLE IF NOT EXISTS elo_replay_batches (
  id BIGSERIAL PRIMARY KEY,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  annulled_match_id INTEGER NOT NULL REFERENCES matches(id),
  city TEXT,
  gender TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  matches_replayed INTEGER NOT NULL DEFAULT 0,
  elo_events_replayed INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);


/* =========================================================
   3. CONSTRAINTS DE LOTES
   ========================================================= */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_replay_batches_status_check'
  ) THEN
    ALTER TABLE elo_replay_batches
    ADD CONSTRAINT elo_replay_batches_status_check
    CHECK (
      status IN (
        'running',
        'completed',
        'failed'
      )
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_replay_batches_matches_replayed_check'
  ) THEN
    ALTER TABLE elo_replay_batches
    ADD CONSTRAINT elo_replay_batches_matches_replayed_check
    CHECK (
      matches_replayed >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_replay_batches_events_replayed_check'
  ) THEN
    ALTER TABLE elo_replay_batches
    ADD CONSTRAINT elo_replay_batches_events_replayed_check
    CHECK (
      elo_events_replayed >= 0
    );
  END IF;
END
$$;


/* =========================================================
   4. TRAZABILIDAD EN ELO_EVENTS
   ========================================================= */

ALTER TABLE elo_events
ADD COLUMN IF NOT EXISTS replay_batch_id BIGINT;


ALTER TABLE elo_events
ADD COLUMN IF NOT EXISTS replayed_from_event_id INTEGER;


/* =========================================================
   5. FOREIGN KEYS
   ========================================================= */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_events_replay_batch_id_fkey'
  ) THEN
    ALTER TABLE elo_events
    ADD CONSTRAINT elo_events_replay_batch_id_fkey
    FOREIGN KEY (replay_batch_id)
    REFERENCES elo_replay_batches(id);
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_events_replayed_from_event_id_fkey'
  ) THEN
    ALTER TABLE elo_events
    ADD CONSTRAINT elo_events_replayed_from_event_id_fkey
    FOREIGN KEY (replayed_from_event_id)
    REFERENCES elo_events(id);
  END IF;
END
$$;


/* =========================================================
   6. MATCH_RESULT ÚNICO SOLAMENTE MIENTRAS ESTÁ ACTIVO

   El índice de migration_008 impedía conservar un evento
   revertido y crear posteriormente su versión recalculada.

   Ahora:
   - pueden existir históricos revertidos
   - solamente puede existir un match_result ACTIVO
     por jugador/partido
   ========================================================= */

DROP INDEX IF EXISTS
idx_elo_events_match_user_result_unique;


CREATE UNIQUE INDEX
idx_elo_events_match_user_result_unique
ON elo_events (
  match_id,
  user_id
)
WHERE
  match_id IS NOT NULL
  AND event_type = 'match_result'
  AND reversed_at IS NULL;


/* =========================================================
   7. EVITAR DUPLICAR LA MISMA FUENTE EN UN LOTE
   ========================================================= */

CREATE UNIQUE INDEX IF NOT EXISTS
idx_elo_events_replay_source_batch_unique
ON elo_events (
  replay_batch_id,
  replayed_from_event_id
)
WHERE
  replay_batch_id IS NOT NULL
  AND replayed_from_event_id IS NOT NULL;


/* =========================================================
   8. ÍNDICES DE LOTES
   ========================================================= */

CREATE INDEX IF NOT EXISTS
idx_elo_replay_batches_annulled_match
ON elo_replay_batches (
  annulled_match_id,
  started_at DESC
);


CREATE INDEX IF NOT EXISTS
idx_elo_replay_batches_status
ON elo_replay_batches (
  status,
  started_at DESC
);


/* =========================================================
   9. ÍNDICES DE EVENTOS DE REPLAY
   ========================================================= */

CREATE INDEX IF NOT EXISTS
idx_elo_events_replay_batch
ON elo_events (
  replay_batch_id,
  created_at,
  id
)
WHERE
  replay_batch_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
idx_elo_events_replayed_from
ON elo_events (
  replayed_from_event_id
)
WHERE
  replayed_from_event_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
idx_elo_events_active_user_created
ON elo_events (
  user_id,
  created_at,
  id
)
WHERE
  reversed_at IS NULL;


/* =========================================================
   10. VALIDACIÓN FINAL
   ========================================================= */

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT
      match_id,
      user_id
    FROM elo_events
    WHERE
      match_id IS NOT NULL
      AND event_type = 'match_result'
      AND reversed_at IS NULL
    GROUP BY
      match_id,
      user_id
    HAVING COUNT(*) > 1
  ) duplicated;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'migration_009 falló: existen % match_result activos duplicados.',
      duplicate_count;
  END IF;
END
$$;


COMMIT;