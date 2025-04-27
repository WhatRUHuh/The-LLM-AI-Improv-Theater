import { app, BrowserWindow, Menu, shell } from 'electron'; // 导入需要的模块
import path from 'node:path';
import fs from 'node:fs'; // 导入 fs 模块
import { fileURLToPath } from 'node:url'; // 导入 fileURLToPath
import { registerStoreHandlers, registerLLMServiceHandlers, registerProxyHandlers } from './ipcHandlers';
import { llmServiceManager } from './llm/LLMServiceManager';
import { proxyManager } from './proxyManager';
import { readStore } from './storage/jsonStore';

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
  : path.join(__dirname, '../dist');  // 生产: ../dist (先假设它和 dist-electron 同级)

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
          console.warn(`[Main Process] Icon file not found at: ${potentialIconPath}`);
      }
  } else {
      console.warn(`[Main Process] VITE_PUBLIC path does not exist or is not set: ${publicPath}`);
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
        console.error(`[Main Process] Production DIST path does not exist: ${distPath}. Exiting.`);
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
        console.error(`Error loading index.html from ${indexPath}:`, error);
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
  console.log('[Main Process] Loading saved API keys...');
  try {
    const savedKeys = await readStore<Record<string, string | null>>(API_KEYS_FILE, {});
    console.log('[Main Process] Found saved keys for providers:', Object.keys(savedKeys));
    for (const [providerId, apiKey] of Object.entries(savedKeys)) {
      if (apiKey) {
        console.log(`[Main Process] Setting API key for ${providerId}...`);
        llmServiceManager.setApiKeyForService(providerId, apiKey);
      }
    }
    console.log('[Main Process] Finished setting saved API keys.');
  } catch (error) {
    console.error('[Main Process] Error loading or setting saved API keys:', error);
  }
}

/**
 * 加载已保存的代理配置并应用
 */
async function loadAndApplyProxyConfig() {
  console.log('[Main Process] Loading saved proxy configuration...');
  try {
    const config = await readStore<{ mode: 'system' | 'custom' | 'none'; url?: string }>(
      PROXY_CONFIG_FILE,
      { mode: 'none' }
    );
    console.log(`[Main Process] Found proxy config: mode=${config.mode}, url=${config.url || 'none'}`);
    await proxyManager.configureProxy(config);
    console.log('[Main Process] Proxy configuration applied successfully.');
  } catch (error) {
    console.error('[Main Process] Error loading or applying proxy configuration:', error);
  }
}



// --- 应用生命周期事件 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  console.log('[Main Process] App ready.');
  try {
    // 初始化 LLM 服务和加载 API Keys
    await llmServiceManager.initialize();
    await loadAndSetApiKeys();

    // 加载并应用代理配置
    await loadAndApplyProxyConfig();

    // 注册 IPC handlers
    registerStoreHandlers();
    registerLLMServiceHandlers();
    registerProxyHandlers();

    createWindow();
    createMenu();
    console.log('[Main Process] Initialization successful.');
  } catch (error) {
     console.error("[Main Process] Failed during app initialization:", error);
     app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});