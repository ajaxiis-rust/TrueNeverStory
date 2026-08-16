# Jungian Profiler — Phase 4: AuthorMatcher (стилевой референс)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S7; impl-спека `spec-profiler-implementation.md` (out of scope → Phase 4).
> **Это индекс фазы.** Детальные пошаговые планы — в `p4a`/`p4b`/`p4c`. Выполняй строго по порядку; не переходи к следующему файлу, пока не пройден чекпоинт текущего.

**Goal:** Стилевой референс: Stylist получает author few-shot на основе embedding-поиска пролога (`closestAuthor`).

**Architecture:** Предвычисленные BGE-M3 embeddings 50 классических авторов (`data/author-embeddings.json`, dim = настроенная embedding-модель). На лету (при создании персонажа, birth wizard): embedding пролога → cosine top-3 (через существующий `cosineSimilarity` из `@/lib/vector-ops`, Mojo FFI) → LLM выбирает лучшего из top-3 по описанию персонажа + прологу + `samplePhrases` → `closestAuthor` сохраняется. Per-turn `samplePhrases` автора попадают в `buildMicroPrompt` как few-shot. При недоступном embedding/LLM или рассинхроне dim `closestAuthor` отсутствует, генерация не блокируется (graceful fallback).

**Зависимости:** Phase 2 (нужен `PsychotypeAnalyzer`/`LLMQueue` + `StylistAgent.buildMicroPrompt`). **Не блокирует Phase 1–3.**

## Структура файлов плана

| Файл | Содержимое | Строк |
|------|-----------|-------|
| `2026-08-14-jungian-profiler-p4a.md` | Phase 4A — Task 4.1 (corpus + build-скрипт) | ≤300 |
| `2026-08-14-jungian-profiler-p4b.md` | Phase 4B — Task 4.2 (cosine/topN + matchAuthor) | ≤300 |
| `2026-08-14-jungian-profiler-p4c.md` | Phase 4C — Tasks 4.3 (persistence) + 4.4 (Stylist few-shot) + **Чекпоинт P4** | ≤300 |

## Порядок выполнения

1. **P4A** (`p4a`): корпус — `data/author-embeddings.json` + `scripts/build-author-embeddings.ts` (50 авторов).
2. **P4B** (`p4b`): матчер — типы `AuthorEntry`/`AuthorMatch`, pure `topNAuthors` (в `jungian-profiler.ts`, переиспользует `cosineSimilarity` из `@/lib/vector-ops`), async `matchAuthor`/`selectAuthor`/`loadAuthorCorpus` (в `src/services/author-matcher.ts`).
3. **P4C** (`p4c`): persistence (`closest_author` колонка + worlds.ts wiring) + Stylist few-shot (`buildMicroPrompt` 6-й параметр + generator/engine wiring). Завершить чекпоинтом P4.

## Решения дизайна (зафиксированы)

- **Embedding автора** = embedding от `samplePhrases.join(' ')` (few-shot фразы и есть стилевой слепок).
- **Чистая функция** `topNAuthors` — в `jungian-profiler.ts` (переиспользует `cosineSimilarity` из `@/lib/vector-ops`, Mojo FFI; 0 LLM); **async matcher** (`matchAuthor`/`selectAuthor`/`loadAuthorCorpus`) — в отдельном `src/services/author-matcher.ts` (single responsibility).
- **`closestAuthor`** хранится в колонке `closest_author` на `player_style_profiles` (отдельно от `JungianProfile`), имя поля результата — `AuthorMatch { name; matchConfidence; matchReason }`.
- **LLM-pick среди top-3** — при создании персонажа (birth wizard), комбинированным вызовом [S5.2]: `analyzeBirth(hints, prologue, corpus, embed, llmQueue)` → `{ psychotype, closestAuthor }` (один LLM-вызов, видит описание персонажа + пролог + `samplePhrases`). +1 LLM-вызов только на создании персонажа (разовое); LLM-ошибка → top-1 fallback. Per-turn матчинга нет (читается `closest_author`). `analyzeText` (P2, этап 1) не трогается → изоляция фаз (S21) сохранена.
- **Двухэтапность:** этап 1 (создание мира, [S5]) — профиль из Synopsis+Prologue в `createWorld`; этап 2 (создание персонажа, [S5.2]) — комбинированный refine+автор в `birth.ts`. Пролог персистится в `world_frame.json` (этап 1) и читается этапом 2.

## Чекпоинт Phase 4 (итог)

См. `p4c.md`: `tsc --noEmit` чист; все unit-тесты Phase 1-4 зелёные; корпус = 50 валидных записей одной dim; `matchAuthor` graceful при недоступном embedding/LLM и рассинхроне dim; `selectAuthor` LLM-pick (пролог + samplePhrases) с top-1 fallback; `closest_author` roundtrip; few-shot блок только при наличии автора; `process()` Stylist и `analyzeText` (P2) не изменены.
