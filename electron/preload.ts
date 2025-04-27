import { contextBridge, ipcRenderer } from 'electron';
import type { LLMChatOptions, LLMResponse } from './llm/BaseLLM'; // <-- 导入 LLM 类型 (使用 type-only import)
import type { ProxyConfig } from './proxyManager'; // <-- 导入 ProxyConfig 类型

// --------- 向渲染进程暴露选择性的 API ---------
contextBridge.exposeInMainWorld('electronAPI', { // 使用不同的键名，避免覆盖可能存在的其他 ipcRenderer 暴露
  // --- 精确暴露存储相关的 invoke 通道 ---
  // 将参数类型从 any 改为 unknown，与 ipcHandler 保持一致
  readStore: (fileName: string, defaultValue: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke('read-store', fileName, defaultValue),
  writeStore: (fileName: string, data: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('write-store', fileName, data),

  // --- LLM 服务相关 API ---
  llmGetServices: (): Promise<{ success: boolean; data?: { providerId: string; providerName: string; defaultModels: string[] }[]; error?: string }> =>
    ipcRenderer.invoke('llm-get-services'),
  llmSetApiKey: (providerId: string, apiKey: string | null): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('llm-set-api-key', providerId, apiKey),
  llmGetAvailableModels: (providerId: string): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('llm-get-available-models', providerId),
  // 新增获取已保存 Keys 的 API
  llmGetSavedKeys: (): Promise<{ success: boolean; data?: Record<string, string | null>; error?: string }> =>
    ipcRenderer.invoke('llm-get-saved-keys'),
// 新增：调用聊天生成 API
   // 需要在调用处确保 options 符合 LLMChatOptions 结构 (从 './llm/BaseLLM' 导入)
   // 返回值 data 符合 LLMResponse 结构
   llmGenerateChat: (providerId: string, options: LLMChatOptions): Promise<{ success: boolean; data?: LLMResponse; error?: string }> =>
     ipcRenderer.invoke('llm-generate-chat', providerId, options),
// 新增：获取和保存自定义模型列表
   llmGetCustomModels: (providerId: string): Promise<{ success: boolean; data?: string[]; error?: string }> =>
     ipcRenderer.invoke('llm-get-custom-models', providerId),
   llmSaveCustomModels: (providerId: string, models: string[]): Promise<{ success: boolean; error?: string }> =>
     ipcRenderer.invoke('llm-save-custom-models', providerId, models),
// 新增：获取和设置代理配置
   // 需要在 proxyManager.ts 中导入 ProxyConfig 类型并在下方使用
   proxyGetConfig: (): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> =>
     ipcRenderer.invoke('proxy-get-config'),
   proxySetConfig: (newConfig: ProxyConfig): Promise<{ success: boolean; error?: string }> =>
     ipcRenderer.invoke('proxy-set-config', newConfig),

  // 如果还需要通用的 on/off/send，可以在这里单独暴露，或者按需添加
  // on: (channel, listener) => { /* ... 安全实现 ... */ },
  // send: (channel, data) => { /* ... 安全实现 ... */ },

  // 你可以在这里暴露其他需要的 API。
});

// --------- 预加载脚本加载 ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true);
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true);
        }
      });
    }
  });
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child);
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child);
    }
  },
};

/**
 * 来源: https://tobiasahlin.com/spinkit
 * （纯 CSS 动画效果优于 JS 执行）
 */
// 重命名以避免在非 React 文件中触发 ESLint hook 规则错误
function createLoadingIndicator() {
  const className = `loaders-css__square-spin`;
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `;
  const oStyle = document.createElement('style');
  const oDiv = document.createElement('div');

  oStyle.id = 'app-loading-style';
  oStyle.innerHTML = styleContent;
  oDiv.className = 'app-loading-wrap';
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`;

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle);
      safeDOM.append(document.body, oDiv);
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle);
      safeDOM.remove(document.body, oDiv);
    },
  };
}

// ----------------------------------------------------------------------

// 调用重命名后的函数
const { appendLoading, removeLoading } = createLoadingIndicator();
domReady().then(appendLoading);

window.onmessage = ev => {
  // 使用 if 语句以提高清晰度，满足 ESLint 要求
  if (ev.data.payload === 'removeLoading') {
    removeLoading();
  }
};

setTimeout(removeLoading, 4999);