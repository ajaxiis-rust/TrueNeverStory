# TrueNeverStory v0.28.0 — Руководство по компиляции

## Быстрый старт

```bash
# Текущая платформа
./build.sh compile

# Конкретная цель
./build.sh compile linux-x64
./build.sh compile linux-arm64
./build.sh compile macos-arm64
./build.sh compile windows-x64

# Интерактивный выбор
./build.sh select

# Все платформы
./build.sh cross
```

## Поддерживаемые платформы

| Платформа | TypeScript | Mojo (.so) | MCP | Backend | Заметки |
|-----------|:----------:|:----------:|:---:|:-------:|---------|
| linux-x64 | ✅ | ✅ | ✅ | mojo | Полная поддержка |
| linux-arm64 | ✅ | ✅ | ✅ | mojo | Полная поддержка |
| macos-arm64 | ✅ | ✅ | ✅ | mojo | Apple Silicon |
| macos-x64 | ✅ | ✅ | ✅ | mojo | Intel Mac |
| windows-x64 | ✅ | ❌ | ✅ | typescript | Fallback на TypeScript |

## MCP — Model Context Protocol

MCP提供工具给LLM代理，用于查询外部数据源：

| Инструмент | Источник данных | Описание |
|------------|----------------|----------|
| `search_verses` | Bible SQLite | Поиск стихов по тексту, книге, ссылке |
| `get_pattern` | Bible SQLite | Нарративные паттерны по архетипу/настроению |
| `get_archetype` | Bible SQLite | Детали архетипа по имени |
| `get_cross_refs` | Bible SQLite | Перекрёстные ссылки между стихами |
| `get_style_pattern` | Gutenberg SQLite | Стилистические паттерны по настроению/тегам |
| `apply_style` | Gutenberg SQLite | Применение стиля к тексту |
| `verify_fact` | Wikipedia API | Проверка фактических утверждений |
| `get_context` | Wikipedia API | Контекст из Wikipedia по теме |
| `get_quest_templates` | Literary Compiler | Шаблоны квестов по архетипу |
| `search_quest_templates` | Literary Compiler | Поиск квестов по тексту |
| `get_economic_phase` | Economic DB | Текущая фаза экономического цикла |
| `calculate_price` | Economic DB | Расчёт цены с учётом фазы |
| `generate_dilemma` | Economic DB | Генерация фракционной дилеммы |
| `check_jubilee` | Economic DB | Проверка цикла jubilee |

### Компиляция баз данных MCP

MCP-сервер требует скомпилированные SQLite базы данных:

```bash
# Bible: BSB, LEB, NHEBME + cross-references
bun run scripts/run-bsb-compiler.ts

# Полный пайплайн (Bible + Literary Compiler)
bun run scripts/run-full-compiler-pipeline.ts

# Только Bible
bun run scripts/run-full-bible-compiler.ts

# Кэшированный пайплайн (增量)
bun run scripts/run-cached-pipeline.ts
```

### Структура данных MCP

```
worlds/{active}/
├── bible.db              # BSB + LEB + NHEBME + cross-refs
├── gutenberg.db          # Стили из Gutenberg Project
├── mcp/
│   ├── bible/            # Кэш Bible парсера
│   └── gutenberg/        # Кэш Gutenberg парсера
└── economic.db           # Экономические данные
```

### Запуск MCP

MCP-сервер автоматически стартует если найдены `bible.db` или `gutenberg.db`:

```bash
# Автоматический запуск
./bun run src/index.ts

# Проверка MCP
curl http://localhost:8000/health  # → "status": "ok"
```

## Автоматический fallback

Сервер автоматически определяет доступность Mojo:

```
.so файлы есть    → Backend: mojo       (быстро, ~10-50x для векторов)
.so файлы нет     → Backend: typescript  (работает, медленнее)
```

Проверить текущий backend:
```bash
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
```

### Что работает без Mojo

| Компонент | Mojo backend | TypeScript fallback | Разница |
|-----------|:------------:|:-------------------:|---------|
| Вероятности (combat, romance) | Mojo FFI | TypeScript | ~2-5x |
| Векторная similarity | Mojo FFI | TypeScript | ~10-50x |
| Dot product | Mojo FFI | TypeScript | ~5-10x |
| Chat / Roleplay | TypeScript | TypeScript | 0% |
| Memory System | TypeScript + Mojo | TypeScript only | Замедление поиска |
| Quests / Director | TypeScript | TypeScript | 0% |
| MCP Bible/Gutenberg | TypeScript | TypeScript | 0% |
| MCP Wikipedia | HTTP | HTTP | 0% |

**Вывод:** Windows-версия полностью работоспособна. Разница только в производительности вычислений.

## Структура сборки

```
dist/
├── linux-arm64/
│   ├── tns-server              # Standalone бинарник
│   ├── libtns_kernels.so       # Mojo: вероятности
│   ├── libtns_vectors.so       # Mojo: векторные операции
│   ├── libtns_graph_ops.so     # Mojo: графовые операции
│   ├── libtns_batch_ops.so     # Mojo: пакетные операции
│   └── .env                      # Конфигурация
├── linux-x64/
│   └── ...
├── macos-arm64/
│   └── ...
├── macos-x64/
│   └── ...
└── windows-x64/
    ├── tns-server.exe          # Только TypeScript (fallback)
    └── .env
```

## Что нужно пользователю

