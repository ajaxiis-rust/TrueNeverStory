# Справка по агентам (v0.33.4)

В TrueNeverStory **две системы агентов**, которые сосуществуют:

1. **The Big Six (AgentV2)** — конвейер нарративной прозы. Регистрируются в `AgentRegistryV2` и инстанцируются в `RoleplayEngine`.
2. **Сконфигурированные агенты (`DEFAULT_AGENTS`)** — более старые агенты, управляемые конфигурацией, перечисленные в `src/services/agent-config.ts`. Они лежат в основе UI настроек/провайдеров и нескольких подсистем (фоновое исследование, чат `@mentions`).

The Big Six: `dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`. Сконфигурированные агенты: `director`, `chronicler`, `story-planner`, `social-sim`, `villain`, `researcher`, `translation`.

`stylist` — единственный генератор прозы. Удалённые агенты (`narrator`, `npc`, `scene`, `historian`, `cartographer`, `lorekeeper`, `merchant`, `quest-giver`) больше нигде в коде не существуют.

---

## The Big Six (AgentV2)

Они обрабатывают детерминированный конвейер прозы: намерение → симуляция → контекст → проза.

### 1. Dramaturg (Архитектор)

**ID:** `dramaturg`
**Роль:** Выбирает нарративные паттерны из библейских архетипов
**MCP-инструменты:** `search_verses`, `get_pattern`, `get_archetype`

| Аспект | Детали |
|--------|--------|
| **Назначение** | Анализирует текущую ситуацию и выбирает подходящие сюжетные структуры из библейских паттернов |
| **Вход** | Intent, SimulationResult, GameContext |
| **Выход** | NarrativePattern (архетип, имя, описание, стихи, настроение) |
| **Зависимости** | TNSServer (MCP), LLMQueue |

**Рабочий процесс:**
1. Определяет настроение из типа намерения и исхода симуляции
2. Запрашивает Bible MCP на предмет подходящих архетипов
3. Откатывается к паттернам, сгенерированным LLM, если MCP недоступен

### 2. Validator (Фактчекер)

**ID:** `validator`
**Роль:** Проверяет факты через Wikipedia MCP
**MCP-инструменты:** `verify_fact`, `get_context`

| Аспект | Детали |
|--------|--------|
| **Назначение** | Обеспечивает согласованность мира и историческую достоверность |
| **Вход** | Intent, SimulationResult, GameContext |
| **Выход** | Результаты проверки (проверено, уверенность, доказательства, источники) |
| **Зависимости** | TNSServer (MCP) |

**Рабочий процесс:**
1. Извлекает фактические утверждения из ситуации
2. Запрашивает Wikipedia MCP для проверки
3. Возвращает результаты проверки с уровнями уверенности

### 3. Stylist (Рассказчик)

**ID:** `stylist`
**Роль:** Рендерит прозу, используя стилевые паттерны Gutenberg — единственный генератор прозы
**MCP-инструменты:** `get_style_pattern`, `apply_style`

| Аспект | Детали |
|--------|--------|
| **Назначение** | Основной агент генерации текста, который производит нарративную прозу |
| **Вход** | Intent, SimulationResult, GameContext, NarrativePattern |
| **Выход** | Текст прозы |
| **Зависимости** | TNSServer (MCP), LLMQueue |

**Рабочий процесс:**
1. Получает стиль на основе настроения из Gutenberg MCP
2. Строит ограниченный промпт с результатами симуляции и стилем
3. Генерирует прозу через LLM
4. Возвращает отрендеренный текст

### 4. Actor (Ансамбль NPC)

**ID:** `actor`
**Роль:** Управляет взаимодействиями и диалогами NPC
**MCP-инструменты:** Нет

| Аспект | Детали |
|--------|--------|
| **Назначение** | Обрабатывает все диалоги NPC, торговлю, крафт, социальную динамику |
| **Вход** | Intent, SimulationResult, GameContext |
| **Выход** | Текст диалога NPC, изменения состояния |
| **Зависимости** | UnifiedEntityStore, LLMQueue |

**Рабочий процесс:**
1. Маршрутизирует к соответствующему под-обработчику в зависимости от типа намерения
2. Получает скрытые мотивации NPC из профиля L3
3. Генерирует ответ NPC с помощью LLM
4. Вычисляет изменения состояния отношений

### 5. Censor (Линтер)

**ID:** `censor`
**Роль:** Удаляет клише ИИ и обеспечивает согласованность стиля
**MCP-инструменты:** Нет

