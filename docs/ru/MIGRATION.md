# Руководство по миграции: JSON в SQLite

Это руководство описывает миграцию данных мира из JSON-файлов в SQLite, а также схему хранения, используемую TrueNeverStory.

## Обзор

TrueNeverStory хранит данные мира в **SQLite** через класс `WorldStore` (`src/store/world-store.ts`). Файл базы данных — `tns.db`, создаётся внутри директории мира (`<worldPath>/tns.db`) с включённым режимом журналирования WAL.

Исходные JSON-файлы остаются в директории мира в качестве источника миграции и никогда не удаляются — они служат запасным вариантом и исторической записью.

## Миграция v0.33.4: Литературный компилятор и экономические модели

Релиз v0.33.4 добавляет Литературный компилятор и Экономические модели. Миграция не требуется — это аддитивные возможности, которые расширяют существующий конвейер State-First.

## Миграция v0.33.4: Конвейер State-First

### Что изменилось

Релиз v0.33.4 вводит архитектуру конвейера, ориентированного на состояние (state-first). Теперь сосуществуют две системы агентов:

1. **The Big Six (AgentV2)** — конвейер нарративной прозы (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`), зарегистрированный в `AgentRegistryV2`.
2. **Сконфигурированные агенты (`DEFAULT_AGENTS`)** — агенты, управляемые конфигурацией, в `src/services/agent-config.ts` (`director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`), лежащие в основе UI настроек/провайдеров и нескольких подсистем.

**Старый конвейер:**
```
User Intent → Agent Selection → Agent Execution → Response
```

**Новый конвейер:**
```
User Intent → Simulation → Pattern Selection (Dramaturg) → Fact Check (Validator) → Style Render (Stylist) → NPC Dialogue (Actor) → Linting (Censor) → Memory Update (Chronicler)
```

**Удалённые агенты:**

| Удалён | Заменён на |
|---------|-------------|
| `narrator`, `scene` | `stylist` (генерация прозы) |
| `historian` | `validator` (проверка фактов) |
| `cartographer`, `lorekeeper`, `merchant`, `quest-giver` | (удалены) |
| `npc` | `actor` (диалоги NPC) |

`villain`, `social-sim`, `researcher` и `director` остаются доступны как сконфигурированные агенты. `crafter` остаётся как подсистема крафта.

**Обратная совместимость:** Удалённые ID агентов (`@narrator`, `@npc`, `@scene`, `@director`) больше не существуют и не разрешаются. Чат `@mentions` маршрутизируется только к сконфигурированным обработчикам (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`).

### Интеграция MCP

v0.33.4 вводит инструменты Model Context Protocol (MCP) для доступа к внешним знаниям:

| MCP-сервер | Инструменты | Назначение |
|------------|-------|---------|
| Bible Parser | `search_verses`, `get_pattern`, `get_archetype` | Нарративные паттерны из библейских текстов |
| Gutenberg Parser | `get_style_pattern`, `apply_style` | Стилистические паттерны из литературы |
| Wikipedia Tools | `verify_fact`, `get_context` | Историческая проверка фактов |

**Конфигурация:**

```typescript
// In conf/settings.json
{
  "mcpServers": {
    "bible": { "enabled": true, "dbPath": "./data/bible.db" },
    "gutenberg": { "enabled": true, "dbPath": "./data/styles.db" },
    "wikipedia": { "enabled": true }
  }
}
```

### Новые зависимости

| Зависимость | Статус | Назначение |
|------------|--------|---------|
| Zod | Уже в проекте | Валидация схем |
| Mojo FFI | Уже в проекте | Вычислительные ядра |
| TranslationService | Без внешних зависимостей | Переводы UI |

### Критические изменения

- **Внутренний поток RoleplayEngine переписан** — конвейер теперь следует Simulation → Pattern → Style → Dialogue → Lint → Memory
- **AgentV2.process() заменяет generateResponse()** — Новая сигнатура: `process(intent, simulation, context, pattern?)`
- **createRoleplayEngine() требует новые зависимости** — ссылки на MCP-серверы, AgentRegistryV2, EventBus
- **`getLanguageInstruction()` удалён** — обработка языка перемещена в `TranslationService` на выходной границе

---

## Схема хранения

### База данных SQLite

