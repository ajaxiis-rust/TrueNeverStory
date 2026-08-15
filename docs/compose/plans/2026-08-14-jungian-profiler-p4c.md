# Jungian Profiler — Phase 4C: Persistence + Stylist few-shot + Чекпоинт P4 (Tasks 4.3–4.4)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S7; impl-спека `spec-profiler-persistence.md` §3, §6.

**Acceptance (4C):** `closest_author` колонка + roundtrip в `player_style_profiles`; `buildMicroPrompt` принимает `authorPhrases` (few-shot блок), при отсутствии автора генерация не блокируется; комбинированный birth-вызов ([S5.2]) при создании персонажа — уточнение психотипа из описания + подбор автора — результат персистится.

**Files:**
- Modify: `src/lib/player-profile-store.ts` + `.test.ts`
- Modify: `src/services/birth.ts` (`BirthDeps` + `analyzeBirth` wiring) + `src/routes/launch.ts` (инъекция `playerProfileStore`)
- Modify: `src/services/agents/stylist.ts` + `stylist.test.ts`
- Modify: `src/services/roleplay/prose/literary-v2-generator.ts`
- Modify: `src/services/roleplay-engine.ts`

---

## Task 4.3: Persistence — closest_author колонка + birth-wizard wiring

**Covers:** S7, S5.2; `spec-profiler-persistence.md` §3, §6
**Interfaces:**
- Consumes: `addColumnIfMissing` (Task 1.4); `loadAuthorCorpus`, `topNAuthors`, `analyzeBirth` (Task 4.2); `blendProfiles` (Task 2.7).
- Produces: `upsertClosestAuthor(playerId, name: string | null): void`; `getClosestAuthor(playerId): string | null`; `analyzeBirth(hints, prologue, corpus, embed, llmQueue)` + `blendProfiles(a, b)` (этап 2, [S5.2]).

- [ ] **Step 1: Write failing test**

```typescript
// append to src/lib/__tests__/player-profile-store.test.ts
describe('PlayerProfileStore — closest_author', () => {
  test('roundtrip closest_author', () => {
    store.upsertClosestAuthor('player1', 'Tolkien');
    expect(store.getClosestAuthor('player1')).toBe('Tolkien');
  });
  test('upsert null clears', () => {
    store.upsertClosestAuthor('player1', 'Tolkien');
    store.upsertClosestAuthor('player1', null);
    expect(store.getClosestAuthor('player1')).toBeNull();
  });
  test('unknown player → null', () => {
    expect(store.getClosestAuthor('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: FAIL — `upsertClosestAuthor is not a function`

- [ ] **Step 3: Write minimal implementation (player-profile-store.ts)**

```typescript
// In constructor, AFTER the jungianCols loop from Task 1.4:
this.addColumnIfMissing('player_style_profiles', 'closest_author', 'TEXT');

// New methods on PlayerProfileStore (additive):
upsertClosestAuthor(playerId: string, name: string | null): void {
  this.db.prepare(`
    INSERT INTO player_style_profiles (player_id, closest_author)
    VALUES (?, ?)
    ON CONFLICT(player_id) DO UPDATE SET closest_author = excluded.closest_author
  `).run(playerId, name);
}

getClosestAuthor(playerId: string): string | null {
  const row = this.db.prepare(`SELECT closest_author FROM player_style_profiles WHERE player_id = ?`)
    .get(playerId) as { closest_author: string | null } | undefined;
  return row?.closest_author ?? null;
}
```
> **⚠️ Fix (Phase 1 `p1d`):** существующий `upsertProfile()` (player-profile-store.ts:108) использует `INSERT OR REPLACE` → при следующем апдейте профиля сотрёт `closest_author` и `jungian_*`. Заменить на `INSERT ... ON CONFLICT(player_id) DO UPDATE SET ...`, чтобы эти колонки переживали апдейт. `upsertClosestAuthor` выше уже использует `ON CONFLICT(player_id) DO UPDATE`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/player-profile-store.test.ts`
Expected: PASS

