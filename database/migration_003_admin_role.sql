ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20)
NOT NULL DEFAULT 'player';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role IN ('player', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);