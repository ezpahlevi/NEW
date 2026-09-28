import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { Miniflare } from "miniflare";
import { getSubscriptionById, listSubscriptions } from "../../src/repositories/subscriptions.ts";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);
const subscriptionId = "sub_figma_professional";
let miniflare: Miniflare;
let database: D1Database;

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
  it("creates the eight canonical application tables", async () => {
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
        renewalDate: "2026-10-01",
        vendorWallet: null,
        status: "ACTIVE"
      }
    ]);
    assert.deepEqual(subscription, subscriptions[0]);
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
