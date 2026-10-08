BEGIN;

CREATE TABLE IF NOT EXISTS league_wheel_state(
  league_id bigint PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  formation_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO league_wheel_state(league_id)
SELECT id FROM leagues
ON CONFLICT(league_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pair_wheel_state(
  pair_id bigint PRIMARY KEY REFERENCES pairs(id) ON DELETE CASCADE,
  role varchar(8) CHECK(role IN('attack','defense')),
  role_streak int NOT NULL DEFAULT 0 CHECK(role_streak>=0),
  defense_required_until_real boolean NOT NULL DEFAULT false,
  real_waiting_since timestamptz,
  promotion_wins int NOT NULL DEFAULT 0 CHECK(promotion_wins>=0),
  awaiting_zone_first_match boolean NOT NULL DEFAULT false,
  awaiting_zone_kind varchar(10) CHECK(awaiting_zone_kind IN('promotion','relegation')),
  inactive_since timestamptz,
  return_position_base int CHECK(return_position_base>0),
  inactive_reason varchar(20) CHECK(inactive_reason IN('voluntary','three_failures')),
  auto_reactivate_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((role IS NULL AND role_streak=0) OR (role IS NOT NULL AND role_streak>=1)),
  CHECK(auto_reactivate_at IS NULL OR inactive_since IS NOT NULL),
  CHECK(inactive_since IS NOT NULL OR (return_position_base IS NULL AND inactive_reason IS NULL AND auto_reactivate_at IS NULL))
);

ALTER TABLE pair_wheel_state
  ADD COLUMN IF NOT EXISTS defense_required_until_real boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS real_waiting_since timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_zone_kind varchar(10) CHECK(awaiting_zone_kind IN('promotion','relegation'));

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='pair_wheel_zone_enabling_consistency'
      AND conrelid='pair_wheel_state'::regclass
  ) THEN
    ALTER TABLE pair_wheel_state
      ADD CONSTRAINT pair_wheel_zone_enabling_consistency CHECK(
        awaiting_zone_first_match=(awaiting_zone_kind IS NOT NULL)
      );
  END IF;
END $$;

INSERT INTO pair_wheel_state(pair_id,inactive_since,return_position_base,inactive_reason)
SELECT
  p.id,
  CASE
    WHEN p.competition_state='paused' THEN COALESCE((
      SELECT max(COALESCE(pr.resolved_at,pr.created_at))
      FROM pair_pause_requests pr
      WHERE pr.pair_id=p.id AND pr.status IN('confirmed','applied')
    ),CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  CASE WHEN p.competition_state='paused' THEN p.position ELSE NULL END,
  CASE WHEN p.competition_state='paused' THEN 'voluntary' ELSE NULL END
FROM pairs p
ON CONFLICT(pair_id) DO NOTHING;

UPDATE pair_wheel_state pws
SET real_waiting_since=COALESCE((
  SELECT max(m.played_at)
  FROM matches m
  WHERE (m.pair_a_id=pws.pair_id OR m.pair_b_id=pws.pair_id)
    AND m.result_type IN('normal','injury_abandonment')
),p.created_at)
FROM pairs p
WHERE p.id=pws.pair_id
  AND p.competition_state='active'
  AND pws.real_waiting_since IS NULL;

CREATE TABLE IF NOT EXISTS pair_duo_state(
  id bigserial PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_low_id bigint NOT NULL REFERENCES users(id),
  member_high_id bigint NOT NULL REFERENCES users(id),
  failure_streak int NOT NULL DEFAULT 0 CHECK(failure_streak>=0),
  penalty_until timestamptz,
  pending_relegation_category_id bigint,
  pending_relegation_losses int NOT NULL DEFAULT 0 CHECK(pending_relegation_losses>=0),
  relegation_route_step int NOT NULL DEFAULT 0 CHECK(relegation_route_step>=0),
  pending_relegation_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(member_low_id<member_high_id),
  CHECK(
    (pending_relegation_category_id IS NULL AND pending_relegation_losses=0 AND relegation_route_step=0 AND pending_relegation_started_at IS NULL)
    OR
    (pending_relegation_category_id IS NOT NULL AND pending_relegation_started_at IS NOT NULL)
  ),
  UNIQUE(league_id,member_low_id,member_high_id),
  FOREIGN KEY(pending_relegation_category_id,league_id) REFERENCES categories(id,league_id)
);

ALTER TABLE pair_duo_state
  ADD COLUMN IF NOT EXISTS relegation_route_step int NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='pair_duo_relegation_empty_consistency'
      AND conrelid='pair_duo_state'::regclass
  ) THEN
    ALTER TABLE pair_duo_state
      ADD CONSTRAINT pair_duo_relegation_empty_consistency CHECK(
        pending_relegation_category_id IS NOT NULL OR relegation_route_step=0
      );
  END IF;
END $$;

INSERT INTO pair_duo_state(league_id,member_low_id,member_high_id)
SELECT p.league_id,min(pm.user_id),max(pm.user_id)
FROM pairs p
JOIN pair_members pm ON pm.pair_id=p.id
GROUP BY p.id,p.league_id
HAVING count(*)=2
ON CONFLICT(league_id,member_low_id,member_high_id) DO NOTHING;

CREATE OR REPLACE FUNCTION ensure_pair_wheel_v3_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pair_wheel_state(pair_id,real_waiting_since) VALUES(NEW.id,CURRENT_TIMESTAMP)
  ON CONFLICT(pair_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pair_wheel_v3_state ON pairs;
CREATE TRIGGER trg_pair_wheel_v3_state
AFTER INSERT ON pairs
FOR EACH ROW EXECUTE FUNCTION ensure_pair_wheel_v3_state();

CREATE OR REPLACE FUNCTION ensure_pair_duo_v3_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_league_id bigint;
  v_low bigint;
  v_high bigint;
  v_count int;
BEGIN
  SELECT p.league_id,count(pm.user_id),min(pm.user_id),max(pm.user_id)
  INTO v_league_id,v_count,v_low,v_high
  FROM pairs p
  JOIN pair_members pm ON pm.pair_id=p.id
  WHERE p.id=NEW.pair_id
  GROUP BY p.league_id;
  IF v_count=2 THEN
    INSERT INTO pair_duo_state(league_id,member_low_id,member_high_id)
    VALUES(v_league_id,v_low,v_high)
    ON CONFLICT(league_id,member_low_id,member_high_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pair_duo_v3_state ON pair_members;
CREATE TRIGGER trg_pair_duo_v3_state
AFTER INSERT ON pair_members
FOR EACH ROW EXECUTE FUNCTION ensure_pair_duo_v3_state();

CREATE OR REPLACE FUNCTION sync_pair_v3_reactivation_wait() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.competition_state IN('paused','inactive') AND NEW.competition_state='active' THEN
    UPDATE pair_wheel_state SET real_waiting_since=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE pair_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pair_v3_reactivation_wait ON pairs;
CREATE TRIGGER trg_pair_v3_reactivation_wait
AFTER UPDATE OF competition_state ON pairs
FOR EACH ROW EXECUTE FUNCTION sync_pair_v3_reactivation_wait();

CREATE OR REPLACE FUNCTION sync_pair_v3_real_match_wait() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.result_type IN('normal','injury_abandonment') THEN
    UPDATE pair_wheel_state
    SET real_waiting_since=GREATEST(COALESCE(real_waiting_since,NEW.played_at),NEW.played_at),updated_at=CURRENT_TIMESTAMP
    WHERE pair_id IN(NEW.pair_a_id,NEW.pair_b_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pair_v3_real_match_wait ON matches;
CREATE TRIGGER trg_pair_v3_real_match_wait
AFTER INSERT ON matches
FOR EACH ROW EXECUTE FUNCTION sync_pair_v3_real_match_wait();

ALTER TABLE wheel_assignments
  ADD COLUMN IF NOT EXISTS attacker_pair_id bigint REFERENCES pairs(id),
  ADD COLUMN IF NOT EXISTS defender_pair_id bigint REFERENCES pairs(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_result_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_place_reign_id bigint;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='wheel_assignments_v3_roles_consistency'
      AND conrelid='wheel_assignments'::regclass
  ) THEN
    ALTER TABLE wheel_assignments
      ADD CONSTRAINT wheel_assignments_v3_roles_consistency CHECK(
        (attacker_pair_id IS NULL AND defender_pair_id IS NULL)
        OR (
          attacker_pair_id IS NOT NULL
          AND defender_pair_id IS NOT NULL
          AND attacker_pair_id<>defender_pair_id
          AND attacker_pair_id IN(pair_a_id,pair_b_id)
          AND defender_pair_id IN(pair_a_id,pair_b_id)
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_v3_roles
  ON wheel_assignments(category_id,attacker_pair_id,defender_pair_id)
  WHERE status IN('open','result_pending','disputed');

CREATE TABLE IF NOT EXISTS first_place_reigns(
  id bigserial PRIMARY KEY,
  league_id bigint NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pair_id bigint NOT NULL REFERENCES pairs(id),
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at timestamptz,
  defenses int NOT NULL DEFAULT 0 CHECK(defenses>=0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ended_at IS NULL OR ended_at>=started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_first_place_open_reign
  ON first_place_reigns(league_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_first_place_record
  ON first_place_reigns(league_id,defenses DESC,started_at);


DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='wheel_assignments_first_place_reign_fk'
      AND conrelid='wheel_assignments'::regclass
  ) THEN
    ALTER TABLE wheel_assignments
      ADD CONSTRAINT wheel_assignments_first_place_reign_fk
      FOREIGN KEY(first_place_reign_id) REFERENCES first_place_reigns(id);
  END IF;
END $$;


ALTER TABLE wheel_result_versions DROP CONSTRAINT IF EXISTS wheel_result_versions_result_type_check;
ALTER TABLE wheel_result_versions
  ADD CONSTRAINT wheel_result_versions_result_type_check
  CHECK(result_type IN('normal','injury_abandonment','dissolution_forfeit','administrative_forfeit'));

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_result_type_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_result_type_check
  CHECK(result_type IN('normal','injury_abandonment','dissolution_forfeit','administrative_forfeit'));


ALTER TABLE wheel_no_shows DROP CONSTRAINT IF EXISTS wheel_no_shows_status_check;
ALTER TABLE wheel_no_shows
  ADD CONSTRAINT wheel_no_shows_status_check
  CHECK(status IN('pending','accepted','contested','admin_review','resolved'));


ALTER TABLE wheel_no_shows DROP CONSTRAINT IF EXISTS wheel_no_shows_assignment_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_no_show_live
  ON wheel_no_shows(assignment_id)
  WHERE status IN('pending','contested','admin_review','accepted');

COMMIT;
