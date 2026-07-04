# TrueNeverStory v0.15.0 – 交互式叙事游戏平台

**TrueNeverStory v0.15.0** 是 [BRING](https://github.com/Eva-E1/BRING) 奇幻世界平台的现代重新实现，从 Python 迁移到高性能混合技术栈：

- **TypeScript (Bun + Hono)** – Web 服务器、API、WebSocket、路由、认证、流式传输、业务逻辑
- **C FFI内核（通过Zig编译，带TypeScript回退）** – 概率计算和向量操作的计算内核（通过Zig编译，带TypeScript回退）

> *"从一个提示到一个活生生的世界——每个 NPC 都记得，每个行动都有机会，故事永不停止。"*

---

## 功能特性

| 功能 | 描述 |
|------|------|
| **分层世界构建** | 每个实体（角色、地点、物品、阵营）有三个层次：L1（分类）、L2（细节）、L3（秘密） |
| **图谱知识** | 所有关系在有向图中，支持 O(1) 查找、BFS 遍历、分支管理 |
| **自优化记忆** | 向量加速记忆与认知管道（实体提取、矛盾检测、痛苦信号） |
| **全代理 RAG** | 通过 llama.cpp (BGE-M3) + SQLite 混合搜索（FTS5 + 密集向量 + RRF）的完整嵌入支持 |
| **概率系统** | 战斗、说服、潜行、浪漫的确定性结果，带动态修饰符 |
| **浪漫系统** | 完整的浪漫关系管理，基于概率的行动 |
| **活导演** | 后台代理推进故事弧线、反派计划、NPC 互动 |
| **沉浸式角色扮演** | 第三人称叙事、NPC 对话、场景转换——LLM 绝不代替你的角色说话 |
| **任务系统** | 动态任务生成和目标追踪 |
| **故事规划器** | LLM驱动的动态弧线规划、两阶段生成、自适应重规划 |
| **研究员代理** | 事实核查、真实感验证、食谱/角色/场景的历史准确性 |
| **NPC 智能** | 记忆搜索、自主行为、社交关系、丰富的对话上下文 |
| **NPC 经济** | 封建等级（10 个等级）、税收、贿赂、食物生产、家庭系统、恶习、34 种原型 |
| **物品系统** | 具有永久属性提升（1-10%）的独特物品，由历史学家/研究员代理评估 |
| **14 个专业代理** | 叙述者、导演、场景、NPC、编年史、故事规划、社交模拟、反派、研究员、历史学家、地图师、商人、任务给予者、知识守护者 |
| **实时 WebSocket** | 实时角色扮演流和记忆事件广播 |
| **SSE 流式传输** | 通过 Server-Sent Events 渐进式交付叙事 |
| **i18n（7 种语言）** | 完整本地化：EN、RU、DE、FR、ES、JA、ZH——界面、提示词、代理名称 |
| **SQLite 存储** | 代理提示词和 UI 字符串按世界+语言存储在 SQLite 中 |
| **密码认证** | 基于会话的 HttpOnly Cookie 认证 |
| **终端 UI** | 美观的暗色终端风格 Web 界面 |

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Terminal UI)                   │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              服务层                                 │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           记忆系统 (WorldMemory)                     │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           数据层 (EntityStore + JSON)                │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      C FFI内核（通过Zig编译）                          │  │
│  │  概率内核 │ 向量操作                                 │  │
│  │  .so/.dylib/.dll → dlopen() 或 TypeScript回退       │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP（兼容 OpenAI）
┌───────────────────────▼─────────────────────────────────┐
│              外部 LLM API（Ollama、OpenAI 等）            │
└─────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 前提条件

