# 代理参考

TrueNeverStory 使用多代理架构，每个代理处理叙事的特定方面。每个代理都有自己的 LLM 配置、系统提示和用户模板。

## 全局变量

这些变量通过世界状态上下文对大多数代理可用：

| 变量 | 描述 |
|------|------|
| `{world_name}` | 当前世界名称（来自 world_frame.json） |
| `{time}` | 当前故事时间（ISO 字符串） |
| `{location}` | 当前角色位置 |
| `{character}` | 活跃角色名称 |
| `{role}` | 用户角色（主角、观察者等） |
| `{rules}` | 世界规则（魔法法则、社会规范等） |
| `{timeline}` | 最近的世界事件（编年史的最后 5 条） |
| `{memories}` | 最近的角色扮演记忆 |
| `{facts}` | 已确立的世界事实 |
| `{npcs}` | 附近的 NPC 名称 |
| `{history}` | 最近的对话历史（最后 3 次交流） |
| `{events}` | 最近的事件（取决于上下文，最后 3-5 条） |
| `{world_state}` | 当前世界状态摘要 |
| `{world_context}` | 用于研究的世界上下文 |

## 代理

### 叙述者（`narrator`）

**描述：** 主要故事讲述者。从故事上下文生成世界叙事。

**模板变量：**
`{world_name}` `{time}` `{location}` `{character}` `{role}` `{rules}` `{timeline}` `{memories}` `{facts}` `{npcs}` `{history}`

**系统提示：** 将叙述者定义为熟练的故事讲述者。以第二/第三人称编写生动、沉浸式的散文。绝不打破角色。

**Temperature：** 0.8 | **最大令牌：** 4096 | **优先级：** 10（最高）

---

### 导演（`director`）

**描述：** 故事节拍注入。将戏剧性时刻融入叙事中。

**模板变量：**
`{narrative}` `{beat}`

| 变量 | 描述 |
|------|------|
| `{narrative}` | 要注入节拍的当前叙事文本 |
| `{beat}` | 故事节拍描述（诱发事件、揭示、挫折等） |

**Temperature：** 0.7 | **最大令牌：** 2048 | **优先级：** 8

---

### 场景生成器（`scene`）

**描述：** 角色在不同位置间移动时的场景过渡叙事。

**模板变量：**
`{character}` `{origin}` `{destination}` `{rules}` `{events}`

| 变量 | 描述 |
|------|------|
| `{origin}` | 当前位置（角色离开的地方） |
| `{destination}` | 目标位置（角色要去的地方） |

**Temperature：** 0.8 | **最大令牌：** 2048 | **优先级：** 7

---

### NPC 代理（`npc`）

**描述：** NPC 对话和反应。扮演单个角色。

**模板变量：**
`{npc_name}` `{npc_personality}` `{player}` `{location}` `{relationship}` `{events}` `{line}`

| 变量 | 描述 |
|------|------|
| `{npc_name}` | 被扮演的 NPC 名称 |
| `{npc_personality}` | NPC 的性格特征（来自实体档案） |
| `{player}` | 玩家角色的名称 |
| `{relationship}` | 与玩家的关系（朋友、中立、敌人等） |
| `{line}` | 玩家对 NPC 说的话 |

**Temperature：** 0.7 | **最大令牌：** 1024 | **优先级：** 9

---

### 编年史（`chronicler`）

**描述：** 时间线管理。总结事件并维护世界历史。

**模板变量：**
`{events}` `{timeline}`

| 变量 | 描述 |
|------|------|
| `{events}` | 要记录的新事件（最近的行动、移动、对话） |
| `{timeline}` | 用于上下文的现有时间线 |

**Temperature：** 0.5 | **最大令牌：** 1024 | **优先级：** 5

---

### 故事规划器（`story-planner`）

**描述：** 故事弧线规划。规划任务和情节发展。

**模板变量：**
`{world_state}` `{characters}` `{events}` `{quests}`

| 变量 | 描述 |
|------|------|
| `{characters}` | 世界中的活跃角色 |
| `{quests}` | 当前活跃的任务 |

**输出格式：**
```json
{"arc": "描述", "quests": [{"title": "", "description": "", "objectives": [""]}], "hooks": [""]}
```

**Temperature：** 0.7 | **最大令牌：** 2048 | **优先级：** 6

---

### 社交模拟器（`social-sim`）

**描述：** 社交动态。模拟 NPC 关系和互动。

