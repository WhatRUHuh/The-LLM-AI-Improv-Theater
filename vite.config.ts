import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple'; // 更新了导入方式
import renderer from 'vite-plugin-electron-renderer'; // 更新了导入方式

// Vite 配置: https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // 主进程入口文件路径 (`build.lib.entry` 的快捷方式)
        entry: 'electron/main.ts',
      },
      preload: {
        // 预加载脚本入口 (`build.rollupOptions.input` 的快捷方式)
        // 预加载脚本可能包含 Web 资源，因此使用 `build.rollupOptions.input` 而不是 `build.lib.entry`
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // 为渲染进程填充 Electron 和 Node.js API。
      // 如果渲染进程不需要 Electron API，请将其设置为 `false`。
      // 默认为 `true`。
      renderer: {}, // 保持为空或根据需要配置
    }),
    // 在渲染进程中使用 Node.js API
    // 注意：此插件是可选的，如果不需要，请将其删除
    renderer(),
  ],
});
