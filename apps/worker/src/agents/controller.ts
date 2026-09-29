import {
  canonicalizeJson,
  ControllerDecisionProposalSchema,
  ControllerDecisionSchema,
  type ControllerAction,
  type ControllerDecision,
  type RenewalSnapshot
} from "@new/shared";
import {
  ControllerContextSchema,
  type ControllerContext,
  type ControllerProposal
} from "./schemas.ts";
import {
  getPersistedAgentReports,
  SpecialistAnalysisError
} from "./specialists.ts";
import {
  getOrCreateRenewalSnapshot,
  RenewalSnapshotError
} from "../snapshots/renewal-snapshot.ts";

export type ControllerDecisionErrorCode =
  | "CONTROLLER_GENERATION_FAILED"
  | "CONTROLLER_OUTPUT_INVALID"
  | "CONTROLLER_ACTION_NOT_ALLOWED"
  | "CONTROLLER_PLAN_INVALID"
  | "CONTROLLER_EVIDENCE_INVALID"
  | "CONTROLLER_STATE_INVALID"
  | "CONTROLLER_DECISION_CORRUPT"
  | "CONTROLLER_DECISION_PERSIST_FAILED";

export class ControllerDecisionError extends Error {
  readonly code: ControllerDecisionErrorCode;

  constructor(code: ControllerDecisionErrorCode) {
    super(code);
    this.name = "ControllerDecisionError";
    this.code = code;
  }
}

export type ControllerAnalyzer = (
  context: ControllerContext
) => Promise<unknown>;

export interface PersistedControllerDecision {
  id: string;
  renewalId: string;
  decision: ControllerDecision;
  createdAt: string;
}

interface RenewalStateRow {
  id: string;
  subscription_id: string;
  status: string;
}

interface ControllerDecisionRow {
  id: string;
  renewal_id: string;
  action: string;
  rationale: string;
  target_plan: string | null;
  target_seats: number | null;
  amount_atomic: string | null;
  supporting_evidence_refs_json: string;
  created_at: string;
  renewal_status: string;
  snapshot_hash: string | null;
  renewal_target_plan: string | null;
  renewal_target_seats: number | null;
  renewal_amount_atomic: string | null;
}

