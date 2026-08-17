# TrueNeverStory API 参考文档

TrueNeverStory 世界构建与角色扮演平台的 REST API。除非另有说明，所有端点均返回 JSON 格式。

**基础 URL：** `http://localhost:8000`

---

## 目录

- [健康检查](#健康检查)
- [聊天与角色扮演](#聊天与角色扮演)
- [世界](#世界)
- [实体与图谱](#实体与图谱)
- [会话](#会话)
- [分支](#分支)
- [概率](#概率)
- [恋爱](#恋爱)
- [任务](#任务)
- [反馈](#反馈)
- [规则引擎](#规则引擎)
- [功能标志](#功能标志)
- [API 版本控制](#api-版本控制)
- [记忆](#记忆)
- [维护](#维护)
- [系统](#系统)
- [代理](#代理)
- [提供商与模型](#提供商与模型)
- [设置](#设置)
- [启动](#启动)
- [WebSocket](#websocket)
- [认证](#认证)
- [跨世界](#跨世界)
- [插件](#插件)
- [监控](#监控)
- [国际化](#国际化)
- [世界存储](#世界存储)
- [维基研究](#维基研究)

---

## 健康检查

### `GET /health`
健康检查端点。

**响应：** `{ status: "ok", engine_ready: boolean, uptime: number, version: string }`

### `GET /system-check`
系统状态，包含 Node 版本和平台信息。

**响应：** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## 聊天与角色扮演

### `POST /chat/setup`
初始化或更新当前角色扮演会话。

**请求：**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**响应：** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
发送玩家消息，获取叙事响应。

**请求：** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**响应：** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
SSE 流式端点，用于渐进式叙事输出。请求体与 `/chat/message` 相同。

**响应：** Server-Sent Events 流：
- `event: start` — 会话状态
- `event: chunk` — 叙事文本片段
- `event: agent` — 代理响应（用于 `@agent` 提及）
- `event: heartbeat` — 保活注释（`: keepalive`）
- `event: done` — 最终状态
- `event: error` — 错误消息
- `data: [DONE]` — 流结束标记

### `POST /chat/agent`
向特定代理发送私信。

**请求：** `{ agentId: string, message: string }`

**响应：** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
获取当前会话状态。

**响应：** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
获取最近的对话历史。

**响应：** `{ user: string, assistant: string, timestamp: string }` 数组

---

## 世界

### `GET /worlds`
列出所有可用世界。

**响应：** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
获取当前活跃世界名称（轻量级）。

**响应：** `{ active: string }`

### `POST /worlds`
创建新世界。

**请求：** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**响应：** `{ status: "created", world }`

### `GET /worlds/:name`
获取世界详情和框架数据。

### `PUT /worlds/:name`
更新世界框架字段。

### `DELETE /worlds/:name`
删除世界。

### `POST /worlds/:name/switch`
切换活跃世界。

### `POST /worlds/:name/chapters/generate`
根据会话数据生成文学章节。

**请求：** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
列出已生成的章节。

### `GET /worlds/:name/chapters/:filename`
获取章节内容。

### `GET /worlds/:name/detail`
用于统计弹窗的完整世界统计信息。

**响应：**
```json
{
  "name": "default",
  "title": "My World",
  "description": "...",
  "genre": "fantasy",
  "language": "en",
  "worldRules": [{ "name": "...", "description": "..." }],
  "magicSystem": "...",
  "entityCounts": { "Character": 5, "Location": 3, "Faction": 2, "Item": 8 },
  "totalEntities": 18,
  "characters": [{ "name": "...", "summary": "...", "tags": [], "relationships": [] }],
  "locations": [{ "name": "...", "summary": "..." }],
  "factions": [{ "name": "...", "summary": "..." }],
  "items": [{ "name": "...", "summary": "..." }],
  "sessionCount": 4,
  "eventCount": 42,
  "chapterCount": 3,
  "villainCount": 1,
  "hasFrame": true
}
```

---

## 实体与图谱

### `GET /entity/:uid?layers=l1,l2,l3`
根据 UID 获取实体详情。

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
通过图遍历获取实体邻居。方向：`out`、`in` 或 `both`。

### `GET /path?source=Character:Kaelen&target=Location:Village`
查找两个实体之间的最短路径。

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
按名称或语义相似度搜索实体。

**响应：** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
图谱统计信息（节点/边数量、分支信息）。

### `GET /graph/d3?mode=relationships`
获取适用于 d3-force 可视化的图数据。模式：`relationships` 或 `crafting`。

**响应：** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## 会话

### `GET /sessions`
列出所有会话历史。

### `GET /sessions/list`
列出可用的游戏会话。

**响应：** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
获取会话的对话历史。

### `GET /sessions/:sessionId/summarize`
总结会话内容。

### `POST /sessions/export`
将会话导出为 Markdown 格式。

**请求：** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
列出已导出的 Markdown 文件。

### `GET /sessions/exports/:filename`
加载已导出的文件。

---

## 分支

### `POST /branch/create?name=my-branch&from_branch=main`
创建新的世界分支（类似 Git 的快照）。

### `POST /branch/switch?name=my-branch`
切换活跃分支。

### `POST /branch/merge?name=my-branch`
将分支合并到 main。

### `GET /branch/list`
列出所有分支。

---

## 概率

### `GET /probability/:character/:profile?target=optional`
获取角色动作的成功概率。

配置文件类型：`combat`、`persuasion`、`stealth`、`intimidation`、`deception`、`athletics`、`investigation`、`romance`、`generic`。

**响应：** `{ character, profile, probability: number }`

### `POST /probability/modifier`
应用临时概率修正。

**请求：** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
列出实体的活跃修正效果。

---

## 恋爱

### `GET /romance/:character1/:character2`
获取恋爱关系状态。

**响应：** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
尝试恋爱动作。动作类型：`attraction`、`confess`、`date`、`kiss`、`propose`、`breakup`。

**请求：** `{ character, target, location?, message? }`

**响应：** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
获取角色的所有恋爱关系。

---

## 任务

### `GET /quests`
列出所有任务及其进度。

### `GET /quest/:questId`
获取单个任务详情。

---

## 反馈

### `POST /feedback`
为上一个叙事回合记录喜欢/不喜欢/中立的反应。

**请求：** `{ turnId: number, reaction: 'like'|'dislike'|'neutral', techniques: string[] }`

当反应为 `dislike` 时，引擎会重新生成上一回合并返回 `{ ok, regenerated }`。否则返回 `{ ok: true }`。

---

## 规则引擎

### `GET /rules`
列出世界的社会/经济规则。

### `GET /rules/:id`
根据 ID 获取规则详情。

### `POST /rules/preview`
预览带修正效果的合并规则。请求体：`RulesConfig`。

### `POST /rules/check`
检查某个动作是否被允许。请求体：`{ config, action, superiorClass?, subordinateClass? }`。

---

## 功能标志

### `GET /feature-flags`
列出所有功能标志及其曝光状态。

### `GET /feature-flags/:id`
获取单个功能标志。

### `POST /feature-flags`
创建新功能标志。

### `PUT /feature-flags/:id`
更新功能标志。

### `DELETE /feature-flags/:id`
删除功能标志。

### `POST /feature-flags/:id/check`
检查功能标志在某个上下文（用户等）中是否启用。

---

## API 版本控制

TrueNeverStory 支持两个 API 版本：

- **v1** — 用于向后兼容的旧版包装器
- **v2** — 增强版本，集成代理注册表

旧版路由（`/api/*` 下的所有路由）包含弃用头信息：

- `X-API-Version: legacy`
- `Deprecation: true`
- `Sunset: 2026-12-31`

---

## 记忆

### `POST /memory/forget?older_than=30&min_importance=0.2`
清除旧的、低重要性的记忆。

### `POST /memory/summarise?tag=keyword`
按标签或节点 UID 总结记忆。

### `GET /memory/export?fmt=json`
导出所有记忆。

### `POST /memory/import`
从请求体导入记忆。

**请求：** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
更新记忆条目。

**请求：** `{ content: string }`

### `GET /memory/stats`
记忆系统统计信息。

### `POST /memory/rebuild`
重建 FAISS 向量索引。

### `GET /memory/retrieve?q=keyword&top_k=10`
对记忆进行语义搜索。

---

## 维护

### `POST /maintenance/run?full=true`
运行记忆维护（修剪、聚类、归档）。

### `GET /maintenance/status`
记忆与维护统计信息。

### `POST /maintenance/rebuild-index`
重建向量索引。

### `POST /maintenance/clean-orphans`
清理孤立的嵌入向量。

---

## 系统

### `POST /system/pause`
暂停角色扮演引擎。不接受参数。

### `POST /system/resume`
恢复角色扮演引擎。不接受参数。

### `GET /system/status`
获取引擎的运行/暂停状态。

---

## 代理

### `GET /agents`
列出所有已配置的代理。

**查询参数：** `world` — 可选，按特定世界筛选

### `GET /agents/:id`
获取单个代理配置。

**查询参数：** `world` — 可选，从特定世界加载

### `PUT /agents/:id`
更新代理配置（模型、温度、提示词等）。速率限制：每 IP 每分钟 30 次。

**查询参数：** `world` — 可选，保存到特定世界

### `PUT /agents/:id/prompts`
仅更新代理的提示词。

**查询参数：** `world` — 可选，保存到特定世界

### `POST /agents/:id/reset`
将代理重置为默认值。

### `GET /agents/providers/options`
获取可用于代理分配的提供商/模型选项。

### `GET /agents/:id/prompts/:lang`
获取特定语言的代理提示词。

### `PUT /agents/:id/prompts/:lang`
更新特定语言的代理提示词。

### `GET /agents/registry`
列出所有已注册的代理（AgentRegistry）。

### `GET /agents/registry/stats`
获取注册表统计信息。

### `GET /agents/registry/:id`
获取单个已注册代理。

### `PUT /agents/registry/:id`
更新已注册代理。

### `POST /agents/registry/:id/enable`
启用代理。

### `POST /agents/registry/:id/disable`
禁用代理。

### `DELETE /agents/registry/:id`
注销代理。

---

## 提供商与模型

### `GET /providers`
列出所有 LLM 提供商。

### `POST /providers`
添加新的提供商。

### `GET /providers/models`
列出所有提供商的模型。

### `POST /providers/health`
触发所有提供商的健康检查。

### `POST /providers/assign`
将提供商+模型分配给代理。

**请求：** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `GET /providers/assignments`
列出所有提供商-代理分配关系。

### `GET /providers/agents`
列出提供商管理器中的代理。

### `POST /providers/sync-from-agents`
从代理配置同步分配关系。

### `GET /providers/reset`
重置提供商管理器。

### `DELETE /providers/assign/:agentId`
移除代理的提供商分配。

### `GET /providers/:id`
获取提供商详情和可用模型。

### `PUT /providers/:id`
更新提供商配置。

### `DELETE /providers/:id`
移除提供商。

### `POST /providers/:id/default`
将提供商设为默认。

### `POST /providers/:id/keys`
添加 API 密钥。

### `DELETE /providers/:id/keys/:keyId`
移除 API 密钥。

### `GET /models`
列出所有已安装和可用的模型。

### `POST /models/install`
安装模型。

**请求：** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
移除模型。

### `POST /models/import`
导入本地模型文件。

### `POST /models/apply`
将模型应用到设置中。

### `GET /models/browse?path=/`
浏览文件系统中的模型文件。

---

## 设置

### `GET /settings`
获取当前设置（API 密钥已脱敏）。

### `PUT /settings`
更新设置。密码自动哈希处理，已脱敏的密钥将被忽略。

### `POST /settings/reset`
重置为默认值。

### `GET /languages`
列出可用的 UI 语言（EN、RU、DE、FR、ES、JA、ZH）。

### `GET /llm-config`
获取 LLM 服务器配置。

### `PUT /llm-config`
更新 LLM 服务器配置。

### `POST /server/restart`
重启 LLM 服务器。

### `GET /server/status`
检查 LLM 服务器状态。

---

## 启动

### `POST /launch`
创建新的游戏会话并生成角色。

**请求：** `{ hints?: string, isekai?: boolean, starting_age?: number, name?: string }`

- `name` — 显式角色名称（可选）。如果提供，将跳过 LLM 名称生成。支持非拉丁字符。

**响应：** `{ status: "success", session_id, character_name, opening_narrative, race, social_class, birthplace, initial_location }`

### `POST /continue`
继续已有会话。

**请求：** `{ session_id: string }`

**响应：** `{ status: "success", session_id, character_name, restored: boolean }`

### `POST /snapshot`
保存当前游戏状态。

**请求：** `{ session_id?: string }`

---

## WebSocket

### `GET /ws/*`
用于实时角色扮演的 WebSocket 端点。服务器在任何 `/ws/*` 路径上接受 WebSocket 升级。会话上下文由消息类型决定，而非 URL。

**客户端 → 服务器：** `{ type: "message", content: string }` 或 `{ type: "setup", ... }`
**服务器 → 客户端：** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## 认证

当启用密码认证时，会话使用 HttpOnly Cookie。在 fetch 调用中需包含 `credentials: "include"`。

---

## 跨世界

### `GET /api/cross-world/status`
获取跨世界通信状态。

**响应：** `{ enabled: boolean, portals: number, eventLog: number }`

### `POST /api/cross-world/enable`
启用跨世界通信。

**响应：** `{ enabled: true }`

### `POST /api/cross-world/disable`
禁用跨世界通信。

**响应：** `{ enabled: false }`

### `GET /api/cross-world/portals`
列出世界间的活跃传送门。

**响应：** `{ id, world1, world2, createdAt, active }` 数组

### `POST /api/cross-world/portals`
在两个世界之间创建传送门。

**请求：** `{ world1: string, world2: string }`

**响应：** `{ id, world1, world2, createdAt, active }`

### `DELETE /api/cross-world/portals/:id`
销毁传送门。

**响应：** `{ deleted: true }`

### `GET /api/cross-world/events?limit=50`
获取跨世界事件日志。

**响应：** `{ type, data, source, timestamp }` 数组

---

## 插件

### `GET /api/plugins`
列出所有已注册的插件。

**响应：** `{ id, name, version, description, agents, routes, hooks }` 数组

### `GET /api/plugins/:id`
获取插件详情。

**响应：** 包含完整详情的插件对象。

### `GET /api/plugins/:id/capabilities`
获取插件能力（代理、路由、钩子的数量）。

**响应：** `{ agents: number, routes: number, hooks: number }`

### `GET /api/plugins/agents/all`
获取插件注册的所有代理。

**响应：** `{ id, name, description, config }` 数组

### `GET /api/plugins/routes/all`
获取插件注册的所有路由。

**响应：** `{ path, method, handler }` 数组

---

## 监控

### `GET /monitoring/dashboard`
聚合监控仪表盘数据。

### `GET /monitoring/stats`
用于轮询的轻量级统计信息。

---

## 国际化

### `GET /i18n/translations/:lang/:page`
获取特定语言和页面的翻译。

### `GET /i18n/translations/:lang`
获取特定语言的所有翻译。

### `PUT /i18n/translations`
批量更新翻译。

### `DELETE /i18n/translations/:lang/:page/:key`
删除翻译键。

---

## 世界存储

### `POST /world-store/migrate`
将 JSON 数据迁移到 SQLite。

### `GET /world-store/stats`
获取迁移统计信息。

### `GET /world-store/quests`
从 SQLite 获取任务。

### `GET /world-store/npc-memories/:uid`
根据实体 UID 获取 NPC 记忆。

### `GET /world-store/frame`
从 SQLite 获取世界框架。

---

## 维基研究

### `POST /api/wiki/research/:worldId`
为世界发起维基百科研究。

### `GET /api/wiki/research/:worldId/progress`
正在进行研究的 SSE 进度流。

### `POST /api/wiki/research/:worldId/pause`
暂停正在进行的研究。

### `POST /api/wiki/research/:worldId/resume`
恢复已暂停的研究。

### `GET /api/wiki/research/:worldId/status`
获取研究状态。

---

*生成时间：2026-07-31 | TrueNeverStory v0.32.6*
