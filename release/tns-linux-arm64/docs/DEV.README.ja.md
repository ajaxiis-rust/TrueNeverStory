# TrueNeverStory — 開発者ガイド

コントリビューターおよび開発者向けの技術ドキュメント。

---

## アーキテクチャ概要

TrueNeverStoryはマルチエージェントAIロールプレイエンジンです。プレイヤーが送信したメッセージは、14の特化されたAIエージェントによるパイプラインで処理されます。各エージェントはナラティブの特定の側面（ナレーション、NPC対話、シーン遷移、ストーリー設計など）を担当します。

```
プレイヤー入力
    ↓
RoleplayEngine.processInput()
    ↓
┌─────────────────────────────────┐
│  意図検出                       │
│  - 移動 → SceneAgent            │
│  - NPCに話しかける → NPCAgent   │
│  - @agent言及 → 該当Agent       │
│  - デフォルト → NarratorAgent   │
└─────────────┬───────────────────┘
              ↓
┌─────────────────────────────────┐
│  エージェントパイプライン        │
│  1. コンテキスト構築            │
│  2. プロンプト生成              │
│  3. キュー経由でLLM呼び出し     │
│  4. 応答解析                    │
│  5. ワールド状態更新            │
└─────────────┬───────────────────┘
              ↓
         ナラティブ応答
```

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| ランタイム | Bun (Node.jsではない) |
| Webフレームワーク | Hono |
| データベース | SQLite (`bun:sqlite`、WALモード) |
| バリデーション | Zod |
| ロギング | Pino |
| LLM | OpenAI互換API (HTTP経由) |
| WebSocket | `@hono/node-ws` |
| コンピュートカーネル | C FFI (Zigでコンパイル) + TypeScriptフォールバック |

---

## プロジェクト構成

