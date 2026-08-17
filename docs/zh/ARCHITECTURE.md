# TrueNeverStory — 架构文档

> 对 TrueNeverStory 叙事 RPG 引擎的领域驱动设计分析。
> 已更新至 v0.32.6 — `RoleplayEngine` 重构为 `SessionState`、`CommandHandler`、`PipelineRunner`、散文策略。

---

## [A1] 架构模式

**分层洋葱架构，带事件驱动扩展 + 状态优先管道**

TrueNeverStory 在其核心采用**分层洋葱（六边形）架构**，外层包裹一个**事件驱动编排层**用于异步叙事处理。自 v0.32.6 起，引擎采用**状态优先（State-First）管道**，确定性的模拟在散文生成之前执行。

该模式成立的原因如下：

1. **领域模型被隔离** — `src/models/` 包含无基础设施依赖的纯数据结构。`EntityNode`、`Quest`、`StoryContext`、`NPCProfile`、`ProbabilityModifier`、`Intent`、`SimulationResult` 均与框架无关。
2. **服务编排领域逻辑** — `src/services/` 包含应用服务（`RoleplayEngine`、`StoryEngine`）和领域服务（`ProbabilityEngine`、`SocialSimulator`、`RomanceEngine`、`SimulationEngine`）。
3. **基础设施被推到边缘** — `src/lib/` 承载持久化（`SQLiteStore`、`AtomicIO`）、外部集成（`LLMClient`、`ProviderManager`）和传输（`WebSocketManager`）。
4. **路由是薄适配器** — `src/routes/` 以最少的逻辑将 HTTP 映射到服务调用。
5. **MCP 集成** — `src/mcp/` 通过 Model Context Protocol 提供外部知识源（圣经、古腾堡、维基百科）。

**事件总线**（`src/lib/event-bus.ts` 中的 `EventBus`）在有界上下文之间增加了一个异步解耦层，使 Director Loop 能够编排叙事事件，而无需直接耦合到 NPC、Social 或 Quest 子系统。

### 状态优先管道（v0.32.6）

管道现在被构建为由 `PipelineRunner` 管理的可组合阶段：

```
Player Input (any language)
  │
  ▼
PipelineRunner.buildContext() — snapshot engine state
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ translated text + intent
  ▼
CommandHandler.handle() — early exit for commands
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine (deterministic)
  │ outcome, probability, stateChanges
  ▼
StateMutator.applyChanges() — apply to EntityStore
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
Prose Generators:
  ├─ LiteraryV2Generator (feature-flag gated) → Stylist
  └─ LegacyIntentGenerator → MovementHandler | DialogueHandler | ObservationHandler | ActionHandler
  │
  ▼
TranslationService.translate() — if non-English target language
  │
  ▼
Response to User

Total: 2-3 LLM calls
```

### 古腾堡处理管道（v0.32.6）

两阶段管道将原始古腾堡 .txt 文件转换为可供代理消费的数据库：

**阶段 A（V1 — 基于规则，无 LLM）：**
```
classics.db → GutenbergParser → gutenberg-normalized.db (styles + FTS)
         └→ 4-pass compiler → classics-compiled.db (quest templates)
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**阶段 B（V2 — LLM 增强）：**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**classics-compiled.db 中的新表：**
- `narrative_arcs` — 每本书的情节弧线原型与张力点
- `thematic_motifs` — 带演化追踪的象征母题
- `quality_calibration` — LLM 响应质量评分

**PlayerProfileStore** — 独立的跨代理玩家风格画像（14 项指标），存储于 `data/player-profiles.db`。

### 双模型架构（v0.32.6）

引擎支持每个代理两个 LLM 模型：

| 模型 | 用途 | 示例 |
|-------|---------|----------|
| **主模型** | 叙事生成、NPC 对话、故事规划 | llama-3.1-8b, qwen2.5-14b |
| **翻译模型** | 翻译、意图分类（快速、小型） | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**配置**（在 `conf/agents.json` 中按代理配置）：
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** 通过 `useTranslationModel` 标志解析模型：
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → 使用 `translationModelId`
- `LLMQueue.getAgentClient("stylist")` → 使用 `modelId`

```
┌─────────────────────────────────────────────────┐
│                   Routes (HTTP/WS)               │  ← Adapter Layer
├─────────────────────────────────────────────────┤
│              Application Services                │  ← Use Cases
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               Domain Services                    │  ← Domain Logic
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│               Domain Models                      │  ← Core Entities
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│              Infrastructure                      │  ← Persistence/External
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] 有界上下文

### BC1：世界管理

**用途：** 多世界生命周期 — 世界的创建、配置、切换与状态持久化。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `World`、`WorldFrame` |
| **关键实体** | `EntityNode`（Character、Faction、Location、Item、Event、Race、WorldRule） |
| **值对象** | `WorldCreateParams`、`WorldSummary`、`LayeredProfile`（L1/L2/L3 层） |
| **领域事件** | `WORLD_CREATED`、`WORLD_FRAME_LOADED`、`WORLD_EVOLVED` |
| **持久化** | `worlds/{name}/world_frame.json`、`worlds/{name}/entities.json` |

**关键文件：**
- `src/services/world-manager.ts` — CRUD 操作、世界切换
- `src/services/world-builder.ts` — LLM 驱动的分层世界构建
- `src/services/world-validator.ts` — 完整性检查
- `src/services/world-evolver.ts` — 随时间添加 NPC/地点/物品
- `src/routes/worlds.ts` — HTTP 适配器

