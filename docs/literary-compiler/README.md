# Literary Compiler

CLI-инструмент для преобразования литературы (Библия, Гутенберг, современная проза) в структурированные квест-шаблоны и стилистические паттерны для игрового движка TrueNeverStory.

## Обзор

Literary Compiler обрабатывает литературные источники офлайн перед деплоем. Результат — SQLite база с квест-шаблонами, которую движок запрашивает за миллисекунды вместо секунд (LLM).

**Поток:**
```
Источник → Lexer → Parser (4 прохода) → Linter → SQLite + Markdown
```

## Архитектура

```
src/mcp/literary-compiler/
├── types.ts              # Типы квест-шаблонов
├── schema.ts             # SQL-схема (bible_quest_templates + FTS5)
├── dramaturgic-pass.ts   # Проход 1: Квест-шаблоны, архетипы
├── stylistic-pass.ts     # Проход 2: Стиль, сенсорика, темп
├── emotional-pass.ts     # Проход 3: Эмоции, напряжение
├── metadata-pass.ts      # Проход 4: Теги, позиции, сложность
└── linter.ts             # Валидация, дедупликация
```

## Правила

| # | Правило | Описание |
|---|---------|----------|
| R1 | Язык шаблонов — английский | Все шаблоны на Interlingua (EN) для RAG-оптимизации |
| R2 | Анонимизация через формат | Шаблоны НЕ содержат имён из источника |
| R3 | Запрет на морализование | Шаблоны описывают действия/конфликты, не уроки |
| R4 | Переменные обязательны | Каждый шаблон содержит [current_hero], [obstacle] и т.д. |
| R5 | Предобработка офлайн | Compiler запускается до деплоя, не в runtime |
| R6 | Один источник = один файл | Каждая глава/книга = отдельный входной файл |
| R7 | Валидация перед записью | Linter проверяет дубли, пустые поля, корректность |

## Формат шаблона

### Frontmatter

```yaml
---
# Обязательные поля
uid: string                    # Уникальный ID (например, "Exodus.14")
archetype: string              # Архетип (escape, judgment, inheritance, wisdom)
applicable_positions: string[] # Позиции в мире (leader, follower, tyrant, judge)
variables: string[]            # Переменные шаблона ([current_hero], [obstacle])
template_text: string          # Текст шаблона с переменными

# Опциональные поля
source_book: string            # Книга источника
source_chapter: number         # Глава источника
mood: string                   # Настроение (epic, dark, hopeful, tense)
difficulty: string             # Сложность (low, medium, high)
moral_ambiguity: number        # Моральная неоднозначность (0-1)
tags: string[]                 # Теги для RAG-поиска
sensory_markers: string[]      # Сенсорные маркеры (smell, touch, sight)
pacing: string                 # Темп (fast, slow, mixed)
tone: string                   # Тон (dark, light, ironic, epic)
---

[Шаблон текста с переменными]
```

### Пример

```markdown
---
uid: "Exodus.14"
archetype: "escape"
applicable_positions: ["leader", "follower"]
variables: ["current_leader", "current_tyrant", "obstacle", "intervention"]
mood: "epic"
difficulty: "high"
moral_ambiguity: 0.2
tags: ["escape", "water", "miracle"]
---

[current_leader] leads [followers] away from [current_tyrant].
[obstacle] blocks the path.
[intervention] clears the way.
```

## SQL-схема

```sql
CREATE TABLE bible_quest_templates (
  id TEXT PRIMARY KEY,
  source_book TEXT NOT NULL,
  source_chapter INTEGER NOT NULL,
  archetype TEXT NOT NULL,
  applicable_positions TEXT NOT NULL,  -- JSON array
  variables TEXT NOT NULL,             -- JSON array
  template_text TEXT NOT NULL,
  mood TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  moral_ambiguity REAL NOT NULL,
  tags TEXT NOT NULL,                  -- JSON array
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE bible_quest_templates_fts
USING fts5(
  id,
  archetype,
  mood,
  tags,
  template_text,
  content=bible_quest_templates,
  content_rowid=rowid
);
```

