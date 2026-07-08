# TrueNeverStory API リファレンス

TrueNeverStory ワールドビルド＆ロールプレイプラットフォームの REST API。すべてのエンドポイントは特に明記しない限り JSON を返します。

**ベース URL:** `http://localhost:8000`

---

## 目次

- [ヘルスチェック](#ヘルスチェック)
- [チャット＆ロールプレイ](#チャットロールプレイ)
- [ワールド](#ワールド)
- [エンティティ＆グラフ](#エンティティグラフ)
- [セッション](#セッション)
- [ブランチ](#ブランチ)
- [確率](#確率)
- [ロマンス](#ロマンス)
- [クエスト](#クエスト)
- [メモリ](#メモリ)
- [メンテナンス](#メンテナンス)
- [エージェント](#エージェント)
- [プロバイダー＆モデル](#プロバイダーモデル)
- [設定](#設定)
- [起動](#起動)

---

## ヘルスチェック

### `GET /health`
ヘルスチェック。

**レスポンス:** `{ status: "ok", engine_ready: boolean, uptime: number }`

### `GET /system-check`
Node バージョンとプラットフォーム情報を含むシステムステータス。

**レスポンス:** `{ ok: boolean, message: string, node_version: string, platform: string }`

---

## チャット＆ロールプレイ

### `POST /chat/setup`
アクティブなロールプレイセッションを初期化または更新。

**リクエスト:**
```json
{
  "character": "Kaelen",
  "location": "Silverwood",
  "story_time": "2025-06-01T12:00:00Z",
  "role": "protagonist",
  "session_id": "default"
}
```

**レスポンス:** `{ active_character, current_location, current_time, session_id }`

### `POST /chat/message`
プレイヤーメッセージを送信し、ナラティブ応答を取得。

**リクエスト:** `{ content: string (1-8000), character?, location?, session_id?, story_time? }`

**レスポンス:** `{ narrative: string, agent_id?, agent_name?, location, story_time, active_character, success: boolean, error? }`

### `POST /chat/stream`
プログレッシブなナラティブ配信のための SSE ストリーミング。リクエストボディは `/chat/message` と同じ。

**レスポンス:** Server-Sent Events ストリーム:
- `event: start` — セッション状態
- `event: chunk` — ナラティブテキストチャンク
- `event: agent` — エージェント応答（`@agent` 言及時）
- `event: done` — 最終状態
- `event: error` — エラーメッセージ
- `data: [DONE]` — ストリーム終了マーカー

### `POST /chat/agent`
特定のエージェントにプライベートメッセージを送信。

**リクエスト:** `{ agentId: string, message: string }`

**レスポンス:** `{ narrative, agent_id, agent_name, location, story_time, active_character, success, error? }`

### `GET /chat/session`
現在のセッション状態を取得。

**レスポンス:** `{ active_character, current_location, current_time, session_id }`

### `GET /chat/history?limit=20`
最近の会話履歴を取得。

**レスポンス:** `{ user: string, assistant: string, timestamp: string }` の配列

---

## ワールド

### `GET /worlds`
利用可能なすべてのワールドを一覧表示。

**レスポンス:** `{ worlds: [{ name, active }], active: string }`

### `GET /worlds/active`
アクティブなワールド名（軽量クエリ）。

**レスポンス:** `{ active: string }`

### `POST /worlds`
新しいワールドを作成。

**リクエスト:** `{ name, title?, description?, genre?, language?, worldRules?: string[], magicSystem? }`

**レスポンス:** `{ status: "created", world }`

### `GET /worlds/:name`
ワールドの詳細とフレームデータを取得。

### `PUT /worlds/:name`
World Frame フィールドを更新。

### `DELETE /worlds/:name`
ワールドを削除。

### `POST /worlds/:name/switch`
アクティブなワールドを切り替え。

### `POST /worlds/:name/chapters/generate`
セッションデータから文学的な章を生成。

**リクエスト:** `{ sessionId?: string, prompt?: string }`

### `GET /worlds/:name/chapters`
生成された章を一覧表示。

### `GET /worlds/:name/chapters/:filename`
章の内容を取得。

---

## エンティティ＆グラフ

### `GET /entity/:uid?layers=l1,l2,l3`
UID でエンティティの詳細を取得。

### `GET /neighbors/:uid?depth=1&direction=out&layers=l1,l2`
グラフトラバーサルによるエンティティの近隣ノード。方向: `out`、`in`、または `both`。

### `GET /path?source=Character:Kaelen&target=Location:Village`
2 つのエンティティ間の最短パスを検索。

### `GET /search?q=keyword&semantic=false&top_k=10&entity_type=Character&page=1&page_size=20`
名前または意味的類似性でエンティティを検索。

**レスポンス:** `{ results: EntityNode[], total, page, page_size }`

### `GET /graph/summary`
グラフの統計情報（ノード/エッジ数、ブランチ情報）。

### `GET /graph/d3?mode=relationships`
d3-force ビジュアライゼーション用のグラフデータ。モード: `relationships` または `crafting`。

**レスポンス:** `{ nodes: [{id, name, type, group}], links: [{source, target, label, strength}] }`

---

## セッション

### `GET /sessions`
すべてのセッション履歴を一覧表示。

### `GET /sessions/list`
利用可能なゲームセッションを一覧表示。

**レスポンス:** `{ sessions: array, count: number }`

### `GET /sessions/:sessionId/history`
セッションの会話履歴を取得。

### `GET /sessions/:sessionId/summarize`
セッションを要約。

### `POST /sessions/export`
セッションを Markdown にエクスポート。

**リクエスト:** `{ session_id?: string, messages: [{role, content, timestamp?}] }`

### `GET /sessions/exports`
エクスポートされた Markdown ファイルを一覧表示。

### `GET /sessions/exports/:filename`
エクスポートされたファイルを読み込み。

---

## ブランチ

### `POST /branch/create?name=my-branch&from_branch=main`
新しいワールドブランチを作成（Git 風スナップショット）。

### `POST /branch/switch?name=my-branch`
アクティブなブランチを切り替え。

### `POST /branch/merge?name=my-branch`
ブランチを main にマージ。

### `GET /branch/list`
すべてのブランチを一覧表示。

---

## 確率

### `GET /probability/:character/:profile?target=optional`
キャラクターアクションの成功確率を取得。

プロファイル: `combat`、`persuasion`、`stealth`、`intimidation`、`deception`、`athletics`、`investigation`、`romance`、`generic`。

**レスポンス:** `{ character, profile, probability: number }`

### `POST /probability/modifier`
一時的な確率モディファイアを適用。

**リクエスト:** `{ entity: string, parameter: string, value: number, duration_seconds?: number }`

### `GET /probability/modifiers/:entity`
エンティティのアクティブなモディファイアを一覧表示。

---

## ロマンス

### `GET /romance/:character1/:character2`
ロマンチックな関係のステータスを取得。

**レスポンス:** `{ status, affection, compatibility, stage, last_interaction }`

### `POST /romance/attempt/:action`
ロマンチックなアクションを試みる。アクション: `attraction`、`confess`、`date`、`kiss`、`propose`、`breakup`。

**リクエスト:** `{ character, target, location?, message? }`

**レスポンス:** `{ success: boolean, narrative: string, affection_change: number }`

### `GET /romance/characters/:character`
キャラクターのすべてのロマンチックな関係を取得。

---

## クエスト

### `GET /quests`
進捗を含むすべてのクエストを一覧表示。

### `GET /quest/:questId`
個々のクエストの詳細を取得。

---

## メモリ

### `POST /memory/forget?older_than=30&min_importance=0.2`
古い低重要度の記憶を忘れる。

### `POST /memory/summarise?tag=keyword`
タグまたはノード UID ごとに記憶を要約。

### `GET /memory/export?fmt=json`
すべての記憶をエクスポート。

### `POST /memory/import`
ボディから記憶をインポート。

**リクエスト:** `{ data: MemoryEntry[] }`

### `POST /memory/update/:entryId`
メモリエントリを更新。

**リクエスト:** `{ content: string }`

### `GET /memory/stats`
メモリシステムの統計情報。

### `POST /memory/rebuild`
FAISS ベクトルインデックスを再構築。

### `GET /memory/retrieve?q=keyword&top_k=10`
記憶の意味的検索。

---

## メンテナンス

### `POST /maintenance/run?full=true`
メモリメンテナンスを実行（プルーニング、クラスタリング、アーカイブ）。

### `GET /maintenance/status`
メモリとメンテナンスの統計情報。

### `POST /maintenance/rebuild-index`
ベクトルインデックスを再構築。

### `POST /maintenance/clean-orphans`
オーファン埋め込みをクリーンアップ。

---

## エージェント

### `GET /agents`
設定されたすべてのエージェントを一覧表示。

**クエリパラメータ:** `world` — オプション、特定のワールドでフィルタリング

### `GET /agents/:id`
個々のエージェントの設定を取得。

**クエリパラメータ:** `world` — オプション、特定のワールドでフィルタリング

### `PUT /agents/:id`
エージェントの設定を更新（モデル、温度、プロンプトなど）。レート制限: 30件/分/IP。

**クエリパラメータ:** `world` — オプション、特定のワールドでフィルタリング

### `PUT /agents/:id/prompts`
エージェントのプロンプトのみを更新。

**クエリパラメータ:** `world` — オプション、特定のワールドでフィルタリング

### `POST /agents/:id/reset`
エージェントをデフォルト設定にリセット。

### `GET /agents/providers/options`
エージェント割り当てに利用可能なプロバイダー/モデルオプション。

---

## プロバイダー＆モデル

### `GET /providers`
すべての LLM プロバイダーを一覧表示。

### `POST /providers`
新しいプロバイダーを追加。

### `GET /providers/models`
すべてのプロバイダーのモデルを一覧表示。

### `POST /providers/health`
すべてのプロバイダーのヘルスチェックを実行。

### `POST /providers/assign`
エージェントにプロバイダー+モデルを割り当て。

**リクエスト:** `{ agentId, providerId, modelId, temperature?, maxTokens? }`

### `DELETE /providers/assign/:agentId`
エージェントのプロバイダー割り当てを削除。

### `GET /providers/:id`
プロバイダーの詳細と利用可能なモデルを取得。

### `PUT /providers/:id`
プロバイダーの設定を更新。

### `DELETE /providers/:id`
プロバイダーを削除。

### `POST /providers/:id/default`
プロバイダーをデフォルトに設定。

### `POST /providers/:id/keys`
API キーを追加。

### `DELETE /providers/:id/keys/:keyId`
API キーを削除。

### `GET /models`
インストール済みおよび利用可能なすべてのモデルを一覧表示。

### `POST /models/install`
モデルをインストール。

**リクエスト:** `{ source: "ollama"|"gguf_url", name: string, backend: "ollama"|"llamacpp" }`

### `DELETE /models/:id`
モデルを削除。

### `POST /models/import`
ローカルモデルファイルをインポート。

### `POST /models/apply`
設定にモデルを適用。

### `GET /models/browse?path=/`
モデルファイルのためのファイルシステムを参照。

---

## 設定

### `GET /settings`
現在の設定を取得（API キーはマスク済み）。

### `PUT /settings`
設定を更新。パスワードは自動でハッシュ化され、マスクされたキーは無視されます。

### `POST /settings/reset`
デフォルト設定にリセット。

### `GET /languages`
利用可能な UI 言語を一覧表示（EN、RU、DE、FR、ES、JA、ZH）。

---

## 起動

### `POST /launch`
キャラクター生成付きの新しいゲームセッションを作成。

**リクエスト:** `{ name?: string, hints?: string, isekai?: boolean, starting_age?: number }`

- `name` — オプション、ゲームセッションの名前

**レスポンス:** `{ status: "success", session_id, character_name, opening_narrative, url }`

### `POST /continue`
既存のセッションを続ける。

**リクエスト:** `{ session_id: string }`

**レスポンス:** `{ status: "success", session_id, character_name, url }`

---

## WebSocket

### `GET /ws/roleplay/:sessionId`
リアルタイムロールプレイ用の WebSocket エンドポイント。メッセージは JSON:

**クライアント → サーバー:** `{ type: "message", content: string }`
**サーバー → クライアント:** `{ type: "chunk"|"done"|"error", content?: string, location?, story_time? }`

---

## 認証

パスワード認証が有効な場合、セッションは HttpOnly Cookie を使用します。fetch 呼び出しには `credentials: "include"` を含めてください。

---

*生成日: 2026-06-27 | TrueNeverStory v0.12.0*
