import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  message,
  Result,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  importKnowledgeCsv,
  previewKnowledgeCsv,
  type KnowledgeImportPreview,
  type KnowledgeImportResult,
} from "../api/knowledgeImportApi";

const { Dragger } = Upload;

export default function KnowledgeImportPage() {
  const navigate = useNavigate();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [useAI, setUseAI] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<KnowledgeImportPreview | null>(null);
  const [importResult, setImportResult] = useState<KnowledgeImportResult | null>(null);

  async function handlePreview() {
    if (fileList.length === 0) {
      message.warning("请先选择 CSV 文件");
      return;
    }

    const file = fileList[0].originFileObj as File;
    if (!file) {
      message.warning("文件无效");
      return;
    }

    setPreviewing(true);
    try {
      const data = await previewKnowledgeCsv(file);
      setPreview(data);
      setCurrentStep(1);
      message.success(`成功解析 ${data.totalRows} 条知识条目`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "文件预览失败");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    const file = fileList[0]?.originFileObj as File;
    if (!file) {
      message.warning("文件无效");
      return;
    }

    setImporting(true);
    try {
      const data = await importKnowledgeCsv(file, useAI);
      setImportResult(data);
      setCurrentStep(2);
      message.success(data.message);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setFileList([]);
    setPreview(null);
    setImportResult(null);
    setCurrentStep(0);
  }

  const previewColumns: ColumnsType<KnowledgeImportPreview["items"][number]> = [
    { title: "#", width: 50, render: (_, __, index) => index + 1 },
    {
      title: "场景",
      dataIndex: "title",
      width: 180,
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: "回复话术",
      dataIndex: "content",
      ellipsis: true,
      render: (value: string) => (value.length > 80 ? `${value.slice(0, 80)}…` : value),
    },
    {
      title: "特殊情况说明",
      dataIndex: "notes",
      width: 200,
      render: (value?: string) =>
        value ? (
          <Typography.Text type="secondary">{value.length > 40 ? `${value.slice(0, 40)}…` : value}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={3} className="page-title">
        知识库导入
      </Typography.Title>

      {/* Step indicator */}
      <Card>
        <Steps
          current={currentStep}
          items={[
            { title: "上传文件", description: "上传 huashu.csv 话术文件" },
            { title: "预览确认", description: "确认解析内容" },
            { title: "生成审核项", description: "交由人工审核后加入知识库" },
          ]}
        />
      </Card>

      {/* Step 0: Upload */}
      <Card title="上传知识库 CSV 文件">
        <Typography.Paragraph type="secondary">
          请上传严格遵循 huashu.csv 格式的话术知识库文件。CSV 必须包含以下列：
          <Tag>title</Tag>（场景）、<Tag>content</Tag>（回复话术）、<Tag>notes</Tag>（特殊情况说明，可为空）。
          <br />
          示例：<code>id,title,content,notes</code>
        </Typography.Paragraph>

        <Dragger
          accept=".csv"
          maxCount={1}
          fileList={fileList}
          onChange={({ fileList: newList }) => setFileList(newList)}
          beforeUpload={() => false}
          onRemove={() => setFileList([])}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
          <p className="ant-upload-hint">仅支持 .csv 文件，单文件最大 10MB</p>
        </Dragger>

        <div style={{ marginTop: 16 }}>
          <Space>
            <Checkbox checked={useAI} onChange={(e) => setUseAI(e.target.checked)}>
              使用 AI 分析场景并优化知识条目（推荐）
            </Checkbox>
          </Space>
        </div>

        <div style={{ marginTop: 12 }}>
          <Space>
            <Button type="primary" onClick={handlePreview} loading={previewing} disabled={fileList.length === 0}>
              预览文件内容
            </Button>
            <Button onClick={handleImport} loading={importing} disabled={fileList.length === 0}>
              直接导入（跳过预览）
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </div>
      </Card>

      {/* Step 1: Preview */}
      {preview ? (
        <Card title={`预览解析结果（共 ${preview.totalRows} 条）`}>
          <Table
            rowKey={(_, index) => String(index)}
            columns={previewColumns}
            dataSource={preview.items}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
          <div style={{ marginTop: 12 }}>
            <Space>
              <Button type="primary" onClick={handleImport} loading={importing}>
                确认并生成审核项
              </Button>
              <Typography.Text type="secondary">
                系统将生成待审核的知识条目，需在「人工审核」页面审核通过后正式加入知识库
              </Typography.Text>
            </Space>
          </div>
        </Card>
      ) : null}

      {/* Step 2: Result */}
      {importResult ? (
        <Card
          title={
            <Space>
              <span>生成审核项完成</span>
              <Tag color="gold">待审核</Tag>
              {importResult.aiEnriched ? <Tag color="blue">AI 已优化</Tag> : null}
            </Space>
          }
        >
          <Result
            status="success"
            title={`成功生成 ${importResult.reviewItemsCreated} 条待审核知识条目`}
            subTitle={importResult.message}
            extra={[
              <Button
                type="primary"
                key="review"
                onClick={() => navigate("/reviews?status=pending&type=knowledge")}
              >
                前往人工审核页面
              </Button>,
              <Button key="reset" onClick={handleReset}>
                继续导入
              </Button>,
            ]}
          />

          <Descriptions bordered column={2} size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="解析条目数">{importResult.totalParsed}</Descriptions.Item>
            <Descriptions.Item label="生成审核项数">{importResult.reviewItemsCreated}</Descriptions.Item>
            <Descriptions.Item label="AI 优化">{importResult.aiEnriched ? "是" : "否"}</Descriptions.Item>
            <Descriptions.Item label="审核项状态">
              <Tag color="gold">待审核</Tag>
            </Descriptions.Item>
            {importResult.aiSummary ? (
              <Descriptions.Item label="AI 分析摘要" span={2}>
                <Typography.Text>{importResult.aiSummary}</Typography.Text>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {importResult.reviewItems.length > 0 ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                已生成的审核项 ID
              </Typography.Title>
              <Space wrap>
                {importResult.reviewItems.map((item) => (
                  <Tag key={item.id} color="gold" style={{ cursor: "pointer" }}>
                    #{item.id}
                  </Tag>
                ))}
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                以上审核项已进入「人工审核」页面，支持批量通过。审核通过后会自动加入正式知识库。
              </Typography.Paragraph>
            </>
          ) : null}
        </Card>
      ) : null}
    </Space>
  );
}
