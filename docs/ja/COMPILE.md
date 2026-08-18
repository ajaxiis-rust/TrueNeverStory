# TrueNeverStory v0.33.0 — コンパイルガイド

## クイックスタート

```bash
# Current platform
./build.sh compile

# Specific target
./build.sh compile linux-x64
./build.sh compile linux-arm64
./build.sh compile macos-arm64
./build.sh compile windows-x64

# Interactive selection
./build.sh select

# All platforms
./build.sh cross
```

## サポート対象プラットフォーム

| プラットフォーム | TypeScript | Mojo (.so) | MCP | バックエンド | 備考 |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | フルサポート |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | フルサポート |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | TypeScript フォールバック |

## MCP — Model Context Protocol

MCP は、外部データソースへのクエリを実行するためのツールを LLM エージェントに提供します:

| ツール | データソース | 説明 |
|------------|----------------|----------|
| `search_verses` | Bible SQLite | テキスト、書、参照で聖句を検索 |
| `get_pattern` | Bible SQLite | アーキタイプ/ムード別のナラティブパターン |
| `get_archetype` | Bible SQLite | 名前によるアーキタイプ詳細 |
| `get_cross_refs` | Bible SQLite | 聖句間の相互参照 |
| `get_style_pattern` | Gutenberg SQLite | ムード/タグ別の文体パターン |
| `apply_style` | Gutenberg SQLite | テキストにスタイルを適用 |
| `verify_fact` | Wikipedia API | 事実的主張を検証 |
| `get_context` | Wikipedia API | トピック別の Wikipedia コンテキスト |
| `get_quest_templates` | Literary Compiler | アーキタイプ別のクエストテンプレート |
| `search_quest_templates` | Literary Compiler | テキストでクエストを検索 |
| `get_economic_phase` | Economic DB | 経済サイクルの現在のフェーズ |
| `calculate_price` | Economic DB | フェーズを考慮した価格計算 |
| `generate_dilemma` | Economic DB | 派閥のジレンマを生成 |
| `check_jubilee` | Economic DB | ジュビリーサイクルを確認 |

### MCP データベースのコンパイル

MCP サーバーはコンパイル済みの SQLite データベースを必要とします:

```bash
# Bible: BSB, LEB, NHEBME + cross-references
bun run scripts/run-bsb-compiler.ts

# Full pipeline (Bible + Literary Compiler)
bun run scripts/run-full-compiler-pipeline.ts

# Bible only
bun run scripts/run-full-bible-compiler.ts

# Cached pipeline (incremental)
bun run scripts/run-cached-pipeline.ts
```

### MCP データ構造

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Styles from Project Gutenberg
├── mcp/
│   ├── bible/            # Bible parser cache
│   └── gutenberg/        # Gutenberg parser cache
└── economic.db           # Economic data
```

### MCP の実行

MCP サーバーは、`bible.db` または `gutenberg.db` が見つかると自動的に起動します:

```bash
# Automatic start
./bun run src/index.ts

# Check MCP
curl http://localhost:8000/health  # → "status": "ok"
```

### Gutenberg ウェブカタログ

MCP コンソール (`/mcp.html`) を通じて、文章スタイルを改善するために Project Gutenberg からお気に入りの著者をダウンロードできます:

1. 「カタログ」タブを開く
2. 著者名またはトピックを入力
3. 閲覧、絞り込み、書籍の選択
4. ダウンロード — スタイルはスタイルストエージェント向けに自動的に抽出されます

詳細は **[MCP コンソールガイド](MCP-HELP.md)** (7 言語) を参照してください。

## 自動フォールバック

サーバーは Mojo の利用可否を自動的に検出します:

```
.so files present  → Backend: mojo       (fast, ~10-50x for vectors)
.so files absent   → Backend: typescript  (works, slower)
```

現在のバックエンドを確認:
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### Mojo なしで動作するもの

| コンポーネント | Mojo バックエンド | TypeScript フォールバック | 差 |
|-----------|:------------:|:-------------------:|---------|
| 確率 (戦闘、ロマンス) | Mojo FFI | TypeScript | ~2-5x |
| ベクトル類似度 | Mojo FFI | TypeScript | ~10-50x |
| ドット積 | Mojo FFI | TypeScript | ~5-10x |
| チャット / ロールプレイ | TypeScript | TypeScript | 0% |
| メモリシステム | TypeScript + Mojo | TypeScript のみ | 検索が遅い |
| クエスト / Director | TypeScript | TypeScript | 0% |
| MCP Bible/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipedia | HTTP | HTTP | 0% |

**結論:** Windows ビルドは完全に機能します。唯一の違いは計算性能です。

## ビルド構造

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone binary
│   ├── libtns_kernels.so       # Mojo: probabilities
│   ├── libtns_vectors.so       # Mojo: vector operations
│   ├── libtns_vector_full.so   # Mojo: 全次元ベクトル演算
│   ├── libtns_graph_ops.so     # Mojo: graph operations
│   ├── libtns_batch_ops.so     # Mojo: batch operations
│   └── .env                      # Configuration
├── linux-x64/
│   └── ...
├── macos-arm64/
│   └── ...
├── macos-x64/
│   └── ...
└── windows-x64/
    ├── tns-server.exe          # TypeScript only (fallback)
    └── .env
```

