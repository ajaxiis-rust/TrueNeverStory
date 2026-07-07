# TrueNeverStory v0.20.4

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
| **確率システム** | 戦闘、説得、隠密、romanceの決定論的結果 |
| **ロマンスと社交** | 関係管理、派閥、同盟、封建的階級、NPC対話 |
| **クエストシステム** | 動的クエスト生成、目標、報酬、チェーン、時間制限 |
| **インベントリと交易** | レアリティ、ステータス、装備、ゴールド、NPC取引 |
| **NPC経済** | 封建的階級 (10ランク)、税金、食料生産、家族制度、34アルケタイプ |
| **リアルタイムストリーミング** | WebSocket + SSEによるライブナラティブ配信 |
| **i18n (7言語)** | EN, RU, DE, FR, ES, JA, ZH |
| **パスワード認証** | HttpOnlyクッキー、CSRF保護 |
| **SQLite保存** | エンティティ、埋め込み、メモリ、プロンプト、翻訳 |

---

## サポートされているプラットフォーム

| プラットフォーム | 状態 | 備考 |
|------------------|:----:|------|
| Linux x86_64 | ✅ | フルサポート、FFIカーネル |
| Linux ARM64 | ✅ | フルサポート、FFIカーネル |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI via Zig |

---

## クイックスタート

**Bun、Node.js、その他のランタイムは不要です。** ダウンロードして実行するだけ。

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

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

### 3. 開く

**http://localhost:8000** にアクセス — パスワード: **`changeme`**

初回ログイン後、設定でパスワードを変更してください。

以上です。データベースのセットアップ、パッケージのインストール、設定ファイルの編集は一切不要です。

---

## LLMの設定

**設定**ページを開くか `.env` を編集：

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

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

vLLM、Anthropic、Google、およびすべてのOpenAI互換APIに対応。

---

## プロジェクト構成

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod検証済み環境設定
│   ├── lib/              # LLMクライアント、SQLiteストア、ベクトル演算
│   ├── memory/           # WorldMemory、認知パイプライン
│   ├── middleware/        # 認証、レートリミッター、セキュリティヘッダー
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # APIルート (chat, entities, agents, settings)
│   ├── services/         # 52サービス (ロールプレイエンジン、エージェント、経済)
│   ├── intelligence/     # グラフ分析、重複検出
│   ├── i18n/             # 言語パック (7言語)
│   ├── store/            # O(1) NameIndex付きEntityStore
│   └── utils/            # ロガー、ハッシュ、サニタイザー、テンプレート
├── mojo/kernels/         # C FFI計算カーネル (Zigでコンパイル)
├── public/               # Web UI (ターミナルスタイル)
├── worlds/               # ワールドデータ (SQLite DB、エンティティ、セッション)
├── conf/                 # 設定
└── tests/                # テストスイート
```

---

## API

### 認証

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/login` | ログインページ |
| POST | `/login` | 認証 |
| POST | `/logout` | セッションクリア |

### チャット＆ロールプレイ

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| POST | `/api/chat/setup` | セッション初期化 |
| POST | `/api/chat/message` | メッセージ送信 |
| POST | `/api/chat/stream` | SSEストリーミング |
| GET | `/api/chat/session` | セッション状態 |
| GET | `/api/chat/history` | 会話履歴 |

### エンティティ＆グラフ

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/entity/:uid` | エンティティ詳細 |
| GET | `/api/neighbors/:uid` | 隣接ノード取得 |
| GET | `/api/search?q=` | 名前またはセマンティック検索 |
| GET | `/api/graph/summary` | グラフ統計 |

### エージェント＆i18n

| メソッド | エンドポイント | 説明 |
|----------|---------------|------|
| GET | `/api/agents` | エージェント設定一覧 |
| PUT | `/api/agents/:id` | エージェント更新 |
| PUT | `/api/agents/:id/prompts/:lang` | 言語別プロンプト |
| GET | `/api/i18n/translations/:lang/:page` | 翻訳取得 |

### WebSocket

| エンドポイント | 説明 |
|---------------|------|
| `ws://host:8000/ws/roleplay/:sessionId` | リアルタイムロールプレイストリーミング |

---

## 例

```bash
# ログイン
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# セッション設定
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Aragorn", "role": "protagonist"}'

# メッセージ送信
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "剣を抜き、ドラ곤に向かっていく"}'
```

---

## 開発者向け

完全なアーキテクチャドキュメント、DIコンテナリファレンス、コントリビューションガイド: [DEV.README.ja.md](docs/DEV.README.ja.md)

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
| `bun run build` | バンドルビルド |

---

## バイナリビルド

Zigによるクロスコンパイル：

```bash
cd mojo/kernels
./build.sh native           # 現在のプラットフォーム
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # すべてのターゲット
```

詳細は [COMPILE.md](docs/COMPILE.md) を参照。GitHub Actionsがタグプッシュ時に自動ビルド。

---

## 最近の変更

### v0.15.0 — セキュリティ強化

- SQLite対応セッション (再起動後も維持)
- WebSocketトークン検証
- パストラバーサル保護
- ログインフォームのCSRF保護
- Secureクッキーフラグ、CSP強化
- エラーメッセージのサニタイズ

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — C FFIカーネル＆クロスコンパイル

- 5つの計算カーネルをMojoから純Cに移植
- 10プラットフォーム対応Zigクロスコンパイル
- バックグラウンド処理の一時停止/再開

---

## ライセンス

---

🔗 **プロジェクト:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
