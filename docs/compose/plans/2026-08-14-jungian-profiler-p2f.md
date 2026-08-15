# Jungian Profiler — Phase 2F: Полный конвейер + Чекпоинт P2 (Task 2.8)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S2, S3.1, S3.2, S16; impl-спека `spec-profiler-integration.md` §2.

**Acceptance (2F):** При `confidence >= 0.3` нарратив адаптируется через enrichment-конвейер (Director→Dramaturg→Actor→Validator→buildPlayerVoice→Stylist→Censor). При флаге false или confidence<0.3 — существующий prose-путь (или uniform dist). `AgentV2.process()` нетронут. A/B-теги в логах. LLM 1-4/ход.

**Files:**
- Modify: `src/services/roleplay/pipeline-context.ts` (добавить `playerVoice?`)
- Modify: `src/services/roleplay/prose/literary-v2-generator.ts` (приём `playerVoice`)
- Modify: `src/services/roleplay-engine.ts` (оркестрация конвейера)
- Create: `src/services/roleplay-engine.jungian.test.ts`

---

## Task 2.8: Enrichment-конвейер в RoleplayEngine

**Covers:** S3.1, S3.2
**Interfaces:**
- Consumes: `computeDistribution`, `buildPlayerVoice` из `./jungian-profiler`; `DramaturgAgent.enrichScene`; `ActorAgent.enrichNpcs`; `ValidatorAgent.verify`; `CensorAgent.clean`; `getFeatureFlagManager`
- Produces: `runEnrichmentConveyor(gameContext): Promise<string>` (возвращает `playerVoice`); `ctx.playerVoice`; prose через `buildMicroPrompt(..., playerVoice)`; `censor.clean` после prose

- [ ] **Step 1: Add `playerVoice` to PipelineContext**

```typescript
// src/services/roleplay/pipeline-context.ts — add field:
export interface PipelineContext {
  // ...existing fields...
  playerVoice?: string;   // NEW: assembled by enrichment conveyor (Phase 2)
}
```

- [ ] **Step 2: LiteraryV2Generator — приём playerVoice**

```typescript
// src/services/roleplay/prose/literary-v2-generator.ts
// add optional 5th param to generate() and pass to buildMicroPrompt:
async generate(
  intent: Intent,
  simulation: SimulationResult,
  gameContext: GameContext,
  rawInput: string,
  playerVoice?: string,
): Promise<string> {
  // ... existing logic ...
  const prompt = this.stylist.buildMicroPrompt(
    filled, style,
    { world: ..., location: ... },
    simulation.outcome,
    playerVoice,   // ← было undefined, теперь передаём
  );
  // ...
}
// generateViaStylist — добавить 4-й опциональный параметр и пробросить в buildMicroPrompt:
async generateViaStylist(
  intent: Intent,
  simulation: SimulationResult,
  gameContext: GameContext,
  playerVoice?: string,
): Promise<string> {
  // ... существующая логика ...
  const prompt = this.stylist.buildMicroPrompt(filled, style, { world, location }, simulation.outcome, playerVoice);
  // ...
}
// P4 добавит authorPhrases ОТДЕЛЬНО (дополнительный параметр/поле) — playerVoice и authorPhrases остаются разными. process() НЕ трогать.
```

- [ ] **Step 3: `runEnrichmentConveyor` в roleplay-engine**

```typescript
// imports (top of roleplay-engine.ts):
import { computeDistribution, buildPlayerVoice, deriveType } from './jungian-profiler';

// private method:
private async runEnrichmentConveyor(gameContext: GameContext): Promise<string> {
  const worldState = { genre: gameContext.world?.genre, socialSystem: gameContext.world?.socialSystem }; // genre/socialSystem из world_frame.json
  const sceneContext = { mood: sceneMood, timeOfDay: gameContext.timeOfDay }; // mood — текущее настроение сцены (напр. из simulation.outcome), timeOfDay — из gameContext.timeOfDay
  const dist = computeDistribution(this.jungianProfile, worldState, sceneContext);
  const dramaturg = await this.dramaturg.enrichScene(dist.archetypes, gameContext); // db резолвится ВНУТРИ агента (см. p2b)
  const nearbyWithTypes = gameContext.nearbyNpcs.map(n => ({
    id: n.uid ?? n.name, name: n.name,
    psychotype: undefined, // Phase 3: psychotype читается из entity.profile.l3.psychotype
  }));
  const actor = this.actor.enrichNpcs(dist.informationStyle, nearbyWithTypes);
  const validator = await this.validator.verify(gameContext, dramaturg.filledSkeleton);
  return buildPlayerVoice(dist, dramaturg, actor, validator);
}
```

- [ ] **Step 4: Wire в `_processInputImpl` (после buildGameContext, до prose)**

