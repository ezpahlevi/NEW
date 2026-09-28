import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { Miniflare } from "miniflare";
import { canonicalizeJson } from "@new/shared";
import { getSubscriptionById, listSubscriptions } from "../../src/repositories/subscriptions.ts";
import {
  DemoSaaSProvider,
  DemoSaaSProviderError
} from "../../src/providers/demo-saas.ts";
import {
  getOrCreateRenewalSnapshot,
  RenewalSnapshotError
} from "../../src/snapshots/renewal-snapshot.ts";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);
const subscriptionId = "sub_figma_professional";
let miniflare: Miniflare;
let database: D1Database;
let demoSaaSProvider: DemoSaaSProvider;

before(async () => {
  miniflare = new Miniflare({
    workers: [
      {
        config: {
          name: "new-phase-2-test",
          compatibilityDate: "2026-09-28",
          env: { DB: { type: "d1", id: randomUUID() } },
          manifest: {
            mainModule: "index.mjs",
            modules: { "index.mjs": { type: "esm", contents: "export default {};" } }
          }
        }
      }
    ]
  });
  database = await miniflare.getD1Database("DB");
  demoSaaSProvider = new DemoSaaSProvider(database);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(new URL(migrationFile, migrationsDirectory), "utf8");
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
});

after(async () => {
  await miniflare?.dispose();
});

