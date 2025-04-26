import { ipcMain } from 'electron';
import { readStore, writeStore } from './storage/jsonStore'; // 导入存储函数

/**
 * 注册与数据存储相关的 IPC 处理程序。
 */
export function registerStoreHandlers(): void {
  // 处理读取存储请求
  // 将 defaultValue 类型改为 unknown
  ipcMain.handle('read-store', async (event, fileName: string, defaultValue: unknown) => {
    console.log(`IPC received: read-store for ${fileName}`);
    try {
      // readStore 现在接受 T (由 defaultValue 推断) 或 unknown
      // 由于 defaultValue 是 unknown，readStore 的 T 也会是 unknown，除非调用者能提供更具体的类型
      // 但在这里，我们直接传递 unknown 即可，readStore 内部会处理
      const data = await readStore(fileName, defaultValue);
      return { success: true, data };
    } catch (error: unknown) { // 将 error 类型改为 unknown
      console.error(`IPC error handling read-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '读取存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  // 处理写入存储请求
  // 将 data 类型改为 unknown
  ipcMain.handle('write-store', async (event, fileName: string, data: unknown) => {
    // 添加更详细的日志，包括传入的数据
    console.log(`[IPC Handler] Received 'write-store' for ${fileName} with data:`, JSON.stringify(data, null, 2));
    try {
      console.log(`[IPC Handler] Calling writeStore function for ${fileName}...`); // <-- 添加日志
      // writeStore 现在接受 T 或 unknown
      await writeStore(fileName, data);
      console.log(`[IPC Handler] writeStore function for ${fileName} completed successfully.`); // <-- 添加日志
      return { success: true };
    } catch (error: unknown) { // 将 error 类型改为 unknown
      console.error(`IPC error handling write-store for ${fileName}:`, error);
      const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
      return { success: false, error: message };
    }
  });

  console.log('Store IPC handlers registered.');
}

// 注意：确保在 main.ts 中调用 registerStoreHandlers() 来激活这些处理器。