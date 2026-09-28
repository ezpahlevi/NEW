import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkerEnvironmentSchema } from "@new/shared";
import app from "../src/index.ts";

describe("worker environment validation", () => {
  it("accepts unconfigured future integrations", () => {
    assert.equal(WorkerEnvironmentSchema.safeParse({}).success, true);
  });

  it("rejects malformed addresses without exposing their values", () => {
    const result = WorkerEnvironmentSchema.safeParse({
      USDC_ADDRESS: "not-an-address"
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(result.error.issues[0]?.path, ["USDC_ADDRESS"]);
    }
  });

  it("serves a health response validated against the shared schema", async () => {
    const response = await app.request("http://localhost/health", {}, {});

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      controllerActions: ["KEEP", "DOWNGRADE", "CANCEL", "NEEDS_REVIEW"]
    });
  });

  it("returns only field paths for invalid Worker configuration", async () => {
    const response = await app.request("http://localhost/health", {}, {
      USDC_ADDRESS: "private-invalid-value"
    });
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.match(body, /INVALID_WORKER_ENV/);
    assert.match(body, /USDC_ADDRESS/);
    assert.equal(body.includes("private-invalid-value"), false);
  });
});
