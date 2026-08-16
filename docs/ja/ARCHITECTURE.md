# TrueNeverStory — アーキテクチャ文書

> TrueNeverStory ナラティブRPGエンジンのドメイン駆動設計（DDD）分析。
> v0.32.5 向けに更新 — RoleplayEngine を SessionState、CommandHandler、PipelineRunner、Prose 戦略にリファクタリング。

---

## [A1] アーキテクチャパターン

**イベント駆動拡張 + State-First パイプラインを備えたレイヤード・オニオンアーキテクチャ**

TrueNeverStory は、その中核に**レイヤード・オニオン（ヘキサゴナル）アーキテクチャ**を採用し、非同期ナラティブ処理のための**イベント駆動オーケストレーションレイヤー**でラップしている。v0.32.5 以降、エンジンは**State-First パイプライン**を使用し、散文生成の前に決定的なシミュレーションが実行される。

このパターンが適している理由:

1. **ドメインモデルが分離されている** — `src/models/` にはインフラ依存を持たない純粋なデータ構造が含まれる。`EntityNode`、`Quest`、`StoryContext`、`NPCProfile`、`ProbabilityModifier`、`Intent`、`SimulationResult` はすべてフレームワーク非依存である。
2. **サービスがドメインロジックをオーケストレーションする** — `src/services/` にはアプリケーションサービス（`RoleplayEngine`、`StoryEngine`）とドメインサービス（`ProbabilityEngine`、`SocialSimulator`、`RomanceEngine`、`SimulationEngine`）が含まれる。
3. **インフラはエッジに押し出される** — `src/lib/` は永続化（`SQLiteStore`、`AtomicIO`）、外部連携（`LLMClient`、`ProviderManager`）、トランスポート（`WebSocketManager`）を保持する。
4. **ルートは薄いアダプター** — `src/routes/` は最小限のロジックで HTTP をサービス呼び出しにマッピングする。
5. **MCP 連携** — `src/mcp/` は Model Context Protocol 経由で外部知識ソース（聖書、Gutenberg、Wikipedia）を提供する。

**イベントバス**（`src/lib/event-bus.ts` の `EventBus`）は、境界づけられたコンテキスト間に非同期の疎結合レイヤーを追加し、Director ループが NPC、Social、Quest サブシステムに直接結合することなくナラティブイベントをオーケストレーションできるようにする。

### State-First パイプライン (v0.32.5)

パイプラインは現在、`PipelineRunner` が管理する合成可能なステージとして構造化されている:

```
プレイヤー入力（任意の言語）
  │
  ▼
PipelineRunner.buildContext() — エンジン状態のスナップショット取得
  │
  ▼
PipelineRunner.translateAndClassify() — IntentParser + TranslationService
  │ 翻訳済みテキスト + intent
  ▼
CommandHandler.handle() — コマンドの早期終了
  │
  ▼
PipelineRunner.runSimulation() — SimulationEngine（決定的）
  │ outcome, probability, stateChanges
  ▼
StateMutator.applyChanges() — EntityStore に適用
  │
  ▼
PipelineRunner.buildGameContext() — ContextBuilder
  │
  ▼
散文（Prose）ジェネレーター:
  ├─ LiteraryV2Generator（フィーチャーフラグでゲート）→ Stylist
  └─ LegacyIntentGenerator → MovementHandler | DialogueHandler | ObservationHandler | ActionHandler
  │
  ▼
TranslationService.translate() — 対象言語が英語以外の場合
  │
  ▼
ユーザーへの応答

合計: LLM 呼び出し 2〜3 回
```

### Gutenberg 処理パイプライン (v0.32.5)

2 フェーズのパイプラインが生の Gutenberg .txt ファイルをエージェントが消費可能なデータベースに変換する:

**フェーズA（V1 — ルールベース、LLM なし）:**
```
classics.db → GutenbergParser → gutenberg-normalized.db (styles + FTS)
         └→ 4パスコンパイラ → classics-compiled.db（クエストテンプレート）
              DramaturgicPass → StylisticPass → EmotionalPass → MetadataPass → Linter
```

**フェーズB（V2 — LLM 強化）:**
```
classics-compiled.db → AnalyzePass → narrative_extractor → literary.db (scene_templates + style_patterns)
```

**classics-compiled.db の新しいテーブル:**
- `narrative_arcs` — 書籍ごとのプロットアークの原型と緊張点
- `thematic_motifs` — 進化追跡を伴う象徴的モチーフ
- `quality_calibration` — LLM 応答の品質スコア

**PlayerProfileStore** — 独立したクロスエージェントのプレイヤースタイルプロファイル（14 の指標）。`data/player-profiles.db` に保存される。

### デュアルモデルアーキテクチャ (v0.32.5)

エンジンは各エージェントに対して 2 つの LLM モデルをサポートする:

| モデル | 用途 | 例 |
|-------|---------|----------|
| **メインモデル** | ナラティブ生成、NPC 会話、ストーリー計画 | llama-3.1-8b, qwen2.5-14b |
| **翻訳モデル** | 翻訳、意図分類（高速・小型） | phi-3-mini, gemma-2-2b, qwen2.5-3b |

**設定**（`conf/agents.json` 内のエージェントごと）:
```json
{
  "agentId": "translation",
  "providerId": "ollama",
  "modelId": "qwen2.5:14b",
  "translationProviderId": "ollama",
  "translationModelId": "phi3:mini"
}
```

**LLMClient** は `useTranslationModel` フラグでモデルを解決する:
- `LLMQueue.getAgentClient("translation", { useTranslationModel: true })` → `translationModelId` を使用
- `LLMQueue.getAgentClient("stylist")` → `modelId` を使用

```
┌─────────────────────────────────────────────────┐
│                   ルート (HTTP/WS)               │  ← アダプターレイヤー
├─────────────────────────────────────────────────┤
│              アプリケーションサービス             │  ← ユースケース
│  RoleplayEngine │ NarrativeService │ StoryEngine │
├─────────────────────────────────────────────────┤
│               ドメインサービス                    │  ← ドメインロジック
│  ProbabilityEngine │ SocialSimulator │ NPCRuntime │
├─────────────────────────────────────────────────┤
│                ドメインモデル                    │  ← コアエンティティ
│  EntityNode │ Quest │ NPCProfile │ StoryArc      │
├─────────────────────────────────────────────────┤
│               インフラストラクチャ                │  ← 永続化/外部
│  SQLiteStore │ LLMClient │ EventBus │ AtomicIO   │
└─────────────────────────────────────────────────┘
```

---

## [A2] 境界づけられたコンテキスト

### BC1: ワールド管理

**目的:** マルチワールドのライフサイクル — 作成、設定、切り替え、およびワールド状態の永続化。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `World`, `WorldFrame` |
| **主要エンティティ** | `EntityNode`（Character, Faction, Location, Item, Event, Race, WorldRule） |
| **値オブジェクト** | `WorldCreateParams`, `WorldSummary`, `LayeredProfile`（L1/L2/L3 レイヤー） |
| **ドメインイベント** | `WORLD_CREATED`, `WORLD_FRAME_LOADED`, `WORLD_EVOLVED` |
| **永続化** | `worlds/{name}/world_frame.json`, `worlds/{name}/entities.json` |

**主要ファイル:**
- `src/services/world-manager.ts` — CRUD 操作、ワールド切り替え
- `src/services/world-builder.ts` — LLM 駆動のレイヤード・ワールド構築
- `src/services/world-validator.ts` — 整合性チェック
- `src/services/world-evolver.ts` — 時間経過に伴う NPC/ロケーション/アイテムの追加
- `src/routes/worlds.ts` — HTTP アダプター

