# TrueNeverStory — 开发者指南

面向贡献者和开发者的技术文档。

---

## 架构概览

TrueNeverStory 是一个采用状态优先（State-First）架构的多代理 AI 角色扮演引擎。玩家发送的消息会经过一个确定性流水线处理：意图解析、模拟、状态变更、上下文构建，以及专业化代理渲染。

```
玩家输入
    ↓
意图解析器 → 模拟引擎 → 状态变更器 → 上下文构建器
    ↓
Dramaturg（MCP）→ Stylist（MCP）→ Censor → 翻译服务
    ↓
叙事响应
```

---

## 技术栈

| 层 | 技术 |
|-------|-----------|
| 运行时 | Bun（非 Node.js） |
| Web 框架 | Hono |
| 数据库 | 通过 `bun:sqlite` 的 SQLite（WAL 模式） |
| 校验 | Zod |
| 日志 | Pino |
| LLM | OpenAI 兼容 API（通过 HTTP） |
| WebSocket | `@hono/node-ws` |
| 计算内核 | C FFI（通过 Zig 编译）+ TypeScript 回退 |

---

## 项目结构

```
src/
├── index.ts                    # 服务器入口点 (Bun.serve)
├── app.ts                      # Hono 应用 — 中间件链 + 路由挂载
│
├── config/
│   ├── env.ts                  # 经 Zod 校验的环境配置 (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM HTTP 客户端（带 LRU 缓存）
│   ├── llm-queue.ts            # 带暂停/恢复的并发请求队列
│   ├── llm-types.ts            # LLM 类型定义
│   ├── sqlite-store.ts         # SQLite（FTS5 + 向量 + 代理提示词 + 翻译）
│   ├── vector-ops.ts           # 余弦、L2、点积
│   ├── mojo-ffi.ts             # FFI 绑定（C/Mojo）+ TS 回退
│   ├── session-store.ts        # 基于 SQLite 的会话存储
│   ├── event-bus.ts            # 发布/订阅事件系统
│   ├── history-manager.ts      # 对话历史持久化
│   ├── atomic-io.ts            # 安全 JSON 读写（原子重命名）
│   └── providers/
│       ├── index.ts            # 提供商注册表
│       ├── llm-provider.ts     # 抽象提供商接口
│       ├── provider-manager.ts # 多提供商路由
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # 基于 Cookie 的认证（PBKDF2、CSRF、限流）
│   ├── rate-limiter.ts         # 每 IP 令牌桶
│   ├── security-headers.ts     # CSP、X-Frame-Options 等
│   ├── error-handler.ts        # 全局错误处理器
│   └── logger.ts               # 请求日志
│
├── models/                     # 数据模型（25 个文件）
│   ├── entity.ts               # 核心实体（uid、name、带 L1/L2/L3 层的 profile）
│   ├── chat.ts                 # ChatMessageSchema、SessionSetupSchema（Zod）
│   ├── director.ts             # DirectorTask、TaskPriority
│   ├── intent.ts               # Intent、IntentType
│   ├── simulation.ts           # SimulationResult、SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile、Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest、Objective、Reward
│   ├── item.ts                 # Item、ItemBoost
│   ├── rank.ts                 # 封建等级体系（10 个等级）
│   ├── archetype.ts            # 34 种 NPC 原型
│   ├── npc-state.ts            # NPC 运行时状态
│   └── npc-stats.ts            # NPCStats、Vices、FamilyExpenses
│
├── routes/                     # API 路由（18 个模块）
│   ├── index.ts                # 路由聚合器 — 将所有模块挂载到 /api 下
│   ├── chat.ts                 # POST /chat/setup、/message、/stream（SSE）、/agent
│   ├── entities.ts             # GET /entity/:uid、/neighbors、/path、/search、/graph/*
│   ├── agents.ts               # 代理配置 CRUD + 按语言的提示词
│   ├── i18n.ts                 # 翻译 CRUD（7 种语言）
│   ├── settings.ts             # GET/PUT 设置、LLM 服务器管理
│   ├── worlds.ts               # 多世界 CRUD、切换、章节生成
│   ├── memory.ts               # 记忆端点
│   ├── branches.ts             # 故事分支管理
│   ├── probability.ts          # 概率查询
│   ├── romance.ts              # 浪漫系统端点
│   ├── quests.ts               # 任务端点
│   ├── sessions.ts             # 会话历史
│   ├── maintenance.ts          # 图维护
│   ├── launch.ts               # 新游戏 / 继续
│   ├── health.ts               # 健康检查
│   ├── models.ts               # 模型目录
│   ├── providers.ts            # LLM 提供商管理
│   └── system.ts               # 后台处理暂停/恢复
│
├── services/                   # 业务逻辑（60+ 服务）
│   │
│   │  ── 核心引擎 ──
│   ├── narrative-service.ts    # DI 容器 — 实例化所有服务
│   ├── roleplay-engine.ts      # 主处理流水线 (processInput)
│   ├── story-engine.ts         # 故事事件生成
│   ├── director-loop.ts        # 后台故事推进 (setInterval)
│   ├── agent-coordinator.ts    # 面向 director 的优先级任务队列
│   │
│   │  ── 代理（Big Six）──
│   ├── agents/
│   │   ├── dramaturg.ts       # 叙事模式选择（MCP）
│   │   ├── validator.ts       # 通过维基百科核查事实（MCP）
│   │   ├── stylist.ts         # 散文渲染（MCP）
│   │   ├── actor.ts           # NPC 对话 + 互动
│   │   ├── censor.ts          # AI 陈词滥调移除
│   │   └── chronicler.ts      # 时间线 + 记忆更新
│   ├── agent-registry-v2.ts   # 代理注册 + 查找
│   └── agent-v2.ts            # AgentV2 接口 + 基类
│
│   │  ── 状态流水线 ──
│   ├── intent-parser.ts       # 用户意图分类
│   ├── simulation-engine.ts   # 确定性世界模拟
│   ├── state-mutator.ts       # 世界状态更新
│   ├── context-builder.ts     # 提示词上下文组装
│   ├── heartbeat.ts           # 后台世界心跳
│   └── translation-service.ts # 多语言响应翻译
│   │
│   │  ── 世界系统 ──
│   ├── story-planner.ts        # LLM 驱动的弧线规划
│   ├── story-arc-manager.ts    # 弧线生命周期
│   ├── branch-manager.ts       # 故事分支
│   ├── world-builder.ts        # 世界实体创建
│   ├── world-clock.ts          # 世界内时间
│   ├── world-evolver.ts        # 自动添加 NPC/地点/物品
│   ├── world-manager.ts        # 多世界 CRUD
│   ├── world-validator.ts      # 世界框架校验
│   ├── birth.ts                # 角色创建向导
│   ├── start-resolver.ts       # 游戏开始解析
│   │
│   │  ── NPC 系统 ──
│   ├── npc-runtime.ts          # NPC 状态管理
│   ├── npc-generator.ts        # 智能 NPC 创建
│   ├── npc-economy.ts          # 封建经济核心
│   ├── npc-economy-runtime.ts  # 回合制模拟
│   ├── slave-economy.ts        # 奴隶贸易机制
│   ├── memory-engine.ts        # NPC 情景记忆
│   ├── memory-manager.ts       # 记忆搜索 + 上下文
│   ├── behavior-engine.ts      # 自主 NPC 行为
│   ├── dialogue-manager.ts     # NPC 对话会话
│   ├── dialogue-context.ts     # 增强的 NPC 提示词
│   ├── social-graph.ts         # 关系、派系、联盟
│   │
│   │  ── 游戏机制 ──
│   ├── probability-engine.ts   # 确定性结果
│   ├── probability-profiles.ts # 档案定义
│   ├── probability-expression.ts # 安全数学求值器（递归下降）
│   ├── probability-resolver.ts # 上下文解析
│   ├── romance-engine.ts       # 浪漫关系
│   ├── romance-profiles.ts     # 浪漫动作定义
│   ├── quest-system.ts         # 任务生命周期、目标、链
│   ├── quest-manager.ts        # 任务持久化
│   ├── inventory-manager.ts    # 物品、装备、交易
│   ├── item-evaluation.ts      # 物品唯一性 + 加成评估
│   ├── navigator.ts            # 图路径查找（BFS）
│   │
│   │  ── 基础设施 ──
│   ├── agent-config.ts         # 代理配置（SQLite 优先 + JSON 回退）
│   ├── prompt-builder.ts       # 提示词构建
│   ├── model-manager.ts        # 模型目录 + 下载
│   ├── settings.ts             # 设置持久化
│   └── websocket-manager.ts    # WebSocket 连接池
│
├── intelligence/               # 图智能
│   ├── graph-analyzer.ts       # 图统计
│   ├── graph-validator.ts      # 自愈图修复
│   ├── duplicate-detector.ts   # 实体去重
│   ├── recommender.ts          # 关系建议
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # 世界规则校验
│   ├── scene-generator.ts      # 场景描述
│   ├── subgraph-expander.ts    # 上下文扩展
│   └── pipeline.ts             # 智能流水线编排
│
├── memory/                     # 记忆子系统
│   ├── world-memory.ts         # 主记忆类
│   ├── cognitive-pipeline.ts   # 实体提取 → 矛盾检测 → 痛点信号
│   ├── entity-extractor.ts     # 从文本提取实体
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # 重要时刻检测
│   ├── scoring.ts              # 记忆重要性评分
│   ├── clustering.ts           # 记忆聚类
│   ├── partition.ts            # 记忆分区
│   ├── faiss-index.ts          # 向量索引（FAISS 兼容）
│   ├── embedding-queue.ts      # 异步嵌入生成
│   ├── optimizer.ts            # 记忆优化
│   └── write-buffer.ts         # 批量写入缓冲
│
├── mcp/                        # MCP 服务器 — 圣经/古腾堡解析器、维基百科工具
│
├── i18n/                       # 国际化（7 种语言）
│   ├── types.ts                # LanguagePack 接口
│   ├── index.ts                # 注册表、getLanguagePack()、setLanguage()
│   ├── en.ts                   # 英语（基础）
│   ├── ru.ts                   # 俄语
│   ├── de.ts                   # 德语
│   ├── fr.ts                   # 法语
│   ├── es.ts                   # 西班牙语
│   ├── ja.ts                   # 日语
│   └── zh.ts                   # 中文
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1) 访问 + NameIndex
│
└── utils/
    ├── logger.ts               # Pino 日志器
    ├── hash.ts                 # SHA-256 工具
    ├── time.ts                 # 时间格式化
    ├── sanitize.ts             # 提示词注入防御
    └── template-resolver.ts    # 代理模板 {variable} 解析

mojo/
├── kernels/                    # C FFI 计算内核
│   ├── c/
│   │   ├── probability_ffi.c   # 成功率、掷骰、批量概率
│   │   ├── vector_ffi.c        # 4 维向量运算（余弦、L2、点积）
│   │   ├── vector_full.c       # 768 维批量余弦（BGE-M3）
│   │   ├── batch_ops.c         # 批量 NPC 运算（年龄衰减、恶习、税收）
│   │   └── graph_ops.c         # 图遍历、RRF、声望
│   ├── build.sh                # 通过 Zig 交叉编译
│   └── dist/                   # 编译后的 .so/.dylib/.dll
└── src/                        # 81 个 Mojo 源文件（可选性能后端）

public/                         # 前端（静态 HTML）
├── index.html                  # 主聊天/角色扮演 UI
├── agents.html                 # 代理配置（i18n）
├── graph.html                  # 知识图谱查看器（D3.js）
├── models.html                 # 模型管理
├── providers.html              # LLM 提供商设置
├── settings.html               # 全局设置（i18n）
├── worlds.html                 # 世界管理 + 出生向导
└── static/
    ├── fonts/                  # 自定义字体
    └── vendor/                 # d3.v7.min.js、purify.min.js

conf/                           # 运行时配置（已 gitignore）
├── settings.json               # 应用设置（LLM、认证、服务器）
├── agents.json                 # 全局代理模型分配
├── providers.json              # 提供商注册表
└── llm-config.json             # LLM 提供商配置

worlds/                         # 世界数据（已 gitignore）
└── default/
    ├── tns.db                  # SQLite（实体、嵌入、记忆、提示词、翻译）
    ├── entities.json           # 实体图（JSON）
    ├── world_frame.json        # 世界定义
    ├── session_history/        # 每会话对话日志
    ├── chapters/               # 生成的文学章节
    ├── npc_profiles/           # NPC 状态文件
    ├── timeline.jsonl          # 事件时间线
    ├── story_planner.json      # 故事规划器状态
    ├── villains.json           # 反派状态
    └── world_clock.json        # 世界内时间

worlds/_sessions/
    └── sessions.db             # SQLite 会话存储
```

