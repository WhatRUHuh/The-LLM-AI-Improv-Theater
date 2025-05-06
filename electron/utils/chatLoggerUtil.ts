import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import util from 'util';
import { UTF8_OPTIONS } from './encoding'; // 假设编码选项在这里定义

// 为日志记录定义一个更简洁的 AIConfig 信息接口
interface AIChatLogInfo {
  id: string;
  name: string;
  serviceProvider: string;
}

// 聊天日志文件相关变量
let chatLogFileHandle: fs.FileHandle | null = null;
let chatLogFilePath: string | null = null;
const chatLogDir = path.join(app.getPath('userData'), 'TheLLMAIImprovTheaterData', 'logs');

/**
 * 确保聊天日志目录存在。
 */
async function ensureChatLogDirExists(): Promise<void> {
  try {
    await fs.access(chatLogDir);
  } catch (error: unknown) {
    let errorCode: string | undefined;
    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = (error as { code: string }).code;
    }
    if (errorCode === 'ENOENT') {
      try {
        await fs.mkdir(chatLogDir, { recursive: true });
        console.log(`[ChatLoggerUtil] 聊天日志目录已创建: ${chatLogDir}`); // 使用原始 console
      } catch (mkdirError) {
        console.error(`[ChatLoggerUtil] 创建聊天日志目录失败 ${chatLogDir}:`, mkdirError);
        throw new Error(`创建聊天日志目录失败: ${chatLogDir}`);
      }
    } else {
      console.error(`[ChatLoggerUtil] 访问聊天日志目录失败 ${chatLogDir}:`, error);
      throw new Error(`访问聊天日志目录失败: ${chatLogDir}`);
    }
  }
}

/**
 * 初始化聊天日志系统。
 */
export async function initChatLogger(): Promise<void> {
  try {
    await ensureChatLogDirExists();

    // 创建带时间戳的聊天日志文件名
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    chatLogFilePath = path.join(chatLogDir, `chat-${timestamp}.log`);

    // 使用 fs.open 获取 FileHandle，追加模式
    chatLogFileHandle = await fs.open(chatLogFilePath, 'a');

    console.log(`[ChatLoggerUtil] 聊天日志文件已创建: ${chatLogFilePath}`);

    // 写入日志文件头
    await chatLogFileHandle.write(`=== 聊天记录日志 - 启动时间: ${new Date().toLocaleString('zh-CN')} ===\n\n`, null, UTF8_OPTIONS.encoding);

  } catch (error) {
    console.error('[ChatLoggerUtil] 创建聊天日志文件时出错:', error);
    chatLogFileHandle = null;
    chatLogFilePath = null;
  }
}

/**
 * 格式化聊天日志消息。
 * @param sessionId 会话 ID
 * @param direction 方向 ('TO_AI', 'FROM_AI', 'SYSTEM_ACTION')
 * @param actor 操作者/角色名 (e.g., 'User', 'AI:王皇后', 'System')
 * @param dataType 数据类型 (e.g., 'Request Options', 'Response Chunk', 'Error', 'History Entry')
 * @param data 具体数据内容
 * @param aiConfig 可选的AI配置信息，用于增强日志
 * @returns 格式化后的日志消息字符串
 */
function formatChatMessage(sessionId: string | undefined, direction: string, actor: string, dataType: string, data: unknown, aiConfig?: AIChatLogInfo): string {
  const timestamp = `[${new Date().toLocaleString('zh-CN')}]`;
  const sessionStr = sessionId ? `[Session: ${sessionId}]` : '[Session: N/A]';
  const directionStr = `[${direction}]`;
  let actorStr = `[Actor: ${actor}]`; // 默认的 actor 字符串

  // 如果提供了 AIConfig 信息，并且 actor 与 serviceProvider 匹配，则使用更详细的 actor 字符串
  // 例如，actor 可能是 "Google", "OpenAI" 等
  if (aiConfig && actor.toLowerCase() === aiConfig.serviceProvider.toLowerCase()) {
    actorStr = `[Actor: ${aiConfig.serviceProvider} (${aiConfig.name}, ID: ${aiConfig.id})]`;
  }

  const typeStr = `[Type: ${dataType}]`;

  let dataStr: string;
  try {
    // 使用 util.inspect 提供更详细和安全的序列化，限制深度
    dataStr = util.inspect(data, { depth: 5, breakLength: Infinity });
  } catch (e) {
    console.error('[ChatLoggerUtil] Data serialization error during formatting:', e); // Log the actual error
    dataStr = '[Data Serialization Error]';
  }

  return `${timestamp} ${sessionStr} ${directionStr} ${actorStr} ${typeStr}\n${dataStr}\n---`; // 添加分隔符
}


/**
 * 写入聊天日志到文件。
 * @param sessionId 会话 ID
 * @param direction 方向 ('TO_AI', 'FROM_AI', 'SYSTEM_ACTION')
 * @param actor 操作者/角色名
 * @param dataType 数据类型
 * @param data 具体数据
 * @param aiConfig 可选的AI配置信息
 */
export async function logChatMessage(sessionId: string | undefined, direction: string, actor: string, dataType: string, data: unknown, aiConfig?: AIChatLogInfo): Promise<void> {
  if (chatLogFileHandle && chatLogFilePath) {
    try {
      const message = formatChatMessage(sessionId, direction, actor, dataType, data, aiConfig);
      await chatLogFileHandle.write(message + '\n', null, UTF8_OPTIONS.encoding);
    } catch (error) {
      console.error('[ChatLoggerUtil] 写入聊天日志文件时出错:', error);
      // 考虑是否要关闭日志
      // await closeChatLogger();
    }
  } else {
      // 如果日志文件未初始化，可以选择降级到 console.log 或忽略
      console.warn('[ChatLoggerUtil] 聊天日志系统未初始化，消息未写入文件:', formatChatMessage(sessionId, direction, actor, dataType, data, aiConfig));
  }
}

/**
 * 关闭聊天日志文件。
 */
export async function closeChatLogger(): Promise<void> {
  if (chatLogFileHandle) {
    try {
      console.log('[ChatLoggerUtil] 正在关闭聊天日志文件...');
      // 写入结束标记
      await chatLogFileHandle.write(`\n=== 聊天记录日志结束 - 关闭时间: ${new Date().toLocaleString('zh-CN')} ===\n`, null, UTF8_OPTIONS.encoding);
      await chatLogFileHandle.close();
      console.log(`[ChatLoggerUtil] 聊天日志文件已关闭: ${chatLogFilePath}`);
    } catch (error) {
      console.error('[ChatLoggerUtil] 关闭聊天日志文件时出错:', error);
    } finally {
      chatLogFileHandle = null;
      chatLogFilePath = null;
    }
  }
}