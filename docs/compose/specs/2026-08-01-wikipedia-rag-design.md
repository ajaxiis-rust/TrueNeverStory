# [S1] Wikipedia RAG Enrichment — Design Specification

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/wikipedia-rag.md)

## [S2] Problem

TrueNeverStory генерирует миры через LLM, но lacks real-world factual depth. Агенты работают только с тем, что сгенерировал LLM — нет исторических дат, географических деталей, реальных правителей, катастроф. Пользователь хочет рыцарский мир — агент не может дать точные детали о средневековой Англии.

**Пример сценария:** Пользователь хочет мир рыцарей. Литературная канва — Айвенго, Квентин Дорвард, Янки из Коннектикута. Но без Wikipedia агент не знает:
- Реальных замков и их расположения
- Конкретных правителей и их характеров
- Быта, оружия, ремёсел эпохи
- Катастроф (чума, пожары, землетрясения)

## [S3] Solution Overview

### Два режима исследования

1. **Active Research** (при создании мира) — максимальный парсинг всех тематик
2. **Idle Enrichment** (простой >1 часа) — агент добирает детали по своей теме

### Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    World Creation Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   LLM    │───→│  Wikipedia   │───→│   RAG Builder    │  │
│  │  (мир)   │    │  Researcher  │    │  (векторный индекс)│  │
│  └──────────┘    └──────┬───────┘    └──────────────────┘  │
│                         │                                   │
│                         ▼                                   │
│                  ┌──────────────┐                           │
│                  │ Wikipedia API│                           │
│                  │  (MediaWiki) │                           │
│                  └──────────────┘                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Progress: [▓▓▓▓▓▓▓▓░░░░░░░░░░░░] Stage 2/3               │
│  "Исследую географию средневековой Англии..."               │
└─────────────────────────────────────────────────────────────┘
```

## [S4] Components

### 4.1 WikipediaResearcher

**Файл:** `src/services/wikipedia-researcher.ts`

**Ответственность:** Обёртка над MediaWiki API

**Методы:**
```typescript
class WikipediaResearcher {
  // Поиск статей по ключевым словам
  async search(query: string, limit?: number): Promise<WikiSearchResult[]>

  // Получение полной статьи
  async getArticle(title: string): Promise<WikiArticle>

  // Получение статей по категории
  async getCategoryMembers(category: string, depth?: number): Promise<string[]>

  // Получение связанных статей (по ссылкам)
  async getRelatedArticles(title: string, depth?: number): Promise<string[]>
}
```

**API endpoints:**
- `action=query&list=search` — поиск
- `action=parse&page={title}` — парсинг статьи
- `action=query&list=categorymembers` — статьи в категории
- `action=query&prop=links` — ссылки из статьи

### 4.2 WikiRAGBuilder

**Файл:** `src/services/wiki-rag-builder.ts`

**Ответственность:** Парсинг статей → чанки → векторный индекс

**Пайплайн:**
1. Получает HTML/wikitext от WikipediaResearcher
2. Очищает от навигации, таблиц, «See also»
3. Разбивает на чанки ~500 токенов с overlap 50 токенов
4. Векторизует через embedding model
5. Сохраняет в SQLite + FAISS

**Чанкинг:**
- Приоритет первых 3-5 секций статьи
- Сохраняем заголовки секций как метаданные
- Инфобоксы парсим отдельно как структурированные данные

### 4.3 IdleResearchScheduler

**Файл:** `src/services/idle-research-scheduler.ts`

**Ответственность:** Запуск исследования при простое игрока

**Логика:**
- Таймер: если нет сообщений от игрока >1 часа
- Проверяет, есть ли недоисследованные темы
- Запускает WikipediaResearcher для этих тем
- Обновляет RAG

### 4.4 WorldCreationProgress

**Файл:** `src/services/world-creation-progress.ts`

**Ответственность:** Менеджер прогресса для UI

**Интерфейс:**
```typescript
interface WorldCreationProgress {
  stage: 'generating' | 'researching' | 'building_rag';
  current: number;
  total: number;
  message: string;
  currentArticle?: string;
  errors: string[];
  isPaused: boolean;
}

class WorldCreationProgressManager {
  // SSE endpoint для UI
  subscribe(worldId: string, callback: (progress: WorldCreationProgress) => void): void

  // CLI прогресс
  logToCLI(progress: WorldCreationProgress): void

