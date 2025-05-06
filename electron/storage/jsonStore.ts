import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron'; // 导入 app 获取 userData 路径
import { storageLogger as logger } from '../utils/logger'; // 导入日志工具
import { UTF8_OPTIONS } from '../utils/encoding'; // 导入编码工具
import { AIConfig } from '../../src/types'; // 导入 AIConfig 类型
import crypto from 'crypto'; // 用于生成 UUID

// 定义存储目录，使用 userData 目录确保数据持久性
const storageDir = path.join(app.getPath('userData'), 'TheLLMAIImprovTheaterData');
const AI_CONFIG_FILE_NAME = 'aiConfigurations.json'; // AI配置存储文件名
const LEGACY_AI_CONFIG_FILE_NAME = 'legacy_ai_config.json'; // 假设的旧配置文件名，用于迁移

/**
 * 确保存储目录存在，如果不存在则创建。
 */
async function ensureStorageDirExists(): Promise<void> {
  try {
    await fs.access(storageDir);
  } catch (error: unknown) {
    let errorCode: string | undefined;
    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = (error as { code: string }).code;
    }
    if (errorCode === 'ENOENT') {
      try {
        await fs.mkdir(storageDir, { recursive: true });
        logger.info(`存储目录已创建: ${storageDir}`);
      } catch (mkdirError) {
        logger.error(`创建存储目录失败 ${storageDir}:`, mkdirError);
        throw new Error(`创建存储目录失败: ${storageDir}`);
      }
    } else {
      logger.error(`访问存储目录失败 ${storageDir}:`, error);
      throw new Error(`访问存储目录失败: ${storageDir}`);
    }
  }
}

/**
 * 从指定的 JSON 文件读取数据。
 * @param fileName 文件名
 * @param defaultValue 如果文件不存在或为空或解析失败，返回的默认值
 * @returns 解析后的数据或默认值
 */
