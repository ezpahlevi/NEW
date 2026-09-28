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
import {
  runSpecialistAnalysis,
  SpecialistAnalysisError,
  type SpecialistAnalyzers
} from "../../src/agents/specialists.ts";
import {
  AuditorContextSchema,
  FinanceContextSchema,
  OperationsContextSchema
} from "../../src/agents/schemas.ts";

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

  it("runs specialists with distinct evidence contexts and persists one report per role", async () => {
    const previousRenewalId = "renewal_specialists_previous";
    const renewalId = "renewal_specialists_success";
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
        "professional-8-seat",
        8,
        "96000000",
        "2026-10-03T00:00:00.000Z",
        "2026-10-03T01:00:00.000Z"
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
        "decision_specialists_previous",
        previousRenewalId,
        "KEEP",
        "The prior subscription state was retained.",
        "professional-8-seat",
        8,
        "96000000",
        "2026-10-03T00:00:00.000Z"
      )
      .run();
    await database
      .prepare(
        "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(renewalId, subscriptionId, "ANALYZING", "2026-09-28T00:00:00.000Z")
      .run();

    const contexts: {
      OPERATIONS?: unknown;
      FINANCE?: unknown;
      AUDITOR?: unknown;
    } = {};
    const called: string[] = [];
    const analyzers: SpecialistAnalyzers = {
      OPERATIONS: async (context) => {
        called.push("OPERATIONS");
        contexts.OPERATIONS = context;
        return {
          verdict: "KEEP",
          reasonCodes: ["CURRENT_USAGE"],
          summary: "Three seats show current use.",
          evidenceRefs: ["usage:sub_figma_professional:seat-count"]
        };
      },
      FINANCE: async (context) => {
        called.push("FINANCE");
        contexts.FINANCE = context;
        return {
          verdict: "DOWNGRADE",
          reasonCodes: ["LOW_UTILIZATION", "AVOIDABLE_COST"],
          summary: "Only three of eight purchased seats are active.",
          evidenceRefs: [
            "usage:sub_figma_professional:seat-count",
            "billing:sub_figma_professional:renewal-prices"
          ]
        };
      },
      AUDITOR: async (context) => {
        called.push("AUDITOR");
        contexts.AUDITOR = context;
        return {
          verdict: "DOWNGRADE",
          reasonCodes: ["UNUSED_SEATS"],
          summary: "Five purchased seats have no active usage evidence.",
          evidenceRefs: ["usage:sub_figma_professional:seat-count"]
        };
      }
    };

    const reports = await runSpecialistAnalysis({
      database,
      renewalId,
      subscriptionId,
      model: "test-model",
      agents: analyzers,
      now: () => "2026-09-28T01:00:00.000Z"
    });

    assert.deepEqual(called.sort(), ["AUDITOR", "FINANCE", "OPERATIONS"]);
    assert.equal(reports.length, 3);
    assert.deepEqual(reports.map((report) => report.role), [
      "OPERATIONS",
      "FINANCE",
      "AUDITOR"
    ]);
    assert.deepEqual(reports.map((report) => report.verdict), [
      "KEEP",
      "DOWNGRADE",
      "DOWNGRADE"
    ]);
    assert.equal(reports.every((report) => report.model === "test-model"), true);
    assert.equal(reports.every((report) => report.createdAt === "2026-09-28T01:00:00.000Z"), true);

    const operationsContext = OperationsContextSchema.parse(contexts.OPERATIONS);
    const financeContext = FinanceContextSchema.parse(contexts.FINANCE);
    const auditorContext = AuditorContextSchema.parse(contexts.AUDITOR);
    assert.equal(operationsContext.snapshotHash, financeContext.snapshotHash);
    assert.equal(operationsContext.snapshotHash, auditorContext.snapshotHash);
    assert.equal(operationsContext.snapshotVersion, financeContext.snapshotVersion);
    assert.equal(financeContext.snapshotVersion, auditorContext.snapshotVersion);
    assert.equal("renewalPriceAtomic" in operationsContext.subscription, false);
    assert.equal("billingEvidence" in operationsContext, false);
    assert.equal("billingEvidence" in financeContext, true);
    assert.equal("previousRenewal" in operationsContext, false);
    assert.equal(operationsContext.previousDecision?.id, previousRenewalId);
    assert.equal(financeContext.previousRenewal?.amountAtomic, "96000000");
    assert.equal(auditorContext.previousRenewal?.targetSeats, 8);
    assert.equal(
      "targetPlan" in (financeContext.previousRenewal ?? {}),
      false
    );

    const repeated = await runSpecialistAnalysis({
      database,
      renewalId,
      subscriptionId,
      model: "different-model",
      agents: {
        OPERATIONS: async () => { throw new Error("existing reports should be reused"); },
        FINANCE: async () => { throw new Error("existing reports should be reused"); },
        AUDITOR: async () => { throw new Error("existing reports should be reused"); }
      }
    });
    assert.deepEqual(repeated, reports);
  });

  it("rejects invented evidence and malformed role outputs without persisting partial reports", async () => {
    const renewalId = "renewal_specialists_invalid";
    await database
      .prepare(
        "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(renewalId, subscriptionId, "ANALYZING", "2026-09-28T00:00:00.000Z")
      .run();

    const invalidEvidenceAgents: SpecialistAnalyzers = {
      OPERATIONS: async () => ({
        verdict: "KEEP",
        reasonCodes: ["CURRENT_USAGE"],
        summary: "Supported usage exists.",
        evidenceRefs: ["invoice_not_in_snapshot"]
      }),
      FINANCE: async () => ({
        verdict: "DOWNGRADE",
        reasonCodes: ["LOW_UTILIZATION"],
        summary: "Usage is low.",
        evidenceRefs: []
      }),
      AUDITOR: async () => ({
        verdict: "DOWNGRADE",
        reasonCodes: ["UNUSED_SEATS"],
        summary: "Unused seats are evidenced.",
        evidenceRefs: []
      })
    };

    await assert.rejects(
      runSpecialistAnalysis({
        database,
        renewalId,
        subscriptionId,
        model: "test-model",
        agents: invalidEvidenceAgents
      }),
      (error: unknown) =>
        error instanceof SpecialistAnalysisError &&
        error.code === "SPECIALIST_EVIDENCE_INVALID"
    );
    const reportCount = await database
      .prepare("SELECT COUNT(*) AS count FROM agent_reports WHERE renewal_id = ?")
      .bind(renewalId)
      .first<{ count: number }>();
    assert.equal(reportCount?.count, 0);

    const invalidOutputAgents: SpecialistAnalyzers = {
      ...invalidEvidenceAgents,
      OPERATIONS: async () => ({
        verdict: "KEEP",
        reasonCodes: ["UNSUPPORTED_OPERATIONS_CODE"],
        summary: "This is not part of the operations schema.",
        evidenceRefs: []
      })
    };
    await assert.rejects(
      runSpecialistAnalysis({
        database,
        renewalId,
        subscriptionId,
        model: "test-model",
        agents: invalidOutputAgents
      }),
      (error: unknown) =>
        error instanceof SpecialistAnalysisError &&
        error.code === "SPECIALIST_OUTPUT_INVALID"
    );
    const reportsAfterInvalidOutput = await database
      .prepare("SELECT COUNT(*) AS count FROM agent_reports WHERE renewal_id = ?")
      .bind(renewalId)
      .first<{ count: number }>();
    assert.equal(reportsAfterInvalidOutput?.count, 0);
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
