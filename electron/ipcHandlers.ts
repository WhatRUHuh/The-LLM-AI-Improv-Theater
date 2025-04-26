import { ipcMain } from 'electron';
import { readStore, writeStore } from './storage/jsonStore'; // 导入存储函数

/**
 * 注册与数据存储相关的 IPC 处理程序。
 */
export function registerStoreHandlers(): void {
  // 处理读取存储请求
  // 将 defaultValue 类型改为 unknown
  ipcMain.handle('read-store', async (event, fileName: string, defaultValue: unknown) => {
    console.log(`IPC received: read-store for ${fileName}`);
    try {
      // readStore 现在接受 T (由 defaultValue 推断) 或 unknown
      // 由于 defaultValue 是 unknown，readStore 的 T 也会是 unknown，除非调用者能提供更具体的类型
      // 但在这里，我们直接传递 unknown 即可，readStore 内部会处理
      const data = await readStore(fileName, defaultValue);
      return { success: true, data };
    } catch (error: unknown) { // 将 error 类型改为 unknown
      console.error(`IPC error handling read-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '读取存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 处理写入存储请求
  // 将 data 类型改为 unknown
  ipcMain.handle('write-store', async (event, fileName: string, data: unknown) => {
    // 添加更详细的日志，包括传入的数据
    console.log(`[IPC Handler] Received 'write-store' for ${fileName} with data:`, JSON.stringify(data, null, 2));
    try {
      console.log(`[IPC Handler] Calling writeStore function for ${fileName}...`); // <-- 添加日志
      // writeStore 现在接受 T 或 unknown
      await writeStore(fileName, data);
      console.log(`[IPC Handler] writeStore function for ${fileName} completed successfully.`); // <-- 添加日志
      return { success: true };
    } catch (error: unknown) { // 将 error 类型改为 unknown
      console.error(`IPC error handling write-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('Store IPC handlers registered.');
}

// --- LLM Service Handlers ---
import { llmServiceManager } from './llm/LLMServiceManager'; // 导入 LLM 服务管理器

// 定义存储 API Keys 的文件名
const API_KEYS_FILE = 'apiKeys.json';

/**
 * 注册与 LLM 服务相关的 IPC 处理程序
 */
export function registerLLMServiceHandlers(): void { // <-- 确保导出
  // 获取所有服务商信息 (名称、ID、默认模型)
  ipcMain.handle('llm-get-services', async () => {
    console.log('[IPC Main] Received llm-get-services');
    try {
      const services = llmServiceManager.getAllServices().map(service => ({
        providerId: service.providerId,
        providerName: service.providerName,
        defaultModels: service.defaultModels,
        // 注意：不在此处返回 API Key
      }));
      return { success: true, data: services };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取 LLM 服务列表时出错';
      console.error('[IPC Main] Error handling llm-get-services:', error);
      return { success: false, error: message };
    }
  });

  // 设置指定服务商的 API Key (同时持久化保存)
  ipcMain.handle('llm-set-api-key', async (event, providerId: string, apiKey: string | null) => {
     console.log(`[IPC Main] Received llm-set-api-key for ${providerId}`);
     try {
       // 1. 先在内存中设置 Key (初始化客户端等)
       const managerSuccess = llmServiceManager.setApiKeyForService(providerId, apiKey);
       if (!managerSuccess) {
         return { success: false, error: `未找到服务商: ${providerId}` };
       }

       // 2. 读取当前所有已保存的 Keys
       const currentKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});

       // 3. 更新或删除指定 providerId 的 Key
       if (apiKey && apiKey.trim() !== '') { // 只有非空字符串才保存
         currentKeys[providerId] = apiKey;
       } else {
         delete currentKeys[providerId]; // 如果传入 null 或空字符串，则删除该 Key
       }

       // 4. 将更新后的 Keys 写回文件
       await writeStore(API_KEYS_FILE, currentKeys);

       console.log(`API Key for ${providerId} set and persisted successfully.`);
       return { success: true };

     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '设置并保存 API Key 时出错';
       console.error(`[IPC Main] Error handling llm-set-api-key for ${providerId}:`, error);
       return { success: false, error: message };
     }
  });

  // 新增：获取所有已保存的 API Keys
  ipcMain.handle('llm-get-saved-keys', async () => {
    console.log('[IPC Main] Received llm-get-saved-keys');
    try {
      const savedKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
      // 出于安全考虑，通常不应该直接返回 Key，但在这个本地应用中暂时允许
      // 更好的做法是只返回哪些服务商配置了 Key (true/false)
      return { success: true, data: savedKeys };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '读取已保存的 API Keys 时出错';
      console.error('[IPC Main] Error handling llm-get-saved-keys:', error);
      return { success: false, error: message };
    }
  });


   // 添加获取可用模型的 IPC 处理器 (需要考虑自定义模型)
   ipcMain.handle('llm-get-available-models', async (event, providerId: string) => {
     console.log(`[IPC Main] Received llm-get-available-models for ${providerId}`);
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     try {
       // TODO: 从存储中读取该服务商的自定义模型列表
       const customModels: string[] = []; // 示例： const customModels = await readStore(...)
       const availableModels = service.getAvailableModels(customModels);
       return { success: true, data: availableModels };
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '获取可用模型时出错';
       console.error(`[IPC Main] Error handling llm-get-available-models for ${providerId}:`, error);
       return { success: false, error: message };
     }
   });


  console.log('LLM Service IPC handlers registered.');
}

// 注意：确保在 main.ts 中调用 registerLLMServiceHandlers() 来激活这些处理器。