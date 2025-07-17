# 📅 潮汐志更新日志

## [2.0.0] - 2025-07-17

### ✨ 新增功能
- **统一设置服务集成**: 集成统一账号系统，支持多应用单点登录
- **USE_DEFAULT_CONFIG支持**: 智能处理默认配置标记，从默认配置文件读取实际值
- **用户数据隔离**: 每个用户独立的日历数据存储空间
- **混合设置架构**: 本地设置服务和统一设置服务的混合架构
- **外网访问支持**: 通过Nginx反向代理支持外网访问
- **健康检查端点**: 添加服务健康检查API端点

### 🔧 技术改进
- **用户数据服务**: 新增用户数据管理服务，支持CSV用户管理
- **本地设置服务**: 优化本地设置服务，支持新用户数据系统
- **前端设置服务**: 修改前端混合设置服务，优先使用本地设置
- **依赖管理**: 添加csv-parser、csv-writer等新依赖

### 🐛 问题修复
- 修复LLM设置显示错误的问题（不再显示deepseek而是正确配置）
- 修复用户认证状态同步问题
- 修复CSV文件解析的兼容性问题
- 修复nginx代理配置的连接问题

### 📁 数据结构变更
```
user-data-v2/
└── {username}_settings.json    # 用户配置文件
    ├── llm                     # LLM配置
    ├── caldav                  # CalDAV配置
    ├── imap                    # IMAP配置
    ├── exchange                # Exchange配置
    └── vectorization           # 向量化配置

data/
└── users/
    └── {username}_events.json  # 用户日历事件
```

### 🔐 安全增强
- JWT令牌认证机制
- 用户数据隔离和权限控制
- 敏感信息加密存储
- CORS跨域安全配置

### 🌐 外网访问
- **域名**: http://jason.cheman.top:8081/calendars/
- **Nginx配置**: 反向代理到本地服务
- **健康检查**: `/api/health` 端点监控服务状态

### 📊 性能优化
- 日历同步性能提升
- 前端组件渲染优化
- 数据库查询优化
- AI响应速度提升

---

## [1.0.0] - 2024-11-01

### ✨ 初始功能
- 多平台日历同步 (Exchange, CalDAV, IMAP)
- AI智能助手和自然语言解析
- 现代化响应式界面
- 基础用户认证系统
- 日程管理和冲突检测

### 🏗️ 技术栈
- 前端: React 18, TypeScript, Tailwind CSS
- 后端: Node.js, Express.js, SQLite
- 集成: Exchange Web Services, CalDAV, IMAP