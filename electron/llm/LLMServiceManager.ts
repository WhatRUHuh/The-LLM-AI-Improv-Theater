import { BaseLLM } from './BaseLLM';
import { OpenAILLM } from './OpenAI';
import { AnthropicLLM } from './Anthropic';
import { GoogleLLM } from './Google';
import { getAIConfigById, getAIConfigs } from '../storage/jsonStore'; // 导入 jsonStore 方法
import { AIConfig } from '../../src/types'; // 导入 AIConfig 类型
import { llmLogger as logger } from '../utils/logger'; // 修正日志记录器导入

/**
 * 管理LLM服务实例，基于AIConfig进行动态获取和配置。
 */
export class LLMServiceManager { // <--- 添加 export
  // 使用 configId 作为键缓存服务实例
  private serviceInstances: { [configId: string]: BaseLLM } = {};

  /**
   * 初始化管理器。
   * 当前版本，服务实例按需创建，此方法可用于预加载或其他初始化任务。
   */
  async initialize(): Promise<void> {
    logger.info('[LLM 服务管家] 初始化...');
    // 清空旧的或可能存在的实例，确保每次都是干净的开始（或者根据需求决定是否保留）
    this.serviceInstances = {};
    logger.info('[LLM 服务管家] 初始化完成。服务实例将按需创建。');
  }

  /**
   * 根据 AI 配置ID 获取并配置相应的 LLM 服务实例。
   * @param configId AI 配置的唯一ID
   * @returns 配置好的 BaseLLM 实例，如果找不到配置或配置无效则返回 undefined
   */
  public async getServiceInstanceByConfigId(configId: string): Promise<BaseLLM | undefined> {
    logger.info(`[LLM 服务管家] 尝试获取服务实例，Config ID: ${configId}`);

    // 1. 检查缓存
    if (this.serviceInstances[configId]) {
      logger.info(`[LLM 服务管家] 从缓存中获取到服务实例，Config ID: ${configId}`);
      return this.serviceInstances[configId];
    }

    // 2. 从 jsonStore 获取 AIConfig
    const aiConfig = await getAIConfigById(configId);

    if (!aiConfig) {
      logger.error(`[LLM 服务管家] 未找到 Config ID 为 "${configId}" 的 AI 配置。`);
      return undefined;
    }

    if (!aiConfig.apiKey) {
      logger.error(`[LLM 服务管家] Config ID 为 "${configId}" 的 AI 配置缺少 API Key。`);
      return undefined;
    }

    logger.info(`[LLM 服务管家] 成功获取 AI 配置: ${aiConfig.name} (服务商: ${aiConfig.serviceProvider})`);

    // 3. 根据 serviceProvider 创建和配置服务实例
    let service: BaseLLM | undefined;
    try {
      switch (aiConfig.serviceProvider) {
        case 'openai': {
          // 直接将 aiConfig 传递给构造函数
          service = new OpenAILLM(aiConfig);
          break;
        }
        case 'google': {
          // 直接将 aiConfig 传递给构造函数
          service = new GoogleLLM(aiConfig);
          break;
        }
        case 'anthropic': {
          // 直接将 aiConfig 传递给构造函数
          service = new AnthropicLLM(aiConfig);
          break;
        }
        default:
          logger.error(`[LLM 服务管家] 未知的服务商: ${aiConfig.serviceProvider} (Config ID: ${configId})`);
          return undefined;
      }

      if (service) {
        logger.info(`[LLM 服务管家] 成功创建并配置服务实例: ${aiConfig.name} (Config ID: ${configId})`);
        this.serviceInstances[configId] = service; // 存入缓存
      }
      return service;
    } catch (error) {
      logger.error(`[LLM 服务管家] 创建服务实例 ${aiConfig.name} (Config ID: ${configId}) 时发生错误:`, error);
      return undefined;
    }
  }

  /**
   * 获取指定 AI 配置可用的模型列表。
   * @param configId AI 配置的唯一ID
   * @returns 模型名称数组，如果获取服务实例失败则返回空数组。
   */
  public async getAvailableModels(configId: string): Promise<string[]> {
    logger.info(`[LLM 服务管家] 尝试获取可用模型列表，Config ID: ${configId}`);
    const service = await this.getServiceInstanceByConfigId(configId);
    if (!service) {
      logger.warn(`[LLM 服务管家] 获取可用模型列表失败：无法获取 Config ID 为 "${configId}" 的服务实例。`);
      return [];
    }
    // 假设每个服务实例都有 getAvailableModels 方法
    // 如果 AIConfig 中包含用户自定义模型列表 (例如 aiConfig.customModels)，可以在这里传入
    // return service.getAvailableModels(aiConfig.customModels || []);
    return service.getAvailableModels();
  }

  /**
   * 获取所有已保存的 AI 配置。
   * 用于前端展示所有可用的、已命名的Key配置供用户选择。
   * @returns AIConfig 对象数组
   */
  public async getAllAIConfigs(): Promise<AIConfig[]> {
    logger.info('[LLM 服务管家] 获取所有 AI 配置...');
    try {
      const configs = await getAIConfigs();
      logger.info(`[LLM 服务管家] 成功获取 ${configs.length} 个 AI 配置。`);
      return configs;
    } catch (error) {
      logger.error('[LLM 服务管家] 获取所有 AI 配置失败:', error);
      return [];
    }
  }

  /**
   * 获取支持的服务商列表。
   * @returns 返回一个包含支持的服务商名称的字符串数组。
   *          例如：['google', 'openai', 'anthropic']
   */
  public static getSupportedServiceProviders(): string[] {
    // 目前硬编码支持的服务商列表
    // 未来可以考虑从配置文件或其他地方动态加载
    logger.info('[LLM 服务管家] 获取支持的服务商列表...');
    const providers = ['google', 'openai', 'anthropic'];
    logger.info(`[LLM 服务管家] 支持的服务商: ${providers.join(', ')}`);
    return providers;
  }

  /**
   * @deprecated 此方法已废弃。请使用 getServiceInstanceByConfigId 获取与特定AI配置关联的服务实例。
   * 根据 providerId 获取特定的服务提供商实例。
   */
  public getService(providerId: string): BaseLLM | undefined {
    logger.warn(`[LLM 服务管家] getService(providerId: "${providerId}") 已被废弃。请使用 getServiceInstanceByConfigId。`);
    throw new Error(`方法 getService(providerId) 已废弃。请使用 getServiceInstanceByConfigId。`);
    // return undefined; // 或者直接抛出错误
  }

  /**
   * @deprecated 此方法已废弃。API Key 与 AIConfig 绑定，通过 getServiceInstanceByConfigId 获取的实例已自动配置。
   * 为指定的服务提供商设置 API Key。
   */
  public setApiKeyForService(providerId: string): boolean { // 移除了未使用的 _apiKey 参数
    logger.warn(`[LLM 服务管家] setApiKeyForService(providerId: "${providerId}") 已被废弃。API Key 与 AIConfig 绑定。`);
    throw new Error(`方法 setApiKeyForService(providerId, apiKey) 已废弃。API Key 与 AIConfig 绑定。`);
    // return false; // 或者直接抛出错误
  }
}

// 创建并导出一个单例管理器实例
export const llmServiceManager = new LLMServiceManager();

// 注意：建议在主进程启动时调用 llmServiceManager.initialize() 来执行任何必要的预处理。
