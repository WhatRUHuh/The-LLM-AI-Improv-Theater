import React, { useState, useEffect, useMemo, Key } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Select, Checkbox, Radio, Button, message, Spin, Typography, Card, Row, Col, Divider, RadioChangeEvent, theme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { Script, AICharacter } from '../types';
import type { ChatMode } from '../types';
import { useLastVisited } from '../hooks/useLastVisited';
import { setupLogger as logger } from '../utils/logger'; // 导入日志工具

// 定义 AI 服务商信息结构 (复用或重新定义)
interface LLMServiceInfo {
  providerId: string;
  providerName: string;
  defaultModels: string[];
}

// 定义角色 AI 配置结构
interface CharacterAIConfig {
  providerId: string;
  model: string;
}

// 定义页面内部状态快照的类型
interface SetupPageStateSnapshot {
  selectedScriptId: string | null;
  selectedCharacterIds: Key[];
  userCharacterId: string | null;
  aiConfigs: Record<string, CharacterAIConfig>; // Map 不能直接序列化，转成对象
  mode?: ChatMode; // 把 mode 也存进去
}


const SingleUserMultiAISetupPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateLastVisitedNavInfo } = useLastVisited();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const restoredState = location.state as SetupPageStateSnapshot | undefined;
  // 固定模式为 singleUserMultiAI
  const mode: ChatMode = 'singleUserMultiAI';

  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [llmServices, setLlmServices] = useState<LLMServiceInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<Map<string, string[]>>(new Map());

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredState?.selectedScriptId ?? null);
  // 允许多选，初始值来自恢复状态或空数组
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Key[]>(restoredState?.selectedCharacterIds ?? []);
  const [userCharacterId, setUserCharacterId] = useState<string | null>(restoredState?.userCharacterId ?? null);
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


  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        logger.info('加载单人多AI设置页初始数据...');
        const [scriptsResult, charactersResult, servicesResult] = await Promise.all([
          window.electronAPI.listScripts(),
          window.electronAPI.listCharacters(),
          window.electronAPI.llmGetServices(),
        ]);
        logger.info('数据已加载:', { scriptsResult, charactersResult, servicesResult });

        if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
          setScripts(scriptsResult.data);
        } else {
          message.error(`加载剧本列表失败: ${scriptsResult.error || '数据格式错误'}`);
        }

        if (charactersResult.success && Array.isArray(charactersResult.data)) {
          setCharacters(charactersResult.data);
        } else {
          message.error(`加载角色列表失败: ${charactersResult.error || '数据格式错误'}`);
        }

        if (servicesResult.success && servicesResult.data) {
          setLlmServices(servicesResult.data);
          const modelPromises = servicesResult.data.map(async (service) => {
            try {
              const modelsResult = await window.electronAPI.llmGetAvailableModels(service.providerId);
              if (modelsResult.success && modelsResult.data) {
                return { providerId: service.providerId, models: modelsResult.data };
              } else {
                logger.warn(`获取 ${service.providerName} 模型列表失败或无数据，使用默认模型: ${service.defaultModels.join(', ')}`);
                return { providerId: service.providerId, models: service.defaultModels };
              }
            } catch (modelError: unknown) {
              const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
              logger.error(`调用获取 ${service.providerName} 模型时出错: ${errorMsg}`);
              return { providerId: service.providerId, models: service.defaultModels };
            }
          });
          const loadedModels = await Promise.all(modelPromises);
          const modelsMap = new Map<string, string[]>();
          loadedModels.forEach(item => modelsMap.set(item.providerId, item.models));
          setAvailableModels(modelsMap);
        } else {
          message.error(`加载 AI 服务商失败: ${servicesResult.error}`);
        }

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`加载设置数据时出错: ${errorMsg}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    if (restoredState) {
        logger.info('恢复内部状态:', restoredState);
    }
  }, [restoredState]); // 移除 mode, navigate 依赖，因为 mode 是固定的

  useEffect(() => {
    // 保存当前状态以便返回时恢复
    const currentStateSnapshot: SetupPageStateSnapshot = {
      selectedScriptId,
      selectedCharacterIds,
      userCharacterId,
      aiConfigs: Object.fromEntries(aiConfigs.entries()),
      mode: mode
    };
    updateLastVisitedNavInfo('singleUserMultiAISetup', location.pathname, undefined, currentStateSnapshot);
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
    setAiConfigs(new Map());
  };

  // 处理角色选择变化 (允许多选，至少需要2个角色：1个用户 + >=1个AI)
  const handleCharacterSelectionChange = (checkedValues: Key[]) => {
    setSelectedCharacterIds(checkedValues);
    // 如果用户扮演的角色不再选中列表中，则清空用户角色选择
    if (userCharacterId && !checkedValues.includes(userCharacterId)) {
      setUserCharacterId(null);
    }
    // 清理不再选中的角色的 AI 配置
    const newAiConfigs = new Map(aiConfigs);
    aiConfigs.forEach((_, charId) => {
      if (!checkedValues.includes(charId)) {
        newAiConfigs.delete(charId);
      }
    });
    setAiConfigs(newAiConfigs);
  };

  // 处理用户扮演角色变化
  const handleUserCharacterChange = (e: RadioChangeEvent) => {
    const selectedUserId = e.target.value;
    setUserCharacterId(selectedUserId);
    // 当用户选择扮演某个角色时，这个角色就不需要 AI 配置了
    if (selectedUserId) {
      const newAiConfigs = new Map(aiConfigs);
      if (newAiConfigs.has(selectedUserId)) {
        newAiConfigs.delete(selectedUserId);
        setAiConfigs(newAiConfigs);
      }
    }
  };

  // 处理 AI 配置变化
  const handleAIConfigChange = (characterId: string, field: 'providerId' | 'model', value: string) => {
    setAiConfigs(prev => {
      const newConfigs = new Map(prev);
      const currentConfig = newConfigs.get(characterId) || { providerId: '', model: '' };
      const updatedConfig = { ...currentConfig, [field]: value };
      // 如果服务商变了，清空模型选择
      if (field === 'providerId') {
        updatedConfig.model = '';
      }
      newConfigs.set(characterId, updatedConfig);
      return newConfigs;
    });
  };

  // 开始聊天按钮逻辑
  const handleStartChat = () => {
    if (!selectedScriptId) { message.error('请先选择剧本！'); return; }
    if (selectedCharacterIds.length < 2) { message.error('单人多 AI 模式至少需要选择两个出场角色（包括您自己）！'); return; }
    if (!userCharacterId) { message.error('请选择您要扮演的角色！'); return; }

    const aiCharacterIds = selectedCharacterIds.filter(id => id !== userCharacterId);
    if (aiCharacterIds.length === 0) { message.error('请至少保留一个由 AI 扮演的角色！'); return; }

    // 检查所有 AI 角色是否都已配置
    let allAIConfigured = true;
    const missingConfigChars: string[] = [];
    for (const aiCharId of aiCharacterIds) {
      const config = aiConfigs.get(aiCharId as string);
      const character = characters.find(c => c.id === aiCharId);
      if (!config || !config.providerId || !config.model) {
        allAIConfigured = false;
        missingConfigChars.push(character?.name ?? `ID: ${aiCharId}`);
      }
    }
    if (!allAIConfigured) {
      message.error(`请为以下 AI 角色配置服务商和模型：${missingConfigChars.join(', ')}`);
      return;
    }

    const participatingChars = characters.filter(c => selectedCharacterIds.includes(c.id));
    if (participatingChars.length !== selectedCharacterIds.length) { message.error('无法找到完整的出场角色信息！'); return; }
    if (!selectedScript) { message.error('无法找到选中的剧本信息！'); return; }

    const chatConfig = {
      mode,
      script: selectedScript,
      participatingCharacters: participatingChars,
      userCharacterId,
      aiConfigs: Object.fromEntries(aiConfigs.entries()), // 只包含 AI 角色的配置
    };
    logger.info('开始聊天 (单人多AI)，配置:', chatConfig);
    // 导航到新的多 AI 聊天界面
    navigate('/single-user-multi-ai-interface', { state: chatConfig });
  };

  const isStartChatDisabled = !selectedScriptId || selectedCharacterIds.length < 2 || !userCharacterId || loading || selectedCharacterIds.filter(id => id !== userCharacterId).length === 0;

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
          <Typography.Title level={2} style={{ marginBottom: 0 }}>单人多 AI 模式设置</Typography.Title>
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
            <Card title="2. 选择出场角色 (至少2位)" style={{ marginBottom: 16 }}>
              {scriptCharacters.length > 0 ? (
                <Checkbox.Group
                  options={scriptCharacters.map(char => ({ label: char.name, value: char.id }))}
                  value={selectedCharacterIds}
                  onChange={handleCharacterSelectionChange}
                />
              ) : (
                <Typography.Text type="secondary">该剧本尚未关联任何角色。</Typography.Text>
              )}
              {selectedCharacterIds.length < 2 && selectedCharacterIds.length > 0 && (
                  <Typography.Text type="warning" style={{ display: 'block', marginTop: 8 }}>请至少选择两个角色（包括您自己扮演的角色）。</Typography.Text>
              )}
            </Card>
          )}

          {selectedScript && selectedCharacterIds.length >= 1 && ( // 至少选中1个角色才显示配置区域
            <Card title="3. 配置角色与 AI" style={{ marginBottom: 16 }}>
              {selectedCharacterIds.length >= 2 && ( // 至少选中2个角色才能选择扮演者
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
              )}

              {userCharacterId && selectedCharacterIds.filter(id => id !== userCharacterId).length > 0 && ( // 确定了扮演者且有AI角色
                <>
                  <Typography.Paragraph strong>为 AI 角色配置模型：</Typography.Paragraph>
                  <Row gutter={[16, 16]}>
                    {selectedCharacterIds
                      .filter(charId => charId !== userCharacterId) // 只为 AI 角色显示配置
                      .map(charId => {
                        const character = characters.find(c => c.id === charId);
                        if (!character) return null;
                        const currentAIConfig = aiConfigs.get(character.id) || { providerId: '', model: '' };
                        const modelsForProvider = availableModels.get(currentAIConfig.providerId) || [];

                        return (
                          <Col key={character.id} xs={24} sm={12} md={8} lg={6}> {/* 调整 Col 响应式布局 */}
                            <Card size="small" title={`AI: ${character.name}`}>
                              <Select
                                placeholder="选择服务商"
                                style={{ width: '100%', marginBottom: 8 }}
                                value={currentAIConfig.providerId || undefined}
                                onChange={(value) => handleAIConfigChange(character.id, 'providerId', value)}
                                options={llmServices.map(s => ({ value: s.providerId, label: s.providerName }))}
                              />
                              <Select
                                placeholder="选择模型"
                                style={{ width: '100%' }}
                                value={currentAIConfig.model || undefined}
                                onChange={(value) => handleAIConfigChange(character.id, 'model', value)}
                                options={modelsForProvider.map(m => ({ value: m, label: m }))}
                                disabled={!currentAIConfig.providerId}
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
            disabled={isStartChatDisabled}
            style={{ marginTop: 16 }}
          >
            开始聊天
          </Button>

        </Spin>
      </div>
    </div>
  );
};

export default SingleUserMultiAISetupPage;