- [Bun](https://bun.sh) v1.0+（用于开发）
- 兼容 OpenAI 的 LLM API（OpenAI、Ollama、vLLM、LM Studio 等）

编译后的二进制文件 — 无需任何依赖，直接运行。

### 1. 安装

```bash
cd TNS
bun install
```

### 2. 配置 LLM

打开 `http://localhost:8000/settings` 并配置 LLM 提供商：

- **Ollama**（本地）: `http://localhost:11434/v1`，模型: `llama3`
- **OpenAI**: `https://api.openai.com/v1`，模型: `gpt-4o-mini`
- **vLLM**（本地）: `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

或直接编辑 `conf/settings.json`。

### 3. 启动

```bash
bun run dev
```

打开 `http://localhost:8000`，使用密码登录: **`changeme`**

首次登录后，请在设置中更改密码。

### 二进制文件（无依赖）

```bash
# 从 GitHub Releases 下载后：
chmod +x tns-server
./tns-server
# 登录: http://localhost:8000 — 密码: changeme
```

---

## 使用示例

### 从二进制文件运行（无需依赖）

下载适合您平台的最新版本并直接运行：

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

无需 Bun、Node.js 或其他运行时。配置好 `.env` 即可运行。

### 从源代码运行（开发）

```bash
# 热重载开发模式
bun run dev

# 生产模式（无热重载）
bun run start

# 仅构建包（不生成二进制）
bun run build
```

### 使用本地 LLM 运行（Ollama）

```bash
# 1. 启动 Ollama 并加载模型
ollama pull llama3
ollama serve

# 2. 配置 TNS 使用 Ollama
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. 启动服务器
./tns-server
```

### 使用 OpenAI API 运行

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### API 调用示例

```bash
# 认证
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# 开始新会话
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "阿拉贡", "role": "protagonist"}'

# 发送消息并获取叙事
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "我拔出剑，面对巨龙"}'

# 流式响应（SSE）
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "告诉我关于这片古老森林的事"}'

# 搜索实体
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# 获取实体详情
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# 获取图的邻居
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# 检查概率
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# 列出任务
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket 实时角色扮演

```javascript
// WebSocket 连接
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: '我走进酒馆，环顾四周'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // 实时叙事流
};
```

### 从源代码编译

```bash
# 安装 Mojo（可选，用于性能内核）
curl https://get.modular.com | sh
modular install mojo

# 为当前平台编译
./build.sh compile

# 为特定平台编译
./build.sh compile linux-x64
./build.sh compile macos-arm64

# 交叉编译所有平台
./build.sh cross

# 详情请参阅 COMPILE.md
```

---

## API 端点

### 认证

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/login` | 登录页面 |
| POST | `/login` | 认证（表单：`password=...`） |
| POST | `/logout` | 清除会话 |

### 聊天

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/chat/setup` | 初始化角色扮演会话 |
| POST | `/api/chat/message` | 发送消息，获取叙事 |
| POST | `/api/chat/stream` | SSE 流式响应 |
| GET | `/api/chat/session` | 当前会话状态 |
| GET | `/api/chat/history` | 对话历史 |

### 实体与图谱

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/entity/:uid` | 实体详情 |
| GET | `/api/neighbors/:uid` | 带深度的邻居 |
| GET | `/api/path` | 查找最短路径 |
| GET | `/api/search` | 按名称或语义搜索 |
| GET | `/api/graph/summary` | 图谱统计 |

### 分支

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/branch/create` | 创建分支 |
| POST | `/api/branch/switch` | 切换活动分支 |
| POST | `/api/branch/merge` | 合并到 main |
| GET | `/api/branch/list` | 列出所有分支 |

### 概率

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/probability/:character/:profile` | 成功概率 |
| POST | `/api/probability/modifier` | 应用修饰符 |
| GET | `/api/probability/modifiers/:entity` | 活跃修饰符 |

### 浪漫

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/romance/:c1/:c2` | 关系状态 |
| POST | `/api/romance/attempt/:action` | 尝试浪漫行动 |
| GET | `/api/romance/characters/:char` | 角色的浪漫列表 |

### 任务

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/quests` | 列出所有任务 |
| GET | `/api/quest/:id` | 任务详情 |

### 会话与维护

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/sessions` | 会话历史列表 |
| POST | `/api/maintenance/run` | 运行维护 |
| GET | `/api/maintenance/status` | 维护统计 |
| POST | `/api/launch` | 开始新游戏 |
| POST | `/api/continue` | 继续游戏 |
| GET | `/api/health` | 健康检查 |

### 系统（后台处理）

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/system/pause` | 暂停导演循环和LLM队列 |
| POST | `/api/system/resume` | 恢复导演循环和LLM队列 |
| GET | `/api/system/status` | 获取暂停/运行状态 |

### 代理

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/agents` | 列出所有代理配置 |
| GET | `/api/agents/:id` | 获取单个代理配置 |
| PUT | `/api/agents/:id` | 更新代理配置 |
| PUT | `/api/agents/:id/prompts` | 更新代理提示词 |
| POST | `/api/agents/:id/reset` | 重置为默认值 |
| GET | `/api/agents/providers/options` | 提供商/模型选项 |

### WebSocket

| 端点 | 描述 |
|------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | 实时角色扮演 |
| `ws://host:8000/ws/memory` | 记忆事件流 |

