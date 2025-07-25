const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 文件路径定义 - 使用NAS存储
const DATA_DIR = process.env.STORAGE_TYPE === 'nas'
    ? path.join(process.env.NAS_PATH || '\\\\Z423-DXFP\\sata12-181XXXX7921', 'MindOcean', 'user-data', 'calendar')
    : path.join(__dirname, 'data');
const USERS_DATA_DIR = process.env.STORAGE_TYPE === 'nas'
    ? DATA_DIR  // NAS模式下，DATA_DIR就是calendar目录
    : path.join(DATA_DIR, 'users'); // 本地模式保持原结构

// 全局设置文件（所有用户共享的设置，如服务配置等）
const GLOBAL_SETTINGS_FILE = path.join(DATA_DIR, 'global_settings.json');

// 传统文件路径（向后兼容，用于迁移或默认用户）
const LLM_SETTINGS_FILE = path.join(DATA_DIR, 'llm_settings.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events_db.json');
const EXCHANGE_SETTINGS_FILE = path.join(DATA_DIR, 'exchange_settings.json');
const IMAP_SETTINGS_FILE = path.join(DATA_DIR, 'imap_settings.json');
const CALDAV_SETTINGS_FILE = path.join(DATA_DIR, 'caldav_settings.json');
const IMAP_FILTER_SETTINGS_PATH = path.join(__dirname, 'imap_filter_settings.json');

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`数据目录已创建: ${DATA_DIR}`);
        }
        if (!fs.existsSync(USERS_DATA_DIR)) {
            fs.mkdirSync(USERS_DATA_DIR, { recursive: true });
            console.log(`用户数据目录已创建: ${USERS_DATA_DIR}`);
        }
    } catch (error) {
        console.error('检查或创建数据目录时出错:', error);
        throw error;
    }
}

/**
 * 确保用户数据目录存在
 * @param {string} userId - 用户ID
 */
function ensureUserDataDir(userId) {
    try {
        ensureDataDir();
        const userDir = path.join(USERS_DATA_DIR, userId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
            console.log(`用户数据目录已创建: ${userDir}`);
        }
        return userDir;
    } catch (error) {
        console.error(`创建用户 ${userId} 数据目录时出错:`, error);
        throw error;
    }
}

/**
 * 根据用户ID获取用户名（从新的用户数据服务）
 * @param {string} userId - 用户ID
 * @returns {string} 用户名，如果找不到则返回用户ID
 */
function getUsernameFromId(userId) {
    try {
        // 使用环境变量确定CSV文件路径
        const csvPath = process.env.STORAGE_TYPE === 'nas'
            ? path.join(process.env.NAS_PATH || '\\\\Z423-DXFP\\sata12-181XXXX7921', 'MindOcean', 'user-data', 'settings', 'users.csv')
            : 'C:\\code\\unified-settings-service\\user-data-v2\\users.csv';

        if (!fs.existsSync(csvPath)) {
            console.log(`[Storage] CSV文件不存在，使用用户ID作为文件名: ${csvPath}`);
            return userId;
        }

        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.trim().split('\n');

        if (lines.length <= 1) {
            console.log(`[Storage] CSV文件为空，使用用户ID作为文件名`);
            return userId;
        }

        // 跳过表头，查找用户
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns.length >= 2 && columns[0] === userId) {
                const username = columns[1];
                console.log(`[Storage] 找到用户名: ${userId} -> ${username}`);
                return username;
            }
        }

        console.log(`[Storage] 未找到用户ID ${userId} 对应的用户名，使用用户ID作为文件名`);
        return userId;
    } catch (error) {
        console.error(`[Storage] 获取用户名失败，使用用户ID作为文件名:`, error);
        return userId;
    }
}

/**
 * 获取用户事件文件路径（使用用户名命名）
 * @param {string} userId - 用户ID
 * @returns {string} 事件文件路径
 */
