import React, { useState, useEffect, useMemo, Key } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// 导入 theme 用于获取背景色等 token
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


const SingleUserSingleAISetupPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateLastVisitedNavInfo } = useLastVisited();
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const restoredState = location.state as SetupPageStateSnapshot | undefined;
  const initialMode = restoredState?.mode;

  const [mode] = useState<ChatMode | undefined>(initialMode);

  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [llmServices, setLlmServices] = useState<LLMServiceInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<Map<string, string[]>>(new Map());

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredState?.selectedScriptId ?? null);
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
        logger.info('加载初始数据...');
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

    if (!mode) {
      message.warning('缺少聊天模式信息，请返回重新选择');
      navigate('/chat-mode-selection', { replace: true });
      return;
    }
    loadData();
    if (restoredState) {
        logger.info('恢复内部状态:', restoredState);
    }
  }, [mode, navigate, restoredState]);

  useEffect(() => {
    if (mode) {
        const currentStateSnapshot: SetupPageStateSnapshot = {
          selectedScriptId,
          selectedCharacterIds,
          userCharacterId,
          aiConfigs: Object.fromEntries(aiConfigs.entries()),
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
    setAiConfigs(new Map());
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
    const newAiConfigs = new Map(aiConfigs);
    aiConfigs.forEach((_, charId) => {
      if (!checkedValues.includes(charId)) {
        newAiConfigs.delete(charId);
      }
    });
    setAiConfigs(newAiConfigs);
  };

  const handleUserCharacterChange = (e: RadioChangeEvent) => {
    const selectedUserId = e.target.value;
    setUserCharacterId(selectedUserId);
    if (selectedUserId) {
      const newAiConfigs = new Map(aiConfigs);
      if (newAiConfigs.has(selectedUserId)) {
        newAiConfigs.delete(selectedUserId);
        setAiConfigs(newAiConfigs);
      }
    }
  };

  const handleAIConfigChange = (characterId: string, field: 'providerId' | 'model', value: string) => {
    setAiConfigs(prev => {
      const newConfigs = new Map(prev);
      const currentConfig = newConfigs.get(characterId) || { providerId: '', model: '' };
      const updatedConfig = { ...currentConfig, [field]: value };
      if (field === 'providerId') {
        updatedConfig.model = '';
      }
      newConfigs.set(characterId, updatedConfig);
      return newConfigs;
    });
  };

  const handleStartChat = () => {
    if (!selectedScriptId) { message.error('请先选择剧本！'); return; }
    if (selectedCharacterIds.length !== 2) { message.error('单人单 AI 模式需要正好选择两个出场角色！'); return; }
    if (!userCharacterId) { message.error('请选择您要扮演的角色！'); return; }
    const aiCharacterId = selectedCharacterIds.find(id => id !== userCharacterId);
    if (!aiCharacterId) { message.error('无法确定 AI 扮演的角色！'); return; }
    const aiConfig = aiConfigs.get(aiCharacterId as string);
    const aiCharacterName = characters.find(c=>c.id===aiCharacterId)?.name || 'AI';
    if (!aiConfig || !aiConfig.providerId || !aiConfig.model) { message.error(`请为 AI 角色 "${aiCharacterName}" 配置 AI 服务商和模型！`); return; }
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
                        const currentAIConfig = aiConfigs.get(character.id) || { providerId: '', model: '' };
                        const modelsForProvider = availableModels.get(currentAIConfig.providerId) || [];

                        return (
                          <Col key={character.id} xs={24} md={12} lg={8}>
                            <Card size="small" title={`配置 AI: ${character.name}`}>
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