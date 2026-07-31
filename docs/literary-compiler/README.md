# Literary Compiler

CLI-инструмент для преобразования литературы (Библия, Гутенберг, современная проза) в структурированные шаблоны и стилистические паттерны для игрового движка TrueNeverStory.

**Версия:** v2 (v0.29.6) — гибридный офлайн-пайплайн + runtime retrieval.

## Обзор

Literary Compiler v2 обрабатывает литературные источники офлайн перед деплоем. Результат — SQLite база с `scene_templates` и `style_patterns`, которую движок запрашивает за миллисекунды. Runtime retrieval выбирает лучший шаблон по composite score, заполняет переменные детерминистически, и отправляет micro-prompt в Stylist для генерации 2-3 абзацев прозы.

**Поток v2:**
```
Источник → Chunker → Dictionary Pre-Score → LLM Extractor → Linter → SQLite
Runtime:  Player Input → Retrieval Keys → Hybrid Search → fillTemplate → Stylist Micro-Prompt → Prose
```

**Ключевое отличие от v1:** v1 использовал 4-5 LLM-запросов на каждый ход. v2 выносит анализ в офлайн и использует 1-2 LLM-запроса в runtime.

## Архитектура

```
src/mcp/literary-compiler/
├── schema.ts             # LiteraryCompilerDB — 6 v2 таблиц + FTS5
├── archetypes.ts         # 12 канонических архетипов + keywords + variables + positions
├── chunker.ts            # Разбиение текста по предложениям (200-400 токенов, overlap 40-80)
├── pre-score.ts          # Словарная оценка архетипов + narrative density
├── extractor.ts          # LLM JSON экстрактор с валидацией (Qwen3-8B, temp=0.1)
├── retrieval.ts          # Гибридный retrieval с composite scoring
├── fill-template.ts      # Детерминистическая замена [placeholder]
├── linter.ts             # Валидация v2: морализация, токены, архетипы
├── runtime-metrics.ts    # Метрики задержки по ходам
└── types.ts              # Типы v1 (обратная совместимость)

scripts/
└── migrate-v1-to-v2.ts   # Миграция архетипов из v1 в v2

src/services/agents/
└── stylist.ts            # buildMicroPrompt() для v2 constrained generation

src/lib/
└── feature-flags.ts      # Флаги: literary-compiler-v2, literary-v2-retrieval, literary-v2-stylist
```

## Правила

| # | Правило | Описание |
|---|---------|----------|
| R1 | Язык шаблонов — английский | Все шаблоны на Interlingua (EN) для RAG-оптимизации |
| R2 | Анонимизация через формат | Шаблоны НЕ содержат имён из источника |
| R3 | Запрет на морализование | Шаблоны описывают действия/конфликты, не уроки. Linter детектит фразы "you should", "you must" и т.д. |
| R4 | Переменные обязательны | Каждый шаблон содержит [current_hero], [obstacle] и т.д. |
| R5 | Предобработка офлайн | Compiler запускается до деплоя, не в runtime |
| R6 | Один источник = один файл | Каждая глава/книга = отдельный входной файл |
| R7 | Валидация перед записью | Linter проверяет дубли, пустые поля, корректность |
| R8 | Максимум 120 токенов на skeleton | Шаблон-скелет ≤ 120 токенов (~480 символов) |
| R9 | Feature flag gate | V2 пайплайн активируется через `literary-compiler-v2` flag |
| R10 | 1-2 LLM вызова на ход | Hard budget: retrieval + fill = 0 LLM, micro-prompt = 1 LLM |

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

## SQL-схема (v2)

### scene_templates — Нарративные скелеты

