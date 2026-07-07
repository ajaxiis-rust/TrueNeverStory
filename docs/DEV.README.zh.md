# TrueNeverStory — 开发者指南

面向贡献者和开发者的技术文档。

---

## 架构概览

TrueNeverStory 是一个多代理AI角色扮演引擎。玩家发送的消息通过14个专用AI代理的流水线处理，每个代理负责叙事的特定方面（叙述、NPC对话、场景转换、剧情规划等）。

```
玩家输入
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  意图检测                       │
│  - 移动 → SceneAgent            │
│  - 与NPC对话 → NPCAgent         │
│  - @agent提及 → 对应Agent       │
│  - 默认 → NarratorAgent         │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  代理流水线                     │
│  1. 构建上下文                  │
│  2. 生成提示词                  │
│  3. 通过队列调用LLM             │
│  4. 解析响应                    │
│  5. 更新世界状态                │
└─────────────┬───────────────────┘
              ↓
         叙事响应
```

---

## 技术栈

| 层 | 技术 |
|---|------|
| 运行时 | Bun（非Node.js） |
| Web框架 | Hono |
| 数据库 | SQLite via `bun:sqlite`（WAL模式） |
| 校验 | Zod |
| 日志 | Pino |
| LLM | OpenAI兼容API（HTTP） |
| WebSocket | `@hono/node-ws` |
| 计算内核 | C FFI（Zig编译）+ TypeScript回退 |

---

## 项目结构

```
src/
├── index.ts                    # 服务器入口 (Bun.serve)
├── app.ts                      # Hono应用 — 中间件链 + 路由挂载
│
├── config/
│   ├── env.ts                  # Zod验证的环境配置
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM HTTP客户端 (LRU缓存)
│   ├── llm-queue.ts            # 并行请求队列 (pause/resume)
│   ├── sqlite-store.ts         # SQLite (FTS5 + 向量 + 提示词 + 翻译)
│   ├── vector-ops.ts           # 余弦、L2、点积
│   ├── mojo-ffi.ts             # FFI绑定 (C/Mojo) + TS回退
│   ├── session-store.ts        # SQLite会话存储
│   ├── event-bus.ts            # Pub/Sub事件系统
│   └── providers/
│       ├── provider-manager.ts # 多提供商路由
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       └── ...
│
├── middleware/
│   ├── auth.ts                 # Cookie认证 (PBKDF2、CSRF、限流)
│   ├── rate-limiter.ts         # IP级令牌桶
│   ├── security-headers.ts     # CSP、X-Frame-Options等
│   └── error-handler.ts        # 全局错误处理
│
├── models/                     # 数据模型 (22个文件)
│   ├── entity.ts               # 核心实体 (uid, name, L1/L2/L3层)
│   ├── chat.ts                 # ChatMessageSchema, SessionSetupSchema (Zod)
│   └── ...
│
├── routes/                     # API路由 (18个模块)
│   ├── index.ts                # 路由聚合器
│   ├── chat.ts                 # POST /chat/setup, /message, /stream (SSE), /agent
│   ├── entities.ts             # GET /entity/:uid, /neighbors, /search, /graph/*
│   ├── agents.ts               # CRUD代理配置 + 按语言的提示词
│   ├── i18n.ts                 # 翻译CRUD (7种语言)
│   ├── worlds.ts               # 多世界CRUD、章节生成
│   └── system.ts               # 后台处理暂停/恢复
│
├── services/                   # 业务逻辑 (52+服务)
│   │
│   │  ── 核心 ──
│   ├── narrative-service.ts    # DI容器 — 实例化所有服务
│   ├── roleplay-engine.ts      # 主流水线 (processInput)
│   ├── story-engine.ts         # 剧情事件生成
│   ├── director-loop.ts        # 后台剧情推进
│   │
│   │  ── 代理 (14) ──
│   ├── narrator-agent.ts       # 主叙述者
│   ├── director-agent.ts       # 剧情节拍注入
│   ├── scene-agent.ts          # 场景转换
│   ├── npc-agent.ts            # NPC对话 + 反应
│   ├── researcher-agent.ts     # 事实核查、真实感验证
│   ├── historian-agent.ts      # 历史事件
│   ├── cartographer-agent.ts   # 地理、距离
│   ├── merchant-agent.ts       # 交易、定价
│   ├── quest-giver-agent.ts    # 任务生成
│   ├── lorekeeper-agent.ts     # 世界事实、魔法规则
│   ├── chronicler.ts           # 时间线管理
│   ├── villain-manager.ts      # 反派行为
│   ├── social-simulator.ts     # NPC社交动态
│   │
│   │  ── 世界系统 ──
│   ├── story-planner.ts        # LLM驱动的弧线规划
│   ├── world-builder.ts        # 实体创建
│   ├── world-clock.ts          # 世界内时间
│   ├── world-evolver.ts        # 自动添加NPC/地点/物品
│   ├── birth.ts                # 角色创建向导
│   │
│   │  ── NPC系统 ──
│   ├── npc-runtime.ts          # NPC状态管理
│   ├── npc-generator.ts        # 智能NPC创建
│   ├── npc-economy.ts          # 封建经济
│   ├── memory-engine.ts        # 情景记忆
│   ├── behavior-engine.ts      # 自主行为
│   ├── dialogue-manager.ts     # 对话会话
│   ├── social-graph.ts         # 关系、派系、联盟
│   │
│   │  ── 游戏机制 ──
│   ├── probability-engine.ts   # 确定性结果
│   ├── probability-expression.ts # 安全数学求值 (递归下降)
│   ├── romance-engine.ts       # 浪漫关系
│   ├── quest-system.ts         # 任务生命周期
│   ├── inventory-manager.ts    # 物品、装备、交易
│   ├── navigator.ts            # 图路径查找 (BFS)
│   │
│   │  ── 基础设施 ──
│   ├── agent-config.ts         # 代理配置 (SQLite-first + JSON)
│   ├── prompt-builder.ts       # 提示词构建
│   ├── model-manager.ts        # 模型目录
│   ├── settings.ts             # 设置持久化
│   └── websocket-manager.ts    # WebSocket连接池
│
├── intelligence/               # 图智能
│   ├── graph-analyzer.ts       # 图统计
│   ├── graph-validator.ts      # 自修复图修复
│   └── pipeline.ts             # 智能流水线编排
│
├── memory/                     # 记忆子系统
│   ├── world-memory.ts         # 主记忆类
│   ├── cognitive-pipeline.ts   # 实体提取 → 矛盾检测 → Pain Signals
│   ├── entity-extractor.ts     # 从文本提取实体
│   └── write-buffer.ts         # 批量写入缓冲
│
├── i18n/                       # 国际化 (7种语言)
│   ├── types.ts                # LanguagePack接口
│   ├── index.ts                # 注册表、getLanguagePack()
│   └── [en|ru|de|fr|es|ja|zh].ts
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1)访问 + NameIndex
│
└── utils/
    ├── sanitize.ts             # 提示词注入防御
    └── template-resolver.ts    # 模板{variable}解析

mojo/kernels/                   # C FFI计算内核
├── c/
│   ├── probability_ffi.c       # 成功率、掷骰、批量
│   ├── vector_ffi.c            # 4维向量运算
│   ├── vector_full.c           # 768维批量余弦 (BGE-M3)
│   ├── batch_ops.c             # 批量NPC运算
│   └── graph_ops.c             # 图遍历、RRF、声望
└── build.sh                    # Zig交叉编译

public/                         # 前端 (静态HTML)
├── index.html                  # 主聊天/角色扮演UI
├── agents.html                 # 代理配置 (i18n)
├── graph.html                  # 知识图谱可视化 (D3.js)
├── settings.html               # 全局设置 (i18n)
└── worlds.html                 # 世界管理 + 角色创建
```

