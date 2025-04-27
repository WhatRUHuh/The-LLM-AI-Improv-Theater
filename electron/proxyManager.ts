import { ProxyConfig as ElectronProxyConfig, session } from 'electron';
import { socksDispatcher } from 'fetch-socks'; // 用于 Undici 的 SOCKS 代理
import { getSystemProxy } from 'os-proxy-config'; // 获取系统代理设置
import { ProxyAgent as GeneralProxyAgent } from 'proxy-agent'; // 通用代理 Agent，可能读取环境变量
import { ProxyAgent as UndiciProxyAgent, setGlobalDispatcher } from 'undici'; // Undici 的 HTTP/S 代理和全局设置 (移除 getGlobalDispatcher)

// 定义代理模式类型
type ProxyMode = 'system' | 'custom' | 'none';

// 定义代理配置接口
export interface ProxyConfig {
  mode: ProxyMode;
  url?: string; // 自定义模式下的代理 URL (例如 http://user:pass@host:port, socks5://host:port)
}

/**
 * 管理应用程序的全局代理设置。
 * 结合 Electron Session、环境变量和 Undici 全局分发器，
 * 并提供一个通用代理 Agent 供 SDK 使用。
 */
class ProxyManager {
  private config: ProxyConfig;
  private generalProxyAgent: GeneralProxyAgent | null = null; // 通用代理 Agent 实例
  private systemProxyMonitorInterval: NodeJS.Timeout | null = null; // 系统代理监控定时器
  private currentSystemProxyUrl: string | null = null; // 缓存当前应用的系统代理 URL，避免重复设置
  private isUndiciDispatcherCustom: boolean = false; // 标志位：是否设置了自定义的 Undici 全局分发器

  constructor() {
    // 初始状态为不使用代理
    this.config = {
      mode: 'none',
    };
    console.log('[ProxyManager] Initialized with mode: none');
  }

  /**
   * 设置 Electron 会话的代理配置。
   * @param config Electron 的代理配置对象
   */
  private async setElectronSessionsProxy(config: ElectronProxyConfig): Promise<void> {
    // 同时配置默认会话和持久化会话（如果将来用到）
    const sessions = [session.defaultSession, session.fromPartition('persist:webview')];
    try {
      await Promise.all(sessions.map((s) => s.setProxy(config)));
      console.log('[ProxyManager] Electron sessions proxy configured:', config);
    } catch (error) {
      console.error('[ProxyManager] Failed to set Electron sessions proxy:', error);
      // 即使失败也继续，可能只是某个会话设置失败
    }
  }

  /**
   * 启动系统代理监控。
   */
  private async startSystemProxyMonitor(): Promise<void> {
    this.stopSystemProxyMonitor(); // 先停止旧的监控
    console.log('[ProxyManager] Starting system proxy monitor (interval: 10s)');
    // 立即执行一次检查
    await this.applySystemProxy();
    // 设置定时器
    this.systemProxyMonitorInterval = setInterval(async () => {
      if (this.config.mode === 'system') { // 再次确认模式未改变
        console.log('[ProxyManager] Checking system proxy...');
        await this.applySystemProxy(); // 定时应用系统代理
      } else {
        this.stopSystemProxyMonitor(); // 如果模式改变，停止监控
      }
    }, 10000); // 每 10 秒检查一次
  }

  /**
   * 停止系统代理监控。
   */
  private stopSystemProxyMonitor(): void {
    if (this.systemProxyMonitorInterval) {
      console.log('[ProxyManager] Stopping system proxy monitor.');
      clearInterval(this.systemProxyMonitorInterval);
      this.systemProxyMonitorInterval = null;
    }
  }

  /**
   * 配置并应用代理设置。这是外部调用的主要入口。
   * @param newConfig 新的代理配置
   */
  async configureProxy(newConfig: ProxyConfig): Promise<void> {
    console.log('[ProxyManager] Configuring proxy with new settings:', newConfig);
    try {
      const oldConfig = { ...this.config }; // 保存旧配置用于比较
      this.config = newConfig;
      this.stopSystemProxyMonitor(); // 停止旧的监控（如果有）

      if (this.config.mode === 'system') {
        // 只有在模式从非 system 切换到 system，或者首次配置为 system 时才启动监控
        if (oldConfig.mode !== 'system') {
           await this.startSystemProxyMonitor(); // 应用系统代理并启动监控
        } else {
           await this.applySystemProxy(); // 模式没变，只应用一次
        }
      } else if (this.config.mode === 'custom' && this.config.url) {
        await this.applyCustomProxy(this.config.url); // 应用自定义代理
      } else {
        await this.clearProxySettings(); // 清除代理设置
      }
      // 每次配置变更后，尝试设置 Undici 全局代理
      this.setUndiciGlobalProxy();
    } catch (error) {
      console.error('[ProxyManager] Failed to configure proxy:', error);
      // 配置失败时，尝试回退到无代理状态
      await this.clearProxySettings();
      this.setUndiciGlobalProxy(); // 确保 Undici 也清除
      throw error; // 重新抛出错误，让调用者知道失败了
    }
  }

