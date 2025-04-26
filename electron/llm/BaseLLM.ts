/**
 * 定义 AI 聊天响应的结构
 */
export interface LLMResponse {
  content: string; // AI 生成的内容
  modelUsed?: string; // 实际使用的模型
  usage?: { // token 使用情况 (可选)
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string; // 如果发生错误
  rawResponse?: unknown; // 原始响应体 (可选, 用于调试) - 使用 unknown 替代 any
}

/**
 * 定义聊天请求的选项
 */
export interface LLMChatOptions {
  model: string; // 要使用的模型
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]; // 对话历史
  systemPrompt?: string; // 系统提示 (如果模型支持)
  temperature?: number; // 温度参数 (控制随机性)
  maxTokens?: number; // 最大生成 token 数
  stream?: boolean; // 是否使用流式响应 (暂未实现流式处理)
  // 可以添加更多特定于模型的选项
}

/**
 * 所有 LLM 服务商实现的基类或接口
 * 定义了与不同 LLM 服务交互所需的通用方法和属性
 */
export abstract class BaseLLM {
  // --- 属性 ---

  /**
   * 服务商的唯一标识符 (例如: 'openai', 'anthropic')
   * 通常可以从文件名或类名派生
   */
  abstract readonly providerId: string;

  /**
   * 服务商的显示名称 (例如: 'OpenAI', 'Anthropic Claude')
   */
  abstract readonly providerName: string;

  /**
   * 该服务商的基础 API URL (可能在子类中硬编码或从配置读取)
   */
  abstract readonly baseApiUrl?: string; // 设为可选，因为本地模型可能没有 URL

  /**
   * 用户配置的 API Key
   */
  protected apiKey: string | null = null;

  /**
   * 该服务商支持的默认模型列表
   */
  abstract readonly defaultModels: string[];

  // --- 方法 ---

  /**
   * 设置 API Key
   * @param apiKey 用户提供的 API Key
   */
  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
    console.log(`API Key set for provider: ${this.providerId}`);
  }

  /**
   * 获取当前配置的 API Key (主要用于内部或测试)
   */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * 获取该服务商可用的模型列表 (可能包含默认模型和用户自定义模型)
   * @param customModels 用户添加的自定义模型列表 (可选)
   * @returns 模型名称数组
   */
  getAvailableModels(customModels: string[] = []): string[] {
    // 使用 Set 去重
    return [...new Set([...this.defaultModels, ...customModels])];
  }

  /**
   * 核心方法：发送聊天请求到 LLM API 并获取响应
   * @param options 聊天请求选项
   * @returns 包含 AI 响应的 Promise
   */
  abstract generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse>;

  /**
   * (可选) 验证 API Key 是否有效的方法
   * @returns Promise<boolean>
   */
  // abstract validateApiKey(): Promise<boolean>;

  /**
   * (可选) 获取模型详细信息的方法
   * @param modelName 模型名称
   * @returns Promise<ModelDetails | null>
   */
  // abstract getModelDetails(modelName: string): Promise<any | null>;
}

// 注意：这个文件只定义了基类，具体的 API 调用逻辑将在子类中实现。