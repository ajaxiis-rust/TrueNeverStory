# v2 Paradigm Migration — Full Cleanup Design

**Date:** 2026-08-17
**Status:** Design (brainstorm output, pending user approval)
**Author:** Architect session (compose:brainstorm)
**Scope:** Полная зачистка legacy agent surfaces → v2 computable-prompt paradigm

---

## [S1] Problem

The codebase has a paradigm split. The v2 "Big Six" agents (`dramaturg`, `validator`, `stylist`, `actor`, `censor`, `chronicler`) use **computable prompts** — prompts constructed as a function of psychotype, MCP retrieval, distribution signals, style patterns, and context. The remaining "old" surfaces use **static prompts** — fixed strings in `DEFAULT_PROMPTS` (`agent-config.ts:152-188`) and inline lambdas in `_getAgentById` (`roleplay-engine.ts:869-929`).

When the v2 paradigm is fully active (psychotypes + MCP + modulation), static-prompt surfaces produce semantically incorrect output: they ignore player psychotype, don't retrieve relevant templates, and don't modulate tone by distribution. The old paradigm isn't just worse — it's a different epistemic level.

**Current state (verified 2026-08-17):**
- Legacy prose agents (`NarratorAgent`, `NPCAgent`, `SceneAgent`, `DirectorAgent`) — **already deleted** (grep empty, classes gone)
- Big Six — **fully wired** into `_processInputImpl` via `v2Generator.generate()` (`roleplay-engine.ts:502`)
- `legacy-adapter.ts` — **already removed**
- 4 v2-prose pipeline bugs — **fixed** (DB path, retrieval keys, context field, style shape)
- `literary-compiler-v2` flag — **ON**
- 4 paradigm layers — **built but OFF**: `jungian-profiler-enabled`, `literary-modulation-enabled`, `short-turn-expansion-enabled`, `deferred-hooks-enabled`

**Remaining "old" surfaces (3 layers, zero overlap with Big Six):**
1. @mention service agents — 5 inline lambdas with static prompt strings
2. crafter + researcher — subsystems with static prompts (game mechanics)
3. v1 `AgentRegistry` + `DEFAULT_AGENTS`/`DEFAULT_PROMPTS` — config/metadata layer for admin API

---

## [S2] Solution overview

Sequential migration in 3 vectors: **Activate → Migrate surfaces → Decommission**.

1. **Вектор 1 (Активация):** Flip 4 feature flags ON. Validate end-to-end. The v2 paradigm code is already integrated into `_processInputImpl` — it just needs activation. ~1.5-2 days.

2. **Вектор 2 (Surface migration):** Migrate 3 static-prompt surfaces to computable prompts: @mention agents, crafter flavor text, researcher. ~3-4 days.

3. **Вектор 3 (Decommission):** Remove `DEFAULT_PROMPTS` static layer, clean v1 registry, update docs. ~1 day.

**Total: ~5.5-7 days. Overall risk: MEDIUM (concentrated in Вектор 1 activation).**

---

## [S3] Вектор 1 — Активация (~1.5-2 дня)

### Steps

| Step | Action | Time | Risk | Verification |
|------|--------|------|------|--------------|
| 1.1 | Pre-flight: read psychotype code paths (`initJungianProfile`, `metricsCollector`, `runBlendCycle`, `runEnrichmentConveyor`, `censor.clean`) — confirm completeness | 2h | — | no TODO/stubs, all branches implemented |
| 1.2 | Flip `jungian-profiler-enabled` → true (`conf/feature-flags.json` + `DEFAULT_FLAGS`) | 30m | MED | flag loaded, `isEnabled()` returns true |
| 1.3 | Flip `literary-modulation-enabled` → true | 30m | LOW | `computeLiteraryToneHint` invoked |
| 1.4 | Flip `short-turn-expansion-enabled` → true | 30m | LOW | `shouldExpand` + `expand` functional |
| 1.5 | Flip `deferred-hooks-enabled` → true | 30m | LOW | `DeferredHookStore` persists |
| 1.6 | E2E validation: full play session with all 4 flags ON | 4-6h | MED | metricsCollector collects, blendCycle stable on empty profile, censor.clean filters, no empty outputs |
| 1.7 | Commit + push | 30m | — | git clean |

### Risk: psychotype untested under load

The psychotype code was built with phase-gating and has not been tested with real input under all 4 flags ON. Step 1.6 is the critical gate.

**Mitigation already in code:** `runEnrichmentConveyor` is guarded by `jungianProfile.confidence >= 0.3` (`roleplay-engine.ts:490`) — on early turns (no signals), the conveyor does NOT run. This is correct design. Verification: confirm 0.3 confidence is reachable within a reasonable number of turns.

---

## [S4] Вектор 2 — Surface migration (~3-4 дня)

### [S4.1] 2a. @mention → computable (~1-1.5 дня)

**Decision point 2a-D1:** Big Six accept `(intent, simulation, context)`, @mention accepts `(message, context)`. Need an **adapter** that wraps free-text message into a synthetic `Intent` + minimal `SimulationResult` + `GameContext`, OR a separate `ServiceMessageAgentV2` interface.

**Recommendation:** Adapter approach — construct `Intent(type:'dialogue', content: message)` + minimal `SimulationResult` (empty stateChanges) + existing `GameContext`. This reuses Big Six's computable-prompt machinery without a new interface.

