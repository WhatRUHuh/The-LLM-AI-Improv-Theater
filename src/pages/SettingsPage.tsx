import React, { useState, useEffect } from 'react';
import { Typography, Card, Radio, Input, Button, message, Spin } from 'antd';
import type { RadioChangeEvent } from 'antd';

// 代理模式类型
type ProxyMode = 'system' | 'custom' | 'none';

// 代理配置接口
interface ProxyConfig {
  mode: ProxyMode;
  url?: string;
}

const SettingsPage: React.FC = () => {
  // 状态
  const [proxyMode, setProxyMode] = useState<ProxyMode>('none');
  const [proxyUrl, setProxyUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);

  // 加载代理配置
  const loadProxyConfig = async () => {
    try {
      setLoading(true);
      console.log('[SettingsPage] Loading proxy config...');
      const result = await window.electronAPI.proxyGetConfig();
      console.log('[SettingsPage] Proxy config loaded:', result);
      if (result.success && result.data) {
        setProxyMode(result.data.mode);
        setProxyUrl(result.data.url || '');
        console.log(`[SettingsPage] Set proxy mode to ${result.data.mode}, url to ${result.data.url || 'none'}`);
      } else {
        message.error(`加载代理配置失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[SettingsPage] Error loading proxy config:', error);
      message.error(`加载代理配置时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // 在组件挂载和激活时加载代理配置
  useEffect(() => {
    loadProxyConfig();

    // 添加一个事件监听器，当窗口获得焦点时重新加载配置
    const handleFocus = () => {
      console.log('[SettingsPage] Window focused, reloading proxy config...');
      loadProxyConfig();
    };

    window.addEventListener('focus', handleFocus);

    // 清理函数
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // 处理代理模式变更
  const handleProxyModeChange = async (e: RadioChangeEvent) => {
    const mode = e.target.value as ProxyMode;
    setProxyMode(mode);

    // 如果选择了"不使用代理"或"使用系统代理"，自动保存配置
    if (mode === 'none' || mode === 'system') {
      await saveProxyConfig(mode);
    }
  };

  // 处理代理URL变更
  const handleProxyUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProxyUrl(e.target.value);
  };

  // 保存代理配置
  const saveProxyConfig = async (overrideMode?: ProxyMode) => {
    try {
      setSaving(true);

      // 使用传入的模式或当前状态中的模式
      const currentMode = overrideMode || proxyMode;

      // 验证自定义代理URL
      if (currentMode === 'custom' && (!proxyUrl || proxyUrl.trim() === '')) {
        message.error('请输入有效的代理URL');
        setSaving(false);
        return;
      }

      const config: ProxyConfig = {
        mode: currentMode,
        url: currentMode === 'custom' ? proxyUrl : undefined
      };

      console.log(`[SettingsPage] Saving proxy config: mode=${config.mode}, url=${config.url || 'none'}`);
      const result = await window.electronAPI.proxySetConfig(config);
      if (result.success) {
        message.success('代理设置已保存');
        // 保存成功后重新加载配置，确保UI状态与后端一致
        await loadProxyConfig();
      } else {
        message.error(`保存代理设置失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[SettingsPage] Error saving proxy config:', error);
      message.error(`保存代理设置时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  // 测试代理连接
  const testProxyConnection = async () => {
    try {
      setTesting(true);
      console.log('[SettingsPage] Testing proxy connection...');

      const result = await window.electronAPI.proxyTestConnection();
      console.log('[SettingsPage] Proxy test result:', result);

      if (result.success && result.data) {
        message.success(
          <div>
            <div>代理测试成功！成功访问谷歌、YouTube或维基百科！</div>
            <div>当前IP: {result.data.ip}</div>
            <div>代理模式: {
              result.data.proxyMode === 'system' ? '系统代理' :
              result.data.proxyMode === 'custom' ? '自定义代理' :
              '不使用代理'
            }</div>
            {result.data.proxyUrl !== '无' && (
              <div>代理URL: {result.data.proxyUrl}</div>
            )}
            <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              测试网站: {result.data.testedSites}
            </div>
          </div>
        );
      } else if (result.data) {
        // 有数据但测试失败（无法访问被墙网站）
        message.error(
          <div>
            <div>代理测试失败：无法访问谷歌、YouTube或维基百科</div>
            <div>当前IP: {result.data.ip}</div>
            <div>代理模式: {
              result.data.proxyMode === 'system' ? '系统代理' :
              result.data.proxyMode === 'custom' ? '自定义代理' :
              '不使用代理'
            }</div>
            {result.data.proxyUrl !== '无' && (
              <div>代理URL: {result.data.proxyUrl}</div>
            )}
            <div>错误信息: {result.error}</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              测试网站: {result.data.testedSites}
            </div>
          </div>
        );
      } else {
        // 完全失败，没有数据
        message.error(`代理测试失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[SettingsPage] Error testing proxy connection:', error);
      message.error(`测试代理连接时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2}>应用设置</Typography.Title>

      <Card title="网络代理设置" style={{ marginBottom: 16 }}>
        <Spin spinning={loading}>
          <Typography.Paragraph>
            配置应用的网络代理设置。代理设置将影响所有网络请求，包括大语言模型的API调用。
          </Typography.Paragraph>

          <div style={{ marginBottom: 16 }}>
            <Radio.Group
              value={proxyMode}
              onChange={handleProxyModeChange}
              style={{ marginBottom: 16 }}
            >
              <Radio value="none">不使用代理</Radio>
              <Radio value="system">使用系统代理</Radio>
              <Radio value="custom">使用自定义代理</Radio>
            </Radio.Group>
          </div>

          {proxyMode === 'custom' && (
            <div style={{ marginBottom: 16 }}>
              <Input
                placeholder="请输入代理URL (例如: http://127.0.0.1:7890 或 socks5://127.0.0.1:7891)"
                value={proxyUrl}
                onChange={handleProxyUrlChange}
                style={{ marginBottom: 8 }}
              />
              <Typography.Text type="secondary">
                支持HTTP、HTTPS和SOCKS代理。格式: http://host:port 或 socks5://host:port
              </Typography.Text>
            </div>
          )}

          <div>
            <Button
              type="primary"
              onClick={() => saveProxyConfig()}
              loading={saving}
              style={{ marginRight: 8 }}
            >
              保存代理设置
            </Button>
            <Button
              onClick={testProxyConnection}
              loading={testing}
            >
              测试代理连接
            </Button>
          </div>
        </Spin>
      </Card>

      {/* 其他设置可以在这里添加 */}
    </div>
  );
};

export default SettingsPage;