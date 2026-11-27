ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'owner'));

ALTER TABLE users
  ALTER COLUMN phone SET DEFAULT '';

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_users'
  ) THEN
    INSERT INTO users (name, email, phone, location, password_hash, role, is_active, created_at)
    SELECT
      COALESCE(NULLIF(split_part(email, '@', 1), ''), 'Administrator'),
      email,
      '',
      NULL,
      password_hash,
      role,
      is_active,
      created_at
    FROM admin_users
    ON CONFLICT (LOWER(email)) DO UPDATE
    SET role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        is_active = EXCLUDED.is_active;
  END IF;
END $$;

DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_users;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS reviewed_by_name VARCHAR(150);
