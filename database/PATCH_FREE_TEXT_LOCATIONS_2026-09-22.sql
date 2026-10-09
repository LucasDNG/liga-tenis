BEGIN;

ALTER TABLE wheel_assignments
ADD COLUMN IF NOT EXISTS location_text varchar(160);

UPDATE wheel_assignments wa
SET location_text=trim(v.name)
FROM venues v
WHERE wa.venue_id=v.id
  AND wa.location_text IS NULL;

ALTER TABLE wheel_schedule_proposals
ADD COLUMN IF NOT EXISTS location_text varchar(160);

UPDATE wheel_schedule_proposals wsp
SET location_text=trim(v.name)
FROM venues v
WHERE wsp.venue_id=v.id
  AND wsp.location_text IS NULL;

UPDATE wheel_schedule_proposals
SET location_text='Lugar informado previamente'
WHERE location_text IS NULL;

ALTER TABLE wheel_schedule_proposals
ALTER COLUMN venue_id DROP NOT NULL;

ALTER TABLE wheel_schedule_proposals
ALTER COLUMN location_text SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='wheel_schedule_proposals_location_text_check'
      AND conrelid='wheel_schedule_proposals'::regclass
  ) THEN
    ALTER TABLE wheel_schedule_proposals
    ADD CONSTRAINT wheel_schedule_proposals_location_text_check
    CHECK(length(trim(location_text)) BETWEEN 2 AND 160);
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
    WHERE conname='wheel_assignments_confirmed_location_check'
      AND conrelid='wheel_assignments'::regclass
  ) THEN
    ALTER TABLE wheel_assignments
    ADD CONSTRAINT wheel_assignments_confirmed_location_check
    CHECK(schedule_confirmed_at IS NULL OR (location_text IS NOT NULL AND length(trim(location_text)) BETWEEN 2 AND 160));
  END IF;
END $$;

COMMIT;
