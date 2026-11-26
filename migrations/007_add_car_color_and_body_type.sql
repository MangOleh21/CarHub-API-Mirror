ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS color VARCHAR(30),
  ADD COLUMN IF NOT EXISTS body_type VARCHAR(30);

ALTER TABLE cars
  DROP CONSTRAINT IF EXISTS cars_color_check,
  ADD CONSTRAINT cars_color_check
    CHECK (color IS NULL OR color IN (
      'Putih', 'Hitam', 'Silver', 'Abu-abu', 'Merah',
      'Biru', 'Cokelat', 'Hijau', 'Kuning', 'Oranye', 'Lainnya'
    ));

ALTER TABLE cars
  DROP CONSTRAINT IF EXISTS cars_body_type_check,
  ADD CONSTRAINT cars_body_type_check
    CHECK (body_type IS NULL OR body_type IN (
      'SUV', 'MPV', 'Hatchback', 'Sedan', 'LCGC',
      'Pickup', 'Van', 'Truck', 'Bus'
    ));

CREATE INDEX IF NOT EXISTS cars_body_type_idx ON cars (body_type);
CREATE INDEX IF NOT EXISTS cars_color_idx ON cars (color);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS color VARCHAR(30),
  ADD COLUMN IF NOT EXISTS body_type VARCHAR(30);

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_color_check,
  ADD CONSTRAINT submissions_color_check
    CHECK (color IS NULL OR color IN (
      'Putih', 'Hitam', 'Silver', 'Abu-abu', 'Merah',
      'Biru', 'Cokelat', 'Hijau', 'Kuning', 'Oranye', 'Lainnya'
    ));

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_body_type_check,
  ADD CONSTRAINT submissions_body_type_check
    CHECK (body_type IS NULL OR body_type IN (
      'SUV', 'MPV', 'Hatchback', 'Sedan', 'LCGC',
      'Pickup', 'Van', 'Truck', 'Bus'
    ));
