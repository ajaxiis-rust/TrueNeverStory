# Ограничение скорости по провайдерам

## Обзор

Ограничения скорости применяются к каждому LLM-провайдеру независимо. API-ключи одного провайдера используются по кругу (round-robin), с автоматическим откатом на локальную модель при сбое.

## Архитектура

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

## Конфигурация: `conf/provider-rate-limits.json`

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

## Поток

### 1. Запрос поступает в LLMQueue

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

### 2. Достигнут лимит скорости (429)

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

### 3. Откат на локальную модель

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. Всплывающее окно во фронтенде

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

## Эндпоинты API

| Метод | Путь | Описание |
|--------|------|-------------|
| GET | `/providers/rate-limit` | Получить текущую конфигурацию лимитов скорости |
| PUT | `/providers/rate-limit` | Обновить конфигурацию лимитов скорости |
| GET | `/providers/rate-limit/status` | Текущие счётчики |
| POST | `/providers/rate-limit/reset` | Сбросить счётчики |
| POST | `/providers/rate-limit/switch` | Переключить модель вручную |

## Исходные файлы

| Файл | Назначение |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | Класс `ProviderRateLimiter` |
| `conf/provider-rate-limits.json` | Конфигурация лимитов скорости по провайдерам |
| `src/lib/llm-queue.ts` | LLMQueue, использующий лимиты скорости по провайдерам |
| `src/lib/providers/*.ts` | Реализации провайдеров, использующие ключи с лимитами скорости |
| `src/routes/providers.ts` | Эндпоинты статуса/управления лимитами скорости |
| `public/static/rate-limit-popup.css` | Стили всплывающего окна фронтенда |
| `public/static/rate-limit-popup.js` | Логика всплывающего окна фронтенда |
