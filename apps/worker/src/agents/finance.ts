import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";
import financeInstructions from "../prompts/finance.md";
import {
  FinanceProposalSchema,
  type FinanceContext,
  type FinanceProposal
} from "./schemas.ts";

export function createFinanceAgent(
  model: AgentConfig["model"]
): (context: FinanceContext) => Promise<FinanceProposal> {
  const agent = new Agent({
    id: "new-finance-specialist",
    name: "Finance Agent",
    instructions: financeInstructions,
    model,
    tools: {}
  });

  return async (context) => {
    const response = await agent.generate(JSON.stringify(context), {
      maxSteps: 1,
      structuredOutput: {
        schema: FinanceProposalSchema,
        errorStrategy: "strict"
      }
    });
    return FinanceProposalSchema.parse(response.object);
  };
}
