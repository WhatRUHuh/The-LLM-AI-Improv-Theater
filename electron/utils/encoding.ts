/**
 * 编码工具类
 * 统一管理编码设置，确保所有涉及编码的地方都使用UTF-8
 */

/**
 * 设置全局编码为UTF-8
 * 这个函数应该在应用启动时调用
 */
export async function setupGlobalEncoding(): Promise<void> {
  // 设置Node.js进程的编码
  process.env.LANG = 'zh_CN.UTF-8';
  process.env.LC_ALL = 'zh_CN.UTF-8';
  process.env.LC_CTYPE = 'zh_CN.UTF-8';

  // 设置控制台输出编码
  if (process.stdout && process.stdout.isTTY) {
    process.stdout.setDefaultEncoding('utf8');
  }
  if (process.stderr && process.stderr.isTTY) {
    process.stderr.setDefaultEncoding('utf8');
  }

  // 注意：我们不再在这里设置Windows控制台代码页
  // 这个操作已经移到main.ts中，以避免重复执行
}

/**
 * 文件读写选项，强制使用UTF-8编码
 */
export const UTF8_OPTIONS = { encoding: 'utf-8' } as const;

/**
 * 确保字符串使用UTF-8编码
 * 这个函数在Windows终端中特别有用
 * @param str 输入字符串
 * @returns UTF-8编码的字符串
 */
export function ensureUtf8(str: string): string {
  // 在Windows平台上，终端可能不使用UTF-8编码
  if (process.platform === 'win32') {
    try {
      // 尝试将字符串转换为Buffer再转回字符串，确保UTF-8编码
      return Buffer.from(str, 'utf8').toString('utf8');
    } catch (error) {
      console.error('转换字符串到UTF-8编码时出错:', error);
      return str; // 如果转换失败，返回原始字符串
    }
  }
  return str; // 非Windows平台直接返回
}

/**
 * 默认导出
 */
export default {
  setupGlobalEncoding,
  UTF8_OPTIONS,
  ensureUtf8,
};
