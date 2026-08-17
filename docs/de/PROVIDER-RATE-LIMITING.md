# Rate-Limiting pro Anbieter

## Überblick

Rate-Limits werden unabhängig auf jeden LLM-Anbieter angewendet. API-Schlüssel für einen einzelnen Anbieter werden per Round-Robin verwendet, mit automatischem Fallback auf ein lokales Modell bei einem Fehler.

## Architektur

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

## Konfiguration: `conf/provider-rate-limits.json`

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

## Ablauf

### 1. Anfrage trifft bei LLMQueue ein

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

### 2. Rate-Limit erreicht (429)

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

### 3. Fallback auf lokales Modell

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. Frontend-Popup

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

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| GET | `/providers/rate-limit` | Aktuelle Rate-Limit-Konfiguration abrufen |
| PUT | `/providers/rate-limit` | Rate-Limit-Konfiguration aktualisieren |
| GET | `/providers/rate-limit/status` | Aktuelle Zähler |
| POST | `/providers/rate-limit/reset` | Zähler zurücksetzen |
| POST | `/providers/rate-limit/switch` | Modell manuell wechseln |

## Quelldateien

| Datei | Zweck |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | `ProviderRateLimiter`-Klasse |
| `conf/provider-rate-limits.json` | Rate-Limit-Konfiguration pro Anbieter |
| `src/lib/llm-queue.ts` | LLMQueue mit Rate-Limiting pro Anbieter |
| `src/lib/providers/*.ts` | Anbieter-Implementierungen mit rate-limitierten Schlüsseln |
| `src/routes/providers.ts` | Status-/Steuerungs-Endpunkte für Rate-Limits |
| `public/static/rate-limit-popup.css` | Frontend-Popup-Stile |
| `public/static/rate-limit-popup.js` | Frontend-Popup-Logik |
