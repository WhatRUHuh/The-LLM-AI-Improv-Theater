import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'; // 导入需要的模块
import path from 'node:path';
import fs from 'node:fs'; // 导入 fs 模块
import { fileURLToPath } from 'node:url'; // 导入 fileURLToPath
import { registerAllIpcHandlers } from './ipcHandlers'; // <-- 只导入统一注册函数
import { llmServiceManager } from './llm/LLMServiceManager';
import { proxyManager } from './ProxyManager';
import { readStore } from './storage/jsonStore';
import { mainLogger as logger } from './utils/logger'; // 导入日志工具
import { setupGlobalEncoding } from './utils/encoding'; // 导入编码工具
import { initLogger, writeLog, closeLogger } from './utils/fileLogger'; // 导入文件日志工具

// 设置全局编码为UTF-8 (异步函数，但我们不需要等待它完成)
// 在Windows平台上，尝试设置控制台代码页为UTF-8
if (process.platform === 'win32') {
  try {
    // 使用spawn执行chcp命令设置控制台代码页为UTF-8
    import('child_process').then(({ spawn }) => {
      spawn('chcp', ['65001'], { stdio: 'ignore', shell: true });
      logger.info('已设置Windows控制台代码页为UTF-8');
    }).catch(err => {
      logger.error('导入child_process模块失败:', err);
    });
  } catch (error) {
    logger.error('设置Windows控制台代码页时出错:', error);
  }
}

// 设置全局编码
setupGlobalEncoding().catch(err => {
  console.error('设置全局编码时出错:', err);
});

// --- 全局常量 ---
const API_KEYS_FILE = 'apiKeys.json';
const PROXY_CONFIG_FILE = 'proxyConfig.json';

// --- 路径设置 ---
// 在 ES 模块作用域中获取当前运行文件的目录 (dist-electron)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// VITE_PUBLIC 路径设置 (开发环境指向 public, 生产环境指向 dist)
// 注意: process.env.DIST 会在 createWindow 中根据环境设置
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public') // 开发: ../public
  : path.join(__dirname, '../dist');  // 生产: ../dist 

// --- 全局变量 ---
let win: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

// --- 函数定义 ---

/**
 * 创建主窗口
 */
function createWindow() {
  // 检查 VITE_PUBLIC 路径是否存在并设置图标
  const publicPath = process.env.VITE_PUBLIC;
  let iconPath: string | undefined;
  if (publicPath && fs.existsSync(publicPath)) {
      const potentialIconPath = path.join(publicPath, 'electron-vite.svg');
      if (fs.existsSync(potentialIconPath)) {
          iconPath = potentialIconPath;
      } else {
          logger.warn(`图标文件未找到: ${potentialIconPath}`);
      }
  } else {
      logger.warn(`VITE_PUBLIC 路径不存在或未设置: ${publicPath}`);
  }

  win = new BrowserWindow({
    icon: iconPath, // 使用计算出的图标路径
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'), // __dirname 是 dist-electron
    },
  });

  // 测试向渲染进程推送消息 (可选)
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  // 加载页面
  if (VITE_DEV_SERVER_URL) {
    // 开发模式: 加载 Vite 开发服务器 URL
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    // 生产模式: 从 dist 目录加载 index.html
    // 在这里计算并检查 dist 路径
    const distPath = path.join(__dirname, '../dist');
    if (!fs.existsSync(distPath)) {
        logger.error(`生产环境DIST路径不存在: ${distPath}. 退出应用.`);
        app.quit();
        return; // 必须返回，防止后续代码执行
    }
    // 设置 process.env.DIST 供其他地方使用 (如果需要的话)
    process.env.DIST = distPath;

    const indexPath = path.join(distPath, 'index.html');
     try {
        fs.accessSync(indexPath); // 检查文件是否存在
        win.loadFile(indexPath);
     } catch (error) {
        logger.error(`加载index.html失败 ${indexPath}:`, error);
        app.quit();
     }
  }

   win.on('closed', () => {
     win = null;
   });
}