**领域规则：**
- 世界名称经过 slug 化且唯一
- 每个世界在 `worlds/` 下拥有独立的数据目录
- `WorldFrame` 定义规范结构（历法、魔法系统、种族、派系、地点、物品、历史事件、世界规则）
- 实体档案采用三层系统：L1（身份）、L2（动态状态）、L3（隐藏/秘密）

---

### BC2：实体与图

**用途：** 世界实体及其关系的内存图表示。提供 O(1) 查找和图遍历。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `GraphStore`（世界图的聚合根） |
| **关键实体** | `EntityNode`、`GraphEdge` |
| **值对象** | `Relationship`、`LayeredProfile`、`GraphSummary` |
| **领域事件** | `ENTITY_ADDED`、`ENTITY_UPDATED`、`ENTITY_REMOVED`、`RELATIONSHIP_ADDED`、`RELATIONSHIP_BROKEN`、`GRAPH_CHANGED` |
| **持久化** | `worlds/{name}/entities.json`（通过 `UnifiedEntityStore`）、`worlds/{name}/branches.json` |

**关键文件：**
- `src/store/entity-store.ts` — 带 `NameIndex` 的 `UnifiedEntityStore`，用于 O(1) 名称→UID 解析
- `src/services/graph-store.ts` — 带正向/反向边的邻接表图
- `src/services/branch-manager.ts` — 故事图的类 Git 分支
- `src/intelligence/` — 图分析、校验、关系修复

**领域规则：**
- 实体具有唯一 `uid`，可通过名称、token 或类型前缀解析
- `NameIndex` 支持模糊解析（不区分大小写、基于 token、去除类型）
- `BranchManager` 支持父→子分支，每个分支记录添加/删除
- 图边是双向的（正向 + 反向映射）

---

### BC3：叙事与故事

**用途：** 核心叙事生成 — 讲述者、场景转换、故事节拍与戏剧性编排。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `StoryContext`、`StoryArc`、`DirectorTask`、`ChapterData`、`BeatData` |
| **关键实体** | `StoryBeat`、`ArcPhase`、`ArcTimelineEvent` |
| **值对象** | `NarratorOutput`、`NPCDialogue`、`SceneTransition` |
| **领域事件** | `STORY_EVENT`、`STORY_BEAT`、`VILLAIN_PROGRESS` |
| **持久化** | `worlds/{name}/director_state.json`、`worlds/{name}/story_arcs.json`、`worlds/{name}/planner_state.json` |

**关键文件：**
- `src/services/narrative-service.ts` — **组合根** / 所有叙事服务的 DI 容器
- `src/services/roleplay-engine.ts` — 主要角色扮演处理、代理分发
- `src/services/agents/stylist.ts` — LLM 驱动的散文生成（唯一的散文生成器）
- `src/services/agents/dramaturg.ts` — 从圣经原型选择叙事模式
- `src/services/agents/validator.ts` — 通过维基百科 MCP 进行事实核查
- `src/services/director-loop.ts` — 后台编排器（时钟→社交→反派→随机→节拍）
- `src/services/story-engine.ts` — 从故事节拍生成事件 + 应用效果
- `src/services/story-planner.ts` — LLM 驱动的章节/节拍规划
- `src/services/story-arc-manager.ts` — 带阶段的故事弧 CRUD
- `src/models/story.ts` — `StoryContext`、`NarratorOutput`、`NPCDialogue`、`SceneTransition`
- `src/models/director.ts` — `DirectorTask`、`StoryArc`、`StoryBeat`、`TaskPriority`

**领域规则：**
- `DirectorLoop` 以可配置的 tick 间隔运行（默认 30 分钟）
- 重大故事节拍有冷却时间（默认 6 小时）
- `StoryPlanner` 使用两阶段规划：章节大纲 → 节拍生成
- `TaskPriority` 枚举控制 LLM 队列排序（CRITICAL > HIGH > NORMAL > LOW）
- 代理提示先解析 SQLite，再回退到 JSON，最后是硬编码默认值

---

### BC4：NPC 与对话

**用途：** 非玩家角色状态管理、情景记忆、对话会话与 NPC 生成。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `NPCProfile`（每个 NPC 的聚合根） |
| **关键实体** | `EpisodicMemory`、`DialogueSession`、`DialogueMessage` |
| **值对象** | `NPCSkills`、`NPCDialogue`、`DialogueChoice`、`GreetingTemplate` |
| **领域事件** | `ENTITY_ADDED`（用于生成的 NPC）、`MEMORY_ADDED`、`MEMORY_CONSOLIDATED` |
| **持久化** | `worlds/{name}/npc_profiles.json`、`worlds/{name}/npc_profiles/{name}.json` |

**关键文件：**
- `src/services/npc-runtime.ts` — `NPCRuntime`：带短期/长期记忆的状态存储
- `src/services/npc-generator.ts` — LLM 驱动的 NPC 创建
- `src/services/agents/actor.ts` — NPC 对话与互动生成
- `src/services/npc-economy.ts` — NPC 财富、税收、国库、粮食生产
- `src/services/dialogue-manager.ts` — 对话会话、话题、选择
- `src/services/dialogue-context.ts` — 上下文对话状态
- `src/models/npc-state.ts` — `NPCProfile`、`EpisodicMemory`、`NPCSkills`

**领域规则：**
- NPC 档案具有短期记忆（上限 20 条）和长期情景记忆
- 当短期记忆超过 `_importanceThreshold`（0.4）时进行记忆整合
- NPC 在启动时从实体存储同步 — 缺失的档案会自动创建
- 对话会话跟踪状态机：`greeting → active → farewell → idle`
- `TopicCategory` 枚举约束有效的话题

