import { ipcMain } from 'electron';
import { readStore, writeStore } from './storage/jsonStore'; // 导入存储函数
import { LLMChatOptions, LLMResponse } from './llm/BaseLLM'; // <-- 导入 LLM 类型
import { llmServiceManager } from './llm/LLMServiceManager'; // 导入 LLM 服务管理器
import { proxyManager, ProxyConfig } from './proxyManager'; // <-- 导入 proxyManager 和类型

// --- 文件名常量 ---
const API_KEYS_FILE = 'apiKeys.json';
const CUSTOM_MODELS_FILE = 'customModels.json';
const PROXY_CONFIG_FILE = 'proxyConfig.json'; // <-- 定义代理配置文件名

// --- 类型定义 ---
type CustomModelsStore = Record<string, string[]>;

/**
 * 注册与数据存储相关的 IPC 处理程序。
 */
export function registerStoreHandlers(): void {
  // 处理读取存储请求
  ipcMain.handle('read-store', async (event, fileName: string, defaultValue: unknown) => {
    console.log(`IPC received: read-store for ${fileName}`);
    try {
      const data = await readStore(fileName, defaultValue);
      return { success: true, data };
    } catch (error: unknown) {
      console.error(`IPC error handling read-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '读取存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 处理写入存储请求
  ipcMain.handle('write-store', async (event, fileName: string, data: unknown) => {
    console.log(`[IPC Handler] Received 'write-store' for ${fileName} with data:`, JSON.stringify(data, null, 2));
    try {
      await writeStore(fileName, data);
      console.log(`[IPC Handler] writeStore function for ${fileName} completed successfully.`);
      return { success: true };
    } catch (error: unknown) {
      console.error(`IPC error handling write-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('Store IPC handlers registered.');
}

/**
 * 注册与 LLM 服务相关的 IPC 处理程序
 */
export function registerLLMServiceHandlers(): void {
  // 获取所有服务商信息
  ipcMain.handle('llm-get-services', async () => {
    console.log('[IPC Main] Received llm-get-services');
    try {
      const services = llmServiceManager.getAllServices().map(service => ({
        providerId: service.providerId,
        providerName: service.providerName,
        defaultModels: service.defaultModels,
      }));
      return { success: true, data: services };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取 LLM 服务列表时出错';
      console.error('[IPC Main] Error handling llm-get-services:', error);
      return { success: false, error: message };
    }
  });

  // 设置 API Key
  ipcMain.handle('llm-set-api-key', async (event, providerId: string, apiKey: string | null) => {
     console.log(`[IPC Main] Received llm-set-api-key for ${providerId}`);
     try {
       const managerSuccess = llmServiceManager.setApiKeyForService(providerId, apiKey);
       if (!managerSuccess) {
         return { success: false, error: `未找到服务商: ${providerId}` };
       }
       const currentKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
       if (apiKey && apiKey.trim() !== '') {
         currentKeys[providerId] = apiKey;
       } else {
         delete currentKeys[providerId];
       }
       await writeStore(API_KEYS_FILE, currentKeys);
       console.log(`API Key for ${providerId} set and persisted successfully.`);
       return { success: true };
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '设置并保存 API Key 时出错';
       console.error(`[IPC Main] Error handling llm-set-api-key for ${providerId}:`, error);
       return { success: false, error: message };
     }
  });

  // 获取已保存的 API Keys
  ipcMain.handle('llm-get-saved-keys', async () => {
    console.log('[IPC Main] Received llm-get-saved-keys');
    try {
      const savedKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
      return { success: true, data: savedKeys };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '读取已保存的 API Keys 时出错';
      console.error('[IPC Main] Error handling llm-get-saved-keys:', error);
      return { success: false, error: message };
    }
  });

   // 获取可用模型
   ipcMain.handle('llm-get-available-models', async (event, providerId: string) => {
     console.log(`[IPC Main] Received llm-get-available-models for ${providerId}`);
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     try {
       const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
       const customModels = allCustomModels[providerId] || [];
       const availableModels = service.getAvailableModels(customModels);
       return { success: true, data: availableModels };
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '获取可用模型时出错';
       console.error(`[IPC Main] Error handling llm-get-available-models for ${providerId}:`, error);
       return { success: false, error: message };
     }
   });

   // 处理聊天生成请求
   ipcMain.handle('llm-generate-chat', async (event, providerId: string, options: LLMChatOptions): Promise<{ success: boolean; data?: LLMResponse; error?: string }> => {
     console.log(`[IPC Main] Received llm-generate-chat for ${providerId} with options:`, JSON.stringify(options, null, 2));
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     if (!service.getApiKey()) {
        return { success: false, error: `服务商 ${providerId} 的 API Key 尚未设置` };
     }
     try {
       const result: LLMResponse = await service.generateChatCompletion(options);
       console.log(`[IPC Main] Chat completion result for ${providerId}:`, JSON.stringify(result, null, 2));
       if (result.error) {
          return { success: false, error: result.error, data: result };
       }
       return { success: true, data: result };
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '调用聊天生成时发生未知错误';
       console.error(`[IPC Main] Error handling llm-generate-chat for ${providerId}:`, error);
       return { success: false, error: message };
     }
   });

   // 获取自定义模型列表
   ipcMain.handle('llm-get-custom-models', async (event, providerId: string): Promise<{ success: boolean; data?: string[]; error?: string }> => {
      console.log(`[IPC Main] Received llm-get-custom-models for ${providerId}`);
      try {
        const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
        const customModels = allCustomModels[providerId] || [];
        return { success: true, data: customModels };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '读取自定义模型列表时出错';
        console.error(`[IPC Main] Error handling llm-get-custom-models for ${providerId}:`, error);
        return { success: false, error: message };
      }
   });

   // 保存自定义模型列表
   ipcMain.handle('llm-save-custom-models', async (event, providerId: string, models: string[]): Promise<{ success: boolean; error?: string }> => {
      console.log(`[IPC Main] Received llm-save-custom-models for ${providerId} with models:`, models);
      try {
        const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
        allCustomModels[providerId] = models;
        await writeStore(CUSTOM_MODELS_FILE, allCustomModels);
        console.log(`Custom models for ${providerId} saved successfully.`);
        return { success: true };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '保存自定义模型列表时出错';
        console.error(`[IPC Main] Error handling llm-save-custom-models for ${providerId}:`, error);
        return { success: false, error: message };
      }
   });

  console.log('LLM Service IPC handlers registered.');
}

/**
 * 注册与代理设置相关的 IPC 处理程序
 */
export function registerProxyHandlers(): void {
  // 获取当前代理配置
  ipcMain.handle('proxy-get-config', async (): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> => {
    console.log('[IPC Main] Received proxy-get-config');
    try {
      // 直接从 proxyManager 获取当前配置，因为它应该反映了最新的状态（包括从文件加载的）
      const currentConfig = proxyManager.getCurrentConfig();
      // 或者，如果你想确保总是从文件读取最新保存的设置：
      // const currentConfig = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      return { success: true, data: currentConfig };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '读取代理配置时出错';
      console.error('[IPC Main] Error handling proxy-get-config:', error);
      return { success: false, error: message };
    }
  });

  // 设置并应用新的代理配置
  ipcMain.handle('proxy-set-config', async (event, newConfig: ProxyConfig): Promise<{ success: boolean; error?: string }> => {
    console.log('[IPC Main] Received proxy-set-config with config:', newConfig);
    try {
      // 1. 先将新配置保存到文件
      await writeStore(PROXY_CONFIG_FILE, newConfig);
      console.log('[IPC Main] Proxy config saved to file.');

      // 2. 再调用 proxyManager 应用新配置
      await proxyManager.configureProxy(newConfig);
      console.log('[IPC Main] Proxy config applied via proxyManager.');

      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '设置并应用代理配置时出错';
      console.error('[IPC Main] Error handling proxy-set-config:', error);
      return { success: false, error: message };
    }
  });

  console.log('Proxy IPC handlers registered.');
}

// 注意：确保在 main.ts 中调用所有 register...Handlers() 函数