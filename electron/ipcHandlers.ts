import { ipcMain } from 'electron';
import { readStore, writeStore } from './storage/jsonStore'; // 导入存储函数

/**
 * 注册与数据存储相关的 IPC 处理程序。
 */
export function registerStoreHandlers(): void {
  // 处理读取存储请求
  ipcMain.handle('read-store', async (event, fileName: string, defaultValue: any) => {
    console.log(`IPC received: read-store for ${fileName}`);
    try {
      const data = await readStore(fileName, defaultValue);
      return { success: true, data };
    } catch (error: any) {
      console.error(`IPC error handling read-store for ${fileName}:`, error);
      return { success: false, error: error.message || '读取存储时发生未知错误' };
    }
  });

  // 处理写入存储请求
  ipcMain.handle('write-store', async (event, fileName: string, data: any) => {
    console.log(`IPC received: write-store for ${fileName}`);
    try {
      await writeStore(fileName, data);
      return { success: true };
    } catch (error: any) {
      console.error(`IPC error handling write-store for ${fileName}:`, error);
      return { success: false, error: error.message || '写入存储时发生未知错误' };
    }
  });

  console.log('Store IPC handlers registered.');
}

// 注意：确保在 main.ts 中调用 registerStoreHandlers() 来激活这些处理器。