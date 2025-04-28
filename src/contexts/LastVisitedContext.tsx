import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// 定义每个版块的类型
type SectionKey = 'chat' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings';

// 定义存储的导航信息结构 - 增加 internalState (并导出)
export interface NavigationInfo { // <-- 添加 export
  path: string;
  state?: unknown; // 导航状态
  internalState?: unknown; // 页面内部状态快照
}

// 定义 Context 存储的数据结构：{ 版块Key: 最后访问的导航信息 }
type LastVisitedNavInfo = Partial<Record<SectionKey, NavigationInfo>>;

// 定义 Context 提供的值的类型
interface LastVisitedContextType {
  lastVisitedNavInfo: LastVisitedNavInfo;
  // 更新函数现在接收可选的 internalState
  updateLastVisitedNavInfo: (section: SectionKey, path: string, state?: unknown, internalState?: unknown) => void;
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

  // 更新某个版块的最后访问导航信息 (路径 + state + internalState)
  const updateLastVisitedNavInfo = useCallback((section: SectionKey, path: string, state?: unknown, internalState?: unknown) => {
    setLastVisitedNavInfo(prevInfo => {
      const currentInfo = prevInfo[section];
      // 只有当路径或 internalState 实际改变时才更新，避免不必要的渲染
      // 注意：state 的比较可能不准确，如果 state 复杂且经常变化，这里可能需要优化
      if (currentInfo?.path !== path || currentInfo?.state !== state || currentInfo?.internalState !== internalState) {
        console.log(`[LastVisitedContext] Updating ${section} nav info: path=${path}, hasState=${!!state}, hasInternalState=${!!internalState}`);
        return {
          ...prevInfo,
          [section]: { path, state, internalState }, // 存储路径、导航 state 和内部 state
        };
      }
      return prevInfo; // 如果没变化，返回旧的 info
    });
  }, []);

  // 获取某个版块的最后访问导航信息，如果不存在则返回包含默认路径的对象
  const getLastVisitedNavInfo = useCallback((section: SectionKey, defaultPath: string): NavigationInfo => {
    const lastInfo = lastVisitedNavInfo[section];
    if (lastInfo) {
      console.log(`[LastVisitedContext] Found last visited info for ${section}: path=${lastInfo.path}, hasState=${!!lastInfo.state}, hasInternalState=${!!lastInfo.internalState}`);
      return lastInfo; // 返回包含 path, state, internalState 的完整对象
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