1. Скачать папку под свою платформу
2. Настроить `.env` (LLM endpoint, пароль)
3. Скопировать `conf/` из корня проекта (или создать вручную)
4. Запустить:

```bash
# Linux/macOS
./tns-server

# Windows
tns-server.exe
```

**Не нужно:** Bun, Node.js, Python, Mojo, компиляторы.

Для работы MCP нужно additionally скомпилировать базы данных (см. раздел MCP выше).

## Embedding-модели (локальный сервер)

Для векторного поиска и семантического сходства можно запустить отдельный llama-server с embedding-моделью:

```bash
# BGE M3 — мультиязычная (100+ языков, 8192 токена)
./llama-server -m local-models/bge-m3-Q8_0.gguf --embedding --pooling mean --port 8081

# Qwen3 Embedding 0.6B — компактная и быстрая
./llama-server -m local-models/Qwen3-Embedding-0.6B-Q8_0.gguf --embedding --pooling mean --port 8081

# KaLM Embedding Gemma3 12B — максимальное качество
./llama-server -m local-models/KaLM-Embedding-Gemma3-12B-2511.Q4_K_M.gguf --embedding --pooling mean --port 8081
```

В `.env` укажите:
```ini
EMBED_MODEL=bge-m3-Q8_0
EMBED_SERVER_PORT=8081
```

> **Важно:** Флаги `--embedding` и `--pooling mean` обязательны для корректной работы embedding-моделей. Без них llama-server будет работать как обычная LLM и выдавать текст вместо векторов.

| Модель | Размер | Языки | Контекст | Рекомендация |
|--------|--------|-------|----------|--------------|
| BGE M3 (Q8_0) | ~635 MB | 100+ | 8192 | Лучшее покрытие языков |
| BGE M3 (Q4_K_M) | ~438 MB | 100+ | 8192 | Баланс размер/качество |
| Qwen3 Embedding 0.6B | ~639 MB | Мульти | — | Самый быстрый |
| Embedding Gemma 300M | ~329 MB | EN+ | — | Минимальный размер |
| KaLM Gemma3 12B (Q4_K_M) | ~7.3 GB | Мульти | — | Максимальное качество |

## Требования к платформе

| ОС | Минимальная версия | Архитектура | Mojo | MCP |
|----|-------------------|-------------|:----:|:---:|
| Linux | glibc 2.34+ (Ubuntu 22.04+, Debian 12+, RHEL 9+) | x86_64, ARM64 | ✅ | ✅ |
| macOS | 11 Big Sur+ | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | 10+ (64-bit) | x86_64 | ❌ | ✅ |

## Windows — детали

Windows-сборка работает через **TypeScript fallback**:

- `tns-server.exe` — standalone бинарник, работает без установки
- Mojo `.so` не компилируются (Mojo не поддерживает Windows/MSVC)
- Все вычисления работают на TypeScript — медленнее, но функционально идентично
- MCP работает полностью (TypeScript)
- WSL2 не требуется — нативный Windows запуск

### Производительность на Windows

Для большинства сценариев разница незаметна:
- Чат и ролплей — одинаково (TypeScript)
- Вероятности — незначительная разница (<1ms)
- Векторный поиск — медленнее при больших данных (>10K воспоминаний)
- MCP — одинаково (TypeScript + HTTP)

Для максимальной производительности на Windows:
1. **Внешний сервер** на Linux
2. **Типичные сценарии** — разница незаметна

## Ручная компиляция

### TypeScript (Bun)

```bash
# Текущая платформа
bun build --compile --outfile dist/tns-server src/index.ts

# Windows (из Linux через кросс-компиляцию)
bun build --compile \
  --compile-executable-path dist/.bun-cache/bun-windows-x64 \
  --outfile dist/windows-x64/tns-server.exe \
  src/index.ts
```

### Mojo (.so для FFI)

```bash
# Только Linux/macOS (не Windows!)
mojo build --emit shared-lib -O3 \
  -o dist/libtns_kernels.so \
  mojo/kernels/probability_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_vectors.so \
  mojo/kernels/vector_ffi.mojo

mojo build --emit shared-lib -O3 \
  -o dist/libtns_graph_ops.so \
  mojo/kernels/graph_ops.c

mojo build --emit shared-lib -O3 \
  -o dist/libtns_batch_ops.so \
  mojo/kernels/batch_ops.c
```

### Кросс-компиляция

Mojo `.so` нельзя надёжно кросс-компилировать. Рекомендуется **собирать на целевой платформе**.

### Сборка Windows из Linux

```bash
# TypeScript + .env (без Mojo)
./build.sh compile windows-x64

# Результат: dist/windows-x64/
#   tns-server.exe   — standalone бинарник
#   .env               — конфигурация
```

## Отладка

```bash
# Проверить backend
bun run -e "import { getBackend } from './src/lib/mojo-ffi'; console.log(getBackend())"
# → "mojo" или "typescript"

# Проверить что бинарник работает
./dist/linux-arm64/tns-server --help

# Проверить .so символы
nm -D dist/linux-arm64/libtns_kernels.so | grep tns

# Проверить FFI из TypeScript
bun run -e "
  import { computeSuccessChance } from './src/lib/mojo-ffi';
  console.log(computeSuccessChance(0.8, 0.3, 0.5, 0.1));
"

# Проверить платформу бинарника
file dist/linux-arm64/tns-server

# Проверить MCP (нужны базы данных)
bun run scripts/run-bsb-compiler.ts
curl http://localhost:8000/health
```
