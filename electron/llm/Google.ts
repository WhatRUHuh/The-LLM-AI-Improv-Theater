import {
  GoogleGenAI,
  Content, // 导入 Content 类型
  GenerateContentConfig, // 导入配置类型
  SafetySetting, // 导入安全设置类型
  HarmCategory,
  HarmBlockThreshold,
  FinishReason, // 导入 FinishReason
  BlockedReason, // 导入 BlockedReason
  GenerateContentResponse, // 导入流式响应块类型
} from '@google/genai'; // <--- 修改库导入
// 导入 StreamChunk 类型定义
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';

/**
 * Google Gemini 服务商的实现 (使用 @google/genai)
 */
export class GoogleLLM extends BaseLLM {
  readonly providerId = 'google';
  readonly providerName = 'Google Gemini';
  // 显式实现可选的 baseApiUrl 以满足 TypeScript 编译器
  readonly baseApiUrl: string | undefined = undefined;
  // baseApiUrl 在新 SDK 中通常通过 httpOptions 设置，这里保留注释或移除
  // readonly baseApiUrl = 'https://generativelanguage.googleapis.com/v1beta';

  readonly defaultModels: string[] = [
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.0-pro', // 保持旧模型兼容性
    // 'gemini-pro-vision', // 如果需要视觉模型
  ];

  // 修改 sdk 类型为新库的 GoogleGenAI
  private sdk: GoogleGenAI | null = null;

  /**
   * 重写 setApiKey 方法，在设置 key 时初始化 GoogleGenAI 客户端
   */
  override setApiKey(apiKey: string | null): void {
    super.setApiKey(apiKey);
    if (apiKey) {
      try {
        // 使用新库的构造函数, 传入包含 apiKey 的对象
        this.sdk = new GoogleGenAI({ apiKey: apiKey } /*, { httpOptions } */);
        console.log(`[GoogleLLM] Google Gemini client initialized for provider: ${this.providerId}`);
      } catch (error) {
         console.error(`[GoogleLLM] Failed to initialize Google Gemini client for ${this.providerId}:`, error);
         this.sdk = null;
      }
    } else {
      this.sdk = null;
      console.log(`[GoogleLLM] Google Gemini client destroyed for provider: ${this.providerId}`);
    }
  }

  /**
   * 将通用的消息历史转换为 Google Gemini API 的 Content[] 格式
   */
  private mapMessagesToGoogleContent(messages: LLMChatOptions['messages']): Content[] {
    const history: Content[] = [];
    let lastRole: 'user' | 'model' | null = null;

    const filteredMessages = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (filteredMessages.length > 0 && filteredMessages[0].role !== 'user') {
        console.warn('[GoogleLLM] History does not start with a user message. Adjusting...');
    }

    for (const message of filteredMessages) {
      const currentRole = message.role === 'assistant' ? 'model' : 'user';
      if (history.length > 0 && currentRole === lastRole) {
         console.warn(`[GoogleLLM] Consecutive messages with role '${currentRole}' detected. Merging content.`);
         const lastContent = history[history.length - 1];
         if (!Array.isArray(lastContent.parts)) {
            lastContent.parts = [];
         }
         lastContent.parts.push({ text: message.content });
      } else {
         history.push({
           role: currentRole,
           parts: [{ text: message.content }],
         });
         lastRole = currentRole;
      }
    }

    if (history.length > 0 && history[history.length - 1].role === 'model') {
        console.warn('[GoogleLLM] History ends with a model message. Removing the last message for chat context.');
        history.pop();
    }
    return history;
  }


