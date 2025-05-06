require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const EWS = require('node-ews');
const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
// 导入 ews-javascript-api 相关类
const { 
    ExchangeService, 
    WebCredentials, 
    Uri, 
    FolderId, 
    WellKnownFolderName, 
    CalendarView, 
    PropertySet, 
    BasePropertySet, 
    ItemSchema, 
    DateTime, 
    ExchangeVersion 
} = require('ews-javascript-api');
// 导入 ActiveSync 客户端库
// const asclient = require('asclient'); // 不再需要 ActiveSync 测试库
// 导入存储函数
const {
    loadLLMSettings, saveLLMSettings,
    loadEvents, saveEvents,
    loadExchangeSettings, saveExchangeSettings,
    loadImapSettings, saveImapSettings,
    loadCalDAVSettings, saveCalDAVSettings,
    uuidv4
} = require('./storage');
// --- 导入新的 EAS 同步函数 ---
const { syncQQViaEAS } = require('./eas_sync'); 
const { syncOutlookViaEWS } = require('./outlook_ews_sync'); // <-- 导入新的 Outlook EWS 同步函数
// ---------------------------

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
const { parse: parseByRegex } = require('./regex_parser'); // 假设正则解析器在单独文件中
const cron = require('node-cron'); // <-- 引入 node-cron
const { createDAVClient, DAVClient } = require('tsdav');
const ical = require('node-ical');
const { createEvent: createIcsEvent, createEvents } = require('ics'); // <-- 恢复使用 ics 库
const { spawn } = require('child_process'); // <-- 导入 spawn 用于执行 Python

const app = express();
const PORT = process.env.PORT || 8001;

// --- 应用状态 (内存中) ---
let llmSettings = {};
let eventsDb = [];
let exchangeSettings = {};
let imapSettings = {};
let caldavSettings = {};

async function initializeData() {
    llmSettings = await loadLLMSettings();
    eventsDb = await loadEvents();
    exchangeSettings = await loadExchangeSettings();
    imapSettings = await loadImapSettings();
    try {
        caldavSettings = await loadCalDAVSettings();
    } catch (error) {
        console.warn("CalDAV设置未找到，将使用默认空设置");
        caldavSettings = {};
    }
    console.log("初始LLM设置已加载:", llmSettings);
    console.log(`初始事件已加载: ${eventsDb.length}个`);
    console.log("初始Exchange设置已加载 (密码已隐藏):", { ...exchangeSettings, password: '***' });
    console.log("初始IMAP设置已加载 (密码已隐藏):", { ...imapSettings, password: '***' });
    console.log("初始CalDAV设置已加载 (密码已隐藏):", { ...caldavSettings, password: '***' });
}

// --- 中间件 ---
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:8000'],
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

// --- LLM配置路由 ---
app.post('/config/llm', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || !newSettings.provider) {
        return res.status(400).json({ error: '无效的LLM设置格式。' });
    }
    
    llmSettings = { ...newSettings };
    try {
        await saveLLMSettings(llmSettings);
        console.log("LLM设置已更新并保存:", llmSettings);        
        res.status(200).json({ message: 'LLM设置已保存。' });
    } catch (error) {
        console.error("保存LLM设置失败:", error);
        res.status(500).json({ error: "保存LLM设置失败。" });
    }
});

app.get('/config/llm', (req, res) => {
    res.status(200).json(llmSettings);
});

// --- Exchange配置路由 ---
app.post('/config/exchange', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || typeof newSettings.email !== 'string' || typeof newSettings.password !== 'string') {
        return res.status(400).json({ error: '无效的Exchange设置格式。必需: email, password。' });
    }
    
    // 当前支持的可选参数: ewsUrl, exchangeVersion
    const validatedSettings = {
        email: newSettings.email,
        password: newSettings.password,
        // 可选的 EWS URL (如果不想用 Autodiscover)
        ewsUrl: newSettings.ewsUrl || null,
        // 可选的 Exchange 版本 (默认 Exchange2013)
        exchangeVersion: newSettings.exchangeVersion || 'Exchange2013'
    };
    
    exchangeSettings = { ...validatedSettings };
    try {
        await saveExchangeSettings(exchangeSettings);
        console.log("Exchange设置已更新并保存 (密码已隐藏):", { 
            ...exchangeSettings, 
            password: '***',
            ewsUrl: exchangeSettings.ewsUrl || '(使用Autodiscover)',
            exchangeVersion: exchangeSettings.exchangeVersion || 'Exchange2013'
        });
        res.status(200).json({ 
            message: `已保存${exchangeSettings.email}的Exchange设置。`,
            usingDirectEws: !!exchangeSettings.ewsUrl
        });
    } catch (error) {
        console.error("保存Exchange设置失败:", error);
        res.status(500).json({ error: "保存Exchange设置失败。" });
    }
});

app.get('/config/exchange', (req, res) => {
    // 永远不返回密码到前端
    const { password, ...settingsToSend } = exchangeSettings;
    res.status(200).json(settingsToSend);
});

// --- IMAP配置路由 ---
app.post('/config/imap', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || 
        typeof newSettings.email !== 'string' || 
        typeof newSettings.password !== 'string' ||
        typeof newSettings.imapHost !== 'string') {
        return res.status(400).json({ 
            error: '无效的IMAP设置格式。必需: email, password(授权码), imapHost' 
        });
    }
    
    imapSettings = { ...newSettings };
    
    try {
        await saveImapSettings(imapSettings);
        console.log("IMAP设置已更新并保存 (密码已隐藏):", { ...imapSettings, password: '***' });
        res.status(200).json({ message: `已保存${imapSettings.email}的IMAP设置。` });
    } catch (error) {
        console.error("保存IMAP设置失败:", error);
        res.status(500).json({ error: "保存IMAP设置失败。" });
    }
});

app.get('/config/imap', (req, res) => {
    // 永远不返回密码到前端
    const { password, ...settingsToSend } = imapSettings;
    res.status(200).json(settingsToSend);
});

// --- CalDAV配置路由 ---
app.post('/config/caldav', async (req, res) => {
    const newSettings = req.body;
    if (!newSettings || 
        typeof newSettings.username !== 'string' || 
        typeof newSettings.password !== 'string' ||
        typeof newSettings.serverUrl !== 'string') {
        return res.status(400).json({ 
            error: '无效的CalDAV设置格式。必需: username, password, serverUrl' 
        });
    }
    
    caldavSettings = { ...newSettings };
    
    try {
        await saveCalDAVSettings(caldavSettings);
        console.log("CalDAV设置已更新并保存 (密码已隐藏):", { ...caldavSettings, password: '***' });
        res.status(200).json({ message: `已保存${caldavSettings.username}的CalDAV设置。` });
    } catch (error) {
        console.error("保存CalDAV设置失败:", error);
        res.status(500).json({ error: "保存CalDAV设置失败。" });
    }
});

app.get('/config/caldav', (req, res) => {
    // 永远不返回密码到前端
    const { password, ...settingsToSend } = caldavSettings;
    res.status(200).json(settingsToSend);
});

// --- 日期时间辅助函数 (移到 utils.js 或确保在这里可用) ---
// function getStartEndDateForSync() { ... } 
const { getStartEndDateForSync } = require('./utils'); // <-- 确保导入或定义了此函数

