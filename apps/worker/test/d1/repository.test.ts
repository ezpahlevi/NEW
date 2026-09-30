import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { Miniflare } from "miniflare";
import {
  canonicalizeJson,
  keccak256Hex,
  ControllerDecisionSchema,
  type ControllerAction
} from "@new/shared";
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
  ControllerDecisionError,
  type ControllerDecisionErrorCode,
  runControllerDecision
} from "../../src/agents/controller.ts";
import {
  buildCanonicalRenewalTerms,
  RenewalHashError
} from "../../src/agents/controller-hashes.ts";
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

const usageEvidenceId = "usage:sub_figma_professional:seat-count";
const billingEvidenceId = "billing:sub_figma_professional:renewal-prices";
const allowedControllerActions = [
  "KEEP",
  "DOWNGRADE",
  "CANCEL",
  "NEEDS_REVIEW"
] as const;

async function createControllerFixture(
  renewalId: string,
  options: { reports?: boolean; reportEvidenceRef?: string } = {}
) {
  await database
    .prepare(
      "INSERT INTO renewals (id, subscription_id, status, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(renewalId, subscriptionId, "ANALYZING", "2026-09-28T00:00:00.000Z")
    .run();
  const snapshot = await getOrCreateRenewalSnapshot(
    database,
    renewalId,
    subscriptionId
  );

  if (options.reports === false) return snapshot;

  const operationsRefs = [options.reportEvidenceRef ?? usageEvidenceId];
  await database.batch([
    database
      .prepare(
        `INSERT INTO agent_reports (
           id, renewal_id, role, verdict, reason_codes_json, summary,
           evidence_refs_json, model, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `report-${renewalId}-operations`,
        renewalId,
        "OPERATIONS",
        "KEEP",
        '["CURRENT_USAGE"]',
        "The subscription has active workflow usage.",
        JSON.stringify(operationsRefs),
        "test-model",
        "2026-09-28T01:00:00.000Z"
      ),
    database
      .prepare(
        `INSERT INTO agent_reports (
           id, renewal_id, role, verdict, reason_codes_json, summary,
           evidence_refs_json, model, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `report-${renewalId}-finance`,
        renewalId,
        "FINANCE",
        "DOWNGRADE",
        '["LOW_UTILIZATION"]',
        "Only three of eight seats are active.",
        JSON.stringify([usageEvidenceId, billingEvidenceId]),
        "test-model",
        "2026-09-28T01:00:00.000Z"
      ),
    database
      .prepare(
        `INSERT INTO agent_reports (
           id, renewal_id, role, verdict, reason_codes_json, summary,
           evidence_refs_json, model, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `report-${renewalId}-auditor`,
        renewalId,
        "AUDITOR",
        "DOWNGRADE",
        '["UNUSED_SEATS"]',
        "Five paid seats show no active usage.",
        JSON.stringify([usageEvidenceId, billingEvidenceId]),
        "test-model",
        "2026-09-28T01:00:00.000Z"
      )
  ]);

  return snapshot;
}

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

  it("binds the Controller decision to verified plan data and reuses its D1 readback", async () => {
    const renewalId = "renewal_controller_downgrade";
    const snapshot = await createControllerFixture(renewalId);
    let contextSnapshotHash: string | undefined;

    const runInput = {
      database,
      renewalId,
      subscriptionId,
      allowedActions: [...allowedControllerActions],
      analyze: async (context: { snapshotHash: string }) => {
        contextSnapshotHash = context.snapshotHash;
        return {
          action: "DOWNGRADE",
          targetPlan: "professional-3-seat",
          targetSeats: 3,
          rationale: "The active team needs three seats.",
          supportingEvidenceRefs: [usageEvidenceId, billingEvidenceId]
        };
      },
      now: () => "2026-09-28T02:00:00.000Z"
    };

    const decision = await runControllerDecision(runInput);
    assert.equal(contextSnapshotHash, snapshot.snapshotHash);
    assert.deepEqual(decision.decision, {
      action: "DOWNGRADE",
      targetPlan: "professional-3-seat",
      targetSeats: 3,
      amountAtomic: "36000000",
      rationale: "The active team needs three seats.",
      supportingEvidenceRefs: [usageEvidenceId, billingEvidenceId]
    });
    assert.equal(decision.createdAt, "2026-09-28T02:00:00.000Z");
    assert.match(decision.decisionHash, /^0x[a-f0-9]{64}$/);
    assert.match(decision.termsHash ?? "", /^0x[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(decision.termsJson ?? "null"), {
      subscription: "Figma Professional",
      current_plan: "professional-8-seat",
      target_plan: "professional-3-seat",
      current_seats: 8,
      target_seats: 3,
      period_start: "2026-10-01",
      period_end: "2026-11-01",
      amount_atomic: "36000000",
      vendor: null
    });
    assert.equal(keccak256Hex(decision.termsJson ?? ""), decision.termsHash);

    const renewal = await database
      .prepare("SELECT status, target_plan, target_seats, amount_atomic, decision_hash, terms_json, terms_hash FROM renewals WHERE id = ?")
      .bind(renewalId)
      .first<{
        status: string;
        target_plan: string | null;
        target_seats: number | null;
        amount_atomic: string | null;
        decision_hash: string | null;
        terms_json: string | null;
        terms_hash: string | null;
      }>();
    assert.equal(renewal?.status, "CONTROLLER_DECISION");
    assert.equal(renewal?.target_plan, "professional-3-seat");
    assert.equal(renewal?.target_seats, 3);
    assert.equal(renewal?.amount_atomic, "36000000");
    assert.equal(renewal?.decision_hash, decision.decisionHash);
    assert.equal(renewal?.terms_json, decision.termsJson);
    assert.equal(renewal?.terms_hash, decision.termsHash);
    const vendorWallet = await database
      .prepare("SELECT vendor_wallet FROM subscriptions WHERE id = ?")
      .bind(subscriptionId)
      .first<{ vendor_wallet: string | null }>();
    assert.equal(vendorWallet?.vendor_wallet, null);

    const persistedRefs = await database
      .prepare("SELECT supporting_evidence_refs_json FROM decisions WHERE renewal_id = ?")
      .bind(renewalId)
      .first<{ supporting_evidence_refs_json: string }>();
    assert.equal(
      persistedRefs?.supporting_evidence_refs_json,
      JSON.stringify([usageEvidenceId, billingEvidenceId])
    );

    const replay = await runControllerDecision({
      ...runInput,
      analyze: async () => {
        throw new Error("persisted decisions must be reused");
      }
    });
    assert.deepEqual(replay, decision);

    await database
      .prepare("UPDATE renewals SET decision_hash = NULL WHERE id = ?")
      .bind(renewalId)
      .run();
    await assert.rejects(
      runControllerDecision({
        ...runInput,
        analyze: async () => {
          throw new Error("persisted decisions must be reused");
        }
      }),
      (error: unknown) =>
        error instanceof RenewalHashError &&
        error.code === "RENEWAL_HASH_CORRUPT"
    );
    await database
      .prepare("UPDATE renewals SET decision_hash = ? WHERE id = ?")
      .bind(decision.decisionHash, renewalId)
      .run();

    await database
      .prepare("UPDATE renewals SET status = 'PREPARING_ESCROW' WHERE id = ?")
      .bind(renewalId)
      .run();
    const lockedReplay = await runControllerDecision({
      ...runInput,
      analyze: async () => {
        throw new Error("persisted decisions must be reused");
      }
    });
    assert.deepEqual(lockedReplay, decision);

    await database
      .prepare("UPDATE renewals SET terms_json = ? WHERE id = ?")
      .bind("{}", renewalId)
      .run();
    await assert.rejects(
      runControllerDecision({
        ...runInput,
        analyze: async () => {
          throw new Error("persisted decisions must be reused");
        }
      }),
      (error: unknown) =>
        error instanceof RenewalHashError &&
        error.code === "RENEWAL_HASH_CORRUPT"
    );

    await database
      .prepare(
        "UPDATE decisions SET supporting_evidence_refs_json = ? WHERE renewal_id = ?"
      )
      .bind('["evidence:invented"]', renewalId)
      .run();
    await assert.rejects(
      runControllerDecision({
        ...runInput,
        analyze: async () => {
          throw new Error("corrupt decisions must fail readback");
        }
      }),
      (error: unknown) =>
        error instanceof ControllerDecisionError &&
        error.code === "CONTROLLER_DECISION_CORRUPT"
    );
  });

  it("uses calendar-month bounds for renewal terms and rejects invalid dates", async () => {
    const renewalId = "renewal_terms_month_end";
    const snapshot = await createControllerFixture(renewalId, { reports: false });
    const decision = ControllerDecisionSchema.parse({
      action: "DOWNGRADE",
      targetPlan: "professional-3-seat",
      targetSeats: 3,
      amountAtomic: "36000000",
      rationale: "Use the verified smaller plan.",
      supportingEvidenceRefs: [usageEvidenceId]
    });
    const monthEndSnapshot = {
      ...snapshot.snapshot,
      subscription: {
        ...snapshot.snapshot.subscription,
        renewalDate: "2026-01-31"
      }
    };

    assert.equal(
      buildCanonicalRenewalTerms(monthEndSnapshot, decision, null)?.period_end,
      "2026-02-28"
    );
    assert.throws(
      () =>
        buildCanonicalRenewalTerms(
          {
            ...monthEndSnapshot,
            subscription: {
              ...monthEndSnapshot.subscription,
              renewalDate: "2026-02-30"
            }
          },
          decision,
          null
        ),
      (error: unknown) =>
        error instanceof RenewalHashError &&
        error.code === "RENEWAL_TERMS_INVALID"
    );
  });

  it("rejects a decision hash after a persisted specialist report changes", async () => {
    const renewalId = "renewal_controller_report_hash";
    await createControllerFixture(renewalId);
    const input = {
      database,
      renewalId,
      subscriptionId,
      allowedActions: [...allowedControllerActions],
      analyze: async () => ({
        action: "DOWNGRADE",
        targetPlan: "professional-3-seat",
        targetSeats: 3,
        rationale: "Use the verified smaller plan.",
        supportingEvidenceRefs: [usageEvidenceId]
      })
    };

    const decision = await runControllerDecision(input);
    await database
      .prepare("UPDATE agent_reports SET summary = ? WHERE renewal_id = ? AND role = 'FINANCE'")
      .bind("Changed persisted report", renewalId)
      .run();

    await assert.rejects(
      runControllerDecision({
        ...input,
        analyze: async () => {
          throw new Error("persisted decisions must be reused");
        }
      }),
      (error: unknown) =>
        error instanceof RenewalHashError &&
        error.code === "RENEWAL_HASH_CORRUPT"
    );
    assert.match(decision.decisionHash, /^0x[a-f0-9]{64}$/);
  });

  it("binds KEEP to the current plan price and leaves non-payment actions unpriced", async () => {
    const cases: Array<{
      renewalId: string;
      action: ControllerAction;
      targetPlan: string | null;
      targetSeats: number | null;
      expectedAmount: string | null;
    }> = [
      {
        renewalId: "renewal_controller_keep",
        action: "KEEP",
        targetPlan: "professional-8-seat",
        targetSeats: 8,
        expectedAmount: "96000000"
      },
      {
        renewalId: "renewal_controller_cancel",
        action: "CANCEL",
        targetPlan: null,
        targetSeats: null,
        expectedAmount: null
      },
      {
        renewalId: "renewal_controller_review",
        action: "NEEDS_REVIEW",
        targetPlan: null,
        targetSeats: null,
        expectedAmount: null
      }
    ] as const;

    for (const testCase of cases) {
      await createControllerFixture(testCase.renewalId);
      const result = await runControllerDecision({
        database,
        renewalId: testCase.renewalId,
        subscriptionId,
        allowedActions: [...allowedControllerActions],
        analyze: async () => ({
          action: testCase.action,
          targetPlan: testCase.targetPlan,
          targetSeats: testCase.targetSeats,
          rationale: "This follows the evidence and allowed action set.",
          supportingEvidenceRefs: [usageEvidenceId]
        })
      });
      assert.equal(result.decision.amountAtomic, testCase.expectedAmount);
      assert.match(result.decisionHash, /^0x[a-f0-9]{64}$/);
      if (testCase.expectedAmount === null) {
        assert.equal(result.termsJson, null);
        assert.equal(result.termsHash, null);
      }
    }
  });

  it("rejects model amounts, unallowed actions, unsupported plans, and invented evidence", async () => {
    const cases: Array<{
      renewalId: string;
      proposal: unknown;
      allowedActions: ControllerAction[];
      expectedCode: ControllerDecisionErrorCode;
    }> = [
      {
        renewalId: "renewal_controller_model_amount",
        proposal: {
          action: "DOWNGRADE",
          targetPlan: "professional-3-seat",
          targetSeats: 3,
          amountAtomic: "1",
          rationale: "Use the lower plan.",
          supportingEvidenceRefs: [usageEvidenceId]
        },
        allowedActions: [...allowedControllerActions],
        expectedCode: "CONTROLLER_OUTPUT_INVALID"
      },
      {
        renewalId: "renewal_controller_disallowed_action",
        proposal: {
          action: "CANCEL",
          targetPlan: null,
          targetSeats: null,
          rationale: "Cancel this subscription.",
          supportingEvidenceRefs: [usageEvidenceId]
        },
        allowedActions: ["KEEP"],
        expectedCode: "CONTROLLER_ACTION_NOT_ALLOWED"
      },
      {
        renewalId: "renewal_controller_unsupported_plan",
        proposal: {
          action: "DOWNGRADE",
          targetPlan: "professional-2-seat",
          targetSeats: 2,
          rationale: "Use a smaller plan.",
          supportingEvidenceRefs: [usageEvidenceId]
        },
        allowedActions: [...allowedControllerActions],
        expectedCode: "CONTROLLER_PLAN_INVALID"
      },
      {
        renewalId: "renewal_controller_invented_evidence",
        proposal: {
          action: "DOWNGRADE",
          targetPlan: "professional-3-seat",
          targetSeats: 3,
          rationale: "Use the verified smaller plan.",
          supportingEvidenceRefs: ["invoice:invented"]
        },
        allowedActions: [...allowedControllerActions],
        expectedCode: "CONTROLLER_EVIDENCE_INVALID"
      },
      {
        renewalId: "renewal_controller_empty_evidence",
        proposal: {
          action: "DOWNGRADE",
          targetPlan: "professional-3-seat",
          targetSeats: 3,
          rationale: "Use the verified smaller plan.",
          supportingEvidenceRefs: []
        },
        allowedActions: [...allowedControllerActions],
        expectedCode: "CONTROLLER_EVIDENCE_INVALID"
      }
    ];

    for (const testCase of cases) {
      await createControllerFixture(testCase.renewalId);
      await assert.rejects(
        runControllerDecision({
          database,
          renewalId: testCase.renewalId,
          subscriptionId,
          allowedActions: testCase.allowedActions,
          analyze: async () => testCase.proposal
        }),
        (error: unknown) =>
          error instanceof ControllerDecisionError &&
          error.code === testCase.expectedCode
      );
      const persisted = await database
        .prepare(
          `SELECT r.status, COUNT(d.id) AS decision_count
           FROM renewals AS r LEFT JOIN decisions AS d ON d.renewal_id = r.id
           WHERE r.id = ? GROUP BY r.id`
        )
        .bind(testCase.renewalId)
        .first<{ status: string; decision_count: number }>();
      assert.deepEqual(persisted, {
        status: "ANALYZING",
        decision_count: 0
      });
    }
  });

  it("requires complete persisted reports and rejects invalid report evidence before generation", async () => {
    const incompleteRenewalId = "renewal_controller_no_reports";
    await createControllerFixture(incompleteRenewalId, { reports: false });
    let called = false;
    await assert.rejects(
      runControllerDecision({
        database,
        renewalId: incompleteRenewalId,
        subscriptionId,
        allowedActions: [...allowedControllerActions],
        analyze: async () => {
          called = true;
          return {};
        }
      }),
      (error: unknown) =>
        error instanceof SpecialistAnalysisError &&
        error.code === "AGENT_REPORTS_INCOMPLETE"
    );
    assert.equal(called, false);

    const invalidEvidenceRenewalId = "renewal_controller_invalid_report_evidence";
    await createControllerFixture(invalidEvidenceRenewalId, {
      reportEvidenceRef: "evidence:invented"
    });
    await assert.rejects(
      runControllerDecision({
        database,
        renewalId: invalidEvidenceRenewalId,
        subscriptionId,
        allowedActions: [...allowedControllerActions],
        analyze: async () => {
          called = true;
          return {};
        }
      }),
      (error: unknown) =>
        error instanceof ControllerDecisionError &&
        error.code === "CONTROLLER_EVIDENCE_INVALID"
    );
    assert.equal(called, false);
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
