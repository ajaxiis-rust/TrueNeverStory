# TrueNeverStory API 参考文档

TrueNeverStory 世界构建和角色扮演平台的 REST API。除非另有说明，所有端点均返回 JSON。

**基础 URL:** `http://localhost:8000`

---

## 目录

- [健康检查](#健康检查)
- [聊天与角色扮演](#聊天与角色扮演)
- [世界](#世界)
- [实体与图谱](#实体与图谱)
- [会话](#会话)
- [分支](#分支)
- [概率](#概率)
- [浪漫](#浪漫)
- [任务](#任务)
- [记忆](#记忆)
- [维护](#维护)
- [代理](#代理)
- [提供商与模型](#提供商与模型)
- [设置](#设置)
- [启动](#启动)

---

## 健康检查

### `GET /health`
健康检查。

**响应:** `{ status: "ok", engine_ready: boolean, uptime: number }`

### `GET /system-check`
包含 Node 版本和平台信息的系统状态。

**响应:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## 聊天与角色扮演

### `POST /chat/setup`
初始化或更新活动的角色扮演会话。

**请求:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**响应:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
发送玩家消息，获取叙事响应。

**请求:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**响应:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
用于渐进式叙事交付的 SSE 流式传输。请求体与 `/chat/message` 相同。

**响应:** Server-Sent Events 流:
- `event: start` — 会话状态
- `event: chunk` — 叙事文本块
- `event: agent` — 代理响应（`@agent` 提及时）
- `event: done` — 最终状态
- `event: error` — 错误消息
- `data: [DONE]` — 流结束标记

### `POST /chat/agent`
向特定代理发送私密消息。

**请求:** `{ agentId: string, message: string }`

**响应:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
获取当前会话状态。

**响应:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
获取最近的对话历史。

**响应:** `{ user: string, assistant: string, timestamp: string }` 数组

---

## 世界

### `GET /worlds`
列出所有可用的世界。

**响应:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
获取活动世界名称（轻量级）。

**响应:** `{ active: string }`

### `POST /worlds`
创建新世界。

**请求:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**响应:** `{ status: "created", world }`

### `GET /worlds/:name`
获取世界详情和 frame 数据。

### `PUT /worlds/:name`
更新 world frame 字段。

### `DELETE /worlds/:name`
删除世界。

### `POST /worlds/:name/switch`
切换活动世界。

### `POST /worlds/:name/chapters/generate`
从会话数据生成文学章节。

**请求:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
列出已生成的章节。

### `GET /worlds/:name/chapters/:filename`
获取章节内容。

### `GET /worlds/:name/detail`
用于统计弹窗的完整世界统计数据。

**响应:**
```json
{
  "name": "default",
  "title": "我的世界",
  "description": "...",
  "genre": "fantasy",
  "language": "zh",
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
通过 UID 获取实体详情。

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
带图谱遍历的实体邻居。方向: `out`、`in` 或 `both`。

### `GET /path?source=Character:Kaelen&target=Location:Village`
查找两个实体之间的最短路径。

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
按名称或语义相似性搜索实体。

**响应:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
图谱统计（节点/边数量、分支信息）。

### `GET /graph/d3?mode=relationships`
用于 d3-force 可视化的图谱数据。模式: `relationships` 或 `crafting`。

**响应:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## 会话

### `GET /sessions`
列出所有会话历史。

### `GET /sessions/list`
列出可用的游戏会话。

**响应:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
获取会话的对话历史。

### `GET /sessions/:sessionId/summarize`
总结会话。

### `POST /sessions/export`
将会话导出为 Markdown。

**请求:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
列出已导出的 Markdown 文件。

### `GET /sessions/exports/:filename`
加载已导出的文件。

---

## 分支

### `POST /branch/create?name=my-branch&from_branch=main`
创建新的世界分支（类似 Git 的快照）。

### `POST /branch/switch?name=my-branch`
切换活动分支。

### `POST /branch/merge?name=my-branch`
将分支合并到 main。

### `GET /branch/list`
列出所有分支。

---

## 概率

### `GET /probability/:character/:profile?target=optional`
获取角色行动的成功概率。

配置文件: `combat`、`persuasion`、`stealth`、`intimidation`、`deception`、`athletics`、`investigation`、`romance`、`generic`。

**响应:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
应用临时概率修改器。

**请求:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
列出实体的活动修改器。

---

## 浪漫

### `GET /romance/:character1/:character2`
获取浪漫关系状态。

**响应:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
尝试浪漫行动。行动: `attraction`、`confess`、`date`、`kiss`、`propose`、`breakup`。

**请求:** `{ character, target, location?, message? }`

**响应:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
获取角色的所有浪漫关系。

---

## 任务

### `GET /quests`
列出所有带进度的任务。

### `GET /quest/:questId`
获取单个任务详情。

---

## 记忆

### `POST /memory/forget?older_than=30&min_importance=0.2`
遗忘旧的低重要性记忆。

### `POST /memory/summarise?tag=keyword`
按标签或节点 UID 总结记忆。

### `GET /memory/export?fmt=json`
导出所有记忆。

### `POST /memory/import`
从请求体导入记忆。

**请求:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
更新记忆条目。

**请求:** `{ content: string }`

### `GET /memory/stats`
记忆系统统计。

### `POST /memory/rebuild`
重建 FAISS 向量索引。

### `GET /memory/retrieve?q=keyword&top_k=10`
记忆的语义搜索。

---

## 维护

### `POST /maintenance/run?full=true`
运行记忆维护（修剪、聚类、归档）。

### `GET /maintenance/status`
记忆和维护统计。

### `POST /maintenance/rebuild-index`
重建向量索引。

### `POST /maintenance/clean-orphans`
清理孤立嵌入。

---

## 代理

### `GET /agents`
列出所有已配置的代理。

### `GET /agents/:id`
获取单个代理配置。

### `PUT /agents/:id`
更新代理配置（模型、温度、提示词等）。速率限制: 30 次/分/IP。

### `PUT /agents/:id/prompts`
仅更新代理的提示词。

### `POST /agents/:id/reset`
将代理重置为默认值。

### `GET /agents/providers/options`
获取可用于代理分配的提供商/模型选项。

---

## 提供商与模型

### `GET /providers`
列出所有 LLM 提供商。

### `POST /providers`
添加新提供商。

### `GET /providers/models`
列出所有提供商的模型。

### `POST /providers/health`
触发所有提供商的健康检查。

### `POST /providers/assign`
将提供商+模型分配给代理。

**请求:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
移除代理的提供商分配。

### `GET /providers/:id`
获取提供商详情和可用模型。

### `PUT /providers/:id`
更新提供商配置。

### `DELETE /providers/:id`
删除提供商。

### `POST /providers/:id/default`
将提供商设为默认。

### `POST /providers/:id/keys`
添加 API 密钥。

### `DELETE /providers/:id/keys/:keyId`
删除 API 密钥。

### `GET /models`
列出所有已安装和可用的模型。

### `POST /models/install`
安装模型。

**请求:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
删除模型。

### `POST /models/import`
导入本地模型文件。

### `POST /models/apply`
将模型应用到设置。

### `GET /models/browse?path=/`
浏览文件系统查找模型文件。

---

## 设置

### `GET /settings`
获取当前设置（API 密钥已掩码）。

### `PUT /settings`
更新设置。密码自动哈希，掩码密钥被忽略。

### `POST /settings/reset`
重置为默认值。

### `GET /languages`
列出可用的 UI 语言（EN、RU、DE、FR、ES、JA、ZH）。

---

## 启动

### `POST /launch`
创建带有角色生成的新游戏会话。

**请求:** `{ hints?: string, isekai?: boolean, starting_age?: number }`

**响应:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
继续现有会话。

**请求:** `{ session_id: string }`

**响应:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
实时角色扮演的 WebSocket 端点。消息为 JSON:

**客户端 → 服务器:** `{ type: "message", content: string }`
**服务器 → 客户端:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## 认证

当启用密码认证时，会话使用 HttpOnly Cookie。在 fetch 调用中包含 `credentials: "include"`。

---

*生成时间: 2026-06-27 | TrueNeverStory v0.12.0*
