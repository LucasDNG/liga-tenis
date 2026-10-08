ALTER TABLE users
ADD COLUMN identity_resubmit_reason text;

ALTER TABLE users
ADD COLUMN identity_resubmit_requested_at timestamptz;
