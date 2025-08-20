# 潮汐志 (TideLog)

智能日历系统 - 多平台日历同步和AI助手系统

🔗 在线体验：[https://www.cheman.top/calendars/](https://www.cheman.top/calendars/)

## ✨ 功能特性

### 📊 多平台日历同步
- **Exchange Server** - 企业级邮件日历同步，支持Exchange 2013+
- **CalDAV协议** - 标准日历同步协议，兼容Google Calendar、iCloud等
- **IMAP邮件** - 智能邮件日历事件提取和解析
- **本地日历** - 离线日历管理，支持数据导入导出

### 🤖 AI智能助手
- **自然语言解析** - 智能识别和创建日程安排
- **智能提醒** - 基于AI的个性化提醒和建议
- **冲突检测** - 自动检测日程冲突并提供解决方案
- **建议优化** - AI分析日程模式，优化时间安排
- **多LLM支持** - 支持OpenAI、Claude、本地模型等

### 🎨 现代化界面
- **响应式设计** - 完美适配桌面、平板和移动设备
- **主题切换** - 明暗主题支持，个性化界面
- **拖拽操作** - 直观的日程拖拽编辑
- **多视图切换** - 月视图、周视图、日视图、议程视图

### 🔐 统一认证与设置
- **统一账号系统** - 集成统一设置服务认证
- **用户数据隔离** - 每个用户独立的日历数据存储
- **安全存储** - 加密存储敏感信息和账户凭据
- **权限管理** - 细粒度权限控制和访问管理
- **USE_DEFAULT_CONFIG支持** - 智能处理默认配置标记

## 🏗️ 技术架构

### 前端技术栈
- **React 18** - 现代化前端框架
- **TypeScript** - 类型安全开发
- **Tailwind CSS** - 原子化CSS框架
- **React Router** - 单页应用路由
- **Zustand** - 轻量级状态管理

### 后端技术栈
- **Node.js** - 高性能JavaScript运行时
- **Express.js** - 轻量级Web框架
- **TypeScript** - 类型安全的后端开发
- **SQLite** - 轻量级数据库
- **JWT** - 安全认证

### 集成服务
- **Exchange Web Services** - Exchange服务器集成，支持EWS API
- **CalDAV客户端** - 标准日历协议，支持多种CalDAV服务器
- **IMAP客户端** - 邮件服务器连接，智能邮件解析
- **统一设置服务** - 用户认证和配置管理，支持多应用集成
- **本地设置服务** - 混合设置架构，支持本地和远程配置
- **用户数据服务** - 用户数据隔离和管理

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm或yarn
- Git

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/chemany/tidelog.git
   cd tidelog
   ```

2. **安装依赖**
   ```bash
   # 安装后端依赖
   cd backend
   npm install
   
   # 安装前端依赖
   cd ../frontend
   npm install
   ```

3. **环境配置**
   ```bash
   # 复制环境变量文件
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   
   # 编辑环境变量文件
   ```

4. **启动统一设置服务**
   ```bash
   # 需要先启动统一设置服务
   cd ../unified-settings-service
   npm start
   ```

5. **启动潮汐志服务**
   ```bash
   # 启动后端服务 (端口11001)
   cd ../TideLog/backend
   npm start

   # 启动前端服务 (端口11000)
   cd ../frontend
   npm start
   ```

6. **访问应用**
   - 前端: http://localhost:11000/calendars/
   - 后端API: http://localhost:11001
   - 统一设置服务: http://localhost:3002
   - 外网访问: http://jason.cheman.top:8081/calendars/

## ⚙️ 配置说明

### 后端配置 (backend/.env)
```env
# 服务配置
PORT=11001
NODE_ENV=development

# 数据库配置
DATABASE_PATH="./data/calendar.db"

# 统一设置服务配置
UNIFIED_SETTINGS_URL="http://localhost:3002"

# 用户数据配置
USER_DATA_PATH="C:\\code\\unified-settings-service\\user-data-v2"
USERS_CSV_PATH="C:\\code\\unified-settings-service\\users.csv"

# AI模型配置
DEFAULT_MODELS_PATH="C:\\code\\unified-settings-service\\config\\default-models.json"

# 同步配置
SYNC_INTERVAL_MINUTES=30
CALDAV_SYNC_MINUTE=5

# 日志配置
LOG_LEVEL="info"
```

### 前端配置 (frontend/.env.local)
```env
# API配置
REACT_APP_API_BASE_URL="http://localhost:11001"
REACT_APP_UNIFIED_SETTINGS_URL="http://localhost:3002"

# 应用配置
REACT_APP_APP_NAME="潮汐志"
REACT_APP_APP_VERSION="2.0.0"

# 功能开关
REACT_APP_ENABLE_AI_ASSISTANT=true
REACT_APP_ENABLE_NATURAL_LANGUAGE=true
REACT_APP_ENABLE_CONFLICT_DETECTION=true
```

## 📖 使用指南

### 基本操作
1. **创建账户** - 通过统一设置服务注册账户
2. **配置同步** - 设置Exchange、CalDAV或IMAP连接
3. **查看日历** - 浏览同步的日历事件
4. **创建事件** - 手动创建或AI辅助创建

### 高级功能
- **多日历管理** - 同时管理多个日历源
- **智能分析** - AI分析日程安排模式
- **批量操作** - 批量导入导出日历数据
- **提醒设置** - 个性化提醒配置

## 🔧 服务配置

### Exchange Server
```javascript
{
  "serverUrl": "https://your-exchange-server.com",
  "username": "your-username",
  "password": "your-password",
  "exchangeVersion": "Exchange2013"
}
```

### CalDAV服务器
```javascript
{
  "serverUrl": "https://your-caldav-server.com",
  "username": "your-username",
  "password": "your-password"
}
```

### IMAP邮件服务器
```javascript
{
  "host": "imap.your-provider.com",
  "port": 993,
  "username": "your-email@example.com",
  "password": "your-password",
  "useTLS": true
}
```

## 🛠️ 开发指南

### 项目结构
```
smart-calendar/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── controllers/    # 控制器
│   │   ├── services/       # 业务逻辑
│   │   ├── models/         # 数据模型
│   │   └── routes/         # 路由定义
│   └── data/               # 数据存储
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── services/       # API服务
│   │   ├── hooks/          # 自定义Hooks
│   │   └── utils/          # 工具函数
│   └── public/             # 静态资源
└── docs/                   # 项目文档
```

### API接口

#### 日历事件
- `GET /api/events` - 获取日历事件列表
- `POST /api/events` - 创建新的日历事件
- `PUT /api/events/:id` - 更新日历事件
- `DELETE /api/events/:id` - 删除日历事件

#### 日历同步
- `POST /api/sync/exchange` - 同步Exchange日历
- `POST /api/sync/caldav` - 同步CalDAV日历
- `POST /api/sync/imap` - 同步IMAP邮件日历

#### 配置管理
- `GET /api/settings` - 获取用户配置
- `POST /api/settings` - 更新用户配置

### 贡献指南
1. Fork项目
2. 创建功能分支: `git checkout -b feature/new-feature`
3. 提交更改: `git commit -m 'Add new feature'`
4. 推送分支: `git push origin feature/new-feature`
5. 提交Pull Request

## 📊 系统架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端应用      │────│   后端API      │────│  统一设置服务   │
│  (React SPA)    │    │  (Express.js)   │    │   (认证/配置)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   用户界面      │    │   业务逻辑      │    │   用户管理      │
│  (日历视图)     │    │  (日程同步)     │    │  (认证授权)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │    外部服务集成     │
                    │ Exchange/CalDAV/    │
                    │       IMAP          │
                    └─────────────────────┘
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [React](https://reactjs.org/) - 前端框架
- [Express.js](https://expressjs.com/) - 后端框架
- [Exchange Web Services](https://docs.microsoft.com/en-us/exchange/client-developer/exchange-web-services/explore-the-ews-managed-api-ews-and-web-services-in-exchange) - Exchange集成
- [CalDAV](https://tools.ietf.org/html/rfc4791) - 日历同步协议

## 📞 联系方式

- 项目地址: https://github.com/chemany/tidelog
- 问题反馈: https://github.com/chemany/tidelog/issues

---

⭐ 如果这个项目对您有帮助，请给它一个星标！ 