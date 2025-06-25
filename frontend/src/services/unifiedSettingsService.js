/**
 * 智能日历 - 统一设置服务客户端
 * 与统一设置服务API进行通信，与灵枢笔记保持LLM设置同步
 */

// 动态确定统一设置服务的API基础地址
const getUnifiedSettingsApiBase = () => {
  if (typeof window === 'undefined') {
    // 服务端环境，使用默认地址
    return 'http://localhost:3002/api';
  }
  
  // 检查是否在localhost环境
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // 本地开发环境，直接连接到统一设置服务
    return 'http://localhost:3002/api';
  } else {
    // 外网环境，使用nginx代理
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/unified-settings/api`;
  }
};

const API_BASE = getUnifiedSettingsApiBase();

class UnifiedSettingsService {
    constructor() {
        this.token = null;
        this.currentUser = null;
        this.lastVerifyTime = null; // 上次验证时间
        this.lastVerifyResult = null; // 上次验证结果
        this.loadToken();
    }

    // 从localStorage加载令牌和用户信息
    loadToken() {
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('calendar_unified_token');
            const userStr = localStorage.getItem('calendar_unified_user');
            if (userStr) {
                try {
                    this.currentUser = JSON.parse(userStr);
                } catch {
                    console.warn('解析用户信息失败');
                }
            }
        }
    }

    // 保存令牌到localStorage
    saveToken(token) {
        this.token = token;
        if (typeof window !== 'undefined') {
            localStorage.setItem('calendar_unified_token', token);
        }
    }

    // 保存用户信息
    saveUser(user) {
        this.currentUser = user;
        if (typeof window !== 'undefined') {
            localStorage.setItem('calendar_unified_user', JSON.stringify(user));
        }
    }

    // 清除令牌和用户信息
    clearToken() {
        this.token = null;
        this.currentUser = null;
        this.lastVerifyTime = null; // 重置验证缓存
        this.lastVerifyResult = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem('calendar_unified_token');
            localStorage.removeItem('calendar_unified_user');
        }
    }

    // 获取请求头
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        
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

    // 用户登录
    async login(credentials) {
        try {
            console.log('[统一设置服务] 用户登录');
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            
            const result = await this.handleResponse(response);
            
            if (result.accessToken) {
                this.saveToken(result.accessToken);
                this.saveUser(result.user);
                console.log('[统一设置服务] 用户登录成功');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[统一设置服务] 用户登录失败:', error);
            throw error;
        }
    }

    // 用户注册
    async register(userData) {
        try {
            console.log('[统一设置服务] 用户注册');
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            await this.handleResponse(response);
            console.log('[统一设置服务] 用户注册成功');
            return true;
        } catch (error) {
            console.error('[统一设置服务] 用户注册失败:', error);
            throw error;
        }
    }

    // 用户注销
    async logout() {
        try {
            if (this.token) {
                await fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: this.getAuthHeaders()
                });
            }
        } catch (error) {
            console.error('[统一设置服务] 注销请求失败:', error);
        } finally {
            this.clearToken();
            console.log('[统一设置服务] 用户已注销');
        }
    }

    // 确保用户已认证
    async ensureAuthenticated() {
        try {
            // 如果没有token，直接返回false
            if (!this.token) {
                console.log('[统一设置服务] 没有token，需要用户登录');
                return false;
            }

            // 添加简单的缓存机制，避免频繁验证
            const now = Date.now();
            if (this.lastVerifyTime && (now - this.lastVerifyTime) < 60000) { // 60秒内不重复验证
                return this.lastVerifyResult || false;
            }

            // 验证token
            const verification = await this.verifyToken();
            this.lastVerifyTime = now;
            this.lastVerifyResult = verification.valid;
            
            if (verification.valid) {
                return true;
            }

            // 如果token无效，返回false让用户登录
            console.log('[统一设置服务] Token无效，需要用户登录');
            return false;
        } catch (error) {
            console.error('[统一设置服务] 认证检查失败:', error);
            this.lastVerifyTime = Date.now();
            this.lastVerifyResult = false;
            return false;
        }
    }

    // 验证令牌
    async verifyToken() {
        try {
            if (!this.token) {
                return { valid: false };
            }

            const response = await fetch(`${API_BASE}/auth/verify`, {
                headers: this.getAuthHeaders()
            });
            
            return this.handleResponse(response);
        } catch (error) {
            console.error('[统一设置服务] 令牌验证失败:', error);
            this.clearToken();
            return { valid: false };
        }
    }

    // 检查服务是否可用
    async isAvailable() {
        try {
            const response = await fetch(`${API_BASE}/auth/verify`, {
                method: 'GET',
                timeout: 3000
            });
            return response.ok || response.status === 401;
        } catch {
            console.log('[统一设置服务] 服务不可用，使用本地存储');
            return false;
        }
    }

    // LLM设置管理
    async getLLMSettings(skipAuthCheck = false) {
        try {
            if (!skipAuthCheck && !await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/settings/global/llm_base`, {
                headers: this.getAuthHeaders()
            });
            
            const result = await this.handleResponse(response);
            console.log('[统一设置服务] 获取LLM设置成功');
            console.log('getLLMSettings 完整响应数据:', result);
            console.log('result.data.config_data:', result.data.config_data);
            return this.convertFromUnifiedFormat(result.data.config_data);
        } catch (error) {
            console.error('[统一设置服务] 获取LLM设置失败:', error);
            throw error;
        }
    }

    async saveLLMSettings(calendarSettings) {
        try {
            if (!await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const unifiedData = this.convertToUnifiedFormat(calendarSettings);

            const response = await fetch(`${API_BASE}/settings/global/llm_base`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(unifiedData)
            });
            
            await this.handleResponse(response);
            console.log('[统一设置服务] 保存LLM设置成功');
            return true;
        } catch (error) {
            console.error('[统一设置服务] 保存LLM设置失败:', error);
            return false;
        }
    }

    // Exchange设置管理 (智能日历专属)
    async getExchangeSettings(skipAuthCheck = false) {
        try {
            if (!skipAuthCheck && !await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/exchange`, {
                headers: this.getAuthHeaders()
            });
            
            const result = await this.handleResponse(response);
            console.log('[统一设置服务] 获取Exchange设置成功');
            return result; // 文件设置API直接返回数据，不需要config_data字段
        } catch (error) {
            console.error('[统一设置服务] 获取Exchange设置失败:', error);
            throw error;
        }
    }

    async saveExchangeSettings(exchangeSettings) {
        try {
            if (!await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/exchange`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(exchangeSettings)
            });
            
            await this.handleResponse(response);
            console.log('[统一设置服务] 保存Exchange设置成功');
            return true;
        } catch (error) {
            console.error('[统一设置服务] 保存Exchange设置失败:', error);
            return false;
        }
    }

    // CalDAV设置管理 (智能日历专属)
    async getCalDAVSettings(skipAuthCheck = false) {
        try {
            if (!skipAuthCheck && !await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/caldav`, {
                headers: this.getAuthHeaders()
            });
            
            const result = await this.handleResponse(response);
            console.log('[统一设置服务] 获取CalDAV设置成功');
            return result; // 文件设置API直接返回数据，不需要config_data字段
        } catch (error) {
            console.error('[统一设置服务] 获取CalDAV设置失败:', error);
            throw error;
        }
    }

    async saveCalDAVSettings(caldavSettings) {
        try {
            if (!await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/caldav`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(caldavSettings)
            });
            
            await this.handleResponse(response);
            console.log('[统一设置服务] 保存CalDAV设置成功');
            return true;
        } catch (error) {
            console.error('[统一设置服务] 保存CalDAV设置失败:', error);
            return false;
        }
    }

    // IMAP设置管理 (智能日历专属)
    async getIMAPSettings(skipAuthCheck = false) {
        try {
            if (!skipAuthCheck && !await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/imap`, {
                headers: this.getAuthHeaders()
            });
            
            const result = await this.handleResponse(response);
            console.log('[统一设置服务] 获取IMAP设置成功');
            return result; // 文件设置API直接返回数据，不需要config_data字段
        } catch (error) {
            console.error('[统一设置服务] 获取IMAP设置失败:', error);
            throw error;
        }
    }

    async saveIMAPSettings(imapSettings) {
        try {
            if (!await this.ensureAuthenticated()) {
                throw new Error('认证失败');
            }

            const response = await fetch(`${API_BASE}/file-settings/imap`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(imapSettings)
            });
            
            await this.handleResponse(response);
            console.log('[统一设置服务] 保存IMAP设置成功');
            return true;
        } catch (error) {
            console.error('[统一设置服务] 保存IMAP设置失败:', error);
            return false;
        }
    }

    // 格式转换：统一设置服务格式 -> 智能日历格式
    convertFromUnifiedFormat(unifiedData) {
        console.log('convertFromUnifiedFormat 接收到的数据:', unifiedData);
        if (!unifiedData) {
            console.log('unifiedData 为空，返回null');
            return null;
        }
        
        const result = {
            provider: unifiedData.provider || 'none',
            api_key: unifiedData.api_key || '',
            base_url: unifiedData.base_url || '',
            model_name: unifiedData.model_name || '',
            temperature: unifiedData.temperature || 0.7,
            max_tokens: unifiedData.max_tokens || 2000
        };
        
        // 保留多provider相关字段
        if (unifiedData._multi_provider) {
            result._multi_provider = unifiedData._multi_provider;
        }
        if (unifiedData._all_providers) {
            result._all_providers = unifiedData._all_providers;
            console.log('保留_all_providers数据:', unifiedData._all_providers);
        }
        
        console.log('convertFromUnifiedFormat 转换结果:', result);
        return result;
    }

    // 格式转换：智能日历格式 -> 统一设置服务格式
    convertToUnifiedFormat(calendarData) {
        return {
            provider: calendarData.provider || 'none',
            api_key: calendarData.api_key || '',
            base_url: calendarData.base_url || '',
            model_name: calendarData.model_name || '',
            temperature: calendarData.temperature || 0.7,
            max_tokens: calendarData.max_tokens || 2000
        };
    }

    // 检查是否已登录
    isLoggedIn() {
        return !!this.token;
    }

    // 获取当前用户信息
    getCurrentUser() {
        return this.currentUser;
    }
}

// 导出单例实例
const unifiedSettingsService = new UnifiedSettingsService();
export default unifiedSettingsService;