  // Пауза/продолжение
  pause(worldId: string): void
  resume(worldId: string): void
}
```

### 4.5 MCP Wiki Resource

**Файл:** `src/mcp/wiki/` (новая директория)

**Регистрация в MCP сервере:**
- Ресурс: `wiki://{worldId}/search?q={query}`
- Ресурс: `wiki://{worldId}/article/{title}`
- Tool: `wiki_search` — поиск по wiki-rag
- Tool: `wiki_get_article` — получение статьи из кеша

## [S5] Data Flow

### 5.1 Создание мира

```
1. Пользователь: "Хочу мир рыцарей"
2. LLM генерирует мир (существующий код)
3. WorldBuilder вызывает WikipediaResearcher:
   - Извлекает ключевые слова из описания мира
   - Формирует поисковые запросы: "medieval knighthood", "castles England", etc.
4. WikipediaResearcher скачивает статьи (параллельно, 5 за раз)
5. WikiRAGBuilder парсит и создаёт чанки
6. Чанки векторизуются и сохраняются в wiki-rag
7. Прогресс-бар обновляется на каждом этапе
8. Мир готов с обогащённой базой знаний
```

### 5.2 Idle Enrichment

```
1. Нет сообщений от игрока >1 часа
2. IdleResearchScheduler запускается
3. Проверяет: какие темы мира ещё не исследованы?
4. Запускает WikipediaResearcher для этих тем
5. WikiRAGBuilder обновляет RAG
6. Следующий ответ агента использует новые знания
```

### 5.3 Запуск из чата

```
1. Пользователь нажимает [🌍 Исследовать Wikipedia]
2. Frontend отправляет SSE запрос на /api/wiki/research/{worldId}
3. WorldCreationProgressManager начинает исследование
4. Прогресс отображается в UI в реальном времени
5. Пользователь может нажать [⏸ Пауза] — процесс приостанавливается
6. [▶ Продолжить] — процесс возобновляется
```

## [S6] Retry Policy

**Настройки:**
- Максимум попыток: 5
- Таймаут на попытку: 2 минуты (120 секунд)
- Задержка между попытками: экспоненциальная (5s → 10s → 20s → 40s → 80s)
- Ошибка загрузки статьи → логируем, пропускаем, продолжаем
- Wikipedia недоступен → graceful degradation (мир создаётся без Wikipedia)

**Логирование:**
```
[WARN] Wikipedia API timeout for "Medieval_architecture" (attempt 3/5)
[ERROR] Failed to fetch "Castles_in_England" after 5 attempts, skipping
[INFO] Wikipedia research complete: 28/30 articles fetched
```

## [S7] RAG Storage

### Отдельный wiki-rag индекс

**SQLite таблицы:**
```sql
CREATE TABLE wiki_articles (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  categories TEXT,  -- JSON array
  world_id TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wiki_chunks (
  id INTEGER PRIMARY KEY,
  article_id INTEGER REFERENCES wiki_articles(id),
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER,
  section_title TEXT,
  metadata TEXT,  -- JSON: {source, article, section, categories, world_id}
  embedding BLOB  -- FAISS vector
);
```

**FAISS индекс:**
- Файл: `worlds/{worldId}/wiki-rag.faiss`
- Привязка к world_id — каждый мир изолирован

## [S8] Progress Bar

### CLI прогресс (для startgame.sh)

```
[Stage 1/3] Генерация мира...           [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100%
[Stage 2/3] Wikipedia исследование...   [▓▓▓▓▓▓▓▓░░░░░░░░]  50%
  → Загружено: 12/30 статей
  → Текущая: "Medieval_architecture"
  → Ошибки: 1 (пропущено: "Castles_in_England")
[Stage 3/3] Создание RAG...             [░░░░░░░░░░░░░░░░]   0%
```

### Web UI (SSE)

**Endpoint:** `GET /api/wiki/research/{worldId}/progress`

**Events:**
```typescript
// Обновление прогресса
event: progress
data: {
  "stage": "researching",
  "current": 12,
  "total": 30,
  "message": "Исследую географию средневековой Англии...",
  "currentArticle": "Medieval_architecture",
  "errors": ["Failed to fetch Castles_in_England"],
  "isPaused": false
}

// Исследование завершено
event: complete
data: {
  "stage": "complete",
  "articlesProcessed": 28,
  "chunksCreated": 156,
  "errors": 2
}
```