**ドメインルール:**
- ワールド名はスラグ化され、一意である
- 各ワールドは `worlds/` の下に独立したデータディレクトリを持つ
- `WorldFrame` は正規の構造（暦、魔法体系、種族、派閥、ロケーション、アイテム、歴史的イベント、ワールドルール）を定義する
- エンティティプロファイルは 3 レイヤー制: L1（同一性）、L2（動的状態）、L3（隠蔽/秘密）

---

### BC2: エンティティ & グラフ

**目的:** ワールドエンティティとその関係のメモリ内グラフ表現。O(1) ルックアップとグラフ探索を提供する。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `GraphStore`（ワールドグラフの集約ルート） |
| **主要エンティティ** | `EntityNode`, `GraphEdge` |
| **値オブジェクト** | `Relationship`, `LayeredProfile`, `GraphSummary` |
| **ドメインイベント** | `ENTITY_ADDED`, `ENTITY_UPDATED`, `ENTITY_REMOVED`, `RELATIONSHIP_ADDED`, `RELATIONSHIP_BROKEN`, `GRAPH_CHANGED` |
| **永続化** | `worlds/{name}/entities.json`（`UnifiedEntityStore` 経由）, `worlds/{name}/branches.json` |

**主要ファイル:**
- `src/store/entity-store.ts` — `UnifiedEntityStore`。O(1) の名前→UID 解決のための `NameIndex` を備える
- `src/services/graph-store.ts` — 順方向/逆方向エッジを持つ隣接マップグラフ
- `src/services/branch-manager.ts` — ストーリーグラフの Git ライクな分岐
- `src/intelligence/` — グラフ解析、検証、関係修復

**ドメインルール:**
- エンティティは一意の `uid` を持ち、名前、トークン、または型プレフィックスで解決される
- `NameIndex` はファジー解決をサポートする（大文字小文字を区別しない、トークンベース、型除去）
- `BranchManager` はブランチごとの追加/削除を伴う親→子の分岐をサポートする
- グラフエッジは双方向（順方向 + 逆方向マップ）

---

### BC3: ナラティブ & ストーリー

**目的:** 中核となるナラティブ生成 — ストーリーテラー、シーン遷移、ストーリービート、および劇的オーケストレーション。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `StoryContext`, `StoryArc`, `DirectorTask`, `ChapterData`, `BeatData` |
| **主要エンティティ** | `StoryBeat`, `ArcPhase`, `ArcTimelineEvent` |
| **値オブジェクト** | `NarratorOutput`, `NPCDialogue`, `SceneTransition` |
| **ドメインイベント** | `STORY_EVENT`, `STORY_BEAT`, `VILLAIN_PROGRESS` |
| **永続化** | `worlds/{name}/director_state.json`, `worlds/{name}/story_arcs.json`, `worlds/{name}/planner_state.json` |

**主要ファイル:**
- `src/services/narrative-service.ts` — 全ナラティブサービスの **Composition Root** / DI コンテナ
- `src/services/roleplay-engine.ts` — メインのロールプレイ処理、エージェントディスパッチ
- `src/services/agents/stylist.ts` — LLM 駆動の散文生成（唯一の散文ジェネレーター）
- `src/services/agents/dramaturg.ts` — 聖書の原型からのナラティブパターン選択
- `src/services/agents/validator.ts` — Wikipedia MCP による事実検証
- `src/services/director-loop.ts` — バックグラウンドオーケストレーター（時計→社交→悪役→偶然→ビート）
- `src/services/story-engine.ts` — ストーリービートからのイベント生成 + 効果適用
- `src/services/story-planner.ts` — LLM 駆動の章/ビート計画
- `src/services/story-arc-manager.ts` — フェーズ付きストーリーアークの CRUD
- `src/models/story.ts` — `StoryContext`, `NarratorOutput`, `NPCDialogue`, `SceneTransition`
- `src/models/director.ts` — `DirectorTask`, `StoryArc`, `StoryBeat`, `TaskPriority`

**ドメインルール:**
- `DirectorLoop` は設定可能なティック間隔（デフォルト 30 分）で実行される
- 主要なストーリービートにはクールダウンがある（デフォルト 6 時間）
- `StoryPlanner` は 2 フェーズ計画を使用する: 章のアウトライン → ビート生成
- `TaskPriority` 列挙型が LLM キューの順序を制御する（CRITICAL > HIGH > NORMAL > LOW）
- エージェントプロンプトは SQLite を最初に解決し、次に JSON フォールバック、最後にハードコードされたデフォルト

---

### BC4: NPC & ダイアログ

**目的:** ノンプレイヤーキャラクターの状態管理、エピソード記憶、ダイアログセッション、および NPC 生成。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `NPCProfile`（NPC ごとの集約ルート） |
| **主要エンティティ** | `EpisodicMemory`, `DialogueSession`, `DialogueMessage` |
| **値オブジェクト** | `NPCSkills`, `NPCDialogue`, `DialogueChoice`, `GreetingTemplate` |
| **ドメインイベント** | `ENTITY_ADDED`（生成された NPC）, `MEMORY_ADDED`, `MEMORY_CONSOLIDATED` |
| **永続化** | `worlds/{name}/npc_profiles.json`, `worlds/{name}/npc_profiles/{name}.json` |

**主要ファイル:**
- `src/services/npc-runtime.ts` — `NPCRuntime`: 短期/長期記憶を持つ状態ストア
- `src/services/npc-generator.ts` — LLM 駆動の NPC 作成
- `src/services/agents/actor.ts` — NPC のダイアログと相互作用の生成
- `src/services/npc-economy.ts` — NPC の富、税、国庫、食料生産
- `src/services/dialogue-manager.ts` — 会話セッション、トピック、選択肢
- `src/services/dialogue-context.ts` — 文脈依存のダイアログ状態
- `src/models/npc-state.ts` — `NPCProfile`, `EpisodicMemory`, `NPCSkills`

**ドメインルール:**
- NPC プロファイルは短期記憶（上限 20）と長期エピソード記憶を持つ
- 短期記憶が `_importanceThreshold`（0.4）を超えると記憶の統合が発生する
- 起動時に NPC はエンティティストアから同期され、欠けているプロファイルは自動生成される
- ダイアログセッションは状態機械を追跡する: `greeting → active → farewell → idle`
- `TopicCategory` 列挙型が有効な会話トピックを制約する

---

### BC5: ソーシャル & 関係

**目的:** キャラクター間の関係、派閥の動態、同盟、封建的階級、恋愛関係。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `SocialGraph`（全ソーシャル状態の集約ルート） |
| **主要エンティティ** | `Relationship`, `Faction`, `Alliance`, `FeudalRelationship` |
| **値オブジェクト** | `FactionSummary`, `FeudalSummary`, `RomanceStatus`, `RomanceProgression` |
| **ドメインイベント** | `RELATIONSHIP_ADDED`, `RELATIONSHIP_REPAIRED`, `RELATIONSHIP_BROKEN` |
| **永続化** | `worlds/{name}/social/` ディレクトリ（サブシステムごとの JSON ファイル） |

**主要ファイル:**
- `src/services/social-graph.ts` — `SocialGraph`: 関係、派閥、同盟、封建
- `src/services/social-simulator.ts` — ペア選択、相互作用生成
- `src/services/romance-engine.ts` — 恋愛関係の進行
- `src/services/romance-profiles.ts` — 恋愛イベントの確率プロファイル
- `src/models/romance.ts` — `RelationshipMemory`, `RomanceStatus`, `RomanceProgression`

