# Jungian Player Profiler — Design Spec

> Версия: 1.1 | Дата: 2026-08-11  
> Изменения v1.1: полная таблица 16 типов в S7; confidence gates; риски; уточнение эвристик; quiz → inference; scope v1 для world signals.

---

## [S1] Проблема

TrueNeverStory адаптирует нарратив к стилю письма игрока (14 метрик в `PlayerStyleProfile`), но не к его **психологическому типу**. Интроверт и экстраверт, мыслитель и чувствующий — все получают одну и ту же историю.

Система понимает, *как* игрок пишет, но не *зачем* он играет и *что* его цепляет. Результат: нарратив стилистически адаптирован, но эмоционально универсален.

---

## [S2] Архитектура решения

Новый сервис `JungianProfiler` анализирует данные из трёх источников и строит юнгианский профиль игрока:

```
Источник 1: Создание мира (жанры, соц. строй, [v1.1+] описание/правила)
    → inferFromWorld() → грубый тип (confidence 0.2–0.35)

Источник 2: Birth Wizard (hints, возраст, isekai, авторы, quiz-ответы)
    → inferFromBirth() → уточнённый тип (confidence 0.4–0.55)

Источник 3: Игровое поведение (PlayerStyleProfile метрики, N ходов)
    → inferFromMetrics() → финальный тип (confidence 0.75–0.9)

Все три → blend() → JungianType, сохраняется в player_style_profiles
    → getNarrativeConstraints() → блок в промпт Стилиста / Dramaturg / Actor / Economy
```

**Правило применения:** адаптация нарратива (constraints, архетипы, NPC, экономика) включается только при `confidence >= 0.45`. Ниже — soft no-op (как без профилера).

### Юнгианская модель

Четыре дихотомии, 16 типов:

| Дихотомия | Полюса | Что определяет |
|-----------|--------|----------------|
| Установка | E (экстраверсия) / I (интроверсия) | Источник энергии |
| Perceiving | S (ощущение) / N (интуиция) | Как воспринимает мир |
| Judging | T (мышление) / F (чувство) | Как принимает решения |
| Lifestyle | J (суждение) / P (восприятие) | Отношение к структуре |

Все эвристики ниже помечены как **heuristic v1** — подлежат калибровке по реальным сессиям (A/B + логи).

---

## [S3] Данные из создания мира

Форма `worlds.html` уже собирает данные для первичного inference.

### v1 (обязательно в первой реализации)

| Поле | Сигнал (heuristic v1) |
|------|------------------------|
| Genres (checkboxes) | Fantasy→N+F, Sci-Fi→N+T, LitRPG→T+S, Horror→S+F, Historical→S+T, Cyberpunk→T+N, Mythology→N+F, Post-Apocalyptic→S+F, Steampunk→N+T |
| Social System | Feudalism→S+J, Democracy→N+F, Anarchy→N+P, Theocracy→N+J, Communism→S+T, Capitalism→S+T, Tribalism→S+F, Mercantilism→S+T |

### v1.1+ (опционально, отдельный task)

| Поле | Сигнал (heuristic v1) |
|------|------------------------|
| Description (длина, стиль) | Длинное структурированное→J; короткое→P; богатый словарь/метафоры→N; конкретные детали→S |
| World Rules (количество) | Много правил→J, мало→P |
| Economy Modifiers | Gold Standard/Command→S+T, Barter→S+F |
| Magic System (стиль) | Системное описание→T, атмосферическое→F |

---

## [S4] Данные из Birth Wizard

| Поле | Сигнал (heuristic v1) |
|------|------------------------|
| Character Hints (текст) | Keyword map: warrior→S, scholar→T, healer→F, seer→N и т.д. |
| Starting Age | <18→P; ≥40→J; 60+ дополнительно лёгкий I+N |
| Isekai Mode | ON→лёгкий E («я остаюсь собой в новом мире»); OFF→лёгкий I («я становлюсь другим»). *Слабый сигнал, weight ≤ 0.4* |
| Favorite Authors/Books | AUTHOR_DB mapping (см. S8) |
| Quiz answers (S9) | Прямые полюса E/I, S/N, T/F, J/P — высокий weight |

---

## [S5] Данные из игрового поведения

Метрики из `PlayerStyleProfile` (реальные поля store):

| Метрика | Юнгианский сигнал (heuristic v1) |
|---------|----------------------------------|
| `action_orientation` > 0.7 | S |
| `emotional_expressiveness` > 0.7 | F |
| `literary_sophistication` > 0.7 **и** `sensory_bias` < 0.4 | N |
| `literary_sophistication` > 0.7 **и** `register_score` > 0.6 | T |
| `dialogue_ratio` > 0.6 | E |
| `narrative_distance` > 0.7 | I |
| `preferred_pace` = `"fast"` | S (+ лёгкий P) |
| `preferred_pace` = `"slow"` | N (+ лёгкий J) |
| `sensory_bias` > 0.6 | S |
| `preferred_motifs` содержит mystery / secrets / symbols | N |

Пороги и веса калибруются; при противоречии побеждает больший накопленный score в `blend`.

---

## [S6] JungianType — тип данных

