import {
  AgentReportSchema,
  type AgentReport,
  type RenewalSnapshot
} from "@new/shared";
import {
  AuditorProposalSchema,
  FinanceProposalSchema,
  OperationsProposalSchema,
  type AuditorContext,
  type AuditorProposal,
  type FinanceContext,
  type FinanceProposal,
  type OperationsContext,
  type OperationsProposal
} from "./schemas.ts";
import { getOrCreateRenewalSnapshot } from "../snapshots/renewal-snapshot.ts";

export interface SpecialistAnalyzers {
  OPERATIONS: (context: OperationsContext) => Promise<unknown>;
  FINANCE: (context: FinanceContext) => Promise<unknown>;
  AUDITOR: (context: AuditorContext) => Promise<unknown>;
}

export type SpecialistAnalysisErrorCode =
  | "SPECIALIST_GENERATION_FAILED"
  | "SPECIALIST_OUTPUT_INVALID"
  | "SPECIALIST_EVIDENCE_INVALID"
  | "AGENT_REPORTS_INCOMPLETE"
  | "AGENT_REPORTS_CORRUPT"
  | "AGENT_REPORT_PERSIST_FAILED";

export class SpecialistAnalysisError extends Error {
  readonly code: SpecialistAnalysisErrorCode;

  constructor(code: SpecialistAnalysisErrorCode) {
    super(code);
    this.name = "SpecialistAnalysisError";
    this.code = code;
  }
}

interface AgentReportRow {
  id: string;
  renewal_id: string;
  role: string;
  verdict: string;
  reason_codes_json: string;
  summary: string;
  evidence_refs_json: string;
  model: string;
  created_at: string;
}

const reportRoles = ["OPERATIONS", "FINANCE", "AUDITOR"] as const;

function parseReportRow(row: AgentReportRow): AgentReport {
  try {
    return AgentReportSchema.parse({
      id: row.id,
      renewalId: row.renewal_id,
      role: row.role,
      verdict: row.verdict,
      reasonCodes: JSON.parse(row.reason_codes_json),
      summary: row.summary,
      evidenceRefs: JSON.parse(row.evidence_refs_json),
      model: row.model,
      createdAt: row.created_at
    });
  } catch {
    throw new SpecialistAnalysisError("AGENT_REPORTS_CORRUPT");
  }
}

async function readAgentReports(
  database: D1Database,
  renewalId: string
): Promise<AgentReport[]> {
  const result = await database
    .prepare(
      `SELECT id, renewal_id, role, verdict, reason_codes_json, summary,
              evidence_refs_json, model, created_at
       FROM agent_reports WHERE renewal_id = ? ORDER BY role`
    )
    .bind(renewalId)
    .all<AgentReportRow>();

  return result.results
    .map(parseReportRow)
    .sort(
      (left, right) =>
        reportRoles.indexOf(left.role) - reportRoles.indexOf(right.role)
    );
}

function priorDecision(snapshot: RenewalSnapshot) {
  const previous = snapshot.previousRenewal;
  if (previous === null) return null;

  return {
    id: previous.id,
    status: previous.status,
    action: previous.action,
    targetPlan: previous.targetPlan,
    targetSeats: previous.targetSeats
  };
}

function previousRenewalWithCost(snapshot: RenewalSnapshot) {
  const previous = snapshot.previousRenewal;
  if (previous === null) return null;

  return {
    id: previous.id,
    status: previous.status,
    action: previous.action,
    amountAtomic: previous.amountAtomic
  };
}

function previousRenewalForAudit(snapshot: RenewalSnapshot) {
  const renewal = snapshot.previousRenewal;
  if (renewal === null) return null;
  const previous = priorDecision(snapshot);
  if (previous === null) return null;

  return {
    ...previous,
    amountAtomic: renewal.amountAtomic
  };
}

function specialistContexts(
  snapshot: RenewalSnapshot,
  snapshotHash: string
): {
  operations: OperationsContext;
  finance: FinanceContext;
  auditor: AuditorContext;
} {
  const { subscription } = snapshot;
  const shared = { snapshotVersion: snapshot.version, snapshotHash };
  const usageEvidence = snapshot.usageEvidence;

  return {
    operations: {
      ...shared,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        vendor: subscription.vendor,
        currentPlan: subscription.currentPlan,
        currentSeats: subscription.currentSeats,
        activeSeats: subscription.activeSeats,
        renewalDate: subscription.renewalDate,
        status: subscription.status
      },
      usageEvidence,
      previousDecision: priorDecision(snapshot)
    },
    finance: {
      ...shared,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        currentPlan: subscription.currentPlan,
        currentSeats: subscription.currentSeats,
        activeSeats: subscription.activeSeats,
        renewalPriceAtomic: subscription.renewalPriceAtomic,
        downgradePlan: subscription.downgradePlan,
        downgradeSeats: subscription.downgradeSeats,
        downgradePriceAtomic: subscription.downgradePriceAtomic
      },
      usageEvidence,
      billingEvidence: snapshot.billingEvidence,
      previousRenewal: previousRenewalWithCost(snapshot)
    },
    auditor: {
      ...shared,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        currentPlan: subscription.currentPlan,
        currentSeats: subscription.currentSeats,
        activeSeats: subscription.activeSeats,
        renewalPriceAtomic: subscription.renewalPriceAtomic,
        downgradePlan: subscription.downgradePlan,
        downgradeSeats: subscription.downgradeSeats,
        downgradePriceAtomic: subscription.downgradePriceAtomic
      },
      usageEvidence,
      billingEvidence: snapshot.billingEvidence,
      previousRenewal: previousRenewalForAudit(snapshot)
    }
  };
}

