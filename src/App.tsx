import React from 'react';
// 移除了未使用的 Header 和 Footer 导入
import { Layout, Menu, theme } from 'antd';
import AppRouter from './router';

// 移除了未使用的 Header 和 Footer 解构赋值
const { Content, Sider } = Layout;

// 占位菜单项 (稍后会被替换)
const items = [
  { key: '1', label: '聊天' },
  { key: '2', label: '剧本管理' },
  { key: '3', label: '角色管理' },
  { key: '4', label: 'AI 配置' },
  { key: '5', label: '历史记录' },
  { key: '6', label: '设置' },
];

const App: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}> {/* 让布局填充整个屏幕高度 */}
      <Sider width={200} style={{ background: colorBgContainer }}> {/* 左侧边栏 */}
        <div style={{ height: 32, margin: 16, background: 'rgba(0, 0, 0, 0.2)', borderRadius: borderRadiusLG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
          剧场 Logo
        </div>
        <Menu
          mode="inline"
          defaultSelectedKeys={['1']} // 默认选中项
          style={{ height: 'calc(100% - 64px)', borderRight: 0 }} // 调整高度
          items={items}
          // 稍后添加点击处理程序用于导航
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
