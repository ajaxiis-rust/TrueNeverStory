# TrueNeverStory v0.27.0

### Пиши свою книгу просто играя.

TrueNeverStory — ИИ-движок интерактивных нарративов с **архитектурой State-First**. Каждый NPC помнит всё, каждое действие имеет детерминированный исход, а история никогда не заканчивается. Играй за персонажа, исследуй живой мир и наблюдай, как твой выбор формирует сюжет — или позволь миру развиваться самостоятельно.

Построен на TypeScript (Bun + Hono) с C FFI ядрами вычислений для критичных к производительности операций.

**[English](README.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Что нового в v0.27.0

### Оптимизация БД Библии
- **FTS5 поиск** — замена `LIKE '%query%'` на FTS5 `MATCH` для O(1) полнотекстовых запросов (с fallback на LIKE)
- **Batch-обход графа** — `getRelatedVerses()` теперь использует батчевые запросы `IN (...)` вместо N отдельных запросов (N+1 → 1)
- **Индексы стихов** — добавлен `idx_verses_book_chapter` для ускорения фильтрованных запросов
- **Система персонажей** — новый `CharacterDB` с 3 таблицами: `bible_characters`, `bible_character_edges`, `bible_character_mentions`
- **Словарь имён** — 40+ библейских персонажей с мультиязычными вариациями (EN/RU/HE/EL)
- **MCP-тулы для персонажей** — `searchCharacters`, `getCharacter`, `getCharacterEdges`, `getVerseCharacters`
- **Очистка git** — удалено 177MB raw sources + 59MB скомпилированной БД из трекинга
- **Build-скрипты** — `download-sources.sh` + `bootstrap-bible-db.ts` для настройки клиента

### Что нового в v0.27.0

### Архитектура State-First
Движок теперь обрабатывает действия **детерминированно перед генерацией текста**:
1. **Intent Parser** — Zod-валидированные структурированные интенты заменяют regex-маршрутизацию
2. **Simulation Engine** — Mojo FFI вычисляет исходы до генерации прозы
3. **State Mutator** — EntityStore обновляется сразу после логики
4. **Context Builder** — Общий игровой контекст для всех агентов
5. **Генерация прозы** — LLM генерирует текст, ограниченный результатами симуляции

### Интеграция MCP (Literature-as-Code)
- **Библия как stdlib** — Библейские паттерны как нарративные архетипы (SQLite + MCP)
- **Гutenberg как Style CSS** — Делексифицированные стилистические паттерны для рендеринга прозы
- **Wikipedia как Validator** — Проверка исторической достоверности через внешние знания

### The Big Six Агенты
Консолидация 14 агентов в 6 специализированных ролей:

| Агент | Роль | Описание |
|-------|------|----------|
| **Драматург** | Архитектор | Выбор нарративных паттернов из библейских архетипов |
| **Валидатор** | Факт-чекер | Верификация фактов через Wikipedia MCP |
| **Стилист** | Рассказчик | Рендеринг прозы через стилистические паттерны Gutenberg |
| **Актёр** | ансамбль NPC | Управление диалогами NPC с L3 скрытыми мотивациями |
| **Цензор** | Линтер | Удаление ИИ-клише и обеспечение стилевой согласованности |
| **Летописец** | Память мира | Обновление таймлайна и состояния мира |

### Система Heartbeat
Индикаторы прогресса в реальном времени в чате:
- "Анализирую ввод..."
- "Бросаю кости..."
- "Исход: Успех (73%)"
- "Плету нарратив..."
- "Готово"

### Interlingua (Английский как внутренний язык)
Все операции между агентами и MCP используют английский для экономии токенов и точности. Перевод происходит на выходе пайплайна.

---

## Возможности

| Возможность | Описание |
|-------------|----------|
| **State-First пайплайн** | Детерминированная симуляция → мутация состояния → генерация ограниченной прозы |
| **6 ИИ-агентов** | Драматург, Валидатор, Стилист, Актёр, Цензор, Летописец |
| **Интеграция MCP** | Библейские паттерны, стили Gutenberg, верификация Wikipedia |
| **Живой мир** | Персонажи, локации, предметы, фракции — всё связано в графе знаний с O(1) доступом |
| **Память и RAG** | Векторный поиск по памяти (BGE-M3 + SQLite гибридный FTS5/плотный/RRF) |
| **Система вероятностей** | Детерминированные исходы для боя, убеждения, скрытности, романа — динамические модификаторы |
| **Романтика и социум** | Управление отношениями, фракции, альянсы, феодальная иерархия, диалоги NPC |
| **Квесты** | Динамическая генерация квестов, цели, награды, цепочки, временные ограничения |
| **Инвентарь и торговля** | Предметы с редкостью, характеристиками, экипировкой, золотом, торговые операции с NPC |
| **Экономика NPC** | Феодальная иерархия (10 рангов), налоги, производство еды, система семей, 34 архетипа |
| **Движок правил** | 14 предопределённых социальных/экономических систем (феодализм, демократия, анархия и др.) с матрицей синергий |
| **Мульти-миры** | Изолированное выполнение миров с мониторингом ресурсов (память, CPU, токены) |
| **Межмировое общение** | Обмен событиями между мирами с порталами и общей памятью |
| **Система плагинов** | Расширяемая архитектура с менеджером плагинов, хуками жизненного цикла и API |
| **Фича-флаги** | A/B тестирование, постепенный rollout, хеш-таргетинг по процентам |
| **Версионирование API** | v1/v2 эндпоинты с заголовками deprecation |
| **Стриминг** | WebSocket + SSE для доставки нарратива в реальном времени с heartbeat |
| **i18n (7 языков)** | EN, RU, DE, FR, ES, JA, ZH — интерфейс, промпты, имена агентов |
| **Авторизация** | Сессии с HttpOnly cookie, CSRF-защита, сессии в SQLite |
| **Хранение в SQLite** | Сущности, эмбеддинги, память, промпты, переводы — всё в SQLite |
| **Circuit Breaker** | Автоматический фейlover LLM провайдеров с цепочкой запасных |
| **Структурированное логирование** | Trace ID, correlation ID, метрики для отладки multi-agent workflow |

---

## Поддерживаемые платформы

| Платформа | Статус | Заметки |
|-----------|:------:|---------|
| Linux x86_64 | ✅ | Полная поддержка, FFI ядра |
| Linux ARM64 | ✅ | Полная поддержка, FFI ядра |
| macOS ARM64 | ✅ | Apple Silicon |
| macOS x86_64 | ✅ | Intel Mac |
| Windows x86_64 | ✅ | C FFI через Zig |

Сервер автоматически определяет FFI ядра — при отсутствии использует чистый TypeScript.

---

## Быстрый старт

**Не требует Bun, Node.js или другого рантайма.** Просто скачай и запусти.

### 1. Скачай

Получи последний релиз для твоей платформы из [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Платформа | Файл |
|-----------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Запусти

Лаунчер автоматически определяет твой LLM провайдер (Ollama, LM Studio, OpenAI, llama.cpp), настраивает `.env` и запускает сервер.

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh

# Windows (PowerShell)
# Распакуй tns-windows-x64.zip, затем:
.\startgame.ps1
```

**Параметры запуска:**
```bash
./startgame.sh --local    # CORS=localhost только (безопасно для разработки)
./startgame.sh --remote   # CORS=* (по умолчанию, разрешает внешний доступ)
```

**Из исходников (требует Bun):**
```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
./startgame.sh            # Linux/macOS
.\startgame.ps1           # Windows PowerShell
```

### 3. Открой

Перейди на **http://localhost:8000** — пароль: **`changeme`**

Смени пароль в Настройках после первого входа.

Вот и всё. Нет настройки базы данных, нет установки пакетов, нет файлов конфигурации для редактирования.

---

## Настройка LLM

Открой страницу **Настройки** или отредактируй `.env`:

### Ollama (локально, бесплатно)

```bash
ollama pull llama3
ollama serve
```

```
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
```

### OpenAI

```
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
```

### LM Studio

```
WORLD_LLM_BASE_URL=http://localhost:1234/v1
WORLD_LLM_API_KEY=lm-studio
WORLD_LLM_MODEL=your-model
```

Также работает с vLLM, Anthropic, Google и любым OpenAI-совместимым API.

---

## Структура проекта

```
TrueNeverStory/
├── src/
│   ├── config/           # Zod-валидированная конфигурация окружения
│   ├── lib/              # LLM клиент, SQLite хранилище, vector ops, сессии, circuit breaker, фича-флаги
│   ├── memory/           # WorldMemory, когнитивный пайплайн, извлечение сущностей
│   ├── middleware/        # Auth, rate limiter, security headers, CORS, logger
│   ├── models/           # Entity, chat, probability, romance, quest, item, intent, simulation, heartbeat
│   ├── mcp/              # MCP сервер, парсеры Bible/Gutenberg, инструменты Wikipedia
│   ├── plugins/          # Интерфейс и менеджер плагинов
│   ├── routes/           # API роуты (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Движок социальных/экономических правил (14 правил, матрица синергий)
│   ├── services/         # 60+ сервисов (roleplay engine, агенты, экономика, world isolator, cross-world bus)
│   │   ├── agents/       # v0.27.0 новые агенты (Драматург, Валидатор, Стилист, Актёр, Цензор, Летописец)
│   │   └── ...
│   ├── intelligence/     # Анализатор графов, детектер дубликатов, рекомендер
│   ├── i18n/             # Языковые пакеты (7 языков)
│   ├── store/            # EntityStore с O(1) NameIndex, WorldStore
│   └── utils/            # Logger, hash, sanitize, template resolver
├── mojo/kernels/         # C FFI ядра вычислений (компилируются через Zig)
├── public/               # Web UI (терминальный тёмный интерфейс с heartbeat прогрессом)
├── worlds/               # Данные миров (SQLite БД, сущности, сессии)
├── conf/                 # Конфигурация (settings, agents, providers, registry)
└── tests/                # Тестовый набор
```

---

## Архитектура: State-First пайплайн

```
Ввод игрока
  │
  ▼
Intent Parser (Zod валидация)
  │
  ▼
Simulation Engine (Mojo FFI)
  │ исход, вероятность, stateChanges
  ▼
State Mutator (EntityStore L1-L3)
  │
  ▼
Context Builder (общее игровое состояние)
  │
  ▼
Драматург (выбор библейского паттерна через MCP)
  │
  ▼
Стилист (рендеринг через стили Gutenberg через MCP)
  │
  ▼
Цензор (удаление ИИ-клише)
  │
  ▼
Translation Service (английский → язык пользователя)
  │
  ▼
Ответ пользователю
```

---

## Примеры

### Использование API

```bash
# Вход
curl -c cookies.txt -X POST http://localhost:8000/login -d "password=changeme"

# Настройка сессии
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Арагорн", "role": "protagonist"}'

# Отправка сообщения
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Я обнажаю меч и вступаю в бой с драконом"}'

# Поиск сущностей
curl -b cookies.txt "http://localhost:8000/api/search?q=dragon"

# Список доступных правил
curl -b cookies.txt "http://localhost:8000/api/rules"

# Создание межмирового портала
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### SSE Стриминг с Heartbeat

```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: 'Я исследую древние руины' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    
    if (event.type === 'heartbeat') {
      console.log(`Прогресс: ${event.message} (${event.progress * 100}%)`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.content);
    }
  }
}
```

---

## Для разработчиков

Полная документация архитектуры, справочник DI контейнера и руководство по внесению вклада: [DEV.README.md](docs/DEV.README.ru.md)

### Требования

- [Bun](https://bun.sh) v1.0+

### Настройка

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Открой http://localhost:8000

### Команды

| Команда | Описание |
|---------|----------|
| `bun run dev` | Разработка с горячей перезагрузкой |
| `bun run start` | Продакшн режим |
| `bun run lint` | Проверка типов |
| `bun test` | Запуск тестов |
| `bun run build` | Сборка бандла |

---

## Сборка бинарных релизов

Кросс-компиляция через Zig для всех платформ:

```bash
cd mojo/kernels
./build.sh native           # Текущая платформа
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Все цели
```

Компиляция серверного бинарника:

```bash
bun build --compile --outfile tns-server src/index.ts
```

Смотри [COMPILE.md](docs/COMPILE.md) для деталей. GitHub Actions собирает все платформы автоматически при пуше тега.

---

## Последние изменения

### v0.27.0 — Оптимизация БД Библии

**Производительность:**
- FTS5 поиск с fallback на LIKE — O(n) → O(1) полнотекстовые запросы
- Batch-обход графа — N+1 → 1 SQL запросов для связей стихов
- Индексы стихов + метод VACUUM для компактации БД

**Возможности:**
- Система персонажей (CharacterDB с 3 SQLite таблицами)
- Словарь библейских имён (40+ персонажей, варианты EN/RU/HE/EL)
- MCP-тулы: поиск, получение, связи, упоминания, персонажи стихов
- Поддержка gzip для файлов-источников Библии
- Скрипты загрузки и.bootstrap для настройки клиента

**Обслуживание:**
- Удалено 177MB sources + 59MB скомпилированной БД из git
- Добавлен .gitignore для sources и скомпилированной БД

### v0.27.0 — Literary Compiler и экономические модели

**Literary Compiler (Фазы 0-6):**
- 4 офлайн-анализ прохода: Драматургический, Стилистический, Эмоциональный, Метаданные
- SQL-схема с FTS5 для поиска шаблонов квестов
- Линтер для валидации, дедупликации и обнаружения клише
- Anti-moralizing промпт для агента Стилист

**Экономические модели:**
- JubileeManager — сброс долгов каждые 50 лет, возврат земель, буст лояльности
- FactionTaxDilemma — автогенерация налоговых споров фракций с выбором игрока
- FactionLaborRules — per-faction фиксированные/пропорциональные зарплаты, конфликты лояльности
- EconomicCycles — модель Иосифа с циклами изобилия/перехода/голода

**Интеграция экономики:**
- EconomicService фасад для всех 4 экономических моделей
- Интеграция с DirectorLoop: переходы циклов, события юбилея, генерация дилемм
- Интеграция NPC-Economy с расчётом зарплат по правилам труда
- 7 новых MCP инструментов: get_economic_phase, get_price_modifier, calculate_price, get_wage, generate_dilemma, check_jubilee, get_jubilee_info

**Исправления:**
- Удалена неиспользуемая зависимость `better-sqlite3` (проект использует `bun:sqlite`)
- Исправлены хардкод имена фракций в вариантах дилемм — теперь используются реальные имена
- Исправлен хардкод списка фракций в DirectorLoop — теперь читается из конфига мира
- Исправлено дрифтование приближения года — используется `getFullYear()` вместо ручного вычисления

### v0.27.0 — Архитектура State-First

**Рефакторинг ядра:**
- Intent Parser с Zod-схемами (6 типов интентов: movement, dialogue, action, command, observation, meta)
- Simulation Engine с детерминированными исходами Mojo FFI
- State Mutator для немедленного обновления EntityStore
- Context Builder для общего игрового состояния
- Рефакторинг RoleplayEngine как тонкого оркестратора

**Интеграция MCP:**
- TNS MCP сервер с инструментами Bible, Gutenberg и Wikipedia
- Bible Parser для внешних SQLite баз с FTS поиском
- Gutenberg Parser с извлечением стилей и делексификацией
- Wikipedia Validator для проверки исторических фактов

**Консолидация агентов:**
- 14 агентов → 6 специализированных ролей (Драматург, Валидатор, Стилист, Актёр, Цензор, Летописец)
- AgentRegistryV2 для управления жизненным циклом
- Интеграция MCP инструментов для каждого агента

**Система Heartbeat:**
- Индикаторы прогресса в реальном времени через SSE
- HeartbeatUI компонент фронтенда
- Прогресс-бар с сообщениями этапов

**Interlingua:**
- Английский как внутренний язык для всех операций
- TranslationService на выходе пайплайна

**Исправления:**
- Исправлены все ошибки TypeScript (0 ошибок)
- Исправлены типы параметров SQLite запросов
- Исправлены несоответствия сигнатур LLMQueue

### v0.22.2 — Конструктор тем

- Отдельная страница конструктора тем на `/theme-builder`
- 8 готовых тем: Dracula, Nord, Monokai, Solarized, Gruvbox, Tokyo Night, One Dark, Catppuccin
- Палитра цветов для 14 CSS переменных (фоны, границы, текст, акценты)
- Выбор шрифтов для моно, основного и дисплейного
- Живой превью панель со всеми UI компонентами
- Экспорт/импорт тем как JSON файлы
- Навигационная ссылка со страницы настроек

### v0.22.2 — Исправление системы тем

- Исправлен `theme-custom.css` — исправлен синтаксис CSS переменных (использовал `var()` вместо `--name: value`)
- Добавлены недостающие переменные `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` в кастомную тему
- Все 5 тем (Dark, Light, Terminal, Cyberpunk, Custom) теперь работают корректно через кнопки выбора

### v0.20.4 — Исправление графа мира + модалка статистики + инъекция языка + темы

- Исправлен мёртвый `buildRelationships()` — автоматически строит эвристические отношения при запуске
- Добавлен эндпоинт `GET /api/worlds/:name/detail` для статистики мира
- Новая модалка статистики мира со списками сущностей, правил и деталями персонажей
- Инъекция языковой инструкции — ответы LLM соответствуют языку интерфейса (7 языков)
- Система тем — 5 встроенных тем (Dark, Light, Terminal, Cyberpunk, Custom) + конструктор

### v0.20.1 — Исправление бинарника движка правил

- Исправлен крах эндпоинта `/api/rules` в скомпилированном бинарнике Bun
- Заменён `import.meta.dir` на `process.cwd()` для разрешения директории правил
- Решена ошибка ENOENT (`/$bunfs/root/../rules/social`) в скомпилированном бинарнике

---

## Лицензия

MIT
