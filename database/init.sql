CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dni VARCHAR(20) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'San Pedro',
  gender VARCHAR(10) CHECK (gender IN ('male','female')),
  rank_position INTEGER NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1500,
  matches_played INTEGER NOT NULL DEFAULT 0,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
  verified_at TIMESTAMP,
  dni_front_path TEXT,
  dni_back_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  challenger_id INTEGER NOT NULL REFERENCES users(id),
  challenged_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER REFERENCES challenges(id),
  player1_id INTEGER NOT NULL REFERENCES users(id),
  player2_id INTEGER NOT NULL REFERENCES users(id),
  winner_id INTEGER REFERENCES users(id),
  score JSONB,
  proposed_winner_id INTEGER REFERENCES users(id),
  proposed_score JSONB,
  result_submitted_by INTEGER REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_city_gender_rating
  ON users(city, gender, rating DESC);

CREATE INDEX IF NOT EXISTS idx_challenges_players
  ON challenges(challenger_id, challenged_id, status);

CREATE INDEX IF NOT EXISTS idx_matches_players
  ON matches(player1_id, player2_id, status);
