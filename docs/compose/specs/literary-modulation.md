---
feature: literary-modulation
status: implemented
updated: 2026-08-18
branch: main
commits: dda0f3f, b1bad2e, e3ae27f, e4ff755, b580916
---

# Literary Modulation of Narrative

## Report
(empty — will be filled at delivery)

## [S1] Problem

The engine produces competent prose via the Stylist + LiteraryV2Generator pipeline, but the text lacks the literary richness that would make it compelling to an outside reader. Short player moves (1-3 sentences) result in thin scenes. Characters the player notices but doesn't interact with vanish forever. The existing Jungian Profiler signals (playerVoice, closest_author, behavioral metrics) are wired into the pipeline but their influence on prose quality is inconsistent.

The goal is to make the narrative **interesting to a reader who doesn't know the author** — not psychoanalysis, not therapy, just better storytelling.

## [S2] Design

### Architecture Principles

1. **State-First** — simulation and world state changes remain primary.
2. **Literary quality** — vividness, readability, dramaturgy, style.
3. **Soft stylistic and scenic modulation** based on player signals.
4. Psychological profile accuracy — only when it serves points 2-3.

### Unbreakable Rules

1. Player decision is inviolable.
2. Never attribute feelings or motives the player didn't set.
3. Agency is sacred: player can always refuse, break off, leave.
4. System influence is soft, reversible, behind feature flags.
5. Everything is debug-transparent: signal → weight → influence.
6. Orient toward the external reader in any disputed decision.

### S2.1 — Feature Flags

New flags (all default: off):

| Flag | Purpose |
|------|---------|
| `literary-modulation-enabled` | Soft style/dramaturgy priors |
| `short-turn-expansion-enabled` | Expanding short actionable turns |
| `deferred-hooks-enabled` | Deferred NPC callbacks |

Existing `jungian-profiler-enabled` gates the profiler signals. Literary modulation flags are independent — each can be on/off without the others.

### S2.2 — Literary Modulation Layer

**Stylistic stabilization** (high priority):
- `playerVoice` and `closest_author` + author phrases already flow into `StylistAgent.buildMicroPrompt()`.
- Add a very weak `literaryToneHint` (density, sensory, tone distance) derived from behavioral metrics — weight **below** author phrases and playerVoice.
- The hint is a short string appended to the existing `playerVoice` block, not a new prompt section.

**Implementation point:** `buildPlayerVoice()` in `jungian-profiler.ts` — add `literaryToneHint` line derived from `ProbabilityDistribution` fields (sensoryChannels density, pacing, sceneTone).

### S2.3 — Short Turn Expansion

**Trigger conditions** (all must be true):
1. Turn is short (1-3 sentences, ~50 words).
2. Turn contains action/attitude toward the world, NPC, or situation.
3. Not a pure dialogue line.

**Dialogue handling:**
- Player's dialogue text is never expanded.
- Only light nonverbal NPC reaction is allowed (glance, gesture, posture).

**Expansion logic:**
- Analyze "charge" — did the player introduce an object of attention? Is there movement toward contact that breaks off? Will the scene deflate if left short?
- If charge exists, system may **once** softly strengthen the world/NPC reaction.
- Never change player decision, never attribute unmotivated feelings.
- Second explicit refusal → accept, reduce pressure in this scene/session.

**Elements by weight:**

| Element | Role | Constraint |
|---------|------|------------|
| NPC/world reaction | Scene driver | Doesn't override choice |
| Sensory/atmosphere | Density | No filler |
| Physical microdetails | Convincingness | Don't rewrite action |
| Light internal state | Only if already hinted | No self-analysis |
| Soft nudge forward | Open next bit | Once; 2nd refusal → stop |

**Voice:** hybrid — preserve player's "I" + external details and reactions in the same flow.

**Reference example** (from spec):

Player turn: "Я шёл по улице, когда заметил этого оборванца-мальчишке. Он попрошайничал. Заметив меня, он прямиком бросился ко мне. Я проигнорировал его обращение."

Expanded: "...Я проигнорировал его обращение и ускорил шаг. Но тонкая рука вцепилась в рукав — цепко, с неожиданной силой. Мальчишка смотрел снизу вверх, не отпуская, и в голосе уже не было жалобного нытья, только упрямое: "Подождите…""

