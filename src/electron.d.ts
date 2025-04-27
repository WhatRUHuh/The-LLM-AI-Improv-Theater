// 告诉 TypeScript 全局的 Window 接口上有一个 electronAPI 对象

declare global {
  interface Window {
    electronAPI: {
      // 定义 readStore 方法的类型签名
      readStore: (fileName: string, defaultValue: unknown)
        => Promise<{ success: boolean; data?: unknown; error?: string }>;
      // 定义 writeStore 方法的类型签名
      writeStore: (fileName: string, data: unknown)
        => Promise<{ success: boolean; error?: string }>;

      // --- LLM 服务相关 API 类型声明 ---
      llmGetServices: ()
        => Promise<{
             success: boolean;
             data?: { providerId: string; providerName: string; defaultModels: string[] }[];
             error?: string;
           }>;
      llmSetApiKey: (providerId: string, apiKey: string | null)
        => Promise<{ success: boolean; error?: string }>;
      llmGetAvailableModels: (providerId: string)
        => Promise<{ success: boolean; data?: string[]; error?: string }>;
      // 新增获取已保存 Keys 的类型声明
      llmGetSavedKeys: ()
        => Promise<{ success: boolean; data?: Record<string, string | null>; error?: string }>;

      // 新增：获取和保存自定义模型列表的类型声明
      llmGetCustomModels: (providerId: string)
        => Promise<{ success: boolean; data?: string[]; error?: string }>;
      llmSaveCustomModels: (providerId: string, models: string[])
        => Promise<{ success: boolean; error?: string }>;

      // --- 代理相关 API 类型声明 ---
      proxyGetConfig: ()
        => Promise<{
             success: boolean;
             data?: { mode: 'system' | 'custom' | 'none'; url?: string };
             error?: string
           }>;
      proxySetConfig: (config: { mode: 'system' | 'custom' | 'none'; url?: string })
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
    };
  }
}

// 这个文件只需要声明，不需要导出任何东西
// 需要确保这个文件被 tsconfig.json 包含（通常 src 目录下的 .d.ts 会被自动包含）
export {}; // 添加一个空的 export 语句，将文件视为模块，避免全局命名冲突（有时需要）