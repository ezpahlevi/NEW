import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";
import operationsInstructions from "../prompts/operations.md";
import {
  OperationsProposalSchema,
  type OperationsContext,
  type OperationsProposal
} from "./schemas.ts";

export function createOperationsAgent(
  model: AgentConfig["model"]
): (context: OperationsContext) => Promise<OperationsProposal> {
  const agent = new Agent({
    id: "new-operations-specialist",
    name: "Operations Agent",
    instructions: operationsInstructions,
    model,
    tools: {}
  });

  return async (context) => {
    const response = await agent.generate(JSON.stringify(context), {
      maxSteps: 1,
      structuredOutput: {
        schema: OperationsProposalSchema,
        errorStrategy: "strict"
      }
    });
    return OperationsProposalSchema.parse(response.object);
  };
}
