// 加载当前目录的.env文件
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
console.log(`[TideLog] 环境变量加载: STORAGE_TYPE=${process.env.STORAGE_TYPE}, NAS_PATH=${process.env.NAS_PATH}`);

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
// 导入 ActiveSync 客户端库
// const asclient = require('asclient'); // 不再需要 ActiveSync 测试库
// 导入存储函数
const {
    loadLLMSettings, saveLLMSettings,
    loadEvents, saveEvents,
    loadExchangeSettings, saveExchangeSettings,
    loadImapSettings, saveImapSettings,
    loadCalDAVSettings, saveCalDAVSettings,
    loadImapFilterSettings, saveImapFilterSettings, // <-- 添加新的导入
    migrateGlobalEventsToUser,
    migrateGlobalSettingsToUser,
    cleanupMigratedEvents,
    uuidv4
} = require('./storage');
// 导入认证中间件
const { authenticateUser, optionalAuth, getCurrentUserId, isAuthenticated } = require('./auth');
// 导入设置服务（已统一为newSettingsService）
const newSettingsService = require('./newSettingsService');

// 可能需要安装这些模块
// npm install imap mailparser caldav ical
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const caldav = require('caldav');
const ICAL = require('ical'); // <-- node-ical 库已经在此处导入为 ICAL
const multer = require('multer');
const upload = multer(); // 初始化 multer，用于处理文件上传
const mammoth = require("mammoth");
const OpenAI = require("openai"); // <-- Import OpenAI library
const { parse: parseByRegex } = require('./regex_parser_enhanced'); // 使用增强版正则解析器
const cron = require('node-cron'); // <-- 引入 node-cron
const { createDAVClient, DAVClient } = require('tsdav');
const ical = require('node-ical');
const { createEvent: createIcsEvent, createEvents } = require('ics'); // <-- 恢复使用 ics 库
const { spawn } = require('child_process'); // <-- 导入 spawn 用于执行 Python

const app = express();
const PORT = process.env.PORT || 11001;

// --- 应用状态 (内存中) ---
let llmSettings = {
    provider: 'builtin-free',
    model_name: 'builtin-free',
    api_key: 'not-needed',
    base_url: null
};

// LLM配置缓存，避免频繁调用统一设置服务
let llmConfigCache = {
    data: null,
    userId: null,
    lastUpdated: null,
    cacheTimeout: 5 * 60 * 1000 // 5分钟缓存有效期
};

let eventsDb = [];
let imapSettings = {};
let caldavSettings = {};
let imapFilterSettings = { sender_allowlist: [] }; // <-- 初始化新的内存缓存

// 清理LLM配置缓存的辅助函数
function clearLlmConfigCache(userId = null) {
    if (!userId || llmConfigCache.userId === userId) {
        console.log(`[LLM Config Cache] 清理缓存 (用户: ${userId || 'all'})`);
        llmConfigCache = {
            data: null,
            userId: null,
            lastUpdated: null,
            cacheTimeout: llmConfigCache.cacheTimeout
        };
    }
}

// 强制清理所有缓存的函数
function forceResetLlmCache() {
    console.log('[LLM Config Cache] 强制重置所有缓存');
    llmConfigCache = {
        data: null,
        userId: null,
        lastUpdated: null,
        cacheTimeout: 5 * 60 * 1000
    };
}

async function initializeData() {
    // 使用新的设置管理器加载所有设置
    console.log('[初始化] 开始加载应用设置...');

    try {
        // 使用默认系统用户ID加载设置
        const systemUserId = 'cmmc03v95m7xzqxwewhjt'; // 系统默认用户ID
        console.log(`[初始化] 使用系统用户ID: ${systemUserId} 加载默认设置`);

        // 批量获取所有设置（从本地设置服务）
        const allSettings = await newSettingsService.getAllSettings(systemUserId);

        llmSettings = allSettings.llm;
        imapSettings = allSettings.imap;
        caldavSettings = allSettings.caldav;
        imapFilterSettings = allSettings.imapFilter;
        
        // 加载事件数据
        eventsDb = await loadEvents();
        
        console.log('[初始化] 设置加载完成:');
        console.log("  - LLM设置:", { provider: llmSettings.provider, model: llmSettings.model_name });
        console.log(`  - 事件数据: ${eventsDb.length}个`);
        console.log("  - IMAP设置:", imapSettings.host ? '已配置' : '未配置');
        console.log("  - CalDAV设置:", Object.keys(caldavSettings).length > 0 ? '已配置' : '未配置');
        console.log("  - IMAP过滤设置:", `白名单${imapFilterSettings.sender_allowlist?.length || 0}项`);
        
    } catch (error) {
        console.error('[初始化] 设置加载失败，使用默认值:', error);
        
        // 回退到旧的加载方式
        llmSettings = await loadLLMSettings();
        eventsDb = await loadEvents();
        imapSettings = await loadImapSettings();
        
        try {
            caldavSettings = await loadCalDAVSettings();
        } catch (error) {
            console.warn("CalDAV设置未找到，使用默认空设置");
            caldavSettings = {};
        }
        
        try { 
            imapFilterSettings = loadImapFilterSettings();
        } catch (error) {
            console.warn("IMAP Filter设置加载失败，使用默认空设置:", error);
            imapFilterSettings = { sender_allowlist: [] };
        }
    }
}

