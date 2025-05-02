/**
 * 文件日志工具
 * 提供将日志写入文件的功能，仅在主进程中使用
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// 日志文件相关变量
let logFile: fs.WriteStream | null = null;
let logFilePath: string | null = null;

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
      console.log(`日志目录已创建: ${logDir}`);
    }
    
    // 创建带时间戳的日志文件名
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    logFilePath = path.join(logDir, `app-${timestamp}.log`);
    
    // 创建日志文件流
    logFile = fs.createWriteStream(logFilePath, { 
      flags: 'a', // 追加模式
      encoding: 'utf8'
    });
    
    console.log(`日志文件已创建: ${logFilePath}`);
    
    // 写入日志文件头
    logFile.write(`=== 应用程序日志 - 启动时间: ${new Date().toLocaleString('zh-CN')} ===\n\n`);
  } catch (error) {
    console.error('创建日志文件时出错:', error);
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
      logFile.write(`\n=== 应用程序日志结束 - 关闭时间: ${new Date().toLocaleString('zh-CN')} ===\n`);
      logFile.end();
      console.log(`日志文件已关闭: ${logFilePath}`);
    } catch (error) {
      console.error('关闭日志文件时出错:', error);
    } finally {
      logFile = null;
      logFilePath = null;
    }
  }
}
