import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple'; // 更新了导入方式
import renderer from 'vite-plugin-electron-renderer'; // 更新了导入方式
import { builtinModules } from 'node:module';

// Vite 配置: https://vite.dev/config/
export default defineConfig({
  // 确保在开发模式下也能正确处理electron文件
  build: {
    // 确保在清理dist-electron目录后能重新生成文件
    emptyOutDir: false,
    rollupOptions: {
      // 将 registry-js 和其他原生模块标记为外部依赖
      external: [
        'registry-js',
        ...builtinModules,
      ],
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        // 主进程入口文件路径 (`build.lib.entry` 的快捷方式)
        entry: 'electron/main.ts',
        // 确保在开发模式下监听文件变化
        onstart(options) {
          console.log('[electron-main] Electron App started');
          options.startup();
        },
        vite: {
          build: {
            // 确保源码映射，方便调试
            sourcemap: 'inline',
            // 确保输出到正确的目录
            outDir: 'dist-electron',
            // 确保生成main.js文件
            rollupOptions: {
              external: [
                'registry-js',
                ...builtinModules,
              ],
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
          // 确保监听文件变化
          plugins: [{
            name: 'electron-main-watcher',
            buildStart() {
              console.log('[electron-main-watcher] Watching electron main process files');
            }
          }],
          // 明确指定要监听的文件
          optimizeDeps: {
            include: ['electron/**/*'],
            exclude: ['node_modules/**', 'dist/**', 'dist-electron/**']
          },
        },
      },
      preload: {
        // 预加载脚本入口 (`build.rollupOptions.input` 的快捷方式)
        // 预加载脚本可能包含 Web 资源，因此使用 `build.rollupOptions.input` 而不是 `build.lib.entry`
        input: path.join(__dirname, 'electron/preload.ts'),
        // 确保在开发模式下监听文件变化
        vite: {
          build: {
            sourcemap: 'inline',
            outDir: 'dist-electron',
            // 确保生成preload.mjs文件
            rollupOptions: {
              external: [
                'registry-js',
                ...builtinModules,
              ],
              output: {
                entryFileNames: '[name].mjs',
              },
            },
          },
          plugins: [{
            name: 'electron-preload-watcher',
            buildStart() {
              console.log('[electron-preload-watcher] Watching electron preload files');
            }
          }],
          // 明确指定要监听的文件
          optimizeDeps: {
            include: ['electron/**/*', 'electron/preload.ts'],
            exclude: ['node_modules/**', 'dist/**', 'dist-electron/**']
          },
        },
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