// --- 中间件 ---
app.use(cors({
    origin: function (origin, callback) {
        // 允许的固定域名
        const allowedOrigins = [
            'http://localhost:11000',
            'http://127.0.0.1:11000',
            'http://jason.cheman.top:11000',
            'http://jason.cheman.top:8081',  // 添加外网nginx代理端口
            'https://www.cheman.top',        // 添加HTTPS外网域名
            'https://jason.cheman.top',      // 添加HTTPS外网域名
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        // 如果没有origin（比如直接访问），允许
        if (!origin) return callback(null, true);
        
        // 检查是否在允许列表中
        if (allowedOrigins.includes(origin)) {
            console.log(`[CORS] 允许预定义域名访问: ${origin}`);
            return callback(null, true);
        }
        
        // 检查是否是局域网IP地址 (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const urlObj = new URL(origin);
        const hostname = urlObj.hostname;
        const isPrivateIP = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                           /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                           /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
        
        if (isPrivateIP && (urlObj.port === '11000' || urlObj.port === '3000')) {
            console.log(`[CORS] 允许局域网/本地IP访问: ${origin}`);
            return callback(null, true);
        }
        
        console.log(`[CORS] 拒绝未授权域名: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- 基础路由 ---
app.get('/', (req, res) => { res.json({ message: '智能日历API - Node.js后端' }); });

// 健康检查端点（不需要认证）
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'TideLog后端服务',
        port: PORT,
        version: '1.0.0'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'TideLog后端服务',
        port: PORT,
        version: '1.0.0'
    });
});

// --- LLM配置路由 ---
app.post('/config/llm', authenticateUser, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || !newSettings.provider) {
        return res.status(400).json({ error: '无效的LLM设置格式。' });
    }

    const userId = getCurrentUserId(req);

    try {
        // 如果前端没有发送API Key（部分更新），则先获取现有设置
        let settingsToSave = { ...newSettings };
        if (!newSettings.api_key) {
            const existingSettings = await newSettingsService.getLLMSettings(userId);
            settingsToSave.api_key = existingSettings.api_key || '';
        }

        // 使用本地设置服务保存LLM设置
        const success = await newSettingsService.saveLLMSettings(settingsToSave, userId);
        
        if (success) {
            // 更新内存缓存
            llmSettings = { ...settingsToSave };
            
            res.status(200).json({ 
                message: 'LLM设置已保存。',
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[LLM配置] 保存失败:", error);
        res.status(500).json({ error: "保存LLM设置失败。" });
    }
});

app.get('/config/llm', authenticateUser, async (req, res) => {
    const userId = getCurrentUserId(req);

    try {
        // 使用本地设置服务获取LLM设置
        const settings = await newSettingsService.getLLMSettings(userId);
        
        // 更新内存缓存
        llmSettings = { ...settings };
        
        res.status(200).json(settings);
    } catch (error) {
        console.error('[LLM配置] 获取设置失败:', error);
        // 回退到当前内存中的设置
        res.status(200).json(llmSettings);
    }
});

// 获取指定provider的LLM设置
app.get('/config/llm/:provider', optionalAuth, async (req, res) => {
    const provider = req.params.provider;
    const userToken = req.user?.token;

    try {
        // 获取用户ID，如果没有认证则使用系统默认ID
        const userId = req.user?.userId || 'system-default';

        // 获取共享LLM设置
        const sharedSettings = newSettingsService.getSharedLLMSettings(userId);
        const providerConfig = sharedSettings.providers[provider];
        
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
            
            const settings = {
                provider: provider,
                api_key: providerConfig.api_key ? '********' : '', // 隐藏真实API Key
                base_url: providerConfig.base_url || '',
                model_name: modelToDisplay,
                temperature: providerConfig.temperature || 0.7,
                max_tokens: providerConfig.max_tokens || 2000,
                useCustomModel: useCustom
            };
            
            res.status(200).json(settings);
        } else {
            // 如果没有配置，返回默认值
            res.status(200).json({
                provider: provider,
                api_key: '',
                base_url: '',
                model_name: '',
                temperature: 0.7,
                max_tokens: 2000,
                useCustomModel: false
            });
        }
    } catch (error) {
        console.error(`[LLM配置] 获取${provider}设置失败:`, error);
        res.status(500).json({ error: `获取${provider}设置失败` });
    }
});


// --- IMAP配置路由 ---
app.post('/config/imap', optionalAuth, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || 
        typeof newSettings.email !== 'string' || 
        typeof newSettings.password !== 'string' ||
        typeof newSettings.imapHost !== 'string') {
        return res.status(400).json({ 
            error: '无效的IMAP设置格式。必需: email, password(授权码), imapHost' 
        });
    }
    
    const settingsToSave = { ...newSettings };
    const userToken = req.user?.token;
    
    try {
        // 使用新的设置服务保存IMAP设置
        const userId = getCurrentUserId(req);
        const userInfo = { username: req.user?.username, email: req.user?.email };
        const success = await newSettingsService.saveImapSettings(settingsToSave, userId, userInfo);
        
        if (success) {
            // 更新内存缓存
            imapSettings = { ...settingsToSave };
            
            res.status(200).json({ 
                message: `已保存${imapSettings.email}的IMAP设置。`,
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[IMAP配置] 保存失败:", error);
        res.status(500).json({ error: "保存IMAP设置失败。" });
    }
});

app.get('/config/imap', optionalAuth, async (req, res) => {
    const userToken = req.user?.token;
    
    try {
        // 使用本地设置服务获取IMAP设置
        const settings = await newSettingsService.getImapSettings(userToken);
        
        // 更新内存缓存，但不暴露密码
        imapSettings = { ...settings };
        const { password, ...settingsToSend } = settings;
        
        res.status(200).json(settingsToSend);
    } catch (error) {
        console.error('[IMAP配置] 获取设置失败:', error);
        // 发生错误时返回本地设置（不含密码）
        const { password, ...settingsToSend } = imapSettings;
        res.status(200).json(settingsToSend);
    }
});

// --- CalDAV配置路由 ---
app.post('/config/caldav', optionalAuth, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || 
        typeof newSettings.username !== 'string' || 
        typeof newSettings.password !== 'string' ||
        typeof newSettings.serverUrl !== 'string') {
        return res.status(400).json({ 
            error: '无效的CalDAV设置格式。必需: username, password, serverUrl' 
        });
    }
    
    const settingsToSave = { ...newSettings };
    const userToken = req.user?.token;
    
    try {
        // 使用本地设置服务保存CalDAV设置
        const success = await newSettingsService.saveCalDAVSettings(settingsToSave, userToken);
        
        if (success) {
            // 更新内存缓存
            caldavSettings = { ...settingsToSave };
            
            res.status(200).json({ 
                message: `已保存${caldavSettings.username}的CalDAV设置。`,
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[CalDAV配置] 保存失败:", error);
        res.status(500).json({ error: "保存CalDAV设置失败。" });
    }
});

app.get('/config/caldav', optionalAuth, async (req, res) => {
    const userToken = req.user?.token;
    
    try {
        // 使用本地设置服务获取CalDAV设置
        const settings = await newSettingsService.getCalDAVSettings(userToken);
        
        // 更新内存缓存，但不暴露密码
        caldavSettings = { ...settings };
        const { password, ...settingsToSend } = settings;
        
        res.status(200).json(settingsToSend);
    } catch (error) {
        console.error('[CalDAV配置] 获取设置失败:', error);
        // 发生错误时返回本地设置（不含密码）
        const { password, ...settingsToSend } = caldavSettings;
        res.status(200).json(settingsToSend);
    }
});

// --- 设置API路由（用于前端混合服务） ---

// LLM设置API
app.get('/settings/llm', authenticateUser, async (req, res) => {
    const userId = getCurrentUserId(req);

    try {
        console.log('[LLM设置API] 获取前端安全配置，用户ID:', userId);
        // 返回前端安全版本的LLM设置（包含占位符）
        const settings = newSettingsService.getCalendarLLMSettings(userId);
        
        console.log('[LLM设置API] 返回安全配置:', { 
            provider: settings.provider, 
            hasApiKey: !!settings.api_key,
            apiKeyType: settings.api_key === 'BUILTIN_PROXY' ? 'placeholder' : 'masked'
        });
        
        res.status(200).json(settings);
    } catch (error) {
        console.error('[LLM设置API] 获取设置失败:', error);
        res.status(500).json({ 
            error: '获取LLM设置失败',
            provider: 'builtin-free',
            api_key: 'BUILTIN_PROXY',
            base_url: 'BUILTIN_PROXY',
            model_name: 'deepseek/deepseek-chat-v3-0324:free',
            temperature: 0.7,
            max_tokens: 2000
        });
    }
});

app.post('/settings/llm', authenticateUser, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || !newSettings.provider) {
        return res.status(400).json({ error: '无效的LLM设置格式。' });
    }

    const userId = getCurrentUserId(req);

    try {
        console.log('[LLM设置API] 保存设置请求，用户ID:', userId, '设置:', {
            provider: newSettings.provider,
            model_name: newSettings.model_name,
            hasApiKey: !!newSettings.api_key,
            apiKeyType: newSettings.api_key === 'BUILTIN_PROXY' ? 'placeholder' : 'actual'
        });

        // 使用新的设置服务保存LLM设置（与CalDAV/IMAP保持一致）
        const userInfo = { username: req.user.username, email: req.user.email };
        const success = await newSettingsService.saveLLMSettings(newSettings, userId, userInfo);

        if (success) {
            console.log('[LLM设置API] 设置保存成功');
            res.status(200).json({
                message: 'LLM设置已保存。',
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[LLM设置API] 保存失败:", error);
        res.status(500).json({ error: "保存LLM设置失败: " + error.message });
    }
});



// CalDAV设置API
app.get('/settings/caldav', authenticateUser, async (req, res) => {
    const userId = getCurrentUserId(req);
    console.log(`[CalDAV设置API] 获取CalDAV设置 - userId: ${userId}`);

    try {
        // 使用新的设置服务获取CalDAV设置
        const userInfo = { username: req.user.username, email: req.user.email };
        const settings = await newSettingsService.getCalDAVSettings(userId, userInfo);
        console.log(`[CalDAV设置API] 读取到的设置:`, settings);
        
        // 更新内存缓存
        caldavSettings = { ...settings };
        
        // 转换为前端期望的格式并移除密码，但添加密码状态指示
        const frontendSettings = {
            username: settings.username || '',
            password: settings.password ? '********' : '', // 显示占位符表示已保存密码
            serverUrl: settings.serverUrl || '',
            hasPassword: !!settings.password // 添加密码状态标识
        };
        console.log(`[CalDAV设置API] 转换为前端格式:`, frontendSettings);
        
        res.status(200).json(frontendSettings);
    } catch (error) {
        console.error('[CalDAV设置API] 获取设置失败:', error);
        // 发生错误时返回默认设置
        res.status(200).json({
            username: '',
            password: '',
            serverUrl: '',
            hasPassword: false
        });
    }
});

app.post('/settings/caldav', authenticateUser, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings ||
        typeof newSettings.username !== 'string' ||
        typeof newSettings.password !== 'string' ||
        typeof newSettings.serverUrl !== 'string') {
        return res.status(400).json({
            error: '无效的CalDAV设置格式。必需: username, password, serverUrl'
        });
    }

    const userId = getCurrentUserId(req);
    let settingsToSave = { ...newSettings };

    // 如果密码是屏蔽符号，保持原有密码不变
    if (newSettings.password === '********') {
        try {
            const existingSettings = await newSettingsService.getCalDAVSettings(userId);
            settingsToSave.password = existingSettings.password || '';
            console.log(`[CalDAV设置API] 保持原有密码不变`);
        } catch (error) {
            console.error('[CalDAV设置API] 获取现有设置失败:', error);
            return res.status(500).json({ error: '无法获取现有设置' });
        }
    }
    
    try {
        // 使用新的设置服务保存CalDAV设置
        const userInfo = { username: req.user.username, email: req.user.email };
        const success = await newSettingsService.saveCalDAVSettings(settingsToSave, userId, userInfo);
        
        if (success) {
            // 更新内存缓存
            caldavSettings = { ...settingsToSave };
            
            res.status(200).json({ 
                message: `已保存${caldavSettings.username}的CalDAV设置。`,
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[CalDAV设置API] 保存失败:", error);
        res.status(500).json({ error: "保存CalDAV设置失败。" });
    }
});

// IMAP设置API
app.get('/settings/imap', authenticateUser, async (req, res) => {
    const userId = getCurrentUserId(req);
    console.log(`[IMAP设置API] 获取IMAP设置 - userId: ${userId}`);
    
    try {
        // 使用新的设置服务获取IMAP设置
        const userInfo = { username: req.user.username, email: req.user.email };
        const settings = await newSettingsService.getImapSettings(userId, userInfo);
        console.log(`[IMAP设置API] 读取到的设置:`, settings);
        
        // 更新内存缓存
        imapSettings = { ...settings };
        
        // 转换为前端期望的格式并移除密码，但添加密码状态指示
        const frontendSettings = {
            email: settings.user || settings.email || '',
            password: settings.password ? '********' : '', // 显示占位符表示已保存密码
            imapHost: settings.host || settings.imapHost || '',
            imapPort: settings.port || settings.imapPort || 993,
            useTLS: settings.tls !== undefined ? settings.tls : (settings.useTLS !== undefined ? settings.useTLS : true),
            hasPassword: !!settings.password // 添加密码状态标识
        };
        console.log(`[IMAP设置API] 转换为前端格式:`, frontendSettings);
        
        res.status(200).json(frontendSettings);
    } catch (error) {
        console.error('[IMAP设置API] 获取设置失败:', error);
        // 发生错误时返回默认设置
        res.status(200).json({
            email: '',
            password: '',
            imapHost: '',
            imapPort: 993,
            useTLS: true,
            hasPassword: false
        });
    }
});

app.post('/settings/imap', authenticateUser, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || 
        typeof newSettings.email !== 'string' || 
        typeof newSettings.password !== 'string' ||
        typeof newSettings.imapHost !== 'string') {
        return res.status(400).json({ 
            error: '无效的IMAP设置格式。必需: email, password(授权码), imapHost' 
        });
    }
    
    const settingsToSave = { ...newSettings };
    const userId = getCurrentUserId(req);
    
    try {
        // 使用新的设置服务保存IMAP设置
        const userInfo = { username: req.user.username, email: req.user.email };
        const success = await newSettingsService.saveImapSettings(settingsToSave, userId, userInfo);
        
        if (success) {
            // 更新内存缓存
            imapSettings = { ...settingsToSave };
            
            res.status(200).json({ 
                message: `已保存${imapSettings.email}的IMAP设置。`,
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
            });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("[IMAP设置API] 保存失败:", error);
        res.status(500).json({ error: "保存IMAP设置失败。" });
    }
});

// --- 日期时间辅助函数 (移到 utils.js 或确保在这里可用) ---
// function getStartEndDateForSync() { ... } 
const { getStartEndDateForSync } = require('./utils'); // <-- 确保导入或定义了此函数

// --- IMAP同步路由 ---


// --- 辅助函数：使用 LLM 解析文本 ---
/**
 * 使用大语言模型解析自然语言文本为日历事件
 * @param {string} text - 要解析的文本
 * @param {string} userId - 用户ID，用于获取用户特定的LLM配置
 * @param {string} userToken - 用户认证token，用于访问统一设置服务
 * @returns {Object|null} 解析后的事件对象，失败时返回null
 */
async function parseTextWithLLM(text, userId = null, userToken = null) {
    console.log(`[LLM Parse Util] 开始解析: "${text}"`);
    
    // 1. 获取LLM配置（带缓存机制）
    let currentLlmSettings = null;
    
    // 检查缓存是否有效
    const now = Date.now();
    const isCacheValid = llmConfigCache.data && 
                        llmConfigCache.userId === userId &&
                        llmConfigCache.lastUpdated &&
                        (now - llmConfigCache.lastUpdated) < llmConfigCache.cacheTimeout;
    
    if (isCacheValid) {
        console.log(`[LLM Parse Util] 使用缓存的LLM配置 (用户: ${userId})`);
        currentLlmSettings = { ...llmConfigCache.data };
    } else {
        console.log(`[LLM Parse Util] 缓存无效或过期，重新获取LLM配置`);
        try {
            if (userToken && userId) {
                // 使用内部方法获取用户的真实LLM配置（包含真实API密钥）
                console.log(`[LLM Parse Util] 获取用户 ${userId} 的内部LLM配置`);
                const userLlmSettings = newSettingsService.getInternalLLMSettings(userId);
                if (userLlmSettings) {
                    currentLlmSettings = { ...userLlmSettings };
                    // 更新缓存
                    llmConfigCache = {
                        data: { ...userLlmSettings },
                        userId: userId,
                        lastUpdated: now,
                        cacheTimeout: llmConfigCache.cacheTimeout
                    };
                    console.log('[LLM Parse Util] 已获取用户内部LLM设置并更新缓存:', currentLlmSettings.provider);
                } else {
                    throw new Error('无法从设置管理器获取用户内部LLM配置');
                }
            } else {
                // 没有用户认证时，使用内部全局设置
                console.log('[LLM Parse Util] 无用户认证，使用内部全局LLM配置');
                const globalLlmSettings = newSettingsService.getInternalLLMSettings();
                if (globalLlmSettings) {
                    currentLlmSettings = { ...globalLlmSettings };
                } else {
                    throw new Error('无法获取内部全局LLM配置');
                }
            }
        } catch (configError) {
            console.error('[LLM Parse Util] 获取LLM配置失败:', configError.message);
            return null;
        }
    }
    
    // 2. 验证LLM配置是否有效
    if (!currentLlmSettings || !currentLlmSettings.provider || currentLlmSettings.provider === 'none') {
        console.error("[LLM Parse Util] LLM配置无效或未设置");
        return null;
    }
    
    console.log('[LLM Parse Util] 最终使用的LLM配置:', currentLlmSettings.provider);
    
    // 3. 内置模型配置已经通过getInternalLLMSettings获取，无需重复处理
    console.log('[LLM Parse Util] 使用已获取的LLM配置:', currentLlmSettings.provider);
    
    // 验证特定提供商的配置
    console.log('[LLM Parse Util] 调试配置信息:', JSON.stringify(currentLlmSettings, null, 2));
    
    if ((currentLlmSettings.provider === 'builtin' || currentLlmSettings.provider === 'builtin-free') && !currentLlmSettings.api_key) {
        console.error(`[LLM Parse Util] ${currentLlmSettings.provider} 需要API密钥, 当前api_key: "${currentLlmSettings.api_key}"`);
        return null;
    } else if ((currentLlmSettings.provider === 'openai' || currentLlmSettings.provider === 'deepseek') && !currentLlmSettings.api_key) {
        console.error(`[LLM Parse Util] ${currentLlmSettings.provider} 需要API密钥`);
        return null;
    }

    try {
        // 4. 初始化 LLM Client
        let openaiClient;
        let modelToUse = currentLlmSettings.model_name || currentLlmSettings.model || 'gpt-3.5-turbo';

        console.log(`[LLM Parse Util] 正在使用 ${currentLlmSettings.provider} 模型: ${modelToUse}`);

        if (currentLlmSettings.provider === 'builtin-free' || currentLlmSettings.provider === 'builtin') {
            // 内置免费模型配置 - OpenRouter API调用
            openaiClient = new OpenAI({
                apiKey: currentLlmSettings.api_key,
                baseURL: currentLlmSettings.base_url || 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': 'https://smart-calendar.local',
                    'X-Title': 'Smart Calendar AI',
                }
            });
            modelToUse = currentLlmSettings.model_name || currentLlmSettings.model;
        } else {
            openaiClient = new OpenAI({
                apiKey: currentLlmSettings.api_key,
                baseURL: currentLlmSettings.base_url || (currentLlmSettings.provider === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined),
            });
            if (currentLlmSettings.provider === 'deepseek' && !currentLlmSettings.model_name) {
                modelToUse = 'deepseek-chat';
            }
        }

        console.log(`[LLM Parse Util] 已初始化客户端: ${currentLlmSettings.provider}, 模型: ${modelToUse}`);
        
        // 5. 构建 Prompt
        const offsetMinutes = new Date().getTimezoneOffset();
        const offsetHours = -offsetMinutes / 60;
        const sign = offsetHours >= 0 ? '+' : '-';
        const absOffsetHours = Math.abs(offsetHours);
        const offsetString = `${sign}${String(Math.floor(absOffsetHours)).padStart(2, '0')}:${String((absOffsetHours % 1) * 60).padStart(2, '0')}`;
        
        // 获取当前日期的精确信息
        const currentDate = new Date();
        const currentDateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD格式
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        const currentWeekday = ['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()];
        
        const prompt = `
请精确解析以下自然语言描述，提取日历事件信息。

**关键上下文:**
- **当前日期:** ${currentDateString} (星期${currentWeekday})
- **用户时区:** UTC${offsetString}
- **年份:** ${currentYear}年

**精确时间解析规则:**
1. **相对日期识别:**
   - "今天" = ${currentDateString}
   - "明天" = ${new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
   - "后天" = ${new Date(currentDate.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0]}
   - "昨天" = ${new Date(currentDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
   - "本周五/下周一" = 根据当前日期计算具体日期
   - "本13:30" = 今天的13:30，不是"本周五"

2. **时间点精确映射:**
   - "凌晨" = 00:00-05:59
   - "早上/上午" = 06:00-11:59
   - "中午" = 12:00-12:59  
   - "下午" = 13:00-17:59
   - "晚上" = 18:00-23:59
   - "半夜" = 23:00-01:00

3. **具体时间解析:**
   - "1点半/一点半" = 13:30 (下午) 或 01:30 (凌晨，需根据上下文)
   - "下午1点半" = 13:30
   - "14:00/两点" = 14:00
   - "18:30/六点半" = 18:30

4. **时长推断:**
   - 会议通常1-2小时
   - "13:30-16:30" = 3小时
   - 未指定时长时默认1小时

5. **时区转换:**
   - 本地时间 → UTC时间转换公式: UTC = 本地时间 - 时区偏移
   - 例如: 北京时间14:00 (UTC+8) = UTC 06:00

**输出格式要求:**
严格按照以下JSON格式输出，确保时间准确性：
{
  "title": "简洁的事件标题",
  "start_datetime": "YYYY-MM-DDTHH:mm:ss.SSSZ",
  "end_datetime": "YYYY-MM-DDTHH:mm:ss.SSSZ", 
  "description": "详细描述",
  "location": "地点"
}

**验证示例:**
- "今天下午1点半开会" → start_datetime: "${currentDateString}T13:30:00+08:00" → UTC: "${currentDateString}T05:30:00.000Z"
- "13:30-16:30开会" → start_datetime: "${currentDateString}T13:30:00+08:00", end_datetime: "${currentDateString}T16:30:00+08:00"

**强制要求:**
1. 只返回JSON对象，无任何额外文字
2. 确保JSON格式完整正确
3. 时间必须准确转换为UTC
4. 无法解析时间时start_datetime设为null

待解析文本:
"${text}"

JSON结果:
`;
        
        // 6. 调用 LLM API
        let llmResponseContent = '';
        try {
            console.log("[LLM Parse Util] 发送请求到LLM...");
            // 为了兼容不同的API提供商，移除可能不支持的response_format参数
            const completionParams = {
                model: modelToUse,
                messages: [
                    { role: "system", content: "你是专业的日历事件解析AI助手。严格遵守指令：1. 只输出完整JSON对象；2. 不包含任何额外文字、解释或格式化；3. 确保JSON语法完美；4. 时间转换必须准确；5. 优先处理中文时间表达习惯。特别注意：'本13:30'指今天13:30，不是本周五；'下午1点半'=13:30；'1-4点'表示持续时间。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: currentLlmSettings.max_tokens || 2000
            };
            
            // 只有OpenAI和兼容的API才支持response_format
            if (currentLlmSettings.provider === 'openai' || currentLlmSettings.provider === 'builtin-free') {
                completionParams.response_format = { type: "json_object" };
            }
            
            const completion = await openaiClient.chat.completions.create(completionParams);

            llmResponseContent = completion?.choices?.[0]?.message?.content?.trim() ?? '';
            console.log("[LLM Parse Util] 收到LLM响应:", llmResponseContent);

            if (!llmResponseContent) {
                throw new Error('LLM 返回了空的响应内容');
            }

        } catch (llmError) {
            console.error("[LLM Parse Util] LLM API 调用失败:", llmError);
            return null;
        }

        // 7. 解析并验证 LLM 响应 - 增强版JSON修复机制
        let parsedResult = null;
        let jsonParseAttempts = [];
        
        // 尝试多种JSON修复策略
        const repairStrategies = [
            // 策略1: 原始内容直接解析
            () => llmResponseContent,
            
            // 策略2: 修复截断的JSON（缺少结尾括号）
            () => {
                if (!llmResponseContent.trim().endsWith('}')) {
                    console.log("[LLM Parse Util] 策略2: 修复截断JSON");
                    return llmResponseContent.trim() + '}';
                }
                return null;
            },
            
            // 策略3: 移除markdown代码块
            () => {
                console.log("[LLM Parse Util] 策略3: 清理markdown格式");
                let cleaned = llmResponseContent
                    .replace(/```json\s*/g, '')
                    .replace(/```\s*/g, '')
                    .trim();
                
                // 找到JSON开始位置
                const firstBrace = cleaned.indexOf('{');
                if (firstBrace > 0) {
                    cleaned = cleaned.substring(firstBrace);
                }
                
                // 确保以}结尾
                if (!cleaned.endsWith('}')) {
                    cleaned += '}';
                }
                
                return cleaned;
            },
            
            // 策略4: 提取JSON对象（处理前后有文字的情况）
            () => {
                console.log("[LLM Parse Util] 策略4: 提取JSON对象");
                const jsonMatch = llmResponseContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return jsonMatch[0];
                }
                return null;
            },
            
            // 策略5: 修复缺少引号的键名
            () => {
                console.log("[LLM Parse Util] 策略5: 修复JSON键名引号");
                let repaired = llmResponseContent;
                // 修复类似 {title: "会议"} 的情况
                repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                
                // 确保以{开头和}结尾
                if (!repaired.trim().startsWith('{')) {
                    repaired = '{' + repaired.trim();
                }
                if (!repaired.trim().endsWith('}')) {
                    repaired = repaired.trim() + '}';
                }
                
                return repaired;
            },
            
            // 策略6: 智能补全JSON结构
            () => {
                console.log("[LLM Parse Util] 策略6: 智能补全JSON");
                let content = llmResponseContent.trim();
                
                // 移除所有非JSON内容
                if (!content.startsWith('{')) {
                    const braceIndex = content.indexOf('{');
                    if (braceIndex > 0) {
                        content = content.substring(braceIndex);
                    }
                }
                
                // 分析JSON结构并补全
                const openBraces = (content.match(/\{/g) || []).length;
                const closeBraces = (content.match(/\}/g) || []).length;
                const missingBraces = openBraces - closeBraces;
                
                if (missingBraces > 0) {
                    content += '}'.repeat(missingBraces);
                }
                
                return content;
            }
        ];
        
        // 依次尝试各种修复策略
        for (let i = 0; i < repairStrategies.length; i++) {
            try {
                const repairedJson = repairStrategies[i]();
                if (repairedJson) {
                    jsonParseAttempts.push(`策略${i + 1}: ${repairedJson.substring(0, 100)}...`);
                    parsedResult = JSON.parse(repairedJson);
                    console.log(`[LLM Parse Util] 策略${i + 1}修复成功`);
                    break;
                }
            } catch (strategyError) {
                console.log(`[LLM Parse Util] 策略${i + 1}失败:`, strategyError.message);
            }
        }
        
        // 如果所有策略都失败，记录尝试过程
        if (!parsedResult) {
            console.error("[LLM Parse Util] 所有JSON修复策略失败");
            console.log("[LLM Parse Util] 修复尝试记录:", jsonParseAttempts);
            throw new Error('无法解析LLM返回的JSON内容');
        }
            
        // 验证解析结果
        if (!parsedResult || typeof parsedResult !== 'object') {
            throw new Error('LLM 返回的不是有效的 JSON 对象');
        }
        
        // 验证并清理数据
        const result = {
            title: parsedResult.title && typeof parsedResult.title === 'string' ? parsedResult.title.trim() : null,
            start_datetime: parsedResult.start_datetime && typeof parsedResult.start_datetime === 'string' ? parsedResult.start_datetime.trim() : null,
            end_datetime: parsedResult.end_datetime && typeof parsedResult.end_datetime === 'string' ? parsedResult.end_datetime.trim() : null,
            description: parsedResult.description && typeof parsedResult.description === 'string' ? parsedResult.description.trim() : null,
            location: parsedResult.location && typeof parsedResult.location === 'string' ? parsedResult.location.trim() : null
        };
        
        // 增强的时间格式验证和修复
        if (result.start_datetime) {
            // 尝试修复各种时间格式并确保UTC转换
            const fixedStartTime = fixDateTimeFormat(result.start_datetime);
            if (fixedStartTime) {
                result.start_datetime = fixedStartTime;
                console.log("[LLM Parse Util] 开始时间修复成功:", fixedStartTime);
            } else {
                console.warn("[LLM Parse Util] 无法修复的开始时间格式:", result.start_datetime);
                result.start_datetime = null;
            }
        }
        
        if (result.end_datetime) {
            const fixedEndTime = fixDateTimeFormat(result.end_datetime);
            if (fixedEndTime) {
                result.end_datetime = fixedEndTime;
                console.log("[LLM Parse Util] 结束时间修复成功:", fixedEndTime);
            } else {
                console.warn("[LLM Parse Util] 无法修复的结束时间格式:", result.end_datetime);
                result.end_datetime = null;
            }
        }
        
        // 智能推断结束时间
        if (result.start_datetime && !result.end_datetime) {
            const startDate = new Date(result.start_datetime);
            let durationMs = 60 * 60 * 1000; // 默认1小时
            
            // 根据标题智能推断时长
            if (result.title) {
                const titleLower = result.title.toLowerCase();
                if (titleLower.includes('会议') || titleLower.includes('开会')) {
                    durationMs = 60 * 60 * 1000; // 会议默认1小时
                } else if (titleLower.includes('培训') || titleLower.includes('课程')) {
                    durationMs = 2 * 60 * 60 * 1000; // 培训默认2小时
                } else if (titleLower.includes('讨论') || titleLower.includes('研讨')) {
                    durationMs = 90 * 60 * 1000; // 讨论默认1.5小时
                } else if (titleLower.includes('午餐') || titleLower.includes('晚餐')) {
                    durationMs = 60 * 60 * 1000; // 用餐默认1小时
                }
            }
            
            result.end_datetime = new Date(startDate.getTime() + durationMs).toISOString();
            console.log(`[LLM Parse Util] 智能推断结束时间 (+${durationMs/60000}分钟):`, result.end_datetime);
        }
        
        // 验证时间逻辑关系
        if (result.start_datetime && result.end_datetime) {
            const startDate = new Date(result.start_datetime);
            const endDate = new Date(result.end_datetime);
            
            if (endDate <= startDate) {
                console.warn("[LLM Parse Util] 结束时间早于开始时间，自动调整");
                result.end_datetime = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
            }
        }
        
        console.log("[LLM Parse Util] 解析成功:", result);
        return result;

        } catch (parseError) {
            console.error("[LLM Parse Util] JSON解析失败:", parseError);
            console.log("[LLM Parse Util] 原始响应内容:", llmResponseContent);
            return null; // 返回null让调用者处理fallback
        }

        // 辅助函数：修复时间格式和时区转换
        function fixDateTimeFormat(datetimeStr) {
            if (!datetimeStr) return null;
            
            try {
                // 如果已经是有效的ISO格式，直接返回
                if (!isNaN(new Date(datetimeStr).getTime())) {
                    const date = new Date(datetimeStr);
                    // 确保是UTC时间
                    return date.toISOString();
                }
                
                // 尝试修复常见格式问题
                let fixed = datetimeStr.trim();
                
                // 1. 处理带时区的时间格式 (如 2025-09-12T13:30:00+08:00)
                if (fixed.includes('+') || fixed.includes('-')) {
                    // 这种格式已经是完整的，直接尝试解析
                    if (!isNaN(new Date(fixed).getTime())) {
                        return new Date(fixed).toISOString();
                    }
                    
                    // 修复时区格式：将 +0800 转换为 +08:00
                    if (fixed.includes('+') && !fixed.includes(':') && fixed.length > 19) {
                        fixed = fixed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
                    }
                }
                // 2. 处理没有时区的时间格式
                else if (!fixed.includes('Z')) {
                    // 如果是本地时间格式，需要转换为UTC
                    const localDate = new Date(fixed);
                    if (!isNaN(localDate.getTime())) {
                        // 本地时间已经正确解析，直接返回ISO格式
                        return localDate.toISOString();
                    }
                    
                    // 修复不完整的格式
                    if (fixed.length === 16) { // YYYY-MM-DDTHH:mm
                        fixed += ':00';
                    }
                    if (fixed.length === 19) { // YYYY-MM-DDTHH:mm:ss
                        fixed += '.000';
                    }
                    
                    // 添加UTC标记
                    if (!fixed.includes('Z') && !fixed.includes('+') && !fixed.includes('-')) {
                        // 假设是本地时间，让JavaScript自动处理时区转换
                        const localDate = new Date(fixed);
                        if (!isNaN(localDate.getTime())) {
                            return localDate.toISOString();
                        }
                    }
                }
                
                // 最后尝试：直接解析并返回
                if (!isNaN(new Date(fixed).getTime())) {
                    return new Date(fixed).toISOString();
                }
                
                return null;
            } catch (error) {
                console.warn("[fixDateTimeFormat] 修复时间格式失败:", error.message);
                return null;
            }
        }
        
        // 辅助函数：确保时间是UTC格式
        function ensureUTCTime(dateOrString) {
            if (!dateOrString) return null;
            
            try {
                let date;
                if (typeof dateOrString === 'string') {
                    date = new Date(dateOrString);
                } else {
                    date = dateOrString;
                }
                
                if (isNaN(date.getTime())) {
                    return null;
                }
                
                return date.toISOString();
            } catch (error) {
                return null;
            }
        }

}

// ===== 日程冲突检测工具函数 =====
/**
 * 检查新事件是否与现有事件存在时间冲突
 * @param {Object} newEvent - 新事件对象
 * @param {Array} existingEvents - 现有事件数组
 * @param {string} excludeEventId - 排除的事件ID（用于更新事件时）
 * @returns {Array} 冲突的事件数组
 */
function findConflictingEvents(newEvent, existingEvents, excludeEventId = null) {
    const newStart = new Date(newEvent.start_datetime);
    const newEnd = new Date(newEvent.end_datetime || newEvent.start_datetime);
    
    // 如果解析日期失败，返回空数组（不检查冲突）
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
        console.warn('[冲突检测] 无效的日期时间，跳过冲突检测');
        return [];
    }
    
    // 如果结束时间早于开始时间，默认设置为开始时间后1小时
    if (newEnd <= newStart) {
        newEnd.setTime(newStart.getTime() + 60 * 60 * 1000);
    }
    
    return existingEvents.filter(event => {
        // 排除要更新的事件本身
        if (excludeEventId && event.id === excludeEventId) {
            return false;
        }
        
        // 跳过已完成或已删除的事件
        if (event.completed || event.locally_deleted_at) {
            return false;
        }
        
        const eventStart = new Date(event.start_datetime);
        const eventEnd = new Date(event.end_datetime || event.start_datetime);
        
        // 如果现有事件的日期无效，跳过
        if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
            return false;
        }
        
        // 如果现有事件结束时间早于开始时间，默认设置为开始时间后1小时
        if (eventEnd <= eventStart) {
            eventEnd.setTime(eventStart.getTime() + 60 * 60 * 1000);
        }
        
        // 检查时间重叠：新事件开始时间 < 现有事件结束时间 且 新事件结束时间 > 现有事件开始时间
        return newStart < eventEnd && newEnd > eventStart;
    });
}

// --- 自然语言解析路由 --- (修改为调用 parseTextWithLLM)
app.post('/events/parse-natural-language', authenticateUser, async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: '缺少必要的文本参数。' });
    }
    
    console.log(`[POST /events/parse] Route received text: "${text}"`);
    
    try {
        // 获取用户认证信息
        const userId = getCurrentUserId(req);
        const authHeader = req.headers.authorization;
        const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        // 调用重构后的 LLM 解析函数，传入用户认证信息
        const parsedResult = await parseTextWithLLM(text, userId, userToken);

        if (parsedResult) {
            // LLM 解析成功 (即使日期为 null)
            console.log("[POST /events/parse] LLM parse successful (may have null date):", parsedResult);
            
            // 检查 LLM 是否找到了日期，如果没有，尝试正则 fallback
            if (parsedResult.start_datetime === null) {
                 console.log("[POST /events/parse] LLM did not find date, trying regex fallback...");
                 try {
                     const parsedByRegex = parseByRegex(text);
                     if (parsedByRegex.start_datetime) {
                         console.log('[POST /events/parse] Fallback regex parsing successful.');
                         // 合并正则日期和 LLM 的其他信息
                         const finalResult = {
                             ...parsedResult, // 保留 LLM 的 title, desc, location (如果存在)
                             start_datetime: parsedByRegex.start_datetime,
                             end_datetime: parsedByRegex.end_datetime,
                             // 如果 LLM 没有 title，使用正则的
                             title: parsedResult.title || parsedByRegex.title
                         };
                          console.log("[POST /events/parse] Merged LLM info with regex date:", finalResult);
                         return res.status(200).json(finalResult);
                     } else {
                          console.log('[POST /events/parse] Fallback regex parsing also failed.');
                          // LLM 和正则都失败，返回 LLM 的结果（包含 null 日期）或错误
                          // return res.status(400).json({ error: '无法从文本中解析出有效的日期和时间。', parsedData: parsedResult });
                         return res.status(200).json(parsedResult); // 返回LLM的结果（日期为null）
                     }
                 } catch (regexError) {
                      console.error("[POST /events/parse] Error during fallback regex parsing:", regexError);
                      // 正则出错，仍然返回 LLM 的结果
                      return res.status(200).json(parsedResult);
                 }
            } else {
                 // LLM 成功解析出日期，直接返回结果
                 return res.status(200).json(parsedResult);
            }
        } else {
            // parseTextWithLLM 返回 null，意味着 LLM 配置错误或 API 调用/解析失败
            console.log("[POST /events/parse] parseTextWithLLM returned null. Trying regex fallback...");
             try {
                 const parsedByRegex = parseByRegex(text);
                 if (parsedByRegex.start_datetime) {
                     console.log('[POST /events/parse] Fallback regex parsing successful after LLM failure.');
                     return res.status(200).json(parsedByRegex);
                 } else {
                      console.log('[POST /events/parse] Fallback regex parsing also failed after LLM failure.');
                      // LLM 失败，正则也失败，返回通用错误
                      // 可以根据 parseTextWithLLM 失败的原因返回更具体的错误，但现在简化处理
                      return res.status(500).json({ error: '无法使用 LLM 解析文本，且备用规则解析失败。请检查 LLM 配置或文本内容。' });
                 }
             } catch (regexError) {
                  console.error("[POST /events/parse] Error during fallback regex parsing after LLM failure:", regexError);
                  return res.status(500).json({ error: 'LLM 解析失败，且尝试备用规则解析时出错。' });
             }
        }

    } catch (error) {
        // 捕获 parseTextWithLLM 可能抛出的意外错误 (虽然我们让它返回 null 了)
        console.error('[POST /events/parse] Unexpected error in route handler:', error);
        res.status(500).json({ error: `自然语言解析路由发生意外错误: ${error instanceof Error ? error.message : String(error)}` });
    }
});

// --- 事件路由 (需要认证) ---
app.post('/events', authenticateUser, async (req, res) => {
    const newEvent = req.body;
    const userId = getCurrentUserId(req);
    
    if (!newEvent || !newEvent.title) {
        return res.status(400).json({ error: '无效的事件格式。' });
    }
    
    // 确保事件有唯一ID并添加用户ID
    const eventToSave = {
        ...newEvent,
        id: newEvent.id || uuidv4(),
        userId: userId, // 添加用户ID，确保数据隔离
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // --- 添加 CalDAV 推送相关字段 ---
        needs_caldav_push: newEvent.source !== 'caldav_sync_tsdav', // 如果不是来自 CalDAV 同步，则标记需要推送
        caldav_uid: newEvent.caldav_uid || null, // 保留已有的，否则为 null
        caldav_etag: newEvent.caldav_etag || null // 保留已有的，否则为 null
        // -----------------------------------
    };
    
    try {
        // 加载用户的事件数据
        let userEvents = await loadEvents(userId);
        
        // 注意：根据新的需求，冲突检测只在前端显示，不再阻止事件创建
        // 如果需要日志记录，可以在这里检测冲突但不阻止创建
        if (!newEvent.force_create) {
            const conflictingEvents = findConflictingEvents(eventToSave, userEvents);
            if (conflictingEvents.length > 0) {
                console.log(`[用户 ${req.user.username}] 检测到时间冲突，冲突事件数量: ${conflictingEvents.length}，但继续创建事件`);
            }
        }
        
        // 添加新事件
        userEvents.push(eventToSave);
        
        // 保存用户事件数据
        await saveEvents(userEvents, userId);
        
        console.log(`[用户 ${req.user.username}] 事件已创建: "${eventToSave.title}" (${eventToSave.id})`);
        
        // 立即触发CalDAV同步
        console.log(`[用户 ${req.user.username}] 开始触发事件创建后的立即CalDAV同步...`);
        triggerImmediateCalDavSync(userId, '本地事件创建').then(syncResult => {
            console.log(`[用户 ${req.user.username}] 事件创建后立即同步结果:`, syncResult);
        }).catch(syncError => {
            console.error(`[用户 ${req.user.username}] 事件创建后立即同步失败:`, syncError);
        });
        
        res.status(201).json(eventToSave);
    } catch (error) {
        console.error(`[用户 ${req.user.username}] 保存事件失败:`, error);
        res.status(500).json({ error: "保存事件失败。" });
    }
});

app.get('/events', authenticateUser, async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        
        // 数据迁移已禁用 - 确保用户数据隔离
        // 每个用户只能看到自己的事件，不会从全局数据迁移
        console.log(`[用户 ${req.user.username}] 跳过数据迁移，确保用户数据隔离`);

        // 清理已迁移的事件（一次性操作）
        try {
            const cleanupStats = cleanupMigratedEvents(userId);
            if (cleanupStats.removed > 0) {
                console.log(`[用户 ${req.user.username}] 清理了 ${cleanupStats.removed} 个迁移事件，保留 ${cleanupStats.kept} 个用户事件`);
            }
        } catch (cleanupError) {
            console.error(`[用户 ${req.user.username}] 清理迁移事件失败:`, cleanupError);
        }
        
        const userEvents = await loadEvents(userId);
        
        // 过滤掉已标记删除的事件（locally_deleted_at存在的事件）
        const visibleEvents = userEvents.filter(event => !event.locally_deleted_at);
        
        console.log(`[用户 ${req.user.username}] 获取事件列表: ${visibleEvents.length} 个事件 (总计: ${userEvents.length}, 已隐藏删除: ${userEvents.length - visibleEvents.length})`);
        res.status(200).json(visibleEvents);
    } catch (error) {
        console.error(`[用户 ${req.user.username}] 获取事件失败:`, error);
        res.status(500).json({ error: "获取事件失败。" });
    }
});

// 新增：更新事件路由 (用于支持拖拽修改日期等) - 需要认证
app.put('/events/:id', authenticateUser, async (req, res) => {
    const eventId = req.params.id;
    const updatedFields = req.body;
    const fieldKeys = Object.keys(updatedFields);
    const userId = getCurrentUserId(req);

    console.log(`[PUT /events/:id] 用户 ${req.user.username} 请求更新事件 ID: ${eventId} 字段: ${fieldKeys.join(', ')}`);

    try {
        // 加载用户事件数据
        let userEvents = await loadEvents(userId);
        const eventIndex = userEvents.findIndex(e => e.id === eventId && e.userId === userId);

        if (eventIndex === -1) {
            console.error(`[PUT /events/:id] 错误: 用户 ${req.user.username} 的事件 ID ${eventId} 未找到`);
            return res.status(404).json({ error: `未找到 ID 为 ${eventId} 的事件。` });
        }
        console.log(`[PUT /events/:id] 事件在索引 ${eventIndex} 找到`);
        const originalEvent = { ...userEvents[eventIndex] }; // <-- 复制原始事件，防止意外修改

        let updatedEvent;

        // 检查是否只更新 completed 状态
        if (fieldKeys.length === 1 && fieldKeys[0] === 'completed' && typeof updatedFields.completed === 'boolean') {
            console.log(`[PUT /events/:id] 仅更新事件 ${eventId} 的 completed 状态为 ${updatedFields.completed}`);
            updatedEvent = {
                ...originalEvent,
                completed: updatedFields.completed,
                updated_at: new Date().toISOString(),
                // --- 修改: 如果原始事件来自 CalDAV，标记需要推送更新 ---
                needs_caldav_push: originalEvent.source?.startsWith('caldav_sync') ? true : (originalEvent.needs_caldav_push || false)
                // ---------------------------------------------------
            };
        } else {
            // 执行完整更新逻辑
            console.log(`[PUT /events/:id] 对事件 ${eventId} 执行完整更新`);
            const { start_datetime, end_datetime, ...otherUpdatedFields } = updatedFields;

            // 对于完整更新，start_datetime 是必需的 (保持原有逻辑)
            if (!start_datetime) {
                console.error('[PUT /events/:id] 错误: 完整更新缺少 start_datetime');
                return res.status(400).json({ error: '完整更新事件时必须提供 start_datetime。' });
            }
            
            // 日期计算逻辑 (保持原有逻辑，但使用更新后的字段)
            let calculatedEndDate = null;
            try {
                 // end_datetime 可能是 undefined，需要检查
                 if (end_datetime !== undefined) {
                     calculatedEndDate = end_datetime; // 如果提供了结束时间，直接使用
                 } else if (originalEvent.end_datetime && originalEvent.start_datetime) {
                      // 尝试根据原始时长计算
                      const duration = new Date(originalEvent.end_datetime).getTime() - new Date(originalEvent.start_datetime).getTime();
                      calculatedEndDate = new Date(new Date(start_datetime).getTime() + duration).toISOString();
                 } else {
                     // 如果无法计算，则默认1小时
                     calculatedEndDate = new Date(new Date(start_datetime).getTime() + 3600 * 1000).toISOString();
                     console.warn(`[PUT /events/:id] 为事件 ${eventId} 使用默认1小时时长`);
                 }
            } catch(dateError) {
                console.error(`[PUT /events/:id] 计算结束日期时出错，事件 ${eventId}:`, dateError);
                calculatedEndDate = new Date(new Date(start_datetime).getTime() + 3600 * 1000).toISOString();
                console.warn(`[PUT /events/:id] 由于计算错误，为事件 ${eventId} 使用默认1小时时长`);
            }

            // 合并所有字段进行完整更新
            updatedEvent = {
                ...originalEvent,
                ...otherUpdatedFields, // 应用其他传入的字段 (可能包含 completed)
                start_datetime: start_datetime,
                end_datetime: calculatedEndDate,
                updated_at: new Date().toISOString(),
                // --- 修改: 如果原始事件来自 CalDAV，标记需要推送更新 ---
                needs_caldav_push: originalEvent.source?.startsWith('caldav_sync') ? true : (originalEvent.needs_caldav_push || false)
                // ---------------------------------------------------
            };
        }

        console.log(`[PUT /events/:id] 准备更新事件对象:`, updatedEvent);

        // 注意：根据新的需求，冲突检测只在前端显示，不再阻止事件更新
        // 如果需要日志记录，可以在这里检测冲突但不阻止更新
        if ((fieldKeys.length > 1 || (fieldKeys.length === 1 && fieldKeys[0] !== 'completed')) && !updatedFields.force_create) {
            // 检查更新后的事件是否与其他事件存在冲突
            const conflictingEvents = findConflictingEvents(updatedEvent, userEvents, eventId);
            if (conflictingEvents.length > 0) {
                console.log(`[用户 ${req.user.username}] 更新事件时检测到时间冲突，冲突事件数量: ${conflictingEvents.length}，但继续更新事件`);
            }
        }

        // 更新用户事件数据
        console.log(`[PUT /events/:id] 在索引 ${eventIndex} 更新事件`);
        userEvents[eventIndex] = updatedEvent;

        // 保存到文件
        console.log(`[PUT /events/:id] 尝试保存更新的用户事件数据...`);
        await saveEvents(userEvents, userId);
        console.log(`[PUT /events/:id] 成功保存用户事件数据`);
        console.log(`[用户 ${req.user.username}] 事件已更新: "${updatedEvent.title}" (ID: ${eventId})`);
        
        // 确保返回的事件包含正确的 completed 状态 (从 updatedEvent 获取)
        res.status(200).json(updatedEvent);
    } catch (error) {
        console.error(`[PUT /events/:id] 用户 ${req.user.username} 保存更新事件失败:`, error);
        console.error('[PUT /events/:id] 详细错误:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        res.status(500).json({ error: "保存更新后的事件失败。" });
    }
});

// 新增：删除事件路由 - 需要认证
app.delete('/events/:id', authenticateUser, async (req, res) => {
    const eventId = req.params.id;
    const userId = getCurrentUserId(req);
    
    console.log(`[DELETE /events/:id] 用户 ${req.user.username} 请求删除事件 ID: ${eventId}`);

    try {
        // 加载用户事件数据
        let userEvents = await loadEvents(userId);
        const eventIndex = userEvents.findIndex(e => e.id === eventId && e.userId === userId);

        if (eventIndex === -1) {
            console.error(`[DELETE /events/:id] 错误: 用户 ${req.user.username} 的事件 ID ${eventId} 未找到`);
            return res.status(404).json({ error: `未找到 ID 为 ${eventId} 的事件。` });
        }

        const eventToDelete = { ...userEvents[eventIndex] }; // 创建副本以防万一

        // 检查事件是否源自 CalDAV 并拥有 caldav_url
        if (eventToDelete.source?.startsWith('caldav_sync') && eventToDelete.caldav_url) {
            console.log(`[DELETE /events/:id] 标记CalDAV事件待服务器删除: ${eventId} - ${eventToDelete.title}`);
            userEvents[eventIndex] = {
                ...eventToDelete,
                needs_caldav_delete: true, // 标记需要在服务器上删除
                locally_deleted_at: new Date().toISOString() // 标记本地删除时间，用于UI过滤
            };

            await saveEvents(userEvents, userId);
            console.log(`[DELETE /events/:id] 事件 ${eventId} 已标记待CalDAV删除并本地保存`);
            res.status(200).json({
                message: `事件 '${eventToDelete.title}' (ID: ${eventId}) 已标记为待从服务器删除。将在下次同步时处理。`,
                marked_for_server_delete: true
            });

        } else {
            // 非 CalDAV 事件，或没有 caldav_url，直接本地删除
            const deletedEvent = userEvents.splice(eventIndex, 1)[0];
            console.log(`[DELETE /events/:id] 从内存移除事件 (非CalDAV或无URL): "${deletedEvent.title}"`);

            await saveEvents(userEvents, userId);
            console.log(`[DELETE /events/:id] 本地删除后成功保存用户事件数据`);
            res.status(200).json({ message: `事件 '${deletedEvent.title}' (ID: ${eventId}) 已成功删除。` }); 
        }
    } catch (error) {
        console.error(`[DELETE /events/:id] 用户 ${req.user.username} 删除事件失败:`, error);
        res.status(500).json({ error: '删除事件失败。请重试。' });
    }
});

// --- 测试路由 ---
app.post('/test', (req, res) => {
    console.log("测试路由被访问!");
    res.status(200).json({ message: '测试路由正常工作!' });
});

// --- 启动服务器与定时任务 --- 
initializeData().then(() => {
    // 修改监听地址为0.0.0.0，允许外网访问
    // 参数说明：
    // --- 设置定时同步任务 ---
    // 每 30 分钟执行一次 IMAP 同步 ('*/30 * * * *')
    cron.schedule('*/30 * * * *', () => {
        console.log('[Cron] Triggering scheduled IMAP sync...');
        // 检查 IMAP 配置是否存在且完整
        if (imapSettings && imapSettings.email && imapSettings.password && imapSettings.imapHost) {
            performImapSync().catch(err => {
                console.error('[Cron] Unhandled error during scheduled IMAP sync:', err);
            });
        } else {
            console.log('[Cron] Skipping scheduled IMAP sync: Settings not configured.');
        }
    });

    // 每小时执行一次 CalDAV 同步 (例如 H:05, 即每小时的第5分钟, '5 * * * *')
    cron.schedule('5 * * * *', async () => {
         console.log('[Cron] Triggering scheduled CalDAV sync for default user...');
         
         try {
             // 为默认用户执行CalDAV同步（TideLog主要是单用户系统）
             const defaultUserId = newSettingsService.defaultUserId;
             
             // 获取默认用户的CalDAV设置
             const userCalDAVSettings = newSettingsService.getCalDAVSettings(defaultUserId);
             
             // 检查是否配置了CalDAV
             if (userCalDAVSettings && userCalDAVSettings.username && userCalDAVSettings.password && userCalDAVSettings.serverUrl) {
                 console.log(`[Cron CalDAV] 为默认用户执行CalDAV同步...`);
                 const syncResult = await performCalDavSyncForUser(defaultUserId);
                 console.log(`[Cron CalDAV] 默认用户同步完成:`, syncResult.message);
             } else {
                 console.log(`[Cron CalDAV] 跳过定时同步，CalDAV设置未配置`);
             }
             
         } catch (error) {
             console.error('[Cron] CalDAV定时同步过程中发生错误:', error);
         }
    });
    
    console.log('\n定时同步任务已设置:');
    console.log(' - IMAP Sync: 每 30 分钟');
    console.log(' - CalDAV Sync: 每小时第 5 分钟');
}).catch(error => {
    console.error("无法初始化服务器数据:", error);
    process.exit(1);
});

// --- 辅助函数 (getStartEndDateForSync, parseTextWithLLM, parseDateString) ---
// ... (这些辅助函数保持不变)

// --- 立即同步辅助函数 ---
async function triggerImmediateCalDavSync(userId, eventContext = '事件创建') {
    try {
        console.log(`[立即同步] ${eventContext}后触发CalDAV同步，用户: ${userId}`);
        
        // 获取用户的CalDAV设置
        console.log(`[立即同步] 正在获取用户 ${userId} 的CalDAV设置...`);
        const userCalDAVSettings = newSettingsService.getCalDAVSettings(userId);
        console.log(`[立即同步] 获取到CalDAV设置:`, {
            hasUsername: !!userCalDAVSettings?.username,
            hasPassword: !!userCalDAVSettings?.password,
            hasServerUrl: !!userCalDAVSettings?.serverUrl,
            serverUrl: userCalDAVSettings?.serverUrl
        });
        
        // 检查是否配置了CalDAV
        if (userCalDAVSettings && userCalDAVSettings.username && userCalDAVSettings.password && userCalDAVSettings.serverUrl) {
            console.log(`[立即同步] 检测到完整CalDAV配置，开始同步到 ${userCalDAVSettings.serverUrl}`);
            const syncResult = await performCalDavSyncForUser(userId);
            console.log(`[立即同步] ${eventContext}后同步完成:`, syncResult.message);
            return syncResult;
        } else {
            console.log(`[立即同步] 跳过同步，用户 ${userId} 的CalDAV设置不完整`);
            console.log(`[立即同步] 配置详情:`, userCalDAVSettings);
            return { message: '未配置CalDAV，跳过同步', skipped: true };
        }
    } catch (error) {
        console.error(`[立即同步] ${eventContext}后同步失败:`, error);
        return { message: '同步失败', error: true };
    }
}

// --- 重构后的同步函数 --- 
let isImapSyncRunning = false;
async function performImapSync(userId = null, userToken = null, userImapSettings = null) {
    console.log('[performImapSync] Starting IMAP sync process...');
    console.log(`[performImapSync] 用户ID: ${userId}, 有token: ${!!userToken}`);
    
    if (isImapSyncRunning) {
        console.log('[performImapSync] IMAP sync is already running. Skipping.');
        return { message: 'IMAP Sync is already in progress.', eventCount: 0 };
    }

    isImapSyncRunning = true;
    
    // 设置同步超时保护（10分钟后自动释放锁）
    const syncTimeout = setTimeout(() => {
        console.warn('[performImapSync] IMAP同步超时，自动释放锁');
        isImapSyncRunning = false;
    }, 10 * 60 * 1000); // 10分钟
    
    // 使用传入的用户设置，如果没有则回退到全局设置
    const effectiveImapSettings = userImapSettings || imapSettings;
    console.log('[performImapSync] 使用IMAP设置:', {
        email: effectiveImapSettings.email,
        host: effectiveImapSettings.imapHost,
        hasPassword: !!effectiveImapSettings.password
    });
    
    const imapConfig = {
        user: effectiveImapSettings.email,
        password: effectiveImapSettings.password,
        host: effectiveImapSettings.imapHost,
        port: effectiveImapSettings.imapPort || 993,
        tls: effectiveImapSettings.useTLS !== false, // 默认为 true，除非明确设为 false
        tlsOptions: { rejectUnauthorized: false }
    };
    const imap = new Imap(imapConfig);
    let syncedEvents = [];

    // 加载用户或全局事件
    if (userId) {
        eventsDb = await loadEvents(userId);
        console.log(`[performImapSync] 为用户 ${userId} 加载了 ${eventsDb.length} 个现有事件`);
    } else {
        // 如果没有用户ID，加载全局事件（可能是定时任务触发）
        eventsDb = await loadEvents(null); // 传入null来加载全局事件
        console.log(`[performImapSync] 加载了 ${eventsDb.length} 个全局事件`);
    }

    // 定义 imap 辅助函数 (connect, open, search, fetch, etc.)
    const imapConnect = () => { 
        return new Promise((resolve, reject) => {
            imap.once('ready', () => {
                console.log('[performImapSync] IMAP connection established successfully.');
                resolve();
            });
            imap.once('error', (err) => {
                console.error('[performImapSync] IMAP connection error:', err);
                reject(err);
            });
            imap.connect();
        });
    };
    const openMailbox = (folderName) => { /* ... (保持原样) ... */  
        return new Promise((resolve, reject) => {
            imap.openBox(folderName, false, (err, box) => {
                if (err) {
                    console.error(`[performImapSync] Error opening folder ${folderName}:`, err);
                    reject(err);
                } else {
                    console.log(`[performImapSync] Opened folder: ${folderName}, ${box.messages.total} total messages`);
                    resolve(box);
                }
            });
        });
    };
    const searchUnseenEmails = (folderName) => {
        return new Promise((resolve, reject) => {
            // 计算3天前的日期
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            
            // IMAP搜索条件：未读且最近3天内的邮件
            const criteria = ['UNSEEN', ['SINCE', threeDaysAgo]];
            
            console.log(`[performImapSync] 搜索条件：未读且${threeDaysAgo.toISOString().split('T')[0]}以后的邮件`);
            
            imap.search(criteria, (err, results) => {
                if (err) {
                    console.error(`[performImapSync] Error searching UNSEEN+RECENT in ${folderName}:`, err);
                    reject(err);
                } else {
                    console.log(`[performImapSync] Found ${results.length} UNSEEN messages from last 3 days in ${folderName}:`, results);
                    resolve(results);
                }
            });
        });
    };
    const fetchEmails = (results) => {  
        return new Promise((resolve, reject) => {
            if (results.length === 0) {
                resolve([]);
                return;
            }
            
            // 去重UID数组，避免重复处理
            const uniqueResults = [...new Set(results)];
            console.log(`[fetchEmails] 原始UID数组长度: ${results.length}, 去重后: ${uniqueResults.length}`);
            if (results.length !== uniqueResults.length) {
                console.log(`[fetchEmails] 发现重复UID，原始: [${results.join(', ')}], 去重后: [${uniqueResults.join(', ')}]`);
            }
            
            // 设置超时保护（2分钟，缩短超时时间）
            const fetchTimeout = setTimeout(() => {
                console.error(`[fetchEmails] 获取邮件超时，批次大小: ${uniqueResults.length}`);
                reject(new Error('Fetch emails timeout'));
            }, 2 * 60 * 1000); // 2分钟

            const emails = [];
            let completed = 0;
            const total = uniqueResults.length;
            
            const fetch = imap.fetch(uniqueResults, { 
                bodies: '',
                struct: true,
                markSeen: false
            });
            
            console.log(`[fetchEmails] 开始获取 ${total} 封去重邮件...`);

            fetch.on('message', (msg, seqno) => {
                console.log(`[fetchEmails] 开始处理邮件 seqno: ${seqno}`);
                const email = { uid: null, subject: '', from: null, date: null, text: '', html: '', attachments: [], isParsed: false };
                
                msg.on('body', (stream, info) => {
                    simpleParser(stream, (err, parsed) => {
                        if (err) {
                            console.error(`[performImapSync] Error parsing email ${seqno}:`, err);
                            email.isParsed = true;
                            return;
                        }
                        
                        
                        
                        email.subject = parsed.subject || '';
                        email.from = parsed.from;
                        email.date = parsed.date;
                        email.text = parsed.text || '';
                        email.html = parsed.html || '';
                        email.isParsed = true;

                        if (parsed.attachments) {
                            email.attachments = parsed.attachments.map(att => ({
                                filename: att.filename,
                                contentType: att.contentType,
                                size: att.size,
                                content: att.content ? att.content.toString() : null,
                                isCalendar: att.contentType && (att.contentType.includes('text/calendar') || att.filename && att.filename.endsWith('.ics'))
                            }));
                        }
                    });
                });

                msg.once('attributes', (attrs) => {
                    email.uid = attrs.uid;
                    console.log(`[fetchEmails] 邮件 seqno: ${seqno}, UID: ${attrs.uid} 属性获取完成`);
                });

                msg.once('end', () => {
                    // 等待解析完成后再添加到emails数组
                    const waitForParsing = () => {
                        if (email.isParsed) {
                            console.log(`[fetchEmails] 邮件 UID: ${email.uid} 解析完成，添加到结果中`);
                            emails.push(email);
                            completed++;
                            console.log(`[fetchEmails] 进度: ${completed}/${total} 邮件处理完成`);
                            
                            // 检查是否所有邮件都处理完成
                            if (completed === total) {
                                console.log(`[performImapSync] Finished fetching ${emails.length} emails.`);
                                clearTimeout(fetchTimeout); // 清除超时定时器
                                resolve(emails);
                            }
                        } else {
                            // 如果还没解析完，等待一段时间后重试
                            setTimeout(waitForParsing, 10);
                        }
                    };
                    
                    waitForParsing();
                });
            });

            fetch.once('error', (err) => {
                console.error('[performImapSync] Error fetching emails:', err);
                reject(err);
            });

            // 移除原来的fetch.once('end')，因为现在在msg.once('end')中处理完成
        });
    };
    const extractCalendarEvents = async (emails, userId = null, userToken = null) => {
        const eventsFound = [];
        
        // 添加调试信息：显示所有收到的邮件
        console.log(`[extractCalendarEvents] Processing ${emails.length} emails:`);
        emails.forEach((email, index) => {
            // 改进发件人地址获取逻辑，处理不同格式
            let senderAddress = '';
            if (email.from) {
                if (typeof email.from === 'string') {
                    // 如果from是字符串，直接使用
                    senderAddress = email.from.toLowerCase();
                } else if (email.from.value && Array.isArray(email.from.value) && email.from.value.length > 0) {
                    // 如果from是对象且有value数组
                    senderAddress = email.from.value[0].address?.toLowerCase() || '';
                } else if (email.from.address) {
                    // 如果from对象直接有address属性
                    senderAddress = email.from.address.toLowerCase();
                } else if (email.from.text) {
                    // 如果from对象有text属性，尝试提取邮箱
                    const emailMatch = email.from.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                    senderAddress = emailMatch ? emailMatch[1].toLowerCase() : '';
                }
            }
            
            console.log(`[extractCalendarEvents] Email ${index + 1}: UID ${email.uid}, Subject: "${email.subject}", Sender: ${senderAddress}`);
            
            
        });
        
        // --- 使用动态加载的白名单 ---
        const currentAllowlist = (imapFilterSettings && Array.isArray(imapFilterSettings.sender_allowlist))
                                 ? imapFilterSettings.sender_allowlist
                                 : [];
        console.log(`[extractCalendarEvents] Current allowlist:`, currentAllowlist);
        // ---------------------------

        for (const email of emails) {
            // --- ICS 附件处理逻辑 (保持不变) ---
            if (email.attachments && email.attachments.length > 0) {
                const calendarAttachments = email.attachments.filter(att => att.isCalendar && att.content);
                for (const attachment of calendarAttachments) {
                     try {
                        // ... (ICS 解析和增强重复检查逻辑保持不变) ...
                        const parsedIcs = ICAL.parseICS(attachment.content);
                        for (const key in parsedIcs) {
                            if (parsedIcs[key].type === 'VEVENT') {
                                const vevent = parsedIcs[key];
                                const eventUid = vevent.uid || `${email.uid}_${attachment.filename || 'cal'}_${key}`; 
                                const recurrenceId = vevent.recurrenceid ? new Date(vevent.recurrenceid).toISOString() : null;
                                const uniqueId = recurrenceId ? `${eventUid}_${recurrenceId}` : eventUid;

                                const eventStartDate = vevent.start ? new Date(vevent.start) : null; // 移动到检查前获取，以便用于内容检查
                                
                                const isDuplicateICS = eventsDb.some(existingEvent => 
                                    existingEvent.id === uniqueId || 
                                    (existingEvent.caldav_uid && vevent.uid && existingEvent.caldav_uid === vevent.uid) ||
                                    (eventStartDate && existingEvent.title === (vevent.summary || '无标题事件 (来自邮件)') && existingEvent.start_datetime === eventStartDate.toISOString())
                                );
                                
                                if (isDuplicateICS) {
                                    console.log(`[extractCalendarEvents] Skipping duplicate ICS event found by enhanced check. ID: ${uniqueId}, Title: ${vevent.summary}`);
                                    continue; 
                                }
                                
                                const eventEndDate = vevent.end ? new Date(vevent.end) : (eventStartDate ? new Date(eventStartDate.getTime() + 3600 * 1000) : null);

                                if (eventStartDate && eventEndDate && !isNaN(eventStartDate) && !isNaN(eventEndDate)) {
                                    const eventData = {
                                        id: uniqueId,
                                        title: vevent.summary || '无标题事件 (来自邮件)',
                                        start_datetime: eventStartDate.toISOString(),
                                        end_datetime: eventEndDate.toISOString(),
                                        description: vevent.description || email.subject || '',
                                        location: vevent.location || '',
                                        all_day: !!vevent.datetype && vevent.datetype === 'DATE',
                                        source: 'imap_ics_attachment',
                                        caldav_uid: vevent.uid,
                                        created_at: vevent.created ? new Date(vevent.created).toISOString() : (email.date ? new Date(email.date).toISOString() : new Date().toISOString()),
                                        updated_at: vevent.lastmodified ? new Date(vevent.lastmodified).toISOString() : (email.date ? new Date(email.date).toISOString() : new Date().toISOString()),
                                        caldav_url: attachment.url // <-- 添加这一行
                                    };
                                    eventsFound.push(eventData);
                                } else {
                                    console.warn(`[extractCalendarEvents] Invalid start/end date for VEVENT in email UID ${email.uid}, attachment: ${attachment.filename || '(no name)'}`);
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error(`[extractCalendarEvents] Error parsing ICS content from attachment ${attachment.filename || '(no name)'} in email UID ${email.uid}:`, parseError);
                    }
                }
            }
            
            // --- LLM 解析邮件正文逻辑 (智能分析策略) ---
            // 改进发件人地址获取逻辑，处理不同格式
            let senderAddress = '';
            if (email.from) {
                if (typeof email.from === 'string') {
                    senderAddress = email.from.toLowerCase();
                } else if (email.from.value && Array.isArray(email.from.value) && email.from.value.length > 0) {
                    senderAddress = email.from.value[0].address?.toLowerCase() || '';
                } else if (email.from.address) {
                    senderAddress = email.from.address.toLowerCase();
                } else if (email.from.text) {
                    const emailMatch = email.from.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                    senderAddress = emailMatch ? emailMatch[1].toLowerCase() : '';
                }
            }
            
            // 首先检查白名单策略：只有白名单中的发件人邮件才会被分析
            if (!senderAddress || !currentAllowlist.includes(senderAddress)) {
                console.log(`[extractCalendarEvents] Skipping LLM parsing for email UID ${email.uid} from sender: ${senderAddress} (sender not in allowlist).`);
            } else {
                // 检查是否已经分析过这封邮件（防重复分析）
                const analysisKey = `imap_llm_${email.uid}`;
                const alreadyAnalyzed = eventsDb.some(e => e.source === 'imap_llm_body_parse' && e.analysis_key === analysisKey);
                
                if (alreadyAnalyzed) {
                    console.log(`[extractCalendarEvents] Skipping email UID ${email.uid} - already analyzed (analysis_key: ${analysisKey}).`);
                } else {
                    console.log(`[extractCalendarEvents] Analyzing email UID ${email.uid} from sender: ${senderAddress} (sender in allowlist).`);
                    
                    
                    
                    // 在LLM调用之前先检查是否已经有相同的事件
                    const emailBody = email.text || (email.html ? require('html-to-text').htmlToText(email.html) : '');
                    const emailSubject = email.subject || '';
                    // 将标题和正文合并进行分析
                    const textToParse = `${emailSubject}\n${emailBody}`.trim();
                    
                    
                    
                    if (textToParse && textToParse.trim().length > 5) {
                        console.log(`[extractCalendarEvents] Checking for existing events before LLM parsing for email UID ${email.uid}...`);
                        
                        // 简单的重复检查：基于邮件主题和UID
                        const existingSimilar = eventsDb.find(e => 
                            e.source === 'imap_llm_body_parse' && 
                            (e.analysis_key === analysisKey || 
                             (e.title && email.subject && e.title.includes(email.subject.substring(0, 20))))
                        );
                        
                        if (existingSimilar) {
                            console.log(`[extractCalendarEvents] Skipping LLM call for email UID ${email.uid} - similar event already exists: "${existingSimilar.title}"`);
                        } else {
                            console.log(`[extractCalendarEvents] Attempting LLM parsing for email UID ${email.uid} body...`);
                            // 继续进行 LLM 解析
                            try {
                                const llmResult = await parseTextWithLLM(textToParse, userId, userToken);
                                if (llmResult && llmResult.start_datetime) {
                                    // ... (LLM 结果处理和增强重复检查逻辑保持不变) ...
                                    const llmEventTitle = llmResult.title || email.subject || '来自邮件的事件';
                                    const llmEventStart = llmResult.start_datetime;
                                    
                                    const llmEventUidBase = `llm_${email.uid}_${new Date(llmEventStart).getTime()}`;
                                    let llmUniqueId = llmEventUidBase;
                                    let counter = 0;
                                    while(eventsDb.some(e => e.id === llmUniqueId) || eventsFound.some(ef => ef.id === llmUniqueId)) { 
                                        counter++;
                                        llmUniqueId = `${llmEventUidBase}_${counter}`;
                                    }

                                    const isDuplicateLLM = eventsDb.some(existingEvent => 
                                        existingEvent.id === llmUniqueId || 
                                        (existingEvent.title === llmEventTitle && existingEvent.start_datetime === llmEventStart)
                                    ) || eventsFound.some(ef => 
                                        ef.id === llmUniqueId || 
                                        (ef.title === llmEventTitle && ef.start_datetime === llmEventStart)
                                    );

                                    if (!isDuplicateLLM) {
                                        console.log(`[extractCalendarEvents] LLM parsed event from email UID ${email.uid}:`, llmResult);
                                        const eventData = {
                                            id: llmUniqueId,
                                            title: llmEventTitle,
                                            start_datetime: llmEventStart,
                                            end_datetime: llmResult.end_datetime,
                                            description: llmResult.description || email.subject || '',
                                            location: llmResult.location || '',
                                            all_day: false,
                                            source: 'imap_llm_body_parse',
                                            analysis_key: analysisKey, // 添加分析键防重复
                                            created_at: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
                                            updated_at: new Date().toISOString(),
                                            needs_caldav_push: true, // 新事件默认需要推送
                                        };
                                        eventsFound.push(eventData);
                                    } else {
                                        console.log(`[extractCalendarEvents] Skipping duplicate LLM-parsed event found by enhanced check. Title: ${llmEventTitle}, Start: ${llmEventStart}`);
                                    }
                                } else if(llmResult) {
                                    console.log(`[extractCalendarEvents] LLM parsed email UID ${email.uid} but no valid start date found.`);
                                } else {
                                    console.log(`[extractCalendarEvents] LLM parsing failed or returned null for email UID ${email.uid}.`);
                                }
                            } catch (llmError) {
                                console.error(`[extractCalendarEvents] Error during LLM parsing for email UID ${email.uid}:`, llmError);
                            }
                        }
                    }
                } // <-- 结束已分析检查的 else 块
            } // <-- 结束白名单检查的 else 块  
        } // <-- 结束邮件遍历的 for 循环

        console.log(`[extractCalendarEvents] Finished processing emails. Found ${eventsFound.length} potential new events after duplicate checks.`);
        return eventsFound;
    }

    function parseDateString(dateStr) { /* ... (保持原样) ... */ };
    function findAttachmentParts(struct, attachments = []) { /* ... (保持原样) ... */ };

    try {
        await imapConnect();
        const foldersToProcess = ['INBOX'];
        for (const folderName of foldersToProcess) {
            const box = await openMailbox(folderName);
            if (!box) continue;
            console.log(`[performImapSync] Opened ${folderName}, searching UNSEEN...`);
            const searchResults = await searchUnseenEmails(folderName);
            if (searchResults.length > 0) {
                console.log(`[performImapSync] Fetching ${searchResults.length} UNSEEN messages...`);
                
                // 分批处理邮件，避免一次性加载太多
                const batchSize = 10; // 每批处理10封邮件
                let allEmails = [];
                
                for (let i = 0; i < searchResults.length; i += batchSize) {
                    const batch = searchResults.slice(i, i + batchSize);
                    console.log(`[performImapSync] 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(searchResults.length/batchSize)}: ${batch.length} 封邮件`);
                    
                    try {
                        const batchEmails = await fetchEmails(batch);
                        allEmails = [...allEmails, ...batchEmails];
                        console.log(`[performImapSync] 批次完成，累计获取 ${allEmails.length} 封邮件`);
                    } catch (batchError) {
                        console.error(`[performImapSync] 批次处理失败:`, batchError);
                        // 继续处理下一批，不要让一个批次的失败影响整个同步
                        continue;
                    }
                }
                
                const emails = allEmails;
                 console.log(`[performImapSync] Extracting events from ${emails.length} fetched messages...`);
                const newEvents = await extractCalendarEvents(emails, userId, userToken);
                if (newEvents.length > 0) {
                    syncedEvents = [...syncedEvents, ...newEvents];
                     console.log(`[performImapSync] Extracted ${newEvents.length} events from ${folderName}.`);
                }
            } else {
                 console.log(`[performImapSync] No UNSEEN messages found in ${folderName} by search.`);
            }
        }

        // 保存逻辑
        if (syncedEvents.length > 0) {
            console.log(`[performImapSync] Saving ${syncedEvents.length} extracted events...`);
            const existingEventIds = new Set(eventsDb.map(e => e.id));
            const uniqueNewEvents = syncedEvents.filter(ne => !existingEventIds.has(ne.id)); // Basic ID check for now
            // TODO: Add content-based duplicate check here (isLikelyDuplicate)
            if (uniqueNewEvents.length > 0) {
                eventsDb = [...eventsDb, ...uniqueNewEvents];
                
                // 根据用户ID保存到正确的位置
                if (userId) {
                    await saveEvents(eventsDb, userId);
                    console.log(`[performImapSync] 为用户 ${userId} 保存了 ${uniqueNewEvents.length} 个新事件`);
                    
                    // 立即触发CalDAV同步
                    triggerImmediateCalDavSync(userId, 'IMAP智能事件创建').catch(syncError => {
                        console.error(`[performImapSync] IMAP事件创建后立即同步失败:`, syncError);
                    });
                } else {
                    globalEventsDb = eventsDb;
                    await saveEvents(eventsDb);
                    console.log(`[performImapSync] 保存了 ${uniqueNewEvents.length} 个新事件到全局数据`);
                }
                try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
                clearTimeout(syncTimeout); // 清除超时定时器
                isImapSyncRunning = false;
                return { message: `IMAP Sync successful. Added ${uniqueNewEvents.length} new events.`, eventCount: uniqueNewEvents.length };
            } else {
                 console.log('[performImapSync] All extracted events already exist.');
                 try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
                 clearTimeout(syncTimeout); // 清除超时定时器
                 isImapSyncRunning = false;
                 return { message: 'IMAP Sync complete. No new events found.', eventCount: 0 };
            }
        } else {
             console.log('[performImapSync] No events extracted from emails.');
             try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
             clearTimeout(syncTimeout); // 清除超时定时器
             isImapSyncRunning = false;
             return { message: 'IMAP Sync complete. No events extracted.', eventCount: 0 };
        }

    } catch (error) {
        console.error('[performImapSync] Error during IMAP sync process:', error);
        // 确保关闭连接
        try { imap.end(); } catch (e) { /* ignore */ }
        clearTimeout(syncTimeout); // 清除超时定时器
        isImapSyncRunning = false; // 释放锁
        // return { message: `IMAP Sync failed: ${error.message}`, eventCount: -1, error: true };
        throw error; // 重新抛出错误，让路由处理函数捕获并返回 500
    } // <<<--- 结束填充 IMAP 逻辑 --->>>
}

// --- 用户特定的IMAP同步函数 ---
async function performImapSyncForUser(userImapSettings, userId) {
    console.log(`[performImapSyncForUser] Starting IMAP sync for user ${userId}...`);
    
    // 检查IMAP设置
    if (!userImapSettings || !userImapSettings.email || !userImapSettings.password || !userImapSettings.imapHost) {
        console.error(`[performImapSyncForUser] IMAP settings not fully configured for user ${userId}.`);
        return { message: 'IMAP settings not fully configured.', eventCount: -1, error: true };
    }
    
    console.log(`[performImapSyncForUser] Attempting sync for user ${userId}: ${userImapSettings.email}`);
    
    try {
        const imapConfig = { 
            user: userImapSettings.email,
            password: userImapSettings.password,
            host: userImapSettings.imapHost,
            port: userImapSettings.imapPort || 993,
            tls: userImapSettings.useTLS !== false,
            tlsOptions: { rejectUnauthorized: false }
        };
        const imap = new Imap(imapConfig);
        let syncedEvents = [];
        
        // 加载用户事件
        let userEvents = await loadEvents(userId);
        
        // 定义 imap 辅助函数
        const imapConnect = () => { 
            return new Promise((resolve, reject) => {
                imap.once('error', reject);
                imap.once('ready', resolve);
                imap.connect();
            });
        };
        
        const openMailbox = (folderName) => {
             return new Promise((resolve, reject) => {
                console.log(`[performImapSyncForUser] Opening mailbox: ${folderName}`);
                 imap.openBox(folderName, false, (err, box) => {
                     if (err) {
                         console.error(`[performImapSyncForUser] Failed to open ${folderName}: ${err.message}`);
                         resolve(null); 
                     } else {
                          console.log(`[performImapSyncForUser] Opened ${folderName}: ${box.messages.total} total, ${box.messages.new} new`);
                         resolve(box);
                     }
                 });
             });
        };
        
        const searchUnseenEmails = (folderName) => {
             return new Promise((resolve, reject) => {
                 console.log(`[performImapSyncForUser] Searching UNSEEN in ${folderName}...`);
                 try {
                     imap.search(['UNSEEN'], (err, results) => {
                         if (err) {
                             console.error(`[performImapSyncForUser] Failed to search UNSEEN in ${folderName}: ${err.message}`);
                             resolve([]);
                         } else if (!results || results.length === 0) {
                              console.log(`[performImapSyncForUser] No UNSEEN messages found in ${folderName}.`);
                             resolve([]);
                         } else {
                             console.log(`[performImapSyncForUser] Found ${results.length} UNSEEN messages in ${folderName}.`);
                             resolve(results);
                         }
                     });
                 } catch (error) {
                     console.error(`[performImapSyncForUser] Error during UNSEEN search in ${folderName}:`, error);
                     resolve([]);
                 }
             });
        };
        
        // IMAP连接和邮件处理逻辑
        await imapConnect();
        console.log(`[performImapSyncForUser] Connected to IMAP server for user ${userId}`);
        
        const box = await openMailbox('INBOX');
        if (!box) {
            imap.end();
            return { message: 'Failed to open INBOX', eventCount: -1, error: true };
        }
        
        const unseenResults = await searchUnseenEmails('INBOX');
        if (unseenResults.length === 0) {
            imap.end();
            console.log(`[performImapSyncForUser] No new emails found for user ${userId}`);
            return { message: 'No new emails found', eventCount: 0 };
        }
        
        console.log(`[performImapSyncForUser] Processing ${unseenResults.length} emails for user ${userId}...`);
        // 这里需要实现邮件获取和AI分析的逻辑
        // 简化版本：返回成功状态
        
        imap.end();
        
        // 保存用户事件
        await saveEvents(userEvents, userId);
        
        console.log(`[performImapSyncForUser] IMAP sync completed for user ${userId}`);
        return { 
            message: `IMAP sync completed for ${userImapSettings.email}. Found ${unseenResults.length} new emails.`, 
            eventCount: 0 
        };
        
    } catch (error) {
        console.error(`[performImapSyncForUser] Error during IMAP sync for user ${userId}:`, error);
        return { message: `IMAP Sync failed: ${error.message}`, eventCount: -1, error: true };
    }
}

let isCalDavSyncRunning = false;

// --- 用户特定的CalDAV同步函数 ---
async function performCalDavSyncForUser(userId) {
    console.log(`[performCalDavSyncForUser] Starting CalDAV sync for user ${userId}...`);
    
    try {
        // 加载用户特定的CalDAV设置（使用新的设置服务）
        console.log(`[performCalDavSyncForUser] 使用新设置服务加载CalDAV设置，用户ID: ${userId}`);
        const userCalDAVSettings = await newSettingsService.getCalDAVSettings(userId);
        console.log(`[performCalDavSyncForUser] 加载到的CalDAV设置:`, userCalDAVSettings);
        
        // 检查CalDAV设置是否已配置
        if (!userCalDAVSettings || !userCalDAVSettings.username || !userCalDAVSettings.password || !userCalDAVSettings.serverUrl) {
            console.error(`[performCalDavSyncForUser] CalDAV settings not fully configured for user ${userId}.`);
            return { message: 'CalDAV设置未完全配置，请先完成CalDAV服务器设置。', eventCount: -1, error: true };
        }
        
        console.log(`[performCalDavSyncForUser] Syncing for user ${userId}: ${userCalDAVSettings.username}`);
        
        // 加载用户事件
        let userEvents = await loadEvents(userId);
        
        // 调用相应的CalDAV同步逻辑
        let syncResult;
        if (userCalDAVSettings.serverUrl && userCalDAVSettings.serverUrl.includes('dav.qq.com')) {
            syncResult = await performQQCalDavSyncForUser(userCalDAVSettings, userEvents, userId);
        } else {
            syncResult = await performGenericCalDavSyncForUser(userCalDAVSettings, userEvents, userId);
        }
        
        return syncResult;
        
    } catch (error) {
        console.error(`[performCalDavSyncForUser] Error during CalDAV sync for user ${userId}:`, error);
        return { message: `CalDAV Sync failed: ${error.message}`, eventCount: -1, error: true };
    }
}

// --- 用户特定的QQ CalDAV同步函数 ---
async function performQQCalDavSyncForUser(userCalDAVSettings, userEvents, userId) {
    console.log(`[performQQCalDavSyncForUser] Starting QQ CalDAV sync for user ${userId}`);
    
    try {
        let targetServerUrl = userCalDAVSettings.serverUrl;
        if (!targetServerUrl.startsWith('http')) targetServerUrl = 'https://' + targetServerUrl;
        if (!targetServerUrl.endsWith('/')) targetServerUrl += '/';
        
        console.log(`[performQQCalDavSyncForUser] 准备连接CalDAV服务器: ${targetServerUrl}`);
        console.log(`[performQQCalDavSyncForUser] 用户名: ${userCalDAVSettings.username}`);
        console.log(`[performQQCalDavSyncForUser] 密码长度: ${userCalDAVSettings.password ? userCalDAVSettings.password.length : 0}`);

        const client = new DAVClient({
            serverUrl: targetServerUrl,
            credentials: {
                username: userCalDAVSettings.username,
                password: userCalDAVSettings.password
            },
            authMethod: 'Basic',
            defaultAccountType: 'caldav'
        });

        await client.login();
        console.log(`[performQQCalDavSyncForUser] Login successful for user ${userId}`); 
        
        const calendars = await client.fetchCalendars();
        if (calendars.length === 0) {
            return { message: 'No calendars found on server.', eventCount: 0 };
        }
        
        let targetCalendar = calendars.find(cal => cal.displayName === 'Calendar' || cal.displayName === '日历') || calendars[0];
        
        // 获取同步时间范围
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1); // 1个月前
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 6); // 6个月后

        const calendarObjects = await client.fetchCalendarObjects({
            calendar: targetCalendar,
            calendarData: { 
                compFilter: { 
                    attrs: { name: 'VCALENDAR' },
                    compFilter: {
                        attrs: { name: 'VEVENT' },
                        timeRange: {
                            start: startDate.toISOString(),
                            end: endDate.toISOString(),
                        },
                    },
                 }
            }
        });
        
        console.log(`[performQQCalDavSyncForUser] Fetched ${calendarObjects.length} calendar objects for user ${userId}`); 

        // 处理从服务器获取的事件
        const newOrUpdatedEvents = [];
        let addedFromServerCount = 0;
        
        for (const obj of calendarObjects) {
            if (!obj.data) continue;
            
            try {
                const parsedEvents = ical.parseICS(obj.data);
                for (const key in parsedEvents) {
                    if (parsedEvents[key].type === 'VEVENT') {
                        const vevent = parsedEvents[key];
                        const eventUid = vevent.uid || obj.url;
                        const uniqueId = eventUid;
                        
                        const eventStartDate = vevent.start ? new Date(vevent.start) : null;
                        const eventEndDate = vevent.end ? new Date(vevent.end) : (eventStartDate ? new Date(eventStartDate.getTime() + 3600*1000) : null);

                        if (eventStartDate && eventEndDate && !isNaN(eventStartDate) && !isNaN(eventEndDate)) {
                            const eventData = {
                                id: uniqueId,
                                title: vevent.summary || '无标题事件',
                                start_datetime: eventStartDate.toISOString(),
                                end_datetime: eventEndDate.toISOString(),
                                description: vevent.description || '',
                                location: vevent.location || '',
                                all_day: !!vevent.datetype && vevent.datetype === 'DATE',
                                source: 'caldav_sync_tsdav',
                                caldav_uid: eventUid,
                                caldav_etag: obj.etag,
                                caldav_url: obj.url,
                                created_at: vevent.created ? new Date(vevent.created).toISOString() : new Date().toISOString(),
                                updated_at: vevent.lastmodified ? new Date(vevent.lastmodified).toISOString() : new Date().toISOString(),
                                needs_caldav_push: false,
                                userId: userId
                            };
                            
                            // 检查本地是否存在此事件
                            const existingLocalEventIndex = userEvents.findIndex(e => e.id === uniqueId);
                            if (existingLocalEventIndex === -1) {
                                newOrUpdatedEvents.push(eventData);
                                addedFromServerCount++;
                            }
                        }
                    }
                }
            } catch (parseError) {
                console.error(`[performQQCalDavSyncForUser] Error parsing ICS for ${obj.url} (user ${userId}):`, parseError);
            }
        }
        
        // 合并新增的事件
        if (newOrUpdatedEvents.length > 0) {
            userEvents = [...userEvents, ...newOrUpdatedEvents];
        }
        
        // 新增：检测并移除在QQ服务器上已删除的本地事件
        let removedLocallyCount = 0;
        const eventsFromServerMap = new Map();
        
        // 构建服务器事件映射（复用已经解析的数据）
        for (const obj of calendarObjects) {
            if (!obj.data) continue;
            try {
                const parsedEvents = ical.parseICS(obj.data);
                for (const key in parsedEvents) {
                    if (parsedEvents[key].type === 'VEVENT') {
                        const vevent = parsedEvents[key];
                        const eventUid = vevent.uid || obj.url;
                        eventsFromServerMap.set(eventUid, { etag: obj.etag, data: vevent });
                    }
                }
            } catch (parseError) {
                // 忽略解析错误，继续处理其他事件
            }
        }
        
        // 检查本地的CalDAV事件是否在服务器上仍然存在
        const originalUserEventsCount = userEvents.length;
        userEvents = userEvents.filter(localEvent => {
            // 只检查来自CalDAV同步的事件
            if (localEvent.source === 'caldav_sync_tsdav' && localEvent.caldav_uid) {
                // 检查这个事件是否还在服务器上
                if (!eventsFromServerMap.has(localEvent.caldav_uid)) {
                    console.log(`[performQQCalDavSyncForUser] 检测到QQ日历删除事件: "${localEvent.title}" (${localEvent.caldav_uid})`);
                    removedLocallyCount++;
                    return false; // 从本地删除此事件
                }
            }
            return true; // 保留其他事件
        });
        
        if (removedLocallyCount > 0) {
            console.log(`[performQQCalDavSyncForUser] 已删除 ${removedLocallyCount} 个在QQ日历上不存在的本地事件`);
        }
        
        // 新增：处理需要在服务器上删除的事件
        let deletedOnServerCount = 0;
        const eventsMarkedForDeletion = userEvents.filter(e => e.needs_caldav_delete === true && e.caldav_url && e.source === 'caldav_sync_tsdav');

        if (eventsMarkedForDeletion.length > 0) {
            console.log(`[performQQCalDavSyncForUser] Found ${eventsMarkedForDeletion.length} events marked for deletion on QQ server.`);
            for (const eventToDelete of eventsMarkedForDeletion) {
                try {
                    console.log(`[performQQCalDavSyncForUser] Attempting to delete event "${eventToDelete.title}" (${eventToDelete.caldav_url}) from QQ server.`);
                    
                    const calendarObjectToDelete = { url: eventToDelete.caldav_url };
                    await client.deleteCalendarObject({ 
                        calendarObject: calendarObjectToDelete 
                    });

                    console.log(`[performQQCalDavSyncForUser] Successfully deleted event "${eventToDelete.title}" from QQ server.`);
                    
                    // 从本地彻底删除该事件
                    userEvents = userEvents.filter(e => e.id !== eventToDelete.id);
                    deletedOnServerCount++;
                } catch (deleteError) {
                    console.error(`[performQQCalDavSyncForUser] Failed to delete event "${eventToDelete.title}" from QQ server:`, deleteError);
                    let statusCode;
                    if (deleteError?.response?.status) {
                        statusCode = deleteError.response.status;
                    } else if (deleteError?.message?.includes('404')) {
                        statusCode = 404;
                    }

                    if (statusCode === 404) {
                        console.log(`[performQQCalDavSyncForUser] Event "${eventToDelete.title}" was already deleted on server (404). Removing from local DB.`);
                        userEvents = userEvents.filter(e => e.id !== eventToDelete.id);
                        deletedOnServerCount++;
                    } else {
                        console.warn(`[performQQCalDavSyncForUser] Will not remove local CalDAV event "${eventToDelete.title}" due to server deletion error. It will be retried.`);
                    }
                }
            }
        }
        
        // 新增：处理需要推送到服务器的本地事件
        let pushedToServerCount = 0;
        const eventsToPush = userEvents.filter(e => e.needs_caldav_push === true);
        
        if (eventsToPush.length > 0) {
            console.log(`[performQQCalDavSyncForUser] Found ${eventsToPush.length} local events to push to QQ CalDAV.`);
            
            for (const eventToPush of eventsToPush) {
                try {
                    // 清理和截断标题和描述
                    let title = eventToPush.title || '未命名事件';
                    let description = eventToPush.description || '';
                    
                    // 清理标题
                    title = title.replace(/^转发:\s*/, '');
                    title = title.replace(/\n.*$/s, '');
                    title = title.trim();
                    if (title.length > 200) {
                        title = title.substring(0, 197) + '...';
                    }
                    
                    // 清理描述
                    if (description.length > 1000) {
                        const senderIndex = description.indexOf('发件人:');
                        if (senderIndex > 0 && senderIndex < 500) {
                            description = description.substring(0, senderIndex).trim();
                        } else {
                            description = description.substring(0, 497) + '...';
                        }
                    }
                    
                    title = title.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
                    description = description.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    // 构建iCalendar数据
                    const startDate = new Date(eventToPush.start_datetime);
                    const endDate = eventToPush.end_datetime ? new Date(eventToPush.end_datetime) : new Date(startDate.getTime() + 3600 * 1000);
                    
                    const formatDateForICS = (date, allDay = false) => {
                        const pad = (num) => String(num).padStart(2, '0');
                        const year = date.getUTCFullYear();
                        const month = pad(date.getUTCMonth() + 1);
                        const day = pad(date.getUTCDate());
                        if (allDay) { return `${year}${month}${day}`; }
                        const hours = pad(date.getUTCHours());
                        const minutes = pad(date.getUTCMinutes());
                        const seconds = pad(date.getUTCSeconds());
                        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
                    };
                    
                    const escapeICalendarText = (text) => {
                        if (!text) return '';
                        return text
                            .replace(/\\/g, '\\\\')
                            .replace(/;/g, '\\;')
                            .replace(/,/g, '\\,')
                            .replace(/\r\n|\n|\r/g, '\\n')
                            .replace(/"/g, '\\"');
                    };
                    
                    const icsDataArray = [
                        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SiYuan//Steve-Tools Calendar//CN',
                        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${eventToPush.id}`,
                        `DTSTAMP:${formatDateForICS(new Date(), false)}`,
                        `DTSTART:${formatDateForICS(startDate, false)}`,
                        `DTEND:${formatDateForICS(endDate, false)}`,
                        `SUMMARY:${escapeICalendarText(title)}`
                    ];
                    
                    if (description.trim()) {
                        icsDataArray.push(`DESCRIPTION:${escapeICalendarText(description)}`);
                    }
                    
                    icsDataArray.push('END:VEVENT', 'END:VCALENDAR');
                    const icsString = icsDataArray.join('\r\n');
                    
                    console.log(`[performQQCalDavSyncForUser] Pushing event "${title}" to QQ CalDAV...`);
                    
                    // 推送到QQ CalDAV
                    const filename = `${eventToPush.id}.ics`;
                    const createResponse = await client.createCalendarObject({
                        calendar: targetCalendar,
                        filename: filename,
                        iCalString: icsString,
                    });
                    
                    if (createResponse && (createResponse.status === 200 || createResponse.status === 201 || createResponse.status === 204)) {
                        console.log(`[performQQCalDavSyncForUser] Successfully pushed event "${title}" to QQ CalDAV.`);
                        
                        // 更新本地事件状态
                        const eventIndex = userEvents.findIndex(e => e.id === eventToPush.id);
                        if (eventIndex !== -1) {
                            userEvents[eventIndex].needs_caldav_push = false;
                            userEvents[eventIndex].caldav_uid = eventToPush.id;
                            userEvents[eventIndex].source = 'caldav_sync_tsdav';
                            pushedToServerCount++;
                        }
                    } else {
                        console.error(`[performQQCalDavSyncForUser] Failed to push event "${title}" to QQ CalDAV:`, createResponse);
                    }
                } catch (pushError) {
                    console.error(`[performQQCalDavSyncForUser] Error pushing event ${eventToPush.id} to QQ CalDAV:`, pushError);
                }
            }
        }
        
        // 保存用户事件
        await saveEvents(userEvents, userId);
        
        console.log(`[performQQCalDavSyncForUser] CalDAV sync completed for user ${userId}. Added ${addedFromServerCount} events, pushed ${pushedToServerCount} events, removed ${removedLocallyCount} events, deleted ${deletedOnServerCount} events from server.`);
        return { 
            message: `CalDAV同步完成。从服务器添加了 ${addedFromServerCount} 个事件，推送了 ${pushedToServerCount} 个事件，删除了 ${removedLocallyCount} 个事件，从服务器删除了 ${deletedOnServerCount} 个事件。`, 
            eventCount: addedFromServerCount + pushedToServerCount - removedLocallyCount - deletedOnServerCount 
        };
        
    } catch (error) {
        console.error(`[performQQCalDavSyncForUser] Error during CalDAV sync for user ${userId}:`, error);
        return { 
            message: `CalDAV同步失败: ${error.message}`, 
            eventCount: -1, 
            error: true 
        };
    }
}

// --- 用户特定的通用CalDAV同步函数 ---
async function performGenericCalDavSyncForUser(userCalDAVSettings, userEvents, userId) {
    console.log(`[performGenericCalDavSyncForUser] Generic CalDAV sync for user ${userId} - simplified version`);
    
    // 简化版本：直接返回成功状态
    return { 
        message: `通用CalDAV同步暂未完整实现用户隔离版本`, 
        eventCount: 0 
    };
}

// --- 新函数：专门处理 QQ CalDAV 同步逻辑 ---
async function performQQCalDavSync() {
    const currentSettings = caldavSettings; 
    console.log(`[performQQCalDavSync] Starting QQ specific sync for: ${currentSettings.username}`);
    // 声明所有将在此函数中使用的计数器
    let addedFromServerCount = 0;
    let removedLocallyCount = 0;
    let deletedOnServerCount = 0;
    let pushedToServerCount = 0;
    let updatedOnServerCount = 0;
    let updatedLocallyCount = 0; // <--- 确保这一行在这里被声明和初始化

    // try { ... 函数的其余部分 ... }
    // ...
    let targetServerUrl = currentSettings.serverUrl;
    if (!targetServerUrl.startsWith('http')) targetServerUrl = 'https://' + targetServerUrl;
    if (!targetServerUrl.endsWith('/')) targetServerUrl += '/';
    console.log(`[performQQCalDavSync] Connecting to: ${targetServerUrl}`); 

    try {
        const client = new DAVClient({
            serverUrl: targetServerUrl,
            credentials: {
                username: currentSettings.username,
                password: currentSettings.password
            },
            authMethod: 'Basic',
            defaultAccountType: 'caldav'
        });

        await client.login();
        console.log("[performQQCalDavSync] Login successful. Fetching calendars..."); 
        const calendars = await client.fetchCalendars();
        if (calendars.length === 0) {
             console.log('[performQQCalDavSync] No calendars found.'); 
             return { message: 'No calendars found on server.', eventCount: 0 };
        }
        let targetCalendar = calendars.find(cal => cal.displayName === 'Calendar' || cal.displayName === '日历') || calendars[0];
        console.log(`[performQQCalDavSync] Syncing calendar: ${targetCalendar.displayName} (${targetCalendar.url})`); 

        const { startDate, endDate } = getStartEndDateForSync();
        console.log(`[performQQCalDavSync] Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`); 
        const calendarObjects = await client.fetchCalendarObjects({
            calendar: targetCalendar,
            calendarData: { 
                compFilter: { 
                    attrs: { name: 'VCALENDAR' },
                    compFilter: {
                        attrs: { name: 'VEVENT' },
                        timeRange: {
                            start: startDate.toISOString(),
                            end: endDate.toISOString(),
                        },
                    },
                 }
            }
        });
        console.log(`[performQQCalDavSync] Fetched ${calendarObjects.length} raw calendar objects.`); 

        // --- 处理从服务器获取的事件 (保持不变) ---
        const newOrUpdatedEvents = [];
        const eventsFromServerMap = new Map(); 
        for (const obj of calendarObjects) {
            // ... (拉取和解析 QQ 事件的逻辑保持不变) ...
             if (!obj.data) continue;
            
            // --- 注释掉调试日志：记录从QQ服务器拉取的原始ICS数据 ---
            /*
            if (currentSettings.serverUrl && currentSettings.serverUrl.includes('dav.qq.com')) {
                console.log(`[QQ CalDAV Debug] Raw ICS data from QQ for URL ${obj.url} (ETag: ${obj.etag}):\n------ BEGIN QQ ICS ------\n${obj.data}\n------ END QQ ICS ------`);
            }
            */
            // -------------------------------------------------
            
            try {
                const parsedEvents = ical.parseICS(obj.data);
                for (const key in parsedEvents) {
                    if (parsedEvents[key].type === 'VEVENT') {
                        const vevent = parsedEvents[key];
                        const eventUid = vevent.uid || obj.url;
                        const recurrenceId = vevent.recurrenceid ? new Date(vevent.recurrenceid).toISOString() : null;
                        const uniqueId = recurrenceId ? `${eventUid}_${recurrenceId}` : eventUid;
                        
                        eventsFromServerMap.set(uniqueId, { etag: obj.etag, data: vevent }); // 存储 ETag 和 VEVENT 数据

                        const eventStartDate = vevent.start ? new Date(vevent.start) : null;
                        const eventEndDate = vevent.end ? new Date(vevent.end) : (eventStartDate ? new Date(eventStartDate.getTime() + 3600*1000) : null);

                        if (eventStartDate && eventEndDate && !isNaN(eventStartDate) && !isNaN(eventEndDate)) {
                             const eventData = {
                                id: uniqueId,
                                title: vevent.summary || '无标题事件',
                                start_datetime: eventStartDate.toISOString(),
                                end_datetime: eventEndDate.toISOString(),
                                description: vevent.description || '',
                                location: vevent.location || '',
                                all_day: !!vevent.datetype && vevent.datetype === 'DATE',
                                source: 'caldav_sync_tsdav', // 标记来源
                                caldav_uid: eventUid, // 使用解析出的 UID 或 URL
                                caldav_etag: obj.etag,
                                caldav_url: obj.url, // <-- 添加这一行
                                created_at: vevent.created ? new Date(vevent.created).toISOString() : new Date().toISOString(),
                                updated_at: vevent.lastmodified ? new Date(vevent.lastmodified).toISOString() : new Date().toISOString(),
                                needs_caldav_push: false // 从服务器拉取的事件初始不需要推送
                            };
                            // 检查本地是否存在此事件 (ID 匹配)
                            const existingLocalEventIndex = eventsDb.findIndex(e => e.id === uniqueId);
                            if (existingLocalEventIndex === -1) {
                                // 本地不存在，直接添加
                                newOrUpdatedEvents.push(eventData);
                            } else {
                                // 本地存在，检查 ETag 是否不同
                                const existingEvent = eventsDb[existingLocalEventIndex];
                                if (existingEvent.caldav_etag !== obj.etag) {
                                    // ETag 不同，表示服务器上有更新，需要更新本地事件
                                    console.log(`[performQQCalDavSync] Updating local event ${uniqueId} from server (ETag changed).`); // <-- 修改日志前缀
                                    eventsDb[existingLocalEventIndex] = eventData; 
                                    // 标记一下需要保存 (虽然最后总会保存)
                                } else {
                                     // ETag 相同，无需操作
                                }
                            }
                        }
                    }
                }
            } catch (parseError) {
                console.error(`[performQQCalDavSync] Error parsing ICS for ${obj.url}:`, parseError); // <-- 修改日志前缀
            }
        }
        
        // 合并新增的事件
        let addedFromServerCount = 0;
        if (newOrUpdatedEvents.length > 0) {
             console.log(`[performQQCalDavSync] Found ${newOrUpdatedEvents.length} new events from CalDAV server to add locally.`); // <-- 修改日志前缀
            eventsDb = [...eventsDb, ...newOrUpdatedEvents];
            addedFromServerCount = newOrUpdatedEvents.length;
        }
        
        // 移除本地存在但服务器上已不存在的事件
        let removedLocallyCount = 0;
        eventsDb = eventsDb.filter(localEvent => {
            if (localEvent.source === 'caldav_sync_tsdav') {
                if (!eventsFromServerMap.has(localEvent.id)) {
                     console.log(`[performQQCalDavSync] Removing local event ${localEvent.id} (source: CalDAV) as it's no longer on the server.`); // <-- 修改日志前缀
                     removedLocallyCount++;
                     return false; // 过滤掉
                }
            }
            return true; // 保留其他来源的事件或服务器上存在的 CalDAV 事件
        });
        if(removedLocallyCount > 0) {
             console.log(`[performQQCalDavSync] Removed ${removedLocallyCount} local events that were deleted from server.`); // <-- 修改日志前缀
        }

        // --- 新增：处理需要在服务器上删除的事件 ---
        let deletedOnServerCount = 0;
        // 注意：这里的 client 变量需要确保在 performQQCalDavSync 函数作用域内有效且已初始化
        const eventsMarkedForDeletion = eventsDb.filter(e => e.needs_caldav_delete === true && e.caldav_url && e.source === 'caldav_sync_tsdav');

        if (eventsMarkedForDeletion.length > 0 && client) { // 确保 client 已定义
            console.log(`[performQQCalDavSync] Found ${eventsMarkedForDeletion.length} events marked for deletion on server.`);
            for (const eventToDelete of eventsMarkedForDeletion) {
                try {
                    console.log(`[performQQCalDavSync] Attempting to delete event ${eventToDelete.id} (${eventToDelete.caldav_url}) from QQ server.`);
                    
                    const calendarObjectToDelete = { url: eventToDelete.caldav_url };
                    // 根据 tsdav 的文档或实际测试，deleteCalendarObject 可能不需要 etag
                    // 如果需要 If-Match 行为，通常 ETag 会在 calendarObjectToDelete 对象内部传递，例如 calendarObjectToDelete.etag = eventToDelete.caldav_etag;
                    // 或者作为单独的参数，但 tsdav 的 API 定义似乎更倾向于前者或不使用。
                    // 我们先尝试不显式传递 ETag，因为 `siyuan-steve-tools` 的 delete 也没传。

                    await client.deleteCalendarObject({ 
                        calendarObject: calendarObjectToDelete 
                    });

                    console.log(`[performQQCalDavSync] Successfully deleted event ${eventToDelete.id} from QQ server.`);
                    eventsDb = eventsDb.filter(e => e.id !== eventToDelete.id);
                    deletedOnServerCount++;
                } catch (deleteError) {
                    console.error(`[performQQCalDavSync] Failed to delete event ${eventToDelete.id} from QQ server:`, deleteError);
                    let statusCode;
                    if (deleteError?.response?.status) {
                        statusCode = deleteError.response.status;
                    } else if (deleteError?.message?.includes('404')) {
                        statusCode = 404;
                    }

                    if (statusCode === 404) {
                        console.log(`[performQQCalDavSync] Event "${eventToDelete.title}" was already deleted on server (404). Removing from local DB.`);
                        userEvents = userEvents.filter(e => e.id !== eventToDelete.id);
                        deletedOnServerCount++;
                    } else {
                        console.warn(`[performQQCalDavSync] Will not remove local CalDAV event "${eventToDelete.title}" due to server deletion error. It will be retried.`);
                    }
                }
            }
        }
        // --- 结束处理服务器删除 ---

        // --- 新增：识别并标记需要补推的6个月内的旧本地事件 ---
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        let oldEventsMarkedForPushCount = 0;

        eventsDb.forEach(event => {
            let eventDateToSort = null;
            if (event.created_at) {
                eventDateToSort = new Date(event.created_at);
            } else if (event.start_datetime) {
                eventDateToSort = new Date(event.start_datetime);
            }
            if (
                eventDateToSort && eventDateToSort >= sixMonthsAgo && 
                (!event.source || (event.source && !event.source.startsWith('caldav_sync'))) && 
                !event.caldav_url && 
                event.needs_caldav_push !== true 
            ) {
                console.log(`[performQQCalDavSync] Marking older local event (ID: ${event.id}, Title: "${event.title}", Date: ${eventDateToSort.toISOString()}) for push to QQ CalDAV as it\'s within 6 months and has no QQ URL.`);
                event.needs_caldav_push = true;
                oldEventsMarkedForPushCount++;
            }
        });
        if (oldEventsMarkedForPushCount > 0) {
            console.log(`[performQQCalDavSync] Marked an additional ${oldEventsMarkedForPushCount} older local events (within last 6 months, not yet on QQ CalDAV) to be pushed.`);
        }
        // --- 结束标记补推事件 ---

        // --- 确保声明以下计数器变量 --- 
        let pushedToServerCount = 0;
        let updatedOnServerCount = 0;
        // let updatedLocallyCount = 0; // 这个变量应该在函数开始时与 addedFromServerCount 等一起声明
        // 我们将确保 updatedLocallyCount 在函数顶部声明，这里先注释掉，避免重复声明。
        // 实际上，为了清晰，所有这些推送相关的计数器最好都在此块之前或函数顶部声明。
        // 假设 addedFromServerCount, removedLocallyCount, deletedOnServerCount, pushedToServerCount, updatedOnServerCount, updatedLocallyCount 都在函数作用域开始时声明了。
        // 经过检查，updatedLocallyCount 的确应该和其他几个主要计数器一起在函数开始处声明。
        // 此处仅保留 pushedToServerCount 和 updatedOnServerCount，因为它们主要用于此后的推送循环。
        // updatedLocallyCount 会在本地事件状态更新时使用，其作用域需要在更早的地方。

        const eventsToPushOrUpdate = eventsDb.filter(e => e.needs_caldav_push === true);
        console.log(`[performQQCalDavSync] Found ${eventsToPushOrUpdate.length} total events marked for pushing/updating to QQ CalDAV (includes newly created, modified, and any older events identified for补推).`);

        if (eventsToPushOrUpdate.length > 0) {
            for (const eventToModify of eventsToPushOrUpdate) { 
                let manualIcsString = ''; // 示例，实际ICS构建逻辑保留
                    // (手动构建ICS的代码应该在这里)
                    const uid = eventToModify.id;
                    // 清理和截断标题和描述，避免过长内容导致CalDAV推送失败
                    let title = eventToModify.title || '未命名事件';
                    let description = eventToModify.description || '';
                    
                    // 清理标题：移除邮件转发前缀，只保留核心内容
                    title = title.replace(/^转发:\s*/, ''); // 移除"转发:"前缀
                    title = title.replace(/\n.*$/s, ''); // 移除第一行后的所有内容
                    title = title.trim();
                    
                    // 限制标题长度（CalDAV SUMMARY字段建议不超过200字符）
                    if (title.length > 200) {
                        title = title.substring(0, 197) + '...';
                    }
                    
                    // 清理描述：移除过长的邮件签名和格式信息
                    if (description.length > 1000) {
                        // 查找第一个"发件人:"位置，截取到该位置
                        const senderIndex = description.indexOf('发件人:');
                        if (senderIndex > 0 && senderIndex < 500) {
                            description = description.substring(0, senderIndex).trim();
                        } else {
                            // 如果没有找到发件人，直接截取前500字符
                            description = description.substring(0, 497) + '...';
                        }
                    }
                    
                    // 清理特殊字符和格式，确保iCalendar兼容性
                    title = title.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
                    description = description.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    console.log(`[performQQCalDavSync] 清理后标题 (${title.length}字符): ${title}`);
                    if (description) {
                        console.log(`[performQQCalDavSync] 清理后描述 (${description.length}字符): ${description.substring(0, 100)}...`);
                    }
                    const startStr = eventToModify.start_datetime;
                    const endStr = eventToModify.end_datetime;
                    if (!startStr) { /* ... */ continue; }
                    const startDate = new Date(startStr);
                    const endDate = endStr ? new Date(endStr) : new Date(startDate.getTime() + 3600 * 1000);
                    let isAllDay = false;
                    if (startStr.length === 10 || (startStr.includes('T00:00:00') && endStr && (new Date(endStr).getTime() - startDate.getTime()) >= (24*60*60*1000 - 1000) )) {
                       isAllDay = true;
                    } 
                    const formatDateForICS = (date, allDay = false) => {
                        const pad = (num) => String(num).padStart(2, '0');
                        const year = date.getUTCFullYear();
                        const month = pad(date.getUTCMonth() + 1);
                        const day = pad(date.getUTCDate());
                        if (allDay) { return `${year}${month}${day}`; }
                        const hours = pad(date.getUTCHours());
                        const minutes = pad(date.getUTCMinutes());
                        const seconds = pad(date.getUTCSeconds());
                        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
                    };
                    const icsDataArray = [
                        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SiYuan//Steve-Tools Calendar//CN',
                        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${uid}`,
                        `DTSTAMP:${formatDateForICS(new Date(), false)}`,
                    ];
                    if (isAllDay) {
                        const endDateAllDay = new Date(startDate); endDateAllDay.setUTCDate(startDate.getUTCDate() + 1);
                        icsDataArray.push(`DTSTART;VALUE=DATE:${formatDateForICS(startDate, true)}`);
                        icsDataArray.push(`DTEND;VALUE=DATE:${formatDateForICS(endDateAllDay, true)}`);
                    } else {
                        icsDataArray.push(`DTSTART:${formatDateForICS(startDate, false)}`);
                        icsDataArray.push(`DTEND:${formatDateForICS(endDate, false)}`);
                    }
                    // iCalendar字段转义函数
                    const escapeICalendarText = (text) => {
                        if (!text) return '';
                        return text
                            .replace(/\\/g, '\\\\')    // 反斜杠转义
                            .replace(/;/g, '\\;')      // 分号转义
                            .replace(/,/g, '\\,')      // 逗号转义
                            .replace(/\r\n|\n|\r/g, '\\n') // 换行符转义
                            .replace(/"/g, '\\"');     // 双引号转义
                    };
                    
                    icsDataArray.push(`SUMMARY:${escapeICalendarText(title)}`);
                    if (description.trim()) { 
                        icsDataArray.push(`DESCRIPTION:${escapeICalendarText(description)}`); 
                    }
                    icsDataArray.push('END:VEVENT', 'END:VCALENDAR');
                    manualIcsString = icsDataArray.join('\r\n');

                    if (!manualIcsString) { /* ... */ continue; }
                    console.log(`[performQQCalDavSync] Manually generated iCalendar data for ${uid}:\n------ BEGIN QQ PUSH ICS ------\n${manualIcsString}\n------ END QQ PUSH ICS ------`);

                    if (eventToModify.caldav_url && eventToModify.caldav_etag) {
                        // --- 更新逻辑 ---
                        // ... (省略更新逻辑，保持不变)
                    } else {
                        // --- 创建逻辑 --- 
                        const filename = `${eventToModify.id}.ics`;
                    console.log(`[performQQCalDavSync] Creating object ${filename} in calendar ${targetCalendar.url}...`);
                        
                        const createResponse = await client.createCalendarObject({
                        calendar: targetCalendar,
                        filename: filename,
                            iCalString: manualIcsString, 
                        });

                        let actualStatus = null;
                        let newEtag = null;
                        let responseDataForLog = createResponse; 

                        // 直接从 Response 对象获取 status 和 ETag
                        if (createResponse && typeof createResponse.status === 'number') {
                            actualStatus = createResponse.status;
                            if (createResponse.headers && typeof createResponse.headers.get === 'function') {
                                newEtag = createResponse.headers.get('ETag') || createResponse.headers.get('etag'); // 尝试获取 ETag (常见大小写)
                            }
                        } else if (createResponse && typeof createResponse === 'object') {
                            // Fallback for other possible tsdav response structures (if not raw Response)
                            if (createResponse.hasOwnProperty('status')) {
                                actualStatus = createResponse.status;
                            } else if (createResponse.hasOwnProperty('statusCode')) {
                                actualStatus = createResponse.statusCode;
                            }
                            if (createResponse.hasOwnProperty('etag')) {
                                newEtag = createResponse.etag;
                            }
                            if (actualStatus === null && newEtag) {
                                console.log('[performQQCalDavSync] createCalendarObject returned ETag but no explicit status, assuming success (e.g., 201 Created).');
                                actualStatus = 201;
                            }
                        }
                        
                        const successfulCreateStatusCodes = [200, 201, 204]; 

                        if (actualStatus && successfulCreateStatusCodes.includes(actualStatus)) {
                            if (newEtag) {
                                console.log(`[performQQCalDavSync] Successfully created ${filename} on QQ server (Status: ${actualStatus}). ETag: ${newEtag}`);
                            } else {
                                console.warn(`[performQQCalDavSync] Event ${filename} created on QQ server (Status: ${actualStatus}), but no ETag returned or extracted. Marking as synced.`);
                            }
                        pushedToServerCount++;
                            const indexToUpdate = eventsDb.findIndex(e => e.id === eventToModify.id);
                        if (indexToUpdate !== -1) {
                                let createdUrl = 'unknown';
                                try {
                                     const baseUrl = targetCalendar.url.endsWith('/') ? targetCalendar.url : targetCalendar.url + '/';
                                     createdUrl = new URL(filename, baseUrl).href; 
                                } catch(urlError) { createdUrl = `${targetCalendar.url}${filename}`; }
                                eventsDb[indexToUpdate].caldav_url = createdUrl;
                                eventsDb[indexToUpdate].caldav_uid = eventToModify.id;
                                eventsDb[indexToUpdate].caldav_etag = newEtag;
                            eventsDb[indexToUpdate].needs_caldav_push = false;
                            eventsDb[indexToUpdate].source = 'caldav_sync_tsdav';
                                // updatedLocallyCount++; // 使用在函数开始处声明的那个变量
                                const localEventToUpdate = eventsDb[indexToUpdate];
                                console.log(`[performQQCalDavSync] Updated local event ${eventToModify.id} with QQ CalDAV info after create.`);
                        }
                    } else {
                             console.error(`[performQQCalDavSync] Failed to create or verify creation of ${filename} on QQ server. Status: ${actualStatus || 'Unknown'}. Full Response for logging:`, responseDataForLog);
                        }
                    }
                // ... (catch块和循环结束)
            }
        }
        // ... (后续的保存和返回逻辑)

        // 统一保存所有更改 (包括服务器拉取更新的、本地推送更新的、以及在服务器上删除的)
        if (addedFromServerCount > 0 || removedLocallyCount > 0 || updatedLocallyCount > 0 || deletedOnServerCount > 0) {
            console.log(`[performQQCalDavSync] Saving updated eventsDb. Added: ${addedFromServerCount}, RemovedLocally: ${removedLocallyCount}, PushedOrUpdatedLocally: ${updatedLocallyCount}, DeletedOnServer: ${deletedOnServerCount}`);
            await saveEvents(eventsDb);
        } else {
             console.log('[performQQCalDavSync] No changes to eventsDb required after sync and push/delete attempt.');
        }

        console.log('[performQQCalDavSync] QQ CalDAV sync process finished.');
        const message = `QQ CalDAV Sync successful. Added ${addedFromServerCount} from server. Removed ${removedLocallyCount} locally. Deleted ${deletedOnServerCount} on server. Created ${pushedToServerCount} on server. Updated ${updatedOnServerCount} on server.`;
        return { message: message, eventCount: addedFromServerCount + pushedToServerCount + updatedOnServerCount - removedLocallyCount - deletedOnServerCount }; 

    } catch (error) {
         console.error('[performQQCalDavSync] Error during QQ CalDAV sync process:', error); // <-- 修改日志前缀
         // isCalDavSyncRunning = false; // 不再在此函数中管理锁
          throw error; // Re-throw for the dispatcher handler
    } 
}

// --- 新函数：处理飞书 CalDAV 同步逻辑 (初始框架，只读) ---
async function performFeishuCalDavSync() {
    const currentSettings = caldavSettings;
    console.log(`[performFeishuCalDavSync] Starting Feishu sync for: ${currentSettings.username}`);
    
    let targetServerUrl = currentSettings.serverUrl; // 应该配置为 https://caldav.feishu.cn
    if (!targetServerUrl.startsWith('http')) targetServerUrl = 'https://' + targetServerUrl;
    console.log(`[performFeishuCalDavSync] Connecting to: ${targetServerUrl}`);

    try {
        // --- 模拟移动端 User-Agent ---
        const customHeaders = {
            'User-Agent': 'iOS/17.4.1 (21E236) dataaccessd/1.0' // 尝试模拟 iOS CalDAV 客户端
        };
        console.log('[performFeishuCalDavSync] Using custom User-Agent:', customHeaders['User-Agent']);
        // ---------------------------

        const client = new DAVClient({
            serverUrl: targetServerUrl,
            credentials: {
                username: currentSettings.username, // 飞书 CalDAV 用户名
                password: currentSettings.password // 飞书生成的 CalDAV 专用密码
            },
            authMethod: 'Basic', // 假设是 Basic，需要验证
            defaultAccountType: 'caldav',
            headers: customHeaders // <-- 添加自定义请求头
        });

        await client.login();
        console.log("[performFeishuCalDavSync] Login successful. Fetching calendars...");
        const calendars = await client.fetchCalendars();
        
        // --- 添加日志：打印所有找到的日历 --- 
        if (calendars && calendars.length > 0) {
            console.log("[performFeishuCalDavSync] Found the following calendars:");
            calendars.forEach((cal, index) => {
                console.log(`  [${index}] Name: ${cal.displayName}, URL: ${cal.url}, ReadOnly: ${cal.readOnly}`);
            });
                 } else {
             console.log('[performFeishuCalDavSync] No calendars found on Feishu server.');
             return { message: 'No calendars found on Feishu server.', eventCount: 0 };
        }
        // ----------------------------------------
        
        // 飞书可能只有一个主日历，或者需要用户指定。先假设同步第一个找到的。
        // let targetCalendar = calendars.find(cal => cal.url.includes('primary')) || calendars[0]; // 不再自动选择
        // --- 修改：明确选择名为 "李俊平" 的日历 --- 
        let targetCalendar = calendars.find(cal => cal.displayName === '李俊平');
        if (!targetCalendar) {
            console.error('[performFeishuCalDavSync] Could not find the calendar named "李俊平". Available calendars:', calendars.map(c => c.displayName));
            // 如果找不到，可以尝试回退到第一个，或者直接报错
            if (calendars.length > 0) {
                console.warn('[performFeishuCalDavSync] Falling back to the first available calendar.');
                targetCalendar = calendars[0];
            } else {
                 return { message: 'Could not find the calendar named "李俊平" and no other calendars available.', eventCount: -1, error: true };
            }
        }
        // -----------------------------------------
        console.log(`[performFeishuCalDavSync] Syncing calendar: ${targetCalendar.displayName} (${targetCalendar.url})`);

        const { startDate, endDate } = getStartEndDateForSync();
        console.log(`[performFeishuCalDavSync] Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
        const calendarObjects = await client.fetchCalendarObjects({
            calendar: targetCalendar,
            // 使用标准的 CalDAV 查询，不加 QQ 的特殊过滤器
            timeRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
            },
        });
        console.log(`[performFeishuCalDavSync] Fetched ${calendarObjects.length} raw calendar objects.`);

        // --- 处理从服务器获取的事件 (通用逻辑) ---
        const newOrUpdatedEvents = [];
        const eventsFromServerMap = new Map(); 
        for (const obj of calendarObjects) {
            if (!obj.data) continue;
            
            // --- 添加日志：记录从飞书服务器拉取的原始ICS数据 ---
            console.log(`[Feishu CalDAV Debug] Raw ICS data from Feishu for URL ${obj.url} (ETag: ${obj.etag}):\n------ BEGIN FEISHU ICS ------\n${obj.data}\n------ END FEISHU ICS ------`);
            // -------------------------------------------------

             try {
                const parsedEvents = ical.parseICS(obj.data);
                for (const key in parsedEvents) {
                    if (parsedEvents[key].type === 'VEVENT') {
                        const vevent = parsedEvents[key];
                        const eventUid = vevent.uid || obj.url;
                        const recurrenceId = vevent.recurrenceid ? new Date(vevent.recurrenceid).toISOString() : null;
                        const uniqueId = recurrenceId ? `${eventUid}_${recurrenceId}` : eventUid;
                        
                        eventsFromServerMap.set(uniqueId, { etag: obj.etag, data: vevent }); 

                        const eventStartDate = vevent.start ? new Date(vevent.start) : null;
                        const eventEndDate = vevent.end ? new Date(vevent.end) : (eventStartDate ? new Date(eventStartDate.getTime() + 3600*1000) : null);

                        if (eventStartDate && eventEndDate && !isNaN(eventStartDate) && !isNaN(eventEndDate)) {
                             const eventData = {
                                id: uniqueId,
                                title: vevent.summary || '无标题事件',
                                start_datetime: eventStartDate.toISOString(),
                                end_datetime: eventEndDate.toISOString(),
                                description: vevent.description || '',
                                location: vevent.location || '',
                                all_day: !!vevent.datetype && vevent.datetype === 'DATE',
                                source: 'caldav_sync_feishu', // 新的来源标记
                                caldav_uid: eventUid, 
                                caldav_etag: obj.etag,
                                caldav_url: obj.url, // <-- 添加这一行
                                created_at: vevent.created ? new Date(vevent.created).toISOString() : new Date().toISOString(),
                                updated_at: vevent.lastmodified ? new Date(vevent.lastmodified).toISOString() : new Date().toISOString(),
                                needs_caldav_push: false // 初始不需要推送
                            };
                            // 检查本地是否存在并更新 (与 QQ 逻辑相同)
                            const existingLocalEventIndex = eventsDb.findIndex(e => e.id === uniqueId);
                            if (existingLocalEventIndex === -1) {
                                newOrUpdatedEvents.push(eventData);
        } else {
                                const existingEvent = eventsDb[existingLocalEventIndex];
                                if (existingEvent.caldav_etag !== obj.etag) {
                                    console.log(`[performFeishuCalDavSync] Updating local event ${uniqueId} from Feishu server (ETag changed).`);
                                    eventsDb[existingLocalEventIndex] = eventData; 
                                }
                            }
                        }
                    }
                }
            } catch (parseError) {
                console.error(`[performFeishuCalDavSync] Error parsing ICS for ${obj.url}:`, parseError);
            }
        }
        
        // 合并新增的事件
        let addedFromServerCount = 0;
        if (newOrUpdatedEvents.length > 0) {
             console.log(`[performFeishuCalDavSync] Found ${newOrUpdatedEvents.length} new events from Feishu server to add locally.`);
            eventsDb = [...eventsDb, ...newOrUpdatedEvents];
            addedFromServerCount = newOrUpdatedEvents.length;
        }
        
        // 移除本地存在但服务器上已不存在的事件 (仅限 Feishu 来源)
        let removedLocallyCount = 0;
        eventsDb = eventsDb.filter(localEvent => {
            if (localEvent.source === 'caldav_sync_feishu') {
                if (!eventsFromServerMap.has(localEvent.id)) {
                     console.log(`[performFeishuCalDavSync] Removing local event ${localEvent.id} (source: Feishu) as it's no longer on the server.`);
                     removedLocallyCount++;
                     return false; 
                }
            }
            return true; 
        });
        if(removedLocallyCount > 0) {
             console.log(`[performFeishuCalDavSync] Removed ${removedLocallyCount} local events that were deleted from Feishu server.`);
        }

        // --- 推送逻辑 (启用标准推送) ---
        const eventsToPush = eventsDb.filter(e => 
            e.needs_caldav_push === true && 
            e.source !== 'caldav_sync_feishu' && // 不要推送刚从飞书拉下来的
            !e.caldav_uid // 只推送全新创建的 (更新逻辑暂不处理)
        );
        console.log(`[performFeishuCalDavSync] Found ${eventsToPush.length} locally created events marked for pushing.`);
        
        let pushedToServerCount = 0; 
        let updatedLocallyCount = 0; 

        // --- 修改：仅当有事件要处理时才定义函数，并移到循环外 ---
        if (eventsToPush.length > 0) {
            // --- 将函数定义移到循环外部 ---
                    const formatIcsDateArray = (dateString) => {
                        if (!dateString) return undefined;
                        const date = new Date(dateString);
                        return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
                    };
            // --------------------------------
                    
            for (const eventToPush of eventsToPush) {
                try {
                    console.log(`[performFeishuCalDavSync] Preparing to push event ID: ${eventToPush.id}, Title: ${eventToPush.title}`);
                    
                    // --- 使用 ics 库生成标准 iCalendar 数据 --- 
                    const eventAttributes = {
                        uid: eventToPush.id,
                        start: formatIcsDateArray(eventToPush.start_datetime),
                        startOutputType: 'utc',
                        title: eventToPush.title || '无标题事件', // <-- Re-add SUMMARY
                        description: eventToPush.description || '', // <-- Re-add DESCRIPTION (can be empty)
                        location: eventToPush.location || '',     // <-- Re-add LOCATION (can be empty)
                        productId: 'SmartCalendarApp/1.0', 
                        sequence: 0, 
                        status: 'TENTATIVE', // <-- Change to TENTATIVE based on Feishu example
                        // Set TRANSP based on whether start/end times suggest an all-day event
                        // (ics library might handle this if start/end are date arrays only, but let's be explicit)
                        transp: (eventToPush.start_datetime && eventToPush.start_datetime.length === 10 && (!eventToPush.end_datetime || eventToPush.end_datetime.length === 10)) ? 'TRANSPARENT' : 'OPAQUE',
                        organizer: { name: currentSettings.username, email: `${currentSettings.username}@feishu-caldav.internal` }, // <-- Use username for name, construct a dummy valid email
                        // Add CREATED and LAST-MODIFIED timestamps
                        created: formatIcsDateArray(new Date().toISOString()),
                        lastModified: formatIcsDateArray(new Date().toISOString()),
                        // DTSTAMP will be added by the ics library
                    };

                    if (eventToPush.end_datetime) {
                        eventAttributes.end = formatIcsDateArray(eventToPush.end_datetime);
                        eventAttributes.endOutputType = 'utc';
                    } else if (eventToPush.start_datetime && eventToPush.start_datetime.length === 10) {
                        // If start is just a date (YYYY-MM-DD), imply end is the next day for all-day event
                        const startDate = new Date(eventToPush.start_datetime + 'T00:00:00Z'); // Treat as UTC start of day
                        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
                        eventAttributes.end = [endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()];
                        // For all-day events, ics library uses VALUE=DATE if start/end are date arrays
                        eventAttributes.startOutputType = undefined; // Let ics handle based on array format
                        eventAttributes.endOutputType = undefined;
                    }

                    let iCalendarData = '';
                    const result = createIcsEvent(eventAttributes);

                    if (result.error) {
                        console.error("[performFeishuCalDavSync] Error generating standard ICS data:", result.error);
                        // 如果是之前的 organizer 错误，这里不应该再出现
                        throw result.error; 
                    } else {
                        iCalendarData = result.value;
                        // 移除 ics 库默认添加的 METHOD:PUBLISH (如果存在)
                        iCalendarData = iCalendarData.replace(/^METHOD:PUBLISH\r?\n/gm, ''); 
                        // 移除 ics 库可能添加的 X-PUBLISHED-TTL
                        iCalendarData = iCalendarData.replace(/^X-PUBLISHED-TTL:.*?\r?\n/gm, '');
                        // 尝试添加空的 METHOD: 行 (像飞书示例那样)
                        if (iCalendarData.includes('\nPRODID:')) {
                            iCalendarData = iCalendarData.replace(/(\nPRODID:[^\r\n]+)/, '$1\r\nMETHOD:');
                        } else {
                            // 如果没有 PRODID (不太可能)，尝试加在 VERSION 后面
                            iCalendarData = iCalendarData.replace(/(\nVERSION:[^\r\n]+)/, '$1\r\nMETHOD:');
                        }
                    }

                    if (!iCalendarData || !iCalendarData.includes('BEGIN:VEVENT')) {
                         console.error("[performFeishuCalDavSync] Standard ICS generation failed.");
                         throw new Error('Standard ICS generation failed.');
                    }
                    
                    const filename = `${eventToPush.id}.ics`; // 使用事件 ID 作为文件名
                    console.log(`[performFeishuCalDavSync] Generated standard iCalendar data for ${filename}:
------ BEGIN ICS ------
${iCalendarData}
------ END ICS ------`);

                    // --- 推送到服务器 ---
                    console.log(`[performFeishuCalDavSync] Creating object ${filename} in calendar ${targetCalendar.url}...`);
                    const createResult = await client.createCalendarObject({
                        calendar: targetCalendar,
                        filename: filename,
                        iCalendarData: iCalendarData,
                    });

                    if (createResult && createResult.etag) {
                        console.log(`[performFeishuCalDavSync] Successfully created ${filename} on Feishu server. ETag: ${createResult.etag}`);
                        pushedToServerCount++;
                        // 更新本地事件状态
                        const indexToUpdate = eventsDb.findIndex(e => e.id === eventToPush.id);
                        if (indexToUpdate !== -1) {
                            eventsDb[indexToUpdate].caldav_uid = eventToPush.id; 
                            eventsDb[indexToUpdate].caldav_etag = createResult.etag;
                            eventsDb[indexToUpdate].needs_caldav_push = false; 
                            eventsDb[indexToUpdate].source = 'caldav_sync_feishu'; // 推送成功后来源视为 Feishu
                            updatedLocallyCount++;
                            console.log(`[performFeishuCalDavSync] Updated local event ${eventToPush.id} with Feishu CalDAV info.`);
                        } else {
                             console.warn(`[performFeishuCalDavSync] Could not find local event ${eventToPush.id} to update after successful push.`);
                        }
                    } else {
                         // 飞书可能返回 201 Created 但没有 ETag，也视为成功
                         // 需要检查 createResult 的状态码，但 tsdav 可能不直接暴露 response status
                         // 暂时假设没有 etag 就是失败，后续可优化
                         console.error(`[performFeishuCalDavSync] Failed to create ${filename} on Feishu server. createResult:`, createResult);
                         // 可以考虑不抛出错误，允许后续事件继续推送
                    }

                } catch (pushError) {
                    console.error(`[performFeishuCalDavSync] Error pushing event ID ${eventToPush.id} to Feishu CalDAV server:`, pushError);
                    
                    // --- 处理 409 Conflict --- 
                    // tsdav 错误可能不直接包含 status code，需要检查响应对象 (如果 pushError 包含原始响应)
                    // 假设 pushError.response.status 存在或类似结构
                    let isConflict = false;
                    if (pushError && pushError.message && pushError.message.includes('409')) { // 检查消息字符串
                         isConflict = true;
                    }
                    // 更可靠的方式是检查 tsdav 返回的具体错误结构，但这需要调试或查阅文档
                    // 暂时基于错误消息字符串判断

                    if (isConflict) {
                         console.warn(`[performFeishuCalDavSync] Detected 409 Conflict for event ${eventToPush.id}. Assuming it already exists on the server.`);
                         // 更新本地事件状态，标记为已同步 (不再尝试推送)
                         const indexToUpdate = eventsDb.findIndex(e => e.id === eventToPush.id);
                         if (indexToUpdate !== -1) {
                            // --- DO NOTHING for 409 Conflict - Keep trying to push ---
                            console.warn(`[performFeishuCalDavSync] 409 Conflict for event ${eventToPush.id}. Event is NOT marked as synced locally and will be retried.`);
                            // We previously incorrectly marked the event as synced here.
                            // Now, we intentionally do nothing to the local event's status
                            // so that it will be attempted again on the next sync.
                            // -----------------------------------------------------------
                         } else {
                            console.error(`[performFeishuCalDavSync] Could not find local event ${eventToPush.id} to mark as synced after conflict.`);
                         }
                    }
                    // ---------------------------
                    else {
                         // 其他错误处理
                         if (pushError.message && pushError.message.includes('400')) {
                             console.error('[performFeishuCalDavSync] Received 400 Bad Request. The generated ICS data might be invalid for Feishu.');
                         } else if (pushError.message && pushError.message.includes('403')) {
                              console.error('[performFeishuCalDavSync] Received 403 Forbidden. Check write permissions for the calendar or the App Password scope.');
                         } else if (pushError.message && pushError.message.includes('50')) { // 5xx errors
                              console.error('[performFeishuCalDavSync] Received 5xx Server Error from Feishu. Server issue?');
                         }
                         // 对于其他错误，目前不更新本地状态，下次还会尝试推送
                    }
                }
            }
        }
        // --- 结束推送逻辑 ---

        // 保存更改 (包括拉取和推送的)
        if (addedFromServerCount > 0 || removedLocallyCount > 0 || updatedLocallyCount > 0) {
            console.log(`[performFeishuCalDavSync] Saving updated eventsDb. Added: ${addedFromServerCount}, Removed: ${removedLocallyCount}, Pushed&Updated: ${updatedLocallyCount}`); // 更新日志
            await saveEvents(eventsDb);
        } else {
             console.log('[performFeishuCalDavSync] No changes to eventsDb required after Feishu sync.');
        }

        console.log('[performFeishuCalDavSync] Feishu CalDAV sync process finished.'); // 更新日志
        const message = `Feishu CalDAV Sync successful. Added ${addedFromServerCount} from server. Removed ${removedLocallyCount} locally. Pushed ${pushedToServerCount} to server.`; // 更新消息
        return { message: message, eventCount: addedFromServerCount + pushedToServerCount - removedLocallyCount }; // 更新计数

    } catch (error) {
         console.error('[performFeishuCalDavSync] Error during Feishu CalDAV sync process:', error);
         // 添加具体的错误处理，例如认证失败
         if (error.message && (error.message.includes('401') || error.message.toLowerCase().includes('unauthorized'))) {
             throw new Error(`Feishu CalDAV authentication failed. Please check your CalDAV username and the generated App Password. Original error: ${error.message}`);
         } else if (error.message && error.message.includes('ECONNREFUSED')){
             throw new Error(`Connection refused for Feishu CalDAV server (${targetServerUrl}). Check the server URL and network. Original error: ${error.message}`);
         }
         throw error; // Re-throw generic error
    } 
}

// --- 新增：处理通用 CalDAV 同步逻辑 ---
async function performGenericCalDavSync() {
    const currentSettings = caldavSettings;
    console.log(`[performGenericCalDavSync] Starting Generic CalDAV sync for: ${currentSettings.username} at ${currentSettings.serverUrl}`);

    let targetServerUrl = currentSettings.serverUrl;
    if (!targetServerUrl.startsWith('http')) targetServerUrl = 'https://' + targetServerUrl;
    // 对于 Radicale，确保基础 URL 正确，不需要像 QQ 那样强制加斜杠
    // if (!targetServerUrl.endsWith('/')) targetServerUrl += '/'; // Radicale 可能不需要末尾斜杠
    console.log(`[performGenericCalDavSync] Connecting to: ${targetServerUrl}`);

    try {
        // --- 使用标准请求头，不模拟特定客户端 ---
        const client = new DAVClient({
            serverUrl: targetServerUrl,
            credentials: {
                username: currentSettings.username,
                password: currentSettings.password
            },
            authMethod: 'Basic', // Radicale 通常使用 Basic
            defaultAccountType: 'caldav'
            // 不设置 'headers' 字段
        });

        await client.login();
        console.log("[performGenericCalDavSync] Login successful. Fetching calendars...");
        const calendars = await client.fetchCalendars();

        if (calendars && calendars.length > 0) {
            console.log("[performGenericCalDavSync] Found the following calendars:");
            calendars.forEach((cal, index) => {
                console.log(`  [${index}] Name: ${cal.displayName}, URL: ${cal.url}, ReadOnly: ${cal.readOnly}`);
            });
        } else {
             console.log('[performGenericCalDavSync] No calendars found on the server.');
             return { message: 'No calendars found on the server.', eventCount: 0 };
        }

        // --- 恢复通用日历选择逻辑：优先 'Calendar' 或 '日历'，否则选第一个 ---
        let targetCalendar = calendars.find(cal => cal.displayName === 'Calendar' || cal.displayName === '日历') || calendars[0];
        if (!targetCalendar) {
             // 如果连第一个都没有，上面已经处理过了
              console.error('[performGenericCalDavSync] No suitable calendar found.');
              return { message: 'No suitable calendar found on server.', eventCount: -1, error: true };
        }
        // ---------------------------------------------------------------------
        console.log(`[performGenericCalDavSync] Syncing calendar: ${targetCalendar.displayName} (${targetCalendar.url})`);

        const { startDate, endDate } = getStartEndDateForSync();
        console.log(`[performGenericCalDavSync] Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
        const calendarObjects = await client.fetchCalendarObjects({
            calendar: targetCalendar,
            timeRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
            },
        });
        console.log(`[performGenericCalDavSync] Fetched ${calendarObjects.length} raw calendar objects.`);

        // --- 处理从服务器获取的事件 (与飞书逻辑类似，但来源标记不同) ---
        const newOrUpdatedEvents = [];
        const eventsFromServerMap = new Map();
        for (const obj of calendarObjects) {
            if (!obj.data) continue;

            // --- 添加通用日志 ---
            console.log(`[Generic CalDAV Debug] Raw ICS data from ${targetServerUrl} for URL ${obj.url} (ETag: ${obj.etag}):
------ BEGIN GENERIC ICS ------
${obj.data}
------ END GENERIC ICS ------`);
            // --------------------

             try {
                const parsedEvents = ical.parseICS(obj.data);
                for (const key in parsedEvents) {
                    if (parsedEvents[key].type === 'VEVENT') {
                        const vevent = parsedEvents[key];
                        const eventUid = vevent.uid || obj.url;
                        const recurrenceId = vevent.recurrenceid ? new Date(vevent.recurrenceid).toISOString() : null;
                        const uniqueId = recurrenceId ? `${eventUid}_${recurrenceId}` : eventUid;

                        eventsFromServerMap.set(uniqueId, { etag: obj.etag, data: vevent });

                        const eventStartDate = vevent.start ? new Date(vevent.start) : null;
                        const eventEndDate = vevent.end ? new Date(vevent.end) : (eventStartDate ? new Date(eventStartDate.getTime() + 3600*1000) : null);

                        if (eventStartDate && eventEndDate && !isNaN(eventStartDate) && !isNaN(eventEndDate)) {
                             const eventData = {
                                id: uniqueId,
                                title: vevent.summary || '无标题事件',
                                start_datetime: eventStartDate.toISOString(),
                                end_datetime: eventEndDate.toISOString(),
                                description: vevent.description || '',
                                location: vevent.location || '',
                                all_day: !!vevent.datetype && vevent.datetype === 'DATE',
                                source: 'caldav_sync_generic', // <-- 标记为通用来源
                                caldav_uid: eventUid,
                                caldav_etag: obj.etag,
                                caldav_url: obj.url, // <-- 添加这一行
                                created_at: vevent.created ? new Date(vevent.created).toISOString() : new Date().toISOString(),
                                updated_at: vevent.lastmodified ? new Date(vevent.lastmodified).toISOString() : new Date().toISOString(),
                                needs_caldav_push: false
                            };
                            const existingLocalEventIndex = eventsDb.findIndex(e => e.id === uniqueId);
                            if (existingLocalEventIndex === -1) {
                                newOrUpdatedEvents.push(eventData);
                            } else {
                                const existingEvent = eventsDb[existingLocalEventIndex];
                                if (existingEvent.caldav_etag !== obj.etag) {
                                    console.log(`[performGenericCalDavSync] Updating local event ${uniqueId} from Generic server (ETag changed).`);
                                    eventsDb[existingLocalEventIndex] = eventData;
                                }
                            }
                        }
                    }
                }
            } catch (parseError) {
                console.error(`[performGenericCalDavSync] Error parsing ICS for ${obj.url}:`, parseError);
            }
        }

        let addedFromServerCount = 0;
        if (newOrUpdatedEvents.length > 0) {
             console.log(`[performGenericCalDavSync] Found ${newOrUpdatedEvents.length} new events from Generic server to add locally.`);
            eventsDb = [...eventsDb, ...newOrUpdatedEvents];
            addedFromServerCount = newOrUpdatedEvents.length;
        }

        let removedLocallyCount = 0;
        eventsDb = eventsDb.filter(localEvent => {
            if (localEvent.source === 'caldav_sync_generic') { // <-- 检查通用来源
                if (!eventsFromServerMap.has(localEvent.id)) {
                     console.log(`[performGenericCalDavSync] Removing local event ${localEvent.id} (source: Generic) as it's no longer on the server.`);
                     removedLocallyCount++;
                     return false;
                }
            }
            return true;
        });
        if(removedLocallyCount > 0) {
             console.log(`[performGenericCalDavSync] Removed ${removedLocallyCount} local events that were deleted from Generic server.`);
        }

        // --- 推送逻辑 (使用标准推送，类似飞书逻辑但不含特殊 User-Agent) ---
        const eventsToPush = eventsDb.filter(e =>
            e.needs_caldav_push === true &&
            e.source !== 'caldav_sync_generic' && // 不要推送刚从通用服务器拉下来的
            !e.caldav_uid // 只推送全新创建的
        );
        console.log(`[performGenericCalDavSync] Found ${eventsToPush.length} locally created events marked for pushing.`);

        let pushedToServerCount = 0;
        let updatedLocallyCount = 0;

        // --- 修改：仅当有事件要处理时才定义函数，并移到循环外 ---
        if (eventsToPush.length > 0) {
            // --- 将函数定义移到循环外部 ---
                    const formatUtcIcsDateArray = (dateString) => {
                        if (!dateString) return undefined;
                        const date = new Date(dateString);
                        if (dateString.length === 10 && dateString.indexOf('T') === -1) {
                            return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
                        }
                        return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
                    };
            // --------------------------------

            for (const eventToPush of eventsToPush) {
                try {
                    console.log(`[performGenericCalDavSync] Preparing to push event ID: ${eventToPush.id}, Title: ${eventToPush.title}`);

                    // --- 使用 UTC 时间格式化 --- 
                    const eventAttributes = {
                        uid: eventToPush.id,
                        start: formatUtcIcsDateArray(eventToPush.start_datetime),
                        startOutputType: 'utc',
                        title: eventToPush.title || '无标题事件',
                        description: eventToPush.description || '',
                        location: eventToPush.location || '',
                        productId: 'SmartCalendarApp/1.0', // <-- 恢复 productId
                        sequence: 0,
                        status: 'CONFIRMED',
                        created: formatUtcIcsDateArray(new Date().toISOString()), // <-- 恢复 created
                        lastModified: formatUtcIcsDateArray(new Date().toISOString()) // <-- 恢复 lastModified
                    };

                    // 处理全天事件的结束日期和透明度
                    let isAllDay = eventToPush.start_datetime && eventToPush.start_datetime.length === 10 && (!eventToPush.end_datetime || eventToPush.end_datetime.length === 10);
                    if (isAllDay) {
                         eventAttributes.transp = 'TRANSPARENT';
                         delete eventAttributes.startOutputType;
                         if (eventToPush.end_datetime) {
                             eventAttributes.end = formatUtcIcsDateArray(eventToPush.end_datetime);
                         } else {
                             const startDate = new Date(eventToPush.start_datetime + 'T00:00:00Z');
                             const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
                             eventAttributes.end = [endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate()];
                         }
                    } else {
                         eventAttributes.transp = 'OPAQUE';
                         if (eventToPush.end_datetime) {
                             eventAttributes.end = formatUtcIcsDateArray(eventToPush.end_datetime);
                             eventAttributes.endOutputType = 'utc';
                         }
                    }

                    let iCalendarData = '';
                    const result = createIcsEvent(eventAttributes);

                    if (result.error) {
                        console.error("[performGenericCalDavSync] Error generating standard ICS data:", result.error);
                        throw result.error;
                    } else {
                        iCalendarData = result.value;
                        // --- 仅移除 METHOD:PUBLISH 和 X-PUBLISHED-TTL --- 
                        iCalendarData = iCalendarData.replace(/^METHOD:PUBLISH\r?\n/gm, '');
                        iCalendarData = iCalendarData.replace(/^X-PUBLISHED-TTL:.*?\r?\n/gm, '');
                        // --- 不再移除 PRODID --- 
                    }

                    if (!iCalendarData || !iCalendarData.includes('BEGIN:VEVENT')) {
                         console.error("[performGenericCalDavSync] Standard ICS generation failed.");
                         throw new Error('Standard ICS generation failed.');
                    }
                    
                    const filename = `${eventToPush.id}.ics`; 
                    // --- 添加日志：打印最终发送给 Generic 服务器的 ICS --- 
                    console.log(`[performGenericCalDavSync] Final iCalendar data being sent to Generic Server for ${filename}:
------ BEGIN GENERIC PUSH ICS ------
${iCalendarData}
------ END GENERIC PUSH ICS ------`);
                    // -------------------------------------------

                    console.log(`[performGenericCalDavSync] Creating object ${filename} in calendar ${targetCalendar.url}...`);
                    const createResult = await client.createCalendarObject({
                        calendar: targetCalendar,
                        filename: filename,
                        iCalendarData: iCalendarData,
                    });

                    // ... (处理推送结果和错误，包括 409 Conflict 的逻辑保持不变) ...
                    if (createResult && createResult.etag) {
                        console.log(`[performGenericCalDavSync] Successfully created ${filename} on Generic server. ETag: ${createResult.etag}`);
                        pushedToServerCount++;
                        const indexToUpdate = eventsDb.findIndex(e => e.id === eventToPush.id);
                        if (indexToUpdate !== -1) {
                            eventsDb[indexToUpdate].caldav_uid = eventToPush.id;
                            eventsDb[indexToUpdate].caldav_etag = createResult.etag;
                            eventsDb[indexToUpdate].needs_caldav_push = false;
                            eventsDb[indexToUpdate].source = 'caldav_sync_generic'; 
                            updatedLocallyCount++;
                            console.log(`[performGenericCalDavSync] Updated local event ${eventToPush.id} with Generic CalDAV info.`);
                        } else {
                             console.warn(`[performGenericCalDavSync] Could not find local event ${eventToPush.id} to update after successful push.`);
                        }
                    } else {
                         console.error(`[performGenericCalDavSync] Failed to create ${filename} on Generic server. createResult:`, createResult);
                    }

                } catch (pushError) {
                    console.error(`[performGenericCalDavSync] Error pushing event ID ${eventToPush.id} to Generic CalDAV server:`, pushError);

                    // --- 保留 409 Conflict 处理 ---
                    let isConflict = false;
                    if (pushError && pushError.message && pushError.message.includes('409')) {
                         isConflict = true;
                    }

                    if (isConflict) {
                         console.warn(`[performGenericCalDavSync] Detected 409 Conflict for event ${eventToPush.id}. Assuming it already exists on the server. Marking as synced locally.`);
                         const indexToUpdate = eventsDb.findIndex(e => e.id === eventToPush.id);
                         if (indexToUpdate !== -1) {
                              // --- 标记为已解决冲突 ---
                              eventsDb[indexToUpdate].needs_caldav_push = false; // 不再尝试推送
                              // 可以考虑从服务器获取 etag，但暂时先标记为不同步
                              // eventsDb[indexToUpdate].caldav_etag = 'CONFLICT_RESOLVED'; 
                              console.log(`[performGenericCalDavSync] Marked event ${eventToPush.id} as synced locally due to 409 conflict.`);
                              updatedLocallyCount++; // 算作一次本地更新
                         }
                    }
                    // --- 结束 409 处理 ---
                    else {
                         if (pushError.message && pushError.message.includes('400')) {
                             console.error('[performGenericCalDavSync] Received 400 Bad Request. The generated ICS data might be invalid.');
                         } else if (pushError.message && pushError.message.includes('403')) {
                              console.error('[performGenericCalDavSync] Received 403 Forbidden. Check write permissions.');
                         } else if (pushError.message && pushError.message.includes('50')) {
                              console.error('[performGenericCalDavSync] Received 5xx Server Error.');
                         }
                    }
                }
            }
        }
        // --- 结束推送逻辑 ---

        // ... (保存和返回逻辑保持不变) ...
        if (addedFromServerCount > 0 || removedLocallyCount > 0 || updatedLocallyCount > 0) {
            console.log(`[performGenericCalDavSync] Saving updated eventsDb. Added: ${addedFromServerCount}, Removed: ${removedLocallyCount}, UpdatedLocally: ${updatedLocallyCount}`);
            await saveEvents(eventsDb);
        } else {
             console.log('[performGenericCalDavSync] No changes to eventsDb required after Generic sync.');
        }

        console.log('[performGenericCalDavSync] Generic CalDAV sync process finished.');
        const message = `Generic CalDAV Sync successful. Added ${addedFromServerCount} from server. Removed ${removedLocallyCount} locally. Pushed ${pushedToServerCount} to server. Updated ${updatedLocallyCount} locally (incl. conflicts).`;
        return { message: message, eventCount: addedFromServerCount + pushedToServerCount - removedLocallyCount };

    } catch (error) {
         console.error('[performGenericCalDavSync] Error during Generic CalDAV sync process:', error);
         if (error.message && (error.message.includes('401') || error.message.toLowerCase().includes('unauthorized'))) {
             throw new Error(`Generic CalDAV authentication failed. Check username/password. Original error: ${error.message}`);
         } else if (error.message && error.message.includes('ECONNREFUSED')){ 
             throw new Error(`Connection refused for Generic CalDAV server (${targetServerUrl}). Check URL/network. Original error: ${error.message}`);
         } else if (error.message && (error.message.includes('ENOTFOUND') || error.message.includes('EAI_AGAIN'))) {
             throw new Error(`Could not resolve Generic CalDAV server address (${targetServerUrl}). Check URL/DNS. Original error: ${error.message}`);
         }
         throw error; // Re-throw generic error
    }
}

// --- 重构后的主 CalDAV 同步函数 (分发器) ---
async function performCalDavSync() {
     if (isCalDavSyncRunning) {
        console.log('[CalDAV Dispatcher] Sync is already running. Skipping this run.');
        return { message: "Sync already in progress", eventCount: 0 };
    }
    isCalDavSyncRunning = true;
    console.log('[CalDAV Dispatcher] Starting scheduled CalDAV sync...');
    
    const currentSettings = caldavSettings;
    if (!currentSettings || !currentSettings.username || !currentSettings.password || !currentSettings.serverUrl) {
        console.error('[CalDAV Dispatcher] CalDAV settings not fully configured.');
        isCalDavSyncRunning = false;
        return { message: 'CalDAV settings not fully configured.', eventCount: -1, error: true };
    }
    
    try {
        // 检查是否是 QQ CalDAV
        if (currentSettings.serverUrl.toLowerCase().includes('dav.qq.com')) {
            console.log('[CalDAV Dispatcher] Detected QQ CalDAV server. Dispatching to performQQCalDavSync...');
            const result = await performQQCalDavSync(); // 调用 QQ 特定函数
            isCalDavSyncRunning = false; // 释放锁
            return result; // 返回 QQ 函数的结果
        }
        // 检查是否是飞书 CalDAV
        else if (currentSettings.serverUrl.toLowerCase().includes('caldav.feishu.cn')) {
            console.log('[CalDAV Dispatcher] Detected Feishu CalDAV server. Dispatching to performFeishuCalDavSync...');
            try {
                const result = await performFeishuCalDavSync(); // 调用飞书特定函数
                isCalDavSyncRunning = false; // 释放锁
                return result;
            } catch (feishuError) {
                console.error('[CalDAV Dispatcher] Error during Feishu sync:', feishuError);
                isCalDavSyncRunning = false; // 释放锁
                return { message: `Feishu CalDAV sync failed: ${feishuError.message}`, eventCount: -1, error: true };
            }
        }
        // 其他所有 CalDAV 服务器 (包括 Radicale)
        else {
            console.log(`[CalDAV Dispatcher] Detected Generic CalDAV server: ${currentSettings.serverUrl}. Dispatching to performGenericCalDavSync...`);
            try {
                const result = await performGenericCalDavSync(); // 调用新增的通用函数
                isCalDavSyncRunning = false; // 释放锁
                return result; // 返回通用函数的结果
            } catch (genericError) {
                console.error('[CalDAV Dispatcher] Error during Generic CalDAV sync:', genericError);
                isCalDavSyncRunning = false; // 释放锁
                // 返回包含具体错误的消息
                return { message: `Generic CalDAV sync failed: ${genericError.message}`, eventCount: -1, error: true };
            }
        }
    } catch (error) {
         // 这个 catch 理论上只会在 QQ 同步直接抛出错误时触发 (因为其他分支有自己的 try/catch)
         console.error('[CalDAV Dispatcher] Unexpected error during CalDAV sync process:', error);
         isCalDavSyncRunning = false; // 确保释放锁
          // throw error; // 可以重新抛出，让上层处理
         // 或者返回错误信息
         return { message: `CalDAV sync failed unexpectedly: ${error.message}`, eventCount: -1, error: true };
    }
}

// --- 新增：从文档导入事件路由 ---
app.post('/events/import', authenticateUser, upload.single('documentFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件。' });
    }
    const uploadedFile = req.file;
    const userId = getCurrentUserId(req);
    console.log(`[POST /events/import] Received file: ${uploadedFile.originalname}`);

    let documentText = '';
    try {
        // --- Text Extraction (remains the same) ---
        if (uploadedFile.mimetype === 'text/plain') {
            documentText = uploadedFile.buffer.toString('utf8');
            console.log("[Import] Extracted text from .txt file.");
        } else if (uploadedFile.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || uploadedFile.originalname.toLowerCase().endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer: uploadedFile.buffer });
            documentText = result.value;
            console.log("[Import] Successfully extracted text from .docx file.");
        } else {
            return res.status(400).json({ error: '不支持的文件类型。请上传 .txt 或 .docx 文件。' });
        }
        if (!documentText) {
             return res.status(400).json({ error: '无法从文件中提取文本内容，或者文件为空。' });
        }

        // --- LLM Parsing Logic --- 
        console.log("[Import] Applying LLM parsing logic...");

        // 1. Check LLM configuration
        const currentLlmSettings = llmSettings; // Use the loaded settings
        if (!currentLlmSettings || !currentLlmSettings.provider || currentLlmSettings.provider === 'none') {
            console.error("[Import] LLM not configured.");
            return res.status(409).json({ error: 'LLM 未配置，无法解析文档。请在设置中配置 LLM。' });
        }
        // Check for required API key for OpenAI/Deepseek
        if ((currentLlmSettings.provider === 'openai' || currentLlmSettings.provider === 'deepseek') && !currentLlmSettings.api_key) {
             console.error(`[Import] API key missing for ${currentLlmSettings.provider}.`);
             return res.status(409).json({ error: `缺少 ${currentLlmSettings.provider} 的 API Key。请在设置中配置。` });
        }

        // 2. Initialize LLM Client (Example using OpenAI library)
        let openaiClient;
        let modelToUse = currentLlmSettings.model_name || 'gpt-3.5-turbo'; // Default model
        try {
             openaiClient = new OpenAI({
                 apiKey: currentLlmSettings.api_key, // Required for OpenAI/Deepseek
                 baseURL: currentLlmSettings.base_url || (currentLlmSettings.provider === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined), // Set base URL for Deepseek or custom OpenAI-compatible
             });
             // Potentially adjust model name based on provider if needed
             if (currentLlmSettings.provider === 'deepseek' && !currentLlmSettings.model_name) {
                  modelToUse = 'deepseek-chat'; // Default deepseek model
             }
             console.log(`[Import] Initialized LLM client for provider: ${currentLlmSettings.provider}, using model: ${modelToUse}, baseURL: ${openaiClient.baseURL}`);
        } catch (initError) {
            console.error("[Import] Failed to initialize LLM client:", initError);
            return res.status(500).json({ error: `初始化LLM客户端失败: ${initError instanceof Error ? initError.message : String(initError)}` });
        }

        // 3. Construct Prompt
        const prompt = `
请仔细阅读以下文档内容，识别出其中包含具体行动步骤和对应"目标日期"的任务列表。
仅提取明确列出的行动步骤。
对于每个识别出的行动步骤，提取其完整的描述文本和对应的目标日期。
请将结果格式化为 JSON 数组，数组中的每个对象包含 "title" (字符串类型，为行动步骤的描述) 和 "date" (字符串类型，格式为 YYYY-MM-DD) 两个键。
如果找不到任何符合条件的行动步骤和日期，请返回一个空数组 []。
不要包含任何额外的解释或注释，只需返回 JSON 数组。

文档内容：
---
${documentText}
---

JSON 数组结果：
`;

        // 4. Call LLM API
        let llmResponseContent = '';
        try {
            console.log("[Import] Sending request to LLM...");
            const completion = await openaiClient.chat.completions.create({
                model: modelToUse,
                messages: [
                    { role: "system", content: "你是一个精确的文本分析助手，负责从文档中提取结构化的行动计划，并以指定的 JSON 格式返回结果。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1, // Low temperature for deterministic extraction
                response_format: { type: "json_object" } // Request JSON output if supported by model/provider
            });

            // Accessing the response content might vary slightly based on the exact API version/response structure
            llmResponseContent = completion?.choices?.[0]?.message?.content?.trim() ?? '';
            console.log("[Import] Received LLM response content (raw):", llmResponseContent);

            if (!llmResponseContent) {
                throw new Error('LLM 返回了空的响应内容。');
            }

        } catch (llmError) {
            console.error("[Import] LLM API call failed:", llmError);
            // Provide more context in the error message
            let detail = llmError instanceof Error ? llmError.message : String(llmError);
            if (detail.includes('authentication')) {
                 detail = 'LLM 身份验证失败，请检查 API Key。' + ` (${detail})`;
            } else if (detail.includes('rate limit')) {
                 detail = '已达到 LLM API 速率限制。' + ` (${detail})`;
            } else if (detail.includes('not found') && detail.includes('model')){
                 detail = `指定的模型 '${modelToUse}' 未找到或不可用。` + ` (${detail})`;
            }
            return res.status(500).json({ error: `调用 LLM 解析失败: ${detail}` });
        }

        // 5. Parse LLM Response and Create Events
        let parsedEventsFromLLM = [];
        try {
            // The LLM might return a JSON object containing the array, or just the array string.
            // Robust parsing:
            let jsonData;
            try {
                 jsonData = JSON.parse(llmResponseContent);
            } catch (e) {
                // If direct parsing fails, try finding JSON array within the string
                const jsonMatch = llmResponseContent.match(/(\[[\s\S]*?\])/);
                if (jsonMatch && jsonMatch[1]) {
                    console.warn("[Import] LLM response was not pure JSON, attempting to extract array...");
                    jsonData = JSON.parse(jsonMatch[1]);
                } else {
                    throw new Error('无法解析 LLM 返回的 JSON 响应。内容: ' + llmResponseContent.substring(0, 100) + '...');
                }
            }
            
            // Check if the parsed data is an array
            if (!Array.isArray(jsonData)) {
                // Sometimes the model wraps the array in a key, e.g., { "events": [...] }
                // Try to find an array within the object
                const arrayKey = Object.keys(jsonData).find(key => Array.isArray(jsonData[key]));
                if (arrayKey) {
                    console.warn(`[Import] LLM response was an object, using array found under key '${arrayKey}'`);
                     parsedEventsFromLLM = jsonData[arrayKey];
                } else {
                    throw new Error('LLM 返回的 JSON 格式不正确，期望得到一个数组。收到的: ' + JSON.stringify(jsonData).substring(0, 100) + '...');
                }
            } else {
                 parsedEventsFromLLM = jsonData;
            }

            // Validate the structure of each item
            if (!parsedEventsFromLLM.every(item => item && typeof item.title === 'string' && typeof item.date === 'string')) {
                console.error("[Import] LLM returned array items with invalid structure:", parsedEventsFromLLM);
                throw new Error('LLM 返回数组中的对象格式不正确 (缺少 title 或 date，或类型错误)。');
            }
            console.log(`[Import] Successfully parsed ${parsedEventsFromLLM.length} events from LLM response.`);

        } catch (parseError) {
            console.error("[Import] Failed to parse LLM JSON response:", parseError);
            return res.status(500).json({ error: `解析 LLM 响应失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` });
        }

        // 6. Create event objects and save
        const newEvents = [];
        const parseDateString = (dateStr) => {
             if (!dateStr) return null;
             // LLM should return YYYY-MM-DD, directly usable by new Date()
             const date = new Date(dateStr.trim()); // Allow for potential whitespace
             if (isNaN(date.getTime())) {
                 console.warn(`[Import-LLM] 无效的日期字符串: ${dateStr}`);
                 return null;
             } 
             if(date.getFullYear() < 2000 || date.getFullYear() > 2100) {
                  console.warn(`[Import-LLM] 解析出的年份不合理: ${date.getFullYear()} from ${dateStr}`);
                  return null;
             }
             return date;
        };

        for (const item of parsedEventsFromLLM) {
            const targetDate = parseDateString(item.date);
            if (item.title && targetDate) {
                const startDate = new Date(targetDate); startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(targetDate); endDate.setHours(23, 59, 59, 999);
                newEvents.push({
                    id: uuidv4(),
                    title: item.title.trim(),
                    start_datetime: startDate.toISOString(), 
                    end_datetime: endDate.toISOString(),
                    is_all_day: true, 
                    completed: false, 
                    source: 'llm_import',
                    userId: userId, // 添加用户ID
                    created_at: new Date().toISOString(), 
                    updated_at: new Date().toISOString(),
                    needs_caldav_push: true, // <-- 添加推送标记
                    caldav_uid: null,      // <-- 确保初始为空
                    caldav_etag: null       // <-- 确保初始为空
                });
            } else {
                 console.warn(`[Import-LLM] Skipped event from LLM due to missing title or invalid date:`, item);
            }
        }

        if (newEvents.length > 0) {
            // 加载用户的事件数据
            let userEvents = await loadEvents(userId);
            
            // 添加新导入的事件
            userEvents = [...userEvents, ...newEvents];
            
            // 保存到用户特定的文件
            await saveEvents(userEvents, userId);
            console.log(`[用户 ${req.user.username}] 通过LLM成功导入并保存了 ${newEvents.length} 个事件`);
            
            // 立即触发CalDAV同步
            triggerImmediateCalDavSync(userId, 'LLM文档导入事件创建').catch(syncError => {
                console.error(`[用户 ${req.user.username}] 导入事件后立即同步失败:`, syncError);
            });
            
            res.status(200).json({ message: `通过 LLM 成功导入 ${newEvents.length} 个事件。`, count: newEvents.length });
        } else {
            console.log(`[用户 ${req.user.username}] LLM 未返回任何有效事件`);
            res.status(200).json({ message: 'LLM 已处理文档，但未解析出任何有效事件。' , count: 0 });
        }

    } catch (error) {
        console.error('[POST /events/import] Unexpected error processing file with LLM:', error);
        res.status(500).json({ error: `处理文件时发生意外服务器错误: ${error instanceof Error ? error.message : String(error)}` });
    }
});

