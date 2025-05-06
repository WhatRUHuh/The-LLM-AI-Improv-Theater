import React, { useState, useEffect, useMemo, Key, useCallback } from 'react'; // <--- 添加 useCallback
import { useLocation, useNavigate } from 'react-router-dom';
import { Select, Checkbox, Button, message, Spin, Typography, Card, Row, Col, theme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { Script, AICharacter, AIConfig } from '../types'; // <--- 导入 AIConfig
import type { ChatMode } from '../types';
import { useLastVisited } from '../hooks/useLastVisited';
import { setupLogger as logger } from '../utils/logger'; // 导入日志工具

// 定义角色 AI 配置结构 (更新)
interface CharacterAIConfig {
  configId: string; // 保存 AIConfig 的 ID
  modelName: string; // 保存选定的模型名称
  providerId: string; // 新增：保存服务商ID
}

// 定义导演模式设置页面内部状态快照的类型 (更新 aiConfigs)
interface DirectorSetupPageStateSnapshot {
  selectedScriptId: string | null;
  selectedCharacterIds: Key[]; // 导演模式下，这些都是AI角色
  aiConfigs: Record<string, CharacterAIConfig>; // CharacterAIConfig 已更新
  mode?: ChatMode;
}


const DirectorModeSetupPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateLastVisitedNavInfo } = useLastVisited();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const restoredState = location.state as DirectorSetupPageStateSnapshot | undefined;
  const mode: ChatMode = 'director'; // 固定模式

  const [loading, setLoading] = useState(true); // 全局加载状态
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [allAIConfigs, setAllAIConfigs] = useState<AIConfig[]>([]); // 新增: 存储所有AI配置
  const [initialDataLoaded, setInitialDataLoaded] = useState(false); // <--- 新增状态，用于标记初始数据是否加载完毕
 
  // 为每个AI角色独立管理其选择状态和模型列表
  const [selectedServiceProvidersMap, setSelectedServiceProvidersMap] = useState<Map<string, string | null>>(new Map());
  const [selectedConfigIdsMap, setSelectedConfigIdsMap] = useState<Map<string, string | null>>(new Map());
  const [availableModelsMap, setAvailableModelsMap] = useState<Map<string, string[]>>(new Map());
  const [loadingModelsMap, setLoadingModelsMap] = useState<Map<string, boolean>>(new Map());

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredState?.selectedScriptId ?? null);
  // 允许多选，初始值来自恢复状态或空数组
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Key[]>(restoredState?.selectedCharacterIds ?? []);
  // 导演模式不需要 userCharacterId
  // const [userCharacterId, setUserCharacterId] = useState<string | null>(restoredState?.userCharacterId ?? null);
  const initialAiConfigsMap = useMemo(() => {
      const map = new Map<string, CharacterAIConfig>();
      if (restoredState?.aiConfigs) {
          Object.entries(restoredState.aiConfigs).forEach(([key, value]) => {
              map.set(key, value);
          });
      }
      return map;
  }, [restoredState?.aiConfigs]);
  const [aiConfigs, setAiConfigs] = useState<Map<string, CharacterAIConfig>>(initialAiConfigsMap);

  // AI配置处理函数 (与SingleUserMultiAISetupPage类似)
  const handleAIConfigChange = useCallback((
    characterId: string,
    field: 'serviceProvider' | 'configId' | 'modelName',
    value: string | null
  ) => {
    logger.info(`[导演模式 AI 配置变更] 角色 ${characterId}: 字段 ${field} 变为 ${value}`);

    if (field === 'serviceProvider') {
      setSelectedServiceProvidersMap(prev => new Map(prev).set(characterId, value));
      setSelectedConfigIdsMap(prev => new Map(prev).set(characterId, null));
      setAvailableModelsMap(prev => new Map(prev).set(characterId, []));
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        // 当服务商改变时，清空 configId 和 modelName，但记录 providerId
        newConfigs.set(characterId, { configId: '', modelName: '', providerId: value || '' });
        return newConfigs;
      });
    } else if (field === 'configId') {
      setSelectedConfigIdsMap(prev => new Map(prev).set(characterId, value));
      setAvailableModelsMap(prev => new Map(prev).set(characterId, []));
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        // 当 configId 改变时，保留 providerId，清空 modelName
        const current = newConfigs.get(characterId) || { configId: '', modelName: '', providerId: '' }; // 确保有 providerId 字段
        newConfigs.set(characterId, { ...current, configId: value || '', modelName: '' });
        return newConfigs;
      });

      if (value) {
        setLoadingModelsMap(prev => new Map(prev).set(characterId, true));
        window.electronAPI.getAvailableModelsByConfigId(value)
          .then((result: { success: boolean; data?: string[]; error?: string }) => {
            if (result.success && result.data) {
              setAvailableModelsMap(prev => new Map(prev).set(characterId, result.data || []));
              logger.info(`[导演模式 AI 配置] 角色 ${characterId}: 为 configId ${value} 加载到模型:`, result.data);
              const charSpecificRestoredConfig = restoredState?.aiConfigs?.[characterId];
              if (charSpecificRestoredConfig && charSpecificRestoredConfig.modelName && result.data.includes(charSpecificRestoredConfig.modelName)) {
                logger.info(`[导演模式 AI 配置回填] 角色 ${characterId}: 模型列表加载完毕，自动选择已保存的模型: ${charSpecificRestoredConfig.modelName}`);
                setAiConfigs(prev => {
                    const newConfigs = new Map(prev);
                    const currentFullConfig = newConfigs.get(characterId);
                    if (currentFullConfig) {
                        // 回填模型时，确保 providerId 和 configId 已存在
                        newConfigs.set(characterId, {
                            ...currentFullConfig, // currentFullConfig 应已包含正确的 providerId 和 configId
                            modelName: charSpecificRestoredConfig.modelName
                        });
                    }
                    return newConfigs;
                });
              }
            } else {
              message.error(`为角色 ${characterId} 加载模型列表失败: ${result.error}`);
              setAvailableModelsMap(prev => new Map(prev).set(characterId, []));
            }
          })
          .catch((err: Error) => {
            message.error(`为角色 ${characterId} 加载模型列表时发生错误: ${err.message}`);
            setAvailableModelsMap(prev => new Map(prev).set(characterId, []));
          })
          .finally(() => {
            setLoadingModelsMap(prev => new Map(prev).set(characterId, false));
          });
      }
    } else if (field === 'modelName') {
      setAiConfigs(prev => {
        const newConfigs = new Map(prev);
        const currentFullConfig = newConfigs.get(characterId);
        // 设置模型时，确保 providerId 和 configId 都已存在于 currentFullConfig 中
        // CharacterAIConfig 类型要求 providerId 是 string
        if (currentFullConfig && currentFullConfig.configId && typeof currentFullConfig.providerId === 'string') {
          newConfigs.set(characterId, { ...currentFullConfig, modelName: value || '' });
        } else {
          logger.warn(`[导演模式 AI 配置] 角色 ${characterId}: 尝试在没有完整配置 (configId 或 providerId 缺失) 的情况下设置modelName。 Current:`, currentFullConfig);
        }
        return newConfigs;
      });
    }
  // 中文注释：问题二：无限循环。useCallback 的依赖项。
  // restoredState?.aiConfigs 用于模型回填。
  // 各个 setter 函数的引用是稳定的。
  // 这个 useCallback 的依赖项本身是安全的。
  }, [restoredState?.aiConfigs]);
 
 
  // Effect 1: 加载核心静态数据 (剧本、角色、所有AI配置)
  // 中文注释：问题二：无限循环。这个 effect 负责加载页面所需的基础数据。
  // 它应该只在组件首次挂载时运行一次。
  // 依赖项为空数组 `[]`，确保它只运行一次。
  // 它会设置 `initialDataLoaded` 为 true，以触发后续的状态恢复 effect。
  useEffect(() => {
    const loadInitialStaticData = async () => {
      logger.info('[Effect 1 - DirectorMode] 开始加载初始静态数据 (剧本、角色、AI配置)...');
      setLoading(true);
      setInitialDataLoaded(false); // 重置，确保恢复逻辑在本次加载后运行
 
      try {
        const [scriptsResult, charactersResult, aiConfigsResult] = await Promise.all([
          window.electronAPI.listScripts(),
          window.electronAPI.listCharacters(),
          window.electronAPI.getAllAIConfigs(),
        ]);
        logger.info('[Effect 1 - DirectorMode] 初始静态数据IPC调用完成:', { scriptsResult, charactersResult, aiConfigsResult });
 
        if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
          setScripts(scriptsResult.data);
        } else {
          message.error(`加载剧本列表失败: ${scriptsResult.error || '数据格式错误'}`);
          setScripts([]);
        }
 
        if (charactersResult.success && Array.isArray(charactersResult.data)) {
          setCharacters(charactersResult.data);
        } else {
          message.error(`加载角色列表失败: ${charactersResult.error || '数据格式错误'}`);
          setCharacters([]);
        }
 
        if (aiConfigsResult.success && Array.isArray(aiConfigsResult.data)) {
          setAllAIConfigs(aiConfigsResult.data);
        } else {
          message.error(`加载 AI 配置列表失败: ${aiConfigsResult.error || '数据格式错误'}`);
          setAllAIConfigs([]);
        }
        
        setInitialDataLoaded(true); // 标记所有初始数据已尝试加载
        logger.info('[Effect 1 - DirectorMode] 初始静态数据加载流程完成。 initialDataLoaded 设置为 true。');
 
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Effect 1 - DirectorMode] 加载初始静态数据时发生严重错误: ${errorMsg}`, error);
        message.error(`加载初始数据时出错: ${errorMsg}`);
        setInitialDataLoaded(true); // 即使出错，也标记为 loaded
      }
      // setLoading(false) 的职责移交给 Effect 2
    };
 
    loadInitialStaticData();
  }, []); // 空依赖数组，确保只在挂载时运行一次
 
  // Effect 2: 状态恢复逻辑
  // 中文注释：问题二：无限循环。这个 effect 负责在核心数据加载完毕后，根据 restoredState 恢复 AI 配置。
  // 依赖于 `initialDataLoaded`, `restoredState`, `allAIConfigs`, `handleAIConfigChange`, `characters`。
  // 这个 effect 的依赖项经过仔细选择，以避免不必要的重执行。
  useEffect(() => {
    const restoreAIConfigurationState = async () => {
      if (!initialDataLoaded) {
        logger.info('[Effect 2 - DirectorMode] 初始数据尚未加载完成，跳过AI配置恢复。');
        return;
      }
 
      if (!restoredState || !restoredState.aiConfigs || Object.keys(restoredState.aiConfigs).length === 0) {
        logger.info('[Effect 2 - DirectorMode] 没有检测到已保存的AI配置状态，或状态为空，无需恢复。');
        setLoading(false); // 无需恢复，关闭 loading
        return;
      }
      
      if (allAIConfigs.length === 0 && Object.values(restoredState.aiConfigs).some(c => c.configId)) {
          logger.warn('[Effect 2 - DirectorMode] 存在已保存的AI配置，但全局AI配置列表 (allAIConfigs) 为空。恢复可能失败。');
      }
 
      logger.info('[Effect 2 - DirectorMode] 检测到有效状态且初始数据已加载，开始恢复AI配置:', restoredState.aiConfigs);
      setLoading(true); // 开始恢复，显示 Spin
 
      let restorationCompletelySuccessful = true;
 
      for (const [charId, savedConfig] of Object.entries(restoredState.aiConfigs)) {
        if (savedConfig.configId) {
          logger.info(`[Effect 2 - DirectorMode] 为角色 ${charId} 尝试恢复配置: ID=${savedConfig.configId}, 模型=${savedConfig.modelName}`);
          try {
            const fullAIConfigFromServer = allAIConfigs.find(c => c.id === savedConfig.configId);
 
            if (fullAIConfigFromServer) {
              logger.info(`[Effect 2 - DirectorMode] 成功从 allAIConfigs 找到角色 ${charId} 的配置详情:`, fullAIConfigFromServer);
 
              handleAIConfigChange(charId, 'serviceProvider', fullAIConfigFromServer.serviceProvider);
              handleAIConfigChange(charId, 'configId', fullAIConfigFromServer.id);
              
              setAiConfigs(prevMap => {
                const newMap = new Map(prevMap);
                newMap.set(charId, {
                  configId: savedConfig.configId,
                  modelName: savedConfig.modelName,
                  providerId: fullAIConfigFromServer.serviceProvider
                });
                logger.info(`[Effect 2 - DirectorMode] [最终强制更新] 角色 ${charId} 的 aiConfigs Map 已更新为:`, newMap.get(charId));
                return newMap;
              });
 
            } else {
              restorationCompletelySuccessful = false;
              const charName = characters.find(c=>c.id === charId)?.name || charId;
              logger.error(`[Effect 2 - DirectorMode] 恢复AI配置失败 (角色 ${charName}): 未找到ID为 ${savedConfig.configId} 的配置详情。`);
              message.error(`恢复AI配置失败 (角色 ${charName}): 无法找到配置ID ${savedConfig.configId}。`);
            }
          } catch (error) {
            restorationCompletelySuccessful = false;
            const errorMsg = error instanceof Error ? error.message : String(error);
            const charName = characters.find(c=>c.id === charId)?.name || charId;
            logger.error(`[Effect 2 - DirectorMode] 恢复角色 ${charName} 的AI配置时发生错误: ${errorMsg}`, error);
            message.error(`恢复AI配置时出错 (角色 ${charName}): ${errorMsg}`);
          }
        } else {
          logger.info(`[Effect 2 - DirectorMode] 角色 ${charId} 在已保存状态中没有 configId，跳过恢复。`);
        }
      }
 
      if (!restorationCompletelySuccessful) {
          logger.warn("[Effect 2 - DirectorMode] 部分或全部AI配置恢复失败。");
      } else {
          logger.info("[Effect 2 - DirectorMode] 所有AI配置项恢复尝试完毕。");
      }
      
      setLoading(false); // 恢复流程结束，关闭 loading
      logger.info('[Effect 2 - DirectorMode] AI配置恢复流程结束，全局loading关闭。');
    };
 
    restoreAIConfigurationState();
  // 中文注释：问题二：无限循环。Effect 2 的依赖项。
  }, [initialDataLoaded, restoredState, allAIConfigs, handleAIConfigChange, characters]);
 
  useEffect(() => {
    const currentStateSnapshot: DirectorSetupPageStateSnapshot = {
    // 中文注释：问题二：无限循环。这个 effect 用于保存页面快照。
    // 通过将数据加载和恢复逻辑分离到独立的、依赖管理更严格的 effect 中，
    // 可以减少 aiConfigs 不必要的更新，从而避免此 effect 参与到无限循环中。
      selectedScriptId,
      selectedCharacterIds,
      aiConfigs: Object.fromEntries(aiConfigs.entries()),
      mode: mode
    };
    updateLastVisitedNavInfo('directorModeSetup', location.pathname, undefined, currentStateSnapshot);
  }, [selectedScriptId, selectedCharacterIds, aiConfigs, updateLastVisitedNavInfo, location.pathname, mode]);

  const selectedScript = useMemo(() => scripts.find(script => script.id === selectedScriptId), [scripts, selectedScriptId]);

  const scriptCharacters = useMemo(() => {
    if (!selectedScript?.characterIds?.length) return [];
    const characterIdSet = new Set(selectedScript.characterIds);
    return characters.filter(char => characterIdSet.has(char.id));
  }, [characters, selectedScript]);

  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    setSelectedCharacterIds([]);
    setAiConfigs(new Map());
    setSelectedServiceProvidersMap(new Map());
    setSelectedConfigIdsMap(new Map());
    setAvailableModelsMap(new Map());
    setLoadingModelsMap(new Map());
  };

  const handleCharacterSelectionChange = (checkedValues: Key[]) => {
    setSelectedCharacterIds(checkedValues);
    const newAiConfigs = new Map(aiConfigs);
    let changed = false;
    aiConfigs.forEach((_, charId) => {
      if (!checkedValues.includes(charId)) {
        newAiConfigs.delete(charId);
        setSelectedServiceProvidersMap(prev => { const m = new Map(prev); m.delete(charId as string); return m; });
        setSelectedConfigIdsMap(prev => { const m = new Map(prev); m.delete(charId as string); return m; });
        setAvailableModelsMap(prev => { const m = new Map(prev); m.delete(charId as string); return m; });
        setLoadingModelsMap(prev => { const m = new Map(prev); m.delete(charId as string); return m; });
        changed = true;
      }
    });
    if (changed) setAiConfigs(newAiConfigs);
  };

  // handleAIConfigChange 已移到前面

  // 开始聊天按钮逻辑
  const handleStartChat = () => {
    if (!selectedScriptId) { message.error('请先选择剧本！'); return; } // 中文注释
    if (selectedCharacterIds.length < 2) { message.error('导演模式至少需要选择两个 AI 角色进行表演！'); return; } // 中文注释

    // 检查所有选中的 AI 角色是否都已配置
    let allAIConfigured = true;
    const missingConfigChars: string[] = [];
    for (const aiCharId of selectedCharacterIds) {
      const config = aiConfigs.get(aiCharId as string);
      const character = characters.find(c => c.id === aiCharId);
      // 更新检查逻辑
      // 更新检查逻辑，CharacterAIConfig 现在包含 providerId
      if (!config || !config.providerId || !config.configId || !config.modelName) {
        allAIConfigured = false;
        missingConfigChars.push(character?.name ?? `ID: ${aiCharId}`);
      }
    }
    if (!allAIConfigured) {
      message.error(`请为以下 AI 角色选择服务商、命名配置和模型：${missingConfigChars.join(', ')}`);
      return;
    }

    const participatingChars = characters.filter(c => selectedCharacterIds.includes(c.id));
    if (participatingChars.length !== selectedCharacterIds.length) { message.error('无法找到完整的出场角色信息！'); return; } // 中文注释
    if (!selectedScript) { message.error('无法找到选中的剧本信息！'); return; } // 中文注释

    const chatConfig = {
      mode,
      script: selectedScript,
      participatingCharacters: participatingChars,
      userCharacterId: null, // 导演模式没有用户扮演的角色
      // aiConfigs 的键是 AICharacter 的 id，值是 CharacterAIConfig 对象
      // CharacterAIConfig 已经更新为包含 providerId, configId, modelName
      aiConfigs: Object.fromEntries(aiConfigs.entries()),
    };
    logger.info('开始聊天 (导演模式)，配置:', chatConfig); // 中文注释
    // 导航到导演模式聊天界面
    navigate('/director-mode-interface', { state: chatConfig });
  };

  const isStartChatDisabled = !selectedScriptId || selectedCharacterIds.length < 2 || loading;

  return (
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/chat-mode-selection')}
            style={{ marginRight: '16px' }}
            aria-label="返回模式选择" // 中文注释
          />
          <Typography.Title level={2} style={{ marginBottom: 0 }}>导演模式设置</Typography.Title> {/* 中文注释 */}
        </div>
        <Spin spinning={loading}>
          <Card title="1. 选择剧本" style={{ marginBottom: 16 }}> {/* 中文注释 */}
            <Select
              showSearch
              placeholder="请选择一个剧本" // 中文注释
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
                  {selectedScript.synopsis || selectedScript.scene || '暂无简介'} {/* 中文注释 */}
                </Typography.Text>
              </div>
            )}
          </Card>

          {selectedScript && (
            <Card title="2. 选择出场 AI 角色 (至少2位)" style={{ marginBottom: 16 }}> {/* 中文注释 */}
              {scriptCharacters.length > 0 ? (
                <Checkbox.Group
                  options={scriptCharacters.map(char => ({ label: char.name, value: char.id }))}
                  value={selectedCharacterIds}
                  onChange={handleCharacterSelectionChange}
                />
              ) : (
                <Typography.Text type="secondary">该剧本尚未关联任何角色。</Typography.Text> // 中文注释
              )}
              {selectedCharacterIds.length < 2 && selectedCharacterIds.length > 0 && (
                  <Typography.Text type="warning" style={{ display: 'block', marginTop: 8 }}>请至少选择两个 AI 角色。</Typography.Text> // 中文注释
              )}
            </Card>
          )}

          {selectedScript && selectedCharacterIds.length >= 1 && ( // 至少选中1个角色才显示配置区域
            <Card title="3. 为所有 AI 角色配置模型" style={{ marginBottom: 16 }}> {/* 中文注释 */}
              <Row gutter={[16, 16]}>
                {selectedCharacterIds
                  .map(charId => {
                    const character = characters.find(c => c.id === charId);
                    if (!character) return null;

                    const selectedServiceProvider = selectedServiceProvidersMap.get(character.id) ?? null;
                    const selectedConfigId = selectedConfigIdsMap.get(character.id) ?? null;
                    const modelsForThisChar = availableModelsMap.get(character.id) || [];
                    const isLoadingModels = loadingModelsMap.get(character.id) || false;
                    // 获取当前AI角色的最终保存的配置，现在包含 providerId
                    const finalAIConfig = aiConfigs.get(character.id) || { configId: '', modelName: '', providerId: '' };

                    const serviceProviderOptions = Array.from(new Set(allAIConfigs.map(c => c.serviceProvider)))
                      .map(sp => ({ value: sp, label: sp }));

                    const namedConfigsForProvider = selectedServiceProvider
                      ? allAIConfigs.filter(c => c.serviceProvider === selectedServiceProvider)
                          .map(c => ({ value: c.id, label: c.name }))
                      : [];

                    return (
                      <Col key={character.id} xs={24} sm={12} md={8} lg={6}>
                        <Card size="small" title={`AI: ${character.name}`}>
                          <Select
                            placeholder="1. 选择服务商"
                            style={{ width: '100%', marginBottom: 8 }}
                            value={selectedServiceProvider}
                            onChange={(value) => handleAIConfigChange(character.id, 'serviceProvider', value)}
                            options={serviceProviderOptions}
                            loading={loading && !allAIConfigs.length}
                          />
                          <Select
                            placeholder="2. 选择命名配置"
                            style={{ width: '100%', marginBottom: 8 }}
                            value={selectedConfigId}
                            onChange={(value) => handleAIConfigChange(character.id, 'configId', value)}
                            options={namedConfigsForProvider}
                            disabled={!selectedServiceProvider || (loading && !namedConfigsForProvider.length)}
                          />
                          <Select
                            placeholder="3. 选择模型"
                            style={{ width: '100%' }}
                            value={finalAIConfig.modelName || undefined}
                            onChange={(value) => handleAIConfigChange(character.id, 'modelName', value)}
                            options={modelsForThisChar.map(m => ({ value: m, label: m }))}
                            disabled={!selectedConfigId || isLoadingModels}
                            loading={isLoadingModels}
                          />
                        </Card>
                      </Col>
                    );
                })}
              </Row>
            </Card>
          )}

          <Button
            type="primary"
            onClick={handleStartChat}
            disabled={isStartChatDisabled}
            style={{ marginTop: 16 }}
          >
            进入导演模式 {/* 中文注释 */}
          </Button>

        </Spin>
      </div>
    </div>
  );
};

export default DirectorModeSetupPage;