---

### BC5：社交与关系

**用途：** 角色间关系、派系动态、联盟、封建等级与浪漫关系。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `SocialGraph`（所有社交状态的聚合根） |
| **关键实体** | `Relationship`、`Faction`、`Alliance`、`FeudalRelationship` |
| **值对象** | `FactionSummary`、`FeudalSummary`、`RomanceStatus`、`RomanceProgression` |
| **领域事件** | `RELATIONSHIP_ADDED`、`RELATIONSHIP_REPAIRED`、`RELATIONSHIP_BROKEN` |
| **持久化** | `worlds/{name}/social/` 目录（每个子系统的 JSON 文件） |

**关键文件：**
- `src/services/social-graph.ts` — `SocialGraph`：关系、派系、联盟、封建
- `src/services/social-simulator.ts` — 配对选择、互动生成
- `src/services/romance-engine.ts` — 浪漫关系进展
- `src/services/romance-profiles.ts` — 浪漫事件的概率画像
- `src/models/romance.ts` — `RelationshipMemory`、`RomanceStatus`、`RomanceProgression`

**领域规则：**
- `SocialSimulator` 根据位置邻近度和派系一致性选择配对
- 互动类型按上下文加权：同地点 vs 同派系 vs 不同派系
- 浪漫使用 `ProbabilityEngine` 进行确定性结果解析
- 封建关系跟踪忠诚、税收贡献、军事义务
- 联盟可被背叛；背叛会带来后果

---

### BC6：任务

**用途：** 任务生命周期管理 — 生成、目标、奖励、任务链与对话集成。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `Quest`、`QuestDefinition` |
| **关键实体** | `QuestObjective`、`QuestObjectiveDef` |
| **值对象** | `QuestReward`、`QuestPrerequisite` |
| **领域事件** | `QUEST_ADDED`、`QUEST_UPDATED` |
| **持久化** | `worlds/{name}/quests.json` |

**关键文件：**
- `src/services/quest-manager.ts` — 基础任务 CRUD
- `src/services/quest-system.ts` — 带任务链、前置条件、时间限制的完整生命周期
- `src/models/quest.ts` — `Quest`、`QuestObjective`、`QuestData`

**领域规则：**
- 任务类型：`main`、`side`、`daily`、`faction`、`chain`
- 任务状态：`available → active → completed | failed | abandoned`
- `QuestSystem` 强制前置条件（最低等级、派系、已完成任务、关系）
- `Quest.progress` 是计算值（已完成目标 / 总目标）
- 任务链通过 `chainNext` 字段链接

---

### BC7：记忆与知识

**用途：** 世界记忆、代理记忆、语义检索、基于嵌入的检索与记忆生命周期管理。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `WorldMemory`（聚合根）、`AgentMemoryStore`（按代理） |
| **关键实体** | `WorldMemoryEntry`、`AgentMemoryEntry` |
| **值对象** | `MemoryConfig`、`ScoringWeights`、`MemoryMetadata`、`RankedItem` |
| **领域事件** | `MEMORY_ADDED`、`MEMORY_CONSOLIDATED`、`MEMORY_FORGOTTEN` |
| **持久化** | `tns.db`（SQLite）、`worlds/{name}/memory/`（分区）、FAISS 索引 |