function getUserEventsFilePath(userId) {
    try {
        ensureDataDir();
        const username = getUsernameFromId(userId);
        return path.join(USERS_DATA_DIR, `${username}_events.json`);
    } catch (error) {
        console.error(`[Storage] 获取用户事件文件路径失败:`, error);
        // 回退到旧的方式
        return getUserFilePath(userId, 'events_db.json');
    }
}

/**
 * 获取用户特定文件路径
 * @param {string} userId - 用户ID
 * @param {string} filename - 文件名
 * @returns {string} 完整文件路径
 */
function getUserFilePath(userId, filename) {
    const userDir = ensureUserDataDir(userId);
    return path.join(userDir, filename);
}

/**
 * 从文件加载JSON数据
 * @param {string} filePath - JSON文件路径
 * @param {any} defaultValue - 文件不存在时的默认值
 * @returns {any} - 解析后的JSON数据
 */
function loadJsonFile(filePath, defaultValue = {}) {
    try {
        ensureDataDir();
        
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } else {
            // 文件不存在，返回默认值并创建文件
            console.log(`文件 ${filePath} 未找到，创建默认文件并使用默认值。`);
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
            return defaultValue;
        }
    } catch (error) {
        console.error(`从 ${filePath} 加载数据时出错:`, error);
        // 出错时也返回默认值，防止程序崩溃
        return defaultValue;
    }
}

/**
 * 将数据保存到JSON文件
 * @param {string} filePath - 保存的文件路径
 * @param {any} data - 要保存的数据
 */
function saveJsonFile(filePath, data) {
    try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        // console.log(`数据已保存到 ${filePath}`); // 可选成功日志
    } catch (error) {
        console.error(`保存数据到 ${filePath} 时出错:`, error);
        throw error;
    }
}

// ============== 用户隔离的数据操作函数 ==============

/**
 * 加载用户的LLM设置
 * @param {string} userId - 用户ID，如果为null则使用全局设置
 * @returns {Object} LLM设置对象
 */
/**
 * 加载用户的LLM设置（支持多provider）
 * @param {string} userId - 用户ID，如果为null则使用全局设置
 * @returns {Object} LLM设置对象
 */
function loadLLMSettings(userId = null) {
    const defaultSettings = {
        provider: "none",
        api_key: "",
        model_name: "",
        base_url: ""
    };
    
    const filePath = userId ? getUserFilePath(userId, 'llm_settings.json') : LLM_SETTINGS_FILE;
    const userSettings = loadJsonFile(filePath, defaultSettings);
    
    // 处理新的多provider格式
    if (userSettings.providers && userSettings.current_provider) {
        const currentProviderSettings = userSettings.providers[userSettings.current_provider];
        if (currentProviderSettings) {
            // 返回当前provider的设置，但保持兼容旧格式
            const compatibleFormat = {
                provider: userSettings.current_provider,
                api_key: currentProviderSettings.api_key,
                model_name: currentProviderSettings.model_name,
                base_url: currentProviderSettings.base_url,
                // 同时包含新格式信息，供前端使用
                _multi_provider: true,
                _all_providers: userSettings.providers,
                updated_at: userSettings.updated_at
            };
            
            console.log(`加载用户 ${userId || '全局'} LLM设置，当前provider: ${userSettings.current_provider}`);
            return compatibleFormat;
        }
    }
    
    // 兼容旧的单provider格式
    if (userSettings.provider === 'builtin') {
        const builtinDefaults = getProviderDefaults('builtin');
        return {
            provider: 'builtin',
            api_key: builtinDefaults.api_key,
            model_name: builtinDefaults.default_model,
            base_url: builtinDefaults.base_url,
            description: builtinDefaults.description
        };
    }
    
    return userSettings;
}

/**
 * 获取provider的默认配置
 */
