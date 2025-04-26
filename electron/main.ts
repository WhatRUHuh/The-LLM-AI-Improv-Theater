import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerStoreHandlers } from './ipcHandlers';
import { llmServiceManager } from './llm/LLMServiceManager'; // <-- 导入 LLM 服务管理器
import { ipcMain } from 'electron'; // <-- 确保导入 ipcMain

// 在 ES 模块作用域中获取当前目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 构建后的目录结构
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public') // 开发模式下也使用 __dirname 保持一致
  : process.env.DIST;


let win: BrowserWindow | null;
// 🚧 使用 ['ENV_NAME'] 避免 vite:define 插件处理 - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    // 仅当 VITE_PUBLIC 定义时才设置图标
    ...(process.env.VITE_PUBLIC && { icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg') }),
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'), // 旧路径，可能不正确
      // Vite Electron 插件通常将 preload 编译为 .mjs
      preload: path.join(__dirname, 'preload.mjs'), // <-- 尝试使用 .mjs 后缀
    },
  });

  // 测试向渲染进程推送消息
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html') // 加载生产环境的 index.html
    const distPath = process.env.DIST;
    if (!distPath) {
      console.error('DIST 环境变量未设置。');
      app.quit(); // 如果 DIST 未设置则退出，因为无法加载文件
      return;
    }
    win.loadFile(path.join(distPath, 'index.html'));
  }
}

// 当所有窗口关闭时退出应用，macOS 除外。在 macOS 上，应用及其菜单栏通常会保持活动状态，
// 直到用户使用 Cmd + Q 显式退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { // 'darwin' 表示 macOS
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // 在 macOS 上，当单击程序坞图标并且没有其他窗口打开时，
  // 通常会重新创建一个窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- 创建自定义中文菜单 ---
const createMenu = () => {
  const menuTemplate: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '了解更多', // 示例：可以链接到项目文档或官网
          click: async () => {
            const { shell } = await import('electron'); // 动态导入 shell 模块
            await shell.openExternal('https://electronjs.org'); // 打开外部链接
          }
        }
      ]
    }
  ];

  // --- macOS 特定菜单项 ---
  if (process.platform === 'darwin') {
    // 在 macOS 上，第一个菜单通常是应用名称菜单
    menuTemplate.unshift({
      label: app.getName(), // 获取应用名称
      submenu: [
        { role: 'about', label: `关于 ${app.getName()}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.getName()}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.getName()}` }
      ]
    });

    // --- macOS 编辑菜单调整 ---
    const editMenu = menuTemplate.find(m => m.label === '编辑');
    if (editMenu && editMenu.submenu) {
       // 在 macOS 的编辑菜单中添加“语音”子菜单
       (editMenu.submenu as Electron.MenuItemConstructorOptions[]).push(
        { type: 'separator' },
        {
          label: '语音',
          submenu: [
            { role: 'startSpeaking', label: '开始朗读' },
            { role: 'stopSpeaking', label: '停止朗读' }
          ]
        }
      );
    }


    // --- macOS 窗口菜单调整 ---
    const windowMenu = menuTemplate.find(m => m.label === '窗口');
     if (windowMenu && windowMenu.submenu) {
        // 在 macOS 的窗口菜单中添加特定项
        (windowMenu.submenu as Electron.MenuItemConstructorOptions[]).push(
            { type: 'separator' },
            { role: 'front', label: '全部置于顶层' },
            { type: 'separator' },
            { role: 'window', label: '窗口' } // 这个可能需要根据具体需求调整或移除
        );
     }
  }

  // 从模板构建菜单
  const menu = Menu.buildFromTemplate(menuTemplate);
  // 设置为应用程序菜单
  Menu.setApplicationMenu(menu);
};


/**
 * 注册与 LLM 服务相关的 IPC 处理程序
 */
function registerLLMServiceHandlers() {
  // 获取所有服务商信息 (名称、ID、默认模型)
  ipcMain.handle('llm-get-services', async () => {
    console.log('[IPC Main] Received llm-get-services');
    try {
      const services = llmServiceManager.getAllServices().map(service => ({
        providerId: service.providerId,
        providerName: service.providerName,
        defaultModels: service.defaultModels,
        // 注意：不在此处返回 API Key
      }));
      return { success: true, data: services };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取 LLM 服务列表时出错';
      console.error('[IPC Main] Error handling llm-get-services:', error);
      return { success: false, error: message };
    }
  });

  // 设置指定服务商的 API Key
  ipcMain.handle('llm-set-api-key', async (event, providerId: string, apiKey: string | null) => {
     console.log(`[IPC Main] Received llm-set-api-key for ${providerId}`);
     try {
       const success = llmServiceManager.setApiKeyForService(providerId, apiKey);
       if (success) {
         // 可以在这里添加逻辑，将 API Key 持久化存储 (例如使用 jsonStore)
         // await writeStore('apiKeys.json', { ...currentKeys, [providerId]: apiKey });
         console.log(`API Key for ${providerId} set successfully via manager.`);
         return { success: true };
       } else {
         return { success: false, error: `未找到服务商: ${providerId}` };
       }
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '设置 API Key 时出错';
       console.error(`[IPC Main] Error handling llm-set-api-key for ${providerId}:`, error);
       return { success: false, error: message };
     }
  });

   // 添加获取可用模型的 IPC 处理器 (需要考虑自定义模型)
   ipcMain.handle('llm-get-available-models', async (event, providerId: string) => {
     console.log(`[IPC Main] Received llm-get-available-models for ${providerId}`);
     const service = llmServiceManager.getService(providerId);
     if (!service) {
       return { success: false, error: `未找到服务商: ${providerId}` };
     }
     try {
       // TODO: 从存储中读取该服务商的自定义模型列表
       const customModels: string[] = []; // 示例： const customModels = await readStore(...)
       const availableModels = service.getAvailableModels(customModels);
       return { success: true, data: availableModels };
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : '获取可用模型时出错';
       console.error(`[IPC Main] Error handling llm-get-available-models for ${providerId}:`, error);
       return { success: false, error: message };
     }
   });


  console.log('LLM Service IPC handlers registered.');
}


// 应用准备就绪后执行
app.whenReady().then(async () => { // <-- 改为 async 函数
  try {
    await llmServiceManager.initialize(); // <-- 初始化 LLM 服务管理器
    registerStoreHandlers();           // 注册存储 IPC 处理器
    registerLLMServiceHandlers();      // <-- 注册 LLM 服务 IPC 处理器
    createWindow();                    // 创建窗口
    createMenu();                      // 创建菜单
  } catch (error) {
     console.error("Failed during app initialization:", error);
     // 这里可以显示一个错误窗口或直接退出
     app.quit();
  }
});