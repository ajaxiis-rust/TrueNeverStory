# TrueNeverStory v0.10.3 – インタラクティブ・ナラティブ・ゲームプラットフォーム

**TrueNeverStory v0.10.3** は、[BRING](https://github.com/Eva-E1/BRING)ファンタジー世界プラットフォームの現代的な再実装で、Pythonから高性能ハイブリッドスタックに移行されました：

- **TypeScript (Bun + Hono)** – Webサーバー、API、WebSocket、ルーティング、認証、ストリーミング、ビジネスロジック
- **Mojo FFI** – 確率計算およびベクトル演算用のコンピュータカーネル（オプション、TypeScriptフォールバック付き）

> *「単一のプロンプトから、生き生きとした世界へ――すべてのNPCが覚え、すべての行動がチャンスを持ち、物語は決して終わらない。」*

---

## 機能

| 機能 | 説明 |
|------|------|
| **レイヤードワールド構築** | すべてのエンティティ（キャラクター、場所、アイテム、派閥）に3つのレイヤー：L1（分類）、L2（詳細）、L3（秘密） |
| **グラフベースの知識** | 有向グラフ内のすべての関係、O(1)検索、BFS走査、ブランチ管理 |
| **自己最適化メモリ** | ベクトルアクセラレーション付きメモリ、認知パイプライン（エンティティ抽出、矛盾検出、ペインシグナル） |
| **全エージェント向けRAG** | llama.cpp（BGE-M3）による完全な埋め込みサポート + SQLiteハイブリッド検索（FTS5 + 密ベクトル + RRF） |
| **確率システム** | 戦闘、説得、ステルス、ロマンスの決定的結果、動的修飾子 |
| **ロマンスシステム** | 確率ベースのアクションによる完全なロマンチックな関係管理 |
| **リビングディレクター** | バックグラウンドエージェントがアーク、悪役の計画、NPCのやり取りを展開 |
| **没入型ロールプレイ** | 三人称ナラティブ、NPCダイアログ、シーン遷移――LLMはあなたのキャラクターの代わりに話さない |
| **クエストシステム** | 動的クエスト生成と目標追跡 |
| **リサーチャーエージェント** | ファクトチェック、リアリズム検証、レシピ・キャラクター・シーンの歴史的精度 |
| **NPCインテリジェンス** | メモリ検索、自律行動、ソーシャルリレーション、対話コンテキストの充実 |
| **NPC経済** | 封建階級（10ランク）、税金、賄賂、食料生産、家族制度、悪徳、34のアーキタイプ |
| **アイテムシステム** | 永続ステータスブースト（1-10%）付きユニークアイテム、歴史家/リサーチャーエージェントによって評価 |
| **14の専門エージェント** | ナレーター、ディレクター、シーン、NPC、年代記、ストーリープランナー、ソーシャル、悪役、リサーチャー、歴史家、地図師、商人、クエストgeber、知識の守り手 |
| **リアルタイムWebSocket** | ライブロールプレイストリーミングとメモリイベントブロードキャスト |
| **SSEストリーミング** | Server-Sent Eventsによるプログレッシブナラティブ配信 |
| **i18n（7言語）** | 完全ローカライズ：EN、RU、DE、FR、ES、JA、ZH――UI、プロンプト、エージェント名 |
| **SQLiteストレージ** | エージェントプロンプトとUI文字列はワールド+言語ごとにSQLiteに保存 |
| **パスワード認証** | HttpOnly Cookieによるセッションベース認証 |
| **ターミナルUI** | 美しいダークターミナルスタイルのWebインターフェース |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    ブラウザ (Terminal UI)                 │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              サービス層                              │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           メモリシステム (WorldMemory)                │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           データ層 (EntityStore + JSON)               │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Mojo FFI (オプション、自動検出)                  │  │
│  │  確率カーネル │ ベクトル演算                          │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (OpenAI互換)
┌───────────────────────▼─────────────────────────────────┐
│              外部LLM API (Ollama, OpenAIなど)             │
└─────────────────────────────────────────────────────────┘
```

---

## クイックスタート

### 前提条件

- [Bun](https://bun.sh) v1.0+（開発用）
- OpenAI互換のLLM API（OpenAI、Ollama、vLLM、LM Studioなど）

コンパイル済みバイナリ — 何も不要、そのまま実行。

### 1. インストール

```bash
cd TNS
bun install
```

### 2. LLM設定

`http://localhost:8000/settings` を開き、LLMプロバイダーを設定：

- **Ollama**（ローカル）: `http://localhost:11434/v1`、モデル: `llama3`
- **OpenAI**: `https://api.openai.com/v1`、モデル: `gpt-4o-mini`
- **vLLM**（ローカル）: `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

または `conf/settings.json` を直接編集。

### 3. 起動

```bash
bun run dev
```

`http://localhost:8000` を開き、パスワードでログイン: **`changeme`**

初回ログイン後、設定でパスワードを変更してください。

### バイナリ（依存関係なし）

```bash
# GitHub Releasesからダウンロード後：
chmod +x tns-server
./tns-server
# ログイン: http://localhost:8000 — パスワード: changeme
```

---

## 使用例

### バイナリから実行（依存関係なし）

お使いのプラットフォーム用の最新リリースをダウンロードして直接実行します：

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

Bun、Node.js、その他のランタイムは不要です。`.env` を設定して実行するだけです。

### ソースコードから実行（開発）

```bash
# ホットリロード開発モード
bun run dev

# 本番モード（ホットリロードなし）
bun run start

# バンドルのみ作成（バイナリなし）
bun run build
```

### ローカルLLMで実行（Ollama）

```bash
# 1. Ollamaをモデル付きで起動
ollama pull llama3
ollama serve

# 2. TNSをOllama用に設定
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. サーバーを起動
./tns-server
```

### OpenAI APIで実行

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### API使用例

```bash
# 認証
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# 新しいセッションを開始
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "アラゴルン", "role": "protagonist"}'

# メッセージを送信してナラティブを取得
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "剣を抜き、竜に向かって立ち向かう"}'

# ストリーミング応答（SSE）
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "この古代の森について教えてください"}'

# エンティティを検索
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# エンティティ詳細を取得
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# グラフの近隣を取得
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# 確率を確認
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# クエスト一覧
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocketリアルタイムロールプレイ

```javascript
// WebSocket接続
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: '酒場に入り、周りを見回す'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // リアルタイムナラティブストリーム
};
```

### ソースコードからコンパイル

```bash
# Mojoをインストール（オプション、パフォーマンスカーネル用）
curl https://get.modular.com | sh
modular install mojo

