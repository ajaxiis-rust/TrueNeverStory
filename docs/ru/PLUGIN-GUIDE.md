# Руководство по разработке плагинов

Это руководство объясняет, как создавать плагины для TrueNeverStory.

## Интерфейс плагина

Плагин должен реализовывать интерфейс `Plugin`:

```typescript
import { Plugin } from "../plugins/plugin-interface";

const myPlugin: Plugin = {
  id: "my-plugin",           // Уникальный идентификатор
  name: "My Plugin",         // Читаемое имя
  version: "1.0.0",          // Семантическая версия
  description: "Does stuff", // Опциональное описание
  author: "Your Name",       // Опциональный автор

  // Агенты, предоставляемые этим плагином
  agents: [
    {
      id: "my-agent",
      name: "My Agent",
      description: "An agent that does things",
      config: { temperature: 0.7 },
    },
  ],

  // Маршруты, предоставляемые этим плагином
  routes: [
    { path: "/my-endpoint", method: "GET" },
    { path: "/my-endpoint", method: "POST" },
  ],

  // Хуки, на которые подписывается этот плагин
  hooks: ["onTurnStart", "onWorldCreate"],

  // Колбэки жизненного цикла
  onRegister: () => {
    console.log("Plugin registered!");
  },

  onUnregister: () => {
    console.log("Plugin unregistered!");
  },
};
```

## Жизненный цикл плагина

1. **Регистрация:** `pluginManager.register(plugin)` — вызывает хук `onRegister`
2. **Активен:** Агенты и маршруты плагина доступны
3. **Отмена регистрации:** `pluginManager.unregister(pluginId)` — вызывает хук `onUnregister`

## Доступные хуки

| Хук | Когда срабатывает |
|-----|-------------------|
| `onTurnStart` | Перед обработкой каждого хода |
| `onTurnEnd` | После обработки каждого хода |
| `onWorldCreate` | При создании нового мира |
| `onWorldDestroy` | При уничтожении мира |
| `onEntityAdd` | При добавлении новой сущности |

## Пример: плагин дополнения исследователя

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

## Регистрация плагина

```typescript
import { pluginManager } from "../routes/plugins";
import { myPlugin } from "./my-plugin";

pluginManager.register(myPlugin);
```

## Управление через API

- `GET /api/plugins` — Список всех плагинов
- `GET /api/plugins/:id` — Детали плагина
- `GET /api/plugins/:id/capabilities` — Возможности
- `GET /api/plugins/agents/all` — Все агенты плагинов
- `GET /api/plugins/routes/all` — Все маршруты плагинов

## Лучшие практики

1. **Уникальные ID:** Используйте описательные, уникальные ID плагинов (например, `my-org/my-plugin`)
2. **Версия:** Следуйте семантическому версионированию (MAJOR.MINOR.PATCH)
3. **Минимум хуков:** Подписывайтесь только на нужные хуки
4. **Очистка:** Реализуйте `onUnregister` для освобождения ресурсов
5. **Обработка ошибок:** Ошибки плагина не должны крашить хост
