import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WebEnvironmentSchema,
  WorkerEnvironmentSchema
} from "../src/index.ts";

describe("environment schemas", () => {
  it("allows integrations to remain unset before their implementation phase", () => {
    assert.equal(WorkerEnvironmentSchema.parse({}).LLM_API_KEY, undefined);
    assert.equal(WebEnvironmentSchema.parse({}).NEXT_PUBLIC_API_URL, undefined);
  });

  it("validates configured URLs and chain IDs", () => {
    assert.equal(
      WorkerEnvironmentSchema.safeParse({ ARC_RPC_URL: "not-a-url" }).success,
      false
    );
    assert.equal(
      WorkerEnvironmentSchema.safeParse({ ARC_CHAIN_ID: "0" }).success,
      false
    );
    assert.equal(
      WorkerEnvironmentSchema.safeParse({ ARC_CHAIN_ID: "5042" }).success,
      true
    );
    assert.equal(
      WorkerEnvironmentSchema.safeParse({ ARC_CHAIN_ID: "5042002" }).success,
      false
    );
    assert.equal(
      WorkerEnvironmentSchema.parse({
        ARC_RPC_URL: "https://rpc.example.test",
        ARC_CHAIN_ID: "5042"
      }).ARC_CHAIN_ID,
      5042
    );
  });

  it("defaults mainnet execution to disabled and validates explicit settings", () => {
    assert.equal(WorkerEnvironmentSchema.parse({}).MAINNET_EXECUTION_ENABLED, false);
    assert.equal(
      WorkerEnvironmentSchema.parse({ MAINNET_EXECUTION_ENABLED: "false" })
        .MAINNET_EXECUTION_ENABLED,
      false
    );
    assert.equal(
      WorkerEnvironmentSchema.parse({ MAINNET_EXECUTION_ENABLED: "true" })
        .MAINNET_EXECUTION_ENABLED,
      true
    );
    assert.equal(
      WorkerEnvironmentSchema.safeParse({ MAINNET_EXECUTION_ENABLED: "yes" })
        .success,
      false
    );
  });

  it("requires the internal token for the container executor mode", () => {
    assert.equal(
      WorkerEnvironmentSchema.safeParse({
        WALLET_EXECUTOR_MODE: "container"
      }).success,
      false
    );
    assert.equal(
      WorkerEnvironmentSchema.safeParse({
        WALLET_EXECUTOR_MODE: "direct"
      }).success,
      true
    );
  });
});
