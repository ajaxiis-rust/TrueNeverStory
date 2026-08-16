# TrueNeverStory

### 玩着写你的书。

TrueNeverStory 是一个 AI 驱动的互动叙事引擎，采用 **State-First 架构**。每个 NPC 都有记忆，每个行动都有确定性结果，故事永不停歇。扮演一个角色，探索一个活生生的世界，看着你的选择塑造叙事——或者让世界自行发展。

基于 TypeScript (Bun + Hono) 构建，使用 C FFI 内核处理高性能计算。

**[English](../../README.md) | [Русский](../ru/README.md) | [Deutsch](../de/README.md) | [Français](../fr/README.md) | [Español](../es/README.md) | [日本語](../ja/README.md)**

---

## 简介

你在一个永久鲜活的世界中扮演一个角色。你的每一个行动都会被解析为结构化的意图，经过确定性模拟，再通过专门的 AI 代理流水线以散文形式返回。引擎的内部语言是英语，翻译发生在输出边界，因此故事始终用你的语言讲述。

- **State-First** — 模拟先于文字执行，因此结果是确定且可复现的。
- **六个代理，一个讲述者** — Dramaturg（原型）、Validator（事实）、Stylist（散文）、Actor（NPC）、Censor（风格）、Chronicler（记忆）。
- **文学即代码** — 圣经作为叙事原型，古腾堡作为散文风格，维基百科作为事实核查，通过 MCP 工具接入。

## 功能

| 领域 | 描述 |
|------|------|
| **State-First 流水线** | 确定性模拟 → 状态变更 → 受约束的散文 |
| **鲜活世界** | 角色、地点、派系通过知识图谱连接，O(1) 查找 |
| **记忆与 RAG** | 向量记忆，混合 FTS5 + 稠密 + RRF 检索（BGE-M3） |
| **概率系统** | 战斗、说服、潜行、恋爱的确定性结果 |
| **NPC 经济** | 封建等级（10 级）、税收、粮食生产、家族系统 |
| **规则引擎** | 14 个社会/经济系统，带协同矩阵 |
| **多世界** | 隔离的世界，支持跨世界事件和传送门 |
| **实时流式传输** | WebSocket + SSE，带心跳进度 |
| **i18n** | EN、RU、DE、FR、ES、JA、ZH |
| **插件系统** | 生命周期钩子和 API |
| **功能开关** | 渐进式发布，按百分比定向 |

## 快速开始

**无需 Bun、Node.js 或任何运行时。** 只需下载并运行。

### 1. 下载

从 [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest) 获取适合你平台的最新版本：

| 平台 | 文件 |
|------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. 运行

启动器会自动检测你的 LLM 提供商（Ollama、LM Studio、OpenAI、llama.cpp），配置 `.env` 并启动服务器。

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# 解压 tns-windows-x64.zip，然后：
.\startgame.ps1
```

### 3. 打开

访问 **http://localhost:8000** —— 密码：**`changeme`**（首次登录后请在设置中更改）。

就这样。无需数据库设置、无需安装软件包、无需编辑配置文件。

## 配置 LLM

打开 **设置** 页面或编辑 `.env`。兼容 Ollama、LM Studio、vLLM、OpenAI、Anthropic、Google 以及任何 OpenAI 兼容 API。详见 [HARDWARE.md](HARDWARE.md) 和 [PROVIDER-RATE-LIMITING.md](../en/PROVIDER-RATE-LIMITING.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](../en/ARCHITECTURE.md) | 系统设计、流水线、服务 |
| [API.md](API.md) | HTTP 和 WebSocket 端点 |
| [AGENTS.md](AGENTS.md) | 代理参考（Big Six） |
| [DEV.README.md](DEV.README.md) | 开发者指南——安装、命令、DI |
| [COMPILE.md](../en/COMPILE.md) | 构建二进制文件和交叉编译 |
| [CHANGELOG.md](../en/CHANGELOG.md) | 发布历史 |
| [about.md](about.md) | 世界规则与经济 |
| [MIGRATION.md](../en/MIGRATION.md) | 版本迁移说明 |
| [security-audit.md](../en/security-audit.md) | 安全审计结果 |

## 从源码构建

需要 [Bun](https://bun.sh) v1.0+。

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

命令：`bun run dev`（热重载）、`bun run start`（生产模式）、`bun run lint`（类型检查）、`bun test`（测试套件）。二进制发布请见 [COMPILE.md](../en/COMPILE.md)。

## 许可证

MIT
