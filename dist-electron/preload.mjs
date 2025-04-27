"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 使用不同的键名，避免覆盖可能存在的其他 ipcRenderer 暴露
  // --- 精确暴露存储相关的 invoke 通道 ---
  // 将参数类型从 any 改为 unknown，与 ipcHandler 保持一致
  readStore: (fileName, defaultValue) => electron.ipcRenderer.invoke("read-store", fileName, defaultValue),
  writeStore: (fileName, data) => electron.ipcRenderer.invoke("write-store", fileName, data),
  // --- LLM 服务相关 API ---
  llmGetServices: () => electron.ipcRenderer.invoke("llm-get-services"),
  llmSetApiKey: (providerId, apiKey) => electron.ipcRenderer.invoke("llm-set-api-key", providerId, apiKey),
  llmGetAvailableModels: (providerId) => electron.ipcRenderer.invoke("llm-get-available-models", providerId),
  // 新增获取已保存 Keys 的 API
  llmGetSavedKeys: () => electron.ipcRenderer.invoke("llm-get-saved-keys"),
  // 新增：调用聊天生成 API
  // 需要在调用处确保 options 符合 LLMChatOptions 结构 (从 './llm/BaseLLM' 导入)
  // 返回值 data 符合 LLMResponse 结构
  llmGenerateChat: (providerId, options) => electron.ipcRenderer.invoke("llm-generate-chat", providerId, options),
  // 新增：获取和保存自定义模型列表
  llmGetCustomModels: (providerId) => electron.ipcRenderer.invoke("llm-get-custom-models", providerId),
  llmSaveCustomModels: (providerId, models) => electron.ipcRenderer.invoke("llm-save-custom-models", providerId, models)
  // 如果还需要通用的 on/off/send，可以在这里单独暴露，或者按需添加
  // on: (channel, listener) => { /* ... 安全实现 ... */ },
  // send: (channel, data) => { /* ... 安全实现 ... */ },
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
  if (ev.data.payload === "removeLoading") {
    removeLoading();
  }
};
setTimeout(removeLoading, 4999);
