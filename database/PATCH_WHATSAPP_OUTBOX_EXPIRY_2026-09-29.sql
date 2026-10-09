BEGIN;

ALTER TABLE notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_status_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK(status IN('pending','sent','failed','expired'));

UPDATE notification_outbox o
SET status='expired',
    last_error='obsolete_before_delivery'
WHERE o.channel='whatsapp'
  AND o.status IN('pending','failed')
  AND (
    (
      o.type='password_recovery'
      AND NOT EXISTS (
        SELECT 1
        FROM password_recovery_codes c
        WHERE c.id=CASE
          WHEN o.payload->>'recoveryId' ~ '^[0-9]+$'
          THEN (o.payload->>'recoveryId')::bigint
          ELSE NULL
        END
          AND c.used_at IS NULL
          AND c.expires_at>CURRENT_TIMESTAMP
      )
    )
    OR
    (
      o.type='pair_invitation'
      AND NOT EXISTS (
        SELECT 1
        FROM pair_invitations i
        WHERE i.id=CASE
          WHEN o.payload->>'invitationId' ~ '^[0-9]+$'
          THEN (o.payload->>'invitationId')::bigint
          ELSE NULL
        END
          AND i.status='pending'
          AND i.expires_at>CURRENT_TIMESTAMP
      )
    )
    OR
    (
      o.type='phone_change'
      AND NOT EXISTS (
        SELECT 1
        FROM phone_change_codes c
        WHERE c.id=COALESCE(
          CASE
            WHEN o.payload->>'phoneChangeId' ~ '^[0-9]+$'
            THEN (o.payload->>'phoneChangeId')::bigint
            ELSE NULL
          END,
          CASE
            WHEN o.dedupe_key ~ '^phone-change-code:[0-9]+$'
            THEN split_part(o.dedupe_key,':',2)::bigint
            ELSE NULL
          END
        )
          AND c.used_at IS NULL
          AND c.expires_at>CURRENT_TIMESTAMP
      )
    )
  );

COMMIT;
