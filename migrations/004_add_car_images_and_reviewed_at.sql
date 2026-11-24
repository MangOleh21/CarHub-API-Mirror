ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE cars
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR cardinality(images) = 0);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE submissions
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(images) = 0;

UPDATE submissions
SET reviewed_at = created_at
WHERE status IN ('approved', 'rejected') AND reviewed_at IS NULL;
