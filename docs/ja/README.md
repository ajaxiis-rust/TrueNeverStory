# TrueNeverStory

### 遊ぶだけで、自分の物語を書こう。

TrueNeverStoryはAI搭載のインタラクティブ・ナラティブ・エンジンです。**State-Firstアーキテクチャ**を採用しており、すべてのNPCは記憶し、すべての行動には決定論的な結果があり、物語は決して止まりません。キャラクターを演じ、生きている世界を探検し、あなたの選択が物語を形づくる様子を見守るか、世界を自由に発展させましょう。

TypeScript (Bun + Hono)とC FFIカーネルによるハイブリッド構成。

**[English](../../README.md) | [Русский](../ru/README.md) | [Deutsch](../de/README.md) | [Français](../fr/README.md) | [Español](../es/README.md) | [中文](../zh/README.md)**

---

## 概要

あなたは永続的に生き続ける世界でキャラクターを演じます。あなたの各行動は構造化された意図へと分解され、決定論的にシミュレートされ、専門化されたAIエージェントのパイプラインによって散文として返されます。エンジンの内部言語は英語で、翻訳は出力境界で行われるため、物語は常にあなたの言語で語られます。

- **State-First** — シミュレーションがテキストより先に実行されるため、結果は決定論的で再現可能です。
- **6つのエージェント、1人の語り手** — Dramaturg（原型）、Validator（事実）、Stylist（散文）、Actor（NPC）、Censor（文体）、Chronicler（記憶）。
- **コードとしての文学** — 聖書を物語の原型として、グーテンベルクを散文の文体として、Wikipediaを事実確認として、MCPツールで接続。

## 機能

| 領域 | 説明 |
|------|------|
| **State-Firstパイプライン** | 決定論的シミュレーション → 状態変更 → 制約付き散文 |
| **生きている世界** | O(1)ルックアップの知識グラフでつながるキャラクター、場所、派閥 |
| **記憶とRAG** | ハイブリッドFTS5 + 密ベクトル + RRF検索（BGE-M3）によるベクトル記憶 |
| **確率システム** | 戦闘・説得・隠密・恋愛の決定論的結果 |
| **NPC経済** | 封建的階級（10ランク）、税金、食料生産、家族システム |
| **ルールエンジン** | シナジーマトリックスを備えた14の社会・経済システム |
| **マルチワールド** | 世界間イベントとポータルを備えた隔離されたワールド |
| **リアルタイムストリーミング** | ハートビート進捗付きWebSocket + SSE |
| **i18n** | EN, RU, DE, FR, ES, JA, ZH |
| **プラグインシステム** | ライフサイクルフックとAPI |
| **フィーチャーフラグ** | 段階的ロールアウト、パーセンテージターゲティング |

## クイックスタート

**BunもNode.jsも、ランタイムは一切不要。** ダウンロードして実行するだけです。

### 1. ダウンロード

[GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest)から、お使いのプラットフォーム向けの最新リリースを取得してください：

| プラットフォーム | ファイル |
|------------------|----------|
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
# tns-windows-x64.zipを展開してから：
.\startgame.ps1
```

### 3. 開く

**http://localhost:8000** にアクセス — パスワード：**`changeme`**（初回ログイン後に設定で変更してください）。

以上です。データベース設定も、パッケージのインストールも、編集する設定ファイルも不要です。

## LLMの設定

**設定**ページを開くか、`.env`を編集します。Ollama、LM Studio、vLLM、OpenAI、Anthropic、Google、および任意のOpenAI互換APIで動作します。詳細は[HARDWARE.md](HARDWARE.md)と[PROVIDER-RATE-LIMITING.md](../en/PROVIDER-RATE-LIMITING.md)を参照してください。

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [ARCHITECTURE.md](../en/ARCHITECTURE.md) | システム設計、パイプライン、サービス |
| [API.md](API.md) | HTTPおよびWebSocketエンドポイント |
| [AGENTS.md](AGENTS.md) | エージェントリファレンス（Big Six） |
| [DEV.README.md](DEV.README.md) | 開発者ガイド — セットアップ、コマンド、DI |
| [COMPILE.md](../en/COMPILE.md) | バイナリビルドとクロスコンパイル |
| [CHANGELOG.md](../en/CHANGELOG.md) | リリース履歴 |
| [about.md](about.md) | ワールドルールと経済 |
| [MIGRATION.md](../en/MIGRATION.md) | バージョン移行ノート |
| [security-audit.md](../en/security-audit.md) | セキュリティ監査の結果 |

## ソースからビルド

[Bun](https://bun.sh) v1.0+が必要です。

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev        # http://localhost:8000
```

コマンド：`bun run dev`（ホットリロード）、`bun run start`（本番）、`bun run lint`（型チェック）、`bun test`（テストスイート）。バイナリリリースについては[COMPILE.md](../en/COMPILE.md)を参照してください。

## ライセンス

MIT
