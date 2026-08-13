# TrueNeverStory — Project Rules for Kimi Code

## Scope

Этот файл дополняет `~/.config/mimocode/AGENTS.md` project-specific правилами. При конфликте более специфичный файл имеет приоритет.

## 1. Проект

- **Название:** TrueNeverStory — AI-powered interactive narrative engine.
- **Версия:** 0.30.0+ (источник правды — `package.json`).
- **Репозиторий:** `https://github.com/ajaxiis-rust/TrueNeverStory`.
- **Рабочая директория:** `/home/ajaxiis/Документы/TNS/TrueNeverStory`.

## 2. Инструменты

- **Bun** — используй `bun` как runtime и package manager (`bun run`, `bun test`, `bun install`).
- **Zig** — для компиляции C → binary (не gcc/clang).
- Поиск кода — см. Code Search Policy в `~/.config/mimocode/AGENTS.md`.

## 3. Языковая модель агентов

- **"English inside, translate at boundary"** — единственный источник истины.
- Агенты генерируют narrative **только на английском**.
- `TranslationService` (`src/services/translation-service.ts`) переводит:
  - Ввод пользователя с русского → английский перед intent parsing.
  - Результат агентов с английского → язык пользователя перед выводом.
- **Не добавляй** `LANG_INSTRUCTION` или system prompts на языке пользователя в агентов — это конфликтует с TranslationService.

## 4. LLM pipeline

- `LLMQueue.getAgentClient(agentId)` создаёт отдельный `LLMClient` на агента.
- Агенты: `story-planner`, `director`, `npc`, `merchant`, `villain`, `fallback`.
- LLM cache **отключён** — не пытайся включать без явного `enableCache` в `LLMClientOptions`.
- Минимум 4–5 LLM-запросов на пользовательский ввод; пользователь заинтересован в оптимизации через MCP tools и ресурсы движка.

## 5. Конфигурация и чувствительные данные

- `conf/providers.json` — хранит провайдеров и сырые ключи через `atomicWriteJson`.
- `worlds/_sessions/` — путь к SQLite `sessions.db` и graph-store; избегай имени `_sessions` как обычного мира.
- Логгер уже редуцирует `oauth`/`apiKey` — не добавляй их в логи явно.

## 6. Экономика и мир

- Economy subsystem — 4 модели: `npc-economy.ts`, `slave-economy.ts`, `economic-cycles.ts`, `faction-tax-dilemma.ts`.
- Фасад — `EconomicService`.
- Иерархия рангов: Slave → Commoner → Baronet → Baron → Viscount → Count → Marquis → Duke → King → Emperor.
- 50-летний Jubilee сбрасывает долги и возвращает земли.
- При изменении экономики обновляй `docs/about.md` (раздел "World Rules and Economy") и переводы в `docs/<lang>/`.

## 7. Процесс разработки

1. **Plan + TDD** — перед кодом пиши план и падающий тест.
2. **Verify** — запускай проверки и цитируй результат перед заявлением «готово».
3. **Subagent** — для независимых задач используй параллельных subagent с изолированным контекстом.
4. **Worktree** — для нетривиальных фич предпочитай git worktree.

## 8. Память и индексация

- Проект индексирован в codebase-memory: slug `home-ajaxiis-d094d0bed0bad183d0bcd0b5d0bdd182d18b-TNS-TrueNeverStory`.
- Исключённые директории: `.git`, `release`, `node_modules`, `public/static/vendor`.
- Графический UI codebase-memory: `http://localhost:9749`.
