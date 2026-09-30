import {
  AgentReportSchema,
  EvmAddressSchema,
  RenewalTermsSchema,
  TransactionHashSchema,
  canonicalizeJson,
  keccak256Hex,
  type AgentReport,
  type ControllerDecision,
  type RenewalSnapshot,
  type RenewalTerms
} from "@new/shared";

const reportRoles = ["OPERATIONS", "FINANCE", "AUDITOR"] as const;

export type RenewalHashErrorCode =
  | "RENEWAL_HASH_STATE_INVALID"
  | "RENEWAL_HASH_CORRUPT"
  | "RENEWAL_HASH_PERSIST_FAILED"
  | "RENEWAL_TERMS_INVALID";

export class RenewalHashError extends Error {
  readonly code: RenewalHashErrorCode;

  constructor(code: RenewalHashErrorCode) {
    super(code);
    this.name = "RenewalHashError";
    this.code = code;
  }
}

export interface PersistedControllerHashes {
  decisionHash: string;
  termsHash: string | null;
  termsJson: string | null;
}

interface HashRow {
  status: string;
  snapshot_hash: string | null;
  decision_hash: string | null;
  terms_json: string | null;
  terms_hash: string | null;
  vendor_wallet: string | null;
}

function daysInMonth(year: number, month: number): number | undefined {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function addOneCalendarMonth(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new RenewalHashError("RENEWAL_TERMS_INVALID");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const currentMonthLength = daysInMonth(year, month);
  if (currentMonthLength === undefined || day < 1 || day > currentMonthLength) {
    throw new RenewalHashError("RENEWAL_TERMS_INVALID");
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth) ?? 0);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

export function buildCanonicalRenewalTerms(
  snapshot: RenewalSnapshot,
  decision: ControllerDecision,
  vendorWallet: string | null
): RenewalTerms | null {
  const subscription = snapshot.subscription;
  let expected: { plan: string; seats: number; amount: string } | null;
  switch (decision.action) {
    case "KEEP":
      expected = {
        plan: subscription.currentPlan,
        seats: subscription.currentSeats,
        amount: subscription.renewalPriceAtomic
      };
      break;
    case "DOWNGRADE":
      expected = {
        plan: subscription.downgradePlan,
        seats: subscription.downgradeSeats,
        amount: subscription.downgradePriceAtomic
      };
      break;
    case "CANCEL":
    case "NEEDS_REVIEW":
      if (
        decision.targetPlan !== null ||
        decision.targetSeats !== null ||
        decision.amountAtomic !== null
      ) {
        throw new RenewalHashError("RENEWAL_TERMS_INVALID");
      }
      return null;
  }

  if (
    decision.targetPlan !== expected.plan ||
    decision.targetSeats !== expected.seats ||
    decision.amountAtomic !== expected.amount
  ) {
    throw new RenewalHashError("RENEWAL_TERMS_INVALID");
  }

  try {
    return RenewalTermsSchema.parse({
      subscription: subscription.name,
      current_plan: subscription.currentPlan,
      target_plan: expected.plan,
      current_seats: subscription.currentSeats,
      target_seats: expected.seats,
      period_start: subscription.renewalDate,
      period_end: addOneCalendarMonth(subscription.renewalDate),
      amount_atomic: expected.amount,
      vendor:
        vendorWallet === null
          ? null
          : EvmAddressSchema.parse(vendorWallet).toLowerCase()
    });
  } catch (error) {
    if (error instanceof RenewalHashError) throw error;
    throw new RenewalHashError("RENEWAL_TERMS_INVALID");
  }
}

export function buildDecisionHash(input: {
  renewalId: string;
  snapshotHash: string;
  reports: AgentReport[];
  decision: ControllerDecision;
}): `0x${string}` {
  if (!/^0x[a-f0-9]{64}$/.test(input.snapshotHash)) {
    throw new RenewalHashError("RENEWAL_HASH_STATE_INVALID");
  }

  try {
    const byRole = new Map<AgentReport["role"], AgentReport>();
    for (const report of input.reports) {
      const parsed = AgentReportSchema.parse(report);
      if (parsed.renewalId !== input.renewalId || byRole.has(parsed.role)) {
        throw new Error("Invalid report set");
      }
      byRole.set(parsed.role, parsed);
    }
    if (byRole.size !== reportRoles.length) {
      throw new Error("Expected one report per specialist role");
    }
    const operations = byRole.get("OPERATIONS");
    const finance = byRole.get("FINANCE");
    const auditor = byRole.get("AUDITOR");
    if (operations === undefined || finance === undefined || auditor === undefined) {
      throw new Error("Expected one report per specialist role");
    }

    return keccak256Hex(
      canonicalizeJson({
        renewal_id: input.renewalId,
        snapshot_hash: input.snapshotHash,
        operations_report_hash: keccak256Hex(canonicalizeJson(operations)),
        finance_report_hash: keccak256Hex(canonicalizeJson(finance)),
        auditor_report_hash: keccak256Hex(canonicalizeJson(auditor)),
        controller_decision: input.decision
      })
    );
  } catch {
    throw new RenewalHashError("RENEWAL_HASH_STATE_INVALID");
  }
}

function parseTerms(row: HashRow): RenewalTerms | null {
  if ((row.terms_json === null) !== (row.terms_hash === null)) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }
  if (row.terms_json === null || row.terms_hash === null) return null;

  try {
    const terms = RenewalTermsSchema.parse(JSON.parse(row.terms_json));
    if (
      canonicalizeJson(terms) !== row.terms_json ||
      keccak256Hex(row.terms_json) !==
        TransactionHashSchema.parse(row.terms_hash)
    ) {
      throw new Error("Terms hash mismatch");
    }
    return terms;
  } catch {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }
}