function getProviderDefaults(provider) {
    const providerDefaults = {
        'openai': {
            base_url: 'https://api.openai.com/v1',
            default_model: 'gpt-4o-mini'
        },
        'anthropic': {
            base_url: 'https://api.anthropic.com',
            default_model: 'claude-3-haiku-20240307'
        },
        'deepseek': {
            base_url: 'https://api.deepseek.com/v1',
            default_model: 'deepseek-chat'
        },
        'google': {
            base_url: 'https://generativelanguage.googleapis.com/v1beta',
            default_model: 'gemini-1.5-flash'
        },
        'openrouter': {
            base_url: 'https://openrouter.ai/api/v1',
            default_model: 'meta-llama/llama-3.2-3b-instruct:free'
        },
        'ollama': {
            base_url: 'http://localhost:11434/v1',
            default_model: 'llama3.2:3b'
        },
        'builtin': {
            base_url: '',
            default_model: 'builtin-free',
            api_key: 'builtin-free-key',
            description: '内置免费模型'
        }
    };
    
    return providerDefaults[provider] || { base_url: '', default_model: '' };
}

/**
 * 保存用户的LLM设置（支持多provider）
 * @param {Object} settings - LLM设置对象
 * @param {string} userId - 用户ID，如果为null则保存到全局设置
 */
function saveLLMSettings(settings, userId = null) {
    const filePath = userId ? getUserFilePath(userId, 'llm_settings.json') : LLM_SETTINGS_FILE;
    
    // 读取现有设置
    let existingSettings = loadJsonFile(filePath, {
        current_provider: 'none',
        providers: {}
    });
    
    // 确保结构正确
    if (!existingSettings.providers) {
        existingSettings.providers = {};
    }
    
    const provider = settings.provider;
    const defaults = getProviderDefaults(provider);
    
    // 处理内置免费模型
    if (provider === 'builtin') {
        existingSettings.providers[provider] = {
            api_key: defaults.api_key,
            model_name: defaults.default_model,
            base_url: defaults.base_url,
            description: defaults.description,
            updated_at: new Date().toISOString()
        };
    } else {
        // 更新指定provider的设置，自动设置正确的base_url
        existingSettings.providers[provider] = {
            api_key: settings.api_key || '',
            model_name: settings.model_name || defaults.default_model,
            base_url: defaults.base_url, // 使用固定的base_url
            updated_at: new Date().toISOString()
        };
    }
    
    // 设置当前provider
    existingSettings.current_provider = provider;
    existingSettings.updated_at = new Date().toISOString();
    
    console.log(`保存${provider}设置到 ${filePath}，使用base_url: ${defaults.base_url}`);
    
    saveJsonFile(filePath, existingSettings);
}

/**
 * 加载用户的事件数据
 * @param {string} userId - 用户ID，如果为null则使用全局事件
 * @returns {Array} 事件数组
 */
function loadEvents(userId = null) {
    const defaultEvents = [];

    let events;
    if (userId) {
        // 优先使用新的简化文件路径（用户名命名）
        const newFilePath = getUserEventsFilePath(userId);

        // 如果新文件存在，使用新文件
        if (fs.existsSync(newFilePath)) {
            console.log(`[Storage] 使用简化文件路径加载事件: ${newFilePath}`);
            events = loadJsonFile(newFilePath, defaultEvents);
        } else {
            // 否则尝试从旧文件路径加载
            const oldFilePath = getUserFilePath(userId, 'events_db.json');
            if (fs.existsSync(oldFilePath)) {
                console.log(`[Storage] 从旧文件路径加载事件: ${oldFilePath}`);
                events = loadJsonFile(oldFilePath, defaultEvents);

                // 自动迁移到新文件路径
                console.log(`[Storage] 自动迁移事件数据到新文件路径: ${newFilePath}`);
                saveJsonFile(newFilePath, events);
            } else {
                events = defaultEvents;
            }
        }
    } else {
        // 向后兼容：无用户ID时使用全局文件
        events = loadJsonFile(EVENTS_FILE, defaultEvents);
    }

    return events.map(event => ({
        ...event,
        completed: event.completed === true
    }));
}