async function loadRenewalState(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<RenewalStateRow> {
  const row = await database
    .prepare("SELECT id, subscription_id, status FROM renewals WHERE id = ?")
    .bind(renewalId)
    .first<RenewalStateRow>();

  if (row === null) throw new RenewalSnapshotError("RENEWAL_NOT_FOUND");
  if (row.subscription_id !== subscriptionId) {
    throw new RenewalSnapshotError("RENEWAL_SUBSCRIPTION_MISMATCH");
  }
  return row;
}

function parseDecisionRow(
  row: ControllerDecisionRow,
  snapshotHash: string,
  snapshot: RenewalSnapshot,
  renewalId: string
): PersistedControllerDecision {
  try {
    const decision = ControllerDecisionSchema.parse({
      action: row.action,
      targetPlan: row.target_plan,
      targetSeats: row.target_seats,
      amountAtomic: row.amount_atomic,
      rationale: row.rationale,
      supportingEvidenceRefs: JSON.parse(row.supporting_evidence_refs_json)
    });
    const reboundDecision = bindProposal(
      {
        action: decision.action,
        targetPlan: decision.targetPlan,
        targetSeats: decision.targetSeats,
        rationale: decision.rationale,
        supportingEvidenceRefs: decision.supportingEvidenceRefs
      },
      snapshot,
      ["KEEP", "DOWNGRADE", "CANCEL", "NEEDS_REVIEW"],
      visibleEvidenceIds(snapshot)
    );

    if (
      row.id.trim().length === 0 ||
      row.renewal_id !== renewalId ||
      row.created_at.trim().length === 0 ||
      row.snapshot_hash !== snapshotHash ||
      row.renewal_status === "ANALYZING" ||
      row.renewal_target_plan !== decision.targetPlan ||
      row.renewal_target_seats !== decision.targetSeats ||
      row.renewal_amount_atomic !== decision.amountAtomic ||
      canonicalizeJson(reboundDecision) !== canonicalizeJson(decision)
    ) {
      throw new Error("Stored decision does not match its renewal state");
    }

    return {
      id: row.id,
      renewalId: row.renewal_id,
      decision,
      createdAt: row.created_at
    };
  } catch {
    throw new ControllerDecisionError("CONTROLLER_DECISION_CORRUPT");
  }
}

async function readPersistedDecision(
  database: D1Database,
  renewalId: string,
  snapshotHash: string,
  snapshot: RenewalSnapshot
): Promise<PersistedControllerDecision | null> {
  const row = await database
    .prepare(
      `SELECT d.id, d.renewal_id, d.action, d.rationale, d.target_plan,
              d.target_seats, d.amount_atomic,
              d.supporting_evidence_refs_json, d.created_at,
              r.status AS renewal_status, r.snapshot_hash,
              r.target_plan AS renewal_target_plan,
              r.target_seats AS renewal_target_seats,
              r.amount_atomic AS renewal_amount_atomic
       FROM decisions AS d
       JOIN renewals AS r ON r.id = d.renewal_id
       WHERE d.renewal_id = ?`
    )
    .bind(renewalId)
    .first<ControllerDecisionRow>();

  return row === null
    ? null
    : parseDecisionRow(row, snapshotHash, snapshot, renewalId);
}

function visibleEvidenceIds(snapshot: RenewalSnapshot): Set<string> {
  return new Set([
    ...snapshot.usageEvidence.map((evidence) => evidence.id),
    ...snapshot.billingEvidence.map((evidence) => evidence.id),
    ...(snapshot.previousRenewal === null ? [] : [snapshot.previousRenewal.id])
  ]);
}

function bindProposal(
  proposal: ControllerProposal,
  snapshot: RenewalSnapshot,
  allowedActions: ControllerAction[],
  evidenceIds: Set<string>
): ControllerDecision {
  if (!allowedActions.includes(proposal.action)) {
    throw new ControllerDecisionError("CONTROLLER_ACTION_NOT_ALLOWED");
  }
  if (
    proposal.supportingEvidenceRefs.length === 0 ||
    proposal.supportingEvidenceRefs.some((id) => !evidenceIds.has(id))
  ) {
    throw new ControllerDecisionError("CONTROLLER_EVIDENCE_INVALID");
  }

  const subscription = snapshot.subscription;
  if (
    snapshot.billingEvidence.length === 0 ||
    snapshot.billingEvidence.some(
      (evidence) =>
        evidence.renewalPriceAtomic !== subscription.renewalPriceAtomic ||
        evidence.downgradePlan !== subscription.downgradePlan ||
        evidence.downgradeSeats !== subscription.downgradeSeats ||
        evidence.downgradePriceAtomic !== subscription.downgradePriceAtomic
    )
  ) {
    throw new ControllerDecisionError("CONTROLLER_PLAN_INVALID");
  }

  let amountAtomic: string | null;
  switch (proposal.action) {
    case "KEEP":
      if (
        proposal.targetPlan !== subscription.currentPlan ||
        proposal.targetSeats !== subscription.currentSeats
      ) {
        throw new ControllerDecisionError("CONTROLLER_PLAN_INVALID");
      }
      amountAtomic = subscription.renewalPriceAtomic;
      break;
    case "DOWNGRADE":
      if (
        proposal.targetPlan !== subscription.downgradePlan ||
        proposal.targetSeats !== subscription.downgradeSeats ||
        subscription.downgradePlan === subscription.currentPlan ||
        subscription.downgradeSeats >= subscription.currentSeats ||
        BigInt(subscription.downgradePriceAtomic) >=
          BigInt(subscription.renewalPriceAtomic)
      ) {
        throw new ControllerDecisionError("CONTROLLER_PLAN_INVALID");
      }
      amountAtomic = subscription.downgradePriceAtomic;
      break;
    case "CANCEL":
    case "NEEDS_REVIEW":
      if (proposal.targetPlan !== null || proposal.targetSeats !== null) {
        throw new ControllerDecisionError("CONTROLLER_PLAN_INVALID");
      }
      amountAtomic = null;
      break;
  }

  return ControllerDecisionSchema.parse({ ...proposal, amountAtomic });
}

async function persistDecision(
  database: D1Database,
  record: PersistedControllerDecision,
  snapshotHash: string,
  snapshot: RenewalSnapshot
): Promise<PersistedControllerDecision> {
  const { decision } = record;
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO decisions (
             id, renewal_id, action, rationale, target_plan, target_seats,
             amount_atomic, supporting_evidence_refs_json, created_at
           )
           SELECT ?, id, ?, ?, ?, ?, ?, ?, ? FROM renewals
           WHERE id = ? AND status = 'ANALYZING' AND snapshot_hash = ?
           ON CONFLICT(renewal_id) DO NOTHING`
        )
        .bind(
          record.id,
          decision.action,
          decision.rationale,
          decision.targetPlan,
          decision.targetSeats,
          decision.amountAtomic,
          JSON.stringify(decision.supportingEvidenceRefs),
          record.createdAt,
          record.renewalId,
          snapshotHash
        ),
      database
        .prepare(
          `UPDATE renewals
           SET status = 'CONTROLLER_DECISION', target_plan = ?,
               target_seats = ?, amount_atomic = ?
           WHERE id = ? AND status = 'ANALYZING' AND snapshot_hash = ?
             AND EXISTS (
               SELECT 1 FROM decisions
               WHERE renewal_id = ? AND id = ?
             )`
        )
        .bind(
          decision.targetPlan,
          decision.targetSeats,
          decision.amountAtomic,
          record.renewalId,
          snapshotHash,
          record.renewalId,
          record.id
        )
    ]);
  } catch {
    const winner = await readPersistedDecision(
      database,
      record.renewalId,
      snapshotHash,
      snapshot
    );
    if (winner !== null) return winner;
    throw new ControllerDecisionError("CONTROLLER_DECISION_PERSIST_FAILED");
  }

  const persisted = await readPersistedDecision(
    database,
    record.renewalId,
    snapshotHash,
    snapshot
  );
  if (persisted !== null) return persisted;

  const renewal = await database
    .prepare("SELECT id, subscription_id, status FROM renewals WHERE id = ?")
    .bind(record.renewalId)
    .first<RenewalStateRow>();
  if (renewal === null || renewal.status !== "ANALYZING") {
    throw new ControllerDecisionError("CONTROLLER_STATE_INVALID");
  }
  throw new ControllerDecisionError("CONTROLLER_DECISION_PERSIST_FAILED");
}

export async function runControllerDecision(input: {
  database: D1Database;
  renewalId: string;
  subscriptionId: string;
  allowedActions: ControllerAction[];
  analyze: ControllerAnalyzer;
  now?: () => string;
}): Promise<PersistedControllerDecision> {
  const renewal = await loadRenewalState(
    input.database,
    input.renewalId,
    input.subscriptionId
  );
  const persistedSnapshot = await getOrCreateRenewalSnapshot(
    input.database,
    input.renewalId,
    input.subscriptionId
  );
  const existing = await readPersistedDecision(
    input.database,
    input.renewalId,
    persistedSnapshot.snapshotHash,
    persistedSnapshot.snapshot
  );
  if (existing !== null) {
    if (!input.allowedActions.includes(existing.decision.action)) {
      throw new ControllerDecisionError("CONTROLLER_ACTION_NOT_ALLOWED");
    }
    return existing;
  }
  if (renewal.status !== "ANALYZING") {
    throw new ControllerDecisionError("CONTROLLER_STATE_INVALID");
  }

  let reports;
  try {
    reports = await getPersistedAgentReports(input.database, input.renewalId);
  } catch (error) {
    if (error instanceof SpecialistAnalysisError) throw error;
    throw new ControllerDecisionError("CONTROLLER_STATE_INVALID");
  }

  const evidenceIds = visibleEvidenceIds(persistedSnapshot.snapshot);
  if (
    reports.some((report) =>
      report.evidenceRefs.some((id) => !evidenceIds.has(id))
    )
  ) {
    throw new ControllerDecisionError("CONTROLLER_EVIDENCE_INVALID");
  }

  let context: ControllerContext;
  try {
    context = ControllerContextSchema.parse({
      renewalId: input.renewalId,
      snapshotHash: persistedSnapshot.snapshotHash,
      snapshot: persistedSnapshot.snapshot,
      specialistReports: reports,
      allowedActions: input.allowedActions
    });
  } catch {
    throw new ControllerDecisionError("CONTROLLER_STATE_INVALID");
  }

  let rawProposal: unknown;
  try {
    rawProposal = await input.analyze(context);
  } catch {
    throw new ControllerDecisionError("CONTROLLER_GENERATION_FAILED");
  }

  const parsedProposal = ControllerDecisionProposalSchema.safeParse(rawProposal);
  if (!parsedProposal.success) {
    throw new ControllerDecisionError("CONTROLLER_OUTPUT_INVALID");
  }
  const decision = bindProposal(
    parsedProposal.data,
    persistedSnapshot.snapshot,
    context.allowedActions,
    evidenceIds
  );
  const record: PersistedControllerDecision = {
    id: crypto.randomUUID(),
    renewalId: input.renewalId,
    decision,
    createdAt: (input.now ?? (() => new Date().toISOString()))()
  };

  return persistDecision(
    input.database,
    record,
    persistedSnapshot.snapshotHash,
    persistedSnapshot.snapshot
  );
}
