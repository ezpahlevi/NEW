INSERT INTO subscriptions (
  id,
  name,
  vendor,
  current_plan,
  current_seats,
  active_seats,
  renewal_price_atomic,
  downgrade_plan,
  downgrade_price_atomic,
  renewal_date,
  vendor_wallet,
  status,
  created_at,
  updated_at
) VALUES (
  'sub_figma_professional',
  'Figma Professional',
  'Figma',
  'professional-8-seat',
  8,
  3,
  '96000000',
  'professional-3-seat',
  '36000000',
  '2026-10-01',
  NULL,
  'ACTIVE',
  '2026-09-28T00:00:00.000Z',
  '2026-09-28T00:00:00.000Z'
)
ON CONFLICT (id) DO NOTHING;