**ドメインルール:**
- `SocialSimulator` は場所の近接性と派閥の整合性に基づいてペアを選択する
- 相互作用タイプはコンテキストで重み付けされる: 同一場所 vs 同一派閥 vs 異なる派閥
- 恋愛は決定的な結果解決に `ProbabilityEngine` を使用する
- 封建関係は忠誠、税の貢納、軍事的義務を追跡する
- 同盟は裏切られる可能性があり、裏切りには結果が伴う

---

### BC6: クエスト

**目的:** クエストのライフサイクル管理 — 生成、目標、報酬、連鎖、ダイアログ統合。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `Quest`, `QuestDefinition` |
| **主要エンティティ** | `QuestObjective`, `QuestObjectiveDef` |
| **値オブジェクト** | `QuestReward`, `QuestPrerequisite` |
| **ドメインイベント** | `QUEST_ADDED`, `QUEST_UPDATED` |
| **永続化** | `worlds/{name}/quests.json` |

**主要ファイル:**
- `src/services/quest-manager.ts` — 基本的なクエスト CRUD
- `src/services/quest-system.ts` — 連鎖、前提条件、時間制限を備えた完全なライフサイクル
- `src/models/quest.ts` — `Quest`, `QuestObjective`, `QuestData`

**ドメインルール:**
- クエストタイプ: `main`, `side`, `daily`, `faction`, `chain`
- クエスト状態: `available → active → completed | failed | abandoned`
- `QuestSystem` は前提条件を強制する（最低レベル、派閥、完了済みクエスト、関係）
- `Quest.progress` は計算値である（完了目標 / 総目標）
- 連鎖クエストは `chainNext` フィールドでリンクする

---

### BC7: 記憶 & 知識

**目的:** ワールド記憶、エージェント記憶、意味検索、埋め込みベースの検索、および記憶のライフサイクル管理。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `WorldMemory`（集約ルート）, `AgentMemoryStore`（エージェントごと） |
| **主要エンティティ** | `WorldMemoryEntry`, `AgentMemoryEntry` |
| **値オブジェクト** | `MemoryConfig`, `ScoringWeights`, `MemoryMetadata`, `RankedItem` |
| **ドメインイベント** | `MEMORY_ADDED`, `MEMORY_CONSOLIDATED`, `MEMORY_FORGOTTEN` |
| **永続化** | `tns.db`（SQLite）, `worlds/{name}/memory/`（パーティション）, FAISS インデックス |

**主要ファイル:**
- `src/memory/world-memory.ts` — `WorldMemory`: スコアリング、パーティショニング、埋め込み、クラスタリング
- `src/lib/agent-memory-store.ts` — `AgentMemoryStore`: ハイブリッド検索を備えたエージェントごとの RAG
- `src/lib/sqlite-store.ts` — `SQLiteStore`: FTS5 + ベクトル検索 + RRF 融合
- `src/lib/vector-ops.ts` — コサイン類似度、L2 距離、内積
- `src/services/memory-engine.ts` — `MemoryEngine`: NPC エピソード記憶に対する意味検索
- `src/services/memory-manager.ts` — `MemoryManager`: 会話履歴
- `src/memory/` — スコアリング、クラスタリング、書き込みバッファ、埋め込みキュー、認知パイプライン

**ドメインルール:**
- 記憶スコアリングは重み付き式を使用する: 重要度（0.35） + 新近性（0.25） + アクセス（0.15） + 感情（0.10） + 関連性（0.15）
- `minKeepScore`（0.15）未満かつ `minKeepDays`（30）より古い記憶は刈り込まれる
- エージェント記憶は SQLite の `role` 列（エージェント ID）で分離される
- ハイブリッド検索: FTS5 キーワード + 密ベクトル → Reciprocal Rank Fusion (RRF)
- FAISS インデックスは断片化が閾値（新規 200 エントリ）を超えると再構築される
- 書き込みバッファは効率のために埋め込み生成をバッチ処理する

---

### BC8: LLM 統合

**目的:** マルチプロバイダー LLM 管理、リクエストキューイング、レート制限、エージェントごとのモデル割り当て、プロンプト構築。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `ProviderManager`（シングルトン）, `LLMQueue` |
| **主要エンティティ** | `AgentModelAssignment`, `LLMProvider` |
| **値オブジェクト** | `AgentConfig`, `AgentPromptConfig`, `LLMClientOptions` |
| **ドメインイベント** | なし（インフラストラクチャレイヤー） |
| **永続化** | `conf/providers.json`, `conf/agents.json`, `tns.db`（agent_prompts テーブル） |

**主要ファイル:**
- `src/lib/llm-client.ts` — `LLMClient`: エージェントごとの LRU キャッシュ、プロバイダーディスパッチ
- `src/lib/llm-queue.ts` — `LLMQueue`: 優先度キュー、並行性制御、レート制限
- `src/lib/providers/provider-manager.ts` — `ProviderManager`: マルチプロバイダー、マルチキー対応
- `src/lib/providers/` — OpenAI, Anthropic, Google, Ollama, LlamaCpp プロバイダー
- `src/services/agent-config.ts` — エージェント設定（グローバル + ワールドごとのプロンプト）
- `src/services/prompt-builder.ts` — 全エージェント向けの静的プロンプトテンプレート
- `src/services/model-manager.ts` — モデル管理

**ドメインルール:**
- `LLMQueue` は最大並行性（デフォルト 3）とキューの上限（デフォルト 50）を強制する
- 優先度退避: キューが満杯のとき最も優先度の低いタスクが破棄される
- `RateLimiter` によるレート制限（RPM ベース、自動補充）
- 各エージェントは独自のプロバイダー、モデル、temperature、最大トークンを持てる
- プロンプト解決: SQLite（`agent_prompts`）→ JSON フォールバック → ハードコードされたデフォルト
- `LLMClient` は繰り返しリクエストに LRU キャッシュ（256 エントリ、5 分 TTL）を使用する

---

### BC9: 確率 & 戦闘

**目的:** 全ゲームメカニクスの決定的確率計算 — 戦闘、ソーシャルアクション、クラフト、恋愛。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `ProbabilityEngine` |
| **主要エンティティ** | `ProbabilityModifier`, `ProbabilityProfile` |
| **値オブジェクト** | `ProbabilityParameter`, `ProbabilityResult`, `OutcomeQuality` |
| **ドメインイベント** | なし（純粋な計算） |
| **永続化** | なし（メモリ内、NPC 状態から導出） |

**主要ファイル:**
- `src/services/probability-engine.ts` — 中核の確率計算
- `src/services/probability-resolver.ts` — コンテキスト解決（場所、関係、ワールド状態）
- `src/services/probability-expression.ts` — 動的修飾子の式パーサー
- `src/services/probability-profiles.ts` — 事前定義された確率プロファイル
- `src/models/probability.ts` — `ProbabilityModifier`, `ProbabilityProfile`, `OutcomeQuality`

**ドメインルール:**
- 修飾子タイプ: `ADD`, `MULTIPLY`, `REPLACE`
- スタッキングルール: `STACK`, `TAKE_HIGHEST`, `TAKE_LOWEST`, `OVERRIDE`
- 修飾子は失効できる（時間ベースの持続時間）
- `OutcomeQuality` は `CRITICAL_FAILURE` から `CRITICAL_SUCCESS` まで
- コンテキスト解決器は場所、関係、ワールド状態に基づいて動的修飾子を注入する
- Mojo FFI カーネル（`probability_ffi.mojo`）がバッチ計算を加速する

---

### BC10: 悪役管理

**目的:** LLM 駆動の戦略計画と状態機械フェーズを備えた敵対者のライフサイクル管理。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `VillainAgendaData` |
| **主要エンティティ** | `VillainMemoryData` |
| **値オブジェクト** | フェーズ（`plotting → preparing → executing → climax`） |
| **ドメインイベント** | `VILLAIN_PROGRESS` |
| **永続化** | `worlds/{name}/villain_state.json` |