**关键文件：**
- `src/memory/world-memory.ts` — `WorldMemory`：评分、分区、嵌入、聚类
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`：带混合检索的按代理 RAG
- `src/lib/sqlite-store.ts` — `SQLiteStore`：FTS5 + 向量检索 + RRF 融合
- `src/lib/vector-ops.ts` — 余弦相似度、L2 距离、点积
- `src/services/memory-engine.ts` — `MemoryEngine`：NPC 情景记忆上的语义检索
- `src/services/memory-manager.ts` — `MemoryManager`：对话历史
- `src/memory/` — 评分、聚类、写缓冲、嵌入队列、认知管道

**领域规则：**
- 记忆评分使用加权公式：重要性（0.35）+ 新近度（0.25）+ 访问（0.15）+ 情感（0.10）+ 相关性（0.15）
- 低于 `minKeepScore`（0.15）且超过 `minKeepDays`（30）天的记忆会被清理
- 代理记忆通过 SQLite 中的 `role` 列（代理 ID）隔离
- 混合检索：FTS5 关键词 + 稠密向量 → Reciprocal Rank Fusion (RRF)
- 当碎片化超过阈值（200 个新条目）时重建 FAISS 索引
- 写缓冲批量生成嵌入以提高效率

---

### BC8：LLM 集成

**用途：** 多提供商 LLM 管理、请求排队、速率限制、按代理的模型分配与提示构建。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `ProviderManager`（单例）、`LLMQueue` |
| **关键实体** | `AgentModelAssignment`、`LLMProvider` |
| **值对象** | `AgentConfig`、`AgentPromptConfig`、`LLMClientOptions` |
| **领域事件** | 无（基础设施层） |
| **持久化** | `conf/providers.json`、`conf/agents.json`、`tns.db`（agent_prompts 表） |

**关键文件：**
- `src/lib/llm-client.ts` — `LLMClient`：按代理的 LRU 缓存、提供商分发
- `src/lib/llm-queue.ts` — `LLMQueue`：优先队列、并发控制、速率限制
- `src/lib/providers/provider-manager.ts` — `ProviderManager`：多提供商、多密钥支持
- `src/lib/providers/` — OpenAI、Anthropic、Google、Ollama、LlamaCpp 提供商
- `src/services/agent-config.ts` — 代理配置（全局 + 按世界的提示）
- `src/services/prompt-builder.ts` — 所有代理的静态提示模板
- `src/services/model-manager.ts` — 模型管理

**领域规则：**
- `LLMQueue` 强制最大并发数（默认 3）和队列上限（默认 50）
- 优先级驱逐：队列满时丢弃最低优先级的任务
- 通过 `RateLimiter` 进行速率限制（基于 RPM，自动补充）
- 每个代理可以有自己的提供商、模型、temperature 和最大 token 数
- 提示解析：SQLite（`agent_prompts`）→ JSON 回退 → 硬编码默认值
- `LLMClient` 对重复请求使用 LRU 缓存（256 条，5 分钟 TTL）

---

### BC9：概率与战斗

**用途：** 所有游戏机制的确定性概率计算 — 战斗、社交行为、制造、浪漫。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `ProbabilityEngine` |
| **关键实体** | `ProbabilityModifier`、`ProbabilityProfile` |
| **值对象** | `ProbabilityParameter`、`ProbabilityResult`、`OutcomeQuality` |
| **领域事件** | 无（纯计算） |
| **持久化** | 无（内存中，由 NPC 状态派生） |

**关键文件：**
- `src/services/probability-engine.ts` — 核心概率计算
- `src/services/probability-resolver.ts` — 上下文解析（位置、关系、世界状态）
- `src/services/probability-expression.ts` — 动态修饰符的表达式解析器
- `src/services/probability-profiles.ts` — 预定义概率画像
- `src/models/probability.ts` — `ProbabilityModifier`、`ProbabilityProfile`、`OutcomeQuality`

**领域规则：**
- 修饰符类型：`ADD`、`MULTIPLY`、`REPLACE`
- 叠加规则：`STACK`、`TAKE_HIGHEST`、`TAKE_LOWEST`、`OVERRIDE`
- 修饰符可过期（基于时间的持续时间）
- `OutcomeQuality` 范围从 `CRITICAL_FAILURE` 到 `CRITICAL_SUCCESS`
- 上下文解析器根据位置、关系、世界状态注入动态修饰符
- Mojo FFI 内核（`probability_ffi.mojo`）加速批量计算

---

### BC10：反派管理

**用途：** 带 LLM 驱动战略规划和状态机阶段的反派生命周期管理。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `VillainAgendaData` |
| **关键实体** | `VillainMemoryData` |
| **值对象** | Phase（`plotting → preparing → executing → climax`） |
| **领域事件** | `VILLAIN_PROGRESS` |
| **持久化** | `worlds/{name}/villain_state.json` |

**关键文件：**
- `src/services/villain-manager.ts` — `VillainManager`：阶段转换、战略规划

**领域规则：**
- 反派遵循 4 阶段状态机：`plotting → preparing → executing → climax`
- 每次阶段转换需要完成一组行动
- LLM 生成上下文感知的反派行动（破坏、谣言、间谍渗透等）
- 反派行动有成功/失败后果，会影响世界状态
- 可以指派爪牙执行反派计划

---

### BC11：智能与分析

**用途：** 图分析、校验、去重与推荐引擎。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | 无（服务层） |
| **关键实体** | 无 |
| **值对象** | 校验结果、推荐 |
| **领域事件** | 无 |
| **持久化** | 从实体存储读取，写入校验结果 |

**关键文件：**
- `src/intelligence/graph-analyzer.ts` — 图指标、中心性、聚类
- `src/intelligence/graph-validator.ts` — 完整性检查
- `src/intelligence/duplicate-detector.ts` — 实体去重
- `src/intelligence/relationship-repairer.ts` — 破裂关系修复
- `src/intelligence/recommender.ts` — 内容推荐
- `src/intelligence/scene-generator.ts` — 程序化场景生成
- `src/intelligence/rule-checker.ts` — 世界规则执行
- `src/intelligence/subgraph-expander.ts` — 子图扩展

---

### BC12：文学编译器 v2（v0.32.6）

**用途：** 从文学来源离线提取叙事，以及在运行时进行混合检索以生成受约束的散文。用确定性的模板 + 风格模式系统取代了重度依赖 LLM 的 v1 管道。

| 方面 | 详情 |
|--------|--------|
| **关键聚合** | `LiteraryCompilerDB`（所有 v2 表的聚合根） |
| **关键实体** | `SceneTemplate`、`StylePattern`、`ChunkIndex`、`TemplateStyleLink` |
| **值对象** | `RetrievalKeys`、`RankedTemplate`、`ExtractResult`、`PreScoreResult`、`TurnMetrics` |
| **领域事件** | 无（离线管道 + 运行时检索） |
| **持久化** | `literary.db`（带 FTS5 索引的 SQLite） |

**关键文件：**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB`：6 个 v2 表、FTS5、CRUD 方法
- `src/mcp/literary-compiler/archetypes.ts` — 12 个经典原型 + 关键词集合 + 变量 + 位置
- `src/mcp/literary-compiler/chunker.ts` — 基于句子的文本切分（200-400 token，40-80 重叠）
- `src/mcp/literary-compiler/pre-score.ts` — 字典关键词评分 + 叙事密度（对话/行动/冲突）
- `src/mcp/literary-compiler/extractor.ts` — 带 Zod 风格校验的 LLM JSON 提取器
- `src/mcp/literary-compiler/retrieval.ts` — 复合评分：原型（0.40）+ 情绪（0.15）+ 领域（0.15）+ 质量（0.10）+ 新鲜度（0.05）+ 标签（0.15）
- `src/mcp/literary-compiler/fill-template.ts` — 确定性的 `[placeholder]` 替换
- `src/mcp/literary-compiler/linter.ts` — V2 校验：说教检测、token 限制、原型有效性
- `src/mcp/literary-compiler/runtime-metrics.ts` — 每轮延迟跟踪
- `src/services/agents/stylist.ts` — 用于 v2 受约束生成的 `buildMicroPrompt()`
- `src/lib/feature-flags.ts` — `literary-compiler-v2`、`literary-v2-retrieval`、`literary-v2-stylist` 开关
- `scripts/migrate-v1-to-v2.ts` — 原型名称迁移（escape → escape_liberation 等）

