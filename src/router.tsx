import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// 导入所有页面组件
import ChatModeSelectionPage from './pages/ChatModeSelectionPage';
import SingleUserSingleAISetupPage from './pages/SingleUserSingleAISetupPage'; // <-- 改导入名
import SingleUserSingleAIInterfacePage from './pages/SingleUserSingleAIInterfacePage'; // <-- 改导入名
// 导入单人多 AI 页面
import SingleUserMultiAISetupPage from './pages/SingleUserMultiAISetupPage';
import SingleUserMultiAIInterfacePage from './pages/SingleUserMultiAIInterfacePage';
import ScriptManagementPage from './pages/ScriptManagementPage';
import CharacterManagementPage from './pages/CharacterManagementPage';
import CharacterEditorPage from './pages/CharacterEditorPage';
import ScriptEditorPage from './pages/ScriptEditorPage'; // <-- 导入新的剧本编辑页面
import AIConfigPage from './pages/AIConfigPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

// 404 页面可以简单点
const NotFoundPage: React.FC = () => (
  <div style={{ padding: '20px', textAlign: 'center' }}>
    <h2>404 - 页面未找到</h2>
    <p>你要找的页面好像迷路了...</p>
  </div>
);


const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* 默认导航到聊天模式选择页 */}
      <Route path="/" element={<Navigate to="/chat-mode-selection" replace />} />

      {/* 定义所有页面的路由 */}
      <Route path="/chat-mode-selection" element={<ChatModeSelectionPage />} />
      <Route path="/single-user-single-ai-setup" element={<SingleUserSingleAISetupPage />} /> {/* <-- 修改路径 */}
      <Route path="/single-user-single-ai-interface" element={<SingleUserSingleAIInterfacePage />} /> {/* <-- 修改路径 */}
      {/* 单人多 AI 路由 */}
      <Route path="/single-user-multi-ai-setup" element={<SingleUserMultiAISetupPage />} />
      <Route path="/single-user-multi-ai-interface" element={<SingleUserMultiAIInterfacePage />} />
      {/* 剧本管理路由 */}
      <Route path="/scripts" element={<ScriptManagementPage />} />
      <Route path="/scripts/add" element={<ScriptEditorPage />} /> {/* 添加剧本路由 */}
      <Route path="/scripts/edit/:id" element={<ScriptEditorPage />} /> {/* 编辑剧本路由 */}
      {/* 角色管理路由 */}
      <Route path="/characters" element={<CharacterManagementPage />} />
      <Route path="/characters/add" element={<CharacterEditorPage />} /> {/* 添加角色路由 */}
      <Route path="/characters/edit/:id" element={<CharacterEditorPage />} /> {/* 编辑角色路由 */}
      <Route path="/ai-config" element={<AIConfigPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* 兜底路由，处理未匹配路径 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRouter;