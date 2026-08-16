# TrueNeverStory — 開発者ガイド

コントリビューターおよび開発者向けの技術ドキュメント。

---

## アーキテクチャ概要

TrueNeverStoryは、State-Firstアーキテクチャを採用したマルチエージェントAIロールプレイエンジンです。プレイヤーが送信したメッセージは、意図解析、シミュレーション、状態変更、コンテキスト構築、特化エージェントによるレンダリングという決定的なパイプラインで処理されます。

```
プレイヤー入力
    ↓
意図解析 → シミュレーションエンジン → 状態変更 → コンテキスト構築
    ↓
Dramaturg (MCP) → Stylist (MCP) → Censor → 翻訳サービス
    ↓
ナラティブ応答
```

---

## 技術スタック

| レイヤー | 技術 |
|-------|-----------|
| ランタイム | Bun (Node.jsではない) |
| Webフレームワーク | Hono |
| データベース | `bun:sqlite`によるSQLite (WALモード) |
| バリデーション | Zod |
| ロギング | Pino |
| LLM | OpenAI互換API (HTTP経由) |
| WebSocket | `@hono/node-ws` |
| コンピュートカーネル | C FFI (Zigでコンパイル) + TypeScriptフォールバック |

---

## プロジェクト構成

```
src/
├── index.ts                    # サーバーエントリポイント (Bun.serve)
├── app.ts                      # Honoアプリ — ミドルウェアチェーン + ルートマウント
│
├── config/
│   ├── env.ts                  # Zod検証済みの環境設定 (.env + process.env)
│   └── env.test.ts
│
├── lib/
│   ├── llm-client.ts           # LRUキャッシュ付きLLM HTTPクライアント
│   ├── llm-queue.ts            # 一時停止/再開つきの並行リクエストキュー
│   ├── llm-types.ts            # LLM型定義
│   ├── sqlite-store.ts         # SQLite (FTS5 + ベクトル + エージェントプロンプト + 翻訳)
│   ├── vector-ops.ts           # コサイン、L2、内積
│   ├── mojo-ffi.ts             # FFIバインディング (C/Mojo) + TSフォールバック
│   ├── session-store.ts        # SQLiteベースのセッションストレージ
│   ├── event-bus.ts            # Pub/Subイベントシステム
│   ├── history-manager.ts      # 会話履歴の永続化
│   ├── atomic-io.ts            # 安全なJSON読み書き (アトミックrename)
│   └── providers/
│       ├── index.ts            # プロバイダーレジストリ
│       ├── llm-provider.ts     # 抽象プロバイダーインターフェース
│       ├── provider-manager.ts # マルチプロバイダールーティング
│       ├── openai-provider.ts
│       ├── ollama-provider.ts
│       ├── anthropic-provider.ts
│       ├── google-provider.ts
│       └── llamacpp-provider.ts
│
├── middleware/
│   ├── auth.ts                 # Cookieベース認証 (PBKDF2、CSRF、レートリミット)
│   ├── rate-limiter.ts         # IP別トークンバケット
│   ├── security-headers.ts     # CSP、X-Frame-Optionsなど
│   ├── error-handler.ts        # グローバルエラーハンドラー
│   └── logger.ts               # リクエストロギング
│
├── models/                     # データモデル (25ファイル)
│   ├── entity.ts               # コアエンティティ (uid、name、L1/L2/L3レイヤーのプロファイル)
│   ├── chat.ts                 # ChatMessageSchema、SessionSetupSchema (Zod)
│   ├── director.ts             # DirectorTask、TaskPriority
│   ├── intent.ts               # Intent、IntentType
│   ├── simulation.ts           # SimulationResult、SimulationState
│   ├── heartbeat.ts            # HeartbeatPayload
│   ├── memory.ts               # MemoryEntry
│   ├── probability.ts          # ProbabilityProfile、Modifier
│   ├── romance.ts              # RomanceState
│   ├── story.ts                # StoryContext
│   ├── quest.ts                # Quest、Objective、Reward
│   ├── item.ts                 # Item、ItemBoost
│   ├── rank.ts                 # 封建的階層 (10ランク)
│   ├── archetype.ts            # 34のNPCアーキタイプ
│   ├── npc-state.ts            # NPCランタイム状態
│   └── npc-stats.ts            # NPCStats、Vices、FamilyExpenses
│
├── routes/                     # APIルート (18モジュール)
│   ├── index.ts                # ルートアグリゲーター — 全モジュールを /api 配下にマウント
│   ├── chat.ts                 # POST /chat/setup、/message、/stream (SSE)、/agent
│   ├── entities.ts             # GET /entity/:uid、/neighbors、/path、/search、/graph/*
│   ├── agents.ts               # エージェント設定のCRUD + 言語別プロンプト
│   ├── i18n.ts                 # 翻訳CRUD (7言語)
│   ├── settings.ts             # GET/PUT 設定、LLMサーバー管理
│   ├── worlds.ts               # マルチワールドCRUD、切り替え、章生成
│   ├── memory.ts               # メモリエンドポイント
│   ├── branches.ts             # ストーリーブランチ管理
│   ├── probability.ts          # 確率クエリ
│   ├── romance.ts              # ロマンスシステムのエンドポイント
│   ├── quests.ts               # クエストエンドポイント
│   ├── sessions.ts             # セッション履歴
│   ├── maintenance.ts          # グラフメンテナンス
│   ├── launch.ts               # 新規ゲーム / 再開
│   ├── health.ts               # ヘルスチェック
│   ├── models.ts               # モデルカタログ
│   ├── providers.ts            # LLMプロバイダー管理
│   └── system.ts               # バックグラウンド処理の一時停止/再開
│
├── services/                   # ビジネスロジック (60+サービス)
│   │
│   │  ── コアエンジン ──
│   ├── narrative-service.ts    # DIコンテナ — 全サービスをインスタンス化
│   ├── roleplay-engine.ts      # メイン処理パイプライン (processInput)
│   ├── story-engine.ts         # ストーリーイベント生成
│   ├── director-loop.ts        # バックグラウンドストーリー進行 (setInterval)
│   ├── agent-coordinator.ts    # ディレクター向け優先度付きタスクキュー
│   │
│   │  ── エージェント (Big Six) ──
│   ├── agents/
│   │   ├── dramaturg.ts       # ナラティブパターン選択 (MCP)
│   │   ├── validator.ts       # Wikipediaによる事実確認 (MCP)
│   │   ├── stylist.ts         # 散文レンダリング (MCP)
│   │   ├── actor.ts           # NPC対話 + 相互作用
│   │   ├── censor.ts          # AIの決まり文句除去
│   │   └── chronicler.ts      # タイムライン + メモリ更新
│   ├── agent-registry-v2.ts   # エージェント登録 + 検索
│   └── agent-v2.ts            # AgentV2インターフェース + 基底クラス
│
│   │  ── 状態パイプライン ──
│   ├── intent-parser.ts       # ユーザー意図の分類
│   ├── simulation-engine.ts   # 決定論的ワールドシミュレーション
│   ├── state-mutator.ts       # ワールド状態の更新
│   ├── context-builder.ts     # プロンプトコンテキストの構築
│   ├── heartbeat.ts           # バックグラウンドワールドハートビート
│   └── translation-service.ts # 多言語応答翻訳
│   │
│   │  ── ワールドシステム ──
│   ├── story-planner.ts        # LLM駆動のアーク計画
│   ├── story-arc-manager.ts    # アークライフサイクル
│   ├── branch-manager.ts       # ストーリーブランチ
│   ├── world-builder.ts        # ワールドエンティティ作成
│   ├── world-clock.ts          # ワールド内時間
│   ├── world-evolver.ts        # NPC/場所/アイテムの自動追加
│   ├── world-manager.ts        # マルチワールドCRUD
│   ├── world-validator.ts      # ワールドフレーム検証
│   ├── birth.ts                # キャラクター作成ウィザード
│   ├── start-resolver.ts       # ゲーム開始の解決
│   │
│   │  ── NPCシステム ──
│   ├── npc-runtime.ts          # NPC状態管理
│   ├── npc-generator.ts        # インテリジェントNPC作成
│   ├── npc-economy.ts          # 封建的経済コア
│   ├── npc-economy-runtime.ts  # ターンベースシミュレーション
│   ├── slave-economy.ts        # 奴隷交易メカニクス
│   ├── memory-engine.ts        # NPCエピソード記憶
│   ├── memory-manager.ts       # 記憶検索 + コンテキスト
│   ├── behavior-engine.ts      # 自律的NPCアクション
│   ├── dialogue-manager.ts     # NPC会話セッション
│   ├── dialogue-context.ts     # 強化されたNPCプロンプト
│   ├── social-graph.ts         # 関係、派閥、同盟
│   │
│   │  ── ゲームメカニクス ──
│   ├── probability-engine.ts   # 決定論的結果
│   ├── probability-profiles.ts # プロファイル定義
│   ├── probability-expression.ts # 安全な数式評価器 (再帰的降下)
│   ├── probability-resolver.ts # コンテキスト解決
│   ├── romance-engine.ts       # ロマンティックな関係
│   ├── romance-profiles.ts     # ロマンスアクション定義
│   ├── quest-system.ts         # クエストライフサイクル、目標、チェーン
│   ├── quest-manager.ts        # クエスト永続化
│   ├── inventory-manager.ts    # アイテム、装備、交易
│   ├── item-evaluation.ts      # アイテムの独自性 + ブースト評価
│   ├── navigator.ts            # グラフパスファインディング (BFS)
│   │
│   │  ── インフラ ──
│   ├── agent-config.ts         # エージェント設定 (SQLite優先 + JSONフォールバック)
│   ├── prompt-builder.ts       # プロンプト構築
│   ├── model-manager.ts        # モデルカタログ + ダウンロード
│   ├── settings.ts             # 設定永続化
│   └── websocket-manager.ts    # WebSocket接続プール
│
├── intelligence/               # グラフインテリジェンス
│   ├── graph-analyzer.ts       # グラフ統計
│   ├── graph-validator.ts      # セルフヒーリンググラフ修復
│   ├── duplicate-detector.ts   # エンティティ重複排除
│   ├── recommender.ts          # 関係性の提案
│   ├── relationship-repairer.ts
│   ├── rule-checker.ts         # ワールドルール検証
│   ├── scene-generator.ts      # シーン記述
│   ├── subgraph-expander.ts    # コンテキスト拡張
│   └── pipeline.ts             # インテリジェンスパイプラインのオーケストレーション
│
├── memory/                     # メモリサブシステム
│   ├── world-memory.ts         # メインメモリクラス
│   ├── cognitive-pipeline.ts   # エンティティ抽出 → 矛盾 → 痛みシグナル
│   ├── entity-extractor.ts     # テキストからエンティティを抽出
│   ├── contradiction-detector.ts
│   ├── pain-signals.ts         # 重要な瞬間の検出
│   ├── scoring.ts              # 記憶の重要度スコアリング
│   ├── clustering.ts           # 記憶クラスタリング
│   ├── partition.ts            # 記憶パーティショニング
│   ├── faiss-index.ts          # ベクトルインデックス (FAISS互換)
│   ├── embedding-queue.ts      # 非同期埋め込み生成
│   ├── optimizer.ts            # 記憶最適化
│   └── write-buffer.ts         # バッチ書き込みバッファ
│
├── mcp/                        # MCPサーバー — 聖書/グーテンベルクパーサー、Wikipediaツール
│
├── i18n/                       # 国際化 (7言語)
│   ├── types.ts                # LanguagePackインターフェース
│   ├── index.ts                # レジストリ、getLanguagePack()、setLanguage()
│   ├── en.ts                   # 英語 (ベース)
│   ├── ru.ts                   # ロシア語
│   ├── de.ts                   # ドイツ語
│   ├── fr.ts                   # フランス語
│   ├── es.ts                   # スペイン語
│   ├── ja.ts                   # 日本語
│   └── zh.ts                   # 中国語
│
├── store/
│   └── entity-store.ts         # UnifiedEntityStore — O(1)アクセス + NameIndex
│
└── utils/
    ├── logger.ts               # Pinoロガー
    ├── hash.ts                 # SHA-256ユーティリティ
    ├── time.ts                 # 時刻フォーマット
    ├── sanitize.ts             # プロンプトインジェクション防御
    └── template-resolver.ts    # エージェントテンプレート{variable}解決

mojo/
├── kernels/                    # C FFIコンピュートカーネル
│   ├── c/
│   │   ├── probability_ffi.c   # 成功確率、ロール、バッチ確率
│   │   ├── vector_ffi.c        # 4次元ベクトル演算 (コサイン、L2、内積)
│   │   ├── vector_full.c       # 768次元バッチコサイン (BGE-M3)
│   │   ├── batch_ops.c         # バッチNPC演算 (年齢減衰、悪癖、税)
│   │   └── graph_ops.c         # グラフ走査、RRF、評判
│   ├── build.sh                # Zigによるクロスコンパイル
│   └── dist/                   # コンパイル済み .so/.dylib/.dll
└── src/                        # 81のMojoソースファイル (オプションの性能バックエンド)

public/                         # フロントエンド (静的HTML)
├── index.html                  # メインチャット/ロールプレイUI
├── agents.html                 # エージェント設定 (i18n)
├── graph.html                  # ナレッジグラフビューア (D3.js)
├── models.html                 # モデル管理
├── providers.html              # LLMプロバイダー設定
├── settings.html               # グローバル設定 (i18n)
├── worlds.html                 # ワールド管理 + 誕生ウィザード
└── static/
    ├── fonts/                  # カスタムフォント
    └── vendor/                 # d3.v7.min.js、purify.min.js

conf/                           # ランタイム設定 (gitignored)
├── settings.json               # アプリ設定 (LLM、認証、サーバー)
├── agents.json                 # グローバルなエージェントモデル割り当て
├── providers.json              # プロバイダーレジストリ
└── llm-config.json             # LLMプロバイダー設定

worlds/                         # ワールドデータ (gitignored)
└── default/
    ├── tns.db                  # SQLite (エンティティ、埋め込み、記憶、プロンプト、翻訳)
    ├── entities.json           # エンティティグラフ (JSON)
    ├── world_frame.json        # ワールド定義
    ├── session_history/        # セッション単位の会話ログ
    ├── chapters/               # 生成された文学章
    ├── npc_profiles/           # NPC状態ファイル
    ├── timeline.jsonl          # イベントタイムライン
    ├── story_planner.json      # ストーリープランナー状態
    ├── villains.json           # 悪役状態
    └── world_clock.json        # ワールド内時間

worlds/_sessions/
    └── sessions.db             # SQLiteセッションストレージ
```

---

## 依存性注入 — NarrativeService

`NarrativeService`（`src/services/narrative-service.ts`）は中央のDIコンテナです。30以上のサービスすべてをインスタンス化し、それらの依存関係を接続します。

```
NarrativeService
├── entityStore (UnifiedEntityStore) — O(1)エンティティアクセス
├── graphStore (GraphStore) — 隣接マップ + パスファインディング
├── eventBus (EventBus) — Pub/Subイベント
├── historyMgr (HistoryManager) — 会話永続化
├── llm (LLMClient) — LLM API用HTTPクライアント
├── llmQueue (LLMQueue) — 並行リクエストキュー (最大3)
├── sqliteStore (SQLiteStore) — FTS5 + ベクトル + agent_prompts + 翻訳
├── chronicler (Chronicler) — timeline.jsonlライター
├── validator (WorldValidator) — ワールドフレーム検証
├── questMgr (QuestManager) — クエスト永続化
├── clock (WorldClock) — ワールド内時間
├── probEngine (ProbabilityEngine) — 決定論的結果
├── probResolver (ProbabilityContextResolver) — 確率のコンテキスト
├── storyPlanner (StoryPlanner) — LLM駆動のアーク計画
├── villainManager (VillainManager) — 敵対者アクション
├── socialSim (SocialSimulator) — NPC社会的動態
├── npcRuntime (NPCRuntime) — NPC状態管理
├── storyEngine (StoryEngine) — ストーリーイベント生成
├── director (DirectorLoop) — バックグラウンドストーリー進行
├── worldBuilder (WorldBuilder) — エンティティ作成
├── agentCoordinator (AgentCoordinator) — 優先度付きタスクキュー
├── storyArcManager (StoryArcManager) — アークライフサイクル
├── userAgent (UserAgent) — パーティ + 戦闘
├── npcGenerator (NPCGenerator) — インテリジェントNPC作成
├── worldEvolver (WorldEvolver) — 自動ワールド拡張
├── graphValidator (GraphValidator) — セルフヒーリンググラフ
├── intentParser (IntentParser) — ユーザー意図の分類
├── simEngine (SimulationEngine) — 決定論的ワールドシミュレーション
├── stateMutator (StateMutator) — ワールド状態の更新
├── contextBuilder (ContextBuilder) — プロンプトコンテキスト構築
├── heartbeatService (HeartbeatService) — バックグラウンドワールドハートビート
├── tnsServer (TNSServer) — MCPサーバー (聖書/グーテンベルク/Wikipedia)
├── translationService (TranslationService) — 多言語翻訳
└── agentRegistry (AgentRegistryV2) — エージェント登録 + 検索
```

**ライフサイクル:**
1. `new NarrativeService({dbPath, worldFrame})` — コンストラクターが全体を接続
2. `start()` — LLMキューを起動し、エンティティをSQLiteへ同期し、（エンティティが存在するが接続がない場合に）ヒューリスティックな関係を自動構築し、ディレクターループを開始
3. `stop()` — ディレクター + LLMキューを停止
4. `pause()` / `resume()` — ユーザーがチャットビューを離れたとき用
5. `reset(newDbPath, worldFrame)` — 別ワールドへのホットスワップ
6. `shutdown()` — クリーンシャットダウン

---

## リクエストライフサイクル

### REST API (POST /api/chat/message)

```
1. Honoミドルウェアチェーン:
   errorHandler → requestLogger → rateLimiter → securityHeaders → CORS → authMiddleware

2. ルートハンドラー (chat.ts):
   - Zodバリデーション (ChatMessageSchema)
   - sanitizeInput() — プロンプトインジェクションパターンを除去
   - engine.processInput(sanitized.clean)

3. RoleplayEngine.processInput():
   - 意図解析 → ユーザー意図の分類
   - シミュレーションエンジン → 決定論的ワールドシミュレーション
   - 状態変更 → ワールド状態の更新
   - コンテキスト構築 → プロンプトコンテキストの構築
   - Dramaturg (MCP) → ナラティブパターン選択
   - Stylist (MCP) → 散文のレンダリング
   - Censor → AIの決まり文句を除去
   - 翻訳サービス → 多言語応答
   - ナラティブ文字列を返す

4. 応答: JSON { narrative, location, story_time, ... }
```

### SSEストリーミング (POST /api/chat/stream)

RESTと同じだが、`engine.processInputStream()`をキープアライブping付きの`ReadableStream`でラップします。

### WebSocket (ws://host/ws/...)

```
1. アップグレード: セッションCookieを確認 (bring_session)
2. メッセージ時: JSONパース → エンジンへルーティング
3. 応答時: JSON stringify → ws.send()
```

---

## エージェントシステム

各エージェントは`AgentV2`インターフェースを実装し、意図、シミュレーション結果、ゲームコンテキストを受け取る`process()`メソッドを持ちます。

### The Big Six

| エージェント | 役割 | MCPツール |
|-------|------|-----------|
| Dramaturg | ナラティブパターン選択 | search_verses, get_pattern, get_archetype |
| Validator | Wikipediaによる事実確認 | verify_fact, get_context |
| Stylist | 散文レンダリング | get_style_pattern, apply_style |
| Actor | NPC対話 + 相互作用 | — |
| Censor | AIの決まり文句除去 | — |
| Chronicler | タイムライン + メモリ更新 | — |

### AgentV2インターフェース

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];
  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
```

**注:** レガシーの14エージェントシステムは非推奨ですが、後方互換性のため依然として機能します。古いエージェントID（`@narrator`、`@director`など）は内部的に新しいエージェントへルーティングされます。

### プロンプト解決

エージェントプロンプトは以下の順序で解決されます：
1. SQLiteの`agent_prompts`テーブル（ワールド + 言語ごと）
2. JSONフォールバック（`worlds/{world}/agents/{agentId}.json`）
3. ハードコードされたデフォルト（`agent-config.ts`の`DEFAULT_PROMPTS`）

テンプレートは`resolveTemplate()`によって解決される`{variable}`プレースホルダーを使用します。

---

## MCP統合 (v0.32.5)

TNSServer（`src/mcp/tns-server.ts`）は、外部データアクセス用のMCPツールを提供します。

| ツール | ソース | 説明 |
|------|--------|-------------|
| search_verses | 聖書 | テキスト、書、参照で聖書の節を検索 |
| get_pattern | 聖書 | アーキタイプ、ムード、機能でナラティブパターンを取得 |
| get_archetype | 聖書 | 名前でアーキタイプ詳細を取得 |
| get_style_pattern | グーテンベルク | ムード、タグ、説明で文体を検索 |
| apply_style | グーテンベルク | テキストに文体を適用（脱語彙化して提案を返す） |
| verify_fact | Wikipedia | 事実的主張を検証 |
| get_context | Wikipedia | トピックのWikipediaコンテキストを取得 |
| get_economic_phase | 経済DB | 現在の経済サイクルフェーズ |
| calculate_price | 経済DB | フェーズ修飾子付きの価格 |
| generate_dilemma | 経済DB | 派閥の税ジレンマ |
| check_jubilee | 経済DB | ジュビリーサイクルチェック |

### MCPコンソール (v0.32.5)

全プロジェクトデータベース用のWebベースのデータベース管理コンソール。

**起動:** `./startgame.sh --mcp`（ゲームなしでDB管理サーバーのみをポート8000で起動）

**Web UI:** `http://localhost:8000` — 聖書、グーテンベルク、Wikipedia、LiteraryCompiler、経済、システムのタブ

**API:** すべてのエンドポイントは`/mcp/*`配下 — 完全な一覧は`src/routes/mcp.ts`を参照。SSE進捗は`/mcp/stream/:jobId`。

**選択的グーテンベルクダウンロード:** ジャンル/著者フィルタリングによるカタログベースのダウンロード。SSE進捗追跡付きのTypeScriptベースのダウンロードスクリプト。

---

## データレイヤー

### EntityStore (JSON)

- `entities.json` — 全エンティティの隣接マップ
- `Map<string, EntityNode>`によるUIDでのO(1)アクセス
- `NameIndex`によるO(1)名前検索（大文字小文字を区別しない）
- `onMutation()`コールバックによる変更追跡 → SQLiteへ同期

### SQLiteStore

テーブル:
- `entities` — FTS5全文検索
- `embeddings` — ベクトルブロブ (BGE-M3、1024次元)
- `memories` — FTS5付きロールプレイ記憶
- `agent_prompts` — ワールド + 言語ごとのプロンプトストレージ
- `ui_translations` — 言語 + ページごとのUI文字列

ハイブリッド検索: FTS5キーワード + 密ベクトル + Reciprocal Rank Fusion。

### FFIカーネル

Zigでコンパイルされた5つのCカーネル（クロスプラットフォーム配布用）:

| カーネル | 関数 | フォールバック |
|--------|-----------|----------|
| `probability_ffi` | success_chance, roll, batch | Pure TS |
| `vector_ffi` | cosine_4d, l2_4d, dot_4d | Pure TS |
| `vector_full` | batch_cosine_768d | Pure TS |
| `batch_ops` | age_decay, vice_decay, tax, loyalty | Pure TS |
| `graph_ops` | rrf_fusion, reputation | Pure TS |

検出: `mojo-ffi.ts`で`dlopen()`を実行し、失敗時はフォールバック。

---

## 設定

### 環境変数 (.env)

| 変数 | デフォルト | 説明 |
|----------|---------|-------------|
| `WORLD_LLM_BASE_URL` | – | OpenAI互換エンドポイント |
| `WORLD_LLM_API_KEY` | – | APIキー |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | モデル名 |
| `WORLD_LLM_TIMEOUT` | `300` | リクエストタイムアウト (秒) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | 応答あたりの最大トークン |
| `WORLD_LLM_TEMPERATURE` | `0.7` | サンプリング温度 |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | 最大並行LLMリクエスト数 |
| `WORLD_DB_PATH` | `./world_db` | データベースディレクトリ (レガシー) |
| `WORLDS_ROOT` | `./worlds` | ワールドのルートディレクトリ |
| `WORLD_SERVER_HOST` | `127.0.0.1` | リッスンアドレス |
| `WORLD_SERVER_PORT` | `8000` | リッスンポート |
| `AUTH_PASSWORD` | – | ログインパスワード (空 = 認証なし) |
| `AUTH_PASSWORD_HASH` | – | PBKDF2ハッシュ (salt:hash) |

### 設定 (conf/settings.json)

`loadSettings()`経由でロードされます。優先順位: settings.json > .env > デフォルト。

含まれるもの: LLMパラメータ、埋め込み設定、サーバー設定、認証パスワード、メモリ設定、確率の運要素、ワールド選択、言語。

---

## ミドルウェアチェーン

順序が重要です — `app.ts`で適用されます:

```
1. errorHandler     — 包括的なエラーハンドラー
2. requestLogger    — Pinoリクエストロギング
3. rateLimiter      — IPあたり100 req/min
4. securityHeaders  — CSP、X-Frame-Optionsなど
5. CORS             — localhost:8000オリジン
6. authMiddleware   — セッションCookie検証 (/api/*、/ws/*を保護)
```

---

## テスト

```bash
bun test                              # 全テストを実行
bun test tests/entity-store.test.ts   # エンティティストアテスト
bun test tests/probability-engine.test.ts  # 確率テスト
bun test tests/integration/server.test.ts  # 統合テスト (サーバー起動が必要)
```

テストファイルはソースファイルの隣に`*.test.ts`規約で配置されます。

---

## 新しいエージェントの追加

1. `src/services/my-agent.ts`を作成:
```typescript
export class MyAgent {
  constructor(deps: { llmQueue: LLMQueue; entityStore: UnifiedEntityStore }) {}
  
  async generateResponse(ctx: AgentContext): Promise<string> {
    const prompt = buildPrompt(ctx);
    return await this.deps.llmQueue.enqueue({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
    });
  }
}
```

2. `roleplay-engine.ts`のコンストラクターに登録
3. `processInput()`にルーティングロジックを追加
4. `agent-config.ts`またはSQLiteの`agent_prompts`テーブルにシステムプロンプトを追加

---

## 新しいルートの追加

1. `src/routes/my-route.ts`を作成:
```typescript
import { Hono } from "hono";
const myRoute = new Hono();
myRoute.get("/my-endpoint", async (c) => c.json({ ok: true }));
export { myRoute as myRouteRouter };
```

2. `src/routes/index.ts`にマウント:
```typescript
import { myRouteRouter } from "./my-route";
routes.route("/", myRouteRouter);
```

---

## ワールド管理

`worlds/`配下に複数の分離されたワールド:

```
worlds/
├── default/           # アクティブワールド
│   ├── tns.db         # SQLiteデータベース
│   ├── entities.json  # エンティティグラフ
│   └── ...
├── levant/            # 別のワールド
└── _sessions/         # グローバルセッションストア
```

`POST /api/worlds/:name/switch`でワールドを切り替え。DIコンテナをホットスワップします。

ワールド統計は`GET /api/worlds/:name/detail`で取得可能 — 種別ごとのエンティティ数、キャラクター/場所/派閥/アイテムのリスト、セッション/イベント/章/悪役の数、ワールドルールを返します。

---

## 主要パターン

- **Dual-write（二重書き込み）**: 設定はSQLiteとJSONの両方に書き込まれる（後方互換性）
- **テンプレート解決**: エージェントプロンプトは実行時に解決される`{variable}`プレースホルダーを使用
- **安全な式評価**: 確率式は再帰的降下パーサーを使用（eval不使用）
- **プロンプトインジェクション防御**: `sanitizeInput()`がLLM前に一般的なインジェクションパターンを除去
- **アトミックJSON書き込み**: `atomicWriteJson()`はクラッシュ安全のためテンポラリファイル + renameを使用
- **イベント駆動**: `EventBus`がサービスを疎結合化（エンティティ作成、メモリイベントなど）
- **言語指示注入**: 言語ディレクティブはワールド作成時に`seedWorldAgents()`によってエージェントプロンプトに焼き込まれ、動的なNPC対話のために実行時に`getLanguageInstruction()`によっても追加される
