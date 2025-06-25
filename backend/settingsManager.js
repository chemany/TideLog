/**
 * 智能日历设置管理器
 * 统一管理各种设置，与统一设置服务集成
 */

const fetch = require('node-fetch');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// 导入本地存储函数
const {
    loadLLMSettings, saveLLMSettings,
    loadExchangeSettings, saveExchangeSettings,
    loadImapSettings, saveImapSettings,
    loadCalDAVSettings, saveCalDAVSettings,
    loadImapFilterSettings, saveImapFilterSettings
} = require('./storage');

class SettingsManager {
    constructor() {
        this.unifiedSettingsURL = process.env.UNIFIED_SETTINGS_URL || 'http://localhost:3002/api';
        this.baseURL = 'http://localhost:3002';
        
        // 系统用户配置（用于全局设置）
        this.systemUser = {
            email: 'system@calendar.local',
            password: 'default-system-password'
        };

        // 缓存配置
        this.cache = {
            llmConfig: { data: null, userId: null, lastUpdated: null, ttl: 5 * 60 * 1000 }, // 5分钟
            exchangeConfig: { data: null, userId: null, lastUpdated: null, ttl: 10 * 60 * 1000 }, // 10分钟
            imapConfig: { data: null, userId: null, lastUpdated: null, ttl: 10 * 60 * 1000 },
            caldavConfig: { data: null, userId: null, lastUpdated: null, ttl: 10 * 60 * 1000 },
            imapFilterConfig: { data: null, userId: null, lastUpdated: null, ttl: 10 * 60 * 1000 }
        };
    }