---

## 依赖注入 — NarrativeService

`NarrativeService`（`src/services/narrative-service.ts`）是中央 DI 容器。它实例化所有 30+ 服务并连接它们的依赖。

```
NarrativeService
├── entityStore (UnifiedEntityStore) — O(1) 实体访问
├── graphStore (GraphStore) — 邻接表 + 路径查找
├── eventBus (EventBus) — 发布/订阅事件
├── historyMgr (HistoryManager) — 对话持久化
├── llm (LLMClient) — LLM API 的 HTTP 客户端
├── llmQueue (LLMQueue) — 并发请求队列（最多 3）
├── sqliteStore (SQLiteStore) — FTS5 + 向量 + agent_prompts + 翻译
├── chronicler (Chronicler) — timeline.jsonl 写入器
├── validator (WorldValidator) — 世界框架校验
├── questMgr (QuestManager) — 任务持久化
├── clock (WorldClock) — 世界内时间
├── probEngine (ProbabilityEngine) — 确定性结果
├── probResolver (ProbabilityContextResolver) — 概率上下文
├── storyPlanner (StoryPlanner) — LLM 驱动的弧线规划
├── villainManager (VillainManager) — 反派行为
├── socialSim (SocialSimulator) — NPC 社交动态
├── npcRuntime (NPCRuntime) — NPC 状态管理
├── storyEngine (StoryEngine) — 故事事件生成
├── director (DirectorLoop) — 后台故事推进
├── worldBuilder (WorldBuilder) — 实体创建
├── agentCoordinator (AgentCoordinator) — 优先级任务队列
├── storyArcManager (StoryArcManager) — 弧线生命周期
├── userAgent (UserAgent) — 队伍 + 战斗
├── npcGenerator (NPCGenerator) — 智能 NPC 创建
├── worldEvolver (WorldEvolver) — 自动世界扩展
├── graphValidator (GraphValidator) — 自愈图
├── intentParser (IntentParser) — 用户意图分类
├── simEngine (SimulationEngine) — 确定性世界模拟
├── stateMutator (StateMutator) — 世界状态更新
├── contextBuilder (ContextBuilder) — 提示词上下文组装
├── heartbeatService (HeartbeatService) — 后台世界心跳
├── tnsServer (TNSServer) — MCP 服务器（圣经/古腾堡/维基百科）
├── translationService (TranslationService) — 多语言翻译
└── agentRegistry (AgentRegistryV2) — 代理注册 + 查找
```

