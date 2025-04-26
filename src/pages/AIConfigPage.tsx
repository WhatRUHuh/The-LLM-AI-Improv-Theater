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

  useEffect(() => {
    loadServices();
    // TODO: 在这里可以尝试从本地存储 (如 'apiKeys.json') 加载已保存的 API Keys
    // 并更新 setApiKeys 状态
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
      // 调用后端设置 API Key
      const result = await window.electronAPI.llmSetApiKey(providerId, apiKey);
      if (result.success) {
        message.success(`${services.find(s=>s.providerId===providerId)?.providerName || providerId} API Key 已保存！`);
        // TODO: 实际应用中，这里应该将 apiKey 保存到本地存储 ('apiKeys.json')
        // 后端 setApiKeyForService 只是设置了内存中的 key，并未持久化
        // 例如: await window.electronAPI.writeStore('apiKeys.json', { ...currentKeys, [providerId]: apiKey });
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