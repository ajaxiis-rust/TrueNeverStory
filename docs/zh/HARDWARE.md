# 硬件要求和模型推荐

TrueNeverStory 灵活多变 — 可以在从树莓派到多 GPU 服务器的任何设备上运行。根据可用硬件选择配置。

---

## 最低要求

| 组件 | 最低 | 推荐 |
|------|------|------|
| **内存** | 4 GB | 8+ GB |
| **CPU** | 2 核 | 4+ 核 |
| **存储** | 2 GB | 10+ GB |
| **GPU** | 不需要 | 任何带 VRAM 的 GPU |

---

## 配置方案

### 方案 1：超轻量 (2-4 GB RAM)

**适用场景：** 老旧笔记本、VPS、树莓派 4+

```
意图解析：        Gemma 3 1B (Q4_K_M) — 760 MB
翻译：            NLLB-200 600M (Q4_K_M) — 340 MB
叙事生成：        云端 API (Gemini Flash)
嵌入向量：        哈希回退 (无需模型)
```

**总内存：** ~1.1 GB  
**速度：** 慢 (CPU 上 3-5 tok/s)  
**质量：** 可接受  
**隐私：** 部分 (叙事通过云端)

---

### 方案 2：均衡 (4-8 GB RAM)

**适用场景：** 现代笔记本、台式机、小型服务器

```
一体化：          Llama 3.2 3B (Q4_K_M) — 2 GB
                  或 Qwen 2.5 3B (Q4_K_M) — 2 GB
翻译：            NLLB-200 600M (Q4_K_M) — 340 MB
嵌入向量：        BGE M3 (Q4_K_M) — 438 MB
```

**总内存：** ~2.8 GB  
**速度：** 中等 (CPU 上 5-10 tok/s)  
**质量：** 良好  
**隐私：** 完全 (全部本地)

---

### 方案 3：高质量 (8-16 GB RAM)

**适用场景：** 游戏 PC、工作站、专用服务器

```
一体化：          Gemma 3 4B (Q4_K_M) — 2.3 GB
                  或 Qwen 2.5 7B (Q4_K_M) — 4.4 GB
翻译：            NLLB-200 600M (Q8_0) — 620 MB
嵌入向量：        BGE M3 (Q8_0) — 635 MB
```

**总内存：** ~3.6-5.5 GB  
**速度：** 良好 (CPU 上 10-20 tok/s，GPU 上 30+)  
**质量：** 高  
**隐私：** 完全

---

### 方案 4：GPU 加速 (4+ GB VRAM)

**适用场景：** 带 GPU 的游戏 PC、带独立 GPU 的工作站

```
LLM：             Llama 3.1 8B (Q4_K_M) — 5 GB VRAM
翻译：            同一模型 (多语言)
嵌入向量：        BGE M3 (Q8_0) — CPU 卸载
```

**总 VRAM：** ~5 GB  
**速度：** 快速 (30-50 tok/s)  
**质量：** 优秀  
**隐私：** 完全

---

## 按任务推荐模型

### 意图解析 (命令识别)

| 模型 | 大小 | 速度 | 质量 | 备注 |
|------|------|------|------|------|
| Gemma 3 1B | 760 MB | 快速 | 基础 | 最低要求 |
| Llama 3.2 3B | 2 GB | 中等 | 良好 | 推荐 |
| Gemma 3 4B | 2.3 GB | 中等 | 高 | 最佳质量 |

### 翻译 (多语言)

| 模型 | 大小 | 语言 | 速度 | 质量 |
|------|------|------|------|------|
| NLLB-200 600M | 340-620 MB | 35+ | 快速 | 良好 |
| MADLAD-400 3B | 2 GB | 400+ | 中等 | 高 |
| Qwen 2.5 3B | 2 GB | 29+ | 中等 | 高 |

### 叙事生成 (散文)

| 模型 | 大小 | 速度 | 质量 | 备注 |
|------|------|------|------|------|
| Gemma 3 1B | 760 MB | 快速 | 基础 | 对叙事太弱 |
| Llama 3.2 3B | 2 GB | 中等 | 良好 | 叙事最低要求 |
| Gemma 3 4B | 2.3 GB | 中等 | 高 | 推荐 |
| Qwen 2.5 7B | 4.4 GB | 慢 | 优秀 | 最佳质量 |
| YandexGPT 5 Lite 8B | 4.9 GB | 慢 | 优秀 | 俄语文本最佳 |

### 嵌入向量 (语义搜索)

| 模型 | 大小 | 维度 | 质量 |
|------|------|------|------|
| Embedding Gemma 300M | 329 MB | 768 | 基础 |
| BGE M3 (Q4_K_M) | 438 MB | 1024 | 良好 |
| BGE M3 (Q8_0) | 635 MB | 1024 | 高 |
| Qwen3 Embedding 0.6B | 639 MB | 1024 | 高 |