/**
 * 保存用户的事件数据
 * @param {Array} events - 事件数组
 * @param {string} userId - 用户ID，如果为null则保存到全局文件
 */
function saveEvents(events, userId = null) {
    if (userId) {
        // 使用新的简化文件路径（用户名命名）
        const newFilePath = getUserEventsFilePath(userId);
        console.log(`[Storage] 保存事件到简化文件路径: ${newFilePath}`);
        saveJsonFile(newFilePath, events);
    } else {
        // 向后兼容：无用户ID时保存到全局文件
        saveJsonFile(EVENTS_FILE, events);
    }
}

/**
 * 加载用户的Exchange设置
 * @param {string} userId - 用户ID，如果为null则使用全局设置
 * @returns {Object} Exchange设置对象
 */
function loadExchangeSettings(userId = null) {
    const defaultSettings = {
        email: "",
        password: "",
        serverUrl: ""
    };
    
    if (userId) {
        const userFilePath = getUserFilePath(userId, 'exchange_settings.json');
        return loadJsonFile(userFilePath, defaultSettings);
    } else {
        return loadJsonFile(EXCHANGE_SETTINGS_FILE, defaultSettings);
    }
}

/**
 * 保存用户的Exchange设置
 * @param {Object} settings - Exchange设置对象
 * @param {string} userId - 用户ID，如果为null则保存到全局设置
 */
function saveExchangeSettings(settings, userId = null) {
    if (userId) {
        const userFilePath = getUserFilePath(userId, 'exchange_settings.json');
        saveJsonFile(userFilePath, settings);
    } else {
        saveJsonFile(EXCHANGE_SETTINGS_FILE, settings);
    }
}

/**
 * 加载用户的IMAP设置
 * @param {string} userId - 用户ID，如果为null则使用全局设置
 * @returns {Object} IMAP设置对象
 */
function loadImapSettings(userId = null) {
    const defaultSettings = {
        email: "",
        password: "",  // 授权码
        imapHost: "",
        imapPort: 993,
        useTLS: true,
        active: false
    };
    
    if (userId) {
        const userFilePath = getUserFilePath(userId, 'imap_settings.json');
        return loadJsonFile(userFilePath, defaultSettings);
    } else {
        return loadJsonFile(IMAP_SETTINGS_FILE, defaultSettings);
    }
}

/**
 * 保存用户的IMAP设置
 * @param {Object} settings - IMAP设置对象
 * @param {string} userId - 用户ID，如果为null则保存到全局设置
 */
function saveImapSettings(settings, userId = null) {
    if (userId) {
        const userFilePath = getUserFilePath(userId, 'imap_settings.json');
        saveJsonFile(userFilePath, settings);
    } else {
        saveJsonFile(IMAP_SETTINGS_FILE, settings);
    }
}

/**
 * 加载用户的CalDAV设置
 * @param {string} userId - 用户ID，如果为null则使用全局设置
 * @returns {Object} CalDAV设置对象
 */
function loadCalDAVSettings(userId = null) {
    try {
        if (userId) {
            const userFilePath = getUserFilePath(userId, 'caldav_settings.json');
            if (fs.existsSync(userFilePath)) {
                const data = fs.readFileSync(userFilePath, 'utf8');
                return JSON.parse(data);
            } else {
                console.log(`用户 ${userId} 的CalDAV settings文件未找到，返回默认空对象。`);
                fs.writeFileSync(userFilePath, JSON.stringify({}, null, 2), 'utf8');
                return {};
            }
        } else {
            // 向后兼容的全局设置路径
            ensureDataDir();
            const correctPath = path.join(__dirname, 'caldav_settings.json');
            if (fs.existsSync(correctPath)) {
                const data = fs.readFileSync(correctPath, 'utf8');
                return JSON.parse(data);
            } else {
                console.log(`CalDAV settings文件 ${correctPath} 未找到，返回默认空对象。`);
                fs.writeFileSync(correctPath, JSON.stringify({}, null, 2), 'utf8');
                return {};
            }
        }
    } catch (error) {
        console.error(`加载CalDAV设置时出错:`, error);
        return {}; // 返回默认空对象以防程序崩溃
    }
}

