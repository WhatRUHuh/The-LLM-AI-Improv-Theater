import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? path.join(__dirname, "../public") : process.env.DIST;
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    // <-- Use VITE_PUBLIC which is now correctly set
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
      // <-- Use __dirname here
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
const createMenu = () => {
  const menuTemplate = [
    {
      label: "文件",
      // File
      submenu: [
        { role: "quit", label: "退出" }
        // Quit
      ]
    },
    {
      label: "编辑",
      // Edit
      submenu: [
        { role: "undo", label: "撤销" },
        // Undo
        { role: "redo", label: "重做" },
        // Redo
        { type: "separator" },
        { role: "cut", label: "剪切" },
        // Cut
        { role: "copy", label: "复制" },
        // Copy
        { role: "paste", label: "粘贴" },
        // Paste
        { role: "selectAll", label: "全选" }
        // Select All
      ]
    },
    {
      label: "视图",
      // View
      submenu: [
        { role: "reload", label: "重新加载" },
        // Reload
        { role: "forceReload", label: "强制重新加载" },
        // Force Reload
        { role: "toggleDevTools", label: "切换开发者工具" },
        // Toggle Developer Tools
        { type: "separator" },
        { role: "resetZoom", label: "重置缩放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" }
        // Toggle Full Screen
      ]
    },
    {
      label: "窗口",
      // Window
      submenu: [
        { role: "minimize", label: "最小化" },
        // Minimize
        { role: "close", label: "关闭" }
        // Close
      ]
    },
    {
      label: "帮助",
      // Help
      submenu: [
        {
          label: "了解更多",
          // Learn More (Example)
          click: async () => {
            const { shell } = await import("electron");
            await shell.openExternal("https://electronjs.org");
          }
        }
      ]
    }
  ];
  if (process.platform === "darwin") {
    menuTemplate.unshift({
      label: app.getName(),
      submenu: [
        { role: "about", label: `关于 ${app.getName()}` },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: `隐藏 ${app.getName()}` },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: `退出 ${app.getName()}` }
      ]
    });
    const editMenu = menuTemplate.find((m) => m.label === "编辑");
    if (editMenu && editMenu.submenu) {
      editMenu.submenu.push(
        { type: "separator" },
        {
          label: "语音",
          submenu: [
            { role: "startSpeaking", label: "开始朗读" },
            { role: "stopSpeaking", label: "停止朗读" }
          ]
        }
      );
    }
    const windowMenu = menuTemplate.find((m) => m.label === "窗口");
    if (windowMenu && windowMenu.submenu) {
      windowMenu.submenu.push(
        { type: "separator" },
        { role: "front", label: "全部置于顶层" },
        { type: "separator" },
        { role: "window", label: "窗口" }
        // This might need specific handling or removal depending on needs
      );
    }
  }
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
};
app.whenReady().then(() => {
  createWindow();
  createMenu();
});
