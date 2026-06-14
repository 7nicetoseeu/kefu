import {
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { InboxOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { generateLearning, getLearningTask, listLearningTasks, uploadChatFiles } from "../api/learningApi";
import { testAiConnection, AiTestResult } from "../api/aiTestApi";
import LearningResultPreview from "../components/LearningResultPreview";
import { GenerateLearningResponse, LearningInputType, LearningTask } from "../types/learning";

const { TextArea } = Input;
const { Dragger } = Upload;

const defaultInstruction = "请从以上内容中总结客服辅助 Agent 可以学习的知识点、处理规则、推荐话术和风险提示。";

const inputTypeLabels: Record<LearningInputType, string> = {
  natural_language: "自然语言",
  chat_history: "历史聊天记录",
  business_rule: "业务规则",
};

const contentPlaceholders: Record<LearningInputType, string> = {
  natural_language:
    "用口语化的方式描述客服场景和期望的处理方式。\n\n例如：客户问物流延迟时，要先安抚，再询问订单号，并说明会协助查询物流状态。如果客户情绪激动，要更加耐心。",
  chat_history:
    "粘贴客服聊天记录，每行一条消息，格式：角色-内容。或使用下方「批量上传」上传文件。\n\n例如：\n客户：你好，我的包裹三天没更新物流了\n客服：亲亲，非常抱歉给您带来不便，我先帮您查一下订单号。\n客户：订单号 8880001234\n客服：好的，马上为您查询。",
  business_rule:
    "按场景结构化描述处理规则，便于 AI 提取知识点和策略。\n\n例如：\n# 退款场景\n触发条件：客户要求退款且订单未发货\n处理流程：\n1. 先道歉安抚\n2. 确认订单号和退款原因\n3. 告知预计退款时间 3-5 个工作日\n禁止操作：不要引导客户自行联系支付平台\n\n# 换货场景\n触发条件：客户收到商品有质量问题\n优先级：高\n处理流程：\n1. 请客户提供照片凭证\n2. 确认是否符合换货条件\n3. 符合 → 发起换货；不符合 → 礼貌解释\n风险提示：不要说\"这是你自己的问题\"",
};

interface FormValues {
  inputType: LearningInputType;
  content: string;
  instruction?: string;
}

export default function LearningPage() {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<GenerateLearningResponse | null>(null);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [detailTask, setDetailTask] = useState<LearningTask | null>(null);
  const [aiTestResult, setAiTestResult] = useState<AiTestResult | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // Watch inputType to dynamically change placeholder
  const watchedInputType = Form.useWatch("inputType", form);
  const currentPlaceholder = contentPlaceholders[watchedInputType ?? "natural_language"];

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      setTasks(await listLearningTasks());
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载任务列表失败");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function handleSubmit(values: FormValues) {
    setLoading(true);
    try {
      const data = await generateLearning(values);
      setResult(data);
      message.success(`已生成 ${data.reviewItems.length} 条审核项，请前往人工审核页面处理`);
      form.setFieldValue("content", "");
      await loadTasks();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (fileList.length === 0) {
      message.warning("请先选择文件");
      return;
    }
    setUploading(true);
    try {
      const rawFiles = fileList.filter((f) => f.originFileObj).map((f) => f.originFileObj as File);
      const data = await uploadChatFiles(rawFiles);
      message.success(
        `已处理 ${data.processed} 个文件，生成 ${data.totalReviewItems} 条审核项，请前往人工审核页面处理`,
      );
      setFileList([]);
      await loadTasks();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(id: number) {
    try {
      const task = await getLearningTask(id);
      setDetailTask(task);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载任务详情失败");
    }
  }

  async function handleAiTest() {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await testAiConnection();
      setAiTestResult(res);
      if (res.ok) {
        message.success("AI 连接测试完成");
      } else {
        message.error("AI 连接测试失败");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "AI 连接测试请求失败");
    } finally {
      setAiTesting(false);
    }
  }

  const isChatHistory = watchedInputType === "chat_history";

  const taskColumns: ColumnsType<LearningTask> = [
    { title: "ID", dataIndex: "id", width: 60 },
    {
      title: "输入类型",
      dataIndex: "inputType",
      width: 120,
      render: (value: LearningInputType) => inputTypeLabels[value],
    },
    {
      title: "内容摘要",
      dataIndex: "content",
      ellipsis: true,
      render: (value: string) => (value.length > 80 ? `${value.slice(0, 80)}…` : value),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "操作",
      width: 100,
      render: (_, record) => (
        <Button size="small" onClick={() => openDetail(record.id)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        AI 调教
      </Typography.Title>

      {/* AI connection test */}
      <Card
        title={
          <Space>
            <span>AI 连接测试</span>
            {aiTestResult ? (
              <Tag color={aiTestResult.ok ? "green" : "red"}>{aiTestResult.ok ? "连接正常" : "连接失败"}</Tag>
            ) : null}
          </Space>
        }
        size="small"
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space>
            <Button type="default" onClick={handleAiTest} loading={aiTesting}>
              测试 AI 连接
            </Button>
          </Space>
          {aiTestResult ? (
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="状态">
                <Tag color={aiTestResult.ok ? "green" : "red"}>{aiTestResult.ok ? "✓ 正常" : "✗ 失败"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="提供商">{aiTestResult.provider}</Descriptions.Item>
              <Descriptions.Item label="模型">{aiTestResult.model}</Descriptions.Item>
              {aiTestResult.latencyMs > 0 ? (
                <Descriptions.Item label="延迟">{aiTestResult.latencyMs} ms</Descriptions.Item>
              ) : (
                <Descriptions.Item label="延迟">-</Descriptions.Item>
              )}
              <Descriptions.Item label="说明" span={2}>
                <Typography.Text type={aiTestResult.ok ? "success" : "danger"}>{aiTestResult.message}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Space>
      </Card>

      {/* Generate form */}
      <Card title="新建调教任务">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            inputType: "natural_language",
            instruction: defaultInstruction,
          }}
          onFinish={handleSubmit}
        >
          <Form.Item label="输入类型" name="inputType" rules={[{ required: true, message: "请选择输入类型" }]}>
            <Select
              style={{ maxWidth: 320 }}
              options={[
                { label: "自然语言", value: "natural_language" },
                { label: "历史聊天记录", value: "chat_history" },
                { label: "业务规则", value: "business_rule" },
              ]}
            />
          </Form.Item>

          {/* Chat history: show upload area */}
          {isChatHistory ? (
            <>
              <Card title="批量上传聊天记录" size="small" style={{ marginBottom: 16 }}>
                <Typography.Paragraph type="secondary">
                  支持 .txt / .csv / .json / .log 文件。CSV 应包含「时间、角色、内容」列；TXT 每行一条消息。
                </Typography.Paragraph>
                <Dragger
                  multiple
                  accept=".txt,.csv,.json,.log"
                  fileList={fileList}
                  onChange={({ fileList: newList }) => setFileList(newList)}
                  beforeUpload={() => false}
                  onRemove={(file) => setFileList((prev) => prev.filter((f) => f.uid !== file.uid))}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                  <p className="ant-upload-hint">支持批量选择多个文件，单文件最大 10MB</p>
                </Dragger>
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" onClick={handleUpload} loading={uploading} disabled={fileList.length === 0}>
                    上传并生成学习结果
                  </Button>
                </div>
              </Card>

              <Divider plain>或手动粘贴</Divider>
            </>
          ) : null}

          <Form.Item label="调教内容" name="content" rules={[{ required: true, message: "请输入调教内容" }]}>
            <TextArea rows={isChatHistory ? 10 : 7} placeholder={currentPlaceholder} />
          </Form.Item>
          <Form.Item label="补充指令" name="instruction">
            <TextArea rows={4} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            生成学习结果
          </Button>
        </Form>
      </Card>

      {/* Latest result preview */}
      {result ? <LearningResultPreview result={result.result} /> : null}

      {/* Learning task history */}
      <Card title="历史调教任务">
        <div className="toolbar">
          <Button onClick={loadTasks}>刷新</Button>
        </div>
        <Table
          rowKey="id"
          columns={taskColumns}
          dataSource={tasks}
          loading={tasksLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "暂无调教任务" }}
        />
      </Card>

      {/* Task detail modal */}
      <Modal
        title={detailTask ? `调教任务 #${detailTask.id}` : "任务详情"}
        open={Boolean(detailTask)}
        onCancel={() => setDetailTask(null)}
        footer={null}
        width={800}
      >
        {detailTask ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="输入类型">{inputTypeLabels[detailTask.inputType]}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color="blue">{detailTask.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(detailTask.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(detailTask.updatedAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5}>调教内容</Typography.Title>
            <pre className="json-viewer">{detailTask.content}</pre>
            {detailTask.instruction ? (
              <>
                <Typography.Title level={5}>补充指令</Typography.Title>
                <pre className="json-viewer">{detailTask.instruction}</pre>
              </>
            ) : null}
            <Typography.Title level={5}>学习结果</Typography.Title>
            <LearningResultPreview result={detailTask.rawResult} />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