    /**
     * 检查统一设置服务是否可用
     */
    async isUnifiedServiceAvailable() {
        try {
            const response = await fetch(`${this.baseURL}/health`, { timeout: 3000 });
            const isHealthy = response.ok;
            console.log(`[设置管理器] 统一设置服务健康检查: ${isHealthy ? '可用' : '不可用'}`);
            return isHealthy;
        } catch (error) {
            console.log('[设置管理器] 统一设置服务连接失败，使用本地存储:', error.message);
            return false;
        }
    }    /**
     * 获取系统用户的认证令牌
     */
    async getSystemToken() {
        try {
            const response = await fetch(`${this.unifiedSettingsURL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.systemUser)
            });

            if (!response.ok) {
                throw new Error(`系统登录失败: ${response.status}`);
            }

            const result = await response.json();
            return result.accessToken;
        } catch (error) {
            console.error('[设置管理器] 获取系统令牌失败:', error);
            return null;
        }
    }

    /**
     * 验证用户令牌
     */
    async verifyUserToken(token) {
        try {
            const response = await axios.get(`${this.baseURL}/api/auth/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return { valid: true, user: response.data.user };
        } catch (error) {
            return { valid: false, error: error.response?.data?.message || '令牌验证失败' };
        }
    }

    /**
     * 缓存辅助方法
     */
    isCacheValid(cacheKey, userId = null) {
        const cache = this.cache[cacheKey];
        if (!cache.data || cache.lastUpdated === null) return false;
        if (userId && cache.userId !== userId) return false;
        return (Date.now() - cache.lastUpdated) < cache.ttl;
    }    setCache(cacheKey, data, userId = null) {
        this.cache[cacheKey] = {
            data: data,
            userId: userId,
            lastUpdated: Date.now(),
            ttl: this.cache[cacheKey].ttl
        };
    }

    clearCache(cacheKey = null, userId = null) {
        if (cacheKey) {
            if (!userId || this.cache[cacheKey].userId === userId) {
                this.cache[cacheKey] = { 
                    data: null, 
                    userId: null, 
                    lastUpdated: null, 
                    ttl: this.cache[cacheKey].ttl 
                };
            }
        } else {
            // 清理所有缓存
            Object.keys(this.cache).forEach(key => {
                if (!userId || this.cache[key].userId === userId) {
                    this.cache[key] = { 
                        data: null, 
                        userId: null, 
                        lastUpdated: null, 
                        ttl: this.cache[key].ttl 
                    };
                }
            });
        }
    }

    /**
     * LLM设置管理
     */
    async getLLMSettings(userToken = null) {
        const cacheKey = 'llmConfig';
        const userId = userToken ? 'user' : 'system';

        // 检查缓存
        if (this.isCacheValid(cacheKey, userId)) {
            console.log('[设置管理器] 从缓存获取LLM设置');
            return this.cache[cacheKey].data;
        }        try {
            let settings = null;

            if (await this.isUnifiedServiceAvailable()) {
                if (userToken) {
                    // 获取用户LLM设置
                    const response = await fetch(`${this.baseURL}/api/file-settings/llm`, {
                        headers: { 'Authorization': `Bearer ${userToken}` }
                    });

                    if (response.ok) {
                        settings = await response.json();
                        console.log('[设置管理器] 从统一服务获取用户LLM设置');
                    } else if (response.status === 404) {
                        // 用户无设置，获取默认配置
                        const defaultResponse = await fetch(`${this.baseURL}/api/file-settings/default-models`);
                        if (defaultResponse.ok) {
                            const defaultData = await defaultResponse.json();
                            settings = this.convertDefaultToLLMFormat(defaultData);
                            console.log('[设置管理器] 使用默认LLM配置');
                        }
                    }
                } else {
                    // 获取系统全局LLM设置
                    const token = await this.getSystemToken();
                    if (token) {
                        const response = await fetch(`${this.unifiedSettingsURL}/settings/global/llm_base`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (response.ok) {
                            const result = await response.json();
                            settings = this.convertFromUnifiedFormat(result.config_data);
                            console.log('[设置管理器] 从统一服务获取全局LLM设置');
                        }
                    }
                }
            }

            // 回退到本地存储
            if (!settings) {
                settings = await loadLLMSettings();
                console.log('[设置管理器] 从本地文件获取LLM设置');
            }

            // 缓存结果
            this.setCache(cacheKey, settings, userId);
            return settings;        } catch (error) {
            console.error('[设置管理器] 获取LLM设置失败:', error);
            // 回退到本地存储
            const settings = await loadLLMSettings();
            this.setCache(cacheKey, settings, userId);
            return settings;
        }
    }

    async saveLLMSettings(settings, userToken = null) {
        const cacheKey = 'llmConfig';
        const userId = userToken ? 'user' : 'system';

        try {
            // 获取真实的用户ID（从token中解析）
            let realUserId = null;
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                }
            }
            
            // 保存到本地文件（确保可靠性）
            await saveLLMSettings(settings, realUserId);
            console.log(`[设置管理器] LLM设置本地保存成功 (用户ID: ${realUserId || '全局'})`);

            // 同步到统一设置服务
            if (await this.isUnifiedServiceAvailable()) {
                if (userToken) {
                    // 保存用户LLM设置
                    const response = await fetch(`${this.baseURL}/api/file-settings/llm`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${userToken}`
                        },
                        body: JSON.stringify(settings)
                    });

                    if (response.ok) {
                        console.log('[设置管理器] 用户LLM设置统一服务同步成功');
                    } else {
                        const errorText = await response.text();
                        console.warn(`[设置管理器] 用户LLM设置统一服务同步失败: ${response.status} - ${errorText}`);
                    }
                } else {
                    // 保存系统全局LLM设置
                    const token = await this.getSystemToken();
                    if (token) {
                        const unifiedData = this.convertToUnifiedFormat(settings);
                        const response = await fetch(`${this.unifiedSettingsURL}/settings/global/llm_base`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(unifiedData)
                        });

                        if (response.ok) {
                            console.log('[设置管理器] 全局LLM设置统一服务同步成功');
                        } else {
                            console.warn('[设置管理器] 全局LLM设置统一服务同步失败');
                        }
                    }
                }
            }            // 更新缓存
            this.setCache(cacheKey, settings, userId);
            return true;

        } catch (error) {
            console.error('[设置管理器] 保存LLM设置失败:', error);
            return false;
        }
    }

    /**
     * Exchange设置管理
     */
    async getExchangeSettings(userToken = null) {
        const cacheKey = 'exchangeConfig';
        const userId = userToken ? 'user' : 'system';

        if (this.isCacheValid(cacheKey, userId)) {
            return this.cache[cacheKey].data;
        }

        try {
            let settings = null;

            if (await this.isUnifiedServiceAvailable() && userToken) {
                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                if (response.ok) {
                    const calendarSettings = await response.json();
                    settings = calendarSettings.exchange || {};
                    console.log('[设置管理器] 从统一服务获取Exchange设置');
                }
            }

            if (!settings) {
                settings = await loadExchangeSettings();
                console.log('[设置管理器] 从本地文件获取Exchange设置');
            }

            this.setCache(cacheKey, settings, userId);
            return settings;

        } catch (error) {
            console.error('[设置管理器] 获取Exchange设置失败:', error);
            const settings = await loadExchangeSettings();
            this.setCache(cacheKey, settings, userId);
            return settings;
        }
    }    async saveExchangeSettings(settings, userToken = null) {
        const cacheKey = 'exchangeConfig';
        const userId = userToken ? 'user' : 'system';

        try {
            // 获取真实的用户ID（从token中解析）
            let realUserId = null;
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                }
            }
            
            await saveExchangeSettings(settings, realUserId);
            console.log(`[设置管理器] Exchange设置本地保存成功 (用户ID: ${realUserId || '全局'})`);

            if (await this.isUnifiedServiceAvailable() && userToken) {
                // 获取当前日历设置
                const currentResponse = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                let calendarSettings = {};
                if (currentResponse.ok) {
                    calendarSettings = await currentResponse.json();
                }

                // 更新Exchange部分
                calendarSettings.exchange = settings;

                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify(calendarSettings)
                });

                if (response.ok) {
                    console.log('[设置管理器] Exchange设置统一服务同步成功');
                }
            }

            this.setCache(cacheKey, settings, userId);
            return true;

        } catch (error) {
            console.error('[设置管理器] 保存Exchange设置失败:', error);
            return false;
        }
    }    /**
     * IMAP设置管理
     */
    async getImapSettings(userToken = null) {
        const cacheKey = 'imapConfig';
        const userId = userToken ? 'user' : 'system';

        if (this.isCacheValid(cacheKey, userId)) {
            return this.cache[cacheKey].data;
        }

        try {
            let settings = null;
            let realUserId = null;

            // 获取真实的用户ID
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                    console.log(`[设置管理器] 获取用户 ${realUserId} 的IMAP设置`);
                }
            }

            if (await this.isUnifiedServiceAvailable() && userToken) {
                try {
                    // 直接从文件获取IMAP设置，而不是从calendar设置中获取
                    const response = await fetch(`${this.baseURL}/api/file-settings/imap`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                if (response.ok) {
                        settings = await response.json();
                        console.log('[设置管理器] 从统一服务获取IMAP设置:', {
                            email: settings.email,
                            imapHost: settings.imapHost,
                            hasPassword: !!settings.password
                        });
                    } else {
                        console.warn(`[设置管理器] 统一服务返回错误: ${response.status}, 回退到本地文件`);
                    }
                } catch (fetchError) {
                    console.warn('[设置管理器] 统一服务请求失败，回退到本地文件:', fetchError.message);
                }
            }

            if (!settings) {
                // 传递真实用户ID到loadImapSettings函数
                settings = await loadImapSettings(realUserId);
                console.log(`[设置管理器] 从本地文件获取IMAP设置 (用户ID: ${realUserId || '全局'})`);
            }

            this.setCache(cacheKey, settings, userId);
            return settings;

        } catch (error) {
            console.error('[设置管理器] 获取IMAP设置失败:', error);
            // 回退时也要传递用户ID
            let realUserId = null;
            if (userToken) {
                try {
                    const verifyResult = await this.verifyUserToken(userToken);
                    if (verifyResult.valid) {
                        realUserId = verifyResult.user.id;
                    }
                } catch (e) {
                    console.warn('[设置管理器] 无法获取用户ID，使用全局设置');
                }
            }
            const settings = await loadImapSettings(realUserId);
            this.setCache(cacheKey, settings, userId);
            return settings;
        }
    }    async saveImapSettings(settings, userToken = null) {
        const cacheKey = 'imapConfig';
        const userId = userToken ? 'user' : 'system';

        try {
            // 获取真实的用户ID（从token中解析）
            let realUserId = null;
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                }
            }
            
            await saveImapSettings(settings, realUserId);
            console.log(`[设置管理器] IMAP设置本地保存成功 (用户ID: ${realUserId || '全局'})`);

            if (await this.isUnifiedServiceAvailable() && userToken) {
                // 直接保存IMAP设置到独立文件
                const response = await fetch(`${this.baseURL}/api/file-settings/imap`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify(settings)
                });

                if (response.ok) {
                    console.log('[设置管理器] IMAP设置统一服务同步成功');
                } else {
                    const errorText = await response.text();
                    console.warn(`[设置管理器] IMAP设置统一服务同步失败: ${response.status} - ${errorText}`);
                }
            }

            this.setCache(cacheKey, settings, userId);
            return true;

        } catch (error) {
            console.error('[设置管理器] 保存IMAP设置失败:', error);
            return false;
        }
    }    /**
     * CalDAV设置管理
     */
    async getCalDAVSettings(userToken = null) {
        const cacheKey = 'caldavConfig';
        const userId = userToken ? 'user' : 'system';

        if (this.isCacheValid(cacheKey, userId)) {
            return this.cache[cacheKey].data;
        }

        try {
            let settings = null;

            if (await this.isUnifiedServiceAvailable() && userToken) {
                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                if (response.ok) {
                    const calendarSettings = await response.json();
                    settings = calendarSettings.caldav || {};
                    console.log('[设置管理器] 从统一服务获取CalDAV设置');
                }
            }

            if (!settings) {
                settings = await loadCalDAVSettings();
                console.log('[设置管理器] 从本地文件获取CalDAV设置');
            }

            this.setCache(cacheKey, settings, userId);
            return settings;

        } catch (error) {
            console.error('[设置管理器] 获取CalDAV设置失败:', error);
            const settings = await loadCalDAVSettings();
            this.setCache(cacheKey, settings, userId);
            return settings;
        }
    }    async saveCalDAVSettings(settings, userToken = null) {
        const cacheKey = 'caldavConfig';
        const userId = userToken ? 'user' : 'system';

        try {
            // 获取真实的用户ID（从token中解析）
            let realUserId = null;
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                }
            }
            
            await saveCalDAVSettings(settings, realUserId);
            console.log(`[设置管理器] CalDAV设置本地保存成功 (用户ID: ${realUserId || '全局'})`);

            if (await this.isUnifiedServiceAvailable() && userToken) {
                const currentResponse = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                let calendarSettings = {};
                if (currentResponse.ok) {
                    calendarSettings = await currentResponse.json();
                }

                calendarSettings.caldav = settings;

                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify(calendarSettings)
                });

                if (response.ok) {
                    console.log('[设置管理器] CalDAV设置统一服务同步成功');
                }
            }

            this.setCache(cacheKey, settings, userId);
            return true;

        } catch (error) {
            console.error('[设置管理器] 保存CalDAV设置失败:', error);
            return false;
        }
    }    /**
     * IMAP过滤设置管理
     */
    async getImapFilterSettings(userToken = null) {
        const cacheKey = 'imapFilterConfig';
        const userId = userToken ? 'user' : 'system';

        if (this.isCacheValid(cacheKey, userId)) {
            return this.cache[cacheKey].data;
        }

        try {
            let settings = null;

            if (await this.isUnifiedServiceAvailable() && userToken) {
                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                if (response.ok) {
                    const calendarSettings = await response.json();
                    settings = calendarSettings.imapFilter || { sender_allowlist: [] };
                    console.log('[设置管理器] 从统一服务获取IMAP过滤设置');
                }
            }

            if (!settings) {
                settings = loadImapFilterSettings(); // 注意：这是同步函数
                console.log('[设置管理器] 从本地文件获取IMAP过滤设置');
            }

            this.setCache(cacheKey, settings, userId);
            return settings;

        } catch (error) {
            console.error('[设置管理器] 获取IMAP过滤设置失败:', error);
            const settings = loadImapFilterSettings();
            this.setCache(cacheKey, settings, userId);
            return settings;
        }
    }    async saveImapFilterSettings(settings, userToken = null) {
        const cacheKey = 'imapFilterConfig';
        const userId = userToken ? 'user' : 'system';

        try {
            // 获取真实的用户ID（从token中解析）
            let realUserId = null;
            if (userToken) {
                const verifyResult = await this.verifyUserToken(userToken);
                if (verifyResult.valid) {
                    realUserId = verifyResult.user.id;
                }
            }
            
            saveImapFilterSettings(settings, realUserId); // 注意：这是同步函数
            console.log(`[设置管理器] IMAP过滤设置本地保存成功 (用户ID: ${realUserId || '全局'})`);

            if (await this.isUnifiedServiceAvailable() && userToken) {
                const currentResponse = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    headers: { 'Authorization': `Bearer ${userToken}` }
                });

                let calendarSettings = {};
                if (currentResponse.ok) {
                    calendarSettings = await currentResponse.json();
                }

                calendarSettings.imapFilter = settings;

                const response = await fetch(`${this.baseURL}/api/file-settings/calendar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify(calendarSettings)
                });

                if (response.ok) {
                    console.log('[设置管理器] IMAP过滤设置统一服务同步成功');
                }
            }

            this.setCache(cacheKey, settings, userId);
            return true;

        } catch (error) {
            console.error('[设置管理器] 保存IMAP过滤设置失败:', error);
            return false;
        }
    }    /**
     * 格式转换方法
     */
    convertFromUnifiedFormat(unifiedData) {
        return {
            provider: unifiedData.provider || 'builtin-free',
            api_key: unifiedData.api_key || 'not-needed',
            base_url: unifiedData.base_url || null,
            model_name: unifiedData.model || 'builtin-free',
            temperature: unifiedData.temperature || 0.7,
            max_tokens: unifiedData.max_tokens || 2000
        };
    }