**生命周期：**
1. `new NarrativeService({dbPath, worldFrame})` — 构造函数连接一切
2. `start()` — 启动 LLM 队列、将实体同步到 SQLite、自动构建启发式关系（若实体存在但没有连接）、启动 director 循环
3. `stop()` — 停止 director + LLM 队列
4. `pause()` / `resume()` — 用于用户离开聊天视图时
5. `reset(newDbPath, worldFrame)` — 热切换到另一个世界
6. `shutdown()` — 干净关闭

---

## 请求生命周期

### REST API (POST /api/chat/message)

```
1. Hono 中间件链：
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. 路由处理器 (chat.ts)：
   - Zod 校验（ChatMessageSchema）
   - sanitizeInput() — 去除提示词注入模式
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput()：
   - 意图解析器 → 分类用户意图
   - 模拟引擎 → 确定性世界模拟
   - 状态变更器 → 更新世界状态
   - 上下文构建器 → 组装提示词上下文
   - Dramaturg（MCP）→ 选择叙事模式
   - Stylist（MCP）→ 渲染散文
   - Censor → 移除 AI 陈词滥调
   - 翻译服务 → 多语言响应
   - 返回叙事字符串

4. 响应：JSON { narrative, location, story_time, ... }
```

### SSE 流式传输 (POST /api/chat/stream)

