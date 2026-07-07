# Per-Provider Rate Limiting

## Overview

Ограничение запросов к каждому провайдеру индивидуально. Round-robin по API-ключам одного провайдера. Fallback на локальную модель при ошибке.

## Architecture

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

## Config: `conf/provider-rate-limits.json`

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

## Flow

### 1. Request arrives at LLMQueue

```
Task(agentId="director", prompt="...")
  ↓
resolveProvider(agentId="director") → providerId="gemini"
  ↓
ProviderRateLimiter.acquire("gemini")
  ↓
Round-robin: which key? → key1 (12/50 RPM)
  ↓
Execute with key1
```

### 2. Rate limit hit (429)

```
key1 returns 429
  ↓
Mark key1 as unavailable (TTL = time until reset)
  ↓
Try next key → key2
  ↓
key2 works → continue
  ↓
All keys exhausted → fallback to Ollama
  ↓
Send WebSocket notification → frontend shows popup
```

### 3. Fallback to local model

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. Frontend popup

```
┌─────────────────────────────────────────────┐
│ ⚠️ Gemini rate limit (50 RPM)              │
│                                             │
│ Ключ AIza...1 достиг лимита.               │
│ Автоматический fallback: Ollama/deepseek-r1 │
│                                             │
│ Переключить модель: [gemini-2.5-flash ▾]   │
│                                             │
│ [Отключить уведомления] [Закрыть]           │
└─────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/providers/rate-limit/status` | Текущие счётчики |
| POST | `/api/providers/rate-limit/switch` | Ручное переключение модели |
| POST | `/api/providers/rate-limit/reset` | Сброс счётчиков |

## Implementation Steps

- [x] T2.1: Create `ProviderRateLimiter` class (`src/lib/provider-rate-limiter.ts`)
- [x] T2.2: Create config loader for `conf/provider-rate-limits.json`
- [x] T2.3: Update `LLMQueue` to use per-provider rate limiting
- [x] T2.4: Add WebSocket notification for rate limit events
- [x] T2.5: Add API endpoints for rate limit status/control
- [x] T2.6: Add frontend popup component
- [x] T2.7: Update LLM providers to use rate-limited keys
- [x] T2.8: Test full flow

## Files to create/modify

| File | Action | Status |
|------|--------|--------|
| `src/lib/provider-rate-limiter.ts` | CREATE | ✅ |
| `conf/provider-rate-limits.json` | CREATE | ✅ |
| `src/lib/llm-queue.ts` | MODIFY | ✅ |
| `src/lib/providers/google-provider.ts` | MODIFY | ✅ |
| `src/lib/providers/openai-provider.ts` | MODIFY | ✅ |
| `src/lib/providers/anthropic-provider.ts` | MODIFY | ✅ |
| `src/lib/providers/provider-manager.ts` | MODIFY | ✅ |
| `src/services/narrative-bootstrapper.ts` | MODIFY | ✅ |
| `src/services/narrative-service.ts` | MODIFY | ✅ |
| `src/routes/providers.ts` | MODIFY | ✅ |
| `src/index.ts` | MODIFY | ✅ |
| `public/static/rate-limit-popup.css` | CREATE | ✅ |
| `public/static/rate-limit-popup.js` | CREATE | ✅ |
| `docs/PROVIDER-RATE-LIMITING.md` | CREATE | ✅ |
