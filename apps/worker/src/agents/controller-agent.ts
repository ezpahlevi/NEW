import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";
import { ControllerDecisionProposalSchema } from "@new/shared";
import controllerInstructions from "../prompts/controller.md";
import type { ControllerContext, ControllerProposal } from "./schemas.ts";

export function createControllerAgentWithModel(
  model: AgentConfig["model"]
): (context: ControllerContext) => Promise<ControllerProposal> {
  const agent = new Agent({
    id: "new-controller",
    name: "Controller Agent",
    instructions: controllerInstructions,
    model,
    tools: {}
  });

  return async (context) => {
    const response = await agent.generate(JSON.stringify(context), {
      maxSteps: 1,
      structuredOutput: {
        schema: ControllerDecisionProposalSchema,
        errorStrategy: "strict"
      }
    });
    return ControllerDecisionProposalSchema.parse(response.object);
  };
}
