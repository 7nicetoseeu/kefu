import { LearningInputType, LearningResult, ReplyTestContext, ReplyTestResult } from "../types.js";

export interface GenerateLearningInput {
  inputType: LearningInputType;
  content: string;
  instruction?: string;
}

export interface ChatHistoryMessage {
  role: "customer" | "agent";
  content: string;
}

export interface GenerateReplyInput {
  customerMessage: string;
  history?: ChatHistoryMessage[];
  context: ReplyTestContext;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateLearningResult(input: GenerateLearningInput): Promise<LearningResult> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY;

  if (provider !== "mock" && apiKey) {
    return generateRealResult(input, provider, apiKey);
  }

  return generateMockResult(input);
}

export async function generateReplyResult(input: GenerateReplyInput): Promise<ReplyTestResult> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY;

  if (provider !== "mock" && apiKey) {
    return generateRealReplyResult(input, provider, apiKey);
  }

  return generateMockReplyResult(input);
}

export interface PolishReplyInput {
  draft: string;
  context: ReplyTestContext;
}

export async function polishReplyResult(input: PolishReplyInput): Promise<ReplyTestResult> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY;

  if (provider !== "mock" && apiKey) {
    return generateRealPolishResult(input, provider, apiKey);
  }

  return generateMockPolishResult(input);
}

// ---------------------------------------------------------------------------
// AI Classification — narrow down knowledge base by category before matching
// ---------------------------------------------------------------------------

const CLASSIFY_SYSTEM_PROMPT = `你是一个客服消息分类助手。根据客户消息，判断它属于哪个业务分类。

请严格按以下 JSON 格式返回（只返回 JSON）：
{ "categories": ["分类1", "分类2"] }

最多返回 2 个最相关的分类。如果无法判断，返回 ["通用"]。`;

export async function classifyMessage(
  message: string,
  availableCategories: string[],
): Promise<string[]> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY;

  // Use AI if available, otherwise heuristic
  if (provider !== "mock" && apiKey) {
    try {
      const catsText = availableCategories.filter(Boolean).join("、");
      const userPrompt = `可用分类：${catsText}\n\n客户消息：${message}\n\n请判断这条消息最可能属于哪个分类。`;
      const raw = await callAI(provider, apiKey, CLASSIFY_SYSTEM_PROMPT, userPrompt, 64);
      const parsed = JSON.parse(extractJson(raw));
      if (Array.isArray(parsed.categories)) {
        return parsed.categories.map(String).filter((c: string) => availableCategories.includes(c));
      }
    } catch {
      // Fall through to heuristic
    }
  }

  return heuristicClassify(message, availableCategories);
}