**主要ファイル:**
- `src/services/villain-manager.ts` — `VillainManager`: フェーズ遷移、戦略計画

**ドメインルール:**
- 悪役は 4 フェーズの状態機械に従う: `plotting → preparing → executing → climax`
- 各フェーズ遷移には一連のアクションの完了が必要である
- LLM がコンテキスト認識の悪役アクションを生成する（サボタージュ、噂、スパイ潜入など）
- 悪役アクションにはワールド状態に影響する成功/失敗の結果がある
- 手下を悪役計画の実行に割り当てられる

---

### BC11: インテリジェンス & 分析

**目的:** グラフ解析、検証、重複排除、レコメンデーションエンジン。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | なし（サービスレイヤー） |
| **主要エンティティ** | なし |
| **値オブジェクト** | 検証結果、レコメンデーション |
| **ドメインイベント** | なし |
| **永続化** | エンティティストアから読み取り、検証結果を書き込む |

**主要ファイル:**
- `src/intelligence/graph-analyzer.ts` — グラフ指標、中心性、クラスタ
- `src/intelligence/graph-validator.ts` — 整合性チェック
- `src/intelligence/duplicate-detector.ts` — エンティティの重複排除
- `src/intelligence/relationship-repairer.ts` — 壊れた関係の修復
- `src/intelligence/recommender.ts` — コンテンツレコメンデーション
- `src/intelligence/scene-generator.ts` — 手続き的シーン生成
- `src/intelligence/rule-checker.ts` — ワールドルール強制
- `src/intelligence/subgraph-expander.ts` — サブグラフ拡張

---

### BC12: 文学コンパイラ v2 (v0.32.5)

**目的:** 文学ソースからのオフラインナラティブ抽出と、制約付き散文生成のためのランタイムハイブリッド検索。LLM 多用の v1 パイプラインを、決定的テンプレート + スタイルパターンシステムに置き換える。

| 側面 | 詳細 |
|--------|--------|
| **主要集約** | `LiteraryCompilerDB`（全 v2 テーブルの集約ルート） |
| **主要エンティティ** | `SceneTemplate`, `StylePattern`, `ChunkIndex`, `TemplateStyleLink` |
| **値オブジェクト** | `RetrievalKeys`, `RankedTemplate`, `ExtractResult`, `PreScoreResult`, `TurnMetrics` |
| **ドメインイベント** | なし（オフラインパイプライン + ランタイム検索） |
| **永続化** | `literary.db`（FTS5 インデックス付き SQLite） |

**主要ファイル:**
- `src/mcp/literary-compiler/schema.ts` — `LiteraryCompilerDB`: 6 つの v2 テーブル、FTS5、CRUD メソッド
- `src/mcp/literary-compiler/archetypes.ts` — 12 の正準アーキタイプ + キーワードセット + 変数 + 位置
- `src/mcp/literary-compiler/chunker.ts` — 文ベースのテキスト分割（200–400 トークン、40–80 オーバーラップ）
- `src/mcp/literary-compiler/pre-score.ts` — 辞書キーワードスコアリング + ナラティブ密度（ダイアログ/アクション/対立）
- `src/mcp/literary-compiler/extractor.ts` — Zod スタイル検証付き LLM JSON 抽出器
- `src/mcp/literary-compiler/retrieval.ts` — 合成スコアリング: アーキタイプ（0.40） + ムード（0.15） + ドメイン（0.15） + 品質（0.10） + 新鮮さ（0.05） + タグ（0.15）
- `src/mcp/literary-compiler/fill-template.ts` — 決定的な `[placeholder]` 置換
- `src/mcp/literary-compiler/linter.ts` — V2 検証: 説教検出、トークン制限、アーキタイプ妥当性
- `src/mcp/literary-compiler/runtime-metrics.ts` — ターンごとのレイテンシ追跡
- `src/services/agents/stylist.ts` — v2 制約付き生成のための `buildMicroPrompt()`
- `src/lib/feature-flags.ts` — `literary-compiler-v2`, `literary-v2-retrieval`, `literary-v2-stylist` フラグ
- `scripts/migrate-v1-to-v2.ts` — アーキタイプ名の移行（escape → escape_liberation など）

**ドメインルール:**
- 全テンプレートは RAG 最適化のため英語（インターリングア）を使用する
- テンプレートは匿名化される（ソースのキャラクター名を含まない）
- 反説教制約がリンター + プロンプトレベルで強制される
- 各テンプレートは ≤ 120 トークンのスケルトンを持つ
- 検索は top-1 テンプレートを返す（ほぼ同点なら top-2）
- ハードバジェット: ターンごとに LLM 呼び出し 1〜2 回（v1 の 4〜5 回から削減）
- 段階的ロールアウトのためフィーチャーフラグでゲートされる

**オフラインパイプライン:**
```
Source text
  → A. Chunker (pure code, 200-400 tokens, overlap 40-80)
  → B. BGE-M3 embed + store
  → C. Dictionary/heuristic candidate pass
  → D. Cluster / near-dup collapse (vectors)
  → E. Select representatives
  → F. Small local LLM JSON extract (Qwen3-8B, temp=0.1)
  → G. Role consistency map
  → H. Linter / quality gate
  → I. Write scene_templates + style_patterns + links
  → J. Emit metrics report
```

**ランタイムフロー:**
```
Player input
  → Intent + Simulation + State mutation (0 LLM)
  → Build retrieval keys (position, archetype, mood, domain)
  → FTS + dictionary hybrid retrieval → top-1 template
  → Get linked style_pattern
  → fillTemplate (deterministic)
  → Stylist micro-prompt → 1 LLM call → 2-3 paragraphs
  → Rule-based Censor
```

---

## [A3] 集約 & エンティティ

### BC1: ワールド管理

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `World` | 集約ルート | 一意のスラグ化された名前を持つ必要がある; 有効な `WorldFrame` を持つ必要がある |
| `WorldFrame` | 値オブジェクト | `world_name` を定義する必要がある; 有効なワールドでは `world_rules` が空でない必要がある |
| `LayeredProfile` | 値オブジェクト | L1 は `name` と `type` を持つ必要がある; レイヤーは L1/L2/L3 |
| `EntityNode` | エンティティ | 一意の `uid` を持つ必要がある; `entityType` は有効な `EntityTypeValue` である必要がある |
| `EntityType` | 値オブジェクト（列挙型） | `CHARACTER`, `FACTION`, `LOCATION`, `ITEM`, `EVENT`, `WORLD_RULE`, `RACE`, `UNKNOWN` |

### BC2: エンティティ & グラフ

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `GraphStore` | 集約ルート | 走査前にブートされている必要がある; エッジは有効な UID を参照する |
| `GraphEdge` | エンティティ | `source` と `target` は有効なエンティティ UID である必要がある |
| `Relationship` | 値オブジェクト | `sourceUid` と `targetUid` が存在する必要がある; `strength` は 0–1 |
| `BranchManager` | エンティティ | ブランチ名は一意である必要がある; 親が存在する必要がある |

### BC3: ナラティブ & ストーリー

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `StoryContext` | 値オブジェクト | `worldName`, `currentTime`, `location` を持つ必要がある |
| `StoryArc` | 集約ルート | 一意の `id` を持つ必要がある; `beats` 配列はタイミング順に並ぶ |
| `DirectorTask` | エンティティ | 一意の `id` を持つ必要がある; `priority` は `TaskPriority` の範囲内 |
| `BeatData` | エンティティ | 有効な `chapter_id` に属する必要がある; `triggered` はブール値 |
| `ChapterData` | 値オブジェクト | 一意の `id` を持つ必要がある; `beats` 配列は null でない |