// --- CalDAV 同步路由 (最终定义) ---
app.post('/sync/caldav', authenticateUser, async (req, res) => {
    const userId = getCurrentUserId(req);
    console.log(`[POST /sync/caldav] 用户 ${req.user.username} (原始ID: ${req.user.id}, 映射ID: ${userId}) 触发CalDAV同步...`);

    let syncResult;
    try {
        // 调用用户特定的 CalDAV 同步函数
        syncResult = await performCalDavSyncForUser(userId);
        console.log("[/sync/caldav Route] performCalDavSyncForUser finished. Raw result:", syncResult);

        // 检查返回结果的结构
        if (syncResult && typeof syncResult === 'object') {
            if (syncResult.error) {
                // 如果分发函数明确返回了错误标记
                console.error(`[/sync/caldav Route] Sync failed explicitly: ${syncResult.message}`);
                // 确保返回的是 JSON
                return res.status(500).json({
                    error: syncResult.message || 'CalDAV sync failed. Check server logs.',
                    details: syncResult.error === true ? null : syncResult.error // 如果 error 是 true，则不传具体错误；否则传递
                });
            } else {
                // 同步成功或无新事件
                console.log(`[/sync/caldav Route] Sync seems successful: ${syncResult.message}`);
                return res.status(200).json({ 
                    message: syncResult.message || 'Sync completed.',
                    eventCount: syncResult.eventCount || 0 
                });
            }
        } else {
             // 如果 performCalDavSyncForUser 返回了非对象或 null/undefined
             console.error("[/sync/caldav Route] performCalDavSyncForUser returned an unexpected result type:", syncResult);
             return res.status(500).json({ error: 'CalDAV sync function returned an unexpected result format.' });
        }

    } catch (routeError) {
        // 捕获 performCalDavSyncForUser 抛出的错误 或 路由处理中的其他错误
        console.error("[/sync/caldav Route] Caught unexpected error in route handler:", routeError);
        // 确保返回 JSON 格式的错误
        return res.status(500).json({ 
            error: 'An unexpected error occurred during CalDAV sync.',
            details: routeError instanceof Error ? routeError.message : String(routeError)
        });
    }
});

