ALTER TABLE subscriptions ADD COLUMN downgrade_seats INTEGER CHECK (
  downgrade_seats IS NULL OR downgrade_seats > 0
);

UPDATE subscriptions
SET downgrade_seats = 3
WHERE id = 'sub_figma_professional';