Конструктор `WorldStore` открывает (и создаёт, если отсутствует) файл `tns.db` внутри директории мира:

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");
// Opens worlds/my-world/tns.db with:
//   PRAGMA journal_mode = WAL
//   PRAGMA synchronous = NORMAL
```

**Таблицы, создаваемые при инициализации (`CREATE TABLE IF NOT EXISTS`):**

| Таблица | Назначение |
|-------|---------|
| `quests` | Данные квестов (`id`, `title`, `description`, `giver`, `objectives`, `status`, временные метки) |
| `npc_memories` | Краткосрочная и долгосрочная память NPC, индексируется по `npc_uid` + `memory_type` |
| `story_arcs` | Данные сюжетных арок планировщика (один JSON-блоб на строку) |
| `world_frame` | Пары ключ/значение каркаса мира |
| `director_state` | Пары ключ/значение состояния Director |
| `villains` | Данные злодеев (JSON-блоб на строку) |

### JSON-файлы (источник миграции)

Исходные JSON-файлы находятся в той же директории мира и читаются как источник миграции. Они никогда не удаляются после миграции:

| JSON-файл | Мигрируется в таблицу |
|-----------|---------------------|
| `worlds/{name}/quests.json` | `quests` |
| `worlds/{name}/npc_profiles.json` | `npc_memories` |
| `worlds/{name}/world_frame.json` | `world_frame` |
| `worlds/{name}/story_planner.json` | `story_arcs` |
| `worlds/{name}/director_state.json` | `director_state` |
| `worlds/{name}/villains.json` | `villains` |

## Процесс миграции

### Запуск миграции

Миграция запускается по запросу через HTTP-эндпоинт (автоматической миграции при запуске нет):

```typescript
const store = new WorldStore("worlds/my-world");

const result = await store.migrate();
// result = { migrated: ["quests", "npc_profiles", ...], errors: [] }

store.close();
```

Метод `migrate()` мигрирует каждый источник данных независимо внутри собственного блока `try/catch`, поэтому сбой в одном источнике не прерывает остальные. Каждый успешно мигрированный источник добавляется в `migrated`; любая ошибка записывается в `errors`.

**Мигрируемые источники (по порядку):** `quests`, `npc_profiles`, `world_frame`, `story_planner`, `director_state`, `villains`.

Если исходный JSON-файл отсутствует или не поддаётся разбору, этот источник молча пропускается (вспомогательная функция чтения возвращает `null`).

### Миграция устаревших путей

При запуске (`src/index.ts`), если директория `WORLDS_ROOT` не существует, она создаётся, а устаревшая директория `WORLD_DB_PATH` (например, `world_db/`) переименовывается в `worlds/default/`:

```
world_db/  →  worlds/default/
```

## API WorldStore

```typescript
import { WorldStore } from "../store/world-store";

const store = new WorldStore("worlds/my-world");

// Migration
const result = await store.migrate();           // { migrated: string[], errors: string[] }

// Quest CRUD
const quests = store.getQuests();               // QuestData[]
const quest = store.getQuest(id);               // QuestData | null
store.upsertQuest(quest);                       // insert or replace
const removed = store.deleteQuest(id);          // boolean

// NPC memories
const memories = store.getNPCMemories(npcUid);              // all memory types
const short = store.getNPCMemories(npcUid, "short_term");   // filtered by type
store.addNPCMemory(npcUid, memory);                         // default type "short_term"

// World frame
const frame = store.getWorldFrame();            // Record<string, string>
store.setWorldFrame(key, value);

// Stats
const stats = store.getStats();                 // { quests, memories, worldFrame }

store.close();
```

## API-эндпоинты

Роутер (`src/routes/world-store.ts`) монтируется под `/api`. Каждый эндпоинт принимает необязательный query-параметр `?world=` для указания конкретного мира (по умолчанию — активный мир):

| Метод | Путь | Описание |
|--------|------|-------------|
| `POST` | `/api/world-store/migrate` | Миграция JSON-файлов в SQLite; возвращает `{ status, world, migrated, errors }` |
| `GET` | `/api/world-store/stats` | Возвращает `{ world, stats }` (количество квестов, записей памяти, ключей каркаса мира) |
| `GET` | `/api/world-store/quests` | Список квестов из SQLite |
| `GET` | `/api/world-store/npc-memories/:uid` | Память NPC (`?type=short_term\|long_term_episodic`) |
| `GET` | `/api/world-store/frame` | Пары ключ/значение каркаса мира |

## Откат

Если миграция завершилась ошибкой или вам нужно откатиться:

1. Данные SQLite изолированы в `worlds/{name}/tns.db`
2. Исходные JSON-файлы остаются в `worlds/{name}/`
3. Удалите `worlds/{name}/tns.db`, чтобы вернуться к состоянию только с JSON
4. Повторно выполните `POST /api/world-store/migrate` для повторной миграции из JSON

## Устранение неполадок

### Ошибка "Table already exists"

Это нормально — таблицы создаются с `IF NOT EXISTS`.

### Отсутствуют данные после миграции

Проверьте, что исходный JSON-файл существует в директории мира и является валидным JSON. Не поддающиеся разбору файлы пропускаются молча и сообщаются только если разбор бросает исключение — для деталей проверьте массив `errors` в результате миграции.

### Производительность

- Режим WAL SQLite включён по умолчанию в `WorldStore`
- `PRAGMA synchronous = NORMAL` установлен для баланса долговечности и скорости
- Периодически выполняйте `PRAGMA optimize` на больших базах данных
