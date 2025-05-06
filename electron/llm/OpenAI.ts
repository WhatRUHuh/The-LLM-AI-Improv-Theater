import OpenAI, { ClientOptions } from 'openai';
// 导入 StreamChunk 类型
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';
import type { AIConfig } from '../../src/types'; // 导入 AIConfig 类型
import { logChatMessage } from '../utils/chatLoggerUtil'; // <-- 导入聊天日志工具

/**
 * OpenAI 服务商的实现
 */
export class OpenAILLM extends BaseLLM {
  readonly providerId = 'openai';
  readonly providerName = 'OpenAI';
  // baseApiUrl 将从 BaseLLM 的构造函数中通过 AIConfig 设置

  // 默认支持的模型列表 (可以根据需要更新)
  readonly defaultModels: string[] = [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  private openai: OpenAI | null = null;

  constructor(config: AIConfig) {
    super(config); // 调用基类构造函数，apiKey 和 baseApiUrl 会在那里被设置
    try {
      const clientOptions: ClientOptions = {
        apiKey: this.apiKey, // 从基类获取 apiKey
        baseURL: this.baseApiUrl, // 从基类获取 baseApiUrl
      };

      // 如果 baseURL 未定义或为空字符串，从选项中移除，让 SDK 使用默认值
      if (!clientOptions.baseURL) {
        delete clientOptions.baseURL;
      }

      this.openai = new OpenAI(clientOptions);
      console.log(`[OpenAILLM] OpenAI 客户端已使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化完成。Base URL: ${clientOptions.baseURL || '默认 OpenAI API'}`);
    } catch (error) {
       console.error(`[OpenAILLM] 使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化 OpenAI 客户端失败：`, error);
       this.openai = null; // 初始化失败，重置客户端
    }
  }

  /**
   * 实现聊天请求方法
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.openai) {
      return { content: '', error: 'OpenAI API Key 未设置或客户端初始化失败' };
    }
    // 移除此处对模型的检查，因为前端选择时已经基于 llmGetAvailableModels (包含自定义)
    // if (!options.model || !this.getAvailableModels().includes(options.model)) {
    //    return { content: '', error: `模型 ${options.model} 不可用或不受支持` };
    // }

    const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };
    const sessionIdentifier = `openai-non-stream-${Date.now()}`;

    try {
      // 准备 OpenAI API 请求参数
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7, // 默认温度
        max_tokens: options.maxTokens, // 如果未提供，则由 OpenAI 决定
        stream: false,
      };

      if (options.systemPrompt) {
        if (!params.messages) params.messages = [];
        if (!params.messages.some(m => m.role === 'system')) {
          params.messages.unshift({ role: 'system', content: options.systemPrompt });
        } else {
          logChatMessage(sessionIdentifier, 'SYSTEM_ACTION', this.providerId, 'System Prompt Warning', '已存在 system 提示，忽略新的 systemPrompt 选项。', aiConfigLogInfo);
        }
      }

      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Request Parameters', params, aiConfigLogInfo);
      const completion: OpenAI.Chat.ChatCompletion = await this.openai.chat.completions.create(params);
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'API Response', completion, aiConfigLogInfo);

      const content = completion.choices[0]?.message?.content ?? '';
      const usage = completion.usage;

      // 不再将原始响应发送回渲染进程
      return {
        content: content,
        modelUsed: completion.model,
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
        // rawResponse: completion, // 移除原始响应
      };
    } catch (error: unknown) {
      const errorMessage = `模型 ${options.model} 聊天完成时出错：${error instanceof Error ? error.message : String(error)}`;
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Error', { error: error instanceof Error ? error.stack : String(error), params: options }, aiConfigLogInfo);
      console.error(`[OpenAILLM] ${errorMessage}`);
      let detailedError = '与 OpenAI API 通信时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message;
        // --- 使用更安全的类型守卫 ---
        // 检查 error 是否是一个包含 'response' 属性的对象
        if (error && typeof error === 'object' && 'response' in error) {
          const response = (error as { response: unknown }).response;
          // 检查 response 是否是一个包含 'data' 属性的对象
          if (response && typeof response === 'object' && 'data' in response) {
            const data = (response as { data: unknown }).data;
            // 检查 data 是否是一个包含 'error' 属性的对象
            if (data && typeof data === 'object' && 'error' in data) {
              const apiError = (data as { error: unknown }).error;
              // 检查 apiError 是否是一个包含 'message' 属性的对象
              if (apiError && typeof apiError === 'object' && 'message' in apiError && typeof apiError.message === 'string') {
                // 尝试获取 type 属性 (可选)
                const errorType = (typeof apiError === 'object' && 'type' in apiError && typeof apiError.type === 'string') ? apiError.type : 'API Error';
                detailedError = `${errorType}: ${apiError.message}`;
              }
            }
          }
        }
      }
      // 如果不是 Error 实例，或者无法解析详细信息，则返回通用错误
      else if (typeof error === 'string') {
        detailedError = error;
      }

      // 只返回错误消息字符串
      return { content: '', error: detailedError /* rawResponse: error */ };
    }
  }

  /**
   * 实现流式聊天请求方法
   */
  async *generateChatCompletionStream(options: LLMChatOptions): AsyncGenerator<StreamChunk> {
    if (!this.openai) {
      yield { error: 'OpenAI API Key 未设置或客户端初始化失败', done: true };
      return;
    }

    const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };
    const sessionIdentifier = `openai-stream-${Date.now()}`;

    try {
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true,
      };

      if (options.systemPrompt) {
        if (!params.messages) params.messages = [];
        if (!params.messages.some(m => m.role === 'system')) {
          params.messages.unshift({ role: 'system', content: options.systemPrompt });
        } else {
          logChatMessage(sessionIdentifier, 'SYSTEM_ACTION', this.providerId, 'System Prompt Warning (Stream)', '已存在 system 提示，忽略新的 systemPrompt 选项。', aiConfigLogInfo);
        }
      }

      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Stream Request Parameters', params, aiConfigLogInfo);
      const stream = await this.openai.chat.completions.create(params);

      let finishReason: string | null = null;

      for await (const chunk of stream) {
        logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Raw Chunk', chunk, aiConfigLogInfo);
        const content = chunk.choices[0]?.delta?.content;
        const currentFinishReason = chunk.choices[0]?.finish_reason;

        if (content) {
          yield { text: content };
        }

        if (currentFinishReason) {
          finishReason = currentFinishReason;
          logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Finish Reason Received', { finishReason }, aiConfigLogInfo);
        }
      }

      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Ended', { model: options.model, finishReason }, aiConfigLogInfo);
      yield { done: true, modelUsed: options.model };
    } catch (error: unknown) {
      const errorMessage = `模型 ${options.model} 流式聊天完成时出错：${error instanceof Error ? error.message : String(error)}`;
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Error', { error: error instanceof Error ? error.stack : String(error), params: options }, aiConfigLogInfo);
      console.error(`[OpenAILLM Stream] ${errorMessage}`);
      let detailedError = '与 OpenAI API 通信时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message;
        if (error && typeof error === 'object' && 'response' in error) {
          const response = (error as { response: unknown }).response;
          if (response && typeof response === 'object' && 'data' in response) {
            const data = (response as { data: unknown }).data;
            if (data && typeof data === 'object' && 'error' in data) {
              const apiError = (data as { error: unknown }).error;
              if (apiError && typeof apiError === 'object' && 'message' in apiError && typeof apiError.message === 'string') {
                const errorType = (typeof apiError === 'object' && 'type' in apiError && typeof apiError.type === 'string') ? apiError.type : 'API Error';
                detailedError = `${errorType}: ${apiError.message}`;
              }
            }
          }
        }
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      yield { error: detailedError, done: true };
    }
  }

  // 可以选择性地实现 validateApiKey 或 getModelDetails 方法
}
