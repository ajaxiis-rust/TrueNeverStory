# プロバイダーごとのレート制限

## 概要

レート制限は各 LLM プロバイダーに個別に適用されます。単一プロバイダーの API キーはラウンドロビンで使用され、失敗時にはローカルモデルへ自動的にフォールバックします。

## アーキテクチャ

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

## 設定: `conf/provider-rate-limits.json`

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

## フロー

### 1. リクエストが LLMQueue に到着

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

### 2. レート制限に到達 (429)

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

### 3. ローカルモデルへのフォールバック

```
External provider failed
  ↓
Switch to Ollama (fallbackProvider)
  ↓
Use model from ollama config
  ↓
Return result (slower but works)
```

### 4. フロントエンドポップアップ

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

## API エンドポイント

| メソッド | パス | 説明 |
|--------|------|-------------|
| GET | `/providers/rate-limit` | 現在のレート制限設定を取得 |
| PUT | `/providers/rate-limit` | レート制限設定を更新 |
| GET | `/providers/rate-limit/status` | 現在のカウンター |
| POST | `/providers/rate-limit/reset` | カウンターをリセット |
| POST | `/providers/rate-limit/switch` | 手動でモデルを切り替え |

## ソースファイル

| ファイル | 用途 |
|------|--------|
| `src/lib/provider-rate-limiter.ts` | `ProviderRateLimiter` クラス |
| `conf/provider-rate-limits.json` | プロバイダーごとのレート制限設定 |
| `src/lib/llm-queue.ts` | プロバイダーごとのレート制限を使用する LLMQueue |
| `src/lib/providers/*.ts` | レート制限付きキーを使用するプロバイダー実装 |
| `src/routes/providers.ts` | レート制限のステータス/制御エンドポイント |
| `public/static/rate-limit-popup.css` | フロントエンドのポップアップスタイル |
| `public/static/rate-limit-popup.js` | フロントエンドのポップアップロジック |
