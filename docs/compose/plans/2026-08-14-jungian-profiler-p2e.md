# Jungian Profiler — Phase 2E: PsychotypeAnalyzer + Synopsis/Prologue (Task 2.7)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S4, S5; impl-спека `spec-profiler-persistence.md` §2.

**Acceptance (2E):** `analyzeText` через LLM structured output возвращает полный `TextAnalysis` (схема S5: `psychotype` + `style` + `themes` + `suggestedArcs` + `worldHints`); `psychotypeToProfile` строит `JungianProfile` (`source: 'text'`), confidence = `min(psychotype.confidence, cap(wordCount))`. Невалидный JSON → default `TextAnalysis`. Форма создания мира принимает Synopsis + Prologue (i18n 7 языков).

**Files:**
- Modify: `src/services/jungian-profiler.ts` — PsychotypeAnalyzer живёт ЗДЕСЬ (per S17/impl-спека), НЕ в отдельном `psychotype-analyzer.ts`
- Modify: `src/services/jungian-profiler.test.ts` (append)
- Modify: `src/services/world-manager.ts` — `synopsis`/`prologue` в `WorldCreateParams` + персист в `world_frame.json` + module-level `setWorldProfilerServices` + `analyzeText` в `createWorld`
- Modify: `src/routes/worlds.ts` — передать `synopsis`/`prologue` в `createWorld` (без LLM-логики)
- Modify: `public/worlds.html`

---

## Task 2.7: PsychotypeAnalyzer + UI

**Covers:** S4, S5
**Interfaces (Produces):** `TextAnalysis { psychotype; style; themes; suggestedArcs; worldHints }` (совпадает с S5 1:1); `analyzeText(synopsis, prologue, llmQueue): Promise<TextAnalysis>`; `psychotypeToProfile(psychotype, wordCount): JungianProfile`; `confidenceCap(wordCount): number`; `blendProfiles(a: JungianProfile, b: JungianProfile): JungianProfile` (чистый blend текстовых профилей, 0 LLM — этап 2 [S5.2] в P4)

- [ ] **Step 1: Write failing tests**

```typescript
// src/services/jungian-profiler.test.ts (append)
import { describe, test, expect } from 'bun:test';
import { analyzeText, psychotypeToProfile, confidenceCap, type TextAnalysis } from './jungian-profiler';
import type { LLMQueue } from '@/lib/llm-queue';

const stubLlm = (json: string): LLMQueue => ({ generateText: async () => json }) as unknown as LLMQueue;

// S5 schema — психотип НЕ плоский {value,confidence,evidence}, а объект psychotype + style/themes/...
const validJson = JSON.stringify({
  psychotype: {
    extraversion: 0.3, intuition: 0.8, thinking: 0.75, judging: 0.7,
    axisConfidence: { extraversion: 0.8, intuition: 0.7, thinking: 0.8, judging: 0.7 },
    confidence: 0.9, // единый скаляр
  },
  style: {
    register: 'medium', pacing: 'medium', sensoryFocus: ['visual', 'tactile'],
    sentenceProfile: { avgLength: 14, complexity: 'moderate' },
  },
  themes: ['betrayal', 'duty'],
  suggestedArcs: ['fall_and_rise'],
  worldHints: { suggestedGenres: ['dark fantasy'], suggestedSocialSystem: 'feudal', suggestedTone: 'grim' },
});

describe('analyzeText', () => {
  test('valid JSON → полный TextAnalysis (S5 schema)', async () => {
    const prologue = 'word '.repeat(120); // ~120 слов → cap 0.35
    const ta = await analyzeText('a story', prologue, stubLlm(validJson));
    expect(ta.psychotype.extraversion).toBeCloseTo(0.3, 5);
    expect(ta.psychotype.confidence).toBeCloseTo(0.9, 5); // сырой скаляр LLM, cap — в psychotypeToProfile
    expect(ta.style.register).toBe('medium');
    expect(ta.themes).toContain('betrayal');
    expect(ta.worldHints.suggestedGenres).toContain('dark fantasy');
  });
  test('invalid JSON → default TextAnalysis (fallback)', async () => {
    const ta = await analyzeText('x', 'y', stubLlm('not json'));
    expect(ta.psychotype.confidence).toBe(0);
    expect(ta.themes).toEqual([]);
  });
});

describe('psychotypeToProfile', () => {
  test('маппит оси + caps confidence = min(LLM скаляр, cap(wordCount))', () => {
    const psychotype = (JSON.parse(validJson) as TextAnalysis).psychotype;
    const p = psychotypeToProfile(psychotype, 100); // 100 слов → cap 0.35
    expect(p.extraversion.preference).toBeCloseTo(0.3, 5);
    expect(p.thinking.preference).toBeCloseTo(0.75, 5);
    expect(p.confidence).toBeCloseTo(0.35, 5); // min(0.9, 0.35), НЕ среднее axisConfidence
    expect(p.source).toBe('text');
  });
});

describe('confidenceCap', () => {
  test('cap table: <50→0.20, <200→0.35, <500→0.45, ≥500→0.55', () => {
    expect(confidenceCap(10)).toBeCloseTo(0.20, 5);
    expect(confidenceCap(120)).toBeCloseTo(0.35, 5);
    expect(confidenceCap(300)).toBeCloseTo(0.45, 5);
    expect(confidenceCap(600)).toBeCloseTo(0.55, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `analyzeText is not exported` / `Cannot find name 'analyzeText'`

- [ ] **Step 3: Write minimal implementation (append to jungian-profiler.ts)**

```typescript
// src/services/jungian-profiler.ts — append (НЕ создавать psychotype-analyzer.ts)
import type { LLMQueue } from '@/lib/llm-queue';

