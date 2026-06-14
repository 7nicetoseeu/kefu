import { Card, Collapse, Descriptions, List, Tag, Typography } from "antd";
import { LearningResult } from "../types/learning";

interface Props {
  result: LearningResult;
}

export default function LearningResultPreview({ result }: Props) {
  return (
    <Card title="学习结果预览">
      <Typography.Paragraph>{result.summary}</Typography.Paragraph>
      <Collapse
        defaultActiveKey={["knowledge", "rules", "scripts", "risks"]}
        items={[
          {
            key: "knowledge",
            label: "知识点建议",
            children: (
              <List
                dataSource={result.knowledgeSuggestions}
                renderItem={(item) => (
                  <List.Item>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="标题">{item.title}</Descriptions.Item>
                      <Descriptions.Item label="内容">{item.content}</Descriptions.Item>
                      <Descriptions.Item label="关键词">
                        {item.keywords.map((keyword) => (
                          <Tag key={keyword}>{keyword}</Tag>
                        ))}
                      </Descriptions.Item>
                      <Descriptions.Item label="分类">{item.category ?? "-"}</Descriptions.Item>
                    </Descriptions>
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: "rules",
            label: "处理规则建议",
            children: (
              <List
                dataSource={result.ruleSuggestions}
                renderItem={(item) => (
                  <List.Item>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="名称">{item.name}</Descriptions.Item>
                      <Descriptions.Item label="触发条件">{item.trigger}</Descriptions.Item>
                      <Descriptions.Item label="触发关键词">
                        {item.triggerKeywords.map((keyword) => (
                          <Tag key={keyword}>{keyword}</Tag>
                        ))}
                      </Descriptions.Item>
                      <Descriptions.Item label="动作">{item.action}</Descriptions.Item>
                      <Descriptions.Item label="优先级">{item.priority}</Descriptions.Item>
                      <Descriptions.Item label="风险等级">{item.riskLevel}</Descriptions.Item>
                    </Descriptions>
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: "scripts",
            label: "推荐话术",
            children: (
              <List
                dataSource={result.scriptSuggestions}
                renderItem={(item) => (
                  <List.Item>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="场景">{item.scene}</Descriptions.Item>
                      <Descriptions.Item label="话术">{item.content}</Descriptions.Item>
                      <Descriptions.Item label="语气">{item.tone ?? "-"}</Descriptions.Item>
                    </Descriptions>
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: "risks",
            label: "风险提示",
            children: (
              <List
                dataSource={result.riskTips}
                renderItem={(item) => (
                  <List.Item>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="场景">{item.scene}</Descriptions.Item>
                      <Descriptions.Item label="提示">{item.content}</Descriptions.Item>
                    </Descriptions>
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