```
src/
├── index.ts                    # サーバーエントリ (Bun.serve)
├── app.ts                      # Honoアプリ — ミドルウェアチェーン + ルートマウント
│
├── config/
│   ├── env.ts                  # Zod検証済み環境設定
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LLM HTTPクライアント (LRUキャッシュ)
│   ├── llm-queue.ts            # 並列リクエストキュー (pause/resume)
│   ├── sqlite-store.ts         # SQLite (FTS5 + ベクトル + プロンプト + 翻訳)
│   ├── vector-ops.ts           # コサイン、L2、内積
│   ├── mojo-ffi.ts             # FFIバインディング (C/Mojo) + TSフォールバック
│   ├── session-store.ts        # SQLiteセッションストア
│   ├── event-bus.ts            # Pub/Subイベントシステム
│   └── providers/
│       ├── provider-manager.ts # マルチプロバイダールーティング
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       └── ...
│
├── middleware/
│   ├── auth.ts                 # Cookie認証 (PBKDF2、CSRF、レートリミット)
│   ├── rate-limiter.ts         # IP別トークンバケット
│   ├── security-headers.ts     # CSP、X-Frame-Optionsなど
│   └── error-handler.ts        # グローバルエラーハンドラ
│
├── models/                     # データモデル (22ファイル)
│   ├── entity.ts               # コアエンティティ (uid、name、プロファイル L1/L2/L3)
│   ├── chat.ts                 # ChatMessageSchema、SessionSetupSchema (Zod)
│   └── ...
│
├── routes/                     # APIルート (18モジュール)
│   ├── index.ts                # ルートアグリゲーター
│   ├── chat.ts                 # POST /chat/setup、/message、/stream (SSE)、/agent
│   ├── entities.ts             # GET /entity/:uid、/neighbors、/search、/graph/*
│   ├── agents.ts               # CRUDエージェント設定 + 言語別プロンプト
│   ├── i18n.ts                 # 翻訳CRUD (7言語)
│   ├── worlds.ts               # マルチワールドCRUD、章生成
│   └── system.ts               # バックグラウンド処理の一時停止/再開
│
├── services/                   # ビジネスロジック (52+サービス)
│   │
│   │  ── コア ──
│   ├── narrative-service.ts    # DIコンテナ — 全サービスをインスタンス化
│   ├── roleplay-engine.ts      # メインパイプライン (processInput)
│   ├── story-engine.ts         # ストーリーイベント生成
│   ├── director-loop.ts        # バックグラウンドストーリー進行
│   │
│   │  ── エージェント (14) ──
│   ├── narrator-agent.ts       # メインナレーター
│   ├── director-agent.ts       # ストーリービート注入
│   ├── scene-agent.ts          # シーン遷移
│   ├── npc-agent.ts            # NPC対話 + 反応
│   ├── researcher-agent.ts     # 事実チェック、リアリズム検証
│   ├── historian-agent.ts      # 歴史的イベント
│   ├── cartographer-agent.ts   # 地理、距離
│   ├── merchant-agent.ts       # 取引、価格設定
│   ├── quest-giver-agent.ts    # クエスト生成
│   ├── lorekeeper-agent.ts     # ワールド事実、魔法ルール
│   ├── chronicler.ts           # タイムライン管理
│   ├── villain-manager.ts      # 敵対者アクション
│   ├── social-simulator.ts     # NPC社会的ダイナミクス
│   │
│   │  ── ワールドシステム ──
│   ├── story-planner.ts        # LLM駆動のアーク計画
│   ├── world-builder.ts        # エンティティ作成
│   ├── world-clock.ts          # ワールド内時間
│   ├── world-evolver.ts        # NPC/場所/アイテムの自動追加
│   ├── birth.ts                # キャラクター作成ウィザード
│   │
│   │  ── NPCシステム ──
│   ├── npc-runtime.ts          # NPC状態管理
│   ├── npc-generator.ts        # インテリジェントNPC作成
│   ├── npc-economy.ts          # 封建的経済
│   ├── memory-engine.ts        # エピソード記憶
│   ├── behavior-engine.ts      # 自律行動
│   ├── dialogue-manager.ts     # 会話セッション
│   ├── social-graph.ts         # 関係、派閥、同盟
│   │
│   │  ── ゲームメカニクス ──
│   ├── probability-engine.ts   # 決定論的結果
│   ├── probability-expression.ts # 安全な数式評価 (再帰的降下)
│   ├── romance-engine.ts       # ロマンス関係
│   ├── quest-system.ts         # クエストライフサイクル
│   ├── inventory-manager.ts    # アイテム、装備、取引
│   ├── navigator.ts            # グラフパスファインディング (BFS)
│   │
│   │  ── インフラ ──
│   ├── agent-config.ts         # エージェント設定 (SQLite-first + JSON)
│   ├── prompt-builder.ts       # プロンプト構築
│   ├── model-manager.ts        # モデルカタログ
│   ├── settings.ts             # 設定永続化
│   └── websocket-manager.ts    # WebSocket接続プール
│
├── intelligence/               # グラフインテリジェンス
│   ├── graph-analyzer.ts       # グラフ統計
│   ├── graph-validator.ts      # セルフヒーリンググラフ修復
│   └── pipeline.ts             # インテリジェンスパイプライン
│
├── memory/                     # メモリサブシステム
│   ├── world-memory.ts         # メインメモリクラス
│   ├── cognitive-pipeline.ts   # エンティティ抽出 → 矛盾検出 → Pain Signals
│   ├── entity-extractor.ts     # テキストからのエンティティ抽出
│   └── write-buffer.ts         # バッチ書き込みバッファ
│
├── i18n/                       # 国際化 (7言語)
│   ├── types.ts                # LanguagePackインターフェース
│   ├── index.ts                # レジストリ、getLanguagePack()
│   └── [en|ru|de|fr|es|ja|zh].ts
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1)アクセス + NameIndex
│
└── utils/
    ├── sanitize.ts             # プロンプトインジェクション防御
    └── template-resolver.ts    # テンプレート{variable}解決

mojo/kernels/                   # C FFIコンピュートカーネル
├── c/
│   ├── probability_ffi.c       # 成功確率、ロール、バッチ
│   ├── vector_ffi.c            # 4次元ベクトル演算
│   ├── vector_full.c           # 768次元バッチコサイン (BGE-M3)
│   ├── batch_ops.c             # バッチNPC演算
│   └── graph_ops.c             # グラフ走査、RRF、評判
└── build.sh                    # Zigによるクロスコンパイル

public/                         # フロントエンド (静的HTML)
├── index.html                  # メインチャット/ロールプレイUI
├── agents.html                 # エージェント設定 (i18n)
├── graph.html                  # グラフ可視化 (D3.js)
├── settings.html               # グローバル設定 (i18n)
└── worlds.html                 # ワールド管理 + キャラ作成
```

