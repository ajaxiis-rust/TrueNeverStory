# 迁移指南：JSON 到 SQLite

本指南介绍世界数据从 JSON 文件到 SQLite 的迁移，以及 TrueNeverStory 使用的存储布局。

## 概述

TrueNeverStory 通过 `WorldStore` 类（`src/store/world-store.ts`）将世界数据存储在 **SQLite** 中。数据库文件为 `tns.db`，在世界目录（`<worldPath>/tns.db`）内创建，并启用 WAL 日志模式。

原始 JSON 文件仍保留在世界目录中作为迁移源，且永远不会被删除 — 它们充当回退和历史的记录。

## v0.32.5 迁移：文学编译器与经济学模型

v0.32.5 版本新增了文学编译器与经济学模型。无需迁移 — 这些是扩展现有状态优先管道的附加功能。

## v0.32.5 迁移：状态优先管道

### 变更内容

v0.32.5 版本引入了状态优先的管道架构。两个代理系统现在共存：

1. **The Big Six (AgentV2)** — 叙事散文管道（`dramaturg`、`validator`、`stylist`、`actor`、`censor`、`chronicler`），注册在 `AgentRegistryV2` 中。
2. **配置代理（`DEFAULT_AGENTS`）** — `src/services/agent-config.ts` 中的配置驱动代理（`director`、`chronicler`、`story-planner`、`social-sim`、`villain`、`researcher`、`translation`），支撑 Settings/Providers UI 和若干子系统。

**旧管道：**
```
User Intent → Agent Selection → Agent Execution → Response
```

**新管道：**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**被移除的代理：**

| 被移除 | 替代者 |
|---------|-------------|
| `narrator`、`scene` | `stylist`（散文生成） |
| `historian` | `validator`（事实核查） |
| `cartographer`、`lorekeeper`、`merchant`、`quest-giver` | （已移除） |
| `npc` | `actor`（NPC 对话） |

`villain`、`social-sim`、`researcher` 和 `director` 仍作为配置代理可用。`crafter` 仍作为制造子系统保留。

**向后兼容性：** 被移除的代理 ID（`@narrator`、`@npc`、`@scene`、`@director`）已不复存在且无法解析。聊天 `@mentions` 仅路由到配置的处理器（`@chronicler`、`@story-planner`、`@social-sim`、`@villain`、`@researcher`）。

### MCP 集成

v0.32.5 引入了 Model Context Protocol (MCP) 工具用于外部知识访问：

| MCP 服务器 | 工具 | 用途 |
|------------|-------|---------|
| Bible Parser | `search_verses`、`get_pattern`、`get_archetype` | 来自圣经文本的叙事模式 |
| Gutenberg Parser | `get_style_pattern`、`apply_style` | 来自文学的风格模式 |
| Wikipedia Tools | `verify_fact`、`get_context` | 历史事实核查 |

**配置：**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### 新依赖

| 依赖 | 状态 | 用途 |
|------------|--------|---------|
| Zod | 已在项目中 | 模式校验 |
| Mojo FFI | 已在项目中 | 计算内核 |
| TranslationService | 无外部依赖 | UI 翻译 |

### 破坏性变更

- **RoleplayEngine 内部流程已重写** — 管道现在遵循 模拟 → 模式 → 风格 → 对话 → 检查 → 记忆
- **AgentV2.process() 取代 generateResponse()** — 新签名：`process(intent, simulation, context, pattern?)`
- **createRoleplayEngine() 需要新的依赖** — MCP 服务器引用、AgentRegistryV2、EventBus
- **`getLanguageInstruction()` 已移除** — 语言处理移至输出边界上的 `TranslationService`

---

## 存储布局

### SQLite 数据库

`WorldStore` 构造函数在世界目录内打开（若缺失则创建）一个 `tns.db` 文件：

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**初始化时创建的表（`CREATE TABLE IF NOT EXISTS`）：**

| 表 | 用途 |
|-------|---------|
| `quests` | 任务数据（`id`、`title`、`description`、`giver`、`objectives`、`status`、时间戳） |
| `npc_memories` | NPC 短期和长期记忆，按 `npc_uid` + `memory_type` 索引 |
| `story_arcs` | 故事规划器弧线数据（每行一个 JSON blob） |
| `world_frame` | 世界框架键/值对 |
| `director_state` | 导演状态键/值对 |
| `villains` | 反派数据（每行一个 JSON blob） |

### JSON 文件（迁移源）

原始 JSON 文件位于同一世界目录中，并作为迁移源读取。迁移后它们永远不会被删除：

| JSON 文件 | 迁移到的表 |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## 迁移流程

### 触发迁移

迁移通过 HTTP 端点按需运行（启动时没有自动迁移）：

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

`migrate()` 方法在自己的 `try/catch` 中独立迁移每个数据源，因此一个数据源的失败不会中止其他数据源。每个成功迁移的数据源都会追加到 `migrated`；任何失败都会记录在 `errors` 中。

**迁移的数据源（按顺序）：** `quests`、`npc_profiles`、`world_frame`、`story_planner`、`director_state`、`villains`。

如果某个 JSON 源文件缺失或无法解析，则该数据源会被静默跳过（读取辅助函数返回 `null`）。

### 旧路径迁移

在启动时（`src/index.ts`），如果 `WORLDS_ROOT` 目录不存在，则会创建它，并将旧的 `WORLD_DB_PATH` 目录（例如 `world_db/`）重命名为 `worlds/default/`：

```
world_db/  →  worlds/default/
```

## WorldStore API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## API 端点

路由器（`src/routes/world-store.ts`）挂载在 `/api` 下。每个端点都接受可选的 `?world=` 查询参数以指定某个世界（默认为当前活动世界）：

| 方法 | 路径 | 描述 |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | 将 JSON 文件迁移到 SQLite；返回 `{ status, world, migrated, errors }` |
| `GET` | `/api/world-store/stats` | 返回 `{ world, stats }`（任务、记忆、世界框架键的计数） |
| `GET` | `/api/world-store/quests` | 从 SQLite 列出任务 |
| `GET` | `/api/world-store/npc-memories/:uid` | NPC 记忆（`?type=short_term\|long_term_episodic`） |
| `GET` | `/api/world-store/frame` | 世界框架键/值对 |

## 回滚

如果迁移失败或需要回滚：

1. SQLite 数据隔离在 `worlds/{name}/tns.db` 中
2. 原始 JSON 文件保留在 `worlds/{name}/` 中
3. 删除 `worlds/{name}/tns.db` 以重置为仅 JSON 的状态
4. 重新运行 `POST /api/world-store/migrate` 以再次从 JSON 迁移

## 故障排查

### “表已存在”错误

这是正常现象 — 表是使用 `IF NOT EXISTS` 创建的。

### 迁移后数据缺失

检查 JSON 源文件是否存在于世界目录中且是有效的 JSON。无法解析的文件会被静默跳过，仅当解析抛出异常时才会报告 — 检查迁移结果中的 `errors` 数组以了解详情。

### 性能

- `WorldStore` 中默认启用 SQLite WAL 模式
- 设置 `PRAGMA synchronous = NORMAL` 以在持久性和速度之间取得平衡
- 在大型数据库上定期运行 `PRAGMA optimize`
