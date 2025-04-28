import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai'; // 稍后需要安装 @google/generative-ai
import { BaseLLM, LLMResponse, LLMChatOptions } from './BaseLLM';

/**
 * Google Gemini 服务商的实现
 */
export class GoogleLLM extends BaseLLM {
  readonly providerId = 'google';
  readonly providerName = 'Google Gemini';
  // Google AI Studio 或 Vertex AI 的基础 URL (通常 SDK 会处理)
  readonly baseApiUrl = 'https://generativelanguage.googleapis.com/v1beta'; // 示例，请核对

  // 默认支持的模型列表 (Gemini 系列)
  readonly defaultModels: string[] = [
    'gemini-1.5-flash-latest', // 或具体版本如 gemini-1.5-flash-001
    'gemini-1.5-pro-latest',   // 或具体版本如 gemini-1.5-pro-001
    'gemini-1.0-pro',          // 旧版，可能仍需支持
    // 'gemini-pro-vision', // 如果需要支持多模态
  ];

  private genAI: GoogleGenerativeAI | null = null;

  /**
   * 重写 setApiKey 方法，在设置 key 时初始化 GoogleGenerativeAI 客户端
   */
  override setApiKey(apiKey: string | null): void {
    super.setApiKey(apiKey);
    if (apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        console.log(`Google Gemini client initialized for provider: ${this.providerId}`);
      } catch (error) {
         console.error(`Failed to initialize Google Gemini client for ${this.providerId}:`, error);
         this.genAI = null;
      }
    } else {
      this.genAI = null;
      console.log(`Google Gemini client destroyed for provider: ${this.providerId}`);
    }
  }

  /**
   * 将通用的消息历史转换为 Google Gemini API 的 Content[] 格式
   * Google API 要求 user/model 交替，且不能连续出现相同角色
   */
  private mapMessagesToGoogleContent(messages: LLMChatOptions['messages']): Content[] {
    const history: Content[] = [];
    let lastRole: 'user' | 'model' | null = null;

    for (const message of messages) {
      // Google 使用 'model' 而不是 'assistant'
      const currentRole = message.role === 'assistant' ? 'model' : message.role;

      // 忽略 system 消息，因为 Google 通过 systemInstruction 参数处理
      if (currentRole === 'system') continue;

      // 确保角色交替，如果连续出现相同角色，则合并内容或进行处理
      // 简单处理：如果当前角色与上一条相同，则将内容附加到上一条的 parts 中
      if (history.length > 0 && currentRole === lastRole) {
         const lastContent = history[history.length - 1];
         // 确保 parts 存在且是数组
         if (!Array.isArray(lastContent.parts)) {
            lastContent.parts = []; // 或者根据情况处理错误
         }
         lastContent.parts.push({ text: message.content });
      } else {
         // 添加新的 Content 条目
         history.push({
           role: currentRole,
           parts: [{ text: message.content }],
         });
         lastRole = currentRole;
      }
    }
    return history;
  }


  /**
   * 实现聊天请求方法 (需要根据 Google Gemini SDK 调整)
   */
  async generateChatCompletion(options: LLMChatOptions): Promise<LLMResponse> {
    if (!this.genAI) {
      return { content: '', error: 'Google API Key 未设置或客户端初始化失败' };
    }
    // 移除此处对模型的检查
    // if (!options.model || !this.getAvailableModels().includes(options.model)) {
    //    return { content: '', error: `模型 ${options.model} 不可用或不受支持` };
    // }

    try {
      const generativeModel = this.genAI.getGenerativeModel({
         model: options.model,
         // --- 处理 System Prompt ---
         // Google Gemini 使用 systemInstruction 参数
         systemInstruction: options.systemPrompt ? { parts: [{ text: options.systemPrompt }], role: 'system' } : undefined, // 确保格式正确
         // --- 安全设置 (可选，建议配置) ---
         safetySettings: [
           { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
           { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
         ],
      });

      // --- 构造 Google API 请求参数 ---
      const history = this.mapMessagesToGoogleContent(options.messages);

      // Google 的 generateContent 通常用于非聊天场景或单轮对话
      // 对于多轮对话，应该使用 startChat 并发送消息
      const chat = generativeModel.startChat({
        history: history,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          // topP, topK 等其他参数
        },
      });

      // 从历史记录中提取最后一条用户消息作为当前轮次的输入
      // 注意：这种方式假设 options.messages 的最后一条一定是用户输入，需要前端保证
      const lastUserMessage = options.messages[options.messages.length - 1]?.content;
      if (!lastUserMessage || options.messages[options.messages.length - 1]?.role !== 'user') {
         // 如果历史为空或最后一条不是 user，直接使用空字符串或报错
         console.warn('[Google] No final user message found in history for chat.sendMessage.');
         // return { content: '', error: '无法找到最后的用户消息以发送给 Google Gemini' };
         // 或者尝试发送一个空消息？这取决于具体需求
      }

      console.log(`[Google] Sending message to model ${options.model}: "${lastUserMessage}" with history:`, JSON.stringify(history, null, 2));

      // 发送最后一条消息（或者整个处理过的历史，取决于 startChat 的行为）
      // 通常 startChat 后，只需发送最新的 user message
      const result = await chat.sendMessage(lastUserMessage ?? ''); // 发送最后的用户消息

      console.log('[Google] Received result:', JSON.stringify(result, null, 2));

      // --- 解析 Google 响应 ---
      const response = result.response;
      const content = response.text(); // 获取文本内容
      // Google API 可能不直接返回 token 计数，或者需要额外调用 countTokens
      // let usageInfo = { promptTokens: undefined, completionTokens: undefined, totalTokens: undefined };
      // try {
      //   const promptTokenCount = await generativeModel.countTokens(history); // 估算历史 token
      //   const completionTokenCount = await generativeModel.countTokens(content); // 估算响应 token
      //   usageInfo = {
      //      promptTokens: promptTokenCount?.totalTokens,
      //      completionTokens: completionTokenCount?.totalTokens,
      //      totalTokens: (promptTokenCount?.totalTokens ?? 0) + (completionTokenCount?.totalTokens ?? 0)
      //   }
      // } catch (countError) {
      //    console.warn('[Google] Failed to count tokens:', countError);
      // }

      // 检查是否有安全阻止等原因导致没有内容
      if (response.promptFeedback?.blockReason) {
         return { content: '', error: `请求被阻止: ${response.promptFeedback.blockReason}`, rawResponse: result };
      }
      if (!content && response.candidates?.[0]?.finishReason !== 'STOP') {
         return { content: '', error: `响应生成中止: ${response.candidates?.[0]?.finishReason}`, rawResponse: result };
      }


      // 不再将原始响应发送回渲染进程
      return {
        content: content,
        modelUsed: options.model,
        // usage: usageInfo, // Token 计数可能不准确或不可用
        // rawResponse: result, // 移除原始响应
      };

    } catch (error: unknown) {
      console.error(`[Google] Error during chat completion for model ${options.model}:`, error);
      let detailedError = '与 Google API 通信时发生未知错误';
      // 尝试解析 Google API 的特定错误结构 (如果 SDK 提供了的话)
      if (error instanceof Error) { // 基础错误检查
        detailedError = error.message;
        // 检查是否有更具体的 Google API 错误信息 (结构可能变化)
        // if (error.cause && typeof error.cause === 'object' && 'message' in error.cause) {
        //    detailedError += ` - ${error.cause.message}`;
        // }
      } else if (typeof error === 'string') {
        detailedError = error;
      }
      // 只返回错误消息字符串
      return { content: '', error: detailedError /* rawResponse: error */ }; // 移除原始错误对象
    }
  }
}