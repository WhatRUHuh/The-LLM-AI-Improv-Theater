"use strict";
const electron = require("electron");
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  return LogLevel2;
})(LogLevel || {});
const defaultLogConfig = {
  globalLevel: LogLevel.DEBUG,
  moduleLevels: {
    main: LogLevel.DEBUG,
    ipc: LogLevel.DEBUG,
    llm: LogLevel.DEBUG,
    storage: LogLevel.DEBUG,
    proxy: LogLevel.DEBUG
  },
  showTimestamp: true,
  colorfulConsole: true,
  logToFile: true
  // 启用日志文件功能
};
function getLogConfig() {
  return defaultLogConfig;
}
class Logger {
  /**
   * 构造函数
   * @param config 日志配置
   */
  constructor(config) {
    const globalConfig = getLogConfig();
    this.level = config.level;
    this.prefix = config.prefix || "";
    this.showTimestamp = config.showTimestamp !== void 0 ? config.showTimestamp : globalConfig.showTimestamp;
    this.colorfulConsole = config.colorfulConsole !== void 0 ? config.colorfulConsole : globalConfig.colorfulConsole;
  }
  /**
   * 格式化日志消息
   * @param level 日志级别
   * @param message 日志消息
   * @param args 额外参数
   * @returns 格式化后的日志消息
   */
  formatMessage(level, message, ...args) {
    const timestamp = this.showTimestamp ? `[${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN")}] ` : "";
    const prefix = this.prefix ? `[${this.prefix}] ` : "";
    const levelStr = `[${level}] `;
    const formattedArgs = args.map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });
    const baseMessage = `${timestamp}${prefix}${levelStr}${message} ${formattedArgs.join(" ")}`.trim();
    if (this.colorfulConsole) {
      if (level === "错误") {
        return `${"\x1B[31m"}${baseMessage}${"\x1B[0m"}`;
      } else if (level === "警告") {
        return `${"\x1B[33m"}${baseMessage}${"\x1B[0m"}`;
      } else if (level === "信息") {
        return `${"\x1B[36m"}${baseMessage}${"\x1B[0m"}`;
      } else if (level === "调试") {
        return `${"\x1B[90m"}${baseMessage}${"\x1B[0m"}`;
      }
    }
    return baseMessage;
  }
  /**
   * 确保字符串使用UTF-8编码
   * 这个函数在Windows终端中特别有用
   * @param str 输入字符串
   * @returns UTF-8编码的字符串
   */
  ensureUtf8(str) {
    if (process.platform === "win32") {
      try {
        return Buffer.from(str, "utf8").toString("utf8");
      } catch {
        return str;
      }
    }
    return str;
  }
  /**
   * 输出调试级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  debug(message, ...args) {
    if (this.level <= LogLevel.DEBUG) {
      const formattedMessage = this.formatMessage("调试", message, ...args);
      console.log(this.ensureUtf8(formattedMessage));
      this.sendLogToMain("调试", message, ...args);
    }
  }
  /**
   * 输出信息级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  info(message, ...args) {
    if (this.level <= LogLevel.INFO) {
      const formattedMessage = this.formatMessage("信息", message, ...args);
      console.log(this.ensureUtf8(formattedMessage));
      this.sendLogToMain("信息", message, ...args);
    }
  }
  /**
   * 输出警告级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  warn(message, ...args) {
    if (this.level <= LogLevel.WARN) {
      const formattedMessage = this.formatMessage("警告", message, ...args);
      console.warn(this.ensureUtf8(formattedMessage));
      this.sendLogToMain("警告", message, ...args);
    }
  }
  /**
   * 输出错误级别日志
   * @param message 日志消息
   * @param args 额外参数
   */
  error(message, ...args) {
    if (this.level <= LogLevel.ERROR) {
      const formattedMessage = this.formatMessage("错误", message, ...args);
      console.error(this.ensureUtf8(formattedMessage));
      this.sendLogToMain("错误", message, ...args);
    }
  }
  /**
   * 通过 IPC 发送日志到主进程
   * @param level 日志级别
   * @param message 日志消息
   * @param args 额外参数
   */
  sendLogToMain(level, message, ...args) {
    if (typeof window !== "undefined") {
      try {
        const win = window;
        if (win && typeof win === "object" && "electronAPI" in win && win.electronAPI && typeof win.electronAPI === "object" && "logToFile" in win.electronAPI && typeof win.electronAPI.logToFile === "function") {
          win.electronAPI.logToFile(level, message, ...args);
        }
      } catch {
      }
    }
  }
}
const mainLogger = new Logger({ level: LogLevel.DEBUG, prefix: "主进程" });
new Logger({ level: LogLevel.DEBUG, prefix: "IPC" });
new Logger({ level: LogLevel.DEBUG, prefix: "LLM" });
new Logger({ level: LogLevel.DEBUG, prefix: "存储" });
new Logger({ level: LogLevel.DEBUG, prefix: "代理" });
({
  debug: mainLogger.debug.bind(mainLogger),
  info: mainLogger.info.bind(mainLogger),
  warn: mainLogger.warn.bind(mainLogger),
  error: mainLogger.error.bind(mainLogger)
});
async function setupGlobalEncoding() {
  process.env.LANG = "zh_CN.UTF-8";
  process.env.LC_ALL = "zh_CN.UTF-8";
  process.env.LC_CTYPE = "zh_CN.UTF-8";
  if (process.stdout && process.stdout.isTTY) {
    process.stdout.setDefaultEncoding("utf8");
  }
  if (process.stderr && process.stderr.isTTY) {
    process.stderr.setDefaultEncoding("utf8");
  }
}
setupGlobalEncoding().catch((err) => {
  console.error("设置全局编码时出错:", err);
});
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 使用不同的键名，避免覆盖可能存在的其他 ipcRenderer 暴露
  // --- 精确暴露存储相关的 invoke 通道 ---
  // 将参数类型从 any 改为 unknown，与 ipcHandler 保持一致
  readStore: (fileName, defaultValue) => electron.ipcRenderer.invoke("read-store", fileName, defaultValue),
  writeStore: (fileName, data) => electron.ipcRenderer.invoke("write-store", fileName, data),
  // 新增：列出聊天会话文件
  listChatSessions: () => electron.ipcRenderer.invoke("list-chat-sessions"),
  // 新增：删除聊天会话文件
  deleteChatSession: (fileName) => electron.ipcRenderer.invoke("delete-chat-session", fileName),
  // --- Chat Session API (Save only, List/Delete/Read via Store API) ---
  saveChatSession: (sessionId, data) => (
    // <-- 新增保存聊天会话 API
    electron.ipcRenderer.invoke("save-chat-session", sessionId, data)
  ),
  // --- Character Data API ---
  listCharacters: () => electron.ipcRenderer.invoke("list-characters"),
  saveCharacter: (character) => electron.ipcRenderer.invoke("save-character", character),
  deleteCharacter: (characterId) => (
    // <-- 参数改为 characterId
    electron.ipcRenderer.invoke("delete-character", characterId)
  ),
  // <-- 传递 characterId
  // --- Script Data API ---
  listScripts: () => electron.ipcRenderer.invoke("list-scripts"),
  saveScript: (script) => electron.ipcRenderer.invoke("save-script", script),
  deleteScript: (scriptId) => (
    // <-- 参数改为 scriptId
    electron.ipcRenderer.invoke("delete-script", scriptId)
  ),
  // <-- 传递 scriptId
  // --- LLM 服务相关 API ---
  // 修改：函数名和返回类型以匹配 AIConfig[]
  // 更新：IPC 通道名与 ipcHandlers.ts 中保持一致
  getAllAIConfigs: () => electron.ipcRenderer.invoke("get-all-ai-configs"),
  llmSetApiKey: (providerId, apiKey) => electron.ipcRenderer.invoke("llm-set-api-key", providerId, apiKey),
  // 此功能已废弃，但保留定义以防万一
  // 修改：参数从 providerId 改为 configId
  getAvailableModelsByConfigId: (configId) => electron.ipcRenderer.invoke("llm-get-available-models", configId),
  // 新增获取已保存 Keys 的 API (此功能已废弃，但保留定义)
  llmGetSavedKeys: () => electron.ipcRenderer.invoke("llm-get-saved-keys"),
  // 新增：调用聊天生成 API
  // 需要在调用处确保 options 符合 LLMChatOptions 结构 (从 './llm/BaseLLM' 导入)
  // 返回值 data 符合 LLMResponse 结构
  llmGenerateChat: (providerId, options) => electron.ipcRenderer.invoke("llm-generate-chat", providerId, options),
  // 新增：调用流式聊天生成 API (只负责启动，实际数据通过 onLLMStreamChunk 接收)
  // 修改：添加 characterId 参数
  llmGenerateChatStream: (providerId, options, characterId) => electron.ipcRenderer.invoke("llm-generate-chat-stream", providerId, options, characterId),
  // 新增：获取和保存自定义模型列表
  llmGetCustomModels: (providerId) => electron.ipcRenderer.invoke("llm-get-custom-models", providerId),
  llmSaveCustomModels: (providerId, models) => electron.ipcRenderer.invoke("llm-save-custom-models", providerId, models),
  // --- 代理相关 API ---
  proxyGetConfig: () => electron.ipcRenderer.invoke("proxy-get-config"),
  proxySetConfig: (config) => electron.ipcRenderer.invoke("proxy-set-config", config),
  proxyTestConnection: () => electron.ipcRenderer.invoke("proxy-test-connection"),
  // --- AI 配置相关 API ---
  getAIConfigsByProvider: (serviceProvider) => electron.ipcRenderer.invoke("get-ai-configs-by-provider", serviceProvider),
  addAIConfig: (configData) => electron.ipcRenderer.invoke("add-ai-config", configData),
  updateAIConfig: (configId, updates) => electron.ipcRenderer.invoke("update-ai-config", configId, updates),
  deleteAIConfig: (configId) => electron.ipcRenderer.invoke("delete-ai-config", configId),
  // 新增：根据 ID 获取单个 AI 配置
  getAIConfigById: (configId) => electron.ipcRenderer.invoke("get-ai-config-by-id", configId),
  // 新增：获取支持的服务商列表
  getSupportedServiceProviders: () => electron.ipcRenderer.invoke("get-supported-service-providers"),
  // 如果还需要通用的 on/off/send，可以在这里单独暴露，或者按需添加
  // on: (channel, listener) => { /* ... 安全实现 ... */ },
  // send: (channel, data) => { /* ... 安全实现 ... */ },
  // --- 新增：处理 LLM 流式响应 ---
  // 定义流式数据块的预期结构 (可以根据实际情况调整)
  // type LLMStreamChunk = { text?: string; error?: string; done?: boolean; usage?: object; metrics?: object; search?: object; mcpToolResponse?: object; generateImage?: object };
  // 暂时使用 unknown，在接收端进行类型检查
  // 修改：回调函数接收包含 chunk 和 sourceId 的对象
  onLLMStreamChunk: (listener) => {
    const channel = "llm-stream-chunk";
    const internalListener = (_event, data) => {
      listener(data);
    };
    electron.ipcRenderer.on(channel, internalListener);
    return {
      dispose: () => {
        electron.ipcRenderer.removeListener(channel, internalListener);
        mainLogger.info(`已移除监听器: ${channel}`);
      }
    };
  },
  // 日志 API
  logToFile: (level, message, ...args) => {
    electron.ipcRenderer.send("log-message", level, message, ...args);
  }
  // 你可以在这里暴露其他需要的 API。
});
function domReady(condition = ["complete", "interactive"]) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true);
    } else {
      document.addEventListener("readystatechange", () => {
        if (condition.includes(document.readyState)) {
          resolve(true);
        }
      });
    }
  });
}
const safeDOM = {
  append(parent, child) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      return parent.appendChild(child);
    }
  },
  remove(parent, child) {
    if (Array.from(parent.children).find((e) => e === child)) {
      return parent.removeChild(child);
    }
  }
};
function createLoadingIndicator() {
  const className = `loaders-css__square-spin`;
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `;
  const oStyle = document.createElement("style");
  const oDiv = document.createElement("div");
  oStyle.id = "app-loading-style";
  oStyle.innerHTML = styleContent;
  oDiv.className = "app-loading-wrap";
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`;
  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle);
      safeDOM.append(document.body, oDiv);
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle);
      safeDOM.remove(document.body, oDiv);
    }
  };
}
const { appendLoading, removeLoading } = createLoadingIndicator();
domReady().then(appendLoading);
window.onmessage = (ev) => {
  if (ev.data && ev.data.payload === "removeLoading") {
    mainLogger.info("收到移除加载指示器的消息");
    removeLoading();
  }
};
setTimeout(removeLoading, 4999);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC5tanMiLCJzb3VyY2VzIjpbIi4uL2VsZWN0cm9uL3V0aWxzL2xvZ1R5cGVzLnRzIiwiLi4vZWxlY3Ryb24vdXRpbHMvbG9nQ29uZmlnLnRzIiwiLi4vZWxlY3Ryb24vdXRpbHMvbG9nZ2VyLnRzIiwiLi4vZWxlY3Ryb24vdXRpbHMvZW5jb2RpbmcudHMiLCIuLi9lbGVjdHJvbi9wcmVsb2FkLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDml6Xlv5fnsbvlnovlrprkuYlcclxuICog5YyF5ZCr5pel5b+X57qn5Yir5p6a5Li+5ZKM5pel5b+X6YWN572u5o6l5Y+jXHJcbiAqL1xyXG5cclxuLy8g5pel5b+X57qn5Yir5p6a5Li+XHJcbmV4cG9ydCBlbnVtIExvZ0xldmVsIHtcclxuICBERUJVRyA9IDAsXHJcbiAgSU5GTyA9IDEsXHJcbiAgV0FSTiA9IDIsXHJcbiAgRVJST1IgPSAzLFxyXG59XHJcblxyXG4vLyDml6Xlv5fphY3nva7mjqXlj6NcclxuZXhwb3J0IGludGVyZmFjZSBMb2dDb25maWcge1xyXG4gIC8vIOWFqOWxgOaXpeW/l+e6p+WIq1xyXG4gIGdsb2JhbExldmVsOiBMb2dMZXZlbDtcclxuICAvLyDlkITmqKHlnZfml6Xlv5fnuqfliKtcclxuICBtb2R1bGVMZXZlbHM6IHtcclxuICAgIG1haW46IExvZ0xldmVsO1xyXG4gICAgaXBjOiBMb2dMZXZlbDtcclxuICAgIGxsbTogTG9nTGV2ZWw7XHJcbiAgICBzdG9yYWdlOiBMb2dMZXZlbDtcclxuICAgIHByb3h5OiBMb2dMZXZlbDtcclxuICB9O1xyXG4gIC8vIOaYr+WQpuWcqOaXpeW/l+S4reaYvuekuuaXtumXtOaIs1xyXG4gIHNob3dUaW1lc3RhbXA6IGJvb2xlYW47XHJcbiAgLy8g5piv5ZCm5Zyo5o6n5Yi25Y+w6L6T5Ye65b2p6Imy5pel5b+XXHJcbiAgY29sb3JmdWxDb25zb2xlOiBib29sZWFuO1xyXG4gIC8vIOaYr+WQpuWwhuaXpeW/l+WGmeWFpeaWh+S7tlxyXG4gIGxvZ1RvRmlsZTogYm9vbGVhbjtcclxuICAvLyDml6Xlv5fmlofku7bot6/lvoRcclxuICBsb2dGaWxlUGF0aD86IHN0cmluZztcclxufVxyXG5cclxuLy8g5pel5b+X5Zmo6YWN572u5o6l5Y+jXHJcbmV4cG9ydCBpbnRlcmZhY2UgTG9nZ2VyQ29uZmlnIHtcclxuICBsZXZlbDogTG9nTGV2ZWw7IC8vIOaXpeW/l+e6p+WIq1xyXG4gIHByZWZpeD86IHN0cmluZzsgLy8g5pel5b+X5YmN57yAXHJcbiAgc2hvd1RpbWVzdGFtcD86IGJvb2xlYW47IC8vIOaYr+WQpuaYvuekuuaXtumXtOaIs1xyXG4gIGNvbG9yZnVsQ29uc29sZT86IGJvb2xlYW47IC8vIOaYr+WQpuWcqOaOp+WItuWPsOi+k+WHuuW9qeiJsuaXpeW/l1xyXG59XHJcbiIsIi8qKlxyXG4gKiDml6Xlv5fphY3nva7mlofku7ZcclxuICog57uf5LiA566h55CG5pel5b+X6L6T5Ye66YWN572uXHJcbiAqL1xyXG5pbXBvcnQgeyBMb2dMZXZlbCwgTG9nQ29uZmlnIH0gZnJvbSAnLi9sb2dUeXBlcyc7XHJcblxyXG4vKipcclxuICog6buY6K6k5pel5b+X6YWN572uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZGVmYXVsdExvZ0NvbmZpZzogTG9nQ29uZmlnID0ge1xyXG4gIGdsb2JhbExldmVsOiBMb2dMZXZlbC5ERUJVRyxcclxuICBtb2R1bGVMZXZlbHM6IHtcclxuICAgIG1haW46IExvZ0xldmVsLkRFQlVHLFxyXG4gICAgaXBjOiBMb2dMZXZlbC5ERUJVRyxcclxuICAgIGxsbTogTG9nTGV2ZWwuREVCVUcsXHJcbiAgICBzdG9yYWdlOiBMb2dMZXZlbC5ERUJVRyxcclxuICAgIHByb3h5OiBMb2dMZXZlbC5ERUJVRyxcclxuICB9LFxyXG4gIHNob3dUaW1lc3RhbXA6IHRydWUsXHJcbiAgY29sb3JmdWxDb25zb2xlOiB0cnVlLFxyXG4gIGxvZ1RvRmlsZTogdHJ1ZSwgLy8g5ZCv55So5pel5b+X5paH5Lu25Yqf6IO9XHJcbn07XHJcblxyXG4vKipcclxuICog6I635Y+W5pel5b+X6YWN572uXHJcbiAqIEByZXR1cm5zIOaXpeW/l+mFjee9rlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExvZ0NvbmZpZygpOiBMb2dDb25maWcge1xyXG4gIC8vIOi/memHjOWPr+S7peS7jumFjee9ruaWh+S7tuaIlueOr+Wig+WPmOmHj+S4reivu+WPlumFjee9rlxyXG4gIC8vIOaaguaXtui/lOWbnum7mOiupOmFjee9rlxyXG4gIHJldHVybiBkZWZhdWx0TG9nQ29uZmlnO1xyXG59XHJcblxyXG4vKipcclxuICog6buY6K6k5a+85Ye6XHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgZ2V0TG9nQ29uZmlnLFxyXG4gIGRlZmF1bHRMb2dDb25maWcsXHJcbn07XHJcbiIsIi8qKlxyXG4gKiDml6Xlv5flt6XlhbfnsbtcclxuICog57uf5LiA566h55CG5pel5b+X6L6T5Ye677yM56Gu5L+d5omA5pyJ5pel5b+X6YO95L2/55So5rGJ6K+t77yM5bm25LiU6L6T5Ye65Yiw5o6n5Yi25Y+w5ZKM5byA5Y+R6ICF5bel5YW35pe25L2/55SoVVRGLTjnvJbnoIFcclxuICovXHJcbmltcG9ydCB7IGdldExvZ0NvbmZpZyB9IGZyb20gJy4vbG9nQ29uZmlnJztcclxuaW1wb3J0IHsgTG9nTGV2ZWwsIExvZ2dlckNvbmZpZyB9IGZyb20gJy4vbG9nVHlwZXMnO1xyXG5cclxuLy8g5o6n5Yi25Y+w6aKc6Imy5Luj56CBXHJcbmVudW0gQ29uc29sZUNvbG9yIHtcclxuICBSZXNldCA9ICdcXHgxYlswbScsXHJcbiAgRmdSZWQgPSAnXFx4MWJbMzFtJyxcclxuICBGZ1llbGxvdyA9ICdcXHgxYlszM20nLFxyXG4gIEZnQ3lhbiA9ICdcXHgxYlszNm0nLFxyXG4gIEZnR3JheSA9ICdcXHgxYls5MG0nLFxyXG59XHJcblxyXG4vKipcclxuICog5pel5b+X5bel5YW357G7XHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTG9nZ2VyIHtcclxuICBwcml2YXRlIGxldmVsOiBMb2dMZXZlbDtcclxuICBwcml2YXRlIHByZWZpeDogc3RyaW5nO1xyXG4gIHByaXZhdGUgc2hvd1RpbWVzdGFtcDogYm9vbGVhbjtcclxuICBwcml2YXRlIGNvbG9yZnVsQ29uc29sZTogYm9vbGVhbjtcclxuXHJcbiAgLyoqXHJcbiAgICog5p6E6YCg5Ye95pWwXHJcbiAgICogQHBhcmFtIGNvbmZpZyDml6Xlv5fphY3nva5cclxuICAgKi9cclxuICBjb25zdHJ1Y3Rvcihjb25maWc6IExvZ2dlckNvbmZpZykge1xyXG4gICAgY29uc3QgZ2xvYmFsQ29uZmlnID0gZ2V0TG9nQ29uZmlnKCk7XHJcbiAgICB0aGlzLmxldmVsID0gY29uZmlnLmxldmVsO1xyXG4gICAgdGhpcy5wcmVmaXggPSBjb25maWcucHJlZml4IHx8ICcnO1xyXG4gICAgdGhpcy5zaG93VGltZXN0YW1wID0gY29uZmlnLnNob3dUaW1lc3RhbXAgIT09IHVuZGVmaW5lZCA/IGNvbmZpZy5zaG93VGltZXN0YW1wIDogZ2xvYmFsQ29uZmlnLnNob3dUaW1lc3RhbXA7XHJcbiAgICB0aGlzLmNvbG9yZnVsQ29uc29sZSA9IGNvbmZpZy5jb2xvcmZ1bENvbnNvbGUgIT09IHVuZGVmaW5lZCA/IGNvbmZpZy5jb2xvcmZ1bENvbnNvbGUgOiBnbG9iYWxDb25maWcuY29sb3JmdWxDb25zb2xlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog5qC85byP5YyW5pel5b+X5raI5oGvXHJcbiAgICogQHBhcmFtIGxldmVsIOaXpeW/l+e6p+WIq1xyXG4gICAqIEBwYXJhbSBtZXNzYWdlIOaXpeW/l+a2iOaBr1xyXG4gICAqIEBwYXJhbSBhcmdzIOmineWkluWPguaVsFxyXG4gICAqIEByZXR1cm5zIOagvOW8j+WMluWQjueahOaXpeW/l+a2iOaBr1xyXG4gICAqL1xyXG4gIHByaXZhdGUgZm9ybWF0TWVzc2FnZShsZXZlbDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHN0cmluZyB7XHJcbiAgICBjb25zdCB0aW1lc3RhbXAgPSB0aGlzLnNob3dUaW1lc3RhbXAgPyBgWyR7bmV3IERhdGUoKS50b0xvY2FsZVN0cmluZygnemgtQ04nKX1dIGAgOiAnJztcclxuICAgIGNvbnN0IHByZWZpeCA9IHRoaXMucHJlZml4ID8gYFske3RoaXMucHJlZml4fV0gYCA6ICcnO1xyXG4gICAgY29uc3QgbGV2ZWxTdHIgPSBgWyR7bGV2ZWx9XSBgO1xyXG5cclxuICAgIC8vIOWwhumdnuWtl+espuS4suWPguaVsOi9rOaNouS4uuWtl+espuS4slxyXG4gICAgY29uc3QgZm9ybWF0dGVkQXJncyA9IGFyZ3MubWFwKGFyZyA9PiB7XHJcbiAgICAgIGlmICh0eXBlb2YgYXJnID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnKTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgIHJldHVybiBTdHJpbmcoYXJnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIFN0cmluZyhhcmcpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgYmFzZU1lc3NhZ2UgPSBgJHt0aW1lc3RhbXB9JHtwcmVmaXh9JHtsZXZlbFN0cn0ke21lc3NhZ2V9ICR7Zm9ybWF0dGVkQXJncy5qb2luKCcgJyl9YC50cmltKCk7XHJcblxyXG4gICAgLy8g5aaC5p6c5ZCv55So5LqG5b2p6Imy6L6T5Ye677yM5qC55o2u5pel5b+X57qn5Yir5re75Yqg6aKc6ImyXHJcbiAgICBpZiAodGhpcy5jb2xvcmZ1bENvbnNvbGUpIHtcclxuICAgICAgaWYgKGxldmVsID09PSAn6ZSZ6K+vJykge1xyXG4gICAgICAgIHJldHVybiBgJHtDb25zb2xlQ29sb3IuRmdSZWR9JHtiYXNlTWVzc2FnZX0ke0NvbnNvbGVDb2xvci5SZXNldH1gOyAvLyDnuqLoibJcclxuICAgICAgfSBlbHNlIGlmIChsZXZlbCA9PT0gJ+itpuWRiicpIHtcclxuICAgICAgICByZXR1cm4gYCR7Q29uc29sZUNvbG9yLkZnWWVsbG93fSR7YmFzZU1lc3NhZ2V9JHtDb25zb2xlQ29sb3IuUmVzZXR9YDsgLy8g6buE6ImyXHJcbiAgICAgIH0gZWxzZSBpZiAobGV2ZWwgPT09ICfkv6Hmga8nKSB7XHJcbiAgICAgICAgcmV0dXJuIGAke0NvbnNvbGVDb2xvci5GZ0N5YW59JHtiYXNlTWVzc2FnZX0ke0NvbnNvbGVDb2xvci5SZXNldH1gOyAvLyDpnZLoibJcclxuICAgICAgfSBlbHNlIGlmIChsZXZlbCA9PT0gJ+iwg+ivlScpIHtcclxuICAgICAgICByZXR1cm4gYCR7Q29uc29sZUNvbG9yLkZnR3JheX0ke2Jhc2VNZXNzYWdlfSR7Q29uc29sZUNvbG9yLlJlc2V0fWA7IC8vIOeBsOiJslxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGJhc2VNZXNzYWdlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog56Gu5L+d5a2X56ym5Liy5L2/55SoVVRGLTjnvJbnoIFcclxuICAgKiDov5nkuKrlh73mlbDlnKhXaW5kb3dz57uI56uv5Lit54m55Yir5pyJ55SoXHJcbiAgICogQHBhcmFtIHN0ciDovpPlhaXlrZfnrKbkuLJcclxuICAgKiBAcmV0dXJucyBVVEYtOOe8lueggeeahOWtl+espuS4slxyXG4gICAqL1xyXG4gIHByaXZhdGUgZW5zdXJlVXRmOChzdHI6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICAvLyDlnKhXaW5kb3dz5bmz5Y+w5LiK77yM57uI56uv5Y+v6IO95LiN5L2/55SoVVRGLTjnvJbnoIFcclxuICAgIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgLy8g5bCd6K+V5bCG5a2X56ym5Liy6L2s5o2i5Li6QnVmZmVy5YaN6L2s5Zue5a2X56ym5Liy77yM56Gu5L+dVVRGLTjnvJbnoIFcclxuICAgICAgICByZXR1cm4gQnVmZmVyLmZyb20oc3RyLCAndXRmOCcpLnRvU3RyaW5nKCd1dGY4Jyk7XHJcbiAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgIHJldHVybiBzdHI7IC8vIOWmguaenOi9rOaNouWksei0pe+8jOi/lOWbnuWOn+Wni+Wtl+espuS4slxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3RyOyAvLyDpnZ5XaW5kb3dz5bmz5Y+w55u05o6l6L+U5ZueXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDovpPlh7rosIPor5XnuqfliKvml6Xlv5dcclxuICAgKiBAcGFyYW0gbWVzc2FnZSDml6Xlv5fmtojmga9cclxuICAgKiBAcGFyYW0gYXJncyDpop3lpJblj4LmlbBcclxuICAgKi9cclxuICBkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMubGV2ZWwgPD0gTG9nTGV2ZWwuREVCVUcpIHtcclxuICAgICAgY29uc3QgZm9ybWF0dGVkTWVzc2FnZSA9IHRoaXMuZm9ybWF0TWVzc2FnZSgn6LCD6K+VJywgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKHRoaXMuZW5zdXJlVXRmOChmb3JtYXR0ZWRNZXNzYWdlKSk7XHJcblxyXG4gICAgICAvLyDlpoLmnpzlnKjmuLLmn5Pov5vnqIvkuK3vvIzpgJrov4cgSVBDIOWPkemAgeaXpeW/l+WIsOS4u+i/m+eoi1xyXG4gICAgICB0aGlzLnNlbmRMb2dUb01haW4oJ+iwg+ivlScsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICog6L6T5Ye65L+h5oGv57qn5Yir5pel5b+XXHJcbiAgICogQHBhcmFtIG1lc3NhZ2Ug5pel5b+X5raI5oGvXHJcbiAgICogQHBhcmFtIGFyZ3Mg6aKd5aSW5Y+C5pWwXHJcbiAgICovXHJcbiAgaW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMubGV2ZWwgPD0gTG9nTGV2ZWwuSU5GTykge1xyXG4gICAgICBjb25zdCBmb3JtYXR0ZWRNZXNzYWdlID0gdGhpcy5mb3JtYXRNZXNzYWdlKCfkv6Hmga8nLCBtZXNzYWdlLCAuLi5hcmdzKTtcclxuICAgICAgY29uc29sZS5sb2codGhpcy5lbnN1cmVVdGY4KGZvcm1hdHRlZE1lc3NhZ2UpKTtcclxuXHJcbiAgICAgIC8vIOWmguaenOWcqOa4suafk+i/m+eoi+S4re+8jOmAmui/hyBJUEMg5Y+R6YCB5pel5b+X5Yiw5Li76L+b56iLXHJcbiAgICAgIHRoaXMuc2VuZExvZ1RvTWFpbign5L+h5oGvJywgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDovpPlh7rorablkYrnuqfliKvml6Xlv5dcclxuICAgKiBAcGFyYW0gbWVzc2FnZSDml6Xlv5fmtojmga9cclxuICAgKiBAcGFyYW0gYXJncyDpop3lpJblj4LmlbBcclxuICAgKi9cclxuICB3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5sZXZlbCA8PSBMb2dMZXZlbC5XQVJOKSB7XHJcbiAgICAgIGNvbnN0IGZvcm1hdHRlZE1lc3NhZ2UgPSB0aGlzLmZvcm1hdE1lc3NhZ2UoJ+itpuWRiicsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xyXG4gICAgICBjb25zb2xlLndhcm4odGhpcy5lbnN1cmVVdGY4KGZvcm1hdHRlZE1lc3NhZ2UpKTtcclxuXHJcbiAgICAgIC8vIOWmguaenOWcqOa4suafk+i/m+eoi+S4re+8jOmAmui/hyBJUEMg5Y+R6YCB5pel5b+X5Yiw5Li76L+b56iLXHJcbiAgICAgIHRoaXMuc2VuZExvZ1RvTWFpbign6K2m5ZGKJywgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDovpPlh7rplJnor6/nuqfliKvml6Xlv5dcclxuICAgKiBAcGFyYW0gbWVzc2FnZSDml6Xlv5fmtojmga9cclxuICAgKiBAcGFyYW0gYXJncyDpop3lpJblj4LmlbBcclxuICAgKi9cclxuICBlcnJvcihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMubGV2ZWwgPD0gTG9nTGV2ZWwuRVJST1IpIHtcclxuICAgICAgY29uc3QgZm9ybWF0dGVkTWVzc2FnZSA9IHRoaXMuZm9ybWF0TWVzc2FnZSgn6ZSZ6K+vJywgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IodGhpcy5lbnN1cmVVdGY4KGZvcm1hdHRlZE1lc3NhZ2UpKTtcclxuXHJcbiAgICAgIC8vIOWmguaenOWcqOa4suafk+i/m+eoi+S4re+8jOmAmui/hyBJUEMg5Y+R6YCB5pel5b+X5Yiw5Li76L+b56iLXHJcbiAgICAgIHRoaXMuc2VuZExvZ1RvTWFpbign6ZSZ6K+vJywgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDpgJrov4cgSVBDIOWPkemAgeaXpeW/l+WIsOS4u+i/m+eoi1xyXG4gICAqIEBwYXJhbSBsZXZlbCDml6Xlv5fnuqfliKtcclxuICAgKiBAcGFyYW0gbWVzc2FnZSDml6Xlv5fmtojmga9cclxuICAgKiBAcGFyYW0gYXJncyDpop3lpJblj4LmlbBcclxuICAgKi9cclxuICBwcml2YXRlIHNlbmRMb2dUb01haW4obGV2ZWw6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcclxuICAgIC8vIOajgOafpeaYr+WQpuWcqOa4suafk+i/m+eoi+S4rVxyXG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgLy8g5L2/55SoIHVua25vd24g57G75Z6L5Luj5pu/IGFuee+8jOeEtuWQjui/m+ihjOexu+Wei+ajgOafpVxyXG4gICAgICAgIGNvbnN0IHdpbiA9IHdpbmRvdyBhcyB1bmtub3duO1xyXG4gICAgICAgIC8vIOS9v+eUqOexu+Wei+WuiOWNq+ajgOafpSBlbGVjdHJvbkFQSSDlsZ7mgKdcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICB3aW4gJiZcclxuICAgICAgICAgIHR5cGVvZiB3aW4gPT09ICdvYmplY3QnICYmXHJcbiAgICAgICAgICAnZWxlY3Ryb25BUEknIGluIHdpbiAmJlxyXG4gICAgICAgICAgd2luLmVsZWN0cm9uQVBJICYmXHJcbiAgICAgICAgICB0eXBlb2Ygd2luLmVsZWN0cm9uQVBJID09PSAnb2JqZWN0JyAmJlxyXG4gICAgICAgICAgJ2xvZ1RvRmlsZScgaW4gd2luLmVsZWN0cm9uQVBJICYmXHJcbiAgICAgICAgICB0eXBlb2Ygd2luLmVsZWN0cm9uQVBJLmxvZ1RvRmlsZSA9PT0gJ2Z1bmN0aW9uJ1xyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgd2luLmVsZWN0cm9uQVBJLmxvZ1RvRmlsZShsZXZlbCwgbWVzc2FnZSwgLi4uYXJncyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyDlv73nlaXplJnor6/vvIzpgb/lhY3lvqrnjq/osIPnlKhcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLy8g5Yib5bu66buY6K6k5pel5b+X5a6e5L6LXHJcbmV4cG9ydCBjb25zdCBtYWluTG9nZ2VyID0gbmV3IExvZ2dlcih7IGxldmVsOiBMb2dMZXZlbC5ERUJVRywgcHJlZml4OiAn5Li76L+b56iLJyB9KTtcclxuZXhwb3J0IGNvbnN0IGlwY0xvZ2dlciA9IG5ldyBMb2dnZXIoeyBsZXZlbDogTG9nTGV2ZWwuREVCVUcsIHByZWZpeDogJ0lQQycgfSk7XHJcbmV4cG9ydCBjb25zdCBsbG1Mb2dnZXIgPSBuZXcgTG9nZ2VyKHsgbGV2ZWw6IExvZ0xldmVsLkRFQlVHLCBwcmVmaXg6ICdMTE0nIH0pO1xyXG5leHBvcnQgY29uc3Qgc3RvcmFnZUxvZ2dlciA9IG5ldyBMb2dnZXIoeyBsZXZlbDogTG9nTGV2ZWwuREVCVUcsIHByZWZpeDogJ+WtmOWCqCcgfSk7XHJcbmV4cG9ydCBjb25zdCBwcm94eUxvZ2dlciA9IG5ldyBMb2dnZXIoeyBsZXZlbDogTG9nTGV2ZWwuREVCVUcsIHByZWZpeDogJ+S7o+eQhicgfSk7XHJcblxyXG4vLyDlr7zlh7rpu5jorqTml6Xlv5flh73mlbDvvIzmlrnkvr/nm7TmjqXkvb/nlKhcclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gIGRlYnVnOiBtYWluTG9nZ2VyLmRlYnVnLmJpbmQobWFpbkxvZ2dlciksXHJcbiAgaW5mbzogbWFpbkxvZ2dlci5pbmZvLmJpbmQobWFpbkxvZ2dlciksXHJcbiAgd2FybjogbWFpbkxvZ2dlci53YXJuLmJpbmQobWFpbkxvZ2dlciksXHJcbiAgZXJyb3I6IG1haW5Mb2dnZXIuZXJyb3IuYmluZChtYWluTG9nZ2VyKSxcclxufTtcclxuIiwiLyoqXHJcbiAqIOe8lueggeW3peWFt+exu1xyXG4gKiDnu5/kuIDnrqHnkIbnvJbnoIHorr7nva7vvIznoa7kv53miYDmnInmtonlj4rnvJbnoIHnmoTlnLDmlrnpg73kvb/nlKhVVEYtOFxyXG4gKi9cclxuXHJcbi8qKlxyXG4gKiDorr7nva7lhajlsYDnvJbnoIHkuLpVVEYtOFxyXG4gKiDov5nkuKrlh73mlbDlupTor6XlnKjlupTnlKjlkK/liqjml7bosIPnlKhcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXR1cEdsb2JhbEVuY29kaW5nKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gIC8vIOiuvue9rk5vZGUuanPov5vnqIvnmoTnvJbnoIFcclxuICBwcm9jZXNzLmVudi5MQU5HID0gJ3poX0NOLlVURi04JztcclxuICBwcm9jZXNzLmVudi5MQ19BTEwgPSAnemhfQ04uVVRGLTgnO1xyXG4gIHByb2Nlc3MuZW52LkxDX0NUWVBFID0gJ3poX0NOLlVURi04JztcclxuXHJcbiAgLy8g6K6+572u5o6n5Yi25Y+w6L6T5Ye657yW56CBXHJcbiAgaWYgKHByb2Nlc3Muc3Rkb3V0ICYmIHByb2Nlc3Muc3Rkb3V0LmlzVFRZKSB7XHJcbiAgICBwcm9jZXNzLnN0ZG91dC5zZXREZWZhdWx0RW5jb2RpbmcoJ3V0ZjgnKTtcclxuICB9XHJcbiAgaWYgKHByb2Nlc3Muc3RkZXJyICYmIHByb2Nlc3Muc3RkZXJyLmlzVFRZKSB7XHJcbiAgICBwcm9jZXNzLnN0ZGVyci5zZXREZWZhdWx0RW5jb2RpbmcoJ3V0ZjgnKTtcclxuICB9XHJcblxyXG4gIC8vIOazqOaEj++8muaIkeS7rOS4jeWGjeWcqOi/memHjOiuvue9rldpbmRvd3PmjqfliLblj7Dku6PnoIHpobVcclxuICAvLyDov5nkuKrmk43kvZzlt7Lnu4/np7vliLBtYWluLnRz5Lit77yM5Lul6YG/5YWN6YeN5aSN5omn6KGMXHJcbn1cclxuXHJcbi8qKlxyXG4gKiDmlofku7bor7vlhpnpgInpobnvvIzlvLrliLbkvb/nlKhVVEYtOOe8lueggVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IFVURjhfT1BUSU9OUyA9IHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSBhcyBjb25zdDtcclxuXHJcbi8qKlxyXG4gKiDnoa7kv53lrZfnrKbkuLLkvb/nlKhVVEYtOOe8lueggVxyXG4gKiDov5nkuKrlh73mlbDlnKhXaW5kb3dz57uI56uv5Lit54m55Yir5pyJ55SoXHJcbiAqIEBwYXJhbSBzdHIg6L6T5YWl5a2X56ym5LiyXHJcbiAqIEByZXR1cm5zIFVURi0457yW56CB55qE5a2X56ym5LiyXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlVXRmOChzdHI6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgLy8g5ZyoV2luZG93c+W5s+WPsOS4iu+8jOe7iOerr+WPr+iDveS4jeS9v+eUqFVURi0457yW56CBXHJcbiAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIOWwneivleWwhuWtl+espuS4sui9rOaNouS4ukJ1ZmZlcuWGjei9rOWbnuWtl+espuS4su+8jOehruS/nVVURi0457yW56CBXHJcbiAgICAgIHJldHVybiBCdWZmZXIuZnJvbShzdHIsICd1dGY4JykudG9TdHJpbmcoJ3V0ZjgnKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+i9rOaNouWtl+espuS4suWIsFVURi0457yW56CB5pe25Ye66ZSZOicsIGVycm9yKTtcclxuICAgICAgcmV0dXJuIHN0cjsgLy8g5aaC5p6c6L2s5o2i5aSx6LSl77yM6L+U5Zue5Y6f5aeL5a2X56ym5LiyXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBzdHI7IC8vIOmdnldpbmRvd3PlubPlj7Dnm7TmjqXov5Tlm55cclxufVxyXG5cclxuLyoqXHJcbiAqIOm7mOiupOWvvOWHulxyXG4gKi9cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gIHNldHVwR2xvYmFsRW5jb2RpbmcsXHJcbiAgVVRGOF9PUFRJT05TLFxyXG4gIGVuc3VyZVV0ZjgsXHJcbn07XHJcbiIsImltcG9ydCB7IGNvbnRleHRCcmlkZ2UsIGlwY1JlbmRlcmVyIH0gZnJvbSAnZWxlY3Ryb24nO1xyXG5pbXBvcnQgdHlwZSB7IExMTUNoYXRPcHRpb25zLCBMTE1SZXNwb25zZSB9IGZyb20gJy4vbGxtL0Jhc2VMTE0nO1xyXG5pbXBvcnQgdHlwZSB7IFByb3h5Q29uZmlnIH0gZnJvbSAnLi9Qcm94eU1hbmFnZXInO1xyXG4vLyDlr7zlhaXop5LoibLlkozliafmnKznsbvlnovvvIznoa7kv53kuI7lkI7nq6/lkozliY3nq6/kvb/nlKjnmoTnsbvlnovkuIDoh7RcclxuaW1wb3J0IHR5cGUgeyBBSUNoYXJhY3RlciwgU2NyaXB0LCBBSUNvbmZpZyB9IGZyb20gJy4uL3NyYy90eXBlcyc7IC8vIOWvvOWFpSBBSUNvbmZpZyDnsbvlnotcclxuaW1wb3J0IHsgbWFpbkxvZ2dlciBhcyBsb2dnZXIgfSBmcm9tICcuL3V0aWxzL2xvZ2dlcic7IC8vIOWvvOWFpeaXpeW/l+W3peWFt1xyXG5pbXBvcnQgeyBzZXR1cEdsb2JhbEVuY29kaW5nIH0gZnJvbSAnLi91dGlscy9lbmNvZGluZyc7IC8vIOWvvOWFpee8lueggeW3peWFt1xyXG5cclxuLy8g6K6+572u5YWo5bGA57yW56CB5Li6VVRGLThcclxuc2V0dXBHbG9iYWxFbmNvZGluZygpLmNhdGNoKGVyciA9PiB7XHJcbiAgY29uc29sZS5lcnJvcign6K6+572u5YWo5bGA57yW56CB5pe25Ye66ZSZOicsIGVycik7XHJcbn0pO1xyXG5cclxuLy8gLS0tLS0tLS0tIOWQkea4suafk+i/m+eoi+aatOmcsumAieaLqeaAp+eahCBBUEkgLS0tLS0tLS0tXHJcbmNvbnRleHRCcmlkZ2UuZXhwb3NlSW5NYWluV29ybGQoJ2VsZWN0cm9uQVBJJywgeyAvLyDkvb/nlKjkuI3lkIznmoTplK7lkI3vvIzpgb/lhY3opobnm5blj6/og73lrZjlnKjnmoTlhbbku5YgaXBjUmVuZGVyZXIg5pq06ZyyXHJcbiAgLy8gLS0tIOeyvuehruaatOmcsuWtmOWCqOebuOWFs+eahCBpbnZva2Ug6YCa6YGTIC0tLVxyXG4gIC8vIOWwhuWPguaVsOexu+Wei+S7jiBhbnkg5pS55Li6IHVua25vd27vvIzkuI4gaXBjSGFuZGxlciDkv53mjIHkuIDoh7RcclxuICByZWFkU3RvcmU6IChmaWxlTmFtZTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IHVua25vd24pOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IHVua25vd247IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ3JlYWQtc3RvcmUnLCBmaWxlTmFtZSwgZGVmYXVsdFZhbHVlKSxcclxuICB3cml0ZVN0b3JlOiAoZmlsZU5hbWU6IHN0cmluZywgZGF0YTogdW5rbm93bik6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCd3cml0ZS1zdG9yZScsIGZpbGVOYW1lLCBkYXRhKSxcclxuICAvLyDmlrDlop7vvJrliJflh7rogYrlpKnkvJror53mlofku7ZcclxuICBsaXN0Q2hhdFNlc3Npb25zOiAoKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBzdHJpbmdbXTsgZXJyb3I/OiBzdHJpbmcgfT4gPT5cclxuICAgIGlwY1JlbmRlcmVyLmludm9rZSgnbGlzdC1jaGF0LXNlc3Npb25zJyksXHJcbiAgLy8g5paw5aKe77ya5Yig6Zmk6IGK5aSp5Lya6K+d5paH5Lu2XHJcbiAgZGVsZXRlQ2hhdFNlc3Npb246IChmaWxlTmFtZTogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2RlbGV0ZS1jaGF0LXNlc3Npb24nLCBmaWxlTmFtZSksXHJcblxyXG4gIC8vIC0tLSBDaGF0IFNlc3Npb24gQVBJIChTYXZlIG9ubHksIExpc3QvRGVsZXRlL1JlYWQgdmlhIFN0b3JlIEFQSSkgLS0tXHJcbiAgc2F2ZUNoYXRTZXNzaW9uOiAoc2Vzc2lvbklkOiBzdHJpbmcsIGRhdGE6IHVua25vd24pOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4gPT4gLy8gPC0tIOaWsOWinuS/neWtmOiBiuWkqeS8muivnSBBUElcclxuICAgIGlwY1JlbmRlcmVyLmludm9rZSgnc2F2ZS1jaGF0LXNlc3Npb24nLCBzZXNzaW9uSWQsIGRhdGEpLFxyXG5cclxuICAvLyAtLS0gQ2hhcmFjdGVyIERhdGEgQVBJIC0tLVxyXG4gIGxpc3RDaGFyYWN0ZXJzOiAoKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBBSUNoYXJhY3RlcltdOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCdsaXN0LWNoYXJhY3RlcnMnKSxcclxuICBzYXZlQ2hhcmFjdGVyOiAoY2hhcmFjdGVyOiBBSUNoYXJhY3Rlcik6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCdzYXZlLWNoYXJhY3RlcicsIGNoYXJhY3RlciksXHJcbiAgZGVsZXRlQ2hhcmFjdGVyOiAoY2hhcmFjdGVySWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PiAvLyA8LS0g5Y+C5pWw5pS55Li6IGNoYXJhY3RlcklkXHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2RlbGV0ZS1jaGFyYWN0ZXInLCBjaGFyYWN0ZXJJZCksIC8vIDwtLSDkvKDpgJIgY2hhcmFjdGVySWRcclxuXHJcbiAgLy8gLS0tIFNjcmlwdCBEYXRhIEFQSSAtLS1cclxuICBsaXN0U2NyaXB0czogKCk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogU2NyaXB0W107IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2xpc3Qtc2NyaXB0cycpLFxyXG4gIHNhdmVTY3JpcHQ6IChzY3JpcHQ6IFNjcmlwdCk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCdzYXZlLXNjcmlwdCcsIHNjcmlwdCksXHJcbiAgZGVsZXRlU2NyaXB0OiAoc2NyaXB0SWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PiAvLyA8LS0g5Y+C5pWw5pS55Li6IHNjcmlwdElkXHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2RlbGV0ZS1zY3JpcHQnLCBzY3JpcHRJZCksIC8vIDwtLSDkvKDpgJIgc2NyaXB0SWRcclxuXHJcbiAgLy8gLS0tIExMTSDmnI3liqHnm7jlhbMgQVBJIC0tLVxyXG4gIC8vIOS/ruaUue+8muWHveaVsOWQjeWSjOi/lOWbnuexu+Wei+S7peWMuemFjSBBSUNvbmZpZ1tdXHJcbiAgLy8g5pu05paw77yaSVBDIOmAmumBk+WQjeS4jiBpcGNIYW5kbGVycy50cyDkuK3kv53mjIHkuIDoh7RcclxuICBnZXRBbGxBSUNvbmZpZ3M6ICgpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IEFJQ29uZmlnW107IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2dldC1hbGwtYWktY29uZmlncycpLFxyXG4gIGxsbVNldEFwaUtleTogKHByb3ZpZGVySWQ6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2xsbS1zZXQtYXBpLWtleScsIHByb3ZpZGVySWQsIGFwaUtleSksIC8vIOatpOWKn+iDveW3suW6n+W8g++8jOS9huS/neeVmeWumuS5ieS7pemYsuS4h+S4gFxyXG4gIC8vIOS/ruaUue+8muWPguaVsOS7jiBwcm92aWRlcklkIOaUueS4uiBjb25maWdJZFxyXG4gIGdldEF2YWlsYWJsZU1vZGVsc0J5Q29uZmlnSWQ6IChjb25maWdJZDogc3RyaW5nKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBzdHJpbmdbXTsgZXJyb3I/OiBzdHJpbmcgfT4gPT5cclxuICAgIGlwY1JlbmRlcmVyLmludm9rZSgnbGxtLWdldC1hdmFpbGFibGUtbW9kZWxzJywgY29uZmlnSWQpLFxyXG4gIC8vIOaWsOWinuiOt+WPluW3suS/neWtmCBLZXlzIOeahCBBUEkgKOatpOWKn+iDveW3suW6n+W8g++8jOS9huS/neeVmeWumuS5iSlcclxuICBsbG1HZXRTYXZlZEtleXM6ICgpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bGw+OyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCdsbG0tZ2V0LXNhdmVkLWtleXMnKSxcclxuLy8g5paw5aKe77ya6LCD55So6IGK5aSp55Sf5oiQIEFQSVxyXG4gICAvLyDpnIDopoHlnKjosIPnlKjlpITnoa7kv50gb3B0aW9ucyDnrKblkIggTExNQ2hhdE9wdGlvbnMg57uT5p6EICjku44gJy4vbGxtL0Jhc2VMTE0nIOWvvOWFpSlcclxuICAgLy8g6L+U5Zue5YC8IGRhdGEg56ym5ZCIIExMTVJlc3BvbnNlIOe7k+aehFxyXG4gICBsbG1HZW5lcmF0ZUNoYXQ6IChwcm92aWRlcklkOiBzdHJpbmcsIG9wdGlvbnM6IExMTUNoYXRPcHRpb25zKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBMTE1SZXNwb25zZTsgZXJyb3I/OiBzdHJpbmcgfT4gPT5cclxuICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2xsbS1nZW5lcmF0ZS1jaGF0JywgcHJvdmlkZXJJZCwgb3B0aW9ucyksXHJcbiAgLy8g5paw5aKe77ya6LCD55So5rWB5byP6IGK5aSp55Sf5oiQIEFQSSAo5Y+q6LSf6LSj5ZCv5Yqo77yM5a6e6ZmF5pWw5o2u6YCa6L+HIG9uTExNU3RyZWFtQ2h1bmsg5o6l5pS2KVxyXG4gIC8vIOS/ruaUue+8mua3u+WKoCBjaGFyYWN0ZXJJZCDlj4LmlbBcclxuICBsbG1HZW5lcmF0ZUNoYXRTdHJlYW06IChwcm92aWRlcklkOiBzdHJpbmcsIG9wdGlvbnM6IExMTUNoYXRPcHRpb25zLCBjaGFyYWN0ZXJJZD86IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgaXBjUmVuZGVyZXIuaW52b2tlKCdsbG0tZ2VuZXJhdGUtY2hhdC1zdHJlYW0nLCBwcm92aWRlcklkLCBvcHRpb25zLCBjaGFyYWN0ZXJJZCksXHJcbi8vIOaWsOWinu+8muiOt+WPluWSjOS/neWtmOiHquWumuS5ieaooeWei+WIl+ihqFxyXG4gIGxsbUdldEN1c3RvbU1vZGVsczogKHByb3ZpZGVySWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogc3RyaW5nW107IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2xsbS1nZXQtY3VzdG9tLW1vZGVscycsIHByb3ZpZGVySWQpLFxyXG4gICBsbG1TYXZlQ3VzdG9tTW9kZWxzOiAocHJvdmlkZXJJZDogc3RyaW5nLCBtb2RlbHM6IHN0cmluZ1tdKTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdsbG0tc2F2ZS1jdXN0b20tbW9kZWxzJywgcHJvdmlkZXJJZCwgbW9kZWxzKSxcclxuXHJcbiAgIC8vIC0tLSDku6PnkIbnm7jlhbMgQVBJIC0tLVxyXG4gICBwcm94eUdldENvbmZpZzogKCk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogUHJveHlDb25maWc7IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdwcm94eS1nZXQtY29uZmlnJyksXHJcbiAgIHByb3h5U2V0Q29uZmlnOiAoY29uZmlnOiBQcm94eUNvbmZpZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgIGlwY1JlbmRlcmVyLmludm9rZSgncHJveHktc2V0LWNvbmZpZycsIGNvbmZpZyksXHJcbiAgIHByb3h5VGVzdENvbm5lY3Rpb246ICgpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IHsgaXA6IHN0cmluZzsgcHJveHlVcmw6IHN0cmluZzsgcHJveHlNb2RlOiBzdHJpbmcgfTsgZXJyb3I/OiBzdHJpbmcgfT4gPT5cclxuICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ3Byb3h5LXRlc3QtY29ubmVjdGlvbicpLFxyXG4gXHJcbiAgIC8vIC0tLSBBSSDphY3nva7nm7jlhbMgQVBJIC0tLVxyXG4gICBnZXRBSUNvbmZpZ3NCeVByb3ZpZGVyOiAoc2VydmljZVByb3ZpZGVyOiBzdHJpbmcpOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IEFJQ29uZmlnW107IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdnZXQtYWktY29uZmlncy1ieS1wcm92aWRlcicsIHNlcnZpY2VQcm92aWRlciksXHJcbiAgIGFkZEFJQ29uZmlnOiAoY29uZmlnRGF0YTogT21pdDxBSUNvbmZpZywgJ2lkJz4pOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZGF0YT86IEFJQ29uZmlnOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgIGlwY1JlbmRlcmVyLmludm9rZSgnYWRkLWFpLWNvbmZpZycsIGNvbmZpZ0RhdGEpLFxyXG4gICB1cGRhdGVBSUNvbmZpZzogKGNvbmZpZ0lkOiBzdHJpbmcsIHVwZGF0ZXM6IFBhcnRpYWw8T21pdDxBSUNvbmZpZywgJ2lkJz4+KTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IGRhdGE/OiBBSUNvbmZpZzsgZXJyb3I/OiBzdHJpbmcgfT4gPT5cclxuICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ3VwZGF0ZS1haS1jb25maWcnLCBjb25maWdJZCwgdXBkYXRlcyksXHJcbiAgIGRlbGV0ZUFJQ29uZmlnOiAoY29uZmlnSWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiA9PlxyXG4gICAgIGlwY1JlbmRlcmVyLmludm9rZSgnZGVsZXRlLWFpLWNvbmZpZycsIGNvbmZpZ0lkKSxcclxuICAgLy8g5paw5aKe77ya5qC55o2uIElEIOiOt+WPluWNleS4qiBBSSDphY3nva5cclxuICAgZ2V0QUlDb25maWdCeUlkOiAoY29uZmlnSWQ6IHN0cmluZyk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogQUlDb25maWc7IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdnZXQtYWktY29uZmlnLWJ5LWlkJywgY29uZmlnSWQpLFxyXG4gICAvLyDmlrDlop7vvJrojrflj5bmlK/mjIHnmoTmnI3liqHllYbliJfooahcclxuICAgZ2V0U3VwcG9ydGVkU2VydmljZVByb3ZpZGVyczogKCk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBkYXRhPzogc3RyaW5nW107IGVycm9yPzogc3RyaW5nIH0+ID0+XHJcbiAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdnZXQtc3VwcG9ydGVkLXNlcnZpY2UtcHJvdmlkZXJzJyksXHJcblxyXG4gICAgIC8vIOWmguaenOi/mOmcgOimgemAmueUqOeahCBvbi9vZmYvc2VuZO+8jOWPr+S7peWcqOi/memHjOWNleeLrOaatOmcsu+8jOaIluiAheaMiemcgOa3u+WKoFxyXG4gICAgIC8vIG9uOiAoY2hhbm5lbCwgbGlzdGVuZXIpID0+IHsgLyogLi4uIOWuieWFqOWunueOsCAuLi4gKi8gfSxcclxuICAgLy8gc2VuZDogKGNoYW5uZWwsIGRhdGEpID0+IHsgLyogLi4uIOWuieWFqOWunueOsCAuLi4gKi8gfSxcclxuIFxyXG4gICAvLyAtLS0g5paw5aKe77ya5aSE55CGIExMTSDmtYHlvI/lk43lupQgLS0tXHJcbiAgLy8g5a6a5LmJ5rWB5byP5pWw5o2u5Z2X55qE6aKE5pyf57uT5p6EICjlj6/ku6XmoLnmja7lrp7pmYXmg4XlhrXosIPmlbQpXHJcbiAgLy8gdHlwZSBMTE1TdHJlYW1DaHVuayA9IHsgdGV4dD86IHN0cmluZzsgZXJyb3I/OiBzdHJpbmc7IGRvbmU/OiBib29sZWFuOyB1c2FnZT86IG9iamVjdDsgbWV0cmljcz86IG9iamVjdDsgc2VhcmNoPzogb2JqZWN0OyBtY3BUb29sUmVzcG9uc2U/OiBvYmplY3Q7IGdlbmVyYXRlSW1hZ2U/OiBvYmplY3QgfTtcclxuICAvLyDmmoLml7bkvb/nlKggdW5rbm93bu+8jOWcqOaOpeaUtuerr+i/m+ihjOexu+Wei+ajgOafpVxyXG4gIC8vIOS/ruaUue+8muWbnuiwg+WHveaVsOaOpeaUtuWMheWQqyBjaHVuayDlkowgc291cmNlSWQg55qE5a+56LGhXHJcbiAgb25MTE1TdHJlYW1DaHVuazogKGxpc3RlbmVyOiAoZGF0YTogeyBjaHVuazogdW5rbm93bjsgc291cmNlSWQ/OiBzdHJpbmcgfSkgPT4gdm9pZCk6IHsgZGlzcG9zZTogKCkgPT4gdm9pZCB9ID0+IHtcclxuICAgIGNvbnN0IGNoYW5uZWwgPSAnbGxtLXN0cmVhbS1jaHVuayc7XHJcbiAgICAvLyDnm5HlkKzlmajnjrDlnKjmjqXmlLbmlbTkuKogZGF0YSDlr7nosaFcclxuICAgIGNvbnN0IGludGVybmFsTGlzdGVuZXIgPSAoX2V2ZW50OiBFbGVjdHJvbi5JcGNSZW5kZXJlckV2ZW50LCBkYXRhOiB7IGNodW5rOiB1bmtub3duOyBzb3VyY2VJZD86IHN0cmluZyB9KSA9PiB7XHJcbiAgICAgIC8vIOWPr+S7pea3u+WKoOaXpeW/l+iusOW9leaOpeaUtuWIsOeahOaVsOaNrue7k+aehFxyXG4gICAgICAvLyBsb2dnZXIuZGVidWcoYFtQcmVsb2FkXSBSZWNlaXZlZCBzdHJlYW0gY2h1bmsgZGF0YSBvbiBjaGFubmVsICR7Y2hhbm5lbH06YCwgZGF0YSk7XHJcbiAgICAgIC8vIOebtOaOpeWwhuaVtOS4qiBkYXRhIOWvueixoeS8oOmAkue7meWJjeerr+eahOWbnuiwg+WHveaVsFxyXG4gICAgICBsaXN0ZW5lcihkYXRhKTtcclxuICAgIH07XHJcbiAgICBpcGNSZW5kZXJlci5vbihjaGFubmVsLCBpbnRlcm5hbExpc3RlbmVyKTtcclxuICAgIC8vIOi/lOWbnuS4gOS4quWMheWQqyBkaXNwb3NlIOaWueazleeahOWvueixoe+8jOeUqOS6juWPlua2iOebkeWQrFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZGlzcG9zZTogKCkgPT4ge1xyXG4gICAgICAgIGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKGNoYW5uZWwsIGludGVybmFsTGlzdGVuZXIpO1xyXG4gICAgICAgIGxvZ2dlci5pbmZvKGDlt7Lnp7vpmaTnm5HlkKzlmag6ICR7Y2hhbm5lbH1gKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9LFxyXG5cclxuICAvLyDml6Xlv5cgQVBJXHJcbiAgbG9nVG9GaWxlOiAobGV2ZWw6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkID0+IHtcclxuICAgIGlwY1JlbmRlcmVyLnNlbmQoJ2xvZy1tZXNzYWdlJywgbGV2ZWwsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xyXG4gIH0sXHJcblxyXG4gIC8vIOS9oOWPr+S7peWcqOi/memHjOaatOmcsuWFtuS7lumcgOimgeeahCBBUEnjgIJcclxufSk7XHJcblxyXG4vLyAtLS0tLS0tLS0g6aKE5Yqg6L296ISa5pys5Yqg6L29IC0tLS0tLS0tLVxyXG5mdW5jdGlvbiBkb21SZWFkeShjb25kaXRpb246IERvY3VtZW50UmVhZHlTdGF0ZVtdID0gWydjb21wbGV0ZScsICdpbnRlcmFjdGl2ZSddKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xyXG4gICAgaWYgKGNvbmRpdGlvbi5pbmNsdWRlcyhkb2N1bWVudC5yZWFkeVN0YXRlKSkge1xyXG4gICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsICgpID0+IHtcclxuICAgICAgICBpZiAoY29uZGl0aW9uLmluY2x1ZGVzKGRvY3VtZW50LnJlYWR5U3RhdGUpKSB7XHJcbiAgICAgICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuXHJcbmNvbnN0IHNhZmVET00gPSB7XHJcbiAgYXBwZW5kKHBhcmVudDogSFRNTEVsZW1lbnQsIGNoaWxkOiBIVE1MRWxlbWVudCkge1xyXG4gICAgaWYgKCFBcnJheS5mcm9tKHBhcmVudC5jaGlsZHJlbikuZmluZChlID0+IGUgPT09IGNoaWxkKSkge1xyXG4gICAgICByZXR1cm4gcGFyZW50LmFwcGVuZENoaWxkKGNoaWxkKTtcclxuICAgIH1cclxuICB9LFxyXG4gIHJlbW92ZShwYXJlbnQ6IEhUTUxFbGVtZW50LCBjaGlsZDogSFRNTEVsZW1lbnQpIHtcclxuICAgIGlmIChBcnJheS5mcm9tKHBhcmVudC5jaGlsZHJlbikuZmluZChlID0+IGUgPT09IGNoaWxkKSkge1xyXG4gICAgICByZXR1cm4gcGFyZW50LnJlbW92ZUNoaWxkKGNoaWxkKTtcclxuICAgIH1cclxuICB9LFxyXG59O1xyXG5cclxuLyoqXHJcbiAqIOadpea6kDogaHR0cHM6Ly90b2JpYXNhaGxpbi5jb20vc3BpbmtpdFxyXG4gKiDvvIjnuq8gQ1NTIOWKqOeUu+aViOaenOS8mOS6jiBKUyDmiafooYzvvIlcclxuICovXHJcbi8vIOmHjeWRveWQjeS7pemBv+WFjeWcqOmdniBSZWFjdCDmlofku7bkuK3op6blj5EgRVNMaW50IGhvb2sg6KeE5YiZ6ZSZ6K+vXHJcbmZ1bmN0aW9uIGNyZWF0ZUxvYWRpbmdJbmRpY2F0b3IoKSB7XHJcbiAgY29uc3QgY2xhc3NOYW1lID0gYGxvYWRlcnMtY3NzX19zcXVhcmUtc3BpbmA7XHJcbiAgY29uc3Qgc3R5bGVDb250ZW50ID0gYFxyXG5Aa2V5ZnJhbWVzIHNxdWFyZS1zcGluIHtcclxuICAyNSUgeyB0cmFuc2Zvcm06IHBlcnNwZWN0aXZlKDEwMHB4KSByb3RhdGVYKDE4MGRlZykgcm90YXRlWSgwKTsgfVxyXG4gIDUwJSB7IHRyYW5zZm9ybTogcGVyc3BlY3RpdmUoMTAwcHgpIHJvdGF0ZVgoMTgwZGVnKSByb3RhdGVZKDE4MGRlZyk7IH1cclxuICA3NSUgeyB0cmFuc2Zvcm06IHBlcnNwZWN0aXZlKDEwMHB4KSByb3RhdGVYKDApIHJvdGF0ZVkoMTgwZGVnKTsgfVxyXG4gIDEwMCUgeyB0cmFuc2Zvcm06IHBlcnNwZWN0aXZlKDEwMHB4KSByb3RhdGVYKDApIHJvdGF0ZVkoMCk7IH1cclxufVxyXG4uJHtjbGFzc05hbWV9ID4gZGl2IHtcclxuICBhbmltYXRpb24tZmlsbC1tb2RlOiBib3RoO1xyXG4gIHdpZHRoOiA1MHB4O1xyXG4gIGhlaWdodDogNTBweDtcclxuICBiYWNrZ3JvdW5kOiAjZmZmO1xyXG4gIGFuaW1hdGlvbjogc3F1YXJlLXNwaW4gM3MgMHMgY3ViaWMtYmV6aWVyKDAuMDksIDAuNTcsIDAuNDksIDAuOSkgaW5maW5pdGU7XHJcbn1cclxuLmFwcC1sb2FkaW5nLXdyYXAge1xyXG4gIHBvc2l0aW9uOiBmaXhlZDtcclxuICB0b3A6IDA7XHJcbiAgbGVmdDogMDtcclxuICB3aWR0aDogMTAwdnc7XHJcbiAgaGVpZ2h0OiAxMDB2aDtcclxuICBkaXNwbGF5OiBmbGV4O1xyXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XHJcbiAgYmFja2dyb3VuZDogIzI4MmMzNDtcclxuICB6LWluZGV4OiA5O1xyXG59XHJcbiAgICBgO1xyXG4gIGNvbnN0IG9TdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XHJcbiAgY29uc3Qgb0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cclxuICBvU3R5bGUuaWQgPSAnYXBwLWxvYWRpbmctc3R5bGUnO1xyXG4gIG9TdHlsZS5pbm5lckhUTUwgPSBzdHlsZUNvbnRlbnQ7XHJcbiAgb0Rpdi5jbGFzc05hbWUgPSAnYXBwLWxvYWRpbmctd3JhcCc7XHJcbiAgb0Rpdi5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cIiR7Y2xhc3NOYW1lfVwiPjxkaXY+PC9kaXY+PC9kaXY+YDtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGFwcGVuZExvYWRpbmcoKSB7XHJcbiAgICAgIHNhZmVET00uYXBwZW5kKGRvY3VtZW50LmhlYWQsIG9TdHlsZSk7XHJcbiAgICAgIHNhZmVET00uYXBwZW5kKGRvY3VtZW50LmJvZHksIG9EaXYpO1xyXG4gICAgfSxcclxuICAgIHJlbW92ZUxvYWRpbmcoKSB7XHJcbiAgICAgIHNhZmVET00ucmVtb3ZlKGRvY3VtZW50LmhlYWQsIG9TdHlsZSk7XHJcbiAgICAgIHNhZmVET00ucmVtb3ZlKGRvY3VtZW50LmJvZHksIG9EaXYpO1xyXG4gICAgfSxcclxuICB9O1xyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vLyDosIPnlKjph43lkb3lkI3lkI7nmoTlh73mlbBcclxuY29uc3QgeyBhcHBlbmRMb2FkaW5nLCByZW1vdmVMb2FkaW5nIH0gPSBjcmVhdGVMb2FkaW5nSW5kaWNhdG9yKCk7XHJcbmRvbVJlYWR5KCkudGhlbihhcHBlbmRMb2FkaW5nKTtcclxuXHJcbndpbmRvdy5vbm1lc3NhZ2UgPSAoZXY6IE1lc3NhZ2VFdmVudCkgPT4ge1xyXG4gIC8vIOS9v+eUqCBpZiDor63lj6Xku6Xmj5Dpq5jmuIXmmbDluqbvvIzmu6HotrMgRVNMaW50IOimgeaxglxyXG4gIGlmIChldi5kYXRhICYmIGV2LmRhdGEucGF5bG9hZCA9PT0gJ3JlbW92ZUxvYWRpbmcnKSB7XHJcbiAgICBsb2dnZXIuaW5mbygn5pS25Yiw56e76Zmk5Yqg6L295oyH56S65Zmo55qE5raI5oGvJyk7XHJcbiAgICByZW1vdmVMb2FkaW5nKCk7XHJcbiAgfVxyXG59O1xyXG5cclxuc2V0VGltZW91dChyZW1vdmVMb2FkaW5nLCA0OTk5KTsiXSwibmFtZXMiOlsiTG9nTGV2ZWwiLCJjb250ZXh0QnJpZGdlIiwiaXBjUmVuZGVyZXIiLCJsb2dnZXIiXSwibWFwcGluZ3MiOiI7O0FBTVksSUFBQSw2QkFBQUEsY0FBTDtBQUNMQSxZQUFBQSxVQUFBLFdBQVEsQ0FBUixJQUFBO0FBQ0FBLFlBQUFBLFVBQUEsVUFBTyxDQUFQLElBQUE7QUFDQUEsWUFBQUEsVUFBQSxVQUFPLENBQVAsSUFBQTtBQUNBQSxZQUFBQSxVQUFBLFdBQVEsQ0FBUixJQUFBO0FBSlVBLFNBQUFBO0FBQUEsR0FBQSxZ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
