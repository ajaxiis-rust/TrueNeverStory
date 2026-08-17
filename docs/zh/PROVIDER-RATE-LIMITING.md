# 按提供商的速率限制

## 概述

速率限制独立应用于每个 LLM 提供商。单个提供商的 API 密钥按轮询（round-robin）方式使用，失败时自动回退到本地模型。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    LLMQueue                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ gemini-queue│  │ openai-queue│  │ ollama-queue│     │
│  │ [key1,key2] │  │ [key1]      │  │ [local]     │     │
│  │ rpm: 50     │  │ rpm: 60     │  │ rpm: 999    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                │                │              │
│         ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────────────┐    │
│  │           ProviderRateLimiter                    │    │
│  │  acquire(providerId) → waits if rate limited     │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 配置：`conf/provider-rate-limits.json`

```json
{
  "providers": {
    "gemini": {
      "keys": ["AIza...1", "AIza...2", "AIza...3"],
      "rpm": 50,
      "minIntervalMs": 3000,
      "models": ["gemini-2.5-flash", "gemini-2.0-pro"]
    },
    "openai": {
      "keys": ["sk-...1"],
      "rpm": 60,
      "minIntervalMs": 1000,
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    "ollama": {
      "keys": [],
      "rpm": 999,
      "minIntervalMs": 0,
      "models": ["deepseek-r1:1.5b"]
    }
  },
  "fallbackProvider": "ollama"
}
```

## 流程

### 1. 请求到达 LLMQueue

```
Task(agentId="director", prompt="...")
  ↓
resolveProvider(agentId="director") → providerId="gemini"
  ↓
ProviderRateLimiter.acquire("gemini")
  ↓
轮询：使用哪个密钥？→ key1 (12/50 RPM)
  ↓
使用 key1 执行
```

### 2. 触发速率限制（429）

```
key1 返回 429
  ↓
将 key1 标记为不可用（TTL = 重置剩余时间）
  ↓
尝试下一个密钥 → key2
  ↓
key2 可用 → 继续
  ↓
所有密钥耗尽 → 回退到 Ollama
  ↓
发送 WebSocket 通知 → 前端显示弹窗
```

### 3. 回退到本地模型

```
外部提供商失败
  ↓
切换到 Ollama（fallbackProvider）
  ↓
使用 ollama 配置中的模型
  ↓
返回结果（更慢但可用）
```

### 4. 前端弹窗

```
┌─────────────────────────────────────────────┐
│ ⚠️ Gemini 速率限制（50 RPM）                    │
│                                             │
│ 密钥 AIza...1 已达到其限制。                    │
│ 自动回退：Ollama/deepseek-r1                 │
│                                             │
│ 切换模型：[gemini-2.5-flash ▾]               │
│                                             │
│ [禁用通知] [关闭]                              │
└─────────────────────────────────────────────┘
```

## API 端点

| 方法 | 路径 | 描述 |
|--------|------|-------------|
| GET | `/providers/rate-limit` | 获取当前的速率限制配置 |
| PUT | `/providers/rate-limit` | 更新速率限制配置 |
| GET | `/providers/rate-limit/status` | 当前计数器 |
| POST | `/providers/rate-limit/reset` | 重置计数器 |
| POST | `/providers/rate-limit/switch` | 手动切换模型 |

## 源文件

| 文件 | 用途 |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | `ProviderRateLimiter` 类 |
| `conf/provider-rate-limits.json` | 按提供商的速率限制配置 |
| `src/lib/llm-queue.ts` | 使用按提供商速率限制的 LLMQueue |
| `src/lib/providers/*.ts` | 使用受速率限制密钥的提供商实现 |
| `src/routes/providers.ts` | 速率限制状态/控制端点 |
| `public/static/rate-limit-popup.css` | 前端弹窗样式 |
| `public/static/rate-limit-popup.js` | 前端弹窗逻辑 |