describe("D1 schema and demo seed", () => {
  it("creates the eight canonical tables and persisted demo provider state", async () => {
    const result = await database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB '_cf_*' ORDER BY name"
      )
      .all<{ name: string }>();

    assert.deepEqual(
      result.results.map((row) => row.name),
      [
        "activity_log",
        "agent_reports",
        "decisions",
        "demo_provider_state",
        "escrows",
        "evidence",
        "renewals",
        "settlements",
        "subscriptions"
      ]
    );
  });

  it("reads the deterministic Figma seed through the subscription repository", async () => {
    const subscriptions = await listSubscriptions(database);
    const subscription = await getSubscriptionById(database, subscriptionId);

    assert.deepEqual(subscriptions, [
      {
        id: subscriptionId,
        name: "Figma Professional",
        vendor: "Figma",
        currentPlan: "professional-8-seat",
        currentSeats: 8,
        activeSeats: 3,
        renewalPriceAtomic: "96000000",
        downgradePlan: "professional-3-seat",
        downgradePriceAtomic: "36000000",
        downgradeSeats: 3,
        renewalDate: "2026-10-01",
        vendorWallet: null,
        status: "ACTIVE"
      }
    ]);
    assert.deepEqual(subscription, subscriptions[0]);
  });

  it("seeds Figma vendor state and applies the configured downgrade idempotently", async () => {
    assert.deepEqual(
      await demoSaaSProvider.getSubscriptionState(subscriptionId),
      { plan: "professional-8-seat", seats: 8, active: true }
    );

    const fulfilledState = await demoSaaSProvider.applyPlanChange(subscriptionId);
    assert.deepEqual(fulfilledState, {
      plan: "professional-3-seat",
      seats: 3,
      active: true
    });
    assert.deepEqual(
      await demoSaaSProvider.applyPlanChange(subscriptionId),
      fulfilledState
    );

    const subscription = await getSubscriptionById(database, subscriptionId);
    assert.equal(subscription?.currentPlan, "professional-8-seat");
    assert.equal(subscription?.currentSeats, 8);
  });

  it("resets provider state from the persisted subscription baseline", async () => {
    await demoSaaSProvider.applyPlanChange(subscriptionId);

    assert.deepEqual(await demoSaaSProvider.resetDemoState(subscriptionId), {
      plan: "professional-8-seat",
      seats: 8,
      active: true
    });
  });

  it("returns stable errors for unknown subscriptions and conflicting vendor state", async () => {
    await assert.rejects(
      demoSaaSProvider.getSubscriptionState("missing"),
      (error: unknown) =>
        error instanceof DemoSaaSProviderError &&
        error.code === "SUBSCRIPTION_NOT_FOUND"
    );

    await database
      .prepare(
        "UPDATE demo_provider_state SET plan = ?, seats = ? WHERE subscription_id = ?"
      )
      .bind("unrecognized-plan", 2, subscriptionId)
      .run();

    await assert.rejects(
      demoSaaSProvider.applyPlanChange(subscriptionId),
      (error: unknown) =>
        error instanceof DemoSaaSProviderError &&
        error.code === "DEMO_PROVIDER_STATE_CONFLICT"
    );
  });

  it("persists one canonical snapshot and reuses it after source data changes", async () => {
    const renewalId = "renewal_snapshot_immutable";
    await database
      .prepare(
        "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(renewalId, subscriptionId, "CREATED", "2026-09-28T00:00:00.000Z")
      .run();

    const [first, concurrent] = await Promise.all([
      getOrCreateRenewalSnapshot(database, renewalId, subscriptionId),
      getOrCreateRenewalSnapshot(database, renewalId, subscriptionId)
    ]);
    assert.deepEqual(concurrent, first);
    assert.equal(first.snapshotJson, canonicalizeJson(first.snapshot));
    assert.equal("vendorWallet" in first.snapshot.subscription, false);
    assert.deepEqual(first.snapshot.usageEvidence, [
      {
        id: "usage:sub_figma_professional:seat-count",
        purchasedSeats: 8,
        activeSeats: 3
      }
    ]);
    assert.deepEqual(first.snapshot.billingEvidence, [
      {
        id: "billing:sub_figma_professional:renewal-prices",
        renewalPriceAtomic: "96000000",
        downgradePlan: "professional-3-seat",
        downgradeSeats: 3,
        downgradePriceAtomic: "36000000"
      }
    ]);
    assert.equal(first.snapshot.previousRenewal, null);

    const stored = await database
      .prepare("SELECT snapshot_json, snapshot_hash FROM renewals WHERE id = ?")
      .bind(renewalId)
      .first<{ snapshot_json: string | null; snapshot_hash: string | null }>();
    assert.equal(stored?.snapshot_json, first.snapshotJson);
    assert.equal(stored?.snapshot_hash, first.snapshotHash);

    await database
      .prepare("UPDATE subscriptions SET active_seats = 2 WHERE id = ?")
      .bind(subscriptionId)
      .run();
    assert.deepEqual(
      await getOrCreateRenewalSnapshot(database, renewalId, subscriptionId),
      first
    );
    await database
      .prepare("UPDATE subscriptions SET active_seats = 3 WHERE id = ?")
      .bind(subscriptionId)
      .run();
    await database
      .prepare("DELETE FROM renewals WHERE id = ?")
      .bind(renewalId)
      .run();
  });

  it("includes the most recent previous renewal and detects persisted hash corruption", async () => {
    const previousRenewalId = "renewal_snapshot_previous";
    const renewalId = "renewal_snapshot_with_history";

    await database
      .prepare(
        `INSERT INTO renewals (
          id, subscription_id, status, target_plan, target_seats, amount_atomic,
          created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        previousRenewalId,
        subscriptionId,
        "SETTLED",
        "professional-3-seat",
        3,
        "36000000",
        "2026-09-20T00:00:00.000Z",
        "2026-09-21T00:00:00.000Z"
      )
      .run();
    await database
      .prepare(
        `INSERT INTO decisions (
          id, renewal_id, action, rationale, target_plan, target_seats,
          amount_atomic, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "decision_snapshot_previous",
        previousRenewalId,
        "DOWNGRADE",
        "Remove unused seats.",
        "professional-3-seat",
        3,
        "36000000",
        "2026-09-20T00:00:00.000Z"
      )
      .run();
    await database
      .prepare(
        "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(renewalId, subscriptionId, "CREATED", "2026-09-28T00:00:00.000Z")
      .run();

    const persisted = await getOrCreateRenewalSnapshot(
      database,
      renewalId,
      subscriptionId
    );
    assert.deepEqual(persisted.snapshot.previousRenewal, {
      id: previousRenewalId,
      status: "SETTLED",
      action: "DOWNGRADE",
      targetPlan: "professional-3-seat",
      targetSeats: 3,
      amountAtomic: "36000000",
      createdAt: "2026-09-20T00:00:00.000Z",
      completedAt: "2026-09-21T00:00:00.000Z"
    });

    await database
      .prepare("UPDATE renewals SET snapshot_hash = ? WHERE id = ?")
      .bind(`0x${"0".repeat(64)}`, renewalId)
      .run();
    await assert.rejects(
      getOrCreateRenewalSnapshot(database, renewalId, subscriptionId),
      (error: unknown) =>
        error instanceof RenewalSnapshotError &&
        error.code === "SNAPSHOT_CORRUPT"
    );

    const lateRenewalId = "renewal_snapshot_late";
    await database
      .prepare(
        "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(
        lateRenewalId,
        subscriptionId,
        "SETTLED",
        "2026-10-02T00:00:00.000Z"
      )
      .run();
    await assert.rejects(
      getOrCreateRenewalSnapshot(database, lateRenewalId, subscriptionId),
      (error: unknown) =>
        error instanceof RenewalSnapshotError &&
        error.code === "SNAPSHOT_STATE_INVALID"
    );
  });

  it("returns null for unknown and injection-shaped subscription IDs", async () => {
    assert.equal(await getSubscriptionById(database, "missing"), null);
    assert.equal(await getSubscriptionById(database, "' OR 1 = 1 --"), null);
  });

  it("rejects non-integer atomic amounts", async () => {
    await assert.rejects(
      database
        .prepare(
          `INSERT INTO subscriptions (
            id, name, vendor, current_plan, current_seats, active_seats,
            renewal_price_atomic, downgrade_plan, downgrade_price_atomic,
            renewal_date, vendor_wallet, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          "invalid-price",
          "Invalid price",
          "Figma",
          "professional-1-seat",
          1,
          1,
          "96.0",
          "professional-3-seat",
          "36000000",
          "2026-10-01",
          null,
          "ACTIVE",
          "2026-09-28T00:00:00.000Z",
          "2026-09-28T00:00:00.000Z"
        )
        .run()
    );
  });
});
