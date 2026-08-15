# Profiler Implementation — Jungian Profiler

> Спека 5 из 5. Implementation guide: файловая структура, экономическая адаптация, A/B тестирование.
> Зависит от: все предыдущие спеки.

## 1. Файловая структура (implementation guide)

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `src/services/jungian-profiler.ts` | Создать | Profiler, Director (pure fn), PsychotypeAnalyzer, `assignNpcPsychotype` (Phase 3), типы, constraints |
| `src/services/jungian-profiler.test.ts` | Создать | Unit-тесты: Director, blend, infer, constraints (см. дизайн S23) |
| `src/services/metrics-collector.ts` | ✅ есть | MetricsCollector: recordIntent, recordSimulation, recordInput, inferFromMetrics |
| `src/services/metrics-collector.test.ts` | ✅ есть | 28 тестов: signal normalization, aggregation, AxisSignals inference |
| `src/lib/player-profile-store.ts` | Модифицировать | jungian-колонки на `player_style_profiles` + `player_behavioral_metrics` + `npc_perception` (Phase 3) |
| `src/lib/feature-flags.ts` | Модифицировать | Флаг `jungian-profiler-enabled` + дефолтная конфигурация |
| `conf/feature-flags.json` | Модифицировать | Конфигурация флага с вариантами control/treatment |
| **Big Six — интеграция в пайплайн:** | | |
| → Director | pure function в `jungian-profiler.ts` | Старый `DirectorAgent` — без изменений, для `@director` mention |
| `src/services/agents/dramaturg.ts` | Модифицировать | `enrichScene()` — SQL к **literary-compiler** БД (`searchTemplates`) |
| `src/services/agents/actor.ts` | Модифицировать | `enrichNpcs()` — NPC psychotype × informationStyle |
| `src/services/agents/validator.ts` | Модифицировать | `verify()` — существующие **MCP-тулы** (`verify_fact`, `get_context`) |
| `src/services/agents/stylist.ts` | Модифицировать | `buildMicroPrompt()` — получает готовый `playerVoice` |
| `src/services/agents/censor.ts` | Модифицировать | `clean()` — regex-замена клише + LLM polish |
| `src/services/agents/chronicler-agent.ts` | Без изменений | ChroniclerAgent (v2) уже вызывает `chronicler.logEvent()` |
| **Интеграция:** | | |
| `src/services/roleplay-engine.ts` | Модифицировать | Конвейер: Director→Dramaturg→Actor→Validator→Stylist→Censor + MetricsCollector хуки |
| `src/services/roleplay/pipeline-runner.ts` | Модифицировать | Передача `playerVoice` и `distribution` в контекст |
| `src/services/roleplay/prose/literary-v2-generator.ts` | Модифицировать | Приём `playerVoice` вместо самостоятельного поиска шаблонов |
| **Ввод данных:** | | |
| `src/services/world-manager.ts` | Модифицировать | `createWorld` вызывает `analyzeText` (этап 1) + персист synopsis/prologue в `world_frame.json` |
| `src/services/birth.ts` | Модифицировать | `analyzeBirth` (этап 2, [S5.2]) — комбинированный refine+автор |
| `public/worlds.html` | Модифицировать | Поля Synopsis + Prologue + i18n для 7 языков |

### Out of scope (v1.3)

- AuthorMatcher (векторный поиск по embeddings) — **Phase 4** (см. дизайн S19/S21)
- `data/author-embeddings.json` — **Phase 4**
- Ручной сброс психотипа через UI
- Визуализация распределения в UI
- Big Five (OCEAN) — v2+
- NPC-to-NPC автономные взаимодействия без игрока
- Per-axis confidence gates — v1.4 по результатам A/B

## 2. Экономическая адаптация

EconomicService получает `informationStyle` из Distribution. Stylist генерирует описания товаров/экономики в соответствующем стиле:

| informationStyle | Описание экономики |
|-----------------|----------|
| analytical + concrete | Цифры, таблицы цен, механики, спрос/предложение |
| emotional + symbolic | Социальные последствия, скрытые возможности, reputation |
| concrete | Вес, текстура, запах товаров, физические свойства |
| symbolic | Контрабанда, тайные рынки, скрытые связи |

**Вызов:** после `buildPlayerVoice()` в roleplay-engine, передаётся в EconomicService через context.

## 3. A/B тестирование

Флаг `jungian-profiler-enabled` (default: **false**).

| Метрика | Что измеряет |
|---------|-------------|
| session length | Длительность сессии |
| return rate | Возврат игроков |
| turns per session | Активность за сессию |
| per-type distribution | Распределение психотипов |

Логи тегируются: `jungianEnabled` + `jungianType` + `confidence`.
