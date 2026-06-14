/**
 * Side Panel — 后端 API 封装
 *
 * 注意：Chrome Extension 的 Side Panel 无法直接跨域请求，
 * 所有 API 调用通过 Background Service Worker 中转。
 */

import type { ChatMessage, CustomerContext, SuggestedReply } from "../types";

/**
 * 通过 Background 获取指定 Tab 的客户上下文
 */
export async function fetchContext(
  tabId: number
): Promise<CustomerContext> {
  const response = await chrome.runtime.sendMessage({
    type: "GET_CONTEXT",
    payload: { tabId },
  });
  // Background 返回的就是 CustomerContext
  return response as CustomerContext;
}

/**
 * 通过 Background 生成 AI 推荐回复
 */
export async function generateReply(
  customerMessage: string
): Promise<SuggestedReply> {
  const response = await chrome.runtime.sendMessage({
    type: "GENERATE_REPLY",
    payload: { customerMessage },
  });
  if (response.error) {
    throw new Error(response.error);
  }
  return response.suggestion as SuggestedReply;
}

/**
 * 润色客服草稿回复，返回 3 个不同风格的专业版本
 */
export async function polishReply(
  draft: string
): Promise<SuggestedReply> {
  const response = await chrome.runtime.sendMessage({
    type: "POLISH_REPLY",
    payload: { draft },
  });
  if (response.error) {
    throw new Error(response.error);
  }
  return response.suggestion as SuggestedReply;
}

/**
 * 通过 Background 向 Content Script 发送填入指令
 */
export async function fillInput(
  tabId: number,
  reply: string
): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "FILL_INPUT",
    payload: { tabId, reply },
  });
  return response?.success === true;
}

/**
 * 获取消息历史（从 Background）
 */
export async function fetchMessageHistory(
  tabId: number
): Promise<ChatMessage[]> {
  const response = await chrome.runtime.sendMessage({
    type: "GET_CONTEXT",
    payload: { tabId },
  });
  return (response as CustomerContext)?.messages ?? [];
}

/** 搜索结果类型 */
export interface SearchResults {
  knowledge: Array<{ id: number; title: string; content: string; keywords: string[]; score?: number }>;
  rules: Array<{ id: number; name: string; trigger: string; triggerKeywords: string[]; action: string }>;
  scripts: Array<{ id: number; scene: string; content: string }>;
  riskTips: Array<{ id: number; scene: string; content: string }>;
}

/**
 * 关键词检索知识库/规则/话术/风险提示
 */
export async function searchLibrary(keyword: string): Promise<SearchResults> {
  const response = await chrome.runtime.sendMessage({
    type: "SEARCH_LIBRARY",
    payload: { keyword },
  });
  if (response.error) {
    throw new Error(response.error);
  }
  return response as SearchResults;
}