| Аспект | Детали |
|--------|--------|
| **Назначение** | Очищает прозу, удаляя сгенерированные ИИ клише и анахронизмы |
| **Вход** | Текст прозы, GameContext |
| **Выход** | Очищенный текст прозы |
| **Зависимости** | LLMQueue |

**Рабочий процесс:**
1. Удаляет клише ИИ с помощью regex-паттернов
2. Исправляет анахронизмы на основе контекста мира
3. Полировка на основе LLM для сложных случаев
4. Возвращает очищенный текст

**Распространённые клише ИИ, которые удаляются:**
- "delved", "tapestry", "rich tapestry", "palpable", "visceral"
- "it's worth noting", "it goes without saying"
- "the very fabric of", "on a deeper level"

### 6. Chronicler

**ID:** `chronicler`
**Роль:** Обновляет память мира и ведёт таймлайн
**MCP-инструменты:** Нет

| Аспект | Детали |
|--------|--------|
| **Назначение** | Записывает все значимые события и поддерживает согласованность мира |
| **Вход** | Intent, SimulationResult, GameContext |
| **Выход** | Изменения состояния (обновления памяти NPC) |
| **Зависимости** | UnifiedEntityStore, EventBus |

**Рабочий процесс:**
1. Создаёт описание события из намерения и исхода
2. Публикует в EventBus для других систем
3. Обновляет память NPC для ближайших персонажей
4. Записывает в таймлайн

---

## Сконфигурированные агенты (`DEFAULT_AGENTS`)

Они находятся в `src/services/agent-config.ts` и лежат в основе UI настроек/провайдеров, `LLMQueue`/`LLMClient` и нескольких подсистем. `chronicler` общий с Big Six. Их температура и лимиты токенов берутся из глобальных значений по умолчанию (0.7 / 2048), если не переопределены в `conf/agents.json`.

| ID | Название | Приоритет | Используется для |
|----|------|----------|---------|
| `director` | Режиссёр | 8 | внедрение сюжетного бита (story-beat) |
| `chronicler` | Летописец | 5 | сводка таймлайна (также `@mention`) |
| `story-planner` | Планер | 6 | предложения сюжетных арок (`@mention`) |
| `social-sim` | Социальный симулятор | 4 | социальная динамика NPC (`@mention`) |
| `villain` | Менеджер злодеев | 6 | схемы антагониста (`@mention`) |
| `researcher` | Исследователь | 3 | `IdleResearchScheduler`, оценка предметов (`@mention`) |
| `translation` | Перевод | 2 | English ↔ язык пользователя на выходной границе |

**Шаблоны промптов (переменные шаблона → во что они разрешаются):**

- **director** — `{narrative}`, `{beat}`. Встраивает сюжетный бит в текущее повествование.
- **chronicler** — `{events}`, `{timeline}`. Резюмирует новые события в хронологическом порядке.
- **story-planner** — `{world_state}`, `{characters}`, `{events}`, `{quests}`. Вывод: `{"arc": ..., "quests": [{"title", "description", "objectives"}], "hooks": [...]}`.
- **social-sim** — `{characters}`, `{relationships}`, `{context}`. Описывает изменения отношений и последствия для фракций.
- **villain** — `{villain}`, `{world_state}`, `{recent_actions}`. Планирует следующий ход антагониста.
- **researcher** — `{task}`, `{world_context}`. Вывод: `{"verdict": "plausible|questionable|unrealistic", "confidence", "issues", "suggestions", "enrichedDetails"}`.
- **translation** — `{source_lang}`, `{target_lang}`, `{text}`. Возвращает только переведённый текст.

---

## Система диалогов (v0.33.4)

Новые `DialogueManager` + `DialogueContext` для структурированных диалогов NPC:

| Возможность | Описание |
|---------|-------------|
| **Управление сессиями** | Жизненный цикл: Приветствие → Активный → Прощание |
| **Учитывает отношения** | Приветствия и доступность тем для друзей/нейтральных/врагов |
| **Феодальная иерархия** | Особые приветствия для лорда/вассалов |
| **Тематический выбор** | личное, фракция, квест, торговля, бой, ремесло, слухи, сплетни и т.д. |
| **Запись в память** | Резюме диалогов сохраняются в долгосрочную память NPC |

Доступ через `engine.dialogueManager` (требуется наличие `npcRuntime`).

