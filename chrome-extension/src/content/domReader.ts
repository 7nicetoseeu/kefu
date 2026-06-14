/**
 * DOM 读取器 — 网易七鱼 (NetEase Qiyu) 平台
 *
 * 精确读取客户 ID 和消息内容。
 * DOM 结构参考:
 *   客户消息: div.msg.msg_left  > div.msg_main > div > div.text.msg-bubble > p
 *   客服消息: div.msg.msg_right > div.msg_main > div > div.text.msg-bubble > p
 *   客户名称: .msg_left .f-hd 或 .sess_itm.z-crt .name
 */
import type { ChatPageSelectorConfig } from "../types";
import { isNoiseElement } from "../config/selectors";

// ---------------------------------------------------------------------------
// 消息截断: 只处理 "以上为历史消息" 分割线之后的消息
// ---------------------------------------------------------------------------
let cutoffElement: Element | null = null;

/**
 * 定位消息截断点: <div class="msgsplit"> 之后的系统转接提示
 * 只捕获截断点之后的客户消息，忽略历史消息。
 */
function findCutoffElement(container: Element): Element | null {
  // 找到 msgsplit 元素
  const splits = container.querySelectorAll(".msgsplit");
  if (splits.length === 0) return null;

  // 取最后一个 msgsplit (通常"以上为历史消息"是最后一个分割线)
  const split = splits[splits.length - 1];

  // 返回 split 之后紧接着的 .systip (如"由问答机器人转接")
  let next: Element | null = split.nextElementSibling;
  while (next) {
    if (next.matches?.(".systip") || next.matches?.(".msg")) {
      return next;
    }
    next = next.nextElementSibling;
  }

  // 如果 split 后面什么都没有，就返回 split 本身
  return split;
}

/**
 * 判断元素是否在截断点之后
 * 如果在截断点之前 (历史消息)，返回 false
 */
export function isMessageAfterDivider(el: Element, container: Element): boolean {
  if (!cutoffElement) {
    cutoffElement = findCutoffElement(container);
  }

  if (!cutoffElement) {
    // 页面没有 msgsplit 分割线 → 捕获所有消息
    return true;
  }

  // 比较两个节点在 DOM 中的位置
  const position = cutoffElement.compareDocumentPosition(el);

  // Node.DOCUMENT_POSITION_FOLLOWING (4): el 在 cutoff 之后
  // Node.DOCUMENT_POSITION_CONTAINS (8): cutoff 包含 el
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    // 还需要排除：el 就是 cutoff 本身
    return el !== cutoffElement;
  }

  // 如果 cutoff 包含 el，也通过
  if (position & Node.DOCUMENT_POSITION_CONTAINS) {
    return true;
  }

  // el 在 cutoff 之前 → 跳过
  return false;
}

