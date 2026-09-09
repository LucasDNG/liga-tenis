BEGIN;

ALTER TABLE elo_events
ADD COLUMN IF NOT EXISTS competition_id BIGINT;


UPDATE elo_events ee

SET competition_id =
  m.competition_id

FROM matches m

WHERE
  ee.match_id = m.id
  AND ee.competition_id IS NULL
  AND m.competition_id IS NOT NULL;


UPDATE elo_events ee

SET competition_id =
  c.competition_id

FROM challenges c

WHERE
  ee.challenge_id = c.id
  AND ee.competition_id IS NULL
  AND c.competition_id IS NOT NULL;


/*
  Compatibilidad histórica.

  Los eventos antiguos que solamente conocen al usuario
  pertenecían al sistema singles original.

  Se resuelve la competición singles por:
  - género del jugador;
  - ciudad del jugador.

  No se asigna jamás una competición de dobles a un
  evento histórico global.
*/

UPDATE elo_events ee

SET competition_id =
  c.id

FROM users u

JOIN competitions c
  ON c.format = 'singles'
  AND c.gender = u.gender
  AND c.city = u.city

WHERE
  ee.user_id = u.id
  AND ee.competition_id IS NULL;


/*
  La migración debe abortar antes de imponer NOT NULL
  si quedó algún evento imposible de asociar.
*/

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
      'No se puede completar migration_017: % elo_events sin competition_id',
      missing_count;
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE
      conname = 'elo_events_competition_fk'
      AND conrelid = 'elo_events'::regclass
  ) THEN
    ALTER TABLE elo_events
    ADD CONSTRAINT elo_events_competition_fk
    FOREIGN KEY (competition_id)
    REFERENCES competitions(id);
  END IF;
END
$$;


ALTER TABLE elo_events
ALTER COLUMN competition_id
SET NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_elo_events_competition_id
ON elo_events (
  competition_id
);


CREATE INDEX IF NOT EXISTS
  idx_elo_events_competition_user
ON elo_events (
  competition_id,
  user_id
);


CREATE INDEX IF NOT EXISTS
  idx_elo_events_competition_created
ON elo_events (
  competition_id,
  created_at DESC
);


COMMIT;