---

## 项目结构

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod 验证的环境配置
│   ├── lib/              # LLM 客户端、队列、事件总线、历史、原子 I/O
│   ├── memory/           # WorldMemory、FAISS 索引、认知管道、评分
│   ├── middleware/        # Auth、CORS、错误处理、日志、限流
│   ├── models/           # Entity、chat、probability、romance、quest、story、memory
│   ├── routes/           # 13 个路由模块（chat、entities、agents 等）
│   ├── services/         # 23 个服务（角色扮演引擎、代理、概率等）
│   ├── intelligence/     # 图谱分析、去重、推荐、场景生成
│   ├── i18n/             # 语言包（EN、RU、DE、FR、ES、JA、ZH）
│   ├── store/            # 带 O(1) NameIndex 的 EntityStore
│   ├── utils/            # 日志、哈希、时间工具
│   ├── app.ts            # 带中间件链的 Hono 应用
│   └── index.ts          # 服务器入口点
├── mojo/
│   ├── kernels/          # FFI 概率和向量内核
│   └── src/              # 81 个 Mojo 源文件（可选性能后端）
├── public/
│   ├── index.html        # 终端风格 Web UI
│   ├── agents.html       # 代理配置（i18n 支持）
│   ├── providers.html    # LLM 提供商设置
│   ├── models.html       # 模型管理
│   └── settings.html     # 全局设置
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # 配置（git 忽略）
├── .env.example          # 配置模板
├── startgame.sh          # 服务器 + llama-server 启动器（带 PID 清理）
├── package.json
├── tsconfig.json
└── plan.md               # 迁移计划
```

---

## 配置

所有配置通过环境变量（`.env` 文件）：

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `WORLD_LLM_BASE_URL` | – | 兼容 OpenAI 的 LLM 端点 |
| `WORLD_LLM_API_KEY` | – | API 密钥 |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | 模型名称 |
| `WORLD_LLM_TIMEOUT` | `120` | 请求超时（秒） |
| `WORLD_LLM_MAX_TOKENS` | `4096` | 每个响应的最大令牌 |
| `WORLD_LLM_TEMPERATURE` | `0.7` | 采样温度 |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | 最大并发 LLM 请求数 |
| `WORLD_DB_PATH` | `./worlds/default` | 数据库目录 |
| `LOCAL_MODELS_PATH` | `./local-models` | 本地GGUF模型目录 |
| `WORLD_SERVER_HOST` | `0.0.0.0` | 监听地址 |
| `WORLD_SERVER_PORT` | `8000` | 监听端口 |
| `AUTH_PASSWORD` | – | 登录密码（空 = 无认证） |
| `MAX_SERVE_URL` | `http://localhost:8000` | Mojo MAX Serve 端点 |

---

## 开发

```bash
# 热重载开发
bun run dev

# 类型检查
npx tsc --noEmit

# 运行所有测试
bun test

# 运行特定测试
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# 生产构建
bun run build
```

---

## 最近更改

### C FFI内核和交叉编译 (v0.14.1)

将Mojo计算内核移植到纯C，通过Zig交叉编译支持10个平台：

| 功能 | 描述 |
|------|------|
| **C FFI内核** | 5个计算内核从Mojo移植到纯C（probability, vector, vector_full, batch_ops, graph_ops） |
| **Zig交叉编译** | 单一构建脚本，编译Linux、macOS、Windows、ARM、RISC-V |
| **10个平台目标** | aarch64/x86_64 Linux (glibc+musl)、macOS、Windows、ARMv7、RISC-V |
| **可分发包** | 每个发布包包含二进制文件 + FFI .so/.dll + public/ + .env |
| **暂停/恢复** | 用户离开聊天时，导演循环和LLM队列暂停 |

**新文件：**
- `mojo/kernels/c/probability_ffi.c` — 概率内核（成功率、投掷、批量）
- `mojo/kernels/c/vector_ffi.c` — 4维向量操作（余弦、L2、点积）
- `mojo/kernels/c/vector_full.c` — 全维度向量操作（768维）
- `mojo/kernels/c/batch_ops.c` — 批量NPC操作（年龄衰减、恶习、税收、忠诚度）
- `mojo/kernels/c/graph_ops.c` — 图遍历、RRF融合、声誉
- `mojo/kernels/build.sh` — 通过Zig交叉编译
- `src/routes/system.ts` — 暂停/恢复API端点

