import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AtomicUsdcAmountSchema,
  ControllerActionSchema,
  ControllerDecisionProposalSchema,
  RenewalTermsSchema,
  SubscriptionSchema,
  canonicalizeJson,
  keccak256Hex,
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

  it("produces Ethereum Keccak-256 rather than NIST SHA3-256", () => {
    assert.equal(
      keccak256Hex(""),
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
    assert.equal(
      keccak256Hex("abc"),
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    );
    assert.notEqual(
      keccak256Hex("abc"),
      "0x3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532"
    );
  });

  it("allows an unresolved vendor in canonical terms without inventing an address", () => {
    const terms = RenewalTermsSchema.parse({
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

    assert.equal(terms.vendor, null);
    assert.equal(
      RenewalTermsSchema.safeParse({ ...terms, vendor: "vendor-address" }).success,
      false
    );
  });
});