/**
 * 保存用户的CalDAV设置
 * @param {Object} settings - CalDAV设置对象
 * @param {string} userId - 用户ID，如果为null则保存到全局设置
 */
function saveCalDAVSettings(settings, userId = null) {
    try {
        if (userId) {
            const userFilePath = getUserFilePath(userId, 'caldav_settings.json');
            const data = JSON.stringify(settings, null, 2);
            fs.writeFileSync(userFilePath, data, 'utf8');
        } else {
            // 向后兼容的全局设置路径
            ensureDataDir();
            const correctPath = path.join(__dirname, 'caldav_settings.json'); 
            const data = JSON.stringify(settings, null, 2);
            fs.writeFileSync(correctPath, data, 'utf8');
        }
    } catch (error) {
        console.error(`保存CalDAV设置时出错:`, error);
        throw error;
    }
}

// ============== IMAP过滤设置 (全局共享) ==============

/**
 * 加载IMAP过滤设置 (全局共享，不按用户隔离)
 * @returns {Object} IMAP过滤设置对象
 */
function loadImapFilterSettings() {
    try {
        if (fs.existsSync(IMAP_FILTER_SETTINGS_PATH)) {
            const data = fs.readFileSync(IMAP_FILTER_SETTINGS_PATH, 'utf8');
            return JSON.parse(data);
        } else {
            console.log(`IMAP Filter settings file ${IMAP_FILTER_SETTINGS_PATH} not found, returning default settings.`);
            const defaultSettings = { sender_allowlist: [] };
            fs.writeFileSync(IMAP_FILTER_SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2), 'utf8');
            return defaultSettings;
        }
    } catch (error) {
        console.error(`Error loading IMAP filter settings from ${IMAP_FILTER_SETTINGS_PATH}:`, error);
        return { sender_allowlist: [] }; // 返回默认设置以防程序崩溃
    }
}

/**
 * 保存IMAP过滤设置
 * @param {Object} settings - IMAP过滤设置对象
 * @param {string} userId - 用户ID，如果为null则保存到全局设置
 */
function saveImapFilterSettings(settings, userId = null) {
    try {
        if (userId) {
            const userFilePath = getUserFilePath(userId, 'imap_filter_settings.json');
            const data = JSON.stringify(settings, null, 2);
            fs.writeFileSync(userFilePath, data, 'utf8');
            console.log(`IMAP filter settings saved to ${userFilePath} for user ${userId}`);
        } else {
            // 向后兼容：无用户ID时保存到全局文件
            const data = JSON.stringify(settings, null, 2);
            fs.writeFileSync(IMAP_FILTER_SETTINGS_PATH, data, 'utf8');
            console.log(`IMAP filter settings saved to ${IMAP_FILTER_SETTINGS_PATH}`);
        }
    } catch (error) {
        const filePath = userId ? getUserFilePath(userId, 'imap_filter_settings.json') : IMAP_FILTER_SETTINGS_PATH;
        console.error(`Error saving IMAP filter settings to ${filePath}:`, error);
        throw error;
    }
}

// ============== 数据迁移功能 ==============

/**
 * 迁移全局事件到用户事件文件
 * @param {string} userId - 用户ID
 * @returns {number} 迁移的事件数量
 */
