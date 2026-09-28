import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MainnetChainNotConfiguredError,
  MainnetEnvironmentInvalidError,
  MainnetExecutionDisabledError,
  runMainnetMutation
} from "../src/security/mainnet-execution.ts";

describe("mainnet execution gate", () => {
  it("fails closed when the flag is missing or false", async () => {
    for (const environment of [{}, { MAINNET_EXECUTION_ENABLED: "false" }]) {
      let mutationInvoked = false;

      await assert.rejects(
        runMainnetMutation(environment, async () => {
          mutationInvoked = true;
          return "executed";
        }),
        MainnetExecutionDisabledError
      );
      assert.equal(mutationInvoked, false);
    }
  });

  it("blocks enabled execution until the Mainnet RPC and chain ID are configured", async () => {
    let mutationInvoked = false;

    await assert.rejects(
      runMainnetMutation({ MAINNET_EXECUTION_ENABLED: "true" }, async () => {
        mutationInvoked = true;
        return "executed";
      }),
      MainnetChainNotConfiguredError
    );
    assert.equal(mutationInvoked, false);
  });

  it("blocks invalid chain configuration without invoking the mutation", async () => {
    let mutationInvoked = false;

    await assert.rejects(
      runMainnetMutation(
        {
          MAINNET_EXECUTION_ENABLED: "true",
          ARC_CHAIN_ID: "5042002",
          ARC_RPC_URL: "https://rpc.example.test"
        },
        async () => {
          mutationInvoked = true;
          return "executed";
        }
      ),
      MainnetEnvironmentInvalidError
    );
    assert.equal(mutationInvoked, false);
  });

  it("allows a mocked mutation only when enabled with Mainnet configuration", async () => {
    const result = await runMainnetMutation(
      {
        MAINNET_EXECUTION_ENABLED: "true",
        ARC_CHAIN_ID: "5042",
        ARC_RPC_URL: "https://rpc.example.test"
      },
      async () => "executed"
    );

    assert.equal(result, "executed");
  });
});
