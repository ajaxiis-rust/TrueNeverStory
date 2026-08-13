# Profiler Integration — Jungian Profiler

> Спека 4 из 4. Wiring всего в движок.
> Зависит от: [Spec 1 — Blend](spec-blend-algorithm.md) | [Spec 2 — Metrics](spec-behavioral-metrics.md) | [Spec 3 — Persistence](spec-profiler-persistence.md)

## 1. Хуки в roleplay-engine.ts

### Точка входа: `_processInputImpl` / `_processInputStreamImpl`

```typescript
// В roleplay-engine.ts, _processInputImpl() — ПОСЛЕ IntentParser.parse():
this.metricsCollector.recordIntent(intent, ctx.parsedInput, /* initiated */ !ctx.npcInitiated);

// ПОСЛЕ SimulationEngine.simulate():
this.metricsCollector.recordSimulation(intent, simResult);

// КАЖДЫЙ ХОД — sync visited locations + input:
this.metricsCollector.recordInput(ctx.parsedInput);

// КАЖДЫЕ 20 ХОДОВ — blend:
if (this.metricsCollector.getTurnCount() % 20 === 0) {
  const derived = deriveMetrics(this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), this.visitedLocations.size);
  const signals = inferFromMetrics(derived);
  this.jungianProfile = blendBehavioralSignals(signals, this.jungianProfile, this.recentSignals);
  this.metricsCollector.decay();
  this.playerProfileStore.upsertJungianProfile(this.playerId, this.jungianProfile);
  this.playerProfileStore.upsertBehavioralMetrics(this.playerId, this.metricsCollector.getAggregates(), this.metricsCollector.getTurnCount(), signals);
}
```

### Инициализация

```typescript
// В конструкторе RoleplayEngine или при загрузке сессии:
this.jungianProfile = this.playerProfileStore.getJungianProfile(this.playerId) ?? createDefaultProfile();
this.metricsCollector = new MetricsCollector();
// Восстановить агрегаты из БД (если есть):
const saved = this.playerProfileStore.getBehavioralMetrics(this.playerId);
if (saved) this.metricsCollector.restore(saved.aggregates, saved.totalTurns);
```

### recentSignals (rolling window)

Для blend нужны последние 10 сигналов каждой оси. Хранятся в памяти (не в БД):

```typescript
private recentSignals: {
  extraversion: number[];
  intuition: number[];
  thinking: number[];
  judging: number[];
} = { extraversion: [], intuition: [], thinking: [], judging: [] };

// При каждом blend-цикле:
this.recentSignals.extraversion.push(signals.extraversion);
if (this.recentSignals.extraversion.length > 10) this.recentSignals.extraversion.shift();
// ... аналогично для остальных осей
```

## 2. Director — explorationFactor и mood mapping

### Director ProbabilityDistribution

Director использует JungianProfile для модуляции вероятностного распределения контента:

```typescript
interface DirectorWeights {
  exploration: number;    // 0-1, сколько исследовательского контента
  combat: number;         // 0-1, сколько боевого
  social: number;         // 0-1, сколько социального
  mystery: number;        // 0-1, сколько загадочного
  trade: number;          // 0-1, сколько торгового
}

function computeDirectorWeights(profile: JungianProfile): DirectorWeights {
  const explorationFactor = profile.intuition.preference * (1 + profile.intuition.range);
  const socialFactor = profile.extraversion.preference * (1 + profile.extraversion.range);
  const combatFactor = profile.thinking.preference * (1 - profile.extraversion.range * 0.3);
  const mysteryFactor = profile.intuition.preference * profile.judging.range;
  const tradeFactor = profile.judging.preference * (1 - profile.intuition.range * 0.5);

  return normalizeWeights({
    exploration: explorationFactor,
    combat: combatFactor,
    social: socialFactor,
    mystery: mysteryFactor,
    trade: tradeFactor,
  });
}
```

### Mood mapping

| MBTI тип | Предпочтительный mood контента |
|----------|-------------------------------|
| I--- | introspective, melancholic, mysterious |
| E--- | lively, festive, dramatic |
| -N-- | wonder, discovery, surreal |
| -S-- | grounded, practical, survival |
| --T- | conflict, strategy, tension |
| --F- | romance, loyalty, sacrifice |
| ---J | order, politics, structure |
| ---P | chaos, adventure, freedom |