```sql
CREATE TABLE scene_templates (
  id TEXT PRIMARY KEY,
  source_book TEXT NOT NULL,
  source_chapter INTEGER NOT NULL,
  source_chunk_ids TEXT NOT NULL DEFAULT '[]',     -- JSON array
  archetype_primary TEXT NOT NULL,                  -- из 12 канонических
  archetype_secondary TEXT,                         -- nullable
  applicable_positions TEXT NOT NULL DEFAULT '[]',  -- JSON array
  variables TEXT NOT NULL DEFAULT '[]',             -- JSON array
  template_text TEXT NOT NULL,                      -- skeleton ≤ 120 токенов
  beat_sequence TEXT NOT NULL DEFAULT '[]',         -- JSON array
  mood TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  moral_ambiguity REAL NOT NULL DEFAULT 0,
  tension_curve TEXT NOT NULL DEFAULT '[]',         -- JSON number array
  tags TEXT NOT NULL DEFAULT '[]',                  -- JSON array
  domain TEXT NOT NULL DEFAULT 'general',
  scale REAL NOT NULL DEFAULT 1.0,
  embedding_id TEXT,
  quality_score REAL NOT NULL DEFAULT 0.5,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### style_patterns — Стилистические паттерны

```sql
CREATE TABLE style_patterns (
  id TEXT PRIMARY KEY,
  source_author_or_era TEXT NOT NULL,
  source_chunk_ids TEXT NOT NULL DEFAULT '[]',
  avg_sentence_len REAL NOT NULL DEFAULT 0,
  sentence_len_variance REAL NOT NULL DEFAULT 0,
  sensory_ratio REAL NOT NULL DEFAULT 0,
  register TEXT NOT NULL DEFAULT 'neutral',       -- elevated|plain|earthy
  pacing TEXT NOT NULL DEFAULT 'medium',           -- fast|slow|mixed
  tone TEXT NOT NULL DEFAULT 'neutral',
  preferred_constructions TEXT NOT NULL DEFAULT '[]',
  forbidden_phrases TEXT NOT NULL DEFAULT '[]',
  example_snippets TEXT NOT NULL DEFAULT '[]',     -- delexified, 1-4 штуки
  quality_score REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### template_style_links — Связь шаблонов и стилей

```sql
CREATE TABLE template_style_links (
  template_id TEXT NOT NULL,
  style_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (template_id, style_id)
);
```

### chunk_index — Индекс чанков

```sql
CREATE TABLE chunk_index (
  chunk_id TEXT PRIMARY KEY,
  source_book TEXT NOT NULL,
  source_chapter INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_est INTEGER NOT NULL DEFAULT 0,
  char_start INTEGER NOT NULL DEFAULT 0,
  char_end INTEGER NOT NULL DEFAULT 0,
  embedding_ref TEXT,
  dict_hits INTEGER NOT NULL DEFAULT 0,
  pre_score REAL NOT NULL DEFAULT 0,
  cluster_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### player_style_profiles — Профили стиля игрока (Phase 3, deferred)

```sql
CREATE TABLE player_style_profiles (
  player_id TEXT PRIMARY KEY,
  avg_sentence_len REAL NOT NULL DEFAULT 0,
  sensory_bias REAL NOT NULL DEFAULT 0,
  register_score REAL NOT NULL DEFAULT 0,
  dialogue_ratio REAL NOT NULL DEFAULT 0,
  preferred_motifs TEXT NOT NULL DEFAULT '[]',
  anti_patterns TEXT NOT NULL DEFAULT '[]',
  sample_snippets TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  message_count_used INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER DEFAULT (unixepoch())
);
```

### retrieval_cache — Кэш retrieval

```sql
CREATE TABLE retrieval_cache (
  cache_key TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  style_id TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
```

### FTS5 индексы

```sql
CREATE VIRTUAL TABLE scene_fts USING fts5(
  id, archetype_primary, mood, tags, template_text,
  content=scene_templates, content_rowid=rowid
);

CREATE VIRTUAL TABLE chunk_fts USING fts5(
  chunk_id, source_book, text,
  content=chunk_index, content_rowid=rowid
);
```

## API Reference

### LiteraryCompilerDB (v2)

```typescript
import { LiteraryCompilerDB } from './src/mcp/literary-compiler/schema';

const db = new LiteraryCompilerDB('./data/literary.db');
db.createV2Tables();  // Создать v2 таблицы
db.createV2FTS();     // Создать FTS5 индексы

// Вставить scene template
db.insertSceneTemplate({
  id: 'Exodus.14.v2',
  source_book: 'Exodus',
  source_chapter: 14,
  source_chunk_ids: ['chunk-0', 'chunk-1'],
  archetype_primary: 'escape_liberation',
  archetype_secondary: null,
  applicable_positions: ['leader', 'follower'],
  variables: ['current_leader', 'current_tyrant', 'obstacle', 'intervention'],
  template_text: '[current_leader] leads [followers] from [current_tyrant]. [obstacle] blocks path.',
  beat_sequence: ['departure', 'pursuit', 'crisis', 'intervention'],
  mood: 'epic',
  difficulty: 'high',
  moral_ambiguity: 0.2,
  tension_curve: [0.3, 0.6, 0.9, 0.4],
  tags: ['escape', 'water', 'miracle'],
  domain: 'biblical',
  scale: 3.0,
  embedding_id: null,
  quality_score: 0.85,
  use_count: 0,
  last_used_at: null,
  created_at: Date.now(),
});

// Вставить style pattern
db.insertStylePattern({
  id: 'exodus-prose-style',
  source_author_or_era: 'Biblical Hebrew',
  source_chunk_ids: ['chunk-0'],
  avg_sentence_len: 18.5,
  sentence_len_variance: 4.2,
  sensory_ratio: 0.35,
  register: 'elevated',
  pacing: 'fast',
  tone: 'epic',
  preferred_constructions: ['imperative', 'parataxis'],
  forbidden_phrases: ['modern slang', 'technology'],
  example_snippets: ['The waters parted. A path appeared.'],
  quality_score: 0.8,
  created_at: Date.now(),
});

// Связать шаблон и стиль
db.insertTemplateStyleLink({
  template_id: 'Exodus.14.v2',
  style_id: 'exodus-prose-style',
  weight: 1.0,
});

// Получить шаблоны по архетипу
const templates = db.getSceneTemplatesByArchetype('escape_liberation');

// Получить стиль для шаблона
const style = db.getStyleForTemplate('Exodus.14.v2');
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

## Архетипы (v2 — 12 канонических)

| # | Архетип | Описание | Примеры |
|---|---------|----------|--------|
| 1 | `escape_liberation` | Побег, освобождение из рабства | Исход, Одиссея, побег из тюрьмы |
| 2 | `judgment_trial` | Суд, доказательство невиновности, вердикт | Суд Соломона, Процесс Кафки, Орест |
| 3 | `loyalty` | Верность, преданность, служение | Руфь, рыцари Круглого стола, самураи |
| 4 | `betrayal` | Предательство, измена, обман | Иуда, Брут, Яго |
| 5 | `inheritance_return` | Наследие, восстановление статуса | Блудный сын, Гамлет, спор о наследстве |
| 6 | `endurance_suffering` | Страдание, терпение, испытание | Иов, Прометей, Король Лир |
| 7 | `rescue` | Спасение, избавление | Давид и Голиаф, Персей и Андромеда |
| 8 | `rise_fall_rise` | Возвышение → падение → возвышение | Иосиф, Фауст, Скарлетт О'Хара |
| 9 | `wisdom_counsel` | Мудрость, наставление, притча | Экклезиаст, Мерлин, наставники |
| 10 | `political_intrigue` | Власть, заговор, интриги | Есфирь, Макиавелли, дворцовые драмы |
| 11 | `quest_journey` | Путешествие, поиск, квест | Авраам, Одиссея, Властелин колец |
| 12 | `temptation_fall` | Искусление, грех, падение | Адам и Ева, Фауст, Макбет |

**Fallback:** `everyday_life` — используется, когда ни один архетип не набирает порог (0.3).

### Почему именно эти 12?

- Убран `confrontation` (слишком широкий — каждый конфликт это confrontation)
- Убран `restoration_healing` (пересекается с `endurance_suffering` happy end)
- Убран `covenant_bargain` (библейский-specific; покрывается `loyalty` + `political_intrigue`)

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