## API Reference

### LiteraryCompilerDB

```typescript
import { LiteraryCompilerDB } from './src/mcp/literary-compiler/schema';

const db = new LiteraryCompilerDB('./data/literary.db');

// Вставить шаблон
db.insertTemplate({
  id: 'Exodus.14',
  source_book: 'Exodus',
  source_chapter: 14,
  archetype: 'escape',
  applicable_positions: ['leader', 'follower'],
  variables: ['current_leader', 'current_tyrant'],
  template_text: '[current_leader] leads away from [current_tyrant].',
  mood: 'epic',
  difficulty: 'high',
  moral_ambiguity: 0.2,
  tags: ['escape'],
});

// Получить шаблон по ID
const template = db.getTemplate('Exodus.14');

// Запрос с фильтрами
const templates = db.queryTemplates({
  position: 'leader',
  archetype: 'escape',
  mood: 'epic',
  limit: 5,
});

// Поиск по тексту (FTS)
const results = db.searchTemplates('escape through water', 10);
```

### DramaturgicPass

```typescript
import { DramaturgicPass } from './src/mcp/literary-compiler/dramaturgic-pass';
import { LiteraryCompilerDB } from './src/mcp/literary-compiler/schema';

const db = new LiteraryCompilerDB('./data/literary.db');
const pass = new DramaturgicPass(db);

const result = pass.parse({
  text: '# Exodus 14\n\n## Verse 1\nAnd the LORD spake unto Moses...',
  source_book: 'Exodus',
  source_chapter: 14,
});

console.log(result.templates);
// [{ id: 'Exodus.14', archetype: 'escape', ... }]
```

### StylisticPass

```typescript
import { StylisticPass } from './src/mcp/literary-compiler/stylistic-pass';

const pass = new StylisticPass();

const result = pass.analyze({
  text: 'She saw the bright light and heard the thunder.',
  source_id: 'test.1',
});

console.log(result.patterns[0]);
// {
//   sensory_markers: ['sight', 'sound'],
//   pacing: 'fast',
//   tone: 'light',
//   lexical_richness: 0.86
// }
```

### EmotionalPass

```typescript
import { EmotionalPass } from './src/mcp/literary-compiler/emotional-pass';

const pass = new EmotionalPass();

const result = pass.analyze({
  text: 'The battle raged. Blood flowed. Screams filled the air.',
  source_id: 'battle.1',
});

console.log(result.arcs[0]);
// {
//   tension_level: 0.83,
//   emotions: ['anger'],
//   tension_curve: [0.9, 0.8, 0.7]
// }
```

### MetadataPass

```typescript
import { MetadataPass } from './src/mcp/literary-compiler/metadata-pass';

const pass = new MetadataPass();

const result = pass.enrich({
  template: {
    id: 'Exodus.14',
    archetype: 'escape',
    template_text: '[current_leader] leads through the sea.',
    // ...
  },
});

console.log(result.metadata);
// {
//   tags: ['water', 'journey'],
//   applicable_positions: ['leader', 'follower'],
//   difficulty: 'high',
//   moral_ambiguity: 0.2
// }
```

### Linter

```typescript
import { Linter } from './src/mcp/literary-compiler/linter';

const linter = new Linter();

const result = linter.lint([
  { id: 'valid', archetype: 'escape', variables: ['hero'], template_text: 'Hero escapes.', ... },
  { id: '', archetype: '', variables: [], template_text: '', ... }, // Invalid
]);

console.log(result);
// {
//   error_count: 2,
//   warning_count: 0,
//   valid_templates: [...],
//   invalid_templates: [...]
// }
```

## MCP-инструменты

### getQuestTemplates

Запрос квест-шаблонов по позиции, архетипу или настроению.

