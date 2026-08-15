# Jungian Profiler — Phase 3B: Actor wire + Чекпоинт P3 (Task 3.3)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S12.

**Acceptance (P3b):** `Actor.enrichNpcs` использует реальный NPC-психотип из storage; `recordInteraction` обновляет `perceivedPlayerType` после 3+ взаимодействий.

**Files:**
- Modify: `src/services/agents/actor.ts` + `actor.test.ts`
- Modify: `src/services/roleplay-engine.ts`

---

## Task 3.3: Actor — wire реальный NPC-психотип + perceivedPlayerType

**Covers:** S12

- [ ] **Step 1: Add `recordInteraction` helper on ActorAgent**

```typescript
// actor.ts — добавить метод (использует computePerceivedPlayerType из ../jungian-profiler):
recordInteraction(
  npcId: string,
  playerId: string,
  playerProfile: JungianProfile,
  npcProfile: JungianProfile,
  interaction: { type: string; tension: number },
  store: {
    getNpcPerception: (n: string, p: string) => {
      perceived: JungianProfile; interactionCount: number;
      interactionHistory: Array<{ ts: number; type: string; tension: number }>;
    } | null;
    upsertNpcPerception: (n: string, p: string, perceived: JungianProfile, count: number,
      interactionHistory: Array<{ ts: number; type: string; tension: number }>) => void;
  },
): void {
  const current = store.getNpcPerception(npcId, playerId);
  const count = (current?.interactionCount ?? 0) + 1;
  // S8.1: interaction_history растёт инкрементально на КАЖДОМ взаимодействии.
  const interactionHistory = [
    ...(current?.interactionHistory ?? []),
    { ts: Math.floor(Date.now() / 1000), type: interaction.type, tension: interaction.tension },
  ];
  // perceivedPlayerType пересчитывается после 3+ взаимодействий, затем каждые 10 (S8);
  // между пересчётами сохраняем последнее значение (первый раз — baseline).
  const shouldRecompute = count >= 3 && (count - 3) % 10 === 0;
  const perceived = shouldRecompute
    ? computePerceivedPlayerType(playerProfile, npcProfile)
    : current?.perceived ?? computePerceivedPlayerType(playerProfile, npcProfile);
  // Всегда сохраняем: count и history растут на каждом взаимодействии (иначе счётчик не дойдёт до 3).
  store.upsertNpcPerception(npcId, playerId, perceived, count, interactionHistory);
}
```

- [ ] **Step 2: Wire psychotype в runEnrichmentConveyor (roleplay-engine)**

В `runEnrichmentConveyor` (Task 2.8) замени источник `npcPsychotypes[n.name]` на реальный: читай `psychotype` из `entity.profile.l3.psychotype` (JSON, дизайн S8.1). Собственный психотип NPC берётся ТОЛЬКО из `entity.profile.l3.psychotype` (не `store.getNpcPerception` — оно возвращает воспринимаемый игроком тип). NPC без psychotype → `assignNpcPsychotype(role)` лениво при создании (world-gen), не пересчитывается каждый ход.

- [ ] **Step 3: Integration test (дополнить actor.test.ts)**

```typescript
// - enrichNpcs с NPC, имеющим real psychotype → hint отражает тип (ISTP → "practical")
// - recordInteraction: после 3 взаимодействий perceived.thinking сдвинут от player.thinking (±0.2)
```

- [ ] **Step 4: Verify + commit**

```bash
bunx tsc --noEmit
bun test src/services/agents/actor.test.ts src/services/jungian-profiler.test.ts src/lib/__tests__/player-profile-store.test.ts
git add src/services/agents/actor.ts src/services/agents/actor.test.ts src/services/roleplay-engine.ts
git commit -m "feat(profiler): Actor uses real NPC psychotype + perceivedPlayerType drift"
```

---

## ✅ Чекпоинт Phase 3

```bash
# 1. Типы чистые
bunx tsc --noEmit
# Expected: exit 0

# 2. Все unit-тесты Phase 1-3 зелёные
bun test src/services/jungian-profiler.test.ts src/services/agents/actor.test.ts src/lib/__tests__/player-profile-store.test.ts
# Expected: PASS

# 3. NPC psychotype стабилен (deterministic по seed)
# Expected: assignNpcPsychotype('craftsman', 'trade_guild', 'feudal', 42) === assignNpcPsychotype('craftsman', 'trade_guild', 'feudal', 42)

# 4. perceivedPlayerType обновляется после 3+ взаимодействий (тест recordInteraction)

# 5. AgentV2.process() / ActorAgent.process() / @mention нетронуты (только additive-методы)
git diff --name-only | grep -E "agents/(stylist|dramaturg|actor|validator|censor)\.ts"
# Expected: diff содержит только добавленные enrichScene/enrichNpcs/verify/clean — НЕ метод process()/AgentV2.process()/@mention-роутинг
```

**Критерии прохождения:**
- [ ] `tsc --noEmit` без ошибок
- [ ] Все unit-тесты зелёные
- [ ] NPC-тип назначается лениво и детерминированно (не пересчитывается каждый ход)
- [ ] `perceivedPlayerType` roundtrip в `npc_perception` работает
- [ ] `process()` у ActorAgent/AgentV2 не изменён (только additive-методы; `@mention`-роутинг нетронут)

**Phase 3 DONE.** Phase 4 (AuthorMatcher) — полный план, см. `2026-08-14-jungian-profiler-p4.md` (индекс) → `p4a`/`p4b`/`p4c`.