**修改的文件：**
- `src/services/director-loop.ts` — 添加`pause()`/`resume()`方法
- `src/lib/llm-queue.ts` — 添加`pause()`/`resume()`方法
- `src/services/narrative-service.ts` — 添加`pause()`/`resume()`委托
- `public/index.html` — 离开页面时自动暂停，加载时自动恢复

### Mojo内核扩展 (v0.12.0)

Mojo计算内核的重大性能扩展，支持向量搜索、NPC批量操作和图遍历：

| 功能 | 描述 |
|------|------|
| **概率内核** | 成功率、投掷结果、修饰符 + 批量概率通过Mojo FFI |
| **向量内核** | 4维余弦相似度、L2距离、点积通过Mojo FFI |
| **全维度向量** | 768维BGE-M3嵌入 — 批量余弦相似度通过Mojo FFI |
| **批量NPC操作** | 年龄衰减、恶习衰减、税收、财富总和、忠诚度检查通过Mojo FFI |
| **图操作** | RRF融合、关系强度、声望计算通过Mojo FFI |
| **SQLite加速** | searchDense/searchMemoriesDense使用批量余弦相似度 |

**新文件：**
- `mojo/kernels/vector_full.mojo` — 全维度向量操作（余弦、L2、点积、批量）
- `mojo/kernels/batch_ops.mojo` — 批量NPC统计操作（年龄衰减、恶习、税收、忠诚度）
- `mojo/kernels/graph_ops.mojo` — 图遍历和RRF融合
- `src/lib/mojo-ffi.test.ts` — 19个测试覆盖所有FFI绑定

**修改的文件：**
- `mojo/kernels/probability_ffi.mojo` — 新增batch_success_chance和batch_roll
- `src/lib/mojo-ffi.ts` — 5个内核绑定，带TypeScript回退
- `src/lib/vector-ops.ts` — 使用Mojo加速的cosineSimilarity
- `src/lib/sqlite-store.ts` — searchDense/searchMemoriesDense使用batchCosineSimilarity
- `build.sh` — 编译全部5个内核（probability, vector_4dim, vector_full, batch_ops, graph_ops）

**Performance (ms per 1000 iterations):**

| Operation | Python | NumPy | TS | TS+SQLite | Mojo | Mojo vs TS |
|-----------|--------|-------|-----|-----------|------|------------|
| cosine (768-dim) | 3.6 | 4.8 | 5.2 | - | **1.5** | **3.5x** |
| batch_cosine (100×768) | 35.6 | 6.1 | 27.4 | 105.4 | **14.0** | **2.0x** |
| age_decay (100 NPCs) | 75.6 | 21.5 | 1.8 | - | **1.6** | 1.1x |
| rrf_fusion (100×3) | 706.1 | 10.4 | 2.5 | - | **2.2** | 1.1x |
| reputation (500 rels) | 41.9 | - | 5.1 | - | **3.1** | **1.6x** |

Mojo kernels use `abi("c")` + `UnsafePointer` FFI with TypeScript fallbacks. All functions have zero-overhead TS fallbacks when `.so` is unavailable.

### 社交与政治系统 (v0.11.0)

| 功能 | 描述 |
|------|------|
| **封建等级** | 宣誓效忠、领主/附庸、指挥链、忠诚度、叛乱 |
| **派系系统** | 6种类型（军事/经济/宗教/犯罪/贵族/中立）、领袖、影响力 |
| **政治联盟** | 5种类型（军事/贸易/防御/互不侵犯/附庸）、背叛、声望 |
| **NPC对话** | 会话管理、11个话题类别、情境问候 |
| **任务系统** | 5种类型、7种目标类型、奖励、前置条件、任务链 |
| **故事规划器** | LLM驱动的动态弧线规划、两阶段生成、自适应重规划 |
| **背包系统** | 物品稀有度（5级）、装备槽、负重/容量、交易 |

**新文件:** `social-graph.ts`, `dialogue-manager.ts`, `quest-system.ts`, `inventory-manager.ts`

### NPC 经济系统 (v0.11.0)

完整的封建经济模拟，拥有活生生的 NPC：

