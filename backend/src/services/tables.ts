import {
  KnowledgeCategory,
  KnowledgeBaseItem,
  LearningTask,
  PersonaConfig,
  ReviewItem,
  RiskTip,
  RuleItem,
  ScriptItem,
} from "../types.js";
import { CsvTable } from "./csvStore.js";

export const learningTaskTable = new CsvTable<LearningTask>("learning_tasks.csv", [
  "id",
  "inputType",
  "content",
  "instruction",
  "status",
  "rawResult",
  "createdAt",
  "updatedAt",
]);

export const reviewItemTable = new CsvTable<ReviewItem>("review_items.csv", [
  "id",
  "learningTaskId",
  "type",
  "status",
  "payload",
  "targetId",
  "reviewedAt",
  "createdAt",
  "updatedAt",
]);

export const knowledgeBaseTable = new CsvTable<KnowledgeBaseItem>("knowledge_base_items.csv", [
  "id",
  "title",
  "content",
  "keywords",
  "category",
  "status",
  "sourceReviewId",
  "createdAt",
  "updatedAt",
]);

export const knowledgeCategoryTable = new CsvTable<KnowledgeCategory>("knowledge_categories.csv", [
  "id",
  "name",
  "createdAt",
  "updatedAt",
]);

export const ruleItemTable = new CsvTable<RuleItem>("rule_items.csv", [
  "id",
  "name",
  "trigger",
  "triggerKeywords",
  "action",
  "priority",
  "riskLevel",
  "status",
  "sourceReviewId",
  "createdAt",
  "updatedAt",
]);

export const scriptItemTable = new CsvTable<ScriptItem>("script_items.csv", [
  "id",
  "scene",
  "content",
  "tone",
  "status",
  "sourceReviewId",
  "createdAt",
  "updatedAt",
]);

export const riskTipTable = new CsvTable<RiskTip>("risk_tips.csv", [
  "id",
  "scene",
  "content",
  "status",
  "sourceReviewId",
  "createdAt",
  "updatedAt",
]);

export const personaConfigTable = new CsvTable<PersonaConfig>("persona_configs.csv", [
  "id",
  "name",
  "description",
  "tone",
  "styleRules",
  "forbiddenPhrases",
  "status",
  "createdAt",
  "updatedAt",
]);
