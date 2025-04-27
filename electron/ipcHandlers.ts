import { ipcMain } from 'electron';
import { readStore, writeStore } from './storage/jsonStore'; // 导入存储函数
import { LLMChatOptions, LLMResponse } from './llm/BaseLLM'; // <-- 导入 LLM 类型
import { llmServiceManager } from './llm/LLMServiceManager'; // 导入 LLM 服务管理器
import { proxyManager, ProxyConfig } from './proxyManager'; // 导入代理管理器
import { getSystemProxy } from 'os-proxy-config'; // 导入系统代理获取函数
import { execSync } from 'child_process'; // 导入子进程执行函数

// --- 文件名常量 ---
const API_KEYS_FILE = 'apiKeys.json';
const CUSTOM_MODELS_FILE = 'customModels.json';
const PROXY_CONFIG_FILE = 'proxyConfig.json';

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
  // 设置代理
  ipcMain.handle('proxy-set-config', async (event, config: ProxyConfig) => {
    console.log(`[IPC Main] Received proxy-set-config with mode: ${config.mode}, url: ${config.url || 'none'}`);
    try {
      await proxyManager.configureProxy(config);
      await writeStore(PROXY_CONFIG_FILE, config);
      console.log(`[IPC Main] Proxy configured and saved successfully.`);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '设置代理时出错';
      console.error(`[IPC Main] Error handling proxy-set-config:`, error);
      return { success: false, error: message };
    }
  });

  // 获取当前代理配置
  ipcMain.handle('proxy-get-config', async () => {
    console.log('[IPC Main] Received proxy-get-config');
    try {
      const config = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      return { success: true, data: config };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取代理配置时出错';
      console.error('[IPC Main] Error handling proxy-get-config:', error);
      return { success: false, error: message };
    }
  });

  // 测试代理连接
  ipcMain.handle('proxy-test-connection', async () => {
    console.log('[IPC Main] Received proxy-test-connection');
    try {
      // 测试被墙网站可访问性
      const blockedSiteTestUrls = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.wikipedia.org/'
      ];

      // 获取IP的服务
      const ipTestUrls = [
        'https://api.ipify.org?format=json',
        'https://ifconfig.me/ip',
        'https://icanhazip.com'
      ];

      let googleAccessible = false;
      let googleError = '';
      let ip = '';

      // 获取当前系统代理信息并输出
      try {
        console.log('[IPC Main] Attempting to get system proxy info...');
        const systemProxyInfo = await getSystemProxy();
        console.log('[IPC Main] Current system proxy info:', systemProxyInfo);

        // 检查Windows注册表中的代理设置
        if (process.platform === 'win32') {
          try {
            // 尝试直接使用Node.js检查环境变量
            console.log('[IPC Main] Checking proxy environment variables:');
            console.log(`  HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
            console.log(`  HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);

            // 尝试使用child_process执行命令获取Windows代理设置
            try {
              const regQuery = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable').toString();
              console.log('[IPC Main] Windows proxy enabled:', regQuery.includes('0x1'));

              const regQueryServer = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer').toString();
              console.log('[IPC Main] Windows proxy server:', regQueryServer);
            } catch (regErr) {
              console.error('[IPC Main] Error querying Windows registry:', regErr);
            }
          } catch (winErr) {
            console.error('[IPC Main] Error checking Windows proxy settings:', winErr);
          }
        }
      } catch (err) {
        console.error('[IPC Main] Error getting system proxy info:', err);
      }

      // 输出当前环境变量中的代理设置
      console.log('[IPC Main] Current proxy environment variables:');
      console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || 'not set'}`);
      console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || 'not set'}`);
      console.log(`http_proxy: ${process.env.http_proxy || 'not set'}`);
      console.log(`https_proxy: ${process.env.https_proxy || 'not set'}`);

      // 首先测试被墙网站可访问性
      for (const url of blockedSiteTestUrls) {
        try {
          console.log(`[IPC Main] Testing blocked site accessibility with ${url}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

          // 添加更多请求选项
          const response = await fetch(url, {
            signal: controller.signal,
            method: 'HEAD', // 只请求头部，减少数据传输
            redirect: 'follow', // 跟随重定向
            cache: 'no-store', // 不使用缓存
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });

          clearTimeout(timeoutId);

          console.log(`[IPC Main] Response from ${url}:`, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });

          if (response.ok || response.status === 204) {
            googleAccessible = true;
            console.log(`[IPC Main] Successfully accessed blocked site via ${url}`);
            break;
          }
        } catch (err) {
          console.error(`[IPC Main] Error testing blocked site with ${url}:`, err);
          googleError = err instanceof Error ? err.message : String(err);
          // 继续尝试下一个URL
        }
      }

      // 然后尝试获取IP地址
      for (const url of ipTestUrls) {
        try {
          console.log(`[IPC Main] Getting IP address with ${url}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

          const response = await fetch(url, {
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // 根据不同的服务处理响应
          if (url.includes('ipify')) {
            const data = await response.json();
            ip = data.ip;
          } else {
            ip = await response.text();
          }

          // 如果成功获取IP，跳出循环
          if (ip) {
            break;
          }
        } catch (err) {
          console.error(`[IPC Main] Error getting IP with ${url}:`, err);
          // 继续尝试下一个URL
        }
      }

      // 获取当前代理配置
      const currentConfig = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      const proxyUrl = proxyManager.getProxyUrl() || '无';

      // 判断测试结果
      if (!googleAccessible) {
        return {
          success: false,
          error: `无法访问谷歌、YouTube或维基百科，代理可能未正确配置。错误: ${googleError}`,
          data: {
            ip: ip || '未知',
            proxyUrl,
            proxyMode: currentConfig.mode,
            googleAccessible: false,
            testedSites: blockedSiteTestUrls.join(', ')
          }
        };
      }

      return {
        success: true,
        data: {
          ip: ip ? ip.trim() : '未能获取IP地址',
          proxyUrl,
          proxyMode: currentConfig.mode,
          googleAccessible: true,
          testedSites: blockedSiteTestUrls.join(', ')
        }
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '测试代理连接时出错';
      console.error('[IPC Main] Error handling proxy-test-connection:', error);
      return { success: false, error: message };
    }
  });

  console.log('Proxy IPC handlers registered.');
}

// 注意：确保在 main.ts 中调用所有 register...Handlers() 函数