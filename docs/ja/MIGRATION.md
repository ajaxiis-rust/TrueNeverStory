# 移行ガイド: JSON から SQLite へ

このガイドでは、ワールドデータの JSON ファイルから SQLite への移行と、TrueNeverStory が使用するストレージレイアウトについて説明する。

## 概要

TrueNeverStory は `WorldStore` クラス（`src/store/world-store.ts`）経由でワールドデータを **SQLite** に保存する。データベースファイルは `tns.db` で、ワールドディレクトリ内（`<worldPath>/tns.db`）に WAL ジャーナルモードを有効にして作成される。

元の JSON ファイルは移行ソースとしてワールドディレクトリに残り、削除されることはない — フォールバックと履歴記録として機能する。

## v0.33.0 移行: 文学コンパイラ & 経済モデル

v0.33.0 リリースでは文学コンパイラと経済モデルが追加される。移行は不要 — これらは既存の State-First パイプラインを拡張する追加機能である。

## v0.33.0 移行: State-First パイプライン

### 変更点

v0.33.0 リリースでは state-first パイプラインアーキテクチャが導入される。2 つのエージェントシステムが共存するようになった:

1. **The Big Six (AgentV2)** — ナラティブ散文パイプライン（`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`）。`AgentRegistryV2` に登録される。
2. **設定済みエージェント（`DEFAULT_AGENTS`）** — `src/services/agent-config.ts` の設定駆動型エージェント（`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`）。Settings/Providers UI といくつかのサブシステムを支える。

**旧パイプライン:**
```
ユーザー意図 → エージェント選択 → エージェント実行 → 応答
```

**新パイプライン:**
```
ユーザー意図 → シミュレーション → パターン選択（Dramaturg）→ 事実確認（Validator）→ 文体レンダリング（Stylist）→ NPC ダイアログ（Actor）→ リンティング（Censor）→ 記憶更新（Chronicler）
```

**削除されたエージェント:**

| 削除 | 置き換え先 |
|---------|-------------|
| `narrator`, `scene` | `stylist`（散文生成） |
| `historian` | `validator`（事実検証） |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | （廃止） |
| `npc` | `actor`（NPC ダイアログ） |

`villain`, `social-sim`, `researcher`, `director` は設定済みエージェントとして引き続き利用できる。`crafter` はクラフトサブシステムとして残る。

**後方互換性:** 削除されたエージェント ID（`@narrator`, `@npc`, `@scene`, `@director`）はもはや存在せず、解決されない。チャットの `@mentions` は設定済みハンドラー（`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`）にのみルーティングされる。

### MCP 統合

v0.33.0 では外部知識アクセスのために Model Context Protocol (MCP) ツールが導入される:

| MCP サーバー | ツール | 目的 |
|------------|-------|---------|
| 聖書パーサー | `search_verses`, `get_pattern`, `get_archetype` | 聖書テキストからのナラティブパターン |
| Gutenberg パーサー | `get_style_pattern`, `apply_style` | 文学からの文体パターン |
| Wikipedia ツール | `verify_fact`, `get_context` | 歴史的事実確認 |

**設定:**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### 新しい依存関係

| 依存関係 | 状態 | 目的 |
|------------|--------|---------|
| Zod | プロジェクトに既に存在 | スキーマ検証 |
| Mojo FFI | プロジェクトに既に存在 | 計算カーネル |
| TranslationService | 外部依存なし | UI 翻訳 |

### 破壊的変更

- **RoleplayEngine の内部フローが書き直された** — パイプラインは Simulation → Pattern → Style → Dialogue → Lint → Memory の順に従う
- **AgentV2.process() が generateResponse() を置き換える** — 新しいシグネチャ: `process(intent, simulation, context, pattern?)`
- **createRoleplayEngine() に新しい依存関係が必要** — MCP サーバー参照、AgentRegistryV2、EventBus
- **`getLanguageInstruction()` が削除された** — 言語処理は出力境界の `TranslationService` へ移動した