### BC4: NPC & ダイアログ

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `NPCProfile` | 集約ルート（NPC ごと） | 一意の `name` と `uid` を持つ必要がある; `health` は 0–100; `skills` の値は 0–1 |
| `EpisodicMemory` | エンティティ | 一意の `id` を持つ必要がある; `importance` は 0–1; `emotion` は空でない |
| `DialogueSession` | エンティティ | 一意の `id` を持つ必要がある; `state` は有効な列挙型の範囲内 |
| `NPCSkills` | 値オブジェクト | 全スキル値は 0–1 である必要がある |
| `DialogueMessage` | 値オブジェクト | `role` は `player` または `npc` である必要がある |

### BC5: ソーシャル & 関係

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `SocialGraph` | 集約ルート | 有効な状態パスを持つ必要がある; 関係は有効なエンティティを参照する |
| `Relationship` | エンティティ | `type` は有効な列挙型; `strength` は 0–1; `source` ≠ `target` |
| `Faction` | 値オブジェクト | 一意の `name` を持つ必要がある; メンバーは一意 |
| `Alliance` | 値オブジェクト | `faction1` ≠ `faction2`; `strength` は 0–1 |
| `FeudalRelationship` | 値オブジェクト | `vassal` ≠ `liege`; `loyalty` は 0–1 |

### BC6: クエスト

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `Quest` | 集約ルート | 一意の `id` を持つ必要がある; `status` は有効な列挙型; `progress` は計算値 |
| `QuestDefinition` | 集約ルート | 一意の `id` を持つ必要がある; `objectives` は空でない |
| `QuestObjective` | エンティティ | `completed` はブール値 |
| `QuestReward` | 値オブジェクト | `gold`, `experience` ≥ 0 |
| `QuestPrerequisite` | 値オブジェクト | 少なくとも 1 つの前提条件が設定されている必要がある |

### BC7: 記憶 & 知識

| コンポーネント | 型 | 不変条件 |
|-----------|------|------------|
| `WorldMemory` | 集約ルート | 有効なストレージパスを持つ必要がある; エントリは重み付き式でスコアリングされる |
| `WorldMemoryEntry` | エンティティ | 一意の `id` を持つ必要がある; `importance` は 0–1; `content` は空でない |
| `AgentMemoryStore` | 集約ルート | `agentId` で分離される; ハイブリッド FTS5 + ベクトル検索を使用する |
| `MemoryConfig` | 値オブジェクト | 全重み ≥ 0; `halfLifeDays` > 0 |
| `ScoringWeights` | 値オブジェクト | 重みの合計は 1.0 |

---

## [A4] ドメインサービス

単一の集約に属さない横断的なサービス:

| サービス | ファイル | 目的 |
|---------|------|---------|
| `NarrativeService` | `src/services/narrative-service.ts` | **Composition Root** — 全ナラティブサブシステムをインスタンス化して配線する |
| `RoleplayEngine` | `src/services/roleplay-engine.ts` | メインエントリポイント: PipelineRunner → CommandHandler → 散文ジェネレーターをオーケストレーションする。SessionState は `roleplay/session-state.ts` に抽出され、ハンドラーは `roleplay/handlers/` にある |
| `StoryEngine` | `src/services/story-engine.ts` | ビートからのイベント生成 + 効果適用（NPC の移動、関係変化、クエスト作成） |
| `DirectorLoop` | `src/services/director-loop.ts` | バックグラウンドオーケストレーター: 時計ティック → ソーシャルシミュレーション → 悪役 → 偶然イベント → ストーリービート |
| `SocialSimulator` | `src/services/social-simulator.ts` | NPC ペア選択 + 相互作用生成 |
| `ProbabilityEngine` | `src/services/probability-engine.ts` | 修飾子スタッキングによる決定的な結果解決 |
| `MemoryEngine` | `src/services/memory-engine.ts` | NPC エピソード記憶に対する意味検索 |
| `WorldValidator` | `src/services/world-validator.ts` | ワールド整合性検証 |
| `AgentCoordinator` | `src/services/agent-coordinator.ts` | ディレクタータスク実行の優先度キュー |
| `StartResolver` | `src/services/start-resolver.ts` | ワールド状態から初期ストーリーコンテキストを解決する |
| `WorldIsolator` | `src/services/world-isolator.ts` | リソース監視付きマルチワールド分離（メモリ、CPU、トークン） |
| `CrossWorldBus` | `src/services/cross-world-bus.ts` | ポータルを備えたワールド間イベント通信 |
| `PluginManager` | `src/plugins/plugin-manager.ts` | プラグインライフサイクル管理（登録、登録解除、ケイパビリティ） |

---

## [A5] ドメインイベント

すべてのイベントは `EventTopic` 列挙型（`src/lib/event-bus.ts`）で定義される:

| イベント | 発行者 | コンシューマー | 説明 |
|-------|-----------|-----------|-------------|
| `ENTITY_ADDED` | `WorldBuilder`, `NPCGenerator` | `GraphStore`, `WorldMemory` | 新しいエンティティが作成された |
| `ENTITY_UPDATED` | 各種サービス | `GraphStore`, `WorldMemory` | エンティティプロファイルが変更された |
| `ENTITY_REMOVED` | `GraphStore` | `WorldMemory` | エンティティが削除された |
| `ENTITY_LAYER_COMPLETED` | `WorldBuilder` | `GraphStore` | L1/L2/L3 構築フェーズ完了 |
| `RELATIONSHIP_ADDED` | `SocialSimulator` | `GraphStore` | 新しい関係が形成された |
| `RELATIONSHIP_REPAIRED` | `SocialSimulator` | `GraphStore` | 壊れた関係が修復された |
| `RELATIONSHIP_BROKEN` | `SocialSimulator` | `GraphStore` | 関係が断絶された |
| `WORLD_CREATED` | `WorldManager` | 全サービス | 新しいワールドが初期化された |
| `WORLD_FRAME_LOADED` | `WorldBuilder` | 全サービス | ワールドフレームがディスクからロードされた |
| `WORLD_EVOLVED` | `WorldEvolver` | `Chronicler`, `WebSocketManager` | ワールド状態が変更された |
| `STORY_EVENT` | `StoryEngine` | `Chronicler`, `WebSocketManager` | ストーリーイベントが生成された |
| `STORY_BEAT` | `DirectorLoop` | `Chronicler`, `WebSocketManager` | ストーリービートが注入された |
| `VILLAIN_PROGRESS` | `VillainManager` | `Chronicler`, `WebSocketManager` | 悪役アクションが実行された |
| `QUEST_ADDED` | `QuestSystem` | `WebSocketManager` | 新しいクエストが作成された |
| `QUEST_UPDATED` | `QuestSystem` | `WebSocketManager` | クエスト状態が変更された |
| `MEMORY_ADDED` | `WorldMemory` | `AgentMemoryStore` | 新しい記憶が保存された |
| `MEMORY_CONSOLIDATED` | `WorldMemory` | — | 短期→長期への昇格 |
| `MEMORY_FORGOTTEN` | `WorldMemory` | — | 記憶が刈り込まれた |
| `MAINTENANCE_START` | システム | 全サービス | メンテナンスサイクル開始 |
| `MAINTENANCE_DONE` | システム | 全サービス | メンテナンスサイクル完了 |
| `GRAPH_CHANGED` | `GraphStore` | `Intelligence` | グラフトポロジーが変更された |
| `ERROR` | 各種 | ロギング | エラーが発生した |

**イベントバスの仕組み:**
- ハンドラーは `priority` でソートされる（高いほど先に実行）
- 遅延サブスクライバー向けのリプレイバッファ（デフォルト 100 イベント）
- `await` 付きの非同期発行 — fire-and-forget なし