**模板变量：**
`{characters}` `{relationships}` `{context}`

| 变量 | 描述 |
|------|------|
| `{relationships}` | 角色之间的当前关系图 |
| `{context}` | 社交上下文（会面、冲突、联盟等） |

**Temperature：** 0.6 | **最大令牌：** 1024 | **优先级：** 4

---

### 反派管理者（`villain`）

**描述：** 反派管理。策划反派行动和邪恶计划。

**模板变量：**
`{villain}` `{world_state}` `{recent_actions}`

| 变量 | 描述 |
|------|------|
| `{villain}` | 反派档案（性格、目标、能力） |
| `{recent_actions}` | 世界中反派最近的行动 |

**Temperature：** 0.8 | **最大令牌：** 2048 | **优先级：** 6

---

### 研究员（`researcher`）

**描述：** 事实核查、真实感验证和世界构建研究。

**模板变量：**
`{task}` `{world_context}`

| 变量 | 描述 |
|------|------|
| `{task}` | 研究任务（食谱验证、角色验证、场景丰富化、事实核查） |

**输出格式：**
```json
{"verdict": "plausible|questionable|unrealistic", "confidence": 0.0-1.0, "issues": [], "suggestions": [], "enrichedDetails": ""}
```

**Temperature：** 0.3 | **最大令牌：** 2048 | **优先级：** 3（最低）

---

## Temperature 指南

| 值 | 效果 | 用于 |
|----|------|------|
| 0.1 - 0.3 | 专注、确定性 | 研究、事实核查 |
| 0.4 - 0.6 | 平衡 | 编年史、社交模拟 |
| 0.7 - 0.8 | 创意 | 叙事、NPC 对话、反派计划 |

## 在聊天中使用 @agent

从聊天向任何代理发送私信：

```
@narrator 描述黄昏时古老森林的氛围
@director 建议一个戏剧性的情节转折
@researcher 这把中世纪武器在历史上准确吗？
@chronicler 总结过去一小时发生的事情
```

响应以蓝色左边框和括号中的代理名称标记。

## 优先级

当多个 LLM 请求排队时，优先级较高的代理先被处理。

| 代理 | 优先级 |
|------|--------|
| narrator | 10（最高） |
| npc | 9 |
| director | 8 |
| scene | 7 |
| story-planner | 6 |
| villain | 6 |
| chronicler | 5 |
| social-sim | 4 |
| researcher | 3（最低） |

### 语言指令注入

LLM响应会自动匹配所选的UI语言。语言指令在初始化时通过`seedWorldAgents()`烘焙到代理提示中，运行时也由`getLanguageInstruction()`追加：

| 语言 | 注入文本 |
|------|----------|
| en | `IMPORTANT: Always respond in English.` |
| ru | `ВАЖНО: Всегда отвечай на русском языке.` |
| de | `WICHTIG: Antworte immer auf Deutsch.` |
| fr | `IMPORTANT: Réponds toujours en français.` |
| es | `IMPORTANTE: Responde siempre en español.` |
| ja | `重要：常に日本語で回答してください。` |
| zh | `重要：请始终用中文回复。` |

在创建世界时，`seedWorldAgents()`将所有14个代理写入系统提示，并附加语言指令。这确保新世界从适当的语言隔离开始。运行时`getLanguageInstruction()`由`dialogue-context.ts`用于动态NPC对话。

### 提示API端点

| 方法 | 路径 | 描述 |
|------|------|------|
| `GET` | `/api/agents` | 列出所有代理（接受`?world=`） |
| `GET` | `/api/agents/:id` | 获取单个代理配置（接受`?world=`） |
| `PUT` | `/api/agents/:id` | 更新代理配置（接受`?world=`） |
| `PUT` | `/api/agents/:id/prompts` | 更新提示（接受`?world=`） |
| `GET` | `/api/agents/:id/prompts/:lang` | 获取特定语言的提示 |
| `PUT` | `/api/agents/:id/prompts/:lang` | 插入/更新特定语言的提示 |

**查询参数：**
- `world` — 可选，默认从设置中获取活动世界。所有代理端点支持`?world=`，用于在不切换活动世界的情况下进行按世界操作。

**响应示例：**
```json
{
  "agentId": "narrator",
  "language": "ru",
  "world": "levant",
  "prompts": {
    "systemPrompt": "...",
    "userTemplate": "...",
    "outputFormat": "..."
  }
}
```
