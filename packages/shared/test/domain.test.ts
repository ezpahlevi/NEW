import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AtomicUsdcAmountSchema,
  ControllerActionSchema,
  ControllerDecisionProposalSchema,
  SubscriptionSchema
} from "../src/index.ts";

describe("shared domain schemas", () => {
  it("accepts only integer atomic USDC strings", () => {
    assert.equal(AtomicUsdcAmountSchema.parse("36000000"), "36000000");
    assert.equal(AtomicUsdcAmountSchema.safeParse(36).success, false);
    assert.equal(AtomicUsdcAmountSchema.safeParse("36.00").success, false);
    assert.equal(AtomicUsdcAmountSchema.safeParse("01").success, false);
  });

  it("constrains controller actions to the PRD action set", () => {
    assert.deepEqual(ControllerActionSchema.options, [
      "KEEP",
      "DOWNGRADE",
      "CANCEL",
      "NEEDS_REVIEW"
    ]);
    assert.equal(ControllerActionSchema.safeParse("SETTLED").success, false);
  });

  it("keeps payment amounts out of the untrusted controller proposal", () => {
    const result = ControllerDecisionProposalSchema.safeParse({
      action: "DOWNGRADE",
      targetPlan: "professional-3-seat",
      targetSeats: 3,
      amountAtomic: "36000000",
      rationale: "Unused seats can be removed.",
      supportingEvidenceRefs: ["usage_001"]
    });

    assert.equal(result.success, false);
  });

  it("rejects subscription usage above purchased seat count", () => {
    const result = SubscriptionSchema.safeParse({
      id: "sub-1",
      name: "Figma Professional",
      vendor: "Figma",
      currentPlan: "professional-8-seat",
      currentSeats: 8,
      activeSeats: 9,
      renewalPriceAtomic: "96000000",
      downgradePlan: "professional-3-seat",
      downgradePriceAtomic: "36000000",
      downgradeSeats: 3,
      renewalDate: "2026-10-01",
      vendorWallet: null,
      status: "ACTIVE"
    });

    assert.equal(result.success, false);
  });

  it("requires a positive configured downgrade seat count", () => {
    const result = SubscriptionSchema.safeParse({
      id: "sub-1",
      name: "Figma Professional",
      vendor: "Figma",
      currentPlan: "professional-8-seat",
      currentSeats: 8,
      activeSeats: 3,
      renewalPriceAtomic: "96000000",
      downgradePlan: "professional-3-seat",
      downgradePriceAtomic: "36000000",
      downgradeSeats: 0,
      renewalDate: "2026-10-01",
      vendorWallet: null,
      status: "ACTIVE"
    });

    assert.equal(result.success, false);
  });
});
