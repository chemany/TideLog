const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// 替换统一设置服务客户端为本地设置服务
const localSettingsService = require('./localSettingsService');

const app = express();
const PORT = process.env.API_PORT || 3003;

// 中间件
app.use(cors({
    origin: ['http://localhost:11000', 'http://127.0.0.1:11000', 'http://jason.cheman.top:11000', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());

// 数据文件路径
const dataDir = path.join(__dirname, 'data');
const eventsFile = path.join(dataDir, 'events.json');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 读取事件数据
function readEvents() {
    try {
        if (fs.existsSync(eventsFile)) {
            const data = fs.readFileSync(eventsFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('读取事件文件失败:', error);
        return [];
    }
}

// 写入事件数据
function writeEvents(events) {
    try {
        fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
        return true;
    } catch (error) {
        console.error('写入事件文件失败:', error);
        return false;
    }
}

// API路由

// 获取所有事件
app.get('/api/events', (req, res) => {
    try {
        const events = readEvents();
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: '获取事件失败' });
    }
});

// 创建新事件
app.post('/api/events', (req, res) => {
    try {
        const events = readEvents();
        const newEvent = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        events.push(newEvent);
        
        if (writeEvents(events)) {
            res.status(201).json(newEvent);
        } else {
            res.status(500).json({ error: '保存事件失败' });
        }
    } catch (error) {
        res.status(500).json({ error: '创建事件失败' });
    }
});

// 更新事件
app.put('/api/events/:id', (req, res) => {
    try {
        const events = readEvents();
        const eventIndex = events.findIndex(event => event.id === req.params.id);
        
        if (eventIndex === -1) {
            return res.status(404).json({ error: '事件不存在' });
        }
        
        events[eventIndex] = {
            ...events[eventIndex],
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        
        if (writeEvents(events)) {
            res.json(events[eventIndex]);
        } else {
            res.status(500).json({ error: '更新事件失败' });
        }
    } catch (error) {
        res.status(500).json({ error: '更新事件失败' });
    }
});

// 删除事件
app.delete('/api/events/:id', (req, res) => {
    try {
        const events = readEvents();
        const filteredEvents = events.filter(event => event.id !== req.params.id);
        
        if (filteredEvents.length === events.length) {
            return res.status(404).json({ error: '事件不存在' });
        }
        
        if (writeEvents(filteredEvents)) {
            res.json({ message: '事件删除成功' });
        } else {
            res.status(500).json({ error: '删除事件失败' });
        }
    } catch (error) {
        res.status(500).json({ error: '删除事件失败' });
    }
});


// 内置模型代理接口（处理安全API调用）
app.post('/api/proxy/builtin-chat', async (req, res) => {
    try {
        console.log('[智能日历API] 内置模型代理请求');
        
        // 获取内置模型的真实配置（包含API密钥）
        const defaultModelsPath = 'C:\\code\\unified-settings-service\\config\\default-models.json';
        const defaultModels = JSON.parse(fs.readFileSync(defaultModelsPath, 'utf-8'));
        const builtinConfig = defaultModels.builtin_free;
        
        if (!builtinConfig || !builtinConfig.api_key) {
            return res.status(500).json({ error: '内置模型配置不完整' });
        }
        
        const { messages, stream = false } = req.body;
        
        // 设置响应头
        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
        }
        
        // 调用外部API
        const response = await fetch(builtinConfig.base_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${builtinConfig.api_key}`
            },
            body: JSON.stringify({
                model: builtinConfig.model_name,
                messages: messages,
                stream: stream,
                temperature: builtinConfig.temperature || 0.7,
                max_tokens: builtinConfig.max_tokens || 2000
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[智能日历API] 外部API调用失败:', response.status, errorText);
            return res.status(response.status).json({ error: '外部API调用失败' });
        }
        
        if (stream) {
            // 流式响应
            const reader = response.body.getReader();
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = new TextDecoder().decode(value);
                    res.write(chunk);
                }
            } finally {
                reader.releaseLock();
                res.end();
            }
        } else {
            // 非流式响应
            const data = await response.json();
            res.json(data);
        }
        
    } catch (error) {
        console.error('[智能日历API] 内置模型代理失败:', error);
        
        if (!res.headersSent) {
            res.status(500).json({ error: '内置模型代理失败' });
        }
    }
});

// AI聊天接口
app.post('/api/chat', async (req, res) => {
    try {
        console.log('[智能日历API] AI聊天请求');
        
        const { message, context } = req.body;
        
        // 获取LLM设置
        const llmSettings = localSettingsService.getCalendarLLMSettings();
        console.log('[智能日历API] 使用的LLM设置:', llmSettings);
        
        if (!llmSettings) {
            return res.status(500).json({ error: '无法获取LLM设置' });
        }
        
        let response;
        
        if (llmSettings.provider === 'builtin') {
            // 内置模型通过代理调用
            const proxyResponse = await fetch('http://localhost:11001/api/proxy/builtin-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: '你是一个智能日历助手，帮助用户管理日程和回答相关问题。' },
                        { role: 'user', content: message }
                    ],
                    stream: false
                })
            });
            
            if (!proxyResponse.ok) {
                throw new Error('内置模型代理调用失败');
            }
            
            const data = await proxyResponse.json();
            response = data.choices[0].message.content;
            
        } else if (llmSettings.provider === 'openai') {
            // OpenAI
            const openai = new OpenAI({
                apiKey: llmSettings.api_key,
                baseURL: llmSettings.base_url || 'https://api.openai.com/v1'
            });
            
            const completion = await openai.chat.completions.create({
                model: llmSettings.model_name,
                messages: [
                    { role: 'system', content: '你是一个智能日历助手，帮助用户管理日程和回答相关问题。' },
                    { role: 'user', content: message }
                ],
                temperature: llmSettings.temperature || 0.7,
                max_tokens: llmSettings.max_tokens || 2000
            });
            
            response = completion.choices[0].message.content;
            
        } else if (llmSettings.provider === 'anthropic') {
            // Anthropic Claude
            const anthropic = new Anthropic({
                apiKey: llmSettings.api_key,
                baseURL: llmSettings.base_url || 'https://api.anthropic.com'
            });
            
            const completion = await anthropic.messages.create({
                model: llmSettings.model_name,
                max_tokens: llmSettings.max_tokens || 2000,
                temperature: llmSettings.temperature || 0.7,
                system: '你是一个智能日历助手，帮助用户管理日程和回答相关问题。',
                messages: [
                    { role: 'user', content: message }
                ]
            });
            
            response = completion.content[0].text;
            
        } else if (llmSettings.provider === 'google') {
            // Google Gemini
            const genAI = new GoogleGenerativeAI(llmSettings.api_key);
            const model = genAI.getGenerativeModel({ model: llmSettings.model_name });
            
            const result = await model.generateContent(message);
            const responseText = result.response;
            response = responseText.text();
            
        } else {
            // 其他提供商（如OpenRouter, DeepSeek等）
            const apiResponse = await fetch(llmSettings.base_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${llmSettings.api_key}`
                },
                body: JSON.stringify({
                    model: llmSettings.model_name,
                    messages: [
                        { role: 'system', content: '你是一个智能日历助手，帮助用户管理日程和回答相关问题。' },
                        { role: 'user', content: message }
                    ],
                    temperature: llmSettings.temperature || 0.7,
                    max_tokens: llmSettings.max_tokens || 2000
                })
            });
            
            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error('[智能日历API] API调用失败:', apiResponse.status, errorText);
                throw new Error('API调用失败');
            }
            
            const data = await apiResponse.json();
            response = data.choices[0].message.content;
        }
        
        console.log('[智能日历API] AI响应生成成功');
        res.json({ response });
        
    } catch (error) {
        console.error('[智能日历API] AI聊天失败:', error);
        res.status(500).json({ error: 'AI聊天失败: ' + error.message });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: '智能日历后端',
        settingsService: '本地设置服务'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`智能日历后端服务器运行在 http://localhost:${PORT}`);
    console.log('使用本地设置服务管理配置');
    
    // 测试本地设置服务连接
    try {
        const testSettings = localSettingsService.getCalendarLLMSettings();
        console.log('本地设置服务连接成功，当前LLM设置:', testSettings);
    } catch (error) {
        console.error('本地设置服务连接失败:', error);
    }
});

module.exports = app; 