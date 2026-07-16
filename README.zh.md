# TrueNeverStory v0.25.6

### 玩着写你的书。

TrueNeverStory 是一个AI驱动的互动叙事引擎，采用**State-First架构**。每个NPC都有记忆，每个行动都有确定性结果，故事永不停歇。扮演一个角色，探索一个活生生的世界，看着你的选择塑造叙事——或者让世界自行发展。

基于 TypeScript (Bun + Hono) 构建，使用 C FFI 内核处理高性能计算。

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Francais](README.fr.md) | [Espanol](README.es.md) | [日本語](README.ja.md)**

---

## v0.25.6 新功能

### 圣经数据库优化
- **FTS5搜索** — 将 `LIKE '%query%'` 替换为 FTS5 `MATCH` 实现 O(1) 全文查询（支持 LIKE 回退）
- **批量图遍历** — `getRelatedVerses()` 现在使用 `IN (...)` 批量查询代替 N 次独立查询（N+1 → 1）
- **经文索引** — 新增 `idx_verses_book_chapter` 索引加速过滤查询
- **人物系统** — 全新 `CharacterDB`，含 3 张表：`bible_characters`、`bible_character_edges`、`bible_character_mentions`
- **姓名词典** — 40+ 圣经人物，支持多语言变体（EN/RU/HE/EL）
- **人物MCP工具** — `searchCharacters`、`getCharacter`、`getCharacterEdges`、`getVerseCharacters`
- **Git清理** — 移除 177MB 原始文件和 59MB 编译数据库的跟踪
- **构建脚本** — `download-sources.sh` + `bootstrap-bible-db.ts` 用于客户端初始化

### v0.25.3 新功能

### State-First 管道
引擎现在在**生成文本之前确定性地处理行动**：
1. **意图解析器** — Zod验证的结构化意图取代正则路由
2. **模拟引擎** — Mojo FFI在散文生成之前计算结果
3. **状态变更器** — EntityStore在逻辑处理后立即更新
4. **上下文构建器** — 所有代理共享的游戏上下文
5. **散文生成** — LLM受模拟结果约束生成文本

### MCP集成（文学即代码）
- **圣经即标准库** — 圣经模式作为叙事原型（SQLite + MCP）
- **古登堡即样式CSS** — 用于散文渲染的去词化风格模式
- **维基百科即验证器** — 通过外部知识进行历史事实核查

### 六大代理
14个代理整合为6个专业化角色：

| 代理 | 角色 | 描述 |
|------|------|------|
| **编剧** | 架构师 | 从圣经原型中选择叙事模式 |
| **验证者** | 事实核查员 | 通过维基百科MCP验证事实 |
| **风格师** | 叙述者 | 使用古登堡风格模式渲染散文 |
| **演员** | NPC合奏 | 管理具有L3隐藏动机的NPC对话 |
| **审查员** | 代码检查器 | 移除AI陈词滥调并强制风格一致性 |
| **编年史官** | 世界记忆 | 更新时间线和世界状态 |

### 系统心跳
聊天UI中的实时进度指示器：
- "正在理解你的输入..."
- "正在掷骰子..."
- "结果：成功（73%）"
- "正在编织叙事..."
- "完成"

### 国际语（英语作为内部语言）
所有代理间和代理-MCP操作使用英语以提高令牌效率和准确性。翻译在输出边界进行。

---

## 功能特性

| 功能 | 描述 |
|------|------|
| **State-First 管道** | 确定性模拟 -> 状态变更 -> 约束散文生成 |
| **6个AI代理** | 编剧、验证者、风格师、演员、审查员、编年史官 |
| **MCP集成** | 圣经模式、古登堡风格、维基百科验证 |
| **活生生的世界** | 角色、地点、物品、派系——全部通过知识图谱 O(1) 连接 |
| **记忆与RAG** | 向量搜索 (BGE-M3 + SQLite 混合 FTS5/密集/RRF) |
| **概率系统** | 战斗、说服、潜行、浪漫的确定性结果 |
| **浪漫与社交** | 关系管理、派系、联盟、封建等级、NPC对话 |
| **任务系统** | 动态任务生成、目标、奖励、链条、时间限制 |
| **物品与交易** | 稀有度、属性、装备、金币、NPC交易 |
| **NPC经济** | 封建等级（10级）、税收、食物生产、家族系统、34个原型 |
| **规则引擎** | 14个预定义社会/经济系统（封建制、民主制、无政府状态等）与协同矩阵 |
| **多世界** | 带资源监控（内存、CPU、令牌）的隔离世界执行 |
| **跨世界** | 通过门户和共享内存进行世界间事件通信 |
| **插件系统** | 可扩展架构，包含插件管理器、生命周期钩子和API |
| **功能标志** | A/B测试、渐进式发布、百分比定向 |
| **API版本控制** | v1/v2端点，带弃用头 |
| **实时流式传输** | WebSocket + SSE 实时叙事推送，带心跳进度 |
| **i18n (7种语言)** | EN, RU, DE, FR, ES, JA, ZH — UI、提示词、代理名称 |
| **密码认证** | HttpOnly cookie会话、CSRF保护、SQLite备份会话 |
| **SQLite存储** | 实体、嵌入、记忆、提示词、翻译 |
| **断路器** | LLM提供商自动故障转移与备用链 |
| **结构化日志** | Trace ID、关联ID、多代理工作流调试指标 |