---

## DI容器 — NarrativeService

`NarrativeService`是中央DI容器。实例化所有30+服务并连接它们的依赖。

**生命周期:**
1. `new NarrativeService({dbPath, worldFrame})` — 连接一切
2. `start()` — 启动LLM队列、同步实体、自动构建启发式关系（若实体存在但无连接）、启动director
3. `stop()` — 停止director + LLM
4. `pause()` / `resume()` — 用户离开聊天时
5. `reset(newDbPath, worldFrame)` — 热切换到另一个世界
6. `shutdown()` — 干净关闭

---

## 请求生命周期

### REST API (POST /api/chat/message)

```
1. Hono中间件链:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. 路由处理器 (chat.ts):
   - Zod校验
   - sanitizeInput() — 去除提示词注入模式
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - 意图检测
   - 路由到适当的代理
   - 构建上下文
   - 生成提示词
   - 通过队列调用LLM
   - 解析响应
   - 更新世界状态

4. 响应: JSON { narrative, location, story_time, ... }
```

---

## 代理系统

每个代理是一个带有`generateResponse()`方法的类。

### 代理优先级 (越高 = 越先处理)

| 优先级 | 代理 |
|--------|------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

---

## 数据层

### EntityStore (JSON)
- 通过UID的O(1)访问 (`Map<string, EntityNode>`)
- 通过NameIndex的O(1)名称查找

### SQLiteStore
表: `entities` (FTS5), `embeddings` (向量), `memories`, `agent_prompts`, `ui_translations`

混合搜索: FTS5 + 密集向量 + Reciprocal Rank Fusion。

### FFI内核
5个C内核 (Zig编译): probability_ffi, vector_ffi, vector_full, batch_ops, graph_ops。

---

## 配置

### 环境变量 (.env)

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `WORLD_LLM_BASE_URL` | – | OpenAI兼容端点 |
| `WORLD_LLM_API_KEY` | – | API密钥 |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `WORLD_LLM_TIMEOUT` | `300` | 请求超时（秒） |
| `WORLD_SERVER_HOST` | `127.0.0.1` | 监听地址 |
| `WORLD_SERVER_PORT` | `8000` | 监听端口 |
| `AUTH_PASSWORD` | – | 登录密码 |

---

## 中间件链

```
1. errorHandler     — 全局错误处理器
2. requestLogger    — Pino请求日志
3. rateLimiter      — 每IP 100请求/分钟
4. securityHeaders  — CSP、X-Frame-Options等
5. CORS             — localhost:8000源
6. authMiddleware   — 会话Cookie验证
```

---

## 测试

```bash
bun test                              # 所有测试
bun test tests/entity-store.test.ts   # 实体存储测试
bun test tests/probability-engine.test.ts  # 概率测试
```

---

## 添加新代理

1. 创建 `src/services/my-agent.ts`
2. 在 `roleplay-engine.ts` 中注册
3. 在 `processInput()` 中添加路由逻辑
4. 在 `agent-config.ts` 或SQLite中添加系统提示词

---

## 关键模式

- **双写**: 设置同时写入SQLite + JSON
- **模板解析**: 提示词使用 `{variable}` 占位符
- **安全eval**: 公式通过递归下降求值（不用eval）
- **提示词注入防御**: LLM前调用 `sanitizeInput()`
- **原子JSON写入**: 临时文件 + rename
- **语言指令注入**: `getLanguageInstruction()` 向代理提示词添加语言指令，使LLM响应与界面语言匹配
