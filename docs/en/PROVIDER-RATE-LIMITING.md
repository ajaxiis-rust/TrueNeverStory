# Per-Provider Rate Limiting

## Overview

Rate limits are applied to each LLM provider independently. API keys for a single provider are used round-robin, with automatic fallback to a local model on failure.

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
│ Key AIza...1 has hit its limit.             │
│ Automatic fallback: Ollama/deepseek-r1      │
│                                             │
│ Switch model: [gemini-2.5-flash ▾]          │
│                                             │
│ [Disable notifications] [Close]              │
└─────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/providers/rate-limit` | Get the current rate-limit config |
| PUT | `/providers/rate-limit` | Update the rate-limit config |
| GET | `/providers/rate-limit/status` | Current counters |
| POST | `/providers/rate-limit/reset` | Reset counters |
| POST | `/providers/rate-limit/switch` | Manually switch model |

## Source Files

| File | Purpose |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | `ProviderRateLimiter` class |
| `conf/provider-rate-limits.json` | Per-provider rate-limit config |
| `src/lib/llm-queue.ts` | LLMQueue using per-provider rate limiting |
| `src/lib/providers/*.ts` | Provider implementations using rate-limited keys |
| `src/routes/providers.ts` | Rate-limit status/control endpoints |
| `public/static/rate-limit-popup.css` | Frontend popup styles |
| `public/static/rate-limit-popup.js` | Frontend popup logic |
