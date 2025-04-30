/**
 * 前端日志工具类
 * 统一管理前端日志输出，确保所有日志都使用汉语，并且输出到控制台和开发者工具时使用UTF-8编码
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 日志配置接口
interface LoggerConfig {
  level: LogLevel; // 日志级别
  prefix?: string; // 日志前缀
  showTimestamp?: boolean; // 是否显示时间戳
  colorfulConsole?: boolean; // 是否在控制台输出彩色日志
}

// 日志级别对应的样式

// 控制台样式
const ConsoleStyle = {
  Reset: '',
  Debug: 'color: gray;',
  Info: 'color: #1890ff;',
  Warn: 'color: orange;',
  Error: 'color: red;',
};

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
    this.level = config.level;
    this.prefix = config.prefix || '';
    this.showTimestamp = config.showTimestamp !== undefined ? config.showTimestamp : true;
    this.colorfulConsole = config.colorfulConsole !== undefined ? config.colorfulConsole : true;
  }

  /**
   * 格式化日志消息
   * @param level 日志级别
   * @param message 日志消息
   * @returns 格式化后的日志消息和样式
   */
  private formatMessage(level: string, message: string): { message: string; style?: string } {
    const timestamp = this.showTimestamp ? `[${new Date().toLocaleString('zh-CN')}] ` : '';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const levelStr = `[${level}] `;

    // 注意：我们不再需要在这里格式化args，因为我们在实际输出时会直接传递args
    // 这样可以保持对象在控制台中的可展开性，提高调试体验

    const baseMessage = `${timestamp}${prefix}${levelStr}${message}`;

    // 如果启用了彩色输出，根据日志级别添加颜色
    if (this.colorfulConsole) {
      let style = '';

      if (level === '调试') {
        style = ConsoleStyle.Debug;
      } else if (level === '信息') {
        style = ConsoleStyle.Info;
      } else if (level === '警告') {
        style = ConsoleStyle.Warn;
      } else if (level === '错误') {
        style = ConsoleStyle.Error;
      }

      return {
        message: `%c${baseMessage}`, // 使用%c作为样式标记
        style
      };
    }

    return { message: baseMessage };
  }

  /**
   * 输出调试级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const { message: formattedMessage, style } = this.formatMessage('调试', message);
      if (style) {
        console.log(formattedMessage, style, ...args);
      } else {
        console.log(formattedMessage, ...args);
      }
    }
  }

  /**
   * 输出信息级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const { message: formattedMessage, style } = this.formatMessage('信息', message);
      if (style) {
        console.log(formattedMessage, style, ...args);
      } else {
        console.log(formattedMessage, ...args);
      }
    }
  }

  /**
   * 输出警告级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const { message: formattedMessage, style } = this.formatMessage('警告', message);
      if (style) {
        console.warn(formattedMessage, style, ...args);
      } else {
        console.warn(formattedMessage, ...args);
      }
    }
  }

  /**
   * 输出错误级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const { message: formattedMessage, style } = this.formatMessage('错误', message);
      if (style) {
        console.error(formattedMessage, style, ...args);
      } else {
        console.error(formattedMessage, ...args);
      }
    }
  }
}

// 创建默认日志实例
export const historyLogger = new Logger({ level: LogLevel.DEBUG, prefix: '历史记录' });
export const chatLogger = new Logger({ level: LogLevel.DEBUG, prefix: '聊天界面' });
export const characterLogger = new Logger({ level: LogLevel.DEBUG, prefix: '角色管理' });
export const scriptLogger = new Logger({ level: LogLevel.DEBUG, prefix: '剧本管理' });
export const setupLogger = new Logger({ level: LogLevel.DEBUG, prefix: '设置' });

// 导出默认日志函数，方便直接使用
export default {
  debug: chatLogger.debug.bind(chatLogger),
  info: chatLogger.info.bind(chatLogger),
  warn: chatLogger.warn.bind(chatLogger),
  error: chatLogger.error.bind(chatLogger),
};