# 現在のプラットフォーム用にコンパイル
./build.sh compile

# 特定のプラットフォーム用にコンパイル
./build.sh compile linux-x64
./build.sh compile macos-arm64

# 全プラットフォーム用にクロスコンパイル
./build.sh cross

# 詳細はCOMPILE.mdを参照
```

---

## APIエンドポイント

### 認証

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/login` | ログインページ |
| POST | `/login` | 認証（フォーム: `password=...`） |
| POST | `/logout` | セッションクリア |

### チャット

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | `/api/chat/setup` | ロールプレイセッション初期化 |
| POST | `/api/chat/message` | メッセージ送信、ナラティブ取得 |
| POST | `/api/chat/stream` | SSEストリーミングレスポンス |
| GET | `/api/chat/session` | 現在のセッション状態 |
| GET | `/api/chat/history` | 会話履歴 |

### エンティティとグラフ

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/entity/:uid` | エンティティ詳細 |
| GET | `/api/neighbors/:uid` | 深度付き隣接ノード |
| GET | `/api/path` | 最短経路検索 |
| GET | `/api/search` | 名前またはセマンティック検索 |
| GET | `/api/graph/summary` | グラフ統計 |

### ブランチ

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | `/api/branch/create` | ブランチ作成 |
| POST | `/api/branch/switch` | アクティブブランチ切替 |
| POST | `/api/branch/merge` | mainにマージ |
| GET | `/api/branch/list` | 全ブランチ一覧 |

### 確率

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/probability/:character/:profile` | 成功確率 |
| POST | `/api/probability/modifier` | 修飾子適用 |
| GET | `/api/probability/modifiers/:entity` | アクティブ修飾子 |

