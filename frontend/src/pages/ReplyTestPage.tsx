import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckCircleFilled,
  ClearOutlined,
  CustomerServiceOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { generateReplyTest, type ChatMessage } from "../api/replyTestApi";
import type { ReplyTestResult } from "../types/learning";

const { TextArea } = Input;

interface Message {
  id: string;
  role: "customer" | "agent";
  content: string;           // currently selected reply (for agent messages)
  timestamp: number;
  meta?: ReplyTestResult;
  replies?: string[];        // all reply options from AI
  selectedIndex?: number;    // which reply the user picked (0-based)
}

export default function ReplyTestPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [drawerMeta, setDrawerMeta] = useState<ReplyTestResult | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    const text = inputValue.trim();
    if (!text || loading) return;

    const customerMsg: Message = {
      id: crypto.randomUUID(),
      role: "customer",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, customerMsg]);
    setInputValue("");
    setLoading(true);

    try {
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await generateReplyTest(text, history);

      // Default to the first (highest priority) reply
      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        content: result.replies[0] ?? "",
        timestamp: Date.now(),
        meta: result,
        replies: result.replies,
        selectedIndex: 0,
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成回复失败");
      setMessages((prev) => prev.filter((m) => m.id !== customerMsg.id));
    } finally {
      setLoading(false);
    }
  }

  function handleSelectReply(msgId: string, index: number) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, selectedIndex: index, content: m.replies?.[index] ?? m.content }
          : m,
      ),
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([]);
    setDrawerMeta(null);
    inputRef.current?.focus();
  }

  function showMeta(meta?: ReplyTestResult) {
    if (meta) setDrawerMeta(meta);
  }

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          <RobotOutlined /> AI 回复测试
        </Typography.Title>
        <Popconfirm title="确认清空所有聊天记录？" onConfirm={handleClear}>
          <Button icon={<ClearOutlined />} size="small" disabled={messages.length === 0}>
            清空对话
          </Button>
        </Popconfirm>
      </div>

      {/* Chat area */}
      <div className="chat-area">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <Empty
              image={<CustomerServiceOutlined style={{ fontSize: 64, color: "#bfbfbf" }} />}
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text type="secondary">开始模拟客户与 AI 客服的对话</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    在下方输入客户消息，Enter 发送，Shift+Enter 换行
                  </Typography.Text>
                </Space>
              }
            />
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              <div className="chat-avatar">
                {msg.role === "customer" ? <UserOutlined /> : <RobotOutlined />}
              </div>
              <div className="chat-bubble-content">
                <div className="chat-bubble-header">
                  <span className="chat-role-label">
                    {msg.role === "customer" ? "客户" : "AI 客服"}
                  </span>
                  <span className="chat-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Agent messages: show selected reply + options if multiple */}
                {msg.role === "agent" && msg.replies && msg.replies.length > 1 ? (
                  <div className="reply-options">
                    {msg.replies.map((reply, idx) => {
                      const isSelected = idx === msg.selectedIndex;
                      return (
                        <div
                          key={idx}
                          className={`reply-option ${isSelected ? "selected" : ""}`}
                          onClick={() => handleSelectReply(msg.id, idx)}
                        >
                          <div className="reply-option-header">
                            <Tag color={idx === 0 ? "blue" : idx === 1 ? "green" : "orange"}>
                              {idx === 0 ? "推荐" : idx === 1 ? "备选" : "备选"}
                              {" "}#{idx + 1}
                            </Tag>
                            {isSelected ? (
                              <Tag color="success" icon={<CheckCircleFilled />}>
                                已选择
                              </Tag>
                            ) : null}
                          </div>
                          <div className={`reply-option-text ${isSelected ? "selected" : ""}`}>
                            {reply}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="chat-bubble-text">{msg.content}</div>
                )}

                {msg.meta ? (
                  <Button
                    type="link"
                    size="small"
                    icon={<InfoCircleOutlined />}
                    onClick={() => showMeta(msg.meta)}
                    style={{ padding: 0, marginTop: 8 }}
                  >
                    命中依据
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {loading ? (
          <div className="chat-bubble agent">
            <div className="chat-avatar">
              <RobotOutlined />
            </div>
            <div className="chat-bubble-content">
              <div className="chat-bubble-header">
                <span className="chat-role-label">AI 客服</span>
              </div>
              <Spin size="small" /> <Typography.Text type="secondary">正在生成 3 条推荐回复…</Typography.Text>
            </div>
          </div>
        ) : null}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <TextArea
          ref={inputRef as React.Ref<any>}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入客户消息，Enter 发送，Shift+Enter 换行…"
          rows={2}
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={loading}
          className="chat-input"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!inputValue.trim()}
          className="chat-send-btn"
        >
          发送
        </Button>
      </div>

      {/* Meta drawer */}
      <Drawer
        title="AI 回复命中依据"
        open={Boolean(drawerMeta)}
        onClose={() => setDrawerMeta(null)}
        width={420}
      >
        {drawerMeta ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card title="人设" size="small">
              <Typography.Text>
                {drawerMeta.persona ? (
                  <Tag color="blue">{drawerMeta.persona.name}</Tag>
                ) : (
                  "未配置启用人设"
                )}
              </Typography.Text>
              {drawerMeta.persona?.description ? (
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  {drawerMeta.persona.description}
                </Typography.Paragraph>
              ) : null}
            </Card>

            <Card title={`命中知识 (${drawerMeta.matchedKnowledge.length} 条)`} size="small">
              <List
                dataSource={drawerMeta.matchedKnowledge.slice(0, 10)}
                locale={{ emptyText: "无" }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <Typography.Text type="secondary">{item.content}</Typography.Text>
                      <Space wrap>
                        {item.keywords?.map((kw) => <Tag key={kw}>{kw}</Tag>)}
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>

            <Card title={`命中规则 (${drawerMeta.matchedRules.length} 条)`} size="small">
              <List
                dataSource={drawerMeta.matchedRules}
                locale={{ emptyText: "无" }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{item.name}</Typography.Text>
                      <Typography.Text>触发: {item.trigger}</Typography.Text>
                      <Typography.Text>执行: {item.action}</Typography.Text>
                      <Tag>优先级 {item.priority}</Tag>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>

            <Card title={`命中话术 (${drawerMeta.matchedScripts.length} 条)`} size="small">
              <List
                dataSource={drawerMeta.matchedScripts}
                locale={{ emptyText: "无" }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Tag>{item.scene}</Tag>
                      <Typography.Text>{item.content}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>

            <Card title={`风险提示 (${drawerMeta.riskTips.length} 条)`} size="small">
              <List
                dataSource={drawerMeta.riskTips}
                locale={{ emptyText: "无命中风险提示" }}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Tag color="red">{item.scene}</Tag>
                      <Typography.Text>{item.content}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