与 REST 相同，但将 `engine.processInputStream()` 包装在一个带保活 ping 的 `ReadableStream` 中。

### WebSocket (ws://host/ws/...)

```
1. 升级：检查会话 Cookie（bring_session）
2. 收到消息：JSON 解析 → 路由到引擎
3. 响应时：JSON 序列化 → ws.send()
```

---

## 代理系统

每个代理都实现 `AgentV2` 接口，带有一个 `process()` 方法，接收意图、模拟结果和游戏上下文。

### The Big Six

| 代理 | 角色 | MCP 工具 |
|-------|------|-----------|
| Dramaturg | 叙事模式选择 | search_verses, get_pattern, get_archetype |
| Validator | 通过维基百科核查事实 | verify_fact, get_context |
| Stylist | 散文渲染 | get_style_pattern, apply_style |
| Actor | NPC 对话 + 互动 | — |
| Censor | AI 陈词滥调移除 | — |
| Chronicler | 时间线 + 记忆更新 | — |

### AgentV2 接口

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**注意：** 遗留的 14 代理系统已被弃用，但为向后兼容仍可运行。旧的代理 ID（`@narrator`、`@director` 等）会在内部路由到新代理。

### 提示词解析

代理提示词按以下顺序解析：
1. SQLite `agent_prompts` 表（按世界 + 语言）
2. JSON 回退（`worlds/{world}/agents/{agentId}.json`）
3. 硬编码默认值（`agent-config.ts` 中的 `DEFAULT_PROMPTS`）

