# MCP Console — Design Spec

## [S1] Problem

Нет единого инструмента для управления базами данных проекта (Bible, Gutenberg, Wikipedia, LiteraryCompiler, Economics). Все операции (скачивание, конвертация, парсинг, просмотр, поиск, компактизация) выполняются через CLI-скрипты. Нужен веб-интерфейс + REST API для полного CRUD и пайплайнов.

## [S2] Solution Overview

Добавить флаг `--mcp` в `startgame.sh`, который запускает MCP-режим:
- Только MCP-сервер на порту 8000 (без игрового сервера)
- llama.cpp: BGE3M (порт 5001) + LLM small (порт 5002) — авто-запуск из `local-models/`
- Веб-интерфейс `mcp.html` + REST API endpoints для всех БД

## [S3] Flag `--mcp` in startgame.sh

Парсинг флагов расширяется:
```
--mcp / -m    MCP-режим: только сервер БД на порту 8000, без игры
```

При `--mcp`:
- `TNS_MCP_MODE=1` экспортируется в окружение
- Авто-запуск llama.cpp: BGE3M (порт 5001) + LLM small (порт 5002) из `local-models/`
- LLM small: ищет самый маленький нон-embed `.gguf` в `local-models/`
- Если LLM small нет — предупреждает, но продолжает (BGE3M критичен, LLM опционален)
- Запуск `tns-server` (или `bun run dev`) — сервер определяет `TNS_MCP_MODE` и отдаёт только MCP routes

## [S4] REST API — MCP Routes

Новый файл `src/routes/mcp.ts`:

### Bible
- `GET /mcp/bible/stats` — статус БД (кол-во стихов, книг, персонажей)
- `GET /mcp/bible/search?q=...&book=...&limit=N` — поиск стихов
- `GET /mcp/bible/books` — список книг
- `GET /mcp/bible/characters?q=...` — поиск персонажей
- `GET /mcp/bible/character/:id` — детали персонажа + связи
- `POST /mcp/bible/bootstrap` — загрузка JSON → SQLite
- `POST /mcp/bible/compact` — компактизация БД

### Gutenberg
- `GET /mcp/gutenberg/stats` — статус БД
- `GET /mcp/gutenberg/search?q=...&limit=N` — поиск стилей
- `GET /mcp/gutenberg/styles` — все стили
- `POST /mcp/gutenberg/download` — скачать корпус (parquet)
- `POST /mcp/gutenberg/convert` — parquet → SQLite
- `POST /mcp/gutenberg/compact` — компактизация
- `POST /mcp/gutenberg/delexify` — делексификация текста

### Wikipedia
- `GET /mcp/wikipedia/stats` — статус БД (кол-во статей, размер)
- `GET /mcp/wikipedia/search?q=...&limit=N` — поиск по статьям
- `GET /mcp/wikipedia/article/:id` — полная статья
- `POST /mcp/wikipedia/download` — скачать дамп (parquet)
- `POST /mcp/wikipedia/convert` — parquet → SQLite
- `POST /mcp/wikipedia/compact` — компактизация
- `POST /mcp/wikipedia/verify` — фактчекинг (verify_fact через UI)

### LiteraryCompiler
- `GET /mcp/literary/stats` — статус БД
- `GET /mcp/literary/templates?q=...` — шаблоны квестов
- `POST /mcp/literary/compile` — запуск компиляции
- `POST /mcp/literary/compact` — компактизация

### Economics
- `GET /mcp/economics/stats` — статус БД
- `GET /mcp/economics/phase` — текущая фаза
- `GET /mcp/economics/dilemma` — генерация дилеммы

### System
- `GET /mcp/status` — общий статус всех БД + llama.cpp
- `POST /mcp/rebuild-index` — переиндексация
- `POST /mcp/clean-orphans` — очистка осиротевших embeddings

## [S5] Web UI — public/mcp.html

Новая HTML-страница `public/mcp.html`:

**Верхняя панель:**
- Бренд "TrueNeverStory — MCP Console"
- Навигация: Bible | Gutenberg | Wikipedia | LiteraryCompiler | Economics | System
- Кнопка BACK → `/`

**Главная секция (dashboard по умолчанию):**
- Статус всех БД (количество записей, размер файла, последнее обновление)
- Статус llama.cpp (BGE3M 5001, LLM 5002 — online/offline)
- Кнопки быстрых действий: Download All, Compact All, Rebuild Index

**Вкладка Bible:**
- Поиск стихов (поле ввода + результаты)
- Таблица персонажей с фильтрами
- Кнопки: Bootstrap, Compact

**Вкладка Gutenberg:**
- Поиск стилей (mood, tags)
- Delexify textarea (вставить текст → получить результат)
- Кнопки: Download Corpus, Convert Parquet→SQLite, Compact

**Вкладка Wikipedia:**
- Поиск по статьям
- Фактчекинг: поле ввода утверждения → результат verify
- Кнопки: Download Parquet, Convert Parquet→SQLite, Compact

**Вкладка LiteraryCompiler:**
- Список шаблонов квестов
- Кнопки: Compile, Compact

**Вкладка Economics:**
- Текущая фаза экономики
- Генерация дилеммы
- Статус юбилейного цикла

**Вкладка System:**
- Общий статус (RAM, CPU, uptime)
- Логи операций (последние 50 записей)
- Кнопки: Rebuild Index, Clean Orphans

**Технически:**
- Vanilla JS (как dashboard.html), i18n (en/ru/de/fr/es/ja/zh)
- Polling каждые 10 сек для статусов
- Toast-уведомления для операций
- Прогресс-бары для длительных операций (download, convert)

## [S6] Server MCP Mode

**Определение режима:**
- Сервер читает `TNS_MCP_MODE` из env
- Если `1` → регистрирует только MCP routes + отдаёт `mcp.html` на `/`
- Если не задан → обычный игровой режим (все routes)

**Реализация в src/index.ts:**
```typescript
if (process.env.TNS_MCP_MODE === '1') {
  app.route('/', mcpRouter);       // только MCP
  app.get('/', serveMcpHtml);      // mcp.html на /
} else {
  app.route('/', gameRouter);      // все игровые routes
}
```

**Порт:** тот же WORLD_SERVER_PORT (8000 по умолчанию).

## [S7] Long Operations & Progress

Для операций download/convert/compact (могут занимать минуты):

**Server-Sent Events (SSE):**
- `GET /mcp/stream/:jobId` — SSE-поток для отслеживания прогресса
- Каждая длительная операция генерирует jobId, возвращает его сразу
- Клиент подключается к SSE и получает `{ progress: 45, message: "Converting file 3/12..." }`
- По завершении: `{ progress: 100, message: "Done", result: {...} }`

**Web UI:**
- Прогресс-бар + текст статуса
- Кнопки операций блокируются во время выполнения
- Toast при завершении/ошибке
