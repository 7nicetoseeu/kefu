import { Router } from "express";
import { asyncHandler, sendSuccess } from "../utils/response.js";
import { searchKnowledge } from "../services/library.service.js";
import { searchMappings } from "../services/keywordMapping.service.js";
import { knowledgeBaseTable, ruleItemTable, scriptItemTable, riskTipTable } from "../services/tables.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const keyword = (req.query.keyword as string) ?? "";
    if (!keyword.trim()) {
      sendSuccess(res, {
        knowledge: [],
        rules: [],
        scripts: [],
        riskTips: [],
        customMappings: [],
      });
      return;
    }

    const lower = keyword.toLowerCase();
    const terms = lower.split(/[\s,，。！？、；：""''【】《》（）()]+/).filter(Boolean);

    function matchText(...texts: (string | undefined | null)[]): boolean {
      return texts.some((t) => {
        if (!t) return false;
        const lt = t.toLowerCase();
        if (lt.includes(lower)) return true;
        return terms.some((term) => lt.includes(term));
      });
    }

    // 搜索知识库
    const knowledgeResults = await searchKnowledge(keyword, 5);

    // 搜索规则
    const allRules = await ruleItemTable.all();
    const activeRules = allRules.filter((r) => r.status === "active");
    const matchedRules = activeRules
      .filter((r) => matchText(r.name, r.trigger, ...r.triggerKeywords))
      .slice(0, 5);

    // 搜索话术（按优先级降序排列）
    const allScripts = await scriptItemTable.all();
    const activeScripts = allScripts.filter((s) => s.status === "active");
    const matchedScripts = activeScripts
      .filter((s) => matchText(s.scene, s.content))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .slice(0, 5);

    // 搜索风险提示
    const allRiskTips = await riskTipTable.all();
    const activeRiskTips = allRiskTips.filter((t) => t.status === "active");
    const matchedRiskTips = activeRiskTips
      .filter((t) => matchText(t.scene, t.content))
      .slice(0, 5);

    // 搜索自定义关键词映射（按匹配度+优先级排序）
    const customMappings = await searchMappings(keyword);

    sendSuccess(res, {
      knowledge: knowledgeResults,
      rules: matchedRules,
      scripts: matchedScripts,
      riskTips: matchedRiskTips,
      customMappings,
    });
  })
);

export default router;