**Примечание:** Чат `@mentions` маршрутизируется к сконфигурированным обработчикам (`@chronicler`, `@story-planner`, `@social-sim`, `@villain`, `@researcher`), а не к Big Six. `@narrator`, `@director`, `@scene` и `@npc` больше не существуют.

---

## Реестр агентов v2

Big Six регистрируются в `AgentRegistryV2` (`src/services/agent-registry-v2.ts`):

```typescript
import { getAgentRegistryV2 } from './agent-registry-v2';

const registry = getAgentRegistryV2();

// Register agents
registry.register(dramaturgAgent);
registry.register(validatorAgent);
registry.register(stylistAgent);
registry.register(actorAgent);
registry.register(censorAgent);
registry.register(chroniclerAgent);

// Get agent by ID
const dramaturg = registry.get('dramaturg');

// Get agents with specific MCP tool
const withSearch = registry.getAgentsWithTool('search_verses');
```

---

## Интерфейс агента (v0.33.4)

```typescript
interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];

  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}

interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}
```

---

## Глобальные переменные

Эти переменные доступны агентам через игровой контекст:

| Переменная | Описание |
|----------|-------------|
| `{world_name}` | Имя текущего мира (из world_frame.json) |
| `{time}` | Текущее время истории (ISO строка) |
| `{location}` | Текущая локация персонажа |
| `{character}` | Имя активного персонажа |
| `{role}` | Роль пользователя (протагонист, наблюдатель и т.д.) |
| `{rules}` | Правила мира (законы магии, социальные нормы и т.д.) |
| `{timeline}` | Недавние события мира (последние 5 от летописца) |
| `{memories}` | Недавние воспоминания ролевой игры |
| `{facts}` | Установленные факты мира |
| `{npcs}` | Имена ближайших NPC |
| `{history}` | Недавняя история разговора (последние 3 обмена) |
| `{events}` | Недавние события (контекстно-зависимые, последние 3-5) |
| `{world_state}` | Сводка текущего состояния мира |
| `{world_context}` | Контекст мира для исследований |
| `{genre}` | Жанр мира (фэнтези, научная фантастика, ужасы и т.д.) |
| `{magic_system}` | Описание системы магии |
| `{language}` | Основной язык мира (en, ru и т.д.) |
| `{world_description}` | Описание/питч мира |

---

## Руководство по температуре

Сконфигурированные агенты используют глобальные значения по умолчанию (температура 0.7, максимум токенов 2048), если не переопределены в `conf/agents.json`.

| Значение | Эффект | Использовать для |
|-------|--------|---------|
| 0.1 - 0.3 | Сфокусированный, детерминированный | Исследования, проверка фактов, парсинг намерений |
| 0.4 - 0.6 | Сбалансированный | Летописец, социальная симуляция |
| 0.7 - 0.8 | Креативный | Нарратив, диалоги NPC, схемы злодеев |

---

## Использование @agent в чате

Отправьте приватное сообщение агенту из чата. Чат `@mentions` маршрутизируется к сконфигурированным обработчикам, а не к Big Six:

```
@chronicler summarize the last hour
@story-planner suggest the next story beat
@researcher is this medieval sword historically accurate?
@social-sim how do the villagers react?
@villain what does the antagonist do next?
```

Ответы отмечаются синей полоской слева и именем агента в скобках.

Big Six (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) зарегистрированы в `AgentRegistryV2`, но **недоступны** через `@mention`.

---

## Система RAG (Эмбеддинги + Долгосрочная память)

Все агенты имеют полную поддержку эмбеддингов с долгосрочной памятью через RAG:

- **llama.cpp Embedding Server** — модель BGE-M3 на порту 5002 для генерации векторов
- **SQLite Hybrid Search** — ключевой поиск FTS5 + поиск по плотным векторам + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — изоляция памяти для каждого агента и каждой сессии через колонку `role`
- **Память с областью мира (World-Scoped Memory)** — память изолирована для каждого мира, чтобы предотвратить межмировые галлюцинации
- **Mojo Compute Kernels** — 5 Mojo-ядер через FFI с fallback на TypeScript:
  - `probability_ffi.mojo` — Шанс успеха, исходы бросков, батч-вероятность
  - `vector_ffi.mojo` — 4-мерные векторные операции (косинус, L2, скалярное произведение)
  - `vector_full.mojo` — Полноразмерные векторные операции (768-мерный BGE-M3)
  - `batch_ops.mojo` — Батч-операции NPC (убывание возраста, порок, налог, лояльность)
  - `graph_ops.mojo` — Обход графа, RRF-фьюжн, вычисление репутации

