import React from 'react';
import { Layout, Menu, theme } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom'; // 导入导航和位置 Hooks
import AppRouter from './router';

const { Content, Sider } = Layout;

// 更新菜单项，key 对应路由路径
const menuItems = [
  { key: '/chat-setup', label: '聊天' }, // 默认指向聊天设置
  { key: '/scripts', label: '剧本管理' },
  { key: '/characters', label: '角色管理' },
  { key: '/ai-config', label: 'AI 配置' },
  { key: '/history', label: '历史记录' },
  { key: '/settings', label: '设置' },
];

const App: React.FC = () => {
  const navigate = useNavigate(); // 获取导航函数
  const location = useLocation(); // 获取当前位置信息
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 菜单点击处理函数
  const handleMenuClick = (e: { key: string }) => {
    navigate(e.key); // 点击时导航到对应的路径
  };

  return (
    <Layout style={{ minHeight: '100vh' }}> {/* 让布局填充整个屏幕高度 */}
      <Sider width={200} style={{ background: colorBgContainer }}> {/* 左侧边栏 */}
        <div style={{ height: 32, margin: 16, background: 'rgba(0, 0, 0, 0.2)', borderRadius: borderRadiusLG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
          剧场 Logo
        </div>
        <Menu
          mode="inline"
          // 根据当前路径设置选中项，移除 defaultSelectedKeys
          selectedKeys={[location.pathname]}
          style={{ height: 'calc(100% - 64px)', borderRight: 0 }} // 调整高度
          items={menuItems} // 使用更新后的菜单项
          onClick={handleMenuClick} // 添加点击处理函数
        />
      </Sider>
      <Layout> {/* 右侧布局 */}
        {/* 如果需要，稍后可以在此处添加 Header */}
        {/* <Header style={{ padding: 0, background: colorBgContainer }} /> */}
        <Content style={{ margin: '16px' }}> {/* 主要内容区域 */}
          <div
            style={{
              padding: 24,
              minHeight: 360, // 确保内容区域有一定高度
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            <AppRouter /> {/* 在此处渲染路由内容 */}
          </div>
        </Content>
        {/* 如果需要，稍后可以在此处添加 Footer */}
        {/* <Footer style={{ textAlign: 'center' }}>
          LLM AI 即兴剧场 ©{new Date().getFullYear()} 由你创建!
        </Footer> */}
      </Layout>
    </Layout>
  );
};

export default App;
