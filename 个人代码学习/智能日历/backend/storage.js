const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 文件路径定义
const DATA_DIR = path.join(__dirname, 'data');
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
        } else {
            // console.log(`数据目录已存在: ${DATA_DIR}`); // 可选日志
        }
    } catch (error) {
        console.error('检查或创建数据目录时出错:', error);
        throw error;
    }
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
        ensureDataDir();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        // console.log(`数据已保存到 ${filePath}`); // 可选成功日志
    } catch (error) {
        console.error(`保存数据到 ${filePath} 时出错:`, error);
        throw error;
    }
}

/**
 * 加载LLM设置
 * @returns {Object} LLM设置对象
 */
function loadLLMSettings() {
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
 */
function saveLLMSettings(settings) {
    saveJsonFile(LLM_SETTINGS_FILE, settings);
}

/**
 * 加载Exchange设置
 * @returns {Object} Exchange设置对象
 */
function loadExchangeSettings() {
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
 */
function saveExchangeSettings(settings) {
    saveJsonFile(EXCHANGE_SETTINGS_FILE, settings);
}

/**
 * 加载事件数据
 * @returns {Array} 事件数组
 */
function loadEvents() {
    const events = loadJsonFile(EVENTS_FILE, []);
    return events.map(event => ({
        ...event,
        completed: event.completed === true
    }));
}

/**
 * 保存事件数据
 * @param {Array} events - 事件数组
 */
function saveEvents(events) {
    saveJsonFile(EVENTS_FILE, events);
}

/**
 * 加载IMAP邮箱设置
 * @returns {Object} IMAP设置对象
 */
function loadImapSettings() {
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
 */
function saveImapSettings(settings) {
    saveJsonFile(IMAP_SETTINGS_FILE, settings);
}

/**
 * 加载CalDAV设置
 * @returns {Object} CalDAV设置对象
 */
function loadCalDAVSettings() {
    try {
        ensureDataDir();
        const correctPath = path.join(__dirname, 'caldav_settings.json');
        if (fs.existsSync(correctPath)) {
            const data = fs.readFileSync(correctPath, 'utf8');
            return JSON.parse(data);
        } else {
            console.log(`CalDAV settings file ${correctPath} not found, returning default empty object.`);
            // 返回默认空对象并创建文件
            fs.writeFileSync(correctPath, JSON.stringify({}, null, 2), 'utf8');
            return {};
        }
    } catch (error) {
        console.error(`Error loading CalDAV settings from ${correctPath}:`, error);
        return {}; // 返回默认空对象以防程序崩溃
    }
}

/**
 * 保存CalDAV设置
 * @param {Object} settings - CalDAV设置对象
 */
function saveCalDAVSettings(settings) {
    try {
        ensureDataDir();
        const correctPath = path.join(__dirname, 'caldav_settings.json'); 
        const data = JSON.stringify(settings, null, 2);
        fs.writeFileSync(correctPath, data, 'utf8');
        // console.log(`CalDAV settings saved to ${correctPath}`); // 可选日志
    } catch (error) {
        console.error(`Error saving CalDAV settings to ${correctPath}:`, error);
        throw error;
    }
}

// loadImapFilterSettings 和 saveImapFilterSettings 已经是同步的了 (来自上次修改)
function loadImapFilterSettings() {
    try {
        const correctPath = path.join(__dirname, 'imap_filter_settings.json'); 
        if (fs.existsSync(correctPath)) { 
            const data = fs.readFileSync(correctPath, 'utf8'); 
            return JSON.parse(data);
        }
        console.log("IMAP filter settings file not found, returning default empty allowlist.");
        return { sender_allowlist: [] }; 
    } catch (error) {
        console.error("Error loading IMAP filter settings:", error);
        return { sender_allowlist: [] }; 
    }
}

function saveImapFilterSettings(settings) {
    try {
        const correctPath = path.join(__dirname, 'imap_filter_settings.json');
        fs.writeFileSync(correctPath, JSON.stringify(settings, null, 2)); 
        console.log("IMAP filter settings saved to:", correctPath);
    } catch (error) {
        console.error("Error saving IMAP filter settings:", error);
        throw error; 
    }
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
    loadImapFilterSettings,
    saveImapFilterSettings,
    uuidv4
};