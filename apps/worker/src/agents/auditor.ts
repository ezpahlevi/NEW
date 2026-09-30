import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";
import auditorInstructions from "../prompts/auditor.md";
import {
  AuditorProposalSchema,
  type AuditorContext,
  type AuditorProposal
} from "./schemas.ts";

export function createAuditorAgent(
  model: AgentConfig["model"]
): (context: AuditorContext) => Promise<AuditorProposal> {
  const agent = new Agent({
    id: "new-auditor-specialist",
    name: "Auditor Agent",
    instructions: auditorInstructions,
    model,
    tools: {}
  });

  return async (context) => {
    const response = await agent.generate(JSON.stringify(context), {
      maxSteps: 1,
      structuredOutput: {
        schema: AuditorProposalSchema,
        errorStrategy: "strict"
      }
    });
    return AuditorProposalSchema.parse(response.object);
  };
}