**领域规则：**
- 所有模板使用英语（中介语）以优化 RAG
- 模板经过匿名化处理（不含来源中的角色名）
- 反说教约束在 linter + 提示层面强制执行
- 每个模板的骨架 ≤ 120 token
- 检索返回 top-1 模板（接近平局时返回 top-2）
- 硬性预算：每轮 1-2 次 LLM 调用（从 v1 的 4-5 次下降）
- 通过特性开关逐步推出

**离线管道：**
```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

**运行时流程：**
```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys (position, archetype, mood, domain)
  → FTS + dictionary hybrid retrieval → top-1 template
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
```

---

## [A3] 聚合与实体

### BC1：世界管理

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `World` | 聚合根 | 必须具有唯一的 slug 化名称；必须具有有效的 `WorldFrame` |
| `WorldFrame` | 值对象 | 必须定义 `world_name`；有效世界的 `world_rules` 必须非空 |
| `LayeredProfile` | 值对象 | L1 必须具有 `name` 和 `type`；层级为 L1/L2/L3 |
| `EntityNode` | 实体 | 必须具有唯一 `uid`；`entityType` 必须是有效的 `EntityTypeValue` |
| `EntityType` | 值对象（枚举） | `CHARACTER`、`FACTION`、`LOCATION`、`ITEM`、`EVENT`、`WORLD_RULE`、`RACE`、`UNKNOWN` |

### BC2：实体与图

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `GraphStore` | 聚合根 | 遍历前必须完成启动；边引用有效的 UID |
| `GraphEdge` | 实体 | `source` 和 `target` 必须是有效的实体 UID |
| `Relationship` | 值对象 | `sourceUid` 和 `targetUid` 必须存在；`strength` 为 0-1 |
| `BranchManager` | 实体 | 分支名称必须唯一；父分支必须存在 |

### BC3：叙事与故事

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `StoryContext` | 值对象 | 必须具有 `worldName`、`currentTime`、`location` |
| `StoryArc` | 聚合根 | 必须具有唯一 `id`；`beats` 数组按时间排序 |
| `DirectorTask` | 实体 | 必须具有唯一 `id`；`priority` 在 `TaskPriority` 范围内 |
| `BeatData` | 实体 | 必须属于有效的 `chapter_id`；`triggered` 为布尔值 |
| `ChapterData` | 值对象 | 必须具有唯一 `id`；`beats` 数组非空 |

### BC4：NPC 与对话

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `NPCProfile` | 聚合根（每个 NPC） | 必须具有唯一 `name` 和 `uid`；`health` 0-100；`skills` 值 0-1 |
| `EpisodicMemory` | 实体 | 必须具有唯一 `id`；`importance` 0-1；`emotion` 非空 |
| `DialogueSession` | 实体 | 必须具有唯一 `id`；`state` 在有效枚举范围内 |
| `NPCSkills` | 值对象 | 所有技能值必须为 0-1 |
| `DialogueMessage` | 值对象 | `role` 必须是 `player` 或 `npc` |

### BC5：社交与关系

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `SocialGraph` | 聚合根 | 必须具有有效的状态路径；关系引用有效实体 |
| `Relationship` | 实体 | `type` 在有效枚举中；`strength` 0-1；`source` ≠ `target` |
| `Faction` | 值对象 | 必须具有唯一 `name`；成员唯一 |
| `Alliance` | 值对象 | `faction1` ≠ `faction2`；`strength` 0-1 |
| `FeudalRelationship` | 值对象 | `vassal` ≠ `liege`；`loyalty` 0-1 |

### BC6：任务

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `Quest` | 聚合根 | 必须具有唯一 `id`；`status` 在有效枚举中；`progress` 为计算值 |
| `QuestDefinition` | 聚合根 | 必须具有唯一 `id`；`objectives` 非空 |
| `QuestObjective` | 实体 | `completed` 为布尔值 |
| `QuestReward` | 值对象 | `gold`、`experience` ≥ 0 |
| `QuestPrerequisite` | 值对象 | 必须设置至少一个前置条件 |

### BC7：记忆与知识

| 组件 | 类型 | 不变量 |
|-----------|------|------------|
| `WorldMemory` | 聚合根 | 必须具有有效的存储路径；条目按加权公式评分 |
| `WorldMemoryEntry` | 实体 | 必须具有唯一 `id`；`importance` 0-1；`content` 非空 |
| `AgentMemoryStore` | 聚合根 | 按 `agentId` 隔离；使用混合 FTS5 + 向量检索 |
| `MemoryConfig` | 值对象 | 所有权重 ≥ 0；`halfLifeDays` > 0 |
| `ScoringWeights` | 值对象 | 权重之和为 1.0 |

---

## [A4] 领域服务

不属于单一聚合的横切服务：

| 服务 | 文件 | 用途 |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **组合根** — 实例化并装配所有叙事子系统 |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | 主入口点：编排 PipelineRunner → CommandHandler → 散文生成器。`SessionState` 提取到 `roleplay/session-state.ts`，处理器在 `roleplay/handlers/` 中 |
| `StoryEngine` | `src/services/story-engine.ts` | 从节拍生成事件 + 应用效果（NPC 移动、关系变化、任务创建） |
| `DirectorLoop` | `src/services/director-loop.ts` | 后台编排器：时钟 tick → 社交模拟 → 反派 → 随机事件 → 故事节拍 |
| `SocialSimulator` | `src/services/social-simulator.ts` | NPC 配对选择 + 互动生成 |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | 带修饰符叠加的确定性结果解析 |
| `MemoryEngine` | `src/services/memory-engine.ts` | NPC 情景记忆上的语义检索 |
| `WorldValidator` | `src/services/world-validator.ts` | 世界完整性校验 |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | 导演任务执行的优先队列 |
| `StartResolver` | `src/services/start-resolver.ts` | 从世界状态解析初始故事上下文 |
| `WorldIsolator` | `src/services/world-isolator.ts` | 带资源监控的多世界隔离（内存、CPU、token） |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | 带传送门的跨世界事件通信 |
| `PluginManager` | `src/plugins/plugin-manager.ts` | 插件生命周期管理（注册、注销、能力） |

---

## [A5] 领域事件

所有事件都定义在 `EventTopic` 枚举（`src/lib/event-bus.ts`）中：

| 事件 | 发布者 | 消费者 | 描述 |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`、`NPCGenerator` | `GraphStore`、`WorldMemory` | 新实体已创建 |
| `ENTITY_UPDATED` | 各服务 | `GraphStore`、`WorldMemory` | 实体档案已变更 |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | 实体已删除 |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | L1/L2/L3 构建阶段完成 |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | 新关系已形成 |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | 破裂的关系已修复 |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | 关系已切断 |
| `WORLD_CREATED` | `WorldManager` | 所有服务 | 新世界已初始化 |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | 所有服务 | 世界框架已从磁盘加载 |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`、`WebSocketManager` | 世界状态已变更 |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`、`WebSocketManager` | 故事事件已生成 |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`、`WebSocketManager` | 故事节拍已注入 |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`、`WebSocketManager` | 反派行动已执行 |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | 新任务已创建 |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | 任务状态已变更 |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | 新记忆已存储 |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | 短期→长期提升 |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | 记忆已清理 |
| `MAINTENANCE_START` | 系统 | 所有服务 | 维护周期开始 |
| `MAINTENANCE_DONE` | 系统 | 所有服务 | 维护周期完成 |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | 图拓扑已变更 |
| `ERROR` | 各服务 | 日志 | 发生错误 |

