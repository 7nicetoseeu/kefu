/**
 * AI 客服辅助助手 — Side Panel 主界面
 *
 * 交互模式：
 * 1. 手动输入场景/客户原话 → AI 生成 5 条推荐回复
 * 2. 手动输入客服草稿 → AI 润色为 3 种专业风格
 * 3. 单击任意话术卡片选中（高亮），再点击输入框自动粘贴
 * 4. 双击话术卡片复制到剪贴板
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Form,
  Input,
  message,
  Space,
  Tag,
  Typography,
  Tooltip,
} from "antd";
import {
  RobotOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  CopyOutlined,
  SearchOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { SuggestedReply } from "../types";
import { generateReply, polishReply, searchLibrary, type SearchResults } from "./api";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function extractRepliesFromRaw(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed.data?.replies && Array.isArray(parsed.data.replies)) {
        return parsed.data.replies.map(String).filter(Boolean);
      }
      if (parsed.replies && Array.isArray(parsed.replies)) {
        return parsed.replies.map(String).filter(Boolean);
      }
      if (typeof parsed.reply === "string" && parsed.reply.trim()) {
        return [parsed.reply.trim()];
      }
    } catch { /* 不是合法 JSON */ }
  }
  return [t];
}

function normalizeSuggestion(sug: SuggestedReply): SuggestedReply {
  const allReplies: string[] = [];
  for (const r of extractRepliesFromRaw(sug.reply)) {
    if (!allReplies.includes(r)) allReplies.push(r);
  }
  if (sug.alternatives) {
    for (const alt of sug.alternatives) {
      for (const r of extractRepliesFromRaw(String(alt))) {
        if (!allReplies.includes(r)) allReplies.push(r);
      }
    }
  }
  return { ...sug, reply: allReplies[0] ?? "", alternatives: allReplies.slice(1) };
}

// ---------------------------------------------------------------------------
// 选中话术卡片样式
// ---------------------------------------------------------------------------
const SELECTED_STYLE: React.CSSProperties = {
  border: "2px solid #1677ff",
  background: "#e6f4ff",
  boxShadow: "0 0 8px rgba(22,119,255,0.25)",
};