### ロマンス

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/romance/:c1/:c2` | 関係ステータス |
| POST | `/api/romance/attempt/:action` | ロマンチックアクション試行 |
| GET | `/api/romance/characters/:char` | キャラクターのロマンス一覧 |

### クエスト

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/quests` | 全クエスト一覧 |
| GET | `/api/quest/:id` | クエスト詳細 |

### セッションとメンテナンス

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/sessions` | セッション履歴一覧 |
| POST | `/api/maintenance/run` | メンテナンス実行 |
| GET | `/api/maintenance/status` | メンテナンス統計 |
| POST | `/api/launch` | 新規ゲーム開始 |
| POST | `/api/continue` | ゲーム再開 |
| GET | `/api/health` | ヘルスチェック |

### エージェント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/agents` | 全エージェント設定一覧 |
| GET | `/api/agents/:id` | 個別エージェント設定 |
| PUT | `/api/agents/:id` | エージェント設定更新 |
| PUT | `/api/agents/:id/prompts` | エージェントプロンプト更新 |
| POST | `/api/agents/:id/reset` | デフォルトにリセット |
| GET | `/api/agents/providers/options` | プロバイダー/モデルオプション |

### WebSocket

| エンドポイント | 説明 |
|---------------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | リアルタイムロールプレイ |
| `ws://host:8000/ws/memory` | メモリイベントフィード |

---

## プロジェクト構造

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod検証済み環境設定
│   ├── lib/              # LLMクライアント、キュー、イベントバス、履歴、アトミックI/O
│   ├── memory/           # WorldMemory、FAISSインデックス、認知パイプライン、スコアリング
│   ├── middleware/        # Auth、CORS、エラーハンドラ、ロガー、レートリミッタ
│   ├── models/           # Entity、chat、probability、romance、quest、story、memory
│   ├── routes/           # 13ルートモジュール（chat、entities、agentsなど）
│   ├── services/         # 23サービス（ロールプレイエンジン、エージェント、確率など）
│   ├── intelligence/     # グラフアナライザー、重複検出、レコメンダー、シーン生成
│   ├── i18n/             # 言語パック（EN、RU、DE、FR、ES、JA、ZH）
│   ├── store/            # O(1) NameIndex付きEntityStore
│   ├── utils/            # ロガー、ハッシュ、時間ユーティリティ
│   ├── app.ts            # ミドルウェアチェーン付きHonoアプリ
│   └── index.ts          # サーバーエントリポイント
├── mojo/
│   ├── kernels/          # FFI確率・ベクトルカーネル
│   └── src/              # 81 Mojoソースファイル（オプションのパフォーマンスバックエンド）
├── public/
│   ├── index.html        # ターミナルスタイルWeb UI
│   ├── agents.html       # エージェント設定（i18n対応）
│   ├── providers.html    # LLMプロバイダー設定
│   ├── models.html       # モデル管理
│   └── settings.html     # グローバル設定
├── worlds/
│   ├── default/          # Active world
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # Per-agent JSON configs
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── local-models/         # GGUF models (downloaded locally)
├── tests/
│   ├── entity-store.test.ts
│   ├── probability-engine.test.ts
│   └── integration/
│       └── server.test.ts
├── .env                  # 設定（git無視）
├── .env.example          # 設定テンプレート
├── startgame.sh          # サーバー+llama-serverランチャー（PIDクリーンアップ付き）
├── package.json
├── tsconfig.json
└── plan.md               # 移行計画
```

---

## 設定

すべての設定は環境変数（`.env`ファイル）で行います：

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `WORLD_LLM_BASE_URL` | – | OpenAI互換LLMエンドポイント |
| `WORLD_LLM_API_KEY` | – | APIキー |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | モデル名 |
| `WORLD_LLM_TIMEOUT` | `120` | リクエストタイムアウト（秒） |
| `WORLD_LLM_MAX_TOKENS` | `4096` | 応答あたり最大トークン |
| `WORLD_LLM_TEMPERATURE` | `0.7` | サンプリング温度 |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | 最大同時LLMリクエスト数 |
| `WORLD_DB_PATH` | `./worlds/default` | データベースディレクトリ |
| `LOCAL_MODELS_PATH` | `./local-models` | ローカルGGUFモデルディレクトリ |
| `WORLD_SERVER_HOST` | `0.0.0.0` | リッスンアドレス |
| `WORLD_SERVER_PORT` | `8000` | リッスンポート |
| `AUTH_PASSWORD` | – | ログインパスワード（空=認証なし） |
| `MAX_SERVE_URL` | `http://localhost:8000` | Mojo MAX Serveエンドポイント |

