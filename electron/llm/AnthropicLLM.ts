import Anthropic, { ClientOptions } from '@anthropic-ai/sdk'; // 导入 ClientOptions
import { BaseLLM, LLMResponse, LLMChatOptions } from './BaseLLM';
import { proxyManager } from '../proxyManager'; // <-- 导入 proxyManager

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
        // 从 proxyManager 获取通用代理 Agent
        const httpAgent = proxyManager.getProxyAgent();
        console.log(`[Anthropic] Initializing client with proxy agent: ${httpAgent ? 'YES' : 'NO'}`);

        const clientOptions: ClientOptions = {
          apiKey: apiKey,
          // 如果获取到了代理 Agent，则配置给 SDK
          httpAgent: httpAgent ?? undefined,
          // baseURL: this.baseApiUrl, // 可以考虑允许用户配置 Base URL
        };

        this.anthropic = new Anthropic(clientOptions);
        console.log(`Anthropic client initialized for provider: ${this.providerId}`);
      } catch (error) {
         console.error(`Failed to initialize Anthropic client for ${this.providerId}:`, error);
         this.anthropic = null;
      }
    } else {
      this.anthropic = null;
      console.log(`Anthropic client destroyed for provider: ${this.providerId}`);
    }
  }

  /**
   * 实现聊天请求方法 (需要根据 Anthropic SDK 调整)
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.anthropic) {
      return { content: '', error: 'Anthropic API Key 未设置或客户端初始化失败' };
    }
    if (!options.model || !this.getAvailableModels().includes(options.model)) {
       return { content: '', error: `模型 ${options.model} 不可用或不受支持` };
    }

    try {
      // --- 构造 Anthropic API 请求参数 ---
      // 注意：Anthropic 的 API 结构与 OpenAI 不同，特别是 messages 格式和 system prompt 处理
      const systemPrompt = options.systemPrompt;
      // Anthropic messages 不包含 system, 且需要 user/assistant 交替
      const messages = options.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) as Anthropic.Messages.MessageParam[]; // 类型断言

      // Anthropic 要求 messages 必须以 user 开头 (如果第一条是 assistant，可能需要处理或报错)
      if (messages.length > 0 && messages[0].role !== 'user') {
         console.warn('[Anthropic] First message must be from user. Prepending an empty user message or handling required.');
         // 简单的处理方式：如果第一条是 assistant，前面加一个空的 user message (但这可能影响逻辑)
         // messages.unshift({ role: 'user', content: '(Placeholder for initial user turn)' });
         // 或者直接返回错误
         // return { content: '', error: 'Anthropic API requires the first message to be from the user.' };
      }
      // Anthropic 要求 messages 必须以 user 结尾 (如果最后一条是 assistant，需要处理)
      // Anthropic SDK v0.20.1+ 似乎不再强制要求最后一条必须是 user，但旧版本或直接调用 API 可能需要
      // if (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
      //    console.warn('[Anthropic] Last message must be from user. API might reject or behave unexpectedly.');
      //    // return { content: '', error: 'Anthropic API requires the last message to be from the user.' };
      // }


      const params: Anthropic.Messages.MessageCreateParams = {
        model: options.model,
        messages: messages, // 使用处理过的 messages
        system: systemPrompt, // Anthropic 使用独立的 system 参数
        max_tokens: options.maxTokens ?? 1024, // Anthropic 需要 max_tokens
        temperature: options.temperature,
        // stream: false, // 暂不支持流式
        // 其他 Anthropic 特定参数: top_p, top_k 等
      };

      console.log(`[Anthropic] Sending request to model ${options.model} with params:`, JSON.stringify(params, null, 2));

      const completion: Anthropic.Messages.Message = await this.anthropic.messages.create(params);

      console.log('[Anthropic] Received completion:', JSON.stringify(completion, null, 2));

      // --- 解析 Anthropic 响应 ---
      // Anthropic 的响应结构也不同，需要从中提取内容、模型、token 等信息
      let content = '';
      if (completion.content && completion.content.length > 0) {
         // 通常是 text 类型
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
          promptTokens: usage?.input_tokens, // 注意字段名不同
          completionTokens: usage?.output_tokens, // 注意字段名不同
          totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        },
        rawResponse: completion,
      };

    } catch (error: unknown) {
      console.error(`[Anthropic] Error during chat completion for model ${options.model}:`, error);
      let detailedError = '与 Anthropic API 通信时发生未知错误';
      if (error instanceof Anthropic.APIError) { // 使用 Anthropic 的特定错误类型
        detailedError = `Anthropic API Error (${error.status}): ${error.message}`;
        // 可以进一步解析 error.error?.message 等
      } else if (error instanceof Error) {
        detailedError = error.message;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      return { content: '', error: detailedError, rawResponse: error };
    }
  }
}