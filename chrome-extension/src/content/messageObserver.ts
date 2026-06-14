/**
 * 消息观察器 — 网易七鱼平台
 *
 * 使用 MutationObserver 监听 .m-msglist 容器，
 * 精确捕获 .msg.msg_left 客户消息，过滤 systip/msgsplit/qa-list 等噪声。
 */
import type { ChatMessage, ChatPageSelectorConfig } from "../types";
import {
  getCurrentUserId,
  extractCustomerMessageFromElement,
  detectMessageContainer,
  isLikelyCustomerMessage,
  isMessageAfterDivider,
  resetCutoff,
} from "./domReader";
import { isNoiseElement } from "../config/selectors";

export type MessageCallback = (message: ChatMessage, userId: string | null) => void;

let observer: MutationObserver | null = null;
let seenMessages = new Set<Element>();

/** 清除已见消息记录（会话切换时调用） */
export function clearSeenMessages(): void {
  seenMessages.clear();
  console.log("[AI客服助手] 已清除已见消息记录");
}

/**
 * 启动消息监听
 */
export function startMessageObserver(
  config: ChatPageSelectorConfig,
  onNewCustomerMessage: MessageCallback
): void {
  stopMessageObserver();
  resetCutoff();  // 切换会话时重置截断点

  // 尝试定位容器，会话切换后新容器可能尚未插入，短轮询重试
  tryAttachObserver(config, onNewCustomerMessage, 0);
}

/** 带重试的观察器绑定（最多 1s，间隔 100ms） */
function tryAttachObserver(
  config: ChatPageSelectorConfig,
  onNewCustomerMessage: MessageCallback,
  attempt: number
): void {
  const MAX_ATTEMPTS = 10;
  const RETRY_MS = 100;

  console.log("[AI客服助手] 🔍 检测聊天容器……");

  // 策略1: 使用配置的选择器
  let container = detectMessageContainer(config);

  // 策略2: 七鱼平台专属选择器
  if (!container) {
    container = document.querySelector(".m-msglist");
    if (container) console.log("[AI客服助手] ✓ 找到七鱼消息容器 .m-msglist");
  }

  // 策略3: 回退 body
  if (!container) {
    if (attempt < MAX_ATTEMPTS) {
      console.log(`[AI客服助手] ⏳ 容器未就绪，${RETRY_MS}ms 后重试 (${attempt + 1}/${MAX_ATTEMPTS})...`);
      setTimeout(() => tryAttachObserver(config, onNewCustomerMessage, attempt + 1), RETRY_MS);
      return;
    }
    console.warn("[AI客服助手] ⚠ 未找到消息容器，使用 body 级别观察");
    container = document.body;
  } else {
    console.log("[AI客服助手] ✓ 消息容器:", container.className || container.tagName);
  }

  setupObserver(container, config, onNewCustomerMessage);

  // 立即扫描已有消息
  scanExistingMessages(container, config, onNewCustomerMessage);
}

/**
 * 扫描已有客户消息
 */
function scanExistingMessages(
  container: Element,
  config: ChatPageSelectorConfig,
  onNewCustomerMessage: MessageCallback
): void {
  const allMsgElements = container.querySelectorAll(".msg.msg_left");
  const userId = getCurrentUserId(config);
  let captured = 0;

  for (const el of allMsgElements) {
    if (seenMessages.has(el)) continue;
    if (isNoiseElement(el)) continue;
    if (!isMessageAfterDivider(el, container)) continue;  // 跳过历史消息

    const content = extractCustomerMessageFromElement(el, config);
    if (!content || content.length < 2) continue;

    seenMessages.add(el);
    const message: ChatMessage = {
      role: "customer",
      content,
      timestamp: Date.now(),
    };
    onNewCustomerMessage(message, userId);
    captured++;
  }

  if (captured > 0) {
    console.log(`[AI客服助手] 📋 初始扫描捕获 ${captured} 条已有客户消息`);
  } else {
    console.log("[AI客服助手] 📋 初始扫描: 未发现已有客户消息");
  }
}

function setupObserver(
  container: Element,
  config: ChatPageSelectorConfig,
  onNewCustomerMessage: MessageCallback
): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        // 直接匹配: 新增节点本身就是 .msg.msg_left
        if (node.matches?.(".msg.msg_left") && !isNoiseElement(node)) {
          processMessageElement(node, config, container, onNewCustomerMessage);
        }

        // 子元素匹配: 新增节点内部包含 .msg.msg_left
        const customerMsgs = node.querySelectorAll?.(".msg.msg_left");
        if (customerMsgs) {
          for (const msgEl of customerMsgs) {
            if (!isNoiseElement(msgEl)) {
              processMessageElement(msgEl, config, container, onNewCustomerMessage);
            }
          }
        }
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  console.log("[AI客服助手] ✓ 消息监听已启动 (仅监听 .msg.msg_left)");
}

function processMessageElement(
  el: Element,
  config: ChatPageSelectorConfig,
  container: Element,
  onNewCustomerMessage: MessageCallback
): void {
  if (seenMessages.has(el)) return;

  // 双重检查
  if (!isLikelyCustomerMessage(el, config)) return;
  if (isNoiseElement(el)) return;
  if (!isMessageAfterDivider(el, container)) return;  // 跳过历史消息

  const content = extractCustomerMessageFromElement(el, config);
  if (!content || content.length < 2) return;

  seenMessages.add(el);

  const userId = getCurrentUserId(config);
  const message: ChatMessage = {
    role: "customer",
    content,
    timestamp: Date.now(),
  };

  console.log(`[AI客服助手] 📩 客户消息: ${content.substring(0, 60)}`);
  onNewCustomerMessage(message, userId);
}

/**
 * 停止消息监听
 */
export function stopMessageObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log("[AI客服助手] 消息监听已停止");
  }
}
