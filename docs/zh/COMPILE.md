# TrueNeverStory v0.33.4 — 编译指南

## 快速开始

```bash
# 当前平台
./build.sh compile

# 指定目标
./build.sh compile linux-x64
./build.sh compile linux-arm64
./build.sh compile macos-arm64
./build.sh compile windows-x64

# 交互式选择
./build.sh select

# 所有平台
./build.sh cross
```

## 支持的平台

| 平台 | TypeScript | Mojo (.so) | MCP | 后端 | 备注 |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | 完整支持 |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | 完整支持 |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | TypeScript 回退 |

## MCP — 模型上下文协议

MCP 为 LLM 代理提供用于查询外部数据源的工具：

| 工具 | 数据源 | 描述 |
|------------|----------------|----------|
| `search_verses` | 圣经 SQLite | 按文本、书卷、引用搜索经文 |
| `get_pattern` | 圣经 SQLite | 按原型/情绪获取叙事模式 |
| `get_archetype` | 圣经 SQLite | 按名称获取原型详情 |
| `get_cross_refs` | 圣经 SQLite | 经文之间的交叉引用 |
| `get_style_pattern` | 古腾堡 SQLite | 按情绪/标签获取风格模式 |
| `apply_style` | 古腾堡 SQLite | 将风格应用到文本 |
| `verify_fact` | 维基百科 API | 核实事实性断言 |
| `get_context` | 维基百科 API | 按主题获取维基百科上下文 |
| `get_quest_templates` | 文学编译器 | 按原型获取任务模板 |
| `search_quest_templates` | 文学编译器 | 按文本搜索任务 |
| `get_economic_phase` | 经济数据库 | 经济周期的当前阶段 |
| `calculate_price` | 经济数据库 | 考虑阶段的价格计算 |
| `generate_dilemma` | 经济数据库 | 生成派系困境 |
| `check_jubilee` | 经济数据库 | 检查禧年周期 |

### 编译 MCP 数据库

MCP 服务器需要已编译的 SQLite 数据库：

```bash
# 圣经：BSB、LEB、NHEBME + 交叉引用
bun run scripts/run-bsb-compiler.ts

# 完整流水线（圣经 + 文学编译器）
bun run scripts/run-full-compiler-pipeline.ts

# 仅圣经
bun run scripts/run-full-bible-compiler.ts

# 缓存流水线（增量）
bun run scripts/run-cached-pipeline.ts
```

### MCP 数据结构

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + 交叉引用
├── gutenberg.db          # 来自古腾堡计划的风格
├── mcp/
│   ├── bible/            # 圣经解析器缓存
│   └── gutenberg/        # 古腾堡解析器缓存
└── economic.db           # 经济数据
```

### 运行 MCP

当检测到 `bible.db` 或 `gutenberg.db` 时，MCP 服务器会自动启动：

```bash
# 自动启动
./bun run src/index.ts

# 检查 MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### 古腾堡网页目录

通过 MCP 控制台（`/mcp.html`），你可以从古腾堡计划下载你喜欢的作者作品来改进写作风格：

1. 打开「目录」标签页
2. 输入作者姓名或主题
3. 浏览、筛选并选择书籍
4. 下载 — 样式会自动为风格代理提取

详见 **[MCP 控制台指南](MCP-HELP.md)**（7 种语言）。

## 自动回退

服务器会自动检测 Mojo 的可用性：

```
.so 文件存在   → 后端：mojo        （快，向量约 10-50 倍）
.so 文件缺失   → 后端：typescript  （可用，较慢）
```

检查当前后端：
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### 没有 Mojo 时哪些功能可用

| 组件 | Mojo 后端 | TypeScript 回退 | 差异 |
|-----------|:------------:|:-------------------:|---------|
| 概率（战斗、恋爱） | Mojo FFI | TypeScript | ~2-5x |
| 向量相似度 | Mojo FFI | TypeScript | ~10-50x |
| 点积 | Mojo FFI | TypeScript | ~5-10x |
| 聊天 / 角色扮演 | TypeScript | TypeScript | 0% |
| 记忆系统 | TypeScript + Mojo | 仅 TypeScript | 检索较慢 |
| 任务 / 导演 | TypeScript | TypeScript | 0% |
| MCP 圣经/古腾堡 | TypeScript | TypeScript | 0% |
| MCP 维基百科 | HTTP | HTTP | 0% |

**结论：** Windows 构建完全可用，唯一的区别在于计算性能。

## 构建结构

```
dist/
├── linux-arm64/
│   ├── tns-server              # 独立二进制
│   ├── libtns_kernels.so       # Mojo：概率
│   ├── libtns_vectors.so       # Mojo：向量运算
│   ├── libtns_vector_full.so   # Mojo：全维向量运算
│   ├── libtns_graph_ops.so     # Mojo：图运算
│   ├── libtns_batch_ops.so     # Mojo：批量运算
│   └── .env                      # 配置
├── linux-x64/
│   └── ...
├── macos-arm64/
│   └── ...
├── macos-x64/
│   └── ...
└── windows-x64/
    ├── tns-server.exe          # 仅 TypeScript（回退）
    └── .env
```

