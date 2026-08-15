# Profiler Persistence + PsychotypeAnalyzer — Jungian Profiler

> Спека 3 из 5. Определяет AxisProfile модель, начальный профиль из текста и SQLite хранение.
> Зависит от: [Spec 1 — Blend Algorithm](spec-blend-algorithm.md) (AxisProfile тип, blend функции).
> Остальные: [Spec 2 — Behavioral Metrics](spec-behavioral-metrics.md) | [Spec 4 — Integration](spec-profiler-integration.md) | [Spec 5 — Implementation](spec-profiler-implementation.md)

## 1. AxisProfile и JungianProfile

Типы определены в Spec 1. Здесь — как они хранятся и откуда берутся при старте.

### Cold start (нет данных)

```typescript
function createDefaultProfile(): JungianProfile {
  return {
    extraversion: { preference: 0.5, range: 0.1 },
    intuition:    { preference: 0.5, range: 0.1 },
    thinking:     { preference: 0.5, range: 0.1 },
    judging:      { preference: 0.5, range: 0.1 },
    confidence: 0,
    axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
    source: 'default',
  };
}
```

confidence = 0 = "ещё не знаем". 0 < 0.3 → Director возвращает uniform, адаптация выключена. После первого blend (20+ ходов) confidence начинает расти.

## 2. PsychotypeAnalyzer — начальный профиль из текста

### Назначение

Анализирует Synopsis + Prologue игрока через LLM и создаёт начальный JungianProfile. Это **разовая** операция при создании персонажа — после неё профиль обновляется только behavioral blend'ом.

### Входные данные

```typescript
interface PsychotypeInput {
  synopsis: string;    // Краткое описание персонажа игроком
  prologue: string;    // Текст пролога (первое повествование)
  worldGenre: string;  // Жанр мира (для контекста)
}
```

### Выходные данные

```typescript
interface PsychotypeResult {
  analysis: TextAnalysis;   // полный S5 результат: psychotype + style + themes + suggestedArcs + worldHints
  profile: JungianProfile;  // source: 'text'; confidence = min(psychotype.confidence, cap(wordCount))
}
```

### LLM Prompt (structured output)

```
Analyze this character description and story prologue to determine psychological preferences.

CHARACTER SYNOPSIS:
{synopsis}

PROLOGUE:
{prologue}

World genre: {worldGenre}

Rate each dimension 0.0-1.0:
- Extraversion (0) vs Introversion (1): social energy, interaction style
- Sensing (0) vs Intuition (1): concrete vs abstract thinking
- Feeling (0) vs Thinking (1): emotional vs logical decision-making
- Perceiving (0) vs Judging (1): spontaneous vs structured approach

Also rate per-axis confidence (0-1) and an overall confidence (0-1).

Respond as JSON (schema TextAnalysis — см. ниже):
{
  "psychotype": {
    "extraversion": 0.0-1.0,
    "intuition": 0.0-1.0,
    "thinking": 0.0-1.0,
    "judging": 0.0-1.0,
    "axisConfidence": { "extraversion": 0.0-1.0, "intuition": 0.0-1.0, "thinking": 0.0-1.0, "judging": 0.0-1.0 },
    "confidence": 0.0-1.0
  },
  "style": { "register": "high|medium|low", "pacing": "slow|medium|fast|variable", "sensoryFocus": ["..."], "sentenceProfile": { "avgLength": 0, "complexity": "simple|moderate|complex" } },
  "themes": ["..."],
  "suggestedArcs": ["..."],
  "worldHints": { "suggestedGenres": ["..."], "suggestedSocialSystem": "...", "suggestedTone": "..." }
}
```

### TextAnalysis — structured output schema

LLM возвращает не только psychotype, но и дополнительные поля для Stylist и Director:

```typescript
interface TextAnalysis {
  psychotype: {
    extraversion: number;    // 0 = pure I, 1 = pure E, 0.5 = neutral
    intuition: number;       // 0 = pure S, 1 = pure N
    thinking: number;        // 0 = pure F, 1 = pure T
    judging: number;         // 0 = pure P, 1 = pure J
    axisConfidence: {
      extraversion: number;
      intuition: number;
      thinking: number;
      judging: number;
    };
    confidence: number;      // 0-1, capped по длине текста → JungianProfile.confidence
  };
  style: {
    register: 'high' | 'medium' | 'low';
    pacing: 'slow' | 'medium' | 'fast' | 'variable';
    sensoryFocus: string[];
    sentenceProfile: {
      avgLength: number;
      complexity: 'simple' | 'moderate' | 'complex';
    };
  };
  // closestAuthor — DEFERRED (Phase 4, AuthorMatcher). Не возвращается в v1.3.
  themes: string[];
  suggestedArcs: string[];
  worldHints: {
    suggestedGenres: string[];
    suggestedSocialSystem: string;
    suggestedTone: string;
  };
}
```

`TextAnalysis.psychotype` маппится в `JungianProfile`, остальные поля (`style`, `themes`, `suggestedArcs`, `worldHints`) сохраняются в session/memory и используются Director'ом и Stylist'ом. `closestAuthor` — Phase 4.

