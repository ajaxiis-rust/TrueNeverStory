# Blend Algorithm — Jungian Profiler

> Спека 1 из 5. Самодостаточна — pure functions, нет зависимостей от других модулей.
> Остальные спеки: [Spec 2 — Behavioral Metrics](spec-behavioral-metrics.md) | [Spec 3 — Persistence](spec-profiler-persistence.md) | [Spec 4 — Integration](spec-profiler-integration.md) | [Spec 5 — Implementation](spec-profiler-implementation.md)

## Цель

Pure-функции для сглаживания behavioral signals в JungianProfile. EMA + rate limit, без inertia.

## BLEND_CONFIG

```typescript
const BLEND_CONFIG = {
  emaAlpha: 0.25,            // Скорость сдвига preference (EMA)
  maxShiftPerTurn: 0.10,     // Rate limit: максимум 10% за blend-цикл
  rangeGrowthThreshold: 0.3, // Отклонение от rolling avg > 0.3 → range растёт
  rangeDecayRate: 0.005,     // Range сужается на 0.5% за blend-цикл при стабильности
  minTurnsForBlend: 20,      // Минимум ходов перед первым обновлением
};
```

Конвергенция (EMA alpha=0.25): 50% gap closed за ~50 ходов; 95% конвергенция за ~210 ходов. Rate limit срабатывает при gap > 0.40 (maxShift/alpha). См. таблицу ниже.

## AxisProfile (тип)

```typescript
interface AxisProfile {
  preference: number;  // 0-1, что игрок предпочитает (медленно меняется)
  range: number;       // 0-1, насколько разнообразно ведёт себя
}

interface AxisConfidence {
  extraversion: number;
  intuition: number;
  thinking: number;
  judging: number;
}

interface JungianProfile {
  extraversion: AxisProfile;
  intuition: AxisProfile;
  thinking: AxisProfile;
  judging: AxisProfile;
  confidence: number;         // Среднее по axisConfidence
  axisConfidence: AxisConfidence;
  source: 'text' | 'metrics' | 'blended' | 'default';
  derivedType?: string;       // кеш deriveType(profile); source of truth — функция deriveType()
}
```

## updateAxis

```typescript
function updateAxis(
  current: AxisProfile,
  signal: number,            // 0-1, текущее наблюдение из MetricsCollector
  recentSignals: number[],   // Последние 10 сигналов этой оси (для rolling avg)
): AxisProfile {
  // 1. EMA blend
  const ema = current.preference * (1 - BLEND_CONFIG.emaAlpha) + signal * BLEND_CONFIG.emaAlpha;

  // 2. Rate limit
  const delta = ema - current.preference;
  const clamped = current.preference + Math.sign(delta) * Math.min(Math.abs(delta), BLEND_CONFIG.maxShiftPerTurn);

  // 3. Range — deviation от скользящего среднего
  const rollingAvg = recentSignals.length > 0
    ? recentSignals.reduce((a, b) => a + b, 0) / recentSignals.length
    : current.preference;
  const deviation = Math.abs(signal - rollingAvg);
  const rangeDelta = deviation > BLEND_CONFIG.rangeGrowthThreshold
    ? 0.02
    : deviation > 0.15
      ? 0.01
      : -BLEND_CONFIG.rangeDecayRate;
  const newRange = Math.max(0.05, Math.min(0.95, current.range + rangeDelta));

  return {
    preference: Math.max(0.05, Math.min(0.95, clamped)),
    range: newRange,
  };
}
```

## blendBehavioralSignals