---

## 支持的平台

| 平台 | 状态 | 备注 |
|------|:----:|------|
| Linux x86_64 | ✅ | 完全支持，FFI内核 |
| Linux ARM64 | ✅ | 完全支持，FFI内核 |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

服务器自动检测FFI内核——不可用时回退到纯TypeScript。

---

## 快速开始

**不需要Bun、Node.js或其他运行时。** 只需下载并运行。

### 1. 下载

从 [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest) 下载最新版本：

| 平台 | 文件 |
|------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. 运行

启动器会自动检测您的LLM提供商（Ollama、LM Studio、OpenAI、llama.cpp），配置`.env`并启动服务器。

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# 解压 tns-windows-x64.zip 后：
.\startgame.ps1
```

**启动选项:**
```bash
./startgame.sh --local    # CORS=localhost 仅限（开发安全）
./startgame.sh --remote   # CORS=*（默认，允许外部访问）
```

**从源码构建（需要Bun）:**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. 打开

**http://localhost:8000** — 密码: **`changeme`**

首次登录后请在设置中修改密码。

---

## 配置LLM

打开**设置**页面或编辑`.env`：

### Ollama (本地，免费)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

也支持vLLM、Anthropic、Google和任何OpenAI兼容API。

---

## 项目结构

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod验证的环境配置
│   ├── lib/              # LLM客户端、SQLite存储、向量运算、会话存储、断路器、功能标志
│   ├── memory/           # WorldMemory、认知管道、实体提取
│   ├── middleware/        # 认证、限流器、安全头、CORS、日志器
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # MCP服务器、Bible/Gutenberg解析器、Wikipedia工具
│   ├── plugins/          # 插件接口和管理器
│   ├── routes/           # API路由 (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # 规则引擎 (14条规则、协同矩阵、技术依赖)
│   ├── services/         # 60+服务 (角色扮演引擎、代理、经济、世界隔离、跨世界总线)
│   │   ├── agents/       # v0.25.3 新代理 (编剧、验证者、风格师、演员、审查员、编年史官)
│   │   └── ...
│   ├── intelligence/     # 图分析、重复检测、推荐系统
│   ├── i18n/             # 语言包 (7种语言)
│   ├── store/            # EntityStore (O(1) NameIndex)、WorldStore
│   └── utils/            # 日志器、哈希、清理器、模板解析器
├── mojo/kernels/         # C FFI内核 (通过Zig编译)
├── public/               # Web界面 (终端风格，带心跳进度)
├── worlds/               # 世界数据 (SQLite数据库、实体、会话)
├── conf/                 # 配置
└── tests/                # 测试套件
```

---

## 架构：State-First 管道

```
玩家输入
  │
  ▼
意图解析器 (Zod验证)
  │
  ▼
模拟引擎 (Mojo FFI)
  │ 结果、概率、状态变更
  ▼
状态变更器 (EntityStore L1-L3)
  │
  ▼
上下文构建器 (共享游戏状态)
  │
  ▼
编剧 (通过MCP选择圣经模式)
  │
  ▼
风格师 (通过MCP渲染古登堡风格)
  │
  ▼
审查员 (AI陈词滥调移除)
  │
  ▼
翻译服务 (英语 -> 用户语言)
  │
  ▼
响应用户
```

---

## API

### 认证

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/login` | 登录页面 |
| POST | `/login` | 认证 (`password=...`) |
| POST | `/logout` | 登出 |

### 聊天与角色扮演

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/chat/setup` | 初始化会话（角色、地点、角色） |
| POST | `/api/chat/message` | 发送消息，获取叙事 |
| POST | `/api/chat/stream` | 带心跳的SSE流式传输 |
| GET | `/api/chat/session` | 会话状态 |
| GET | `/api/chat/history` | 对话历史 |