```typescript
type JungianAttitude = 'E' | 'I';
type JungianPerceiving = 'S' | 'N';
type JungianJudging = 'T' | 'F';
type JungianLifestyle = 'J' | 'P';

interface JungianType {
  attitude: JungianAttitude;
  perceiving: JungianPerceiving;
  judging: JungianJudging;
  lifestyle: JungianLifestyle;
  confidence: number;              // 0–1
  source: 'world' | 'birth' | 'metrics' | 'blended' | 'default';
}

// 4-буквенное кодирование: "INFJ", "ESTP"
function encodeJungian(t: JungianType): string {
  return `${t.attitude}${t.perceiving}${t.judging}${t.lifestyle}`;
}
```

**Default:** `confidence: 0`, `source: 'default'`. Не использовать «нейтральный» ISFP как скрытый bias — пока нет сигнала, адаптация выключена.

### Confidence formula (в `blend`)

```text
signalStrength ∈ [0, 1]   // доля заполненных осей + сила весов
newConfidence = min(0.95, current.confidence + weight * (1 - current.confidence) * signalStrength)
```

Ожидаемые диапазоны после источников:

| Источник | Типичный confidence |
|----------|---------------------|
| world only | 0.20–0.35 |
| + birth | 0.40–0.55 |
| + metrics (≥20 ходов) | 0.75–0.90 |

---

## [S7] Адаптация нарратива — полная таблица 16 типов

`getNarrativeConstraints(type)` возвращает блок для промпта. Применяется только если `confidence >= 0.45`.

| Тип | Prefer | Avoid | Pace | Tone |
|-----|--------|-------|------|------|
| **ISTJ** | Architecture, logical puzzles, clear structure, duty | Pure abstraction, melodrama | medium | factual |
| **ISFJ** | Past details, tradition, care, loyalty to people | Chaos, moral ambiguity as default | slow | warm |
| **INFJ** | Symbolism, inner world, moral dilemmas, quiet meaning | Pure action, black-and-white morality | slow | dark, poetic |
| **INTJ** | Long-term plans, systems, competence, hidden strategy | Small talk, aimless wandering | medium | controlled, strategic |
| **ISTP** | Tools, tactics, hands-on problem solving | Forced emotion, abstract philosophy | medium–fast | dry, precise |
| **ISFP** | Sensory beauty, personal values, quiet loyalty | Cold systems, public conflict | medium | soft, aesthetic |
| **INFP** | Ideals, authenticity, emotional truth, found family | Cynicism-as-default, pure mechanics | variable | lyrical, sincere |
| **INTP** | Systems, logic, hidden connections, paradox | Melodrama, surface charm | medium | analytical |
| **ESTP** | Action, danger, sensory immediacy, risk | Long introspection, pure theory | fast | visceral |
| **ESFP** | Emotions, social dynamics, immediate experience | Dry technical detail, isolation | fast | vibrant |
| **ENFP** | Possibilities, character depth, hidden meanings | Routine, rigid predictability | variable | inspirational |
| **ENTP** | Debate, paradox, intellectual challenge, schemes | Simple answers, dogma | fast | witty |
| **ESTJ** | Order, clear goals, leadership, measurable progress | Ambiguity, endless open endings | medium–fast | decisive |
| **ESFJ** | Community, harmony, care for others, rituals | Cold calculation, isolation | medium | sociable, warm |
| **ENFJ** | Shared purpose, growth of others, moral arc | Pure self-interest, nihilism | medium | inspiring, guiding |
| **ENTJ** | Ambition, strategy, decisive action, empire-building | Passivity, pure sentiment | fast | commanding |

Дополнительно в `NarrativeConstraints`:

- `sensoryFocus: string[]` — подсказки по сенсорике
- `archetypePreference: string[]` — см. S11

---

## [S8] Авторы — база данных

JSON/TS массив `AUTHOR_DB` (seed **30–40** авторов в v1; расширение до 50–100 — follow-up).

```typescript
interface AuthorMapping {
  author: string;           // lowercase, нормализованное
  aliases: string[];        // альтернативные имена + транслит
  perceiving: 'S' | 'N';
  judging: 'T' | 'F';
  attitude: 'E' | 'I';
  weight: number;           // 0.5–1.0
}
```

**Нормализация входа:** lowercase, trim, strip punctuation, простая cyr↔lat транслитерация, NFKD без диакритики.

Примеры seed: достоевский, толстой, толкин, азимов, хемингуэй, сапковский, лем, лавкрафт, пелевин, стругацкие, булгаков, гейман, пратчетт, ле гуин, дик, кафка, борхес, кинг, ороуэлл, желязны…

---

## [S9] Вопросы-тесты в онбординге

5 вопросов, замаскированных под выбор персонажа. **Опциональны** — пропуск не блокирует birth.

| # | Вопрос | Варианты → полюс |
|---|--------|------------------|
| 1 | Ты входишь в таверну. Что first? | К людям / В угол → E / I |
| 2 | Старик рассказывает legend. Что интересует? | Детали / Скрытый смысл → S / N |
| 3 | Ты нашёл artifact. Как поступишь? | Изучу устройство / Почувствую значение → T / F |
| 4 | Тебя предали. Что сильнее? | Холодный расчёт / Боль и «почему» → T / F |
| 5 | Два пути. | Известный безопасный / Неизвестный интересный → J / P |