### Маппинг LLM output → JungianProfile

```typescript
function llmResultToProfile(result: TextAnalysis, cap: number): JungianProfile {
  const p = result.psychotype;
  return {
    extraversion: { preference: p.extraversion, range: 0.1 },
    intuition:    { preference: p.intuition, range: 0.1 },
    thinking:     { preference: p.thinking, range: 0.1 },
    judging:      { preference: p.judging, range: 0.1 },
    // S5: скалярный confidence LLM, capped по длине текста (не avg по осям)
    confidence: Math.min(p.confidence, cap),
    axisConfidence: p.axisConfidence,
    source: 'text',
  };
}
```

**range = 0.1** — начальный. Будет расти через blend при разнообразном поведении.

### Когда вызывается

Один раз, при создании нового персонажа (после Synopsis + Prologue). Результат сохраняется в БД.

## 3. SQLite Persistence

### Хранение JungianProfile — колонки на `player_style_profiles`

> **Fix v1.3:** в ранних версиях была отдельная таблица `jungian_profile`. Убрана — профиль хранится **колонками** на существующей `player_style_profiles` (дизайн S14). Это переиспользует существующий `PlayerProfileStore` и одну таблицу на игрока. Миграция (ALTER ADD COLUMN) — в разделе 6 ниже.

Колонки (имена с префиксом `jungian_`): `jungian_extraversion_pref`, `jungian_extraversion_range`, `jungian_intuition_pref`, `jungian_intuition_range`, `jungian_thinking_pref`, `jungian_thinking_range`, `jungian_judging_pref`, `jungian_judging_range`, `jungian_confidence`, `jungian_conf_extraversion`, `jungian_conf_intuition`, `jungian_conf_thinking`, `jungian_conf_judging`, `jungian_source`, `detected_themes`. `closest_author` — Phase 4.

### Таблица: player_behavioral_metrics

```sql
CREATE TABLE IF NOT EXISTS player_behavioral_metrics (
  player_id TEXT PRIMARY KEY,
  total_turns INTEGER NOT NULL DEFAULT 0,
  -- Агрегаты (REAL — после decay значения дробные)
  dialogue_initiated REAL NOT NULL DEFAULT 0,
  dialogue_count REAL NOT NULL DEFAULT 0,
  dialogue_total_words REAL NOT NULL DEFAULT 0,
  avoided_dialogues REAL NOT NULL DEFAULT 0,
  exploration_actions REAL NOT NULL DEFAULT 0,
  risk_taking_actions REAL NOT NULL DEFAULT 0,
  planning_actions REAL NOT NULL DEFAULT 0,
  combat_initiated REAL NOT NULL DEFAULT 0,
  input_total_chars REAL NOT NULL DEFAULT 0,
  expressive_actions REAL NOT NULL DEFAULT 0,
  -- Последние вычисленные сигналы
  signal_extraversion REAL NOT NULL DEFAULT 0.5,
  signal_intuition REAL NOT NULL DEFAULT 0.5,
  signal_thinking REAL NOT NULL DEFAULT 0.5,
  signal_judging REAL NOT NULL DEFAULT 0.5,
  last_updated INTEGER NOT NULL
);
```

Агрегаты хранятся как REAL — после decay ×0.9 значения дробные. Никакой истории отдельных действий: O(1) памяти, невозможность replay (privacy).

### PlayerProfileStore — API расширение

Существующий `PlayerProfileStore` (`src/lib/player-profile-store.ts`) уже работает с `player_style_profiles`. Нужно добавить методы:

```typescript
class PlayerProfileStore {
  // Существующие (стилистический профиль) — не трогать
  // ...

  // Новые (Jungian профиль)
  upsertJungianProfile(playerId: string, profile: JungianProfile): void;
  getJungianProfile(playerId: string): JungianProfile | null;

  // Новые (behavioral метрики)
  upsertBehavioralMetrics(playerId: string, aggregates: RawAggregates, totalTurns: number, signals: AxisSignals): void;
  getBehavioralMetrics(playerId: string): { aggregates: RawAggregates; totalTurns: number; signals: AxisSignals } | null;
}
```

### Serialization

> Колонки на `player_style_profiles` (префикс `jungian_`). `derived_type` не хранится — вычисляется через `deriveType(profile)`.