## 用户需要什么

1. 下载适用于你平台的文件夹
2. 配置 `.env`（LLM 端点、密码）
3. 从项目根目录复制 `conf/`（或手动创建）
4. 运行：

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**无需：** Bun、Node.js、Python、Mojo、编译器。

要让 MCP 正常工作，你还需要编译数据库（参见上文的 MCP 部分）。

## 嵌入模型（本地服务器）

对于向量检索和语义相似度，你可以运行一个带嵌入模型的独立 llama-server：

```bash
# BGE M3 — 多语言（100+ 种语言，8192 tokens）
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 5002

# Qwen3 Embedding 0.6B — 紧凑且快速
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 5002

# KaLM Embedding Gemma3 12B — 最高质量
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 5002
```

在 `.env` 中指定：
```ini
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

> **重要：** `--embedding` 和 `--pooling mean` 标志对于嵌入模型正常工作是必需的。没有它们，llama-server 会作为普通 LLM 运行，输出文本而非向量。

| 模型 | 大小 | 语言 | 上下文 | 推荐 |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | 最佳语言覆盖 |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | 大小/质量均衡 |
| Qwen3 Embedding 0.6B | ~639 MB | 多语言 | — | 最快 |
| Embedding Gemma 300M | ~329 MB | EN+ | — | 最小体积 |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | 多语言 | — | 最高质量 |

## 平台要求

| 操作系统 | 最低版本 | 架构 | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+（64 位） | x86_64 | ❌ | ✅ |

## Windows — 详情

Windows 构建通过 **TypeScript 回退**运行：

- `tns-server.exe` — 独立二进制，无需安装即可运行
- Mojo `.so` 不会被编译（Mojo 不支持 Windows/MSVC）
- 所有计算都在 TypeScript 上运行 — 更慢，但功能完全一致
- MCP 完全可用（TypeScript）
- 不需要 WSL2 — 原生 Windows 执行

### Windows 性能

对于大多数场景，差异可以忽略不计：
- 聊天和角色扮演 — 完全一致（TypeScript）
- 概率 — 差异可忽略（<1ms）
- 向量检索 — 大数据量时更慢（>10K 记忆）
- MCP — 完全一致（TypeScript + HTTP）

要在 Windows 上获得最佳性能：
1. 在 Linux 上使用 **外部服务器**
2. **典型场景** — 差异可以忽略不计

## 手动编译

### TypeScript (Bun)

```bash
# 当前平台
bun build --compile --outfile dist/tns-server src/index.ts

# Windows（从 Linux 交叉编译）
bun build --compile \
  --compile-executable-path dist/.bun-cache/bun-windows-x64 \
  --outfile dist/windows-x64/tns-server.exe \
  src/index.ts
```

### Mojo（用于 FFI 的 .so）

```bash
# 仅限 Linux/macOS（不支持 Windows！）
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vector_full.so \
  mojo/kernels/vector_full.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.mojo
```

### 交叉编译

Mojo 的 `.so` 文件无法可靠地交叉编译。建议**在目标平台上构建**。

### 从 Linux 构建 Windows

```bash
# TypeScript + .env（无 Mojo）
./build.sh compile windows-x64

# 结果：dist/windows-x64/
#   tns-server.exe   — 独立二进制
#   .env               — 配置
```

## 调试

```bash
# 检查后端
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
# → "mojo" 或 "typescript"

# 检查二进制是否正常工作
./dist/linux-arm64/tns-server --help

# 检查 .so 符号
nm -D dist/linux-arm64/libtns_kernels.so | grep tns

# 从 TypeScript 检查 FFI
bun run -e "
  import { computeSuccessChance } from './src/lib/mojo-ffi';
  console.log(computeSuccessChance(0.8, 0.3, 0.5, 0.1));
"

# 检查二进制的平台
file dist/linux-arm64/tns-server

# 检查 MCP（需要数据库）
bun run scripts/run-bsb-compiler.ts
curl http://localhost:8000/health
```

## 古腾堡流水线

### 前置条件
- 下载的 .txt 文件位于 `data/gutenberg/texts/`
- （可选）`data/mcp/gutenberg-catalog.db` 用于元数据补充

### 导入文本
```bash
bun run scripts/import-gutenberg-texts.ts
```
从 .txt 文件 + 目录创建 `data/gutenberg/classics.db`。

### 处理流水线
```bash
# 仅阶段 A（基于规则，无 LLM）
bun run scripts/process-gutenberg.ts --phase v1

# 仅阶段 B（LLM 增强）
bun run scripts/process-gutenberg.ts --phase v2

# 两个阶段
bun run scripts/process-gutenberg.ts --phase all
```

### 扩充语料库
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