  /**
   * 设置代理相关的环境变量。
   * @param url 代理 URL
   */
  private setEnvironmentVariables(url: string): void {
    console.log(`[ProxyManager] Setting environment variables for proxy: ${url}`);
    process.env.HTTP_PROXY = url;
    process.env.HTTPS_PROXY = url;
    process.env.http_proxy = url; // 兼容小写
    process.env.https_proxy = url; // 兼容小写
    // 注意：grpc_proxy 可能不需要，取决于具体库是否使用 gRPC 且读取此变量
    // process.env.grpc_proxy = url;
    // 清除可能存在的 NO_PROXY 设置，确保所有请求都走代理（如果需要）
    // delete process.env.NO_PROXY;
    // delete process.env.no_proxy;
  }

  /**
   * 清除代理相关的环境变量。
   */
  private clearEnvironmentVariables(): void {
    console.log('[ProxyManager] Clearing proxy environment variables.');
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    // delete process.env.grpc_proxy;
  }

  /**
   * 应用系统代理设置。
   */
  private async applySystemProxy(): Promise<void> {
    try {
      const systemProxy = await getSystemProxy();
      const systemProxyUrl = systemProxy?.proxyUrl?.toLowerCase() || null;

      // 如果系统代理 URL 没有变化，则不重新设置，避免不必要的开销
      if (systemProxyUrl === this.currentSystemProxyUrl) {
        console.log('[ProxyManager] System proxy URL unchanged, skipping update.');
        return;
      }

      this.currentSystemProxyUrl = systemProxyUrl; // 更新缓存的 URL

      if (systemProxyUrl) {
        console.log(`[ProxyManager] Applying system proxy: ${systemProxyUrl}`);
        await this.setElectronSessionsProxy({ mode: 'system' }); // 让 Electron 使用系统设置
        this.setEnvironmentVariables(systemProxyUrl); // 设置环境变量
        this.generalProxyAgent = new GeneralProxyAgent(); // 创建通用 Agent (它会读取环境变量)
        this.config.url = systemProxyUrl; // 更新内部配置的 URL，供 Undici 使用
      } else {
        console.log('[ProxyManager] No system proxy detected, clearing settings.');
        await this.clearProxySettings(); // 如果系统没有代理，则清除所有代理设置
      }
      // 每次应用系统代理后，都尝试更新 Undici 代理
      this.setUndiciGlobalProxy();
    } catch (error) {
      console.error('[ProxyManager] Failed to get or apply system proxy:', error);
      // 获取系统代理失败时，也清除代理设置
      await this.clearProxySettings();
      this.setUndiciGlobalProxy();
      // 可以选择是否抛出错误
    }
  }

  /**
   * 应用自定义代理设置。
   * @param proxyUrl 自定义的代理 URL
   */
  private async applyCustomProxy(proxyUrl: string): Promise<void> {
    try {
      console.log(`[ProxyManager] Applying custom proxy: ${proxyUrl}`);
      this.setEnvironmentVariables(proxyUrl); // 设置环境变量
      this.generalProxyAgent = new GeneralProxyAgent(); // 创建通用 Agent
      // Electron 需要 proxyRules 格式
      await this.setElectronSessionsProxy({ proxyRules: proxyUrl, mode: 'fixed_servers' });
      this.currentSystemProxyUrl = null; // 清除系统代理缓存
      // 更新 Undici 代理
      this.setUndiciGlobalProxy();
    } catch (error) {
      console.error('[ProxyManager] Failed to set custom proxy:', error);
      throw error; // 抛出错误
    }
  }

  /**
   * 清除所有代理设置。
   */
  private async clearProxySettings(): Promise<void> {
    console.log('[ProxyManager] Clearing all proxy settings.');
    this.clearEnvironmentVariables(); // 清除环境变量
    await this.setElectronSessionsProxy({ mode: 'direct' }); // Electron 直连
    this.config = { mode: 'none', url: undefined }; // 重置内部配置
    this.generalProxyAgent = null; // 清除通用 Agent
    this.currentSystemProxyUrl = null; // 清除系统代理缓存
    // 更新 Undici 代理（清除）
    this.setUndiciGlobalProxy();
  }