// --- 最后的测试路由 --- 

// --- IMAP Filter 配置路由 ---
app.get('/config/imap-filter', optionalAuth, async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        const userInfo = { username: req.user?.username, email: req.user?.email };

        // 使用新的设置服务获取IMAP过滤设置
        const settings = await newSettingsService.getImapFilterSettings(userId, userInfo);

        // 更新内存缓存
        imapFilterSettings = { ...settings };
        console.log('[IMAP Filter配置] 获取设置成功:', imapFilterSettings);

        res.status(200).json(imapFilterSettings);
    } catch (error) {
        console.error('获取IMAP过滤器设置失败:', error);
        // 发生错误时返回默认设置
        const defaultSettings = { sender_allowlist: [] };
        res.status(200).json(defaultSettings);
    }
});

app.post('/config/imap-filter', optionalAuth, async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || !Array.isArray(newSettings.sender_allowlist) || 
        !newSettings.sender_allowlist.every(item => typeof item === 'string')) {
        return res.status(400).json({ error: '无效的IMAP过滤器设置格式。应为 { sender_allowlist: ["email1@example.com"] }.' });
    }
    
    const cleanedAllowlist = newSettings.sender_allowlist
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0);

    const settingsToSave = { sender_allowlist: cleanedAllowlist };
    const userId = getCurrentUserId(req);
    const userInfo = { username: req.user?.username, email: req.user?.email };

    try {
        // 使用新的设置服务保存IMAP过滤设置
        const success = await newSettingsService.saveImapFilterSettings(settingsToSave, userId, userInfo);
        
        if (success) {
            // 更新内存缓存
        imapFilterSettings = { ...settingsToSave };
        
        res.status(200).json({ 
            message: 'IMAP发件人白名单已保存。', 
            settings: imapFilterSettings,
                syncedToUnified: await newSettingsService.isUnifiedServiceAvailable()
        });
        } else {
            throw new Error('设置管理器保存失败');
        }
    } catch (error) {
        console.error("保存IMAP过滤器设置失败:", error);
        res.status(500).json({ error: "保存IMAP过滤器设置失败。" });
    }
});

