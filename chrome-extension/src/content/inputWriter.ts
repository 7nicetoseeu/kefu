import type { ChatPageSelectorConfig } from "../types";
import { detectChatInput } from "./domReader";

/**
 * 输入框写入器
 *
 * 将 AI 生成的推荐回复填入 Web 客服聊天输入框。
 * 兼容 textarea、input[type=text] 和 contenteditable 三种输入方式。
 *
 * ⚠️ 仅填入内容，不自动发送。
 *    客服必须手动按 Enter 或点击发送按钮来实际发出消息。
 */

/**
 * 将回复文本填入聊天输入框
 *
 * @param reply - 要填入的回复文本
 * @param config - 选择器配置
 * @returns 是否成功填入
 */
export function fillReplyIntoChatInput(
  reply: string,
  config: ChatPageSelectorConfig
): boolean {
  if (!reply || reply.trim().length === 0) {
    console.warn("[AI 客服助手] 回复文本为空，跳过填入");
    return false;
  }

  const input = detectChatInput(config);

  if (!input) {
    console.warn(
      `[AI 客服助手] 未找到聊天输入框 (${config.chatInputSelector})`
    );
    return false;
  }

  try {
    const tagName = input.tagName.toUpperCase();

    if (tagName === "TEXTAREA" || tagName === "INPUT") {
      // 原生表单元素
      const formInput = input as HTMLTextAreaElement | HTMLInputElement;
      formInput.value = reply;

      // 触发 input 和 change 事件，确保框架（React/Vue 等）感知变化
      formInput.dispatchEvent(new Event("input", { bubbles: true }));
      formInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (input.getAttribute("contenteditable") === "true") {
      // contenteditable 元素
      input.textContent = reply;

      // 触发 input 事件
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // 其他情况：尝试设置 value
      const anyInput = input as HTMLTextAreaElement;
      anyInput.value = reply;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 聚焦输入框
    input.focus();

    console.log("[AI 客服助手] 回复已填入输入框");
    return true;
  } catch (err) {
    console.error("[AI 客服助手] 填入回复时出错:", err);
    return false;
  }
}
