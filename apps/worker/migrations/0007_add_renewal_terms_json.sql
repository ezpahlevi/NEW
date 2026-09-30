ALTER TABLE renewals ADD COLUMN terms_json TEXT CHECK (
  terms_json IS NULL OR (
    length(terms_json) > 0
    AND json_valid(terms_json)
  )
);
