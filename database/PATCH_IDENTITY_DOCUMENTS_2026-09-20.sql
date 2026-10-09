CREATE TABLE identity_documents(
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  front_mime varchar(40) NOT NULL CHECK(front_mime IN('image/jpeg','image/png','image/webp')),
  front_data bytea NOT NULL,
  back_mime varchar(40) NOT NULL CHECK(back_mime IN('image/jpeg','image/png','image/webp')),
  back_data bytea NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
