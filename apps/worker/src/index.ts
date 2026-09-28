import { Hono } from "hono";
export { runSpecialistAnalysis } from "./agents/specialists.ts";
import type { WorkerEnvironment } from "@new/shared";
import {
  ControllerActionSchema,
  WorkerEnvironmentSchema,
  WorkerHealthResponseSchema
} from "@new/shared";

const app = new Hono<{ Bindings: Env }>();

export async function createSpecialistAgents(
  environment: Pick<WorkerEnvironment, "LLM_API_KEY" | "LLM_MODEL">
) {
  const { createSpecialistAgents: create } = await import("./agents/index.ts");
  return create(environment);
}

app.use("*", async (context, next) => {
  const result = WorkerEnvironmentSchema.safeParse(context.env);

  if (!result.success) {
    const fields = result.error.issues.map((issue) =>
      issue.path.map(String).join(".")
    );

    return context.json({ code: "INVALID_WORKER_ENV", fields }, 500);
  }

  await next();
});

app.get("/health", (context) =>
  context.json(
    WorkerHealthResponseSchema.parse({
      status: "ok",
      controllerActions: ControllerActionSchema.options
    })
  )
);

export default app;
