/**
 * 日志类型定义
 * 包含日志级别枚举和日志配置接口
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 日志配置接口
export interface LogConfig {
  // 全局日志级别
  globalLevel: LogLevel;
  // 各模块日志级别
  moduleLevels: {
    main: LogLevel;
    ipc: LogLevel;
    llm: LogLevel;
    storage: LogLevel;
    proxy: LogLevel;
  };
  // 是否在日志中显示时间戳
  showTimestamp: boolean;
  // 是否在控制台输出彩色日志
  colorfulConsole: boolean;
  // 是否将日志写入文件
  logToFile: boolean;
  // 日志文件路径
  logFilePath?: string;
}

// 日志器配置接口
export interface LoggerConfig {
  level: LogLevel; // 日志级别
  prefix?: string; // 日志前缀
  showTimestamp?: boolean; // 是否显示时间戳
  colorfulConsole?: boolean; // 是否在控制台输出彩色日志
}
