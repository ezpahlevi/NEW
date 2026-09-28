import {
  RenewalSnapshotSchema,
  canonicalizeJson,
  sha256Hex,
  type RenewalSnapshot
} from "@new/shared";

interface RenewalSnapshotRow {
  id: string;
  subscription_id: string;
  status: string;
  snapshot_json: string | null;
  snapshot_hash: string | null;
}

interface SubscriptionSnapshotRow {
  id: string;
  name: string;
  vendor: string;
  current_plan: string;
  current_seats: number;
  active_seats: number;
  renewal_price_atomic: string;
  downgrade_plan: string;
  downgrade_price_atomic: string;
  downgrade_seats: number;
  renewal_date: string;
  status: string;
}

interface RenewalHistoryRow {
  id: string;
  status: string;
  action: string | null;
  target_plan: string | null;
  target_seats: number | null;
  amount_atomic: string | null;
  created_at: string;
  completed_at: string | null;
}

export type RenewalSnapshotErrorCode =
  | "RENEWAL_NOT_FOUND"
  | "RENEWAL_SUBSCRIPTION_MISMATCH"
  | "SNAPSHOT_STATE_INVALID"
  | "SNAPSHOT_PARTIAL"
  | "SNAPSHOT_CORRUPT"
  | "SNAPSHOT_PERSIST_FAILED";

export class RenewalSnapshotError extends Error {
  readonly code: RenewalSnapshotErrorCode;

  constructor(code: RenewalSnapshotErrorCode) {
    super(code);
    this.name = "RenewalSnapshotError";
    this.code = code;
  }
}

export interface PersistedRenewalSnapshot {
  snapshot: RenewalSnapshot;
  snapshotJson: string;
  snapshotHash: string;
}

function parseStoredSnapshot(
  row: RenewalSnapshotRow
): PersistedRenewalSnapshot | null {
  if (row.snapshot_json === null && row.snapshot_hash === null) {
    return null;
  }
  if (row.snapshot_json === null || row.snapshot_hash === null) {
    throw new RenewalSnapshotError("SNAPSHOT_PARTIAL");
  }

  try {
    const snapshot = RenewalSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    const canonicalJson = canonicalizeJson(snapshot);
    if (
      canonicalJson !== row.snapshot_json ||
      !/^0x[a-f0-9]{64}$/.test(row.snapshot_hash)
    ) {
      throw new RenewalSnapshotError("SNAPSHOT_CORRUPT");
    }

    return {
      snapshot,
      snapshotJson: canonicalJson,
      snapshotHash: row.snapshot_hash
    };
  } catch (error) {
    if (error instanceof RenewalSnapshotError) {
      throw error;
    }
    throw new RenewalSnapshotError("SNAPSHOT_CORRUPT");
  }
}

