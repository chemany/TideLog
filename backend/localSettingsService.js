/**
 * 智能日历本地设置服务
 * 直接操作共享设置文件夹中的JSON文件
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalSettingsService {
    constructor() {
        // 跨平台路径配置
        this.projectRoot = this.findProjectRoot();
        this.settingsBasePath = path.join(this.projectRoot, 'unified-settings-service', 'user-settings');
        this.defaultModelsPath = path.join(this.projectRoot, 'unified-settings-service', 'config', 'default-models.json');
        this.localDataPath = path.join(__dirname, 'data');

        console.log(`[TideLog LocalSettings] 平台: ${os.platform()}`);
        console.log(`[TideLog LocalSettings] 项目根目录: ${this.projectRoot}`);
        console.log(`[TideLog LocalSettings] 设置基础路径: ${this.settingsBasePath}`);

        // 确保本地数据目录存在
        this.ensureDirectory(this.localDataPath);
    }

    /**
     * 查找项目根目录
     */
    findProjectRoot() {
        let currentDir = __dirname;
        const maxDepth = 10;
        let depth = 0;

        while (depth < maxDepth) {
            const indicators = ['unified-settings-service', 'NeuraLink-Notes', 'TideLog'];
            const hasIndicator = indicators.some(indicator =>
                fs.existsSync(path.join(currentDir, indicator))
            );

            if (hasIndicator) {
                return currentDir;
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
            depth++;
        }

        // 回退方案
        const envRoot = process.env.PROJECT_ROOT;
        if (envRoot && fs.existsSync(envRoot)) {
            return envRoot;
        }

        return os.platform() === 'win32' ? 'C:\\code' : path.join(os.homedir(), 'code');
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
     * @param {string} userId 用户ID，必须提供
     */
    getUserSettingsPath(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
        return path.join(this.settingsBasePath, userId);
    }

    /**
     * 确保用户设置目录存在
     * @param {string} userId 用户ID，必须提供
     */
    ensureUserDirectory(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }

        // 检查新用户数据管理系统是否存在
        const newSystemPath = path.join(this.projectRoot, 'unified-settings-service', 'user-data-v2');
        if (fs.existsSync(newSystemPath)) {
            console.log(`[LocalSettingsService] 检测到新用户数据管理系统，跳过旧目录创建: ${userId}`);
            return; // 不创建旧的用户目录
        }

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
     * 获取当前选择的LLM提供商
     * @param {string} userId 用户ID，如果不提供则使用本地设置
     */
    getCurrentProvider(userId = null) {
        if (userId) {
            // 尝试读取用户特定的设置
            try {
                const userSettingsPath = this.getUserSettingsPath(userId);
                const localSettingsPath = path.join(userSettingsPath, 'local-settings.json');
                if (fs.existsSync(localSettingsPath)) {
                    const localSettings = this.readJsonFile(localSettingsPath, {});
                    if (localSettings.current_provider) {
                        return localSettings.current_provider;
                    }
                }
            } catch (error) {
                console.error('[LocalSettingsService] 读取用户提供商设置失败:', error);
            }
        }

        // 回退到本地设置
        const localSettingsPath = path.join(this.localDataPath, 'local-settings.json');
        const localSettings = this.readJsonFile(localSettingsPath, { current_provider: 'builtin' });
        return localSettings.current_provider || 'builtin';
    }

    /**
     * 设置当前选择的LLM提供商（用户特定设置）
     * @param {string} provider 提供商名称
     * @param {string} userId 用户ID，如果不提供则使用本地设置
     */
    setCurrentProvider(provider, userId = null) {
        if (userId) {
            // 使用用户特定的设置
            const userSettingsPath = this.getUserSettingsPath(userId);
            const localSettingsPath = path.join(userSettingsPath, 'local-settings.json');
            const localSettings = this.readJsonFile(localSettingsPath, {});
            localSettings.current_provider = provider;
            localSettings.updated_at = new Date().toISOString();
            return this.writeJsonFile(localSettingsPath, localSettings);
        } else {
            // 回退到本地设置（兼容性）
            const localSettingsPath = path.join(this.localDataPath, 'local-settings.json');
            const localSettings = this.readJsonFile(localSettingsPath, {});
            localSettings.current_provider = provider;
            localSettings.updated_at = new Date().toISOString();
            return this.writeJsonFile(localSettingsPath, localSettings);
        }
    }

    /**
     * 获取智能日历格式的LLM设置
     * @param {string} userId 用户ID，必须提供
     */
    getCalendarLLMSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }

        console.log(`[LocalSettingsService] 获取用户LLM设置: ${userId}`);

        // 首先尝试从新的用户数据系统读取设置
        try {
            // 使用环境变量确定存储路径
            const storageType = process.env.STORAGE_TYPE || 'local';
            const nasPath = process.env.NAS_PATH || '\\\\Z423-DXFP\\sata12-181XXXX7921';

            let newSystemPath;
            if (storageType === 'nas') {
                newSystemPath = path.join(nasPath, 'MindOcean', 'user-data', 'settings');
            } else {
                newSystemPath = path.join(this.projectRoot, 'unified-settings-service', 'user-data-v2');
            }

            if (fs.existsSync(newSystemPath)) {
                console.log(`[LocalSettingsService] 检测到新用户数据系统，从中读取LLM设置: ${newSystemPath} (存储类型: ${storageType})`);
                const userDataService = require('./userDataService');

                // 通过用户ID获取用户信息
                const users = userDataService.getAllUsersSync();
                const user = users.find(u => u.user_id === userId);

                if (user) {
                    // 使用用户名作为文件名
                    const fileName = user.username.length > 20 ? userId : user.username;
                    const settingsPath = path.join(newSystemPath, `${fileName}_settings.json`);

                    if (fs.existsSync(settingsPath)) {
                        const userSettings = this.readJsonFile(settingsPath, {});
                        const llmSettings = userSettings.tidelog_llm || {};

                        console.log(`[LocalSettingsService] 从新系统读取到的LLM设置:`, llmSettings);

                        // 处理USE_DEFAULT_CONFIG标记
                        const processedSettings = this.processLLMSettings(llmSettings);
                        console.log(`[LocalSettingsService] 处理后的LLM设置:`, processedSettings);

                        return processedSettings;
                    }
                }
            }
        } catch (error) {
            console.error('[LocalSettingsService] 从新系统读取LLM设置失败:', error);
        }

        // 回退到旧的逻辑
        console.log(`[LocalSettingsService] 回退到旧的LLM设置读取逻辑`);

        // 直接从统一设置服务获取用户的LLM设置
        try {
            const userSettingsPath = this.getUserSettingsPath(userId);
            const llmSettingsFile = path.join(userSettingsPath, 'llm_settings.json');

            if (fs.existsSync(llmSettingsFile)) {
                const userLLMSettings = this.readJsonFile(llmSettingsFile, {});

                // 如果用户有自定义设置，返回用户设置
                if (Object.keys(userLLMSettings).length > 0) {
                    // 转换为日历格式
                    const providers = Object.keys(userLLMSettings);
                    if (providers.length > 0) {
                        const currentProvider = providers[0]; // 使用第一个提供商
                        const providerSettings = userLLMSettings[currentProvider];

                        return {
                            provider: currentProvider,
                            api_key: 'BUILTIN_PROXY', // 前端安全显示
                            base_url: providerSettings.base_url || 'BUILTIN_PROXY',
                            model_name: providerSettings.model_name || 'deepseek/deepseek-chat-v3-0324:free',
                            temperature: providerSettings.temperature || 0.7,
                            max_tokens: providerSettings.max_tokens || 2000,
                            use_custom_model: false
                        };
                    }
                }
            }
        } catch (error) {
            console.error('[LocalSettingsService] 读取用户LLM设置失败:', error);
        }

        // 获取当前选择的提供商（用户特定，回退到本地设置）
        const currentProvider = this.getCurrentProvider(userId);

        // 获取默认模型配置
        const defaultModels = this.getDefaultModels();

        if ((currentProvider === 'builtin' || currentProvider === 'builtin-free') && defaultModels?.builtin_free_tidelog) {
            // 内置模型使用安全配置
            return {
                provider: 'builtin-free',
                api_key: 'BUILTIN_PROXY',
                base_url: 'BUILTIN_PROXY',
                model_name: defaultModels.builtin_free_tidelog.model_name || 'deepseek/deepseek-chat-v3-0324:free',
                temperature: defaultModels.builtin_free_tidelog.temperature || 0.7,
                max_tokens: defaultModels.builtin_free_tidelog.max_tokens || 2000,
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
     * 处理LLM设置中的USE_DEFAULT_CONFIG标记
     * @param {object} llmSettings 原始LLM设置
     */
    processLLMSettings(llmSettings) {
        console.log(`[LocalSettingsService] 开始处理LLM设置:`, llmSettings);

        // 如果provider是builtin且其他字段是USE_DEFAULT_CONFIG，则从默认配置读取
        if (llmSettings.provider === 'builtin' &&
            (llmSettings.model === 'USE_DEFAULT_CONFIG' ||
             llmSettings.api_key === 'USE_DEFAULT_CONFIG' ||
             llmSettings.base_url === 'USE_DEFAULT_CONFIG')) {

            console.log(`[LocalSettingsService] 检测到USE_DEFAULT_CONFIG标记，从默认配置读取`);

            // 获取默认模型配置
            const defaultModels = this.getDefaultModels();
            console.log(`[LocalSettingsService] 默认模型配置:`, defaultModels);

            if (defaultModels?.builtin_free_tidelog) {
                const processedSettings = {
                    provider: 'builtin-free',
                    api_key: 'BUILTIN_PROXY', // 前端显示用占位符
                    base_url: 'BUILTIN_PROXY', // 前端显示用占位符
                    model_name: defaultModels.builtin_free_tidelog.model_name || 'deepseek/deepseek-chat-v3-0324:free',
                    temperature: defaultModels.builtin_free_tidelog.temperature || 0.7,
                    max_tokens: defaultModels.builtin_free_tidelog.max_tokens || 2000,
                    use_custom_model: false
                };

                console.log(`[LocalSettingsService] 处理后的内置模型设置:`, processedSettings);
                return processedSettings;
            }
        }

        // 如果不是USE_DEFAULT_CONFIG或者没有默认配置，直接返回原设置
        const directSettings = {
            provider: llmSettings.provider || 'builtin-free',
            api_key: llmSettings.api_key || 'BUILTIN_PROXY',
            base_url: llmSettings.base_url || 'BUILTIN_PROXY',
            model_name: llmSettings.model_name || llmSettings.model || 'deepseek/deepseek-chat-v3-0324:free', // 修复：优先使用model_name字段
            temperature: llmSettings.temperature || 0.7,
            max_tokens: llmSettings.max_tokens || 2000,
            use_custom_model: llmSettings.use_custom_model || false // 修复：读取use_custom_model字段
        };

        console.log(`[LocalSettingsService] 直接返回的设置:`, directSettings);
        return directSettings;
    }

    /**
     * 保存智能日历格式的LLM设置
     * @param {object} calendarSettings LLM设置对象
     * @param {string} userId 用户ID，必须提供
     */
    async saveCalendarLLMSettings(calendarSettings, userId) {
        try {
            if (!userId) {
                throw new Error('必须提供用户ID');
            }
            console.log('[LocalSettingsService] 开始保存LLM设置，用户ID:', userId, '设置:', calendarSettings);
            
            const provider = calendarSettings.provider;
            
            // 设置当前提供商（用户特定）
            const setProviderResult = this.setCurrentProvider(provider, userId);
            if (!setProviderResult) {
                console.error('[LocalSettingsService] 设置当前提供商失败');
                throw new Error('设置当前提供商失败');
            }
            
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
                
                const saveResult = this.saveLLMProviderSettings(provider, providerConfig, userId);
                if (!saveResult) {
                    console.error('[LocalSettingsService] 保存提供商配置失败');
                    throw new Error('保存提供商配置失败');
                }
                
                console.log('[LocalSettingsService] LLM设置保存成功 - 非内置模型');
                return saveResult;
            }
            
            console.log('[LocalSettingsService] LLM设置保存成功 - 内置模型');
            return true; // 内置模型不需要保存配置
        } catch (error) {
            console.error('[LocalSettingsService] 保存LLM设置失败:', error);
            throw error; // 重新抛出错误，让上级处理
        }
    }

    /**
     * 获取默认LLM设置（用于系统默认用户）
     */
    getDefaultLLMSettings() {
        return {
            providers: {
                builtin: {
                    api_key: 'builtin-free-key',
                    model_name: 'builtin-free',
                    base_url: '',
                    description: '内置免费模型'
                },
                openai: {
                    api_key: '',
                    model_name: 'gpt-3.5-turbo',
                    predefined_model: 'gpt-3.5-turbo',
                    custom_model: '',
                    base_url: 'https://api.openai.com/v1',
                    use_custom_model: false
                },
                deepseek: {
                    api_key: '',
                    model_name: 'deepseek-chat',
                    predefined_model: 'deepseek-chat',
                    custom_model: '',
                    base_url: 'https://api.deepseek.com/v1',
                    use_custom_model: false
                },
                anthropic: {
                    api_key: '',
                    model_name: 'claude-instant-1',
                    predefined_model: 'claude-instant-1',
                    custom_model: '',
                    base_url: 'https://api.anthropic.com',
                    use_custom_model: false
                },
                google: {
                    api_key: '',
                    model_name: 'gemini-pro',
                    predefined_model: 'gemini-pro',
                    custom_model: '',
                    base_url: 'https://generativelanguage.googleapis.com/v1beta',
                    use_custom_model: false
                },
                openrouter: {
                    api_key: '',
                    model_name: 'deepseek/deepseek-chat-v3-0324:free',
                    predefined_model: 'deepseek/deepseek-chat-v3-0324:free',
                    custom_model: '',
                    base_url: 'https://openrouter.ai/api/v1',
                    use_custom_model: false
                },
                ollama: {
                    api_key: '',
                    model_name: 'llama2',
                    predefined_model: 'llama2',
                    custom_model: '',
                    base_url: 'http://localhost:11434/v1',
                    use_custom_model: false
                },
                custom: {
                    api_key: '',
                    model_name: '',
                    predefined_model: '',
                    custom_model: '',
                    base_url: '',
                    use_custom_model: true
                }
            }
        };
    }

    /**
     * 获取共享LLM设置（不包含current_provider）
     */
    getSharedLLMSettings(userId = 'system-default') {
        // 如果是系统默认用户，跳过用户目录检查，直接返回默认设置
        if (userId === 'system-default') {
            return this.getDefaultLLMSettings();
        }

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
     * @param {string} provider 提供商名称
     * @param {object} settings 设置对象
     * @param {string} userId 用户ID，必须提供
     */
    saveLLMProviderSettings(provider, settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
        
        // 直接返回完整配置，供内部处理逻辑使用
        // 注意：这个方法不直接暴露给前端，安全处理在其他地方
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
     * @param {string} userId 用户ID
     */
    async getGlobalLLMSettings(userId) {
        try {
            if (!userId) {
                throw new Error('必须提供用户ID');
            }
            return this.getCalendarLLMSettings(userId);
        } catch (error) {
            console.error('[本地设置服务] 获取全局LLM设置失败:', error);
            return null;
        }
    }

    /**
     * 保存全局LLM设置（兼容原接口）
     * @param {object} calendarSettings LLM设置对象
     * @param {string} userId 用户ID
     */
    async saveGlobalLLMSettings(calendarSettings, userId) {
        try {
            if (!userId) {
                throw new Error('必须提供用户ID');
            }
            const result = this.saveCalendarLLMSettings(calendarSettings, userId);
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
     * @param {string} userId 用户ID，必须提供
     */
    getExchangeSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
        this.ensureUserDirectory(userId);
        const exchangePath = path.join(this.getUserSettingsPath(userId), 'exchange.json');
        
        const defaultSettings = {
            email: '',
            password: '',
            ewsUrl: '',
            exchangeVersion: 'Exchange2013',
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(exchangePath, defaultSettings);
    }

    /**
     * 保存Exchange设置
     * @param {object} settings 设置对象
     * @param {string} userId 用户ID，必须提供
     */
    saveExchangeSettings(settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {string} userId 用户ID，必须提供
     */
    getImapSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {object} settings 设置对象
     * @param {string} userId 用户ID，必须提供
     */
    saveImapSettings(settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {string} userId 用户ID，必须提供
     */
    getCalDAVSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
        this.ensureUserDirectory(userId);
        const caldavPath = path.join(this.getUserSettingsPath(userId), 'caldav.json');
        
        const defaultSettings = {
            serverUrl: '',
            username: '',
            password: '',
            updated_at: new Date().toISOString()
        };
        
        return this.readJsonFile(caldavPath, defaultSettings);
    }

    /**
     * 保存CalDAV设置
     * @param {object} settings 设置对象
     * @param {string} userId 用户ID，必须提供
     */
    saveCalDAVSettings(settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {string} userId 用户ID，必须提供
     */
    getImapFilterSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {object} settings 设置对象
     * @param {string} userId 用户ID，必须提供
     */
    saveImapFilterSettings(settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
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
     * @param {string} userId 用户ID
     */
    async getAllSettings(userId) {
        try {
            if (!userId) {
                throw new Error('必须提供用户ID');
            }
            return {
                llm: this.getCalendarLLMSettings(userId),
                exchange: this.getExchangeSettings(userId),
                imap: this.getImapSettings(userId),
                caldav: this.getCalDAVSettings(userId),
                imapFilter: this.getImapFilterSettings(userId)
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
     * @param {string} userId 用户ID
     */
    async getLLMSettings(userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
        return this.getCalendarLLMSettings(userId);
    }

        /**
     * 获取用于内部API调用的真实LLM配置（包含真实API密钥）
     * 仅用于后端内部使用，不返回给前端
     */
        getInternalLLMSettings(userId = this.defaultUserId) {
        console.log(`[LocalSettingsService] 获取用户 ${userId} 的内部LLM配置`);
        
        // 直接复用getCalendarLLMSettings的逻辑，但返回真实API密钥
        try {
            const storageType = process.env.STORAGE_TYPE || 'local';
            const nasPath = process.env.NAS_PATH || '\\Z423-DXFP\sata12-181XXXX7921';
            
            let newSystemPath;
            if (storageType === 'nas') {
                newSystemPath = path.join(nasPath, 'MindOcean', 'user-data', 'settings');
            } else {
                newSystemPath = path.join(this.projectRoot, 'unified-settings-service', 'user-data-v2');
            }
            
            if (fs.existsSync(newSystemPath)) {
                console.log(`[LocalSettingsService] 直接从NAS读取内部LLM配置: ${newSystemPath}`);
                
                const userDataService = require('./userDataService');
                const users = userDataService.getAllUsersSync();
                const user = users.find(u => u.user_id === userId);
                
                if (user) {
                    const fileName = user.username.length > 20 ? userId : user.username;
                    const settingsPath = path.join(newSystemPath, `${fileName}_settings.json`);
                    
                    if (fs.existsSync(settingsPath)) {
                        const userSettings = this.readJsonFile(settingsPath, {});
                        const tidelog_llm_config = userSettings.tidelog_llm;
                        
                        if (tidelog_llm_config && tidelog_llm_config.provider !== 'builtin') {
                            console.log('[LocalSettingsService] 成功从NAS读取内部tidelog_llm配置:', tidelog_llm_config.provider);
                            console.log('[LocalSettingsService] 内部配置详情:', {
                                provider: tidelog_llm_config.provider,
                                base_url: tidelog_llm_config.base_url,
                                model_name: tidelog_llm_config.model_name
                            });
                            return {
                                provider: tidelog_llm_config.provider,
                                api_key: tidelog_llm_config.api_key || '',
                                base_url: tidelog_llm_config.base_url || '',
                                model_name: tidelog_llm_config.model_name || '',
                                temperature: tidelog_llm_config.temperature || 0.7,
                                max_tokens: tidelog_llm_config.max_tokens || 2000
                            };
                        }
                    }
                }
            }
        } catch (error) {
            console.log('[LocalSettingsService] NAS读取失败，回退到旧系统:', error.message);
        }
        
        // 回退到内置模型配置
        console.log('[LocalSettingsService] 未找到用户自定义配置，使用内置模型');
        try {
            const config = this.readJsonFile(this.defaultModelsPath, {});
            if (config.builtin_free) {
                console.log('[LocalSettingsService] 内部使用内置模型配置');
                return {
                    provider: 'builtin-free',
                    api_key: config.builtin_free.api_key,
                    base_url: config.builtin_free.base_url,
                    model_name: config.builtin_free.model_name,
                    temperature: config.builtin_free.temperature || 0.7,
                    max_tokens: config.builtin_free.max_tokens || 2000
                };
            }
        } catch (error) {
            console.error('[LocalSettingsService] 读取default-models.json失败:', error);
        }
        
        console.error('[LocalSettingsService] 无法获取LLM配置');
        return null;
    }

    async saveLLMSettings(settings, userId) {
        if (!userId) {
            throw new Error('必须提供用户ID');
        }
        return this.saveCalendarLLMSettings(settings, userId);
    }
}

module.exports = new LocalSettingsService(); 