| 功能 | 描述 |
|------|------|
| **封建等级** | 10 个等级：奴隶 → 平民 → 准男爵 → 男爵 → 子爵 → 伯爵 → 侯爵 → 公爵 → 国王 → 皇帝 |
| **NPC 属性** | 6 项属性：财富、权力、声望、健康、经验、阴谋 |
| **税收系统** | 阶梯式税收：0%（皇帝）→ 90%（平民），通过权力/声望降低 |
| **贿赂机制** | 基于风险的贿赂：10% 基础 + 金额/目击者，背叛阈值 |
| **食物经济** | 奴隶每月生产 300-1000 食物，所有人按等级消费 |
| **家庭系统** | 50% 收入给妻子，10% 给子女，死亡时继承 |
| **恶习与退化** | 8 种影响属性的恶习，基于年龄的健康衰减 |
| **34 种原型** | 22 种默认 + 12 种独特，加权随机选择，上下文分组 |
| **权力丧失** | 叛乱 → 死亡/奴役，战争 → 赎金/奴役，破产 → 奴役 |
| **物品提升** | 独特物品提供永久属性提升（1-10%），由历史学家/研究员评估 |

### SQLite 存储提示词和翻译 (v0.11.0)
代理提示词和 UI 字符串现在按世界+语言存储在 SQLite 中：

- **`agent_prompts` 表** — 按世界+语言存储 `systemPrompt`、`userTemplate`、`outputFormat`
- **`ui_translations` 表** — 按语言+页面存储 UI 字符串（agents、settings、agent_names、agent_descs）
- **双写策略** — 写入同时到 SQLite 和 JSON 文件以保持向后兼容
- **语言感知提示词** — 每个世界可以有自己的语言，决定加载哪些提示词
- **自动填充** — 首次启动时，所有 7 种语言都会填充到 `ui_translations` 中

**存储层次结构：**
1. **SQLite** (`tns.db`) — 主存储，按世界+语言
2. **JSON 文件** (`worlds/{world}/agents/{agentId}.json`) — 迁移期间的回退
3. **硬编码默认值** (`DEFAULT_PROMPTS` in `src/services/agent-config.ts`)

### i18n API 端点
用于翻译管理的新的 REST API：

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/i18n/translations/:lang/:page` | 获取语言+页面的翻译 |
| GET | `/api/i18n/translations/:lang` | 获取语言的所有翻译 |
| PUT | `/api/i18n/translations` | 批量更新翻译 |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | 删除翻译键 |

**请求示例 (PUT)：**
```json
{
  "language": "zh",
  "page": "agents",
  "entries": {
    "title": "代理配置",
    "savePrompts": "保存提示词"
  }
}
```

### 语言感知代理提示词
代理提示词现在支持按世界和语言存储：

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**语言感知提示词的 API 端点：**
- `GET /api/agents/:id/prompts/:lang` — 获取特定语言的提示词
- `PUT /api/agents/:id/prompts/:lang` — 更新特定语言的提示词

### 前端 i18n 集成
前端页面现在通过 API 从 SQLite 加载翻译：

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### 新专业代理 (v0.11.0)
用于世界丰富和玩家交互的五个新代理：

- **历史学家** — 回忆和叙述历史事件、传说和年代记
- **地图师** — 提供有关地点、距离、路径和地理的信息
- **商人** — 处理交易、定价和 NPC 库存管理
- **任务给予者** — 根据世界状态生成带有目标和奖励的上下文任务
- **知识守护者** — 维护世界事实、魔法规则、种族信息和既定教义

每个代理在 `src/services/agent-config.ts` 中配置了自己的系统提示词、用户模板和输出格式。

### 全代理 RAG 系统 (v0.11.0)
为每个代理提供长期记忆的完整嵌入支持：

- **llama.cpp 嵌入服务器** — 端口 5002 上的专用 BGE-M3 模型用于向量生成
- **SQLite 混合搜索** — FTS5 关键词搜索 + 密集向量搜索 + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — 通过 `role` 列实现按代理、按会话的记忆隔离
- **按世界隔离记忆** — 记忆按世界隔离以防止跨世界幻觉
- **Mojo 图操作** — 通过 Mojo FFI 的向量操作以提高性能（余弦相似度、L2 距离）

**架构：**
```
代理请求 → AgentMemoryStore → SQLite（混合搜索）
                                    ↓
                            ┌───────┴───────┐
                            │ FTS5 (LIKE)   │ 密集向量 (BGE-M3)
                            │ 关键词搜索     │ 余弦相似度
                            └───────┬───────┘
                                    ↓
                            Reciprocal Rank Fusion (RRF)
                                    ↓
                            用于 LLM 提示词的上下文
