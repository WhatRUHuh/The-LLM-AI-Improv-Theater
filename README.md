# 🎭 The‑LLM‑AI‑Improv‑Theater - AI 即兴剧场

> 欢迎来到 AI 即兴剧场！这是一款基于 Electron、React 和 TypeScript 构建的跨平台桌面应用，允许单人或多人扮演/导演多角色 AI，进行沉浸式对话或剧本排练。尽情发挥你的创意，与 AI 共同创作精彩故事！🎬✨

---

## 🌟 项目概述

The‑LLM‑AI‑Improv‑Theater（简称 **TLAIT**）致力于打造一个结合尖端大型语言模型（LLM）服务与直观用户界面的创新平台。

**核心功能包括：**

*   **多种互动模式**：
    *   **单人单 AI 对话**：用户与一个 AI 角色进行简单直接的对话。
    *   **单人多 AI 对话**：用户扮演一个角色，与其他多个 AI 角色在同一场景下进行互动。
    *   **导演模式**：用户作为导演，引导多个 AI 角色根据剧本或即兴指令进行表演和对话。
*   **剧本管理**：
    *   创建、编辑、导入和导出剧本。
    *   剧本可以包含场景描述、角色设定、对话线索等。
*   **角色管理**：
    *   创建和编辑具有不同性格、背景和对话风格的 AI 角色。
    *   为角色配置专属的系统提示词（System Prompt）。
*   **AI 服务配置**：
    *   支持接入多家主流 LLM 服务提供商（如 OpenAI, Anthropic, Google 等）。
    *   允许用户为同一服务商保存和管理多个带有自定义名称（标签）的 API Key。
    *   提供服务商 -> API Key -> 可用模型的三级联动选择，方便用户切换和使用不同配置。
*   **网络代理支持**：
    *   内置灵活的代理设置，支持系统代理、自定义 HTTP(S)/SOCKS4/SOCKS5 代理，确保在不同网络环境下都能顺畅连接 LLM 服务。
*   **对话历史与状态保存**：
    *   自动保存聊天会话，方便用户回顾和继续之前的对话。
    *   侧边栏导航记忆用户在不同功能模块的最后访问位置。
*   **日志系统**：
    *   详细记录应用运行状态和 LLM 调用信息，便于问题排查和分析。

我们的目标是提供一个高度可定制、富有沉浸感且充满乐趣的 AI 互动创作环境，让用户能够轻松驾驭 AI 的力量，共同编织独一无二的故事篇章。

---

## 🛠️ 技术选型

本项目采用了一系列现代化的技术栈，以确保高性能、稳定性和良好的开发体验：

| 领域   | 依赖                          | 版本   | 关键理由                         |
| :--- | :-------------------------- | :--- | :--------------------------- |
| 构建   | **Vite**                    | ^5.x | 极快冷启动 + 原生 ES 模块加载           |
| 语言   | **TypeScript**              | ^5.x | 类型安全 + IDE 友好                |
| UI   | **React 19 + Ant Design 5** | 最新   | 组件丰富 / 中文友好                  |
| 桌面   | **Electron 29**             | LTS  | Chromium 124 + Node 20，跨平台稳定 |
| 状态   | **Redux Toolkit**           | ^2.x | 全局可预测状态树                     |
| 路由   | **React Router v6.22**      | —    | 嵌套路由 & 懒加载                   |
| 网络   | **fetch‑socks**             | ^4.x | 原生 fetch + SOCKS5 支持         |
| 日志   | **electron‑log**            | ^5.x | 主/渲染统一日志通道                   |

---

## 📂 目录结构（概览）

