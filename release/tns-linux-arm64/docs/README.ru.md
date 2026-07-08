# TrueNeverStory v0.22.2

### Пиши свою книгу просто играя.

TrueNeverStory — ИИ-движок интерактивных нарративов. Каждый NPC помнит всё, каждое действие имеет шанс, а история никогда не заканчивается. Играй за персонажа, исследуй живой мир и наблюдай, как твой выбор формирует сюжет — или позволь миру развиваться самостоятельно.

Построен на TypeScript (Bun + Hono) с C FFI ядрами вычислений для критичных к производительности операций.

**[English](README.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | [日本語](README.ja.md) | [中文](README.zh.md)**

---

## Возможности

| Возможность | Описание |
|-------------|----------|
| **Живой мир** | Персонажи, локации, предметы, фракции — всё связано в графе знаний с O(1) доступом |
| **14 ИИ-агентов** | Рассказчик, Режиссёр, NPC, Сцена, Летописец, Планер, Злодей, Исследователь, Историк, Картограф, Торговец, Квестодатель, Хранитель знаний, Соц. симуляция |
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
| **Стриминг** | WebSocket + SSE для доставки нарратива в реальном времени |
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

**Не нужно устанавливать Bun, Node.js или что-либо ещё.** Просто скачай и запусти.

### 1. Скачать

Скачать последний релиз для вашей платформы из [GitHub Releases](https://github.com/ajaxiis-rust/TrueNeverStory/releases/latest):

| Платформа | Файл |
|-----------|------|
| Linux x86_64 | `tns-linux-x64.tar.gz` |
| Linux ARM64 | `tns-linux-arm64.tar.gz` |
| macOS ARM64 | `tns-macos-arm64.tar.gz` |
| macOS x86_64 | `tns-macos-x64.tar.gz` |
| Windows x86_64 | `tns-windows-x64.zip` |

### 2. Запустить

```bash
# Linux / macOS
tar xzf tns-linux-x64.tar.gz
cd tns-linux-x64
chmod +x startgame.sh
./startgame.sh          # по умолчанию: --remote

# Windows PowerShell
tar xzf tns-windows-x64.zip
cd tns-windows-x64
.\startgame.ps1         # по умолчанию: --remote
```

Параметры запуска:
- `--local` — подключиться к локальному экземпляру Ollama
- `--remote` — использовать удалённый API LLM (по умолчанию)

#### Из исходного кода

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Откройте **http://localhost:8000**

### 3. Открыть

Перейти на **http://localhost:8000** — пароль: **`changeme`**

Смените пароль в настройках после первого входа.

Всё. Никакой настройки базы данных, установки пакетов или редактирования конфигов.

---

## Настройка LLM

Откройте страницу **Настройки** или отредактируйте `.env`:

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

## Строение проекта

```
TrueNeverStory/
├── src/
│   ├── config/           # Конфигурация окружения (Zod)
│   ├── lib/              # LLM клиент, SQLite хранилище, векторные операции, circuit breaker, фича-флаги
│   ├── memory/           # WorldMemory, когнитивный пайплайн
│   ├── middleware/        # Авторизация, rate limiter, заголовки безопасности, логгер
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── plugins/          # Интерфейс и менеджер плагинов
│   ├── routes/           # API маршруты (chat, entities, agents, settings, v1, v2, cross-world, plugins)
│   ├── rules/            # Движок социальных/экономических правил (14 правил, матрица синергий)
│   ├── services/         # 55+ сервисов (движок ролевой игры, агенты, экономика, изоляция миров, шина событий)
│   ├── intelligence/     # Анализ графа, детектирование дубликатов
│   ├── i18n/             # Языковые пакеты (7 языков)
│   ├── store/            # EntityStore с O(1) индексом по именам, WorldStore
│   └── utils/            # Логгер, хеши, санитайзер, шаблоны
├── mojo/kernels/         # C FFI вычислительные ядра (компиляция через Zig)
├── public/               # Веб-интерфейс (терминальный стиль)
├── worlds/               # Данные миров (SQLite БД, сущности, сессии)
├── conf/                 # Конфигурация (настройки, агенты, провайдеры, реестр)
└── tests/                # Тесты
```

---

## API

### Авторизация

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/login` | Страница входа |
| POST | `/login` | Аутентификация (`password=...`) |
| POST | `/logout` | Очистить сессию |

### Чат и ролевая игра

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| POST | `/api/chat/setup` | Инициализация сессии |
| POST | `/api/chat/message` | Отправить сообщение, получить нарратив |
| POST | `/api/chat/stream` | SSE стриминг |
| GET | `/api/chat/session` | Текущее состояние сессии |
| GET | `/api/chat/history` | История диалога |

### Сущности и граф

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/entity/:uid` | Детали сущности |
| GET | `/api/neighbors/:uid` | Соседи с обходом в глубину |
| GET | `/api/path?source=&target=` | Кратчайший путь |
| GET | `/api/search?q=` | Поиск по имени или семантике |
| GET | `/api/graph/summary` | Статистика графа |

### Агенты и i18n

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/agents` | Список конфигураций агентов |
| PUT | `/api/agents/:id` | Обновить конфигурацию агента |
| PUT | `/api/agents/:id/prompts/:lang` | Обновить промпты по языку |
| GET | `/api/i18n/translations/:lang/:page` | Получить переводы |
| PUT | `/api/i18n/translations` | Обновить переводы |

### Движок правил

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/rules` | Список доступных правил |
| GET | `/api/rules/:id` | Детали правила |
| POST | `/api/rules/validate` | Валидация JSON правила |

### Межмировое общение

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/cross-world/status` | Статус межмирового общения |
| POST | `/api/cross-world/enable` | Включить межмировое общение |
| POST | `/api/cross-world/disable` | Выключить межмировое общение |
| GET | `/api/cross-world/portals` | Список порталов |
| POST | `/api/cross-world/portals` | Создать портал |
| DELETE | `/api/cross-world/portals/:id` | Удалить портал |
| GET | `/api/cross-world/events` | Журнал событий |

### Плагины

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/plugins` | Список зарегистрированных плагинов |
| GET | `/api/plugins/:id` | Детали плагина |
| GET | `/api/plugins/:id/capabilities` | Возможности плагина |

### Фича-флаги

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| GET | `/api/feature-flags` | Список фича-флагов |
| PUT | `/api/feature-flags/:id` | Обновить фича-флаг |

### Система

| Метод | Эндпоинт | Описание |
|-------|-----------|----------|
| POST | `/api/system/pause` | Поставить фоновые процессы на паузу |
| POST | `/api/system/resume` | Возобновить фоновые процессы |
| GET | `/api/health` | Проверка работоспособности |

### WebSocket

| Эндпоинт | Описание |
|----------|----------|
| `ws://host:8000/ws/roleplay/:sessionId` | Стриминг ролевой игры в реальном времени |

---

## Примеры

### API

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
curl -b cookies.txt "http://localhost:8000/api/search?q=дракон"

# Список доступных правил
curl -b cookies.txt "http://localhost:8000/api/rules"

# Создание межмирового портала
curl -b cookies.txt -X POST http://localhost:8000/api/cross-world/portals \
  -H "Content-Type: application/json" \
  -d '{"world1": "world-a", "world2": "world-b"}'
```

### WebSocket стриминг

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'Я захожу в таверну и осматриваюсь'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative);
};
```

---

## Для разработчиков

Полная документация по архитектуре, DI контейнеру и гайд по контрибьюции: [DEV.README.ru.md](docs/DEV.README.ru.md)

### Требования

- [Bun](https://bun.sh) v1.0+

### Установка

```bash
git clone https://github.com/ajaxiis-rust/TrueNeverStory.git
cd TrueNeverStory
bun install
bun run dev
```

Открыть http://localhost:8000

### Команды

| Команда | Описание |
|---------|----------|
| `bun run dev` | Разработка с hot reload |
| `bun run start` | Продакшн режим |
| `bun run lint` | Проверка типов |
| `bun test` | Запуск тестов |
| `bun run build` | Сборка бандла |

---

## Сборка бинарников

Кросс-компиляция через Zig для всех платформ:

```bash
cd mojo/kernels
./build.sh native           # Текущая платформа
./build.sh aarch64-linux    # ARM64 Linux
./build.sh x86_64-windows   # Windows x64
./build.sh list             # Все таргеты
```

Компиляция бинарника сервера:

```bash
bun build --compile --outfile tns-server src/index.ts
```

См. [COMPILE.md](docs/COMPILE.md) для деталей. GitHub Actions собирает все платформы автоматически при пуше тега.

---

## Недавние изменения

### v0.22.2 — Исправление системы тем

- Исправлен `theme-custom.css` — корректный синтаксис CSS-переменных (было `var()` вместо `--name: value`)
- Добавлены недостающие переменные `--accent-subtle`, `--success-subtle`, `--warning-subtle`, `--interactive-subtle` в пользовательскую тему
- Все 5 тем (Тёмная, Светлая, Терминальная, Киберпанк, Пользовательская) корректно переключаются через кнопки

### v0.20.4 — Исправление графа мира + модалка статистики + инъекция языка + темы

- Исправлен мёртвый `buildRelationships()` — автогенерация эвристических связей при старте
- Добавлен эндпоинт `GET /api/worlds/:name/detail` для статистики мира
- Новая модалка статистики мира со списками сущностей, правилами и деталями персонажей
- Инъекция языковой инструкции — ответы LLM соответствуют языку интерфейса (7 языков)
- Система тем — 5 встроенных тем (Тёмная, Светлая, Терминальная, Киберпанк, Пользовательская) + конструктор

### v0.20.1 — Исправление движка правил для бинарника

- Исправлен крах `/api/rules` в скомпилированном Bun бинарнике
- Заменён `import.meta.dir` на `process.cwd()` для разрешения путей каталогов правил
- Решена ошибка ENOENT (`/$bunfs/root/../rules/social`) в скомпилированном бинарнике
- Затронуты `src/routes/rules.ts` и `src/rules/rules-engine.ts`

### v0.20.0 — Архитектурные улучшения

Полная архитектурная переработка за 5 этапов:

**Этап 1-2:**
- Разбиение NarrativeService (Bootstrapper + Facade + Service)
- Единая модель агентов с интерфейсом и базовым классом
- Event Sourcing с доменными событиями и снимками
- Circuit Breaker для LLM с автоматическим фейloverом
- Реестр агентов с 4 типами источников (builtin, config, api, plugin)
- Структурированное логирование с trace ID и correlation

**Этап 3:**
- Движок правил — 14 предопределённых систем (феодализм, демократия, анархия и др.)
- Матрица синергий, технологические зависимости, модификаторы счастья
- Валидатор правил и моделирование культурного дрейфа
- Фича-флаги с A/B тестированием и постепенным rollout
- Версионирование API (v1/v2) с заголовками deprecation
- WorldStore — миграция данных мира в SQLite

**Этап 4:**
- Изоляция мульти-миров с мониторингом ресурсов
- Межмировое общение с порталами и событиями
- Система плагинов с менеджером и хуками жизненного цикла

**Этап 5:**
- Обновление документации (ARCHITECTURE, API, PLUGIN-GUIDE, MIGRATION)

→ [ARCHITECTURE.md](docs/ARCHITECTURE.md) | [PLUGIN-GUIDE.md](docs/PLUGIN-GUIDE.md) | [MIGRATION.md](docs/MIGRATION.md)

### v0.15.0 — Усиление безопасности

- Сессии в SQLite (переживают перезапуски)
- Валидация токена WebSocket
- Защита от path traversal (статические файлы, имена миров, главы)
- CSRF-защита на форме входа
- Secure флаг cookie, ужесточённый CSP
- Санитизация сообщений об ошибках

→ [security.md](security.md) | [SECURITY-log.md](SECURITY-log.md)

### v0.14.1 — C FFI ядра и кросс-компиляция

- 5 вычислительных ядер перенесены из Mojo на чистый C
- Кросс-компиляция через Zig для 10 платформ
- Пауза/возобновление фоновых процессов
- GitHub Actions CI/CD

---

## Лицензия

---

🔗 **Проект:** [https://github.com/ajaxiis-rust/TrueNeverStory](https://github.com/ajaxiis-rust/TrueNeverStory)

Apache 2.0
