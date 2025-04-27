import React, { useState, useEffect, useMemo, Key } from 'react'; // <-- 导入 Key 类型
import { useLocation, useNavigate } from 'react-router-dom';
import { Select, Checkbox, Radio, Button, message, Spin, Typography, Card, Row, Col, Divider, RadioChangeEvent } from 'antd'; // 导入 RadioChangeEvent
// 移除 CheckboxValueType 导入
import type { Script, AICharacter } from '../types'; // 导入类型
import type { ChatMode } from './ChatModeSelectionPage'; // 导入聊天模式类型

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

const ChatSetupPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.state?.mode as ChatMode | undefined; // 获取传递过来的模式

  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [llmServices, setLlmServices] = useState<LLMServiceInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<Map<string, string[]>>(new Map()); // 存储每个服务商的可用模型

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Key[]>([]); // <-- 使用 Key[] 代替 CheckboxValueType[]
  const [userCharacterId, setUserCharacterId] = useState<string | null>(null); // 用户扮演的角色 ID
  // 存储每个 AI 角色的配置 { characterId: { providerId, model } }
  const [aiConfigs, setAiConfigs] = useState<Map<string, CharacterAIConfig>>(new Map());

  // --- 数据加载 ---
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 并行加载所有数据
        const [scriptsResult, charactersResult, servicesResult] = await Promise.all([
          window.electronAPI.readStore('scripts.json', []),
          window.electronAPI.readStore('roles.json', []), // <-- 把 'characters.json' 改成 'roles.json'
          window.electronAPI.llmGetServices(),
        ]);

        // 处理剧本数据
        if (scriptsResult.success && Array.isArray(scriptsResult.data)) {
          setScripts(scriptsResult.data as Script[]);
        } else {
          message.error(`加载剧本列表失败: ${scriptsResult.error || '数据格式错误'}`);
        }

        // 处理角色数据
        if (charactersResult.success && Array.isArray(charactersResult.data)) {
          setCharacters(charactersResult.data as AICharacter[]);
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
                message.error(`加载 ${service.providerName} 模型失败: ${modelsResult.error}`);
                return { providerId: service.providerId, models: service.defaultModels }; // 出错用默认
              }
            } catch (modelError: unknown) { // <-- 使用 unknown
              const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
              message.error(`调用获取 ${service.providerName} 模型时出错: ${errorMsg}`);
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
        setLoading(false);
      }
    };

    // 如果没有接收到 mode，导航回模式选择页
    if (!mode) {
      message.warning('请先选择聊天模式');
      navigate('/chat-mode-selection', { replace: true });
      return;
    }

    loadData();
  }, [mode, navigate]); // 依赖 mode 和 navigate

  // --- 状态计算与处理 ---

  // 当前选中的剧本对象
  const selectedScript = useMemo(() => {
    return scripts.find(script => script.id === selectedScriptId);
  }, [scripts, selectedScriptId]);

  // 当前剧本关联的角色列表
  const scriptCharacters = useMemo(() => {
    console.log('[Debug] Calculating scriptCharacters...'); // <-- 日志 1: 开始计算
    console.log('[Debug] selectedScript:', selectedScript); // <-- 日志 2: 打印选中的剧本
    if (!selectedScript || !selectedScript.characterIds || selectedScript.characterIds.length === 0) {
       console.log('[Debug] No selected script or characterIds are empty.'); // <-- 日志 3: 检查剧本或 ID 是否为空
       return [];
    }
    const characterIdSet = new Set(selectedScript.characterIds);
    console.log('[Debug] Script Character IDs Set:', characterIdSet); // <-- 日志 4: 打印从剧本提取的 ID Set
    console.log('[Debug] All Characters Loaded:', characters); // <-- 日志 5: 打印所有已加载的角色
    const filteredCharacters = characters.filter(char => {
       const hasId = characterIdSet.has(char.id);
       // console.log(`[Debug] Checking character ${char.name} (ID: ${char.id}): In Set? ${hasId}`); // <-- 可选：更详细的日志
       return hasId;
    });
    console.log('[Debug] Filtered Script Characters:', filteredCharacters); // <-- 日志 6: 打印最终过滤结果
    return filteredCharacters;
  }, [characters, selectedScript]);

  // 处理剧本选择变化
  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    // 重置后续选择
    setSelectedCharacterIds([]);
    setUserCharacterId(null);
    setAiConfigs(new Map());
  };

  // 处理出场角色选择变化
  const handleCharacterSelectionChange = (checkedValues: Key[]) => { // <-- 使用 Key[] 代替 CheckboxValueType[]
    setSelectedCharacterIds(checkedValues);
    // 如果用户之前扮演的角色被取消勾选，重置用户扮演角色
    if (userCharacterId && !checkedValues.includes(userCharacterId)) {
      setUserCharacterId(null);
    }
    // 清理不再出场角色的 AI 配置
    const newAiConfigs = new Map(aiConfigs);
    aiConfigs.forEach((_, charId) => {
      if (!checkedValues.includes(charId)) {
        newAiConfigs.delete(charId);
      }
    });
    setAiConfigs(newAiConfigs);
  };

  // 处理用户扮演角色选择变化
  const handleUserCharacterChange = (e: RadioChangeEvent) => { // <-- 修改事件类型为 RadioChangeEvent
    const selectedUserId = e.target.value; // RadioChangeEvent 的 value 就是选中的值
    setUserCharacterId(selectedUserId);
    // 如果用户选择了扮演某个角色，则移除该角色的 AI 配置（如果存在）
    if (selectedUserId) {
      const newAiConfigs = new Map(aiConfigs);
      if (newAiConfigs.has(selectedUserId)) {
        newAiConfigs.delete(selectedUserId);
        setAiConfigs(newAiConfigs);
      }
    }
  };

  // 处理 AI 配置变化 (服务商或模型)
  const handleAIConfigChange = (characterId: string, field: 'providerId' | 'model', value: string) => {
    setAiConfigs(prev => {
      const newConfigs = new Map(prev);
      const currentConfig = newConfigs.get(characterId) || { providerId: '', model: '' };
      const updatedConfig = { ...currentConfig, [field]: value };

      // 如果改变了服务商，重置模型选择
      if (field === 'providerId') {
        updatedConfig.model = ''; // 或者设为该服务商的第一个可用模型？
      }
      newConfigs.set(characterId, updatedConfig);
      return newConfigs;
    });
  };

  // 处理开始聊天按钮点击
  const handleStartChat = () => {
    // --- 数据校验 ---
    if (!selectedScriptId) {
      message.error('请先选择剧本！');
      return;
    }
    if (selectedCharacterIds.length === 0) {
      message.error('请至少选择一个出场角色！');
      return;
    }

    // 校验 AI 配置 (根据模式不同，校验逻辑也不同，这里先按单人单 AI 简化)
    if (mode === 'singleUserSingleAI') {
      if (selectedCharacterIds.length !== 2) {
         message.error('单人单 AI 模式需要正好选择两个出场角色！');
         return;
      }
      if (!userCharacterId) {
         message.error('请选择您要扮演的角色！');
         return;
      }
      const aiCharacterId = selectedCharacterIds.find(id => id !== userCharacterId);
      if (!aiCharacterId) {
         // 理论上不会发生，因为上面校验了长度为 2
         message.error('无法确定 AI 扮演的角色！');
         return;
      }
      const aiConfig = aiConfigs.get(aiCharacterId as string);
      if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
         message.error(`请为角色 "${characters.find(c=>c.id===aiCharacterId)?.name || 'AI'}" 配置 AI 服务商和模型！`);
         return;
      }
    }
    // TODO: 添加 'singleUserMultiAI' 和 'director' 模式的校验逻辑

    // --- 准备传递给聊天页面的数据 ---
    const chatConfig = {
      mode,
      script: selectedScript,
      // 只传递出场角色的完整信息
      participatingCharacters: characters.filter(c => selectedCharacterIds.includes(c.id)),
      userCharacterId,
      aiConfigs: Object.fromEntries(aiConfigs.entries()), // 将 Map 转为普通对象传递
    };

    console.log('[ChatSetupPage] Starting chat with config:', chatConfig);
    // 导航到聊天界面，并传递配置
    navigate('/chat-interface', { state: { chatConfig } });
  };


  // --- UI 渲染 ---

  // 渲染模式标题
  const renderModeTitle = () => {
    switch (mode) {
      case 'singleUserSingleAI': return '单人单 AI 模式设置';
      case 'singleUserMultiAI': return '单人多 AI 模式设置';
      case 'director': return '导演模式设置';
      default: return '聊天设置';
    }
  };

  return (
    <div>
      <Typography.Title level={2}>{renderModeTitle()}</Typography.Title>
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
            {/* 用户扮演角色选择 */}
            {mode !== 'director' && ( // 导演模式不需要用户扮演
              <>
                <Typography.Paragraph strong>请选择您要扮演的角色：</Typography.Paragraph>
                <Radio.Group onChange={handleUserCharacterChange} value={userCharacterId}>
                  {selectedCharacterIds.map(charId => {
                    const character = characters.find(c => c.id === charId);
                    return character ? (
                      <Radio key={charId} value={charId}>{character.name}</Radio>
                    ) : null;
                  })}
                  <Radio value={null}>我不扮演角色（导演视角）</Radio> {/* 允许用户不扮演 */}
                </Radio.Group>
                <Divider />
              </>
            )}

            {/* AI 角色配置 */}
            <Typography.Paragraph strong>为 AI 角色配置模型：</Typography.Paragraph>
            <Row gutter={[16, 16]}>
              {selectedCharacterIds
                .filter(charId => mode === 'director' || charId !== userCharacterId) // 过滤掉用户扮演的角色 (导演模式下不过滤)
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
                          disabled={!currentAIConfig.providerId} // 未选服务商时禁用
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
          disabled={!selectedScriptId || selectedCharacterIds.length === 0 || loading} // 添加禁用条件
          style={{ marginTop: 16 }}
        >
          开始聊天
        </Button>

      </Spin>
    </div>
  );
};

export default ChatSetupPage;