Ответы уходят в `inferFromQuizAnswers` и blend’ятся в birth с высоким weight (~0.7–1.0 на ось).

---

## [S10] Сохранение и обновление

1. Новые колонки в `player_style_profiles` (backward-compatible defaults):
   - `jungian_type TEXT` (например `"INFJ"` или `NULL`)
   - `jungian_confidence REAL DEFAULT 0`
   - `jungian_source TEXT DEFAULT 'default'`
   - `jungian_history TEXT DEFAULT '[]'` (JSON-массив `{type, confidence, source, ts}`)
2. При создании мира: `inferFromWorld()` → session/memory (player ещё нет)
3. При Birth: `inferFromBirth` + quiz → blend с world → upsert в DB
4. Каждые **20** ходов: `inferFromMetrics` → `blend` → update DB + history
5. Каждый inference логируется с reasoning (structured log)

---

## [S11] Адаптация архетипов (Dramaturg)

Только при `confidence >= 0.45`.

| Функция | Предпочтительные архетипы |
|---------|---------------------------|
| S | rescue, escape_liberation, quest_journey |
| N | temptation_fall, wisdom_counsel, rise_fall_rise |
| T | judgment_trial, political_intrigue, wisdom_counsel |
| F | loyalty, betrayal, inheritance_return, endurance_suffering |

Предпочтение — soft bias на ranking retrieval, не жёсткий фильтр.

---

## [S12] Адаптация NPC-диалогов (Actor)

Только при `confidence >= 0.45`.

| Доминанта игрока | NPC-адаптация |
|------------------|---------------|
| T | Больше фактов, деталей, логических аргументов |
| F | Больше эмоций, личных историй, эмпатии |
| S | Конкретные описания, practical info |
| N | Символы, метафоры, скрытые намёки |

---

## [S13] Адаптация Economic Service

Только при `confidence >= 0.45`.

| Тип игрока | Экономическая адаптация |
|------------|-------------------------|
| T+S | Подробные цифры, таблицы цен, механики торговли |
| N+F | Социальные последствия, отношения с купцами |
| S | Конкретные описания товаров (вес, текстура, запах) |
| N | Скрытые возможности, контрабанда, тайные рынки |

---

## [S14] Cross-session persistence

`JungianType` в `player_style_profiles` переживает сессии. При новой сессии того же `player_id`:

1. Загружаем сохранённый тип
2. Продолжаем `blend` с новыми метриками
3. `confidence` не сбрасывается

---

## [S15] A/B тестирование

Флаг `jungian-profiler-enabled` (default: **false**):

- `false` — обычный нарратив
- `true` — полная адаптация через constraints / архетипы / NPC / economy

Метрики:

- quantitative: session length, return rate, message count, turns per session
- optional qualitative: voluntary «сюжет ощущается более “своим”» (1–5)

Логи engagement тегируются `jungianEnabled` + `jungianType`.

---

## [S16] Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `src/services/jungian-profiler.ts` | Создать | Profiler, AUTHOR_DB, types, constraints |
| `src/services/jungian-profiler.test.ts` | Создать | Unit-тесты |
| `src/lib/player-profile-store.ts` | Модифицировать | Новые колонки |
| `src/lib/feature-flags.ts` + `conf/feature-flags.json` | Модифицировать | Флаг |
| `src/services/agents/stylist.ts` | Модифицировать | Constraints в micro-prompt |
| `src/services/agents/dramaturg.ts` | Модифицировать | Archetype preference |
| `src/services/agents/actor.ts` | Модифицировать | NPC adaptation |
| `src/services/economic-service.ts` | Модифицировать | Economic adaptation |
| `src/routes/worlds.ts` | Модифицировать | inferFromWorld |
| `src/routes/launch.ts` | Модифицировать | inferFromBirth + quiz |
| `src/services/roleplay/pipeline-runner.ts` | Модифицировать | Update every 20 turns |
| `public/worlds.html` | Модифицировать | Authors field + optional quiz |

---

## [S17] Риски и ограничения

| Риск | Митигация |
|------|-----------|
| Stereotyping / «коробка типа» | Soft bias, не жёсткие фильтры; confidence gate; A/B |
| Self-fulfilling prophecy | Метрики поведения имеют больший вес со временем; history позволяет отследить drift |
| Privacy | Тип только локально в `player-profiles.db`; не уходит во внешние API; UI-note: «используется только для адаптации стиля» |
| Слабые эвристики (isekai, жанры) | Помечены heuristic v1; низкие веса; калибровка по логам |
| Неверный тип при малом N ходов | confidence < 0.45 → адаптация выключена |

---

## [S18] Out of scope (v1)

- LLM-классификация свободного текста «кто я» как замена quiz
- Публичный sharing типа игрока
- Сопоставление с MBTI commercial tests
- World meta signals (description length, rules count) — v1.1+
- Полный AUTHOR_DB 100+ — seed 30–40 в v1