// --- Exchange (QQ EWS - Python) 同步路由 --- 
app.post('/sync/exchange', async (req, res) => {
    // ... (此路由现在只处理 QQ EWS Python 调用) ...
    // TODO: 考虑将此路由重命名为 /sync/qq-ews-python 或删除其 else 块
    console.log("Exchange 同步路由被访问 (QQ EWS Python Handler)! GOTO /sync/qq-ews-python?");
    const currentSettings = exchangeSettings; // 使用已加载的配置

    if (!currentSettings || !currentSettings.email || !currentSettings.password) {
        return res.status(409).json({ error: 'Exchange 设置未配置。' });
    }
    console.log(`已请求同步 Exchange 账户: ${currentSettings.email}.`);
    const isQQEmail = currentSettings.email.toLowerCase().endsWith('@qq.com');

    if (isQQEmail) {
        // ... (保持 Python 调用逻辑) ...
        console.log("检测到 QQ 邮箱，将使用 Python 脚本进行同步。");
        const { startDate, endDate } = getStartEndDateForSync();
        const pythonScriptPath = path.join(__dirname, 'python_scripts', 'qq_ews_sync.py');
        const pythonProcess = spawn('python', [pythonScriptPath]);
        const inputData = { email: currentSettings.email, password: currentSettings.password, startDate: startDate.toISOString(), endDate: endDate.toISOString() };
        let scriptOutput = ''; let scriptError = '';
        pythonProcess.stdin.write(JSON.stringify(inputData)); pythonProcess.stdin.end();
        pythonProcess.stdout.on('data', (data) => { scriptOutput += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { scriptError += data.toString(); console.error(`Python 脚本 stderr: ${data}`); });
        pythonProcess.on('close', (code) => { /* ... Python 结果处理 ... */ });
        pythonProcess.on('error', (err) => { /* ... Python 错误处理 ... */ });
    } else {
        // --- 这个 else 块现在是多余的，逻辑已移到 outlook_ews_sync.js --- 
        console.warn("非 QQ 邮箱请求到达 /sync/exchange 路由。此路由现在主要用于 QQ EWS Python。请考虑使用 /sync/outlook-ews。");
        return res.status(400).json({ error: '此路由配置为处理 QQ EWS Python 同步。对于 Outlook/Exchange，请使用 /sync/outlook-ews。' });
        // --- 结束多余的 else 块 --- 
    }
});

// --- IMAP同步路由 --- 
// ... (保持不变) ...

// --- CalDAV同步路由 (使用 tsdav 重构) ---
// ... (保持不变) ...

// --- QQ EWS Python 同步路由 --- 
// ... (此路由可能与 /sync/exchange 重复，建议整合或删除一个) ...

// --- QQ EAS (ActiveSync) 同步路由 ---
// ... (保持不变) ...

// --- 新增：Outlook/Standard EWS (Node.js) 同步路由 ---
app.post('/sync/outlook-ews', async (req, res) => {
    console.log("[/sync/outlook-ews Route] Triggered Standard EWS sync.");
    const currentSettings = exchangeSettings; // 仍然使用 exchangeSettings 来获取凭据

    // 1. 检查是否配置了 Exchange 设置
    if (!currentSettings || !currentSettings.email || !currentSettings.password) {
        return res.status(409).json({ error: 'Exchange settings not configured.' });
    }
    // 可选：检查是否 *不是* QQ 邮箱，以防误用
    if (currentSettings.email.toLowerCase().includes('@qq.com')) {
        console.warn("[/sync/outlook-ews Route] Received QQ email, but this route is for standard Exchange/Outlook.");
        // 可以选择拒绝，或继续尝试（但不推荐）
        // return res.status(400).json({ error: 'This route is for standard Exchange/Outlook, not QQ Mail.' });
    }

    console.log(`[Outlook EWS Sync] Requesting sync for ${currentSettings.email} via Node.js EWS.`);

    try {
        // 2. 调用 Outlook EWS 同步函数 (传入 email, password, 和其他设置)
        const ewsResult = await syncOutlookViaEWS(
            currentSettings.email, 
            currentSettings.password, 
            currentSettings // Pass the whole settings object for ewsUrl, exchangeVersion etc.
        );

        // 3. 处理结果
        if (ewsResult.success) {
            console.log(`[Outlook EWS Sync] EWS sync successful. Found: ${ewsResult.itemCount}, Processed: ${ewsResult.events.length}`);
             // TODO: 在这里添加将 ewsResult.events 合并/更新到 eventsDb 的逻辑
             // 例如：
             // if (ewsResult.events && Array.isArray(ewsResult.events)) {
             //     const sourceId = `outlook_ews_js_sync_${currentSettings.email}`;
             //     eventsDb = eventsDb.filter(event => event.source !== sourceId);
             //     ewsResult.events.forEach(event => { eventsDb.push({ ...event, source: sourceId }); });
             //     await saveEvents(eventsDb);
             //     console.log(`[Outlook EWS Sync] Updated local events database. Total: ${eventsDb.length}`);
             // }

            res.status(200).json({
                message: ewsResult.message,
                data: {
                    itemCount: ewsResult.itemCount,
                    processedCount: ewsResult.events.length,
                    events: ewsResult.events // 返回处理过的事件
                }
            });
        } else {
            console.error(`[Outlook EWS Sync] EWS sync failed: ${ewsResult.message}`);
            res.status(500).json({
                error: `Outlook EWS sync failed: ${ewsResult.message}`,
                details: ewsResult.error // 返回详细的错误信息
            });
        }

    } catch (error) {
        // 捕获 syncOutlookViaEWS 外部或未预料的错误
        console.error('[Outlook EWS Sync Route] Unexpected error:', error);
        res.status(500).json({ error: `Error during Outlook EWS sync route execution: ${error.message}` });
    }
});


// --- 辅助函数：使用 LLM 解析文本 ---
/**
 * 使用配置的 LLM 解析自然语言文本以提取事件信息。
 * @param {string} text 要解析的自然语言文本。
 * @returns {Promise<ParsedEventData | null>} 解析后的事件数据对象或 null。
 */
async function parseTextWithLLM(text) {
    console.log(`[LLM Parse Util] Received text: "${text.substring(0, 100)}..."`);

    // 1. 检查 LLM 配置
    const currentLlmSettings = llmSettings; // 使用全局加载的设置
    if (!currentLlmSettings || !currentLlmSettings.provider || currentLlmSettings.provider === 'none') {
        console.error("[LLM Parse Util] LLM not configured.");
        // 对于这个工具函数，我们不直接 fallback 到 regex，调用者需要处理 null 返回值
        return null; 
    }
    if ((currentLlmSettings.provider === 'openai' || currentLlmSettings.provider === 'deepseek') && !currentLlmSettings.api_key) {
        console.error(`[LLM Parse Util] API key missing for ${currentLlmSettings.provider}.`);
        // 抛出错误或者返回 null，让调用者知道配置问题
        // throw new Error(`LLM 配置错误: 缺少 ${currentLlmSettings.provider} 的 API Key。`); 
        return null; // 返回 null 表示因配置问题无法解析
    }

    // --- 开始 LLM 解析 --- 
    try {
        // 2. 初始化 LLM Client
        let openaiClient;
        let modelToUse = currentLlmSettings.model_name || 'gpt-3.5-turbo'; 
        try {
             openaiClient = new OpenAI({
                 apiKey: currentLlmSettings.api_key,
                 baseURL: currentLlmSettings.base_url || (currentLlmSettings.provider === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined),
             });
             if (currentLlmSettings.provider === 'deepseek' && !currentLlmSettings.model_name) {
                  modelToUse = 'deepseek-chat';
             }
             console.log(`[LLM Parse Util] Initialized client: ${currentLlmSettings.provider}, model: ${modelToUse}, baseURL: ${openaiClient.baseURL}`);
        } catch (initError) {
            console.error("[LLM Parse Util] Failed to initialize LLM client:", initError);
            // 返回 null 表示初始化失败
            return null; 
        }

        // 3. 构建 Prompt (保持与之前路由中一致的逻辑)
        const offsetMinutes = new Date().getTimezoneOffset();
        const offsetHours = -offsetMinutes / 60;
        const sign = offsetHours >= 0 ? '+' : '-';
        const absOffsetHours = Math.abs(offsetHours);
        const offsetString = `${sign}${String(Math.floor(absOffsetHours)).padStart(2, '0')}:${String((absOffsetHours % 1) * 60).padStart(2, '0')}`;
        
        const prompt = `
请解析以下单句或多句自然语言描述，提取出日历事件的关键信息。
你需要识别出事件的标题 (title)、开始日期和时间 (start_datetime)，以及可选的结束日期和时间 (end_datetime)。
如果文本中包含地点 (location) 或更详细的描述，也请尽量提取。

**重要上下文:**
- **当前日期:** ${new Date().toLocaleDateString('zh-CN')}
- **用户时区:** UTC${offsetString} (请将用户输入的相对时间，如"明天下午三点"，理解为此本地时区的时间)

**输出要求:**
请将识别出的本地时间点 **准确转换为 UTC 时间**，然后将结果格式化为 JSON 对象，包含以下键：
- "title": string (事件标题，尽量简洁明了)
- "start_datetime": string (转换后的 **UTC** 时间，ISO 8601 格式，例如 "2025-04-27T07:00:00.000Z" 对应 UTC+8 的下午三点)
- "end_datetime": string | null (转换后的 **UTC** 时间，ISO 8601 格式，如果未明确指定结束时间或时长，应为 null 或根据开始时间推断一个默认时长如1小时，同样转换为UTC)
- "description": string | null (从原文提取的或推断的描述，如果无则为 null)
- "location": string | null (从原文提取的地点，如果无则为 null)

**特殊情况:**
如果无法从文本中解析出有效的日期和时间，请确保 "start_datetime" 的值为 null。
请 **仅** 返回 JSON 对象，不要包含任何额外的解释或注释。

自然语言文本：
"${text}"

JSON 对象结果：
`;

        // 4. 调用 LLM API
        let llmResponseContent = '';
        try {
            console.log("[LLM Parse Util] Sending request to LLM...");
            const completion = await openaiClient.chat.completions.create({
                model: modelToUse,
                messages: [
                    { role: "system", content: "你是一个精确的自然语言理解助手，负责将用户输入的描述转换为结构化的日历事件 JSON 对象。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" } 
            });
            llmResponseContent = completion?.choices?.[0]?.message?.content?.trim() ?? '';
            console.log("[LLM Parse Util] Received LLM response content (raw):", llmResponseContent);
            if (!llmResponseContent) {
                throw new Error('LLM 返回了空的响应内容。');
            }
        } catch (llmError) {
            console.error("[LLM Parse Util] LLM API call failed:", llmError);
            // 不在此处 fallback，直接返回 null
            return null; 
        }

        // 5. 解析并验证 LLM 响应
        try {
            const parsedResult = JSON.parse(llmResponseContent);
            // 基本验证
            if (!parsedResult || typeof parsedResult !== 'object') {
                 throw new Error('LLM 返回的不是有效的 JSON 对象。');
            }
            // 验证 start_datetime (可以是 null 或有效的 ISO string)
             if (parsedResult.start_datetime !== null) {
                 if (typeof parsedResult.start_datetime !== 'string' || isNaN(new Date(parsedResult.start_datetime).getTime())) {
                     throw new Error(`LLM 返回的 start_datetime 格式无效或不是字符串: ${parsedResult.start_datetime}`);
                 }
             }
            // 修正其他字段类型（如果需要）
            if (parsedResult.end_datetime && (typeof parsedResult.end_datetime !== 'string' || isNaN(new Date(parsedResult.end_datetime).getTime()))) {
                 parsedResult.end_datetime = null;
            }
            if (typeof parsedResult.title !== 'string') {
                 parsedResult.title = String(parsedResult.title || ''); // 确保是字符串
            }
            if (typeof parsedResult.description !== 'string' && parsedResult.description !== null) {
                 parsedResult.description = String(parsedResult.description || '');
            }
             if (typeof parsedResult.location !== 'string' && parsedResult.location !== null) {
                 parsedResult.location = String(parsedResult.location || '');
            }
            
            console.log("[LLM Parse Util] Successfully parsed LLM response:", parsedResult);
            // 只返回必要的字段
            return {
                 title: parsedResult.title || null, // 确保有 title
                 start_datetime: parsedResult.start_datetime, // 可能为 null
                 end_datetime: parsedResult.end_datetime || null, // 可能为 null
                 description: parsedResult.description || null,
                 location: parsedResult.location || null
             };

        } catch (parseError) {
            console.error("[LLM Parse Util] Failed to parse LLM JSON response:", parseError);
            return null; // 解析失败返回 null
        }

    } catch (error) {
        console.error('[LLM Parse Util] Unexpected error:', error);
        // 意外错误也返回 null
        return null;
    }
}

// --- 自然语言解析路由 --- (修改为调用 parseTextWithLLM)
app.post('/events/parse-natural-language', async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: '缺少必要的文本参数。' });
    }
    
    console.log(`[POST /events/parse] Route received text: "${text}"`);
    
    try {
        // 调用重构后的 LLM 解析函数
        const parsedResult = await parseTextWithLLM(text);

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

// --- 事件路由 ---
app.post('/events', async (req, res) => {
    const newEvent = req.body;
    if (!newEvent || !newEvent.title) {
        return res.status(400).json({ error: '无效的事件格式。' });
    }
    
    // 确保事件有唯一ID
    const eventToSave = {
        ...newEvent,
        id: newEvent.id || uuidv4(),
        // --- 添加 CalDAV 推送相关字段 ---
        needs_caldav_push: newEvent.source !== 'caldav_sync_tsdav', // 如果不是来自 CalDAV 同步，则标记需要推送
        caldav_uid: newEvent.caldav_uid || null, // 保留已有的，否则为 null
        caldav_etag: newEvent.caldav_etag || null // 保留已有的，否则为 null
        // -----------------------------------
    };
    
    // 添加到内存中的事件列表
    eventsDb.push(eventToSave);
    
    try {
        // 保存到文件
        await saveEvents(eventsDb);
        console.log(`事件已创建: "${eventToSave.title}" (${eventToSave.id})`);
        res.status(201).json(eventToSave);
    } catch (error) {
        // 保存失败时从内存中移除
        eventsDb = eventsDb.filter(e => e.id !== eventToSave.id);
        console.error("保存事件失败:", error);
        res.status(500).json({ error: "保存事件失败。" });
    }
});

app.get('/events', (req, res) => {
    res.status(200).json(eventsDb);
});

// 新增：更新事件路由 (用于支持拖拽修改日期等)
app.put('/events/:id', async (req, res) => {
    const eventId = req.params.id;
    const updatedFields = req.body;
    const fieldKeys = Object.keys(updatedFields);

    console.log(`[PUT /events/:id] Received update request for ID: ${eventId} with fields: ${fieldKeys.join(', ')}`);

    const eventIndex = eventsDb.findIndex(e => e.id === eventId);

    if (eventIndex === -1) {
        console.error(`[PUT /events/:id] Error: Event not found for ID: ${eventId}`);
        return res.status(404).json({ error: `未找到 ID 为 ${eventId} 的事件。` });
    }
    console.log(`[PUT /events/:id] Event found at index: ${eventIndex}`);
    const originalEvent = { ...eventsDb[eventIndex] }; // <-- 复制原始事件，防止意外修改

    let updatedEvent;

    // 检查是否只更新 completed 状态
    if (fieldKeys.length === 1 && fieldKeys[0] === 'completed' && typeof updatedFields.completed === 'boolean') {
        console.log(`[PUT /events/:id] Updating only 'completed' status for event ${eventId} to ${updatedFields.completed}`);
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
        console.log(`[PUT /events/:id] Performing full update for event ${eventId}`);
        const { start_datetime, end_datetime, ...otherUpdatedFields } = updatedFields;

        // 对于完整更新，start_datetime 是必需的 (保持原有逻辑)
        if (!start_datetime) {
            console.error('[PUT /events/:id] Error: Missing start_datetime for full update');
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
                 console.warn(`[PUT /events/:id] Using default 1-hour duration for event ${eventId} during full update`);
             }
        } catch(dateError) {
            console.error(`[PUT /events/:id] Error calculating end date during full update for event ${eventId}:`, dateError);
            calculatedEndDate = new Date(new Date(start_datetime).getTime() + 3600 * 1000).toISOString();
            console.warn(`[PUT /events/:id] Using default 1-hour duration due to calculation error for event ${eventId}`);
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

    console.log(`[PUT /events/:id] Prepared updated event object:`, updatedEvent);

    // 更新内存数据库
    console.log(`[PUT /events/:id] Updating event in memory at index: ${eventIndex}`);
    eventsDb[eventIndex] = updatedEvent;

    try {
        // 保存到文件
        console.log(`[PUT /events/:id] Attempting to save updated events database...`);
        await saveEvents(eventsDb);
        console.log(`[PUT /events/:id] Successfully saved events database.`);
        console.log(`事件已更新: "${updatedEvent.title}" (ID: ${eventId})`);
        // 确保返回的事件包含正确的 completed 状态 (从 updatedEvent 获取)
        res.status(200).json(updatedEvent);
    } catch (error) {
        // 保存失败时回滚内存中的更改
        // 使用原始事件副本进行回滚
        eventsDb[eventIndex] = originalEvent; 
        console.error(`[PUT /events/:id] Error saving updated events database:`, error);
        console.error('[PUT /events/:id] Detailed Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        res.status(500).json({ error: "保存更新后的事件失败。" });
    }
});

// 新增：删除事件路由
app.delete('/events/:id', async (req, res) => {
    const eventId = req.params.id;
    console.log(`[DELETE /events/:id] Received request to delete event with ID: ${eventId}`);

    // --- 添加日志记录 ---
    console.log(`[DELETE /events/:id] Current event IDs in DB at time of request:`, eventsDb.map(e => e.id));
    // -------------------

    const eventIndex = eventsDb.findIndex(e => e.id === eventId);

    if (eventIndex === -1) {
        console.error(`[DELETE /events/:id] Error: Event not found for ID: ${eventId} within current DB state.`);
        return res.status(404).json({ error: `未找到 ID 为 ${eventId} 的事件。` });
    }

    // 从内存数据库中移除事件
    const deletedEvent = eventsDb.splice(eventIndex, 1)[0]; // splice 返回被删除元素的数组
    console.log(`[DELETE /events/:id] Event removed from memory: "${deletedEvent.title}"`);

    try {
        // 保存更新后的事件列表到文件
        await saveEvents(eventsDb);
        console.log(`[DELETE /events/:id] Successfully saved events database after deletion.`);
        console.log(`事件已删除: "${deletedEvent.title}" (ID: ${eventId})`);
        // 返回 200 OK 并附带消息，或 204 No Content
        res.status(200).json({ message: `事件 '${deletedEvent.title}' (ID: ${eventId}) 已成功删除。` }); 
        // res.status(204).send(); // 备选：不返回任何内容体
    } catch (error) {
        // 如果保存失败，需要将事件重新加回内存数据库以保持一致性
        eventsDb.splice(eventIndex, 0, deletedEvent); // 在原位置插回
        console.error('[DELETE /events/:id] Error saving events database after deletion:', error);
        res.status(500).json({ error: '删除事件后保存失败。请重试。' });
    }
});

// --- 测试路由 ---
app.post('/test', (req, res) => {
    console.log("测试路由被访问!");
    res.status(200).json({ message: '测试路由正常工作!' });
});

// --- 启动服务器与定时任务 --- 
initializeData().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`=== 智能日历后端 ===`);
        console.log(`服务器运行在: http://localhost:${PORT}`);
        console.log('\n已注册路由:');
        console.log(' - GET / (API 根路径)');
        console.log(' - POST /events/parse-natural-language');
        console.log(' - POST /config/llm');
        console.log(' - GET /config/llm');
        console.log(' - POST /config/exchange');
        console.log(' - GET /config/exchange');
        console.log(' - POST /config/imap');
        console.log(' - GET /config/imap');
        console.log(' - POST /config/caldav');
        console.log(' - GET /config/caldav');
        console.log(' - POST /sync/exchange (Legacy - Now QQ EWS Python only)'); // 更新说明
        console.log(' - POST /sync/imap');
        console.log(' - POST /sync/caldav');
        console.log(' - POST /sync/qq-ews-python (Duplicate of /sync/exchange?)'); 
        console.log(' - POST /sync/qq-eas (QQ ActiveSync via Node.js)'); 
        console.log(' - POST /sync/outlook-ews (Standard EWS via Node.js)'); // <-- 添加新路由说明
        console.log(' - POST /events');
        console.log(' - GET /events');
        console.log(' - PUT /events/:id');
        console.log(' - DELETE /events/:id');
        console.log(' - POST /events/import'); 
        console.log(' - POST /test');
        
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
        cron.schedule('5 * * * *', () => {
             console.log('[Cron] Triggering scheduled CalDAV sync...');
             // 检查 CalDAV 配置是否存在且完整
             if (caldavSettings && caldavSettings.username && caldavSettings.password && caldavSettings.serverUrl) {
                 performCalDavSync().catch(err => {
                     console.error('[Cron] Unhandled error during scheduled CalDAV sync:', err);
                 });
             } else {
                 console.log('[Cron] Skipping scheduled CalDAV sync: Settings not configured.');
             }
        });
        
        console.log('\n定时同步任务已设置:');
        console.log(' - IMAP Sync: 每 30 分钟');
        console.log(' - CalDAV Sync: 每小时第 5 分钟');
    });
}).catch(error => {
    console.error("无法初始化服务器数据:", error);
    process.exit(1);
});