/**
 * 创建应用菜单
 */
function createMenu() {
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
           label: '了解更多',
           click: async () => {
             await shell.openExternal('https://electronjs.org');
           }
         }
       ]
     }
   ];

   // macOS 特定菜单项
   if (process.platform === 'darwin') {
     menuTemplate.unshift({
       label: app.getName(),
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
     const editMenu = menuTemplate.find(m => m.label === '编辑');
     if (editMenu?.submenu) {
        (editMenu.submenu as Electron.MenuItemConstructorOptions[]).push(
         { type: 'separator' }, { label: '语音', submenu: [{ role: 'startSpeaking', label: '开始朗读' }, { role: 'stopSpeaking', label: '停止朗读' }] }
       );
     }
     const windowMenu = menuTemplate.find(m => m.label === '窗口');
      if (windowMenu?.submenu) {
         (windowMenu.submenu as Electron.MenuItemConstructorOptions[]).push(
             { type: 'separator' }, { role: 'front', label: '全部置于顶层' }
         );
      }
   }

   const menu = Menu.buildFromTemplate(menuTemplate);
   Menu.setApplicationMenu(menu);
}

/**
 * 加载已保存的 API Keys 并设置到服务管理器中
 */
async function loadAndSetApiKeys() {
  logger.info('正在加载已保存的API密钥...');
  try {
    const savedKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
    logger.info('找到已保存的服务商密钥:', Object.keys(savedKeys));
    for (const [providerId, apiKey] of Object.entries(savedKeys)) {
      if (apiKey) {
        logger.info(`正在为 ${providerId} 设置API密钥...`);
        llmServiceManager.setApiKeyForService(providerId, apiKey);
      }
    }
    logger.info('已完成设置保存的API密钥.');
  } catch (error) {
    logger.error('加载或设置已保存的API密钥时出错:', error);
  }
}

/**
 * 加载已保存的代理配置并应用
 */
async function loadAndApplyProxyConfig() {
  logger.info('正在加载已保存的代理配置...');
  try {
    const config = await readStore<{ mode: 'system' | 'custom' | 'none'; url?: string }>(
      PROXY_CONFIG_FILE,
      { mode: 'none' }
    );
    logger.info(`找到代理配置: 模式=${config.mode}, URL=${config.url || '无'}`);
    await proxyManager.configureProxy(config);
    logger.info('代理配置已成功应用.');
  } catch (error) {
    logger.error('加载或应用代理配置时出错:', error);
  }
}



// --- 应用生命周期事件 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('应用程序即将退出，正在执行清理操作...');
  // 关闭日志文件
  closeLogger();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 注册日志 IPC 通道
function registerLogIpcHandlers() {
  // 处理来自渲染进程的日志消息
  ipcMain.on('log-message', (_event, level: string, message: string, ...args: unknown[]) => {
    // 将日志写入文件
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

    const timestamp = `[${new Date().toLocaleString('zh-CN')}]`;
    const logMessage = `${timestamp} [${level}] ${message} ${formattedArgs.join(' ')}`.trim();

    // 写入日志文件
    writeLog(logMessage);
  });
}

app.whenReady().then(async () => {
  logger.info('应用已就绪.');
  try {
    // 初始化日志系统
    initLogger();
    logger.info('日志系统已初始化');

    // 注册日志 IPC 通道
    registerLogIpcHandlers();

    // 初始化 LLM 服务和加载 API Keys
    await llmServiceManager.initialize();
    await loadAndSetApiKeys();

    // 加载并应用代理配置
    await loadAndApplyProxyConfig();

    // 注册 IPC handlers
    // 注册所有 IPC handlers, 并传入获取主窗口的函数
    registerAllIpcHandlers(() => win); // <-- 传递获取 win 的函数

    createWindow();
    createMenu();
    logger.info('初始化成功.');
  } catch (error) {
     logger.error("应用初始化过程中出错:", error);
     app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
});