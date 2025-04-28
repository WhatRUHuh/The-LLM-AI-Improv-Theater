import { useContext } from 'react';
// 从新的 definition 文件导入 Context 和类型
import { LastVisitedContext, LastVisitedContextType } from '../contexts/lastVisitedContextDefinition';

/**
 * 自定义 Hook，用于访问 LastVisitedContext。
 * 提供类型检查，确保在 Provider 内部使用。
 */
export const useLastVisited = (): LastVisitedContextType => {
  const context = useContext(LastVisitedContext);
  if (context === undefined) {
    throw new Error('useLastVisited must be used within a LastVisitedProvider');
  }
  return context;
};