---

## [A6] アプリケーションレイヤー

### ユースケースフロー: プレイヤーメッセージ → Stylist 応答

```
1. HTTP POST /chat/message
   └─→ routes/chat.ts: Zod 検証、入力サニタイズ

2. RoleplayEngine.processInput(sanitizedMessage)
   ├─→ SessionState (activeCharacter, currentLocation, currentTime)
   ├─→ PipelineRunner.translateAndClassify() → IntentParser
   ├─→ CommandHandler.handle() コマンドの場合
   ├─→ PipelineRunner.runSimulation() → SimulationEngine
   ├─→ 散文生成: LiteraryV2Generator または LegacyIntentGenerator
   └─→ ナラティブ文字列を返す

3. Stylist.process(intent, simulation, context, pattern)
   ├─→ loadAgentConfig("stylist") → SQLite プロンプト → JSON フォールバック → デフォルト
   ├─→ resolveTemplate(template, vars) を StoryContext フィールドで
   └─→ LLMQueue.generateText(prompt, priority, temperature, agentId)

4. LLMQueue
   ├─→ RateLimiter.check() → 並行性制御
   ├─→ ProviderManager.getProvider(agentId) → provider/model
   ├─→ LLMClient.generate() → LRU キャッシュチェック → LLM への HTTP
   └─→ 応答を返す

5. RoleplayEngine
   ├─→ MemoryManager.addEntry(user, response)
   ├─→ Chronicler.logEvent(...) → WorldMemory.addEvent(...)
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ `{ narrative, location, storyTime, activeCharacter }` を返す

6. WebSocketManager.broadcast({ type: "narrative", ... })
```

### ユースケースフロー: ディレクターティック → ストーリービート

```
1. DirectorLoop（バックグラウンド setInterval、デフォルト 30 分）
   ├─→ WorldClock.tick(minutes)
   ├─→ SocialSimulator.simulateInteraction()
   ├─→ VillainManager.tick() → フェーズ遷移
   ├─→ ProbabilityEngine.roll() → 偶然イベント
   └─→ StoryPlanner.shouldGenerateBeat() → StoryEngine.generateEvent()

2. StoryEngine.generateEvent()
   ├─→ LLMQueue.generateJson(EVENT_PROMPT, ...) → 構造化イベント
   ├─→ 効果の適用: NPC の移動、関係変化、クエスト作成
   ├─→ EventBus.publish(STORY_EVENT)
   └─→ Chronicler.logEvent(...)

3. DirectorLoop
   ├─→ StoryEngine.generateBeat() → LLM がナラティブビートを生成
   ├─→ RoleplayEngine.injectBeat(beat) → 次の応答の先頭に付加
   └─→ director_state.json を保存
```

### ユースケースフロー: ワールド作成

```
1. HTTP POST /api/worlds
   └─→ routes/worlds.ts → world-manager.createWorld(params)

2. WorldManager.createWorld()
   ├─→ mkdir worlds/{slugified-name}/
   ├─→ world_frame.json を書き込む
   ├─→ EventBus.publish(WORLD_CREATED)
   └─→ NarrativeService.reset(dbPath, worldFrame)

3. WorldBuilder（/api/launch で）
   ├─→ createWorld() → LLM が WorldFrame を生成
   ├─→ buildL1() → 全エンティティの同一性レイヤー
   ├─→ buildL2() → 動的状態レイヤー
   ├─→ buildL3() → 隠蔽/秘密レイヤー
   ├─→ buildRelationships() → エンティティの関係
   └─→ 各エンティティについて EventBus.publish(ENTITY_ADDED)

4. WebSocketManager.broadcast({ type: "world_created", ... })
```

### ユースケースフロー: エージェント記憶

```
1. Stylist がナラティブ散文を生成
   └─→ EventBus.publish(MEMORY_ADDED, { content, source: "stylist" })

2. WorldMemory.addEvent()
   ├─→ スコアリングメタデータ付きの WorldMemoryEntry を作成
   ├─→ EmbeddingQueue.enqueue(entry) → BGE-M3 によるバッチ埋め込み
   ├─→ VectorIndex.add(embedding, entryId)
   ├─→ WriteBehindBuffer.add(entry)
   └─→ SQLite への定期的なフラッシュ + FAISS 再構築

3. AgentMemoryStore.search(agentId, query)
   ├─→ getEmbedding(query) → BGE-M3 エンドポイント
   ├─→ SQLiteStore.searchMemoriesFTS(query) → キーワード一致
   ├─→ SQLiteStore.searchMemoriesDense(vector) → コサイン類似度
   ├─→ ReciprocalRankFusion(ftsResults, denseResults)
   └─→ agentId でフィルタリングされた top-K の結果を返す
```

---

## [A7] インフラストラクチャ

### LLM 統合

```
ProviderManager（シングルトン）
├── OpenAIProvider    (conf/providers.json)
├── AnthropicProvider
├── GoogleProvider
├── OllamaProvider
└── LlamaCppProvider  （ローカル、埋め込み用ポート 5002）

LLMClient（エージェントごと）
├── ProviderManager.getProvider(agentId) → provider/model
├── LRU キャッシュ（256 エントリ、5 分 TTL）
├── parseJsonWithRetry()（構造化出力用）
└── エージェントごとの設定: temperature, maxTokens, model

LLMQueue（グローバル）
├── 優先度キュー（CRITICAL > HIGH > NORMAL > LOW）
├── RateLimiter（RPM ベース、自動補充）
├── 最大並行性（デフォルト 3）
├── キュー上限（デフォルト 50）、優先度退避付き
└── エージェントごとの LLMClient インスタンス
```

**ファイル:** `src/lib/llm-client.ts`, `src/lib/llm-queue.ts`, `src/lib/providers/provider-manager.ts`

### 永続化

| ストア | テクノロジー | パス | 目的 |
|-------|-----------|------|---------|
| `UnifiedEntityStore` | JSON ファイル | `worlds/{name}/entities.json` | O(1) 名前解決付きエンティティ CRUD |
| `SQLiteStore` | `bun:sqlite` | `worlds/{name}/tns.db` | FTS5 検索、ベクトル埋め込み、エージェントプロンプト、翻訳 |
| `GraphStore` | メモリ内隣接マップ | `worlds/{name}/entities.json` | グラフ走査、分岐 |
| `SessionStore` | `bun:sqlite` | `worlds/_sessions/sessions.db` | 認証セッショントークン |
| `Chronicler` | JSONL ファイル | `worlds/{name}/timeline.jsonl` | ローテーション付きイベントタイムライン |
| `WorldClock` | JSON ファイル | `worlds/{name}/clock_state.json` | ゲーム時刻、スケジュールされたイベント |
| `NPCRuntime` | JSON ファイル | `worlds/{name}/npc_profiles.json` | NPC 状態 + エピソード記憶 |
| `SocialGraph` | JSON ファイル | `worlds/{name}/social/*.json` | 関係、派閥、同盟 |
| `StoryPlanner` | JSON ファイル | `worlds/{name}/planner_state.json` | 章、ビート |
| `DirectorLoop` | JSON ファイル | `worlds/{name}/director_state.json` | ディレクター状態 |
| `VillainManager` | JSON ファイル | `worlds/{name}/villain_state.json` | 悪役の計画 |
| `WorldMemory` | SQLite + FAISS | `worlds/{name}/memory/` | 埋め込み付き意味記憶 |
| `AgentMemoryStore` | SQLite | `tns.db` | エージェントごとの RAG |
| `settings.json` | JSON ファイル | `conf/settings.json` | アプリ全体の設定 |
| `providers.json` | JSON ファイル | `conf/providers.json` | LLM プロバイダー設定 |
| `agents.json` | JSON ファイル | `conf/agents.json` | エージェントモデル割り当て |

