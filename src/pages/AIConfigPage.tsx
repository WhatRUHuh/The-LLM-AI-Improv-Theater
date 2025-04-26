import React, { useState, useEffect } from 'react';
import { List, Card, Input, Button, message, Form, Spin, Typography, Tag } from 'antd';

// 定义从后端获取的服务商信息结构
interface LLMServiceInfo {
  providerId: string;
  providerName: string;
  defaultModels: string[];
  // apiKey?: string; // 不直接从后端获取 Key，但可能需要本地状态管理
}

const AIConfigPage: React.FC = () => {
  const [services, setServices] = useState<LLMServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // 使用 Map 来存储每个服务商的 API Key 输入状态
  const [apiKeys, setApiKeys] = useState<Map<string, string>>(new Map());
  // 存储每个服务商的保存状态
  const [savingStatus, setSavingStatus] = useState<Map<string, boolean>>(new Map());

  // 加载服务商列表
  const loadServices = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.llmGetServices();
      if (result.success && result.data) {
        setServices(result.data);
        // 初始化 API Key 状态 (可以考虑从本地存储加载已保存的 Key)
        const initialKeys = new Map<string, string>();
        // 给 forEach 的参数 s 添加明确的类型 LLMServiceInfo
        result.data.forEach((s: LLMServiceInfo) => initialKeys.set(s.providerId, ''));
        setApiKeys(initialKeys);
      } else {
        message.error(`加载 AI 服务商列表失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`调用获取服务商列表时出错: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 加载已保存的 API Keys
  const loadSavedKeys = async () => {
    try {
      const result = await window.electronAPI.llmGetSavedKeys();
      if (result.success && result.data) {
        // 将加载到的 keys 更新到 apiKeys 状态中
        setApiKeys(new Map(Object.entries(result.data).filter(([, value]) => value !== null) as [string, string][]));
        console.log('[AIConfigPage] Loaded saved API keys:', result.data);
      } else {
        message.error(`加载已保存的 API Keys 失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
       message.error(`调用获取已保存 API Keys 时出错: ${error}`);
    }
  };

  useEffect(() => {
    loadServices();
    loadSavedKeys(); // 在加载服务商后加载已保存的 Keys
  }, []);

  // 处理 API Key 输入变化
  const handleApiKeyChange = (providerId: string, value: string) => {
    setApiKeys(prev => new Map(prev).set(providerId, value));
  };

  // 处理保存 API Key
  const handleSaveApiKey = async (providerId: string) => {
    const apiKey = apiKeys.get(providerId) || null; // 获取输入的 Key，空字符串视为 null
    setSavingStatus(prev => new Map(prev).set(providerId, true)); // 设置保存中状态
    try {
      // 调用后端设置 API Key (现在后端会持久化)
      const result = await window.electronAPI.llmSetApiKey(providerId, apiKey);
      if (result.success) {
        message.success(`${services.find(s => s.providerId === providerId)?.providerName || providerId} API Key 已保存！`);
        // 保存成功后，本地状态 apiKeys 已经通过 onChange 更新了，无需额外操作
        // 如果保存的是空字符串或 null (表示删除)，也需要更新状态
        if (!apiKey) {
           setApiKeys(prev => {
             const newMap = new Map(prev);
             newMap.delete(providerId);
             return newMap;
           });
        }
      } else {
        message.error(`保存 API Key 失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      message.error(`调用设置 API Key 时出错: ${error}`);
    } finally {
       setSavingStatus(prev => new Map(prev).set(providerId, false)); // 清除保存中状态
    }
  };


  return (
    <div>
      <Typography.Title level={2}>AI 服务商配置</Typography.Title>
      <Typography.Paragraph>
        管理连接到不同 AI 大语言模型服务商的配置。请在此处输入您的 API Key。API Key 将仅存储在您的本地设备上。
      </Typography.Paragraph>
      {loading ? (
        // 移除无效的 tip 属性
        <Spin />
      ) : (
        <List
          grid={{ gutter: 16, column: 1 }} // 每行一个卡片
          dataSource={services}
          renderItem={(service) => (
            <List.Item>
              {/* 将 bordered={false} 替换为 variant="borderless" */}
              <Card title={service.providerName} variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)' }}>
                <Form layout="vertical">
                  <Form.Item label="API Key">
                    <Input.Password
                      placeholder={`请输入 ${service.providerName} API Key`}
                      value={apiKeys.get(service.providerId) || ''}
                      onChange={(e) => handleApiKeyChange(service.providerId, e.target.value)}
                    />
                  </Form.Item>
                  <Form.Item label="默认支持模型">
                     {service.defaultModels.length > 0
                       ? service.defaultModels.map(model => <Tag key={model}>{model}</Tag>)
                       : <Typography.Text type="secondary">暂无默认模型信息</Typography.Text>
                     }
                     {/* TODO: 添加按钮或链接以管理自定义模型 */}
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      onClick={() => handleSaveApiKey(service.providerId)}
                      loading={savingStatus.get(service.providerId) || false}
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