# Wikipedia RAG Enrichment

## 概述

TrueNeverStory 使用 Wikipedia 为游戏世界注入现实知识。在创建世界时，系统会自动研究相关主题并构建 RAG（检索增强生成）索引。

## 架构

1. **WikipediaResearcher** — 从 Wikipedia API 获取文章，带有重试逻辑
2. **WikiRAGBuilder** — 将文章分块并构建向量索引
3. **WorldCreationProgress** — 通过 SSE 跟踪进度
4. **IdleResearchScheduler** — 在玩家空闲时充实 RAG

## 使用方法

### 自动研究

创建世界时，Wikipedia 研究会自动进行：

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### 手动研究

从界面启动研究：
- 点击 "🌍 Исследовать Wikipedia" 按钮
- 通过 SSE 端点监控进度
- 根据需要暂停/恢复

### CLI 进度

创建世界时进度会在终端显示：

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## API 端点

- `GET /api/wiki/research/:worldId/progress` — SSE 进度流
- `POST /api/wiki/research/:worldId` — 开始研究
- `POST /api/wiki/research/:worldId/pause` — 暂停研究
- `POST /api/wiki/research/:worldId/resume` — 恢复研究
- `GET /api/wiki/research/:worldId/status` — 获取当前状态

## 配置

### 重试策略
- 每篇文章 5 次尝试
- 每次尝试 2 分钟超时
- 指数退避：5s → 10s → 20s → 40s → 80s

### 空闲充实
- 在 1 小时无活动后触发
- 每次会话处理最多 10 个主题
- 可配置阈值

## MCP 集成

Wikipedia 搜索工具可通过 MCP 使用：

```typescript
import { WikiSearchTool } from './mcp/wiki/wiki-search';

const tool = new WikiSearchTool();
tool.registerRAGBuilder(worldId, ragBuilder);

const results = await tool.search({
  query: 'medieval knighthood',
  worldId: 'my-world',
  limit: 10,
});
```

## 文件结构

```
src/services/
├── wikipedia-researcher.ts      # Wikipedia API 客户端
├── wiki-rag-builder.ts          # 文章分块
├── idle-research-scheduler.ts   # 后台充实
└── world-creation-progress.ts   # 进度跟踪

src/mcp/wiki/
├── index.ts                     # 模块导出
└── wiki-search.ts               # MCP 搜索工具

src/routes/
└── wiki-research.ts             # SSE 端点

src/utils/
└── progress-bar.ts              # CLI 进度显示
```

## 错误处理

- Wikipedia API 错误会被记录并重试
- 失败的文章会被跳过，研究继续进行
- 优雅降级：即使 Wikipedia 不可用，世界也会创建
- 所有错误都在进度管理器中跟踪