```typescript
// JungianProfile → DB row (колонки на player_style_profiles)
function profileToRow(p: JungianProfile): JungianProfileRow {
  return {
    jungian_extraversion_pref: p.extraversion.preference,
    jungian_extraversion_range: p.extraversion.range,
    jungian_intuition_pref: p.intuition.preference,
    jungian_intuition_range: p.intuition.range,
    jungian_thinking_pref: p.thinking.preference,
    jungian_thinking_range: p.thinking.range,
    jungian_judging_pref: p.judging.preference,
    jungian_judging_range: p.judging.range,
    jungian_confidence: p.confidence,
    jungian_conf_extraversion: p.axisConfidence.extraversion,
    jungian_conf_intuition: p.axisConfidence.intuition,
    jungian_conf_thinking: p.axisConfidence.thinking,
    jungian_conf_judging: p.axisConfidence.judging,
    jungian_source: p.source,
    detected_themes: '[]',  // Phase 4: из TextAnalysis.themes
  };
}

// DB row → JungianProfile
function rowToProfile(row: JungianProfileRow): JungianProfile {
  return {
    extraversion: { preference: row.jungian_extraversion_pref, range: row.jungian_extraversion_range },
    intuition:    { preference: row.jungian_intuition_pref, range: row.jungian_intuition_range },
    thinking:     { preference: row.jungian_thinking_pref, range: row.jungian_thinking_range },
    judging:      { preference: row.jungian_judging_pref, range: row.jungian_judging_range },
    confidence: row.jungian_confidence,
    axisConfidence: {
      extraversion: row.jungian_conf_extraversion,
      intuition: row.jungian_conf_intuition,
      thinking: row.jungian_conf_thinking,
      judging: row.jungian_conf_judging,
    },
    source: row.jungian_source as JungianProfile['source'],
  };
}
```

## 4. Файловая структура

| Файл | Действие | Описание |
|------|----------|----------|
| `src/services/jungian-profiler.ts` | Создать | LLM-анализ Synopsis+Prologue → JungianProfile (PsychotypeAnalyzer) |
| `src/services/jungian-profiler.test.ts` | Создать | Тесты: JSON parsing, default fallback, confidence mapping |
| `src/lib/player-profile-store.ts` | Модифицировать | Добавить upsert/get JungianProfile + behavioral metrics |
| `src/lib/__tests__/player-profile-store.test.ts` | Модифицировать | Тесты новых методов |

## 5. Тесты

### PsychotypeAnalyzer
1. Валидный LLM JSON → корректный JungianProfile с source='text'
2. Невалидный JSON → fallback на createDefaultProfile()
3. Пустой synopsis → использует только prologue
4. range всегда 0.1 при инициализации

### Persistence
1. upsert + get → roundtrip сохраняет все поля
2. get для несуществующего player → null
3. upsert обновляет существующую запись (UPSERT)
4. behavioral metrics: aggregates с дробными значениями после decay
5. signal_* поля сохраняются и загружаются

## 6. Миграция player_style_profiles

Существующая таблица `player_style_profiles` расширяется новыми колонками для jungian-профиля:

```sql
ALTER TABLE player_style_profiles ADD COLUMN jungian_extraversion_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_extraversion_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_intuition_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_intuition_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_thinking_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_thinking_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_judging_pref REAL NOT NULL DEFAULT 0.5;
ALTER TABLE player_style_profiles ADD COLUMN jungian_judging_range REAL NOT NULL DEFAULT 0.1;
ALTER TABLE player_style_profiles ADD COLUMN jungian_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_extraversion REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_intuition REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_thinking REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_conf_judging REAL NOT NULL DEFAULT 0;
ALTER TABLE player_style_profiles ADD COLUMN jungian_source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE player_style_profiles ADD COLUMN detected_themes TEXT NOT NULL DEFAULT '[]';
-- closest_author TEXT — Phase 4 (AuthorMatcher), не добавляется в v1.3
```

Миграция через `PRAGMA table_info` перед каждым `ALTER` (SQLite не поддерживает `IF NOT EXISTS`).

## 7. Пайплайн обновления (7 шагов)

1. **При создании мира:** `analyzeText(synopsis, prologue)` → session/memory
2. **При Birth Wizard:** hints уточняют (слабые сигналы, weight ≤ 0.15)
3. **Каждый ход:** `MetricsCollector` инкрементирует агрегаты (без LLM)
4. **Каждые 20 ходов:** `deriveMetrics` → `inferFromMetrics` → `blendBehavioralSignals(signals, profile, recentSignals)` → update both tables → `decay()`
5. **Confidence:** подтверждение → рост (+0.05), противоречие → падение (-0.10), нейтрально → стабильно
6. **Range:** deviation от rolling avg > 0.3 → рост (+0.02), стабильность → decay (-0.005/цикл)
7. **Exploration:** Director использует `averageRange(profile)` для `explorationFactor` (минимум 5%)

## 8. Cross-session persistence

- Профиль переживает сессии (сохраняется в SQLite, загружается при старте сессии)
- При бездействии > 7 дней: `confidence` decay (постепенное снижение уверенности)

## 9. Out of scope (v1.3)

- Ручной сброс психотипа через UI
- Визуализация распределения в UI
- AUTHOR_EMBEDDINGS 100+ (seed 50)
- Big Five (OCEAN) — v2+
- Нейросетевой маппинг behaviour → psychotype
- NPC-to-NPC автономные взаимодействия без игрока
- Хранение истории отдельных действий (только агрегаты)
- Per-axis confidence gates (отдельные пороги для каждой оси) — v1.4 по результатам A/B
- Manipulation detection как отдельная система (заменено на rate limit 0.10/blend + range tracking, без inertia)