```typescript
interface AxisSignals {
  extraversion: number;   // 0 = I, 1 = E
  intuition: number;      // 0 = S, 1 = N
  thinking: number;       // 0 = F, 1 = T
  judging: number;        // 0 = P, 1 = J
}

function blendBehavioralSignals(
  signals: AxisSignals,
  profile: JungianProfile,
  recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] },
): JungianProfile {
  const updatedExtraversion = updateAxis(profile.extraversion, signals.extraversion, recentSignals.extraversion);
  const updatedIntuition = updateAxis(profile.intuition, signals.intuition, recentSignals.intuition);
  const updatedThinking = updateAxis(profile.thinking, signals.thinking, recentSignals.thinking);
  const updatedJudging = updateAxis(profile.judging, signals.judging, recentSignals.judging);

  const updatedConfExtraversion = updateAxisConfidence(profile.axisConfidence.extraversion, signals.extraversion, updatedExtraversion.preference);
  const updatedConfIntuition = updateAxisConfidence(profile.axisConfidence.intuition, signals.intuition, updatedIntuition.preference);
  const updatedConfThinking = updateAxisConfidence(profile.axisConfidence.thinking, signals.thinking, updatedThinking.preference);
  const updatedConfJudging = updateAxisConfidence(profile.axisConfidence.judging, signals.judging, updatedJudging.preference);

  return {
    extraversion: updatedExtraversion,
    intuition: updatedIntuition,
    thinking: updatedThinking,
    judging: updatedJudging,
    confidence: (updatedConfExtraversion + updatedConfIntuition + updatedConfThinking + updatedConfJudging) / 4,
    axisConfidence: {
      extraversion: updatedConfExtraversion,
      intuition: updatedConfIntuition,
      thinking: updatedConfThinking,
      judging: updatedConfJudging,
    },
    source: 'blended',
  };
}
```

## updateAxisConfidence

```typescript
function updateAxisConfidence(current: number, incoming: number, blendedPreference: number): number {
  const difference = Math.abs(incoming - blendedPreference);
  if (difference < 0.1) return Math.min(0.95, current + 0.05);     // Подтверждение
  if (difference > 0.3) return Math.max(0.3, current - 0.1);       // Противоречие
  return current;                                                    // Нейтрально
}
```

## injectShadow + normalizeWeights

Добавляет в distribution веса для слабой (inferior) функции игрока. Вызывается после `computeDistribution`.

```typescript
function injectShadow(dist: ProbabilityDistribution, profile: JungianProfile): void {
  const rate = dist.shadowInjection;

  // Слабая judging-функция: T → добавляем emotional, F → добавляем analytical
  if (profile.thinking.preference > 0.6) {
    dist.informationStyle.push({ value: 'emotional', weight: rate });
    dist.sceneTone.push({ value: 'warm, personal', weight: rate });
  }
  if (profile.thinking.preference < 0.4) {
    dist.informationStyle.push({ value: 'analytical', weight: rate });
    dist.sceneTone.push({ value: 'dry, factual', weight: rate });
  }

  // Слабая perceiving-функция: N → добавляем sensory-детали, S → добавляем символизм
  if (profile.intuition.preference > 0.6) {
    dist.sensoryChannels.push({ value: 'concrete, tactile', weight: rate });
  }
  if (profile.intuition.preference < 0.4) {
    dist.sensoryChannels.push({ value: 'symbolic, metaphorical', weight: rate });
  }

  normalizeWeights(dist);
}

function normalizeWeights(dist: ProbabilityDistribution): void {
  for (const key of ['sceneTone', 'archetypes', 'pacing', 'sensoryChannels', 'informationStyle'] as const) {
    const total = dist[key].reduce((s, c) => s + c.weight, 0);
    if (total > 0) dist[key].forEach(c => c.weight /= total);
  }
}
```

**Пример:** INTJ (T-доминант, F-слабость) → добавляет `emotional` в informationStyle с весом 0.15 (shadowInjection). После normalizeWeights все веса суммируются в 1.0.

## Confidence: ожидаемые диапазоны

`confidence` = среднее 4 `axisConfidence`:

```text
confidence = (conf_extraversion + conf_intuition + conf_thinking + conf_judging) / 4
```

Каждая `axisConfidence` обновляется в `updateAxisConfidence`:
- Подтверждение (|signal - blendedPreference| < 0.1): +0.05, cap 0.95
- Противоречие (|signal - blendedPreference| > 0.3): -0.10, floor 0.30
- Нейтрально: без изменений

| Источник | overall confidence |
|----------|--------------------|
| Text only (Prologue 200+ слов) | 0.25–0.45 |
| + Metrics (≥20 ходов) | 0.55–0.80 |
| + Metrics (≥50 ходов) | 0.75–0.95 |

## computeDistribution (Director)

Director использует JungianProfile для вычисления ProbabilityDistribution — pure function, 0 LLM:

```typescript
interface ProbabilityDistribution {
  sceneTone: WeightedChoice[];
  archetypes: WeightedChoice[];
  pacing: WeightedChoice[];
  sensoryChannels: WeightedChoice[];
  informationStyle: WeightedChoice[];
  shadowInjection: number;       // 0.10–0.20 — доля контента для inferior функции
  explorationFactor: number;     // 0.05 — случайный non-type контент
}

interface WeightedChoice {
  value: string;
  weight: number;
}

function computeDistribution(
  profile: JungianProfile,
  worldState: WorldState,
  sceneContext: SceneContext,
): ProbabilityDistribution {
  if (profile.confidence < 0.3) return uniformDistribution();

  const dist: ProbabilityDistribution = {
    sceneTone: computeToneDistribution(profile),
    archetypes: computeArchetypeDistribution(profile),
    pacing: computePacingDistribution(profile),
    sensoryChannels: computeSensoryDistribution(profile),
    informationStyle: computeInfoStyleDistribution(profile),
    shadowInjection: profile.confidence > 0.5 ? 0.15 : 0.05,
    explorationFactor: Math.max(0.05, averageRange(profile) * 0.3),
  };

  injectShadow(dist, profile);
  return dist;
}

function averageRange(profile: JungianProfile): number {
  return (profile.extraversion.range + profile.intuition.range +
          profile.thinking.range + profile.judging.range) / 4;
}
```

**Правило:** adaptation включается при `profile.confidence >= 0.3`. При confidence < 0.3 — равномерное распределение.

## deriveType (16 MBTI типов)

```typescript
function deriveType(profile: JungianProfile): string {
  const e = profile.extraversion.preference > 0.55 ? 'E' : profile.extraversion.preference < 0.45 ? 'I' : 'X';
  const n = profile.intuition.preference > 0.55 ? 'N' : profile.intuition.preference < 0.45 ? 'S' : 'X';
  const t = profile.thinking.preference > 0.55 ? 'T' : profile.thinking.preference < 0.45 ? 'F' : 'X';
  const j = profile.judging.preference > 0.55 ? 'J' : profile.judging.preference < 0.45 ? 'P' : 'X';
  return `${e}${n}${t}${j}`;
}
```

Значения `0.45/0.55` создают "мёртвую зону" — игрок с preference 0.48 по E/I получит `X`, а не случайную букву.

## Скорость конвергенции

| Сценарий | Ходов до 50% gap closed |
|----------|------------------------|
| Полная смена стиля (gap=0.2) | ~50 ходов (~2.5 blend-цикла) |
| Малый сигнал (gap=0.05) | ~25 ходов |
| Шумный сигнал (oscillation) | EMA сглаживает, preference стабилен |
| Резкий скачок (0.9→0.1) | Ограничен rate limit 0.10/ход |

**Почему без inertia:** EMA с alpha=0.25 уже даёт 75% старого + 25% нового. Это достаточно сглаживает шум, но позволяет конвергировать за 50-100 ходов. Inertia поверх EMA создавала двойное сглаживание с effective alpha 0.027 — профиль был практически заморожен.

## Cold start

При первом запуске (нет данных) все оси = `{ preference: 0.5, range: 0.1 }`, confidence = 0, axisConfidence = 0, source = 'default'. Это не "середина по всему" — это "ещё не знаем". confidence = 0 < 0.3 → Director возвращает uniform, адаптация выключена. После первого blend (20+ ходов) confidence начинает расти.

## Тесты (ключевые сценарии)

1. **EMA convergence**: signal=1.0, start=0.0 → после 20 blend-циклов preference > 0.9
2. **Rate limit**: signal=1.0, start=0.0, один blend-цикл → сдвиг ≤ 0.10
3. **Range growth**: серия сигналов с deviation > 0.3 → range растёт на 0.02 за цикл
4. **Range decay**: стабильные сигналы (deviation < 0.15) → range уменьшается на 0.005
5. **Range clamped**: range не выходит за [0.05, 0.95]
6. **Confidence confirmation**: сигнал в пределах 0.1 от preference → confidence +0.05
7. **Confidence contradiction**: сигнал далее 0.3 от preference → confidence -0.10
8. **deriveType**: preference 0.7 → соответствующая буква, 0.48 → X
9. **Oscillation**: сигналы 0.3/0.7 чередуются → preference стабилен ~0.5