```typescript
// Вход
{
  position?: string;    // "leader", "follower", "tyrant"
  archetype?: string;   // "escape", "judgment", "loyalty"
  mood?: string;        // "epic", "dark", "hopeful"
  difficulty?: string;  // "low", "medium", "high"
  limit?: number;       // По умолчанию 5
}

// Выход
{
  templates: Array<{
    id: string;
    source_book: string;
    source_chapter: number;
    archetype: string;
    applicable_positions: string[];
    variables: string[];
    template_text: string;
    mood: string;
    difficulty: string;
    moral_ambiguity: number;
    tags: string[];
  }>;
  total: number;
}
```

### searchQuestTemplates

Поиск шаблонов по тексту (FTS).

```typescript
// Вход
{
  query: string;   // Текст для поиска
  limit?: number;  // По умолчанию 10
}

// Выход
{
  templates: Array<{
    id: string;
    archetype: string;
    template_text: string;
    mood: string;
  }>;
  total: number;
}
```

## Архетипы

| Архетип | Описание | Пример |
|---------|----------|--------|
| escape | Побег, освобождение | Исход 14 (Красное море) |
| judgment | Суд, разрешение спора | 3 Царств 3 (Суд Соломона) |
| inheritance | Наследование, возвращение | Лука 15 (Блудный сын) |
| wisdom | Мудрость, совет | Притчи |
| loyalty | Верность, преданность | Руфь 1 |
| political | Интриги, власть | Есфирь |
| endurance | Стойкость, испытание | Иов |
| rescue | Спасение, освобождение | Книга Судей |
| liberation | Освобождение из рабства | Исход |
| rise_fall_rise | Возвышение-падение-возвышение | Бытие 37-50 (Иосиф) |

## Позиции в мире

| Позиция | Описание |
|---------|----------|
| leader | Правитель, вожак |
| follower | Один из народа, последователь |
| tyrant | Тиран, угнетатель |
| judge | Судья, арбитр |
| mentor | Наставник, учитель |
| savior | Спаситель, освободитель |
| heir | Наследник, преемник |
| wise_one | Мудрец, советник |

## Интеграция с движком

```typescript
// Runtime: запрос шаблона по позиции игрока
const position = 'leader'; // Из worldState
const templates = db.queryTemplates({ position, limit: 5 });

// Выбрать шаблон на основе контекста
const template = templates[0];

// Заполнить переменные
const filledTemplate = template.template_text
  .replace('[current_leader]', player.name)
  .replace('[current_tyrant]', world.tyrant)
  .replace('[obstacle]', world.obstacle);

// Передать Stylist для генерации прозы
const prose = await stylist.process(filledTemplate);
```

## Примеры библейских квест-шаблонов

| Источник | Архетип | Шаблон |
|----------|---------|--------|
| Бытие 37-50 (Иосиф) | rise_fall_rise | [current_hero] favored by [mentor], [rivals] sell into slavery, [current_hero] rises to power |
| Исход 14 (Красное море) | escape | [current_leader] leads [followers] from [current_tyrant], [obstacle] blocks path, [intervention] saves |
| Судьи 4 (Девора) | liberation | [current_leader] judges [nation], [current_tyrant] oppresses, [current_leader] defeats [current_tyrant] |
| Руфь 1 (Лояльность) | loyalty | [current_hero] follows [mentor] through hardship, [current_hero] gains [reward] |
| Есфирь (Интрига) | political | [current_hero] discovers [plot], [current_hero] must choose: speak or stay silent |
| Иов (Страдание) | endurance | [current_hero] loses everything, [current_hero] must choose: curse or endure |

## Социальные нарративы

| Источник | Архетип | Шаблон |
|----------|---------|--------|
| Лука 15 (Блудный сын) | inheritance | [current_hero] demands [share] from [mentor], [current_hero] wastes [wealth], [current_hero] returns humbled |
| 3 Царств 3 (Суд Соломона) | judgment | [claimant_A] and [claimant_B] dispute [object], [judge] must decide, [hidden_truth] revealed |
| Притчи (Мудрость) | wisdom | [current_hero] faces [dilemma], [mentor] offers [lesson], [current_hero] chooses [path] |
| Книга Судей (Спасение) | rescue | [current_hero] called to save [nation] from [oppressor], [current_hero] gathers [allies], [current_hero] defeats [oppressor] |