模板使用 `{variable}` 占位符，由 `resolveTemplate()` 解析。

---

## MCP 集成 (v0.32.5)

TNSServer（`src/mcp/tns-server.ts`）为外部数据访问提供 MCP 工具。

| 工具 | 来源 | 描述 |
|------|--------|-------------|
| search_verses | 圣经 | 按文本、书卷或引用搜索经文 |
| get_pattern | 圣经 | 按原型、情绪或功能获取叙事模式 |
| get_archetype | 圣经 | 按名称获取原型详情 |
| get_style_pattern | 古腾堡 | 按情绪、标签或描述搜索风格 |
| apply_style | 古腾堡 | 将风格应用于文本（去词汇化并返回建议） |
| verify_fact | 维基百科 | 核实一条事实性断言 |
| get_context | 维基百科 | 获取某个主题的维基百科上下文 |
| get_economic_phase | 经济数据库 | 当前经济周期阶段 |
| calculate_price | 经济数据库 | 带阶段修正的价格 |
| generate_dilemma | 经济数据库 | 派系税收困境 |
| check_jubilee | 经济数据库 | Jubilee 周期检查 |

### MCP 控制台 (v0.32.5)

面向所有项目数据库的基于 Web 的数据库管理控制台。

**启动：** `./startgame.sh --mcp`（仅在 8000 端口启动数据库管理服务器，不启动游戏）

**Web UI：** `http://localhost:8000` — 标签页包括 Bible、Gutenberg、Wikipedia、LiteraryCompiler、Economics、System

**API：** 所有端点位于 `/mcp/*` 下 — 完整列表见 `src/routes/mcp.ts`。SSE 进度位于 `/mcp/stream/:jobId`。

**选择性古腾堡下载：** 基于目录的下载，带类型/作者过滤。基于 TypeScript 的下载脚本，带 SSE 进度跟踪。

---

## 数据层

### EntityStore (JSON)

- `entities.json` — 所有实体的邻接表
- 通过 `Map<string, EntityNode>` 按 UID 进行 O(1) 访问
- 通过 `NameIndex`（大小写不敏感）进行 O(1) 名称查找
- 通过 `onMutation()` 回调跟踪变更 → 同步到 SQLite

### SQLiteStore

表：
- `entities` — FTS5 全文搜索
- `embeddings` — 向量 blob（BGE-M3，1024 维）
- `memories` — 带 FTS5 的角色扮演记忆
- `agent_prompts` — 按世界 + 语言的提示词存储
- `ui_translations` — 按语言 + 页面的 UI 字符串

混合搜索：FTS5 关键词 + 稠密向量 + Reciprocal Rank Fusion。

### FFI 内核

5 个通过 Zig 编译的 C 内核，用于跨平台分发：

