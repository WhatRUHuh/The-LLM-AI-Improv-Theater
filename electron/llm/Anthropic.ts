import Anthropic, { ClientOptions } from '@anthropic-ai/sdk';
// 导入 StreamChunk 类型
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';
// import { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'; // 移除未使用的导入

/**
 * Anthropic Claude 服务商的实现
 */
export class AnthropicLLM extends BaseLLM {
  readonly providerId = 'anthropic';
  readonly providerName = 'Anthropic Claude';
  // Anthropic 的基础 URL，也可以从配置读取
  readonly baseApiUrl = 'https://api.anthropic.com/v1'; // 请根据实际情况确认

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

  /**
   * 重写 setApiKey 方法，在设置 key 时初始化 Anthropic 客户端
   */
  override setApiKey(apiKey: string | null): void {
    super.setApiKey(apiKey);
    if (apiKey) {
      try {
        const clientOptions: ClientOptions = {
          apiKey: apiKey,
          // baseURL: this.baseApiUrl, // 可以考虑允许用户配置 Base URL
        };

        this.anthropic = new Anthropic(clientOptions);
        console.log(`Anthropic 客户端已为提供商 ${this.providerId} 初始化完成`);
      } catch (error) {
         console.error(`为提供商 ${this.providerId} 初始化 Anthropic 客户端失败：`, error);
         this.anthropic = null;
      }
    } else {
      this.anthropic = null;
      console.log(`Anthropic 客户端已为提供商 ${this.providerId} 销毁`);
    }
  }

  /**
   * 实现非流式聊天请求方法
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.anthropic) {
      return { content: '', error: 'Anthropic API Key 未设置或客户端初始化失败' };
    }

    try {
      // --- 构造 Anthropic API 请求参数 ---
      const systemPrompt = options.systemPrompt;
      // 确保 messages 只包含 user/assistant
      const messages = options.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) as Anthropic.Messages.MessageParam[];

      // 简单检查并处理消息顺序 (确保以 user 开头)
      if (messages.length > 0 && messages[0].role !== 'user') {
         console.warn('【Anthropic】第一条消息不是来自用户，已添加占位符。');
         messages.unshift({ role: 'user', content: '(Context begins)' });
      }

      const params: Anthropic.Messages.MessageCreateParams = {
        model: options.model,
        messages: messages,
        system: systemPrompt,
        max_tokens: options.maxTokens ?? 1024, // Anthropic 需要 max_tokens
        temperature: options.temperature,
        // stream: false, // 非流式请求
      };

      console.log(`正在向模型 ${options.model} 发送请求`); // 简化日志

      const completion: Anthropic.Messages.Message = await this.anthropic.messages.create(params);

      console.log('已接收到完成结果'); // 简化日志

      // --- 解析 Anthropic 响应 ---
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
      console.error(`模型 ${options.model} 聊天完成时发生错误：`, error);
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

    try {
      // --- 构造 Anthropic API 请求参数 ---
      const systemPrompt = options.systemPrompt;
      const messages = options.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) as Anthropic.Messages.MessageParam[];

      // 简单检查并处理消息顺序 (确保以 user 开头)
      if (messages.length > 0 && messages[0].role !== 'user') {
        console.warn('【Anthropic 流】第一条消息不是来自用户，已添加占位符。');
        messages.unshift({ role: 'user', content: '(Context begins)' });
      }

      const params: Anthropic.Messages.MessageCreateParams = {
        model: options.model,
        messages: messages,
        system: systemPrompt,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        stream: true, // <-- 启用流式响应
      };

      console.log(`正在向模型 ${options.model} 发送流式请求`);

      const stream = await this.anthropic.messages.stream(params);

      // --- 遍历流事件并 Yield 数据块 ---
      for await (const event of stream) {
        // console.log('[Anthropic Stream] Received event:', event.type); // 调试日志

        switch (event.type) {
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              // console.log('[Anthropic Stream] Text delta:', event.delta.text);
              yield { text: event.delta.text };
            }
            break;
          case 'message_start':
            // console.log('[Anthropic Stream] Message started. Input tokens:', event.message.usage.input_tokens);
            yield { modelUsed: event.message.model };
            break;
          case 'message_delta':
            // console.log('[Anthropic Stream] Message delta. Output tokens:', event.usage.output_tokens);
            break;
          case 'message_stop': { // 添加花括号
            console.log(`模型 ${options.model} 的流式请求已完成。`);
            yield { done: true }; // 移除 usage 获取
            break;
          }
          case 'content_block_start':
            break;
          case 'content_block_stop':
            break;
          // 移除 case 'error'
        }
      }
      // 如果循环正常结束但没有收到 message_stop，也发送 done
      // 但通常 SDK 会确保发送 message_stop
      // yield { done: true };

    } catch (error: unknown) {
      console.error(`模型 ${options.model} 的流式聊天完成时发生错误：`, error);
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
