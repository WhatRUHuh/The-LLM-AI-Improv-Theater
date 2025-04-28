import React, { useState, useEffect, useMemo, Key } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Select, Checkbox, Radio, Button, message, Spin, Typography, Card, Row, Col, Divider, RadioChangeEvent } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { Script, AICharacter } from '../types';
import type { ChatMode } from '../types';
import { useLastVisited } from '../hooks/useLastVisited'; // <-- 修改导入路径

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
  const { updateLastVisitedNavInfo } = useLastVisited(); // <-- 使用 Context Hook

  // 尝试从 location.state 获取状态快照
  // location.state 现在应该直接是 SetupPageStateSnapshot 或 undefined
  const restoredState = location.state as SetupPageStateSnapshot | undefined;
  // 优先从恢复的状态获取 mode，否则设为 undefined
  const initialMode = restoredState?.mode;


  const [mode] = useState<ChatMode | undefined>(initialMode); // Mode 一般不应改变，设为常量

  const [loading, setLoading] = useState(true); // 统一管理数据加载状态
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [llmServices, setLlmServices] = useState<LLMServiceInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<Map<string, string[]>>(new Map());

  // --- 页面核心状态 ---
  // 优先使用恢复的状态，否则使用默认值
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(restoredState?.selectedScriptId ?? null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Key[]>(restoredState?.selectedCharacterIds ?? []);
  const [userCharacterId, setUserCharacterId] = useState<string | null>(restoredState?.userCharacterId ?? null);
  // 从恢复的对象转换回 Map
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


  // --- 数据加载 Effect ---
  useEffect(() => {
    const loadData = async () => {
      setLoading(true); // 开始加载时设置 loading
      try {
        // 并行加载所有数据 - 使用新 API
        console.log('[ChatSetupPage] Loading initial data...');
        const [scriptsResult, charactersResult, servicesResult] = await Promise.all([
          window.electronAPI.listScripts(), // <-- 使用新 API
          window.electronAPI.listCharacters(), // <-- 使用新 API
          window.electronAPI.llmGetServices(),
        ]);
        console.log('[ChatSetupPage] Data loaded:', { scriptsResult, charactersResult, servicesResult });

        // 处理剧本数据
        if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
          setScripts(scriptsResult.data); // 直接使用 data
        } else {
          message.error(`加载剧本列表失败: ${scriptsResult.error || '数据格式错误'}`);
        }

        // 处理角色数据
        if (charactersResult.success && Array.isArray(charactersResult.data)) {
          setCharacters(charactersResult.data); // 直接使用 data
        } else {
          message.error(`加载角色列表失败: ${charactersResult.error || '数据格式错误'}`);
        }

        // 处理 AI 服务商数据并加载模型
        if (servicesResult.success && servicesResult.data) {
          setLlmServices(servicesResult.data);
          // 加载每个服务商的可用模型
          const modelPromises = servicesResult.data.map(async (service) => {
            try {
              const modelsResult = await window.electronAPI.llmGetAvailableModels(service.providerId);
              if (modelsResult.success && modelsResult.data) {
                return { providerId: service.providerId, models: modelsResult.data };
              } else {
                // message.error(`加载 ${service.providerName} 模型失败: ${modelsResult.error}`); // 减少错误提示
                return { providerId: service.providerId, models: service.defaultModels }; // 出错用默认
              }
            } catch (modelError: unknown) { // <-- 使用 unknown
              const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
              console.error(`调用获取 ${service.providerName} 模型时出错: ${errorMsg}`); // 改为 console.error
              return { providerId: service.providerId, models: service.defaultModels }; // 出错用默认
            }
          });
          const loadedModels = await Promise.all(modelPromises);
          const modelsMap = new Map<string, string[]>();
          loadedModels.forEach(item => modelsMap.set(item.providerId, item.models));
          setAvailableModels(modelsMap);
        } else {
          message.error(`加载 AI 服务商失败: ${servicesResult.error}`);
        }

      } catch (error: unknown) { // <-- 使用 unknown
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`加载设置数据时出错: ${errorMsg}`);
      } finally {
        setLoading(false); // 确保 loading 结束
      }
    };

    // 检查 mode 是否有效 (从 state 中获取)
    if (!mode) {
      message.warning('缺少聊天模式信息，请返回重新选择');
      navigate('/chat-mode-selection', { replace: true });
      return;
    }

    // 总是加载最新的剧本/角色/模型列表
    loadData();

    // 如果是从 Context 恢复的状态，打印日志
    if (restoredState) {
        console.log('[ChatSetupPage] Restored internal state:', restoredState);
    }


  }, [mode, navigate, restoredState]); // 添加 restoredState 到依赖项

  // --- 保存状态到 Context Effect ---
  useEffect(() => {
    // 当页面关键状态变化时，更新 Context 中的 internalState
    // 确保 mode 存在才更新，避免初始导航时覆盖
    if (mode) {
        const currentStateSnapshot: SetupPageStateSnapshot = {
          selectedScriptId,
          selectedCharacterIds,
          userCharacterId,
          aiConfigs: Object.fromEntries(aiConfigs.entries()), // Map 转对象
          mode: mode // 把 mode 也存进去，以便恢复时检查
        };
        // 使用 location.pathname 获取当前路径
        // 注意：这里不传递 navigation state (第三个参数)，只传递 internalState (第四个参数)
        updateLastVisitedNavInfo('singleUserSingleAISetup', location.pathname, undefined, currentStateSnapshot); // <-- 使用更明确的 key
        // console.log('[ChatSetupPage] Updated context with current state snapshot.'); // 减少日志
    }

  }, [selectedScriptId, selectedCharacterIds, userCharacterId, aiConfigs, updateLastVisitedNavInfo, location.pathname, mode]);


  // --- 状态计算与处理 (基本不变) ---
  const selectedScript = useMemo(() => {
    return scripts.find(script => script.id === selectedScriptId);
  }, [scripts, selectedScriptId]);

  const scriptCharacters = useMemo(() => {
    // console.log('[Debug] Calculating scriptCharacters...');
    // console.log('[Debug] selectedScript:', selectedScript);
    if (!selectedScript || !selectedScript.characterIds || selectedScript.characterIds.length === 0) {
      //  console.log('[Debug] No selected script or characterIds are empty.');
       return [];
    }
    const characterIdSet = new Set(selectedScript.characterIds);
    // console.log('[Debug] Script Character IDs Set:', characterIdSet);
    // console.log('[Debug] All Characters Loaded:', characters);
    const filteredCharacters = characters.filter(char => {
       const hasId = characterIdSet.has(char.id);
       return hasId;
    });
    // console.log('[Debug] Filtered Script Characters:', filteredCharacters);
    return filteredCharacters;
  }, [characters, selectedScript]);

  // --- 事件处理函数 (基本不变) ---
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

  // 处理开始聊天按钮点击 (需要传递 chatConfig 给下一页)
  const handleStartChat = () => {
    // --- 数据校验 (不变) ---
    if (!selectedScriptId) {
      message.error('请先选择剧本！'); return;
    }
    if (selectedCharacterIds.length !== 2) {
       message.error('单人单 AI 模式需要正好选择两个出场角色！'); return;
    }
    if (!userCharacterId) {
       message.error('请选择您要扮演的角色！'); return;
    }
    const aiCharacterId = selectedCharacterIds.find(id => id !== userCharacterId);
    if (!aiCharacterId) {
       message.error('无法确定 AI 扮演的角色！'); return;
    }
    const aiConfig = aiConfigs.get(aiCharacterId as string);
    const aiCharacterName = characters.find(c=>c.id===aiCharacterId)?.name || 'AI';
    if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
       message.error(`请为 AI 角色 "${aiCharacterName}" 配置 AI 服务商和模型！`); return;
    }

    // --- 准备传递给聊天页面的数据 (作为 state) ---
    // 确保传递的 participatingCharacters 是最新的
    const participatingChars = characters.filter(c => selectedCharacterIds.includes(c.id));
    if (participatingChars.length !== 2) {
        message.error('无法找到完整的出场角色信息！');
        return;
    }
    // 确保 selectedScript 存在
    if (!selectedScript) {
        message.error('无法找到选中的剧本信息！');
        return;
    }
    const chatConfig = {
      mode,
      script: selectedScript,
      participatingCharacters: participatingChars,
      userCharacterId,
      aiConfigs: Object.fromEntries(aiConfigs.entries()),
    };

    console.log('[ChatSetupPage] Starting chat with config:', chatConfig);
    // 导航到聊天界面，并将配置作为 state 传递
    navigate('/single-user-single-ai-interface', { state: chatConfig });
  };


  // --- UI 渲染 (基本不变) ---
  return (
    <div>
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
        {/* Card 1: 选择剧本 */}
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
            // disabled={loading} // 数据加载时禁用 - 移除，允许在加载时选择
          />
          {selectedScript && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary">
                {selectedScript.synopsis || selectedScript.scene || '暂无简介'}
              </Typography.Text>
            </div>
          )}
        </Card>

        {/* Card 2: 选择出场角色 */}
        {selectedScript && (
          <Card title="2. 选择出场角色" style={{ marginBottom: 16 }}>
            {scriptCharacters.length > 0 ? (
              <Checkbox.Group
                options={scriptCharacters.map(char => ({ label: char.name, value: char.id }))}
                value={selectedCharacterIds}
                onChange={handleCharacterSelectionChange}
                // disabled={loading} // 移除禁用
              />
            ) : (
              <Typography.Text type="secondary">该剧本尚未关联任何角色。</Typography.Text>
            )}
          </Card>
        )}

        {/* Card 3: 配置角色与 AI */}
        {selectedScript && selectedCharacterIds.length > 0 && (
          <Card title="3. 配置角色与 AI" style={{ marginBottom: 16 }}>
            {/* 用户扮演角色选择 */}
            <>
              <Typography.Paragraph strong>请选择您要扮演的角色：</Typography.Paragraph>
              <Radio.Group onChange={handleUserCharacterChange} value={userCharacterId} /*disabled={loading}*/>
                  {selectedCharacterIds.map(charId => {
                    const character = characters.find(c => c.id === charId);
                    return character ? (
                      <Radio key={charId} value={charId}>{character.name}</Radio>
                    ) : null;
                  })}
                </Radio.Group>
              <Divider />
            </>

            {/* AI 角色配置 */}
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
                              // disabled={loading}
                            />
                            <Select
                              placeholder="选择模型"
                              style={{ width: '100%' }}
                              value={currentAIConfig.model || undefined}
                              onChange={(value) => handleAIConfigChange(character.id, 'model', value)}
                              options={modelsForProvider.map(m => ({ value: m, label: m }))}
                              disabled={!currentAIConfig.providerId} // <-- 修复语法错误
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

        {/* 开始聊天按钮 */}
        <Button
          type="primary"
          onClick={handleStartChat}
          disabled={!selectedScriptId || selectedCharacterIds.length !== 2 || !userCharacterId || loading} // 增加 userCharacterId 校验, 保留 loading 禁用
          style={{ marginTop: 16 }}
        >
          开始聊天
        </Button>

      </Spin>
    </div>
  );
};

export default SingleUserSingleAISetupPage;