```
The-LLM-AI-Improv-Theater/
├── electron/                 # Electron 主进程相关代码
│   ├── main.ts               # 主进程入口
│   ├── preload.ts            # 预加载脚本
│   ├── ipcHandlers.ts        # IPC 事件处理
│   ├── proxyManager.ts       # 代理管理
│   ├── llm/                  # LLM 服务相关
│   │   ├── BaseLLM.ts
│   │   ├── OpenAI.ts
│   │   ├── Anthropic.ts
│   │   ├── Google.ts
│   │   └── LLMServiceManager.ts
│   ├── storage/              # 数据存储
│   │   └── jsonStore.ts
│   └── utils/                # 工具函数 (日志等)
├── src/                      # React 渲染进程相关代码 (Vite 入口)
│   ├── main.tsx              # React 应用入口
│   ├── App.tsx               # 根组件
│   ├── router.tsx            # 路由配置
│   ├── pages/                # 页面组件
│   ├── components/           # 可复用 UI 组件 (如果创建的话)
│   ├── contexts/             # React Context
│   ├── hooks/                # 自定义 Hooks
│   ├── types/                # TypeScript 类型定义
│   └── utils/                # 前端工具函数
├── public/                   # Vite 静态资源目录
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md                 # 就是你现在看的这个啦！😉
```

---

## 🚀 如何运行

首先，确保你已经安装了 [Node.js](https://nodejs.org/) (推荐 LTS 版本) 和 npm。

1.  **安装依赖**:
    ```bash
    npm install
    ```
    如果网络不佳，可以尝试使用 cnpm：
    ```bash
    npm install -g cnpm --registry=https://registry.npmmirror.com
    cnpm install
    ```

2.  **开发模式 (带热重载)**:
    ```bash
    npm run electron:dev
    ```
    此命令会首先使用 Vite 构建前端代码，然后启动 Electron 应用。修改代码后会自动刷新。

3.  **清理并重新启动开发模式**:
    ```bash
    npm run electron:dev:clean
    ```
    此命令会先删除 `dist/` 目录（Vite 的构建产物），然后再执行开发模式启动。

4.  **打包应用**:
    ```bash
    npm run electron:build
    ```
    此命令会使用 `electron-builder` 将应用打包成对应平台的可执行文件，输出到 `dist/` 目录。

---

## 📜 授权协议 (License)

本项目基于 **GNU Affero General Public License v3.0 (AGPL-3.0)** 进行授权。

**⚠️ 重要提示：** 本项目的 [`LICENSE`](LICENSE) 文件中包含了在 AGPL-3.0 基础之上附加的 **补充条款**。这些补充条款对代码的商业使用等方面做出了额外约定。请务必在复制、使用、修改或分发本项目代码前，仔细阅读并理解 [`LICENSE`](LICENSE) 文件中的全部内容，特别是补充条款部分，以确保您的行为符合所有授权要求。

---
## 🚀 未来规划 (Roadmap & Future Plans)

我们对 AI 即兴剧场的未来充满期待，并计划在后续版本中逐步实现以下功能与优化：

*   **更多AI模型支持**：持续集成来自不同服务商的最新、最强大的语言模型。
*   **MCP整合**：引入模型上下文协议（MCP），以支持更丰富的外部工具和AI能力扩展。
*   **知识库集成**：允许为角色或剧本挂载专属知识库，提升AI对话的相关性和深度。
*   **角色视觉表现**：增加人物头像/立绘功能，提升角色扮演的沉浸感。
*   **AI语音交互**：集成文本转语音（TTS）和语音转文本（STT）功能，实现语音对话。
*   **AI联网搜索能力**：赋予AI角色实时联网搜索信息的能力，以获取最新资讯。
*   **剧本功能强化**：提供更专业的剧本编辑、版本管理、多人协作等高级功能。
*   **导演模式增强**：为导演提供更精细的场景控制、角色调度及表演指令工具。
*   **个性化体验**：支持用户自定义UI主题、界面布局等，打造专属创作空间。
*   **开放扩展能力**：探索插件系统或扩展API，鼓励社区开发者共建生态。
*   **多格式导出与分享**：支持将对话/剧本导出为多种格式（如文本、PDF），或一键分享至社交平台。
*   **持续性能优化**：不断优化应用性能，降低资源消耗，提升流畅度。

如果您有任何好的想法或建议，欢迎通过 [Issues](https://github.com/WhatRUHuh/The-LLM-AI-Improv-Theater/issues) 或其他渠道告诉我们！

---
## 💖 致谢

- 特别感谢克劳德先生（Mr. Claude）与杰米尼先生（Mr. Gemini）以及纪皮提先生（Mr. GPT）在本项目开发过程中提供的源码支持与技术指导。
- 感谢所有开源项目和 API 提供商，使本项目成为可能。
- 感谢所有用户的反馈和建议，帮助我们不断改进。