---

## 配置示例

### 示例 1：经济型 VPS (4 GB RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Ollama 设置
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**安装模型：**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### 示例 2：带 GPU 的台式机 (8 GB VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### 示例 3：云端混合

```bash
# .env — 叙事通过云端
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# 翻译用本地 (隐私)
OLLAMA_NUM_PARALLEL=1
```

**在代理设置中：**
- Narrator → Google Gemini (云端)
- Translation → Ollama NLLB-200 (本地)
- Intent Parser → Ollama Llama 3.2 3B (本地)

---

## 性能提示

1. **仅 CPU：** 使用 Q4_K_M 量化以获得最佳速度/质量比
2. **GPU：** 如果 VRAM 允许，使用 Q5_K_M 或 Q8_0 获得更好质量
3. **并行请求：** 在 CPU 上设置 `WORLD_LLM_MAX_CONCURRENT=1`
4. **嵌入向量：** 如果内存紧张，使用哈希回退 (禁用嵌入模型)
5. **翻译：** NLLB-200 针对翻译优化，而非通用聊天

---

## 引擎：Ollama vs llama.cpp

TrueNeverStory 支持两种引擎，但**推荐 llama.cpp** 用于本地部署。

### 为什么选择 llama.cpp 而非 Ollama

| | Ollama | llama.cpp |
|--|--------|-----------|
| **内存控制** | 守护进程占用**所有可用内存**作为模型缓存 | 通过 `--ctx-size`、`--threads`、`--parallel` 显式限制 |
| **CPU 核心** | 使用所有核心，系统可能卡顿 | `startgame.sh` 为系统**保留至少 1 个核心** |
| **控制力** | 最少 — 守护进程自行决定 | 完全 — 每个参数都可配置 |
| **服务器** | 作为后台守护进程运行（始终开启） | 由脚本启动，随游戏停止 |
| **模型** | `ollama pull` — 方便但缓存增长 | `local-models/` 中的 `.gguf` 文件 — 手动下载 |
| **API** | OpenAI 兼容（`localhost:11434/v1`） | 相同协议（`127.0.0.1:5001/v1`） |

### startgame.sh 如何配置 llama.cpp

脚本自动检测硬件并调整参数：

| 硬件 | Threads | Parallel | Context |
|------|---------|----------|---------|
| 2-4 核，≤4 GB RAM | CPU-1 | 1 | 4096 |
| 4-8 核，≤8 GB RAM | CPU-2 | 2 | 8192 |
| 8+ 核，≤16 GB RAM | 6 | 3 | 16384 |
| GPU 4+ GB VRAM | 6 | 3 | 16384 |
| GPU 8+ GB VRAM | 6 | 3 | 32768 |

**关键点：** 脚本始终为系统保留资源 — Ollama 的守护进程不会这样做。

### Embedding 服务器（独立进程）

用于语义搜索，`startgame.sh` 启动一个**独立的** llama-server，带有 `--embedding --pooling mean` 标志：

```bash
llama-server --model BGE-M3.gguf --port 5002 \
    --embedding --pooling mean --threads 1
```

这些标志是**必需的** — 没有它们，服务器会像普通 LLM 一样输出文本而非向量。

### 提供者自动检测顺序

`startgame.sh` 按优先级检查提供者：

1. **Ollama**（端口 11434）— 如果已安装且守护进程运行中
2. **LM Studio**（端口 1234）
3. **vLLM**（端口 8080）
4. **OpenAI API** — 如果设置了 `OPENAI_API_KEY`
5. **llama.cpp** — 如果存在 `llama-server` 二进制文件 + `local-models/` 中的 `.gguf` 文件

**提示：** 要使用 llama.cpp 而非 Ollama，请在启动前停止 Ollama 守护进程（`ollama stop`）— 脚本将找到 llama.cpp。

### 推荐文件结构

```
local-models/
├── Qwen2.5-7B-Q4_K_M.gguf      # 叙事 LLM
├── BGE-M3-Q8_0.gguf             # 搜索用 Embeddings
└── NLLB-200-600M-Q4_K_M.gguf   # 翻译（可选）
```

---

## 语言支持

| 模型 | 语言 | 最佳用途 |
|------|------|----------|
| NLLB-200 | 35+ | 翻译 |
| MADLAD-400 | 400+ | 稀有语言 |
| Gemma 3 | 140+ | 通用多语言 |
| Qwen 2.5 | 29+ | 中文、亚洲语言 |
| YandexGPT | RU/EN | 俄语文本 |
| GigaChat | RU/EN | 俄语叙事 |
