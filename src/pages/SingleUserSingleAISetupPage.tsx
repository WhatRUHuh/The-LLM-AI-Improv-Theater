import React, { useState, useEffect, useMemo, Key, useCallback } from 'react'; // <--- 添加 useCallback
import { useLocation, useNavigate } from 'react-router-dom';
// 导入 theme 用于获取背景色等 token
import { Select, Checkbox, Radio, Button, message, Spin, Typography, Card, Row, Col, Divider, RadioChangeEvent, theme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { Script, AICharacter, AIConfig } from '../types'; // 导入 AIConfig
import type { ChatMode } from '../types';
import { useLastVisited } from '../hooks/useLastVisited';
import { setupLogger as logger } from '../utils/logger'; // 导入日志工具

// 定义角色 AI 配置结构 (更新)
interface CharacterAIConfig {
  configId: string; // 保存 AIConfig 的 ID
  modelName: string; // 保存选定的模型名称
  providerId: string; // 新增：保存服务商ID，方便Interface页面直接使用
}

// 定义页面内部状态快照的类型 (更新 aiConfigs)
interface SetupPageStateSnapshot {
  selectedScriptId: string | null;
  selectedCharacterIds: Key[];
  userCharacterId: string | null;
  aiConfigs: Record<string, CharacterAIConfig>; // Map 不能直接序列化，转成对象。CharacterAIConfig 已更新
  mode?: ChatMode; // 把 mode 也存进去
}


const SingleUserSingleAISetupPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateLastVisitedNavInfo } = useLastVisited();
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const restoredState = location.state as SetupPageStateSnapshot | undefined;
  const initialMode = restoredState?.mode;

  const [mode] = useState<ChatMode | undefined>(initialMode);

  const [loading, setLoading] = useState(true); // 全局加载状态，控制Spin组件的显示
  const [initialDataLoaded, setInitialDataLoaded] = useState(false); // 新增状态：标记核心静态数据是否已加载完成
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [allAIConfigs, setAllAIConfigs] = useState<AIConfig[]>([]); // 存储从IPC获取的所有AI配置

  // AI 角色的特定选择状态 (因为此页面只有一个AI角色需要配置，所以直接用 state)
  // 如果有多个AI角色，这些状态可能需要移到 aiConfigs Map 内部或者一个单独的Map中
  const [selectedServiceProviderForAI, setSelectedServiceProviderForAI] = useState<string | null>(null);
  const [selectedConfigIdForAI, setSelectedConfigIdForAI] = useState<string | null>(null);
  // const [selectedModelNameForAI, setSelectedModelNameForAI] = useState<string | null>(null); // 这个会直接保存在 aiConfigs 里

  // 用于存储每个AI角色已选模型的列表 (当configId变化时更新)
  const [availableModelsForSelectedConfig, setAvailableModelsForSelectedConfig] = useState<string[]>([]);


  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredState?.selectedScriptId ?? null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Key[]>(restoredState?.selectedCharacterIds ?? []);
  const [userCharacterId, setUserCharacterId] = useState<string | null>(restoredState?.userCharacterId ?? null);
  // 从 restoredState 初始化 aiConfigs Map
  const initialAiConfigsMap = useMemo(() => {
      const map = new Map<string, CharacterAIConfig>();
      if (restoredState?.aiConfigs) {
          Object.entries(restoredState.aiConfigs).forEach(([key, value]) => {
              map.set(key, value);
          });
      }
      return map;
  }, [restoredState?.aiConfigs]); // 依赖项是 restoredState.aiConfigs，当它变化时重新计算
  const [aiConfigs, setAiConfigs] = useState<Map<string, CharacterAIConfig>>(initialAiConfigsMap); // 存储最终为每个AI角色确定的配置

  // 将 handleAIConfigChange 定义移到 useEffect 之前，并用 useCallback 包裹
  const handleAIConfigChange = useCallback((
    characterId: string, // AI角色的ID
    field: 'serviceProvider' | 'configId' | 'modelName',
    value: string | null
  ) => {
    const charIdForLog = characterId || 'aiCharacter'; // 日志中使用的角色标识

    if (field === 'serviceProvider') {
      logger.info(`[AI 配置变更] 角色 ${charIdForLog}: 服务商变为 ${value}`);
      setSelectedServiceProviderForAI(value);
      setSelectedConfigIdForAI(null); // 清空下游选择
      setAvailableModelsForSelectedConfig([]); // 清空模型列表
      // 更新最终保存的配置 (清空configId和modelName)
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        // 确保即使之前没有配置，也创建一个空的条目，以便后续步骤可以更新它
        // 当服务商改变时，清空所有相关配置
        newConfigs.set(characterId, { configId: '', modelName: '', providerId: value || '' });
        return newConfigs;
      });
    } else if (field === 'configId') {
      logger.info(`[AI 配置变更] 角色 ${charIdForLog}: 配置ID (configId) 变为 ${value}`);
      setSelectedConfigIdForAI(value);
      // 更新最终保存的配置中的 configId，并清空 modelName
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        // 当configId改变时，保留providerId，清空modelName
        const currentData = newConfigs.get(characterId) || { configId: '', modelName: '', providerId: '' };
        newConfigs.set(characterId, { ...currentData, configId: value || '', modelName: '' });
        return newConfigs;
      });
      // 加载该 configId 的可用模型
      if (value) {
        setLoading(true); // 可以用一个更局部的loading状态 for model list
        window.electronAPI.getAvailableModelsByConfigId(value)
          .then((result: { success: boolean; data?: string[]; error?: string }) => {
            if (result.success && result.data) {
              setAvailableModelsForSelectedConfig(result.data);
              logger.info(`[AI 配置变更] 角色 ${charIdForLog}: 为 configId ${value} 加载到模型:`, result.data);
              // 检查是否有需要回填的 modelName (来自 restoredState)
              // 注意：restoredState 在这个 useCallback 的闭包中可能不是最新的，除非它在依赖项里
              // 但 restoredState 主要用于初始加载，这里的回填逻辑在模型加载后触发是合理的
              const charSpecificRestoredConfig = restoredState?.aiConfigs?.[characterId];
              if (charSpecificRestoredConfig && charSpecificRestoredConfig.modelName && result.data.includes(charSpecificRestoredConfig.modelName)) {
                logger.info(`[AI 配置回填] 角色 ${charIdForLog}: 模型列表加载完毕，自动选择已保存的模型: ${charSpecificRestoredConfig.modelName}`);
                setAiConfigs(prev => {
                  const newConfigs = new Map(prev);
                  const currentFullConfig = newConfigs.get(characterId);
                  if (currentFullConfig) { // 确保 currentFullConfig 存在
                     // 回填模型时，确保 providerId 和 configId 已存在
                     newConfigs.set(characterId, {
                       ...currentFullConfig,
                       modelName: charSpecificRestoredConfig.modelName
                       // providerId 和 configId 应该在 currentFullConfig 中已正确设置
                     });
                  }
                  return newConfigs;
                });
              }
            } else {
              message.error(`加载模型列表失败: ${result.error}`);
              setAvailableModelsForSelectedConfig([]);
            }
          })
          .catch((err: Error) => {
            message.error(`加载模型列表时发生错误: ${err.message}`);
            setAvailableModelsForSelectedConfig([]);
          })
          .finally(() => setLoading(false)); // 结束局部loading
      } else {
        setAvailableModelsForSelectedConfig([]); // 如果 configId 为空，清空模型
      }
    } else if (field === 'modelName') {
      logger.info(`[AI 配置变更] 角色 ${charIdForLog}: 模型名称变为 ${value}`);
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        const currentFullConfig = newConfigs.get(characterId);
        // 设置模型时，确保 providerId 和 configId 已存在
        if (currentFullConfig && currentFullConfig.configId && currentFullConfig.providerId) {
          newConfigs.set(characterId, { ...currentFullConfig, modelName: value || '' });
        } else {
          logger.warn(`[AI 配置变更] 角色 ${charIdForLog}: 尝试在没有configId的情况下设置modelName`);
        }
        return newConfigs;
      });
    }
  // useCallback 的依赖项：
  // - setState 函数 (setAiConfigs, setLoading, etc.) 的引用是稳定的。
  // - restoredState 是从 location.state 获取的，其引用在组件生命周期内通常也是稳定的。它在这里用于恢复模型名称，这是合理的。
  // 结论：此处的依赖项是安全的，不会导致 handleAIConfigChange 的引用不必要地改变。
  }, [restoredState]); // 保持 restoredState，因为回填逻辑需要它


  // --- 数据加载与状态恢复的 useEffect 逻辑 ---

  // Effect 1: 加载核心静态数据 (剧本、角色、所有AI配置)
  // 目标：这个 effect 只在组件首次挂载或 `mode` 改变时运行一次，获取后续操作所需的基础数据。
  // 依赖项：`mode` 和 `navigate`。`navigate` 用于在 `mode` 无效时跳转。
  //         不包含 `setScripts`, `setCharacters`, `setAllAIConfigs`, `setInitialDataLoaded`, `setLoading`，
  //         因为它们是此 effect 内部调用的 setState 函数，不应作为依赖项触发重渲染。
  // Effect 1: 加载核心静态数据 (剧本、角色、所有AI配置)
  // 目标：这个 effect 只在组件首次挂载或 `mode` 改变时运行一次，获取后续操作所需的基础数据。
  // 依赖项：`mode` 和 `navigate`。`navigate` 用于在 `mode` 无效时跳转。
  //         setters (setScripts, setCharacters, setAllAIConfigs, setInitialDataLoaded, setLoading)
  //         的引用是稳定的，不需要作为依赖项。
  useEffect(() => {
    const loadInitialStaticData = async () => {
      // 检查 mode 是否有效，无效则跳转
      if (!mode) {
        logger.warn('[Effect 1] 缺少聊天模式信息，无法加载初始数据。将导航至模式选择页面。');
        message.warning('缺少聊天模式信息，请返回重新选择');
        navigate('/chat-mode-selection', { replace: true });
        return;
      }

      logger.info('[Effect 1] 开始加载初始静态数据 (剧本、角色、AI配置)...');
      setLoading(true); // 开始加载，显示全局 Spin
      setInitialDataLoaded(false); // 重置数据加载完成的标志，确保恢复逻辑在本次加载完成后运行

      try {
        // 并行获取所有基础数据
        const [scriptsResult, charactersResult, aiConfigsResult] = await Promise.all([
          window.electronAPI.listScripts(),
          window.electronAPI.listCharacters(),
          window.electronAPI.getAllAIConfigs(),
        ]);
        logger.info('[Effect 1] 初始静态数据IPC调用完成:', { scriptsResult, charactersResult, aiConfigsResult });

        // 处理剧本数据
        if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
          setScripts(scriptsResult.data);
        } else {
          message.error(`加载剧本列表失败: ${scriptsResult.error || '数据格式错误'}`);
          setScripts([]); // 失败时设置为空数组，确保类型一致性
        }

        // 处理角色数据
        if (charactersResult.success && Array.isArray(charactersResult.data)) {
          setCharacters(charactersResult.data);
        } else {
          message.error(`加载角色列表失败: ${charactersResult.error || '数据格式错误'}`);
          setCharacters([]);
        }

        // 处理AI配置数据
        if (aiConfigsResult.success && Array.isArray(aiConfigsResult.data)) {
          setAllAIConfigs(aiConfigsResult.data);
        } else {
          message.error(`加载 AI 配置列表失败: ${aiConfigsResult.error || '数据格式错误'}`);
          setAllAIConfigs([]);
        }
        
        setInitialDataLoaded(true); // 标记所有初始数据已尝试加载 (无论成功与否，流程都已走完)
        logger.info('[Effect 1] 初始静态数据加载流程完成。 initialDataLoaded 设置为 true。');

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Effect 1] 加载初始静态数据时发生严重错误: ${errorMsg}`, error);
        message.error(`加载初始数据时出错: ${errorMsg}`);
        setInitialDataLoaded(true); // 即使出错，也标记为 loaded，避免恢复逻辑永远不执行。恢复逻辑会处理 allAIConfigs 为空的情况。
      } finally {
        // setLoading(false) 的职责移交给 Effect 2 (状态恢复 effect)
        // 或者在 Effect 2 判断无需恢复时，由 Effect 2 来设置。
        // 这是因为 Effect 1 完成后，可能紧接着 Effect 2 就要开始并设置 loading。
        // 如果 Effect 1 在这里设置了 setLoading(false)，而 Effect 2 又立即 setLoading(true)，会导致闪烁。
        logger.info('[Effect 1] 初始数据加载尝试完毕，loading状态将由恢复逻辑控制或在无恢复时关闭。');
      }
    };

    loadInitialStaticData();
  }, [mode, navigate]); // 依赖项保持不变，这是正确的。

  // Effect 2: 状态恢复逻辑
  // 目标：当初始数据加载完成 (`initialDataLoaded` 为 true) 并且存在 `restoredState` 时，
  //       尝试恢复之前保存的AI配置。
  // 依赖项：`initialDataLoaded`, `restoredState`, `allAIConfigs`, `handleAIConfigChange`, `characters`
  //         - `initialDataLoaded`: 关键触发条件，确保在数据加载后执行。
  //         - `restoredState`: 包含要恢复的状态。其引用通常稳定。
  //         - `allAIConfigs`: 恢复时需要从中查找配置详情。当它从IPC更新时，此effect应重新评估。
  //         - `handleAIConfigChange`: useCallback包裹，引用相对稳定。
  //         - `characters`: 用于错误消息，当它从IPC更新时，此effect应重新评估。
  // 注意: `navigate` 从依赖项中移除，因为此 effect 主要负责恢复，不应主动导航。
  useEffect(() => {
    const restoreAIConfigurationState = async () => {
      // 条件1: 初始数据必须已尝试加载完成
      if (!initialDataLoaded) {
        logger.info('[Effect 2] 初始数据尚未加载完成 (initialDataLoaded=false)，跳过AI配置恢复。');
        return;
      }

      // 条件2: 必须存在 restoredState 且其中有 aiConfigs
      if (!restoredState || !restoredState.aiConfigs || Object.keys(restoredState.aiConfigs).length === 0) {
        logger.info('[Effect 2] 没有检测到已保存的AI配置状态，或状态为空，无需恢复。');
        setLoading(false); // 既然无需恢复，关闭 loading (如果 Effect 1 未关闭的话)
        return;
      }
      
      // 条件3: (软性检查) 如果有要恢复的configId，但 allAIConfigs 为空，发出警告。
      // 恢复流程仍会尝试，但很可能会因为找不到 configId 而失败。
      if (allAIConfigs.length === 0 && Object.values(restoredState.aiConfigs).some(c => c.configId)) {
          logger.warn('[Effect 2] 存在已保存的AI配置，但全局AI配置列表 (allAIConfigs) 为空。恢复可能失败。');
      }

      logger.info('[Effect 2] 检测到有效状态且初始数据已加载，开始恢复AI配置:', restoredState.aiConfigs);
      setLoading(true); // 开始恢复过程，显示全局 Spin

      let restorationCompletelySuccessful = true;

      // 使用 Promise.all 来并行处理每个角色AI配置的恢复，提高效率
      // 但要注意，handleAIConfigChange 内部有 setState，直接并行可能会有状态更新的竞态问题。
      // 因此，这里仍然采用串行循环处理，以确保状态更新的顺序和可预测性。
      for (const [charId, savedConfig] of Object.entries(restoredState.aiConfigs)) {
        if (savedConfig.configId) {
          logger.info(`[Effect 2] 为角色 ${charId} 尝试恢复配置: ID=${savedConfig.configId}, 模型=${savedConfig.modelName}`);
          try {
            // 1. 根据保存的 configId 从已加载的 allAIConfigs 中查找完整的 AIConfig 对象
            //    这一步至关重要，确保我们拥有最新的服务商等信息。
            const fullAIConfigFromServer = allAIConfigs.find(c => c.id === savedConfig.configId);

            if (fullAIConfigFromServer) {
              logger.info(`[Effect 2] 成功从 allAIConfigs 找到角色 ${charId} 的配置详情:`, fullAIConfigFromServer);

              // 2. 触发服务商选择：
              //    调用 handleAIConfigChange 来更新UI状态 (selectedServiceProviderForAI)
              //    并清空下游选择 (selectedConfigIdForAI, availableModelsForSelectedConfig)。
              //    同时，它也会初始化/清空 aiConfigs Map 中该角色的条目。
              handleAIConfigChange(charId, 'serviceProvider', fullAIConfigFromServer.serviceProvider);

              // 3. 触发命名配置选择：
              //    调用 handleAIConfigChange 来更新UI状态 (selectedConfigIdForAI)
              //    并异步加载该 configId 下的可用模型列表。
              //    handleAIConfigChange 内部的 .then() 回调中，会检查 restoredState (闭包捕获的)
              //    并尝试自动选择已保存的 modelName (如果存在于新加载的模型列表中)。
              //    它也会更新 aiConfigs Map 中该角色的 configId。
              handleAIConfigChange(charId, 'configId', fullAIConfigFromServer.id);
              
              // 4. 显式设置模型名称到 aiConfigs Map (如果已保存)：
              //    虽然步骤3中的 handleAIConfigChange('configId', ...) 内部有模型回填逻辑，
              //    但该回填依赖于异步加载的模型列表。为了确保即使异步流程复杂，
              //    最终的 modelName (来自 restoredState) 能够被准确地设置到 aiConfigs Map 中，
              //    这里再次调用 handleAIConfigChange 来设置模型。
              //    这提供了一层额外的保障，确保 aiConfigs Map 的最终一致性。
              if (savedConfig.modelName) {
                  handleAIConfigChange(charId, 'modelName', savedConfig.modelName);
                  logger.info(`[Effect 2] 为角色 ${charId} (恢复流程): 显式触发模型名称设置到aiConfigs Map: ${savedConfig.modelName}`);
              }
              
              // 5. 最终确认并直接更新 aiConfigs state 以反映恢复的完整配置。
              //    这一步是为了确保即使 handleAIConfigChange 内部的 setAiConfigs 是分步的或异步的，
              //    aiConfigs Map 中最终保存的是从 restoredState 中读取的完整配置。
              //    这是对 handleAIConfigChange 行为的一个补充，确保数据一致性。
              //    注意：这一步非常重要，因为它直接将 restoredState 的意图强制应用到 aiConfigs。
              //    同时，确保 providerId 也被正确设置。
              setAiConfigs(prevMap => {
                const newMap = new Map(prevMap);
                // 从 allAIConfigs 中查找与 savedConfig.configId 匹配的配置，以获取其 serviceProvider
                const matchingFullConfig = allAIConfigs.find(conf => conf.id === savedConfig.configId);
                const providerIdToSet = matchingFullConfig?.serviceProvider || savedConfig.providerId || ''; // 优先用查到的，其次用 savedConfig 自带的（如果有），最后为空字符串

                newMap.set(charId, {
                  configId: savedConfig.configId,
                  modelName: savedConfig.modelName,
                  providerId: providerIdToSet // 确保 providerId 被设置
                });
                logger.info(`[Effect 2] [最终强制更新] 角色 ${charId} 的 aiConfigs Map 已更新为:`, newMap.get(charId));
                return newMap;
              });

            } else {
              restorationCompletelySuccessful = false;
              logger.error(`[Effect 2] 恢复AI配置失败 (角色 ${characters.find(c=>c.id === charId)?.name || charId}): 在已加载的全局AI配置列表 (allAIConfigs) 中未找到ID为 ${savedConfig.configId} 的配置详情。`);
              message.error(`恢复AI配置失败 (角色 ${characters.find(c=>c.id === charId)?.name || charId}): 无法找到配置ID ${savedConfig.configId}。`);
            }
          } catch (error) { // 捕获在恢复单个角色配置时可能发生的任何意外错误
            restorationCompletelySuccessful = false;
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[Effect 2] 恢复角色 ${charId} 的AI配置时发生严重错误: ${errorMsg}`, error);
            message.error(`恢复AI配置时出错 (角色 ${characters.find(c=>c.id === charId)?.name || charId}): ${errorMsg}`);
          }
        } else { // 如果 savedConfig 中没有 configId，则记录并跳过
          logger.info(`[Effect 2] 角色 ${charId} 在已保存状态中没有 configId，跳过恢复。`);
        }
      } // 结束 for...of 循环

      if (!restorationCompletelySuccessful) {
          logger.warn("[Effect 2] 部分或全部AI配置恢复失败。请检查控制台日志。");
      } else {
          logger.info("[Effect 2] 所有AI配置项恢复尝试完毕。");
      }
      
      setLoading(false); // 所有恢复操作（无论成功与否）完成后，结束全局 loading
      logger.info('[Effect 2] AI配置恢复流程结束，全局loading关闭。');
    };

    restoreAIConfigurationState();
  }, [initialDataLoaded, restoredState, allAIConfigs, handleAIConfigChange, characters]); // navigate 已移除, eslint-disable-next-line 已移除，因为不再需要

  useEffect(() => {
    if (mode) {
        const currentStateSnapshot: SetupPageStateSnapshot = {
          selectedScriptId,
          selectedCharacterIds,
          userCharacterId,
          aiConfigs: Object.fromEntries(aiConfigs.entries()), // 确保这里转换正确
          mode: mode
        };
        updateLastVisitedNavInfo('singleUserSingleAISetup', location.pathname, undefined, currentStateSnapshot);
    }
  }, [selectedScriptId, selectedCharacterIds, userCharacterId, aiConfigs, updateLastVisitedNavInfo, location.pathname, mode]);

  const selectedScript = useMemo(() => {
    return scripts.find(script => script.id === selectedScriptId);
  }, [scripts, selectedScriptId]);

  const scriptCharacters = useMemo(() => {
    if (!selectedScript || !selectedScript.characterIds || selectedScript.characterIds.length === 0) {
       return [];
    }
    const characterIdSet = new Set(selectedScript.characterIds);
    const filteredCharacters = characters.filter(char => characterIdSet.has(char.id));
    return filteredCharacters;
  }, [characters, selectedScript]);

  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    setSelectedCharacterIds([]);
    setUserCharacterId(null);
    setAiConfigs(new Map()); // 清空AI配置
    // 清空AI选择相关的状态
    setSelectedServiceProviderForAI(null);
    setSelectedConfigIdForAI(null);
    setAvailableModelsForSelectedConfig([]);
  };

  const handleCharacterSelectionChange = (checkedValues: Key[]) => {
    if (checkedValues.length > 2) {
      message.warning('单人单 AI 模式最多只能选择两个出场角色哦！');
      return;
    }
    setSelectedCharacterIds(checkedValues);
    if (userCharacterId && !checkedValues.includes(userCharacterId)) {
      setUserCharacterId(null);
    }
    // 清理被移除角色的AI配置
    const newAiConfigs = new Map(aiConfigs);
    let aiConfigChanged = false;
    aiConfigs.forEach((_, charId) => {
      if (!checkedValues.includes(charId)) {
        newAiConfigs.delete(charId);
        aiConfigChanged = true;
      }
    });
    if (aiConfigChanged) {
        setAiConfigs(newAiConfigs);
    }

    // 如果当前配置AI的角色被移除了，也清空AI选择状态
    const aiCharacterToConfigure = checkedValues.find(id => id !== userCharacterId);
    if (!aiCharacterToConfigure && (selectedServiceProviderForAI || selectedConfigIdForAI)) {
        setSelectedServiceProviderForAI(null);
        setSelectedConfigIdForAI(null);
        setAvailableModelsForSelectedConfig([]);
    }
  };

  const handleUserCharacterChange = (e: RadioChangeEvent) => {
    const selectedUserId = e.target.value;
    setUserCharacterId(selectedUserId);
    // 如果用户扮演的角色之前是AI角色，需要清空其AI配置和选择状态
    if (selectedUserId) {
      const newAiConfigs = new Map(aiConfigs);
      if (newAiConfigs.has(selectedUserId)) {
        newAiConfigs.delete(selectedUserId);
        setAiConfigs(newAiConfigs);
      }
      // 如果当前正在配置的AI角色变成了用户角色，清空选择状态
      const currentAIConfigCharId = selectedCharacterIds.find(id => id !== selectedUserId && id === (aiConfigs.keys().next().value)); // 这是一个简化的查找，假设只有一个AI角色
      if (currentAIConfigCharId === selectedUserId || !selectedCharacterIds.find(id => id !== selectedUserId)) {
          setSelectedServiceProviderForAI(null);
          setSelectedConfigIdForAI(null);
          setAvailableModelsForSelectedConfig([]);
      }
    }
  };

  // handleAIConfigChange 已经移到前面并用 useCallback 包裹

  const handleStartChat = () => {
    if (!selectedScriptId) { message.error('请先选择剧本！'); return; }
    if (selectedCharacterIds.length !== 2) { message.error('单人单 AI 模式需要正好选择两个出场角色！'); return; }
    if (!userCharacterId) { message.error('请选择您要扮演的角色！'); return; }
    const aiCharacterId = selectedCharacterIds.find(id => id !== userCharacterId);
    if (!aiCharacterId) { message.error('无法确定 AI 扮演的角色！'); return; }
    const aiConfig = aiConfigs.get(aiCharacterId as string); // 现在是 { configId, modelName }
    const aiCharacterName = characters.find(c=>c.id===aiCharacterId)?.name || 'AI';
    // 更新检查逻辑
    // 更新检查逻辑，现在 CharacterAIConfig 包含 providerId, configId, modelName
    if (!aiConfig || !aiConfig.providerId || !aiConfig.configId || !aiConfig.modelName) {
      message.error(`请为 AI 角色 "${aiCharacterName}" 选择服务商、命名配置和模型！确保所有三项都已选择。`);
      return;
    }
    const participatingChars = characters.filter(c => selectedCharacterIds.includes(c.id));
    if (participatingChars.length !== 2) { message.error('无法找到完整的出场角色信息！'); return; }
    if (!selectedScript) { message.error('无法找到选中的剧本信息！'); return; }

    const chatConfig = {
      mode,
      script: selectedScript,
      participatingCharacters: participatingChars,
      userCharacterId,
      aiConfigs: Object.fromEntries(aiConfigs.entries()),
    };
    logger.info('开始聊天，配置:', chatConfig);
    navigate('/single-user-single-ai-interface', { state: chatConfig });
  };

  return (
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/chat-mode-selection')}
            style={{ marginRight: '16px' }}
            aria-label="返回模式选择"
          />
          <Typography.Title level={2} style={{ marginBottom: 0 }}>单人单 AI 模式设置</Typography.Title>
        </div>
        <Spin spinning={loading}>
          <Card title="1. 选择剧本" style={{ marginBottom: 16 }}>
            <Select
              showSearch
              placeholder="请选择一个剧本"
              optionFilterProp="label"
              style={{ width: '100%' }}
              value={selectedScriptId}
              onChange={handleScriptChange}
              options={scripts.map(script => ({ value: script.id, label: script.title }))}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            {selectedScript && (
              <div style={{ marginTop: 8 }}>
                <Typography.Text type="secondary">
                  {selectedScript.synopsis || selectedScript.scene || '暂无简介'}
                </Typography.Text>
              </div>
            )}
          </Card>

          {selectedScript && (
            <Card title="2. 选择出场角色" style={{ marginBottom: 16 }}>
              {scriptCharacters.length > 0 ? (
                <Checkbox.Group
                  options={scriptCharacters.map(char => ({ label: char.name, value: char.id }))}
                  value={selectedCharacterIds}
                  onChange={handleCharacterSelectionChange}
                />
              ) : (
                <Typography.Text type="secondary">该剧本尚未关联任何角色。</Typography.Text>
              )}
            </Card>
          )}

          {selectedScript && selectedCharacterIds.length > 0 && (
            <Card title="3. 配置角色与 AI" style={{ marginBottom: 16 }}>
              <>
                <Typography.Paragraph strong>请选择您要扮演的角色：</Typography.Paragraph>
                <Radio.Group onChange={handleUserCharacterChange} value={userCharacterId}>
                    {selectedCharacterIds.map(charId => {
                      const character = characters.find(c => c.id === charId);
                      return character ? (
                        <Radio key={charId} value={charId}>{character.name}</Radio>
                      ) : null;
                    })}
                  </Radio.Group>
                <Divider />
              </>

              {userCharacterId && (
                <>
                  <Typography.Paragraph strong>为 AI 角色配置模型：</Typography.Paragraph>
                  <Row gutter={[16, 16]}>
                    {selectedCharacterIds
                      .filter(charId => charId !== userCharacterId)
                      .map(charId => {
                        const character = characters.find(c => c.id === charId);
                        if (!character) return null;

                        // 获取当前AI角色的最终保存的配置
                        // 获取当前AI角色的最终保存的配置，现在包含 providerId
                        const finalAIConfig = aiConfigs.get(character.id) || { configId: '', modelName: '', providerId: '' };

                        // 服务商列表 (去重)
                        const serviceProviders = Array.from(new Set(allAIConfigs.map(c => c.serviceProvider)));

                        // 根据选中的服务商筛选命名配置
                        const namedConfigsForProvider = selectedServiceProviderForAI
                          ? allAIConfigs.filter(c => c.serviceProvider === selectedServiceProviderForAI)
                          : [];

                        // 当前选中的模型列表 (已在 state: availableModelsForSelectedConfig 中)

                        return (
                          <Col key={character.id} xs={24}> {/* 改为 xs={24} 以适应三级选择器 */}
                            <Card size="small" title={`配置 AI: ${character.name}`}>
                              {/* 第一级：选择服务商 */}
                              <Select
                                placeholder="1. 选择服务商"
                                style={{ width: '100%', marginBottom: 8 }}
                                value={selectedServiceProviderForAI}
                                onChange={(value) => handleAIConfigChange(character.id, 'serviceProvider', value)}
                                options={serviceProviders.map(sp => ({ value: sp, label: sp }))}
                                loading={loading && !allAIConfigs.length} // 初始加载时显示loading
                              />
                              {/* 第二级：选择命名Key/配置 */}
                              <Select
                                placeholder="2. 选择命名配置"
                                style={{ width: '100%', marginBottom: 8 }}
                                value={selectedConfigIdForAI} // 使用临时的 selectedConfigIdForAI
                                onChange={(value) => handleAIConfigChange(character.id, 'configId', value)}
                                options={namedConfigsForProvider.map(c => ({ value: c.id, label: c.name }))}
                                disabled={!selectedServiceProviderForAI || loading}
                                loading={loading && !!selectedServiceProviderForAI && !namedConfigsForProvider.length && allAIConfigs.some(c => c.serviceProvider === selectedServiceProviderForAI)}
                              />
                              {/* 第三级：选择模型 */}
                              <Select
                                placeholder="3. 选择模型"
                                style={{ width: '100%' }}
                                value={finalAIConfig.modelName || undefined} // 从最终保存的配置中读取 modelName
                                onChange={(value) => handleAIConfigChange(character.id, 'modelName', value)}
                                options={availableModelsForSelectedConfig.map(m => ({ value: m, label: m }))}
                                disabled={!selectedConfigIdForAI || loading}
                                loading={loading && !!selectedConfigIdForAI && !availableModelsForSelectedConfig.length}
                              />
                            </Card>
                          </Col>
                        );
                    })}
                  </Row>
                </>
              )}
            </Card>
          )}

          <Button
            type="primary"
            onClick={handleStartChat}
            disabled={!selectedScriptId || selectedCharacterIds.length !== 2 || !userCharacterId || loading}
            style={{ marginTop: 16 }}
          >
            开始聊天
          </Button>

        </Spin>
      </div>
    </div>
  );
};

export default SingleUserSingleAISetupPage;