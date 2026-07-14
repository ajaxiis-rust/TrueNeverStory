# Literary Compiler API Reference

## Типы

### QuestTemplate

```typescript
interface QuestTemplate {
  id: string;                    // Уникальный ID (например, "Exodus.14")
  source_book: string;           // Книга источника
  source_chapter: number;        // Глава источника
  archetype: string;             // Архетип
  applicable_positions: string[];// Применимые позиции
  variables: string[];           // Переменные шаблона
  template_text: string;         // Текст шаблона
  mood: string;                  // Настроение
  difficulty: string;            // Сложность
  moral_ambiguity: number;       // Моральная неоднозначность (0-1)
  tags: string[];                // Теги
  created_at: number;            // Unix timestamp
}
```

### QuestTemplateFilter

```typescript
interface QuestTemplateFilter {
  position?: string;     // Позиция в мире
  archetype?: string;    // Архетип
  mood?: string;         // Настроение
  difficulty?: string;   // Сложность
  limit?: number;        // Лимит результатов
}
```

### DramaturgicInput

```typescript
interface DramaturgicInput {
  text: string;          // Текст главы/стиха
  source_book: string;   // Книга источника
  source_chapter: number;// Глава источника
}
```

### DramaturgicOutput

```typescript
interface DramaturgicOutput {
  templates: QuestTemplate[];  // Извлечённые шаблоны
  errors: string[];            // Ошибки парсинга
}
```

### StylisticPattern

```typescript
interface StylisticPattern {
  id: string;                  // ID паттерна
  source_text: string;         // Исходный текст
  avg_sentence_length: number; // Средняя длина предложений
  sensory_markers: string[];   // Сенсорные маркеры
  pacing: string;              // Темп (fast, slow, mixed)
  tone: string;                // Тон (dark, light, ironic, epic)
  syntax_patterns: string[];   // Синтаксические конструкции
  lexical_richness: number;    // Лексическое богатство (0-1)
}
```

### EmotionalArc

```typescript
interface EmotionalArc {
  id: string;                  // ID дуги
  source_text: string;         // Исходный текст
  tension_level: number;       // Уровень напряжения (0-1)
  emotions: string[];          // Эмоции
  mood_transitions: string[];  // Переходы настроения
  tension_curve: number[];     // Кривая напряжения
  dominant_emotion: string;    // Доминирующая эмоция
}
```

### TemplateMetadata

```typescript
interface TemplateMetadata {
  template_id: string;         // ID шаблона
  tags: string[];              // Теги
  applicable_positions: string[];// Применимые позиции
  difficulty: string;          // Сложность
  moral_ambiguity: number;     // Моральная неоднозначность
  mood: string;                // Настроение
  archetype: string;           // Архетип
}
```

### LintIssue

```typescript
interface LintIssue {
  level: 'error' | 'warning'; // Уровень проблемы
  type: string;                // Тип проблемы
  message: string;             // Описание
  template_id: string;         // ID шаблона
}
```

### LintResult

```typescript
interface LintResult {
  issues: LintIssue[];              // Все проблемы
  error_count: number;              // Количество ошибок
  warning_count: number;            // Количество предупреждений
  valid_templates: QuestTemplate[]; // Валидные шаблоны
  invalid_templates: QuestTemplate[];// Невалидные шаблоны
}
```

---

## Классы

### LiteraryCompilerDB

SQL-хранилище квест-шаблонов с FTS5.

```typescript
class LiteraryCompilerDB {
  constructor(dbPath: string);
  
  // CRUD операции
  insertTemplate(template: Omit<QuestTemplate, 'created_at'>): void;
  getTemplate(id: string): QuestTemplate | null;
  deleteTemplate(id: string): void;
  
  // Запросы
  queryTemplates(filter?: QuestTemplateFilter): QuestTemplate[];
  searchTemplates(text: string, limit?: number): QuestTemplate[];
  
  // Утилиты
  getTemplateCount(): number;
  getTables(): string[];
  close(): void;
}
```

**Пример:**
```typescript
const db = new LiteraryCompilerDB('./data/literary.db');

// Вставка
db.insertTemplate({
  id: 'Exodus.14',
  source_book: 'Exodus',
  source_chapter: 14,
  archetype: 'escape',
  applicable_positions: ['leader'],
  variables: ['current_leader', 'current_tyrant'],
  template_text: '[current_leader] leads away from [current_tyrant].',
  mood: 'epic',
  difficulty: 'high',
  moral_ambiguity: 0.2,
  tags: ['escape'],
});

// Получение
const template = db.getTemplate('Exodus.14');

// Запрос
const templates = db.queryTemplates({ position: 'leader', limit: 5 });

// Поиск
const results = db.searchTemplates('escape through water');
```

