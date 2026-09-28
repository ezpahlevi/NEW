import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AtomicUsdcAmountSchema,
  ControllerActionSchema,
  ControllerDecisionProposalSchema,
  SubscriptionSchema,
  canonicalizeJson,
  sha256Hex
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

  it("canonicalizes object keys recursively while preserving array order", () => {
    assert.equal(
      canonicalizeJson({ z: 1, a: { y: 2, x: 3 }, items: ["b", "a"] }),
      '{"a":{"x":3,"y":2},"items":["b","a"],"z":1}'
    );
  });

  it("rejects values that are not deterministic JSON numbers or objects", () => {
    assert.throws(() => canonicalizeJson({ price: 36.5 }), TypeError);
    assert.throws(() => canonicalizeJson({ value: undefined }), TypeError);
    assert.throws(() => canonicalizeJson(new Date("2026-01-01")), TypeError);
    assert.throws(() => canonicalizeJson(new Array(1)), TypeError);
  });

  it("produces a stable 32-byte SHA-256 digest for canonical JSON", async () => {
    const first = await sha256Hex(canonicalizeJson({ b: 2, a: 1 }));
    const second = await sha256Hex(canonicalizeJson({ a: 1, b: 2 }));

    assert.match(first, /^0x[a-f0-9]{64}$/);
    assert.equal(
      first,
      "0x43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777"
    );
    assert.equal(first, second);
  });
});
