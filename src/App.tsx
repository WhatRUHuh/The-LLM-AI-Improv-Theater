import React from 'react'; // <-- 移除 useEffect
import { Layout, Menu, theme } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { LastVisitedProvider, useLastVisited } from './contexts/LastVisitedContext'; // <-- 移除 NavigationInfo
import AppRouter from './router';

const { Content, Sider } = Layout;

const menuItems = [
  { key: '/chat-mode-selection', label: '聊天' },
  { key: '/scripts', label: '剧本管理' },
  { key: '/characters', label: '角色管理' },
  { key: '/ai-config', label: 'AI 配置' },
  { key: '/history', label: '历史记录' },
  { key: '/settings', label: '设置' },
];

// 定义 SectionKey 类型 (与 Context 文件保持一致)
type SectionKey = 'chat' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings';

// 辅助函数：根据路径判断属于哪个版块
const getSectionKeyFromPath = (path: string): SectionKey | null => {
  if (path.startsWith('/scripts')) return 'scripts';
  if (path.startsWith('/characters')) return 'characters';
  if (path.startsWith('/chat') || path.startsWith('/single-user-single-ai')) return 'chat';
  if (path.startsWith('/ai-config')) return 'ai-config';
  if (path.startsWith('/history')) return 'history';
  if (path.startsWith('/settings')) return 'settings';
  return null;
};


// 内部组件，用于访问 Context 和处理导航逻辑
const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // 注意：这里不再直接解构 update 方法，因为更新逻辑移到页面内部
  const { getLastVisitedNavInfo } = useLastVisited();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // --- 修改菜单点击处理函数 ---
  const handleMenuClick = (e: { key: string }) => {
    const defaultPath = e.key; // 菜单项的默认路径
    const sectionKey = getSectionKeyFromPath(defaultPath); // 使用辅助函数获取版块 key

    if (sectionKey) {
      // 获取完整的导航信息，包括 internalState
      const { path: targetPath, internalState: targetInternalState } = getLastVisitedNavInfo(sectionKey, defaultPath);
      // 在导航前再加一个明确的日志
      console.log(`[App.tsx] Final navigation decision for ${sectionKey}: Navigating to ${targetPath} ${targetInternalState ? 'with internal state' : 'without internal state'} (Default was ${defaultPath})`);
      // 导航时将保存的 internalState 作为新的 navigation state 传递
      navigate(targetPath, { state: targetInternalState });
    } else {
      console.log(`[App.tsx] No sectionKey found for ${defaultPath}. Navigating directly.`);
      navigate(defaultPath); // 如果没有匹配的版块，直接跳默认路径
    }
  };

  // --- 计算当前选中的菜单项 ---
  const getSelectedKeys = () => {
    const path = location.pathname;
    const sectionKey = getSectionKeyFromPath(path);
    // 根据版块 key 返回对应的菜单 key
    switch (sectionKey) {
      case 'scripts': return ['/scripts'];
      case 'characters': return ['/characters'];
      case 'chat': return ['/chat-mode-selection'];
      case 'ai-config': return ['/ai-config'];
      case 'history': return ['/history'];
      case 'settings': return ['/settings'];
      default: return [path]; // 其他情况按路径匹配
    }
  };


  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} style={{ background: colorBgContainer }}>
        <div style={{ height: 32, margin: 16, background: 'rgba(0, 0, 0, 0.2)', borderRadius: borderRadiusLG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
          剧场 Logo
        </div>
        <Menu
          mode="inline"
          selectedKeys={getSelectedKeys()}
          style={{ height: 'calc(100% - 64px)', borderRight: 0 }}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '16px' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            <AppRouter />
          </div>
        </Content>
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