---

## DIコンテナ — NarrativeService

`NarrativeService`は中央DIコンテナ。全30+サービスをインスタンス化し、依存関係を接続します。

**ライフサイクル:**
1. `new NarrativeService({dbPath, worldFrame})` — 全体を接続
2. `start()` — LLMキュー起動、エンティティ同期、director開始
3. `stop()` — director + LLM停止
4. `pause()` / `resume()` — ユーザーがチャットを離れた時
5. `reset(newDbPath, worldFrame)` — 別ワールドへのホットスワップ
6. `shutdown()` — 正常シャットダウン

---

## リクエストライフサイクル

### REST API (POST /api/chat/message)

```
1. Honoミドルウェアチェーン:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. ルートハンドラ (chat.ts):
   - Zodバリデーション
   - sanitizeInput() — プロンプトインジェクション除去
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - 意図検出
   - 適切なエージェントへのルーティング
   - コンテキスト構築
   - プロンプト生成
   - キュー経由LLM呼び出し
   - 応答解析
   - ワールド状態更新

4. 応答: JSON { narrative, location, story_time, ... }
```

---

## エージェントシステム

各エージェントは`generateResponse()`メソッドを持つクラスです。

### エージェント優先度 (高い = 最初に処理)

| 優先度 | エージェント |
|--------|-------------|
| 10 | Narrator |
| 9 | NPC |
| 8 | Director |
| 7 | Scene, Quest Giver |
| 6 | Story Planner, Villain, Historian, Lorekeeper |
| 5 | Chronicler, Merchant |
| 4 | Social Sim, Cartographer |
| 3 | Researcher |

---

## データレイヤー

### EntityStore (JSON)
- UIDによるO(1)アクセス (`Map<string, EntityNode>`)
- NameIndexによるO(1)名前検索

### SQLiteStore
テーブル: `entities` (FTS5), `embeddings` (ベクトル), `memories`, `agent_prompts`, `ui_translations`

ハイブリッド検索: FTS5 + 密ベクトル + Reciprocal Rank Fusion。

### FFIカーネル
Zig経由5つのCカーネル: probability_ffi, vector_ffi, vector_full, batch_ops, graph_ops。

---

## 設定

### 環境変数 (.env)

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `WORLD_LLM_BASE_URL` | – | OpenAI互換エンドポイント |
| `WORLD_LLM_API_KEY` | – | APIキー |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | モデル名 |
| `WORLD_LLM_TIMEOUT` | `300` | リクエストタイムアウト (秒) |
| `WORLD_SERVER_HOST` | `127.0.0.1` | リッスンアドレス |
| `WORLD_SERVER_PORT` | `8000` | リッスンポート |
| `AUTH_PASSWORD` | – | ログインパスワード |

---

## ミドルウェアチェーン

```
1. errorHandler     — グローバルエラーハンドラ
2. requestLogger    — Pinoリクエストログ
3. rateLimiter      — IP別100 req/min
4. securityHeaders  — CSP、X-Frame-Optionsなど
5. CORS             — localhost:8000オリジン
6. authMiddleware   — セッションクッキー検証
```

---

## テスト

```bash
bun test                              # 全テスト
bun test tests/entity-store.test.ts   # エンティティストアテスト
bun test tests/probability-engine.test.ts  # 確率テスト
```

---

## 新しいエージェントの追加

1. `src/services/my-agent.ts` を作成
2. `roleplay-engine.ts` に登録
3. `processInput()` にルーティングロジックを追加
4. `agent-config.ts` またはSQLiteにシステムプロンプトを追加

---

## 主要パターン

- **Dual-write**: 設定はSQLite + JSONに書き込み
- **テンプレート解決**: `{variable}`プレースホルダーを使用
- **安全なeval**: 再帰的降下による数式 (eval不使用)
- **プロンプトインジェクション防御**: LLM前に`sanitizeInput()`
- **アトミックJSON書き込み**: テンポファイル + rename
