# Límites de velocidad por proveedor

## Resumen

Los límites de velocidad se aplican a cada proveedor LLM de forma independiente. Las claves API de un único proveedor se usan en rotación circular (round-robin), con respaldo automático a un modelo local en caso de fallo.

## Arquitectura

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

## Configuración: `conf/provider-rate-limits.json`

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

## Flujo

### 1. La solicitud llega a LLMQueue

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

### 2. Límite de velocidad alcanzado (429)

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

### 3. Respaldo a modelo local

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. Ventana emergente del frontend

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

## Endpoints de API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/providers/rate-limit` | Obtener la configuración actual de límites de velocidad |
| PUT | `/providers/rate-limit` | Actualizar la configuración de límites de velocidad |
| GET | `/providers/rate-limit/status` | Contadores actuales |
| POST | `/providers/rate-limit/reset` | Restablecer contadores |
| POST | `/providers/rate-limit/switch` | Cambiar modelo manualmente |

## Archivos fuente

| Archivo | Propósito |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | Clase `ProviderRateLimiter` |
| `conf/provider-rate-limits.json` | Configuración de límites de velocidad por proveedor |
| `src/lib/llm-queue.ts` | LLMQueue que usa límites de velocidad por proveedor |
| `src/lib/providers/*.ts` | Implementaciones de proveedores que usan claves con límite de velocidad |
| `src/routes/providers.ts` | Endpoints de estado/control de límites de velocidad |
| `public/static/rate-limit-popup.css` | Estilos de la ventana emergente del frontend |
| `public/static/rate-limit-popup.js` | Lógica de la ventana emergente del frontend |
