import { app, BrowserWindow, Menu } from 'electron'; // 导入 Menu
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // 导入 fileURLToPath

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
      preload: path.join(__dirname, 'preload.js'), // 使用 __dirname
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


// 应用准备就绪后执行
app.whenReady().then(() => {
  createWindow(); // 创建窗口
  createMenu();   // 创建菜单
});