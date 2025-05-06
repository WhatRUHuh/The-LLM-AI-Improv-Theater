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
  messages: { role: 'user' | 'assistant'; content: string }[]; // 对话历史 (只包含 user 和 assistant, system 通过 systemPrompt)
  systemPrompt?: string; // 系统提示 (如果模型支持)
  temperature?: number; // 温度参数 (控制随机性)
  maxTokens?: number; // 最大生成 token 数
  stream?: boolean; // 是否使用流式响应 (暂未实现流式处理)
  // 可以添加更多特定于模型的选项
}

/**
 * 定义流式响应的数据块结构
 */
export interface StreamChunk {
  text?: string;       // AI 生成的文本块 (可选)
  error?: string;      // 如果发生错误 (可选)
  done?: boolean;      // 指示流是否结束 (可选)
  // 可以添加其他流式特有的信息，如 token 使用量等
  usage?: {
    promptTokens?: number;
    completionTokens?: number; // 当前块或累积的 completion tokens
    totalTokens?: number;
  };
  modelUsed?: string; // 确认使用的模型 (可能在第一个块或最后一个块返回)
  rawChunk?: unknown; // 原始数据块 (可选, 用于调试)
}


/**
 * 所有 LLM 服务商实现的基类或接口
 * 定义了与不同 LLM 服务交互所需的通用方法和属性
 */
import type { AIConfig } from '../../src/types'; // 导入 AIConfig 类型

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
   * 该服务商的基础 API URL，从 AIConfig 读取
   */
  protected readonly baseApiUrl?: string;

  /**
   * 用户配置的 API Key，从 AIConfig 读取
   */
  protected readonly apiKey: string;

  /**
   * 当前服务实例关联的 AIConfig 的 ID
   */
  public readonly configId: string;

  /**
   * 当前服务实例关联的 AIConfig 的名称
   */
  public readonly configName: string;


  /**
   * 该服务商支持的默认模型列表
   */
  abstract readonly defaultModels: string[];

  // --- 构造函数 ---
  /**
   * 构造函数
   * @param config AI 配置对象，包含 apiKey 和可选的 baseURL
   */
  constructor(config: AIConfig) {
    if (!config.apiKey) {
      // 在实际应用中，这里可能应该抛出更具体的错误或者有更完善的错误处理
      throw new Error(`[BaseLLM] API Key 未在配置 (ID: ${config.id}) 中提供。`);
    }
    this.apiKey = config.apiKey;
    this.baseApiUrl = config.baseURL;
    this.configId = config.id;
    this.configName = config.name;
    // console.log(`[BaseLLM] 服务实例已使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化 for provider: ${this.providerId}`);
  }


  // --- 方法 ---

  /**
   * 获取当前配置的 API Key (主要用于内部或测试, 但现在推荐直接使用 this.apiKey)
   * @deprecated API Key 现在通过构造函数设置，并直接作为 readonly 属性访问。
   */
  getApiKey(): string {
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
   * 核心方法：发送流式聊天请求到 LLM API
   * @param options 聊天请求选项 (应包含 stream: true)
   * @returns 返回一个异步生成器，逐块产生 StreamChunk
   */
  abstract generateChatCompletionStream(options: LLMChatOptions): AsyncGenerator<StreamChunk>;


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