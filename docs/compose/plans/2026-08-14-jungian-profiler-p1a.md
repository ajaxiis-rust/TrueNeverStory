# Jungian Profiler — Phase 1A: Типы (Task 1.1)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [x]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S6.

**Acceptance (1A):** `src/services/jungian-profiler.ts` содержит `AxisProfile`, `AxisConfidence`, `JungianProfile`, `createDefaultProfile`, `deriveType`, `averageRange`, `axisClarity`. Unit-тесты зелёные. 0 LLM.

**Files:**
- Create: `src/services/jungian-profiler.ts`
- Create: `src/services/jungian-profiler.test.ts`

---

## Task 1.1: JungianProfile типы + хелперы

**Covers:** S6
**Interfaces (Produces):** `AxisProfile { preference; range }`; `AxisConfidence { extraversion; intuition; thinking; judging }`; `JungianProfile { extraversion; intuition; thinking; judging; confidence; axisConfidence; source }`; `createDefaultProfile(): JungianProfile`; `deriveType(profile): string`; `averageRange(profile): number`; `axisClarity(profile): number`

- [x] **Step 1: Write failing test**

```typescript
// src/services/jungian-profiler.test.ts
import { describe, test, expect } from 'bun:test';
import { createDefaultProfile, deriveType, averageRange, axisClarity } from './jungian-profiler';

describe('createDefaultProfile', () => {
  test('all axes 0.5/0.1, confidence 0, source default', () => {
    const p = createDefaultProfile();
    expect(p.extraversion).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.intuition).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.thinking).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.judging).toEqual({ preference: 0.5, range: 0.1 });
    expect(p.confidence).toBe(0);
    expect(p.axisConfidence).toEqual({ extraversion: 0, intuition: 0, thinking: 0, judging: 0 });
    expect(p.source).toBe('default');
  });
});

describe('deriveType', () => {
  test('clear preferences map to MBTI letters', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 0.3; // I
    p.intuition.preference = 0.8;    // N
    p.thinking.preference = 0.75;    // T
    p.judging.preference = 0.7;      // J
    expect(deriveType(p)).toBe('INTJ');
  });
  test('ambivalent axes map to X', () => {
    expect(deriveType(createDefaultProfile())).toBe('XXXX');
  });
});

describe('averageRange', () => {
  test('averages 4 axes', () => {
    const p = createDefaultProfile();
    p.extraversion.range = 0.2; p.intuition.range = 0.4; p.thinking.range = 0.6; p.judging.range = 0.8;
    expect(averageRange(p)).toBeCloseTo(0.5, 5);
  });
});

describe('axisClarity', () => {
  test('0.5 everywhere → 0', () => {
    expect(axisClarity(createDefaultProfile())).toBe(0);
  });
  test('1.0 everywhere → 1', () => {
    const p = createDefaultProfile();
    p.extraversion.preference = 1; p.intuition.preference = 1; p.thinking.preference = 1; p.judging.preference = 1;
    expect(axisClarity(p)).toBeCloseTo(1, 5);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: FAIL — `Cannot find module './jungian-profiler'`

- [x] **Step 3: Write minimal implementation**

```typescript
// src/services/jungian-profiler.ts
export interface AxisProfile {
  preference: number;
  range: number;
}

export interface AxisConfidence {
  extraversion: number;
  intuition: number;
  thinking: number;
  judging: number;
}

export interface JungianProfile {
  extraversion: AxisProfile;
  intuition: AxisProfile;
  thinking: AxisProfile;
  judging: AxisProfile;
  confidence: number;
  axisConfidence: AxisConfidence;
  source: 'text' | 'metrics' | 'blended' | 'default';
}

export function createDefaultProfile(): JungianProfile {
  const axis: AxisProfile = { preference: 0.5, range: 0.1 };
  return {
    extraversion: { ...axis },
    intuition: { ...axis },
    thinking: { ...axis },
    judging: { ...axis },
    confidence: 0,
    axisConfidence: { extraversion: 0, intuition: 0, thinking: 0, judging: 0 },
    source: 'default',
  };
}

export function deriveType(profile: JungianProfile): string {
  const e = profile.extraversion.preference > 0.55 ? 'E' : profile.extraversion.preference < 0.45 ? 'I' : 'X';
  const n = profile.intuition.preference > 0.55 ? 'N' : profile.intuition.preference < 0.45 ? 'S' : 'X';
  const t = profile.thinking.preference > 0.55 ? 'T' : profile.thinking.preference < 0.45 ? 'F' : 'X';
  const j = profile.judging.preference > 0.55 ? 'J' : profile.judging.preference < 0.45 ? 'P' : 'X';
  return `${e}${n}${t}${j}`;
}

export function averageRange(profile: JungianProfile): number {
  return (profile.extraversion.range + profile.intuition.range +
          profile.thinking.range + profile.judging.range) / 4;
}

export function axisClarity(profile: JungianProfile): number {
  const axes = [profile.extraversion.preference, profile.intuition.preference,
                profile.thinking.preference, profile.judging.preference];
  return axes.reduce((sum, x) => sum + Math.abs(x - 0.5) * 2, 0) / 4;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test src/services/jungian-profiler.test.ts`
Expected: PASS (6 tests)

- [x] **Step 5: Typecheck + commit**

```bash
bunx tsc --noEmit
git add src/services/jungian-profiler.ts src/services/jungian-profiler.test.ts
git commit -m "feat(profiler): JungianProfile types + deriveType/averageRange/axisClarity"
```

**Phase 1A DONE.** Переходи к `2026-08-14-jungian-profiler-p1b.md`.