---

### DramaturgicPass

Парсинг библейских глав в квест-шаблоны.

```typescript
class DramaturgicPass {
  constructor(db: LiteraryCompilerDB);
  
  parse(input: DramaturgicInput): DramaturgicOutput;
}
```

**Пример:**
```typescript
const db = new LiteraryCompilerDB('./data/literary.db');
const pass = new DramaturgicPass(db);

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

console.log(result.templates[0]);
// {
//   id: 'Exodus.14',
//   archetype: 'escape',
//   mood: 'neutral',
//   ...
// }
```

---

### StylisticPass

Анализ текста на стилистические паттерны.

```typescript
class StylisticPass {
  analyze(input: StylisticInput): StylisticOutput;
}
```

**Пример:**
```typescript
const pass = new StylisticPass();

const result = pass.analyze({
  text: 'She saw the bright light and heard the thunder. The cold wind touched her face.',
  source_id: 'test.1',
});

console.log(result.patterns[0]);
// {
//   sensory_markers: ['sight', 'sound', 'touch'],
//   pacing: 'mixed',
//   tone: 'neutral',
//   lexical_richness: 0.87
// }
```

---

### EmotionalPass

Анализ текста на эмоциональные дуги.

```typescript
class EmotionalPass {
  analyze(input: EmotionalInput): EmotionalOutput;
}
```

**Пример:**
```typescript
const pass = new EmotionalPass();

const result = pass.analyze({
  text: 'The battle raged. Blood flowed. Screams filled the air.',
  source_id: 'battle.1',
});

console.log(result.arcs[0]);
// {
//   tension_level: 0.83,
//   emotions: ['anger'],
//   tension_curve: [0.9, 0.8, 0.7],
//   dominant_emotion: 'anger'
// }
```

---

### MetadataPass

Обогащение шаблонов метаданными для RAG.

```typescript
class MetadataPass {
  enrich(input: MetadataInput): MetadataOutput;
}
```

**Пример:**
```typescript
const pass = new MetadataPass();

const result = pass.enrich({
  template: {
    id: 'Exodus.14',
    archetype: 'escape',
    template_text: '[current_leader] leads through the sea.',
    variables: ['current_leader'],
    applicable_positions: [],
    mood: 'epic',
    difficulty: '',
    moral_ambiguity: 0,
    tags: [],
    // ...
  },
});

console.log(result.metadata);
// {
//   tags: ['water'],
//   applicable_positions: ['leader', 'follower'],
//   difficulty: 'low',
//   moral_ambiguity: 0.3
// }
```

---

### Linter

Валидация шаблонов.

```typescript
class Linter {
  lint(templates: QuestTemplate[]): LintResult;
}
```

**Пример:**
```typescript
const linter = new Linter();

const result = linter.lint([
  {
    id: 'valid',
    archetype: 'escape',
    variables: ['hero'],
    template_text: 'Hero escapes.',
    mood: 'epic',
    difficulty: 'high',
    moral_ambiguity: 0.2,
    tags: [],
    // ...
  },
  {
    id: '',  // Error: empty ID
    archetype: '',
    variables: [],
    template_text: '',
    mood: '',
    difficulty: '',
    moral_ambiguity: 0,
    tags: [],
    // ...
  },
]);

console.log(result);
// {
//   error_count: 2,
//   warning_count: 0,
//   valid_templates: [...],
//   invalid_templates: [...]
// }
```

---

## LiteraryCompilerMCPTools

MCP-инструменты для запроса шаблонов.

```typescript
class LiteraryCompilerMCPTools {
  constructor(db: LiteraryCompilerDB);
  
  getQuestTemplates(input: {
    position?: string;
    archetype?: string;
    mood?: string;
    difficulty?: string;
    limit?: number;
  }): Promise<{
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
  }>;
  
  searchQuestTemplates(input: {
    query: string;
    limit?: number;
  }): Promise<{
    templates: Array<{
      id: string;
      archetype: string;
      template_text: string;
      mood: string;
    }>;
    total: number;
  }>;
}
```
