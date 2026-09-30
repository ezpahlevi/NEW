import { createOpenAI } from "@ai-sdk/openai";
import type { WorkerEnvironment } from "@new/shared";
import { createAuditorAgent } from "./auditor.ts";
import { createControllerAgentWithModel } from "./controller-agent.ts";
import { createFinanceAgent } from "./finance.ts";
import { createOperationsAgent } from "./operations.ts";

export type SpecialistAgents = ReturnType<typeof createSpecialistAgents>;

export class SpecialistAgentConfigurationError extends Error {
  readonly code = "AGENT_CONFIGURATION_MISSING";

  constructor() {
    super("LLM_API_KEY and LLM_MODEL are required to run specialist agents");
    this.name = "SpecialistAgentConfigurationError";
  }
}

export function createSpecialistAgents(
  environment: Pick<WorkerEnvironment, "LLM_API_KEY" | "LLM_MODEL">
) {
  const apiKey = environment.LLM_API_KEY?.trim();
  const modelId = environment.LLM_MODEL?.trim();
  if (!apiKey || !modelId) {
    throw new SpecialistAgentConfigurationError();
  }

  const model = createOpenAI({ apiKey }).chat(modelId);
  return {
    OPERATIONS: createOperationsAgent(model),
    FINANCE: createFinanceAgent(model),
    AUDITOR: createAuditorAgent(model),
    modelId
  };
}

export class ControllerAgentConfigurationError extends Error {
  readonly code = "AGENT_CONFIGURATION_MISSING";

  constructor() {
    super("LLM_API_KEY and LLM_MODEL are required to run the Controller Agent");
    this.name = "ControllerAgentConfigurationError";
  }
}

export function createControllerAgent(
  environment: Pick<WorkerEnvironment, "LLM_API_KEY" | "LLM_MODEL">
) {
  const apiKey = environment.LLM_API_KEY?.trim();
  const modelId = environment.LLM_MODEL?.trim();
  if (!apiKey || !modelId) {
    throw new ControllerAgentConfigurationError();
  }

  const model = createOpenAI({ apiKey }).chat(modelId);
  return {
    analyze: createControllerAgentWithModel(model),
    modelId
  };
}
