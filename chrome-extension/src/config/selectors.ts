import type { ChatPageSelectorConfig } from "../types";

/**
 * 默认选择器配置 — 网易七鱼 (NetEase Qiyu) 客服平台
 *
 * DOM 结构:
 *   chat.html:     div.m-msglist.j-flag > div.msg.msg_left (客户) / div.msg.msg_right (客服)
 *   queue.html:    div.sess_itm.z-crt (当前会话), data-sid="6834665697"
 *
 * 如需适配其他平台，修改此配置即可。
 */
export const defaultSelectorConfig: ChatPageSelectorConfig = {
  // ── 客户 ID ──
  // 策略1: 聊天页左侧消息头像中的 .f-hd (如 <span class="f-hd">洪*</span>)
  // 策略2: 队列页当前会话的 data-sid 属性
  activeUserIdSelector: ".msg_left .f-hd, .sess_itm.z-crt [data-sid], .sess_itm.z-crt",

  // ── 消息列表容器 ──
  // 七鱼: div.m-msglist.j-flag
  messageContainerSelector: ".m-msglist",

  // ── 单条消息元素 ──
  // 七鱼: div.msg (每条消息一条)
  messageItemSelector: ".msg",

  // ── 客户消息 (左侧) ──
  // 七鱼: .msg.msg_left (客户发送的消息)
  // 注意：排除 .systip .msgsplit .qa-list .workflow 等非消息元素
  customerMessageSelector: ".msg.msg_left",

  // ── 客服消息 (右侧) ──
  // 七鱼: .msg.msg_right (客服发送的消息)
  agentMessageSelector: ".msg.msg_right",

  // ── 消息正文 ──
  // 七鱼: .msg-bubble 里的 p 标签
  messageContentSelector: ".msg-bubble p, .msg-bubble .p, .msg-bubble",

  // ── 聊天输入框 ──
  // 七鱼: 页面底部的 textarea 或 contenteditable
  chatInputSelector: "textarea, [contenteditable='true'], input[type='text']",
};

/**
 * 需要排除的非消息元素（系统提示、历史分割线等）
 * 这些元素的文本不应该被当作客户消息捕获
 */
export const NOISE_SELECTORS = [
  ".systip",         // 系统提示: "用户进入", "服务小记已提交"
  ".msgsplit",       // 历史消息分割线: "以上为历史消息"
  ".msgsplit1",      // 消息分割占位
  ".qa-list",        // 机器人问答卡片 (qa-list.msg-bubble)
  ".workflow",       // 工作流卡片
  ".crm-thirdorder-wrapper", // CRM 订单卡片
  ".bot-typeset",    // 机器人快捷回复模板
  ".operation-box",  // 消息操作按钮 (撤回/引用)
  ".u-icon-font",    // 图标字体
  ".m-tooltip",      // 提示框
];

/**
 * 判断元素是否为需要排除的噪声元素
 */
export function isNoiseElement(el: Element): boolean {
  for (const sel of NOISE_SELECTORS) {
    try {
      if (el.matches(sel) || el.closest(sel)) {
        return true;
      }
    } catch {
      // 无效选择器，跳过
    }
  }
  return false;
}
