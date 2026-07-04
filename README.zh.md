# TrueNeverStory v0.15.0

### 玩着写你的书。

TrueNeverStory 是一个AI驱动的互动叙事引擎。每个NPC都有记忆，每个行动都有概率，故事永不停歇。扮演一个角色，探索一个活生生的世界，看着你的选择塑造叙事——或者让世界自行发展。

基于 TypeScript (Bun + Hono) 构建，使用 C FFI 内核处理高性能计算。

---

## 功能特性

| 功能 | 描述 |
|------|------|
| **活生生的世界** | 角色、地点、物品、派系——全部通过知识图谱 O(1) 连接 |
| **14个AI代理** | 叙述者、导演、NPC、场景、编年史、规划师、反派、研究员、历史学家、地图师、商人、任务给予者、知识守护者、社交模拟 |
| **记忆与RAG** | 向量搜索 (BGE-M3 + SQLite 混合 FTS5/密集/RRF) |
| **概率系统** | 战斗、说服、潜行、浪漫的确定性结果 |
| **浪漫与社交** | 关系管理、派系、联盟、封建等级、NPC对话 |
| **任务系统** | 动态任务生成、目标、奖励、链条、时间限制 |
| **物品与交易** | 稀有度、属性、装备、金币、NPC交易 |
| **NPC经济** | 封建等级（10级）、税收、食物生产、家族系统、34个原型 |
| **实时流式传输** | WebSocket + SSE 实时叙事推送 |
| **i18n (7种语言)** | EN, RU, DE, FR, ES, JA, ZH |
| **密码认证** | HttpOnly cookie会话、CSRF保护 |
| **SQLite存储** | 实体、嵌入、记忆、提示词、翻译 |

---

## 支持的平台

| 平台 | 状态 | 备注 |
|------|:----:|------|
| Linux x86_64 | ✅ | 完全支持，FFI内核 |
| Linux ARM64 | ✅ | 完全支持，FFI内核 |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## 快速开始

**无需安装 Bun、Node.js 或任何运行时。** 下载即用。

### 1. 下载

从 [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest) 下载最新版本：

| 平台 | 文件 |
|------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. 运行

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. 打开

访问 **http://localhost:8000** — 密码：**`changeme`**

首次登录后请在设置中更改密码。

就这样。无需数据库设置、无需安装包、无需编辑配置文件。

---

## 配置 LLM

打开 **设置** 页面或编辑 `.env`：

### Ollama（本地，免费）

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

同样支持 vLLM、Anthropic、Google 和所有 OpenAI 兼容 API。

---

## 项目结构

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod 验证的环境配置
│   ├── lib/              # LLM 客户端、SQLite 存储、向量操作
│   ├── memory/           # WorldMemory、认知管道
│   ├── middleware/        # 认证、限流、安全头
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # API 路由 (chat, entities, agents, settings)
│   ├── services/         # 52个服务（角色扮演引擎、代理、经济系统）
│   ├── intelligence/     # 图分析、重复检测
│   ├── i18n/             # 语言包（7种语言）
│   ├── store/            # O(1) 索引的 EntityStore
│   └── utils/            # 日志、哈希、清理、模板
├── mojo/kernels/         # C FFI 计算内核（Zig 编译）
├── public/               # Web UI（终端风格界面）
├── worlds/               # 世界数据（SQLite 数据库、实体、会话）
├── conf/                 # 配置
└── tests/                # 测试套件
```

---

## API

### 认证

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/login` | 登录页面 |
| POST | `/login` | 认证 |
| POST | `/logout` | 清除会话 |

### 聊天与角色扮演

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/chat/setup` | 初始化会话 |
| POST | `/api/chat/message` | 发送消息 |
| POST | `/api/chat/stream` | SSE 流式传输 |
| GET | `/api/chat/session` | 当前会话状态 |
| GET | `/api/chat/history` | 对话历史 |

### 实体与图谱

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/entity/:uid` | 实体详情 |
| GET | `/api/neighbors/:uid` | 邻居节点 |
| GET | `/api/search?q=` | 按名称或语义搜索 |
| GET | `/api/graph/summary` | 图谱统计 |

### 代理与 i18n

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/agents` | 代理配置列表 |
| PUT | `/api/agents/:id` | 更新代理 |
| PUT | `/api/agents/:id/prompts/:lang` | 按语言设置提示词 |
| GET | `/api/i18n/translations/:lang/:page` | 获取翻译 |

### WebSocket

| 端点 | 描述 |
|------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | 实时角色扮演流式传输 |

---

## 示例

```bash
# 登录
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# 设置会话
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# 发送消息
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "我拔出剑，面对巨龙"}'
```

---

## 开发者指南

完整架构文档、DI容器参考和贡献指南：[DEV.README.zh.md](DEV.README.zh.md)

### 前提条件

- [Bun](https://bun.sh) v1.0+

### 安装

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### 命令

| 命令 | 描述 |
|------|------|
| `bun run dev` | 开发模式（热重载） |
| `bun run start` | 生产模式 |
| `bun run lint` | 类型检查 |
| `bun test` | 运行测试 |
| `bun run build` | 构建包 |

---

## 编译二进制文件

通过 Zig 进行跨平台编译：

```bash
cd mojo/kernels
./build.sh native           # 当前平台
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # 所有目标平台
```

详见 [COMPILE.md](COMPILE.md)。GitHub Actions 在推送标签时自动构建所有平台。

---

## 近期更新

### v0.15.0 — 安全加固

- SQLite 会话存储（重启后保留）
- WebSocket 令牌验证
- 路径遍历保护
- 登录表单 CSRF 保护
- Secure Cookie 标志、强化 CSP
- 错误消息清理

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — C FFI 内核与交叉编译

- 5个计算内核从 Mojo 移植到纯 C
- Zig 交叉编译支持 10 个平台
- 后台处理暂停/恢复

---

## 许可证

Apache 2.0