function migrateGlobalEventsToUser(userId) {
    try {
        // 检查全局事件文件是否存在
        if (!fs.existsSync(EVENTS_FILE)) {
            console.log(`[数据迁移] 全局事件文件不存在: ${EVENTS_FILE}`);
            return 0;
        }

        // 加载全局事件
        const globalEvents = loadJsonFile(EVENTS_FILE, []);
        if (globalEvents.length === 0) {
            console.log(`[数据迁移] 全局事件文件为空，无需迁移`);
            return 0;
        }

        // 检查用户事件文件
        const userFilePath = getUserFilePath(userId, 'events_db.json');
        let userEvents = [];
        let needsMigration = true;

        if (fs.existsSync(userFilePath)) {
            userEvents = loadJsonFile(userFilePath, []);
            
            // 检查是否已经有迁移的事件
            const hasMigratedEvents = userEvents.some(event => event.migrated_from_global);
            if (hasMigratedEvents) {
                console.log(`[数据迁移] 用户 ${userId} 已有迁移事件，跳过迁移`);
                return 0;
            }
            
            // 如果用户事件远少于全局事件，且没有迁移标记，则需要迁移
            if (userEvents.length < globalEvents.length * 0.1) { // 用户事件少于全局事件的10%
                console.log(`[数据迁移] 用户 ${userId} 事件数量(${userEvents.length})远少于全局事件(${globalEvents.length})，执行迁移`);
                needsMigration = true;
            } else {
                console.log(`[数据迁移] 用户 ${userId} 已有足够事件(${userEvents.length})，跳过迁移`);
                needsMigration = false;
            }
        }

        if (!needsMigration) {
            return 0;
        }

        // 为全局事件添加用户ID和迁移标记
        const migratedEvents = globalEvents.map(event => ({
            ...event,
            userId: userId,
            migrated_from_global: true,
            migrated_at: new Date().toISOString()
        }));

        // 合并用户现有事件和迁移的事件
        const allEvents = [...userEvents, ...migratedEvents];

        // 保存到用户事件文件
        saveJsonFile(userFilePath, allEvents);
        
        console.log(`[数据迁移] 成功迁移 ${migratedEvents.length} 个事件到用户 ${userId}，总事件数: ${allEvents.length}`);
        
        // 备份全局事件文件（不删除，以防需要恢复）
        const backupPath = EVENTS_FILE + '.backup_' + Date.now();
        fs.copyFileSync(EVENTS_FILE, backupPath);
        console.log(`[数据迁移] 全局事件文件已备份到: ${backupPath}`);

        return migratedEvents.length;
    } catch (error) {
        console.error(`[数据迁移] 迁移用户 ${userId} 的事件时出错:`, error);
        throw error;
    }
}

/**
 * 清理用户的迁移事件，只保留用户自己创建的事件
 * @param {string} userId - 用户ID
 * @returns {Object} 清理统计信息
 */
function cleanupMigratedEvents(userId) {
    const stats = {
        removed: 0,
        kept: 0
    };

    try {
        const userFilePath = getUserFilePath(userId, 'events_db.json');

        if (!fs.existsSync(userFilePath)) {
            console.log(`[清理迁移事件] 用户 ${userId} 事件文件不存在`);
            return stats;
        }

        const userEvents = loadJsonFile(userFilePath, []);
        if (userEvents.length === 0) {
            console.log(`[清理迁移事件] 用户 ${userId} 无事件需要清理`);
            return stats;
        }

        // 分离迁移事件和用户事件
        const userOwnEvents = [];
        const migratedEvents = [];

        userEvents.forEach(event => {
            if (event.migrated_from_global) {
                migratedEvents.push(event);
            } else {
                userOwnEvents.push(event);
            }
        });

        stats.removed = migratedEvents.length;
        stats.kept = userOwnEvents.length;

        if (stats.removed > 0) {
            // 只保存用户自己的事件
            saveJsonFile(userFilePath, userOwnEvents);
            console.log(`[清理迁移事件] 用户 ${userId} 清理完成: 移除 ${stats.removed} 个迁移事件，保留 ${stats.kept} 个用户事件`);
        }

        return stats;
    } catch (error) {
        console.error(`[清理迁移事件] 用户 ${userId} 清理失败:`, error);
        throw error;
    }
}

/**
 * 迁移所有全局设置到用户设置
 * @param {string} userId - 用户ID
 * @returns {Object} 迁移统计信息
 */