## ユーザーに必要なもの

1. お使いのプラットフォーム用のフォルダをダウンロード
2. `.env` を設定 (LLM エンドポイント、パスワード)
3. プロジェクトルートから `conf/` をコピー (または手動で作成)
4. 実行:

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**不要:** Bun、Node.js、Python、Mojo、コンパイラ。

MCP を動作させるには、さらにデータベースをコンパイルする必要があります (上記の MCP セクションを参照)。

## 埋め込みモデル (ローカルサーバー)

ベクトル検索と意味的類似度のために、埋め込みモデルを搭載した別の llama-server を実行できます:

```bash
# BGE M3 — multilingual (100+ languages, 8192 tokens)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 5002

# Qwen3 Embedding 0.6B — compact and fast
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 5002

# KaLM Embedding Gemma3 12B — maximum quality
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 5002
```

`.env` で以下を指定します:
```ini
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

> **重要:** 埋め込みモデルが正しく動作するには、`--embedding` と `--pooling mean` フラグが必要です。これらがないと llama-server は通常の LLM として動作し、ベクトルではなくテキストを生成します。

| モデル | サイズ | 言語 | コンテキスト | 推奨 |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | 最高の言語カバレッジ |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | サイズ/品質のバランス |
| Qwen3 Embedding 0.6B | ~639 MB | Multi | — | 最速 |
| Embedding Gemma 300M | ~329 MB | EN+ | — | 最小サイズ |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Multi | — | 最高品質 |

## プラットフォーム要件

| OS | 最小バージョン | アーキテクチャ | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64-bit) | x86_64 | ❌ | ✅ |

## Windows — 詳細

Windows ビルドは **TypeScript フォールバック** を通じて動作します:

- `tns-server.exe` — スタンドアロンバイナリ。インストールなしで動作
- Mojo の `.so` はコンパイルされません (Mojo は Windows/MSVC をサポートしていません)
- すべての計算は TypeScript で実行されます — 遅いですが、機能的には同一です
- MCP は完全に動作します (TypeScript)
- WSL2 は不要 — ネイティブの Windows 実行

### Windows の性能

ほとんどのシナリオでは差は無視できる程度です:
- チャットとロールプレイ — 同一 (TypeScript)
- 確率 — 差は無視できる程度 (<1ms)
- ベクトル検索 — 大量のデータでは遅い (>10K メモリ)
- MCP — 同一 (TypeScript + HTTP)

Windows で最大限の性能を得るには:
1. Linux 上の **外部サーバー**
2. **一般的なシナリオ** — 差は無視できる程度

## 手動コンパイル

### TypeScript (Bun)

```bash
# Current platform
bun build --compile --outfile dist/tns-server src/index.ts

# Windows (from Linux via cross-compilation)
bun build --compile \
  --compile-executable-path dist/.bun-cache/bun-windows-x64 \
  --outfile dist/windows-x64/tns-server.exe \
  src/index.ts
```

### Mojo (FFI 用の .so)

```bash
# Linux/macOS only (not Windows!)
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vector_full.so \
  mojo/kernels/vector_full.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.mojo
```

### クロスコンパイル

Mojo の `.so` ファイルは確実にはクロスコンパイルできません。**対象プラットフォーム上でビルドする**ことをお勧めします。

### Linux から Windows をビルド

```bash
# TypeScript + .env (no Mojo)
./build.sh compile windows-x64

# Result: dist/windows-x64/
#   tns-server.exe   — standalone binary
#   .env               — configuration
```

## デバッグ

```bash
# Check the backend
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
# → "mojo" or "typescript"

# Check that the binary works
./dist/linux-arm64/tns-server --help

# Check .so symbols
nm -D dist/linux-arm64/libtns_kernels.so | grep tns

# Check FFI from TypeScript
bun run -e "
  import { computeSuccessChance } from './src/lib/mojo-ffi';
  console.log(computeSuccessChance(0.8, 0.3, 0.5, 0.1));
"

# Check the binary's platform
file dist/linux-arm64/tns-server

# Check MCP (databases required)
bun run scripts/run-bsb-compiler.ts
curl http://localhost:8000/health
```

## Gutenberg パイプライン

### 前提条件
- `data/gutenberg/texts/` にダウンロードした .txt ファイル
- (オプション) メタデータ補強のための `data/mcp/gutenberg-catalog.db`

### テキストのインポート
```bash
bun run scripts/import-gutenberg-texts.ts
```
.txt ファイル + カタログから `data/gutenberg/classics.db` を作成します。

### 処理パイプライン
```bash
# Phase A only (rule-based, no LLM)
bun run scripts/process-gutenberg.ts --phase v1

# Phase B only (LLM-enriched)
bun run scripts/process-gutenberg.ts --phase v2

# Both phases
bun run scripts/process-gutenberg.ts --phase all
```

### コーパスの拡張
```bash
bun run scripts/expand-corpus.ts --authors "Dickens,Tolstoy" --target 3
bun run scripts/expand-corpus.ts --authors "Hemingway" --dry-run
```
