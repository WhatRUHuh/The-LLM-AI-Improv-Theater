// 移除未使用的 app 和 path 导入
// import { app } from 'electron';
// import path from 'path';
import { BaseLLM } from './BaseLLM';
import { OpenAILLM } from './OpenAI';
import { AnthropicLLM } from './Anthropic'; // <-- 导入 Anthropic
import { GoogleLLM } from './Google';     // <-- 导入 Google

/**
 * 管理所有已发现和实例化的 LLM 服务提供商。
 * (修改为手动注册模式)
 */
class LLMServiceManager {
  private services: Map<string, BaseLLM> = new Map();

  /**
   * 初始化管理器，手动注册已知的服务提供商。
   */
  async initialize(): Promise<void> {
    console.log('[LLM Manager] Initializing (Manual Registration Mode)...');

    // --- 手动注册 OpenAI ---
    try {
      const openAIService = new OpenAILLM();
      if (openAIService.providerId) {
        this.services.set(openAIService.providerId, openAIService);
        console.log(`[LLM Manager] Manually registered provider: ${openAIService.providerId} (${openAIService.providerName})`);
      } else {
         console.error('[LLM Manager] Failed to register OpenAI: Missing providerId.');
      }
    } catch (error) {
       console.error('[LLM Manager] Error instantiating OpenAI service:', error);
    }

    // --- 手动注册 Anthropic ---
    try {
      const anthropicService = new AnthropicLLM();
      if (anthropicService.providerId) {
        this.services.set(anthropicService.providerId, anthropicService);
        console.log(`[LLM Manager] Manually registered provider: ${anthropicService.providerId} (${anthropicService.providerName})`);
      } else {
         console.error('[LLM Manager] Failed to register Anthropic: Missing providerId.');
      }
    } catch (error) {
       console.error('[LLM Manager] Error instantiating Anthropic service:', error);
    }

    // --- 手动注册 Google ---
    try {
      const googleService = new GoogleLLM();
      if (googleService.providerId) {
        this.services.set(googleService.providerId, googleService);
        console.log(`[LLM Manager] Manually registered provider: ${googleService.providerId} (${googleService.providerName})`);
      } else {
         console.error('[LLM Manager] Failed to register Google: Missing providerId.');
      }
    } catch (error) {
       console.error('[LLM Manager] Error instantiating Google service:', error);
    }

    console.log(`[LLM Manager] Initialization complete. Loaded providers: ${[...this.services.keys()].join(', ')}`);
  }

  /**
   * 获取所有已加载的服务提供商实例。
   * @returns BaseLLM 实例数组
   */
  getAllServices(): BaseLLM[] {
    console.log('[LLM Manager] getAllServices called.');
    return Array.from(this.services.values());
  }

  /**
   * 根据 providerId 获取特定的服务提供商实例。
   * @param providerId 服务商 ID (例如 'openai')
   * @returns BaseLLM 实例或 undefined
   */
  getService(providerId: string): BaseLLM | undefined {
    const service = this.services.get(providerId.toLowerCase());
    console.log(`[LLM Manager] getService called for ${providerId}. Found: ${!!service}`);
    return service;
  }

  /**
   * 为指定的服务提供商设置 API Key。
   * @param providerId 服务商 ID
   * @param apiKey API Key
   * @returns 是否成功设置 (找到服务商)
   */
  setApiKeyForService(providerId: string, apiKey: string | null): boolean {
    console.log(`[LLM Manager] setApiKeyForService called for ${providerId}`);
    const service = this.getService(providerId);
    if (service) {
      service.setApiKey(apiKey);
      return true;
    }
    console.warn(`[LLM Manager] Attempted to set API Key for unknown provider: ${providerId}`);
    return false;
  }
}

// 创建并导出一个单例管理器实例
export const llmServiceManager = new LLMServiceManager();

// 注意：需要在主进程启动时调用 llmServiceManager.initialize()