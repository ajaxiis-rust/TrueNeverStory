# Jungian Profiler — Master Plan (v1.3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement each sub-plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Источник правды:** дизайн `docs/compose/specs/2026-08-10-jungian-profiler-design_1.3.md` (контракты + WHY) + 5 impl-спек (`spec-blend-algorithm.md`, `spec-behavioral-metrics.md`, `spec-profiler-persistence.md`, `spec-profiler-integration.md`, `spec-profiler-implementation.md`).
> **Это индекс.** Детальные пошаговые планы разбиты на файлы ≤300 строк. Выполняй строго по порядку; не переходи к следующему файлу, пока не пройден чекпоинт текущего.

**Goal:** Построить юнгианский профайлер игрока в 4 фазы — от модели данных (Phase 1) до нарративной адаптации (Phase 2), NPC-психотипов (Phase 3) и AuthorMatcher (Phase 4, стилевой референс).

**Architecture:** Director — pure-функция (`computeDistribution`), НЕ агент и НЕ регистрируется в `AgentRegistryV2`. Enrichment-конвейер Director→Dramaturg→Actor→Validator→Stylist→Censor идёт через dedicated-методы Big Six, **не** через `AgentV2.process()` (дизайн S3.2). Behavioral metrics уже собраны (`MetricsCollector` ✅). Профиль хранится колонками (префикс `jungian_`) на `player_style_profiles`. Все фазы за флагом `jungian-profiler-enabled` (default false).

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, `bun:test`. Проверка типов: `bunx tsc --noEmit`.

## Global Constraints (наследуются каждым файлом)

- **Bun** как runtime и test runner: `bun test`, `bunx tsc --noEmit`.
- Все pure-функции blend/Director — в `src/services/jungian-profiler.ts`, 0 LLM.
- `JungianProfile.source` enum: `'text' | 'metrics' | 'blended' | 'default'` (не `'synopsis'`).
- `createDefaultProfile()`: confidence = 0, axisConfidence = 0. Адаптация включается при `confidence >= 0.3`.
- Профиль хранится колонками (префикс `jungian_`) на `player_style_profiles`, **не** отдельной таблицей.
- `blendBehavioralSignals(signals, profile, recentSignals)` — 3 аргумента, `recentSignals` обязателен.
- Все миграции — `ALTER TABLE ADD COLUMN` через `PRAGMA table_info` (SQLite не поддерживает `IF NOT EXISTS` для ALTER).
- Флаг `jungian-profiler-enabled` default false. Откат = flip флага, schema-downgrade не нужен (additive).
- TDD: падающий тест → реализация → зелёный тест → commit. После каждой задачи `bunx tsc --noEmit`.
- `Director` (pure fn) ≠ `DirectorAgent` (mention-handler). Не трогать `AgentV2.process()` и `@mention`-роутинг.

## Реализованное (база)

- `src/services/metrics-collector.ts` — MetricsCollector, deriveMetrics, inferFromMetrics ✅ (29 тестов)
- `recordSimulation` command-branch bug — починен (command → `intent.command`; фикс в working tree, требует коммита)

## Структура файлов плана

| Файл | Содержимое | Строк |
|------|-----------|-------|
| `2026-08-14-jungian-profiler-p1a.md` | Phase 1A — Task 1.1 (типы) | ≤300 |
| `2026-08-14-jungian-profiler-p1b.md` | Phase 1B — Task 1.2 (blend) | ≤300 |
| `2026-08-14-jungian-profiler-p1c.md` | Phase 1C — Task 1.3 (Director) | ≤300 |
| `2026-08-14-jungian-profiler-p1d.md` | Phase 1D — Task 1.4 (persistence) | ≤300 |
| `2026-08-14-jungian-profiler-p1e.md` | Phase 1E — Tasks 1.5 (flag) + 1.6 (hooks) + **Чекпоинт P1** | ≤300 |
| `2026-08-14-jungian-profiler-p2a.md` | Phase 2A — Task 2.1 (buildPlayerVoice) | ≤300 |
| `2026-08-14-jungian-profiler-p2b.md` | Phase 2B — Task 2.2 (Dramaturg.enrichScene) | ≤300 |
| `2026-08-14-jungian-profiler-p2c.md` | Phase 2C — Task 2.3 (Actor.enrichNpcs) | ≤300 |
| `2026-08-14-jungian-profiler-p2d.md` | Phase 2D — Tasks 2.4 (Validator) + 2.5 (Stylist) + 2.6 (Censor) | ≤300 |
| `2026-08-14-jungian-profiler-p2e.md` | Phase 2E — Task 2.7 (PsychotypeAnalyzer+UI) | ≤300 |
| `2026-08-14-jungian-profiler-p2f.md` | Phase 2F — Task 2.8 (pipeline) + **Чекпоинт P2** | ≤300 |
| `2026-08-14-jungian-profiler-p3.md` | Phase 3A — Tasks 3.1 (assignNpcPsychotype) + 3.2 (npc_perception) | ≤300 |
| `2026-08-14-jungian-profiler-p3b.md` | Phase 3B — Task 3.3 (Actor wire) + **Чекпоинт P3** | ≤300 |
| `2026-08-14-jungian-profiler-p4.md` | Phase 4 — AuthorMatcher (индекс) | ≤150 |
| `2026-08-14-jungian-profiler-p4a.md` | Phase 4A — Task 4.1 (corpus) | ≤300 |
| `2026-08-14-jungian-profiler-p4b.md` | Phase 4B — Task 4.2 (matcher) | ≤300 |
| `2026-08-14-jungian-profiler-p4c.md` | Phase 4C — Tasks 4.3 (persistence) + 4.4 (Stylist) + **Чекпоинт P4** | ≤300 |

