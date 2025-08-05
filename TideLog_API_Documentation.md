# 📅 潮汐志 (TideLog) - API接口与功能说明文档

## 概述

潮汐志是一个多平台日历同步和AI助手系统，支持Exchange、CalDAV、IMAP等多种协议。该系统提供智能日程管理、AI自然语言解析、多平台同步等功能。

## 系统架构

### 前端 (Next.js 15.3.1 + React 18.3.1)
- **本地地址**: http://localhost:11000
- **外网访问地址**: https://www.cheman.top/calendars
- **技术栈**: Next.js, TypeScript, Tailwind CSS, React Big Calendar

### 后端 (Node.js + Express)
- **地址**: http://localhost:11001  
- **技术栈**: Node.js, Express.js, TypeScript, SQLite

### 统一设置服务
- **地址**: http://localhost:3002
- **功能**: 用户认证、配置管理、多应用集成

## API 接口文档

### 认证相关

所有需要认证的接口都需要在请求头中包含 JWT Token：
```
Authorization: Bearer <token>
```

### 1. 健康检查

#### GET /health
**描述**: 检查服务健康状态  
**认证**: 不需要  
**响应**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T10:00:00.000Z",
  "service": "TideLog后端服务",
  "port": 11001,
  "version": "1.0.0"
}
```

#### GET /api/health  
**描述**: API健康检查  
**认证**: 不需要  
**响应**: 同上

### 2. 事件管理

#### GET /events
**描述**: 获取用户的所有日历事件  
**认证**: 需要  
**响应**:
```json
[
  {
    "id": "event-id",
    "title": "会议标题",
    "start_datetime": "2025-01-30T14:00:00.000Z",
    "end_datetime": "2025-01-30T15:00:00.000Z",
    "description": "会议描述",
    "location": "会议地点",
    "all_day": false,
    "completed": false,
    "source": "manual_ui",
    "userId": "user-id",
    "created_at": "2025-01-30T10:00:00.000Z",
    "updated_at": "2025-01-30T10:00:00.000Z"
  }
]
```

#### POST /events
**描述**: 创建新的日历事件  
**认证**: 需要  
**请求体**:
```json
{
  "title": "新事件",
  "start_datetime": "2025-01-30T14:00:00.000Z",
  "end_datetime": "2025-01-30T15:00:00.000Z",
  "description": "事件描述",
  "location": "事件地点",
  "is_all_day": false,
  "source": "manual_ui"
}
```

#### PUT /events/:id
**描述**: 更新指定事件  
**认证**: 需要  
**请求体**: 
- 完整更新：包含所有字段
- 状态更新：仅包含 `{"completed": true/false}`

#### DELETE /events/:id
**描述**: 删除指定事件  
**认证**: 需要  
**响应**:
```json
{
  "message": "事件 '会议标题' (ID: event-id) 已成功删除。"
}
```

### 3. AI 自然语言解析

#### POST /events/parse-natural-language
**描述**: 使用AI解析自然语言创建事件  
**认证**: 需要  
**请求体**:
```json
{
  "text": "明天下午3点和张三开会"
}
```
**响应**:
```json
{
  "title": "和张三开会",
  "start_datetime": "2025-01-31T07:00:00.000Z",
  "end_datetime": "2025-01-31T08:00:00.000Z",
  "description": "明天下午3点和张三开会",
  "location": null
}
```

### 4. 文档导入

#### POST /events/import
**描述**: 上传文档并通过AI提取事件  
**认证**: 需要  
**请求**: Form-data，字段名为 `documentFile`  
**支持格式**: .txt, .docx  
**响应**:
```json
{
  "message": "通过 LLM 成功导入 3 个事件。",
  "count": 3
}
```

### 5. 同步功能

#### POST /sync/caldav
**描述**: 触发CalDAV同步  
**认证**: 需要  
**响应**:
```json
{
  "message": "CalDAV同步完成。从服务器添加了 2 个事件，推送了 1 个事件。",
  "eventCount": 3
}
```

#### POST /sync/imap
**描述**: 触发IMAP智能邮件同步  
**认证**: 需要  
**响应**:
```json
{
  "message": "AI已完成邮件分析和事件提取。",
  "count": 2
}
```

### 6. 配置管理

#### LLM 配置
- **GET /config/llm**: 获取LLM设置
- **POST /config/llm**: 保存LLM设置
- **GET /config/llm/:provider**: 获取指定提供商的设置

#### Exchange 配置
- **GET /config/exchange**: 获取Exchange设置
- **POST /config/exchange**: 保存Exchange设置

#### CalDAV 配置
- **GET /config/caldav**: 获取CalDAV设置
- **POST /config/caldav**: 保存CalDAV设置

#### IMAP 配置
- **GET /config/imap**: 获取IMAP设置
- **POST /config/imap**: 保存IMAP设置

#### IMAP 过滤器配置
- **GET /config/imap-filter**: 获取IMAP发件人白名单
- **POST /config/imap-filter**: 保存IMAP发件人白名单

### 7. 设置 API (前端混合服务)

#### GET /settings/llm
**描述**: 获取前端安全版本的LLM设置（隐藏API密钥）  
**认证**: 需要

#### POST /settings/llm
**描述**: 保存LLM设置  
**认证**: 需要

#### GET /settings/exchange
**描述**: 获取Exchange设置（隐藏密码）  
**认证**: 需要

#### POST /settings/exchange
**描述**: 保存Exchange设置  
**认证**: 需要

### 8. 调试接口

#### POST /debug/reset-llm-cache
**描述**: 重置LLM配置缓存  
**认证**: 需要

#### POST /debug/reset-imap-lock
**描述**: 重置IMAP同步锁  
**认证**: 需要

#### GET /debug/env
**描述**: 查看环境变量配置  
**认证**: 不需要

## 核心功能特性

### 1. 多平台日历同步

#### Exchange Server 同步
- 支持Exchange 2013+
- 支持EWS API和Python脚本两种方式
- 专门优化QQ邮箱的EWS同步

#### CalDAV 同步
- 支持标准CalDAV协议
- 兼容Google Calendar、iCloud、飞书等
- 特别优化QQ日历和飞书日历
- 支持双向同步（拉取和推送）

#### IMAP 智能邮件解析
- AI智能识别邮件中的日历事件
- 支持ICS附件解析
- 发件人白名单过滤
- 自动去重和冲突检测

### 2. AI 智能功能

#### 自然语言解析
- 支持中文自然语言输入
- 智能识别时间、地点、参与人
- 自动时区转换
- 支持多轮对话和上下文理解

#### 智能文档导入
- 支持.txt和.docx文件
- AI提取行动计划和目标日期
- 自动创建对应的日历事件
- 批量导入和处理

#### 多LLM支持
- OpenAI GPT系列
- Anthropic Claude
- DeepSeek
- Google Gemini
- 内置免费模型（OpenRouter）
- 支持自定义API端点

### 3. 用户体验

#### 现代化界面
- 基于React Big Calendar的日历视图
- 支持月、周、日、议程四种视图
- 拖拽编辑事件时间和日期
- 响应式设计，适配多种设备

#### 交互功能
- 点击空白区域创建事件
- 双击事件进行编辑
- 拖拽调整事件时间
- 快捷键支持

#### 主题和个性化
- 事件颜色自动生成
- 完成状态视觉标识
- 即将到来的事件高亮
- 自定义事件样式

### 4. 数据管理

#### 用户数据隔离
- 基于统一设置服务的用户认证
- 每个用户独立的事件数据
- 安全的数据存储和访问控制

#### 事件属性
- 基本信息：标题、时间、描述、地点
- 状态管理：完成/未完成
- 来源标识：手动创建、AI解析、同步获取
- 同步信息：CalDAV UID、ETag、URL

#### 数据持久化
- SQLite轻量级数据库
- JSON文件备份
- 支持数据迁移和清理

### 5. 系统集成

#### 统一设置服务集成
- 统一用户认证和授权
- 集中的配置管理
- 多应用数据共享
- 安全的API密钥管理

#### 定时任务
- IMAP自动同步（每30分钟）
- CalDAV自动同步（每小时）
- 可配置的同步间隔

#### 错误处理和日志
- 详细的错误日志记录
- 用户友好的错误提示
- 操作状态实时反馈
- 调试接口支持

## 配置示例

### Exchange Server 配置
```json
{
  "email": "user@company.com",
  "password": "password",
  "ewsUrl": "https://mail.company.com/EWS/Exchange.asmx",
  "exchangeVersion": "Exchange2013"
}
```

### CalDAV 配置
```json
{
  "username": "user@example.com",
  "password": "app-password", 
  "serverUrl": "https://caldav.example.com"
}
```

### IMAP 配置
```json
{
  "email": "user@gmail.com",
  "password": "app-password",
  "imapHost": "imap.gmail.com",
  "imapPort": 993,
  "useTLS": true
}
```

### LLM 配置
```json
{
  "provider": "openai",
  "api_key": "sk-xxx",
  "base_url": "https://api.openai.com/v1",
  "model_name": "gpt-3.5-turbo",
  "temperature": 0.7,
  "max_tokens": 2000
}
```

## 部署说明

### 本地开发
1. 启动统一设置服务（端口3002）
2. 启动潮汐志后端（端口11001）
3. 启动潮汐志前端（端口11000）

### 生产环境
- 支持Nginx反向代理
- 外网访问地址：http://jason.cheman.top:8081/calendars/
- 支持HTTPS和域名访问
- 数据库和文件存储持久化

### 环境变量
```env
# 后端配置
PORT=11001
NODE_ENV=production
DATABASE_PATH="./data/calendar.db"
UNIFIED_SETTINGS_URL="http://localhost:3002"