**永続化パターン:** 全 JSON 書き込みはクラッシュ安全性のため `atomicWriteJson()`（一時ファイルへの書き込み + リネーム）を使用する。SQLite は `PRAGMA synchronous = NORMAL` で WAL モードを使用する。

### WebSocket リアルタイム

**ファイル:** `src/services/websocket-manager.ts`

- `WebSocketManager` は一意の ID で接続クライアントを管理する
- `broadcast(message)` は全接続クライアントに送信する（切断された接続のクリーンアップ）
- `sendTo(id, message)` は対象指定配信用
- `EventBus` からのイベントは WebSocket クライアントへ転送される

### 認証

**ファイル:** `src/middleware/auth.ts`, `src/lib/session-store.ts`

- トークンベースのセッション認証（32 バイトのランダム hex）
- セッションは SQLite に保存される（`worlds/_sessions/sessions.db`）
- 24 時間 TTL、1 時間ごとのクリーンアップ
- `authMiddleware` は `/login` を除く全 `/api/*` ルートをゲートする
- POST エンドポイント経由のログイン/ログアウト

---

## [A8] データフロー図

### 1. ユーザーメッセージ → Stylist 応答

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ ブラウザ  │────▶│ routes/chat  │────▶│  RoleplayEngine  │
│           │◀────│   (Hono)     │◀────│                  │
└──────────┘     └──────────────┘     └────────┬─────────┘
                                               │
                    ┌──────────────────────────┤
                    ▼                          ▼
          ┌─────────────────┐      ┌──────────────────┐
          │    Stylist      │      │  MemoryManager   │
          │ （LLM プロンプト）│      │  （履歴保存）     │
          └────────┬─────────┘      └──────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │    LLMQueue      │
          │ （優先度、レート │
          │  制限、キャッシュ）│
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐
          │  ProviderManager │
          │  (OpenAI/Anth/   │
          │   Google/Ollama) │
          └────────┬─────────┘
                   │
                   ▼
          ┌─────────────────┐     ┌──────────────────┐
          │   外部 LLM       │────▶│  Chronicler.log   │
          │   API            │     │  EventBus.publish │
          └─────────────────┘     └──────────────────┘
```

### 2. ディレクターティック → ストーリービート生成

```
┌─────────────────┐
│  DirectorLoop    │  (setInterval、30 分ごと)
│  ┌─────────────┐│
│  │ WorldClock  ││──▶ tick(minutes) → 時間を進める → スケジュールされたイベントを発火
│  └─────────────┘│
│  ┌─────────────┐│
│  │SocialSim    ││──▶ simulateInteraction() → ペア選択 → イベント生成
│  └─────────────┘│
│  ┌─────────────┐│
│  │VillainMgr   ││──▶ tick() → フェーズ遷移 → LLM 戦略アクション
│  └─────────────┘│
│  ┌─────────────┐│
│  │ProbEngine   ││──▶ roll() → 偶然イベント（天候、事故、発見）
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryPlanner ││──▶ shouldGenerateBeat() → generateNextBeat() → LLM
│  └─────────────┘│
│  ┌─────────────┐│
│  │StoryEngine  ││──▶ generateEvent() → LLM → 効果適用 → イベント発行
│  └─────────────┘│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  EventBus        │────▶│  WebSocketManager │
│  (STORY_BEAT)    │     │ （ブロードキャスト）│
└─────────────────┘     └──────────────────┘
```

### 3. ワールド作成フロー

```
┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│ ブラウザ  │────▶│  POST /worlds     │────▶│  WorldManager   │
│           │     │  (routes/worlds)  │     │  createWorld()  │
└──────────┘     └──────────────────┘     └───────┬────────┘
                                                   │
                    ┌──────────────────────────────┤
                    ▼                              ▼
          ┌─────────────────┐            ┌────────────────┐
          │  mkdir worlds/   │            │ EventBus.publish│
          │  {name}/         │            │ (WORLD_CREATED) │
          └─────────────────┘            └────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────┐
                                          │NarrativeService │
                                          │    .reset()     │
                                          └────────────────┘

POST /api/launch:
┌─────────────────┐
│  WorldBuilder    │
│  ├─ createWorld()│──▶ LLM → WorldFrame JSON
│  ├─ buildL1()    │──▶ LLM → 各エンティティの L1 同一性
│  ├─ buildL2()    │──▶ LLM → L2 動的状態
│  ├─ buildL3()    │──▶ LLM → L3 隠蔽/秘密
│  └─ buildRels()  │──▶ LLM → 関係
└─────────────────┘
          │
          ▼
