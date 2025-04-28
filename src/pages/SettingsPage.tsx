import React, { useState, useEffect } from 'react';
import { Typography, Card, Radio, Input, Button, message, Spin } from 'antd';
import type { RadioChangeEvent } from 'antd';

// 代理模式类型
type ProxyMode = 'system' | 'custom' | 'none';

// 代理配置接口 (与后端保持一致)
interface ProxyConfig {
  mode: ProxyMode;
  url?: string; // 当前活动的 URL (这个字段主要由后端 ProxyManager 管理，前端主要关心 mode 和 customProxyUrl)
  customProxyUrl?: string; // 持久保存的自定义 URL
}

const SettingsPage: React.FC = () => {
  // 状态
  const [proxyMode, setProxyMode] = useState<ProxyMode>('none'); // UI 上选中的模式
  const [customProxyUrlInput, setCustomProxyUrlInput] = useState<string>(''); // 自定义 URL 输入框的值
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
        const loadedConfig = result.data as ProxyConfig;
        // --- 核心改动：UI 状态直接反映加载到的配置 ---
        setProxyMode(loadedConfig.mode);
        setCustomProxyUrlInput(loadedConfig.customProxyUrl || ''); // 输入框始终显示保存的自定义 URL
        console.log(`[SettingsPage] Loaded and set UI: mode=${loadedConfig.mode}, customUrl=${loadedConfig.customProxyUrl || 'none'}`);
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

  // 在组件挂载时加载代理配置
  useEffect(() => {
    loadProxyConfig();
    // 移除 focus 时的重新加载，避免不必要的状态覆盖
    // 如果需要实时反映系统代理变化，应该由后端 ProxyManager 推送或前端定期查询，而不是覆盖用户界面选择
  }, []); // 空依赖数组，只在挂载时运行一次

  // 处理代理模式变更
  const handleProxyModeChange = (e: RadioChangeEvent) => {
    const mode = e.target.value as ProxyMode;
    setProxyMode(mode); // 只更新 UI 状态，不自动保存
    console.log(`[SettingsPage] Proxy mode changed in UI to: ${mode}`);
    // 注意：不再自动清空或填充输入框，输入框的值与 customProxyUrlInput 绑定
  };

  // 处理自定义代理URL输入框变更
  const handleCustomProxyUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomProxyUrlInput(e.target.value);
  };

  // 保存代理配置 (只在点击按钮时触发)
  const saveProxyConfig = async () => {
    try {
      setSaving(true);

      // 验证自定义代理URL (仅当选择自定义模式时)
      if (proxyMode === 'custom' && (!customProxyUrlInput || customProxyUrlInput.trim() === '')) {
        message.error('选择自定义代理时，请输入有效的代理URL');
        setSaving(false);
        return;
      }

      // 准备要发送给后端的配置
      // 后端 configureProxy 会根据 mode 处理 url
      // 我们只需要传递用户选择的 mode 和 输入框里的 customProxyUrl
      const configToSave: ProxyConfig = {
        mode: proxyMode,
        // url 字段让后端根据 mode 决定，前端不传活动的 url
        customProxyUrl: customProxyUrlInput.trim() // 保存当前输入框的值作为新的自定义 URL
      };

      console.log(`[SettingsPage] Saving proxy config:`, configToSave);
      const result = await window.electronAPI.proxySetConfig(configToSave);
      if (result.success) {
        message.success('代理设置已保存');
        // 保存成功后可以重新加载一次，确保状态同步（虽然理论上应该一致了）
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

  // 测试代理连接 (基本不变)
  const testProxyConnection = async () => {
    try {
      setTesting(true);
      console.log('[SettingsPage] Testing proxy connection (using currently applied settings)...');
      // 注意：测试的是后端 ProxyManager 当前实际应用的代理，
      // 可能与 Settings UI 上未保存的更改不同。
      // 如果需要测试 UI 上的更改，应该先保存。
      message.info('正在测试当前已应用的代理设置...'); // 提示用户

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
              <div>生效代理URL: {result.data.proxyUrl}</div>
            )}
            <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              测试网站: {result.data.testedSites}
            </div>
          </div>, 10 // 显示时间长一点
        );
      } else if (result.data) {
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
              <div>生效代理URL: {result.data.proxyUrl}</div>
            )}
            <div>错误信息: {result.error}</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              测试网站: {result.data.testedSites}
            </div>
          </div>, 10
        );
      } else {
        // 完全失败，没有数据
        message.error(`代理测试失败: ${result.error || '未知错误'}`, 10);
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
            配置应用的网络代理设置。代理设置将影响所有网络请求，包括大语言模型的API调用。更改后请点击“保存代理设置”生效。
          </Typography.Paragraph>

          <div style={{ marginBottom: 16 }}>
            <Radio.Group
              value={proxyMode} // Radio Group 的值反映当前 UI 选择
              onChange={handleProxyModeChange}
              style={{ marginBottom: 16 }}
            >
              <Radio value="none">不使用代理</Radio>
              <Radio value="system">使用系统代理</Radio>
              <Radio value="custom">使用自定义代理</Radio>
            </Radio.Group>
          </div>

          {/* 自定义代理输入框始终可见，但仅在选择 custom 模式时启用 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              placeholder="请输入自定义代理URL (例如: http://127.0.0.1:7890)"
              value={customProxyUrlInput} // 输入框的值绑定到 customProxyUrlInput
              onChange={handleCustomProxyUrlChange}
              disabled={proxyMode !== 'custom'} // 仅在自定义模式下启用
              style={{ marginBottom: 8 }}
            />
            <Typography.Text type="secondary">
              支持HTTP、HTTPS和SOCKS代理。格式: http://host:port 或 socks5://host:port
            </Typography.Text>
          </div>

          <div>
            <Button
              type="primary"
              onClick={saveProxyConfig} // 点击按钮才保存
              loading={saving}
              style={{ marginRight: 8 }}
            >
              保存代理设置
            </Button>
            <Button
              onClick={testProxyConnection}
              loading={testing}
            >
              测试当前生效代理
            </Button>
          </div>
        </Spin>
      </Card>

      {/* 其他设置可以在这里添加 */}
    </div>
  );
};

export default SettingsPage;