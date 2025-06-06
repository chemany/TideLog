# 智能日历 - Node.js后端

这是智能日历应用的Node.js后端服务，提供事件管理、Exchange同步和LLM配置功能。

## 项目结构

```
backend/
├── server.js           # 主服务器文件
├── storage.js          # 数据存储和加载功能
├── .env                # 环境变量配置
├── package.json        # 项目依赖
├── data/               # 数据文件目录 (自动创建)
│   ├── llm_settings.json     # LLM配置
│   ├── events_db.json        # 事件数据
│   └── exchange_settings.json # Exchange配置
└── README.md           # 项目说明
```

## 安装步骤

1. 进入后端目录
```
cd backend
```

2. 安装Node.js依赖
```
npm install
```

## 运行服务

```
npm start
```

开发模式 (自动重启):
```
npm run dev
```

## API端点

- **基础路由**
  - `GET /` - API健康检查

- **事件相关**
  - `GET /events` - 获取所有事件
  - `POST /events` - 创建新事件
  - `POST /events/parse-natural-language` - 解析自然语言提取事件信息

- **配置相关**
  - `GET /config/llm` - 获取LLM配置
  - `POST /config/llm` - 更新LLM配置
  - `GET /config/exchange` - 获取Exchange配置 (不含密码)
  - `POST /config/exchange` - 更新Exchange配置

- **同步相关**
  - `POST /sync/exchange` - 与Exchange服务器同步日历事件

- **测试路由**
  - `POST /test` - 测试服务器连接状态 