    convertToUnifiedFormat(calendarData) {
        return {
            provider: calendarData.provider || 'builtin-free',
            api_key: calendarData.api_key || 'not-needed',
            base_url: calendarData.base_url || null,
            model: calendarData.model_name || 'builtin-free',
            temperature: calendarData.temperature || 0.7,
            max_tokens: calendarData.max_tokens || 2000
        };
    }

    convertDefaultToLLMFormat(defaultData) {
        if (defaultData.freeModels && defaultData.freeModels.length > 0) {
            const freeModel = defaultData.freeModels[0];
            return {
                provider: 'builtin-free',
                api_key: 'not-needed',
                base_url: null,
                model_name: freeModel.model_name || 'builtin-free',
                temperature: 0.7,
                max_tokens: 2000
            };
        }
        
        return {
            provider: 'builtin-free',
            api_key: 'not-needed',
            base_url: null,
            model_name: 'builtin-free',
            temperature: 0.7,
            max_tokens: 2000
        };
    }    /**
     * 批量操作
     */
    async getAllSettings(userToken = null) {
        return {
            llm: await this.getLLMSettings(userToken),
            exchange: await this.getExchangeSettings(userToken),
            imap: await this.getImapSettings(userToken),
            caldav: await this.getCalDAVSettings(userToken),
            imapFilter: await this.getImapFilterSettings(userToken)
        };
    }

    async clearAllCache(userId = null) {
        this.clearCache(null, userId);
        console.log(`[设置管理器] 已清理所有缓存 (用户: ${userId || 'all'})`);
    }
}

module.exports = new SettingsManager();