/** 重置截断点 (切换页面时调用) */
export function resetCutoff(): void {
  cutoffElement = null;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 获取当前活跃客户标识
 *
 * 策略（按优先级）:
 * 1. 聊天页左侧消息中 .f-hd 文本（如 "洪*"）
 * 2. 队列页当前选中会话 .sess_itm.z-crt 的 data-sid 属性
 * 3. 队列页 .sess_itm.z-crt .name 文本
 */
export function getCurrentUserId(_config: ChatPageSelectorConfig): string | null {
  // 策略1: 聊天页中最后一条客户消息的头像名称
  const nameEls = document.querySelectorAll(".msg.msg_left .f-hd");
  if (nameEls.length > 0) {
    const last = nameEls[nameEls.length - 1];
    const text = last.textContent?.trim();
    if (text) {
      console.log("[AI客服助手] ✓ 客户标识 (来自聊天页):", text);
      return text;
    }
  }

  // 策略2: 队列页当前会话 data-sid
  const activeSession = document.querySelector(".sess_itm.z-crt");
  if (activeSession) {
    const sid = activeSession.getAttribute("data-sid");
    if (sid) {
      console.log("[AI客服助手] ✓ 客户标识 (来自队列 data-sid):", sid);
      return sid;
    }
  }

  // 策略3: 队列页当前会话客户名
  const nameEl = document.querySelector(".sess_itm.z-crt .name");
  if (nameEl) {
    const text = nameEl.textContent?.trim();
    if (text) {
      console.log("[AI客服助手] ✓ 客户标识 (来自队列 name):", text);
      return text;
    }
  }

  console.warn("[AI客服助手] ⚠ 未找到客户标识");
  return null;
}

/**
 * 从消息元素提取客户消息内容
 *
 * 七鱼 DOM:
 *   div.msg.msg_left > div.msg_main > div > div.text.msg-bubble > p
 *
 * 只提取客户消息正文，过滤掉系统提示、QA 卡片等噪声。
 */
export function extractCustomerMessageFromElement(
  messageElement: Element,
  _config: ChatPageSelectorConfig
): string | null {
  // 排除噪声元素
  if (isNoiseElement(messageElement)) return null;

  // 策略1: .text.msg-bubble 里的 <p>（纯文本消息）
  const textBubble = messageElement.querySelector(".text.msg-bubble");
  if (textBubble) {
    // 取所有 <p> 标签的文本合并
    const paragraphs = textBubble.querySelectorAll("p");
    if (paragraphs.length > 0) {
      const text = Array.from(paragraphs)
        .map((p) => p.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
      if (text.length >= 2) return text;
    }
    // 回退：直接取 .text.msg-bubble 文本（排除操作按钮）
    const bubble = textBubble.cloneNode(true) as HTMLElement;
    bubble.querySelectorAll(".operation-box, .u-icon-font, .m-tooltip").forEach((e) => e.remove());
    const text = bubble.textContent?.trim();
    if (text && text.length >= 2) return text;
  }

  // 策略2: .msg-bubble 里的 <p>（通用）
  const msgBubble = messageElement.querySelector(".msg-bubble");
  if (msgBubble && !isNoiseElement(msgBubble)) {
    const paragraphs = msgBubble.querySelectorAll("p");
    if (paragraphs.length > 0) {
      const text = Array.from(paragraphs)
        .map((p) => p.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
      if (text.length >= 2) return text;
    }
    const bubble = msgBubble.cloneNode(true) as HTMLElement;
    bubble.querySelectorAll(".operation-box, .u-icon-font, .m-tooltip, .qa_label").forEach((e) => e.remove());
    const text = bubble.textContent?.trim();
    if (text && text.length >= 2) return text;
  }

  return null;
}

/**
 * 检测聊天输入框
 *
 * 返回页面中可见的 textarea / contenteditable / input[type=text] 元素。
 */
export function detectChatInput(_config: ChatPageSelectorConfig): HTMLElement | null {
  // 优先匹配七鱼常见的输入框
  const qiyuSelectors = [
    "#auto-id-1780750304474 ~ * textarea",
    ".m-msglist ~ * textarea",
    ".chat-input textarea",
    ".input-area textarea",
    ".reply-box textarea",
    ".editor textarea",
    '[class*="input"] textarea',
    '[class*="editor"] textarea',
    '[class*="reply"] textarea',
    '[class*="send"] textarea',
  ];

  for (const sel of qiyuSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement && el.offsetParent !== null) return el;
    } catch { /* skip */ }
  }

  // 通用：任意可见 textarea
  for (const ta of document.querySelectorAll("textarea")) {
    if (ta instanceof HTMLElement && ta.offsetParent !== null) return ta;
  }

  // 通用：任意可见 contenteditable（注意 body 的 offsetParent 始终为 null）
  for (const el of document.querySelectorAll('[contenteditable="true"]')) {
    if (!(el instanceof HTMLElement)) continue;
    // body 元素的 offsetParent 永远为 null，需特殊处理
    if (el.tagName === "BODY" || el === document.body) return el;
    if (el.offsetParent !== null) return el;
  }

  console.warn("[AI客服助手] ⚠ 未找到聊天输入框");
  return null;
}

/**
 * 检测消息容器
 */
export function detectMessageContainer(_config: ChatPageSelectorConfig): Element | null {
  // 七鱼: .m-msglist
  const qiyu = document.querySelector(".m-msglist");
  if (qiyu) return qiyu;

  // 通用备选
  const selectors = [
    '[class*="msglist"]',
    '[class*="msg-list"]',
    '[class*="message"][class*="list"]',
    '[class*="chat"][class*="list"]',
    '[role="log"]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* skip */ }
  }

  return null;
}

/**
 * 判断元素是否为客户消息（msg.msg_left 且非噪声）
 */
export function isLikelyCustomerMessage(el: Element, config: ChatPageSelectorConfig): boolean {
  // 必须匹配客户消息选择器
  try {
    if (!el.matches(config.customerMessageSelector)) return false;
  } catch {
    return false;
  }

  // 排除噪声
  if (isNoiseElement(el)) return false;

  return true;
}