---

## 開発

```bash
# ホットリロード付き開発
bun run dev

# 型チェック
npx tsc --noEmit

# 全テスト実行
bun test

# 特定テスト実行
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# 本番ビルド
bun run build
```

---

## 最近の変更

### NPC経済システム (v0.10.3)

生きたNPCによる完全な封建経済シミュレーション：

| 機能 | 説明 |
|------|------|
| **封建階級** | 10ランク：奴隷 → 市民 → バロネット → バロン → ヴィコウント → 伯爵 → マルキュー → 公爵 → 王 → 皇帝 |
| **NPCステータス** | 6ステータス：富、力、人気、健康、経験、陰謀 |
| **税制** | 階層的税金：0%（皇帝）→ 90%（市民）、力/人気で軽減 |
| **賄賂メカニズム** | リスクベースの賄賂：10%基本 + 金額/目撃者数、裏切り閾値 |
| **食料経済** | 奴隷は月300-1000の食料を生産、全員がランクに応じて消費 |
| **家族制度** | 収入の50%を妻に、10%を子供に、死亡時に相続 |
| **悪徳と退廃** | ステータスに影響する8つの悪徳、年齢ベースの健康低下 |
| **34のアーキタイプ** | 22デフォルト + 12ユニーク、重み付きランダム選択、コンテキストグループ |
| **権力喪失** | 反乱 → 死亡/奴隷制、戦争 → 身代金/奴隷制、破産 → 奴隷制 |
| **アイテムブースト** | ユニークアイテムは永続ステータスブースト（1-10%）を提供、歴史家/リサーチャーが評価 |

### プロンプトと翻訳のSQLiteストレージ (v0.10.3)
エージェントプロンプトとUI文字列は、ワールド+言語ごとにSQLiteに保存されるようになりました：

- **`agent_prompts`テーブル** — ワールド+言語ごとに`systemPrompt`、`userTemplate`、`outputFormat`を保存
- **`ui_translations`テーブル** — 言語+ページごとにUI文字列を保存（agents、settings、agent_names、agent_descs）
- **デュアルライト戦略** — 後方互換性のために、SQLiteとJSONファイルの両方に書き込み
- **言語別プロンプト** — 各ワールドが独自の言語を持ち、どのプロンプトを読み込むかを決定
- **自動シード** — 初回起動時に、7つのすべての言語が`ui_translations`にシードされる

**ストレージ階層：**
1. **SQLite** (`tns.db`) — メインストレージ、ワールド+言語ごと
2. **JSONファイル** (`worlds/{world}/agents/{agentId}.json`) — 移行中のフォールバック
3. **ハードコードデフォルト** (`DEFAULT_PROMPTS` in `src/services/agent-config.ts`)

