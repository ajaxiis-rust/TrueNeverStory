# Wikipedia RAG Enrichment

## Обзор

TrueNeverStory использует Wikipedia для обогащения игровых миров реальными знаниями. При создании мира система автоматически исследует релевантные темы и строит RAG-индекс (Retrieval-Augmented Generation).

## Архитектура

1. **WikipediaResearcher** — получает статьи из Wikipedia API с логикой повторных попыток
2. **WikiRAGBuilder** — разбивает статьи на фрагменты и строит векторный индекс
3. **WorldCreationProgress** — отслеживает прогресс с поддержкой SSE
4. **IdleResearchScheduler** — обогащает RAG во время простоя игрока

## Использование

### Автоматическое исследование

При создании мира исследование Wikipedia происходит автоматически:

```typescript
import { WorldBuilder } from './services/world-builder';

const worldBuilder = new WorldBuilder(deps);
worldBuilder.enableWikipediaResearch(worldId);
await worldBuilder.createWorld();
await worldBuilder.enrichWithWikipedia();
```

### Ручное исследование

Запустите исследование из интерфейса:
- Нажмите кнопку "🌍 Исследовать Wikipedia"
- Следите за прогрессом через SSE-эндпоинт
- Приостанавливайте/возобновляйте по необходимости

### Прогресс в CLI

Прогресс отображается в терминале при создании мира:

```
[Stage 2/3: Wikipedia Research] Researching medieval knighthood...
  [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 50% (15/30)
  → Current: Knight
```

## API эндпоинты

- `GET /api/wiki/research/:worldId/progress` — SSE-поток прогресса
- `POST /api/wiki/research/:worldId` — начать исследование
- `POST /api/wiki/research/:worldId/pause` — приостановить исследование
- `POST /api/wiki/research/:worldId/resume` — возобновить исследование
- `GET /api/wiki/research/:worldId/status` — получить текущий статус

## Конфигурация

### Политика повторных попыток
- 5 попыток на статью
- 2 минуты таймаут на попытку
- Экспоненциальная задержка: 5с → 10с → 20с → 40с → 80с

### Обогащение в простое
- Срабатывает после 1 часа неактивности
- Обрабатывает до 10 тем за сессию
- Настраиваемые пороги

## Интеграция с MCP

Инструмент поиска Wikipedia доступен через MCP:

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

## Структура файлов

```
src/services/
├── wikipedia-researcher.ts      # Клиент Wikipedia API
├── wiki-rag-builder.ts          # Разбиение статей на фрагменты
├── idle-research-scheduler.ts   # Обогащение в фоне
└── world-creation-progress.ts   # Отслеживание прогресса

src/mcp/wiki/
├── index.ts                     # Экспорты модуля
└── wiki-search.ts               # Инструмент поиска MCP

src/routes/
└── wiki-research.ts             # SSE-эндпоинты

src/utils/
└── progress-bar.ts              # Отображение прогресса в CLI
```

## Обработка ошибок

- Ошибки Wikipedia API логируются и повторяются
- Неудачные статьи пропускаются, исследование продолжается
- Graceful degradation: мир создаётся даже если Wikipedia недоступна
- Все ошибки отслеживаются в менеджере прогресса
