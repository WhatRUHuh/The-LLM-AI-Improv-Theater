import React, { useState, useEffect, useCallback } from 'react';
import { Form, Switch, Radio, Input, Button, message, Spin, Typography, Alert } from 'antd';
import type { ProxyConfig } from '../../electron/proxyManager'; // 导入后端定义的类型

const SettingsPage: React.FC = () => {
  const [form] = Form.useForm<ProxyConfig>(); // 创建表单实例，并指定类型
  const [loading, setLoading] = useState(true); // 加载状态
  const [saving, setSaving] = useState(false); // 保存状态
  // 使用 form.getFieldValue('mode') !== 'none' 来动态判断代理是否启用，减少一个 state
  // const [proxyEnabled, setProxyEnabled] = useState(false);

  // 加载当前代理配置
  const loadProxyConfig = useCallback(async () => {
    setLoading(true);
    try {
      // 确保 proxyGetConfig 在 electronAPI 上可用 (稍后处理 d.ts)
      const result = await window.electronAPI.proxyGetConfig();
      if (result.success && result.data) {
        console.log('[SettingsPage] Loaded proxy config:', result.data);
        // 使用加载的配置设置表单初始值
        form.setFieldsValue(result.data);
      } else {
        message.error(`加载代理配置失败: ${result.error || '未知错误'}`);
        // 加载失败，默认禁用代理
        form.setFieldsValue({ mode: 'none', url: '' });
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用获取代理配置时出错: ${errorMsg}`);
      form.setFieldsValue({ mode: 'none', url: '' });
    } finally {
      setLoading(false);
    }
  }, [form]); // 依赖 form 实例

  useEffect(() => {
    loadProxyConfig();
  }, [loadProxyConfig]); // 组件加载时执行

  // 处理表单提交（保存设置）
  const handleSave = async (values: ProxyConfig) => {
    setSaving(true);
    try {
      // 直接使用表单提交的值，因为 mode 会根据 Switch 状态被正确设置
      const configToSave: ProxyConfig = values;

      // 如果模式是自定义，但 URL 为空，则提示错误
      if (configToSave.mode === 'custom' && !configToSave.url?.trim()) {
         message.error('选择自定义代理时，必须填写代理 URL！');
         setSaving(false);
         return;
      }

      console.log('[SettingsPage] Saving proxy config:', configToSave);
      // 确保 proxySetConfig 在 electronAPI 上可用 (稍后处理 d.ts)
      const result = await window.electronAPI.proxySetConfig(configToSave);
      if (result.success) {
        message.success('代理设置已保存并应用！');
      } else {
        message.error(`保存代理设置失败: ${result.error || '未知错误'}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`调用保存代理设置时出错: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  // 处理代理开关变化 (直接修改 form 的 mode 值)
  const onProxyEnabledChange = (checked: boolean) => {
    if (!checked) {
      form.setFieldsValue({ mode: 'none' });
    } else {
      // 如果打开时当前模式是 none，则默认为 system
      if (form.getFieldValue('mode') === 'none') {
         form.setFieldsValue({ mode: 'system' });
      }
      // 如果打开时已经是 system 或 custom，则保持不变
    }
    // 强制重新渲染以更新依赖 currentMode 的 UI
    forceUpdate({});
  };

  // 获取当前选择的代理模式，用于条件渲染自定义 URL 输入框
  const currentMode = Form.useWatch('mode', form);
  const proxyEnabled = currentMode !== 'none'; // 根据 mode 判断是否启用

  // 用于强制刷新 UI 以响应 Switch 变化带来的 mode 变化
  const [, forceUpdate] = useState({});

  return (
    <div>
      <Typography.Title level={2}>应用设置</Typography.Title>

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ mode: 'none', url: '' }} // 初始值设为无代理
          style={{ maxWidth: 600 }}
        >
          <Typography.Title level={4} style={{ marginTop: 24 }}>网络代理</Typography.Title>
          <Alert
             message="代理设置说明"
             description="启用代理后，应用的所有网络请求（包括 AI 模型调用）将通过指定的代理服务器。支持 HTTP、HTTPS 和 SOCKS 代理 (例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080)。"
             type="info"
             showIcon
             style={{ marginBottom: 16 }}
           />

          <Form.Item label="启用网络代理" valuePropName="checked">
             {/* 这个 Switch 直接控制 mode 的值 */}
             <Switch checked={proxyEnabled} onChange={onProxyEnabledChange} />
          </Form.Item>

          {/* 仅在代理启用时显示模式选择和自定义 URL */}
          {proxyEnabled && (
            <>
              <Form.Item
                label="代理模式"
                name="mode"
                rules={[{ required: true, message: '请选择代理模式' }]}
              >
                <Radio.Group onChange={() => forceUpdate({})}> {/* 切换模式时也强制刷新 */}
                  <Radio value="system">使用系统代理</Radio>
                  <Radio value="custom">自定义代理</Radio>
                </Radio.Group>
              </Form.Item>

              {/* 仅在选择自定义代理时显示 URL 输入框 */}
              {currentMode === 'custom' && (
                <Form.Item
                  label="自定义代理 URL"
                  name="url"
                  rules={[
                    { required: true, message: '请输入代理服务器 URL' },
                    {
                      // 简单的 URL 格式校验 (可能不够完善)
                      pattern: /^(http|https|socks4|socks5):\/\/.+:\d+$/i,
                      message: '请输入有效的代理 URL (例如 http://host:port 或 socks5://host:port)',
                    },
                  ]}
                  tooltip="格式示例: http://127.0.0.1:7890 或 socks5://user:pass@127.0.0.1:1080"
                >
                  <Input placeholder="例如: http://127.0.0.1:7890" />
                </Form.Item>
              )}
            </>
          )}

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存代理设置
            </Button>
          </Form.Item>
        </Form>
      </Spin>
    </div>
  );
};

export default SettingsPage;