### i18n APIエンドポイント
翻証管理用の新しいREST API：

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/i18n/translations/:lang/:page` | 言語+ページの翻訳を取得 |
| GET | `/api/i18n/translations/:lang` | 言語のすべての翻訳を取得 |
| PUT | `/api/i18n/translations` | 翻訳を一括更新 |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | 翻訳キーを削除 |

**リクエスト例（PUT）：**
```json
{
  "language": "ja",
  "page": "agents",
  "entries": {
    "title": "エージェント設定",
    "savePrompts": "プロンプトを保存"
  }
}
```

### 言語別エージェントプロンプト
エージェントプロンプトが、ワールドと言語ごとのストレージをサポートするようになりました：

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**言語別プロンプトのAPIエンドポイント：**
- `GET /api/agents/:id/prompts/:lang` — 特定の言語のプロンプトを取得
- `PUT /api/agents/:id/prompts/:lang` — 特定の言語のプロンプトを更新

### フロントエンドi18n統合
フロントエンドページが、APIを通じてSQLiteから翻訳を読み込むようになりました：

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### 新しい専門エージェント (v0.10.3)
世界の充実とプレイヤーインタラクションのための5つの新エージェント：

- **歴史家** — 歴史的出来事、伝承、年代記を回想し叙述
- **地図師** — 場所、距離、道、地理に関する情報を提供
- **商人** — 取引、価格設定、NPC在庫管理を担当
- **クエストgeber** — 世界の状態に基づいたコンテキストクエストを目標と報酬付きで生成
- **知識の守り手** — 世界の事実、魔法のルール、種族情報、確立された教義を維持

各エージェントは `src/services/agent-config.ts` で設定された独自のシステムプロンプト、ユーザーテンプレート、出力形式を持っています。

### 全エージェント向けRAGシステム (v0.10.3)
各エージェントのための長期メモリ付き完全な埋め込みサポート：

- **llama.cpp Embedding Server** — ベクトル生成用の専用BGE-M3モデル（ポート5002）
- **SQLiteハイブリッド検索** — FTS5キーワード検索 + 密ベクトル検索 + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — `role`カラムによるエージェントごと、セッションごとのメモリ分離
- **ワールド分離メモリ** — 他のワールドからの幻覚を防ぐため、ワールドごとにメモリを分離
- **Mojoグラフ演算** — 性能のためMojo FFIによるベクトル演算（コサイン類似度、L2距離）

**アーキテクチャ：**
```
エージェントリクエスト → AgentMemoryStore → SQLite（ハイブリッド検索）
                                                ↓
                                        ┌───────┴───────┐
                                        │ FTS5 (LIKE)   │ 密ベクトル (BGE-M3)
                                        │ キーワード     │ コサイン類似度
                                        │ 検索           │
                                        └───────┬───────┘
                                                ↓
                                        Reciprocal Rank Fusion (RRF)
                                                ↓
                                        LLMプロンプト用コンテキスト
