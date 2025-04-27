import { ProxyConfig as _ProxyConfig, session } from 'electron'
import { socksDispatcher } from 'fetch-socks'
import { getSystemProxy } from 'os-proxy-config'
import { ProxyAgent as GeneralProxyAgent } from 'proxy-agent'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

// 代理模式类型
export type ProxyMode = 'system' | 'custom' | 'none'

// 代理配置接口
export interface ProxyConfig {
  mode: ProxyMode
  url?: string
}

/**
 * 代理管理器类
 * 负责管理全局代理设置，支持系统代理、自定义代理和无代理三种模式
 */
export class ProxyManager {
  private config: ProxyConfig
  private proxyAgent: GeneralProxyAgent | null = null
  private systemProxyInterval: NodeJS.Timeout | null = null

  constructor() {
    this.config = {
      mode: 'none'
    }
  }

  /**
   * 为所有Electron会话设置代理
   */
  private async setSessionsProxy(config: _ProxyConfig): Promise<void> {
    const sessions = [session.defaultSession, session.fromPartition('persist:webview')]
    await Promise.all(sessions.map((session) => session.setProxy(config)))
  }

  /**
   * 开始监控系统代理变化
   */
  private async monitorSystemProxy(): Promise<void> {
    // 先清除已有的监控
    this.clearSystemProxyMonitor()
    // 设置新的监控间隔
    this.systemProxyInterval = setInterval(async () => {
      await this.setSystemProxy()
    }, 10000) // 每10秒检查一次
  }

  /**
   * 清除系统代理监控
   */
  private clearSystemProxyMonitor(): void {
    if (this.systemProxyInterval) {
      clearInterval(this.systemProxyInterval)
      this.systemProxyInterval = null
    }
  }

  /**
   * 配置代理
   * @param config 代理配置
   */
  async configureProxy(config: ProxyConfig): Promise<void> {
    try {
      this.config = config
      this.clearSystemProxyMonitor()
      
      if (this.config.mode === 'system') {
        await this.setSystemProxy()
        this.monitorSystemProxy()
      } else if (this.config.mode === 'custom') {
        await this.setCustomProxy()
      } else {
        await this.clearProxy()
      }
    } catch (error) {
      console.error('Failed to configure proxy:', error)
      throw error
    }
  }

  /**
   * 设置环境变量
   */
  private setEnvironment(url: string): void {
    process.env.grpc_proxy = url
    process.env.HTTP_PROXY = url
    process.env.HTTPS_PROXY = url
    process.env.http_proxy = url
    process.env.https_proxy = url
  }

  /**
   * 设置系统代理
   */
  private async setSystemProxy(): Promise<void> {
    try {
      let currentProxy: { proxyUrl: string } | null = null;
      
      try {
        // 尝试获取系统代理，可能会因为registry-js问题而失败
        const result = await getSystemProxy();
        if (result && typeof result === 'object' && 'proxyUrl' in result) {
          currentProxy = result as { proxyUrl: string };
        }
      } catch (proxyError) {
        console.error('Error getting system proxy (registry-js may have failed):', proxyError);
        console.log('Falling back to direct connection due to system proxy detection failure');
        // 如果获取系统代理失败，我们将回退到直接连接
        await this.clearProxy();
        return;
      }

      // 如果没有系统代理或者代理URL没有变化，则不做任何操作
      if (!currentProxy || !currentProxy.proxyUrl || currentProxy.proxyUrl === this.config.url) {
        return;
      }
      
      await this.setSessionsProxy({ mode: 'system' });
      this.config.url = currentProxy.proxyUrl.toLowerCase();
      this.setEnvironment(this.config.url);
      this.proxyAgent = new GeneralProxyAgent();
      this.setGlobalProxy();
    } catch (error) {
      console.error('Failed to set system proxy:', error);
      // 不要抛出错误，而是回退到直接连接
      console.log('Falling back to direct connection due to error');
      await this.clearProxy();
    }
  }

  /**
   * 设置自定义代理
   */
  private async setCustomProxy(): Promise<void> {
    try {
      if (this.config.url) {
        this.setEnvironment(this.config.url)
        this.proxyAgent = new GeneralProxyAgent()
        await this.setSessionsProxy({ proxyRules: this.config.url })
        this.setGlobalProxy()
      }
    } catch (error) {
      console.error('Failed to set custom proxy:', error)
      // 不要抛出错误，而是回退到直接连接
      console.log('Falling back to direct connection due to error')
      await this.clearProxy()
    }
  }

  /**
   * 清除环境变量
   */
  private clearEnvironment(): void {
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.grpc_proxy
    delete process.env.http_proxy
    delete process.env.https_proxy
  }

  /**
   * 清除代理设置
   */
  private async clearProxy(): Promise<void> {
    this.clearEnvironment()
    await this.setSessionsProxy({ mode: 'direct' })
    this.config = { mode: 'none' }
    this.proxyAgent = null
  }

  /**
   * 获取代理代理
   */
  getProxyAgent(): GeneralProxyAgent | null {
    return this.proxyAgent
  }

  /**
   * 获取代理URL
   */
  getProxyUrl(): string {
    return this.config.url || ''
  }

  /**
   * 设置全局代理
   */
  setGlobalProxy(): void {
    const proxyUrl = this.config.url
    if (proxyUrl) {
      try {
        const [protocol, address] = proxyUrl.split('://')
        if (!address) {
          console.error('Invalid proxy URL format:', proxyUrl)
          return
        }
        
        const [host, portStr] = address.split(':')
        if (!host || !portStr) {
          console.error('Invalid proxy URL format (missing host or port):', proxyUrl)
          return
        }
        
        const port = parseInt(portStr)
        if (isNaN(port)) {
          console.error('Invalid proxy port:', portStr)
          return
        }
        
        if (!protocol.includes('socks')) {
          // 处理HTTP/HTTPS代理
          setGlobalDispatcher(new ProxyAgent(proxyUrl))
        } else {
          // 处理SOCKS代理
          const dispatcher = socksDispatcher({
            port: port,
            type: protocol === 'socks5' ? 5 : 4,
            host: host
          })
          global[Symbol.for('undici.globalDispatcher.1')] = dispatcher
        }
      } catch (error) {
        console.error('Error setting global proxy:', error)
      }
    }
  }
}

// 导出单例
export const proxyManager = new ProxyManager()
