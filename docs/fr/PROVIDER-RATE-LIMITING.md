# Limitation de débit par fournisseur

## Vue d'ensemble

Les limites de débit sont appliquées à chaque fournisseur LLM indépendamment. Les clés API d'un même fournisseur sont utilisées en round-robin, avec un repli automatique vers un modèle local en cas d'échec.

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

## Configuration : `conf/provider-rate-limits.json`

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

## Flux

### 1. La requête arrive au LLMQueue

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

### 2. Limite de débit atteinte (429)

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

### 3. Repli vers le modèle local

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. Popup du frontend

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

## Points de terminaison API

| Méthode | Chemin | Description |
|--------|------|-------------|
| GET | `/providers/rate-limit` | Obtenir la configuration actuelle des limites de débit |
| PUT | `/providers/rate-limit` | Mettre à jour la configuration des limites de débit |
| GET | `/providers/rate-limit/status` | Compteurs actuels |
| POST | `/providers/rate-limit/reset` | Réinitialiser les compteurs |
| POST | `/providers/rate-limit/switch` | Changer de modèle manuellement |

## Fichiers sources

| Fichier | Objectif |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | Classe `ProviderRateLimiter` |
| `conf/provider-rate-limits.json` | Configuration des limites de débit par fournisseur |
| `src/lib/llm-queue.ts` | LLMQueue utilisant la limitation de débit par fournisseur |
| `src/lib/providers/*.ts` | Implémentations de fournisseurs utilisant des clés à débit limité |
| `src/routes/providers.ts` | Points de terminaison de statut/contrôle des limites de débit |
| `public/static/rate-limit-popup.css` | Styles de la popup du frontend |
| `public/static/rate-limit-popup.js` | Logique de la popup du frontend |