| 内核 | 函数 | 回退 |
|--------|-----------|----------|
| `probability_ffi` | success_chance、roll、batch | 纯 TS |
| `vector_ffi` | cosine_4d、l2_4d、dot_4d | 纯 TS |
| `vector_full` | batch_cosine_768d | 纯 TS |
| `batch_ops` | age_decay、vice_decay、tax、loyalty | 纯 TS |
| `graph_ops` | rrf_fusion、reputation | 纯 TS |

检测：在 `mojo-ffi.ts` 中 `dlopen()`，失败时回退。

---

## 配置

### 环境变量 (.env)

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI 兼容端点 |
| `WORLD_LLM_API_KEY` | – | API 密钥 |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | 模型名 |
| `WORLD_LLM_TIMEOUT` | `300` | 请求超时（秒） |
| `WORLD_LLM_MAX_TOKENS` | `4096` | 每次响应的最大 token 数 |
| `WORLD_LLM_TEMPERATURE` | `0.7` | 采样温度 |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | 最大并发 LLM 请求数 |
| `WORLD_DB_PATH` | `./world_db` | 数据库目录（遗留） |
| `WORLDS_ROOT` | `./worlds` | 世界根目录 |
| `WORLD_SERVER_HOST` | `127.0.0.1` | 监听地址 |
| `WORLD_SERVER_PORT` | `8000` | 监听端口 |
| `AUTH_PASSWORD` | – | 登录密码（空 = 无认证） |
| `AUTH_PASSWORD_HASH` | – | PBKDF2 哈希（salt:hash） |

### 设置 (conf/settings.json)

通过 `loadSettings()` 加载。优先级：settings.json > .env > 默认值。

包含：LLM 参数、嵌入配置、服务器配置、认证密码、记忆设置、概率运气值、世界选择、语言。

---

## 中间件链

顺序很重要 — 在 `app.ts` 中应用：

```
1. errorHandler     — 捕获所有错误的处理器
2. requestLogger    — Pino 请求日志
3. rateLimiter      — 每 IP 100 请求/分钟
4. securityHeaders  — CSP、X-Frame-Options 等
5. CORS             — localhost:8000 源
6. authMiddleware   — 会话 Cookie 校验（保护 /api/*、/ws/*）
```

---

## 测试

```bash
bun test                              # 运行所有测试
bun test tests/entity-store.test.ts   # 实体存储测试
bun test tests/probability-engine.test.ts  # 概率测试
bun test tests/integration/server.test.ts  # 集成测试（需要运行服务器）
```

测试文件遵循 `*.test.ts` 约定，与源文件放在一起。

---

## 添加新代理

1. 创建 `src/services/my-agent.ts`：
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. 在 `roleplay-engine.ts` 构造函数中注册
3. 在 `processInput()` 中添加路由逻辑
4. 在 `agent-config.ts` 或 SQLite `agent_prompts` 表中添加系统提示词

---

## 添加新路由

1. 创建 `src/routes/my-route.ts`：
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. 在 `src/routes/index.ts` 中挂载：
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## 世界管理

`worlds/` 下的多个隔离世界：

```
worlds/
├── default/           # 活跃世界
│   ├── tns.db         # SQLite 数据库
│   ├── entities.json  # 实体图
│   └── ...
├── levant/            # 另一个世界
└── _sessions/         # 全局会话存储
```

通过 `POST /api/worlds/:name/switch` 切换世界。热交换 DI 容器。

世界统计可通过 `GET /api/worlds/:name/detail` 获取 — 返回按类型分类的实体数量、角色/地点/派系/物品列表、会话/事件/章节/反派计数，以及世界规则。

---

## 关键模式

- **双写**：设置同时写入 SQLite 和 JSON（向后兼容）
- **模板解析**：代理提示词使用 `{variable}` 占位符，运行时解析
- **安全表达式求值**：概率公式使用递归下降解析器（不用 eval）
- **提示词注入防御**：`sanitizeInput()` 在进入 LLM 前去除常见注入模式
- **原子 JSON 写入**：`atomicWriteJson()` 使用临时文件 + 重命名以确保崩溃安全
- **事件驱动**：`EventBus` 解耦服务（实体创建、记忆事件等）
- **语言指令注入**：语言指令在创建世界时通过 `seedWorldAgents()` 嵌入代理提示词，运行时通过 `getLanguageInstruction()` 为动态 NPC 对话追加
