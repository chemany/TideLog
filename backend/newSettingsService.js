/**
 * 新的设置服务
 * 使用新的用户数据服务管理用户设置
 */

const userDataService = require('./userDataService');

class NewSettingsService {
    constructor() {
        console.log('[NewSettingsService] 初始化新的设置服务');
    }

    /**
     * 获取CalDAV设置
     */
    async getCalDAVSettings(userId, userInfo = null) {
        try {
            console.log(`[NewSettingsService] 开始获取CalDAV设置 - userId: ${userId}`);
            const settings = await userDataService.getUserSettingsByType(userId, 'caldav', userInfo);
            console.log(`[NewSettingsService] 获取CalDAV设置结果 - userId: ${userId}`, settings);
            return settings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取CalDAV设置失败 - userId: ${userId}`, error);
            return {
                username: '',
                password: '',
                serverUrl: '',
                updated_at: new Date().toISOString()
            };
        }
    }

    /**
     * 保存CalDAV设置
     */
    async saveCalDAVSettings(settings, userId, userInfo = null) {
        try {
            await userDataService.saveUserSettingsByType(userId, 'caldav', settings, userInfo);
            console.log(`[NewSettingsService] 保存CalDAV设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存CalDAV设置失败 - userId: ${userId}`, error);
            return false;
        }
    }

    /**
     * 保存IMAP设置
     */
    async saveImapSettings(settings, userId, userInfo = null) {
        try {
            // 转换前端格式到后端格式
            const backendSettings = {
                user: settings.email,
                host: settings.imapHost,
                password: settings.password,
                port: settings.imapPort || 993,
                tls: settings.useTLS !== false
            };

            await userDataService.saveUserSettingsByType(userId, 'imap', backendSettings, userInfo);
            console.log(`[NewSettingsService] 保存IMAP设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存IMAP设置失败 - userId: ${userId}`, error);
            throw error;
        }
    }

    /**
     * 获取IMAP过滤器设置
     */
    async getImapFilterSettings(userId, userInfo = null) {
        try {
            const settings = await userDataService.getUserSettingsByType(userId, 'imap_filter', userInfo);
            console.log(`[NewSettingsService] 获取IMAP过滤器设置成功 - userId: ${userId}`);
            return settings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取IMAP过滤器设置失败 - userId: ${userId}`, error);
            throw error;
        }
    }

    /**
     * 保存IMAP过滤器设置
     */
    async saveImapFilterSettings(settings, userId, userInfo = null) {
        try {
            await userDataService.saveUserSettingsByType(userId, 'imap_filter', settings, userInfo);
            console.log(`[NewSettingsService] 保存IMAP过滤器设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存IMAP过滤器设置失败 - userId: ${userId}`, error);
            throw error;
        }
    }

    /**
     * 获取IMAP设置
     */
    async getImapSettings(userId, userInfo = null) {
        try {
            const settings = await userDataService.getUserSettingsByType(userId, 'imap', userInfo);
            console.log(`[NewSettingsService] 获取IMAP设置 - userId: ${userId}`, settings);
            return settings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取IMAP设置失败 - userId: ${userId}`, error);
            return {
                user: '',
                host: '',
                password: '',
                port: 993,
                tls: true,
                updated_at: new Date().toISOString()
            };
        }
    }

    /**
     * 获取Exchange设置
     */
    async getExchangeSettings(userId, userInfo = null) {
        try {
            const settings = await userDataService.getUserSettingsByType(userId, 'exchange', userInfo);
            console.log(`[NewSettingsService] 获取Exchange设置 - userId: ${userId}`, settings);
            return settings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取Exchange设置失败 - userId: ${userId}`, error);
            return {
                email: '',
                password: '',
                ewsUrl: '',
                exchangeVersion: 'Exchange2013',
                updated_at: new Date().toISOString()
            };
        }
    }

    /**
     * 保存Exchange设置
     */
    async saveExchangeSettings(settings, userId) {
        try {
            await userDataService.saveUserSettingsByType(userId, 'exchange', settings);
            console.log(`[NewSettingsService] 保存Exchange设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存Exchange设置失败 - userId: ${userId}`, error);
            return false;
        }
    }

    /**
     * 获取IMAP过滤设置
     */
    async getImapFilterSettings(userId) {
        try {
            const settings = await userDataService.getUserSettingsByType(userId, 'imap_filter');
            console.log(`[NewSettingsService] 获取IMAP过滤设置 - userId: ${userId}`, settings);
            return settings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取IMAP过滤设置失败 - userId: ${userId}`, error);
            return {
                sender_allowlist: [],
                updated_at: new Date().toISOString()
            };
        }
    }

    /**
     * 保存IMAP过滤设置
     */
    async saveImapFilterSettings(settings, userId) {
        try {
            await userDataService.saveUserSettingsByType(userId, 'imap_filter', settings);
            console.log(`[NewSettingsService] 保存IMAP过滤设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存IMAP过滤设置失败 - userId: ${userId}`, error);
            return false;
        }
    }

    /**
     * 获取LLM设置
     */
    async getLLMSettings(userId) {
        try {
            const settings = await userDataService.getUserSettingsByType(userId, 'llm');
            console.log(`[NewSettingsService] 获取LLM设置 - userId: ${userId}`, settings);

            // 处理USE_DEFAULT_CONFIG标记
            const processedSettings = this.processLLMSettings(settings);
            console.log(`[NewSettingsService] 处理后的LLM设置 - userId: ${userId}`, processedSettings);

            return processedSettings;
        } catch (error) {
            console.error(`[NewSettingsService] 获取LLM设置失败 - userId: ${userId}`, error);
            return {
                provider: 'builtin-free',
                model: 'deepseek/deepseek-chat-v3-0324:free',
                updated_at: new Date().toISOString()
            };
        }
    }

    /**
     * 处理LLM设置中的USE_DEFAULT_CONFIG标记
     * @param {object} llmSettings 原始LLM设置
     */
    processLLMSettings(llmSettings) {
        console.log(`[NewSettingsService] 开始处理LLM设置:`, llmSettings);

        // 如果provider是builtin且其他字段是USE_DEFAULT_CONFIG，则从默认配置读取
        if (llmSettings.provider === 'builtin' &&
            (llmSettings.model === 'USE_DEFAULT_CONFIG' ||
             llmSettings.api_key === 'USE_DEFAULT_CONFIG' ||
             llmSettings.base_url === 'USE_DEFAULT_CONFIG')) {

            console.log(`[NewSettingsService] 检测到USE_DEFAULT_CONFIG标记，从默认配置读取`);

            // 获取默认模型配置
            const defaultModels = this.getDefaultModels();
            console.log(`[NewSettingsService] 默认模型配置:`, defaultModels);

            if (defaultModels?.builtin_free) {
                const processedSettings = {
                    provider: 'builtin-free',
                    model: defaultModels.builtin_free.model_name || 'deepseek/deepseek-chat-v3-0324:free',
                    api_key: 'BUILTIN_PROXY', // 前端显示用占位符
                    base_url: 'BUILTIN_PROXY', // 前端显示用占位符
                    temperature: defaultModels.builtin_free.temperature || 0.7,
                    max_tokens: defaultModels.builtin_free.max_tokens || 2000,
                    updated_at: llmSettings.updated_at || new Date().toISOString()
                };

                console.log(`[NewSettingsService] 处理后的内置模型设置:`, processedSettings);
                return processedSettings;
            }
        }

        // 如果不是USE_DEFAULT_CONFIG或者没有默认配置，直接返回原设置
        const directSettings = {
            provider: llmSettings.provider || 'builtin-free',
            model: llmSettings.model || 'deepseek/deepseek-chat-v3-0324:free',
            api_key: llmSettings.api_key || 'BUILTIN_PROXY',
            base_url: llmSettings.base_url || 'BUILTIN_PROXY',
            temperature: llmSettings.temperature || 0.7,
            max_tokens: llmSettings.max_tokens || 2000,
            updated_at: llmSettings.updated_at || new Date().toISOString()
        };

        console.log(`[NewSettingsService] 直接返回的设置:`, directSettings);
        return directSettings;
    }

    /**
     * 获取默认模型配置
     */
    getDefaultModels() {
        const fs = require('fs');
        const path = require('path');
        const defaultModelsPath = 'C:\\code\\unified-settings-service\\config\\default-models.json';

        try {
            if (fs.existsSync(defaultModelsPath)) {
                const content = fs.readFileSync(defaultModelsPath, 'utf-8');
                const config = JSON.parse(content);
                console.log(`[NewSettingsService] 读取默认模型配置成功`);
                return config;
            }
        } catch (error) {
            console.error(`[NewSettingsService] 读取默认模型配置失败:`, error);
        }

        return {};
    }

    /**
     * 保存LLM设置
     */
    async saveLLMSettings(settings, userId, userInfo = null) {
        try {
            await userDataService.saveUserSettingsByType(userId, 'llm', settings, userInfo);
            console.log(`[NewSettingsService] 保存LLM设置成功 - userId: ${userId}`);
            return true;
        } catch (error) {
            console.error(`[NewSettingsService] 保存LLM设置失败 - userId: ${userId}`, error);
            return false;
        }
    }

    /**
     * 获取所有用户列表（用于管理）
     */
    async getAllUsers() {
        try {
            const users = await userDataService.getAllUsers();
            console.log(`[NewSettingsService] 获取所有用户列表: ${users.length} 个用户`);
            return users;
        } catch (error) {
            console.error(`[NewSettingsService] 获取用户列表失败`, error);
            return [];
        }
    }

    /**
     * 获取用户信息
     */
    async getUserInfo(userId) {
        try {
            const settings = await userDataService.getUserSettings(userId);
            return settings.user_info || {};
        } catch (error) {
            console.error(`[NewSettingsService] 获取用户信息失败 - userId: ${userId}`, error);
            return {};
        }
    }

    /**
     * 检查统一设置服务是否可用
     */
    async isUnifiedServiceAvailable() {
        // 新的用户数据服务总是可用的
        return true;
    }
}

module.exports = new NewSettingsService();