### 实体与图

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/entity/:uid` | 实体详情 |
| GET | `/api/neighbors/:uid` | 邻居（深度遍历） |
| GET | `/api/path?source=&target=` | 实体间最短路径 |
| GET | `/api/search?q=` | 按名称或语义搜索 |
| GET | `/api/graph/summary` | 图统计 |

### 代理与i18n

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/agents` | 代理配置 |
| PUT | `/api/agents/:id` | 更新代理 |
| PUT | `/api/agents/:id/prompts/:lang` | 语言提示词 |
| GET | `/api/i18n/translations/:lang/:page` | 翻译 |
| PUT | `/api/i18n/translations` | 翻译Upsert |

### 规则引擎

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/rules` | 可用规则 |
| GET | `/api/rules/:id` | 规则详情 |
| POST | `/api/rules/validate` | 验证规则JSON |

### 跨世界

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/cross-world/status` | 跨世界状态 |
| POST | `/api/cross-world/enable` | 启用 |
| POST | `/api/cross-world/disable` | 禁用 |
| GET | `/api/cross-world/portals` | 列出门户 |
| POST | `/api/cross-world/portals` | 创建门户 |
| DELETE | `/api/cross-world/portals/:id` | 删除门户 |
| GET | `/api/cross-world/events` | 事件日志 |

### 插件

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/plugins` | 已注册插件 |
| GET | `/api/plugins/:id` | 插件详情 |
| GET | `/api/plugins/:id/capabilities` | 插件能力 |

### 功能标志

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/feature-flags` | 功能标志 |
| PUT | `/api/feature-flags/:id` | 更新标志 |

### 系统

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/system/pause` | 暂停后台处理 |
| POST | `/api/system/resume` | 恢复后台处理 |
| GET | `/api/health` | 健康检查 |

### WebSocket

| 端点 | 描述 |
|------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | 带心跳的实时角色扮演流式传输 |

---

## 示例

### API

```bash
# 登录
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# 初始化会话
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# 发送消息
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "我拔出剑面对巨龙"}'

# 搜索实体
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# 可用规则
curl -b cookies.txt "http://localhost:8000/api/rules"