**事件总线机制：**
- 处理器按 `priority` 排序（更高 = 更先执行）
- 重放缓冲（默认 100 个事件）供迟到的订阅者使用
- 带 `await` 的异步发布 — 没有即发即忘

---

## [A6] 应用层

### 用例流程：玩家消息 → Stylist 响应

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod validation, input sanitization

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() for commands
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ Prose generation: LiteraryV2Generator or LegacyIntentGenerator
   └─→ Returns narrative string

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → SQLite prompts → JSON fallback → defaults
   ├─→ resolveTemplate(template, vars) with StoryContext fields
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → concurrency control
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU cache check → HTTP to LLM
   └─→ Return response

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Return { narrative, location, storyTime, activeCharacter }

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### 用例流程：导演 Tick → 故事节拍

```
1. DirectorLoop (background setInterval, default 30min)
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → phase transitions
   ├─→ ProbabilityEngine.roll() → chance events
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → structured event
   ├─→ Apply effects: NPC moves, relationship changes, quest creation
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM generates narrative beat
   ├─→ RoleplayEngine.injectBeat(beat) → prepend to next response
   └─→ Save director_state.json
```

### 用例流程：世界创建

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ Write world_frame.json
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder (on /api/launch)
   ├─→ createWorld() → LLM generates WorldFrame
   ├─→ buildL1() → identity layer for all entities
   ├─→ buildL2() → dynamic state layer
   ├─→ buildL3() → hidden/secret layer
   ├─→ buildRelationships() → entity relationships
   └─→ EventBus.publish(ENTITY_ADDED) for each entity

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### 用例流程：代理记忆

```
1. Stylist generates narrative prose
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ Create WorldMemoryEntry with scoring metadata
   ├─→ EmbeddingQueue.enqueue(entry) → batch embedding via BGE-M3
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ Periodic flush to SQLite + FAISS rebuild

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 endpoint
   ├─→ SQLiteStore.searchMemoriesFTS(query) → keyword matches
   ├─→ SQLiteStore.searchMemoriesDense(vector) → cosine similarity
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ Return top-K results filtered by agentId
```

---

## [A7] 基础设施

### LLM 集成

```
ProviderManager (singleton)
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  (local, port 5002 for embeddings)

LLMClient (per-agent)
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU Cache (256 entries, 5-min TTL)
├── parseJsonWithRetry() for structured output
└── Per-agent config: temperature, maxTokens, model

LLMQueue (global)
├── Priority queue (CRITICAL > HIGH > NORMAL > LOW)
├── RateLimiter (RPM-based, auto-refill)
├── Max concurrency (default 3)
├── Queue cap (default 50) with priority eviction
└── Per-agent LLMClient instances
```

**文件：** `src/lib/llm-client.ts`、`src/lib/llm-queue.ts`、`src/lib/providers/provider-manager.ts`

### 持久化

