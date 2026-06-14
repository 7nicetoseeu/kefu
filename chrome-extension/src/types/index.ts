/** CSS 选择器配置 — 用于适配不同客服平台的 DOM 结构 */
export interface ChatPageSelectorConfig {
  /** 当前活跃客户 ID 所在元素的选择器 */
  activeUserIdSelector: string;
  /** 消息列表容器选择器 */
  messageContainerSelector: string;
  /** 单条消息元素选择器（消息容器内的直接子元素） */
  messageItemSelector: string;
  /** 客户消息元素选择器 */
  customerMessageSelector: string;
  /** 客服消息元素选择器 */
  agentMessageSelector: string;
  /** 消息正文内容所在元素的选择器（相对于消息元素） */
  messageContentSelector: string;
  /** 聊天输入框选择器（支持 textarea / input[type=text] / contenteditable） */
  chatInputSelector: string;
}

/** 聊天消息 */
export interface ChatMessage {
  role: "customer" | "agent";
  content: string;
  timestamp: number;
}

/** AI 生成的推荐回复 */
export interface SuggestedReply {
  /** 推荐回复文本 */
  reply: string;
  /** 可选的备选回复 */
  alternatives?: string[];
  /** 匹配到的知识库条目 */
  matchedKnowledge?: Array<{ title: string; content: string }>;
  /** 匹配到的规则 */
  matchedRules?: Array<{ name: string; action: string }>;
  /** 匹配到的话术 */
  matchedScripts?: Array<{ scene: string; content: string }>;
  /** 风险提示 */
  riskTips?: Array<{ scene: string; content: string }>;
  /** 当前使用的人设 */
  persona?: { name: string; description: string };
}

/** 客户上下文 — 传递给后台和侧边栏 */
export interface CustomerContext {
  /** 从页面读取的客户 ID，获取失败时为 null */
  userId: string | null;
  /** 最近的聊天消息 */
  messages: ChatMessage[];
}

/** Content Script → Background 的消息类型 */
export type ContentMessage =
  | {
      type: "NEW_CUSTOMER_MESSAGE";
      payload: {
        userId: string | null;
        message: ChatMessage;
      };
    }
  | {
      type: "GET_MESSAGE_HISTORY";
    }
  | {
      type: "CLEAR_MESSAGE_HISTORY";
    };

/** Side Panel → Background 的消息类型 */
export type SidePanelMessage =
  | {
      type: "FILL_INPUT";
      payload: {
        tabId: number;
        reply: string;
      };
    }
  | {
      type: "GET_CONTEXT";
      payload: {
        tabId: number;
      };
    }
  | {
      type: "GENERATE_REPLY";
      payload: {
        customerMessage: string;
      };
    }
  | {
      type: "POLISH_REPLY";
      payload: {
        draft: string;
      };
    }
  | {
      type: "SEARCH_LIBRARY";
      payload: {
        keyword: string;
      };
    }

/** Background → Content Script 的消息类型 */
export type BackgroundToContentMessage =
  | {
      type: "FILL_INPUT";
      payload: {
        reply: string;
      };
    }
  | {
      type: "REQUEST_CONTEXT";
    };

/** Background → Side Panel 的消息类型 */
export type BackgroundToSidePanelMessage =
  | {
      type: "CONTEXT_UPDATE";
      payload: {
        tabId: number;
        context: CustomerContext;
        suggestion?: SuggestedReply;
      };
    }
  | {
      type: "SUGGESTION_READY";
      payload: {
        tabId: number;
        suggestion: SuggestedReply;
      };
    };