function withoutVendor(terms: RenewalTerms): Omit<RenewalTerms, "vendor"> {
  const { vendor: _vendor, ...remaining } = terms;
  return remaining;
}

async function readHashRow(
  database: D1Database,
  renewalId: string,
  subscriptionId: string
): Promise<HashRow | null> {
  return database
    .prepare(
      `SELECT r.status, r.snapshot_hash, r.decision_hash, r.terms_json,
              r.terms_hash, s.vendor_wallet
       FROM renewals AS r JOIN subscriptions AS s ON s.id = r.subscription_id
       WHERE r.id = ? AND r.subscription_id = ?`
    )
    .bind(renewalId, subscriptionId)
    .first<HashRow>();
}

function verifyStoredHashes(
  row: HashRow,
  decisionHash: `0x${string}`,
  snapshot: RenewalSnapshot,
  decision: ControllerDecision
): PersistedControllerHashes {
  if (row.decision_hash !== decisionHash) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }
  const storedTerms = parseTerms(row);
  if (storedTerms === null) {
    if (decision.action === "KEEP" || decision.action === "DOWNGRADE") {
      throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
    }
    return { decisionHash, termsHash: null, termsJson: null };
  }

  const expected = buildCanonicalRenewalTerms(snapshot, decision, storedTerms.vendor);
  if (expected === null || canonicalizeJson(expected) !== row.terms_json) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }
  return {
    decisionHash,
    termsHash: TransactionHashSchema.parse(row.terms_hash),
    termsJson: row.terms_json
  };
}

export async function persistControllerHashes(input: {
  database: D1Database;
  renewalId: string;
  snapshot: RenewalSnapshot;
  snapshotHash: string;
  reports: AgentReport[];
  decision: ControllerDecision;
}): Promise<PersistedControllerHashes> {
  const decisionHash = buildDecisionHash(input);
  const row = await readHashRow(
    input.database,
    input.renewalId,
    input.snapshot.subscription.id
  );
  if (row === null || row.snapshot_hash !== input.snapshotHash) {
    throw new RenewalHashError("RENEWAL_HASH_STATE_INVALID");
  }
  if (row.status !== "CONTROLLER_DECISION") {
    if (row.status === "CREATED" || row.status === "ANALYZING") {
      throw new RenewalHashError("RENEWAL_HASH_STATE_INVALID");
    }
    return verifyStoredHashes(row, decisionHash, input.snapshot, input.decision);
  }
  if (row.decision_hash !== null && row.decision_hash !== decisionHash) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }

  const terms = buildCanonicalRenewalTerms(
    input.snapshot,
    input.decision,
    row.vendor_wallet
  );
  const priorTerms = parseTerms(row);
  if (
    terms !== null &&
    ((row.decision_hash === null && priorTerms !== null) ||
      (row.decision_hash !== null && priorTerms === null))
  ) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }
  if (priorTerms !== null) {
    const expectedPrior = buildCanonicalRenewalTerms(
      input.snapshot,
      input.decision,
      priorTerms.vendor
    );
    if (
      expectedPrior === null ||
      canonicalizeJson(expectedPrior) !== row.terms_json ||
      terms === null ||
      canonicalizeJson(withoutVendor(expectedPrior)) !==
        canonicalizeJson(withoutVendor(terms))
    ) {
      throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
    }
  } else if (
    row.terms_hash !== null ||
    (row.decision_hash !== null && terms !== null)
  ) {
    throw new RenewalHashError("RENEWAL_HASH_CORRUPT");
  }

  const termsJson = terms === null ? null : canonicalizeJson(terms);
  const termsHash = termsJson === null ? null : keccak256Hex(termsJson);
  const update = await input.database
    .prepare(
      `UPDATE renewals SET decision_hash = ?, terms_json = ?, terms_hash = ?
       WHERE id = ? AND status = 'CONTROLLER_DECISION'
         AND snapshot_hash = ? AND decision_hash IS ?
         AND terms_json IS ? AND terms_hash IS ?
         AND NOT EXISTS (
           SELECT 1 FROM escrows WHERE renewal_id = renewals.id
         )
         AND EXISTS (
           SELECT 1 FROM subscriptions
           WHERE id = renewals.subscription_id AND vendor_wallet IS ?
         )`
    )
    .bind(
      decisionHash,
      termsJson,
      termsHash,
      input.renewalId,
      input.snapshotHash,
      row.decision_hash,
      row.terms_json,
      row.terms_hash,
      row.vendor_wallet
    )
    .run();

  const readback = await readHashRow(
    input.database,
    input.renewalId,
    input.snapshot.subscription.id
  );
  if (readback === null) {
    throw new RenewalHashError("RENEWAL_HASH_PERSIST_FAILED");
  }
  if (
    readback.status === "CONTROLLER_DECISION" &&
    readback.decision_hash === decisionHash &&
    readback.terms_json === termsJson &&
    readback.terms_hash === termsHash
  ) {
    return { decisionHash, termsHash, termsJson };
  }
  if (update.meta.changes === 0 && readback.status !== "CONTROLLER_DECISION") {
    return verifyStoredHashes(readback, decisionHash, input.snapshot, input.decision);
  }
  throw new RenewalHashError("RENEWAL_HASH_PERSIST_FAILED");
}
