import { Button, Card, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TableRowSelection } from "antd/es/table/interface";
import { useEffect, useMemo, useState } from "react";
import {
  approveReviewItem,
  batchReviewItems,
  getReviewItem,
  listReviewItems,
  rejectReviewItem,
  updateReviewItem,
} from "../api/reviewApi";
import { ReviewItem, ReviewItemType, ReviewStatus } from "../types/learning";

const typeLabels: Record<ReviewItemType, string> = {
  knowledge: "知识",
  rule: "规则",
  script: "话术",
  risk_tip: "风险提示",
};

const statusLabels: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

const statusColors: Record<ReviewStatus, string> = {
  pending: "gold",
  approved: "green",
  rejected: "red",
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ReviewStatus | undefined>("pending");
  const [type, setType] = useState<ReviewItemType | undefined>();
  const [editingItem, setEditingItem] = useState<ReviewItem | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const filters = useMemo(() => ({ status, type }), [status, type]);

  async function loadItems() {
    setLoading(true);
    try {
      setItems(await listReviewItems(filters));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载审核项失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, [filters]);

  async function openEditor(id: number) {
    try {
      const item = await getReviewItem(id);
      setEditingItem(item);
      setJsonText(JSON.stringify(item.payload, null, 2));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载详情失败");
    }
  }

  async function savePayload() {
    if (!editingItem) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON 必须是对象");
      }
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "JSON 格式错误");
      return;
    }

    setSaving(true);
    try {
      await updateReviewItem(editingItem.id, payload);
      message.success("已保存");
      setEditingItem(null);
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: number) {
    try {
      await approveReviewItem(id);
      message.success("已通过");
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "通过失败");
    }
  }

  async function handleReject(id: number) {
    try {
      await rejectReviewItem(id);
      message.success("已拒绝");
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "拒绝失败");
    }
  }

  async function handleBatch(action: "approve" | "reject") {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择审核项");
      return;
    }

    const actionLabel = action === "approve" ? "通过" : "拒绝";

    setBatchLoading(true);
    try {
      const results = await batchReviewItems(action, selectedRowKeys.map(Number));
      const targetStatus = action === "approve" ? "approved" as const : "rejected" as const;
      const succeeded = results.filter((r) => r.status === targetStatus).length;
      const skipped = results.filter((r) => r.status === "skipped").length;

      if (skipped > 0) {
        message.warning(`批量${actionLabel}：${succeeded} 条成功，${skipped} 条跳过（非 pending 状态）`);
      } else {
        message.success(`批量${actionLabel}：${succeeded} 条已处理`);
      }

      setSelectedRowKeys([]);
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : `批量${actionLabel}失败`);
    } finally {
      setBatchLoading(false);
    }
  }

  // Only allow selecting pending items
  const rowSelection: TableRowSelection<ReviewItem> = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    getCheckboxProps: (record: ReviewItem) => ({
      disabled: record.status !== "pending",
    }),
  };

  const columns: ColumnsType<ReviewItem> = [
    { title: "ID", dataIndex: "id", width: 80 },
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      render: (value: ReviewItemType) => typeLabels[value],
    },
    {
      title: "标题/名称/场景",
      render: (_, record) =>
        String(record.payload.title ?? record.payload.name ?? record.payload.scene ?? record.payload.content ?? "-"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: ReviewStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>,
    },
    { title: "来源任务 ID", dataIndex: "learningTaskId", width: 130 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "操作",
      width: 260,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEditor(record.id)}>
            查看/编辑
          </Button>
          <Popconfirm title="确认通过该审核项？" onConfirm={() => handleApprove(record.id)}>
            <Button size="small" type="primary" disabled={record.status !== "pending"}>
              通过
            </Button>
          </Popconfirm>
          <Popconfirm title="确认拒绝该审核项？" onConfirm={() => handleReject(record.id)}>
            <Button size="small" danger disabled={record.status !== "pending"}>
              拒绝
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        人工审核
      </Typography.Title>
      <Card>
        <div className="toolbar">
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="审核状态"
            value={status}
            onChange={setStatus}
            options={[
              { label: "待审核", value: "pending" },
              { label: "已通过", value: "approved" },
              { label: "已拒绝", value: "rejected" },
            ]}
          />
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="审核类型"
            value={type}
            onChange={setType}
            options={[
              { label: "知识", value: "knowledge" },
              { label: "规则", value: "rule" },
              { label: "话术", value: "script" },
              { label: "风险提示", value: "risk_tip" },
            ]}
          />
          <Button onClick={loadItems}>刷新</Button>

          {/* Batch actions */}
          {selectedRowKeys.length > 0 ? (
            <>
              <span style={{ lineHeight: "32px", marginLeft: 8 }}>
                已选 <strong>{selectedRowKeys.length}</strong> 项
              </span>
              <Popconfirm
                title={`确认批量通过 ${selectedRowKeys.length} 条审核项？`}
                onConfirm={() => handleBatch("approve")}
              >
                <Button type="primary" loading={batchLoading}>
                  批量通过
                </Button>
              </Popconfirm>
              <Popconfirm
                title={`确认批量拒绝 ${selectedRowKeys.length} 条审核项？`}
                onConfirm={() => handleBatch("reject")}
              >
                <Button danger loading={batchLoading}>
                  批量拒绝
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Typography.Text type="secondary" style={{ lineHeight: "32px" }}>
              {pendingCount > 0 ? `共 ${pendingCount} 条待审核，勾选后可批量处理` : "无待审核项"}
            </Typography.Text>
          )}
        </div>
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal
        title={editingItem ? `审核项 #${editingItem.id}` : "审核项"}
        open={Boolean(editingItem)}
        onCancel={() => setEditingItem(null)}
        onOk={savePayload}
        okText="保存"
        confirmLoading={saving}
        okButtonProps={{ disabled: editingItem?.status !== "pending" }}
        width={760}
      >
        <textarea
          className="json-editor"
          value={jsonText}
          disabled={editingItem?.status !== "pending"}
          onChange={(event) => setJsonText(event.target.value)}
        />
      </Modal>
    </Space>
  );
}
