# Wikipedia RAG Enrichment

## 概要

TrueNeverStoryはWikipediaを使用して、ゲームワールドを現実世界の知識で充実させます。ワールド作成時、システムが自動的に関連トピックを調査し、RAG（Retrieval-Augmented Generation）インデックスを構築します。

## アーキテクチャ

1. **WikipediaResearcher** — リトライロジック付きでWikipedia APIから記事を取得
2. **WikiRAGBuilder** — 記事をチャンクに分割し、ベクトルインデックスを構築
3. **WorldCreationProgress** — SSE対応で進捗を追跡
4. **IdleResearchScheduler** — プレイヤーのアイドル時間中にRAGを充実させる

## 使用方法

### 自動調査

ワールド作成時、Wikipedia調査が自動的に実行されます：

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### 手動調査

UIから調査を開始：
- "🌍 Исследовать Wikipedia" ボタンをクリック
- SSEエンドポイントで進捗を監視
- 必要に応じて一時停止/再開

### CLI進捗

ワールド作成中にターミナルに進捗が表示されます：

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## APIエンドポイント

- `GET /api/wiki/research/:worldId/progress` — SSE進捗ストリーム
- `POST /api/wiki/research/:worldId` — 調査を開始
- `POST /api/wiki/research/:worldId/pause` — 調査を一時停止
- `POST /api/wiki/research/:worldId/resume` — 調査を再開
- `GET /api/wiki/research/:worldId/status` — 現在のステータスを取得

## 設定

### リトライポリシー
- 記事ごとに5回の試行
- 試行ごとに2分のタイムアウト
- 指数バックオフ: 5s → 10s → 20s → 40s → 80s

### アイドル時の充実
- 1時間の非活動後にトリガー
- セッションごとに最大10トピックを処理
- 設定可能なしきい値

## MCP統合

Wikipedia検索ツールはMCP経由で利用可能です：

```typescript
import { WikiSearchTool } from './mcp/wiki/wiki-search';

const tool = new WikiSearchTool();
tool.registerRAGBuilder(worldId, ragBuilder);

const results = await tool.search({
  query: 'medieval knighthood',
  worldId: 'my-world',
  limit: 10,
});
```

## ファイル構造

```
src/services/
├── wikipedia-researcher.ts      # Wikipedia APIクライアント
├── wiki-rag-builder.ts          # 記事のチャンク分割
├── idle-research-scheduler.ts   # バックグラウンド充実
└── world-creation-progress.ts   # 進捗追跡

src/mcp/wiki/
├── index.ts                     # モジュールエクスポート
└── wiki-search.ts               # MCP検索ツール

src/routes/
└── wiki-research.ts             # SSEエンドポイント

src/utils/
└── progress-bar.ts              # CLI進捗表示
```

## エラー処理

- Wikipedia APIエラーはログに記録されリトライされます
- 失敗した記事はスキップされ、調査は継続されます
- グレースフルデグラデーション：Wikipediaが利用不可でもワールドは作成されます
- すべてのエラーは進捗マネージャーで追跡されます