async function loadRenewal(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<RenewalSnapshotRow> {
  const row = await database
    .prepare(
      `SELECT id, subscription_id, status, snapshot_json, snapshot_hash
       FROM renewals WHERE id = ?`
    )
    .bind(renewalId)
    .first<RenewalSnapshotRow>();

  if (row === null) {
    throw new RenewalSnapshotError("RENEWAL_NOT_FOUND");
  }
  if (row.subscription_id !== subscriptionId) {
    throw new RenewalSnapshotError("RENEWAL_SUBSCRIPTION_MISMATCH");
  }
  return row;
}

async function buildSnapshot(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<RenewalSnapshot> {
  const subscription = await database
    .prepare(
      `SELECT id, name, vendor, current_plan, current_seats, active_seats,
              renewal_price_atomic, downgrade_plan, downgrade_price_atomic,
              downgrade_seats, renewal_date, status
       FROM subscriptions WHERE id = ?`
    )
    .bind(subscriptionId)
    .first<SubscriptionSnapshotRow>();

  if (subscription === null) {
    throw new RenewalSnapshotError("RENEWAL_SUBSCRIPTION_MISMATCH");
  }

  const previousRenewal = await database
    .prepare(
      `SELECT r.id, r.status, d.action, r.target_plan, r.target_seats,
              r.amount_atomic, r.created_at, r.completed_at
       FROM renewals AS r
       LEFT JOIN decisions AS d ON d.renewal_id = r.id
       WHERE r.subscription_id = ? AND r.id <> ?
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 1`
    )
    .bind(subscriptionId, renewalId)
    .first<RenewalHistoryRow>();

  return RenewalSnapshotSchema.parse({
    version: 1,
    subscription: {
      id: subscription.id,
      name: subscription.name,
      vendor: subscription.vendor,
      currentPlan: subscription.current_plan,
      currentSeats: subscription.current_seats,
      activeSeats: subscription.active_seats,
      renewalPriceAtomic: subscription.renewal_price_atomic,
      downgradePlan: subscription.downgrade_plan,
      downgradePriceAtomic: subscription.downgrade_price_atomic,
      downgradeSeats: subscription.downgrade_seats,
      renewalDate: subscription.renewal_date,
      status: subscription.status
    },
    previousRenewal:
      previousRenewal === null
        ? null
        : {
            id: previousRenewal.id,
            status: previousRenewal.status,
            action: previousRenewal.action,
            targetPlan: previousRenewal.target_plan,
            targetSeats: previousRenewal.target_seats,
            amountAtomic: previousRenewal.amount_atomic,
            createdAt: previousRenewal.created_at,
            completedAt: previousRenewal.completed_at
          },
    usageEvidence: [
      {
        id: `usage:${subscription.id}:seat-count`,
        purchasedSeats: subscription.current_seats,
        activeSeats: subscription.active_seats
      }
    ],
    billingEvidence: [
      {
        id: `billing:${subscription.id}:renewal-prices`,
        renewalPriceAtomic: subscription.renewal_price_atomic,
        downgradePlan: subscription.downgrade_plan,
        downgradeSeats: subscription.downgrade_seats,
        downgradePriceAtomic: subscription.downgrade_price_atomic
      }
    ]
  });
}

async function loadPersistedSnapshot(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<PersistedRenewalSnapshot> {
  const row = await loadRenewal(database, renewalId, subscriptionId);
  const persisted = parseStoredSnapshot(row);
  if (persisted === null) {
    throw new RenewalSnapshotError("SNAPSHOT_PERSIST_FAILED");
  }

  const computedHash = await sha256Hex(persisted.snapshotJson);
  if (computedHash !== persisted.snapshotHash) {
    throw new RenewalSnapshotError("SNAPSHOT_CORRUPT");
  }
  return persisted;
}

export async function getOrCreateRenewalSnapshot(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<PersistedRenewalSnapshot> {
  const renewal = await loadRenewal(database, renewalId, subscriptionId);
  const existing = parseStoredSnapshot(renewal);
  if (existing !== null) {
    const computedHash = await sha256Hex(existing.snapshotJson);
    if (computedHash !== existing.snapshotHash) {
      throw new RenewalSnapshotError("SNAPSHOT_CORRUPT");
    }
    return existing;
  }

  if (renewal.status !== "CREATED" && renewal.status !== "ANALYZING") {
    throw new RenewalSnapshotError("SNAPSHOT_STATE_INVALID");
  }

  const snapshot = await buildSnapshot(database, renewalId, subscriptionId);
  const snapshotJson = canonicalizeJson(snapshot);
  const snapshotHash = await sha256Hex(snapshotJson);
  const result = await database
    .prepare(
      `UPDATE renewals SET snapshot_json = ?, snapshot_hash = ?
       WHERE id = ? AND subscription_id = ?
         AND snapshot_json IS NULL AND snapshot_hash IS NULL`
    )
    .bind(snapshotJson, snapshotHash, renewalId, subscriptionId)
    .run();

  if (result.meta.changes !== 1) {
    return loadPersistedSnapshot(database, renewalId, subscriptionId);
  }

  return { snapshot, snapshotJson, snapshotHash };
}
