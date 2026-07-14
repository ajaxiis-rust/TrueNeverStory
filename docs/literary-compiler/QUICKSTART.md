# Literary Compiler: Быстрый старт

## Установка

```bash
# Literary Compiler уже встроен в TNS
# Дополнительные зависимости не требуются
```

## Быстрое использование

### 1. Компиляция библейских данных

```bash
# Создать директорию для источников
mkdir -p sources/bible

# Скопировать библейский SQLite файл
cp /path/to/bible.db sources/bible/

# Запустить компиляцию
litcomp compile --input sources/bible/ --output data/compiled/ --type bible
```

### 2. Использование в коде

```typescript
import { LiteraryCompilerDB } from './src/mcp/literary-compiler/schema';
import { LiteraryCompilerMCPTools } from './src/mcp/tools/literary-compiler';

// Открыть базу
const db = new LiteraryCompilerDB('./data/compiled/literary.db');
const tools = new LiteraryCompilerMCPTools(db);

// Запросить шаблоны для лидера
const result = await tools.getQuestTemplates({
  position: 'leader',
  limit: 5,
});

console.log(result.templates);
```

### 3. Парсинг текста

```typescript
import { DramaturgicPass } from './src/mcp/literary-compiler/dramaturgic-pass';

const db = new LiteraryCompilerDB('./data/literary.db');
const pass = new DramaturgicPass(db);

// Парсинг главы
const result = pass.parse({
  text: `
    # Exodus 14
    ## Verse 1
    And the LORD spake unto Moses, saying,
    ## Verse 21
    And Moses stretched out his hand over the sea.
  `,
  source_book: 'Exodus',
  source_chapter: 14,
});

console.log(result.templates[0].archetype); // 'escape'
```

## Основные команды

| Команда | Описание |
|---------|----------|
| `litcomp compile` | Компиляция источников |
| `litcomp stats` | Статистика базы |
| `litcomp validate` | Валидация шаблонов |
| `litcomp export` | Экспорт в Markdown |

## Примеры шаблонов

### Escape (Побег)

```markdown
---
uid: "Exodus.14"
archetype: "escape"
applicable_positions: ["leader", "follower"]
variables: ["current_leader", "current_tyrant", "obstacle", "intervention"]
mood: "epic"
---

[current_leader] leads [followers] away from [current_tyrant].
[obstacle] blocks the path.
[intervention] clears the way.
```

### Judgment (Суд)

```markdown
---
uid: "1Kings.3"
archetype: "judgment"
applicable_positions: ["judge", "leader"]
variables: ["claimant_A", "claimant_B", "object", "judge", "hidden_truth"]
mood: "tense"
---

[claimant_A] and [claimant_B] dispute [object].
[judge] must decide.
[hidden_truth] is revealed.
```

### Loyalty (Верность)

```markdown
---
uid: "Ruth.1"
archetype: "loyalty"
applicable_positions: ["follower", "mentor"]
variables: ["current_hero", "mentor", "hardship", "reward"]
mood: "hopeful"
---

[current_hero] follows [mentor] through [hardship].
[current_hero] gains [reward].
```

## MCP-инструменты

### getQuestTemplates

```typescript
// Запрос по позиции
const result = await mcpServer.handleToolCall('get_quest_templates', {
  position: 'leader',
  archetype: 'escape',
  mood: 'epic',
  limit: 5,
});
```

### searchQuestTemplates

```typescript
// Поиск по тексту
const result = await mcpServer.handleToolCall('search_quest_templates', {
  query: 'escape through water',
  limit: 10,
});
```

## Интеграция с движком

```typescript
// 1. При инициализации сервера
const mcpServer = new TNSServer({ ... });
await mcpServer.initialize();

// 2. В DramaturgAgent
const templates = await mcpServer.handleToolCall('get_quest_templates', {
  position: context.character.position,
  limit: 3,
});

// 3. Заполнить переменные
const filled = template.template_text
  .replace('[current_hero]', character.name)
  .replace('[obstacle]', world.obstacle);

// 4. Передать StylistAgent
const prose = await stylist.process(filled);
```

## Отладка

### Просмотр логов

```bash
# Verbose режим
litcomp compile --input sources/ --output data/ --verbose
```

### Проверка базы данных

```bash
# Открыть SQLite консоль
sqlite3 data/compiled/literary.db

# Просмотр таблиц
.tables

# Просмотр шаблонов
SELECT * FROM bible_quest_templates LIMIT 10;

# Поиск по FTS
SELECT * FROM bible_quest_templates_fts WHERE bible_quest_templates_fts MATCH 'escape';
```

## Частые ошибки

| Ошибка | Решение |
|--------|---------|
| `Cannot find module 'better-sqlite3'` | Используйте `bun:sqlite` вместо `better-sqlite3` |
| `Template has no variables` | Добавьте переменные в шаблон |
| `Duplicate template ID` | Измените ID шаблона |
| `Template text too long` | Сократите текст до 500 слов |