┌─────────────────┐
│ EventBus.publish │
│ (ENTITY_ADDED    │
│  × N エンティティ）│
└─────────────────┘
```

### 4. エージェント記憶フロー

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│    Stylist       │────▶│ EventBus.publish  │────▶│  WorldMemory    │
│ （ナラティブを    │     │ (MEMORY_ADDED)    │     │  .addEvent()    │
│   生成）         │     └──────────────────┘     └───────┬────────┘
└─────────────────┘                                       │
                                                    ┌─────┴──────┐
                                                    ▼            ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │EmbeddingQueue │ │ WriteBehind  │
                                            │ （バッチ BGE-M3）│ │   バッファ    │
                                            └──────┬───────┘ └──────┬───────┘
                                                   │                │
                                                   ▼                ▼
                                            ┌──────────────┐ ┌──────────────┐
                                            │ VectorIndex   │ │ SQLiteStore  │
                                            │ (FAISS)       │ │ (tns.db)     │
                                            └──────────────┘ └──────────────┘

クエリフロー:
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ AgentMemory   │────▶│ SQLiteStore       │────▶│ FTS5（キーワード）│
│ .search()     │     │ .searchMemories   │     │ + 密ベクトル   │
│               │     │                   │     │ → RRF 融合     │
└──────────────┘     └──────────────────┘     └────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │ ReciprocalRank    │
                    │ Fusion (RRF)      │
                    └──────────────────┘
```

---

## [A9] クロスコンテキスト依存関係

```
                    ┌─────────────────────┐
                    │  ワールド管理        │
                    │  (BC1)               │
                    └──────────┬──────────┘
                               │ 作成/ロード
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ エンティティ & │◀──▶│ ナラティブ & ストーリー│◀──▶│  NPC &       │
│ グラフ (BC2)  │    │  (BC3)               │    │  ダイアログ   │
└──────┬───────┘    └──────────┬──────────┘    │  (BC4)       │
       │                       │                └──────┬───────┘
       │                       │                       │
       │                       ▼                       │
       │              ┌─────────────────────┐          │
       │              │  LLM 統合            │          │
       │              │  (BC8)               │◀─────────┘
       │              └──────────┬──────────┘
       │                         │
       │    ┌────────────────────┼────────────────────┐
       │    ▼                    ▼                    ▼
       │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ │ ソーシャル &   │ │  クエスト     │ │  悪役        │
       │ │ 関係 (BC5)    │ │  (BC6)       │ │  (BC10)      │
       │ └──────┬───────┘ └──────┬───────┘ └──────────────┘
       │        │                │
       │        ▼                ▼
       │ ┌─────────────────────────────┐
       │ │  確率 & 戦闘                 │
       │ │  (BC9)                      │
       │ └─────────────────────────────┘
       │
       ▼
┌─────────────────────┐    ┌─────────────────────┐
│  記憶 & 知識         │◀──▶│  インテリジェンス     │
│  (BC7)               │    │  (BC11)              │
└─────────────────────┘    └─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  文学コンパイラ v2   │  (BC12, v0.32.5)
│                    │
└─────────────────────┘
```

**主要な依存関係:**

| ソース BC | ターゲット BC | 結合メカニズム |
|-----------|-----------|-------------------|
| BC1 (World) | BC2 (Entity) | `UnifiedEntityStore` の共有インスタンス |
| BC1 (World) | BC3 (Narrative) | `NarrativeService.reset()` |
| BC3 (Narrative) | BC4 (NPC) | `RoleplayEngine` に注入される `NPCRuntime` |
| BC3 (Narrative) | BC5 (Social) | `DirectorLoop` に注入される `SocialSimulator` |
| BC3 (Narrative) | BC6 (Quest) | `StoryEngine` に注入される `QuestManager` |
| BC3 (Narrative) | BC10 (Villain) | `DirectorLoop` に注入される `VillainManager` |
| BC3 (Narrative) | BC9 (Probability) | `RoleplayEngine` 内の `ProbabilityEngine` |
| BC3 (Narrative) | BC12 (LitCompiler) | `RoleplayEngine` が `searchTemplates` + `fillTemplate` を呼び出す |
| BC4 (NPC) | BC7 (Memory) | `NPCRuntime` が `EpisodicMemory` を使用する |
| BC5 (Social) | BC2 (Entity) | `SocialGraph` が `UnifiedEntityStore` から読み取る |
| BC8 (LLM) | 全 BC | `LLMQueue` は全エージェントで共有される |
| BC8 (LLM) | BC12 (LitCompiler) | オフライン抽出器が構造化抽出に `LLMClient` を使用する |
| BC7 (Memory) | BC8 (LLM) | `EmbeddingQueue` が埋め込みに `LLMClient` を呼び出す |
| BC11 (Intelligence) | BC2 (Entity) | グラフ解析が `GraphStore` を読み取る |

---

## [A10] 主要な設計判断

### D1: Composition Root パターン

**決定:** `NarrativeService`（`src/services/narrative-service.ts`）はコンポジションルートとして機能し、全サービスをインスタンス化して依存関係を手動で配線する。

**トレードオフ:** フレームワークなしの明示的な DI。全依存関係が 1 つのコンストラクタに可視化され、デバッグしやすいが冗長になる。代替案（IoC コンテナ）はランタイムの魔法を追加することになる。

### D2: 主要ストアとしての JSON ファイル（検索には SQLite）

**決定:** エンティティ状態、NPC プロファイル、ソーシャル関係は JSON ファイルとして保存される。SQLite は検索（FTS5）、埋め込み（ベクトル）、セッション、エージェントプロンプトにのみ使用される。

**トレードオフ:** 原子的ファイル操作によるシンプルな読み書きだが、エンティティ間のトランザクション保証はない。`atomicWriteJson()` パターン（一時ファイルへの書き込み + リネーム）は個別の書き込みにはクラッシュ安全性を提供するが、複数ファイルの一貫性はない。SQLite は検索と埋め込みに完全な ACID を提供する。

### D3: クロスコンテキスト通信のイベントバス

**決定:** 優先度ソートされたハンドラーとリプレイバッファを持つ `EventBus` が、境界づけられたコンテキストを非同期に接続する。

**トレードオフ:** コンテキストを疎結合にする（NPC は Memory を知らず、Memory は NPC を知らない）が、間接参照が増える。リプレイバッファ（100 イベント）は遅延サブスクライバーが最近のイベントを見逃さないようにするが、メモリのコストがかかる。

### D4: エージェントごとのモデル割り当て

**決定:** 各エージェント（`stylist`, `director`, `researcher`, `translation` など）は独自の LLM プロバイダー、モデル、temperature、最大トークンを持てる。

**トレードオフ:** 最大の柔軟性（chronicler に安価なモデル、stylist に強力なモデルを使用）だが、設定管理が必要になる。ProviderManager は `conf/providers.json` と `conf/agents.json` でこれを処理する。

### D5: 3 レイヤーのエンティティプロファイル（L1/L2/L3）

**決定:** エンティティプロファイルは 3 レイヤーを使用する: L1（同一性/名前）、L2（動的状態/場所）、L3（隠蔽/秘密）。

**トレードオフ:** 段階的な開示と DM 管理の秘密を可能にする。L1 は常に可視、L2 はプレイ中に更新、L3 はプレイヤーから隠される。コストはプロファイル解決の複雑さの増加である。

### D6: バックグラウンドのディレクターループ

**決定:** `DirectorLoop` はバックグラウンド間隔として実行され、プレイヤー入力から独立して時計ティック、ソーシャルシミュレーション、悪役アクション、ストーリービートをオーケストレーションする。

**トレードオフ:** プレイヤーがオフラインでも進化する生きたワールドを作り出す。トレードオフは状態管理の複雑さ（一時停止/実行状態、主要ビートのクールダウン）と、プレイヤーが見逃すイベントの可能性である。

### D7: ハイブリッド検索（FTS5 + ベクトル + RRF）

**決定:** 記憶検索はキーワード（FTS5）と意味（密ベクトル）の両方の検索を使用し、Reciprocal Rank Fusion で結合する。

**トレードオフ:** 両方の長所 — 正確なキーワード一致と意味的類似度。コストは両方のインデックスと埋め込みパイプライン（ポート 5002 の llama.cpp サーバー経由の BGE-M3）の維持である。

### D8: ストーリーグラフの Git ライクな分岐

**決定:** `BranchManager` はエンティティグラフの分岐をサポートし、代替ストーリーパスを可能にする。

**トレードオフ:** ワールド状態全体を複製せずに「what if」シナリオと並行タイムラインを可能にする。各ブランチは親に対する追加と削除のみを保存する。

### D9: SQLite フォールバック付きテンプレートベースのエージェントプロンプト

**決定:** エージェントプロンプトは SQLite（`agent_prompts`）にワールド単位・言語単位の分離で保存され、JSON ファイル、そしてハードコードされたデフォルトへフォールバックする。

**トレードオフ:** コード変更なしで i18n とワールド単位のカスタマイズをサポートする。3 段階のフォールバックはデータベースがなくてもシステムが動作することを保証する。

### D10: 性能クリティカルな計算のための Mojo FFI

**決定:** 確率計算とベクトル演算は TypeScript フォールバック付きの Mojo FFI カーネル（`probability_ffi.mojo`, `vector_ffi.mojo`）を使用できる。

**トレードオフ:** バッチ演算（確率ロール、コサイン類似度）に大幅な性能向上をもたらすが、ビルドの複雑さとプラットフォーム依存を追加する。TypeScript フォールバックは移植性を保証する。

---

## 付録: ファイルリファレンス

| ディレクトリ | ファイル | 目的 |
|-----------|-------|---------|
| `src/models/` | 12 ファイル | ドメインモデル（Entity, Quest, Story, Director, NPC, Romance, Probability, Memory, Item, Rank, Archetype） |
| `src/services/` | 45+ ファイル | アプリケーション + ドメインサービス |
| `src/routes/` | 18 ファイル | HTTP アダプター（Hono ルーター） |
| `src/lib/` | 15+ ファイル | インフラストラクチャ（LLM, SQLite, EventBus, ベクトル演算, プロバイダー） |
| `src/memory/` | 12 ファイル | 記憶サブシステム（スコアリング、クラスタリング、埋め込み、認知パイプライン） |
| `src/intelligence/` | 10 ファイル | グラフ解析と検証 |
| `src/store/` | 1 ファイル | NameIndex 付き統合エンティティストア |
| `src/config/` | env.ts | 環境設定 |
| `src/i18n/` | 国際化 | 多言語サポート（7 言語） |
| `src/middleware/` | auth, rate-limiter など | HTTP ミドルウェア |
| `src/utils/` | logger, sanitize など | 共有ユーティリティ |
