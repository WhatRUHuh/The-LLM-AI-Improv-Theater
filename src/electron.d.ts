// src/electron.d.ts
import type { LLMChatOptions, LLMResponse } from '../electron/llm/BaseLLM';
import type { ProxyConfig } from '../electron/proxyManager';
// 导入你的核心类型，确保与 preload 和后端一致
import type { AICharacter, Script, AIConfig } from './types'; // 导入 AIConfig 类型

declare global {
  interface Window {
    electronAPI: {
      // --- Generic Store API (for config, chat history etc.) ---
      readStore: (fileName: string, defaultValue: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      writeStore: (fileName: string, data: unknown) => Promise<{ success: boolean; error?: string }>;
      listChatSessions: () => Promise<{ success: boolean; data?: string[]; error?: string }>; // Lists files in 'chats' dir
      deleteChatSession: (fileName: string) => Promise<{ success: boolean; error?: string }>; // Deletes file in 'chats' dir
      saveChatSession: (sessionId: string, data: ChatPageStateSnapshot) => Promise<{ success: boolean; error?: string }>; // Saves file to 'chats' dir <-- 新增类型定义

      // --- Character Data API ---
      listCharacters: () => Promise<{ success: boolean; data?: AICharacter[]; error?: string }>;
      saveCharacter: (character: AICharacter) => Promise<{ success: boolean; error?: string }>;
      deleteCharacter: (characterId: string) => Promise<{ success: boolean; error?: string }>; // <-- 参数改为 characterId

      // --- Script Data API ---
      listScripts: () => Promise<{ success: boolean; data?: Script[]; error?: string }>;
      saveScript: (script: Script) => Promise<{ success: boolean; error?: string }>;
      deleteScript: (scriptId: string) => Promise<{ success: boolean; error?: string }>; // <-- 参数改为 scriptId

      // --- LLM 服务相关 API 类型声明 ---
      // 更新：llmGetServices 更名为 getAllAIConfigs 并修改返回类型
      getAllAIConfigs: ()
        => Promise<{
             success: boolean;
             data?: AIConfig[]; // <--- 修改返回类型
             error?: string;
           }>;
      llmSetApiKey: (providerId: string, apiKey: string | null) // 此API已废弃，但保留声明
        => Promise<{ success: boolean; error?: string }>;
      // 更新：llmGetAvailableModels 更名为 getAvailableModelsByConfigId 并修改参数
      getAvailableModelsByConfigId: (configId: string) // <--- 修改参数为 configId
        => Promise<{ success: boolean; data?: string[]; error?: string }>;
      llmGetSavedKeys: () // 此API已废弃，但保留声明
        => Promise<{ success: boolean; data?: Record<string, string | null>; error?: string }>;
      llmGetCustomModels: (providerId: string) // 此API可能也需要审视是否仍适用或需要基于configId
        => Promise<{ success: boolean; data?: string[]; error?: string }>;
      llmSaveCustomModels: (providerId: string, models: string[])
        => Promise<{ success: boolean; error?: string }>;
      llmGenerateChat: (providerId: string, options: LLMChatOptions)
        => Promise<{ success: boolean; data?: LLMResponse; error?: string }>;
      // 新增：流式聊天 API 启动方法
      // 修改：添加可选的 characterId 参数
      llmGenerateChatStream: (providerId: string, options: LLMChatOptions, characterId?: string)
        => Promise<{ success: boolean; error?: string }>;

      // --- AI 配置相关 API 类型声明 ---
      getAIConfigsByProvider: (serviceProvider: string)
        => Promise<{ success: boolean; data?: AIConfig[]; error?: string }>;
      addAIConfig: (configData: Omit<AIConfig, 'id'>)
        => Promise<{ success: boolean; data?: AIConfig; error?: string }>;
      updateAIConfig: (configId: string, updates: Partial<Omit<AIConfig, 'id'>>)
        => Promise<{ success: boolean; data?: AIConfig; error?: string }>;
      deleteAIConfig: (configId: string)
        => Promise<{ success: boolean; error?: string }>;
      // 新增：getAIConfigById 的类型声明
      getAIConfigById: (configId: string)
        => Promise<{ success: boolean; data?: AIConfig; error?: string }>;
      // 新增：获取支持的服务商列表
      getSupportedServiceProviders: ()
        => Promise<{ success: boolean; data?: string[]; error?: string }>;

      // --- 代理相关 API 类型声明 ---
      proxyGetConfig: ()
        => Promise<{
             success: boolean;
             data?: ProxyConfig;
             error?: string
           }>;
     proxySetConfig: (config: ProxyConfig)
        => Promise<{ success: boolean; error?: string }>;
      proxyTestConnection: ()
        => Promise<{
             success: boolean;
             data?: {
               ip: string;
               proxyUrl: string;
               proxyMode: string;
               googleAccessible: boolean;
               testedSites: string;
             };
             error?: string;
           }>;

      // 如果未来在 preload.ts 中暴露了更多 API，也需要在这里添加类型声明

      // 新增：流式数据块监听方法
      // 修改：listener 接收包含 chunk 和 sourceId 的对象
      onLLMStreamChunk: (listener: (data: { chunk: unknown; sourceId?: string }) => void)
        => { dispose: () => void };

      // 日志 API
      logToFile: (level: string, message: string, ...args: unknown[]) => void;
    };
  }
}

// 这个文件只需要声明，不需要导出任何东西
// 需要确保这个文件被 tsconfig.json 包含（通常 src 目录下的 .d.ts 会被自动包含）
export {}; // 添加一个空的 export 语句，将文件视为模块，避免全局命名冲突（有时需要）