## Карта фаз и чекпоинтов

| Фаза | Файлы | Эффект на нарратив | Чекпоинт (все команды должны пройти) |
|------|-------|--------------------|--------------------------------------|
| **P1** | p1a–p1e | **Нет** — только логирование профиля | `bunx tsc --noEmit` чист; `bun test <P1-файлы>` зелёные; profile roundtrip в БД; флаг `false`; нарратив идентичен с флагом on/off |
| **P2** | p2a–p2f | **Да** — нарративная адаптация, A/B | интеграционный тест полного хода зелёный; LLM count = 1 (Stylist); `AgentV2.process()` нетронут (grep); A/B-теги в логах |
| **P3** | p3, p3b | NPC как личности | NPC psychotype roundtrip; `perceivedPlayerType` обновляется после 3+ взаимодействий |
| **P4** | p4, p4a, p4b, p4c | Стилевой референс | корпус = 50 валидных записей; `analyzeBirth` LLM-pick при создании персонажа (birth wizard: описание + пролог + samplePhrases); `matchAuthor` graceful; `closest_author` roundtrip; few-shot блок только при наличии автора; `analyzeText` (P2) не тронут |

## Порядок выполнения

1. **P1** (p1a → p1b → p1c → p1d → p1e): модель данных + blend + Director + persistence + флаг + хуки. Завершить чекпоинтом P1.
2. **P2** (p2a → p2b → p2c → p2d → p2e → p2f): enrichment-конвейер + PsychotypeAnalyzer + UI. Завершить чекпоинтом P2. Перед P2 завести git worktree (`compose:worktree`) — затрагивает 6 файлов агентов.
3. **P3** (p3 → p3b): NPC-психотипы. Чекпоинт P3.
4. **P4** (p4a → p4b → p4c): AuthorMatcher + few-shot Stylist. Чекпоинт P4. Зависит от Phase 2, не блокирует Phase 1–3.

## Покрытие спеки (S1–S24)

| Раздел дизайна | Покрывается |
|----------------|-------------|
| S1 (проблема) | контекст (не задача) |
| S2 (архитектура) | P2 |
| S3, S3.1 (pipeline/orchestration) | Tasks 2.1, 2.8 |
| S3.2 (AgentV2) | Global Constraints + Task 2.1 |
| S4, S5 (Synopsis/Prologue, PsychotypeAnalyzer) | Task 2.7 |
| S5.1 (metrics) | ✅ реализовано + Task 1.6 |
| S6 (JungianProfile, blend) | Tasks 1.1, 1.2 |
| S7 (AuthorMatcher) | P4 (p4a/p4b/p4c) |
| S8, S8.1 (NPC) | P3 |
| S9 (Director) | Task 1.3 (impl), 2.1 (wire) |
| S9.1 (turn example) | иллюстрация, не задача |
| S10 (narrative adaptation, 16-типов) | Task 2.5 (anti-moralizing gate); полная 16-типовая таблица — через computeDistribution-веса (Task 1.3), не отдельный модуль |
| S11 (архетипы Dramaturg) | Task 2.2 |
| S12 (NPC-диалоги Actor) | Task 2.3 |
| S13 (экономическая адаптация) | частично: `sample(dist.informationStyle)` в buildPlayerVoice (Task 2.1); отдельной задачи нет |
| S14 (persistence) | Task 1.4 |
| S15 (cross-session) | Task 1.4 (roundtrip); confidence-decay при бездействии >7 дней — enhancement, не реализован |
| S16 (A/B) | Task 1.5 (flag), 2.8 (tags) |
| S17 (file structure) | File Structure в каждом файле |
| S18 (risks) | Global Constraints |
| S19 (out of scope) | P4 (AuthorMatcher выведен из out-of-scope в Phase 4) |
| S20 (migration v1.2→v1.3) | спека, не план |
| S21 (phasing) | структура этого индекса |
| S22 (rollback) | Global Constraints |
| S23 (test strategy) | TDD в каждой задаче |
| S24 (migration v1.1) | спека, не план |
