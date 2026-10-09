BEGIN;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS abandoned_pair_id bigint REFERENCES pairs(id);

UPDATE matches m
SET abandoned_pair_id=(
  SELECT wrv.abandoned_pair_id
  FROM wheel_result_versions wrv
  WHERE wrv.assignment_id=m.assignment_id
    AND wrv.result_type='injury_abandonment'
    AND wrv.winner_pair_id=m.winner_pair_id
    AND wrv.abandoned_pair_id IS NOT NULL
  ORDER BY wrv.id
  LIMIT 1
)
WHERE m.result_type='injury_abandonment'
  AND m.abandoned_pair_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM pg_constraint
    WHERE conname='matches_abandonment_consistency'
      AND conrelid='matches'::regclass
  ) THEN
    ALTER TABLE matches
    ADD CONSTRAINT matches_abandonment_consistency CHECK(
      (result_type='injury_abandonment'
        AND abandoned_pair_id IS NOT NULL
        AND abandoned_pair_id IN(pair_a_id,pair_b_id)
        AND abandoned_pair_id<>winner_pair_id)
      OR
      (result_type<>'injury_abandonment' AND abandoned_pair_id IS NULL)
    );
  END IF;
END $$;

COMMIT;
