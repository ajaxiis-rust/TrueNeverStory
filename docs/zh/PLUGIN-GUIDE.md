# 插件开发指南

本指南介绍如何为 TrueNeverStory 创建插件。

## 插件接口

插件必须实现 `Plugin` 接口：

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // 唯一标识符
  name: "My Plugin",         // 可读名称
  version: "1.0.0",          // 语义化版本
  description: "Does stuff", // 可选描述
  author: "Your Name",       // 可选作者

  // 此插件提供的代理
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // 此插件提供的路由
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // 此插件订阅的钩子
  hooks: ["onTurnStart", "onWorldCreate"],

  // 生命周期回调
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## 插件生命周期

1. **注册:** `pluginManager.register(plugin)` — 调用 `onRegister` 钩子
2. **激活:** 插件的代理和路由可用
3. **注销:** `pluginManager.unregister(pluginId)` — 调用 `onUnregister` 钩子

## 可用钩子

| 钩子 | 触发时机 |
|------|---------|
| `onTurnStart` | 每次回合处理之前 |
| `onTurnEnd` | 每次回合处理之后 |
| `onWorldCreate` | 创建新世界时 |
| `onWorldDestroy` | 销毁世界时 |
| `onEntityAdd` | 添加新实体时 |

## 示例：Researcher Addon 插件

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

## 注册插件

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## API 管理

- `GET /api/plugins` — 列出所有插件
- `GET /api/plugins/:id` — 获取插件详情
- `GET /api/plugins/:id/capabilities` — 获取功能
- `GET /api/plugins/agents/all` — 获取所有插件代理
- `GET /api/plugins/routes/all` — 获取所有插件路由

## 最佳实践

1. **唯一 ID:** 使用描述性、唯一的插件 ID（例如 `my-org/my-plugin`）
2. **版本:** 遵循语义化版本（MAJOR.MINOR.PATCH）
3. **最小钩子:** 仅订阅需要的钩子
4. **清理:** 实现 `onUnregister` 以释放资源
5. **错误处理:** 插件错误不应导致宿主崩溃
