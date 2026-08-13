# Behavioral Metrics Pipeline — Jungian Profiler

> Спека 2 из 4. MetricsCollector уже реализован (`src/services/metrics-collector.ts`).
> Эта спека — reference для plan'ов, которые будут его использовать.
> Остальные спеки: [Spec 1 — Blend Algorithm](spec-blend-algorithm.md) | [Spec 3 — Persistence](spec-profiler-persistence.md) | [Spec 4 — Integration](spec-profiler-integration.md)

## Статус

**РЕАЛИЗОВАНО** (commit `6ab6f17`). 28 тестов, все зелёные. Файлы:
- `src/services/metrics-collector.ts` — MetricsCollector, deriveMetrics, inferFromMetrics
- `src/services/metrics-collector.test.ts` — 28 тестов

## Архитектура

```
Каждый ход:
  IntentParser.parse()          → MetricsCollector.recordIntent(intent, rawInput, initiated?)
  SimulationEngine.simulate()   → MetricsCollector.recordSimulation(intent, simResult)
  Ввод игрока (текст)           → MetricsCollector.recordInput(rawInput)
  NPC timeout                   → MetricsCollector.recordAvoidedDialogue()
      │
      ▼
  MetricsCollector.getAggregates() → RawAggregates
  deriveMetrics(aggregates, totalTurns, visitedLocations) → DerivedMetrics
  inferFromMetrics(derived) → AxisSignals (4 оси, 0-1)
      │
      ▼ (каждые 20 ходов)
  blendBehavioralSignals(signals, currentProfile) → обновлённый JungianProfile
  MetricsCollector.decay() → агрегаты × 0.9
```

## RawAggregates (что собираем)

| Поле | Тип | Источник | Условие |
|------|-----|----------|---------|
| dialogueInitiated | number | recordIntent | intent.type='dialogue' + initiated=true |
| dialogueCount | number | recordIntent | intent.type='dialogue' |
| dialogueTotalWords | number | recordIntent | split(/\s+/).length |
| avoidedDialogues | number | recordAvoidedDialogue | NPC timeout |
| explorationActions | number | recordIntent | intent.type='observation' |
| riskTakingActions | number | recordSimulation | intent.type='action' + (risk_level='dangerous'\|'deadly' \|\| CRITICAL outcome) |
| planningActions | number | recordSimulation | isPlanningVerb(intent.verb) |
| combatInitiated | number | recordIntent | isAttackVerb(intent.verb) |
| inputTotalChars | number | recordInput | rawInput.length |
| expressiveActions | number | recordIntent | isExpressiveVerb(intent.verb) |

## Detection rules (verb regex)

```typescript
isAttackVerb:     /^(attack|strike|fight|hit|slash|stab|shoot|punch|kick)$/i
isExpressiveVerb: /^(hug|cry|laugh|kiss|comfort|mourn|celebrate|weep|cheer|embrace|grieve)$/i
isPlanningVerb:   /^(trade|craft|buy|sell|forge|brew|cook|accept quest|plan|prepare|organize)$/i
```

## DerivedMetrics (вычисляются при вызове)

| Поле | Формула |
|------|---------|
| dialogueInitiated | raw |
| dialogueAvgLength | dialogueTotalWords / max(dialogueCount, 1) |
| avoidedDialogues | raw |
| explorationActions | raw |
| riskTakingActions | raw |
| planningActions | raw |
| combatInitiated | raw |
| expressiveActions | raw |
| inputLengthAvg | inputTotalChars / max(totalTurns, 1) |
| uniqueLocationsVisited | из SessionState.visitedLocations.size (передаётся снаружи) |

## AxisSignals (маппинг DerivedMetrics → 4 оси)

```typescript
interface AxisSignals {
  extraversion: number;   // 0 = I, 1 = E
  intuition: number;      // 0 = S, 1 = N
  thinking: number;       // 0 = F, 1 = T
  judging: number;        // 0 = P, 1 = J
}
```

### Формулы

```typescript
// Вспомогательные
function signal(value: number, threshold: number, weight: number): number {
  return Math.min(value / threshold, 1) * weight;
}

function normalize(signals: number[]): number {
  const sum = signals.reduce((a, b) => a + b, 0);
  const maxPossible = signals.reduce((a, b) => a + Math.abs(b), 0);
  if (maxPossible === 0) return 0.5;
  return Math.max(0, Math.min(1, (sum + maxPossible) / (2 * maxPossible)));
}
```

### Оси

| Ось | Факторы | Веса |
|-----|---------|------|
| **Extraversion** | dialogueInitiated(5), dialogueAvgLength(20), avoidedDialogues(3,-), inputLengthAvg(100), expressiveActions(5) | 0.3, 0.2, -0.2, 0.15, 0.15 |
| **Intuition** | explorationActions(10), planningActions(5), inputLengthAvg(150), uniqueLocations(10) | 0.3, 0.3, 0.2, 0.2 |
| **Thinking** | riskTakingActions(5), combatInitiated(5), expressiveActions(5,-), planningActions(5) | 0.3, 0.2, -0.3, 0.2 |
| **Judging** | planningActions(5), uniqueLocations(15,-), combatInitiated(5), dialogueAvgLength(20) | 0.4, -0.2, 0.2, 0.2 |

`(N)` = threshold, `-` = отрицательный вес (понижает ось).

## Decay

Каждые 20 ходов: все числовые агрегаты × 0.9. Эффективное окно ~100 ходов. `turns` не decay'ится.

## API (для Spec 4 — Integration)

```typescript
class MetricsCollector {
  recordInput(rawInput: string): void;
  recordIntent(intent: Intent, rawInput: string, initiated?: boolean): void;
  recordSimulation(intent: Intent, simResult: SimulationResult): void;
  recordAvoidedDialogue(): void;
  decay(): void;
  getAggregates(): RawAggregates;
  getTurnCount(): number;
}

function deriveMetrics(agg: RawAggregates, totalTurns: number, visitedLocations: number): DerivedMetrics;
function inferFromMetrics(m: DerivedMetrics): AxisSignals;
```