  /**
   * 实现非流式聊天请求方法
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.sdk) {
      return { content: '', error: 'Google API Key 未设置或客户端初始化失败' };
    }

    try {
      const messagesForHistory = options.messages.slice(0, -1);
      const history = this.mapMessagesToGoogleContent(messagesForHistory);

      const generationConfig: GenerateContentConfig = {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      };
      const safetySettings: SafetySetting[] = [
           { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      const chat = this.sdk.chats.create({
         model: options.model,
         history: history,
         config: {
            ...generationConfig,
            safetySettings: safetySettings,
            systemInstruction: options.systemPrompt ? options.systemPrompt : undefined,
         },
      });

      const lastUserMessage = options.messages[options.messages.length - 1];
      let lastUserMessageContent: string | undefined;
      if (lastUserMessage?.role === 'user') {
          lastUserMessageContent = lastUserMessage.content;
      } else {
          console.error('[GoogleLLM] The last message is not from the user.');
          return { content: '', error: '内部错误：聊天历史格式不正确，最后一条消息必须是用户消息。' };
      }

      console.log(`[GoogleLLM] Sending message to model ${options.model}: "${lastUserMessageContent}" with history length: ${history.length}`);

      const result = await chat.sendMessage({ message: lastUserMessageContent });

      console.log('[GoogleLLM] Received result');

      const responseText = result.text;

      if (result.promptFeedback?.blockReason) {
         const blockReason: BlockedReason = result.promptFeedback.blockReason;
         console.error(`[GoogleLLM] Request blocked due to safety settings: ${blockReason}`);
         return { content: '', error: `请求被安全策略阻止: ${blockReason}` };
      }
      const finishReason = result.candidates?.[0]?.finishReason;
      if (!responseText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
         console.error(`[GoogleLLM] Response generation stopped unexpectedly: ${finishReason}`);
         return { content: '', error: `响应生成中止: ${finishReason}` };
      }
       if (!responseText && (!finishReason || finishReason === FinishReason.STOP || finishReason === FinishReason.MAX_TOKENS) && !result.promptFeedback?.blockReason) {
           console.warn('[GoogleLLM] Received empty content without explicit block or unexpected stop reason.');
           return { content: '', modelUsed: options.model };
       }

      return {
        content: responseText ?? '',
        modelUsed: options.model,
      };

    } catch (error: unknown) {
      console.error(`[GoogleLLM] Error during chat completion for model ${options.model}:`, error);
      let detailedError = '与 Google API 通信时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      return { content: '', error: detailedError };
    }
  }

  /**
   * 实现流式聊天请求方法 (使用 @google/genai SDK)
   */
  async *generateChatCompletionStream(options: LLMChatOptions): AsyncGenerator<StreamChunk> {
    // 检查 SDK 和 Key
    if (!this.sdk) {
      yield { error: 'Google API Key 未设置或客户端初始化失败', done: true };
      return;
    }

    // 提取通用配置和最后的用户消息
    const generationConfig: GenerateContentConfig = {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
    };
    const safetySettings: SafetySetting[] = [
         { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
    const systemInstruction = options.systemPrompt ? options.systemPrompt : undefined;
    const lastUserMessage = options.messages[options.messages.length - 1];
    let lastUserMessageContent: string | undefined;

    if (lastUserMessage?.role === 'user') {
        lastUserMessageContent = lastUserMessage.content;
    } else {
        console.error('[GoogleLLM Stream] The last message is not from the user.');
        yield { error: '内部错误：聊天历史格式不正确，最后一条消息必须是用户消息。', done: true };
        return;
    }

    // --- 根据历史记录长度选择不同的 API 调用方式 ---
    const messagesForHistory = options.messages.slice(0, -1);
    const history = this.mapMessagesToGoogleContent(messagesForHistory);

    let stream: AsyncGenerator<GenerateContentResponse>; // 使用正确的类型

    try { // 外层 try...catch 捕获 API 调用和流处理中的错误
        if (history.length === 0) {
            // --- 处理第一次请求 (无历史记录) ---
            console.log(`[GoogleLLM Stream] Sending first message using generateContentStream to model ${options.model}: "${lastUserMessageContent}"`);
            // 调用 generateContentStream，传递包含所有参数的对象
            stream = await this.sdk.models.generateContentStream({
                model: options.model,
                contents: [{ role: 'user', parts: [{ text: lastUserMessageContent }] }],
                // 修正：将配置参数放入 config 对象
                config: {
                    ...generationConfig, // 展开 temperature, maxOutputTokens
                    safetySettings: safetySettings,
                    systemInstruction: systemInstruction,
                }
            });
        } else {
            // --- 处理后续请求 (有历史记录) ---
            console.log(`[GoogleLLM Stream] Sending message using chat.sendMessageStream to model ${options.model}: "${lastUserMessageContent}" with history length: ${history.length}`);
            const chat = this.sdk.chats.create({
                model: options.model,
                history: history,
                config: { // config 应该在 chats.create 时传入
                    ...generationConfig,
                    safetySettings: safetySettings,
                    systemInstruction: systemInstruction,
                },
            });
            stream = await chat.sendMessageStream({ message: lastUserMessageContent });
        }

        // --- 统一处理流遍历和 Yield ---
        for await (const chunk of stream) {
            // console.log('[GoogleLLM Stream] Received chunk:', JSON.stringify(chunk)); // 调试日志
            const chunkText = chunk.text; // 尝试获取文本

            // 检查是否有错误或安全阻止
            if (chunk.promptFeedback?.blockReason) {
                const blockReason: BlockedReason = chunk.promptFeedback.blockReason;
                console.error(`[GoogleLLM Stream] Request blocked due to safety settings: ${blockReason}`);
                yield { error: `请求被安全策略阻止: ${blockReason}`, done: true };
                return; // 流中断
            }
            const finishReason = chunk.candidates?.[0]?.finishReason;
            if (!chunkText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
                console.error(`[GoogleLLM Stream] Response generation stopped unexpectedly: ${finishReason}`);
                yield { error: `响应生成中止: ${finishReason}`, done: true };
                return; // 流中断
            }

            // 发送文本块 (即使是空字符串也发送，以便前端知道仍在处理)
            console.log('[GoogleLLM Stream] Yielding text chunk:', chunkText ?? ''); // 添加日志
            yield { text: chunkText ?? '' };
        }

        // --- 流正常结束 ---
        console.log(`[GoogleLLM Stream] Stream finished for model ${options.model}.`);
        yield { done: true };

    } catch (error: unknown) { // 这个 catch 块捕获 API 调用和流遍历过程中的错误
      console.error(`[GoogleLLM Stream] Error during stream for model ${options.model}:`, error);
      let detailedError = '处理流式响应时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      // 发送错误并标记结束
      yield { error: detailedError, done: true };
    }
  }
}