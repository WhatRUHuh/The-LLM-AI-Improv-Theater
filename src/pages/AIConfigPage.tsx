import React, { useState, useEffect, useCallback } from 'react';
import { List, Card, Input, Button, message, Form, Spin, Typography, Space, Popconfirm, Tooltip } from 'antd'; // 移除未使用的 Tag
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';

// 定义从后端获取的服务商信息结构
interface LLMServiceInfo {
  providerId: string;
  providerName: string;
  defaultModels: string[];
}

const AIConfigPage: React.FC = () => {
  const [services, setServices] = useState<LLMServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // API Key 相关状态
  const [apiKeys, setApiKeys] = useState<Map<string, string>>(new Map());
  const [savingKeyStatus, setSavingKeyStatus] = useState<Map<string, boolean>>(new Map());
  // 模型列表相关状态
  const [providerModels, setProviderModels] = useState<Map<string, string[]>>(new Map());
  const [newModelInput, setNewModelInput] = useState<Map<string, string>>(new Map());
  const [editingModel, setEditingModel] = useState<Map<string, { index: number; value: string } | null>>(new Map());
  const [modelsLoading, setModelsLoading] = useState<Map<string, boolean>>(new Map());

  // 加载服务商列表和他们的可用模型
  const loadServicesAndModels = useCallback(async () => {
    setLoading(true);
    try {
      const serviceResult = await window.electronAPI.llmGetServices();
      if (serviceResult.success && serviceResult.data) {
        const loadedServices = serviceResult.data;
        setServices(loadedServices);

        // 初始化状态 Maps
        const initialKeys = new Map<string, string>();
        const initialProviderModels = new Map<string, string[]>();
        const initialNewModelInput = new Map<string, string>();
        const initialEditingModel = new Map<string, { index: number; value: string } | null>();
        const initialModelsLoading = new Map<string, boolean>();

        // 并行获取所有服务商的可用模型
        const modelPromises = loadedServices.map(async (service) => {
          initialKeys.set(service.providerId, ''); // 初始化 API Key Map
          initialNewModelInput.set(service.providerId, ''); // 初始化新模型输入 Map
          initialEditingModel.set(service.providerId, null); // 初始化编辑状态 Map
          initialModelsLoading.set(service.providerId, false); // 初始化加载状态

          try {
            // 确保 llmGetAvailableModels 在 electronAPI 上可用 (稍后处理 d.ts)
            const modelsResult = await window.electronAPI.llmGetAvailableModels(service.providerId);
            if (modelsResult.success && modelsResult.data) {
              initialProviderModels.set(service.providerId, modelsResult.data);
            } else {
              message.error(`加载 ${service.providerName} 模型列表失败: ${modelsResult.error || '未知错误'}`);
              initialProviderModels.set(service.providerId, service.defaultModels); // 加载失败则使用默认模型
            }
          } catch (modelError: unknown) { // 使用 unknown
             const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
             message.error(`调用获取 ${service.providerName} 模型列表时出错: ${errorMsg}`);
             initialProviderModels.set(service.providerId, service.defaultModels); // 出错也使用默认模型
          }
        });

        await Promise.all(modelPromises); // 等待所有模型加载完成

        // 批量更新状态
        setApiKeys(initialKeys);
        setProviderModels(initialProviderModels);
        setNewModelInput(initialNewModelInput);
        setEditingModel(initialEditingModel);
        setModelsLoading(initialModelsLoading);

      } else {
        message.error(`加载 AI 服务商列表失败: ${serviceResult.error || '未知错误'}`);
      }
    } catch (error: unknown) { // 使用 unknown
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用获取服务商列表时出错: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, []); // useCallback 依赖为空

  // 加载已保存的 API Keys
  const loadSavedKeys = useCallback(async () => {
    try {
      const result = await window.electronAPI.llmGetSavedKeys();
      if (result.success && result.data) {
        // 确保 result.data 存在再处理
        const loadedKeysMap = result.data
          ? new Map(Object.entries(result.data).filter(([, value]) => value !== null) as [string, string][])
          : new Map<string, string>();
        // 更新状态，合并加载的 Keys
        setApiKeys(prevKeys => new Map([...prevKeys, ...loadedKeysMap]));
        console.log('[AIConfigPage] Loaded saved API keys:', result.data);
      } else {
        message.error(`加载已保存的 API Keys 失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) { // 使用 unknown
       const errorMsg = error instanceof Error ? error.message : String(error);
       message.error(`调用获取已保存 API Keys 时出错: ${errorMsg}`);
    }
  }, []); // useCallback 依赖为空

  useEffect(() => {
    const initLoad = async () => {
      await loadServicesAndModels(); // 先加载服务和模型结构
      await loadSavedKeys(); // 再加载保存的 Keys 填充进去
    };
    initLoad();
  }, [loadServicesAndModels, loadSavedKeys]); // 添加依赖

  // 处理 API Key 输入变化
  const handleApiKeyChange = (providerId: string, value: string) => {
    setApiKeys(prev => new Map(prev).set(providerId, value));
  };

  // 处理保存 API Key
  const handleSaveApiKey = async (providerId: string) => {
    const apiKey = apiKeys.get(providerId) || null;
    setSavingKeyStatus(prev => new Map(prev).set(providerId, true));
    try {
      const result = await window.electronAPI.llmSetApiKey(providerId, apiKey);
      if (result.success) {
        message.success(`${services.find(s => s.providerId === providerId)?.providerName || providerId} API Key 已保存！`);
        // 如果保存的是空字符串或 null (表示删除)，也需要更新状态 (虽然 setApiKey 内部可能已处理)
        if (!apiKey) {
           setApiKeys(prev => {
             const newMap = new Map(prev);
             newMap.delete(providerId); // 或 newMap.set(providerId, ''); 取决于期望行为
             return newMap;
           });
        }
      } else {
        message.error(`保存 API Key 失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) { // 使用 unknown
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用设置 API Key 时出错: ${errorMsg}`);
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
    <div>
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
                  <Form.Item label="API Key">
                    <Input.Password
                      placeholder={`请输入 ${service.providerName} API Key`}
                      value={apiKeys.get(service.providerId) || ''}
                      onChange={(e) => handleApiKeyChange(service.providerId, e.target.value)}
                    />
                  </Form.Item>
                  {/* 模型列表部分 */}
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
                      {/* 添加模型输入 */}
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
                  {/* 保存 Key 按钮 */}
                  <Form.Item>
                    <Button
                      type="primary"
                      onClick={() => handleSaveApiKey(service.providerId)}
                      loading={savingKeyStatus.get(service.providerId) || false} // 使用 savingKeyStatus
                    >
                      保存 Key
                    </Button>
                    {/* TODO: 添加测试连接按钮 */}
                  </Form.Item>
                </Form>
              </Card>
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default AIConfigPage;