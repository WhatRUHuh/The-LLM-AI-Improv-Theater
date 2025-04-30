/**
 * 日志工具类
 * 统一管理日志输出，确保所有日志都使用汉语，并且输出到控制台和开发者工具时使用UTF-8编码
 */
import { getLogConfig } from './logConfig';
import { LogLevel, LoggerConfig } from './logTypes';

// 控制台颜色代码
enum ConsoleColor {
  Reset = '\x1b[0m',
  FgRed = '\x1b[31m',
  FgYellow = '\x1b[33m',
  FgCyan = '\x1b[36m',
  FgGray = '\x1b[90m',
}

/**
 * 日志工具类
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private showTimestamp: boolean;
  private colorfulConsole: boolean;

  /**
   * 构造函数
   * @param config 日志配置
   */
  constructor(config: LoggerConfig) {
    const globalConfig = getLogConfig();
    this.level = config.level;
    this.prefix = config.prefix || '';
    this.showTimestamp = config.showTimestamp !== undefined ? config.showTimestamp : globalConfig.showTimestamp;
    this.colorfulConsole = config.colorfulConsole !== undefined ? config.colorfulConsole : globalConfig.colorfulConsole;
  }

  /**
   * 格式化日志消息
   * @param level 日志级别
   * @param message 日志消息
   * @param args 额外参数
   * @returns 格式化后的日志消息
   */
  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = this.showTimestamp ? `[${new Date().toLocaleString('zh-CN')}] ` : '';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const levelStr = `[${level}] `;

    // 将非字符串参数转换为字符串
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });

    const baseMessage = `${timestamp}${prefix}${levelStr}${message} ${formattedArgs.join(' ')}`.trim();

    // 如果启用了彩色输出，根据日志级别添加颜色
    if (this.colorfulConsole) {
      if (level === '错误') {
        return `${ConsoleColor.FgRed}${baseMessage}${ConsoleColor.Reset}`; // 红色
      } else if (level === '警告') {
        return `${ConsoleColor.FgYellow}${baseMessage}${ConsoleColor.Reset}`; // 黄色
      } else if (level === '信息') {
        return `${ConsoleColor.FgCyan}${baseMessage}${ConsoleColor.Reset}`; // 青色
      } else if (level === '调试') {
        return `${ConsoleColor.FgGray}${baseMessage}${ConsoleColor.Reset}`; // 灰色
      }
    }

    return baseMessage;
  }

  /**
   * 确保字符串使用UTF-8编码
   * 这个函数在Windows终端中特别有用
   * @param str 输入字符串
   * @returns UTF-8编码的字符串
   */
  private ensureUtf8(str: string): string {
    // 在Windows平台上，终端可能不使用UTF-8编码
    if (process.platform === 'win32') {
      try {
        // 尝试将字符串转换为Buffer再转回字符串，确保UTF-8编码
        // 使用Buffer.from(str, 'utf8')创建一个UTF-8编码的Buffer
        // 然后使用toString('utf8')将Buffer转换回字符串
        // 这样可以确保字符串使用UTF-8编码
        return Buffer.from(str, 'utf8').toString('utf8');
      } catch {
        return str; // 如果转换失败，返回原始字符串
      }
    }
    return str; // 非Windows平台直接返回
  }

  /**
   * 输出调试级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formattedMessage = this.formatMessage('调试', message, ...args);
      console.log(this.ensureUtf8(formattedMessage));
    }
  }

  /**
   * 输出信息级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formattedMessage = this.formatMessage('信息', message, ...args);
      console.log(this.ensureUtf8(formattedMessage));
    }
  }

  /**
   * 输出警告级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const formattedMessage = this.formatMessage('警告', message, ...args);
      console.warn(this.ensureUtf8(formattedMessage));
    }
  }

  /**
   * 输出错误级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const formattedMessage = this.formatMessage('错误', message, ...args);
      console.error(this.ensureUtf8(formattedMessage));
    }
  }
}

// 创建默认日志实例
export const mainLogger = new Logger({ level: LogLevel.DEBUG, prefix: '主进程' });
export const ipcLogger = new Logger({ level: LogLevel.DEBUG, prefix: 'IPC' });
export const llmLogger = new Logger({ level: LogLevel.DEBUG, prefix: 'LLM' });
export const storageLogger = new Logger({ level: LogLevel.DEBUG, prefix: '存储' });
export const proxyLogger = new Logger({ level: LogLevel.DEBUG, prefix: '代理' });

// 导出默认日志函数，方便直接使用
export default {
  debug: mainLogger.debug.bind(mainLogger),
  info: mainLogger.info.bind(mainLogger),
  warn: mainLogger.warn.bind(mainLogger),
  error: mainLogger.error.bind(mainLogger),
};
