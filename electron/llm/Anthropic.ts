import Anthropic, { ClientOptions } from '@anthropic-ai/sdk';
// 导入 StreamChunk 类型
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';
import type { AIConfig } from '../../src/types'; // 导入 AIConfig 类型
import { logChatMessage } from '../utils/chatLoggerUtil'; // <-- 导入聊天日志工具

/**
 * Anthropic Claude 服务商的实现
 */
export class AnthropicLLM extends BaseLLM {
  readonly providerId = 'anthropic';
  readonly providerName = 'Anthropic Claude';
  // baseApiUrl 将从 BaseLLM 的构造函数中通过 AIConfig 设置

  // 默认支持的模型列表 (Claude 3 系列等)
  readonly defaultModels: string[] = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2',
  ];

  private anthropic: Anthropic | null = null;

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

      this.anthropic = new Anthropic(clientOptions);
      console.log(`[AnthropicLLM] Anthropic 客户端已使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化完成。Base URL: ${clientOptions.baseURL || '默认 Anthropic API'}`);
    } catch (error) {
       console.error(`[AnthropicLLM] 使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化 Anthropic 客户端失败：`, error);
       this.anthropic = null; // 初始化失败，重置客户端
    }
  }

  /**
   * 实现非流式聊天请求方法
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.anthropic) {
      return { content: '', error: 'Anthropic API Key 未设置或客户端初始化失败' };
    }

    const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };
    const sessionIdentifier = `anthropic-non-stream-${Date.now()}`;

    try {
      const systemPrompt = options.systemPrompt;
      const messages = options.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) as Anthropic.Messages.MessageParam[];

      if (messages.length > 0 && messages[0].role !== 'user') {
         logChatMessage(sessionIdentifier, 'SYSTEM_ACTION', this.providerId, 'Message Order Adjustment', '第一条消息不是来自用户，已添加占位符。', aiConfigLogInfo);
         messages.unshift({ role: 'user', content: '(Context begins)' });
      }

      const params: Anthropic.Messages.MessageCreateParams = {
        model: options.model,
        messages: messages,
        system: systemPrompt,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
      };

      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Request Parameters', params, aiConfigLogInfo);
      const completion: Anthropic.Messages.Message = await this.anthropic.messages.create(params);
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'API Response', completion, aiConfigLogInfo);

      let content = '';
      if (completion.content && completion.content.length > 0) {
         const textBlock = completion.content.find(block => block.type === 'text');
         if (textBlock) {
            content = (textBlock as Anthropic.Messages.TextBlock).text;
         }
      }

      const usage = completion.usage;

      return {
        content: content,
        modelUsed: completion.model,
        usage: {
          promptTokens: usage?.input_tokens,
          completionTokens: usage?.output_tokens,
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        },
      };

    } catch (error: unknown) {
      const errorMessage = `模型 ${options.model} 聊天完成时发生错误：${error instanceof Error ? error.message : String(error)}`;
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Error', { error: error instanceof Error ? error.stack : String(error), params: options }, aiConfigLogInfo);
      console.error(`[AnthropicLLM] ${errorMessage}`);
      let detailedError = '与 Anthropic API 通信时发生未知错误';
      if (error instanceof Anthropic.APIError) {
        detailedError = `Anthropic API Error (${error.status}): ${error.message}`;
      } else if (error instanceof Error) {
        detailedError = error.message;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      return { content: '', error: detailedError };
    }
  }

  /**
   * 实现流式聊天请求方法 (使用 @anthropic-ai/sdk)
   */
  async *generateChatCompletionStream(options: LLMChatOptions): AsyncGenerator<StreamChunk> {
    if (!this.anthropic) {
      yield { error: 'Anthropic API Key 未设置或客户端初始化失败', done: true };
      return;
    }

    const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };
    const sessionIdentifier = `anthropic-stream-${Date.now()}`;

    try {
      const systemPrompt = options.systemPrompt;
      const messages = options.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) as Anthropic.Messages.MessageParam[];

      if (messages.length > 0 && messages[0].role !== 'user') {
        logChatMessage(sessionIdentifier, 'SYSTEM_ACTION', this.providerId, 'Message Order Adjustment (Stream)', '第一条消息不是来自用户，已添加占位符。', aiConfigLogInfo);
        messages.unshift({ role: 'user', content: '(Context begins)' });
      }

      const params: Anthropic.Messages.MessageCreateParams = {
        model: options.model,
        messages: messages,
        system: systemPrompt,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        stream: true,
      };

      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Stream Request Parameters', params, aiConfigLogInfo);
      const stream = await this.anthropic.messages.stream(params);

      for await (const event of stream) {
        logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Raw Event', event, aiConfigLogInfo);

        switch (event.type) {
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              yield { text: event.delta.text };
            }
            break;
          case 'message_start':
            yield { modelUsed: event.message.model }; // modelUsed is useful here
            break;
          case 'message_delta':
            // Potentially log usage if needed: event.usage.output_tokens
            break;
          case 'message_stop':
            logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Ended', { model: options.model, event }, aiConfigLogInfo);
            yield { done: true };
            break;
          case 'content_block_start':
          case 'content_block_stop':
            // These are structural events, can be logged if verbose logging is needed
            break;
          // Errors are typically caught by the outer try-catch
        }
      }
    } catch (error: unknown) {
      const errorMessage = `模型 ${options.model} 流式聊天完成时发生错误：${error instanceof Error ? error.message : String(error)}`;
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Stream Error', { error: error instanceof Error ? error.stack : String(error), params: options }, aiConfigLogInfo);
      console.error(`[AnthropicLLM Stream] ${errorMessage}`);
      let detailedError = '与 Anthropic API 通信时发生未知错误';
      if (error instanceof Anthropic.APIError) {
        detailedError = `Anthropic API Error (${error.status}): ${error.message}`;
      } else if (error instanceof Error) {
        detailedError = error.message;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      yield { error: detailedError, done: true };
    }
  }
}
