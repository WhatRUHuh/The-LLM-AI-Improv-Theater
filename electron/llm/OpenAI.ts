import OpenAI, { ClientOptions } from 'openai';
// 导入 StreamChunk 类型
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';

/**
 * OpenAI 服务商的实现
 */
export class OpenAILLM extends BaseLLM {
  readonly providerId = 'openai';
  readonly providerName = 'OpenAI';
  // OpenAI 的基础 URL，也可以从配置读取或允许用户修改
  readonly baseApiUrl = 'https://api.openai.com/v1';

  // 默认支持的模型列表 (可以根据需要更新)
  readonly defaultModels: string[] = [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  private openai: OpenAI | null = null;

  /**
   * 重写 setApiKey 方法，在设置 key 时初始化 OpenAI 客户端
   */
  override setApiKey(apiKey: string | null): void {
    super.setApiKey(apiKey);
    if (apiKey) {
      try {
        const clientOptions: ClientOptions = {
          apiKey: apiKey,
          // baseURL: this.baseApiUrl, // 可以考虑允许用户配置 Base URL
        };

        this.openai = new OpenAI(clientOptions);
        console.log(`OpenAI 客户端已为提供商 ${this.providerId} 初始化完成`);
      } catch (error) {
         console.error(`为提供商 ${this.providerId} 初始化 OpenAI 客户端失败：`, error);
         this.openai = null; // 初始化失败，重置客户端
      }
    } else {
      this.openai = null; // API Key 移除，销毁客户端
      console.log(`OpenAI 客户端已为提供商 ${this.providerId} 销毁`);
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

    try {
      // 准备 OpenAI API 请求参数
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7, // 默认温度
        max_tokens: options.maxTokens, // 如果未提供，则由 OpenAI 决定
        stream: false, // 暂不支持流式响应
        // 可以根据需要添加其他参数，如 top_p, frequency_penalty 等
      };

      // 如果有系统提示，添加到消息列表开头 (某些模型可能不支持 system role)
      if (options.systemPrompt) {
        // 确保 messages 数组存在
        if (!params.messages) params.messages = [];
        // 检查是否已有 system 消息，避免重复添加
        if (!params.messages.some(m => m.role === 'system')) {
          params.messages.unshift({ role: 'system', content: options.systemPrompt });
        } else {
          // 如果已有 system 消息，可以选择替换或忽略新的，这里选择忽略
          console.warn('已存在 system 提示，忽略新的 systemPrompt 选项。');
        }
      }

      console.log(`正在向模型 ${options.model} 发送请求，参数:`, JSON.stringify(params, null, 2));

      const completion: OpenAI.Chat.ChatCompletion = await this.openai.chat.completions.create(params);

      console.log('已接收完成结果:', JSON.stringify(completion, null, 2));

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
      console.error(`模型 ${options.model} 聊天完成时出错：`, error);
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

    try {
      // 准备 OpenAI API 请求参数
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages: options.messages, // 假设 messages 已经是 'user' | 'assistant'
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true, // <-- 启用流式响应
      };

      // 处理 systemPrompt
      if (options.systemPrompt) {
        if (!params.messages) params.messages = [];
        if (!params.messages.some(m => m.role === 'system')) {
          params.messages.unshift({ role: 'system', content: options.systemPrompt });
        } else {
          console.warn('【OpenAI 流】已存在 system 提示，忽略新的 systemPrompt 选项。');
        }
      }

      console.log(`【OpenAI 流】正在向模型 ${options.model} 发送请求`);

      const stream = await this.openai.chat.completions.create(params);

      let finishReason: string | null = null;
      // let accumulatedUsage: OpenAI.CompletionUsage | undefined = undefined; // 移除未使用的变量

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        const currentFinishReason = chunk.choices[0]?.finish_reason;

        if (content) {
          yield { text: content };
        }

        if (currentFinishReason) {
          finishReason = currentFinishReason;
          console.log(`【OpenAI 流】接收到结束原因: ${finishReason}`);
        }
      }

      console.log(`【OpenAI 流】模型 ${options.model} 的流已结束。结束原因: ${finishReason}`);
      // 流结束后发送 done 信号
      yield { done: true, modelUsed: options.model };
    } catch (error: unknown) {
      console.error(`模型 ${options.model} 流式聊天完成时出错：`, error);
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
