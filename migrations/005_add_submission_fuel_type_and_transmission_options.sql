ALTER TABLE cars
  DROP CONSTRAINT IF EXISTS cars_transmission_check;

ALTER TABLE cars
  ADD CONSTRAINT cars_transmission_check
  CHECK (transmission IN ('Manual', 'Automatic', 'CVT', 'DCT', 'AMT'));

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_transmission_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_transmission_check
  CHECK (transmission IN ('Manual', 'Automatic', 'CVT', 'DCT', 'AMT'));

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50);
