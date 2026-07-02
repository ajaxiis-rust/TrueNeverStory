# TrueNeverStory v0.10.3 – Платформа для создания интерактивных нарративных игр

**TrueNeverStory v0.10.3** – современная реализация платформы фэнтези-миров [BRING](https://github.com/Eva-E1/BRING), перенесённая с Python на высокопроизводительный гибридный стек:

- **TypeScript (Bun + Hono)** – Веб-сервер, API, WebSocket, маршрутизация, аутентификация, streaming, бизнес-логика
- **Mojo FFI** – Вычислительные ядра для вероятностей и векторных операций (опционально, с TS fallback)

> *«От одного промпта до живого, дышащего мира – где каждый NPC помнит, каждое действие имеет шанс, и история никогда не заканчивается.»*

---

## Возможности

| Возможность | Описание |
|-------------|----------|
| **Слоёная генерация мира** | Каждая сущность (персонаж, локация, предмет, фракция) имеет три слоя: L1 (классификация), L2 (детали), L3 (секреты) |
| **Графовые знания** | Все связи в ориентированном графе с O(1) поиском, BFS-обходом, управлением ветками |
| **Самооптимизируемая память** | Вектор-ускоренная память с когнитивным пайплайном (извлечение сущностей, детекция противоречий, болевые сигналы) |
| **RAG для всех агентов** | Полная поддержка эмбеддингов через llama.cpp (BGE-M3) + гибридный поиск SQLite (FTS5 + плотные векторы + RRF) |
| **Система вероятностей** | Детерминированные исходы для боя, убеждения, скрытности, романтика с динамическими модификаторами |
| **Система романса** | Полное управление романтическими отношениями с вероятностными действиями |
| **Живой директор** | Фоновый агент развивает сюжетные арки, планы злодеев, взаимодействия NPC |
| **Иммерсивный ролевой движок** | Третье лицо, диалоги NPC, переходы сцен – LLM никогда не говорит за вашего персонажа |
| **Система квестов** | Динамическая генерация квестов и отслеживание целей |
| **Агент Researcher** | Проверка фактов, валидация реализма, историческая точность для рецептов, персонажей и сцен |
| **Интеллект NPC** | Поиск памяти, автономное поведение, социальные связи, обогащённый контекст диалога |
| **14 специализированных агентов** | Рассказчик, Режиссёр, Сцена, NPC, Летописец, Планер, Соц. динамика, Злодей, Исследователь, Историк, Картограф, Торговец, Квестодатель, Хранитель знаний |
| **WebSocket в реальном времени** | Живая трансляция ролевой игры и событий памяти |
| **SSE Streaming** | Прогрессивная доставка нарратива через Server-Sent Events |
| **i18n (7 языков)** | Полная локализация: EN, RU, DE, FR, ES, JA, ZH — интерфейс, промпты, имена агентов |
| **Хранение в SQLite** | Промпты агентов и UI-строки хранятся в SQLite по мирам и языкам |
| **Парольная авторизация** | Сессии через HttpOnly cookies |
| **Терминальный UI** | Красивый тёмный интерфейс в стиле терминала |

---

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    Браузер (Terminal UI)                 │
│              WebSocket + REST + SSE                      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼─────────────────────────────────┐
│              TypeScript (Bun + Hono)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ HTTP API │ │WebSocket │ │SSE Stream│ │   Auth     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬──────┘  │
│       └─────────────┼───────────┼─────────────┘         │
│  ┌──────────────────▼───────────▼─────────────────────┐  │
│  │              Сервисный слой                         │  │
│  │  RoleplayEngine │ ProbabilityEngine │ RomanceEngine│  │
│  │  QuestManager   │ WorldClock        │ Director     │  │
│  │  StoryPlanner   │ VillainManager    │ SocialSim    │  │
│  │  ResearcherAgent│ CrafterAgent      │ Chronicler   │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Система памяти (WorldMemory)               │  │
│  │  VectorIndex │ CognitivePipeline │ EntityExtractor │  │
│  │  Scoring     │ Partitions        │ WriteBuffer     │  │
│  └───────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │           Слой данных (EntityStore + JSON)           │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Mojo FFI (опционально, авто-детект)           │  │
│  │  Probability Kernels │ Vector Operations           │  │
│  │  .so/.dylib → dlopen() или TypeScript fallback      │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
```

---

## Быстрый старт

### Требования

- [Bun](https://bun.sh) v1.0+ (для разработки)
- LLM API, совместимый с OpenAI (OpenAI, Ollama, vLLM, LM Studio и т.д.)

Для запуска скомпилированного бинарника — ничего не нужно.

### 1. Установка

```bash
cd TNS
bun install
```

### 2. Настройка LLM

Откройте `http://localhost:8000/settings` и настройте LLM провайдер:

- **Ollama** (локально): `http://localhost:11434/v1`, модель: `llama3`
- **OpenAI**: `https://api.openai.com/v1`, модель: `gpt-4o-mini`
- **vLLM** (локально): `http://localhost:8000/v1`
- **LM Studio**: `http://localhost:1234/v1`

Или отредактируйте `conf/settings.json` напрямую.

### 3. Запуск

```bash
bun run dev
```

Откройте `http://localhost:8000` и войдите с паролем: **`changeme`**

Измените пароль в настройках после первого входа.

### Бинарник (без зависимостей)

```bash
# Скачайте с GitHub Releases, затем:
chmod +x tns-server
./tns-server
# Вход: http://localhost:8000 — пароль: changeme
```

---

## Примеры использования

### Запуск из бинарника (без зависимостей)

Скачайте последний релиз для вашей платформы и запустите напрямую:

```bash
# Linux / macOS
chmod +x tns-server
./tns-server

# Windows
tns-server.exe
```

Не нужен Bun, Node.js или любой другой рантайм. Просто настройте `.env` и запустите.

### Запуск из исходников (разработка)

```bash
# Режим разработки с горячей перезагрузкой
bun run dev

# Продакшн режим (без горячей перезагрузки)
bun run start

# Сборка бандла (без бинарника)
bun run build
```

### Запуск с локальным LLM (Ollama)

```bash
# 1. Запустите Ollama с моделью
ollama pull llama3
ollama serve

# 2. Настройте TNS для работы с Ollama
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_API_KEY=ollama
WORLD_LLM_MODEL=llama3
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

# 3. Запустите сервер
./tns-server
```

### Запуск с OpenAI API

```bash
cat > .env << 'EOF'
WORLD_LLM_BASE_URL=https://api.openai.com/v1
WORLD_LLM_API_KEY=sk-your-key-here
WORLD_LLM_MODEL=gpt-4o-mini
WORLD_SERVER_HOST=0.0.0.0
WORLD_SERVER_PORT=8000
AUTH_PASSWORD=mypassword
EOF

./tns-server
```

### Примеры API запросов

```bash
# Авторизация
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "password=mypassword"

# Начать новую сессию
curl -b cookies.txt -X POST http://localhost:8000/api/chat/setup \
  -H "Content-Type: application/json" \
  -d '{"character": "Арагорн", "role": "protagonist"}'

# Отправить сообщение и получить нарратив
curl -b cookies.txt -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Я обнажаю меч и встаю перед драконом"}'

# Стриминговый ответ (SSE)
curl -b cookies.txt -N http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Расскажи мне об этом древнем лесе"}'

# Поиск сущностей
curl -b cookies.txt "http://localhost:8000/api/search?q=дракон"

# Получить информацию о сущности
curl -b cookies.txt http://localhost:8000/api/entity/uid-character-aragorn

# Получить соседей в графе
curl -b cookies.txt "http://localhost:8000/api/neighbors/uid-location-rivendell?depth=2"

# Проверить вероятность
curl -b cookies.txt http://localhost:8000/api/probability/aragorn/combat

# Список квестов
curl -b cookies.txt http://localhost:8000/api/quests
```

### WebSocket для реалтайм-ролплея

```javascript
// Подключение к WebSocket ролплея
const ws = new WebSocket('ws://localhost:8000/ws/roleplay/session-id');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'message',
    content: 'Я вхожу в таверну и осматриваюсь'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.narrative); // Потоковый нарратив
};
```

### Компиляция из исходников

```bash
# Установите Mojo (опционально, для ядер производительности)
curl https://get.modular.com | sh
modular install mojo

# Компиляция для текущей платформы
./build.sh compile

# Компиляция для конкретной платформы
./build.sh compile linux-x64
./build.sh compile macos-arm64

# Кросс-компиляция для всех платформ
./build.sh cross

# Подробности в COMPILE.md
```

---

## API Эндпоинты

### Аутентификация

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/login` | Страница входа |
| POST | `/login` | Аутентификация (форма: `password=...`) |
| POST | `/logout` | Очистка сессии |

### Чат

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/chat/setup` | Инициализация сессии |
| POST | `/api/chat/message` | Отправить сообщение, получить нарратив |
| POST | `/api/chat/stream` | SSE streaming |
| GET | `/api/chat/session` | Текущее состояние сессии |
| GET | `/api/chat/history` | История диалогов |

### Сущности и граф

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/entity/:uid` | Данные сущности |
| GET | `/api/neighbors/:uid` | Соседи с глубиной |
| GET | `/api/path` | Кратчайший путь |
| GET | `/api/search` | Поиск по имени или семантический |
| GET | `/api/graph/summary` | Статистика графа |

### Ветки

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/branch/create` | Создать ветку |
| POST | `/api/branch/switch` | Переключить ветку |
| POST | `/api/branch/merge` | Слить в main |
| GET | `/api/branch/list` | Список веток |

### Вероятности

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/probability/:char/:profile` | Шанс успеха |
| POST | `/api/probability/modifier` | Применить модификатор |
| GET | `/api/probability/modifiers/:entity` | Активные модификаторы |

### Романс

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/romance/:c1/:c2` | Статус отношений |
| POST | `/api/romance/attempt/:action` | Попытка романтического действия |
| GET | `/api/romance/characters/:char` | Список романсов персонажа |

### Квесты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/quests` | Список квестов |
| GET | `/api/quest/:id` | Детали квеста |

### Сессии и обслуживание

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/sessions` | Список сессий |
| POST | `/api/maintenance/run` | Запуск обслуживания |
| GET | `/api/maintenance/status` | Статистика |
| POST | `/api/launch` | Новая игра |
| POST | `/api/continue` | Продолжить игру |
| GET | `/api/health` | Проверка здоровья |

### Агенты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/agents` | Список всех агентов |
| GET | `/api/agents/:id` | Конфиг агента |
| PUT | `/api/agents/:id` | Обновить конфиг |
| PUT | `/api/agents/:id/prompts` | Обновить промпты |
| GET | `/api/agents/:id/prompts/:lang` | Получить промпты для конкретного языка |
| PUT | `/api/agents/:id/prompts/:lang` | Обновить промпты для конкретного языка |
| POST | `/api/agents/:id/reset` | Сбросить к стандартным |
| GET | `/api/agents/providers/options` | Опции провайдеров/моделей |

### i18n Переводы

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/i18n/translations/:lang/:page` | Получить переводы для языка + страницы |
| GET | `/api/i18n/translations/:lang` | Получить все переводы для языка |
| PUT | `/api/i18n/translations` | Пакетное обновление переводов |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Удалить ключ перевода |

### WebSocket

| Эндпоинт | Описание |
|----------|----------|
| `ws://host:8000/ws/roleplay/:sessionId` | Ролевая игра в реальном времени |
| `ws://host:8000/ws/memory` | Лента событий памяти |

---

## Структура проекта

```
TrueNeverStory/
├── src/
│   ├── config/           # Конфигурация (Zod)
│   ├── lib/              # LLM клиент, очередь, event bus, история, atomic I/O
│   │   ├── sqlite-store.ts    # SQLite база данных (entities, embeddings, memories, agent_prompts, ui_translations)
│   │   └── ...
│   ├── memory/           # WorldMemory, FAISS индекс, когнитивный пайплайн
│   ├── middleware/        # Auth, CORS, обработчик ошибок, логгер, rate limiter
│   ├── models/           # Entity, chat, probability, romance, quest, story, memory
│   ├── routes/           # 16 модулей маршрутов (chat, entities, agents и т.д.)
│   │   ├── i18n.ts       # CRUD эндпоинты переводов
│   │   └── ...
│   ├── services/         # 42 сервиса (roleplay engine, агенты, вероятности и т.д.)
│   │   ├── agent-config.ts   # Конфигурация агентов (SQLite-first + JSON fallback)
│   │   └── ...
│   ├── intelligence/     # Анализ графа, дубликаты, рекомендации, генерация сцен
│   ├── i18n/             # Языковые пакеты (EN, RU, DE, FR, ES, JA, ZH)
│   ├── store/            # EntityStore с O(1) NameIndex
│   ├── utils/            # Логгер, хэш, утилиты времени
│   ├── app.ts            # Hono приложение с цепочкой middleware
│   └── index.ts          # Точка входа сервера
├── mojo/
│   ├── kernels/          # FFI ядра вероятностей и векторов
│   └── src/              # 81 Mojo исходный файл (опциональный бэкенд)
├── public/
│   ├── index.html        # Терминальный UI
│   ├── agents.html       # Настройки агентов (с i18n, загружает из SQLite)
│   ├── providers.html    # Настройки LLM провайдеров
│   ├── models.html       # Управление моделями
│   └── settings.html     # Глобальные настройки (с i18n, загружает из SQLite)
├── worlds/
│   ├── default/          # Активный мир
│   │   ├── world_frame.json
│   │   ├── entities.json
│   │   ├── agents/       # JSON-конфиги агентов (fallback)
│   │   ├── session_history/
│   │   ├── chapters/
│   │   ├── timeline.jsonl
│   │   └── settings.json
├── world_db/             # Директория SQLite базы данных
│   ├── tns.db            # Основная база (entities, embeddings, memories)
│   └── global/           # Глобальные переводы
│       └── tns.db        # UI переводы (agents, settings, agent_names, agent_descs)
├── local-models/         # GGUF модели (скачанные локально)
├── tests/                # Тесты (305 тестов)
├── .env                  # Конфигурация (не коммитится)
├── .env.example          # Шаблон конфигурации
├── startgame.sh          # Лаунчер сервера + llama-server (с очисткой PID)
├── package.json
├── tsconfig.json
└── plan.md               # План миграции
```

---

## Конфигурация

Вся конфигурация через переменные окружения (файл `.env`):

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `WORLD_LLM_BASE_URL` | – | LLM endpoint (совместимый с OpenAI) |
| `WORLD_LLM_API_KEY` | – | API ключ |
| `WORLD_LLM_MODEL` | `gpt-4o-mini` | Имя модели |
| `WORLD_LLM_TIMEOUT` | `120` | Таймаут запроса (секунды) |
| `WORLD_LLM_MAX_TOKENS` | `4096` | Макс. токенов на ответ |
| `WORLD_LLM_TEMPERATURE` | `0.7` | Температура сэмплирования |
| `WORLD_LLM_MAX_CONCURRENT` | `8` | Макс. одновременных LLM-запросов |
| `WORLD_DB_PATH` | `./worlds/default` | Директория базы данных |
| `LOCAL_MODELS_PATH` | `./local-models` | Директория локальных GGUF моделей |
| `WORLD_SERVER_HOST` | `0.0.0.0` | Адрес прослушивания |
| `WORLD_SERVER_PORT` | `8000` | Порт прослушивания |
| `AUTH_PASSWORD` | – | Пароль входа (пусто = без auth) |
| `MAX_SERVE_URL` | `http://localhost:8000` | Эндпоинт Mojo MAX Serve |

---

## Разработка

```bash
# Разработка с hot reload
bun run dev

# Проверка типов
npx tsc --noEmit

# Запуск всех тестов
bun test

# Запуск конкретных тестов
bun test tests/entity-store.test.ts
bun test tests/probability-engine.test.ts
bun test tests/integration/server.test.ts

# Сборка для продакшена
bun run build
```

---

## Последние изменения

### Система экономики NPC (v0.10.3)

Полная феодальная экономическая симуляция с живыми NPC:

| Возможность | Описание |
|-------------|----------|
| **Феодальная иерархия** | 10 рангов: Раб → Обыватель → Баронет → Барон → Виконт → Граф → Маркиз → Герцог → Король → Император |
| **Статы NPC** | 6 статов: богатство, власть, популярность, здоровье, опыт, интрига |
| **Система налогов** | Иерархические налоги: 0% (Император) → 90% (Обыватель), снижение за власть/популярность |
| **Механика взяток** | Риск-основанные взятки: 10% база + сумма/свидетели, порог предательства |
| **Пищевая экономика** | Рабы производят 300-1000 еды/месяц, все потребляют по рангу |
| **Семейная система** | 50% дохода жене, 10% детям, наследство при смерти |
| **Пороки и деградация** | 8 пороков, влияющих на статы, возрастной упадок здоровья |
| **34 архетипа** | 22 стандартных + 12 уникальных, взвешенно-случайный выбор |
| **Потеря власти** | Бунт → смерть/рабство, Война → выкуп/рабство, Банкротство → рабство |
| **Усиление предметами** | Уникальные предметы дают постоянные бонусы к статам (1-10%) |

**Новые файлы:**
- `src/models/npc-stats.ts` — NPCStats, Vices, FamilyExpenses
- `src/models/rank.ts` — Феодальная иерархия (10 рангов)
- `src/models/archetype.ts` — 34 архетипа с весами
- `src/models/item.ts` — Item, ItemBoost
- `src/services/npc-generator.ts` — Интеллектуальное создание NPC с выбором архетипа
- `src/services/npc-economy.ts` — Основная логика экономики
- `src/services/npc-economy-runtime.ts` — Пошаговая симуляция
- `src/services/slave-economy.ts` — Механика работорговли
- `src/services/item-evaluation.ts` — Оценка уникальности предметов

### Хранение в SQLite для промптов и переводов (v0.10.3)
Промпты агентов и UI-строки теперь хранятся в SQLite по мирам и языкам:

- **Таблица `agent_prompts`** — хранит `systemPrompt`, `userTemplate`, `outputFormat` по миру и языку
- **Таблица `ui_translations`** — хранит UI-строки по языку и странице (agents, settings, agent_names, agent_descs)
- **Dual-write стратегия** — записи идут в SQLite и JSON-файлы для обратной совместимости
- **Языковые промпты** — каждый мир может иметь свой язык, определяющий какие промпты загружаются
- **Авто-заполнение** — при первом запуске все 7 языков заполняются в `ui_translations`

**Иерархия хранения:**
1. **SQLite** (`tns.db`) — основное хранилище, по миру + языку
2. **JSON-файлы** (`worlds/{world}/agents/{agentId}.json`) — fallback при миграции
3. **Хардкод-дефолты** (`DEFAULT_PROMPTS` в `src/services/agent-config.ts`)

### API эндпоинты i18n
Новый REST API для управления переводами:

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/i18n/translations/:lang/:page` | Получить переводы для языка + страницы |
| GET | `/api/i18n/translations/:lang` | Получить все переводы для языка |
| PUT | `/api/i18n/translations` | Пакетное обновление переводов |
| DELETE | `/api/i18n/translations/:lang/:page/:key` | Удалить ключ перевода |

**Пример запроса (PUT):**
```json
{
  "language": "ru",
  "page": "agents",
  "entries": {
    "title": "Настройки агентов",
    "savePrompts": "Сохранить промпты"
  }
}
```

### Языковые промпты агентов
Промпты агентов теперь поддерживают хранение по мирам и языкам:

```sql
CREATE TABLE agent_prompts (
  world TEXT NOT NULL DEFAULT 'default',
  agent_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',
  UNIQUE(world, agent_id, language)
);
```

**API эндпоинты для языковых промптов:**
- `GET /api/agents/:id/prompts/:lang` — получить промпты для конкретного языка
- `PUT /api/agents/:id/prompts/:lang` — обновить промпты для конкретного языка

### Интеграция i18n во фронтенде
Фронтенд-страницы теперь загружают переводы из SQLite через API:

```javascript
// agents.html
async function loadTranslations(langCode) {
  const res = await fetch(`/api/i18n/translations/${langCode}/agents`);
  const data = await res.json();
  remoteTranslations = data.translations || {};
}

function t(key) {
  if (remoteTranslations[key] !== undefined) return remoteTranslations[key];
  return I18N[lang]?.[key] ?? I18N.en[key] ?? key;
}
```

### Новые специализированные агенты (v0.10.3)
Пять новых агентов для обогащения мира и взаимодействия с игроком:

- **Историк** — вспоминает и рассказывает об исторических событиях, лоре и хронологии
- **Картограф** — предоставляет информацию о локациях, расстояниях, путях и географии
- **Торговец** — управляет торговлей, ценообразованием и инвентарём NPC
- **Квестодатель** — генерирует контекстные квесты на основе состояния мира с целями и наградами
- **Хранитель знаний** — поддерживает факты мира, правила магии, информацию о расах и установленный канон

Каждый агент имеет собственный системный промпт, шаблон запроса и формат вывода, настроенные в `src/services/agent-config.ts`.

### Система RAG для всех агентов (v0.10.3)
Полная поддержка эмбеддингов с долгосрочной памятью для каждого агента:

- **llama.cpp Embedding Server** — выделенная модель BGE-M3 на порту 5002 для генерации векторов
- **Гибридный поиск SQLite** — ключевой поиск FTS5 + поиск плотных векторов + Reciprocal Rank Fusion (RRF)
- **AgentMemoryStore** — изоляция памяти по агентам и сессиям через колонку `role`
- **Память по мирам** — память изолирована по мирам для предотвращения галлюцинаций из других миров
- **Mojo графовые операции** — векторные операции через Mojo FFI для производительности (косинусное сходство, L2 расстояние)

**Архитектура:**
```
Запрос агента → AgentMemoryStore → SQLite (гибридный поиск)
                                      ↓
                              ┌───────┴───────┐
                              │ FTS5 (LIKE)   │ Плотные векторы (BGE-M3)
                              │ Ключевой      │ Косинусное сходство
                              │ поиск         │
                              └───────┬───────┘
                                      ↓
                              Reciprocal Rank Fusion (RRF)
                                      ↓
                              Контекст для промпта LLM
```

**Ключевые файлы:**
- `src/lib/agent-memory-store.ts` — AgentMemoryStore с интеграцией эмбеддингов
- `src/lib/sqlite-store.ts` — SQLiteStore с FTS5 + векторным поиском + RRF
- `src/lib/vector-ops.ts` — Векторные операции (косинус, L2, скалярное произведение)

### Революция NPC системы (v0.10.3)
Четыре новых сервиса для умного поведения NPC:

- **MemoryEngine** — семантический поиск, фильтрация по эмоциям/локации, кластеризация памяти по эпизодическим воспоминаниям NPC
- **BehaviorEngine** — автономные действия, оценка целей, дневные рутины, адаптация настроения, принятие решений
- **SocialGraph** — отслеживание отношений, оценка репутации, общие друзья, принадлежность к фракциям и конфликты
- **DialogueContext** — обогащённые промпты NPC, объединяющие отношения, память, настроение, локацию, фракцию, цели и инвентарь

**Архитектура:** Два параллельных трека — Трек 1 (Память + Поведение) строит фундамент, Трек 2 (Социальные связи + Диалог) добавляет пользовательские функции.

**Интеграция:** `NPCAgent.initialize(runtime, statePath)` создаёт все четыре компонента. Fallback на шаблон/PromptBuilder когда DialogueContext не инициализирован.

### Агент Researcher (v0.10.3)
Новый агент для проверки фактов и валидации реализма:
- **`verifyRecipe()`** — проверка рецептов крафтера на правдоподобие
- **`researchTopic()`** — историческое/культурное исследование для мира
- **`validateCharacter()`** — проверка одежды, еды, быта персонажей
- **`enrichScene()`** — добавление сенсорных деталей в сцены
- **`factCheck()`** — общая проверка фактов

### Система i18n
Полная локализация на 7 языков (EN, RU, DE, FR, ES, JA, ZH):
- Все промпты агентов и строки интерфейса
- Имена и описания агентов
- Страницы настроек (агенты, провайдеры, модели)
- Сообщения запуска/остановки сервера

**Структура** — каждый язык в отдельном файле `src/i18n/`:

```
src/i18n/
├── types.ts    # Интерфейс LanguagePack + тип Language
├── en.ts       # Английский (базовый пакет — все ключи здесь)
├── ru.ts       # Русский (наследует EN, переопределяет переводы)
├── de.ts       # Немецкий
├── fr.ts       # Французский
├── es.ts       # Испанский
├── ja.ts       # Японский
├── zh.ts       # Китайский
└── index.ts    # Barrel-экспорт, реестр, getLanguagePack()
```

**Добавление нового языка** (например, корейский):

1. Создать `src/i18n/ko.ts`:
```ts
import { EN } from "./en";
import type { LanguagePack } from "./types";

export const KO: LanguagePack = {
  ...EN,
  code: "ko",
  name: "Korean",
  nativeName: "한국어",
  systemPrompt: "한국어로만 답변하세요.",
  uiSettings: "설정",
  // ... переопределить другие ключи
};
```

2. Зарегистрировать в `src/i18n/index.ts`:
```ts
import { KO } from "./ko";
// добавить в тип Language: "ko"
// добавить в PACKS: ko: KO
// добавить в массив LANGUAGES
```

3. Добавить `"ko"` в объединение `Language` в `src/i18n/types.ts`.

**Использование в коде:**
```ts
import { t, getLanguagePack, setLanguage } from "../i18n";

const lang = t();                  // текущий языковой пакет
const ru = getLanguagePack("ru");  // конкретный пакет
setLanguage("de");                 // переключить активный язык
```

### Улучшения сервера
- **PID-файл** (`.server.pid`) — предотвращение сиротских процессов
- **Очистка при запуске** — автоматическое убивание старых процессов
- **Graceful shutdown** — 5 секунд SIGTERM, затем SIGKILL

---

## Тестирование

Тестовый набор включает:

- **Unit-тесты**: CRUD хранилища сущностей, расчёты движка вероятностей
- **Интеграционные тесты**: Полный HTTP API flow, аутентификация, WebSocket

```bash
# Запуск сервера (нужен для интеграционных тестов)
bun run dev &

# Запуск тестов
bun test

# Ожидаемый результат: 305 passing
```

---

## Миграция с Python

Этот проект — TypeScript + Mojo порт [BRING](https://github.com/Eva-E1/BRING), Python AI-платформы фэнтези-миров. Ключевые изменения:

| Компонент | Python | TypeScript |
|-----------|--------|------------|
| Веб-фреймворк | FastAPI | Hono (Bun) |
| Рантайм | Python asyncio | Bun native async |
| Валидация | Pydantic | Zod |
| Логирование | Python logging | Lightweight logger (замена pino) |
| Граф | NetworkX | Кастомная adjacency map |
| Векторный поиск | FAISS (Python) | Mojo FFI + локальный cosine fallback |
| WebSocket | FastAPI WebSocket | Bun native WebSocket |
| Аутентификация | Нет | Cookie-based сессии |
| Streaming | SSE (starlette) | ReadableStream + SSE |

---

## Дисклеймер

Данный проект разработан с использованием **вайбкодинга** — подхода к разработке с помощью ИИ, реализованного в [MiMo Code](https://github.com/XiaomiMiMo/MiMo). Кодовая база создана в процессе совместной работы человека и ИИ, что означает:

- Код **рабочий и протестированный** — все функции работают как описано
- В некоторых местах могут встречаться **неоптимальные решения** или код, который можно улучшить
- Возможны **небольшие различия** в стиле кода между разными модулями
- Архитектура и логика **проверены и валидированы человеком**

Если вы найдёте области для улучшения, будем рады вашим предложениям.

---

## Лицензия

Apache 2.0