**Поток памяти:**
```
Agent Request → AgentMemoryStore → SQLite (hybrid search)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Dense Vectors (BGE-M3)
                              │ Keyword Match │ Cosine Similarity
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Context for LLM Prompt
```

---

## Интеграция MCP (v0.33.4)

### Библейские паттерны

Библейские тексты хранятся в SQLite с гранулярностью на уровне стихов. Каждый стих — атомарный указатель, на который могут ссылаться агенты.

**Инструменты:**
- `search_verses` — Поиск по тексту, книге или ссылке
- `get_pattern` — Получение нарративных паттернов по архетипу, настроению или функции
- `get_archetype` — Получение деталей архетипа по имени

### Стили Gutenberg

Стилистические паттерны, извлечённые из текстов Gutenberg Project. Делексифицированные описания сохраняют структуру без имён персонажей.

**Инструменты:**
- `get_style_pattern` — Поиск стилей по настроению, тегам или описанию
- `apply_style` — Применение стиля к тексту (делексификация и возврат предложений)

### Валидация через Wikipedia

Историческая проверка фактов через Wikipedia API.

**Инструменты:**
- `verify_fact` — Проверка фактического утверждения
- `get_context` — Получение контекста Wikipedia по теме

---

## Система шаблонов

### Как работает userTemplate

Каждый агент хранит `userTemplate` в SQLite (таблица `agent_prompts`) с fallback на JSON-файл. Шаблон содержит плейсхолдеры `{var}`, которые заменяются реальными значениями во время выполнения функцией `resolveTemplate()` (`src/utils/template-resolver.ts`).

**Поток:**
1. Агент загружает конфиг: `loadAgentConfig(agentId, world?, lang?)`
2. Читает `prompts.userTemplate` сначала из SQLite, затем fallback на JSON
3. Вызывает `resolveTemplate(template, vars)` с данными контекста
4. Отправляет разрешённый промпт в LLM

**Если userTemplate не существует** → fallback на `PromptBuilder` (жёстко закодированные TypeScript-шаблоны).

---

## Стилевые профили игроков (v0.33.4)

`PlayerProfileStore` (`src/lib/player-profile-store.ts`) предоставляет кросс-агентные стилевые профили игроков, разделяемые между Stylist и LiteraryV2Generator.

**Отслеживаемые метрики:**
| Метрика | Описание |
|--------|-------------|
| `avg_sentence_len` | Средняя длина предложения в словах |
| `sensory_bias` | Предпочтение сенсорных деталей (0-1) |
| `register_score` | Формальный/неформальный регистр (0-1) |
| `dialogue_ratio` | Доля диалогов в тексте |
| `narrative_distance` | Близкое vs далёкое повествование (0-1) |
| `action_orientation` | Предпочтение действия vs рефлексии (0-1) |
| `emotional_expressiveness` | Уровень эмоциональных деталей (0-1) |
| `preferred_pace` | медленный / средний / быстрый |
| `literary_sophistication` | Сложность словаря/структуры (0-1) |
| `preferred_motifs` | Предпочитаемые нарративные мотивы |
| `anti_patterns` | Избегаемые паттерны |
| `sample_snippets` | Репрезентативные фрагменты текста |
| `confidence` | Достоверность профиля (0-1) |

**Хранение:** `data/player-profiles.db` (SQLite, режим WAL)

---

## Архитектура хранения

### База данных SQLite

Проект использует SQLite через встроенный модуль Bun `bun:sqlite`. Файл базы данных — `tns.db` в настроенном `dbPath` (по умолчанию `./worlds/{active}`).

**Таблицы:**
- `entities` — Сущности мира с полнотекстовым поиском FTS5
- `embeddings` — Векторные эмбеддинги для семантического поиска
- `memories` — Воспоминания ролевой игры с FTS5
- `agent_prompts` — Промпты агентов для каждого мира + языка
- `ui_translations` — Строки UI-переводов для каждого языка + страницы

### Хранение в JSON-файлах (Fallback)

JSON-файлы остаются как fallback во время миграции:

```
conf/
  settings.json          — App-wide settings (LLM, server, language, etc.)
  agents.json            — Global agent model/provider assignments
worlds/{active}/
  agents/{agentId}.json  — Per-world agent prompts (fallback)
```
