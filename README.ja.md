# TrueNeverStory v0.22.1

### 遊ぶだけで、自分の物語を書こう。

TrueNeverStoryはAI搭載のインタラクティブ・ナラティブ・エンジンです。すべてのNPCは記憶し、すべての行動には確率があり、物語は決して止まりません。キャラクターを演じ、生きている世界を探検し、あなたの選択が物語を形づくる様子を見守るか、世界を自由に発展させましょう。

TypeScript (Bun + Hono) とC FFIカーネルによるハイブリッド構成。

**[English](README.md) | [Русский](README.ru.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [中文](README.zh.md)**

---

## 機能

| 機能 | 説明 |
|------|------|
| **生きた世界** | キャラクター、場所、アイテム、派閥 — すべてO(1)のグラフ接続 |
| **14のAIエージェント** | ナレーター、ディレクター、NPC、シーン、年代記、プランナー、悪役、研究者、歴史家、地図師、商人、クエスト給与、知識の番人、社交シミュレーション |
| **メモリとRAG** | ベクトル検索 (BGE-M3 + SQLite ハイブリッド FTS5/密/RRF) |
| **確率システム** | 戦闘、説得、隠密、ロマンスの決定論的結果 |
| **ロマンスと社交** | 関係管理、派閥、同盟、封建的階級、NPC対話 |
| **クエストシステム** | 動的クエスト生成、目標、報酬、チェーン、時間制限 |
| **インベントリと交易** | レアリティ、ステータス、装備、ゴールド、NPC取引 |
| **NPC経済** | 封建的階級 (10ランク)、税金、食料生産、家族制度、34アルケタイプ |
| **ルールエンジン** | 14の定義済み社会/経済システム（封建制、民主制、無政府状態など）とシナジーマトリックス |
| **マルチワールド** | リソース監視（メモリ、CPU、トークン）による隔離されたワールド実行 |
| **クロスワールド** | ポータルと共有メモリによるワールド間イベント通信 |
| **プラグインシステム** | 拡張可能なアーキテクチャ、プラグインマネージャー、ライフサイクルフック、API |
| **フィーチャーフラグ** | A/Bテスト、段階的展開、パーセンテージ targeting |
| **APIバージョニング** | v1/v2エンドポイントと非推奨ヘッダー |
| **リアルタイムストリーミング** | WebSocket + SSEによるライブナラティブ配信 |
| **i18n (7言語)** | EN, RU, DE, FR, ES, JA, ZH |
| **パスワード認証** | HttpOnlyクッキー、CSRF保護、SQLiteバックアップセッション |
| **SQLite保存** | エンティティ、埋め込み、メモリ、プロンプト、翻訳 |
| **サーキットブレーカー** | LLMプロバイダーの自動フェイルオーバーとフォールバックチェーン |
| **構造化ログ** | Trace ID、相関ID、マルチエージェントワークフローのデバッグ用メトリクス |

---

## サポートプラットフォーム

| プラットフォーム | 状態 | 備考 |
|------------------|:----:|------|
| Linux x86_64 | ✅ | 完全サポート、FFIカーネル |
| Linux ARM64 | ✅ | 完全サポート、FFIカーネル |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## クイックスタート

**Bun、Node.js、その他のランタイムは不要。** ダウンロードして実行するだけ。

### 1. ダウンロード

[GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest)から最新リリースをダウンロード：

| プラットフォーム | ファイル |
|------------------|---------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. 実行

ランチャーはLLMプロバイダー（Ollama、LM Studio、OpenAI、llama.cpp）を自動検出し、`.env`を設定してサーバーを起動します。

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# tns-windows-x64.zipを展開後：
.\startgame.ps1
```

**起動オプション:**
```bash
./startgame.sh --local    # CORS=localhost のみ（開発向け）
./startgame.sh --remote   # CORS=*（デフォルト、外部アクセスを許可）
```

**ソースから（Bunが必要）:**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. オープン

**http://localhost:8000** — パスワード: **`changeme``**

初回ログイン後に設定でパスワードを変更してください。

---

## LLM設定

**設定**ページを開くか、`.env`を編集：

### Ollama (ローカル、無料)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

vLLM、Anthropic、Google、およびすべてのOpenAI互換APIでも動作します。

---

## プロジェクト構造

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod検証済み環境設定
│   ├── lib/              # LLMクライアント、SQLiteストア、ベクトル演算、サーキットブレーカー、フィーチャーフラグ
│   ├── memory/           # WorldMemory、認知パイプライン
│   ├── middleware/        # 認証、レートリミッター、セキュリティヘッダー、ロガー
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # プラグインインターフェースとマネージャー
│   ├── routes/           # APIルート (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # ルールエンジン (14ルール、シナジーマトリックス、技術依存関係)
│   ├── services/         # 55+サービス (ロールプレイエンジン、エージェント、経済、ワールド分離、クロスワールドバス)
│   ├── intelligence/     # グラフ分析、重複検出
│   ├── i18n/             # 言語パック (7言語)
│   ├── store/            # EntityStore (O(1) NameIndex)、WorldStore
│   └── utils/            # ロガー、ハッシュ、サニタイザー、テンプレートリゾルバー
├── mojo/kernels/         # C FFIカーネル (Zigでコンパイル)
├── public/               # Web UI (ターミナルスタイル)
├── worlds/               # ワールドデータ (SQLite DB、エンティティ、セッション)
├── conf/                 # 設定
└── tests/                # テストスイート
```

---

## API

### 認証

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/login` | ログインページ |
| POST | `/login` | 認証 |
| POST | `/logout` | ログアウト |

### チャットとロールプレイ

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| POST | `/api/chat/setup` | セッション初期化 |
| POST | `/api/chat/message` | メッセージ送信 |
| POST | `/api/chat/stream` | SSEストリーミング |
| GET | `/api/chat/session` | セッション状態 |
| GET | `/api/chat/history` | 会話履歴 |

### エンティティとグラフ

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/entity/:uid` | エンティティ詳細 |
| GET | `/api/neighbors/:uid` | 隣接ノード |
| GET | `/api/search?q=` | 検索 |
| GET | `/api/graph/summary` | グラフ統計 |

### エージェントとi18n

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/agents` | エージェント設定 |
| PUT | `/api/agents/:id` | エージェント更新 |
| PUT | `/api/agents/:id/prompts/:lang` | 言語別プロンプト |
| GET | `/api/i18n/translations/:lang/:page` | 翻訳 |

### ルールエンジン

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/rules` | 利用可能なルール |
| GET | `/api/rules/:id` | ルール詳細 |
| POST | `/api/rules/validate` | ルールJSON検証 |

### クロスワールド

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/cross-world/status` | クロスワールド状態 |
| POST | `/api/cross-world/enable` | 有効化 |
| POST | `/api/cross-world/disable` | 無効化 |
| GET | `/api/cross-world/portals` | ポータル一覧 |
| POST | `/api/cross-world/portals` | ポータル作成 |
| DELETE | `/api/cross-world/portals/:id` | ポータル削除 |
| GET | `/api/cross-world/events` | イベントログ |

### プラグイン

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/plugins` | 登録済みプラグイン |
| GET | `/api/plugins/:id` | プラグイン詳細 |
| GET | `/api/plugins/:id/capabilities` | プラグイン機能 |

### フィーチャーフラグ

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/feature-flags` | フィーチャーフラグ |
| PUT | `/api/feature-flags/:id` | フラグ更新 |

### WebSocket

| エンドポイント | 説明 |
|----------------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | リアルタイムロールプレイストリーミング |

---

## 例

### API

```bash
# ログイン
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# セッション初期化
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# メッセージ送信
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "剣を抜いて竜に立ち向かう"}'

# 利用可能なルール
curl -b cookies.txt "http://localhost:8000/api/rules"

# クロスワールドポータル作成
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

---

## 開発者向け

完全なドキュメント：[DEV.README.ja.md](docs/DEV.README.ja.md)

### 前提条件

- [Bun](https://bun.sh) v1.0+

### セットアップ

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

### コマンド

| コマンド | 説明 |
|----------|------|
| `bun run dev` | ホットリロード開発 |
| `bun run start` | 本番モード |
| `bun run lint` | 型チェック |
| `bun test` | テスト実行 |
| `bun run build` | ビルド |

---

## 最近の変更

### v0.22.1 — テーマシステム修正

- `theme-custom.css`を修正 — CSS変数の構文を修正（`var()`ではなく`--name: value`を使用）
- カスタムテーマに不足していた変数`--accent-subtle`、`--success-subtle`、`--warning-subtle`、`--interactive-subtle`を追加
- 5つのテーマ（ダーク、ライト、ターミナル、サイバーパンク、カスタム）がセレクターボタンで正しく動作するように

### v0.20.4 — ワールドグラフ修正 + 統計モーダル + 言語注入 + テーマ

- 死んだ`buildRelationships()`を修正 — 起動時にヒューリスティック関係を自動構築
- ワールド統計用の`GET /worlds/:name/detail`エンドポイントを追加
- エンティティリスト、ルール、キャラクター詳細を含む新しい統計モーダル
- 言語指示注入 — LLM応答がUI言語と一致（7言語）
- テーマシステム — 5つの組み込みテーマ（ダーク、ライト、ターミナル、サイバーパンク、カスタム）+ コンストラクター

### v0.20.1 — ルールエンジン バイナリ修正

- コンパイルされたBunバイナリでの`/api/rules`エンドポイントクラッシュを修正
- ルールディレクトリ解決のために`import.meta.dir`を`process.cwd()`に変更
- コンパイルされたバイナリでのENOENTエラー（`/$bunfs/root/../rules/social`）を解決
- 対象ファイル: `src/routes/rules.ts` と `src/rules/rules-engine.ts`

### v0.20.0 — アーキテクチャ改善

5ステップによる完全なアーキテクチャ改善：

**ステップ1-2:**
- NarrativeService分割 (Bootstrapper + Facade + Service)
- 統一エージェントモデル (インターフェース + ベースクラス)
- Event Sourcing (ドメインイベント + スナップショット)
- Circuit Breaker (LLM自動フェイルオーバー)
- エージェントレジストリ (4種のソースタイプ)
- 構造化ログ (Trace ID + Correlation ID)

**ステップ3:**
- ルールエンジン — 14の定義済みシステム
- シナジーマトリックス、技術依存関係、幸福度モディファイア
- ルールバリデーター、文化的ドリフトモデリング
- フィーチャーフラグ (A/Bテスト + 段階的展開)
- APIバージョニング (v1/v2)
- WorldStore — SQLite移行

**ステップ4:**
- マルチワールド分離 (リソース監視)
- クロスワールド通信 (ポータル + イベント)
- プラグインシステム (マネージャー + ライフサイクルフック)

**ステップ5:**
- ドキュメント更新

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — セキュリティ強化

- SQLiteセッション
- WebSocketトークン検証
- パストラバーサル保護
- CSRF保護
- Secureクッキー、CSP強化

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

---

## ライセンス

---

🔗 **プロジェクト:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
