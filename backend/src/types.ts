export type LearningInputType = "natural_language" | "chat_history" | "business_rule";

export type ReviewItemType = "knowledge" | "rule" | "script" | "risk_tip";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ActiveStatus = "active" | "inactive";

export type LibraryType = "knowledge" | "rule" | "script" | "risk_tip";

export interface KnowledgeSuggestion {
  title: string;
  content: string;
  keywords: string[];
  category?: string;
}

export interface RuleSuggestion {
  name: string;
  trigger: string;
  triggerKeywords: string[];
  action: string;
  priority: number;
  riskLevel: "low" | "medium" | "high" | string;
}

export interface ScriptSuggestion {
  scene: string;
  content: string;
  tone?: string;
}

export interface RiskTipSuggestion {
  scene: string;
  content: string;
}

export interface LearningResult {
  summary: string;
  knowledgeSuggestions: KnowledgeSuggestion[];
  ruleSuggestions: RuleSuggestion[];
  scriptSuggestions: ScriptSuggestion[];
  riskTips: RiskTipSuggestion[];
}

export interface LearningTask {
  id: number;
  inputType: LearningInputType;
  content: string;
  instruction?: string;
  status: "generated";
  rawResult: LearningResult;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewItem {
  id: number;
  learningTaskId: number;
  type: ReviewItemType;
  status: ReviewStatus;
  payload: Record<string, unknown>;
  targetId?: number;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseItem {
  id: number;
  title: string;
  content: string;
  keywords: string[];
  category?: string;
  status: ActiveStatus;
  sourceReviewId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategory {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuleItem {
  id: number;
  name: string;
  trigger: string;
  triggerKeywords: string[];
  action: string;
  priority: number;
  riskLevel: string;
  status: ActiveStatus;
  sourceReviewId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptItem {
  id: number;
  scene: string;
  content: string;
  tone?: string;
  priority: number;
  status: ActiveStatus;
  sourceReviewId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskTip {
  id: number;
  scene: string;
  content: string;
  status: ActiveStatus;
  sourceReviewId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaConfig {
  id: number;
  name: string;
  description: string;
  tone: string;
  styleRules: string[];
  forbiddenPhrases: string[];
  status: ActiveStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReplyTestContext {
  knowledgeItems: KnowledgeBaseItem[];
  ruleItems: RuleItem[];
  scriptItems: ScriptItem[];
  riskTips: RiskTip[];
  persona?: PersonaConfig;
}

export interface ReplyTestResult {
  replies: string[];       // 3 ranked reply options (best first)
  matchedKnowledge: KnowledgeBaseItem[];
  matchedRules: RuleItem[];
  matchedScripts: ScriptItem[];
  riskTips: RiskTip[];
  persona?: PersonaConfig;
}
