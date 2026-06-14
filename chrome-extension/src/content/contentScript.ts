/**
 * AI 客服辅助助手 — Content Script 入口
 *
 * 注入到客服 Web 页面中，负责：
 * 1. 监听页面 DOM 变化，自动捕获客户消息
 * 2. 将新消息发送给 Background Service Worker
 * 3. 接收来自 Background 的填入指令并执行
 * 4. 响应 Background 的上下文请求
 */
import type {
  ChatMessage,
  ChatPageSelectorConfig,
  CustomerContext,
} from "../types";
import type { BackgroundToContentMessage } from "../types";
import { defaultSelectorConfig } from "../config/selectors";
import { getCurrentUserId } from "./domReader";
import { startMessageObserver, clearSeenMessages } from "./messageObserver";
import { fillReplyIntoChatInput } from "./inputWriter";
import { startSessionWatcher } from "./sessionWatcher";

// 防重复注入
if (window.__aiAssistantInjected) {
  console.log("[AI客服助手] 已注入，跳过重复初始化");
} else {
  window.__aiAssistantInjected = true;
  main();
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let selectorConfig: ChatPageSelectorConfig = defaultSelectorConfig;
const messageLog: ChatMessage[] = [];

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
function main(): void {
  console.log("[AI客服助手] ┌──────────────────────────────────────┐");
  console.log("[AI客服助手] │  AI 客服辅助助手 v0.1.0            │");
  console.log("[AI客服助手] │  Content Script 初始化中……        │");
  console.log("[AI客服助手] └──────────────────────────────────────┘");

  loadConfig()
    .then(() => {
      console.log("[AI客服助手] 当前页面:", window.location.href);
      console.log("[AI客服助手] 选择器配置:", selectorConfig);

      // 初始化当前用户的消息监听
      initializeForCurrentUser();

      // 启动会话切换检测（切换用户时自动清理 & 重建）
      startSessionWatcher(() => initializeForCurrentUser());

      // 监听来自 Background 的消息
      chrome.runtime.onMessage.addListener(handleBackgroundMessage);

      console.log("[AI客服助手] ✓ 初始化完成，等待客户消息……");
    })
    .catch((err) => {
      console.error("[AI客服助手] 初始化失败:", err);
    });
}

// ---------------------------------------------------------------------------
// 会话初始化（初次加载 & 每次切换用户时调用）
// ---------------------------------------------------------------------------
function initializeForCurrentUser(): void {
  // 清除旧会话的消息记录
  clearSeenMessages();
  messageLog.length = 0;

  // 通知 Background 清除当前 Tab 的用户上下文
  chrome.runtime
    .sendMessage({ type: "CLEAR_MESSAGE_HISTORY" })
    .catch(() => {});

  // 重新绑定消息监听到新的 .m-msglist
  startMessageObserver(selectorConfig, onNewCustomerMessage);

  const userId = getCurrentUserId(selectorConfig);
  console.log("[AI客服助手] 当前用户:", userId ?? "未知");
}

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
async function loadConfig(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get("selectorConfig");
    if (stored.selectorConfig) {
      selectorConfig = { ...defaultSelectorConfig, ...stored.selectorConfig };
      console.log("[AI客服助手] 已加载自定义选择器配置");
    }
  } catch {
    console.log("[AI客服助手] 使用默认选择器配置");
  }
}

// ---------------------------------------------------------------------------
// 消息回调 — 客户消息 → Background
// ---------------------------------------------------------------------------
function onNewCustomerMessage(
  message: ChatMessage,
  userId: string | null
): void {
  // 记录到本地日志
  messageLog.push(message);
  if (messageLog.length > 50) {
    messageLog.splice(0, messageLog.length - 50);
  }

  // 通知 Background（Background 会调用 API 并转发给 Side Panel）
  chrome.runtime
    .sendMessage({
      type: "NEW_CUSTOMER_MESSAGE",
      payload: { userId, message },
    })
    .then((response) => {
      if (response?.error) {
        console.warn("[AI客服助手] Background 返回错误:", response.error);
      }
    })
    .catch((err) => {
      console.warn("[AI客服助手] 发送消息到 Background 失败:", err.message);
    });
}

// ---------------------------------------------------------------------------
// 处理 Background 发来的消息
// ---------------------------------------------------------------------------
function handleBackgroundMessage(
  message: BackgroundToContentMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  switch (message.type) {
    case "FILL_INPUT": {
      console.log("[AI客服助手] 📝 收到填入指令:", message.payload.reply.substring(0, 30) + "...");
      const ok = fillReplyIntoChatInput(
        message.payload.reply,
        selectorConfig
      );
      sendResponse({ success: ok });
      return true;
    }

    case "REQUEST_CONTEXT": {
      const userId = getCurrentUserId(selectorConfig);
      const context: CustomerContext = {
        userId,
        messages: [...messageLog],
      };
      sendResponse(context);
      return true;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 全局类型扩展
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    __aiAssistantInjected?: boolean;
  }
}
