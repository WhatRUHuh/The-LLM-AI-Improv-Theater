import { createContext } from 'react';

// 定义每个版块的类型 (保持与 Provider 文件一致)
type SectionKey = 'singleUserSingleAISetup' | 'singleUserSingleAIInterface' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings';

// 定义存储的导航信息结构
export interface NavigationInfo {
  path: string;
  state?: unknown; // 导航状态
  internalState?: unknown; // 页面内部状态快照
}

// 定义 Context 存储的数据结构：{ 版块Key: 最后访问的导航信息 }
type LastVisitedNavInfo = Partial<Record<SectionKey, NavigationInfo>>;

// 定义 Context 提供的值的类型
export interface LastVisitedContextType {
  lastVisitedNavInfo: LastVisitedNavInfo;
  updateLastVisitedNavInfo: (section: SectionKey, path: string, state?: unknown, internalState?: unknown) => void;
  getLastVisitedNavInfo: (section: SectionKey, defaultPath: string) => NavigationInfo;
}

// 创建并导出 Context，初始值为 undefined
export const LastVisitedContext = createContext<LastVisitedContextType | undefined>(undefined);