---

## ストレージレイアウト

### SQLite データベース

`WorldStore` コンストラクタはワールドディレクトリ内に `tns.db` ファイルを開く（存在しなければ作成する）:

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**初期化時に作成されるテーブル（`CREATE TABLE IF NOT EXISTS`）:**

| テーブル | 目的 |
|-------|---------|
| `quests` | クエストデータ（`id`, `title`, `description`, `giver`, `objectives`, `status`, タイムスタンプ） |
| `npc_memories` | NPC の短期および長期記憶。`npc_uid` + `memory_type` でインデックスされる |
| `story_arcs` | ストーリープランナーのアークデータ（行ごとに単一の JSON blob） |
| `world_frame` | ワールドフレームのキー/値ペア |
| `director_state` | ディレクター状態のキー/値ペア |
| `villains` | 悪役データ（行ごとの JSON blob） |

### JSON ファイル（移行ソース）

元の JSON ファイルは同じワールドディレクトリにあり、移行ソースとして読み取られる。移行後に削除されることはない:

| JSON ファイル | 移行先テーブル |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## 移行プロセス

### 移行の実行

移行は HTTP エンドポイント経由でオンデマンドに実行される（起動時の自動移行はない）:

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

`migrate()` メソッドは各データソースを独自の `try/catch` 内で独立して移行するため、1 つのソースの失敗が他を中断することはない。移行に成功した各ソースは `migrated` に追加され、失敗は `errors` に記録される。

**移行されるソース（順序）:** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`。

JSON ソースファイルが存在しないか解析できない場合、そのソースは黙ってスキップされる（読み取りヘルパーは `null` を返す）。

### レガシーパスの移行

起動時（`src/index.ts`）、`WORLDS_ROOT` ディレクトリが存在しない場合、それが作成され、レガシーの `WORLD_DB_PATH` ディレクトリ（例: `world_db/`）が `worlds/default/` にリネームされる:

```
world_db/  →  worlds/default/
```

## WorldStore API

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## API エンドポイント

ルーター（`src/routes/world-store.ts`）は `/api` の下にマウントされる。各エンドポイントは特定のワールドを対象とするためにオプションの `?world=` クエリパラメータを受け付ける（デフォルトはアクティブなワールド）:

| メソッド | パス | 説明 |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | JSON ファイルを SQLite に移行する; `{ status, world, migrated, errors }` を返す |
| `GET` | `/api/world-store/stats` | `{ world, stats }` を返す（クエスト、記憶、ワールドフレームキーの件数） |
| `GET` | `/api/world-store/quests` | SQLite からクエストを一覧表示する |
| `GET` | `/api/world-store/npc-memories/:uid` | NPC の記憶（`?type=short_term\|long_term_episodic`） |
| `GET` | `/api/world-store/frame` | ワールドフレームのキー/値ペア |

## ロールバック

移行が失敗した場合、またはロールバックする必要がある場合:

1. SQLite データは `worlds/{name}/tns.db` に分離されている
2. 元の JSON ファイルは `worlds/{name}/` に残る
3. `worlds/{name}/tns.db` を削除して JSON のみの状態にリセットする
4. `POST /api/world-store/migrate` を再実行して JSON から再度移行する

## トラブルシューティング

### "Table already exists" エラー

これは正常である — テーブルは `IF NOT EXISTS` で作成される。

### 移行後にデータが欠落する

JSON ソースファイルがワールドディレクトリに存在し、有効な JSON であることを確認する。解析できないファイルは黙ってスキップされ、解析が throw した場合にのみ報告される — 詳細は migrate 結果の `errors` 配列を確認する。

### パフォーマンス

- SQLite の WAL モードは `WorldStore` でデフォルトで有効である
- 耐久性と速度のバランスのため `PRAGMA synchronous = NORMAL` が設定される
- 大きなデータベースでは定期的に `PRAGMA optimize` を実行する
