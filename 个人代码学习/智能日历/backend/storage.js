const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 文件路径定义
const DATA_DIR = path.join(__dirname, 'data');
const LLM_SETTINGS_FILE = path.join(DATA_DIR, 'llm_settings.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events_db.json');
const EXCHANGE_SETTINGS_FILE = path.join(DATA_DIR, 'exchange_settings.json');
const IMAP_SETTINGS_FILE = path.join(DATA_DIR, 'imap_settings.json');
const CALDAV_SETTINGS_FILE = path.join(DATA_DIR, 'caldav_settings.json');

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log(`数据目录已确保存在: ${DATA_DIR}`);
    } catch (error) {
        console.error('创建数据目录时出错:', error);
        throw error;
    }
}

/**
 * 从文件加载JSON数据
 * @param {string} filePath - JSON文件路径
 * @param {any} defaultValue - 文件不存在时的默认值
 * @returns {Promise<any>} - 解析后的JSON数据
 */
async function loadJsonFile(filePath, defaultValue = {}) {
    try {
        await ensureDataDir();
        
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在，返回默认值
                console.log(`文件 ${filePath} 未找到，使用默认值。`);
                // 创建默认文件
                await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
                return defaultValue;
            }
            throw error;
        }
    } catch (error) {
        console.error(`从 ${filePath} 加载数据时出错:`, error);
        throw error;
    }
}

/**
 * 将数据保存到JSON文件
 * @param {string} filePath - 保存的文件路径
 * @param {any} data - 要保存的数据
 */
async function saveJsonFile(filePath, data) {
    try {
        await ensureDataDir();
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`数据已保存到 ${filePath}`);
    } catch (error) {
        console.error(`保存数据到 ${filePath} 时出错:`, error);
        throw error;
    }
}

/**
 * 加载LLM设置
 * @returns {Promise<Object>} LLM设置对象
 */
async function loadLLMSettings() {
    const defaultSettings = {
        provider: "none",
        apiKey: "",
        model: "",
        baseUrl: ""
    };
    return loadJsonFile(LLM_SETTINGS_FILE, defaultSettings);
}

/**
 * 保存LLM设置
 * @param {Object} settings - LLM设置对象
 * @returns {Promise<void>}
 */
async function saveLLMSettings(settings) {
    return saveJsonFile(LLM_SETTINGS_FILE, settings);
}

/**
 * 加载Exchange设置
 * @returns {Promise<Object>} Exchange设置对象
 */
async function loadExchangeSettings() {
    const defaultSettings = {
        email: "",
        password: "",
        serverUrl: ""
    };
    return loadJsonFile(EXCHANGE_SETTINGS_FILE, defaultSettings);
}

/**
 * 保存Exchange设置
 * @param {Object} settings - Exchange设置对象
 * @returns {Promise<void>}
 */
async function saveExchangeSettings(settings) {
    return saveJsonFile(EXCHANGE_SETTINGS_FILE, settings);
}

/**
 * 加载事件数据
 * @returns {Promise<Array>} 事件数组
 */
async function loadEvents() {
    const events = await loadJsonFile(EVENTS_FILE, []);
    // 确保每个事件都有 completed 字段
    return events.map(event => ({
        ...event,
        completed: event.completed === true // 明确处理布尔值，默认为 false
    }));
}

/**
 * 保存事件数据
 * @param {Array} events - 事件数组
 * @returns {Promise<void>}
 */
async function saveEvents(events) {
    return saveJsonFile(EVENTS_FILE, events);
}

/**
 * 加载IMAP邮箱设置
 * @returns {Promise<Object>} IMAP设置对象
 */
async function loadImapSettings() {
    const defaultSettings = {
        email: "",
        password: "",  // 授权码
        imapHost: "",
        imapPort: 993,
        useTLS: true,
        active: false
    };
    return loadJsonFile(IMAP_SETTINGS_FILE, defaultSettings);
}

/**
 * 保存IMAP邮箱设置
 * @param {Object} settings - IMAP设置对象
 * @returns {Promise<void>}
 */
async function saveImapSettings(settings) {
    return saveJsonFile(IMAP_SETTINGS_FILE, settings);
}

/**
 * 加载CalDAV设置
 * @returns {Promise<Object>} CalDAV设置对象
 */
async function loadCalDAVSettings() {
    await ensureDataDir();
    
    try {
        const data = await fs.readFile(CALDAV_SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // 文件不存在，返回默认设置
            return {};
        }
        throw error;
    }
}

/**
 * 保存CalDAV设置
 * @param {Object} settings - CalDAV设置对象
 * @returns {Promise<void>}
 */
async function saveCalDAVSettings(settings) {
    await ensureDataDir();
    
    const data = JSON.stringify(settings, null, 2);
    await fs.writeFile(CALDAV_SETTINGS_FILE, data, 'utf8');
}

module.exports = {
    loadLLMSettings,
    saveLLMSettings,
    loadEvents,
    saveEvents,
    loadExchangeSettings,
    saveExchangeSettings,
    loadImapSettings,
    saveImapSettings,
    loadCalDAVSettings,
    saveCalDAVSettings,
    uuidv4
}; 