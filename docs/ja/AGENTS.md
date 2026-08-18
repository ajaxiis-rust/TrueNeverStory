# エージェントリファレンス (v0.33.0)

TrueNeverStoryには**2つのエージェントシステム**が共存しています：

1. **The Big Six (AgentV2)** — ナラティブ散文パイプライン。`AgentRegistryV2` に登録され、`RoleplayEngine` でインスタンス化されます。
2. **設定済みエージェント（`DEFAULT_AGENTS`）** — より古い設定駆動型エージェントで、`src/services/agent-config.ts` に列挙されています。Settings/Providers UIといくつかのサブシステム（アイドルリサーチ、チャットの `@mentions`）を支えます。

The Big Sixは：`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`。設定済みエージェントは：`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`。

`stylist` が唯一の散文生成器です。削除されたエージェント（`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`）はもはやコードのどこにも存在しません。

---

## The Big Six (AgentV2)

これらは決定的な散文パイプライン（インテント → シミュレーション → コンテキスト → 散文）を処理します。

### 1. Dramaturg（建築家）

**ID:** `dramaturg`
**役割:** 聖書のアーキタイプからナラティブパターンを選択
**MCPツール:** `search_verses`, `get_pattern`, `get_archetype`

| 項目 | 詳細 |
|--------|--------|
| **目的** | 現在の状況を分析し、聖書のパターンから適切なストーリー構造を選ぶ |
| **入力** | Intent, SimulationResult, GameContext |
| **出力** | NarrativePattern（アーキタイプ、名前、説明、聖句、ムード） |
| **依存** | TNSServer (MCP), LLMQueue |

**ワークフロー:**
1. インテント種別とシミュレーション結果からムードを推論
2. 一致するアーキタイプを聖書MCPに照会
3. MCPが利用不可ならLLM生成パターンにフォールバック

### 2. Validator（事実確認者）

**ID:** `validator`
**役割:** Wikipedia MCPで事実を検証
**MCPツール:** `verify_fact`, `get_context`

| 項目 | 詳細 |
|--------|--------|
| **目的** | 世界の一貫性と歴史的正確性を確保 |
| **入力** | Intent, SimulationResult, GameContext |
| **出力** | 検証結果（検証済み、信頼度、証拠、出典） |
| **依存** | TNSServer (MCP) |

**ワークフロー:**
1. 状況から事実的主張を抽出
2. Wikipedia MCPに検証を照会
3. 信頼度つきの検証結果を返す

### 3. Stylist（語り手）

**ID:** `stylist`
**役割:** グーテンベルクの文体パターンで散文をレンダリング — 唯一の散文生成器
**MCPツール:** `get_style_pattern`, `apply_style`

| 項目 | 詳細 |
|--------|--------|
| **目的** | ナラティブ散文を生成する中核のテキスト生成エージェント |
| **入力** | Intent, SimulationResult, GameContext, NarrativePattern |
| **出力** | 散文テキスト |
| **依存** | TNSServer (MCP), LLMQueue |

**ワークフロー:**
1. ムードに基づく文体をグーテンベルクMCPから取得
2. シミュレーション結果と文体で制約付きプロンプトを構築
3. LLMで散文を生成
4. レンダリング済みテキストを返す

### 4. Actor（NPCアンサンブル）

**ID:** `actor`
**役割:** NPCの対話と相互作用を管理
**MCPツール:** なし

| 項目 | 詳細 |
|--------|--------|
| **目的** | NPCの対話、交易、クラフト、社会的動態をすべて処理 |
| **入力** | Intent, SimulationResult, GameContext |
| **出力** | NPC対話テキスト、状態変化 |
| **依存** | UnifiedEntityStore, LLMQueue |

**ワークフロー:**
1. インテント種別に応じて適切なサブハンドラーへルーティング
2. L3プロファイルからNPCの隠れた動機を取得
3. LLMでNPCの応答を生成
4. 関係性の状態変化を計算

