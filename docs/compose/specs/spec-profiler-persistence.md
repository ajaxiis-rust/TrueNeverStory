# Profiler Persistence + PsychotypeAnalyzer — Jungian Profiler

> Спека 3 из 4. Определяет AxisProfile модель, начальный профиль из текста и SQLite хранение.
> Зависит от: [Spec 1 — Blend Algorithm](spec-blend-algorithm.md) (AxisProfile тип, blend функции).
> Остальные: [Spec 2 — Behavioral Metrics](spec-behavioral-metrics.md) | [Spec 4 — Integration](spec-profiler-integration.md)

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
    confidence: 0.3,
    axisConfidence: { extraversion: 0.3, intuition: 0.3, thinking: 0.3, judging: 0.3 },
    source: 'default',
  };
}
```

Confidence 0.3 = "ещё не знаем". Director при такой уверенности даёт разнообразный контент.

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
  profile: JungianProfile;  // source: 'synopsis'
  reasoning: string;        // Объяснение LLM (для отладки, не для игрока)
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

Also rate your confidence (0-1) for each axis based on textual evidence.

Respond as JSON:
{
  "extraversion": { "value": 0.0-1.0, "confidence": 0.0-1.0, "evidence": "..." },
  "intuition":    { "value": 0.0-1.0, "confidence": 0.0-1.0, "evidence": "..." },
  "thinking":     { "value": 0.0-1.0, "confidence": 0.0-1.0, "evidence": "..." },
  "judging":      { "value": 0.0-1.0, "confidence": 0.0-1.0, "evidence": "..." }
}
```

### Маппинг LLM output → JungianProfile

```typescript
function llmResultToProfile(result: LLMOutput): JungianProfile {
  return {
    extraversion: { preference: result.extraversion.value, range: 0.1 },
    intuition:    { preference: result.intuition.value, range: 0.1 },
    thinking:     { preference: result.thinking.value, range: 0.1 },
    judging:      { preference: result.judging.value, range: 0.1 },
    confidence: avg(result.extraversion.confidence, result.intuition.confidence,
                    result.thinking.confidence, result.judging.confidence),
    axisConfidence: {
      extraversion: result.extraversion.confidence,
      intuition:    result.intuition.confidence,
      thinking:     result.thinking.confidence,
      judging:      result.judging.confidence,
    },
    source: 'synopsis',
  };
}
```

**range = 0.1** — начальный. Будет расти через blend при разнообразном поведении.

### Когда вызывается

Один раз, при создании нового персонажа (после Synopsis + Prologue). Результат сохраняется в БД.

## 3. SQLite Persistence

### Таблица: jungian_profile

```sql
CREATE TABLE IF NOT EXISTS jungian_profile (
  player_id TEXT PRIMARY KEY,
  -- 4 оси × 2 поля (preference, range)
  extraversion_pref REAL NOT NULL DEFAULT 0.5,
  extraversion_range REAL NOT NULL DEFAULT 0.1,
  intuition_pref REAL NOT NULL DEFAULT 0.5,
  intuition_range REAL NOT NULL DEFAULT 0.1,
  thinking_pref REAL NOT NULL DEFAULT 0.5,
  thinking_range REAL NOT NULL DEFAULT 0.1,
  judging_pref REAL NOT NULL DEFAULT 0.5,
  judging_range REAL NOT NULL DEFAULT 0.1,
  -- Confidence
  confidence REAL NOT NULL DEFAULT 0.3,
  conf_extraversion REAL NOT NULL DEFAULT 0.3,
  conf_intuition REAL NOT NULL DEFAULT 0.3,
  conf_thinking REAL NOT NULL DEFAULT 0.3,
  conf_judging REAL NOT NULL DEFAULT 0.3,
  -- Metadata
  source TEXT NOT NULL DEFAULT 'default',  -- 'default' | 'synopsis' | 'blended'
  derived_type TEXT,                        -- e.g. "INTJ"
  last_updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

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

```typescript
// JungianProfile → DB row
function profileToRow(playerId: string, p: JungianProfile): JungianProfileRow {
  return {
    player_id: playerId,
    extraversion_pref: p.extraversion.preference,
    extraversion_range: p.extraversion.range,
    intuition_pref: p.intuition.preference,
    intuition_range: p.intuition.range,
    thinking_pref: p.thinking.preference,
    thinking_range: p.thinking.range,
    judging_pref: p.judging.preference,
    judging_range: p.judging.range,
    confidence: p.confidence,
    conf_extraversion: p.axisConfidence.extraversion,
    conf_intuition: p.axisConfidence.intuition,
    conf_thinking: p.axisConfidence.thinking,
    conf_judging: p.axisConfidence.judging,
    source: p.source,
    derived_type: p.derivedType ?? null,
    last_updated: Date.now(),
    created_at: Date.now(),
  };
}

// DB row → JungianProfile
function rowToProfile(row: JungianProfileRow): JungianProfile {
  return {
    extraversion: { preference: row.extraversion_pref, range: row.extraversion_range },
    intuition:    { preference: row.intuition_pref, range: row.intuition_range },
    thinking:     { preference: row.thinking_pref, range: row.thinking_range },
    judging:      { preference: row.judging_pref, range: row.judging_range },
    confidence: row.confidence,
    axisConfidence: {
      extraversion: row.conf_extraversion,
      intuition: row.conf_intuition,
      thinking: row.conf_thinking,
      judging: row.conf_judging,
    },
    source: row.source as JungianProfile['source'],
    derivedType: row.derived_type ?? undefined,
  };
}
```

## 4. Файловая структура

| Файл | Действие | Описание |
|------|----------|----------|
| `src/services/psychotype-analyzer.ts` | Создать | LLM-анализ Synopsis+Prologue → JungianProfile |
| `src/services/psychotype-analyzer.test.ts` | Создать | Тесты: JSON parsing, default fallback, confidence mapping |
| `src/lib/player-profile-store.ts` | Модифицировать | Добавить upsert/get JungianProfile + behavioral metrics |
| `src/lib/player-profile-store.test.ts` | Модифицировать | Тесты новых методов |

## 5. Тесты

### PsychotypeAnalyzer
1. Валидный LLM JSON → корректный JungianProfile с source='synopsis'
2. Невалидный JSON → fallback на createDefaultProfile()
3. Пустой synopsis → использует только prologue
4. range всегда 0.1 при инициализации

### Persistence
1. upsert + get → roundtrip сохраняет все поля
2. get для несуществующего player → null
3. upsert обновляет существующую запись (UPSERT)
4. behavioral metrics: aggregates с дробными значениями после decay
5. signal_* поля сохраняются и загружаются
