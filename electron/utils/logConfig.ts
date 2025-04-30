/**
 * 日志配置文件
 * 统一管理日志输出配置
 */
import { LogLevel, LogConfig } from './logTypes';

/**
 * 默认日志配置
 */
export const defaultLogConfig: LogConfig = {
  globalLevel: LogLevel.DEBUG,
  moduleLevels: {
    main: LogLevel.DEBUG,
    ipc: LogLevel.DEBUG,
    llm: LogLevel.DEBUG,
    storage: LogLevel.DEBUG,
    proxy: LogLevel.DEBUG,
  },
  showTimestamp: true,
  colorfulConsole: true,
  logToFile: false,
};

/**
 * 获取日志配置
 * @returns 日志配置
 */
export function getLogConfig(): LogConfig {
  // 这里可以从配置文件或环境变量中读取配置
  // 暂时返回默认配置
  return defaultLogConfig;
}

/**
 * 默认导出
 */
export default {
  getLogConfig,
  defaultLogConfig,
};