/** Fast keyword-based classification when AI is unavailable. */
function heuristicClassify(message: string, categories: string[]): string[] {
  const normalized = message.toLowerCase();
  const scored = categories
    .filter(Boolean)
    .map((cat) => {
      let score = 0;
      // Direct category name match
      if (normalized.includes(cat.toLowerCase())) score += 10;
      // Category-specific keywords
      const keywords: Record<string, string[]> = {
        "物流": ["快递", "物流", "配送", "发货", "没到", "未到", "延误", "派送", "运输", "仓库", "揽收", "慢", "太慢"],
        "售后": ["退货", "换货", "质量", "坏了", "瑕疵", "破损", "赔偿", "维修", "保修", "有问题"],
        "退款": ["退款", "退钱", "钱", "到账", "返还", "退回", "退了"],
        "开场": ["你好", "您好", "在吗", "hi", "hello", "请问"],
        "结束": ["谢谢", "感谢", "再见", "拜拜", "拜", "好的谢谢"],
        "等待": ["等", "稍等", "耐心", "核实", "查询中", "稍候"],
        "投诉": ["投诉", "举报", "差评", "不满", "生气", "严重", "过分", "太差", "什么态度"],
        "通用": ["帮助", "请问", "咨询", "了解", "问题", "怎么"],
      };
      const kw = keywords[cat] ?? [];
      kw.forEach((w) => { if (normalized.includes(w)) score += 2; });
      return { cat, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 2).map((s) => s.cat);
  return top.length > 0 ? top : ["通用"];
}

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
  latencyMs: number;
}

export async function testAiConnection(): Promise<AiTestResult> {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";

  if (provider === "mock" || !apiKey) {
    return {
      ok: true,
      provider,
      model,
      message: "当前为 Mock 模式，无需 AI API Key，系统可正常运行。如需使用真实 AI，请配置 backend/.env 中的 AI_API_KEY。",
      latencyMs: 0,
    };
  }

  const start = Date.now();
  try {
    await callAI(provider, apiKey, "你是一个助手。", "请回复：OK", 32);
    return {
      ok: true,
      provider,
      model,
      message: "AI 连接测试成功！配置正确，系统将使用真实大模型生成内容。",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      model,
      message: `AI 连接失败：${error instanceof Error ? error.message : "未知错误"}`,
      latencyMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Real AI integration (Anthropic / OpenAI-compatible)
// ---------------------------------------------------------------------------

const LEARNING_SYSTEM_PROMPT = `你是一个客服培训 AI 助手。根据用户提供的调教内容，生成结构化的客服学习结果。

请严格按以下 JSON 格式返回（只返回 JSON，不要加任何其他文字或代码块标记）：

{
  "summary": "一段话总结本次学习要点",
  "knowledgeSuggestions": [
    {
      "title": "知识点标题",
      "content": "知识点详细说明",
      "keywords": ["关键词1", "关键词2"],
      "category": "分类（如：物流、售后、通用）"
    }
  ],
  "ruleSuggestions": [
    {
      "name": "规则名称",
      "trigger": "触发条件描述",
      "triggerKeywords": ["触发关键词1", "触发关键词2"],
      "action": "应执行的操作说明",
      "priority": 80,
      "riskLevel": "low | medium | high"
    }
  ],
  "scriptSuggestions": [
    {
      "scene": "适用场景",
      "content": "推荐话术内容",
      "tone": "polite | friendly | professional"
    }
  ],
  "riskTips": [
    {
      "scene": "风险场景",
      "content": "风险提示内容"
    }
  ]
}

重要：priority 取值 0-100，数字越大优先级越高；riskLevel 只取 "low"、"medium"、"high"。`;

const REPLY_SYSTEM_PROMPT = `你是一个客服辅助 AI。根据以下知识库、规则库、话术库、风险提示和人设配置，为客服人员生成 5 条推荐回复，按优先级从高到低排列。

请严格按以下 JSON 格式返回（只返回 JSON）：

{
  "replies": [
    "推荐回复 1（最佳匹配，最推荐）",
    "推荐回复 2（备选方案 1）",
    "推荐回复 3（备选方案 2）",
    "推荐回复 4（备选方案 3）",
    "推荐回复 5（备选方案 4）"
  ]
}

要求：
- 5 条回复必须全部输出，不允许省略
- 第 1 条应最贴合当前场景、话术最准确
- 第 2-5 条应有差异化（不同话术风格、语气或侧重点），给客服提供真正有意义的选项
- 每条回复独立完整，可直接使用`;

const POLISH_SYSTEM_PROMPT = `你是一个客服回复润色助手。客服人员会给你一条草稿回复，你需要将其优化为更专业、更礼貌、更得体的正式回复，但保持原意不变。

请严格按以下 JSON 格式返回（只返回 JSON）：

{
  "replies": [
    "润色版 1（标准专业风格 — 正式、礼貌、周全）",
    "润色版 2（亲切友好风格 — 温暖、有亲和力）",
    "润色版 3（简洁高效风格 — 直奔主题、不拖沓）"
  ]
}

要求：
- 3 条润色回复必须全部输出，不允许省略
- 保持原始回复的核心意思，不要添加原文没有的内容
- 三种风格有明显区分，给客服提供真正有意义的选项
- 每条回复独立完整，可直接使用`;

async function generateRealResult(
  input: GenerateLearningInput,
  provider: string,
  apiKey: string,
): Promise<LearningResult> {
  const instruction = input.instruction ?? "请从以上内容中总结客服辅助 Agent 可以学习的知识点、处理规则、推荐话术和风险提示。";

  const userPrompt = `【输入类型】${inputLabel(input.inputType)}\n【调教内容】\n${input.content}\n【补充指令】${instruction}`;

  const jsonText = await callAI(provider, apiKey, LEARNING_SYSTEM_PROMPT, userPrompt, 2048);

  return parseLearningResult(jsonText);
}

async function generateRealReplyResult(
  input: GenerateReplyInput,
  provider: string,
  apiKey: string,
): Promise<ReplyTestResult> {
  const { context, customerMessage, history } = input;

  // ── Stage 1: Classify customer message → narrow knowledge by category ──
  const allCategories = [...new Set(context.knowledgeItems.map((i) => i.category).filter(isNonEmptyString))];
  const matchedCats = allCategories.length > 1
    ? await classifyMessage(customerMessage, allCategories)
    : allCategories;

  // Filter knowledge items: prefer category-matched ones, fall back to all
  let filteredKnowledge = context.knowledgeItems.filter(
    (item) => matchedCats.includes(item.category ?? ""),
  );
  if (filteredKnowledge.length < 3) {
    // Too few matched — fall back to full set
    filteredKnowledge = context.knowledgeItems;
  }

  // ── Stage 2: Build AI prompt with filtered knowledge ──
  const knowledgeText = filteredKnowledge.map((item) => `- [${item.title}] ${item.content}`).join("\n");
  const rulesText = context.ruleItems
    .map((item) => `- [${item.name}] 触发: ${item.trigger} → 执行: ${item.action} (优先级: ${item.priority})`)
    .join("\n");
  const scriptsText = context.scriptItems.map((item) => `- [${item.scene}] ${item.content}`).join("\n");
  const riskText = context.riskTips.map((item) => `- [${item.scene}] ${item.content}`).join("\n");
  const personaText = context.persona
    ? `名称: ${context.persona.name}\n描述: ${context.persona.description}\n语气: ${context.persona.tone}\n风格规则: ${context.persona.styleRules.join("；")}\n禁用表达: ${context.persona.forbiddenPhrases.join("；")}`
    : "未配置人设";

  const systemPrompt = `${REPLY_SYSTEM_PROMPT}

客户消息分类：${matchedCats.join("、")}

可用知识库（已按分类筛选）：
${knowledgeText || "无"}

策略规则库：
${rulesText || "无"}

话术库：
${scriptsText || "无"}

风险提示：
${riskText || "无"}

人设配置：
${personaText}`;

  // Build conversation history section
  let historySection = "";
  if (history && history.length > 0) {
    const historyLines = history.map((msg) => {
      const roleLabel = msg.role === "customer" ? "客户" : "客服";
      return `${roleLabel}：${msg.content}`;
    }).join("\n");
    historySection = `\n\n对话历史：\n${historyLines}\n\n请基于对话历史理解上下文，生成连贯的回复。`;
  }

  const userPrompt = `客户消息：${customerMessage}${historySection}\n\n请根据以上配置和对话上下文生成合适的客服推荐回复。`;

  const jsonText = await callAI(provider, apiKey, systemPrompt, userPrompt, 1024);

  const parsed = parseReplyResult(jsonText);

  // Use the real reply but still compute matching context items client-side
  const matchedKnowledge = context.knowledgeItems.filter((item) =>
    includesAny(customerMessage, [item.title, item.content, item.category, ...item.keywords]),
  );
  const matchedRules = context.ruleItems
    .filter((item) => includesAny(customerMessage, [item.name, item.trigger, ...item.triggerKeywords]))
    .sort((a, b) => b.priority - a.priority);
  const matchedScripts = context.scriptItems.filter((item) =>
    includesAny(customerMessage, [item.scene, item.content]),
  );
  const matchedRisks = context.riskTips.filter((item) =>
    includesAny(customerMessage, [item.scene, item.content]),
  );

  return {
    replies: parsed.replies,
    matchedKnowledge,
    matchedRules,
    matchedScripts,
    riskTips: matchedRisks,
    persona: context.persona,
  };
}

// ---------------------------------------------------------------------------
// Low-level AI API call
// ---------------------------------------------------------------------------

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callAI(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const baseUrl = process.env.AI_API_BASE_URL ?? "";
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";

  const endpoint = resolveEndpoint(provider, baseUrl);
  const headers = buildHeaders(provider, apiKey);
  const body = buildRequestBody(provider, model, systemPrompt, userPrompt, maxTokens);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  return extractContent(provider, data);
}

function resolveEndpoint(provider: string, baseUrl: string): string {
  // If user provides a full base URL, use it
  if (baseUrl) {
    return baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
  }

  // Default endpoints
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "deepseek":
      return "https://api.deepseek.com/v1/chat/completions";
    default:
      // Assume OpenAI-compatible endpoint
      return "https://api.openai.com/v1/chat/completions";
  }
}

function buildHeaders(provider: string, apiKey: string): Record<string, string> {
  const lower = provider.toLowerCase();

  if (lower === "anthropic") {
    return {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function buildRequestBody(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): unknown {
  const lower = provider.toLowerCase();

  if (lower === "anthropic") {
    return {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };
  }

  // OpenAI-compatible format
  return {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
}

function extractContent(provider: string, data: Record<string, unknown>): string {
  const lower = provider.toLowerCase();

  if (lower === "anthropic") {
    const content = (data as Record<string, unknown>).content as Array<{ type: string; text: string }> | undefined;
    if (content && content.length > 0) {
      return content[0].text ?? "";
    }
    throw new Error("Unexpected Anthropic response format");
  }

  // OpenAI-compatible
  const choices = data.choices as Array<{ message: { content: string } }> | undefined;
  if (choices && choices.length > 0) {
    return choices[0].message.content ?? "";
  }
  throw new Error("Unexpected API response format");
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function inputLabel(type: string): string {
  switch (type) {
    case "natural_language":
      return "自然语言描述";
    case "chat_history":
      return "历史聊天记录";
    case "business_rule":
      return "业务规则";
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// JSON parsing (robust — handles code-fenced responses)
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  const trimmed = text.trim();

  // Try to extract from ```json ... ``` code block
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    return codeFenceMatch[1].trim();
  }

  return trimmed;
}

function parseLearningResult(raw: string): LearningResult {
  const jsonText = extractJson(raw);
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI 返回的内容不是合法 JSON，请重试。原始返回: " + raw.slice(0, 300));
  }

  // Validate and coerce the structure
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";

  const knowledgeSuggestions = Array.isArray(parsed.knowledgeSuggestions)
    ? parsed.knowledgeSuggestions.map(coerceKnowledge)
    : [];
  const ruleSuggestions = Array.isArray(parsed.ruleSuggestions)
    ? parsed.ruleSuggestions.map(coerceRule)
    : [];
  const scriptSuggestions = Array.isArray(parsed.scriptSuggestions)
    ? parsed.scriptSuggestions.map(coerceScript)
    : [];
  const riskTips = Array.isArray(parsed.riskTips)
    ? parsed.riskTips.map(coerceRiskTip)
    : [];

  return { summary, knowledgeSuggestions, ruleSuggestions, scriptSuggestions, riskTips };
}

function parseReplyResult(raw: string): { replies: string[] } {
  const jsonText = extractJson(raw);
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // If AI returned plain text, wrap as single reply
    return { replies: [raw.trim()] };
  }

  // Support new format: { "replies": [...] }
  if (Array.isArray(parsed.replies) && parsed.replies.length > 0) {
    return { replies: parsed.replies.map(String) };
  }

  // Fallback: old format { "reply": "..." }
  if (typeof parsed.reply === "string") {
    return { replies: [parsed.reply] };
  }

  return { replies: [raw.trim()] };
}

function coerceKnowledge(item: unknown) {
  const obj = item as Record<string, unknown> | null | undefined;
  return {
    title: String(obj?.title ?? ""),
    content: String(obj?.content ?? ""),
    keywords: Array.isArray(obj?.keywords) ? obj.keywords.map(String) : [],
    category: obj?.category ? String(obj.category) : undefined as string | undefined,
  };
}

function coerceRule(item: unknown) {
  const obj = item as Record<string, unknown> | null | undefined;
  return {
    name: String(obj?.name ?? ""),
    trigger: String(obj?.trigger ?? ""),
    triggerKeywords: Array.isArray(obj?.triggerKeywords) ? obj.triggerKeywords.map(String) : [],
    action: String(obj?.action ?? ""),
    priority: typeof obj?.priority === "number" ? obj.priority : 50,
    riskLevel: String(obj?.riskLevel ?? "low"),
  };
}

function coerceScript(item: unknown) {
  const obj = item as Record<string, unknown> | null | undefined;
  return {
    scene: String(obj?.scene ?? ""),
    content: String(obj?.content ?? ""),
    tone: obj?.tone ? String(obj.tone) : undefined as string | undefined,
  };
}

function coerceRiskTip(item: unknown) {
  const obj = item as Record<string, unknown> | null | undefined;
  return {
    scene: String(obj?.scene ?? ""),
    content: String(obj?.content ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Mock implementation (no API key needed)
// ---------------------------------------------------------------------------

const logisticsPattern = /(物流|快递|没到|未到|延迟|延误|不更新|派送)/;

function generateMockResult(input: GenerateLearningInput): LearningResult {
  if (logisticsPattern.test(input.content)) {
    return {
      summary: "物流延迟场景下，应先安抚客户情绪，再询问订单号，并说明会协助核实物流状态。",
      knowledgeSuggestions: [
        {
          title: "物流延迟处理说明",
          content: "物流延迟可能由仓库发货、快递揽收、运输中转、派送异常等原因导致，客服需要先安抚客户并收集订单信息。",
          keywords: ["物流延迟", "快递没到", "物流不更新"],
          category: "物流",
        },
      ],
      ruleSuggestions: [
        {
          name: "物流延迟优先安抚规则",
          trigger: "客户提到快递未到、物流不更新、物流延迟等问题",
          triggerKeywords: ["快递没到", "物流不更新", "物流延迟"],
          action: "先道歉安抚，再询问订单号，最后说明会协助查询物流状态",
          priority: 90,
          riskLevel: "low",
        },
      ],
      scriptSuggestions: [
        {
          scene: "物流延迟",
          content: "亲亲，非常抱歉让您久等了。我先帮您核实一下物流情况，麻烦您提供一下订单号。",
          tone: "polite",
        },
      ],
      riskTips: [
        {
          scene: "物流延迟",
          content: "不要回复「你自己看物流」或「我也没办法」等推卸责任的表达。",
        },
      ],
    };
  }

  return {
    summary: "应根据客户问题先理解诉求，再礼貌回应，并在不确定时引导人工进一步核实。",
    knowledgeSuggestions: [
      {
        title: "通用客服沟通原则",
        content: "客服回复应保持礼貌、准确、简洁，不推卸责任，不随意承诺超出政策范围的补偿。",
        keywords: ["客服沟通", "礼貌", "不推卸责任"],
        category: "通用",
      },
    ],
    ruleSuggestions: [
      {
        name: "通用礼貌回应规则",
        trigger: "客户提出问题或表达不满",
        triggerKeywords: ["怎么回事", "为什么", "不满意"],
        action: "先表达理解，再说明会协助处理，必要时进一步询问信息",
        priority: 50,
        riskLevel: "low",
      },
    ],
    scriptSuggestions: [
      {
        scene: "通用咨询",
        content: "您好，非常理解您的情况，我这边先帮您核实一下，请您稍等。",
        tone: "polite",
      },
    ],
    riskTips: [
      {
        scene: "通用客服",
        content: "不要使用冷漠、推卸责任或带有攻击性的表达。",
      },
    ],
  };
}

function generateMockReplyResult(input: GenerateReplyInput): ReplyTestResult {
  const { customerMessage, history, context } = input;

  // ── Stage 1: classify → narrow by category ──
  const allCategories = [...new Set(context.knowledgeItems.map((i) => i.category).filter(isNonEmptyString))];
  const matchedCats = allCategories.length > 1
    ? heuristicClassify(customerMessage, allCategories)
    : allCategories;

  let filteredKnowledge = context.knowledgeItems.filter(
    (item) => matchedCats.includes(item.category ?? ""),
  );
  if (filteredKnowledge.length < 3) {
    filteredKnowledge = context.knowledgeItems;
  }

  // ── Stage 2: match within filtered set ──
  const matchedKnowledge = filteredKnowledge.filter((item) =>
    includesAny(customerMessage, [item.title, item.content, item.category, ...item.keywords]),
  );
  const matchedRules = context.ruleItems
    .filter((item) => includesAny(customerMessage, [item.name, item.trigger, ...item.triggerKeywords]))
    .sort((a, b) => b.priority - a.priority);
  const matchedScripts = context.scriptItems.filter((item) =>
    includesAny(customerMessage, [item.scene, item.content]),
  );
  const riskTips = context.riskTips.filter((item) => includesAny(customerMessage, [item.scene, item.content]));

  const bestScript = matchedScripts[0] ?? context.scriptItems[0];
  const bestRule = matchedRules[0] ?? context.ruleItems[0];
  const persona = context.persona;

  // Build context-aware mock reply
  const historyContext = history && history.length > 0
    ? `（对话历史：${history.map((h) => `${h.role === "customer" ? "客户" : "客服"}说"${h.content.slice(0, 30)}"`).join("，")}）`
    : "";

  // Build base reply from best match
  const baseReply = bestScript?.content
    ?? matchedKnowledge[0]?.content
    ?? "您好，非常理解您的情况，我这边先帮您核实一下，请您稍等。";

  const prefix = persona?.description ? `按「${persona.name}」人设回复：` : "";
  const suffix = bestRule?.action ? `（处理建议：${bestRule.action}）` : "";

  // Generate 5 mock replies with variations
  const replies = [
    `${prefix ? prefix + "\n" : ""}${baseReply}${suffix}`,
    matchedKnowledge[1]?.content
      ?? bestScript?.content
      ?? "亲亲，您的心情我非常理解，马上帮您处理~",
    bestRule?.action
      ?? matchedKnowledge[2]?.content
      ?? "您好，我这边立刻帮您核实情况，请稍等。",
    matchedScripts[1]?.content
      ?? matchedKnowledge[0]?.content
      ?? "非常抱歉给您带来不便，我马上为您查询处理。",
    persona?.description
      ? `按「${persona.name}」风格：${baseReply}`
      : matchedKnowledge[1]?.content
        ?? "感谢您的耐心等待，这边已经为您优先处理中。",
  ].map((r) => r.trim()).filter(Boolean);

  // Ensure we have at least 1 reply; pad to 5 if needed
  while (replies.length < 5) {
    replies.push(replies[0] ?? "您好，请稍等，我帮您核实一下。");
  }

  return {
    replies,
    matchedKnowledge,
    matchedRules,
    matchedScripts,
    riskTips,
    persona,
  };
}

// ---------------------------------------------------------------------------
// Polish (real + mock)
// ---------------------------------------------------------------------------

async function generateRealPolishResult(
  input: PolishReplyInput,
  provider: string,
  apiKey: string,
): Promise<ReplyTestResult> {
  const { context, draft } = input;

  // Build context summary
  const scriptsText = context.scriptItems.map((item) => `- [${item.scene}] ${item.content}`).join("\n");
  const personaText = context.persona
    ? `名称: ${context.persona.name}\n描述: ${context.persona.description}\n语气: ${context.persona.tone}`
    : "未配置人设";

  const systemPrompt = `${POLISH_SYSTEM_PROMPT}

话术库参考：
${scriptsText || "无"}

人设配置：
${personaText}`;

  const userPrompt = `客服草稿回复：${draft}\n\n请将以上草稿优化为 3 个不同风格的专业回复。`;

  const jsonText = await callAI(provider, apiKey, systemPrompt, userPrompt, 512);
  const parsed = parseReplyResult(jsonText);

  return {
    replies: parsed.replies,
    matchedKnowledge: [],
    matchedRules: [],
    matchedScripts: context.scriptItems.filter((item) =>
      includesAny(draft, [item.scene, item.content]),
    ),
    riskTips: [],
    persona: context.persona,
  };
}

function generateMockPolishResult(input: PolishReplyInput): ReplyTestResult {
  const { draft, context } = input;

  const polished = [
    `【标准专业】${draft}（我们已收到您的反馈，后续如有疑问可随时联系我们。）`,
    `【亲切友好】亲亲～${draft}哦～有任何问题随时找我们，我们一直都在哒！`,
    `【简洁高效】${draft}。如有其他问题，请随时联系。`,
  ];

  return {
    replies: polished,
    matchedKnowledge: [],
    matchedRules: [],
    matchedScripts: context.scriptItems.filter((item) =>
      includesAny(draft, [item.scene, item.content]),
    ),
    riskTips: [],
    persona: context.persona,
  };
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function includesAny(message: string, values: Array<string | undefined>) {
  const normalizedMessage = message.toLowerCase();
  return values
    .filter((value): value is string => Boolean(value))
    .some((value) => {
      const normalizedValue = value.toLowerCase();
      const valueLen = normalizedValue.length;

      // Direct substring match (either direction)
      if (normalizedMessage.includes(normalizedValue) || normalizedValue.includes(normalizedMessage)) {
        return true;
      }

      // Token-level match: split by punctuation and check each token (bidirectional)
      const valueTokens = tokens(normalizedValue);
      const msgTokens = tokens(normalizedMessage);
      if (valueTokens.some((t) => normalizedMessage.includes(t))) return true;
      if (msgTokens.some((t) => normalizedValue.includes(t))) return true;

      // Chinese character bigram matching — only for shorter values (keywords, titles)
      // to avoid false positives from matching against long content fields.
      // A keyword like "物流不更新" should match a message like "快递没更新"
      // via the shared bigram "更新".
      const isCJK = /[一-鿿]/.test(normalizedValue);
      if (isCJK && valueLen <= 20) {
        const bigrams = chineseBigrams(normalizedValue);
        if (bigrams.some((bg) => normalizedMessage.includes(bg))) return true;
      }

      return false;
    });
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value);
}

/** Split text by punctuation and whitespace into meaningful tokens. */
function tokens(value: string) {
  return value
    .split(/[，,。、；;：:\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

/** Generate 2-char sliding windows for fuzzy Chinese text matching. */
function chineseBigrams(text: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    result.push(text.slice(i, i + 2));
  }
  return result;
}
