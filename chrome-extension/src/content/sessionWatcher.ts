/**
 * 会话切换检测器
 *
 * 当客服在网易七鱼平台切换客户时，通过三种策略检测变化：
 * 1. MutationObserver 监听 .m-msglist 容器的移除（主要）
 * 2. URL 轮询检测 ?id= 参数变化（辅助）
 * 3. 队列页 .sess_itm.z-crt class 变化（辅助）
 *
 * 所有策略汇总到一个 300ms trailing debounce 回调，
 * 避免同一会话切换多次触发。
 */

export type SessionSwitchCallback = () => void;

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
let msglistParentObserver: MutationObserver | null = null;
let sessionListObserver: MutationObserver | null = null;
let sessionListChildObserver: MutationObserver | null = null;
let urlPollTimer: ReturnType<typeof setInterval> | null = null;
let lastSessionId: string | null = null;
let callback: SessionSwitchCallback | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 启动时间戳，用于首次加载保护（2s 内忽略触发） */
let startTime = 0;
const GRACE_PERIOD_MS = 2000;

/** 跟踪 .m-msglist 是否曾被移除过（首次添加不算切换） */
let msglistWasRemoved = false;

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------
function trigger(): void {
  if (!callback) return;

  // 首次加载保护：启动后 2s 内的触发全部忽略
  if (Date.now() - startTime < GRACE_PERIOD_MS) {
    console.log("[AI客服助手] ⏸ 保护期内，忽略触发");
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log("[AI客服助手] 🔄 检测到会话切换");
    callback?.();
  }, 300);
}

// ---------------------------------------------------------------------------
// 策略 A: MutationObserver 监听 .m-msglist 父容器
// 只在 .m-msglist 被移除时触发 — 这才是真正的会话切换信号
// 忽略 .m-msglist 的新增（页面初次加载可能异步创建容器）
// ---------------------------------------------------------------------------
function setupMsglistObserver(): void {
  // 先断开旧观察者
  if (msglistParentObserver) {
    msglistParentObserver.disconnect();
    msglistParentObserver = null;
  }

  // 查找 .m-msglist 的父元素
  const msglist = document.querySelector(".m-msglist");
  if (!msglist || !msglist.parentElement) {
    console.log("[AI客服助手] ⚠ 未找到 .m-msglist 或其父元素，1s 后重试……");
    setTimeout(setupMsglistObserver, 1000);
    return;
  }

  const parent = msglist.parentElement;
  console.log("[AI客服助手] ✓ 会话监听已绑定到:", parent.className || parent.tagName);

  msglistParentObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // 只关心 .m-msglist 被移除 — 这是用户主动切换会话的信号
      for (const node of m.removedNodes) {
        if (node instanceof Element && node.matches?.(".m-msglist")) {
          msglistWasRemoved = true;
          console.log("[AI客服助手] 📤 .m-msglist 已移除 (会话切换)");
          trigger();
          return;
        }
      }

      // .m-msglist 移除后，新 .m-msglist 添加时才触发重新初始化
      // 前提：之前确实发生过移除（不是初次加载）
      if (msglistWasRemoved) {
        for (const node of m.addedNodes) {
          if (node instanceof Element && node.matches?.(".m-msglist")) {
            msglistWasRemoved = false;
            console.log("[AI客服助手] 📥 新 .m-msglist 已插入 (新会话就绪)");
            trigger();
            return;
          }
        }
      }
    }
  });

  msglistParentObserver.observe(parent, { childList: true });
}

// ---------------------------------------------------------------------------
// 策略 B: URL 轮询
// 每 500ms 检查 window.location.search 中 ?id= 参数
// 只在 ID 从已知值变为不同值时触发（忽略 null → 值的首次设置）
// ---------------------------------------------------------------------------
function extractSessionIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function setupUrlPolling(): void {
  lastSessionId = extractSessionIdFromUrl();

  urlPollTimer = setInterval(() => {
    const currentId = extractSessionIdFromUrl();

    // 只有从非 null 变成另一个非 null 值才算切换
    // null → "xxx" 是首次加载，不需要触发
    if (currentId !== null && lastSessionId !== null && currentId !== lastSessionId) {
      console.log(`[AI客服助手] 🔗 URL 会话变更: ${lastSessionId} → ${currentId}`);
      lastSessionId = currentId;
      trigger();
      return;
    }

    // 更新追踪值（包括 null → 值的首次设置）
    if (currentId !== lastSessionId) {
      lastSessionId = currentId;
    }
  }, 500);
}

// ---------------------------------------------------------------------------
// 策略 C: 队列页 .sess_itm.z-crt class 变化
// 监听 .session-scroll-list 中 .sess_itm 元素的 class 属性变化
// ---------------------------------------------------------------------------
function setupSessionListObserver(): void {
  if (sessionListObserver) {
    sessionListObserver.disconnect();
    sessionListObserver = null;
  }
  if (sessionListChildObserver) {
    sessionListChildObserver.disconnect();
    sessionListChildObserver = null;
  }

  const sessionList = document.querySelector(".session-scroll-list");
  if (!sessionList) {
    // 非队列页，忽略
    return;
  }

  console.log("[AI客服助手] ✓ 队列页会话列表监听已启动");

  sessionListObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "class") {
        const target = m.target as Element;
        if (target.matches?.(".sess_itm") && target.classList.contains("z-crt")) {
          const sid = target.getAttribute("data-sid");
          console.log(`[AI客服助手] 📋 队列选中会话: ${sid}`);
          trigger();
        }
      }
    }
  });

  // 监听所有 .sess_itm 元素的 class 变化
  for (const el of sessionList.querySelectorAll(".sess_itm")) {
    sessionListObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
  }

  // 同时监听 sessionList 子节点变化（新增的 .sess_itm 需要重新绑定）
  sessionListChildObserver = new MutationObserver(() => {
    if (sessionListObserver) {
      for (const el of sessionList.querySelectorAll(".sess_itm")) {
        try {
          sessionListObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
        } catch { /* 已在观察 */ }
      }
    }
  });
  sessionListChildObserver.observe(sessionList, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 启动会话切换检测
 *
 * @param onSwitch - 检测到会话切换时的回调（已 debounce + 2s 保护期）
 */
export function startSessionWatcher(onSwitch: SessionSwitchCallback): void {
  // 先停止旧的
  stopSessionWatcher();

  callback = onSwitch;
  startTime = Date.now();
  msglistWasRemoved = false;
  console.log("[AI客服助手] 🔍 会话切换检测已启动 (2s 保护期)");

  // 策略 A: .m-msglist 容器移除
  setupMsglistObserver();

  // 策略 B: URL 轮询
  setupUrlPolling();

  // 策略 C: 队列页 class 变化
  setupSessionListObserver();
}

/**
 * 停止会话切换检测，清理所有观察器和定时器
 */
export function stopSessionWatcher(): void {
  if (msglistParentObserver) {
    msglistParentObserver.disconnect();
    msglistParentObserver = null;
  }

  if (sessionListObserver) {
    sessionListObserver.disconnect();
    sessionListObserver = null;
  }

  if (sessionListChildObserver) {
    sessionListChildObserver.disconnect();
    sessionListChildObserver = null;
  }

  if (urlPollTimer !== null) {
    clearInterval(urlPollTimer);
    urlPollTimer = null;
  }

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  lastSessionId = null;
  callback = null;
  console.log("[AI客服助手] 会话切换检测已停止");
}
