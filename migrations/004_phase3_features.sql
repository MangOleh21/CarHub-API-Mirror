ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::TEXT[];

UPDATE cars
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR cardinality(images) = 0);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE submissions
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR cardinality(images) = 0);

UPDATE submissions
SET reviewed_at = created_at
WHERE status IN ('approved', 'rejected') AND reviewed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_email_unique'
  ) THEN
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_email_unique UNIQUE (email);
  END IF;
END $$;