| 存储 | 技术 | 路径 | 用途 |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | JSON 文件 | `worlds/{name}/entities.json` | 带 O(1) 名称解析的实体 CRUD |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | FTS5 检索、向量嵌入、代理提示、翻译 |
| `GraphStore` | 内存邻接表 | `worlds/{name}/entities.json` | 图遍历、分支 |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | 认证会话 token |
| `Chronicler` | JSONL 文件 | `worlds/{name}/timeline.jsonl` | 带轮转的事件时间线 |
| `WorldClock` | JSON 文件 | `worlds/{name}/clock_state.json` | 游戏时间、计划事件 |
| `NPCRuntime` | JSON 文件 | `worlds/{name}/npc_profiles.json` | NPC 状态 + 情景记忆 |
| `SocialGraph` | JSON 文件 | `worlds/{name}/social/*.json` | 关系、派系、联盟 |
| `StoryPlanner` | JSON 文件 | `worlds/{name}/planner_state.json` | 章节、节拍 |
| `DirectorLoop` | JSON 文件 | `worlds/{name}/director_state.json` | 导演状态 |
| `VillainManager` | JSON 文件 | `worlds/{name}/villain_state.json` | 反派议程 |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | 带嵌入的语义记忆 |
| `AgentMemoryStore` | SQLite | `tns.db` | 按代理的 RAG |
| `settings.json` | JSON 文件 | `conf/settings.json` | 应用级设置 |
| `providers.json` | JSON 文件 | `conf/providers.json` | LLM 提供商配置 |
| `agents.json` | JSON 文件 | `conf/agents.json` | 代理模型分配 |

**持久化模式：** 所有 JSON 写入都使用 `atomicWriteJson()`（先写临时文件再重命名）以保证崩溃安全。SQLite 使用 WAL 模式，并设置 `PRAGMA synchronous = NORMAL`。

### WebSocket 实时

**文件：** `src/services/websocket-manager.ts`

- `WebSocketManager` 用唯一 ID 管理已连接的客户端
- `broadcast(message)` 向所有已连接客户端发送（清理死连接）
- `sendTo(id, message)` 用于定向投递
- 来自 `EventBus` 的事件被转发给 WebSocket 客户端

### 认证

**文件：** `src/middleware/auth.ts`、`src/lib/session-store.ts`

- 基于 token 的会话认证（32 字节随机十六进制）
- 会话存储在 SQLite 中（`worlds/_sessions/sessions.db`）
- 24 小时 TTL，每小时清理一次
- `authMiddleware` 保护所有 `/api/*` 路由，除了 `/login`
- 通过 POST 端点登录/登出

---

## [A8] 数据流图

### 1. 用户消息 → Stylist 响应

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│  Browser  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist       │      │  MemoryManager   │
          │  (LLM prompt)    │      │  (history save)  │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │  (priority, rate │
          │   limit, cache)  │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   External LLM   │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. 导演 Tick → 故事节拍生成

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval, every 30min)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → advance time → fire scheduled events
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → pair selection → event generation
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → phase transition → LLM strategic action
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → chance events (weather, accidents, discoveries)
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → apply effects → publish event
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │  (broadcast)      │
└─────────────────┘     └──────────────────┘
```

### 3. 世界创建流程

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│  Browser  │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → L1 identity for each entity
│  ├─ buildL2()    │──▶ LLM → L2 dynamic state
│  ├─ buildL3()    │──▶ LLM → L3 hidden/secret
│  └─ buildRels()  │──▶ LLM → relationships
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N entities)   │
└─────────────────┘
```

### 4. 代理记忆流程

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│  (generates      │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   narrative)     │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ (batch BGE-M3)│ │   Buffer     │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

Query flow:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5 (keyword)  │
│ .search()     │     │ .searchMemories   │     │ + Dense vectors │
│               │     │                   │     │ → RRF fusion    │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] 跨上下文依赖

```
                    ┌─────────────────────┐
                    │  World Management    │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ creates/loads
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Entity &     │◀──▶│  Narrative & Story   │◀──▶│  NPC &       │
│ Graph (BC2)  │    │  (BC3)               │    │  Dialogue    │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM Integration     │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │  Social &     │ │  Quests      │ │  Villain     │
       │ │  Relationships│ │  (BC6)       │ │  (BC10)      │
       │ │  (BC5)        │ └──────┬───────┘ └──────────────┘
       │ └──────┬───────┘        │
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  Probability & Combat       │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Memory & Knowledge  │◀──▶│  Intelligence        │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Literary Compiler   │  (BC12, v0.32.6)
│  v2                  │
└─────────────────────┘
```

**关键依赖：**

| 源 BC | 目标 BC | 耦合机制 |
|-----------|-----------|-------------------|
| BC1（世界） | BC2（实体） | `UnifiedEntityStore` 共享实例 |
| BC1（世界） | BC3（叙事） | `NarrativeService.reset()` |
| BC3（叙事） | BC4（NPC） | `NPCRuntime` 注入到 `RoleplayEngine` |
| BC3（叙事） | BC5（社交） | `SocialSimulator` 注入到 `DirectorLoop` |
| BC3（叙事） | BC6（任务） | `QuestManager` 注入到 `StoryEngine` |
| BC3（叙事） | BC10（反派） | `VillainManager` 注入到 `DirectorLoop` |
| BC3（叙事） | BC9（概率） | `RoleplayEngine` 中的 `ProbabilityEngine` |
| BC3（叙事） | BC12（文学编译器） | `RoleplayEngine` 调用 `searchTemplates` + `fillTemplate` |
| BC4（NPC） | BC7（记忆） | `NPCRuntime` 使用 `EpisodicMemory` |
| BC5（社交） | BC2（实体） | `SocialGraph` 从 `UnifiedEntityStore` 读取 |
| BC8（LLM） | 所有 BC | `LLMQueue` 在所有代理间共享 |
| BC8（LLM） | BC12（文学编译器） | 离线提取器使用 `LLMClient` 进行结构化提取 |
| BC7（记忆） | BC8（LLM） | `EmbeddingQueue` 调用 `LLMClient` 进行嵌入 |
| BC11（智能） | BC2（实体） | 图分析读取 `GraphStore` |