// ── S5: TextAnalysis — structured output schema (совпадает с дизайном S5 1:1) ──
export interface TextAnalysis {
  psychotype: {
    extraversion: number; // 0 = pure I, 1 = pure E
    intuition: number;    // 0 = pure S, 1 = pure N
    thinking: number;     // 0 = pure F, 1 = pure T
    judging: number;      // 0 = pure P, 1 = pure J
    axisConfidence: { extraversion: number; intuition: number; thinking: number; judging: number };
    confidence: number;   // единый скаляр 0-1
  };
  style: {
    register: 'high' | 'medium' | 'low';
    pacing: 'slow' | 'medium' | 'fast' | 'variable';
    sensoryFocus: string[];
    sentenceProfile: { avgLength: number; complexity: 'simple' | 'moderate' | 'complex' };
  };
  themes: string[];
  suggestedArcs: string[];
  worldHints: { suggestedGenres: string[]; suggestedSocialSystem: string; suggestedTone: string };
}

export function confidenceCap(wordCount: number): number {
  return wordCount < 50 ? 0.20 : wordCount < 200 ? 0.35 : wordCount < 500 ? 0.45 : 0.55;
}

export function createDefaultTextAnalysis(): TextAnalysis {
  return {
    psychotype: {
      extraversion: 0.5, intuition: 0.5, thinking: 0.5, judging: 0.5,
      axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
      confidence: 0,
    },
    style: { register: 'medium', pacing: 'medium', sensoryFocus: [], sentenceProfile: { avgLength: 15, complexity: 'moderate' } },
    themes: [], suggestedArcs: [], worldHints: { suggestedGenres: [], suggestedSocialSystem: '', suggestedTone: '' },
  };
}

// Маппинг TextAnalysis.psychotype → JungianProfile.
// Confidence = min(LLM единый скаляр, cap(wordCount)) — НЕ среднее axisConfidence.
export function psychotypeToProfile(psychotype: TextAnalysis['psychotype'], wordCount: number): JungianProfile {
  const axis = (v: number): AxisProfile => ({ preference: v, range: 0.1 });
  return {
    extraversion: axis(psychotype.extraversion),
    intuition: axis(psychotype.intuition),
    thinking: axis(psychotype.thinking),
    judging: axis(psychotype.judging),
    confidence: Math.min(psychotype.confidence, confidenceCap(wordCount)),
    axisConfidence: { ...psychotype.axisConfidence },
    source: 'text',
  };
}