# 创建跨世界门户
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### 带心跳的SSE流式传输

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: '我探索古代遗迹' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`进度: ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## 开发者

完整文档：[DEV.README.zh.md](docs/DEV.README.zh.md)

### 前提条件

- [Bun](https://bun.sh) v1.0+

### 安装

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

打开 http://localhost:8000

### 命令

| 命令 | 描述 |
|------|------|
| `bun run dev` | 开发热重载 |
| `bun run start` | 生产模式 |
| `bun run lint` | 类型检查 |
| `bun test` | 运行测试 |
| `bun run build` | 构建 |

---

## 二进制发行版构建

通过Zig跨平台编译：

```bash
cd mojo/kernels
./build.sh native           # 当前平台
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # 所有目标
```

编译服务器二进制文件：

```bash
bun build --compile --outfile tns-server src/index.ts
```

详见 [COMPILE.md](docs/COMPILE.md)。GitHub Actions在标签推送时自动构建所有平台。

---

## 最近更改

### v0.25.6 — 圣经数据库优化

**性能：**
- FTS5搜索带LIKE回退 — O(n) → O(1) 全文查询
- 批量图遍历 — N+1 → 1 SQL查询用于经文关联
- 经文索引 + VACUUM 方法用于数据库压缩

**功能：**
- 人物系统（CharacterDB 含 3 张 SQLite 表）
- 圣经姓名词典（40+ 人物，EN/RU/HE/EL 多语言变体）
- MCP工具：搜索、获取、关联、提及、经文人物
- 圣经源文件支持 gzip 压缩
- 下载脚本和 bootstrap 用于客户端初始化

**维护：**
- 从 git 移除 177MB 源文件 + 59MB 编译数据库
- 新增 .gitignore 用于源文件和编译数据库

### v0.25.3 — Literary Compiler 和经济模型

**Literary Compiler（阶段0-6）：**
- 4个离线分析通道：戏剧性、风格、情感、元数据
- 带FTS5的SQL模式用于任务模板搜索
- 用于验证、去重和陈词滥调检测的Linter
- Stylist代理的反道德化提示

**经济模型：**
- JubileeManager — 每50年债务重置、土地归还、忠诚度提升
- FactionTaxDilemma — 带玩家选择的自动派系间税争生成
- FactionLaborRules — 按派系固定/比例工资、忠诚度冲突检测
- EconomicCycles — 约瑟夫模型：丰裕/过渡/饥荒周期

**经济集成：**
- 包装4个经济模型的EconomicService外观
- DirectorLoop集成：周期转换、禧年事件、困境生成
- NPC-Economy劳动规则集成与工资计算
- 7个新MCP工具：get_economic_phase、get_price_modifier、calculate_price、get_wage、generate_dilemma、check_jubilee、get_jubilee_info

**错误修复：**
- 移除未使用的`better-sqlite3`依赖（项目使用`bun:sqlite`）
- 修复困境选项中硬编码的派系名 — 现在使用真实名称
- 修复DirectorLoop中硬编码的派系列表 — 现在从世界配置读取
- 修复年份近似漂移 — 使用`getFullYear()`代替手动计算

### v0.25.3 — State-First 架构

**核心引擎重构：**
- 使用Zod模式的意图解析器（6种意图类型：移动、对话、动作、命令、观察、元）
- Mojo FFI确定性结果的模拟引擎
- EntityStore即时更新的状态变更器
- 共享游戏状态的上下文构建器
- RoleplayEngine重构为轻量级编排器

**MCP集成：**
- 带Bible、Gutenberg和Wikipedia工具的TNS MCP服务器
- 带FTS搜索的外部SQLite数据库的圣经解析器
- 带样式提取和去词化的古登堡解析器
- 用于历史事实核查的维基百科验证器

**代理整合：**
- 14个代理 -> 6个专业化角色（编剧、验证者、风格师、演员、审查员、编年史官）
- AgentRegistryV2用于生命周期管理
- 每个代理的MCP工具集成

**系统心跳：**
- 通过SSE的实时进度指示器
- HeartbeatUI前端组件
- 带阶段消息的进度条

**国际语：**
- 英语作为所有操作的内部语言
- 输出边界的TranslationService

**错误修复：**
- 修复所有TypeScript错误（0个错误）
- 修复SQLite查询参数类型
- 修复LLMQueue签名不匹配

### v0.22.2 — Theme Builder

- `/theme-builder`独立主题构建器页面
- 8个预设主题：Dracula、Nord、Monokai、Solarized、Gruvbox、Tokyo Night、One Dark、Catppuccin
- 14个CSS变量的颜色选择器控制（背景、边框、文本、强调色）
- mono、body和display字体的字体选择器
- 包含所有UI组件的实时预览面板
- 以JSON文件导出/导入主题
- 从设置页面的导航链接

### v0.22.2 — 主题系统修复

- 修复`theme-custom.css` — 修正CSS变量语法（之前使用`var()`而非`--name: value`）
- 为自定义主题添加缺失的变量`--accent-subtle`、`--success-subtle`、`--warning-subtle`、`--interactive-subtle`
- 5个主题（暗色、亮色、终端、赛博朋克、自定义）现在通过选择器按钮正常工作

### v0.20.4 — 世界图修复 + 统计弹窗 + 语言注入 + 主题系统

- 修复死代码`buildRelationships()` — 启动时自动构建启发式关系
- 新增`GET /worlds/:name/detail`端点用于世界统计
- 新统计弹窗，包含实体列表、规则和角色详情
- 语言指令注入 — LLM响应与界面语言匹配（7种语言）
- 主题系统 — 5个内置主题（暗色、亮色、终端、赛博朋克、自定义）+ 构造器

### v0.20.1 — 规则引擎二进制文件修复

- 修复编译后的Bun二进制文件中`/api/rules`端点崩溃问题
- 将`import.meta.dir`改为`process.cwd()`用于规则目录路径解析
- 解决编译后二进制文件中的ENOENT错误（`/$bunfs/root/../rules/social`）
- 影响文件: `src/routes/rules.ts` 和 `src/rules/rules-engine.ts`

### v0.20.0 — 架构改进

5个阶段的完整架构重构：

**阶段1-2:**
- NarrativeService拆分 (Bootstrapper + Facade + Service)
- 统一代理模型 (接口 + 基类)
- Event Sourcing (领域事件 + 快照)
- Circuit Breaker (LLM自动故障转移)
- 代理注册表 (4种源类型)
- 结构化日志 (Trace ID + 关联ID)

**阶段3:**
- 规则引擎 — 14个预定义系统
- 协同矩阵、技术依赖、幸福度修饰符
- 规则验证器、文化漂移建模
- 功能标志 (A/B测试 + 渐进式发布)
- API版本控制 (v1/v2)
- WorldStore — SQLite迁移

**阶段4:**
- 多世界隔离 (资源监控)
- 跨世界通信 (门户 + 事件)
- 插件系统 (管理器 + 生命周期钩子)

**阶段5:**
- 文档更新

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — 安全加固

- SQLite会话
- WebSocket令牌验证
- 路径遍历保护
- CSRF保护
- Secure cookie、CSP强化

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## 许可证

---

**项目:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
