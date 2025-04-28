import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// 定义每个版块的类型
type SectionKey = 'chat' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings';

// 定义存储的导航信息结构
interface NavigationInfo {
  path: string;
  state?: unknown; // <-- 改为 unknown，更安全
}

// 定义 Context 存储的数据结构：{ 版块Key: 最后访问的导航信息 }
type LastVisitedNavInfo = Partial<Record<SectionKey, NavigationInfo>>;

// 定义 Context 提供的值的类型
interface LastVisitedContextType {
  lastVisitedNavInfo: LastVisitedNavInfo;
  updateLastVisitedNavInfo: (section: SectionKey, path: string, state?: unknown) => void; // <-- 改为 unknown
  getLastVisitedNavInfo: (section: SectionKey, defaultPath: string) => NavigationInfo;
}

// 创建 Context，提供默认值
const LastVisitedContext = createContext<LastVisitedContextType | undefined>(undefined);

// 创建 Context Provider 组件
interface LastVisitedProviderProps {
  children: ReactNode;
}

export const LastVisitedProvider: React.FC<LastVisitedProviderProps> = ({ children }) => {
  const [lastVisitedNavInfo, setLastVisitedNavInfo] = useState<LastVisitedNavInfo>({});

  // 更新某个版块的最后访问导航信息 (路径 + state)
  const updateLastVisitedNavInfo = useCallback((section: SectionKey, path: string, state?: unknown) => { // <-- 改为 unknown
    setLastVisitedNavInfo(prevInfo => ({
      ...prevInfo,
      [section]: { path, state }, // 存储路径和 state
    }));
    // console.log(`[LastVisitedContext] Updated ${section} nav info to:`, { path, state }); // 日志记录 state 可能过长，暂时注释
    console.log(`[LastVisitedContext] Updated ${section} path to: ${path}`);
  }, []);

  // 获取某个版块的最后访问导航信息，如果不存在则返回包含默认路径的对象
  const getLastVisitedNavInfo = useCallback((section: SectionKey, defaultPath: string): NavigationInfo => {
    const lastInfo = lastVisitedNavInfo[section];
    // console.log(`[LastVisitedContext] Getting nav info for ${section}. Last visited:`, lastInfo, `Default path: ${defaultPath}`); // 日志记录 state 可能过长
    if (lastInfo) {
      console.log(`[LastVisitedContext] Found last visited info for ${section}: path=${lastInfo.path}`);
      return lastInfo;
    } else {
      console.log(`[LastVisitedContext] No last visited info for ${section}. Using default path: ${defaultPath}`);
      return { path: defaultPath }; // 如果没有记录，返回只包含默认路径的对象
    }
  }, [lastVisitedNavInfo]);

  const value = { lastVisitedNavInfo, updateLastVisitedNavInfo, getLastVisitedNavInfo };

  return (
    <LastVisitedContext.Provider value={value}>
      {children}
    </LastVisitedContext.Provider>
  );
};

// 创建自定义 Hook，方便在组件中使用 Context
export const useLastVisited = (): LastVisitedContextType => {
  const context = useContext(LastVisitedContext);
  if (context === undefined) {
    throw new Error('useLastVisited must be used within a LastVisitedProvider');
  }
  return context;
};