```

**关键文件：**
- `src/lib/agent-memory-store.ts` — 带嵌入集成的 AgentMemoryStore
- `src/lib/sqlite-store.ts` — 带 FTS5 + 向量搜索 + RRF 的 SQLiteStore
- `src/lib/vector-ops.ts` — 向量操作（余弦、L2、点积）

### NPC 系统革新 (v0.11.0)
用于更智能 NPC 行为的四项新服务：

- **MemoryEngine** — 语义搜索、情感/位置过滤、NPC 情节记忆的聚类
- **BehaviorEngine** — 自主行动、目标评估、日常例程、情绪适应、决策制定
- **SocialGraph** — 关系追踪、声誉评分、共同好友、阵营归属和冲突
- **DialogueContext** — 丰富 NPC 提示词，结合关系、记忆、情绪、位置、阵营、目标和库存

**架构：** 两个并行轨道 — 轨道 1（记忆+行为）构建基础，轨道 2（社交+对话）添加用户友好功能。

**集成：** `NPCAgent.initialize(runtime, statePath)` 创建所有四个组件。当 DialogueContext 未初始化时回退到模板/PromptBuilder。

### 研究员代理 (v0.11.0)
用于事实核查和真实感验证的新代理：
- **`verifyRecipe()`** – 验证合成食谱的合理性
- **`researchTopic()`** – 世界构建的历史/文化研究
- **`validateCharacter()`** – 检查角色的服装、食物、日常生活
- **`enrichScene()`** – 为场景添加真实的感官细节
- **`factCheck()`** – 一般事实验证

### i18n 系统
7 种语言的完整本地化（EN、RU、DE、FR、ES、JA、ZH）：
- 所有代理提示词和界面字符串
- 代理名称和描述
- 设置页面（代理、提供商、模型）
- 服务器启动/停止消息

**结构** — 每种语言是 `src/i18n/` 下的独立文件：

```
src/i18n/
├── types.ts    # LanguagePack 接口 + Language 类型
├── en.ts       # 英语（基础包 — 所有键在此定义）
├── ru.ts       # 俄语（继承 EN，覆盖翻译）
├── de.ts       # 德语
├── fr.ts       # 法语
├── es.ts       # 西班牙语
├── ja.ts       # 日语
├── zh.ts       # 中文
└── index.ts    # Barrel 导出，注册表，getLanguagePack()
```

**添加新语言**（例如韩语）：

1. 创建 `src/i18n/ko.ts`：
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... 覆盖其他键
};
```

2. 在 `src/i18n/index.ts` 中注册：
```ts
import { KO } from "./ko";
// 添加到 Language 类型: "ko"
// 添加到 PACKS: ko: KO
// 添加到 LANGUAGES 数组
```

3. 在 `src/i18n/types.ts` 的 `Language` 联合类型中添加 `"ko"`。

### 服务器改进
- **PID 文件跟踪**（`.server.pid`）– 防止孤儿进程
- **启动时清理** – 自动终止旧进程
- **优雅关闭** – 5 秒 SIGTERM 超时，然后 SIGKILL 回退

---

## 从 Python 迁移

本项目是 [BRING](https://github.com/Eva-E1/BRING)（Python AI 奇幻世界平台）的 TypeScript + Mojo 移植。主要变化：

| 组件 | Python | TypeScript |
|------|--------|------------|
| Web 框架 | FastAPI | Hono (Bun) |
| 运行时 | Python asyncio | Bun 原生异步 |
| 验证 | Pydantic | Zod |
| 日志 | Python logging | 轻量级日志器（Pino 替代） |
| 图谱 | NetworkX | 自定义邻接表 |
| 向量搜索 | FAISS (Python) | Mojo FFI + 本地余弦回退 |
| WebSocket | FastAPI WebSocket | Bun 原生 WebSocket |
| 认证 | 无 | 基于 Cookie 的会话 |
| 流式传输 | SSE (starlette) | ReadableStream + SSE |

---

## 免责声明

本项目使用 **Vibe Coding** 开发 — 一种由 [MiMo Code](https://github.com/XiaomiMiMo/MiMo) 驱动的 AI 辅助开发方法。代码库通过人机协作生成，这意味着：

- 代码**功能完整且经过测试** — 所有功能均按描述正常工作
- 部分区域可能包含**非最优模式**或有重构空间
- 不同模块之间可能存在**细微的代码风格差异**
- 架构和逻辑已经**经过人工审查和验证**

如果您发现可以改进的地方，欢迎贡献代码。

---

## 许可证

Apache 2.0
