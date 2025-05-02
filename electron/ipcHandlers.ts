import { ipcMain, app, BrowserWindow } from 'electron'; // 合并导入, 添加 BrowserWindow
import fs from 'fs/promises';
import path from 'path';
import { readStore, writeStore } from './storage/jsonStore';
// 导入 StreamChunk 类型定义
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BaseLLM, LLMChatOptions, LLMResponse, StreamChunk } from './llm/BaseLLM';
import { llmServiceManager } from './llm/LLMServiceManager';
import { proxyManager, ProxyConfig } from './ProxyManager';
import { getSystemProxy } from 'os-proxy-config';
// 导入你的角色和剧本类型 (假设在 ../src/types)
import type { AICharacter, Script } from '../src/types';
// 导入聊天快照类型
import type { ChatPageStateSnapshot } from '../src/types';
// 导入日志工具和编码工具
import { ipcLogger as logger } from './utils/logger';
import { UTF8_OPTIONS } from './utils/encoding';

// --- 文件名/目录常量 ---
const API_KEYS_FILE = 'apiKeys.json';
const CUSTOM_MODELS_FILE = 'customModels.json';
const PROXY_CONFIG_FILE = 'proxyConfig.json';
const KNOWN_CONFIG_FILES = new Set([API_KEYS_FILE, CUSTOM_MODELS_FILE, PROXY_CONFIG_FILE]);

const STORAGE_DIR_NAME = 'TheLLMAIImprovTheaterData';
const CHARACTERS_DIR_NAME = 'characters';
const SCRIPTS_DIR_NAME = 'scripts';
const CHATS_DIR_NAME = 'chats'; // <-- 新增聊天记录文件夹名称

// --- 辅助函数 ---
const getStorageDir = () => path.join(app.getPath('userData'), STORAGE_DIR_NAME);
const getCharactersDir = () => path.join(getStorageDir(), CHARACTERS_DIR_NAME);
const getScriptsDir = () => path.join(getStorageDir(), SCRIPTS_DIR_NAME);
const getChatsDir = () => path.join(getStorageDir(), CHATS_DIR_NAME); // <-- 新增获取聊天记录目录函数

// 文件名清理函数不再需要基于 name/title，可以直接用 ID
// function sanitizeFilename(name: string): string { ... }

// 辅助函数：确保 ID 作为文件名是安全的 (虽然 UUID 通常安全，以防万一)
function sanitizeIdForFilename(id: string): string {
    if (!id) return '_invalid_id_';
    // UUID 通常只包含字母、数字和连字符，但还是替换掉潜在的路径分隔符等
    const cleanedId = id.replace(/[<>:"/\\|?*]/g, '_');
    return `${cleanedId}.json`;
}


// 确保目录存在的辅助函数
async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
    logger.info(`目录已存在: ${dirPath}`);
  } catch (error) { // 使用 unknown 或更具体的类型检查
    // 检查错误是否是包含 code 属性的对象
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      logger.info(`目录未找到，正在创建: ${dirPath}`);
      await fs.mkdir(dirPath, { recursive: true });
      logger.info(`目录已创建: ${dirPath}`);
    } else {
      logger.error(`访问/创建目录时出错 ${dirPath}:`, error);
      throw error;
    }
  }
}


// --- 类型定义 ---
type CustomModelsStore = Record<string, string[]>;

/**
 * 注册与通用数据存储相关的 IPC 处理程序 (主要用于配置文件和读取聊天记录)。
 */