```

**主要ファイル：**
- `src/lib/agent-memory-store.ts` — エンベッドインテグレーション付きAgentMemoryStore
- `src/lib/sqlite-store.ts` — FTS5 + ベクトル検索 + RRFのSQLiteStore
- `src/lib/vector-ops.ts` — ベクトル演算（コサイン、L2、内積）

### NPCシステム刷新 (v0.10.3)
よりスマートなNPC行動のための4つの新サービス：

- **MemoryEngine** — セマンティック検索、感情/場所フィルタリング、NPCのエピソード記憶によるメモリクラスタリング
- **BehaviorEngine** — 自発的アクション、目標評価、日次ルーテイン、ムード適応、意思決定
- **SocialGraph** — 関係追跡、評価スコア、共通の友人、派閥メンバーシップと対立
- **DialogueContext** — 関係、記憶、ムード、場所、派閥、目標、インベントリを組み合わせたリッチNPCプロンプト

**アーキテクチャ：** 2つの並列トラック — トラック1（メモリ＋行動）が基盤を構築し、トラック2（ソーシャル＋ダイアログ）がユーザーフレンドリーな機能を追加。

**統合：** `NPCAgent.initialize(runtime, statePath)` で4つのコンポーネントを作成。DialogueContextが初期化されていない場合はテンプレート/PromptBuilderにフォールバック。

### リサーチャーエージェント (v0.10.3)
ファクトチェックとリアリズム検証のための新エージェント：
- **`verifyRecipe()`** – クラフトレシピの蓋然性を検証
- **`researchTopic()`** – ワールド構築のための歴史的/文化的リサーチ
- **`validateCharacter()`** – キャラクターの衣装、食事、日常を検証
- **`enrichScene()`** – シーンにリアルな感覚詳細を追加
- **`factCheck()`** – 一般的な事実確認

### i18nシステム
7言語（EN、RU、DE、FR、ES、JA、ZH）の完全ローカライズ：
- すべてのエージェントプロンプトとUI文字列
- エージェント名と説明
- 設定ページ（エージェント、プロバイダー、モデル）
- サーバー起動/停止メッセージ

**構造** — 各言語は `src/i18n/` 配下の個別ファイル：

```
src/i18n/
├── types.ts    # LanguagePackインターフェース + Language型
├── en.ts       # 英語（ベースパック — すべてのキーここで定義）
├── ru.ts       # ロシア語（ENを継承、翻訳をオーバーライド）
├── de.ts       # ドイツ語
├── fr.ts       # フランス語
├── es.ts       # スペイン語
├── ja.ts       # 日本語
├── zh.ts       # 中国語
└── index.ts    # バレルエクスポート、レジストリ、getLanguagePack()
```

**新しい言語を追加**（例：韓国語）：

1. `src/i18n/ko.ts` を作成：
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... 他のキーをオーバーライド
};
```

2. `src/i18n/index.ts` に登録：
```ts
import { KO } from "./ko";
// Language型に追加: "ko"
// PACKSに追加: ko: KO
// LANGUAGES配列に追加
```

3. `src/i18n/types.ts` の `Language` ユニオンに `"ko"` を追加。

### サーバー改善
- **PIDファイル追跡**（`.server.pid`）– オーファンプロセスを防止
- **起動時のクリーンアップ** – 古いプロセスを自動終了
- **グレースフルシャットダウン** – 5秒のSIGTERMタイムアウト後、SIGKILLフォールバック

---

## Pythonからの移行

このプロジェクトは[BRING](https://github.com/Eva-E1/BRING)（Python AIファンタジー世界プラットフォーム）のTypeScript + Mojo移植です。主な変更：

| コンポーネント | Python | TypeScript |
|----------------|--------|------------|
| Webフレームワーク | FastAPI | Hono (Bun) |
| ランタイム | Python asyncio | Bun native async |
| 検証 | Pydantic | Zod |
| ロギング | Python logging | 軽量ロガー（Pinoの代替） |
| グラフ | NetworkX | カスタム隣接マップ |
| ベクトル検索 | FAISS (Python) | Mojo FFI + ローカルコサインフォールバック |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| 認証 | なし | Cookieベースセッション |
| ストリーミング | SSE (starlette) | ReadableStream + SSE |

---

## 免責事項

このプロジェクトは、[MiMo Code](https://github.com/XiaomiMiMo/MiMo) による AI ヘルプ開発アプローチである **Vibe Coding** を使用して開発されました。コードベースは人間と AI の協力により生成されたものであり、以下を意味します：

- コードは**機能的でテスト済み**です — すべての機能は記載通りに動作します
- 一部の領域に**最適化されていないパターン**が含まれる可能性があり、リファクタリングの余地があるかもしれません
- 異なるモジュール間でコードスタイルに**若干の不一致**がある場合があります
- アーキテクチャとロジックは**人間によって検証・確認**されています

改善の余地がある場合は、コントリビューション歓迎します。

---

## ライセンス

Apache 2.0