### 5. Censor（リンター）

**ID:** `censor`
**役割:** AIの決まり文句を除去し、文体の一貫性を強制
**MCPツール:** なし

| 項目 | 詳細 |
|--------|--------|
| **目的** | AI生成の決まり文句や時代錯誤を除去して散文を清書 |
| **入力** | 散文テキスト, GameContext |
| **出力** | 清書済み散文テキスト |
| **依存** | LLMQueue |

**ワークフロー:**
1. 正規表現パターンでAIの決まり文句を除去
2. 世界コンテキストに基づき時代錯誤を修正
3. 複雑な問題はLLMベースで磨き上げ
4. 清書済みテキストを返す

**よく除去されるAIの決まり文句:**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID:** `chronicler`
**役割:** 世界記憶を更新し、タイムラインを維持
**MCPツール:** なし

| 項目 | 詳細 |
|--------|--------|
| **目的** | 重要なイベントをすべて記録し、世界の一貫性を維持 |
| **入力** | Intent, SimulationResult, GameContext |
| **出力** | 状態変化（NPCの記憶更新） |
| **依存** | UnifiedEntityStore, EventBus |

**ワークフロー:**
1. インテントと結果からイベント記述を作成
2. 他システム向けにEventBusへ発行
3. 近くのキャラクターのNPC記憶を更新
4. タイムラインに記録

---

## 設定済みエージェント（`DEFAULT_AGENTS`）

これらは `src/services/agent-config.ts` にあり、Settings/Providers UI、`LLMQueue`/`LLMClient`、およびいくつかのサブシステムを支えます。`chronicler` はBig Sixと共有されています。temperatureとトークン上限は、`conf/agents.json` で上書きされない限りグローバルデフォルト（0.7 / 2048）から取得されます。

| ID | 名前 | 優先度 | 使用元 |
|----|------|--------|--------|
| `director` | ディレクター | 8 | ストーリービート注入 |
| `chronicler` | 記録者 | 5 | タイムライン要約（`@mention` も） |
| `story-planner` | ストーリープランナー | 6 | ストーリーアーク提案（`@mention`） |
| `social-sim` | 社会シミュレーター | 4 | NPCの社会的動態（`@mention`） |
| `villain` | 悪役マネージャー | 6 | 敵対者の策略（`@mention`） |
| `researcher` | 研究者 | 3 | `IdleResearchScheduler`、アイテム評価（`@mention`） |
| `translation` | 翻訳 | 2 | 出力境界での英語 ↔ ユーザー言語 |

**プロンプトテンプレート（テンプレート変数 → 解決先）：**

