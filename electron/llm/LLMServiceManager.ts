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
    console.log('[LLM 管理器] 初始化（手动注册模式）...');

    // --- 手动注册 OpenAI ---
    try {
      const openAIService = new OpenAILLM();
      if (openAIService.providerId) {
        this.services.set(openAIService.providerId, openAIService);
        console.log(`[LLM 管理器] 手动注册服务商: ${openAIService.providerId} (${openAIService.providerName})`);
      } else {
         console.error('[LLM 管理器] 注册 OpenAI 失败：缺少 providerId。');
      }
    } catch (error) {
       console.error('【LLM 管理器】 实例化 OpenAI 服务时出错：', error);
    }

    // --- 手动注册 Anthropic ---
    try {
      const anthropicService = new AnthropicLLM();
      if (anthropicService.providerId) {
        this.services.set(anthropicService.providerId, anthropicService);
        console.log(`[LLM 管理器] 手动注册服务商: ${anthropicService.providerId} (${anthropicService.providerName})`);
      } else {
         console.error('[LLM 管理器] 注册 Anthropic 失败：缺少 providerId。');
      }
    } catch (error) {
       console.error('【LLM 管理器】 实例化 Anthropic 服务时出错：', error);
    }

    // --- 手动注册 Google ---
    try {
      const googleService = new GoogleLLM();
      if (googleService.providerId) {
        this.services.set(googleService.providerId, googleService);
        console.log(`[LLM 管理器] 手动注册服务商: ${googleService.providerId} (${googleService.providerName})`);
      } else {
         console.error('[LLM 管理器] 注册 Google 失败：缺少 providerId。');
      }
    } catch (error) {
       console.error('【LLM 管理器】 实例化 Google 服务时出错：', error);
    }

    console.log(`[LLM 管理器] 初始化完成。已加载服务商: ${[...this.services.keys()].join(', ')}`);
  }

  /**
   * 获取所有已加载的服务提供商实例。
   * @returns BaseLLM 实例数组
   */
  getAllServices(): BaseLLM[] {
    console.log('[LLM 管理器] getAllServices 被调用。');
    return Array.from(this.services.values());
  }

  /**
   * 根据 providerId 获取特定的服务提供商实例。
   * @param providerId 服务商 ID (例如 'openai')
   * @returns BaseLLM 实例或 undefined
   */
  getService(providerId: string): BaseLLM | undefined {
    const service = this.services.get(providerId.toLowerCase());
    console.log(`[LLM 管理器] getService 被调用，服务商: ${providerId}，是否找到: ${!!service}`);
    return service;
  }

  /**
   * 为指定的服务提供商设置 API Key。
   * @param providerId 服务商 ID
   * @param apiKey API Key
   * @returns 是否成功设置 (找到服务商)
   */
  setApiKeyForService(providerId: string, apiKey: string | null): boolean {
    console.log(`[LLM 管理器] setApiKeyForService 被调用，服务商: ${providerId}`);
    const service = this.getService(providerId);
    if (service) {
      service.setApiKey(apiKey);
      return true;
    }
    console.warn(`[LLM 管理器] 尝试为未知服务商设置 API Key：${providerId}`);
    return false;
  }
}

// 创建并导出一个单例管理器实例
export const llmServiceManager = new LLMServiceManager();

// 注意：需要在主进程启动时调用 llmServiceManager.initialize()