// ---------------------------------------------------------------------------
// Side Panel 组件
// ---------------------------------------------------------------------------
const SidePanel: React.FC = () => {
  // ---- 场景输入 ----
  const [manualInput, setManualInput] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestedReply | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- 润色输入 ----
  const [polishDraft, setPolishDraft] = useState("");
  const [polishedSuggestion, setPolishedSuggestion] = useState<SuggestedReply | null>(null);
  const [polishing, setPolishing] = useState(false);

  // ---- 选中话术 ----
  const [selectedReply, setSelectedReply] = useState<string | null>(null);

  // ---- 搜索 ----
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  // ---- 配置 ----
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:3001");
  const [error, setError] = useState<string | null>(null);

  // ---- 合并回复 ----
  const allReplies = useMemo(() => {
    if (!suggestion) return [];
    const normalized = normalizeSuggestion(suggestion);
    const result: string[] = [];
    if (normalized.reply) result.push(normalized.reply);
    if (normalized.alternatives) {
      for (const alt of normalized.alternatives) {
        if (alt && !result.includes(alt)) result.push(alt);
      }
    }
    return result;
  }, [suggestion]);

  const polishedReplies = useMemo(() => {
    if (!polishedSuggestion) return [];
    const normalized = normalizeSuggestion(polishedSuggestion);
    const result: string[] = [];
    if (normalized.reply) result.push(normalized.reply);
    if (normalized.alternatives) {
      for (const alt of normalized.alternatives) {
        if (alt && !result.includes(alt)) result.push(alt);
      }
    }
    return result;
  }, [polishedSuggestion]);

  // ---- 加载配置 ----
  useEffect(() => {
    chrome.storage.local.get("apiBaseUrl").then((stored) => {
      if (stored.apiBaseUrl) setApiBaseUrl(stored.apiBaseUrl);
    });
  }, []);

  // ---- 选中话术 ----
  const handleSelectReply = useCallback((text: string) => {
    setSelectedReply((prev) => (prev === text ? null : text));
  }, []);

  // ---- 输入框获得焦点时粘贴选中话术 ----
  const handleInputFocus = useCallback(
    (currentValue: string, setValue: (v: string) => void) => {
      if (selectedReply) {
        const insert = selectedReply;
        setSelectedReply(null);
        if (currentValue) {
          setValue(currentValue + "\n" + insert);
        } else {
          setValue(insert);
        }
        message.success("已粘贴选中话术");
      }
    },
    [selectedReply],
  );

  // ---- 场景 → AI 回复 ----
  const handleGenerateReply = useCallback(async () => {
    const input = manualInput.trim();
    if (!input) { message.warning("请输入场景描述或客户原话"); return; }
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const sug = await generateReply(input);
      const normalized = normalizeSuggestion(sug);
      setSuggestion(normalized);
      const count = 1 + (normalized.alternatives?.length ?? 0);
      message.success(`已生成 ${count} 条推荐回复`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成失败";
      setError(msg);
      message.error(msg);
    } finally { setLoading(false); }
  }, [manualInput]);

  // ---- 润色回复 ----
  const handlePolish = useCallback(async () => {
    const draft = polishDraft.trim();
    if (!draft) { message.warning("请输入客服回复草稿"); return; }
    setPolishing(true);
    setError(null);
    setPolishedSuggestion(null);
    try {
      const sug = await polishReply(draft);
      const normalized = normalizeSuggestion(sug);
      setPolishedSuggestion(normalized);
      const count = 1 + (normalized.alternatives?.length ?? 0);
      message.success(`已生成 ${count} 条润色版本`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "润色失败";
      setError(msg);
      message.error(msg);
    } finally { setPolishing(false); }
  }, [polishDraft]);

  // ---- 双击复制 ----
  const handleDoubleClickCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success("已复制到剪贴板");
    }).catch(() => {
      message.error("复制失败");
    });
  }, []);

  // ---- 关键词检索 ----
  const handleSearch = useCallback(async () => {
    const kw = searchKeyword.trim();
    if (!kw) { message.warning("请输入检索关键词"); return; }
    setSearching(true);
    setSearchResults(null);
    try {
      const results = await searchLibrary(kw);
      setSearchResults(results);
      const total = (results.knowledge?.length ?? 0) + (results.rules?.length ?? 0) + (results.scripts?.length ?? 0) + (results.riskTips?.length ?? 0);
      if (total === 0) message.info("未找到匹配结果");
      else message.success(`找到 ${total} 条匹配结果`);
    } catch (err) {
      message.error("检索失败: " + (err instanceof Error ? err.message : err));
    } finally { setSearching(false); }
  }, [searchKeyword]);

  // ---- 保存配置 ----
  const handleSaveConfig = useCallback(async () => {
    await chrome.storage.local.set({ apiBaseUrl });
    message.success("配置已保存");
  }, [apiBaseUrl]);

  // =========================================================================
  // 渲染
  // =========================================================================
  return (
    <div style={{ padding: 16, height: "100vh", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 标题栏 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: "#667eea" }} />
          <Text strong style={{ fontSize: 16 }}>AI 客服辅助</Text>
        </Space>
        {selectedReply && (
          <Tag color="blue" style={{ cursor: "pointer" }} onClick={() => setSelectedReply(null)}>
            已选中 1 条话术 ✕
          </Tag>
        )}
      </div>

      <Divider style={{ margin: 0 }} />

      {/* ================================================================ */}
      {/* 场景输入 — 生成 AI 回复                                            */}
      {/* ================================================================ */}
      <Card title="📝 输入场景或客户原话" size="small" style={{ flex: "0 0 auto" }}>
        <TextArea
          rows={4}
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onFocus={() => handleInputFocus(manualInput, setManualInput)}
          placeholder="例如：客户说物流太慢了，已经等了5天还没到，要求退款"
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button type="primary" icon={<RobotOutlined />} loading={loading}
            onClick={handleGenerateReply} disabled={!manualInput.trim()}>
            生成 AI 推荐回复
          </Button>
          <Text style={{ fontSize: 11, color: "#8c8c8c" }}>Ctrl+Enter 快捷生成</Text>
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 润色输入 — AI 优化客服草稿                                           */}
      {/* ================================================================ */}
      <Card title="✏️ 输入客服回复进行润色" size="small" style={{ flex: "0 0 auto" }}>
        <TextArea
          rows={3}
          value={polishDraft}
          onChange={(e) => setPolishDraft(e.target.value)}
          onFocus={() => handleInputFocus(polishDraft, setPolishDraft)}
          placeholder="例如：亲，你的快递到了，下楼拿一下"
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button icon={<RobotOutlined />} loading={polishing}
            onClick={handlePolish} disabled={!polishDraft.trim()}
            style={{ borderColor: "#faad14", color: "#faad14" }}>
            润色优化回复
          </Button>
          <Text style={{ fontSize: 11, color: "#8c8c8c" }}>Ctrl+Enter 快捷润色</Text>
        </div>
      </Card>

      {/* ---- 关键词检索 ---- */}
      <div style={{ display: "flex", gap: 6 }}>
        <Input
          placeholder="输入关键词检索知识库/话术/规则..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onPressEnter={handleSearch}
          allowClear size="small"
          prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
          style={{ flex: 1 }}
        />
        <Button type="default" icon={<SearchOutlined />} loading={searching}
          onClick={handleSearch} size="small">检索</Button>
      </div>

      {/* 检索结果 */}
      {searchResults && (
        <div style={{ maxHeight: "35%", overflow: "auto", border: "1px solid #e8e8e8", borderRadius: 8, padding: 8 }}>
          <div style={{ marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Space size={4}><SearchOutlined /><Text strong style={{ fontSize: 12 }}>检索 "{searchKeyword}"</Text></Space>
            <Button size="small" type="text" onClick={() => setSearchResults(null)}
              icon={<span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>} />
          </div>
          {/* 话术（优先显示） */}
          {searchResults.scripts?.length > 0 && searchResults.scripts.map((s: Record<string, unknown>) => {
            const content = String(s.content ?? "");
            const isSelected = selectedReply === content;
            return (
              <div key={`s-${s.id}`} onClick={() => handleSelectReply(content)} onDoubleClick={() => handleDoubleClickCopy(content)}
                style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                  border: isSelected ? "2px solid #1677ff" : "1px solid #b7eb8f",
                  background: isSelected ? "#e6f4ff" : "#f6ffed",
                  boxShadow: isSelected ? "0 0 8px rgba(22,119,255,0.25)" : undefined }}
                title="单击选中 · 双击复制">
                <Tag color="green" style={{ fontSize: 10, lineHeight: "16px" }}>{String(s.scene ?? "")}</Tag>
                <Paragraph style={{ margin: "2px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}
                  ellipsis={{ rows: 2, expandable: true }}>{content}</Paragraph>
              </div>
            );
          })}
          {/* 知识库 */}
          {searchResults.knowledge?.length > 0 && searchResults.knowledge.map((k: Record<string, unknown>) => {
            const content = String(k.content ?? "");
            const isSelected = selectedReply === content;
            return (
              <div key={`k-${k.id}`} onClick={() => handleSelectReply(content)} onDoubleClick={() => handleDoubleClickCopy(content)}
                style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                  border: isSelected ? "2px solid #1677ff" : "1px solid #d6e4ff",
                  background: isSelected ? "#e6f4ff" : "#f0f5ff",
                  boxShadow: isSelected ? "0 0 8px rgba(22,119,255,0.25)" : undefined }}
                title="单击选中 · 双击复制">
                <Text strong style={{ fontSize: 12 }}>{String(k.title ?? "")}</Text>
                <Paragraph style={{ margin: "2px 0 0", fontSize: 12, whiteSpace: "pre-wrap" }}
                  ellipsis={{ rows: 2, expandable: true }}>{content}</Paragraph>
              </div>
            );
          })}
        </div>
      )}

      {/* 错误 */}
      {error && <Alert message={error} type="error" showIcon closable onClose={() => setError(null)} />}

      {/* ================================================================ */}
      {/* AI 推荐回复 — 5 条                                                  */}
      {/* ================================================================ */}
      {allReplies.length > 0 && (
        <div style={{ maxHeight: "55%", overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong style={{ fontSize: 13 }}>💡 AI 推荐回复</Text>
            {suggestion?.persona && <Tag color="purple">{suggestion.persona.name}</Tag>}
            <Tooltip title="单击选中 · 双击复制 · 点击输入框自动粘贴">
              <CopyOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
            </Tooltip>
            <Text style={{ fontSize: 10, color: "#bfbfbf" }}>单击选中 · 双击复制</Text>
            <Badge count={allReplies.length} style={{ backgroundColor: "#597ef7" }} />
          </div>

          {allReplies.map((replyText, idx) => {
            const isSelected = selectedReply === replyText;
            return (
              <div key={idx}
                onClick={() => handleSelectReply(replyText)}
                onDoubleClick={() => handleDoubleClickCopy(replyText)}
                style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer", transition: "border-color 0.2s",
                  background: isSelected ? "#e6f4ff" : idx === 0 ? "#f0fdf4" : "#fafafa",
                  border: isSelected ? "2px solid #1677ff" : idx === 0 ? "1px solid #86efac" : "1px solid #e8e8e8",
                  boxShadow: isSelected ? "0 0 8px rgba(22,119,255,0.25)" : undefined,
                }}
                title={isSelected ? "已选中 · 点击上方输入框粘贴" : "单击选中 · 双击复制到剪贴板"}>
                <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Tag color={isSelected ? "blue" : idx === 0 ? "success" : "default"}
                    style={{ margin: 0, fontSize: 10, lineHeight: "16px" }}>
                    {idx === 0 ? "⭐ 推荐" : `备选 ${idx + 1}`}
                  </Tag>
                  {isSelected && <Text style={{ fontSize: 10, color: "#1677ff" }}>✓ 已选中</Text>}
                </div>
                <Paragraph style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {replyText}
                </Paragraph>
              </div>
            );
          })}

          {/* 命中依据 */}
          {(suggestion?.matchedKnowledge?.length || suggestion?.matchedRules?.length || suggestion?.matchedScripts?.length) && (
            <Collapse ghost size="small" items={[{
              key: "matched", label: "命中依据",
              children: (
                <Space wrap size={4}>
                  {suggestion.matchedKnowledge?.map((k, i) => <Tag key={`k-${i}`} color="blue">📚 {k.title}</Tag>)}
                  {suggestion.matchedRules?.map((r, i) => <Tag key={`r-${i}`} color="orange">📏 {r.name}</Tag>)}
                  {suggestion.matchedScripts?.map((s, i) => <Tag key={`s-${i}`} color="green">📝 {s.scene}</Tag>)}
                </Space>
              ),
            }]} />
          )}

          {suggestion?.riskTips && suggestion.riskTips.length > 0 && (
            <Alert type="warning" icon={<SafetyCertificateOutlined />} showIcon message="风险提示"
              description={suggestion.riskTips.map((tip, i) => (
                <div key={i} style={{ fontSize: 12, marginTop: 2 }}>⚠ {tip.scene}: {tip.content}</div>
              ))} />
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 润色结果 — 3 条                                                      */}
      {/* ================================================================ */}
      {polishedReplies.length > 0 && (
        <div style={{ maxHeight: "40%", overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong style={{ fontSize: 13 }}>✨ 润色结果</Text>
            <Badge count={polishedReplies.length} style={{ backgroundColor: "#faad14" }} />
            <Text style={{ fontSize: 10, color: "#bfbfbf" }}>单击选中 · 双击复制</Text>
          </div>

          {polishedReplies.map((replyText, idx) => {
            const isSelected = selectedReply === replyText;
            return (
              <div key={idx}
                onClick={() => handleSelectReply(replyText)}
                onDoubleClick={() => handleDoubleClickCopy(replyText)}
                style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer", transition: "border-color 0.2s",
                  background: isSelected ? "#e6f4ff" : idx === 0 ? "#fffbe6" : "#fafafa",
                  border: isSelected ? "2px solid #1677ff" : idx === 0 ? "1px solid #ffe58f" : "1px solid #e8e8e8",
                  boxShadow: isSelected ? "0 0 8px rgba(22,119,255,0.25)" : undefined,
                }}
                title={isSelected ? "已选中 · 点击上方输入框粘贴" : "单击选中 · 双击复制到剪贴板"}>
                <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Tag color={isSelected ? "blue" : idx === 0 ? "gold" : "default"}
                    style={{ margin: 0, fontSize: 10, lineHeight: "16px" }}>
                    {idx === 0 ? "⭐ 标准专业" : idx === 1 ? "💬 亲切友好" : "⚡ 简洁高效"}
                  </Tag>
                  {isSelected && <Text style={{ fontSize: 10, color: "#1677ff" }}>✓ 已选中</Text>}
                </div>
                <Paragraph style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {replyText}
                </Paragraph>
              </div>
            );
          })}
        </div>
      )}

      {/* 设置 */}
      <Collapse ghost size="small" items={[{
        key: "settings", label: <Space><SettingOutlined />设置</Space>,
        children: (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Form.Item label="后端 API 地址" style={{ marginBottom: 0 }}>
              <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://localhost:3001" />
            </Form.Item>
            <Button type="primary" size="small" onClick={handleSaveConfig}>保存设置</Button>
            <Text style={{ fontSize: 11, color: "#8c8c8c" }}>
              单击话术卡片选中 → 点击任意输入框自动粘贴。双击卡片直接复制。
            </Text>
          </div>
        ),
      }]} />
    </div>
  );
};

export default SidePanel;
