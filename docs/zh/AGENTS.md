# 代理参考 (v0.33.4)

TrueNeverStory 拥有**两个共存的代理系统**：

1. **The Big Six (AgentV2)** — 叙事散文管道。注册在 `AgentRegistryV2` 中，并在 `RoleplayEngine` 中实例化。
2. **配置代理（`DEFAULT_AGENTS`）** — 较早的配置驱动代理，列于 `src/services/agent-config.ts`。它们支撑 Settings/Providers UI 和若干子系统（空闲研究、聊天 `@mentions`）。

Big Six 为：`dramaturg`、`validator`、`stylist`、`actor`、`censor`、`chronicler`。配置代理为：`director`、`chronicler`、`story-planner`、`social-sim`、`villain`、`researcher`、`translation`。

`stylist` 是唯一的散文生成器。被移除的代理（`narrator`、`npc`、`scene`、`historian`、`cartographer`、`lorekeeper`、`merchant`、`quest-giver`）已不再存在于代码的任何位置。

---

## The Big Six (AgentV2)

这些代理负责确定性的散文管道：意图 → 模拟 → 上下文 → 散文。

### 1. Dramaturg（架构师）

**ID：** `dramaturg`
**角色：** 从圣经原型中选择叙事模式
**MCP 工具：** `search_verses`, `get_pattern`, `get_archetype`

| 方面 | 详情 |
|------|------|
| **用途** | 分析当前情境，从圣经模式中选择合适的故事结构 |
| **输入** | Intent, SimulationResult, GameContext |
| **输出** | NarrativePattern（原型、名称、描述、经文、情绪） |
| **依赖** | TNSServer (MCP), LLMQueue |

**工作流：**
1. 从意图类型和模拟结果推断情绪
2. 向圣经 MCP 查询匹配的原型
3. 如果 MCP 不可用，回退到 LLM 生成的模式

### 2. Validator（事实核查者）

**ID：** `validator`
**角色：** 通过维基百科 MCP 核实事实
**MCP 工具：** `verify_fact`, `get_context`

| 方面 | 详情 |
|------|------|
| **用途** | 确保世界一致性和历史准确性 |
| **输入** | Intent, SimulationResult, GameContext |
| **输出** | 核查结果（已核实、置信度、证据、来源） |
| **依赖** | TNSServer (MCP) |

**工作流：**
1. 从情境中提取事实性断言
2. 查询维基百科 MCP 进行核实
3. 返回带置信度的核查结果

### 3. Stylist（叙述者）

**ID：** `stylist`
**角色：** 使用古腾堡风格模式渲染散文 — 唯一的散文生成器
**MCP 工具：** `get_style_pattern`, `apply_style`

| 方面 | 详情 |
|------|------|
| **用途** | 生成叙事散文的核心文本生成代理 |
| **输入** | Intent, SimulationResult, GameContext, NarrativePattern |
| **输出** | 散文文本 |
| **依赖** | TNSServer (MCP), LLMQueue |

**工作流：**
1. 根据情绪从古腾堡 MCP 获取风格
2. 用模拟结果和风格构建受约束的提示
3. 通过 LLM 生成散文
4. 返回渲染后的文本

### 4. Actor（NPC 群像）

**ID：** `actor`
**角色：** 管理 NPC 互动与对话
**MCP 工具：** 无

| 方面 | 详情 |
|------|------|
| **用途** | 处理所有 NPC 对话、交易、制造、社会动态 |
| **输入** | Intent, SimulationResult, GameContext |
| **输出** | NPC 对话文本、状态变更 |
| **依赖** | UnifiedEntityStore, LLMQueue |

**工作流：**
1. 根据意图类型路由到相应的子处理器
2. 从 L3 档案获取 NPC 的隐藏动机
3. 使用 LLM 生成 NPC 回应
4. 计算关系状态变更

### 5. Censor（检查器）

**ID：** `censor`
**角色：** 移除 AI 陈词滥调并强制风格一致性
**MCP 工具：** 无

| 方面 | 详情 |
|------|------|
| **用途** | 通过移除 AI 生成的陈词滥调和时代错误来清理散文 |
| **输入** | 散文文本, GameContext |
| **输出** | 清理后的散文文本 |
| **依赖** | LLMQueue |

**工作流：**
1. 通过正则模式移除 AI 陈词滥调
2. 根据世界上下文修正时代错误
3. 对复杂问题使用基于 LLM 的润色
4. 返回清理后的文本

**常被移除的 AI 陈词滥调：**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID：** `chronicler`
**角色：** 更新世界记忆并维护时间线
**MCP 工具：** 无

| 方面 | 详情 |
|------|------|
| **用途** | 记录所有重大事件并维护世界一致性 |
| **输入** | Intent, SimulationResult, GameContext |
| **输出** | 状态变更（NPC 记忆更新） |
| **依赖** | UnifiedEntityStore, EventBus |

