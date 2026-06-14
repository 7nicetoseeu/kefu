/**
 * AI 客服辅助助手 — Background Service Worker
 *
 * 职责：
 * 1. 调用后端 API `/api/reply/generate` 生成 AI 推荐回复
 * 2. 维护每 Tab 最近 50 条消息历史
 * 3. 在 Content Script 与 Side Panel 间路由消息
 * 4. 响应 Side Panel 的填入请求
 * 5. 主动向 Side Panel 推送上下文更新
 */
import type {
  ChatMessage,
  CustomerContext,
  SuggestedReply,
  ContentMessage,
  SidePanelMessage,
} from "../types";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
const DEFAULT_API_BASE_URL = "http://localhost:3001";

async function getApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.local.get("apiBaseUrl");
  return stored.apiBaseUrl ?? DEFAULT_API_BASE_URL;
}

// ---------------------------------------------------------------------------
// 消息历史（按 Tab ID 存储，每 Tab 最多 50 条）
// ---------------------------------------------------------------------------
const tabMessageHistories = new Map<number, ChatMessage[]>();
const tabCustomerIds = new Map<number, string | null>();
const tabSuggestions = new Map<number, SuggestedReply>();

function addMessageToTabHistory(tabId: number, message: ChatMessage): void {
  let history = tabMessageHistories.get(tabId);
  if (!history) {
    history = [];
    tabMessageHistories.set(tabId, history);
  }
  history.push(message);
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }
}

function getTabHistory(tabId: number): ChatMessage[] {
  return tabMessageHistories.get(tabId) ?? [];
}

function getTabContext(tabId: number): CustomerContext {
  return {
    userId: tabCustomerIds.get(tabId) ?? null,
    messages: getTabHistory(tabId),
  };
}

// ---------------------------------------------------------------------------
// Tab 关闭时清理
// ---------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMessageHistories.delete(tabId);
  tabCustomerIds.delete(tabId);
  tabSuggestions.delete(tabId);
  console.log(`[AI客服助手] Tab ${tabId} 已关闭，已清理上下文`);
});

// ---------------------------------------------------------------------------
// API 调用
// ---------------------------------------------------------------------------
interface ReplyApiResponse {
  success: boolean;
  data?: {
    replies?: string[];
    matchedKnowledge?: Array<{ title: string; content: string }>;
    matchedRules?: Array<{ name: string; action: string }>;
    matchedScripts?: Array<{ scene: string; content: string }>;
    riskTips?: Array<{ scene: string; content: string }>;
    persona?: { name: string; description: string };
  };
  error?: { message: string };
}

async function callReplyApi(
  customerMessage: string,
  history: ChatMessage[]
): Promise<SuggestedReply> {
  const apiBaseUrl = await getApiBaseUrl();
  const url = `${apiBaseUrl}/api/reply/generate`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerMessage,
      history: history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`API ${response.status}: ${text}`);
  }

  const json: ReplyApiResponse = await response.json();

  if (!json.success) {
    throw new Error(json.error?.message ?? "API 返回失败");
  }

  const data = json.data!;

  // 规范化回复：处理 API 可能返回的各种畸形格式
  let allReplies: string[] = [];

  if (data.replies && Array.isArray(data.replies)) {
    for (const r of data.replies) {
      if (typeof r === "string") {
        const trimmed = r.trim();
        // 检查每个元素是否为嵌套 JSON
        if (trimmed.startsWith("{")) {
          try {
            const nested = JSON.parse(trimmed);
            // 格式: { success: true, data: { replies: [...] } }
            if (nested.data?.replies && Array.isArray(nested.data.replies)) {
              for (const nr of nested.data.replies) {
                if (typeof nr === "string" && nr.trim()) allReplies.push(nr.trim());
              }
              continue;
            }
            // 格式: { replies: [...] }
            if (nested.replies && Array.isArray(nested.replies)) {
              for (const nr of nested.replies) {
                if (typeof nr === "string" && nr.trim()) allReplies.push(nr.trim());
              }
              continue;
            }
            // 格式: { reply: "..." }
            if (typeof nested.reply === "string" && nested.reply.trim()) {
              allReplies.push(nested.reply.trim());
              continue;
            }
          } catch { /* 不是合法 JSON */ }
        }
        // 纯文本
        if (trimmed) allReplies.push(trimmed);
      }
    }
  }

  // 去重并保持顺序
  const uniqueReplies = [...new Set(allReplies)];

  return {
    reply: uniqueReplies[0] ?? "",
    alternatives: uniqueReplies.slice(1),
    matchedKnowledge: data.matchedKnowledge,
    matchedRules: data.matchedRules,
    matchedScripts: data.matchedScripts,
    riskTips: data.riskTips,
    persona: data.persona,
  };
}

// ---------------------------------------------------------------------------
// 主动推送：通知 Side Panel 上下文已更新
// ---------------------------------------------------------------------------
async function pushContextUpdate(tabId: number): Promise<void> {
  try {
    const context = getTabContext(tabId);
    const suggestion = tabSuggestions.get(tabId);
    await chrome.runtime.sendMessage({
      type: "CONTEXT_UPDATE",
      payload: {
        tabId,
        context,
        suggestion: suggestion ?? null,
      },
    });
  } catch {
    // Side Panel 可能未打开，忽略
  }
}