- [ ] **Step 5: Wire в birth-wizard (однократно при создании персонажа)**

Этап 2 ([S5.2]): комбинированный вызов — психотип из описания персонажа + подбор автора — в `src/services/birth.ts` (`BirthScenario`); `src/routes/launch.ts` инжектит `playerProfileStore`.

```typescript
// (a) BirthDeps += playerProfileStore (worldFrame уже содержит prologue, этап 1)
import { loadAuthorCorpus, analyzeBirth } from '../services/author-matcher';
import { blendProfiles } from '../services/jungian-profiler';
// (b) в generateAndApply — ПОСЛЕ создания персонажа, ДО opening narrative:
const prologue = (this._deps.worldFrame.prologue as string) ?? '';
const hints = params.birthHints ?? '';
const corpus = loadAuthorCorpus();
if (corpus.length > 0 && prologue.trim().length > 0) {
  const { LLMClient } = await import('../lib/llm-client');
  const r = await analyzeBirth(hints, prologue, corpus, (t) => new LLMClient().generateEmbedding(t), this._deps.llmQueue);
  if (r) {
    const base = this._deps.playerProfileStore.getJungianProfile('default');
    this._deps.playerProfileStore.upsertJungianProfile('default', blendProfiles(base, r.psychotype));
    this._deps.playerProfileStore.upsertClosestAuthor('default', r.closestAuthor ?? null);
  }
}
```

> `analyzeBirth` (Task 4.2) — комбинированный вызов [S5.2]: `topNAuthors(embed(prologue), corpus)` (0 LLM) → один prompt `birthHints + prologue + top-3` → `{ psychotype, closestAuthor }`. `blendProfiles` (Task 2.7) — чистый blend профилей (0 LLM). LLM упал/нет пролога → graceful (автор не назначается, профиль этапа 1). Per-turn Stylist (Task 4.4) читает кеш `closest_author`; `analyzeText` (P2) не тронут — изоляция S21.