export async function analyzeText(
  synopsis: string,
  prologue: string,
  llmQueue: LLMQueue,
): Promise<TextAnalysis> {
  // Empty-text: основная защита — на call site (НЕ вызывать при обоих пустых).
  // Defensive: при пустых обоих полях возвращаем default (эквивалент createDefaultProfile).
  if (!synopsis.trim() && !prologue.trim()) return createDefaultTextAnalysis();

  const prompt = `Analyze this character synopsis and story prologue to determine psychological preferences and style.

CHARACTER SYNOPSIS:
${synopsis}

PROLOGUE:
${prologue}

Respond as JSON ONLY, matching this exact schema:
{
  "psychotype": {
    "extraversion": 0.5,
    "intuition": 0.5,
    "thinking": 0.5,
    "judging": 0.5,
    "axisConfidence": { "extraversion": 0.5, "intuition": 0.5, "thinking": 0.5, "judging": 0.5 },
    "confidence": 0.5
  },
  "style": {
    "register": "medium",
    "pacing": "medium",
    "sensoryFocus": ["visual", "tactile"],
    "sentenceProfile": { "avgLength": 15, "complexity": "moderate" }
  },
  "themes": ["betrayal"],
  "suggestedArcs": ["fall_and_rise"],
  "worldHints": { "suggestedGenres": ["dark fantasy"], "suggestedSocialSystem": "feudal", "suggestedTone": "grim" }
}`;

  const response = await llmQueue.generateText(prompt, 1, 0.3, 'psychotype-analyzer');
  try {
    return JSON.parse(response.trim()) as TextAnalysis;
  } catch {
    // Fallback на parse error → default TextAnalysis (confidence 0).
    return createDefaultTextAnalysis();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): PsychotypeAnalyzer — LLM structured output (S5 TextAnalysis) → JungianProfile"
```

- [ ] **Step 6: Wire in createWorld (world-manager.ts) — однократно при создании мира**

Анализ живёт **внутри сервиса `createWorld`** (этап 1, [S5]), а не в route-handler'е. `worlds.ts` только передаёт `synopsis`/`prologue` в `createWorld` (без LLM-логики).

```typescript
// (a) src/services/world-manager.ts — добавить поля в WorldCreateParams:
export interface WorldCreateParams {
  name: string;
  title: string;
  description: string;
  genre?: string;
  genres?: string[];
  language: string;
  worldRules: string[];
  magicSystem: string;
  primaryRule?: string;
  ruleModifiers?: string[];
  synopsis?: string;   // NEW — S4: 1-3 предложения «О чём история?»
  prologue?: string;   // NEW — S4: пролог/предистория (опционально)
}

// (b) module-level инжекция профайлер-сервисов (зеркально setWorldServices в worlds.ts:32–41):
import { analyzeText, psychotypeToProfile } from '../services/jungian-profiler';
import type { PlayerProfileStore } from '../lib/player-profile-store';
import type { LLMQueue } from '../lib/llm-queue';

let _profiler: { store: PlayerProfileStore; llmQueue: LLMQueue } | null = null;
export function setWorldProfilerServices(store: PlayerProfileStore, llmQueue: LLMQueue): void {
  _profiler = { store, llmQueue };
}

// (c) внутри createWorld — после сборки мира, ДО возврата:
//    1. персистим synopsis/prologue в world_frame.json (нужны этапу 2, S5.2 / S7)
//    2. если _profiler и текст непуст — синхронный analyzeText → upsertJungianProfile
if (_profiler && (params.synopsis || params.prologue)) {
  // Empty-text guard: при обоих пустых analyzeText НЕ вызываем — профиль остаётся createDefaultProfile()
  const analysis = await analyzeText(params.synopsis ?? '', params.prologue ?? '', _profiler.llmQueue);
  const wordCount = `${params.synopsis ?? ''} ${params.prologue ?? ''}`.split(/\s+/).filter(Boolean).length;
  const profile = psychotypeToProfile(analysis.psychotype, wordCount);
  _profiler.store.upsertJungianProfile('default', profile); // 'default' = global pre-character player id
}
```

> Вызов `setWorldProfilerServices(store, llmQueue)` — при инициализации приложения (там же, где `setWorldServices`). `upsertJungianProfile` — из Phase 1. **Этап 2 (birth-wizard refine + подбор автора) — НЕ здесь**: откладывается в P4 ([S5.2], [S7]), см. `p4c.md`. Пролог/синопсис уже персистятся в `world_frame.json` (этот шаг) — P4 их читает.

- [ ] **Step 7: Add Synopsis/Prologue fields to public/worlds.html**

Два textarea: `Synopsis` (1-3 предложения) и `Prologue` (опционально). `name="synopsis"`/`name="prologue"`. Label/placeholder через `I18N` (EN, RU, DE, FR, ES, JA, ZH). Оба опциональны.

- [ ] **Step 8: Manual verify (UI) + commit**

```bash
# Ручная проверка: создать мир с Synopsis+Prologue → в БД jungian-профиль с source='text'
git add src/routes/worlds.ts src/services/world-manager.ts public/worlds.html
git commit -m "feat(profiler): Synopsis/Prologue world-creation fields + analyzer wiring"
```

**Phase 2E DONE.** Переходи к `2026-08-14-jungian-profiler-p2f.md`.
