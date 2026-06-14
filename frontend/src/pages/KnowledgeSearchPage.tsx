import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
  Spin,
  Divider,
} from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarFilled,
} from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { searchKnowledge, type KnowledgeSearchResult } from "../api/libraryApi";
import {
  listKeywordMappings,
  searchKeywordMappings,
  createKeywordMapping,
  updateKeywordMapping,
  deleteKeywordMapping,
  type KeywordMapping,
} from "../api/keywordMappingApi";

const { Text, Paragraph } = Typography;

export default function KnowledgeSearchPage() {
  const [query, setQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeSearchResult[]>([]);
  const [customMappings, setCustomMappings] = useState<KeywordMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state for create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<KeywordMapping | null>(null);
  const [modalKeyword, setModalKeyword] = useState("");
  const [modalScript, setModalScript] = useState("");
  const [modalPriority, setModalPriority] = useState(0);
  const [modalLoading, setModalLoading] = useState(false);

  // Load all custom mappings on mount
  const loadMappings = useCallback(async () => {
    try {
      const data = await listKeywordMappings();
      setCustomMappings(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setKnowledgeResults([]);
        setCustomMappings([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      setSearched(true);
      try {
        const [kbResults, mappingResults] = await Promise.all([
          searchKnowledge(trimmed, 5),
          searchKeywordMappings(trimmed),
        ]);
        setKnowledgeResults(kbResults);
        setCustomMappings(mappingResults);
      } catch {
        setKnowledgeResults([]);
        setCustomMappings([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced search on input
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, doSearch]);

  const highlightText = (text: string, keyword: string) => {
    if (!keyword.trim()) return text;
    const terms = keyword
      .trim()
      .split(/[\s,，。！？、；：""''【】《》（）()]+/)
      .filter((t) => t.length > 0);
    if (terms.length === 0) return text;

    const pattern = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (!pattern) return text;
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) => {
      regex.lastIndex = 0;
      return regex.test(part) ? (
        <mark key={i} style={{ background: "#ffd666", padding: "0 2px", borderRadius: 2 }}>
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      );
    });
  };

  // ── Priority quick edit ──
  async function handlePriorityChange(mapping: KeywordMapping, newPriority: number) {
    try {
      const updated = await updateKeywordMapping(mapping.id, { priority: newPriority });
      setCustomMappings((prev) =>
        prev.map((m) => (m.id === mapping.id ? updated : m)),
      );
      message.success("优先级已更新");
    } catch {
      message.error("更新失败");
    }
  }

  // ── Open create modal ──
  function openCreateModal() {
    setEditingMapping(null);
    setModalKeyword("");
    setModalScript("");
    setModalPriority(0);
    setModalOpen(true);
  }

  // ── Open edit modal ──
  function openEditModal(mapping: KeywordMapping) {
    setEditingMapping(mapping);
    setModalKeyword(mapping.keyword);
    setModalScript(mapping.script);
    setModalPriority(mapping.priority);
    setModalOpen(true);
  }

  // ── Submit modal ──
  async function handleModalSubmit() {
    if (!modalKeyword.trim() || !modalScript.trim()) {
      message.warning("关键词和话术内容不能为空");
      return;
    }
    setModalLoading(true);
    try {
      if (editingMapping) {
        const updated = await updateKeywordMapping(editingMapping.id, {
          keyword: modalKeyword.trim(),
          script: modalScript.trim(),
          priority: modalPriority,
        });
        setCustomMappings((prev) =>
          prev.map((m) => (m.id === editingMapping.id ? updated : m)),
        );
        message.success("映射已更新");
      } else {
        const created = await createKeywordMapping({
          keyword: modalKeyword.trim(),
          script: modalScript.trim(),
          priority: modalPriority,
        });
        setCustomMappings((prev) => [...prev, created]);
        message.success("映射已创建");
      }
      setModalOpen(false);
    } catch {
      message.error("操作失败");
    } finally {
      setModalLoading(false);
    }
  }

  // ── Delete mapping ──
  async function handleDelete(id: number) {
    try {
      await deleteKeywordMapping(id);
      setCustomMappings((prev) => prev.filter((m) => m.id !== id));
      message.success("已删除");
    } catch {
      message.error("删除失败");
    }
  }

  const totalCount = knowledgeResults.length + customMappings.length;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        关键词检索
      </Typography.Title>

      <Card>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          输入关键词检索知识库内容。当用户聊天内容无法自动匹配知识库时，可在此手动搜索相关知识条目。
          匹配到的话术可自定义优先级，下次搜索时优先展示。
        </Paragraph>

        <Input
          size="large"
          prefix={<SearchOutlined />}
          placeholder="输入关键词，如：物流、退款、发货时效…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          onPressEnter={() => doSearch(query)}
        />
      </Card>

      {/* ── 搜索结果 ── */}
      <Card
        title={searched ? `检索结果（${totalCount} 条）` : "检索结果"}
        extra={
          <Button icon={<PlusOutlined />} type="primary" ghost onClick={openCreateModal}>
            新增话术映射
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin tip="搜索中…" />
          </div>
        ) : !searched ? (
          <Empty description="输入关键词开始检索" />
        ) : totalCount === 0 ? (
          <Empty description="未找到匹配的内容，请尝试其他关键词，或点击「新增话术映射」手动添加">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新增话术映射
            </Button>
          </Empty>
        ) : (
          <>
            {/* Custom keyword mappings (shown first — highest priority) */}
            {customMappings.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <StarFilled style={{ color: "#faad14" }} />
                  <Text strong style={{ color: "#faad14" }}>
                    自定义话术映射（优先匹配）
                  </Text>
                </div>
                <List
                  itemLayout="vertical"
                  dataSource={customMappings}
                  renderItem={(item) => (
                    <List.Item
                      style={{
                        borderLeft: "3px solid #faad14",
                        paddingLeft: 16,
                        background: "#fffbe6",
                        borderRadius: 4,
                        marginBottom: 8,
                      }}
                      extra={
                        <Space direction="vertical" align="end">
                          <Tag color="gold">自定义</Tag>
                          <Space size={4}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              优先级
                            </Text>
                            <InputNumber
                              size="small"
                              min={0}
                              max={100}
                              style={{ width: 64 }}
                              value={item.priority}
                              onChange={(n) => handlePriorityChange(item, n ?? 0)}
                            />
                          </Space>
                        </Space>
                      }
                      actions={[
                        <Button
                          key="edit"
                          size="small"
                          type="link"
                          icon={<EditOutlined />}
                          onClick={() => openEditModal(item)}
                        >
                          编辑
                        </Button>,
                        <Popconfirm
                          key="delete"
                          title="确定删除此映射？"
                          onConfirm={() => handleDelete(item.id)}
                        >
                          <Button size="small" type="link" danger icon={<DeleteOutlined />}>
                            删除
                          </Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag color="orange">{highlightText(item.keyword, query)}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              创建于 {new Date(item.createdAt).toLocaleString()}
                            </Text>
                          </Space>
                        }
                      />
                      <Paragraph
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.7,
                        }}
                      >
                        {highlightText(item.script, query)}
                      </Paragraph>
                    </List.Item>
                  )}
                />
                {knowledgeResults.length > 0 && (
                  <Divider style={{ margin: "16px 0" }} />
                )}
              </>
            )}

            {/* Knowledge base results */}
            {knowledgeResults.length > 0 && (
              <List
                itemLayout="vertical"
                dataSource={knowledgeResults}
                renderItem={(item, index) => (
                  <List.Item
                    style={{
                      borderLeft: index === 0 && customMappings.length === 0 ? "3px solid #1677ff" : undefined,
                      paddingLeft: index === 0 && customMappings.length === 0 ? 16 : undefined,
                    }}
                    extra={
                      <Tag color={index === 0 && customMappings.length === 0 ? "gold" : "default"} style={{ marginTop: 8 }}>
                        匹配度 {item.score}
                      </Tag>
                    }
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{highlightText(item.title, query)}</Text>
                          {item.category ? <Tag color="blue">{item.category}</Tag> : null}
                          <Tag color="green">启用</Tag>
                        </Space>
                      }
                      description={
                        item.keywords?.length ? (
                          <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
                            <Text type="secondary">关键词：</Text>
                            {item.keywords.map((kw: string) => (
                              <Tag key={kw} color="geekblue">
                                {highlightText(kw, query)}
                              </Tag>
                            ))}
                          </Space>
                        ) : null
                      }
                    />
                    <Paragraph
                      style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}
                    >
                      {highlightText(item.content, query)}
                    </Paragraph>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      更新于 {new Date(item.updatedAt).toLocaleString()}
                    </Text>
                  </List.Item>
                )}
              />
            )}
          </>
        )}
      </Card>

      {/* ── 创建/编辑话术映射模态框 ── */}
      <Modal
        title={editingMapping ? "编辑话术映射" : "新增话术映射"}
        open={modalOpen}
        onOk={handleModalSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        okText={editingMapping ? "保存" : "创建"}
        cancelText="取消"
        width={560}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              关键词
            </Text>
            <Input
              placeholder="如：物流、退款、发货时效"
              value={modalKeyword}
              onChange={(e) => setModalKeyword(e.target.value)}
            />
          </div>
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              话术内容
            </Text>
            <Input.TextArea
              rows={4}
              placeholder="输入匹配到该关键词时展示的话术内容…"
              value={modalScript}
              onChange={(e) => setModalScript(e.target.value)}
            />
          </div>
          <div>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              优先级
            </Text>
            <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
              数值越高，在搜索结果中越靠前显示
            </Text>
            <InputNumber
              min={0}
              max={100}
              style={{ width: 120 }}
              value={modalPriority}
              onChange={(n) => setModalPriority(n ?? 0)}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