**工作流：**
1. 从意图和结果创建事件描述
2. 发布到 EventBus 供其他系统使用
3. 更新附近角色的 NPC 记忆
4. 记录到时间线

---

## 配置代理（`DEFAULT_AGENTS`）

这些代理位于 `src/services/agent-config.ts`，支撑 Settings/Providers UI、`LLMQueue`/`LLMClient` 以及若干子系统。`chronicler` 与 Big Six 共享。它们的温度和 token 上限来自全局默认值（0.7 / 2048），除非在 `conf/agents.json` 中被覆盖。

| ID | 名称 | 优先级 | 使用者 |
|----|------|--------|--------|
| `director` | 导演 | 8 | 故事节拍注入 |
| `chronicler` | 编年史官 | 5 | 时间线摘要（也支持 `@mention`） |
| `story-planner` | 故事规划者 | 6 | 故事弧建议（`@mention`） |
| `social-sim` | 社会模拟器 | 4 | NPC 社会动态（`@mention`） |
| `villain` | 反派管理者 | 6 | 反派谋划（`@mention`） |
| `researcher` | 研究者 | 3 | `IdleResearchScheduler`、物品评估（`@mention`） |
| `translation` | 翻译 | 2 | 在输出边界上进行英语 ↔ 用户语言的翻译 |

**提示模板（模板变量 → 解析为的内容）：**

