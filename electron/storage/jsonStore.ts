import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron'; // 导入 app 获取 userData 路径

// 定义存储目录，使用 userData 目录确保数据持久性
// 注意：开发环境下 userData 可能指向 Electron 的临时目录，打包后会指向用户数据目录
const storageDir = path.join(app.getPath('userData'), 'TheLLMAIImprovTheaterData');

/**
 * 确保存储目录存在，如果不存在则创建。
 */
async function ensureStorageDirExists(): Promise<void> {
  try {
    await fs.access(storageDir);
  } catch (error: unknown) { // 使用 unknown 类型
    // 检查错误是否是包含 code 属性的对象
    let errorCode: string | undefined;
    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = (error as { code: string }).code;
    }

    // 如果目录不存在 (ENOENT)，则创建它
    if (errorCode === 'ENOENT') {
      try {
        await fs.mkdir(storageDir, { recursive: true });
        console.log(`Storage directory created: ${storageDir}`);
      } catch (mkdirError) {
        console.error(`Error creating storage directory ${storageDir}:`, mkdirError);
        throw new Error(`Failed to create storage directory: ${storageDir}`); // 抛出错误，让调用者知道失败了
      }
    } else {
      // 如果是其他错误，则直接抛出
      console.error(`Error accessing storage directory ${storageDir}:`, error);
      throw new Error(`Failed to access storage directory: ${storageDir}`);
    }
  }
}

/**
 * 从指定的 JSON 文件读取数据。
 * @param fileName 文件名 (例如 'scripts.json', 'roles.json')
 * @param defaultValue 如果文件不存在或为空，返回的默认值
 * @returns 解析后的数据或默认值
 */
export async function readStore<T>(fileName: string, defaultValue: T): Promise<T> {
  await ensureStorageDirExists(); // 确保目录存在
  const filePath = path.join(storageDir, fileName);

  try {
    const fileContent = await fs.readFile(filePath, { encoding: 'utf-8' });
    if (!fileContent) {
      return defaultValue; // 文件为空，返回默认值
    }
    // 尝试解析 JSON，如果失败也算错误
    try {
      return JSON.parse(fileContent) as T;
    } catch (parseError) {
       console.error(`Error parsing JSON from file ${filePath}:`, parseError);
       return defaultValue; // 解析失败也返回默认值
    }
  } catch (error: unknown) { // 使用 unknown 类型
    // 检查错误是否是包含 code 属性的对象
    if (error && typeof error === 'object' && 'code' in error) {
      // 如果文件不存在 (ENOENT)，返回默认值，这是正常情况
      if (error.code === 'ENOENT') {
        console.log(`Store file ${fileName} not found, returning default value.`);
        return defaultValue;
      }
    }
    // 如果是其他读取错误，则记录并返回默认值
    console.error(`Error reading store file ${filePath}:`, error);
    // 这里选择返回 defaultValue，避免因单个文件损坏导致整个应用失败
    return defaultValue;
    // 或者抛出错误: throw new Error(`Failed to read store file: ${fileName}`);
  }
}

/**
 * 将数据写入指定的 JSON 文件。
 * @param fileName 文件名 (例如 'scripts.json', 'roles.json')
 * @param data 要写入的数据
 */
export async function writeStore<T>(fileName: string, data: T): Promise<void> {
  await ensureStorageDirExists(); // 确保目录存在
  const filePath = path.join(storageDir, fileName);

  try {
    // 将数据转换为格式化的 JSON 字符串 (null, 2 表示使用 null 填充符和 2 个空格缩进)
    const fileContent = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, fileContent, { encoding: 'utf-8' });
    console.log(`Data successfully written to ${filePath}`);
  } catch (error: unknown) { // 使用 unknown 类型
    console.error(`Error writing store file ${filePath}:`, error);
    // 可以选择性地检查错误类型，但通常写入失败直接抛出即可
    const message = error instanceof Error ? error.message : '写入存储时发生未知错误';
    throw new Error(`Failed to write store file: ${fileName}. Reason: ${message}`); // 抛出更详细的错误
  }
}

// 可以在这里添加其他存储相关的辅助函数，例如删除文件、列出文件等