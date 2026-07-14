# Literary Compiler: Руководство по интеграции

## Обзор

Literary Compiler интегрируется с TNS Engine через MCP-сервер. Шаблоны используются DramaturgAgent для выбора нарративных паттернов и StylistAgent для генерации прозы.

## Архитектура интеграции

```
┌─────────────────────────────────────────────────────────┐
│                    TNS Engine                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ Dramaturg   │───▶│  Literary   │───▶│   Stylist   │ │
│  │ Agent       │    │  Compiler   │    │   Agent     │ │
│  └─────────────┘    │  (MCP)      │    └─────────────┘ │
│                     └─────────────┘                    │
│                           │                            │
│                     ┌─────▼─────┐                      │
│                     │  SQLite   │                      │
│                     │  (FTS5)   │                      │
│                     └───────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## Шаг 1: Инициализация

### В сервере (src/index.ts)

```typescript
import { TNSServer } from './mcp/server';

// При инициализации сервера
const mcpServer = new TNSServer({
  bibleDbPath: './data/bible/bible-normalized.db',
  gutenbergDbPath: './data/gutenberg/gutenberg.db',
  entityStore: unifiedEntityStore,
  dataDir: './data',
});

await mcpServer.initialize();
```

### Literary Compiler DB автоматически создаётся

Путь: `./data/literary-compiler/literary.db`

## Шаг 2: Использование в DramaturgAgent

DramaturgAgent запрашивает квест-шаблоны через MCP:

```typescript
// src/services/agents/dramaturg.ts

async process(
  intent: Intent,
  simulation: SimulationResult,
  context: GameContext,
): Promise<AgentOutput> {
  // Определить позицию игрока
  const position = context.character?.position ?? 'follower';
  
  // Определить архетип на основе контекста
  const archetype = this.inferArchetype(intent, simulation);
  
  // Запросить шаблоны через MCP
  const result = await this.mcpServer.handleToolCall('get_quest_templates', {
    position,
    archetype,
    limit: 5,
  }) as { templates: QuestTemplate[] };
  
  if (result.templates.length > 0) {
    const template = result.templates[0]!;
    return {
      metadata: {
        pattern: {
          archetype: template.archetype,
          name: template.id,
          description: template.template_text,
          verses: [],
          mood: template.mood,
        },
      },
    };
  }
  
  // Fallback: генерация через LLM
  return this.generateFallbackPattern(intent, simulation, context);
}
```

## Шаг 3: Использование в StylistAgent

StylistAgent использует шаблон для генерации прозы:

```typescript
// src/services/agents/stylist.ts

async process(
  intent: Intent,
  simulation: SimulationResult,
  context: GameContext,
  pattern?: NarrativePattern,
): Promise<AgentOutput> {
  // Получить стиль на основе настроения
  const style = await this.getStyle(pattern?.mood ?? 'neutral');
  
  // Построить промпт с шаблоном
  const prompt = this.buildPrompt(intent, simulation, context, style, pattern);
  
  // Сгенерировать прозу
  const prose = await this.llmQueue.generateText(prompt, 1, 0.8, 'stylist');
  
  return { text: prose };
}

private buildPrompt(
  intent: Intent,
  simulation: SimulationResult,
  context: GameContext,
  style: StylePattern | null,
  pattern?: NarrativePattern,
): string {
  const parts: string[] = [];
  
  parts.push('You are a skilled narrative writer for a text-based RPG.');
  
  // Добавить шаблон если есть
  if (pattern?.description) {
    parts.push(`\nNarrative template: ${pattern.description}`);
    parts.push('Use this template as a guide for the story structure.');
  }
  
  // ... остальная часть промпта
  
  return parts.join('\n');
}
```

## Шаг 4: Заполнение переменных

Переменные шаблона заполняются на основе контекста мира:

```typescript
function fillTemplate(
  template: string,
  context: GameContext,
): string {
  return template
    .replace(/\[current_hero\]/g, context.character?.name ?? 'the hero')
    .replace(/\[current_leader\]/g, context.world.leader ?? 'the leader')
    .replace(/\[current_tyrant\]/g, context.world.tyrant ?? 'the tyrant')
    .replace(/\[followers\]/g, context.world.faction ?? 'the people')
    .replace(/\[obstacle\]/g, context.obstacle ?? 'the challenge')
    .replace(/\[intervention\]/g, context.intervention ?? 'a miracle')
    .replace(/\[mentor\]/g, context.mentor ?? 'the elder')
    .replace(/\[nation\]/g, context.world.name ?? 'the kingdom');
}
```

## Шаг 5: CLI для компиляции

### Базовое использование

```bash
# Компиляция всех библейских глав
litcomp compile --input ./sources/bible/ --output ./data/compiled/

# Компиляция конкретной книги
litcomp compile --input ./sources/bible/exodus.md --type bible

