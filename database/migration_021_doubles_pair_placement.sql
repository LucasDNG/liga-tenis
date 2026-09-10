BEGIN;

ALTER TABLE competition_pairs
ALTER COLUMN rating
SET DEFAULT 0;

UPDATE competition_pairs
SET
  rating = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE
  matches_played = 0;

CREATE TABLE IF NOT EXISTS pair_placement_match_evidence (
  id BIGSERIAL PRIMARY KEY,

  pair_id BIGINT NOT NULL
    REFERENCES competition_pairs(id)
    ON DELETE CASCADE,

  competition_id BIGINT NOT NULL
    REFERENCES competitions(id)
    ON DELETE CASCADE,

  match_id BIGINT NOT NULL
    REFERENCES matches(id)
    ON DELETE CASCADE,

  opponent_pair_id BIGINT NOT NULL
    REFERENCES competition_pairs(id)
    ON DELETE RESTRICT,

  placement_match_number INTEGER NOT NULL,

  won BOOLEAN NOT NULL,

  opponent_percentile_at_match NUMERIC(6, 2),

  opponent_reference_type VARCHAR(20) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pair_placement_match_number_chk
    CHECK (
      placement_match_number > 0
    ),

  CONSTRAINT pair_placement_percentile_chk
    CHECK (
      opponent_percentile_at_match IS NULL
      OR (
        opponent_percentile_at_match >= 0
        AND opponent_percentile_at_match <= 100
      )
    ),

  CONSTRAINT pair_placement_reference_type_chk
    CHECK (
      opponent_reference_type IN (
        'official',
        'provisional',
        'other'
      )
    ),

  CONSTRAINT pair_placement_distinct_opponent_chk
    CHECK (
      pair_id <> opponent_pair_id
    ),

  CONSTRAINT pair_placement_pair_number_uq
    UNIQUE (
      pair_id,
      competition_id,
      placement_match_number
    ),

  CONSTRAINT pair_placement_pair_match_uq
    UNIQUE (
      pair_id,
      match_id
    )
);

CREATE INDEX IF NOT EXISTS pair_placement_evidence_pair_idx
ON pair_placement_match_evidence (
  pair_id,
  competition_id,
  placement_match_number
);

CREATE INDEX IF NOT EXISTS pair_placement_evidence_match_idx
ON pair_placement_match_evidence (
  match_id
);

COMMIT;