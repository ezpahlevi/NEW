import { z } from "zod";
import { ControllerActionSchema } from "@new/shared";

const NonEmptyStringSchema = z.string().min(1);
const EvidenceSchema = z.array(NonEmptyStringSchema).max(16);

export const OperationsProposalSchema = z
  .object({
    verdict: ControllerActionSchema,
    reasonCodes: z.array(
      z.enum([
        "ACTIVE_DEPENDENCY",
        "CURRENT_USAGE",
        "INSUFFICIENT_OPERATIONAL_EVIDENCE"
      ])
    ).min(1).max(8),
    summary: NonEmptyStringSchema.max(500),
    evidenceRefs: EvidenceSchema
  })
  .strict();

export const FinanceProposalSchema = z
  .object({
    verdict: ControllerActionSchema,
    reasonCodes: z.array(
      z.enum([
        "LOW_UTILIZATION",
        "AVOIDABLE_COST",
        "RENEWAL_PRICE",
        "INSUFFICIENT_FINANCIAL_EVIDENCE"
      ])
    ).min(1).max(8),
    summary: NonEmptyStringSchema.max(500),
    evidenceRefs: EvidenceSchema
  })
  .strict();

export const AuditorProposalSchema = z
  .object({
    verdict: ControllerActionSchema,
    reasonCodes: z.array(
      z.enum([
        "UNUSED_SEATS",
        "BILLING_ANOMALY",
        "DUPLICATE_TOOL",
        "UNSUPPORTED_CHARGE",
        "INSUFFICIENT_AUDIT_EVIDENCE"
      ])
    ).min(1).max(8),
    summary: NonEmptyStringSchema.max(500),
    evidenceRefs: EvidenceSchema
  })
  .strict();

export const OperationsContextSchema = z
  .object({
    snapshotVersion: z.literal(1),
    snapshotHash: z.string().regex(/^0x[a-f0-9]{64}$/),
    subscription: z
      .object({
        id: NonEmptyStringSchema,
        name: NonEmptyStringSchema,
        vendor: NonEmptyStringSchema,
        currentPlan: NonEmptyStringSchema,
        currentSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative(),
        renewalDate: NonEmptyStringSchema,
        status: NonEmptyStringSchema
      })
      .strict(),
    usageEvidence: z.array(
      z.object({
        id: NonEmptyStringSchema,
        purchasedSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative()
      }).strict()
    ),
    previousDecision: z
      .object({
        id: NonEmptyStringSchema,
        status: NonEmptyStringSchema,
        action: ControllerActionSchema.nullable(),
        targetPlan: z.string().nullable(),
        targetSeats: z.number().int().nonnegative().nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

export const FinanceContextSchema = z
  .object({
    snapshotVersion: z.literal(1),
    snapshotHash: z.string().regex(/^0x[a-f0-9]{64}$/),
    subscription: z
      .object({
        id: NonEmptyStringSchema,
        name: NonEmptyStringSchema,
        currentPlan: NonEmptyStringSchema,
        currentSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative(),
        renewalPriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/),
        downgradePlan: NonEmptyStringSchema,
        downgradeSeats: z.number().int().positive(),
        downgradePriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/)
      })
      .strict(),
    usageEvidence: z.array(
      z.object({
        id: NonEmptyStringSchema,
        purchasedSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative()
      }).strict()
    ),
    billingEvidence: z.array(
      z.object({
        id: NonEmptyStringSchema,
        renewalPriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/),
        downgradePlan: NonEmptyStringSchema,
        downgradeSeats: z.number().int().positive(),
        downgradePriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/)
      }).strict()
    ),
    previousRenewal: z
      .object({
        id: NonEmptyStringSchema,
        status: NonEmptyStringSchema,
        action: ControllerActionSchema.nullable(),
        amountAtomic: z.string().regex(/^(0|[1-9]\d*)$/).nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

export const AuditorContextSchema = z
  .object({
    snapshotVersion: z.literal(1),
    snapshotHash: z.string().regex(/^0x[a-f0-9]{64}$/),
    subscription: z
      .object({
        id: NonEmptyStringSchema,
        name: NonEmptyStringSchema,
        currentPlan: NonEmptyStringSchema,
        currentSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative(),
        renewalPriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/),
        downgradePlan: NonEmptyStringSchema,
        downgradeSeats: z.number().int().positive(),
        downgradePriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/)
      })
      .strict(),
    usageEvidence: z.array(
      z.object({
        id: NonEmptyStringSchema,
        purchasedSeats: z.number().int().nonnegative(),
        activeSeats: z.number().int().nonnegative()
      }).strict()
    ),
    billingEvidence: z.array(
      z.object({
        id: NonEmptyStringSchema,
        renewalPriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/),
        downgradePlan: NonEmptyStringSchema,
        downgradeSeats: z.number().int().positive(),
        downgradePriceAtomic: z.string().regex(/^(0|[1-9]\d*)$/)
      }).strict()
    ),
    previousRenewal: z
      .object({
        id: NonEmptyStringSchema,
        status: NonEmptyStringSchema,
        action: ControllerActionSchema.nullable(),
        targetPlan: z.string().nullable(),
        targetSeats: z.number().int().nonnegative().nullable(),
        amountAtomic: z.string().regex(/^(0|[1-9]\d*)$/).nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

export type OperationsProposal = z.infer<typeof OperationsProposalSchema>;
export type FinanceProposal = z.infer<typeof FinanceProposalSchema>;
export type AuditorProposal = z.infer<typeof AuditorProposalSchema>;
export type OperationsContext = z.infer<typeof OperationsContextSchema>;
export type FinanceContext = z.infer<typeof FinanceContextSchema>;
export type AuditorContext = z.infer<typeof AuditorContextSchema>;