function migrateGlobalSettingsToUser(userId) {
    const migrationStats = {
        events: 0,
        llmSettings: false,
        exchangeSettings: false,
        imapSettings: false,
        caldavSettings: false
    };

    try {
        // 迁移事件
        migrationStats.events = migrateGlobalEventsToUser(userId);

        // 迁移LLM设置
        if (fs.existsSync(LLM_SETTINGS_FILE)) {
            const userLLMPath = getUserFilePath(userId, 'llm_settings.json');
            if (!fs.existsSync(userLLMPath)) {
                const globalLLMSettings = loadJsonFile(LLM_SETTINGS_FILE, {});
                if (Object.keys(globalLLMSettings).length > 0) {
                    saveJsonFile(userLLMPath, globalLLMSettings);
                    migrationStats.llmSettings = true;
                    console.log(`[数据迁移] LLM设置已迁移到用户 ${userId}`);
                }
            }
        }

        // 迁移Exchange设置
        if (fs.existsSync(EXCHANGE_SETTINGS_FILE)) {
            const userExchangePath = getUserFilePath(userId, 'exchange_settings.json');
            if (!fs.existsSync(userExchangePath)) {
                const globalExchangeSettings = loadJsonFile(EXCHANGE_SETTINGS_FILE, {});
                if (Object.keys(globalExchangeSettings).length > 0) {
                    saveJsonFile(userExchangePath, globalExchangeSettings);
                    migrationStats.exchangeSettings = true;
                    console.log(`[数据迁移] Exchange设置已迁移到用户 ${userId}`);
                }
            }
        }

        // 迁移IMAP设置
        if (fs.existsSync(IMAP_SETTINGS_FILE)) {
            const userIMAPPath = getUserFilePath(userId, 'imap_settings.json');
            if (!fs.existsSync(userIMAPPath)) {
                const globalIMAPSettings = loadJsonFile(IMAP_SETTINGS_FILE, {});
                if (Object.keys(globalIMAPSettings).length > 0) {
                    saveJsonFile(userIMAPPath, globalIMAPSettings);
                    migrationStats.imapSettings = true;
                    console.log(`[数据迁移] IMAP设置已迁移到用户 ${userId}`);
                }
            }
        }

        // 迁移CalDAV设置
        if (fs.existsSync(CALDAV_SETTINGS_FILE)) {
            const userCalDAVPath = getUserFilePath(userId, 'caldav_settings.json');
            if (!fs.existsSync(userCalDAVPath)) {
                const globalCalDAVSettings = loadJsonFile(CALDAV_SETTINGS_FILE, {});
                if (Object.keys(globalCalDAVSettings).length > 0) {
                    saveJsonFile(userCalDAVPath, globalCalDAVSettings);
                    migrationStats.caldavSettings = true;
                    console.log(`[数据迁移] CalDAV设置已迁移到用户 ${userId}`);
                }
            }
        }

        const hasAnyMigration = migrationStats.events > 0 || 
                              migrationStats.llmSettings || 
                              migrationStats.exchangeSettings || 
                              migrationStats.imapSettings || 
                              migrationStats.caldavSettings;

        if (hasAnyMigration) {
            console.log(`[数据迁移] 用户 ${userId} 迁移完成:`, migrationStats);
        }

        return migrationStats;
    } catch (error) {
        console.error(`[数据迁移] 迁移用户 ${userId} 的设置时出错:`, error);
        throw error;
    }
}

module.exports = {
    loadLLMSettings, saveLLMSettings,
    loadEvents, saveEvents,
    loadExchangeSettings, saveExchangeSettings,
    loadImapSettings, saveImapSettings,
    loadCalDAVSettings, saveCalDAVSettings,
    loadImapFilterSettings, saveImapFilterSettings,
    migrateGlobalEventsToUser,
    migrateGlobalSettingsToUser,
    cleanupMigratedEvents,
    uuidv4,
    // 新增的用户目录管理函数
    ensureUserDataDir,
    getUserFilePath
};