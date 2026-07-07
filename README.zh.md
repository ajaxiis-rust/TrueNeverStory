# TrueNeverStory v0.20.4

### 玩着写你的书。

TrueNeverStory 是一个AI驱动的互动叙事引擎。每个NPC都有记忆，每个行动都有概率，故事永不停歇。扮演一个角色，探索一个活生生的世界，看着你的选择塑造叙事——或者让世界自行发展。

基于 TypeScript (Bun + Hono) 构建，使用 C FFI 内核处理高性能计算。

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md)**

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
| **规则引擎** | 14个预定义社会/经济系统（封建制、民主制、无政府状态等）与协同矩阵 |
| **多世界** | 带资源监控（内存、CPU、令牌）的隔离世界执行 |
| **跨世界** | 通过门户和共享内存进行世界间事件通信 |
| **插件系统** | 可扩展架构，包含插件管理器、生命周期钩子和API |
| **功能标志** | A/B测试、渐进式发布、百分比定向 |
| **API版本控制** | v1/v2端点，带弃用头 |
| **实时流式传输** | WebSocket + SSE 实时叙事推送 |
| **i18n (7种语言)** | EN, RU, DE, FR, ES, JA, ZH |
| **密码认证** | HttpOnly cookie会话、CSRF保护、SQLite备份会话 |
| **SQLite存储** | 实体、嵌入、记忆、提示词、翻译 |
| **断路器** | LLM提供商自动故障转移与备用链 |
| **结构化日志** | Trace ID、关联ID、多代理工作流调试指标 |

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

**不需要Bun、Node.js或其他运行时。** 只需下载并运行。

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

**http://localhost:8000** — 密码: **`changeme``**

首次登录后请在设置中修改密码。

---

## 配置LLM

打开**设置**页面或编辑`.env`：

### Ollama (本地，免费)

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

也支持vLLM、Anthropic、Google和任何OpenAI兼容API。

---

## 项目结构

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod验证的环境配置
│   ├── lib/              # LLM客户端、SQLite存储、向量运算、断路器、功能标志
│   ├── memory/           # WorldMemory、认知管道
│   ├── middleware/        # 认证、限流器、安全头、日志器
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # 插件接口和管理器
│   ├── routes/           # API路由 (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # 规则引擎 (14条规则、协同矩阵、技术依赖)
│   ├── services/         # 55+服务 (角色扮演引擎、代理、经济、世界隔离、跨世界总线)
│   ├── intelligence/     # 图分析、重复检测
│   ├── i18n/             # 语言包 (7种语言)
│   ├── store/            # EntityStore (O(1) NameIndex)、WorldStore
│   └── utils/            # 日志器、哈希、清理器、模板解析器
├── mojo/kernels/         # C FFI内核 (通过Zig编译)
├── public/               # Web界面 (终端风格)
├── worlds/               # 世界数据 (SQLite数据库、实体、会话)
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
| POST | `/logout` | 登出 |

### 聊天与角色扮演

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/chat/setup` | 初始化会话 |
| POST | `/api/chat/message` | 发送消息 |
| POST | `/api/chat/stream` | SSE流式传输 |
| GET | `/api/chat/session` | 会话状态 |
| GET | `/api/chat/history` | 对话历史 |

### 实体与图

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/entity/:uid` | 实体详情 |
| GET | `/api/neighbors/:uid` | 邻居遍历 |
| GET | `/api/search?q=` | 搜索 |
| GET | `/api/graph/summary` | 图统计 |

### 代理与i18n

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/agents` | 代理配置 |
| PUT | `/api/agents/:id` | 更新代理 |
| PUT | `/api/agents/:id/prompts/:lang` | 语言提示词 |
| GET | `/api/i18n/translations/:lang/:page` | 翻译 |

### 规则引擎

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/rules` | 可用规则 |
| GET | `/api/rules/:id` | 规则详情 |
| POST | `/api/rules/validate` | 验证规则JSON |

### 跨世界

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/cross-world/status` | 跨世界状态 |
| POST | `/api/cross-world/enable` | 启用 |
| POST | `/api/cross-world/disable` | 禁用 |
| GET | `/api/cross-world/portals` | 列出门户 |
| POST | `/api/cross-world/portals` | 创建门户 |
| DELETE | `/api/cross-world/portals/:id` | 删除门户 |
| GET | `/api/cross-world/events` | 事件日志 |

### 插件

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/plugins` | 已注册插件 |
| GET | `/api/plugins/:id` | 插件详情 |
| GET | `/api/plugins/:id/capabilities` | 插件能力 |

### 功能标志

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/feature-flags` | 功能标志 |
| PUT | `/api/feature-flags/:id` | 更新标志 |

### WebSocket

| 端点 | 描述 |
|------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | 实时角色扮演流式传输 |

---

## 示例

### API

```bash
# 登录
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# 初始化会话
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# 发送消息
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "我拔出剑面对巨龙"}'

# 可用规则
curl -b cookies.txt "http://localhost:8000/api/rules"

# 创建跨世界门户
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

---

## 开发者

完整文档：[DEV.README.zh.md](docs/DEV.README.zh.md)

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
| `bun run dev` | 开发热重载 |
| `bun run start` | 生产模式 |
| `bun run lint` | 类型检查 |
| `bun test` | 运行测试 |
| `bun run build` | 构建 |

---

## 最近更改

### v0.20.4 — 世界图修复 + 统计弹窗 + 语言注入 + 主题系统

- 修复死代码`buildRelationships()` — 启动时自动构建启发式关系
- 新增`GET /worlds/:name/detail`端点用于世界统计
- 新统计弹窗，包含实体列表、规则和角色详情
- 语言指令注入 — LLM响应与界面语言匹配（7种语言）
- 主题系统 — 5个内置主题（暗色、亮色、终端、赛博朋克、自定义）+ 构造器

### v0.20.1 — 规则引擎二进制文件修复

- 修复编译后的Bun二进制文件中`/api/rules`端点崩溃问题
- 将`import.meta.dir`改为`process.cwd()`用于规则目录路径解析
- 解决编译后二进制文件中的ENOENT错误（`/$bunfs/root/../rules/social`）
- 影响文件: `src/routes/rules.ts` 和 `src/rules/rules-engine.ts`

### v0.20.0 — 架构改进

5个阶段的完整架构重构：

**阶段1-2:**
- NarrativeService拆分 (Bootstrapper + Facade + Service)
- 统一代理模型 (接口 + 基类)
- Event Sourcing (领域事件 + 快照)
- Circuit Breaker (LLM自动故障转移)
- 代理注册表 (4种源类型)
- 结构化日志 (Trace ID + 关联ID)

**阶段3:**
- 规则引擎 — 14个预定义系统
- 协同矩阵、技术依赖、幸福度修饰符
- 规则验证器、文化漂移建模
- 功能标志 (A/B测试 + 渐进式发布)
- API版本控制 (v1/v2)
- WorldStore — SQLite迁移

**阶段4:**
- 多世界隔离 (资源监控)
- 跨世界通信 (门户 + 事件)
- 插件系统 (管理器 + 生命周期钩子)

**阶段5:**
- 文档更新

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — 安全加固

- SQLite会话
- WebSocket令牌验证
- 路径遍历保护
- CSRF保护
- Secure cookie、CSP强化

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## 许可证

---

🔗 **项目:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
