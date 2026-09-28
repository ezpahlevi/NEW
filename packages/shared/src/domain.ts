import { z } from "zod";

export const AtomicUsdcAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Expected an integer atomic USDC amount");

export const EvmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const TransactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const ARC_CHAIN_ID = 5042;
export const ArcChainIdSchema = z.literal(ARC_CHAIN_ID);

export const ControllerActionSchema = z.enum([
  "KEEP",
  "DOWNGRADE",
  "CANCEL",
  "NEEDS_REVIEW"
]);

export const WorkerHealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    controllerActions: z.array(ControllerActionSchema)
  })
  .strict();

export const RenewalStatusSchema = z.enum([
  "CREATED",
  "ANALYZING",
  "CONTROLLER_DECISION",
  "CANCELLED",
  "WAITING_FOR_HUMAN",
  "PREPARING_ESCROW",
  "ESCROW_OPEN",
  "WAITING_FOR_VENDOR",
  "VERIFYING",
  "SETTLING",
  "SETTLED",
  "REFUNDING",
  "REFUNDED"
]);

const NonEmptyStringSchema = z.string().min(1);
const SeatCountSchema = z.number().int().nonnegative();
const NullableAtomicAmountSchema = AtomicUsdcAmountSchema.nullable();
const NullableHashSchema = TransactionHashSchema.nullable();

export const SubscriptionSchema = z
  .object({
    id: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    vendor: NonEmptyStringSchema,
    currentPlan: NonEmptyStringSchema,
    currentSeats: SeatCountSchema,
    activeSeats: SeatCountSchema,
    renewalPriceAtomic: AtomicUsdcAmountSchema,
    downgradePlan: NonEmptyStringSchema,
    downgradePriceAtomic: AtomicUsdcAmountSchema,
    downgradeSeats: z.number().int().positive(),
    renewalDate: NonEmptyStringSchema,
    vendorWallet: EvmAddressSchema.nullable(),
    status: NonEmptyStringSchema
  })
  .strict()
  .superRefine((subscription, context) => {
    if (subscription.activeSeats > subscription.currentSeats) {
      context.addIssue({
        code: "custom",
        path: ["activeSeats"],
        message: "Active seats cannot exceed purchased seats"
      });
    }
  });

export const DemoSaaSSubscriptionStateSchema = z
  .object({
    plan: NonEmptyStringSchema,
    seats: SeatCountSchema,
    active: z.boolean()
  })
  .strict();

export const RenewalSchema = z
  .object({
    id: NonEmptyStringSchema,
    subscriptionId: NonEmptyStringSchema,
    workflowId: NonEmptyStringSchema.nullable(),
    snapshotHash: NullableHashSchema,
    status: RenewalStatusSchema,
    targetPlan: z.string().nullable(),
    targetSeats: SeatCountSchema.nullable(),
    amountAtomic: NullableAtomicAmountSchema,
    decisionHash: NullableHashSchema,
    termsHash: NullableHashSchema,
    createdAt: NonEmptyStringSchema,
    completedAt: z.string().nullable()
  })
  .strict();

export const EvidenceSchema = z
  .object({
    id: NonEmptyStringSchema,
    renewalId: NonEmptyStringSchema,
    canonicalJson: NonEmptyStringSchema,
    hash: TransactionHashSchema,
    createdAt: NonEmptyStringSchema
  })
  .strict();

export const AgentRoleSchema = z.enum(["OPERATIONS", "FINANCE", "AUDITOR"]);

export const AgentReportSchema = z
  .object({
    id: NonEmptyStringSchema,
    renewalId: NonEmptyStringSchema,
    role: AgentRoleSchema,
    verdict: ControllerActionSchema,
    reasonCodes: z.array(NonEmptyStringSchema),
    summary: NonEmptyStringSchema,
    evidenceRefs: z.array(NonEmptyStringSchema),
    model: NonEmptyStringSchema,
    createdAt: NonEmptyStringSchema
  })
  .strict();

export const ControllerDecisionProposalSchema = z
  .object({
    action: ControllerActionSchema,
    targetPlan: z.string().nullable(),
    targetSeats: SeatCountSchema.nullable(),
    rationale: NonEmptyStringSchema,
    supportingEvidenceRefs: z.array(NonEmptyStringSchema)
  })
  .strict();

// Only the backend-bound decision carries an amount derived from verified plan data.
export const ControllerDecisionSchema = z
  .object({
    action: ControllerActionSchema,
    targetPlan: z.string().nullable(),
    targetSeats: SeatCountSchema.nullable(),
    amountAtomic: NullableAtomicAmountSchema,
    rationale: NonEmptyStringSchema,
    supportingEvidenceRefs: z.array(NonEmptyStringSchema)
  })
  .strict();

export const EscrowStatusSchema = z.enum(["NONE", "OPEN", "SETTLED", "REFUNDED"]);

export const EscrowStateSchema = z
  .object({
    renewalId: NonEmptyStringSchema,
    status: EscrowStatusSchema,
    contractAddress: EvmAddressSchema.nullable(),
    chainId: ArcChainIdSchema.nullable(),
    openTxHash: NullableHashSchema,
    amountAtomic: NullableAtomicAmountSchema,
    expiresAt: z.string().nullable()
  })
  .strict();

export const SettlementStateSchema = z
  .object({
    renewalId: NonEmptyStringSchema,
    evidenceHash: NullableHashSchema,
    settleTxHash: NullableHashSchema,
    refundTxHash: NullableHashSchema,
    settledAt: z.string().nullable(),
    refundedAt: z.string().nullable()
  })
  .strict();

export type AtomicUsdcAmount = z.infer<typeof AtomicUsdcAmountSchema>;
export type ControllerAction = z.infer<typeof ControllerActionSchema>;
export type WorkerHealthResponse = z.infer<typeof WorkerHealthResponseSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type DemoSaaSSubscriptionState = z.infer<
  typeof DemoSaaSSubscriptionStateSchema
>;
export type Renewal = z.infer<typeof RenewalSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentReport = z.infer<typeof AgentReportSchema>;
export type ControllerDecisionProposal = z.infer<
  typeof ControllerDecisionProposalSchema
>;
export type ControllerDecision = z.infer<typeof ControllerDecisionSchema>;
export type EscrowState = z.infer<typeof EscrowStateSchema>;
export type SettlementState = z.infer<typeof SettlementStateSchema>;
