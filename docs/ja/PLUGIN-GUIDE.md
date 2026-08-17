# プラグイン開発ガイド

このガイドでは、TrueNeverStoryのプラグインの作成方法を説明します。

## プラグインインターフェース

プラグインは`Plugin`インターフェースを実装する必要があります：

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // 一意の識別子
  name: "My Plugin",         // 人間が読める名前
  version: "1.0.0",          // セマンティックバージョン
  description: "Does stuff", // オプションの説明
  author: "Your Name",       // オプションの著者

  // このプラグインが提供するエージェント
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // このプラグインが提供するルート
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // このプラグインがサブスクライブするフック
  hooks: ["onTurnStart", "onWorldCreate"],

  // ライフサイクルコールバック
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## プラグインのライフサイクル

1. **登録:** `pluginManager.register(plugin)` — `onRegister`フックを呼び出す
2. **アクティブ:** プラグインのエージェントとルートが利用可能
3. **登録解除:** `pluginManager.unregister(pluginId)` — `onUnregister`フックを呼び出す

## 利用可能なフック

| フック | 発火タイミング |
|--------|--------------|
| `onTurnStart` | 各ターン処理の前 |
| `onTurnEnd` | 各ターン処理の後 |
| `onWorldCreate` | 新しいワールドが作成された時 |
| `onWorldDestroy` | ワールドが破棄された時 |
| `onEntityAdd` | 新しいエンティティが追加された時 |

## 例: Researcher Addon プラグイン

```typescript
import { Plugin } from "../plugins/plugin-interface";

export const researcherAddon: Plugin = {
  id: "researcher-addon",
  name: "Researcher Addon",
  version: "1.0.0",
  description: "Enhanced research capabilities",
  agents: [
    {
      id: "deep-researcher",
      name: "Deep Researcher",
      description: "Performs deep research with citations",
    },
  ],
  routes: [
    { path: "/research/deep", method: "POST" },
  ],
  hooks: ["onTurnStart"],
};
```

## プラグインの登録

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## APIによる管理

- `GET /api/plugins` — 全プラグインを一覧表示
- `GET /api/plugins/:id` — プラグインの詳細を取得
- `GET /api/plugins/:id/capabilities` — 機能を取得
- `GET /api/plugins/agents/all` — 全プラグインエージェントを取得
- `GET /api/plugins/routes/all` — 全プラグインルートを取得

## ベストプラクティス

1. **一意のID:** 説明的で一意のプラグインIDを使用（例: `my-org/my-plugin`）
2. **バージョン:** セマンティックバージョニングに従う（MAJOR.MINOR.PATCH）
3. **最小限のフック:** 必要なフックのみサブスクライブ
4. **クリーンアップ:** `onUnregister`を実装してリソースを解放
5. **エラー処理:** プラグインのエラーでホストをクラッシュさせない
