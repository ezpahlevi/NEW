import { SubscriptionSchema, type Subscription } from "@new/shared";

interface SubscriptionRow {
  id: string;
  name: string;
  vendor: string;
  current_plan: string;
  current_seats: number;
  active_seats: number;
  renewal_price_atomic: string;
  downgrade_plan: string;
  downgrade_price_atomic: string;
  renewal_date: string;
  vendor_wallet: string | null;
  status: string;
}

const subscriptionColumns = `
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
  status
`;

function toSubscription(row: SubscriptionRow): Subscription {
  return SubscriptionSchema.parse({
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    currentPlan: row.current_plan,
    currentSeats: row.current_seats,
    activeSeats: row.active_seats,
    renewalPriceAtomic: row.renewal_price_atomic,
    downgradePlan: row.downgrade_plan,
    downgradePriceAtomic: row.downgrade_price_atomic,
    renewalDate: row.renewal_date,
    vendorWallet: row.vendor_wallet,
    status: row.status
  });
}

export async function listSubscriptions(
  database: D1Database
): Promise<Subscription[]> {
  const result = await database
    .prepare(`SELECT ${subscriptionColumns} FROM subscriptions ORDER BY name, id`)
    .all<SubscriptionRow>();

  return result.results.map(toSubscription);
}

export async function getSubscriptionById(
  database: D1Database,
  id: string
): Promise<Subscription | null> {
  const row = await database
    .prepare(`SELECT ${subscriptionColumns} FROM subscriptions WHERE id = ?`)
    .bind(id)
    .first<SubscriptionRow>();

  return row === null ? null : toSubscription(row);
}
