-- ============================================================
-- LA RED
-- MIGRATION 013
-- TENIS: SINGLES + DOBLES
-- ============================================================
--
-- Esta migración introduce competiciones independientes:
--
-- - Singles masculino
-- - Singles femenino
-- - Dobles masculino
-- - Dobles femenino
--
-- La aplicación sigue siendo exclusivamente de TENIS.
--
-- Pádel NO forma parte de esta base.
--
-- Compatibilidad:
--
-- - users.rating sigue existiendo temporalmente.
-- - users.matches_played sigue existiendo temporalmente.
-- - matches.player1_id / player2_id siguen existiendo.
--
-- El backend será migrado gradualmente a:
--
-- - competitions
-- - player_competition_stats
-- - match_participants
-- - matches.competition_id
--
-- ============================================================


-- ============================================================
-- COMPETITIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS competitions (
  id BIGSERIAL PRIMARY KEY,

  format VARCHAR(30) NOT NULL,

  gender VARCHAR(30) NOT NULL,

  city VARCHAR(120) NOT NULL,

  name VARCHAR(180) NOT NULL,

  team_size INTEGER NOT NULL,

  placement_matches INTEGER
    NOT NULL
    DEFAULT 5,

  active BOOLEAN
    NOT NULL
    DEFAULT TRUE,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'competitions_format_check'
  ) THEN
    ALTER TABLE competitions
    ADD CONSTRAINT
      competitions_format_check
    CHECK (
      format IN (
        'singles',
        'doubles'
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
    WHERE conname =
      'competitions_gender_check'
  ) THEN
    ALTER TABLE competitions
    ADD CONSTRAINT
      competitions_gender_check
    CHECK (
      gender IN (
        'male',
        'female'
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
    WHERE conname =
      'competitions_team_size_check'
  ) THEN
    ALTER TABLE competitions
    ADD CONSTRAINT
      competitions_team_size_check
    CHECK (
      (
        format = 'singles'
        AND team_size = 1
      )
      OR
      (
        format = 'doubles'
        AND team_size = 2
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
    WHERE conname =
      'competitions_unique'
  ) THEN
    ALTER TABLE competitions
    ADD CONSTRAINT
      competitions_unique
    UNIQUE (
      format,
      gender,
      city
    );
  END IF;
END
$$;


-- ============================================================
-- PLAYER COMPETITION STATS
-- ============================================================

CREATE TABLE IF NOT EXISTS
player_competition_stats (
  id BIGSERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  competition_id BIGINT NOT NULL
    REFERENCES competitions(id)
    ON DELETE CASCADE,

  rating INTEGER
    NOT NULL
    DEFAULT 0,

  matches_played INTEGER
    NOT NULL
    DEFAULT 0,

  wins INTEGER
    NOT NULL
    DEFAULT 0,

  losses INTEGER
    NOT NULL
    DEFAULT 0,

  games_won INTEGER
    NOT NULL
    DEFAULT 0,

  games_lost INTEGER
    NOT NULL
    DEFAULT 0,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_stats_unique'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_stats_unique
    UNIQUE (
      user_id,
      competition_id
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_rating_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_rating_check
    CHECK (
      rating >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_matches_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_matches_check
    CHECK (
      matches_played >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_wins_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_wins_check
    CHECK (
      wins >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_losses_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_losses_check
    CHECK (
      losses >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_games_won_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_games_won_check
    CHECK (
      games_won >= 0
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'player_competition_games_lost_check'
  ) THEN
    ALTER TABLE
      player_competition_stats
    ADD CONSTRAINT
      player_competition_games_lost_check
    CHECK (
      games_lost >= 0
    );
  END IF;
END
$$;


CREATE INDEX IF NOT EXISTS
  idx_player_competition_stats_competition
ON player_competition_stats (
  competition_id,
  rating DESC
);


CREATE INDEX IF NOT EXISTS
  idx_player_competition_stats_user
ON player_competition_stats (
  user_id
);


-- ============================================================
-- MATCH COMPETITION
-- ============================================================

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS
  competition_id BIGINT;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'matches_competition_fk'
  ) THEN
    ALTER TABLE matches
    ADD CONSTRAINT
      matches_competition_fk
    FOREIGN KEY (
      competition_id
    )
    REFERENCES competitions(id);
  END IF;
END
$$;


CREATE INDEX IF NOT EXISTS
  idx_matches_competition
ON matches (
  competition_id
);


-- ============================================================
-- MATCH PARTICIPANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS
match_participants (
  id BIGSERIAL PRIMARY KEY,

  match_id BIGINT NOT NULL
    REFERENCES matches(id)
    ON DELETE CASCADE,

  user_id INTEGER NOT NULL
    REFERENCES users(id),

  side SMALLINT NOT NULL,

  position SMALLINT NOT NULL,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'match_participants_side_check'
  ) THEN
    ALTER TABLE match_participants
    ADD CONSTRAINT
      match_participants_side_check
    CHECK (
      side IN (
        1,
        2
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
    WHERE conname =
      'match_participants_position_check'
  ) THEN
    ALTER TABLE match_participants
    ADD CONSTRAINT
      match_participants_position_check
    CHECK (
      position IN (
        1,
        2
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
    WHERE conname =
      'match_participants_user_unique'
  ) THEN
    ALTER TABLE match_participants
    ADD CONSTRAINT
      match_participants_user_unique
    UNIQUE (
      match_id,
      user_id
    );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'match_participants_position_unique'
  ) THEN
    ALTER TABLE match_participants
    ADD CONSTRAINT
      match_participants_position_unique
    UNIQUE (
      match_id,
      side,
      position
    );
  END IF;
END
$$;


CREATE INDEX IF NOT EXISTS
  idx_match_participants_match
ON match_participants (
  match_id
);


CREATE INDEX IF NOT EXISTS
  idx_match_participants_user
ON match_participants (
  user_id
);


-- ============================================================
-- CREAR COMPETICIONES SINGLES
-- ============================================================

INSERT INTO competitions (
  format,
  gender,
  city,
  name,
  team_size,
  placement_matches
)

SELECT DISTINCT
  'singles',

  u.gender,

  u.city,

  'Singles · ' ||
    u.gender ||
    ' · ' ||
    u.city,

  1,

  5

FROM users u

WHERE
  u.role =
    'player'

  AND u.verification_status =
    'verified'

  AND u.gender IN (
    'male',
    'female'
  )

ON CONFLICT (
  format,
  gender,
  city
)
DO NOTHING;


-- ============================================================
-- CREAR COMPETICIONES DOBLES
-- ============================================================

INSERT INTO competitions (
  format,
  gender,
  city,
  name,
  team_size,
  placement_matches
)

SELECT DISTINCT
  'doubles',

  u.gender,

  u.city,

  'Dobles · ' ||
    u.gender ||
    ' · ' ||
    u.city,

  2,

  5

FROM users u

WHERE
  u.role =
    'player'

  AND u.verification_status =
    'verified'

  AND u.gender IN (
    'male',
    'female'
  )

ON CONFLICT (
  format,
  gender,
  city
)
DO NOTHING;


-- ============================================================
-- ASIGNAR PARTIDOS EXISTENTES A SINGLES
-- ============================================================

UPDATE matches m

SET competition_id =
  c.id

FROM
  users p1,
  users p2,
  competitions c

WHERE
  p1.id =
    m.player1_id

  AND p2.id =
    m.player2_id

  AND c.format =
    'singles'

  AND c.city =
    p1.city

  AND c.gender =
    p1.gender

  AND p1.city =
    p2.city

  AND p1.gender =
    p2.gender

  AND m.competition_id
    IS NULL;


-- ============================================================
-- MIGRAR PARTICIPANTES EXISTENTES
-- ============================================================

INSERT INTO match_participants (
  match_id,
  user_id,
  side,
  position
)

SELECT
  m.id,
  m.player1_id,
  1,
  1

FROM matches m

WHERE
  m.player1_id
    IS NOT NULL

ON CONFLICT DO NOTHING;


INSERT INTO match_participants (
  match_id,
  user_id,
  side,
  position
)

SELECT
  m.id,
  m.player2_id,
  2,
  1

FROM matches m

WHERE
  m.player2_id
    IS NOT NULL

ON CONFLICT DO NOTHING;


-- ============================================================
-- COPIAR ESTADO ACTUAL A SINGLES
-- ============================================================

INSERT INTO player_competition_stats (
  user_id,
  competition_id,
  rating,
  matches_played
)

SELECT
  u.id,

  c.id,

  COALESCE(
    u.rating,
    0
  ),

  COALESCE(
    u.matches_played,
    0
  )

FROM users u

JOIN competitions c
  ON c.format =
       'singles'

  AND c.gender =
       u.gender

  AND c.city =
       u.city

WHERE
  u.role =
    'player'

ON CONFLICT (
  user_id,
  competition_id
)

DO UPDATE SET
  rating =
    EXCLUDED.rating,

  matches_played =
    EXCLUDED.matches_played,

  updated_at =
    CURRENT_TIMESTAMP;


-- ============================================================
-- NOTA
-- ============================================================
--
-- wins
-- losses
-- games_won
-- games_lost
--
-- NO se reconstruyen aquí.
--
-- Se reconstruirán desde partidos completados válidos
-- usando el motor deportivo del backend.
--
-- Tampoco se eliminan todavía:
--
-- users.rating
-- users.matches_played
-- matches.player1_id
-- matches.player2_id
--
-- porque funcionan como capa de compatibilidad durante
-- la migración progresiva del backend.
-- ============================================================