// ---------------------------------------------------------------------------
// 消息路由
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message as ContentMessage | SidePanelMessage, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(
  message: ContentMessage | SidePanelMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    // -----------------------------------------------------------------------
    // 来自 Content Script — 新客户消息
    // -----------------------------------------------------------------------
    case "NEW_CUSTOMER_MESSAGE": {
      const { userId, message: chatMessage } = message.payload;
      const tabId = sender.tab?.id;
      if (!tabId) return { error: "No tab id" };

      console.log(`[AI客服助手] Tab ${tabId} 新客户消息: ${chatMessage.content.substring(0, 50)}...`);

      // 存储
      tabCustomerIds.set(tabId, userId);
      addMessageToTabHistory(tabId, chatMessage);

      // 推送上下文更新给 Side Panel（仅消息列表，不自动生成回复）
      await pushContextUpdate(tabId);

      return { success: true };
    }

    // -----------------------------------------------------------------------
    // 来自 Content Script — 获取历史
    // -----------------------------------------------------------------------
    case "GET_MESSAGE_HISTORY": {
      const tabId = sender.tab?.id;
      if (!tabId) return { history: [] };
      return { history: getTabHistory(tabId) };
    }

    case "CLEAR_MESSAGE_HISTORY": {
      const tabId = sender.tab?.id;
      if (tabId) {
        tabMessageHistories.delete(tabId);
        tabCustomerIds.delete(tabId);
        tabSuggestions.delete(tabId);

        // 立即推送空上下文到 Side Panel，避免显示旧用户数据
        chrome.runtime
          .sendMessage({
            type: "CONTEXT_UPDATE",
            payload: {
              tabId,
              context: { userId: null, messages: [] },
              suggestion: null,
            },
          })
          .catch(() => {
            // Side Panel 可能未打开
          });
      }
      return { success: true };
    }

    // -----------------------------------------------------------------------
    // 来自 Side Panel — 填入输入框
    // -----------------------------------------------------------------------
    case "FILL_INPUT": {
      const { tabId, reply } = message.payload;
      console.log(`[AI客服助手] Side Panel 请求填入 Tab ${tabId}: ${reply.substring(0, 30)}...`);
      try {
        const responses = await chrome.tabs.sendMessage(tabId, {
          type: "FILL_INPUT",
          payload: { reply },
        });
        return responses ?? { success: false, error: "No response" };
      } catch (err) {
        return {
          success: false,
          error: `无法向 Tab ${tabId} 发送填入指令: ${err instanceof Error ? err.message : err}`,
        };
      }
    }

    // -----------------------------------------------------------------------
    // 来自 Side Panel — 获取上下文
    // -----------------------------------------------------------------------
    case "GET_CONTEXT": {
      const { tabId } = message.payload;
      // 先尝试从 Content Script 获取最新 userId
      try {
        const csContext = await chrome.tabs.sendMessage(tabId, {
          type: "REQUEST_CONTEXT",
        }) as CustomerContext;
        if (csContext.userId) {
          tabCustomerIds.set(tabId, csContext.userId);
        }
      } catch {
        // Content Script 可能未注入，使用本地缓存
      }
      return getTabContext(tabId);
    }

    // -----------------------------------------------------------------------
    // 来自 Side Panel — 手动生成回复
    // -----------------------------------------------------------------------
    case "GENERATE_REPLY": {
      const { customerMessage } = message.payload;
      try {
        const suggestion = await callReplyApi(customerMessage, []);
        return { success: true, suggestion };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "API error",
        };
      }
    }

    // -----------------------------------------------------------------------
    // 来自 Side Panel — 润色客服回复
    // -----------------------------------------------------------------------
    case "POLISH_REPLY": {
      const { draft } = message.payload;
      try {
        const apiBaseUrl = await getApiBaseUrl();
        const url = `${apiBaseUrl}/api/reply/polish`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "unknown error");
          throw new Error(`API ${response.status}: ${text}`);
        }

        const json = await response.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? "API 返回失败");
        }

        // 后端返回 ReplyTestResult { replies: [...] }，转为 SuggestedReply { reply, alternatives }
        const raw: Record<string, unknown> = json.data as Record<string, unknown>;
        const replies: string[] = Array.isArray(raw.replies) ? raw.replies.map(String) : [];
        const suggestion: SuggestedReply = {
          reply: replies[0] ?? "",
          alternatives: replies.slice(1),
          matchedKnowledge: raw.matchedKnowledge as SuggestedReply["matchedKnowledge"],
          matchedRules: raw.matchedRules as SuggestedReply["matchedRules"],
          matchedScripts: raw.matchedScripts as SuggestedReply["matchedScripts"],
          riskTips: raw.riskTips as SuggestedReply["riskTips"],
          persona: raw.persona as SuggestedReply["persona"],
        };
        return { success: true, suggestion };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "API error",
        };
      }
    }

    // -----------------------------------------------------------------------
    // 来自 Side Panel — 关键词检索
    // -----------------------------------------------------------------------
    case "SEARCH_LIBRARY": {
      const { keyword } = message.payload;
      if (!keyword || !keyword.trim()) {
        return { knowledge: [], rules: [], scripts: [], riskTips: [] };
      }

      try {
        const apiBaseUrl = await getApiBaseUrl();
        const url = `${apiBaseUrl}/api/search?keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Search API ${response.status}`);
        }
        const json = await response.json();
        if (!json.success) {
          throw new Error(json.error?.message ?? "搜索失败");
        }
        return json.data;
      } catch (err) {
        return { error: err instanceof Error ? err.message : "搜索失败" };
      }
    }

    default:
      return { error: `Unknown message type: ${(message as { type: string }).type}` };
  }
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
console.log("[AI客服助手] Background Service Worker 已启动");
