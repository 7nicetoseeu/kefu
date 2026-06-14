import { AuditOutlined, BulbOutlined, ExperimentOutlined, ImportOutlined, ReadOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { Layout, Menu, Typography } from "antd";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import KnowledgeImportPage from "./pages/KnowledgeImportPage";
import KnowledgeSearchPage from "./pages/KnowledgeSearchPage";
import LearningPage from "./pages/LearningPage";
import LibraryPage from "./pages/LibraryPage";
import PersonaPage from "./pages/PersonaPage";
import ReplyTestPage from "./pages/ReplyTestPage";
import ReviewPage from "./pages/ReviewPage";

const { Header, Sider, Content } = Layout;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? "/learning";

  return (
    <Layout className="app-shell">
      <Sider width={220} className="app-sider">
        <div className="brand">AI 客服辅助 Agent</div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Text strong>AI 客服辅助 Agent 调教与审核系统</Typography.Text>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/learning" replace />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/reviews" element={<ReviewPage />} />
            <Route path="/libraries" element={<LibraryPage />} />
            <Route path="/personas" element={<PersonaPage />} />
            <Route path="/reply-test" element={<ReplyTestPage />} />
            <Route path="/knowledge-import" element={<KnowledgeImportPage />} />
            <Route path="/knowledge-search" element={<KnowledgeSearchPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

const menuItems = [
  {
    key: "/learning",
    icon: <BulbOutlined />,
    label: "AI 调教",
  },
  {
    key: "/reviews",
    icon: <AuditOutlined />,
    label: "人工审核",
  },
  {
    key: "/libraries",
    icon: <ReadOutlined />,
    label: "正式库管理",
  },
  {
    key: "/personas",
    icon: <UserOutlined />,
    label: "人设配置",
  },
  {
    key: "/reply-test",
    icon: <ExperimentOutlined />,
    label: "AI 回复测试",
  },
  {
    key: "/knowledge-import",
    icon: <ImportOutlined />,
    label: "知识库导入",
  },
  {
    key: "/knowledge-search",
    icon: <SearchOutlined />,
    label: "关键词检索",
  },
];
