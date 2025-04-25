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
    // 仅当 VITE_PUBLIC 定义时才设置图标
    ...process.env.VITE_PUBLIC && { icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg") },
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
      // 使用 __dirname
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const distPath = process.env.DIST;
    if (!distPath) {
      console.error("DIST 环境变量未设置。");
      app.quit();
      return;
    }
    win.loadFile(path.join(distPath, "index.html"));
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
      submenu: [
        { role: "quit", label: "退出" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "forceReload", label: "强制重新加载" },
        { role: "toggleDevTools", label: "切换开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "重置缩放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "切换全屏" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "close", label: "关闭" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "了解更多",
          // 示例：可以链接到项目文档或官网
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
      // 获取应用名称
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
        // 这个可能需要根据具体需求调整或移除
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