  /**
   * 设置 Undici 的全局网络分发器以应用代理。
   */
  private setUndiciGlobalProxy(): void {
    const proxyUrl = this.config.url; // 使用当前配置的 URL (可能是系统或自定义的)

    // 不再需要获取 currentDispatcher，使用标志位判断
    // const currentDispatcher = getGlobalDispatcher();

    if (proxyUrl) {
      try {
        const url = new URL(proxyUrl); // 解析 URL 以获取协议、主机、端口等
        const protocol = url.protocol.slice(0, -1); // 移除末尾的 ':'

        if (protocol.startsWith('socks')) {
          console.log(`[ProxyManager] Setting Undici global dispatcher for SOCKS proxy: ${proxyUrl}`);
          const dispatcher = socksDispatcher({
            type: protocol === 'socks5' ? 5 : 4,
            host: url.hostname,
            port: parseInt(url.port, 10),
            // 添加用户名/密码支持 (如果 URL 中包含)
            userId: url.username || undefined,
            password: url.password || undefined,
          });
          // Undici v6 推荐方式
          setGlobalDispatcher(dispatcher);
          this.isUndiciDispatcherCustom = true; // 标记已设置
          // 兼容旧版的方式 (可能不再需要)
          // global[Symbol.for('undici.globalDispatcher.1')] = dispatcher;
        } else if (protocol === 'http' || protocol === 'https') {
          console.log(`[ProxyManager] Setting Undici global dispatcher for HTTP/S proxy: ${proxyUrl}`);
          const dispatcher = new UndiciProxyAgent(proxyUrl);
          setGlobalDispatcher(dispatcher);
          this.isUndiciDispatcherCustom = true; // 标记已设置
        } else {
          console.warn(`[ProxyManager] Unsupported protocol for Undici global dispatcher: ${protocol}. Clearing dispatcher.`);
          // 如果协议不支持，且当前设置了自定义 dispatcher，则尝试清除
          if (this.isUndiciDispatcherCustom) {
             console.log('[ProxyManager] Clearing custom Undici global dispatcher due to unsupported protocol.');
             // 如何安全地“清除”或恢复默认 dispatcher 需要查阅 undici 文档
             // 暂时只重置标志位，依赖 Node.js 默认行为或重启应用恢复
             // setGlobalDispatcher(new Agent()); // 或者设置一个默认的 Agent?
             this.isUndiciDispatcherCustom = false;
          }
        }
      } catch (error) {
         console.error(`[ProxyManager] Failed to parse proxy URL or set Undici dispatcher for ${proxyUrl}:`, error);
         // 解析失败或设置失败时，也尝试清除
         if (this.isUndiciDispatcherCustom) {
            console.log('[ProxyManager] Clearing custom Undici global dispatcher due to error.');
            // setGlobalDispatcher(new Agent());
            this.isUndiciDispatcherCustom = false;
         }
      }
    } else {
      // 如果 config.url 为空（即 mode 为 none 或 system 但未检测到代理）
      console.log('[ProxyManager] No proxy URL configured, clearing Undici global dispatcher if custom one was set.');
      // 清除可能存在的旧自定义代理 dispatcher
      if (this.isUndiciDispatcherCustom) {
         console.log('[ProxyManager] Clearing existing custom Undici global dispatcher.');
         // setGlobalDispatcher(new Agent()); // 恢复默认?
         this.isUndiciDispatcherCustom = false;
      }
    }
  }

  /**
   * 获取通用的代理 Agent 实例，供需要显式传递 Agent 的库使用。
   * @returns GeneralProxyAgent 实例或 null
   */
  getProxyAgent(): GeneralProxyAgent | null {
    // 每次获取时都基于当前环境重新创建，确保最新状态？
    // 或者依赖 configureProxy 时创建的实例？示例代码是后者
    return this.generalProxyAgent;
  }

  /**
   * 获取当前生效的代理 URL (可能是系统或自定义的)。
   * @returns 代理 URL 字符串或空字符串
   */
  getCurrentProxyUrl(): string {
    return this.config.url || '';
  }

  /**
   * 获取当前的代理配置。
   */
  getCurrentConfig(): Readonly<ProxyConfig> {
     return this.config;
  }
}

// 创建并导出一个单例管理器实例
export const proxyManager = new ProxyManager();

// 注意：需要在主进程启动时根据存储的配置调用一次 proxyManager.configureProxy()