- [ ] **Step 6: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/lib/player-profile-store.ts src/lib/__tests__/player-profile-store.test.ts src/services/birth.ts src/routes/launch.ts
git commit -m "feat(profiler): closest_author persistence + birth-wizard author match (Phase 4)"
```

---

## Task 4.4: Stylist few-shot — authorPhrases

**Covers:** S7
**Interfaces:**
- Consumes: `buildMicroPrompt(..., playerVoice?, authorPhrases?)` (Stylist); `getClosestAuthor` (Task 4.3); `loadAuthorCorpus` (Task 4.2).
- Produces: `StylistAgent.buildMicroPrompt` — 6-й необязательный параметр `authorPhrases?: string[]`.

- [ ] **Step 1: Write failing test**

```typescript
// append to src/services/agents/stylist.test.ts (в describe('StylistAgent.buildMicroPrompt'))
test('authorPhrases passed → few-shot block present', () => {
  const { user } = agent.buildMicroPrompt(
    'Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success',
    undefined, ['In a hole in the ground there lived a hobbit.', 'Not all those who wander are lost.'],
  );
  expect(user).toContain('Author style examples (few-shot)');
  expect(user).toContain('In a hole in the ground there lived a hobbit.');
});
test('no authorPhrases → no few-shot block', () => {
  const { user } = agent.buildMicroPrompt('Alek seeks Bran.', style, { world: 'Dark Realm', location: 'Old Oak' }, 'success');
  expect(user).not.toContain('Author style examples (few-shot)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/agents/stylist.test.ts`
Expected: FAIL — `user` не содержит `Author style examples` (few-shot блок отсутствует)

- [ ] **Step 3: Write minimal implementation (stylist.ts)**

Добавить 6-й параметр `authorPhrases?: string[]` и блок `authorBlock` в `buildMicroPrompt`. Полный целевой метод (заменить существующий целиком):

```typescript
buildMicroPrompt(
  filledSkeleton: string,
  style: { register: string; pacing: string; sensory: string[]; snippets: string[]; forbidden: string[] },
  context: { world: string; location: string; time?: string },
  outcome: string,
  playerVoice?: string,
  authorPhrases?: string[],
): { system: string; user: string } {
  const system = `You are a literary narrator for a living world simulator.
Render the given scene. Do not invent new plot beats.
Respect the outcome exactly.
Write 2-3 paragraphs (~200-280 words).
No moralizing. No summary. No modern slang unless style allows.
Vary sentence length according to style constraints.
Prefer concrete sensory detail over abstract emotion.
Follow the style constraints strictly.`;

  const styleBlock = `Style constraints:
- register: ${style.register}
- pacing: ${style.pacing}
- sensory focus: ${style.sensory.join(', ')}
- prefer constructions like:
${style.snippets.map((s, i) => `  ${i + 1}) ${s}`).join('\n')}
- avoid: ${style.forbidden.join(', ')}`;

  const voiceBlock = playerVoice
    ? `\nPlayer voice notes (soft prior):\n${playerVoice}`
    : '';

  const authorBlock = authorPhrases && authorPhrases.length > 0
    ? `\nAuthor style examples (few-shot):\n${authorPhrases.map((p, i) => `  ${i + 1}) ${p}`).join('\n')}`
    : '';

  const user = `Scene skeleton:
${filledSkeleton}

Outcome (must respect):
${outcome}

Minimal facts:
- world: ${context.world}
- location: ${context.location}${context.time ? `\n- time: ${context.time}` : ''}
${styleBlock}${voiceBlock}${authorBlock}

Write 2-3 paragraphs continuing this scene.`;

  return { system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/agents/stylist.test.ts`
Expected: PASS

- [ ] **Step 5: Wire authorPhrases через LiteraryV2Generator**

```typescript
// src/services/roleplay/prose/literary-v2-generator.ts
async generate(
  intent: Intent, simulation: SimulationResult, gameContext: GameContext, rawInput: string,
  playerVoice?: string, authorPhrases?: string[],
): Promise<string> {
  const literaryDb = this.getLiteraryDb();
  if (!literaryDb) return this.generateViaStylist(intent, simulation, gameContext, playerVoice, authorPhrases);
  // ...
  if (results.length === 0) return this.generateViaStylist(intent, simulation, gameContext, playerVoice, authorPhrases);
  // ...
  const prompt = this.stylist.buildMicroPrompt(filled, style,
    { world: (this.worldFrame.name as string) ?? 'unknown', location: gameContext.location?.name ?? 'unknown' },
    simulation.outcome, playerVoice, authorPhrases);   // ← добавить authorPhrases
  // ...
}

private async generateViaStylist(
  intent: Intent, simulation: SimulationResult, gameContext: GameContext, playerVoice?: string, authorPhrases?: string[],
): Promise<string> {
  const output = await this.stylist.process(intent, simulation, gameContext);
  if (output.text) return output.text;
  const prompt = this.stylist.buildMicroPrompt(
    `The character acts in ${gameContext.location?.name ?? 'the world'}.`,
    DEFAULT_STYLE,
    { world: (this.worldFrame.name as string) ?? 'unknown', location: gameContext.location?.name ?? 'unknown' },
    simulation.outcome, playerVoice, authorPhrases);   // ← playerVoice + authorPhrases
  return this.llmQueue.generateText(prompt.system + '\n\n' + prompt.user, 1, 0.6, 'stylist');
}
```

- [ ] **Step 6: Resolve authorPhrases в roleplay-engine**

```typescript
// src/services/roleplay-engine.ts
import { loadAuthorCorpus } from './author-matcher';
// `this.playerId` — derived getter из Phase 1 (p1e), НЕ поле:
//   private get playerId(): string { return this.activeCharacter ?? this.activeSessionId ?? 'default'; }
const authorName = this.playerProfileStore.getClosestAuthor(this.playerId);
const authorPhrases = authorName ? loadAuthorCorpus().find(a => a.name === authorName)?.samplePhrases ?? [] : [];
// (A) НЕ-streaming _processInputImpl (roleplay-engine.ts:358):
//   narrative = await this.v2Generator.generate(intent, simResult, gameContext, ctx.parsedInput, ctx.playerVoice, authorPhrases);
// (B) streaming _processInputStreamImpl (roleplay-engine.ts:483), parsedInput вместо ctx.parsedInput:
//   let narrative = await this.v2Generator.generate(intent, simResult, gameContext, parsedInput, playerVoice, authorPhrases);
```
> При отсутствии `closest_author` (или пустом корпусе) `authorPhrases = []` → блок не добавляется, генерация не блокируется (дизайн S7).

- [ ] **Step 7: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/agents/stylist.ts src/services/agents/stylist.test.ts src/services/roleplay/prose/literary-v2-generator.ts src/services/roleplay-engine.ts
git commit -m "feat(profiler): Stylist author few-shot via buildMicroPrompt authorPhrases (Phase 4)"
```

---

## ✅ Чекпоинт Phase 4

Выполни ВСЕ команды и подтверди результат:

```bash
# 1. Типы чистые
bunx tsc --noEmit
# Expected: exit 0

# 2. Все unit-тесты Phase 1-4 зелёные
bun test src/services/jungian-profiler.test.ts src/services/author-matcher.test.ts \
       src/services/agents/*.test.ts \
       src/lib/__tests__/player-profile-store.test.ts src/services/metrics-collector.test.ts \
       src/services/roleplay-engine.jungian.test.ts
# Expected: все PASS

# 3. Корпус валиден (50 записей, непустой embedding одной dim)
bun -e "const c=JSON.parse(await Bun.file('data/author-embeddings.json').text()); if(c.length<50) throw new Error('too few'); const d=c[0].embedding.length; for(const a of c){if(!a.name||!Array.isArray(a.embedding)||a.embedding.length===0||a.embedding.length!==d||!Array.isArray(a.samplePhrases))throw new Error(a.name)} console.log('OK',c.length,'dim='+d)"
# Expected: OK 50 dim=<фактический BGE-M3 dim>

# 4. topNAuthors отсортирован (unit-тест: ['A','C','B'])
# 5. closest_author roundtrip (unit-тест)
# 6. buildMicroPrompt few-shot присутствует/отсутствует (unit-тест)
# 7. graceful fallback: embed throws → matchAuthor null; dim-mismatch corpus → null (unit-тесты)
```

**Критерии прохождения чекпоинта:**
- [ ] `tsc --noEmit` без ошибок
- [ ] Все unit-тесты Phase 1-4 зелёные (нет `.only`/`.skip`)
- [ ] `data/author-embeddings.json` — 50 валидных `AuthorEntry`, все embedding одинаковой непустой dim
- [ ] `matchAuthor` возвращает `null` (не бросает) при недоступном embedding-сервере И при рассинхроне dim (корпус под другую модель)
- [ ] `analyzeBirth` (комбинированный вызов [S5.2]): prompt содержит описание персонажа + пролог + samplePhrases; LLM вне top-3 / ошибка → top-1 fallback (unit-тесты)
- [ ] `closest_author` пишется/читается (roundtrip), `null` стирает
- [ ] При отсутствии автора `buildMicroPrompt` НЕ содержит few-shot блок и генерация не блокируется
- [ ] `process()` у Stylist не изменён (только `buildMicroPrompt` получил 6-й параметр)
- [ ] `analyzeText` (P2) не изменён — изоляция фаз сохранена (P4 не блокирует P2)

**Если чекпоинт не пройден — почини и повтори.**
**Phase 4 DONE.** Стилевой референс + author few-shot готовы. Все 4 фазы завершены.
