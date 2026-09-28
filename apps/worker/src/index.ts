import { Hono } from "hono";
import {
  ControllerActionSchema,
  WorkerEnvironmentSchema,
  WorkerHealthResponseSchema
} from "@new/shared";

const app = new Hono<{ Bindings: Env }>();

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