## [S9] Кнопки в чате

### UI элементы

```html
<button id="wiki-research">🌍 Исследовать Wikipedia</button>
<button id="wiki-pause" disabled>⏸ Пауза</button>
<button id="wiki-resume" disabled>▶ Продолжить</button>
```

### API endpoints

```
POST /api/wiki/research/{worldId}        — запуск исследования
POST /api/wiki/research/{worldId}/pause  — пауза
POST /api/wiki/research/{worldId}/resume — продолжение
GET  /api/wiki/research/{worldId}/status — текущий статус
```

## [S10] Error Handling

**Принцип:** Graceful degradation — мир создаётся даже если Wikipedia недоступен.

**Сценарии:**
1. Wikipedia API timeout → retry 5 раз, потом пропускаем статью
2. Wikipedia API полностью недоступен → логируем ошибку, мир создаётся без Wikipedia
3. Ошибка парсинга статьи → пропускаем статью, продолжаем
4. Ошибка векторизации → пропускаем чанк, продолжаем
5. Нет свободного места на диске → логируем, останавливаем исследование

**Логирование:**
- Все ошибки логируются с контекстом (статья, попытка, причина)
- Итоговый отчёт: сколько статей обработано, сколько пропущено

## [S11] File Structure

```
src/services/
├── wikipedia-researcher.ts      # Обёртка над MediaWiki API
├── wiki-rag-builder.ts          # Парсинг → чанки → векторы
├── idle-research-scheduler.ts   # Триггер по простою
└── world-creation-progress.ts   # Менеджер прогресса

src/mcp/wiki/
├── index.ts                     # MCP ресурс
├── wiki-search.ts               # Tool: поиск по wiki-rag
└── wiki-article.ts              # Tool: получение статьи

scripts/
└── download-wiki.ts             # CLI скрипт для ручного запуска

worlds/{worldId}/
├── wiki-rag.faiss               # Векторный индекс
└── wiki.db                      # SQLite с метаданными
```

## [S12] Integration Points

### world-builder.ts

```typescript
// После генерации мира
const wikiResearcher = new WikipediaResearcher();
const ragBuilder = new WikiRAGBuilder(worldId);
const progress = new WorldCreationProgressManager(worldId);

// Извлекаем ключевые слова из описания мира
const keywords = extractKeywords(worldDescription);

// Запускаем исследование
await wikiResearcher.researchAndBuild(keywords, ragBuilder, progress);
```

### roleplay-engine.ts

```typescript
// Проверка idle
const idleScheduler = new IdleResearchScheduler(worldId);
idleScheduler.start(); // Запускает таймер на 1 час
```

### MCP сервер

```typescript
// Регистрация wiki ресурса
server.addResource('wiki://{worldId}/search', wikiSearchHandler);
server.addTool('wiki_search', wikiSearchTool);
```

## [S13] Dependencies

**Новые зависимости:**
- `node-fetch` или встроенный `fetch` — HTTP запросы к Wikipedia API
- `cheerio` или `node-html-parser` — парсинг HTML
- `faiss-node` — уже есть в проекте

**Существующие зависимости:**
- `better-sqlite3` — уже есть
- `faiss-index` — уже есть в `src/memory/faiss-index.ts`

## [S14] Testing Strategy

**Unit тесты:**
- WikipediaResearcher: мокаем fetch, проверяем парсинг ответов
- WikiRAGBuilder: проверяем чанкинг и векторизацию
- IdleResearchScheduler: проверяем таймер и триггеры

**Интеграционные тесты:**
- Полный пайплайн: мир → Wikipedia → RAG
- Retry логика: мокаем таймауты, проверяем retry
- Пауза/продолжение: проверяем состояние

**E2E тесты:**
- CLI: запуск download-wiki.ts с реальным API
- Web: проверка SSE events

## [S15] Success Criteria

1. Мир создаётся с обогащённой базой знаний из Wikipedia
2. Прогресс-бар показывает текущий этап в реальном времени
3. Пользователь может паузить/продолжить исследование из чата
4. Idle enrichment работает при простое >1 часа
5. Ошибки Wikipedia не блокируют создание мира
6. Retry логика: 5 попыток, 2 минуты таймаут
7. Wiki-rag доступен через MCP для всех агентов
