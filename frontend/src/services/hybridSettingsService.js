/**
 * 智能日历 - 混合设置服务
 * 认证功能使用统一设置服务，设置存储使用本地设置服务
 */

import unifiedSettingsService from './unifiedSettingsService';
import localSettingsService from './localSettingsService';

class HybridSettingsService {
    constructor() {
        this.authService = unifiedSettingsService;  // 认证使用统一设置服务
        this.settingsService = localSettingsService;  // 设置存储使用本地服务
    }

    // ==================== 认证相关方法 - 使用统一设置服务 ====================
    
    async login(credentials) {
        console.log('[混合设置服务] 使用统一设置服务进行登录');
        return await this.authService.login(credentials);
    }

    async register(userData) {
        console.log('[混合设置服务] 使用统一设置服务进行注册');
        return await this.authService.register(userData);
    }

    async logout() {
        console.log('[混合设置服务] 使用统一设置服务进行注销');
        return await this.authService.logout();
    }

    async ensureAuthenticated() {
        return await this.authService.ensureAuthenticated();
    }

    async verifyToken() {
        return await this.authService.verifyToken();
    }

    isLoggedIn() {
        return this.authService.isLoggedIn();
    }

    getCurrentUser() {
        return this.authService.getCurrentUser();
    }

    // ==================== 设置存储方法 - 使用本地设置服务 ====================
    
    async getLLMSettings(skipAuthCheck = false) {
        console.log('[混合设置服务] 使用本地设置服务获取LLM设置');

        // 如果不跳过认证检查，先确保用户已认证
        if (!skipAuthCheck) {
            const isAuthenticated = await this.ensureAuthenticated();
            if (!isAuthenticated) {
                throw new Error('用户未认证');
            }
        }

        return await this.settingsService.getLLMSettings(true); // 使用本地设置服务
    }

    async saveLLMSettings(settings) {
        console.log('[混合设置服务] 使用本地设置服务保存LLM设置');

        // 确保用户已认证
        const isAuthenticated = await this.ensureAuthenticated();
        if (!isAuthenticated) {
            throw new Error('用户未认证');
        }

        return await this.settingsService.saveLLMSettings(settings); // 使用本地设置服务
    }

    async getExchangeSettings(skipAuthCheck = false) {
        console.log('[混合设置服务] 使用本地设置服务获取Exchange设置');
        
        if (!skipAuthCheck) {
            const isAuthenticated = await this.ensureAuthenticated();
            if (!isAuthenticated) {
                throw new Error('用户未认证');
            }
        }
        
        return await this.settingsService.getExchangeSettings(true);
    }

    async saveExchangeSettings(settings) {
        console.log('[混合设置服务] 使用本地设置服务保存Exchange设置');
        
        const isAuthenticated = await this.ensureAuthenticated();
        if (!isAuthenticated) {
            throw new Error('用户未认证');
        }
        
        return await this.settingsService.saveExchangeSettings(settings);
    }

    async getCalDAVSettings(skipAuthCheck = false) {
        console.log('[混合设置服务] 使用本地设置服务获取CalDAV设置');
        
        if (!skipAuthCheck) {
            const isAuthenticated = await this.ensureAuthenticated();
            if (!isAuthenticated) {
                throw new Error('用户未认证');
            }
        }
        
        return await this.settingsService.getCalDAVSettings(true);
    }

    async saveCalDAVSettings(settings) {
        console.log('[混合设置服务] 使用本地设置服务保存CalDAV设置');
        
        const isAuthenticated = await this.ensureAuthenticated();
        if (!isAuthenticated) {
            throw new Error('用户未认证');
        }
        
        return await this.settingsService.saveCalDAVSettings(settings);
    }

    async getIMAPSettings(skipAuthCheck = false) {
        console.log('[混合设置服务] 使用本地设置服务获取IMAP设置');
        
        if (!skipAuthCheck) {
            const isAuthenticated = await this.ensureAuthenticated();
            if (!isAuthenticated) {
                throw new Error('用户未认证');
            }
        }
        
        return await this.settingsService.getIMAPSettings(true);
    }

    async saveIMAPSettings(settings) {
        console.log('[混合设置服务] 使用本地设置服务保存IMAP设置');
        
        const isAuthenticated = await this.ensureAuthenticated();
        if (!isAuthenticated) {
            throw new Error('用户未认证');
        }
        
        return await this.settingsService.saveIMAPSettings(settings);
    }

    // ==================== 兼容性方法 ====================
    
    // 检查服务可用性（检查两个服务）
    async isAvailable() {
        const authAvailable = await this.authService.isAvailable();
        const settingsAvailable = await this.settingsService.isAvailable();
        
        console.log('[混合设置服务] 服务状态:', { 
            auth: authAvailable, 
            settings: settingsAvailable 
        });
        
        return authAvailable && settingsAvailable;
    }
}

const hybridSettingsService = new HybridSettingsService();
export default hybridSettingsService; 