### Confidence → разнообразие

При low confidence (< 0.5) Director **не** навязывает профильные сценарии — даёт разнообразный микст. Это предотвращает "замораживание" на неточном профиле.

```typescript
function adjustForConfidence(weights: DirectorWeights, confidence: number): DirectorWeights {
  if (confidence >= 0.5) return weights;
  // Смешиваем с равномерным распределением
  const uniform: DirectorWeights = { exploration: 0.2, combat: 0.2, social: 0.2, mystery: 0.2, trade: 0.2 };
  return blendWeights(weights, uniform, confidence / 0.5); // 0% uniform при 0.5, 100% при 0.0
}
```

## 3. Stylist — адаптация прозы

Stylist использует derivedType для выбора стилистического регистра:

| Фактор | Влияние на прозу |
|--------|-----------------|
| Extraversion high | Больше диалогов, динамичные сцены |
| Introversion high | Внутренний монолог, описательность |
| Intuition high | Метафоры, абстрактные образы |
| Sensing high | Конкретные детали, sensory language |
| Thinking high | Стратегические описания, cause-effect |
| Feeling high | Эмоциональные акценты, relationships |
| Judging high | Структурированный narrative arc |
| Perceiving high | Спонтанные повороты, open-ended |

### Prompt injection

```typescript
function stylistPromptFromProfile(profile: JungianProfile): string {
  const type = deriveType(profile);
  return `Write in a style that resonates with ${type} readers.
Emphasize: ${profile.extraversion.preference > 0.5 ? 'dialogue and action' : 'introspection and atmosphere'}.
${profile.thinking.preference > 0.5 ? 'Focus on strategy and consequences.' : 'Focus on emotions and relationships.'}
${profile.intuition.preference > 0.5 ? 'Use metaphors and abstract imagery.' : 'Use concrete sensory details.'}`;
}
```

## 4. Actor — NPC диалоги

Actor адаптирует NPC-реплики под профиль игрока:

- **E-игрок**: NPC говорят больше, задают вопросы, вовлекают
- **I-игрок**: NPC дают пространство, не навязывают диалог
- **T-игрок**: NPC предлагают логические аргументы, deals
- **F-игрок**: NPC апеллируют к эмоциям, loyalty, honor

## 5. Dramaturg — архетипические предпочтения

Dramaturg выбирает narrative patterns из Bible MCP, учитывая профиль:

```typescript
function filterPatternsByProfile(patterns: NarrativePattern[], profile: JungianProfile): NarrativePattern[] {
  return patterns.filter(p => {
    if (p.mood === 'conflict' && profile.thinking.preference < 0.3) return false;
    if (p.mood === 'romance' && profile.extraversion.preference < 0.3) return false;
    if (p.mood === 'mystery' && profile.intuition.preference < 0.3) return false;
    return true;
  });
}
```

## 6. completeTurnExample (тест-сьют для интеграции)

### Сценарий: INTJ игрок в таверне

1. Игрок вводит: "Осмотрюсь в таверне, замечу подозрительного человека в углу"
2. IntentParser → observation + action (examine + suspicious person)
3. MetricsCollector.recordInput (27 символов)
4. MetricsCollector.recordIntent (observation → explorationActions++)
5. SimulationEngine → SUCCESS
6. MetricsCollector.recordSimulation (safe → riskTaking не инкрементится)
7. Если turnCount % 20 === 0 → blend
8. Director weights: exploration↑, mystery↑, social↓ (INTJ профиль)
9. Stylist: introspective + concrete details + strategic observation
10. Результат: атмосферное описание таверны с акцентом на наблюдательность

## 7. Risks и mitigations

| Риск | Митигация |
|------|-----------|
| LLM глючит при PsychotypeAnalyzer | Fallback на createDefaultProfile(), behavioral blend исправит за ~100 ходов |
| MetricsCollector overhead | O(1) на ход (инкрементальные счётчики), blend каждые 20 ходов |
| Профиль "застревает" на wrong answer | Range растёт при отклонениях → Director видит что range высокий и даёт разнообразный контент |
| Anti-manipulation: игрок пытается "farm" определённый тип | Rate limit 0.10/ход + EMA alpha 0.25 → ~250 ходов для полного сдвига |
| DB migration при обновлении | CREATE TABLE IF NOT EXISTS, UPSERT — идемпотентно |