// --- 辅助函数 (getStartEndDateForSync, parseTextWithLLM, parseDateString) ---
// ... (这些辅助函数保持不变)

// --- 重构后的同步函数 --- 
let isImapSyncRunning = false;
async function performImapSync() {
    if (isImapSyncRunning) {
        console.log('[Scheduler] IMAP sync is already running. Skipping this run.');
        return { message: "Sync already in progress", eventCount: 0 };
    }
    isImapSyncRunning = true;
    console.log('[Scheduler] Starting scheduled IMAP sync...');
    
    // <<<--- 开始填充 IMAP 逻辑 --->>>
    const currentSettings = imapSettings;
    if (!currentSettings || !currentSettings.email || !currentSettings.password || !currentSettings.imapHost) {
        console.error('[performImapSync] IMAP settings not fully configured.');
        isImapSyncRunning = false; // 释放锁
        return { message: 'IMAP settings not fully configured.', eventCount: -1, error: true };
    }
    
    console.log(`[performImapSync] Attempting sync for: ${currentSettings.email}`);
    
    const imapConfig = { 
        user: currentSettings.email,
        password: currentSettings.password,
        host: currentSettings.imapHost,
        port: currentSettings.imapPort || 993,
        tls: currentSettings.useTLS !== false,
        tlsOptions: { rejectUnauthorized: false }
    };
    const imap = new Imap(imapConfig);
    let syncedEvents = [];
    
    // 定义 imap 辅助函数 (connect, open, search, fetch, etc.)
    const imapConnect = () => { 
        return new Promise((resolve, reject) => {
            imap.once('error', reject);
            imap.once('ready', resolve);
            imap.connect();
        });
    };
    const openMailbox = (folderName) => { /* ... (保持原样) ... */ 
         return new Promise((resolve, reject) => {
            console.log(`[performImapSync] Opening mailbox: ${folderName}`);
             imap.openBox(folderName, false, (err, box) => {
                 if (err) {
                     console.error(`[performImapSync] Failed to open ${folderName}: ${err.message}`);
                     resolve(null); 
                 } else {
                      console.log(`[performImapSync] Opened ${folderName}: ${box.messages.total} total, ${box.messages.new} new`);
                     resolve(box);
                 }
             });
         });
    };
    const searchUnseenEmails = (folderName) => { /* ... (保持原样) ... */ 
         return new Promise((resolve, reject) => {
             console.log(`[performImapSync] Searching UNSEEN in ${folderName}...`);
             try {
                 imap.search(['UNSEEN'], (err, results) => {
                     if (err) {
                         console.error(`[performImapSync] Failed to search UNSEEN in ${folderName}: ${err.message}`);
                         resolve([]);
                     } else if (!results || results.length === 0) {
                          console.log(`[performImapSync] No UNSEEN messages found in ${folderName}.`);
                         resolve([]);
                     } else {
                         console.log(`[performImapSync] Found ${results.length} UNSEEN messages in ${folderName}.`);
                         resolve(results);
                     }
                 });
             } catch (error) {
                 console.error(`[performImapSync] Error during UNSEEN search in ${folderName}:`, error);
                 resolve([]);
             }
         });
    };
    const fetchEmails = (results) => { /* ... (保持原样, 包括内部 findAttachmentParts) ... */ 
         return new Promise((resolve, reject) => {
             // ... (fetch logic with markSeen: true) ...
             if (results.length === 0) return resolve([]);
             const emails = [];
             try {
                 const fetch = imap.fetch(results, { bodies: [''], struct: true, markSeen: true });
                 let messagesProcessed = 0;
                 fetch.on('message', (msg, seqno) => {
                     // ... (message processing logic, parsing attributes, finding parts, getting content) ...
                      const email = { attachments: [], uid: -1, rawContent: '', subject: '', text: '', html: '', from: null, to: null, date: null };
                      let rawBuffer = Buffer.alloc(0);
                      let partPromises = []; // Store promises for fetching parts

                      msg.on('body', (stream, info) => {
                         stream.on('data', (chunk) => { rawBuffer = Buffer.concat([rawBuffer, chunk]); });
                         stream.once('end', () => { email.rawContent = rawBuffer.toString('utf8'); });
                      });

                      msg.once('attributes', (attrs) => {
                         email.attributes = attrs; email.uid = attrs.uid; email.flags = attrs.flags; email.date = attrs.date;
                         if (attrs.struct) {
                             const attachmentParts = findAttachmentParts(attrs.struct);
                             if (attachmentParts && Array.isArray(attachmentParts)) {
                                 const calendarParts = attachmentParts.filter(part => (part.params?.name?.toLowerCase().endsWith('.ics')) || (part.type === 'text' && part.subtype === 'calendar'));
                                 if (calendarParts.length > 0) {
                                     calendarParts.forEach(part => {
                                          const partFetchPromise = new Promise((resolvePart, rejectPart) => {
                                             const partFetch = imap.fetch(attrs.uid, { bodies: [part.partID], struct: false });
                                             let partBuffer = '';
                                             partFetch.on('message', (partMsg) => {
                                                 partMsg.on('body', (stream, info) => {
                                                     stream.on('data', (chunk) => { partBuffer += chunk.toString('utf8'); });
                                                     stream.once('end', () => {
                                                         email.attachments.push({ filename: part.params?.name || 'calendar.ics', contentType: `${part.type}/${part.subtype}`, content: partBuffer, isCalendar: true });
                                                          console.log(`[fetchEmails] Fetched calendar part ${part.partID} for UID ${email.uid}`);
                                                         resolvePart();
                                                     });
                                                 });
                                                 partMsg.once('error', (err) => { console.error(`[fetchEmails] Error fetching part ${part.partID} for UID ${email.uid}:`, err); rejectPart(err); });
                                             });
                                              partFetch.once('error', (err) => { console.error(`[fetchEmails] Error initiating fetch for part ${part.partID} UID ${email.uid}:`, err); rejectPart(err); });
                                              partFetch.once('end', () => { /* Part fetch ends */ });
                                         });
                                          partPromises.push(partFetchPromise);
                                     });
                                 }
                             } else {
                                 console.warn(`[fetchEmails] 'findAttachmentParts' did not return a valid array for UID ${email.uid}. Received:`, attachmentParts);
                             }
                         }
                      });

                     msg.once('end', async () => {
                         try {
                             await Promise.all(partPromises); // Wait for all parts to be fetched
                             const parsed = await simpleParser(email.rawContent);
                             email.subject = parsed.subject; email.from = parsed.from; email.to = parsed.to; email.html = parsed.html; email.text = parsed.text;
                             emails.push(email);
                             console.log(`[fetchEmails] Parsed base email UID ${email.uid}: ${email.subject}`);
                         } catch (parseError) {
                              console.error(`[fetchEmails] Failed to parse or process parts for email UID ${email.uid}:`, parseError);
                             emails.push(email); // Still add basic info if parsing fails
                         } finally {
                              messagesProcessed++;
                              if (messagesProcessed === results.length) {
                                 // This might resolve slightly before the main fetch 'end' but is safer
                                 console.log('[fetchEmails] All messages processed.');
                                 // Resolve slightly later to ensure the main 'end' event fires if needed
                                 // setTimeout(() => resolve(emails), 50); 
                                 // Let the main 'end' handler resolve
                             }
                         }
                     });
                 });

                 fetch.once('error', (err) => { console.error('[fetchEmails] Fetch error:', err); reject(err); });
                 fetch.once('end', () => {
                      console.log('[fetchEmails] Main fetch stream ended.');
                      // Final resolution happens when all messagesProcessed
                      if (messagesProcessed === results.length) { resolve(emails); }
                       else { /* Wait for msg.once('end') to resolve */ 
                           // Add a timeout safeguard in case msg 'end' never fires for some reason
                           setTimeout(() => {
                               if (emails.length === results.length) {
                                    console.warn('[fetchEmails] Resolving via timeout safeguard.');
                                    resolve(emails);
                               } else {
                                    console.error(`[fetchEmails] Timeout reached but only ${emails.length}/${results.length} emails collected.`);
                                     reject(new Error('Timeout waiting for all messages to process'));
                               }
                           }, 5000); // 5 second timeout
                       }
                 });
             } catch (error) {
                 console.error('[fetchEmails] Outer catch error:', error);
                 reject(error);
             }
         });
    };
    const extractCalendarEvents = async (emails) => {
        const eventsFound = [];
        const existingEventIds = new Set(eventsDb.map(e => e.id)); // 获取当前 ID 用于去重
        
        // --- 定义发件人黑名单 (可以考虑后续移到配置中) ---
        const SENDER_BLOCKLIST = [
            'notice@workflow-sender.mingdao.net'
            // 在这里添加其他不想处理的发件人
        ];
        // -----------------------------------------------

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
            
            // --- LLM 解析邮件正文逻辑 (添加发件人过滤) ---
            const senderAddress = email.from?.value?.[0]?.address?.toLowerCase();
            if (senderAddress && SENDER_BLOCKLIST.includes(senderAddress)) {
                console.log(`[extractCalendarEvents] Skipping LLM parsing for email UID ${email.uid} from blocked sender: ${senderAddress}`);
                continue; // 跳过这封邮件的 LLM 处理
            }

            const textToParse = email.text || (email.html ? require('html-to-text').htmlToText(email.html) : '');
            if (textToParse && textToParse.trim().length > 5) {
                console.log(`[extractCalendarEvents] Attempting LLM parsing for email UID ${email.uid} body (Sender: ${senderAddress || 'Unknown'})...`);
                try {
                    const llmResult = await parseTextWithLLM(textToParse);
                    if (llmResult && llmResult.start_datetime) {
                        // ... (LLM 结果处理和增强重复检查逻辑保持不变) ...
                        const llmEventTitle = llmResult.title || email.subject || '来自邮件的事件';
                        const llmEventStart = llmResult.start_datetime;
                        
                        const llmEventUidBase = `llm_${email.uid}_${new Date(llmEventStart).getTime()}`;
                        let llmUniqueId = llmEventUidBase;
                        let counter = 0;
                        while(eventsDb.some(e => e.id === llmUniqueId)) { 
                             counter++;
                             llmUniqueId = `${llmEventUidBase}_${counter}`;
                        }

                        const isDuplicateLLM = eventsDb.some(existingEvent => 
                            existingEvent.id === llmUniqueId || 
                            (existingEvent.title === llmEventTitle && existingEvent.start_datetime === llmEventStart)
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
                                created_at: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                                caldav_url: attachment.url // <-- 添加这一行
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
                const emails = await fetchEmails(searchResults);
                 console.log(`[performImapSync] Extracting events from ${emails.length} fetched messages...`);
                const newEvents = await extractCalendarEvents(emails);
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
                await saveEvents(eventsDb);
                console.log(`[performImapSync] Saved ${uniqueNewEvents.length} new events.`);
                // Close connection before returning
                try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
                isImapSyncRunning = false;
                return { message: `IMAP Sync successful. Added ${uniqueNewEvents.length} new events.`, eventCount: uniqueNewEvents.length };
            } else {
                 console.log('[performImapSync] All extracted events already exist.');
                 try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
                 isImapSyncRunning = false;
                 return { message: 'IMAP Sync complete. No new events found.', eventCount: 0 };
            }
        } else {
             console.log('[performImapSync] No events extracted from emails.');
             try { imap.end(); console.log('[performImapSync] IMAP connection closed.'); } catch (e) { console.error('[performImapSync] Error closing IMAP:', e); }
             isImapSyncRunning = false;
             return { message: 'IMAP Sync complete. No events extracted.', eventCount: 0 };
        }

    } catch (error) {
        console.error('[performImapSync] Error during IMAP sync process:', error);
        // 确保关闭连接
        try { imap.end(); } catch (e) { /* ignore */ }
        isImapSyncRunning = false; // 释放锁
        // return { message: `IMAP Sync failed: ${error.message}`, eventCount: -1, error: true };
        throw error; // 重新抛出错误，让路由处理函数捕获并返回 500
    } // <<<--- 结束填充 IMAP 逻辑 --->>>
}

let isCalDavSyncRunning = false;
// --- 新函数：专门处理 QQ CalDAV 同步逻辑 ---
async function performQQCalDavSync() {
    const currentSettings = caldavSettings; 
    console.log(`[performQQCalDavSync] Starting QQ specific sync for: ${currentSettings.username}`);
    
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
            
            // --- 添加日志：记录从QQ服务器拉取的原始ICS数据 ---
            if (currentSettings.serverUrl && currentSettings.serverUrl.includes('dav.qq.com')) {
                console.log(`[QQ CalDAV Debug] Raw ICS data from QQ for URL ${obj.url} (ETag: ${obj.etag}):\n------ BEGIN QQ ICS ------\n${obj.data}\n------ END QQ ICS ------`);
            }
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

        // --- 定义计数器变量 ---
        let pushedToServerCount = 0;
        let updatedOnServerCount = 0;
        let updatedLocallyCount = 0;
        // ---------------------
        const eventsToPushOrUpdate = eventsDb.filter(e => e.needs_caldav_push === true);
        console.log(`[performQQCalDavSync] Found ${eventsToPushOrUpdate.length} locally created/modified events marked for pushing/updating.`);

        if (eventsToPushOrUpdate.length > 0) {
            // --- 不再需要 formatQQIcsDateArray，改为手动生成 ICS ---

            for (const eventToModify of eventsToPushOrUpdate) { 
                let manualIcsString = ''; // 用于存储手动生成的 ICS
                try {
                    console.log(`[performQQCalDavSync] Preparing to push/update event ID: ${eventToModify.id}, Title: ${eventToModify.title}`);

                    // --- 手动构建 ICS 数据 --- 
                    const uid = eventToModify.id;
                    const title = eventToModify.title || '未命名事件';
                    const description = eventToModify.description || '';
                    const startStr = eventToModify.start_datetime;
                    const endStr = eventToModify.end_datetime;

                    if (!startStr) {
                        console.error(`[performQQCalDavSync] Event ${uid} missing start time. Skipping push/update.`);
                        continue; // 跳过这个事件
                    }
                    const startDate = new Date(startStr);
                    // 推断结束时间，如果不存在则默认为开始时间 + 1 小时
                    const endDate = endStr ? new Date(endStr) : new Date(startDate.getTime() + 3600 * 1000);
                    
                    // 判断是否全天 (基于 startStr 格式 或 start/end 时间差)
                    // 简单判断：如果时间部分为 00:00:00 且 结束时间为 23:59:59.xxx 或 与开始时间差 >= 24h
                    let isAllDay = false;
                    if (startStr.length === 10 || (startStr.includes('T00:00:00') && endStr && (new Date(endStr).getTime() - startDate.getTime()) >= (24*60*60*1000 - 1000) )) {
                       isAllDay = true;
                    } 
                    // (更可靠的方式是在 event 对象中存储 is_all_day 标记)

                    // 格式化日期函数 (本地实现)
                    const formatDateForICS = (date, allDay = false) => {
                        const pad = (num) => String(num).padStart(2, '0');
                        const year = date.getUTCFullYear();
                        const month = pad(date.getUTCMonth() + 1);
                        const day = pad(date.getUTCDate());
                        if (allDay) {
                            return `${year}${month}${day}`;
                        }
                        const hours = pad(date.getUTCHours());
                        const minutes = pad(date.getUTCMinutes());
                        const seconds = pad(date.getUTCSeconds());
                        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
                    };

                    const icsDataArray = [
                        'BEGIN:VCALENDAR',
                        'VERSION:2.0',
                        'PRODID:-//SiYuan//Steve-Tools Calendar//CN', // <-- 使用参考代码的 PRODID
                        'CALSCALE:GREGORIAN',                   // <-- 添加 CALSCALE
                        'METHOD:PUBLISH',                       // <-- 添加 METHOD
                        'BEGIN:VEVENT',
                        `UID:${uid}`,
                        `DTSTAMP:${formatDateForICS(new Date(), false)}`, // <-- 添加 DTSTAMP
                    ];

                    // 添加开始和结束时间
                    if (isAllDay) {
                        // 对于全天事件，确保结束日期是开始日期的第二天（CalDAV 标准）
                        const endDateAllDay = new Date(startDate); // 复制开始日期
                        endDateAllDay.setUTCDate(startDate.getUTCDate() + 1); // 设置为第二天
                        icsDataArray.push(`DTSTART;VALUE=DATE:${formatDateForICS(startDate, true)}`);
                        icsDataArray.push(`DTEND;VALUE=DATE:${formatDateForICS(endDateAllDay, true)}`); // 结束日期是开始的后一天
                    } else {
                        icsDataArray.push(`DTSTART:${formatDateForICS(startDate, false)}`);
                        icsDataArray.push(`DTEND:${formatDateForICS(endDate, false)}`);
                    }

                    // 添加标题和描述 (仅当描述非空时添加)
                    icsDataArray.push(`SUMMARY:${title.replace(/\r\n|\n|\r/g, '\\n')}`); // 处理换行符
                    if (description.trim()) {
                        icsDataArray.push(`DESCRIPTION:${description.replace(/\r\n|\n|\r/g, '\\n')}`); // 处理换行符
                    }

                    // 添加其他必要的字段 (如果需要，例如 SEQUENCE:0)
                    // icsDataArray.push('SEQUENCE:0');

                    icsDataArray.push('END:VEVENT');
                    icsDataArray.push('END:VCALENDAR');

                    manualIcsString = icsDataArray.join('\r\n'); // 使用 CRLF 连接
                    // --- 结束手动构建 --- 

                    if (!manualIcsString) {
                         console.error(`[performQQCalDavSync] Failed to generate ICS string for event ${uid}.`);
                         continue;
                    }
                    
                    // --- 添加日志：打印最终生成的 ICS --- 
                    console.log(`[performQQCalDavSync] Manually generated iCalendar data for ${uid}:\n------ BEGIN QQ PUSH ICS ------\n${manualIcsString}\n------ END QQ PUSH ICS ------`);
                    // ------------------------------------

                    // --- 判断是创建还是更新 --- 
                    if (eventToModify.caldav_url && eventToModify.caldav_etag) {
                        // --- 更新逻辑 --- 
                        console.log(`[performQQCalDavSync] Updating object at URL: ${eventToModify.caldav_url}`);
                        // --- 使用参考代码的 update 签名，不传 etag --- 
                        const updateResult = await client.updateCalendarObject({
                            calendarObject: { 
                                url: eventToModify.caldav_url,
                                data: manualIcsString // 使用手动生成的字符串
                                // etag: eventToModify.caldav_etag // 暂时不传 ETag
                            }
                        });

                        // 检查更新结果 (需要确认 tsdav update 的返回格式，可能不返回 etag)
                        // QQ CalDAV 的 PUT 操作通常返回 204 No Content，可能没有 etag
                        // 我们需要一种方式来验证更新是否真的成功 (例如，检查状态码或后续拉取比较 etag)
                        // 暂时假设调用不抛错即成功，但标记 ETag 失效
                        console.log(`[performQQCalDavSync] Update call completed for ${eventToModify.caldav_url}. Result:`, updateResult); // 记录结果以供调试
                        updatedOnServerCount++;
                        const indexToUpdate = eventsDb.findIndex(e => e.id === eventToModify.id);
                        if (indexToUpdate !== -1) {
                            // 由于 QQ 可能不返回新 ETag，我们将 ETag 设为 null 或特殊值表示已更新但 ETag 未知
                            eventsDb[indexToUpdate].caldav_etag = null; // 或者 'UPDATED_UNKNOWN_ETAG'
                            eventsDb[indexToUpdate].needs_caldav_push = false;
                            eventsDb[indexToUpdate].updated_at = new Date().toISOString(); 
                            updatedLocallyCount++;
                            console.log(`[performQQCalDavSync] Updated local event ${eventToModify.id} status after server update attempt.`);
                        } else {
                            console.warn(`[performQQCalDavSync] Could not find local event ${eventToModify.id} to update status after server update attempt.`);
                        }
                        // -------------------

                    } else {
                        // --- 创建逻辑 --- 
                        const filename = `${eventToModify.id}.ics`;
                        console.log(`[performQQCalDavSync] Creating object ${filename} in calendar ${targetCalendar.url}...`);
                        
                        const createResult = await client.createCalendarObject({
                            calendar: targetCalendar,
                            filename: filename,
                            iCalString: manualIcsString, // <-- 使用 iCalString 参数和手动生成的字符串
                        });

                        // --- 修改：不再强制检查 etag，只要没抛错就视为成功 ---
                        // if (createResult && createResult.etag) { // 旧检查
                        // Assume success if the previous line didn't throw an error
                        const etag = createResult?.etag; // 尝试获取 etag
                        if (etag) {
                             console.log(`[performQQCalDavSync] Successfully created ${filename} on QQ server. ETag: ${etag}`);
                        } else {
                             console.log(`[performQQCalDavSync] Successfully created ${filename} on QQ server (No ETag returned, assuming success based on 201 Created).`);
                        }
                        pushedToServerCount++;
                        const indexToUpdate = eventsDb.findIndex(e => e.id === eventToModify.id);
                        if (indexToUpdate !== -1) {
                            // 尝试构建 URL
                            let createdUrl = 'unknown';
                            try {
                                 // 确保 targetCalendar.url 末尾有斜杠
                                 const baseUrl = targetCalendar.url.endsWith('/') ? targetCalendar.url : targetCalendar.url + '/';
                                 createdUrl = new URL(filename, baseUrl).href; 
                            } catch(urlError) {
                                 console.error(`[performQQCalDavSync] Error constructing URL for created event: ${urlError}`);
                                 createdUrl = `${targetCalendar.url}${filename}`; // Fallback
                            }
                            eventsDb[indexToUpdate].caldav_url = createdUrl;
                            eventsDb[indexToUpdate].caldav_uid = eventToModify.id;
                            eventsDb[indexToUpdate].caldav_etag = etag || null; // 保存 etag 或 null
                            eventsDb[indexToUpdate].needs_caldav_push = false;
                            eventsDb[indexToUpdate].source = 'caldav_sync_tsdav'; 
                            updatedLocallyCount++;
                            console.log(`[performQQCalDavSync] Updated local event ${eventToModify.id} with QQ CalDAV info after create.`);
                        } else {
                             console.warn(`[performQQCalDavSync] Could not find local event ${eventToModify.id} to update after successful create.`);
                        }
                        // } else { // 旧的失败处理逻辑，现在由 catch 块处理
                        //      console.error(`[performQQCalDavSync] Failed to create ${filename} on QQ server. createResult:`, createResult);
                        //      // ... (处理 500 错误等) ...
                        //      // 如果创建失败，保持 needs_caldav_push 为 true，下次重试
                        // }
                        // --- 结束修改 ---
                    }

                } catch (pushOrUpdateError) {
                    console.error(`[performQQCalDavSync] Error pushing/updating event ID ${eventToModify.id} to QQ CalDAV server:`, pushOrUpdateError);
                    // 保持之前的错误处理逻辑，特别是 412 (虽然更新时可能不发生) 和 409
                     let statusCode; 
                     // ... (尝试从 pushOrUpdateError 获取 statusCode) ...
                     if (pushOrUpdateError?.response?.status) { 
                         statusCode = pushOrUpdateError.response.status;
                     } else if (pushOrUpdateError?.message?.includes('412')) { statusCode = 412; }
                       else if (pushOrUpdateError?.message?.includes('409')) { statusCode = 409; }
                       else if (pushOrUpdateError?.message?.includes('500')) { statusCode = 500; }

                     if (statusCode === 412) {
                         console.warn(`[performQQCalDavSync] Update failed for ${eventToModify.id} due to ETag mismatch (412 Precondition Failed). Will retry after next pull.`);
                     } else if (statusCode === 409) {
                         console.warn(`[performQQCalDavSync] Create/Update failed for ${eventToModify.id} due to 409 Conflict. Assuming it exists or filename conflict. Marking locally.`);
                         const indexToUpdate = eventsDb.findIndex(e => e.id === eventToModify.id);
                         if (indexToUpdate !== -1) {
                             eventsDb[indexToUpdate].needs_caldav_push = false; // 标记为不再尝试推送
                             updatedLocallyCount++;
                         }
                     } else if (statusCode === 500) {
                          console.error(`[performQQCalDavSync] Received 500 Internal Server Error from QQ. ICS data format might still be incorrect or server issue.`);
                          // 对于 500 错误，也暂时不重置 needs_caldav_push，允许下次重试
                     }
                     // ... 其他错误处理 ...
                }
            }
        }
        // ... (后续的保存和返回逻辑) ...
        
        // --- 结束推送逻辑 --- // 保留推送逻辑在 QQ 函数内

        // 统一保存所有更改 (包括服务器拉取更新的和本地推送更新的)
        if (addedFromServerCount > 0 || removedLocallyCount > 0 || updatedLocallyCount > 0) {
            console.log(`[performQQCalDavSync] Saving updated eventsDb. Added: ${addedFromServerCount}, Removed: ${removedLocallyCount}, Pushed&Updated: ${updatedLocallyCount}`); // <-- 修改日志前缀
            await saveEvents(eventsDb);
        } else {
             console.log('[performQQCalDavSync] No changes to eventsDb required after sync and push attempt.'); // <-- 修改日志前缀
        }

        console.log('[performQQCalDavSync] QQ CalDAV sync process finished.'); // <-- 修改日志前缀
        // isCalDavSyncRunning = false; // 不再在此函数中管理锁
        // 汇总返回信息
        const message = `QQ CalDAV Sync successful. Added ${addedFromServerCount} from server. Removed ${removedLocallyCount} locally. Created ${pushedToServerCount} on server. Updated ${updatedOnServerCount} on server.`;
        return { message: message, eventCount: addedFromServerCount + pushedToServerCount + updatedOnServerCount - removedLocallyCount }; // 返回净变化量

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
app.post('/events/import', upload.single('documentFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件。' });
    }
    const uploadedFile = req.file;
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
            eventsDb = [...eventsDb, ...newEvents];
            await saveEvents(eventsDb);
            console.log(`[Import-LLM] Successfully imported and saved ${newEvents.length} events via LLM.`);
            res.status(200).json({ message: `通过 LLM 成功导入 ${newEvents.length} 个事件。`, count: newEvents.length });
        } else {
            console.log("[Import-LLM] LLM did not return any valid events.");
            res.status(200).json({ message: 'LLM 已处理文档，但未解析出任何有效事件。' , count: 0 });
        }

    } catch (error) {
        console.error('[POST /events/import] Unexpected error processing file with LLM:', error);
        res.status(500).json({ error: `处理文件时发生意外服务器错误: ${error instanceof Error ? error.message : String(error)}` });
    }
});

// --- CalDAV 同步路由 (最终定义) ---
app.post('/sync/caldav', async (req, res) => {
    console.log("[POST /sync/caldav] Triggering CalDAV sync via dispatcher...");
    
    let syncResult;
    try {
        // 调用重构后的 CalDAV 分发函数
        syncResult = await performCalDavSync(); 
        console.log("[/sync/caldav Route] performCalDavSync finished. Raw result:", syncResult);

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
             // 如果 performCalDavSync 返回了非对象或 null/undefined
             console.error("[/sync/caldav Route] performCalDavSync returned an unexpected result type:", syncResult);
             return res.status(500).json({ error: 'CalDAV sync function returned an unexpected result format.' });
        }

    } catch (routeError) {
        // 捕获 performCalDavSync 抛出的错误 或 路由处理中的其他错误
        console.error("[/sync/caldav Route] Caught unexpected error in route handler:", routeError);
        // 确保返回 JSON 格式的错误
        return res.status(500).json({ 
            error: 'An unexpected error occurred during CalDAV sync.',
            details: routeError instanceof Error ? routeError.message : String(routeError)
        });
    }
});

// --- 最后的测试路由 --- 