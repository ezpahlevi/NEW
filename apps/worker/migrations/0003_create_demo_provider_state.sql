CREATE TABLE demo_provider_state (
  subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE RESTRICT,
  plan TEXT NOT NULL CHECK (length(trim(plan)) > 0),
  seats INTEGER NOT NULL CHECK (seats >= 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO demo_provider_state (subscription_id, plan, seats, active)
SELECT id, current_plan, current_seats, 1
FROM subscriptions;
