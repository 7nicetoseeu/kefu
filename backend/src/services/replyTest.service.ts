import { AppError } from "../utils/response.js";
import { generateReplyResult } from "./ai.service.js";
import { getActivePersonaConfig } from "./persona.service.js";
import { knowledgeBaseTable, riskTipTable, ruleItemTable, scriptItemTable } from "./tables.js";

export interface ChatMessage {
  role: "customer" | "agent";
  content: string;
}

export interface ReplyTestRequest {
  customerMessage: string;
  history?: ChatMessage[];
}

export async function runReplyTest(input: ReplyTestRequest) {
  if (!input.customerMessage || input.customerMessage.trim().length === 0) {
    throw new AppError(400, "customerMessage is required");
  }

  const [knowledgeItems, ruleItems, scriptItems, riskTips, persona] = await Promise.all([
    knowledgeBaseTable.all(),
    ruleItemTable.all(),
    scriptItemTable.all(),
    riskTipTable.all(),
    getActivePersonaConfig(),
  ]);

  const context = {
    knowledgeItems: knowledgeItems.filter((item) => item.status === "active"),
    ruleItems: ruleItems.filter((item) => item.status === "active"),
    scriptItems: scriptItems.filter((item) => item.status === "active"),
    riskTips: riskTips.filter((item) => item.status === "active"),
    persona,
  };

  return generateReplyResult({
    customerMessage: input.customerMessage,
    history: input.history ?? [],
    context,
  });
}
