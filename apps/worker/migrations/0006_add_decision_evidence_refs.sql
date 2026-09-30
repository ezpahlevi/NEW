ALTER TABLE decisions
ADD COLUMN supporting_evidence_refs_json TEXT NOT NULL DEFAULT '[]'
CHECK (
  json_valid(supporting_evidence_refs_json)
  AND json_type(supporting_evidence_refs_json) = 'array'
);
