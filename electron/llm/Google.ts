import {
  GoogleGenAI,
  Content, // 导入 Content 类型
  GenerateContentConfig, // 导入配置类型
  SafetySetting, // 导入安全设置类型
  HarmCategory,
  HarmBlockThreshold,
  FinishReason, // 导入 FinishReason
  BlockedReason, // 导入 BlockedReason
  // GenerateContentResponse, // 不再需要显式导入，TS 会推断
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
   * Google API 要求 user/model 交替，且不能连续出现相同角色
   * 这个方法逻辑保持不变，因为新旧库的 Content 格式基本一致
   */
  private mapMessagesToGoogleContent(messages: LLMChatOptions['messages']): Content[] {
    const history: Content[] = [];
    let lastRole: 'user' | 'model' | null = null;

    // 过滤掉非 user/assistant 的消息，并确保第一条是 user
    const filteredMessages = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (filteredMessages.length > 0 && filteredMessages[0].role !== 'user') {
        console.warn('[GoogleLLM] History does not start with a user message. Adjusting...');
        // 实际项目中可能需要更复杂的处理，这里仅作日志记录
    }


    for (const message of filteredMessages) {
      // Google 使用 'model' 而不是 'assistant'
      const currentRole = message.role === 'assistant' ? 'model' : 'user'; // 明确只有 user 和 model

      // 确保角色交替，如果连续出现相同角色，则合并内容
      if (history.length > 0 && currentRole === lastRole) {
         console.warn(`[GoogleLLM] Consecutive messages with role '${currentRole}' detected. Merging content.`);
         const lastContent = history[history.length - 1];
         // 确保 parts 存在且是数组
         if (!Array.isArray(lastContent.parts)) {
            lastContent.parts = []; // 或者根据情况处理错误
         }
         // 确保 parts 里的元素是 { text: string } 结构
         lastContent.parts.push({ text: message.content });
      } else {
         // 添加新的 Content 条目
         history.push({
           role: currentRole,
           // 确保 parts 是 [{ text: string }] 结构
           parts: [{ text: message.content }],
         });
         lastRole = currentRole;
      }
    }

    // Gemini API 要求历史记录必须以 user 角色结束才能调用 sendMessage
    // 如果最后一条是 model，则移除它，因为无法基于 model 的回复继续生成
    if (history.length > 0 && history[history.length - 1].role === 'model') {
        console.warn('[GoogleLLM] History ends with a model message. Removing the last message for chat context.');
        history.pop();
    }

    return history;
  }


  /**
   * 实现非流式聊天请求方法 (使用 @google/genai SDK)
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

    try {
      // --- 准备历史记录 ---
      const messagesForHistory = options.messages.slice(0, -1); // 排除最后一条用户消息
      const history = this.mapMessagesToGoogleContent(messagesForHistory);

      // --- 准备配置 ---
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

      // --- 创建聊天会话 ---
      const chat = this.sdk.chats.create({
         model: options.model,
         history: history,
         config: {
            ...generationConfig,
            safetySettings: safetySettings,
            systemInstruction: options.systemPrompt ? options.systemPrompt : undefined,
         },
      });

      // --- 提取最后一条用户消息 ---
      const lastUserMessage = options.messages[options.messages.length - 1];
      let lastUserMessageContent: string | undefined;
      if (lastUserMessage?.role === 'user') {
          lastUserMessageContent = lastUserMessage.content;
      } else {
          console.error('[GoogleLLM Stream] The last message is not from the user.');
          yield { error: '内部错误：聊天历史格式不正确，最后一条消息必须是用户消息。', done: true };
          return;
      }

      console.log(`[GoogleLLM Stream] Sending message to model ${options.model}: "${lastUserMessageContent}" with history length: ${history.length}`);

      // --- 调用流式接口 ---
      // 注意：sendMessageStream 的 message 参数类型是 string | Part | (string | Part)[]
      // 这里我们只传递 string
      const stream = await chat.sendMessageStream({ message: lastUserMessageContent });

      // --- 遍历流并 Yield 数据块 ---
      // 移除类型注解，让 TS 自动推断 chunk 类型
      for await (const chunk of stream) {
         // console.log('[GoogleLLM Stream] Received chunk:', JSON.stringify(chunk)); // 调试日志
         const chunkText = chunk.text; // 尝试获取文本

         // 检查是否有错误或安全阻止
         if (chunk.promptFeedback?.blockReason) {
             const blockReason: BlockedReason = chunk.promptFeedback.blockReason; // 显式类型
             console.error(`[GoogleLLM Stream] Request blocked due to safety settings: ${blockReason}`);
             yield { error: `请求被安全策略阻止: ${blockReason}`, done: true };
             return; // 流中断
         }
         const finishReason = chunk.candidates?.[0]?.finishReason;
         // 修正这里的逻辑运算符，使用 &&
         if (!chunkText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
             console.error(`[GoogleLLM Stream] Response generation stopped unexpectedly: ${finishReason}`);
             yield { error: `响应生成中止: ${finishReason}`, done: true };
             return; // 流中断
         }

         // 发送文本块 (即使是空字符串也发送，以便前端知道仍在处理)
         yield { text: chunkText ?? '' };


         // 可以在这里添加 token 计数等信息 (如果需要)
         // const usage = chunk.usageMetadata;
         // if (usage) {
         //    yield { usage: { promptTokens: usage.promptTokenCount, completionTokens: usage.candidatesTokenCount, totalTokens: usage.totalTokenCount } };
         // }
      }

      // --- 流正常结束 ---
      console.log(`[GoogleLLM Stream] Stream finished for model ${options.model}.`);
      yield { done: true };

    } catch (error: unknown) {
      console.error(`[GoogleLLM Stream] Error during stream chat completion for model ${options.model}:`, error);
      let detailedError = '调用流式聊天生成时发生未知错误';
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