# TrueNeverStory v0.16.0

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
| **Стриминг** | WebSocket + SSE для доставки нарратива в реальном времени |
| **i18n (7 языков)** | EN, RU, DE, FR, ES, JA, ZH — интерфейс, промпты, имена агентов |
| **Авторизация** | Сессии с HttpOnly cookie, CSRF-защита |
| **Хранение в SQLite** | Сущности, эмбеддинги, память, промпты, переводы — всё в SQLite |

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
chmod +x tns-server
./tns-server

# Windows
# Распаковать tns-windows-x64.zip, затем:
tns-server.exe
```

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
│   ├── lib/              # LLM клиент, SQLite хранилище, векторные операции
│   ├── memory/           # WorldMemory, когнитивный пайплайн
│   ├── middleware/        # Авторизация, rate limiter, заголовки безопасности
│   ├── models/           # Entity, chat, probability, romance, quest, item
│   ├── routes/           # API маршруты (chat, entities, agents, settings)
│   ├── services/         # 52 сервиса (движок ролевой игры, агенты, экономика)
│   ├── intelligence/     # Анализ графа, детектирование дубликатов
│   ├── i18n/             # Языковые пакеты (7 языков)
│   ├── store/            # EntityStore с O(1) индексом по именам
│   └── utils/            # Логгер, хеши, санитайзер, шаблоны
├── mojo/kernels/         # C FFI вычислительные ядра (компиляция через Zig)
├── public/               # Веб-интерфейс (терминальный стиль)
├── worlds/               # Данные миров (SQLite БД, сущности, сессии)
├── conf/                 # Конфигурация (настройки, агенты, провайдеры)
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
