import {
  GoogleGenAI,
  Content, // 导入 Content 类型
  // Part, // 导入 Part 类型 (虽然 mapMessagesToGoogleContent 内部用了，但外部接口可能不需要)
  GenerateContentConfig, // 导入配置类型
  SafetySetting, // 导入安全设置类型
  HarmCategory,
  HarmBlockThreshold,
  FinishReason, // 导入 FinishReason
  BlockedReason, // 导入 BlockedReason (修正类型名称)
} from '@google/genai'; // <--- 修改库导入
import { BaseLLM, LLMResponse, LLMChatOptions } from './BaseLLM';

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
        // 使用新库的构造函数
        // 注意：如果需要自定义 baseURL，可以在这里添加 httpOptions
        // const httpOptions = this.baseApiUrl ? { baseUrl: this.baseApiUrl } : undefined;
        // 假设不需要自定义 baseURL，传入包含 apiKey 的对象
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
   * 实现聊天请求方法 (使用 @google/genai SDK)
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    // 修改检查 this.genAI 为 this.sdk
    if (!this.sdk) {
      return { content: '', error: 'Google API Key 未设置或客户端初始化失败' };
    }
    // 模型检查逻辑保持注释状态

    try {
      // --- 准备历史记录 ---
      // 使用 mapMessagesToGoogleContent 转换消息格式
      // 注意：传入给 mapMessagesToGoogleContent 的应该是除了最后一条用户消息之外的所有历史
      const messagesForHistory = options.messages.slice(0, -1); // 假设最后一条是当前用户输入
      const history = this.mapMessagesToGoogleContent(messagesForHistory);

      // --- 准备配置 ---
      const generationConfig: GenerateContentConfig = {
        // 从 options 传入 temperature 和 maxTokens
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        // topP, topK 等如果需要，也可以从 options 添加
      };

      // 安全设置保持不变
      const safetySettings: SafetySetting[] = [
           { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           // 可以根据需要添加或修改其他安全类别
      ];

      // --- 创建聊天会话 ---
      // 使用新 SDK 的 chats.create 方法
      const chat = this.sdk.chats.create({
         model: options.model,
         history: history, // 传入处理过的历史记录 (不含最后一条用户消息)
         config: {
            ...generationConfig, // 展开 generationConfig
            safetySettings: safetySettings, // 传入安全设置
            // systemInstruction 直接使用 options.systemPrompt 字符串
            // 新版 SDK 要求 systemInstruction 是 string 或 InlineDataPart
            systemInstruction: options.systemPrompt ? options.systemPrompt : undefined,
         },
      });

      // --- 提取最后一条用户消息 ---
      // 这部分逻辑保持不变，确保只发送最新的用户输入
      const lastUserMessage = options.messages[options.messages.length - 1];
      let lastUserMessageContent: string | undefined;

      if (lastUserMessage?.role === 'user') {
          lastUserMessageContent = lastUserMessage.content;
      } else {
          console.error('[GoogleLLM] The last message in options.messages is not from the user. Cannot send to Gemini.');
          return { content: '', error: '内部错误：聊天历史格式不正确，最后一条消息必须是用户消息。' };
      }


      console.log(`[GoogleLLM] Sending message to model ${options.model}: "${lastUserMessageContent}" with history length: ${history.length}`);
      // console.log('[GoogleLLM] History sent:', JSON.stringify(history, null, 2)); // 调试时可以取消注释

      // --- 发送消息 ---
      // 使用新 SDK 的 sendMessage，只发送最后的用户消息内容字符串
      // sendMessage 的参数是 string | Part | (string | Part)[]
      const result = await chat.sendMessage({ message: lastUserMessageContent });

      console.log('[GoogleLLM] Received result'); // 简化日志

      // --- 解析响应 ---
      // 新 SDK 直接在 result 上获取 text
      const responseText = result.text; // 使用 responseText 避免与 content 变量冲突

      // 检查安全阻止等原因 (使用 BlockedReason)
      if (result.promptFeedback?.blockReason) {
         const blockReason: BlockedReason = result.promptFeedback.blockReason; // 显式类型
         console.error(`[GoogleLLM] Request blocked due to safety settings: ${blockReason}`);
         return { content: '', error: `请求被安全策略阻止: ${blockReason}` };
      }
      // 检查是否有候选内容以及结束原因
      const finishReason = result.candidates?.[0]?.finishReason;
      if (!responseText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
         console.error(`[GoogleLLM] Response generation stopped unexpectedly: ${finishReason}`);
         return { content: '', error: `响应生成中止: ${finishReason}` };
      }
       // 添加一个检查，如果 content 为空但没有明确的错误原因 (finishReason 是 STOP 或 MAX_TOKENS)
       if (!responseText && (!finishReason || finishReason === FinishReason.STOP || finishReason === FinishReason.MAX_TOKENS) && !result.promptFeedback?.blockReason) {
           console.warn('[GoogleLLM] Received empty content without explicit block or unexpected stop reason.');
           // 返回空内容，因为这可能是模型正常行为（例如，无话可说或达到最大长度）
           return { content: '', modelUsed: options.model };
       }


      // --- 返回结果 ---
      // 保持返回格式不变，不包含 usage 和 rawResponse
      return {
        content: responseText ?? '', // 确保返回字符串
        modelUsed: options.model,
      };

    } catch (error: unknown) {
      console.error(`[GoogleLLM] Error during chat completion for model ${options.model}:`, error);
      let detailedError = '与 Google API 通信时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message;
        // 可以尝试检查 error.cause 或其他特定属性获取更详细信息
        // if (error.cause) detailedError += ` (Cause: ${JSON.stringify(error.cause)})`;
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      // 返回错误信息
      return { content: '', error: detailedError };
    }
  }
}