```typescript
// После buildGameContext(ctx), перед prose-генерацией. Используем ЛОКАЛЬНУЮ gameContext —
// pipelineRunner.buildGameContext(ctx) возвращает её, ctx.gameContext НЕ присваивается:
const gameContext = await this.pipelineRunner.buildGameContext(ctx);
ctx.gameContext = gameContext; // опционально: выставить для downstream-потребителей

if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled')) {
  if (this.jungianProfile.confidence >= 0.3) {
    ctx.playerVoice = await this.runEnrichmentConveyor(gameContext);
  }
  // confidence < 0.3 → ctx.playerVoice остаётся undefined → uniform (существующий prose)
}

// Обновить call site генератора — передать playerVoice 5-м аргументом:
//   this.v2Generator.generate(intent, simResult, gameContext, ctx.parsedInput)
//   → this.v2Generator.generate(intent, simResult, gameContext, ctx.parsedInput, ctx.playerVoice)
// (streaming call site — аналогично, добавить ctx.playerVoice 5-м аргументом)

// После получения narrative (prose-генерации):
if (getFeatureFlagManager().isEnabled('jungian-profiler-enabled') && narrative) {
  const cleaned = await this.censor.clean(narrative, gameContext);
  narrative = cleaned.cleaned;
  log.info({ jungianEnabled: true, jungianType: deriveType(this.jungianProfile), confidence: this.jungianProfile.confidence }, 'jungian adaptation applied');
}
```

> `deriveType` из `./jungian-profiler` (Task 1.1). A/B-теги: `jungianEnabled`, `jungianType`, `confidence` — как в дизайне S16.

- [ ] **Step 5: Integration test**

```typescript
// src/services/roleplay-engine.jungian.test.ts (create)
// Stub-агенты (Dramaturg/Actor/Validator/Censor) + mock LLM.
// 1. Флаг=true, confidence=0.8 → _processInputImpl → ctx.playerVoice собран (содержит "Player psychological context"),
//    narrative прошёл через censor.clean (клише удалены), LLM-вызовов к Stylist = 1.
// 2. Флаг=false → ctx.playerVoice undefined, narrative идентичен baseline (без enrichment).
// 3. confidence=0 (default) + флаг=true → ctx.playerVoice undefined (uniform), enrichment пропущен.
// Если полный mock Engine тяжёл — покрыть runEnrichmentConveyor() unit-тестом:
//   mock dramaturg.enrichScene → { archetype:'judgment_trial', filledSkeleton:'x', mood:'tense' }
//   assert возвращаемая строка содержит "Player psychological context" + fact-check notes.
```

- [ ] **Step 6: Verify + commit**

```bash
bunx tsc --noEmit
bun test src/services/roleplay-engine.jungian.test.ts src/services/jungian-profiler.test.ts src/services/agents/*.test.ts
git add src/services/roleplay/pipeline-context.ts src/services/roleplay/prose/literary-v2-generator.ts src/services/roleplay-engine.ts src/services/roleplay-engine.jungian.test.ts
git commit -m "feat(profiler): enrichment conveyor wiring — Director→Stylist→Censor (Phase 2)"
```

---

## ✅ Чекпоинт Phase 2

Выполни ВСЕ команды и подтверди результат перед переходом к Phase 3:

```bash
# 1. Типы чистые
bunx tsc --noEmit
# Expected: exit 0

# 2. Все unit-тесты Phase 1+2 зелёные
bun test src/services/jungian-profiler.test.ts \
       src/services/agents/*.test.ts src/services/roleplay-engine.jungian.test.ts \
       src/services/metrics-collector.test.ts src/lib/__tests__/player-profile-store.test.ts
# Expected: все PASS

# 3. AgentV2.process() нетронут
git diff --name-only | grep -E "agents/(stylist|dramaturg|actor|validator|censor)\.ts"
# Expected: diff НЕ содержит изменений метода process() — только добавленные enrichScene/enrichNpcs/verify/clean

# 4. LLM cost — 1 LLM у Stylist (по логам integration-теста или ручной прогон)
# Expected: enrichment-путь не добавляет LLM-запросов (Director/Actor/Chronicler = 0)

# 5. A/B-теги в логах
# Expected: лог-строка "jungian adaptation applied" содержит jungianEnabled=true, jungianType, confidence
```

**Критерии прохождения чекпоинта:**
- [ ] `tsc --noEmit` без ошибок
- [ ] Все unit-тесты зелёные (нет `.only`/`.skip`)
- [ ] `process()` у всех Big Six не изменён (только additive-методы)
- [ ] flag=false → prose идентичен baseline (без enrichment)
- [ ] confidence<0.3 → uniform, enrichment пропущен
- [ ] LLM-запросы на ход: 1-4 (без новых)
- [ ] A/B-теги `jungianEnabled`/`jungianType`/`confidence` в логах

**Если чекпоинт не пройден — НЕ начинай Phase 3.** Почини и повтори.

**Phase 2 DONE.** Нарратив адаптируется к психотипу. A/B готов. Переходи к `2026-08-14-jungian-profiler-p3.md`.