| Step | Action | Time |
|------|--------|------|
| 2a.1 | Audit: map @mention → Big Six. `@chronicler`→ChroniclerAgent, `@dramaturg`→DramaturgAgent, `@stylist`→Stylist, `@actor`→Actor, `@validator`→Validator, `@censor`→Censor | 2h |
| 2a.2 | Build adapter: `message → synthetic Intent + minimal SimulationResult + GameContext` for Big Six routing | 3-4h |
| 2a.3 | Wire Big Six into `_getAgentById` (replace lambdas with `this.agentRegistry.get(id)`) | 2h |
| 2a.4 | **Decision point 2a-D2:** `@story-planner`/`@social-sim`/`@villain`/`@researcher` — delete (Big Six covers) OR build computable service-message prompts | 2-4h |
| 2a.5 | Update error-message (`roleplay-engine.ts:837`) + tests | 2h |

### [S4.2] 2b. crafter flavor → computable (~1 день)

Crafter is a game mechanic (deterministic state changes for `/craft`, `/inventory`). Only the **flavor text** (descriptions of crafted items) needs v2 treatment; mechanics stay untouched.

| Step | Action | Time |
|------|--------|------|
| 2b.1 | Audit `CrafterAgent` + `PromptBuilder.buildCrafterPrompt` — separate mechanics from flavor | 2h |
| 2b.2 | Flavor text → through `stylist.buildMicroPrompt` + MCP retrieval (craft result as "outcome") | 3-4h |
| 2b.3 | Integration + tests (mechanics not broken) | 2-3h |

### [S4.3] 2c. researcher → MCP retrieval (~0.5-1 дня)

| Step | Action | Time |
|------|--------|------|
| 2c.1 | Audit `ResearcherAgent` + `IdleResearchScheduler` — find static prompts | 1-2h |
| 2c.2 | Replace static research prompts with MCP retrieval (`searchTemplates` / bible `search_verses`) | 3-4h |
| 2c.3 | Integration + tests | 2h |

---

## [S5] Вектор 3 — Decommission (~1 день)

| Step | Action | Time | Dependency |
|------|--------|------|------------|
| 3.1 | Audit: confirm `DEFAULT_PROMPTS` no longer referenced by active code | 1h | 2a-c done |
| 3.2 | Remove static `DEFAULT_PROMPTS` entries for migrated surfaces | 1h | 3.1 |
| 3.3 | **Decision point 3-D1:** v1 `AgentRegistry` (config/metadata) — merge into `AgentRegistryV2` OR keep as admin-config layer (metadata, not prompts — doesn't conflict with v2 paradigm) | 3-4h | — |
| 3.4 | Remove dead code (unused imports, orphaned files) | 1-2h | 3.2 |
| 3.5 | Update docs (`docs/AGENTS.md`, `ARCHITECTURE.md`) — reflect v2-only reality | 2h | 3.4 |
| 3.6 | Final: `bun test` + typecheck | 1-2h | 3.5 |

---

## [S6] Decision points (require user input)

- **2a-D1:** @mention adapter (synthetic Intent) vs separate `ServiceMessageAgentV2` interface. **Recommendation:** adapter (reuses Big Six machinery).
- **2a-D2:** `@story-planner`/`@social-sim`/`@villain`/`@researcher` — delete or build computable version. **Recommendation:** delete `@story-planner`/`@social-sim` (Big Six covers), keep `@villain`/`@researcher` if they have distinct value, else delete.
- **3-D1:** v1 `AgentRegistry` — merge into v2 or keep as admin-config layer. **Recommendation:** keep as admin-config layer (it's metadata for `/api/agents/registry/*`, not prompts — doesn't conflict with v2 paradigm; merging adds risk without paradigm benefit).

---

## [S7] Complexity summary

| Vector | Time | Risk | User-visible |
|--------|------|------|--------------|
| 1. Активация | 1.5-2 days | MEDIUM (untested integration) | YES — psychotype changes prose |
| 2. Surface migration | 3-4 days | LOW | Partially (@mention) |
| 3. Decommission | 1 day | LOW | No (internal) |
| **Total** | **~5.5-7 days** | **MEDIUM** | |

---

## [S8] Architectural constraints

- **Big Six `process(intent, simulation, context)` is a prose-generation contract.** It must NOT be forced onto game-mechanic subsystems (crafter, researcher) whose invocation patterns are command-driven / timer-driven. Their v2 migration = computable prompts for text output, NOT interface change.
- **The v1 `AgentRegistry` is a live admin-config API** (`/api/agents/registry/*`, `/api/agents/:id`), not dead code. It manages metadata (name, description, priority, enabled, prompts, provider/model) for the admin UI. Removing it without a replacement breaks the UI.
- **Feature flags are the activation mechanism.** `conf/feature-flags.json` overrides `DEFAULT_FLAGS` when present — both must be updated for a flag flip to stick across fresh installs.
- **`getLiteraryDb()` opens `data/literary-compiler/literary.db`** (`roleplay-engine.ts:961`) — correct path. `scene_templates`/`style_patterns` may be empty (0 rows), causing graceful fallback to `stylist.process()` — this is expected, not a bug.
