import React, { useEffect } from 'react'; // <-- 导入 useEffect
import { Layout, Menu, theme } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom'; // 导入导航和位置 Hooks
import { LastVisitedProvider, useLastVisited } from './contexts/LastVisitedContext'; // <-- 导入 Context
import AppRouter from './router';

const { Content, Sider } = Layout;

// 更新菜单项，key 对应路由路径
const menuItems = [
  { key: '/chat-mode-selection', label: '聊天' }, // <-- 修改 key 指向模式选择页
  { key: '/scripts', label: '剧本管理' },
  { key: '/characters', label: '角色管理' },
  { key: '/ai-config', label: 'AI 配置' },
  { key: '/history', label: '历史记录' },
  { key: '/settings', label: '设置' },
];

// 内部组件，用于访问 Context 和处理导航逻辑
const AppLayout: React.FC = () => {
  const navigate = useNavigate(); // 获取导航函数
  const location = useLocation(); // 获取当前位置信息
  const { updateLastVisitedNavInfo, getLastVisitedNavInfo } = useLastVisited(); // <-- 使用新的函数名
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // --- 更新最后访问路径 ---
  useEffect(() => {
    const path = location.pathname;
    console.log("[App.tsx] Current path:", path); // 添加日志
    if (path.startsWith('/scripts')) {
      // 记录路径和 state
      updateLastVisitedNavInfo('scripts', path, location.state);
    } else if (path.startsWith('/characters')) {
      updateLastVisitedNavInfo('characters', path, location.state);
    } else if (path.startsWith('/chat') || path.startsWith('/single-user-single-ai')) { // 包含聊天相关路径
      // 特别注意：聊天相关的页面依赖 state，所以必须记录 state
      updateLastVisitedNavInfo('chat', path, location.state);
    } else if (path.startsWith('/ai-config')) {
      updateLastVisitedNavInfo('ai-config', path, location.state);
    } else if (path.startsWith('/history')) {
      updateLastVisitedNavInfo('history', path, location.state);
    } else if (path.startsWith('/settings')) {
      updateLastVisitedNavInfo('settings', path, location.state);
    }
  }, [location.pathname, location.state, updateLastVisitedNavInfo]); // 依赖路径和 state 变化

  // --- 修改菜单点击处理函数 ---
  const handleMenuClick = (e: { key: string }) => {
    const defaultPath = e.key; // 菜单项的默认路径
    let sectionKey: 'chat' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings' | null = null;

    // 根据默认路径判断属于哪个版块
    if (defaultPath.startsWith('/chat') || defaultPath.startsWith('/single-user-single-ai')) {
      sectionKey = 'chat';
    } else if (defaultPath.startsWith('/scripts')) {
      sectionKey = 'scripts';
    } else if (defaultPath.startsWith('/characters')) {
      sectionKey = 'characters';
    } else if (defaultPath.startsWith('/ai-config')) {
      sectionKey = 'ai-config';
    } else if (defaultPath.startsWith('/history')) {
      sectionKey = 'history';
    } else if (defaultPath.startsWith('/settings')) {
      sectionKey = 'settings';
    }

    if (sectionKey) {
      const { path: targetPath, state: targetState } = getLastVisitedNavInfo(sectionKey, defaultPath);
      // 在导航前再加一个明确的日志，看看最终决定跳去哪，以及是否带 state
      console.log(`[App.tsx] Final navigation decision for ${sectionKey}: Navigating to ${targetPath} ${targetState ? 'with state' : 'without state'} (Default was ${defaultPath})`);
      // 导航时带上 state
      navigate(targetPath, { state: targetState });
    } else {
      // 对于没有 sectionKey 的情况也加个日志
      console.log(`[App.tsx] No sectionKey found for ${defaultPath}. Navigating directly.`);
      navigate(defaultPath); // 如果没有匹配的版块，直接跳默认路径
    }
  };

  // --- 计算当前选中的菜单项 ---
  // 需要更智能地判断当前激活的菜单项，即使在子路由下也要高亮父菜单
  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/scripts')) return ['/scripts'];
    if (path.startsWith('/characters')) return ['/characters'];
    // 聊天相关的路径都高亮“聊天”菜单
    if (path.startsWith('/chat') || path.startsWith('/single-user-single-ai')) return ['/chat-mode-selection'];
    if (path.startsWith('/ai-config')) return ['/ai-config'];
    if (path.startsWith('/history')) return ['/history'];
    if (path.startsWith('/settings')) return ['/settings'];
    return [path]; // 其他情况按路径匹配
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
          selectedKeys={getSelectedKeys()} // <-- 使用新的计算逻辑
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

// 外层包裹 Provider
const App: React.FC = () => {
  return (
    <LastVisitedProvider>
      <AppLayout />
    </LastVisitedProvider>
  );
};

export default App;
