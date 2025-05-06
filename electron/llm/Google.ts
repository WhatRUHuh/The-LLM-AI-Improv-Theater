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
import { logChatMessage } from '../utils/chatLoggerUtil'; // <-- 导入聊天日志工具
// 导入 StreamChunk 类型定义
import { BaseLLM, LLMResponse, LLMChatOptions, StreamChunk } from './BaseLLM';
import type { AIConfig } from '../../src/types'; // 导入 AIConfig 类型

/**
 * Google Gemini 服务商的实现 (使用 @google/genai)
 */
export class GoogleLLM extends BaseLLM {
  readonly providerId = 'google';
  readonly providerName = 'Google Gemini';
  // baseApiUrl 将从 BaseLLM 的构造函数中通过 AIConfig 设置 (对于 Google 可能为 undefined)

  readonly defaultModels: string[] = [
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.0-pro', // 保持旧模型兼容性
    // 'gemini-pro-vision', // 如果需要视觉模型
  ];

  // 修改 sdk 类型为新库的 GoogleGenAI
  private sdk: GoogleGenAI | null = null;

  constructor(config: AIConfig) {
    super(config); // 调用基类构造函数，apiKey 和 baseApiUrl 会在那里被设置
    try {
      // GoogleGenAI 构造函数只需要 apiKey
      this.sdk = new GoogleGenAI({ apiKey: this.apiKey });
      console.log(`[GoogleLLM] Google Gemini 客户端已使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化完成。`);
    } catch (error) {
       console.error(`[GoogleLLM] 使用配置 (ID: ${this.configId}, Name: ${this.configName}) 初始化 Google Gemini 客户端失败：`, error);
       this.sdk = null; // 初始化失败，重置客户端
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
        console.warn('[GoogleLLM] 历史记录未以用户消息开始，已进行调整。');
    }

    for (const message of filteredMessages) {
      const currentRole = message.role === 'assistant' ? 'model' : 'user';
      if (history.length > 0 && currentRole === lastRole) {
         console.warn(`[GoogleLLM] 检测到连续的 '${currentRole}' 角色消息，已合并内容。`);
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

    // 注意：根据新的投机取巧逻辑，我们不再主动移除末尾的模型消息。
    // 因为我们需要在调用函数中判断原始消息列表的末尾，以决定是否追加伪造的用户消息。
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
      // --- 投机取巧 Hack 开始 ---
      // 检查原始消息列表的最后一条消息
      let effectiveMessages = options.messages; // 默认使用原始消息
      const lastMessage = options.messages[options.messages.length - 1];
      if (lastMessage?.role === 'assistant') {
        // 如果最后一条是 assistant 说的，就在末尾追加一条伪造的用户消息
        console.warn('[GoogleLLM] 检测到最后一条消息是助手消息，追加伪造的用户消息以尝试绕过API限制。');
        // 尝试从系统提示词中提取角色名
        let roleName = '自己的角色';
        const systemPrompt = options.systemPrompt || '';
        const roleNameMatch = systemPrompt.match(/你是\s+\*\*([^*]+)\*\*/);
        if (roleNameMatch && roleNameMatch[1]) {
            roleName = roleNameMatch[1].trim();
        }

        effectiveMessages = [...options.messages, { role: 'user', content: `请认真扮演好${roleName}这个角色，直接输出对话内容，不要包含角色名前缀，不要引用其他角色的对话，继续对话` }];
      }
      // --- 投机取巧 Hack 结束 ---

      // 后续操作都基于 effectiveMessages (可能是原始的，也可能是追加了伪造消息的)
      const messagesForHistory = effectiveMessages.slice(0, -1); // 获取除最后一条外的所有消息作为历史
      const history = this.mapMessagesToGoogleContent(messagesForHistory); // 转换历史记录格式

      const generationConfig: GenerateContentConfig = {
        temperature: options.temperature, // 使用选项中的温度
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

      // 获取 *有效* 的最后一条用户消息内容 (现在它必然是 'user' 角色)
      const lastEffectiveUserMessage = effectiveMessages[effectiveMessages.length - 1];
      const lastUserMessageContent: string | undefined = lastEffectiveUserMessage.content; // 改为 const
      // 这里的检查理论上不会失败，因为我们保证了最后一条是 'user'
      if (lastEffectiveUserMessage?.role !== 'user' || lastUserMessageContent === undefined) {
           console.error('[GoogleLLM] 内部错误：无法获取最后的用户消息内容。');
           return { content: '', error: '内部错误：无法获取最后的用户消息内容。' };
      }

      // --- 记录请求详情 ---
      // === 聊天日志记录 ===
      const sessionIdentifier = 'non-stream-' + Date.now(); // 简单会话标识符
      const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };
      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Request Options', { model: options.model, systemPrompt: options.systemPrompt, temperature: options.temperature, maxTokens: options.maxTokens }, aiConfigLogInfo);
      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Effective Last Message', lastUserMessageContent, aiConfigLogInfo);
      logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'API History', history, aiConfigLogInfo);
      // === 记录结束 ===

      // 调用 SDK 的 sendMessage 方法，传入处理后的最后一条用户消息内容
      const result = await chat.sendMessage({ message: lastUserMessageContent });

      // --- 记录响应详情 ---
      // === 聊天日志记录 ===
      logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'API Response', result, aiConfigLogInfo);
      // === 记录结束 ===

      const responseText = result.text; // 保留此行用于后续逻辑

      if (result.promptFeedback?.blockReason) {
         const blockReason: BlockedReason = result.promptFeedback.blockReason;
         const blockErrorMsg = `请求被安全策略阻止: ${blockReason}`;
         console.error(`[GoogleLLM] ${blockErrorMsg}`);
         // === 聊天日志记录 ===
         logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Safety Block', { blockReason }, aiConfigLogInfo);
         // === 记录结束 ===
         return { content: '', error: blockErrorMsg };
      }
      const finishReason = result.candidates?.[0]?.finishReason;
      if (!responseText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
         const abortErrorMsg = `响应生成中止: ${finishReason}`;
         console.error(`[GoogleLLM] ${abortErrorMsg}`);
          // === 聊天日志记录 ===
          logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Generation Aborted', { finishReason }, aiConfigLogInfo);
          // === 记录结束 ===
         return { content: '', error: abortErrorMsg };
      }
       if (!responseText && (!finishReason || finishReason === FinishReason.STOP || finishReason === FinishReason.MAX_TOKENS) && !result.promptFeedback?.blockReason) {
           const warnMsg = '[GoogleLLM] 未接收到内容，且无阻止或意外中止原因。';
           console.warn(warnMsg);
            // === 聊天日志记录 ===
            logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Empty Response (No Block)', { finishReason }, aiConfigLogInfo);
            // === 记录结束 ===
           return { content: '', modelUsed: options.model };
       }

      return {
        content: responseText ?? '',
        modelUsed: options.model,
      };

    } catch (error: unknown) {
      console.error(`[GoogleLLM] 模型 ${options.model} 聊天完成时出错：`, error);
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
    const systemInstruction = options.systemPrompt ? options.systemPrompt : undefined; // 获取系统提示

    // --- 投机取巧 Hack 开始 ---
    // 检查原始消息列表的最后一条消息
    let effectiveMessages = options.messages; // 默认使用原始消息
    const lastMessage = options.messages[options.messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      // 如果最后一条是 assistant 说的，就在末尾追加一条伪造的用户消息
      console.warn('[GoogleLLM Stream] 检测到最后一条消息是助手消息，追加伪造的用户消息以尝试绕过API限制。');
      // 尝试从系统提示词中提取角色名
      let roleName = '自己的角色';
      const systemPrompt = options.systemPrompt || '';
      const roleNameMatch = systemPrompt.match(/你是\s+\*\*([^*]+)\*\*/);
      if (roleNameMatch && roleNameMatch[1]) {
          roleName = roleNameMatch[1].trim();
      }

      effectiveMessages = [...options.messages, { role: 'user', content: `请认真扮演好${roleName}这个角色，直接输出对话内容，不要包含角色名前缀，不要引用其他角色的对话，继续对话` }];
    }
    // --- 投机取巧 Hack 结束 ---

    // 使用 effectiveMessages 获取最后一条 *有效* 的用户消息内容 (现在它必然是 'user' 角色)
    const lastEffectiveUserMessage = effectiveMessages[effectiveMessages.length - 1];
    const lastUserMessageContent: string | undefined = lastEffectiveUserMessage.content; // 改为 const
    // 这里的检查理论上不会失败
    if (lastEffectiveUserMessage?.role !== 'user' || lastUserMessageContent === undefined) {
        console.error('[GoogleLLM Stream] 内部错误：无法获取最后的用户消息内容。');
        yield { error: '内部错误：无法获取最后的用户消息内容。', done: true };
        return;
    }

    // --- 根据历史记录长度选择不同的 API 调用方式 ---
    // 使用 effectiveMessages 来准备历史记录 (排除最后一条伪造的或真实的用户消息)
    const messagesForHistory = effectiveMessages.slice(0, -1);
    const history = this.mapMessagesToGoogleContent(messagesForHistory); // 转换历史记录格式

    let stream: AsyncGenerator<GenerateContentResponse>; // 定义流的类型
    const sessionIdentifier = 'stream-' + Date.now(); // <-- 把定义移到 try 外面
    const aiConfigLogInfo = { id: this.configId, name: this.configName, serviceProvider: this.providerId };

    try { // 外层 try...catch 捕获 API 调用和流处理中的错误
        if (history.length === 0) {
            // --- 处理第一次请求 (无历史记录) ---
            const firstRequestPayload = { // 构建实际发送的负载用于记录
                model: options.model,
                contents: [{ role: 'user', parts: [{ text: lastUserMessageContent }] }],
                config: {
                   ...generationConfig,
                   safetySettings: safetySettings,
                   systemInstruction: systemInstruction,
                }
            };
             // === 聊天日志记录 ===
             console.log(`[GoogleLLM Stream] 发送首次流式请求到模型 ${options.model}。`); // 保留简短控制台日志
             logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'First Request Payload', firstRequestPayload, aiConfigLogInfo);
             // === 记录结束 ===
            // 调用 generateContentStream，传递包含所有参数的对象
            stream = await this.sdk.models.generateContentStream({
                model: options.model, // model 必须在这里
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
             // === 聊天日志记录 ===
             console.log(`[GoogleLLM Stream] 发送后续流式请求到模型 ${options.model}。历史长度: ${history.length}`); // 保留简短控制台日志
             logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Subsequent Request Options', { model: options.model, systemInstruction: systemInstruction, temperature: options.temperature, maxTokens: options.maxTokens, historyLength: history.length }, aiConfigLogInfo);
             logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'Effective Last Message', lastUserMessageContent, aiConfigLogInfo);
             logChatMessage(sessionIdentifier, 'TO_AI', this.providerId, 'API History', history, aiConfigLogInfo);
             // === 记录结束 ===
            const chat = this.sdk.chats.create({
                model: options.model, // model 必须在这里
                history: history, // history 在这里
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
           // === 聊天日志记录 ===
           logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'API Raw Chunk', chunk, aiConfigLogInfo);
           // === 记录结束 ===
            const chunkText = chunk.text; // 尝试获取文本 (保持不变)

            // 检查是否有错误或安全阻止 (保持不变)
            if (chunk.promptFeedback?.blockReason) {
                const blockReason: BlockedReason = chunk.promptFeedback.blockReason;
                const blockErrorMsg = `请求因安全策略被阻止: ${blockReason}`;
                console.error(`[GoogleLLM Stream] ${blockErrorMsg}`);
                // === 聊天日志记录 ===
                logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Safety Block', { blockReason }, aiConfigLogInfo);
                // === 记录结束 ===
                yield { error: blockErrorMsg, done: true };
                return; // 流中断
            }
            const finishReason = chunk.candidates?.[0]?.finishReason;
            if (!chunkText && finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.MAX_TOKENS) {
                const abortErrorMsg = `响应生成中止: ${finishReason}`;
                console.error(`[GoogleLLM Stream] ${abortErrorMsg}`);
                // === 聊天日志记录 ===
                logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Generation Aborted', { finishReason }, aiConfigLogInfo);
                // === 记录结束 ===
                yield { error: abortErrorMsg, done: true };
                return; // 流中断
            }

            // 发送文本块 (即使是空字符串也发送，以便前端知道仍在处理)
            // console.log('[GoogleLLM Stream] 输出文本块：', chunkText ?? ''); // 这个可以移到 chat log
            // === 聊天日志记录 ===
            if (chunkText || (chunk.candidates && chunk.candidates.length > 0 && chunk.candidates[0].finishReason)) { // 只记录有文本或有结束原因的块
               logChatMessage(sessionIdentifier, 'FROM_AI', this.providerId, 'Processed Chunk', { text: chunkText ?? '', finishReason: chunk.candidates?.[0]?.finishReason }, aiConfigLogInfo);
            }
            // === 记录结束 ===
            yield { text: chunkText ?? '' };
        }

        // --- 流正常结束 ---
        console.log(`[GoogleLLM Stream] 模型 ${options.model} 的流式输出正常结束。`);

        // 添加一个小延迟，确保所有数据都已经被发送
        await new Promise(resolve => setTimeout(resolve, 1000));

        yield { done: true }; // 发送完成信号

    } catch (error: unknown) { // 这个 catch 块捕获 API 调用和流遍历过程中的错误
      // --- 记录流处理错误 ---
      const errorMsg = `模型 ${options.model} 流式处理时捕获到错误: ${error instanceof Error ? error.stack : error}`;
      console.error(`[GoogleLLM Stream] ${errorMsg}`);
      // === 聊天日志记录 ===
      logChatMessage(sessionIdentifier, 'SYSTEM_ACTION', 'GoogleLLM Stream Catch Block', 'Caught Error', { error: error instanceof Error ? error.stack : String(error) }, aiConfigLogInfo);
      // === 记录结束 ===
      let detailedError = '处理流式响应时发生未知错误';
      if (error instanceof Error) {
        detailedError = error.message; // 保持提取 message 作为返回给前端的错误信息
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      // 发送错误并标记结束
      yield { error: detailedError, done: true };
    }
  }
}
