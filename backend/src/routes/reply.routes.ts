import { Router } from "express";
import { runReplyTest } from "../services/replyTest.service.js";
import { polishReplyResult } from "../services/ai.service.js";
import { getActivePersonaConfig } from "../services/persona.service.js";
import { knowledgeBaseTable, riskTipTable, ruleItemTable, scriptItemTable } from "../services/tables.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const data = await runReplyTest(req.body);
    sendSuccess(res, data);
  }),
);

router.post(
  "/polish",
  asyncHandler(async (req, res) => {
    const { draft } = req.body;
    if (!draft || draft.trim().length === 0) {
      return res.status(400).json({ success: false, error: { message: "draft is required" } });
    }

    const [knowledgeItems, ruleItems, scriptItems, riskTips, persona] = await Promise.all([
      knowledgeBaseTable.all(),
      ruleItemTable.all(),
      scriptItemTable.all(),
      riskTipTable.all(),
      getActivePersonaConfig(),
    ]);

    const data = await polishReplyResult({
      draft: draft.trim(),
      context: {
        knowledgeItems: knowledgeItems.filter((item) => item.status === "active"),
        ruleItems: ruleItems.filter((item) => item.status === "active"),
        scriptItems: scriptItems.filter((item) => item.status === "active"),
        riskTips: riskTips.filter((item) => item.status === "active"),
        persona,
      },
    });
    sendSuccess(res, data);
  }),
);

export default router;
