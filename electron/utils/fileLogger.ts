/**
 * 文件日志工具
 * 提供将日志写入文件的功能，仅在主进程中使用
 * 捕获所有控制台输出并写入日志文件
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import util from 'util';

// 日志文件相关变量
let logFile: fs.WriteStream | null = null;
let logFilePath: string | null = null;

// 保存原始的控制台方法
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

/**
 * 格式化日志消息
 * @param level 日志级别
 * @param args 日志参数
 * @returns 格式化后的日志消息
 */
function formatLogMessage(level: string, ...args: unknown[]): string {
  const timestamp = `[${new Date().toLocaleString('zh-CN')}]`;
  const formattedArgs = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return util.inspect(arg, { depth: 4 });
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  return `${timestamp} [${level}] ${formattedArgs}`;
}

/**
 * 重写控制台方法，将输出同时写入日志文件
 */
function overrideConsoleMethods(): void {
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    writeLog(formatLogMessage('LOG', ...args));
  };

  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    writeLog(formatLogMessage('INFO', ...args));
  };

  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    writeLog(formatLogMessage('WARN', ...args));
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    writeLog(formatLogMessage('ERROR', ...args));
  };

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    writeLog(formatLogMessage('DEBUG', ...args));
  };
}

/**
 * 恢复原始的控制台方法
 */
function restoreConsoleMethods(): void {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

/**
 * 初始化日志系统
 */
export function initLogger(): void {
  try {
    // 使用 app.getPath('userData') 获取用户数据目录
    const logDir = path.join(app.getPath('userData'), 'TheLLMAIImprovTheaterData', 'logs');

    // 确保目录存在
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      originalConsole.log(`日志目录已创建: ${logDir}`);
    }

    // 创建带时间戳的日志文件名
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    logFilePath = path.join(logDir, `app-${timestamp}.log`);

    // 创建日志文件流
    logFile = fs.createWriteStream(logFilePath, {
      flags: 'a', // 追加模式
      encoding: 'utf8'
    });

    originalConsole.log(`日志文件已创建: ${logFilePath}`);

    // 写入日志文件头
    logFile.write(`=== 应用程序日志 - 启动时间: ${new Date().toLocaleString('zh-CN')} ===\n\n`);

    // 重写控制台方法
    overrideConsoleMethods();

    originalConsole.log('控制台输出已重定向到日志文件');
  } catch (error) {
    originalConsole.error('创建日志文件时出错:', error);
    logFile = null;
    logFilePath = null;
  }
}

/**
 * 写入日志到文件
 * @param message 日志消息
 */
export function writeLog(message: string): void {
  if (logFile && logFilePath) {
    try {
      logFile.write(message + '\n');
    } catch (error) {
      console.error('写入日志文件时出错:', error);
      closeLogger();
    }
  }
}

/**
 * 关闭日志文件
 */
export function closeLogger(): void {
  if (logFile) {
    try {
      // 恢复原始的控制台方法
      restoreConsoleMethods();

      // 使用原始的控制台方法输出信息
      originalConsole.log('正在关闭日志文件...');

      // 写入日志文件结束标记
      logFile.write(`\n=== 应用程序日志结束 - 关闭时间: ${new Date().toLocaleString('zh-CN')} ===\n`);
      logFile.end();

      originalConsole.log(`日志文件已关闭: ${logFilePath}`);
    } catch (error) {
      originalConsole.error('关闭日志文件时出错:', error);
    } finally {
      logFile = null;
      logFilePath = null;
    }
  }
}