### S2.4 — Deferred Character Hook

**Concept:** If the player noticed/introduced a character and then refused interaction, save a weak deferred hook. After a relatively complete dramatic block (arc/quest/major event), softly remind about this NPC once.

**Trigger conditions** (all must be true):
1. Player gave a hook (explicit attention / mention / contact with subsequent refusal).
2. NPC is not killed, banished, or destroyed by world logic.
3. Enough literary time has passed (after arc closure / act change / significant context shift).
4. Return is logical by place and circumstances.
5. Frequency limit: 0-1 noticeable callback per major block.

**Graduated strength:**

| Level | Form | When to prefer |
|-------|------|----------------|
| 0 | Nothing | No charge / NPC unavailable / limit |
| 1 | Trace | Rumor, item, third-party mention |
| 2 | Edge | NPC glimpses in distance / crowd |
| 3 | Soft contact | Brief appearance with new reason |

Default: levels 1-2. Direct contact (3) only if it strongly enhances text without breaking pace.

**Storage:** In-memory `DeferredHook[]` per session, persisted to session state. Fields: `npcId`, `npcName`, `hookStrength` (1-3), `sourceTurn`, `blockClosedAt`, `used`.

### S2.5 — Feedback (Like/Dislike)

Manual literary preference adjustment:

| Reaction | Meaning | System action |
|----------|---------|---------------|
| Like | "This is good" | Slowly strengthen used techniques |
| No reaction | "Fine" | Nothing (neutral, NOT weak like) |
| Dislike 1st | "Not this" | Regenerate (softer / different accent) |
| Dislike 2nd | "Enough" | Rollback to raw turn + temporary caution |

**Learning targets** (narrow literary parameters, NOT psychotype):
- NPC pressure degree
- Sensory volume
- Expansion length
- Light internal state presence
- "Nudge" activity
- Callback appropriateness/softness

**Rules:**
- Learning rate low.
- Silence = 0, not positive signal.
- On regen — softer/different, not more aggressive.
- UI: 👍/👎 only after **noticeable** enrichment or callback.
- Raw player turn preserved (logs / session history).

### S2.6 — Integration Points

| Component | Allowed | Forbidden |
|-----------|---------|-----------|
| **Stylist** | playerVoice, author few-shot, tone hint, Short Turn Expansion | Therapeutic tone, choice substitution |
| **Dramaturg** | Small coefficients; rare deferred hook selection | Simulation override; intrusive returns |
| **Actor** | NPC reactions, nonverbal, soft return | Mirroring for analysis |
| **Profiler** | Source of weak signals | Expansion for diagnosis |
| **Censor** | Clichés, style | — |
| **UI** | 👍/👎 on noticeable enrichment/callback | Showing "type" / "shadow" / "hooks" to player |

## [S3] Out of Scope

- Psychoanalysis or therapy mode.
- Mandatory hero's journey stages.
- Showing profiler results to the player.
- Expanding player dialogue lines.
- Hard dramaturgical schemes.
- Any feature that primarily serves player self-knowledge.

## Tasks

### Phase 0 — Observability

- [ ] T0.1: Register 3 new feature flags (`literary-modulation-enabled`, `short-turn-expansion-enabled`, `deferred-hooks-enabled`) in feature-flags.ts — acceptance: flags appear in `conf/feature-flags.json` after init, all default off (covers: S2.1)
- [ ] T0.2: Add observability logger in `roleplay-engine.ts` that logs profiler signals (playerVoice length, authorPhrases count, turn word count, intent type) when any literary-modulation flag is on, without affecting generation — acceptance: structured log line appears per turn with all signal values (covers: S2.1)

### Phase 1 — Stylistics

- [ ] T1.1: Add `literaryToneHint` computation in `buildPlayerVoice()` — derive density/sensory/distance hints from `ProbabilityDistribution` fields; append as one line to playerVoice string — acceptance: when `literary-modulation-enabled` is on, playerVoice contains a "Literary tone hint:" line with 2-3 descriptors (covers: S2.2)
- [ ] T1.2: Verify Stylist `buildMicroPrompt()` already uses playerVoice and authorPhrases correctly; add test that literaryToneHint flows through to the prompt — acceptance: test asserts playerVoice with tone hint appears in micro-prompt user message (covers: S2.2)

