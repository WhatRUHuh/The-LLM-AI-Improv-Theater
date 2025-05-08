import React, { useState, useEffect, useCallback } from 'react';
// 导入 theme 用于获取背景色等 token
import { List, Card, Input, Button, message, Form, Spin, Typography, Space, Popconfirm, Tooltip, theme, Select } from 'antd'; // 移除未使用的 Tag, 导入 Select
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { setupLogger as logger } from '../utils/logger'; // 导入日志工具
import type { AIConfig } from '../types'; // 修正 AIConfig 类型导入路径

// 定义从后端获取的服务商信息结构
interface LLMServiceInfo {
  providerId: string;
  providerName: string;
  defaultModels: string[];
}

const AIConfigPage: React.FC = () => {
  const [services, setServices] = useState<LLMServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // API Key 相关状态 (单个Key或当前选中配置的Key)
  const [apiKeys, setApiKeys] = useState<Map<string, string>>(new Map());
  // Google 多 Key 配置相关状态
  const [configName, setConfigName] = useState<Map<string, string>>(new Map());
  const [selectedConfigId, setSelectedConfigId] = useState<Map<string, string | undefined>>(new Map());
  const [providerConfigs, setProviderConfigs] = useState<Map<string, AIConfig[]>>(new Map());
  const [loadingConfigs, setLoadingConfigs] = useState<Map<string, boolean>>(new Map()); // 加载特定服务商配置的加载状态

  const [savingKeyStatus, setSavingKeyStatus] = useState<Map<string, boolean>>(new Map());
  // 模型列表相关状态
  const [providerModels, setProviderModels] = useState<Map<string, string[]>>(new Map());
  const [newModelInput, setNewModelInput] = useState<Map<string, string>>(new Map());
  const [editingModel, setEditingModel] = useState<Map<string, { index: number; value: string } | null>>(new Map());
  const [modelsLoading, setModelsLoading] = useState<Map<string, boolean>>(new Map());
  // 获取 antd 主题 token
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  // 加载服务商列表和他们的可用模型
  const loadServicesAndModels = useCallback(async () => {
    setLoading(true);
    try {
      // 步骤 1: 获取支持的服务商列表
      const serviceProvidersResult = await window.electronAPI.getSupportedServiceProviders();
      if (!serviceProvidersResult.success || !serviceProvidersResult.data) {
        message.error(`加载支持的服务商列表失败: ${serviceProvidersResult.error || '未知错误'}`);
        setLoading(false);
        return;
      }
      const supportedProviders = serviceProvidersResult.data;
      // 修正1: 为 providerId 添加 string 类型
      const loadedServicesData: LLMServiceInfo[] = supportedProviders.map((providerId: string) => ({
        providerId: providerId,
        providerName: providerId.charAt(0).toUpperCase() + providerId.slice(1),
        defaultModels: [],
      }));
      setServices(loadedServicesData);
      logger.info('成功加载支持的服务商列表:', loadedServicesData.map(s => s.providerId).join(', '));

      // 步骤 2: 初始化所有相关的状态 Map
      const initialKeys = new Map<string, string>();
      // 修正2: 移除重复声明的 const，改为 let 或者直接在forEach中初始化
      // ESLint 修正: 将 let 改为 const，因为这些 Map 实例本身不会被重新赋值
      const providerModelsMap = new Map<string, string[]>();
      const newModelInputMap = new Map<string, string>();
      const editingModelMap = new Map<string, { index: number; value: string } | null>();
      const modelsLoadingMap = new Map<string, boolean>();
      const configNameMap = new Map<string, string>();
      const selectedConfigIdMap = new Map<string, string | undefined>();
      const providerConfigsMap = new Map<string, AIConfig[]>();
      const loadingConfigsMap = new Map<string, boolean>();

      // 为每个服务商初始化其状态
      // 修正4: 使用 loadedServicesData
      loadedServicesData.forEach(service => {
        initialKeys.set(service.providerId, '');
        providerModelsMap.set(service.providerId, service.defaultModels || []);
        newModelInputMap.set(service.providerId, '');
        editingModelMap.set(service.providerId, null);
        modelsLoadingMap.set(service.providerId, false);
        configNameMap.set(service.providerId, '');
        selectedConfigIdMap.set(service.providerId, undefined);
        providerConfigsMap.set(service.providerId, []);
        loadingConfigsMap.set(service.providerId, false);
      });

      // 步骤 3: 获取所有已保存的 AI 配置，并按服务商分类
      const allConfigsResult = await window.electronAPI.getAllAIConfigs();
      let allConfigs: AIConfig[] = [];
      if (allConfigsResult.success && allConfigsResult.data) {
        allConfigs = allConfigsResult.data;
        allConfigs.forEach(config => {
          const configsForProvider = providerConfigsMap.get(config.serviceProvider) || [];
          configsForProvider.push(config);
          providerConfigsMap.set(config.serviceProvider, configsForProvider);

          // --- 核心改动：调整预填逻辑 ---
          // 目的是确保Google服务商在初始加载时，默认进入“添加新配置”状态，
          // 即相关的输入框为空，且没有预选任何已有配置。

          // 1. 对于非Google服务商 (例如 OpenAI, Anthropic):
          //    如果该服务商只有一个已保存的配置，并且当前API Key输入框为空，
          //    则预填该API Key，以提供便利。
          if (config.serviceProvider !== 'google' &&
              configsForProvider.length === 1 &&
              (initialKeys.get(config.serviceProvider) === '' || initialKeys.get(config.serviceProvider) === undefined)
          ) {
            initialKeys.set(config.serviceProvider, config.apiKey);
            logger.info(`服务商 ${config.serviceProvider} 存在一个已保存配置，已预填API Key。`);
          }

          // 2. 对于Google服务商:
          //    我们不再根据已保存的配置来自动填充主输入框 (API Key, 配置名称) 或自动选择某个配置。
          //    - `selectedConfigIdMap.get('google')` 将保持 `undefined` (除非用户从下拉框中明确选择)。
          //    - `configNameMap.get('google')` 和 `initialKeys.get('google')` (对应主输入框)
          //      将保持它们在 `loadedServicesData.forEach` 中设置的初始值 (通常是空字符串)。
          //    这样做可以确保用户打开Google配置卡片时，默认看到的是用于添加新配置的空白表单。
          //    如果用户希望编辑现有配置，他们可以从“选择已有配置”的下拉列表中进行选择。
          //    因此，此处不再需要针对 'google' 服务商进行 `configNameMap.set` 或 `selectedConfigIdMap.set` 的预填逻辑。
          //    `initialKeys` 的预填也已在上面的 `if (config.serviceProvider !== 'google')` 条件中处理。
          //    之前的逻辑 (如下注释掉的部分) 会导致Google在有配置时默认选中第一个，可能隐藏“添加”入口。
          //    // if (configsForProvider.length === 1 && !initialKeys.get(config.serviceProvider)) {
          //    //   initialKeys.set(config.serviceProvider, config.apiKey);
          //    //   if (config.serviceProvider === 'google') {
          //    //     configNameMap.set(config.serviceProvider, config.name);
          //    //     selectedConfigIdMap.set(config.serviceProvider, config.id);
          //    //   }
          //    // }
        });
        logger.info(`成功加载并分类了 ${allConfigs.length} 个已保存的AI配置。`);
      } else {
        // 修正3: 使用 message.warning
        message.warning(`加载所有AI配置列表失败或为空: ${allConfigsResult.error || '列表为空'}`);
      }
      
      setProviderConfigs(providerConfigsMap);
      setApiKeys(initialKeys);
      setConfigName(configNameMap);
      setSelectedConfigId(selectedConfigIdMap);
      setProviderModels(providerModelsMap);
      setNewModelInput(newModelInputMap);
      setEditingModel(editingModelMap);
      setModelsLoading(modelsLoadingMap);
      setLoadingConfigs(loadingConfigsMap);

      // 步骤 4: 为每个服务商加载模型列表
      const modelPromises = loadedServicesData.map(async (service) => {
        modelsLoadingMap.set(service.providerId, true);
        setModelsLoading(new Map(modelsLoadingMap)); // 更新UI

        const configsForThisProvider = providerConfigsMap.get(service.providerId) || [];
        let models: string[] = service.defaultModels || [];

        if (configsForThisProvider.length > 0) {
          const representativeConfigId = configsForThisProvider[0].id;
          try {
            const modelsResult = await window.electronAPI.getAvailableModelsByConfigId(representativeConfigId);
            if (modelsResult.success && modelsResult.data) {
              models = modelsResult.data;
              logger.info(`成功加载服务商 ${service.providerId} (配置ID: ${representativeConfigId}) 的模型列表: ${models.length}个`);
            } else {
              message.error(`加载 ${service.providerName} (配置ID: ${representativeConfigId}) 模型列表失败: ${modelsResult.error || '未知错误'}`);
            }
          } catch (modelError: unknown) {
            const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
            message.error(`调用获取 ${service.providerName} (配置ID: ${representativeConfigId}) 模型列表时出错: ${errorMsg}`);
          }
        } else {
          if (models.length === 0) {
             logger.info(`服务商 ${service.providerName} 尚无配置，且无默认模型列表。请先添加配置以加载模型。`);
          } else {
             logger.info(`服务商 ${service.providerName} 尚无配置，使用其默认模型列表: ${models.length}个`);
          }
        }
        providerModelsMap.set(service.providerId, models);
        modelsLoadingMap.set(service.providerId, false);
      });

      await Promise.all(modelPromises);
      setProviderModels(new Map(providerModelsMap));
      setModelsLoading(new Map(modelsLoadingMap));

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`加载AI配置页面时发生严重错误: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, []); // 保持 useCallback 的依赖为空，因为它内部不依赖外部组件状态

  // useEffect: 页面加载时执行一次
  useEffect(() => {
    loadServicesAndModels();
  }, [loadServicesAndModels]); // 依赖 loadServicesAndModels，确保其更新时能重新加载

  // 获取特定服务商的AI配置列表 (此函数主要用于Google配置的刷新，可以保留)
  // 注意：此函数现在主要用于在添加/更新/删除Google配置后刷新列表
  const fetchProviderConfigs = useCallback(async (providerId: string) => {
    if (providerId !== 'google') return; // 目前仅为 Google 获取
    setLoadingConfigs(prev => new Map(prev).set(providerId, true));
    try {
      const result = await window.electronAPI.getAIConfigsByProvider(providerId);
      if (result.success && result.data) {
        setProviderConfigs(prev => new Map(prev).set(providerId, result.data || []));
        logger.info(`已加载 ${providerId} 的 ${result.data?.length || 0} 个AI配置`);
      } else {
        message.error(`加载 ${providerId} AI配置失败: ${result.error || '未知错误'}`);
        setProviderConfigs(prev => new Map(prev).set(providerId, [])); // 出错则清空
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用获取 ${providerId} AI配置时出错: ${errorMsg}`);
      setProviderConfigs(prev => new Map(prev).set(providerId, [])); // 出错则清空
    } finally {
      setLoadingConfigs(prev => new Map(prev).set(providerId, false));
    }
  }, []);

  // 当服务列表加载后，为Google加载其配置
  useEffect(() => {
    if (services.some(s => s.providerId === 'google')) {
      fetchProviderConfigs('google');
    }
  }, [services, fetchProviderConfigs]);


  // 处理 API Key 输入变化
  const handleApiKeyChange = (providerId: string, value: string) => {
    setApiKeys(prev => new Map(prev).set(providerId, value));
  };

  // 处理配置名称输入变化 (仅Google)
  const handleConfigNameChange = (providerId: string, value: string) => {
    setConfigName(prev => new Map(prev).set(providerId, value));
  };

  // 处理从下拉列表选择已有配置 (仅Google)
  const handleProviderConfigSelect = (providerId: string, configId: string | undefined) => {
    setSelectedConfigId(prev => new Map(prev).set(providerId, configId));
    if (configId) {
      const selectedList = providerConfigs.get(providerId) || [];
      const config = selectedList.find(c => c.id === configId);
      if (config) {
        setConfigName(prev => new Map(prev).set(providerId, config.name));
        setApiKeys(prev => new Map(prev).set(providerId, config.apiKey));
      }
    } else {
      // 如果取消选择，清空名称和Key输入框
      setConfigName(prev => new Map(prev).set(providerId, ''));
      setApiKeys(prev => new Map(prev).set(providerId, ''));
    }
  };


  // 处理保存 API Key / AI 配置
  const handleSaveApiKey = async (providerId: string) => {
    setSavingKeyStatus(prev => new Map(prev).set(providerId, true));
    const currentApiKey = apiKeys.get(providerId) || '';
    const currentConfigName = configName.get(providerId) || '';
    const currentSelectedConfigId = selectedConfigId.get(providerId);

    try {
      let result;
      const providerDisplayName = services.find(s => s.providerId === providerId)?.providerName || providerId;

      if (providerId === 'google') {
        if (!currentConfigName.trim()) {
          message.error('配置名称不能为空！');
          setSavingKeyStatus(prev => new Map(prev).set(providerId, false));
          return;
        }
        if (!currentApiKey.trim()) {
          message.error('API Key 不能为空！');
          setSavingKeyStatus(prev => new Map(prev).set(providerId, false));
          return;
        }

        if (currentSelectedConfigId) {
          // 更新现有配置
          result = await window.electronAPI.updateAIConfig(currentSelectedConfigId, {
            name: currentConfigName,
            apiKey: currentApiKey,
            serviceProvider: providerId, // serviceProvider 一般不在此处更新，但可以包含以保持数据完整性
          });
          if (result.success) {
            message.success(`配置 "${currentConfigName}" 已更新！`);
          }
        } else {
          // 添加新配置
          result = await window.electronAPI.addAIConfig({
            serviceProvider: providerId,
            name: currentConfigName,
            apiKey: currentApiKey,
          });
          if (result.success && result.data) {
            message.success(`配置 "${currentConfigName}" 已添加！`);
            // 新增成功后，可以考虑自动选中这个新配置
            // setSelectedConfigId(prev => new Map(prev).set(providerId, result.data?.id));
          }
        }
        if (result.success) {
          await fetchProviderConfigs(providerId); // 刷新列表
          // 清空或重置表单，取决于是否希望用户继续编辑刚保存的项
          // handleProviderConfigSelect(providerId, undefined); // 清空选择和表单
        } else {
          message.error(`保存 Google 配置失败: ${result.error || '未知错误'}`);
        }
      } else {
        // 对于非 Google 服务商，使用旧的单 Key 保存逻辑
        result = await window.electronAPI.llmSetApiKey(providerId, currentApiKey || null);
        if (result.success) {
          message.success(`${providerDisplayName} API Key 已保存！`);
          if (!currentApiKey) {
             setApiKeys(prev => {
               const newMap = new Map(prev);
               newMap.delete(providerId);
               return newMap;
             });
          }
        } else {
          message.error(`保存 ${providerDisplayName} API Key 失败: ${result.error || '未知错误'}`);
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用保存操作时出错: ${errorMsg}`);
    } finally {
       setSavingKeyStatus(prev => new Map(prev).set(providerId, false));
    }
  };

  // 处理删除 AI 配置 (仅Google)
  const handleDeleteConfig = async (providerId: string) => {
    const configIdToDelete = selectedConfigId.get(providerId);
    if (!configIdToDelete) {
      message.warning('请先选择一个要删除的配置。');
      return;
    }
    const configToDelete = (providerConfigs.get(providerId) || []).find(c => c.id === configIdToDelete);
    if (!configToDelete) {
        message.error('未能找到选中的配置信息。');
        return;
    }

    setSavingKeyStatus(prev => new Map(prev).set(providerId, true)); // 复用saving状态
    try {
      const result = await window.electronAPI.deleteAIConfig(configIdToDelete);
      if (result.success) {
        message.success(`配置 "${configToDelete.name}" 已删除！`);
        await fetchProviderConfigs(providerId); // 刷新列表
        handleProviderConfigSelect(providerId, undefined); // 清空选择和表单
      } else {
        message.error(`删除配置失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用删除配置时出错: ${errorMsg}`);
    } finally {
      setSavingKeyStatus(prev => new Map(prev).set(providerId, false));
    }
  };


   // --- 模型管理相关函数 ---

   // 将当前模型列表保存到后端 (计算自定义模型列表)
   const saveModelsToBackend = useCallback(async (providerId: string, currentModels: string[]) => {
      setModelsLoading(prev => new Map(prev).set(providerId, true));
      try {
         const serviceInfo = services.find(s => s.providerId === providerId);
         if (!serviceInfo) {
           message.error('未找到服务商信息，无法保存模型');
           return false;
         }
         const defaultModelsSet = new Set(serviceInfo.defaultModels);
         const customModelsToSave = currentModels.filter(model => !defaultModelsSet.has(model));

         // 确保 llmSaveCustomModels 在 electronAPI 上可用 (稍后处理 d.ts)
         const result = await window.electronAPI.llmSaveCustomModels(providerId, customModelsToSave);
         if (result.success) {
           return true;
         } else {
           message.error(`保存 ${serviceInfo.providerName} 模型列表失败: ${result.error || '未知错误'}`);
           return false;
         }
      } catch (error: unknown) { // 使用 unknown
         const errorMsg = error instanceof Error ? error.message : String(error);
         message.error(`调用保存模型列表时出错: ${errorMsg}`);
         return false;
      } finally {
          setModelsLoading(prev => new Map(prev).set(providerId, false));
      }
   }, [services]); // 依赖 services

   // 处理添加模型输入变化
   const handleNewModelInputChange = (providerId: string, value: string) => {
      setNewModelInput(prev => new Map(prev).set(providerId, value));
   };

   // 处理添加模型
   const handleAddModel = async (providerId: string) => {
      const newModel = newModelInput.get(providerId)?.trim();
      if (!newModel) {
         message.warning('请输入要添加的模型 ID');
         return;
      }
      const currentModels = providerModels.get(providerId) || [];
      if (currentModels.includes(newModel)) {
         message.warning(`模型 ${newModel} 已存在`);
         return;
      }

      const updatedModels = [...currentModels, newModel];
      const success = await saveModelsToBackend(providerId, updatedModels);
      if (success) {
         setProviderModels(prev => new Map(prev).set(providerId, updatedModels));
         setNewModelInput(prev => new Map(prev).set(providerId, ''));
         message.success(`模型 ${newModel} 已添加`);
      }
   };

   // 处理删除模型
   const handleDeleteModel = async (providerId: string, indexToDelete: number) => {
      const currentModels = providerModels.get(providerId) || [];
      const modelToDelete = currentModels[indexToDelete];
      const updatedModels = currentModels.filter((_, index) => index !== indexToDelete);

      const success = await saveModelsToBackend(providerId, updatedModels);
      if (success) {
         setProviderModels(prev => new Map(prev).set(providerId, updatedModels));
         message.success(`模型 ${modelToDelete} 已删除`);
         if (editingModel.get(providerId)?.index === indexToDelete) {
            setEditingModel(prev => new Map(prev).set(providerId, null));
         }
      }
   };

   // 处理开始编辑模型
   const handleEditModel = (providerId: string, index: number) => {
      const currentModels = providerModels.get(providerId) || [];
      setEditingModel(prev => new Map(prev).set(providerId, { index, value: currentModels[index] }));
   };

   // 处理编辑输入变化
   const handleEditingModelChange = (providerId: string, value: string) => {
      setEditingModel(prev => {
         const currentEdit = prev.get(providerId);
         if (currentEdit) {
            return new Map(prev).set(providerId, { ...currentEdit, value });
         }
         return prev;
      });
   };

   // 处理保存编辑
   const handleSaveEdit = async (providerId: string) => {
      const editState = editingModel.get(providerId);
      if (!editState) return;

      const { index, value } = editState;
      const editedModel = value.trim();
      if (!editedModel) {
         message.warning('模型 ID 不能为空');
         return;
      }

      const currentModels = providerModels.get(providerId) || [];
      if (currentModels.some((model, i) => i !== index && model === editedModel)) {
         message.warning(`模型 ${editedModel} 已存在`);
         return;
      }

      const updatedModels = [...currentModels];
      updatedModels[index] = editedModel;

      const success = await saveModelsToBackend(providerId, updatedModels);
      if (success) {
         setProviderModels(prev => new Map(prev).set(providerId, updatedModels));
         setEditingModel(prev => new Map(prev).set(providerId, null));
         message.success(`模型已更新为 ${editedModel}`);
      }
   };

   // 处理取消编辑
   const handleCancelEdit = (providerId: string) => {
      setEditingModel(prev => new Map(prev).set(providerId, null));
   };

   // 处理重置模型列表为默认
   const handleResetModels = async (providerId: string) => {
      const serviceInfo = services.find(s => s.providerId === providerId);
      if (!serviceInfo) {
         message.error('未找到服务商信息，无法重置模型');
         return;
      }
      const defaultModels = serviceInfo.defaultModels;
      const success = await saveModelsToBackend(providerId, defaultModels); // 传递默认模型去计算空自定义列表
      if (success) {
         setProviderModels(prev => new Map(prev).set(providerId, defaultModels));
         message.success(`${serviceInfo.providerName} 模型列表已重置为默认`);
         setEditingModel(prev => new Map(prev).set(providerId, null));
      }
   };

  // 渲染模型列表项
  const renderModelItem = (providerId: string, model: string, index: number) => {
    const isEditing = editingModel.get(providerId)?.index === index;
    const currentEditValue = editingModel.get(providerId)?.value ?? '';

    return (
      <List.Item key={`${providerId}-${index}`}>
        {isEditing ? (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={currentEditValue}
              onChange={(e) => handleEditingModelChange(providerId, e.target.value)}
              onPressEnter={() => handleSaveEdit(providerId)}
            />
            <Tooltip title="保存">
              <Button icon={<SaveOutlined />} onClick={() => handleSaveEdit(providerId)} />
            </Tooltip>
            <Tooltip title="取消">
              <Button icon={<CloseOutlined />} onClick={() => handleCancelEdit(providerId)} />
            </Tooltip>
          </Space.Compact>
        ) : (
          <Space style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Typography.Text style={{ flexGrow: 1 }}>{model}</Typography.Text>
            <Space>
              <Tooltip title="编辑">
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEditModel(providerId, index)} />
              </Tooltip>
              <Popconfirm
                title={`确定删除模型 "${model}" 吗？`}
                onConfirm={() => handleDeleteModel(providerId, index)}
                okText="确定"
                cancelText="取消"
              >
                <Tooltip title="删除">
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          </Space>
        )}
      </List.Item>
    );
  };


  return (
    <div style={{ maxHeight: 'calc(100vh - 5px)', overflow: 'auto', paddingLeft: '5px' }}>
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, padding: 10 }}>
        <Typography.Title level={2}>AI 服务商配置</Typography.Title>
        <Typography.Paragraph>
          管理连接到不同 AI 大语言模型服务商的配置。请在此处输入您的 API Key。API Key 将仅存储在您的本地设备上。
        </Typography.Paragraph>
        {loading ? (
          <Spin />
        ) : (
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={services}
            renderItem={(service) => (
              <List.Item>
                <Card title={service.providerName} variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)' }}>
                  <Form layout="vertical">
                    {service.providerId === 'google' && (
                      <>
                        <Form.Item label="选择已有配置">
                          <Select
                            style={{ width: '100%' }}
                            placeholder="选择一个已保存的配置或直接输入新配置"
                            value={selectedConfigId.get(service.providerId)}
                            onChange={(value) => handleProviderConfigSelect(service.providerId, value)}
                            loading={loadingConfigs.get(service.providerId) || false}
                            allowClear
                          >
                            {(providerConfigs.get(service.providerId) || []).map(config => (
                              <Select.Option key={config.id} value={config.id}>
                                {`${config.name} (Key: ...${config.apiKey.slice(-2)})`}
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          label="配置名称"
                          required
                          tooltip="为这组API Key指定一个名称，方便管理。"
                        >
                          <Input
                            placeholder="例如：我的主力Key, 测试专用Key"
                            value={configName.get(service.providerId) || ''}
                            onChange={(e) => handleConfigNameChange(service.providerId, e.target.value)}
                          />
                        </Form.Item>
                      </>
                    )}
                    <Form.Item label="API Key" required>
                      <Input.Password
                        placeholder={`请输入 ${service.providerName} API Key`}
                        value={apiKeys.get(service.providerId) || ''}
                        onChange={(e) => handleApiKeyChange(service.providerId, e.target.value)}
                      />
                    </Form.Item>
                    <Form.Item label="可用模型">
                      <Spin spinning={modelsLoading.get(service.providerId) || false}>
                        <List
                          size="small"
                          bordered
                          dataSource={providerModels.get(service.providerId) || []}
                          renderItem={(model, index) => renderModelItem(service.providerId, model, index)}
                          locale={{ emptyText: '暂无模型' }}
                          style={{ marginBottom: 16 }}
                        />
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder="输入新模型 ID 添加"
                            value={newModelInput.get(service.providerId) || ''}
                            onChange={(e) => handleNewModelInputChange(service.providerId, e.target.value)}
                            onPressEnter={() => handleAddModel(service.providerId)}
                          />
                          <Tooltip title="添加模型">
                            <Button icon={<PlusOutlined />} onClick={() => handleAddModel(service.providerId)} />
                          </Tooltip>
                          <Popconfirm
                             title={`确定要将 ${service.providerName} 的模型列表重置为默认吗？\n（自定义添加的模型将被删除）`}
                             onConfirm={() => handleResetModels(service.providerId)}
                             okText="确定重置"
                             cancelText="取消"
                           >
                             <Tooltip title="重置为默认模型">
                               <Button icon={<ReloadOutlined />} />
                             </Tooltip>
                           </Popconfirm>
                        </Space.Compact>
                      </Spin>
                    </Form.Item>
                    <Form.Item>
                      <Space>
                        <Button
                          type="primary"
                          onClick={() => handleSaveApiKey(service.providerId)}
                          loading={savingKeyStatus.get(service.providerId) || false}
                          icon={<SaveOutlined />}
                        >
                          {service.providerId === 'google'
                            ? selectedConfigId.get(service.providerId) ? '更新此配置' : '添加新配置'
                            : '保存 Key'}
                        </Button>
                        {service.providerId === 'google' && selectedConfigId.get(service.providerId) && (
                          <Popconfirm
                            title={`确定删除配置 "${configName.get(service.providerId) || '此'}" 吗？`}
                            onConfirm={() => handleDeleteConfig(service.providerId)}
                            okText="确定删除"
                            cancelText="取消"
                            disabled={!selectedConfigId.get(service.providerId)}
                          >
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              loading={savingKeyStatus.get(service.providerId) || false}
                              disabled={!selectedConfigId.get(service.providerId)}
                            >
                              删除此配置
                            </Button>
                          </Popconfirm>
                        )}
                      </Space>
                    </Form.Item>
                  </Form>
                </Card>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
};

export default AIConfigPage;