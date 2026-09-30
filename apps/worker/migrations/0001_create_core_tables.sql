CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  vendor TEXT NOT NULL CHECK (length(trim(vendor)) > 0),
  current_plan TEXT NOT NULL CHECK (length(trim(current_plan)) > 0),
  current_seats INTEGER NOT NULL CHECK (current_seats >= 0),
  active_seats INTEGER NOT NULL CHECK (active_seats >= 0 AND active_seats <= current_seats),
  renewal_price_atomic TEXT NOT NULL CHECK (
    renewal_price_atomic <> ''
    AND renewal_price_atomic NOT GLOB '*[^0-9]*'
    AND (renewal_price_atomic = '0' OR substr(renewal_price_atomic, 1, 1) BETWEEN '1' AND '9')
  ),
  downgrade_plan TEXT NOT NULL CHECK (length(trim(downgrade_plan)) > 0),
  downgrade_price_atomic TEXT NOT NULL CHECK (
    downgrade_price_atomic <> ''
    AND downgrade_price_atomic NOT GLOB '*[^0-9]*'
    AND (downgrade_price_atomic = '0' OR substr(downgrade_price_atomic, 1, 1) BETWEEN '1' AND '9')
  ),
  renewal_date TEXT NOT NULL,
  vendor_wallet TEXT CHECK (
    vendor_wallet IS NULL OR (
      length(vendor_wallet) = 42
      AND substr(vendor_wallet, 1, 2) = '0x'
      AND substr(vendor_wallet, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE renewals (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  workflow_id TEXT,
  snapshot_hash TEXT CHECK (
    snapshot_hash IS NULL OR (
      length(snapshot_hash) = 66
      AND substr(snapshot_hash, 1, 2) = '0x'
      AND substr(snapshot_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  status TEXT NOT NULL CHECK (status IN (
    'CREATED', 'ANALYZING', 'CONTROLLER_DECISION', 'CANCELLED',
    'WAITING_FOR_HUMAN', 'PREPARING_ESCROW', 'ESCROW_OPEN',
    'WAITING_FOR_VENDOR', 'VERIFYING', 'SETTLING', 'SETTLED',
    'REFUNDING', 'REFUNDED'
  )),
  target_plan TEXT,
  target_seats INTEGER CHECK (target_seats IS NULL OR target_seats >= 0),
  amount_atomic TEXT CHECK (
    amount_atomic IS NULL OR (
      amount_atomic <> ''
      AND amount_atomic NOT GLOB '*[^0-9]*'
      AND (amount_atomic = '0' OR substr(amount_atomic, 1, 1) BETWEEN '1' AND '9')
    )
  ),
  decision_hash TEXT CHECK (
    decision_hash IS NULL OR (
      length(decision_hash) = 66
      AND substr(decision_hash, 1, 2) = '0x'
      AND substr(decision_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  terms_hash TEXT CHECK (
    terms_hash IS NULL OR (
      length(terms_hash) = 66
      AND substr(terms_hash, 1, 2) = '0x'
      AND substr(terms_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  renewal_id TEXT NOT NULL REFERENCES renewals(id) ON DELETE RESTRICT,
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  hash TEXT NOT NULL CHECK (
    length(hash) = 66
    AND substr(hash, 1, 2) = '0x'
    AND substr(hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  created_at TEXT NOT NULL
);

CREATE TABLE agent_reports (
  id TEXT PRIMARY KEY,
  renewal_id TEXT NOT NULL REFERENCES renewals(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('OPERATIONS', 'FINANCE', 'AUDITOR')),
  verdict TEXT NOT NULL CHECK (verdict IN ('KEEP', 'DOWNGRADE', 'CANCEL', 'NEEDS_REVIEW')),
  reason_codes_json TEXT NOT NULL CHECK (json_valid(reason_codes_json) AND json_type(reason_codes_json) = 'array'),
  summary TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json) AND json_type(evidence_refs_json) = 'array'),
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (renewal_id, role)
);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  renewal_id TEXT NOT NULL UNIQUE REFERENCES renewals(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('KEEP', 'DOWNGRADE', 'CANCEL', 'NEEDS_REVIEW')),
  rationale TEXT NOT NULL,
  target_plan TEXT,
  target_seats INTEGER CHECK (target_seats IS NULL OR target_seats >= 0),
  amount_atomic TEXT CHECK (
    amount_atomic IS NULL OR (
      amount_atomic <> ''
      AND amount_atomic NOT GLOB '*[^0-9]*'
      AND (amount_atomic = '0' OR substr(amount_atomic, 1, 1) BETWEEN '1' AND '9')
    )
  ),
  created_at TEXT NOT NULL
);

CREATE TABLE escrows (
  renewal_id TEXT PRIMARY KEY REFERENCES renewals(id) ON DELETE RESTRICT,
  contract_address TEXT CHECK (
    contract_address IS NULL OR (
      length(contract_address) = 42
      AND substr(contract_address, 1, 2) = '0x'
      AND substr(contract_address, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  chain_id INTEGER CHECK (chain_id IS NULL OR chain_id > 0),
  open_tx_hash TEXT CHECK (
    open_tx_hash IS NULL OR (
      length(open_tx_hash) = 66
      AND substr(open_tx_hash, 1, 2) = '0x'
      AND substr(open_tx_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  amount_atomic TEXT CHECK (
    amount_atomic IS NULL OR (
      amount_atomic <> ''
      AND amount_atomic NOT GLOB '*[^0-9]*'
      AND (amount_atomic = '0' OR substr(amount_atomic, 1, 1) BETWEEN '1' AND '9')
    )
  ),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'SETTLED', 'REFUNDED')),
  expires_at TEXT
);

CREATE TABLE settlements (
  renewal_id TEXT PRIMARY KEY REFERENCES renewals(id) ON DELETE RESTRICT,
  evidence_hash TEXT CHECK (
    evidence_hash IS NULL OR (
      length(evidence_hash) = 66
      AND substr(evidence_hash, 1, 2) = '0x'
      AND substr(evidence_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  settle_tx_hash TEXT CHECK (
    settle_tx_hash IS NULL OR (
      length(settle_tx_hash) = 66
      AND substr(settle_tx_hash, 1, 2) = '0x'
      AND substr(settle_tx_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  refund_tx_hash TEXT CHECK (
    refund_tx_hash IS NULL OR (
      length(refund_tx_hash) = 66
      AND substr(refund_tx_hash, 1, 2) = '0x'
      AND substr(refund_tx_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
    )
  ),
  settled_at TEXT,
  refunded_at TEXT
);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  renewal_id TEXT REFERENCES renewals(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_subscriptions_renewal_date ON subscriptions(renewal_date);
CREATE INDEX idx_renewals_subscription_created ON renewals(subscription_id, created_at);
CREATE INDEX idx_renewals_status_created ON renewals(status, created_at);
CREATE INDEX idx_evidence_renewal_created ON evidence(renewal_id, created_at);
CREATE INDEX idx_agent_reports_renewal_created ON agent_reports(renewal_id, created_at);
CREATE INDEX idx_activity_log_renewal_created ON activity_log(renewal_id, created_at);