export async function readStore<T>(fileName: string, defaultValue: T): Promise<T> {
  await ensureStorageDirExists();
  const filePath = path.join(storageDir, fileName);

  try {
    const fileContent = await fs.readFile(filePath, UTF8_OPTIONS);
    if (!fileContent.trim()) { // 检查是否为空或仅包含空白字符
      logger.info(`存储文件 ${fileName} 为空，返回默认值`);
      return defaultValue;
    }
    try {
      return JSON.parse(fileContent) as T;
    } catch (parseError) {
       logger.error(`解析JSON文件失败 ${filePath}:`, parseError);
       return defaultValue;
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      logger.info(`存储文件 ${fileName} 未找到，返回默认值`);
      return defaultValue;
    }
    logger.error(`读取存储文件失败 ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * 将数据写入指定的 JSON 文件。
 * @param fileName 文件名
 * @param data 要写入的数据
 */
export async function writeStore<T>(fileName: string, data: T): Promise<void> {
  await ensureStorageDirExists();
  const filePath = path.join(storageDir, fileName);

  try {
    const fileContent = JSON.stringify(data, null, 2); // 格式化JSON输出
    await fs.writeFile(filePath, fileContent, UTF8_OPTIONS);
    logger.info(`数据已成功写入 ${filePath}`);
  } catch (error: unknown) {
    logger.error(`写入存储文件失败 ${filePath}:`, error);
    const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
    throw new Error(`写入存储文件失败: ${fileName}. 原因: ${message}`);
  }
}

/**
 * 尝试从旧格式迁移AI配置。
 * 这是一个简化的示例，实际迁移可能需要更复杂的逻辑。
 * @returns {Promise<AIConfig[]>} 迁移后的AI配置数组，如果无旧配置或迁移失败则为空数组。
 */
async function migrateLegacyAIConfigs(): Promise<AIConfig[]> {
  logger.info('尝试迁移旧的AI配置...');
  // 假设旧的配置存储在 LEGACY_AI_CONFIG_FILE_NAME 中
  // 并且其结构是 Record<string, { apiKey: string; model?: string; baseURL?: string }>
  // 其中 key 是服务商名称，例如 "google", "openai"
  try {
    const legacyConfigs = await readStore<Record<string, { apiKey: string; model?: string; baseURL?: string }>>(LEGACY_AI_CONFIG_FILE_NAME, {});
    if (Object.keys(legacyConfigs).length === 0) {
      logger.info('未找到旧的AI配置文件或配置为空，无需迁移。');
      return [];
    }

    const migratedConfigs: AIConfig[] = [];
    for (const providerName in legacyConfigs) {
      if (Object.prototype.hasOwnProperty.call(legacyConfigs, providerName)) {
        const oldConfig = legacyConfigs[providerName];
        migratedConfigs.push({
          id: crypto.randomUUID(),
          serviceProvider: providerName,
          apiKey: oldConfig.apiKey,
          name: `默认 ${providerName} Key`, // 给旧配置一个默认名称
          model: oldConfig.model,
          baseURL: oldConfig.baseURL,
          isDefault: true, // 假设迁移过来的第一个key是默认
        });
        logger.info(`已迁移服务商 ${providerName} 的配置。`);
      }
    }

    if (migratedConfigs.length > 0) {
      // 将迁移后的配置写入新的存储文件
      await writeStore(AI_CONFIG_FILE_NAME, migratedConfigs);
      logger.info(`旧AI配置已成功迁移到 ${AI_CONFIG_FILE_NAME}`);
      // 可选：删除或重命名旧的配置文件，防止重复迁移
      // await fs.rename(path.join(storageDir, LEGACY_AI_CONFIG_FILE_NAME), path.join(storageDir, `${LEGACY_AI_CONFIG_FILE_NAME}.migrated`));
    }
    return migratedConfigs;
  } catch (error) {
    logger.error('迁移旧AI配置失败:', error);
    return []; // 迁移失败则返回空数组
  }
}


/**
 * 获取所有AI配置。会先尝试迁移旧配置（如果尚未迁移且存在旧配置）。
 * @returns {Promise<AIConfig[]>} AI配置数组
 */
export async function getAIConfigs(): Promise<AIConfig[]> {
  let configs = await readStore<AIConfig[]>(AI_CONFIG_FILE_NAME, []);
  // 简单检查是否需要迁移：如果新配置文件为空，且旧配置文件存在，则尝试迁移
  if (configs.length === 0) {
      try {
          // 检查旧配置文件是否存在，避免不必要的迁移尝试
          await fs.access(path.join(storageDir, LEGACY_AI_CONFIG_FILE_NAME));
          logger.info(`新的AI配置文件 ${AI_CONFIG_FILE_NAME} 为空，尝试从 ${LEGACY_AI_CONFIG_FILE_NAME} 迁移。`);
          configs = await migrateLegacyAIConfigs();
      } catch (error) {
          // 旧配置文件不存在，属于正常情况
          if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT') {
              logger.info(`旧的AI配置文件 ${LEGACY_AI_CONFIG_FILE_NAME} 未找到，无需迁移。`);
          } else {
              logger.warn(`检查旧AI配置文件 ${LEGACY_AI_CONFIG_FILE_NAME} 时发生错误:`, error);
          }
      }
  }
  return configs;
}

/**
 * 添加一个新的AI配置。
 * @param configData 要添加的配置数据 (除了id，id会自动生成)
 * @returns {Promise<AIConfig>} 创建的完整配置对象
 */
export async function addAIConfig(configData: Omit<AIConfig, 'id'>): Promise<AIConfig> {
  if (!configData.serviceProvider || !configData.apiKey || !configData.name) {
    throw new Error('添加AI配置失败：serviceProvider, apiKey 和 name 不能为空。');
  }
  const configs = await getAIConfigs();
  const newConfig: AIConfig = {
    ...configData,
    id: crypto.randomUUID(), // 自动生成唯一ID
  };
  configs.push(newConfig);
  await writeStore(AI_CONFIG_FILE_NAME, configs);
  logger.info(`已添加新的AI配置: ${newConfig.name} (ID: ${newConfig.id})`);
  return newConfig;
}

/**
 * 根据ID获取单个AI配置。
 * @param id 配置ID
 * @returns {Promise<AIConfig | undefined>} 找到的配置或undefined
 */
export async function getAIConfigById(id: string): Promise<AIConfig | undefined> {
  const configs = await getAIConfigs();
  return configs.find(config => config.id === id);
}

/**
 * 根据ID更新一个AI配置。
 * @param id 要更新的配置ID
 * @param updates 要更新的字段 (Partial, Omit id)
 * @returns {Promise<AIConfig | undefined>} 更新后的配置对象或undefined（如果未找到）
 */
export async function updateAIConfig(id: string, updates: Partial<Omit<AIConfig, 'id'>>): Promise<AIConfig | undefined> {
  const configs = await getAIConfigs();
  const configIndex = configs.findIndex(config => config.id === id);

  if (configIndex === -1) {
    logger.warn(`尝试更新AI配置失败：未找到ID为 ${id} 的配置。`);
    return undefined;
  }

  // 更新配置，确保不修改id
  const updatedConfig = { ...configs[configIndex], ...updates, id };
  configs[configIndex] = updatedConfig;

  await writeStore(AI_CONFIG_FILE_NAME, configs);
  logger.info(`AI配置已更新: ${updatedConfig.name} (ID: ${id})`);
  return updatedConfig;
}

/**
 * 根据ID删除一个AI配置。
 * @param id 要删除的配置ID
 * @returns {Promise<boolean>} 是否删除成功 (true表示成功, false表示未找到)
 */
export async function deleteAIConfig(id: string): Promise<boolean> {
  const configs = await getAIConfigs();
  const initialLength = configs.length;
  const filteredConfigs = configs.filter(config => config.id !== id);

  if (filteredConfigs.length === initialLength) {
    logger.warn(`尝试删除AI配置失败：未找到ID为 ${id} 的配置。`);
    return false; // 未找到，未删除
  }

  await writeStore(AI_CONFIG_FILE_NAME, filteredConfigs);
  logger.info(`AI配置已删除 (ID: ${id})`);
  return true;
}

/**
 * 获取特定服务商下的所有配置。
 * @param serviceProvider 服务商名称
 * @returns {Promise<AIConfig[]>} 该服务商的所有配置数组
 */
export async function getAIConfigsByProvider(serviceProvider: string): Promise<AIConfig[]> {
  const configs = await getAIConfigs();
  return configs.filter(config => config.serviceProvider === serviceProvider);
}

// 可以在这里添加其他存储相关的辅助函数
// 例如：设置某个key为默认，获取某个服务商的默认key等

// 初始化时确保目录存在
ensureStorageDirExists().catch(error => {
  logger.error("初始化存储目录检查失败:", error);
  // 即使这里失败，后续的读写操作也会再次尝试创建目录
});