# С валидацией
litcomp compile --input ./sources/ --validate --lint

# Экспорт в Markdown
litcomp compile --input ./sources/ --export-markdown

# Просмотр статистики
litcomp stats --db ./data/compiled/literary.db
```

### Флаги

| Флаг | Описание |
|------|----------|
| `--input` | Путь к входным файлам |
| `--output` | Путь для выходных данных |
| `--type` | Тип источника: `bible`, `gutenberg`, `prose`, `auto` |
| `--validate` | Включить валидацию |
| `--lint` | Включить линтинг |
| `--export-markdown` | Экспорт в Markdown |
| `--verbose` | Подробный вывод |

## Шаг 6: Конвертация библейских данных

### Входной формат

```markdown
---
source: "Exodus"
chapter: 14
language: "en"
---

# Exodus 14

## Verse 1
And the LORD spake unto Moses, saying,

## Verse 2
Speak unto the children of Israel, that they turn and encamp before Pihahiroth...

## Verse 21
And Moses stretched out his hand over the sea; and the LORD caused the sea to go back...
```

### Процесс конвертации

1. **Lexer**: Разбиение на стихи
2. **Dramaturgic Pass**: Извлечение архетипа "escape"
3. **Stylistic Pass**: Анализ стиля
4. **Emotional Pass**: Определение напряжения
5. **Metadata Pass**: Добавление тегов
6. **Linter**: Валидация
7. **Storage**: Запись в SQLite

### Выходной формат

```sql
INSERT INTO bible_quest_templates VALUES (
  'Exodus.14',
  'Exodus',
  14,
  'escape',
  '["leader","follower"]',
  '["current_leader","current_tyrant","obstacle","intervention"]',
  '[current_leader] leads [followers] away from [current_tyrant]. [obstacle] blocks the path. [intervention] clears the way.',
  'epic',
  'high',
  0.2,
  '["escape","water","miracle"]',
  unixepoch()
);
```

## Тестирование

### Запуск тестов

```bash
# Все тесты Literary Compiler
bun test tests/literary-compiler/

# Конкретный тест
bun test tests/literary-compiler/schema.test.ts

# Все тесты проекта
bun test
```

### Пример интеграционного теста

```typescript
import { describe, it, expect } from 'bun:test';
import { LiteraryCompilerDB } from '../../src/mcp/literary-compiler/schema';
import { DramaturgicPass } from '../../src/mcp/literary-compiler/dramaturgic-pass';
import { LiteraryCompilerMCPTools } from '../../src/mcp/tools/literary-compiler';

describe('Literary Compiler Integration', () => {
  it('should parse, store, and query templates', () => {
    // 1. Создать БД
    const db = new LiteraryCompilerDB(':memory:');
    
    // 2. Парсинг
    const pass = new DramaturgicPass(db);
    pass.parse({
      text: `
        # Exodus 14
        ## Verse 1
        And the LORD spake unto Moses.
        ## Verse 21
        And Moses stretched out his hand over the sea.
      `,
      source_book: 'Exodus',
      source_chapter: 14,
    });
    
    // 3. Запрос через MCP
    const tools = new LiteraryCompilerMCPTools(db);
    const result = await tools.getQuestTemplates({ position: 'leader' });
    
    expect(result.templates.length).toBe(1);
    expect(result.templates[0].archetype).toBe('escape');
    
    db.close();
  });
});
```

## Частые вопросы

### Q: Как добавить новый архетип?

A: Добавьте ключевые слова в `ARCHETYPE_KEYWORDS` в `dramaturgic-pass.ts`:

```typescript
const ARCHETYPE_KEYWORDS: Record<string, string[]> = {
  // ... существующие
  new_archetype: ['keyword1', 'keyword2'],
};
```

### Q: Как изменить формат переменных?

A: Измените `DEFAULT_VARIABLES` в `dramaturgic-pass.ts`:

```typescript
const DEFAULT_VARIABLES: Record<string, string[]> = {
  // ... существующие
  new_archetype: ['var1', 'var2', 'var3'],
};
```

### Q: Как добавить новые позиции?

A: Измените `DEFAULT_POSITIONS` в `dramaturgic-pass.ts`:

```typescript
const DEFAULT_POSITIONS: Record<string, string[]> = {
  // ... существующие
  new_archetype: ['position1', 'position2'],
};
```

### Q: Как экспортировать шаблоны в Markdown?

A: Используйте флаг `--export-markdown`:

```bash
litcomp compile --input ./sources/ --export-markdown --output ./data/
```

### Q: Как проверить статистику?

A: Используйте команду `stats`:

```bash
litcomp stats --db ./data/literary.db
```

Вывод:
```
Total templates: 42
By archetype:
  escape: 12
  judgment: 8
  loyalty: 6
  wisdom: 5
  ...
```
