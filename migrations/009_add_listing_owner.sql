ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS submissions_user_created_at_idx
  ON submissions (user_id, created_at DESC);

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cars_user_created_at_idx
  ON cars (user_id, created_at DESC);
