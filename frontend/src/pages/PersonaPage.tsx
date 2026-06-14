import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { createPersona, listPersonas, updatePersona, updatePersonaStatus } from "../api/personaApi";
import { ActiveStatus, PersonaConfig } from "../types/learning";

const { TextArea } = Input;

interface FormValues {
  name: string;
  description: string;
  tone: string;
  styleRulesText: string;
  forbiddenPhrasesText: string;
  status: ActiveStatus;
}

export default function PersonaPage() {
  const [form] = Form.useForm<FormValues>();
  const [items, setItems] = useState<PersonaConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<PersonaConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function loadItems() {
    setLoading(true);
    try {
      setItems(await listPersonas());
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载人设失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      name: "",
      description: "",
      tone: "polite",
      styleRulesText: "礼貌、简洁、先安抚再处理",
      forbiddenPhrasesText: "你自己看\n我也没办法",
      status: "active",
    });
    setModalOpen(true);
  }

  function openEdit(record: PersonaConfig) {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      tone: record.tone,
      styleRulesText: record.styleRules.join("\n"),
      forbiddenPhrasesText: record.forbiddenPhrases.join("\n"),
      status: record.status,
    });
    setModalOpen(true);
  }

  async function savePersona(values: FormValues) {
    const payload = {
      name: values.name,
      description: values.description,
      tone: values.tone,
      styleRules: lines(values.styleRulesText),
      forbiddenPhrases: lines(values.forbiddenPhrasesText),
      status: values.status,
    };

    try {
      if (editing) {
        await updatePersona(editing.id, payload);
        message.success("已保存");
      } else {
        await createPersona(payload);
        message.success("已创建");
      }
      setModalOpen(false);
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function toggleStatus(record: PersonaConfig) {
    const nextStatus: ActiveStatus = record.status === "active" ? "inactive" : "active";
    try {
      await updatePersonaStatus(record.id, nextStatus);
      message.success(nextStatus === "active" ? "已启用" : "已停用");
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  const columns: ColumnsType<PersonaConfig> = [
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "名称", dataIndex: "name" },
    { title: "语气", dataIndex: "tone", width: 120 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: ActiveStatus) => <Tag color={value === "active" ? "green" : "default"}>{value === "active" ? "启用" : "停用"}</Tag>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "操作",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" onClick={() => toggleStatus(record)}>
            {record.status === "active" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        人设配置
      </Typography.Title>
      <Card>
        <div className="toolbar">
          <Button type="primary" onClick={openCreate}>
            新建人设
          </Button>
          <Button onClick={loadItems}>刷新</Button>
        </div>
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
      <Modal
        title={editing ? `编辑人设 #${editing.id}` : "新建人设"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={720}
        okText="保存"
      >
        <Form<FormValues> form={form} layout="vertical" onFinish={savePersona}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item label="语气" name="tone">
            <Input placeholder="polite / friendly / professional" />
          </Form.Item>
          <Form.Item label="风格规则" name="styleRulesText">
            <TextArea rows={4} placeholder="每行一条" />
          </Form.Item>
          <Form.Item label="禁用表达" name="forbiddenPhrasesText">
            <TextArea rows={4} placeholder="每行一条" />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { label: "启用", value: "active" },
                { label: "停用", value: "inactive" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function lines(value: string) {
  return value
    .split(/\r?\n|，|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