function evidenceIdsForContext(
  context: OperationsContext | FinanceContext | AuditorContext
): Set<string> {
  const ids = new Set(context.usageEvidence.map((evidence) => evidence.id));
  if ("billingEvidence" in context) {
    for (const evidence of context.billingEvidence) ids.add(evidence.id);
  }
  if (
    "previousDecision" in context &&
    context.previousDecision !== null
  ) {
    ids.add(context.previousDecision.id);
  }
  if ("previousRenewal" in context && context.previousRenewal !== null) {
    ids.add(context.previousRenewal.id);
  }
  return ids;
}

function validateProposal<T extends { evidenceRefs: string[] }>(
  schema: { parse: (value: unknown) => T },
  value: unknown,
  evidenceIds: Set<string>
): T {
  let proposal: T;
  try {
    proposal = schema.parse(value);
  } catch {
    throw new SpecialistAnalysisError("SPECIALIST_OUTPUT_INVALID");
  }

  if (proposal.evidenceRefs.some((evidenceId) => !evidenceIds.has(evidenceId))) {
    throw new SpecialistAnalysisError("SPECIALIST_EVIDENCE_INVALID");
  }
  return proposal;
}

function toReport(
  renewalId: string,
  role: AgentReport["role"],
  proposal: OperationsProposal | FinanceProposal | AuditorProposal,
  model: string,
  createdAt: string
): AgentReport {
  return AgentReportSchema.parse({
    id: crypto.randomUUID(),
    renewalId,
    role,
    verdict: proposal.verdict,
    reasonCodes: proposal.reasonCodes,
    summary: proposal.summary,
    evidenceRefs: proposal.evidenceRefs,
    model,
    createdAt
  });
}

async function persistAgentReports(
  database: D1Database,
  renewalId: string,
  reports: AgentReport[]
): Promise<AgentReport[]> {
  try {
    await database.batch(
      reports.map((report) =>
        database
          .prepare(
            `INSERT INTO agent_reports (
               id, renewal_id, role, verdict, reason_codes_json, summary,
               evidence_refs_json, model, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            report.id,
            report.renewalId,
            report.role,
            report.verdict,
            JSON.stringify(report.reasonCodes),
            report.summary,
            JSON.stringify(report.evidenceRefs),
            report.model,
            report.createdAt
          )
      )
    );
  } catch {
    const reportsAfterRace = await readAgentReports(database, renewalId);
    if (reportsAfterRace.length === reportRoles.length) return reportsAfterRace;
    throw new SpecialistAnalysisError("AGENT_REPORT_PERSIST_FAILED");
  }

  const persistedReports = await readAgentReports(database, renewalId);
  if (persistedReports.length !== reportRoles.length) {
    throw new SpecialistAnalysisError("AGENT_REPORT_PERSIST_FAILED");
  }
  return persistedReports;
}

export async function runSpecialistAnalysis(input: {
  database: D1Database;
  renewalId: string;
  subscriptionId: string;
  model: string;
  agents: SpecialistAnalyzers;
  now?: () => string;
}): Promise<AgentReport[]> {
  const persistedSnapshot = await getOrCreateRenewalSnapshot(
    input.database,
    input.renewalId,
    input.subscriptionId
  );
  const existingReports = await readAgentReports(input.database, input.renewalId);
  if (existingReports.length === reportRoles.length) return existingReports;
  if (existingReports.length !== 0) {
    throw new SpecialistAnalysisError("AGENT_REPORTS_INCOMPLETE");
  }

  const contexts = specialistContexts(
    persistedSnapshot.snapshot,
    persistedSnapshot.snapshotHash
  );
  let rawProposals: [unknown, unknown, unknown];
  try {
    rawProposals = await Promise.all([
      input.agents.OPERATIONS(contexts.operations),
      input.agents.FINANCE(contexts.finance),
      input.agents.AUDITOR(contexts.auditor)
    ]);
  } catch {
    throw new SpecialistAnalysisError("SPECIALIST_GENERATION_FAILED");
  }

  const proposals: [OperationsProposal, FinanceProposal, AuditorProposal] = [
    validateProposal(
      OperationsProposalSchema,
      rawProposals[0],
      evidenceIdsForContext(contexts.operations)
    ),
    validateProposal(
      FinanceProposalSchema,
      rawProposals[1],
      evidenceIdsForContext(contexts.finance)
    ),
    validateProposal(
      AuditorProposalSchema,
      rawProposals[2],
      evidenceIdsForContext(contexts.auditor)
    )
  ];
  const createdAt = (input.now ?? (() => new Date().toISOString()))();
  const reports = [
    toReport(input.renewalId, "OPERATIONS", proposals[0], input.model, createdAt),
    toReport(input.renewalId, "FINANCE", proposals[1], input.model, createdAt),
    toReport(input.renewalId, "AUDITOR", proposals[2], input.model, createdAt)
  ];

  return persistAgentReports(input.database, input.renewalId, reports);
}
