/**
 * 智能日历本地设置服务
 * 直接操作共享设置文件夹中的JSON文件
 */

const fs = require('fs');
const path = require('path');

class LocalSettingsService {
    constructor() {
        // 使用与灵枢笔记相同的共享设置目录
        this.settingsBasePath = 'C:\\code\\unified-settings-service\\user-settings';
        this.defaultModelsPath = 'C:\\code\\unified-settings-service\\config\\default-models.json';
        this.localDataPath = path.join(__dirname, 'data');
        
        // 确保本地数据目录存在
        this.ensureDirectory(this.localDataPath);
        
        // 固定用户ID，与灵枢笔记保持一致
        this.defaultUserId = 'cmmc03v95m7xzqxwewhjt';
    }

    /**
     * 确保目录存在
     */
    ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 获取用户设置目录
     */
    getUserSettingsPath(userId = this.defaultUserId) {
        return path.join(this.settingsBasePath, userId);
    }

    /**
     * 确保用户设置目录存在
     */
    ensureUserDirectory(userId = this.defaultUserId) {
        const userPath = this.getUserSettingsPath(userId);
        this.ensureDirectory(userPath);
    }

    /**
     * 读取JSON文件
     */
    readJsonFile(filePath, defaultValue = null) {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return JSON.parse(content);
            }
            return defaultValue;
        } catch (error) {
            console.error(`[本地设置服务] 读取JSON文件失败: ${filePath}`, error);
            return defaultValue;
        }
    }

    /**
     * 写入JSON文件
     */
    writeJsonFile(filePath, data) {
        try {
            const dir = path.dirname(filePath);
            this.ensureDirectory(dir);
            
            const content = JSON.stringify(data, null, 2);
            fs.writeFileSync(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error(`[本地设置服务] 写入JSON文件失败: ${filePath}`, error);
            return false;
        }
    }

    /**
     * 获取当前选择的LLM提供商（应用本地设置）
     */
    getCurrentProvider() {
        const localSettingsPath = path.join(this.localDataPath, 'local-settings.json');
        const localSettings = this.readJsonFile(localSettingsPath, { current_provider: 'builtin' });
        return localSettings.current_provider || 'builtin';
    }

    /**
     * 设置当前选择的LLM提供商（应用本地设置）
     */
    setCurrentProvider(provider) {
        const localSettingsPath = path.join(this.localDataPath, 'local-settings.json');
        const localSettings = this.readJsonFile(localSettingsPath, {});
        localSettings.current_provider = provider;
        localSettings.updated_at = new Date().toISOString();
        return this.writeJsonFile(localSettingsPath, localSettings);
    }

    /**
     * 获取智能日历格式的LLM设置
     */
    getCalendarLLMSettings(userId = this.defaultUserId) {
        // 获取当前选择的提供商
        const currentProvider = this.getCurrentProvider();
        
        // 获取默认模型配置
        const defaultModels = this.getDefaultModels();
        
        if ((currentProvider === 'builtin' || currentProvider === 'builtin-free') && defaultModels?.builtin_free) {
            // 内置模型使用安全配置
            return {
                provider: 'builtin-free',
                api_key: 'BUILTIN_PROXY',
                base_url: 'BUILTIN_PROXY',
                model_name: defaultModels.builtin_free.model_name || 'deepseek/deepseek-chat-v3-0324:free',
                temperature: defaultModels.builtin_free.temperature || 0.7,
                max_tokens: defaultModels.builtin_free.max_tokens || 2000,
                use_custom_model: false
            };
        } else {
            // 其他提供商从共享配置读取
            const sharedSettings = this.getSharedLLMSettings(userId);
            const providerConfig = sharedSettings.providers[currentProvider];
            
            if (providerConfig) {
                const useCustom = providerConfig.use_custom_model || false;
                let modelToDisplay = '';
                
                if (useCustom) {
                    // 使用自定义模型时，优先使用custom_model，回退到model_name
                    modelToDisplay = providerConfig.custom_model || providerConfig.model_name || '';
                } else {
                    // 使用预定义模型时，优先使用predefined_model，回退到model_name
                    modelToDisplay = providerConfig.predefined_model || providerConfig.model_name || '';
                }
                
                return {
                    provider: currentProvider,
                    api_key: providerConfig.api_key || '',
                    base_url: providerConfig.base_url || '',
                    model_name: modelToDisplay,
                    temperature: providerConfig.temperature || 0.7,
                    max_tokens: providerConfig.max_tokens || 2000,
                    use_custom_model: useCustom
                };
            } else {
                // 如果没有配置，返回默认值
                return {
                    provider: currentProvider,
                    api_key: '',
                    base_url: '',
                    model_name: '',
                    temperature: 0.7,
                    max_tokens: 2000,
                    use_custom_model: false
                };
            }
        }
    }

    /**
     * 保存智能日历格式的LLM设置
     */
    saveCalendarLLMSettings(calendarSettings, userId = this.defaultUserId) {
        const provider = calendarSettings.provider;
        
        // 设置当前提供商
        this.setCurrentProvider(provider);
        
        // 如果不是内置模型，保存提供商配置到共享目录
        if (provider !== 'builtin' && provider !== 'builtin-free') {
            const useCustom = calendarSettings.use_custom_model || false;
            const providerConfig = {
                api_key: calendarSettings.api_key,
                base_url: calendarSettings.base_url,
                model_name: calendarSettings.model_name, // 保持兼容性，存储当前使用的模型
                predefined_model: useCustom ? '' : (calendarSettings.model_name || ''), // 预定义模型选择
                custom_model: useCustom ? (calendarSettings.model_name || '') : '',     // 自定义模型名称
                temperature: calendarSettings.temperature,
                max_tokens: calendarSettings.max_tokens,
                use_custom_model: useCustom
            };
            
            return this.saveLLMProviderSettings(provider, providerConfig, userId);
        }
        
        return true; // 内置模型不需要保存配置
    }

    /**
     * 获取共享LLM设置（不包含current_provider）
     */
    getSharedLLMSettings(userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const llmPath = path.join(this.getUserSettingsPath(userId), 'llm.json');
        
        const defaultSettings = {
            providers: {
                builtin: {
                    api_key: 'builtin-free-key',
                    model_name: 'builtin-free',
                    base_url: '',
                    description: '内置免费模型'
                }
            },
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(llmPath, defaultSettings);
    }

    /**
     * 保存LLM提供商设置到共享目录
     */
    saveLLMProviderSettings(provider, settings, userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const llmPath = path.join(this.getUserSettingsPath(userId), 'llm.json');
        
        // 读取现有配置
        const currentConfig = this.getSharedLLMSettings(userId);
        
        // 更新指定提供商的配置
        const updatedConfig = {
            providers: {
                ...currentConfig.providers,
                [provider]: {
                    ...settings,
                    updated_at: new Date().toISOString()
                }
            },
            updated_at: new Date().toISOString()
        };
        
        return this.writeJsonFile(llmPath, updatedConfig);
    }

    /**
     * 获取默认模型配置（安全版本，不包含真实API密钥）
     */
    getDefaultModels() {
        const config = this.readJsonFile(this.defaultModelsPath, {});
        
        // 为了安全，移除内置模型的真实API密钥
        if (config.builtin_free) {
            return {
                ...config,
                builtin_free: {
                    ...config.builtin_free,
                    api_key: 'BUILTIN_PROXY', // 使用占位符
                    base_url: 'BUILTIN_PROXY' // 使用占位符
                }
            };
        }
        
        return config;
    }

    // 兼容性方法 - 保持与原有unifiedSettingsClient相同的接口

    /**
     * 检查服务是否可用（本地服务总是可用）
     */
    async isAvailable() {
        return true;
    }

    /**
     * 获取全局LLM设置（兼容原接口）
     */
    async getGlobalLLMSettings() {
        try {
            return this.getCalendarLLMSettings();
        } catch (error) {
            console.error('[本地设置服务] 获取全局LLM设置失败:', error);
            return null;
        }
    }

    /**
     * 保存全局LLM设置（兼容原接口）
     */
    async saveGlobalLLMSettings(calendarSettings) {
        try {
            const result = this.saveCalendarLLMSettings(calendarSettings);
            if (result) {
                console.log('[本地设置服务] LLM设置保存成功');
                return true;
            } else {
                console.error('[本地设置服务] LLM设置保存失败');
                return false;
            }
        } catch (error) {
            console.error('[本地设置服务] 保存全局LLM设置失败:', error);
            return false;
        }
    }

    // === Exchange设置管理 ===

    /**
     * 获取Exchange设置
     */
    getExchangeSettings(userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const exchangePath = path.join(this.getUserSettingsPath(userId), 'exchange.json');
        
        const defaultSettings = {
            email: '',
            password: '',
            server: '',
            domain: '',
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(exchangePath, defaultSettings);
    }

    /**
     * 保存Exchange设置
     */
    saveExchangeSettings(settings, userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const exchangePath = path.join(this.getUserSettingsPath(userId), 'exchange.json');
        
        const settingsWithTimestamp = {
            ...settings,
            updated_at: new Date().toISOString()
        };
        
        return this.writeJsonFile(exchangePath, settingsWithTimestamp);
    }

    // === IMAP设置管理 ===

    /**
     * 获取IMAP设置
     */
    getImapSettings(userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const imapPath = path.join(this.getUserSettingsPath(userId), 'imap.json');
        
        const defaultSettings = {
            host: '',
            port: 993,
            user: '',
            password: '',
            tls: true,
            updated_at: new Date().toISOString()
        };
        
        const rawSettings = this.readJsonFile(imapPath, defaultSettings);
        
        // 兼容前端格式：如果存在前端字段名，则转换为后端格式
        if (rawSettings.email || rawSettings.imapHost) {
            return {
                user: rawSettings.email || rawSettings.user || '',
                host: rawSettings.imapHost || rawSettings.host || '',
                password: rawSettings.password || '',
                port: rawSettings.imapPort || rawSettings.port || 993,
                tls: rawSettings.useTLS !== undefined ? rawSettings.useTLS : (rawSettings.tls !== false),
                updated_at: rawSettings.updated_at || new Date().toISOString()
            };
        }
        
        return rawSettings;
    }

    /**
     * 保存IMAP设置
     */
    saveImapSettings(settings, userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const imapPath = path.join(this.getUserSettingsPath(userId), 'imap.json');
        
        const settingsWithTimestamp = {
            ...settings,
            updated_at: new Date().toISOString()
        };
        
        return this.writeJsonFile(imapPath, settingsWithTimestamp);
    }

    // === CalDAV设置管理 ===

    /**
     * 获取CalDAV设置
     */
    getCalDAVSettings(userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const caldavPath = path.join(this.getUserSettingsPath(userId), 'caldav.json');
        
        const defaultSettings = {
            url: '',
            username: '',
            password: '',
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(caldavPath, defaultSettings);
    }

    /**
     * 保存CalDAV设置
     */
    saveCalDAVSettings(settings, userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const caldavPath = path.join(this.getUserSettingsPath(userId), 'caldav.json');
        
        const settingsWithTimestamp = {
            ...settings,
            updated_at: new Date().toISOString()
        };
        
        return this.writeJsonFile(caldavPath, settingsWithTimestamp);
    }

    // === IMAP过滤设置管理 ===

    /**
     * 获取IMAP过滤设置
     */
    getImapFilterSettings(userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const filterPath = path.join(this.getUserSettingsPath(userId), 'imap-filter.json');
        
        const defaultSettings = {
            sender_allowlist: [],
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(filterPath, defaultSettings);
    }

    /**
     * 保存IMAP过滤设置
     */
    saveImapFilterSettings(settings, userId = this.defaultUserId) {
        this.ensureUserDirectory(userId);
        const filterPath = path.join(this.getUserSettingsPath(userId), 'imap-filter.json');
        
        const settingsWithTimestamp = {
            ...settings,
            updated_at: new Date().toISOString()
        };
        
        return this.writeJsonFile(filterPath, settingsWithTimestamp);
    }

    // === 兼容性方法 - 与settingsManager接口保持一致 ===

    /**
     * 获取所有设置（兼容settingsManager.getAllSettings）
     */
    async getAllSettings(userToken = null) {
        try {
            return {
                llm: this.getCalendarLLMSettings(),
                exchange: this.getExchangeSettings(),
                imap: this.getImapSettings(),
                caldav: this.getCalDAVSettings(),
                imapFilter: this.getImapFilterSettings()
            };
        } catch (error) {
            console.error('[本地设置服务] 获取所有设置失败:', error);
            throw error;
        }
    }

    /**
     * 检查统一服务是否可用（本地服务总是返回false）
     */
    async isUnifiedServiceAvailable() {
        return false; // 本地服务不依赖统一服务
    }

    /**
     * LLM设置兼容方法
     */
    async getLLMSettings(userToken = null) {
        return this.getCalendarLLMSettings();
    }

        /**
     * 获取用于内部API调用的真实LLM配置（包含真实API密钥）
     * 仅用于后端内部使用，不返回给前端
     */
    getInternalLLMSettings(userId = this.defaultUserId) {
        // 获取当前选择的提供商
        const currentProvider = this.getCurrentProvider();
        
        if (currentProvider === 'builtin' || currentProvider === 'builtin-free') {
            // 对于内置模型，强制从default-models.json读取真实配置
            // 绕过用户设置中的占位符配置
            try {
                console.log('[LocalSettingsService] 内置模型：强制从default-models.json读取真实配置');
                const config = this.readJsonFile(this.defaultModelsPath, {});
                if (config.builtin_free) {
                    console.log('[LocalSettingsService] 成功读取真实内置模型配置');
                    return {
                        provider: 'builtin-free',
                        api_key: config.builtin_free.api_key, // 真实API密钥，不使用用户设置中的占位符
                        base_url: config.builtin_free.base_url, // 真实base_url
                        model_name: config.builtin_free.model_name,
                        temperature: config.builtin_free.temperature || 0.7,
                        max_tokens: config.builtin_free.max_tokens || 2000
                    };
                } else {
                    console.error('[LocalSettingsService] default-models.json中未找到builtin_free配置');
                    return null;
                }
            } catch (error) {
                console.error('[LocalSettingsService] 读取default-models.json失败:', error);
                return null;
            }
        } else {
            // 其他提供商从用户设置中读取
            console.log('[LocalSettingsService] 非内置模型：从用户设置读取配置');
            const sharedSettings = this.getSharedLLMSettings(userId);
            const providerConfig = sharedSettings.providers[currentProvider];
            
            if (providerConfig) {
                return {
                    provider: currentProvider,
                    api_key: providerConfig.api_key || '',
                    base_url: providerConfig.base_url || '',
                    model_name: providerConfig.model_name || '',
                    temperature: providerConfig.temperature || 0.7,
                    max_tokens: providerConfig.max_tokens || 2000
                };
            } else {
                console.error('[LocalSettingsService] 在用户设置中未找到提供商配置:', currentProvider);
                return null;
            }
        }
    }

    async saveLLMSettings(settings, userToken = null) {
        return this.saveCalendarLLMSettings(settings);
    }
}

module.exports = new LocalSettingsService(); 