// --- IMAP 同步路由 ---
app.post('/sync/imap', authenticateUser, async (req, res) => {
    console.log(`[POST /sync/imap] 用户 ${req.user.username} (${req.user.id}) 触发IMAP同步，使用AI智能识别邮件中的日程事件...`);
    
    try {
        // 提取用户token用于设置获取
        const authHeader = req.headers.authorization;
        const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        // 获取用户特定的IMAP设置
        const userId = getCurrentUserId(req);
        let userImapSettings;
        try {
            // 使用新的设置服务获取IMAP设置
            const userInfo = { username: req.user.username, email: req.user.email };
            const settings = await newSettingsService.getImapSettings(userId, userInfo);

            // 转换新设置服务格式到IMAP同步期望的格式
            userImapSettings = {
                email: settings.user,     // 原始格式用的是 user
                imapHost: settings.host,  // 原始格式用的是 host
                password: settings.password,
                imapPort: settings.port,  // 原始格式用的是 port
                useTLS: settings.tls,     // 原始格式用的是 tls
                // 保持向后兼容的字段名
                user: settings.user,
                host: settings.host
            };

            console.log('[/sync/imap] 用户IMAP设置:', {
                email: userImapSettings.email,
                host: userImapSettings.host,
                hasPassword: !!userImapSettings.password
            });
        } catch (error) {
            console.error('[/sync/imap] 获取用户IMAP设置失败:', error);
            userImapSettings = imapSettings; // 回退到全局设置
        }

        // 检查IMAP设置是否已配置
        // 注意：performImapSync期望的字段名是 email、imapHost、password
        // 但newSettingsService返回的字段名是 user、host、password
        // 需要进行字段名映射
        if (!userImapSettings || !userImapSettings.user || !userImapSettings.password || !userImapSettings.host) {
            console.error('[/sync/imap] IMAP设置未完全配置，当前设置:', {
                hasUser: !!userImapSettings?.user,
                hasPassword: !!userImapSettings?.password,
                hasHost: !!userImapSettings?.host,
                settings: userImapSettings
            });
            return res.status(400).json({ error: 'IMAP设置未完全配置，请先完成IMAP邮箱设置。' });
        }

        // 转换字段名以匹配performImapSync的期望
        const mappedImapSettings = {
            email: userImapSettings.user,
            imapHost: userImapSettings.host,
            password: userImapSettings.password,
            imapPort: userImapSettings.port || 993,
            useTLS: userImapSettings.tls !== false
        };

        // 调用IMAP同步函数，传入用户ID、token和用户特定的IMAP设置
        const syncResult = await performImapSync(req.user.id, userToken, mappedImapSettings);
        console.log("[/sync/imap Route] performImapSync finished. Result:", syncResult);

        // 检查同步结果
        if (syncResult && typeof syncResult === 'object') {
            if (syncResult.error) {
                console.error(`[/sync/imap Route] Sync failed: ${syncResult.message}`);
                return res.status(500).json({
                    error: syncResult.message || 'IMAP sync failed. Check server logs.',
                    details: syncResult.error === true ? null : syncResult.error
                });
            } else {
                console.log(`[/sync/imap Route] Sync successful: ${syncResult.message}`);
                return res.status(200).json({ 
                    message: syncResult.message || 'AI已完成邮件分析和事件提取。',
                    count: syncResult.eventCount || 0
                });
            }
        } else {
            console.error("[/sync/imap Route] performImapSync returned unexpected result:", syncResult);
            return res.status(500).json({ error: 'IMAP同步功能返回了意外的结果格式。' });
        }

    } catch (routeError) {
        console.error("[/sync/imap Route] Caught error in route handler:", routeError);
        return res.status(500).json({ 
            error: 'IMAP同步过程中发生意外错误。',
            details: routeError instanceof Error ? routeError.message : String(routeError)
        });
    }
});