export function registerStoreHandlers(): void {
  // 处理读取存储请求 (可读取根目录和 chats 目录)
  ipcMain.handle('read-store', async (event, relativePath: string, defaultValue: unknown) => {
    console.log(`[IPC 处理器] 收到 'read-store' 请求，路径: ${relativePath}`);
    // 安全检查：阻止通过此接口读取角色/剧本目录下的文件
    const requestedPath = path.join(getStorageDir(), relativePath);
    const charactersDir = getCharactersDir();
    const scriptsDir = getScriptsDir();
    if (requestedPath.startsWith(charactersDir) || requestedPath.startsWith(scriptsDir)) {
        console.error(`[IPC 处理器] 尝试通过 read-store 读取受限目录: ${relativePath}`);
        return { success: false, error: '不允许通过此接口访问角色或剧本文件' };
    }
    // 允许读取 chats 目录下的文件
    const chatsDir = getChatsDir();
    if (!requestedPath.startsWith(getStorageDir()) || requestedPath.startsWith(chatsDir)) {
        // 如果路径不在存储根目录下，或者在 chats 目录下，则允许读取
        // (注意: readStore 内部会处理路径拼接，所以这里传相对路径即可)
    } else if (KNOWN_CONFIG_FILES.has(path.basename(relativePath))) {
        // 如果是根目录下的已知配置文件，也允许读取
    } else {
        // 其他情况（如尝试读取根目录下非配置的未知文件）则阻止
        console.error(`[IPC 处理器] 尝试通过 read-store 读取可能不安全的路径: ${relativePath}`);
        return { success: false, error: '不允许读取此路径的文件' };
    }

    try {
      // readStore 现在需要能处理相对于 storageDir 的路径，包括子目录
      const data = await readStore(relativePath, defaultValue);
      console.log(`[IPC 处理器] 成功读取 'read-store' 路径: ${relativePath}`);
      return { success: true, data };
    } catch (error: unknown) {
      console.error(`[IPC 处理器] 处理 'read-store' 请求 ${relativePath} 时发生错误:`, error);
      const message = error instanceof Error ? error.message : '读取存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 处理写入存储请求 (仅限根目录的配置文件)
  ipcMain.handle('write-store', async (event, fileName: string, data: unknown) => {
    console.log(`[IPC 处理器] 收到 'write-store' 请求，文件名: ${fileName}`);
     // 安全检查：只允许写入根目录下的已知配置文件
     const requestedPath = path.join(getStorageDir(), fileName);
     const charactersDir = getCharactersDir();
     const scriptsDir = getScriptsDir();
     const chatsDir = getChatsDir();

     if (requestedPath.startsWith(charactersDir) || requestedPath.startsWith(scriptsDir) || requestedPath.startsWith(chatsDir)) {
         console.error(`[IPC 处理器] 试图通过 write-store 写入受限目录: ${fileName}`);
         return { success: false, error: '不允许通过此接口写入角色、剧本或聊天记录文件' };
     }
     if (!KNOWN_CONFIG_FILES.has(fileName)) {
         console.error(`[IPC 处理器] 试图通过 write-store 写入未知文件: ${fileName}`);
         return { success: false, error: '只允许通过此接口写入已知配置文件' };
     }

     console.log(`[IPC 处理器] 要写入 ${fileName} 的数据:`, JSON.stringify(data).substring(0, 200) + '...'); // Log truncated data

    try {
      await writeStore(fileName, data); // writeStore 内部会处理路径拼接和目录创建
      console.log(`[IPC 处理器] 成功写入文件: ${fileName}`);
      return { success: true };
    } catch (error: unknown) {
      console.error(`[IPC 处理器] 处理 'write-store' 请求 ${fileName} 时发生错误:`, error);
      const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
      return { success: false, error: message };
    }
  });


  // 处理列出聊天会话文件请求 (读取 chats 目录)
  ipcMain.handle('list-chat-sessions', async () => {
    console.log(`[IPC 处理器] 收到 'list-chat-sessions' 请求`);
    const chatsDir = getChatsDir(); // <-- 改为读取 chats 目录
    console.log(`[IPC 处理器] 列出会话文件，目录: ${chatsDir}`);
    try {
      await ensureDirExists(chatsDir); // <-- 确保 chats 目录存在
      const files = await fs.readdir(chatsDir);
      // 只返回 .json 文件
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      console.log('[IPC 处理器] 在聊天目录中找到会话文件:', sessionFiles);
      return { success: true, data: sessionFiles };
    } catch (error: unknown) {
      console.error('[IPC 处理器] 处理 "list-chat-sessions" 时发生错误:', error);
      // 如果目录不存在，也返回空列表
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          console.log('[IPC 处理器] 聊天目录不存在，返回空列表。');
          return { success: true, data: [] };
      }
      const message = error instanceof Error ? error.message : '列出聊天记录时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 处理删除聊天会话文件请求 (在 chats 目录操作)
  ipcMain.handle('delete-chat-session', async (event, fileName: string) => {
    console.log(`[IPC 处理器] 收到 'delete-chat-session' 请求，文件名: ${fileName}`);
    // 安全校验：确保文件名是合法的，并且只包含字母、数字、连字符和点
    // 注意：这里允许 .json 后缀
    if (!fileName || !/^[a-zA-Z0-9\-.]+\.json$/.test(fileName) || fileName === '.' || fileName === '..') {
        console.error(`[IPC 处理器] 无效或潜在不安全的文件名，用于删除: ${fileName}`);
        return { success: false, error: '无效的文件名' };
    }
     // 安全检查：确保不会尝试删除 chats 目录之外的文件 (虽然正则已经限制，双重保险)
     if (fileName.includes('/') || fileName.includes('\\')) {
        console.error(`[IPC 处理器] 尝试删除潜在不安全路径: ${fileName}`);
        return { success: false, error: '无效的文件路径' };
     }

    const chatsDir = getChatsDir(); // <-- 改为 chats 目录
    const filePath = path.join(chatsDir, fileName); // <-- 拼接 chats 目录路径
    console.log(`[IPC 处理器] 正在删除聊天会话文件: ${filePath}`);

    try {
      await fs.unlink(filePath); // 删除文件
      console.log(`[IPC 处理器] 成功删除文件: ${filePath}`);
      return { success: true };
    } catch (error: unknown) {
      console.error(`[IPC 处理器] 处理 'delete-chat-session' 请求 ${fileName} 时发生错误:`, error);
      // 如果文件不存在，也算成功（幂等性）
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          console.log(`[IPC 处理器] 文件 ${fileName} 未找到，删除视为成功。`);
          return { success: true };
      }
      const message = error instanceof Error ? error.message : '删除聊天记录时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('已注册通用存储 IPC 处理程序（read-store, write-store, list/delete-chat-sessions）。');
}


/**
 * 注册与聊天会话存储相关的 IPC 处理程序 (仅包含保存)
 */
export function registerChatSessionHandlers(): void {
  const chatsDir = getChatsDir();

  // 保存聊天会话 (新增)
  // 参数: sessionId (不含 .json), data (ChatPageStateSnapshot)
  ipcMain.handle('save-chat-session', async (event, sessionId: string, data: ChatPageStateSnapshot) => { // <-- 添加 data 类型
    console.log(`[IPC 处理器] 收到 'save-chat-session' 请求，会话 ID: ${sessionId}`);
    // 安全校验：确保 sessionId 是合法的，并且只包含字母、数字、连字符
    // 移除非必要的转义符
    if (!sessionId || !/^[a-zA-Z0-9-]+$/.test(sessionId)) {
        console.error(`[IPC 处理器] 无效或潜在不安全的会话 ID，用于保存: ${sessionId}`);
        return { success: false, error: '无效的会话 ID' };
    }
    // 校验传入的数据是否包含 mode (虽然 TS 会检查，但运行时也校验一下)
    if (!data || !data.chatConfig || !data.chatConfig.mode) {
        console.error(`[IPC 处理器] 保存会话 ${sessionId} 的数据无效: 缺少 mode。`);
        return { success: false, error: '保存的数据缺少聊天模式信息' };
    }

    const fileName = `${sessionId}.json`;
    const filePath = path.join(chatsDir, fileName);
    console.log(`[IPC 处理器] 正在保存聊天会话到: ${filePath}`);
    console.log(`[IPC 处理器] 要保存 ${fileName} 的数据:`, JSON.stringify(data).substring(0, 200) + '...');

    try {
      await ensureDirExists(chatsDir); // 确保目录存在
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), UTF8_OPTIONS); // 使用格式化写入和UTF-8编码
      logger.info(`聊天会话 ${fileName} 已成功保存.`);
      return { success: true };
    } catch (error: unknown) {
      logger.error(`保存聊天会话时出错 ${sessionId}:`, error);
      const message = error instanceof Error ? error.message : '保存聊天会话时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('已注册聊天会话 IPC 处理程序 (save-chat-session)。');
}

/**
 * 注册与角色数据相关的 IPC 处理程序
 */
export function registerCharacterHandlers(): void {
  const charactersDir = getCharactersDir();

  // 列出所有角色
  ipcMain.handle('list-characters', async () => {
    console.log('[IPC 处理器] 收到 list-characters 请求');
    try {
      await ensureDirExists(charactersDir); // 确保目录存在
      const files = await fs.readdir(charactersDir);
      const characterFiles = files.filter(file => file.endsWith('.json'));
      console.log('[IPC 处理器] 找到角色文件:', characterFiles);

      const characters: AICharacter[] = [];
      for (const file of characterFiles) {
        const filePath = path.join(charactersDir, file);
        try {
          const content = await fs.readFile(filePath, UTF8_OPTIONS);
          const character = JSON.parse(content) as AICharacter;
          // 这里可以添加校验逻辑，确保解析出的对象符合 AICharacter 结构
          if (character && character.id && character.name) {
             characters.push(character);
          } else {
             logger.warn(`跳过无效的角色文件: ${file}`);
          }
        } catch (readError) {
          logger.error(`读取或解析角色文件时出错 ${file}:`, readError);
          // 可以选择跳过这个文件或返回错误
        }
      }
      console.log(`[IPC 处理器] 成功列出 ${characters.length} 个角色。`);
      return { success: true, data: characters };
    } catch (error: unknown) {
      console.error('[IPC 处理器] 处理 list-characters 请求时发生错误:', error);
      // 如果目录不存在，也返回空列表
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          console.log('[IPC 处理器] 角色目录不存在，返回空列表。');
          return { success: true, data: [] };
      }
      const message = error instanceof Error ? error.message : '列出角色时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 保存角色 (新增或更新)
  ipcMain.handle('save-character', async (event, character: AICharacter) => {
    console.log(`[IPC 处理器] 收到 save-character 请求，角色: ${character?.name} (ID: ${character?.id})`);
    if (!character || !character.id || !character.name) {
      return { success: false, error: '无效的角色数据' };
    }

    // 使用 ID 生成文件名
    const fileName = sanitizeIdForFilename(character.id);
    const filePath = path.join(charactersDir, fileName);
    console.log(`[IPC 处理器] 正在保存角色 ${character.name} (ID: ${character.id}) 到: ${filePath}`);

    try {
      await ensureDirExists(charactersDir); // 确保目录存在

      // 注意：这里没有处理旧文件名删除逻辑。如果角色改名，旧文件会残留。
      // 解决方案：
      // 1. 前端在调用 save 时，如果知道是改名，先调用 delete 删除旧名字的文件。
      // 2. 后端维护一个 ID -> 文件名的映射 (复杂)。
      // 3. 放弃使用名字做文件名，改用 ID (最简单可靠，但违背用户要求)。
      // 暂时采用覆盖逻辑，接受改名后旧文件残留的问题。

      await fs.writeFile(filePath, JSON.stringify(character, null, 2), UTF8_OPTIONS);
      logger.info(`角色 ${character.name} 已成功保存到 ${fileName}.`);
      return { success: true };
    } catch (error: unknown) {
      logger.error(`保存角色时出错 ${character.name}:`, error);
      const message = error instanceof Error ? error.message : '保存角色时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 删除角色 - 按 ID 删除
  ipcMain.handle('delete-character', async (event, characterId: string) => { // <-- 参数改为 characterId
    console.log(`[IPC 处理器] 收到 delete-character 请求，角色 ID: ${characterId}`);
    if (!characterId) {
      return { success: false, error: '未提供要删除的角色 ID' };
    }

    // 使用 ID 生成文件名
    const fileName = sanitizeIdForFilename(characterId);
    const filePath = path.join(charactersDir, fileName);
    console.log(`[IPC 处理器] 正在删除角色文件: ${filePath}`);

    try {
      await ensureDirExists(charactersDir);
      await fs.unlink(filePath);
      console.log(`[IPC 处理器] 角色文件 ${fileName} 删除成功。`);
      return { success: true };
    } catch (error: unknown) {
       // 如果文件不存在，也算成功（幂等性）
       if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
           console.log(`[IPC 处理器] 角色文件 ${fileName} 未找到，删除视为成功。`);
           return { success: true };
       }
      console.error(`[IPC 处理器] 处理 delete-character 请求 ${characterId} 时发生错误:`, error);
      const message = error instanceof Error ? error.message : '删除角色时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('已注册角色 IPC 处理程序。');
}

/**
 * 注册与剧本数据相关的 IPC 处理程序
 */
export function registerScriptHandlers(): void {
  const scriptsDir = getScriptsDir();

  // 列出所有剧本
  ipcMain.handle('list-scripts', async () => {
    console.log('[IPC 处理器] 收到 list-scripts 请求');
    try {
      await ensureDirExists(scriptsDir); // 确保目录存在
      const files = await fs.readdir(scriptsDir);
      const scriptFiles = files.filter(file => file.endsWith('.json'));
      console.log('[IPC 处理器] 找到剧本文件:', scriptFiles);

      const scripts: Script[] = [];
      for (const file of scriptFiles) {
        const filePath = path.join(scriptsDir, file);
        try {
          const content = await fs.readFile(filePath, UTF8_OPTIONS);
          const script = JSON.parse(content) as Script;
          // 这里可以添加校验逻辑，确保解析出的对象符合 Script 结构
          if (script && script.id && script.title) {
             scripts.push(script);
          } else {
             logger.warn(`跳过无效的剧本文件: ${file}`);
          }
        } catch (readError) {
          logger.error(`读取或解析剧本文件时出错 ${file}:`, readError);
        }
      }
      console.log(`[IPC 处理器] 成功列出 ${scripts.length} 个剧本。`);
      return { success: true, data: scripts };
    } catch (error: unknown) {
      console.error('[IPC 处理器] 处理 list-scripts 请求时发生错误:', error);
       // 如果目录不存在，也返回空列表
       if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
           console.log('[IPC 处理器] 剧本目录不存在，返回空列表。');
           return { success: true, data: [] };
       }
      const message = error instanceof Error ? error.message : '列出剧本时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 保存剧本 (新增或更新)
  ipcMain.handle('save-script', async (event, script: Script) => {
    console.log(`[IPC 处理器] 收到 save-script 请求，剧本: ${script?.title} (ID: ${script?.id})`);
    if (!script || !script.id || !script.title) {
      return { success: false, error: '无效的剧本数据' };
    }

    // 使用 ID 生成文件名
    const fileName = sanitizeIdForFilename(script.id);
    const filePath = path.join(scriptsDir, fileName);
    console.log(`[IPC 处理器] 正在保存剧本 ${script.title} (ID: ${script.id}) 到: ${filePath}`);

    try {
      await ensureDirExists(scriptsDir); // 确保目录存在

      // 同样存在改名后旧文件残留的问题
      await fs.writeFile(filePath, JSON.stringify(script, null, 2), UTF8_OPTIONS);
      logger.info(`剧本 ${script.title} 已成功保存到 ${fileName}.`);
      return { success: true };
    } catch (error: unknown) {
      logger.error(`保存剧本时出错 ${script.title}:`, error);
      const message = error instanceof Error ? error.message : '保存剧本时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 删除剧本 - 按 ID 删除
  ipcMain.handle('delete-script', async (event, scriptId: string) => { // <-- 参数改为 scriptId
    console.log(`[IPC 处理器] 收到 delete-script 请求，剧本 ID: ${scriptId}`);
     if (!scriptId) {
      return { success: false, error: '未提供要删除的剧本 ID' };
    }

    // 使用 ID 生成文件名
    const fileName = sanitizeIdForFilename(scriptId);
    const filePath = path.join(scriptsDir, fileName);
    console.log(`[IPC 处理器] 正在删除剧本文件: ${filePath}`);

    try {
      await ensureDirExists(scriptsDir);
      await fs.unlink(filePath);
      console.log(`[IPC 处理器] 剧本文件 ${fileName} 删除成功。`);
      return { success: true };
    } catch (error: unknown) {
       // 如果文件不存在，也算成功（幂等性）
       if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
           console.log(`[IPC 处理器] 剧本文件 ${fileName} 未找到，删除视为成功。`);
           return { success: true };
       }
      console.error(`[IPC 处理器] 处理 delete-script 请求 ${scriptId} 时发生错误:`, error);
      const message = error instanceof Error ? error.message : '删除剧本时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('已注册剧本 IPC 处理程序。');
}

/**
 * 注册与 LLM 服务相关的 IPC 处理程序
 * @param getMainWindow Function to get the main browser window instance
 */
export function registerLLMServiceHandlers(getMainWindow: () => BrowserWindow | null): void { // <-- 接收一个获取主窗口的函数
  // 获取所有服务商信息
  ipcMain.handle('llm-get-services', async () => {
    console.log('[IPC 主进程] 收到 llm-get-services 请求');
    try {
      const services = llmServiceManager.getAllServices().map(service => ({
        providerId: service.providerId,
        providerName: service.providerName,
        defaultModels: service.defaultModels,
      }));
      return { success: true, data: services };
    } catch (error: unknown) {
      console.error('[IPC 主进程] 处理 llm-get-services 时发生错误:', error);
      const message = error instanceof Error ? error.message : '获取 LLM 服务列表时出错';
      return { success: false, error: message };
    }
  });

  // 设置 API Key
  ipcMain.handle('llm-set-api-key', async (event, providerId: string, apiKey: string | null) => {
     console.log(`[IPC 主进程] 收到 llm-set-api-key 请求，服务商: ${providerId}`);
     try {
       const managerSuccess = llmServiceManager.setApiKeyForService(providerId, apiKey);
       if (!managerSuccess) {
         return { success: false, error: `未找到服务商: ${providerId}` };
       }
       const currentKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
       if (apiKey && apiKey.trim() !== '') {
         currentKeys[providerId] = apiKey;
       } else {
         delete currentKeys[providerId];
       }
       await writeStore(API_KEYS_FILE, currentKeys);
       console.log(`[IPC 主进程] API 密钥 ${providerId} 设置并持久化成功。`);
       return { success: true };
     } catch (error: unknown) {
       console.error(`[IPC 主进程] 处理 llm-set-api-key 请求 ${providerId} 时发生错误:`, error);
       const message = error instanceof Error ? error.message : '设置并保存 API Key 时出错';
       return { success: false, error: message };
     }
  });

  // 获取已保存的 API Keys
  ipcMain.handle('llm-get-saved-keys', async () => {
    console.log('[IPC 主进程] 收到 llm-get-saved-keys 请求');
    try {
      const savedKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
      return { success: true, data: savedKeys };
    } catch (error: unknown) {
      console.error('[IPC 主进程] 处理 llm-get-saved-keys 请求时发生错误:', error);
      const message = error instanceof Error ? error.message : '读取已保存的 API Keys 时出错';
      return { success: false, error: message };
    }
  });

   // 获取可用模型
   ipcMain.handle('llm-get-available-models', async (event, providerId: string) => {
     console.log(`[IPC 主进程] 收到 llm-get-available-models 请求，服务商: ${providerId}`);
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     try {
       const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
       const customModels = allCustomModels[providerId] || [];
       const availableModels = service.getAvailableModels(customModels);
       return { success: true, data: availableModels };
     } catch (error: unknown) {
       console.error(`[IPC 主进程] 处理 llm-get-available-models 请求 ${providerId} 时发生错误:`, error);
       const message = error instanceof Error ? error.message : '获取可用模型时出错';
       return { success: false, error: message };
     }
   });

   // 处理聊天生成请求 (非流式)
   ipcMain.handle('llm-generate-chat', async (event, providerId: string, options: LLMChatOptions): Promise<{ success: boolean; data?: LLMResponse; error?: string }> => {
     console.log(`[IPC 主进程] 收到 llm-generate-chat 请求，服务商: ${providerId}`);
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     if (!service.getApiKey()) {
        return { success: false, error: `服务商 ${providerId} 的 API Key 尚未设置` };
     }
     try {
       // 确保 options 中 stream 为 false 或未定义
       options.stream = false;
       const result: LLMResponse = await service.generateChatCompletion(options);
       console.log(`[IPC 主进程] 聊天完成结果 ${providerId}:`, result.error ? result.error : '成功');
       if (result.error) {
          return { success: false, error: result.error, data: result };
       }
       return { success: true, data: result };
     } catch (error: unknown) {
       console.error(`[IPC 主进程] 处理 llm-generate-chat 请求 ${providerId} 时发生错误:`, error);
       const message = error instanceof Error ? error.message : '调用聊天生成时发生未知错误';
       return { success: false, error: message };
     }
   });

   // --- 新增：处理流式聊天生成请求 ---
   // --- 新增：处理流式聊天生成请求 (加入 sourceId/characterId) ---
   // IMPORTANT: The third argument `characterId` is ADDED here. Frontend needs to pass it!
   ipcMain.handle('llm-generate-chat-stream', async (event, providerId: string, options: LLMChatOptions, characterId?: string): Promise<{ success: boolean; error?: string }> => {
     console.log(`[IPC 主进程] 收到 llm-generate-chat-stream 请求，服务商: ${providerId}, 角色ID: ${characterId ?? '未提供'}`);
     const mainWindow = getMainWindow(); // 获取主窗口实例
     if (!mainWindow) {
       console.error('[IPC 主进程] 主窗口不可用，无法发送流式数据。');
       return { success: false, error: '无法发送流式数据：主窗口不存在。' };
     }
     const webContents = mainWindow.webContents; // 获取 webContents

     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     if (!service.getApiKey()) {
       return { success: false, error: `服务商 ${providerId} 的 API Key 尚未设置` };
     }

     // 确保 options 中 stream 为 true
     options.stream = true;

     try {
       console.log(`[IPC 主进程] 开始为 ${providerId} 启动流式输出...`);
       // 假设 generateChatCompletionStream 返回 AsyncGenerator<StreamChunk>
       // 检查 service 是否有 generateChatCompletionStream 方法
       if (typeof service.generateChatCompletionStream !== 'function') {
           console.error(`[IPC 主进程] 服务商 ${providerId} 不支持流式输出。`);
           return { success: false, error: `服务商 ${providerId} 不支持流式输出。` };
       }
       const stream = service.generateChatCompletionStream(options);
       for await (const chunk of stream) {
         // console.log('[IPC Main] Sending stream chunk:', chunk); // 调试时可以取消注释
         if (webContents.isDestroyed()) {
            console.warn('[IPC 主进程] WebContents 已销毁，停止发送流式数据。');
            // 可能需要通知 LLM 服务停止生成 (如果支持)
            break;
         }
         // 打包 chunk 和 sourceId (characterId) 一起发送
         webContents.send('llm-stream-chunk', { chunk, sourceId: characterId });
       }
       console.log(`[IPC 主进程] ${providerId} 的流式输出已完成。`);
       // 发送完成信号 (即使 stream 实现内部已发送 done:true，这里再发一次确保)
       if (!webContents.isDestroyed()) {
           // 发送完成信号，也带上 sourceId，方便前端识别是哪个流结束了
           webContents.send('llm-stream-chunk', { chunk: { done: true }, sourceId: characterId });
       }
       return { success: true }; // 表示启动流式请求成功

     } catch (error: unknown) {
       console.error(`[IPC 主进程] 处理 llm-generate-chat-stream 请求 ${providerId} 时发生错误:`, error);
       const message = error instanceof Error ? error.message : '调用流式聊天生成时发生未知错误';
       // 发送错误信号给前端
       if (!webContents.isDestroyed()) {
           // 发送错误信号，也带上 sourceId
           webContents.send('llm-stream-chunk', { chunk: { error: message, done: true }, sourceId: characterId });
       }
       return { success: false, error: message }; // 表示启动流式请求失败
     }
   });

   // 获取自定义模型列表
   ipcMain.handle('llm-get-custom-models', async (event, providerId: string): Promise<{ success: boolean; data?: string[]; error?: string }> => {
      console.log(`[IPC 主进程] 收到 llm-get-custom-models 请求，服务商: ${providerId}`);
      try {
        const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
        const customModels = allCustomModels[providerId] || [];
        return { success: true, data: customModels };
      } catch (error: unknown) {
        console.error(`[IPC 主进程] 处理 llm-get-custom-models 请求 ${providerId} 时发生错误:`, error);
        const message = error instanceof Error ? error.message : '读取自定义模型列表时出错';
        return { success: false, error: message };
      }
   });

   // 保存自定义模型列表
   ipcMain.handle('llm-save-custom-models', async (event, providerId: string, models: string[]): Promise<{ success: boolean; error?: string }> => {
      console.log(`[IPC 主进程] 收到 llm-save-custom-models 请求，服务商: ${providerId}，模型列表:`, models);
      try {
        const allCustomModels = await readStore<CustomModelsStore>(CUSTOM_MODELS_FILE, {});
        allCustomModels[providerId] = models;
        await writeStore(CUSTOM_MODELS_FILE, allCustomModels);
        console.log(`[IPC 主进程] 自定义模型列表 ${providerId} 保存成功。`);
        return { success: true };
      } catch (error: unknown) {
        console.error(`[IPC 主进程] 处理 llm-save-custom-models 请求 ${providerId} 时发生错误:`, error);
        const message = error instanceof Error ? error.message : '保存自定义模型列表时出错';
        return { success: false, error: message };
      }
   });

  console.log('已注册 LLM 服务相关 IPC 处理程序。');
}

/**
 * 注册与代理设置相关的 IPC 处理程序
 */
export function registerProxyHandlers(): void {
  // 设置代理
  ipcMain.handle('proxy-set-config', async (event, incomingConfig: ProxyConfig) => {
    console.log(`[IPC 主进程] 收到 proxy-set-config 请求，配置:`, incomingConfig);
    try {
      // 1. 读取当前保存的配置以保留旧的 customProxyUrl
      const savedConfig = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      console.log('[IPC 主进程] 当前保存的配置:', savedConfig);

      // 2. 准备传递给 ProxyManager 的配置 (反映用户当前意图)
      const configForManager: ProxyConfig = { ...incomingConfig };

      // 3. 准备要保存到文件的配置 (持久化 customProxyUrl)
      const configToSave: ProxyConfig = {
        mode: incomingConfig.mode,
        url: undefined, // 活动 URL 取决于模式
        customProxyUrl: savedConfig.customProxyUrl // 默认保留旧的自定义 URL
      };

      if (incomingConfig.mode === 'custom') {
        if (incomingConfig.url) {
          // 使用传入的 URL 作为活动 URL 和新的持久化自定义 URL
          configToSave.url = incomingConfig.url;
          configToSave.customProxyUrl = incomingConfig.url;
          configForManager.url = incomingConfig.url; // 确保 Manager 获得 URL
        } else {
          // 如果自定义模式未提供 URL，则尝试使用已保存的
          console.warn('[IPC 主进程] 选择了自定义代理模式但未提供 URL，尝试使用已保存的 customProxyUrl。');
          configToSave.url = savedConfig.customProxyUrl; // 使用已保存的作为活动 URL
          configForManager.url = savedConfig.customProxyUrl; // 告知 Manager 使用已保存的
          // configToSave.customProxyUrl 保持不变 (savedConfig.customProxyUrl)
        }
      } else if (incomingConfig.mode === 'system') {
        // 系统模式下，活动 URL 由 Manager 确定，不在此处保存特定 URL
        configToSave.url = undefined;
        configForManager.url = undefined; // Manager 不需要 URL 来设置系统代理
      } else { // mode === 'none'
        configToSave.url = undefined; // 无活动 URL
        configForManager.url = undefined;
      }

      // 4. 使用反映用户意图的配置来配置 ProxyManager
      await proxyManager.configureProxy(configForManager);
      console.log(`[IPC 主进程] 已使用以下配置配置 ProxyManager:`, configForManager);
      // 注意: 如果模式是 'system', proxyManager 内部可能会在检测到系统代理后更新自己的 'url'。
      // 保存的 'url' 字段可能不反映 *实际* 的系统代理 URL，但这没关系。
      // 主要目标是正确保存模式和 customProxyUrl。

      // 5. 将最终的配置状态保存到文件
      await writeStore(PROXY_CONFIG_FILE, configToSave);
      console.log(`[IPC 主进程] 代理配置已保存到 ${PROXY_CONFIG_FILE}:`, configToSave);

      return { success: true };
    } catch (error: unknown) {
      console.error('[IPC 主进程] 处理 proxy-set-config 请求时发生错误:', error);
      const message = error instanceof Error ? error.message : '设置代理时出错';
      return { success: false, error: message };
    }
  });

  // 获取当前代理配置
  ipcMain.handle('proxy-get-config', async () => {
    console.log('[IPC 主进程] 收到 proxy-get-config 请求');
    try {
      const config = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      return { success: true, data: config };
    } catch (error: unknown) {
      console.error('[IPC 主进程] 处理 proxy-get-config 请求时发生错误:', error);
      const message = error instanceof Error ? error.message : '获取代理配置时出错';
      return { success: false, error: message };
    }
  });

  // 测试代理连接
  ipcMain.handle('proxy-test-connection', async () => {
    console.log('[IPC 主进程] 收到 proxy-test-connection 请求');
    try {
      // 测试被墙网站可访问性
      const blockedSiteTestUrls = [
        'https://www.google.com/',
        'https://www.youtube.com/',
        'https://www.wikipedia.org/'
      ];

      // 获取IP的服务
      const ipTestUrls = [
        'https://api.ipify.org?format=json',
        'https://ifconfig.me/ip',
        'https://icanhazip.com'
      ];

      let googleAccessible = false;
      let googleError = '';
      let ip = '';

      // 获取当前系统代理信息并输出
      try {
        console.log('[IPC 主进程] 尝试获取系统代理信息...');
        const systemProxyInfo = await getSystemProxy();
        console.log('[IPC 主进程] 当前系统代理信息:', systemProxyInfo);

        // (已移除直接查询注册表的部分，以 ProxyManager/os-proxy-config 为准)
      } catch (err) {
        console.error('[IPC 主进程] 通过 getSystemProxy() 获取系统代理信息时出错:', err);
      }

      // 输出当前由 ProxyManager 设置的环境变量 (这才是应用实际使用的)
      console.log('[IPC 主进程] 当前代理环境变量 (由 ProxyManager 设置):');
      console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || '未设置'}`);
      console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || '未设置'}`);
      console.log(`http_proxy: ${process.env.http_proxy || '未设置'}`);
      console.log(`https_proxy: ${process.env.https_proxy || '未设置'}`);

      // 首先测试被墙网站可访问性
      for (const url of blockedSiteTestUrls) {
        try {
          console.log(`[IPC 主进程] 使用 ${url} 测试被屏蔽网站的可访问性`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

          // 添加更多请求选项
          const response = await fetch(url, {
            signal: controller.signal,
            method: 'HEAD', // 只请求头部，减少数据传输
            redirect: 'follow', // 跟随重定向
            cache: 'no-store', // 不使用缓存
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });

          clearTimeout(timeoutId);

          console.log(`[IPC 主进程] 来自 ${url} 的响应:`, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });

          if (response.ok || response.status === 204) {
            googleAccessible = true;
            console.log(`[IPC 主进程] 已通过 ${url} 成功访问被屏蔽网站`);
            break;
          }
        } catch (err) {
          console.error(`[IPC 主进程] 使用 ${url} 测试被屏蔽网站时出错:`, err);
          googleError = err instanceof Error ? err.message : String(err);
          // 继续尝试下一个URL
        }
      }

      // 然后尝试获取IP地址
      for (const url of ipTestUrls) {
        try {
          console.log(`[IPC 主进程] 使用 ${url} 获取 IP 地址`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

          const response = await fetch(url, {
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // 根据不同的服务处理响应
          if (url.includes('ipify')) {
            const data = await response.json();
            ip = data.ip;
          } else {
            ip = await response.text();
          }

          // 如果成功获取IP，跳出循环
          if (ip) {
            break;
          }
        } catch (err) {
          console.error(`[IPC 主进程] 使用 ${url} 获取 IP 时出错:`, err);
          // 继续尝试下一个URL
        }
      }

      // 获取当前代理配置
      const currentConfig = await readStore<ProxyConfig>(PROXY_CONFIG_FILE, { mode: 'none' });
      const proxyUrl = proxyManager.getProxyUrl() || '无';

      // 判断测试结果
      if (!googleAccessible) {
        return {
          success: false,
          error: `无法访问谷歌、YouTube或维基百科，代理可能未正确配置。错误: ${googleError}`,
          data: {
            ip: ip || '未知',
            proxyUrl,
            proxyMode: currentConfig.mode,
            googleAccessible: false,
            testedSites: blockedSiteTestUrls.join(', ')
          }
        };
      }

      return {
        success: true,
        data: {
          ip: ip ? ip.trim() : '未能获取IP地址',
          proxyUrl,
          proxyMode: currentConfig.mode,
          googleAccessible: true,
          testedSites: blockedSiteTestUrls.join(', ')
        }
      };
    } catch (error: unknown) {
      console.error('[IPC 主进程] 处理 proxy-test-connection 请求时发生错误:', error);
      const message = error instanceof Error ? error.message : '测试代理连接时出错';
      return { success: false, error: message };
    }
  });

  console.log('已注册代理 IPC 处理程序。');
}

/**
 * 统一注册所有 IPC 处理程序
 * @param getMainWindow Function to get the main browser window instance
 */
export function registerAllIpcHandlers(getMainWindow: () => BrowserWindow | null): void { // <-- 修改签名
  console.log('[IPC 管理] 注册所有 IPC 处理程序...');
  registerStoreHandlers();
  registerCharacterHandlers();
  registerScriptHandlers();
  registerChatSessionHandlers();
  registerLLMServiceHandlers(getMainWindow); // <-- 传递 getMainWindow
  registerProxyHandlers();
  console.log('[IPC 管理] 所有 IPC 处理程序已注册。');
}

// 注意：现在应该在 main.ts 中只调用 registerAllIpcHandlers() 函数
