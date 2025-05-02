import React, { useState, ReactNode, useCallback } from 'react';
// 从新文件导入 Context 定义和类型 (移除未使用的 LastVisitedContextType)
import { LastVisitedContext, NavigationInfo } from './lastVisitedContextDefinition';

// 定义每个版块的类型 (可以保留在这里，或者也移到 definition 文件)
type SectionKey = 'singleUserSingleAISetup' | 'singleUserSingleAIInterface' | 'scripts' | 'characters' | 'ai-config' | 'history' | 'settings';

// 定义 Context 存储的数据结构：{ 版块Key: 最后访问的导航信息 }
type LastVisitedNavInfo = Partial<Record<SectionKey, NavigationInfo>>;

// ContextType 和 Context 本身已从 definition 文件导入
// interface LastVisitedContextType { ... }
// const LastVisitedContext = createContext<LastVisitedContextType | undefined>(undefined);

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
        console.log(`[LastVisitedContext] 更新 ${section} 导航信息：路径=${path}，有状态=${!!state}，有内部状态=${!!internalState}`);
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
      console.log(`[LastVisitedContext] 找到 ${section} 的上次访问信息：路径=${lastInfo.path}，有状态=${!!lastInfo.state}，有内部状态=${!!lastInfo.internalState}`);
      return lastInfo; // 返回包含 path, state, internalState 的完整对象
    } else {
      console.log(`[LastVisitedContext] 未找到 ${section} 的上次访问信息，使用默认路径：${defaultPath}`);
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

// 自定义 Hook 已移至 src/hooks/useLastVisited.ts
