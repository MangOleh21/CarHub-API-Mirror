ALTER TABLE submissions
  ADD COLUMN reviewed_by_email VARCHAR(254),
  ADD COLUMN review_note TEXT;
