/**
 * 智能日历 - 本地设置服务客户端
 * 调用智能日历自己的后端API，与灵枢笔记共享设置文件
 */

// 智能日历后端API地址
const getCalendarApiBase = () => {
  if (typeof window === 'undefined') {
    // 服务端环境，使用默认地址
    return 'http://localhost:11001';
  }
  
  const hostname = window.location.hostname;
  
  // 检查是否是本地环境（localhost或127.0.0.1）
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // 检查是否是局域网IP地址（192.168.x.x, 10.x.x.x, 172.16-31.x.x）
  const isPrivateIP = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                     /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                     /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  
  if (isLocalhost || isPrivateIP) {
    // 本地开发环境或局域网IP访问，直接连接到智能日历后端
    console.log(`[本地设置服务] 检测到本地/局域网环境(${hostname})，使用直接连接`);
    return `http://${hostname}:11001`;
  } else {
    // 外网环境，使用nginx代理路径
    console.log(`[本地设置服务] 检测到外网环境(${hostname})，使用nginx代理`);
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/calendars/api`;
  }
};

const API_BASE = getCalendarApiBase();

class LocalSettingsService {
    constructor() {
        // 本地设置服务现在需要认证，使用统一认证token
        this.token = null;
        this.loadToken();
    }

    // 从localStorage加载令牌
    loadToken() {
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('calendar_unified_token');
        }
    }

    // 获取请求头
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        // 如果有token，添加Authorization头
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    // 处理API响应
    async handleResponse(response) {
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: '网络错误' }));
            throw new Error(error.error || '请求失败');
        }
        return response.json();
    }

    // 检查服务是否可用
    async isAvailable() {
        try {
            const response = await fetch(`${API_BASE}/health`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return response.ok;
        } catch (error) {
            console.error('[本地设置服务] 服务不可用:', error);
            return false;
        }
    }

    // 获取LLM设置
    async getLLMSettings(skipAuthCheck = false) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 获取LLM设置');

            const response = await fetch(`${API_BASE}/settings/llm`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const settings = await this.handleResponse(response);
            console.log('[本地设置服务] LLM设置获取成功:', settings);
            
            // 转换为智能日历前端期望的格式
            return this.convertToCalendarFormat(settings);
        } catch (error) {
            console.error('[本地设置服务] 获取LLM设置失败:', error);
            
            // 返回默认设置
            return {
                provider: 'builtin',
                api_key: 'BUILTIN_PROXY',
                base_url: 'BUILTIN_PROXY',
                model_name: 'deepseek/deepseek-chat-v3-0324:free',
                temperature: 0.7,
                maxTokens: 2000,
                useCustomModel: false
            };
        }
    }

    // 保存LLM设置
    async saveLLMSettings(calendarSettings) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 保存LLM设置:', calendarSettings);

            // 转换为后端期望的格式
            const backendSettings = this.convertToBackendFormat(calendarSettings);
            
            const response = await fetch(`${API_BASE}/settings/llm`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(backendSettings)
            });

            const result = await this.handleResponse(response);
            console.log('[本地设置服务] LLM设置保存成功');
            return true;
        } catch (error) {
            console.error('[本地设置服务] 保存LLM设置失败:', error);
            return false;
        }
    }

    // 转换后端设置为智能日历前端格式
    convertToCalendarFormat(backendSettings) {
        return {
            provider: backendSettings.provider || 'builtin',
            api_key: backendSettings.api_key || '',
            base_url: backendSettings.base_url || '',
            model_name: backendSettings.model_name || '',
            temperature: backendSettings.temperature || 0.7,
            maxTokens: backendSettings.max_tokens || 2000,
            useCustomModel: backendSettings.use_custom_model || false // 读取后端的use_custom_model字段
        };
    }

    // 转换智能日历前端格式为后端格式
    convertToBackendFormat(calendarSettings) {
        return {
            provider: calendarSettings.provider || 'builtin',
            api_key: calendarSettings.api_key || '',
            base_url: calendarSettings.base_url || '',
            model_name: calendarSettings.model_name || '',
            temperature: calendarSettings.temperature || 0.7,
            max_tokens: calendarSettings.maxTokens || 2000,
            use_custom_model: calendarSettings.useCustomModel || false // 保存use_custom_model字段
        };
    }

    // 兼容性方法 - 与原unifiedSettingsService保持相同接口

    // 模拟认证相关方法（本地服务不需要认证）
    async login(credentials) {
        // 本地服务不需要登录
        console.log('[本地设置服务] 跳过登录（本地服务）');
        return true;
    }

    async register(userData) {
        // 本地服务不需要注册
        console.log('[本地设置服务] 跳过注册（本地服务）');
        return true;
    }

    async logout() {
        // 本地服务不需要注销
        console.log('[本地设置服务] 跳过注销（本地服务）');
    }

    async ensureAuthenticated() {
        // 本地服务总是认证通过
        return true;
    }

    async verifyToken() {
        // 本地服务总是验证通过
        return { valid: true };
    }

    isLoggedIn() {
        // 本地服务总是登录状态
        return true;
    }

    getCurrentUser() {
        // 返回固定用户信息
        return {
            id: this.userId,
            username: 'default_user',
            email: 'user@calendar.local'
        };
    }

    // Exchange设置
    async getExchangeSettings(skipAuthCheck = false) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 获取Exchange设置');

            const response = await fetch(`${API_BASE}/settings/exchange`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const settings = await this.handleResponse(response);
            console.log('[本地设置服务] Exchange设置获取成功');
            return settings;
        } catch (error) {
            console.error('[本地设置服务] 获取Exchange设置失败:', error);
            return {
                email: '',
                password: '',
                ewsUrl: '',
                exchangeVersion: 'Exchange2013'
            };
        }
    }

    async saveExchangeSettings(settings) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 保存Exchange设置');

            const response = await fetch(`${API_BASE}/settings/exchange`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(settings)
            });

            await this.handleResponse(response);
            console.log('[本地设置服务] Exchange设置保存成功');
            return true;
        } catch (error) {
            console.error('[本地设置服务] 保存Exchange设置失败:', error);
            return false;
        }
    }

    // CalDAV设置
    async getCalDAVSettings(skipAuthCheck = false) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 获取CalDAV设置');

            const response = await fetch(`${API_BASE}/settings/caldav`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const settings = await this.handleResponse(response);
            console.log('[本地设置服务] CalDAV设置获取成功');
            return settings;
        } catch (error) {
            console.error('[本地设置服务] 获取CalDAV设置失败:', error);
            return {
                username: '',
                password: '',
                serverUrl: ''
            };
        }
    }

    async saveCalDAVSettings(settings) {
        try {
            console.log('[本地设置服务] 保存CalDAV设置');
            
            const response = await fetch(`${API_BASE}/settings/caldav`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(settings)
            });

            await this.handleResponse(response);
            console.log('[本地设置服务] CalDAV设置保存成功');
            return true;
        } catch (error) {
            console.error('[本地设置服务] 保存CalDAV设置失败:', error);
            return false;
        }
    }

    // IMAP设置
    async getIMAPSettings(skipAuthCheck = false) {
        try {
            // 刷新token
            this.loadToken();
            console.log('[本地设置服务] 获取IMAP设置');

            const response = await fetch(`${API_BASE}/settings/imap`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const settings = await this.handleResponse(response);
            console.log('[本地设置服务] IMAP设置获取成功');
            return settings;
        } catch (error) {
            console.error('[本地设置服务] 获取IMAP设置失败:', error);
            return {
                email: '',
                password: '',
                imapHost: '',
                imapPort: 993,
                useTLS: true
            };
        }
    }

    async saveIMAPSettings(settings) {
        try {
            console.log('[本地设置服务] 保存IMAP设置');
            
            const response = await fetch(`${API_BASE}/settings/imap`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(settings)
            });

            await this.handleResponse(response);
            console.log('[本地设置服务] IMAP设置保存成功');
            return true;
        } catch (error) {
            console.error('[本地设置服务] 保存IMAP设置失败:', error);
            return false;
        }
    }
}

// 创建并导出实例
const localSettingsService = new LocalSettingsService();
export default localSettingsService; 