### Phase 2 — Short Turn Expansion

- [ ] T2.1: Create `ShortTurnExpander` service (`src/services/short-turn-expander.ts`) with `shouldExpand(rawInput, intent)` — returns boolean based on word count (≤50), non-command, non-pure-dialogue — acceptance: unit tests for boundary cases (covers: S2.3)
- [ ] T2.2: Add `analyzeCharge(rawInput, simResult, gameContext)` — returns charge level (none/low/medium/high) based on NPC mention, contact break-off, scene deflation risk — acceptance: unit tests with fixture data (covers: S2.3)
- [ ] T2.3: Add `expand(rawInput, simResult, gameContext, playerVoice, authorPhrases)` — 1 LLM call with constrained prompt that preserves player decision, adds world/NPC reaction, sensory detail, microdetails — acceptance: test verifies expanded text contains original decision text verbatim, word count 100-200 (covers: S2.3)
- [ ] T2.4: Wire ShortTurnExpander into `roleplay-engine.ts` between Step 6 (prose generation) and Step 6.5 (censor), gated by `short-turn-expansion-enabled` flag — acceptance: when flag is on, short actionable turns get expanded; when off, no change (covers: S2.3)
- [ ] T2.5: Add `RefusalTracker` — tracks per-scene refusal count; 2nd refusal reduces expansion pressure — acceptance: test verifies 2nd refusal in same scene disables expansion (covers: S2.3)

### Phase 3 — Deferred Character Hook

- [ ] T3.1: Create `DeferredHookStore` (`src/services/deferred-hook-store.ts`) — in-memory + session persistence for `DeferredHook[]` with CRUD operations — acceptance: unit tests for add/get/markUsed/expire (covers: S2.4)
- [ ] T3.2: Add hook detection in `roleplay-engine.ts` — when player mentions/interacts with NPC then refuses, create DeferredHook with strength 1-2 — acceptance: test verifies hook created after refused NPC interaction (covers: S2.4)
- [ ] T3.3: Add hook recall in `DirectorLoop` or post-prose — after block closure, check for eligible hooks and inject soft callback candidate into Dramaturg enrichment — acceptance: test verifies eligible hook appears as candidate after arc closure (covers: S2.4)
- [ ] T3.4: Wire deferred hooks into pipeline gated by `deferred-hooks-enabled` flag; add graduated strength logic (trace → edge → soft contact) — acceptance: when flag is on, eligible hooks produce visible callback; when off, no change (covers: S2.4)

### Phase 4 — Feedback

- [ ] T4.1: Add `FeedbackStore` (`src/services/feedback-store.ts`) — persists per-turn like/dislike/neutral with used techniques snapshot — acceptance: unit tests for record/get/queryByTechnique (covers: S2.5)
- [ ] T4.2: Add feedback API endpoint (`POST /api/feedback`) that records reaction tied to last narrative turn — acceptance: API returns 200, feedback persisted (covers: S2.5)
- [ ] T4.3: Add feedback signal injection — on regeneration (dislike 1st), pass "softer/different" instruction to Stylist; on dislike 2nd, rollback to raw turn — acceptance: test verifies regenerated text differs from original (covers: S2.5)
- [ ] T4.4: Add feedback learning — slowly adjust narrow parameters (pressure, sensory volume, expansion length) based on accumulated likes — acceptance: test verifies parameter drift after N likes (covers: S2.5)

### Phase 5 — Soft Dramaturgical Priors

- [ ] T5.1: Add small coefficients (±10-15% max) to `DramaturgAgent.enrichScene()` archetype weighting based on aggregated literary signals (action vs reflection, concrete vs abstract, voice density, tension dynamics) — acceptance: test verifies archetype weights shift within bounds (covers: S2.2)
- [ ] T5.2: Add `literaryModulationCoefficients()` pure function that computes ±10-15% adjustments from behavioral metrics — acceptance: unit tests for edge cases, max bound verification (covers: S2.2)
