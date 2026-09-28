ALTER TABLE renewals ADD COLUMN snapshot_json TEXT CHECK (
  snapshot_json IS NULL OR (
    length(snapshot_json) > 0
    AND json_valid(snapshot_json)
  )
);