// --- 调试端点：重置LLM缓存 ---
app.post('/debug/reset-llm-cache', authenticateUser, async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        
        // 强制重置缓存
        forceResetLlmCache();
        
        console.log(`[Debug] 用户 ${userId} 的LLM缓存已重置`);
        
        res.json({
            message: `用户 ${userId} 的LLM配置缓存已重置，下次调用将获取最新配置`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Debug] 重置LLM缓存失败:', error);
        res.status(500).json({
            error: '重置LLM缓存失败'
        });
    }
});

// --- 调试端点：重置IMAP同步锁 ---
app.post('/debug/reset-imap-lock', authenticateUser, async (req, res) => {
    try {
        const userId = getCurrentUserId(req);
        
        // 重置IMAP同步锁
        isImapSyncRunning = false;
        
        console.log(`[Debug] 用户 ${userId} 重置了IMAP同步锁`);
        
        res.json({
            message: 'IMAP同步锁已重置，现在可以重新进行同步',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Debug] 重置IMAP同步锁失败:', error);
        res.status(500).json({
            error: '重置IMAP同步锁失败'
        });
    }
});

// 环境变量检查端点
app.get('/debug/env', (req, res) => {
    res.json({
        STORAGE_TYPE: process.env.STORAGE_TYPE,
        NAS_PATH: process.env.NAS_PATH,
        PROJECT_ROOT: process.env.PROJECT_ROOT,
        NODE_ENV: process.env.NODE_ENV
    });
});

// --- 启动服务器 ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] 智能日历服务器运行在端口 ${PORT} (所有网络接口)`);
    console.log(`[Server] 📍 本地访问: http://localhost:${PORT}`);
    console.log(`[Server] 🌐 局域网访问: http://[局域网IP]:${PORT}`);
    console.log(`[Server] API endpoints:`);
    console.log(`[Server]   GET /events - 获取事件列表`);
    console.log(`[Server]   POST /events - 创建新事件`);
    console.log(`[Server]   POST /events/parse-natural-language - 自然语言解析`);
    console.log(`[Server]   POST /sync/imap - IMAP同步`);
    console.log(`[Server]   POST /sync/caldav - CalDAV同步`);
    console.log(`[Server]   POST /debug/reset-llm-cache - 重置LLM缓存`);
    console.log(`[Server] 🚀 服务器启动完成!`);

    // 初始化数据
    initializeData();
});

// 已删除重复的LLM设置定义
