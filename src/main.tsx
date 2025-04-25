import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // 导入 BrowserRouter
import 'antd/dist/reset.css'; // 导入 Ant Design 的基础样式
// import './index.css' // 移除默认 CSS，AntD 会处理重置
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter> {/* 使用 BrowserRouter 包裹 App */}
      <App />
    </BrowserRouter>
  </StrictMode>,
);