- **director** — `{narrative}`, `{beat}`。将故事节拍融入进行中的叙事。
- **chronicler** — `{events}`, `{timeline}`。按时间顺序总结新事件。
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`。输出：`{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`。
- **social-sim** — `{characters}`, `{relationships}`, `{context}`。描述关系变化和派系影响。
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`。规划反派的下一步行动。
- **researcher** — `{task}`, `{world_context}`。输出：`{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`。
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`。仅返回翻译后的文本。

---

## 对话系统 (v0.33.4)

用于结构化 NPC 对话的新 `DialogueManager` + `DialogueContext`：

| 功能 | 描述 |
|------|------|
| **会话管理** | 问候 → 活跃 → 告别的生命周期 |
| **关系感知** | 针对朋友/中立/敌人的问候与话题可用性 |
| **封建等级** | 领主/封臣的特殊问候 |
| **基于话题的选择** | 个人、派系、任务、交易、战斗、制造、传闻、八卦等 |
| **记忆记录** | 对话摘要存储在 NPC 长期记忆中 |

通过 `engine.dialogueManager` 访问（需要 `npcRuntime` 可用）。

**注意：** 聊天 `@mentions` 会路由到配置的处理器（`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`），而非 Big Six。`@narrator`, `@director`, `@scene`, `@npc` 已不复存在。

---

## Agent Registry v2

Big Six 注册在 `AgentRegistryV2`（`src/services/agent-registry-v2.ts`）中：

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## 代理接口 (v0.33.4)

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

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## 全局变量

这些变量通过游戏上下文可供代理使用：

| 变量 | 描述 |
|------|------|
| `{world_name}` | 当前世界名称（来自 world_frame.json） |
| `{time}` | 当前故事时间（ISO 字符串） |
| `{location}` | 当前角色位置 |
| `{character}` | 活跃角色名称 |
| `{role}` | 用户角色（主角、观察者等） |
| `{rules}` | 世界规则（魔法法则、社会规范等） |
| `{timeline}` | 最近的世界事件（来自 chronicler 的最近 5 条） |
| `{memories}` | 最近的角色扮演记忆 |
| `{facts}` | 已确立的世界事实 |
| `{npcs}` | 附近的 NPC 名称 |
| `{history}` | 最近的对话历史（最近 3 次交流） |
| `{events}` | 最近的事件（取决于上下文，最近 3–5 条） |
| `{world_state}` | 当前世界状态摘要 |
| `{world_context}` | 用于研究的世界上下文 |
| `{genre}` | 世界类型（奇幻、科幻、恐怖等） |
| `{magic_system}` | 魔法系统描述 |
| `{language}` | 主要世界语言（en, ru 等） |
| `{world_description}` | 世界描述/概要 |

---

## Temperature 指南

配置代理使用全局默认值（temperature 0.7，最大 token 数 2048），除非在 `conf/agents.json` 中被覆盖。

| 值 | 效果 | 用于 |
|----|------|------|
| 0.1 - 0.3 | 专注、确定性 | 研究、事实核查、意图解析 |
| 0.4 - 0.6 | 均衡 | Chronicler、社会模拟 |
| 0.7 - 0.8 | 创意 | 叙事、NPC 对话、反派谋划 |

---

## 在聊天中使用 @agent

从聊天向代理发送私信。聊天 `@mentions` 会路由到配置的处理器，而非 Big Six：

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

回应以左侧蓝色边框和括号中的代理名称标记。

Big Six（`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`）已注册在 `AgentRegistryV2` 中，但**无法**通过 `@mention` 访问。

---

## RAG 系统（嵌入 + 长期记忆）

所有代理都通过 RAG 拥有完整的嵌入支持与长期记忆：

- **llama.cpp 嵌入服务器** — 端口 5002 上的 BGE-M3 模型，用于向量生成
- **SQLite 混合检索** — FTS5 关键词检索 + 稠密向量检索 + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — 通过 `role` 列实现按代理、按会话的记忆隔离
- **按世界隔离的记忆** — 记忆按世界隔离，防止跨世界幻觉
- **Mojo 计算内核** — 5 个通过 FFI 的 Mojo 内核（带 TypeScript 回退）：
  - `probability_ffi.mojo` — 成功率、掷骰结果、批量概率
  - `vector_ffi.mojo` — 4 维向量运算（余弦、L2、点积）
  - `vector_full.mojo` — 全维向量运算（768 维 BGE-M3）
  - `batch_ops.mojo` — 批量 NPC 运算（年龄衰减、恶习、税收、忠诚）
  - `graph_ops.mojo` — 图遍历、RRF 融合、声誉计算

**记忆流：**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## MCP 集成 (v0.33.4)

### 圣经模式

圣经文本以节级粒度存储在 SQLite 中。每一节都是一个可供代理引用的原子指针。

**工具：**
- `search_verses` — 按文本、书卷或引用搜索
- `get_pattern` — 按原型、情绪或功能获取叙事模式
- `get_archetype` — 按名称获取原型详情

### 古腾堡风格

从古腾堡计划文本中提取的风格模式。去词汇化的描述在保留结构的同时不带角色名称。

**工具：**
- `get_style_pattern` — 按情绪、标签或描述搜索风格
- `apply_style` — 将风格应用到文本（去词汇化并返回建议）

### 维基百科校验

通过维基百科 API 进行历史事实核查。

**工具：**
- `verify_fact` — 核实一条事实性断言
- `get_context` — 获取某个主题的维基百科上下文

---

## 模板系统

### userTemplate 的工作原理

每个代理在 SQLite（`agent_prompts` 表）中存储一个 `userTemplate`，并有 JSON 文件回退。模板包含 `{var}` 占位符，运行时由 `resolveTemplate()`（`src/utils/template-resolver.ts`）替换为真实值。

**流程：**
1. 代理加载配置：`loadAgentConfig(agentId, world?, lang?)`
2. 先读取 SQLite 中的 `prompts.userTemplate`，再回退到 JSON
3. 使用上下文数据调用 `resolveTemplate(template, vars)`
4. 将解析后的提示发送给 LLM

**如果不存在 userTemplate** → 回退到 `PromptBuilder`（硬编码的 TypeScript 模板）。

---

## 玩家风格档案 (v0.33.4)

`PlayerProfileStore`（`src/lib/player-profile-store.ts`）提供跨代理的玩家风格档案，供 Stylist 与 LiteraryV2Generator 共享。

**跟踪的指标：**
| 指标 | 描述 |
|------|------|
| `avg_sentence_len` | 平均句子长度（以词计） |
| `sensory_bias` | 感官细节偏好（0–1） |
| `register_score` | 正式/非正式语域（0–1） |
| `dialogue_ratio` | 文本中对话的比例 |
| `narrative_distance` | 近距离 vs 远距离叙述（0–1） |
| `action_orientation` | 行动 vs 反思偏好（0–1） |
| `emotional_expressiveness` | 情感细节水平（0–1） |
| `preferred_pace` | 慢 / 中 / 快 |
| `literary_sophistication` | 词汇/结构复杂度（0–1） |
| `preferred_motifs` | 偏好的叙事母题 |
| `anti_patterns` | 避免的模式 |
| `sample_snippets` | 代表性文本片段 |
| `confidence` | 档案置信度（0–1） |

**存储：** `data/player-profiles.db`（SQLite，WAL 模式）

---

## 存储架构

### SQLite 数据库

项目通过 Bun 内置的 `bun:sqlite` 模块使用 SQLite。数据库文件是配置的 `dbPath` 中的 `tns.db`（默认 `./worlds/{active}`）。

**表：**
- `entities` — 带 FTS5 全文检索的世界实体
- `embeddings` — 用于语义检索的向量嵌入
- `memories` — 带 FTS5 的角色扮演记忆
- `agent_prompts` — 按世界 + 语言的代理提示
- `ui_translations` — 按语言 + 页面的 UI 翻译字符串

### JSON 文件存储（回退）

迁移期间，JSON 文件仍作为回退保留：

```
conf/
  settings.json          — 应用级设置（LLM、服务器、语言等）
  agents.json            — 全局代理模型/提供商分配
worlds/{active}/
  agents/{agentId}.json  — 按世界的代理提示（回退）
```