# 前端配置
REACT_APP_API_BASE_URL="http://localhost:11001"
REACT_APP_UNIFIED_SETTINGS_URL="http://localhost:3002"
```

## 安全特性

### 认证授权
- JWT Token认证
- 请求头验证
- 用户会话管理
- 跨域请求控制

### 数据安全
- 用户数据隔离
- API密钥加密存储
- 敏感信息脱敏
- 安全的文件上传

### 网络安全
- CORS策略配置
- 局域网IP访问控制
- HTTPS支持
- 请求大小限制

## 外网部署架构

### Cloudflare Tunnel配置

系统通过Cloudflare Tunnel提供外网访问，配置文件：`/home/jason/code/cloudflared-config.yml`

```yaml
tunnel: jason-notepads
ingress:
  # TideLog 潮汐志路由
  - hostname: www.cheman.top
    path: /calendars*
    service: http://localhost:8081
  
  # 向后兼容jason子域名
  - hostname: jason.cheman.top  
    path: /calendars*
    service: http://localhost:8081
```

### Nginx反向代理配置

本地nginx监听8081端口，配置文件：`/home/jason/code/nginx.conf`

#### TideLog API代理（禁用缓存确保实时性）
```nginx
location ~ ^/calendars/api/ {
    rewrite ^/calendars/api/(.*) /$1 break;
    proxy_pass http://127.0.0.1:11001;
    # 禁用缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

#### TideLog前端代理（支持WebSocket）
```nginx  
location /calendars/ {
    proxy_pass http://127.0.0.1:11000;
    # WebSocket支持
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### API地址映射 (最新架构)

| 环境 | 前端地址 | API地址 | 架构说明 |
|------|----------|---------|----------|
| 本地开发 | http://localhost:11000 | http://localhost:11001 | 本地开发环境 |
| **主域名访问** | https://www.cheman.top/calendars | https://www.cheman.top/calendars/api | **Cloudflare Tunnel + Nginx** |
| Legacy访问 | http://jason.cheman.top/calendars | http://jason.cheman.top/calendars/api | 向后兼容 |
| Docker端口 | http://jason.cheman.top/11000 | http://jason.cheman.top/11001 | Docker部署方式 |

### 自动环境检测

前端会自动检测访问环境，选择对应的API地址：

```javascript
// 环境检测示例
function getApiBaseUrl() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('cheman.top')) {
    console.log('[API Config] 检测到外网环境(www.cheman.top)，使用nginx代理: https://www.cheman.top/calendars/api');
    return 'https://www.cheman.top/calendars/api';
  }
  
  return 'http://localhost:11001';
}
```

### 实际运行日志示例

```javascript
[API Config] 检测到外网环境(www.cheman.top)，使用nginx代理: https://www.cheman.top/calendars/api
[NLP Submit] Payload for creating event: {
  title: '与lianlong交流杭氧化剂', 
  start_datetime: '2025-08-01T00:00:00.000Z',
  description: '明天上午与lianlong交流杭氧化剂'
}
```

这证明了：
- 外网访问地址配置正确
- nginx代理工作正常  
- API接口调用成功
- AI自然语言解析功能正常运行

### 最新部署架构访问流程

#### 主域名访问流程 (推荐)
1. **用户访问** → `https://www.cheman.top/calendars`
2. **Cloudflare Tunnel** → 转发到 `http://localhost:8081/calendars`
3. **Nginx主代理** → 根据路径转发：
   - `/calendars/api/*` → `http://127.0.0.1:11001/*` (后端API)
   - `/calendars/*` → `http://127.0.0.1:11000/*` (前端应用)
4. **应用服务** → 处理请求并返回响应

#### Docker端口访问流程 (向后兼容)
1. **用户访问** → `http://jason.cheman.top/11000` 或 `http://jason.cheman.top/11001`
2. **Cloudflare Tunnel** → 转发到 `http://localhost:8081/11000`
3. **Nginx Docker代理** → 端口号路由：
   - `/(\d+)/(.*)` → `http://192.168.10.172:$1/$2` (内网Docker服务)
4. **Docker服务** → 处理请求并返回响应

#### 架构优势
- **Cloudflare Tunnel**: 无需公网IP，自动HTTPS，全球CDN
- **双层Nginx**: 主代理处理应用路由，Docker代理处理端口转发
- **向后兼容**: 支持旧的jason.cheman.top域名和端口访问方式
- **容错机制**: Docker服务不可用时显示友好错误页面

---

**版本**: v2.0.0  
**更新时间**: 2025-01-30  
**作者**: Jason