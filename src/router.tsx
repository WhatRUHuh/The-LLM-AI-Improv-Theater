import React from 'react';
import { Routes, Route } from 'react-router-dom';

// 未来页面组件的占位符
const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ padding: '20px' }}>
    <h2>{title}</h2>
    <p>页面内容待填充...</p>
  </div>
);

const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* 初始默认路由，可以指向聊天设置或主界面 */}
      <Route path="/" element={<PlaceholderPage title="首页/聊天设置" />} />

      {/* 后续会在这里添加更多路由 */}
      {/*
      <Route path="/chat-setup" element={<ChatSetupPage />} />
      <Route path="/chat-interface" element={<ChatInterfacePage />} />
      <Route path="/scripts" element={<ScriptManagementPage />} />
      <Route path="/roles" element={<RoleManagementPage />} />
      <Route path="/ai-config" element={<AIConfigPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      */}

      {/* 兜底路由，处理未匹配路径 */}
      <Route path="*" element={<PlaceholderPage title="404 - 页面未找到" />} />
    </Routes>
  );
};

export default AppRouter;