- **director** — `{narrative}`, `{beat}`。進行中のナラティブにストーリービートを統合します。
- **chronicler** — `{events}`, `{timeline}`。新しいイベントを時系列で要約します。
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`。出力：`{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`。
- **social-sim** — `{characters}`, `{relationships}`, `{context}`。関係性の変化と派閥への影響を記述します。
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`。敵対者の次の一手を計画します。
- **researcher** — `{task}`, `{world_context}`。出力：`{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`。
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`。翻訳されたテキストのみを返します。

---

## ダイアログシステム (v0.33.0)

構造化されたNPC会話のための新しい `DialogueManager` + `DialogueContext`：

| 機能 | 説明 |
|---------|-------------|
| **セッション管理** | 挨拶 → アクティブ → 別れのライフサイクル |
| **関係性認識** | 友人/中立/敵ごとの挨拶とトピック利用可否 |
| **封建的階級** | 領主/家臣の特別な挨拶 |
| **トピック選択** | 個人、派閥、クエスト、交易、戦闘、クラフト、噂、ゴシップなど |
| **記憶記録** | ダイアログ要約をNPCの長期記憶に保存 |

`engine.dialogueManager` 経由でアクセス（`npcRuntime` が利用可能であることが必要）。

**注:** チャットの `@mentions` は設定済みハンドラー（`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`）へルーティングされ、Big Sixへは向かいません。`@narrator`, `@director`, `@scene`, `@npc` はもはや存在しません。

---

## Agent Registry v2

The Big Sixは `AgentRegistryV2`（`src/services/agent-registry-v2.ts`）に登録されます：

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## エージェントインターフェース (v0.33.0)

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

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## グローバル変数

これらの変数はゲームコンテキストを通じてエージェントが利用できます：

| 変数 | 説明 |
|----------|-------------|
| `{world_name}` | 現在のワールド名（world_frame.jsonから） |
| `{time}` | 現在のストーリー時刻（ISO文字列） |
| `{location}` | 現在のキャラクター位置 |
| `{character}` | アクティブなキャラクター名 |
| `{role}` | ユーザーの役割（主人公、観察者など） |
| `{rules}` | ワールドルール（魔法法則、社会規範など） |
| `{timeline}` | 最近のワールドイベント（Chroniclerの直近5件） |
| `{memories}` | 最近のロールプレイ記憶 |
| `{facts}` | 確立されたワールド事実 |
| `{npcs}` | 近くのNPC名 |
| `{history}` | 最近の会話履歴（直近3往復） |
| `{events}` | 最近のイベント（コンテキスト依存、直近3〜5件） |
| `{world_state}` | 現在のワールド状態の要約 |
| `{world_context}` | リサーチ用ワールドコンテキスト |
| `{genre}` | ワールドのジャンル（ファンタジー、SF、ホラーなど） |
| `{magic_system}` | 魔法システムの説明 |
| `{language}` | 主要ワールド言語（en, ruなど） |
| `{world_description}` | ワールド説明/ピッチ |

---

## Temperatureガイド

設定済みエージェントは、`conf/agents.json` で上書きされない限りグローバルデフォルト（temperature 0.7、最大トークン 2048）を使用します。

| 値 | 効果 | 用途 |
|-------|--------|---------|
| 0.1 - 0.3 | 集中的、決定論的 | リサーチ、事実確認、インテント解析 |
| 0.4 - 0.6 | バランス型 | Chronicler、社会的シミュレーション |
| 0.7 - 0.8 | 創造的 | ナラティブ、NPC対話、敵対者の策略 |

---

## チャットで @agent を使用

チャットからエージェントへプライベートメッセージを送信。チャットの `@mentions` は設定済みハンドラーへルーティングされ、Big Sixへは向かいません：

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

応答は左側の青いボーダーと括弧内のエージェント名でマークされます。

The Big Six（`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`）は `AgentRegistryV2` に登録されていますが、`@mention` では**到達できません**。

---

## RAGシステム（埋め込み + 長期記憶）

すべてのエージェントはRAGによる長期記憶つきの完全な埋め込みサポートを備えています：

- **llama.cpp 埋め込みサーバー** — ベクトル生成用にポート5002でBGE-M3モデル
- **SQLiteハイブリッド検索** — FTS5キーワード検索 + 密ベクトル検索 + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — `role` 列によるエージェント単位・セッション単位の記憶分離
- **ワールドスコープ記憶** — 記憶をワールド単位で分離し、ワールド間の幻覚を防止
- **Mojo計算カーネル** — FFI経由の5つのMojoカーネル（TypeScriptフォールバック付き）：
  - `probability_ffi.mojo` — 成功率、ロール結果、バッチ確率
  - `vector_ffi.mojo` — 4次元ベクトル演算（コサイン、L2、内積）
  - `vector_full.mojo` — 全次元ベクトル演算（768次元BGE-M3）
  - `batch_ops.mojo` — バッチNPC演算（年齢減衰、悪癖、税、忠誠）
  - `graph_ops.mojo` — グラフ走査、RRF融合、評判計算

**記憶フロー:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## MCP統合 (v0.33.0)

### 聖書パターン

聖書テキストは節単位の粒度でSQLiteに保存。各節はエージェントが参照できる原子的なポインタです。

**ツール:**
- `search_verses` — テキスト、書、参照で検索
- `get_pattern` — アーキタイプ、ムード、機能でナラティブパターンを取得
- `get_archetype` — 名前でアーキタイプ詳細を取得

### グーテンベルク文体

グーテンベルク・プロジェクトのテキストから抽出した文体パターン。脱語彙化された記述は、キャラクター名なしで構造を保持します。

**ツール:**
- `get_style_pattern` — ムード、タグ、説明で文体を検索
- `apply_style` — テキストに文体を適用（脱語彙化して提案を返す）

### Wikipedia検証

Wikipedia APIによる歴史的事実確認。

**ツール:**
- `verify_fact` — 事実的主張を検証
- `get_context` — トピックのWikipediaコンテキストを取得

---

## テンプレートシステム

### userTemplateの仕組み

各エージェントはSQLite（`agent_prompts`テーブル）に `userTemplate` を保存し、JSONファイルフォールバックを持ちます。テンプレートには `{var}` プレースホルダーが含まれ、実行時に `resolveTemplate()`（`src/utils/template-resolver.ts`）が実際の値へ置換します。

**フロー:**
1. エージェントが設定をロード：`loadAgentConfig(agentId, world?, lang?)`
2. まずSQLiteから `prompts.userTemplate` を読み、次にJSONフォールバック
3. コンテキストデータで `resolveTemplate(template, vars)` を呼び出し
4. 解決済みプロンプトをLLMへ送信

**userTemplateが存在しない場合** → `PromptBuilder`（ハードコードされたTypeScriptテンプレート）へフォールバック。

---

## プレイヤースタイルプロファイル (v0.33.0)

`PlayerProfileStore`（`src/lib/player-profile-store.ts`）は、StylistとLiteraryV2Generatorの間で共有されるクロスエージェントのプレイヤースタイルプロファイルを提供します。

**追跡メトリクス:**
| メトリクス | 説明 |
|--------|-------------|
| `avg_sentence_len` | 平均文長（単語数） |
| `sensory_bias` | 感覚的詳細の好み（0–1） |
| `register_score` | フォーマル/インフォーマルな語調（0–1） |
| `dialogue_ratio` | テキスト内の対話の割合 |
| `narrative_distance` | 近い vs 遠い語り（0–1） |
| `action_orientation` | 行動 vs 内省の好み（0–1） |
| `emotional_expressiveness` | 感情的詳細のレベル（0–1） |
| `preferred_pace` | 遅い / 中程度 / 速い |
| `literary_sophistication` | 語彙/構造の複雑さ（0–1） |
| `preferred_motifs` | 好むナラティブモチーフ |
| `anti_patterns` | 避けるパターン |
| `sample_snippets` | 代表的なテキストサンプル |
| `confidence` | プロファイル信頼度（0–1） |

**保存先:** `data/player-profiles.db`（SQLite、WALモード）

---

## ストレージアーキテクチャ

### SQLiteデータベース

プロジェクトはBun組み込みの `bun:sqlite` モジュール経由でSQLiteを使用します。データベースファイルは設定された `dbPath` 内の `tns.db`（デフォルト `./worlds/{active}`）です。

**テーブル:**
- `entities` — FTS5全文検索付きワールドエンティティ
- `embeddings` — 意味検索用のベクトル埋め込み
- `memories` — FTS5付きロールプレイ記憶
- `agent_prompts` — ワールド + 言語ごとのエージェントプロンプト
- `ui_translations` — 言語 + ページごとのUI翻訳文字列

### JSONファイルストレージ（フォールバック）

移行中、JSONファイルはフォールバックとして残ります：

```
conf/
  settings.json          — アプリ全体の設定（LLM、サーバー、言語など）
  agents.json            — グローバルなエージェントのモデル/プロバイダー割り当て
worlds/{active}/
  agents/{agentId}.json  — ワールド単位のエージェントプロンプト（フォールバック）
```
