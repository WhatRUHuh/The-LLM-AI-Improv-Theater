import { contextBridge, ipcRenderer } from 'electron';
import type { LLMChatOptions, LLMResponse } from './llm/BaseLLM';
import type { ProxyConfig } from './ProxyManager';
// 导入角色和剧本类型，确保与后端和前端使用的类型一致
import type { AICharacter, Script, AIConfig } from '../src/types'; // 导入 AIConfig 类型
import { mainLogger as logger } from './utils/logger'; // 导入日志工具
import { setupGlobalEncoding } from './utils/encoding'; // 导入编码工具

// 设置全局编码为UTF-8
setupGlobalEncoding().catch(err => {
  console.error('设置全局编码时出错:', err);
});

// --------- 向渲染进程暴露选择性的 API ---------
contextBridge.exposeInMainWorld('electronAPI', { // 使用不同的键名，避免覆盖可能存在的其他 ipcRenderer 暴露
  // --- 精确暴露存储相关的 invoke 通道 ---
  // 将参数类型从 any 改为 unknown，与 ipcHandler 保持一致
  readStore: (fileName: string, defaultValue: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke('read-store', fileName, defaultValue),
  writeStore: (fileName: string, data: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('write-store', fileName, data),
  // 新增：列出聊天会话文件
  listChatSessions: (): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('list-chat-sessions'),
  // 新增：删除聊天会话文件
  deleteChatSession: (fileName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-chat-session', fileName),

  // --- Chat Session API (Save only, List/Delete/Read via Store API) ---
  saveChatSession: (sessionId: string, data: unknown): Promise<{ success: boolean; error?: string }> => // <-- 新增保存聊天会话 API
    ipcRenderer.invoke('save-chat-session', sessionId, data),

  // --- Character Data API ---
  listCharacters: (): Promise<{ success: boolean; data?: AICharacter[]; error?: string }> =>
    ipcRenderer.invoke('list-characters'),
  saveCharacter: (character: AICharacter): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-character', character),
  deleteCharacter: (characterId: string): Promise<{ success: boolean; error?: string }> => // <-- 参数改为 characterId
    ipcRenderer.invoke('delete-character', characterId), // <-- 传递 characterId

  // --- Script Data API ---
  listScripts: (): Promise<{ success: boolean; data?: Script[]; error?: string }> =>
    ipcRenderer.invoke('list-scripts'),
  saveScript: (script: Script): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('save-script', script),
  deleteScript: (scriptId: string): Promise<{ success: boolean; error?: string }> => // <-- 参数改为 scriptId
    ipcRenderer.invoke('delete-script', scriptId), // <-- 传递 scriptId

  // --- LLM 服务相关 API ---
  // 修改：函数名和返回类型以匹配 AIConfig[]
  // 更新：IPC 通道名与 ipcHandlers.ts 中保持一致
  getAllAIConfigs: (): Promise<{ success: boolean; data?: AIConfig[]; error?: string }> =>
    ipcRenderer.invoke('get-all-ai-configs'),
  llmSetApiKey: (providerId: string, apiKey: string | null): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('llm-set-api-key', providerId, apiKey), // 此功能已废弃，但保留定义以防万一
  // 修改：参数从 providerId 改为 configId
  getAvailableModelsByConfigId: (configId: string): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('llm-get-available-models', configId),
  // 新增获取已保存 Keys 的 API (此功能已废弃，但保留定义)
  llmGetSavedKeys: (): Promise<{ success: boolean; data?: Record<string, string | null>; error?: string }> =>
    ipcRenderer.invoke('llm-get-saved-keys'),
// 新增：调用聊天生成 API
   // 需要在调用处确保 options 符合 LLMChatOptions 结构 (从 './llm/BaseLLM' 导入)
   // 返回值 data 符合 LLMResponse 结构
   llmGenerateChat: (providerId: string, options: LLMChatOptions): Promise<{ success: boolean; data?: LLMResponse; error?: string }> =>
     ipcRenderer.invoke('llm-generate-chat', providerId, options),
  // 新增：调用流式聊天生成 API (只负责启动，实际数据通过 onLLMStreamChunk 接收)
  // 修改：添加 characterId 参数
  llmGenerateChatStream: (providerId: string, options: LLMChatOptions, characterId?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('llm-generate-chat-stream', providerId, options, characterId),
// 新增：获取和保存自定义模型列表
  llmGetCustomModels: (providerId: string): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke('llm-get-custom-models', providerId),
   llmSaveCustomModels: (providerId: string, models: string[]): Promise<{ success: boolean; error?: string }> =>
     ipcRenderer.invoke('llm-save-custom-models', providerId, models),

   // --- 代理相关 API ---
   proxyGetConfig: (): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> =>
     ipcRenderer.invoke('proxy-get-config'),
   proxySetConfig: (config: ProxyConfig): Promise<{ success: boolean; error?: string }> =>
     ipcRenderer.invoke('proxy-set-config', config),
   proxyTestConnection: (): Promise<{ success: boolean; data?: { ip: string; proxyUrl: string; proxyMode: string }; error?: string }> =>
     ipcRenderer.invoke('proxy-test-connection'),
 
   // --- AI 配置相关 API ---
   getAIConfigsByProvider: (serviceProvider: string): Promise<{ success: boolean; data?: AIConfig[]; error?: string }> =>
     ipcRenderer.invoke('get-ai-configs-by-provider', serviceProvider),
   addAIConfig: (configData: Omit<AIConfig, 'id'>): Promise<{ success: boolean; data?: AIConfig; error?: string }> =>
     ipcRenderer.invoke('add-ai-config', configData),
   updateAIConfig: (configId: string, updates: Partial<Omit<AIConfig, 'id'>>): Promise<{ success: boolean; data?: AIConfig; error?: string }> =>
     ipcRenderer.invoke('update-ai-config', configId, updates),
   deleteAIConfig: (configId: string): Promise<{ success: boolean; error?: string }> =>
     ipcRenderer.invoke('delete-ai-config', configId),
   // 新增：根据 ID 获取单个 AI 配置
   getAIConfigById: (configId: string): Promise<{ success: boolean; data?: AIConfig; error?: string }> =>
     ipcRenderer.invoke('get-ai-config-by-id', configId),
   // 新增：获取支持的服务商列表
   getSupportedServiceProviders: (): Promise<{ success: boolean; data?: string[]; error?: string }> =>
     ipcRenderer.invoke('get-supported-service-providers'),

     // 如果还需要通用的 on/off/send，可以在这里单独暴露，或者按需添加
     // on: (channel, listener) => { /* ... 安全实现 ... */ },
   // send: (channel, data) => { /* ... 安全实现 ... */ },
 
   // --- 新增：处理 LLM 流式响应 ---
  // 定义流式数据块的预期结构 (可以根据实际情况调整)
  // type LLMStreamChunk = { text?: string; error?: string; done?: boolean; usage?: object; metrics?: object; search?: object; mcpToolResponse?: object; generateImage?: object };
  // 暂时使用 unknown，在接收端进行类型检查
  // 修改：回调函数接收包含 chunk 和 sourceId 的对象
  onLLMStreamChunk: (listener: (data: { chunk: unknown; sourceId?: string }) => void): { dispose: () => void } => {
    const channel = 'llm-stream-chunk';
    // 监听器现在接收整个 data 对象
    const internalListener = (_event: Electron.IpcRendererEvent, data: { chunk: unknown; sourceId?: string }) => {
      // 可以添加日志记录接收到的数据结构
      // logger.debug(`[Preload] Received stream chunk data on channel ${channel}:`, data);
      // 直接将整个 data 对象传递给前端的回调函数
      listener(data);
    };
    ipcRenderer.on(channel, internalListener);
    // 返回一个包含 dispose 方法的对象，用于取消监听
    return {
      dispose: () => {
        ipcRenderer.removeListener(channel, internalListener);
        logger.info(`已移除监听器: ${channel}`);
      }
    };
  },

  // 日志 API
  logToFile: (level: string, message: string, ...args: unknown[]): void => {
    ipcRenderer.send('log-message', level, message, ...args);
  },

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

window.onmessage = (ev: MessageEvent) => {
  // 使用 if 语句以提高清晰度，满足 ESLint 要求
  if (ev.data && ev.data.payload === 'removeLoading') {
    logger.info('收到移除加载指示器的消息');
    removeLoading();
  }
};

setTimeout(removeLoading, 4999);