---

## [A10] 关键设计决策

### D1：组合根模式

**决策：** `NarrativeService`（`src/services/narrative-service.ts`）作为组合根，实例化所有服务并手动装配依赖。

**权衡：** 无框架的显式 DI。所有依赖都在一个构造函数中可见，使系统可调试但冗长。替代方案（IoC 容器）会引入运行时魔法。

### D2：JSON 文件作为主要存储（SQLite 用于检索）

**决策：** 实体状态、NPC 档案和社交关系以 JSON 文件存储。SQLite 仅用于检索（FTS5）、嵌入（向量）、会话和代理提示。

**权衡：** 通过原子文件操作进行简单读写，但跨实体没有事务保证。`atomicWriteJson()` 模式（先写临时文件再重命名）为单次写入提供崩溃安全，但无法保证多文件一致性。SQLite 为检索和嵌入提供完整的 ACID。

### D3：用于跨上下文通信的事件总线

**决策：** 带优先级排序处理器和重放缓冲的 `EventBus` 异步连接有界上下文。

**权衡：** 解耦上下文（NPC 不知道 Memory，Memory 不知道 NPC），但增加了间接性。重放缓冲（100 个事件）确保迟到的订阅者不会错过最近的事件，代价是内存。

### D4：按代理的模型分配

**决策：** 每个代理（`stylist`、`director`、`researcher`、`translation` 等）可以有自己的 LLM 提供商、模型、temperature 和最大 token 数。

**权衡：** 最大的灵活性（为 chronicler 使用便宜的模型，为 stylist 使用强大的模型），但需要配置管理。`ProviderManager` 通过 `conf/providers.json` 和 `conf/agents.json` 处理这一点。

### D5：三层实体档案（L1/L2/L3）

**决策：** 实体档案使用三层：L1（身份/名称）、L2（动态状态/位置）、L3（隐藏/秘密）。

**权衡：** 支持渐进式揭示和 DM 控制的秘密。L1 始终可见，L2 在游戏过程中更新，L3 对玩家隐藏。代价是档案解析的额外复杂性。

### D6：后台导演循环

**决策：** `DirectorLoop` 作为后台间隔运行，独立于玩家输入编排时钟 tick、社交模拟、反派行动和故事节拍。

**权衡：** 创造了一个即使在玩家离线时也会演化的活世界。代价是状态管理的复杂性（暂停/运行状态、重大节拍冷却）以及玩家可能错过事件。

### D7：混合检索（FTS5 + 向量 + RRF）

**决策：** 记忆检索同时使用关键词（FTS5）和语义（稠密向量）检索，通过 Reciprocal Rank Fusion 合并。

**权衡：** 两全其美 — 精确的关键词匹配和语义相似度。代价是维护两套索引和嵌入管道（通过端口 5002 上的 llama.cpp 服务器的 BGE-M3）。

### D8：故事图的类 Git 分支

**决策：** `BranchManager` 支持实体图的分支，允许替代故事路径。

**权衡：** 无需复制整个世界状态即可实现“what if”场景和并行时间线。每个分支只存储相对于父分支的添加和删除。

### D9：带 SQLite 回退的模板化代理提示

**决策：** 代理提示存储在 SQLite（`agent_prompts`）中，按世界和语言隔离，回退到 JSON 文件，最后是硬编码默认值。

**权衡：** 无需代码更改即可支持 i18n 和按世界的定制。三级回退确保系统即使没有数据库也能工作。

### D10：用于性能关键计算的 Mojo FFI

**决策：** 概率计算和向量操作可以使用 Mojo FFI 内核（`probability_ffi.mojo`、`vector_ffi.mojo`），并带 TypeScript 回退。

**权衡：** 批量操作（概率掷骰、余弦相似度）的显著性能提升，但增加了构建复杂性和平台依赖。TypeScript 回退确保可移植性。

---

## 附录：文件参考

| 目录 | 文件 | 用途 |
|-----------|-------|---------|
| `src/models/` | 12 个文件 | 领域模型（Entity、Quest、Story、Director、NPC、Romance、Probability、Memory、Item、Rank、Archetype） |
| `src/services/` | 45+ 个文件 | 应用 + 领域服务 |
| `src/routes/` | 18 个文件 | HTTP 适配器（Hono 路由） |
| `src/lib/` | 15+ 个文件 | 基础设施（LLM、SQLite、EventBus、向量运算、Providers） |
| `src/memory/` | 12 个文件 | 记忆子系统（评分、聚类、嵌入、认知管道） |
| `src/intelligence/` | 10 个文件 | 图分析和校验 |
| `src/store/` | 1 个文件 | 带 NameIndex 的统一实体存储 |
| `src/config/` | env.ts | 环境配置 |
| `src/i18n/` | 国际化 | 多语言支持（7 种语言） |
| `src/middleware/` | auth、rate-limiter 等 | HTTP 中间件 |
| `src/utils/` | logger、sanitize 等 | 共享工具 |
