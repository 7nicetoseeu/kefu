import {
  Button,
  Card,
  Input,
  InputRef,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  batchUpdateCategories,
  createKnowledgeCategory,
  getKnowledgeCategories,
  listLibraryItems,
  updateKnowledgeItemCategory,
  updateLibraryItemStatus,
  type CategoryInfo,
} from "../api/libraryApi";
import { ActiveStatus, LibraryItem, LibraryType } from "../types/learning";

const libraryTabs: Array<{ key: LibraryType; label: string }> = [
  { key: "knowledge", label: "知识库" },
  { key: "rule", label: "策略库" },
  { key: "risk_tip", label: "风险提示" },
];

const statusLabels: Record<ActiveStatus, string> = {
  active: "启用",
  inactive: "停用",
};

export default function LibraryPage() {
  const [type, setType] = useState<LibraryType>("knowledge");
  const [status, setStatus] = useState<ActiveStatus | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<LibraryItem | null>(null);
  const [pageSize, setPageSize] = useState(10);

  // Category management state
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [catEditing, setCatEditing] = useState<string | null>(null); // name of category being renamed
  const [catEditValue, setCatEditValue] = useState("");
  const [catAdding, setCatAdding] = useState(false);
  const [catAddValue, setCatAddValue] = useState("");
  const catInputRef = useRef<InputRef>(null);
  const catAddingRef = useRef(false);

  const filters = useMemo(() => ({ status, category }), [status, category]);

  async function loadItems() {
    setLoading(true);
    try {
      setItems(await listLibraryItems(type, filters));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载正式库失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      setCategories(await getKnowledgeCategories());
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    void loadItems();
  }, [type, filters]);

  useEffect(() => {
    if (type === "knowledge") void loadCategories();
  }, [type, items.length]);

  // ── Category management handlers ──

  async function handleRenameCategory(oldName: string) {
    const newName = catEditValue.trim();
    if (!newName || newName === oldName) {
      setCatEditing(null);
      return;
    }
    try {
      await batchUpdateCategories([{ from: oldName, to: newName }]);
      message.success(`已将「${oldName}」重命名为「${newName}」`);
      setCatEditing(null);
      await loadItems();
      await loadCategories();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重命名失败");
    }
  }

  async function handleDeleteCategory(name: string) {
    try {
      await batchUpdateCategories([{ from: name, to: "通用" }]);
      message.success(`已将「${name}」分类下的条目移至「通用」，分类已删除`);
      if (category === name) setCategory(undefined);
      await loadItems();
      await loadCategories();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleAddCategory() {
    if (catAddingRef.current) {
      return;
    }

    const newName = catAddValue.trim();
    if (!newName) {
      setCatAdding(false);
      setCatAddValue("");
      return;
    }

    catAddingRef.current = true;
    const allExisting = categories.map((c) => c.name);
    if (allExisting.includes(newName)) {
      message.warning(`分类「${newName}」已存在`);
      setCatAdding(false);
      setCatAddValue("");
      catAddingRef.current = false;
      return;
    }
    try {
      await createKnowledgeCategory(newName);
      setCatAdding(false);
      setCatAddValue("");
      message.success(`分类「${newName}」已添加，可在表格中为知识条目分配此分类`);
      await loadCategories();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增分类失败");
    } finally {
      catAddingRef.current = false;
    }
  }

  async function handleItemCategoryChange(itemId: number, newCategory: string) {
    try {
      await updateKnowledgeItemCategory(itemId, newCategory);
      message.success(`已更新分类为「${newCategory}」`);
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, category: newCategory } as LibraryItem : item,
        ),
      );
      await loadCategories();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "分类更新失败");
    }
  }

  // ── Status toggle ──

  async function handleStatusChange(record: LibraryItem) {
    const nextStatus: ActiveStatus = record.status === "active" ? "inactive" : "active";
    try {
      await updateLibraryItemStatus(type, record.id, nextStatus);
      message.success(nextStatus === "active" ? "已启用" : "已停用");
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  // ── All available category options (preset + existing from data) ──

  // All categories come from backend (preset + user-created); "未分类" is virtual, always first
  const allCategoryOptions = useMemo(() => {
    const withoutUncategorized = categories.filter((c) => c.name !== "未分类");
    const sorted = withoutUncategorized.map((c) => c.name).sort();
    return [
      { label: "未分类", value: "未分类" },
      ...sorted.map((c) => ({ label: c, value: c })),
    ];
  }, [categories]);

  const allCategories = categories;

  // ── Table columns ──

  const columns: ColumnsType<LibraryItem> = [
    { title: "ID", dataIndex: "id", width: 60 },
    {
      title: "标题/名称/场景",
      ellipsis: true,
      render: (_: unknown, record: LibraryItem) => getDisplayTitle(record),
    },
    type === "knowledge"
      ? {
          title: "分类",
          dataIndex: "category",
          width: 140,
          render: (value: string | undefined, record: LibraryItem) => (
            <Select
              size="small"
              style={{ width: 120 }}
              value={value || "未分类"}
              onChange={(cat) => handleItemCategoryChange(record.id, cat === "未分类" ? "" : cat)}
              options={allCategoryOptions}
              dropdownMatchSelectWidth={false}
            />
          ),
        }
      : ({} as any),
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: ActiveStatus) => (
        <Tag color={value === "active" ? "green" : "default"}>{statusLabels[value]}</Tag>
      ),
    },
    {
      title: "来源审核 ID",
      dataIndex: "sourceReviewId",
      width: 110,
      render: (value?: number) => value ?? "-",
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 160,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "操作",
      width: 180,
      render: (_: unknown, record: LibraryItem) => (
        <Space>
          <Button size="small" onClick={() => setDetail(record)}>
            详情
          </Button>
          <Button size="small" onClick={() => handleStatusChange(record)}>
            {record.status === "active" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ].filter((col) => Object.keys(col).length > 0) as ColumnsType<LibraryItem>;

  // ── Render ──

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        正式库管理
      </Typography.Title>
      <Card>
        <Tabs activeKey={type} items={libraryTabs} onChange={(key) => setType(key as LibraryType)} />

        {/* ── Category management panel (knowledge only) ── */}
        {type === "knowledge" ? (
          <div style={{ marginBottom: 12, padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
            <Typography.Text strong style={{ marginRight: 8 }}>分类管理：</Typography.Text>
            <Space wrap size={[4, 4]}>
              {allCategories.map((cat) => (
                <span key={cat.name}>
                  {catEditing === cat.name ? (
                    <Input
                      ref={catInputRef}
                      size="small"
                      style={{ width: 100 }}
                      value={catEditValue}
                      onChange={(e) => setCatEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleRenameCategory(cat.name);
                        if (e.key === "Escape") setCatEditing(null);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (catEditValue.trim()) void handleRenameCategory(cat.name);
                          else setCatEditing(null);
                        }, 150);
                      }}
                    />
                  ) : (
                    <Tag
                      color="blue"
                      closable
                      closeIcon={
                        <Popconfirm
                          title={`删除分类「${cat.name}」？\n${cat.count} 条知识将移至「通用」`}
                          onConfirm={() => handleDeleteCategory(cat.name)}
                        >
                          <DeleteOutlined style={{ fontSize: 10 }} />
                        </Popconfirm>
                      }
                    >
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setCatEditing(cat.name);
                          setCatEditValue(cat.name);
                          setTimeout(() => catInputRef.current?.focus(), 50);
                        }}
                      >
                        {cat.name}
                      </span>
                      <span style={{ color: "#8c8c8c", marginLeft: 4 }}>({cat.count})</span>
                      <EditOutlined
                        style={{ marginLeft: 4, fontSize: 10, color: "#8c8c8c", cursor: "pointer" }}
                        onClick={() => {
                          setCatEditing(cat.name);
                          setCatEditValue(cat.name);
                          setTimeout(() => catInputRef.current?.focus(), 50);
                        }}
                      />
                    </Tag>
                  )}
                </span>
              ))}
              {catAdding ? (
                <Input
                  ref={catInputRef}
                  size="small"
                  style={{ width: 100 }}
                  placeholder="新分类名"
                  value={catAddValue}
                  onChange={(e) => setCatAddValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddCategory();
                    if (e.key === "Escape") {
                      setCatAdding(false);
                      setCatAddValue("");
                    }
                  }}
                  onBlur={() => {
                    // Small delay so Enter key fires before blur
                    setTimeout(() => {
                      if (catAddValue.trim()) void handleAddCategory();
                      else {
                        setCatAdding(false);
                        setCatAddValue("");
                      }
                    }, 150);
                  }}
                />
              ) : (
                <Tag
                  icon={<PlusOutlined />}
                  style={{ borderStyle: "dashed", cursor: "pointer" }}
                  onClick={() => {
                    setCatAdding(true);
                    setTimeout(() => catInputRef.current?.focus(), 50);
                  }}
                >
                  新增分类
                </Tag>
              )}
            </Space>
          </div>
        ) : null}

        {/* ── Filters ── */}
        <div className="toolbar">
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="状态"
            value={status}
            onChange={setStatus}
            options={[
              { label: "启用", value: "active" },
              { label: "停用", value: "inactive" },
            ]}
          />
          {type === "knowledge" ? (
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder="分类筛选"
              value={category}
              onChange={setCategory}
              options={allCategoryOptions}
            />
          ) : null}
          <Button onClick={loadItems}>刷新</Button>
        </div>

        {/* ── Table ── */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onShowSizeChange: (_, size) => setPageSize(size),
          }}
        />
      </Card>

      <Modal title="正式库详情" open={Boolean(detail)} footer={null} onCancel={() => setDetail(null)} width={760}>
        <pre className="json-viewer">{detail ? JSON.stringify(detail, null, 2) : ""}</pre>
      </Modal>
    </Space>
  );
}

function getDisplayTitle(record: LibraryItem) {
  if ("title" in record) return record.title;
  if ("name" in record) return record.name;
  if ("scene" in record) return record.scene;
  return "-";
}
