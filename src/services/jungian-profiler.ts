import type { AxisSignals } from './metrics-collector';

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

export const BLEND_CONFIG = {
  emaAlpha: 0.25,
  maxShiftPerTurn: 0.10,
  rangeGrowthThreshold: 0.3,
  rangeDecayRate: 0.005,
  minTurnsForBlend: 20,
};

export function updateAxis(
  current: AxisProfile,
  signal: number,
  recentSignals: number[],
): AxisProfile {
  const ema = current.preference * (1 - BLEND_CONFIG.emaAlpha) + signal * BLEND_CONFIG.emaAlpha;
  const delta = ema - current.preference;
  const clamped = current.preference + Math.sign(delta) * Math.min(Math.abs(delta), BLEND_CONFIG.maxShiftPerTurn);

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

export function updateAxisConfidence(current: number, incoming: number, blendedPreference: number): number {
  const difference = Math.abs(incoming - blendedPreference);
  if (difference < 0.1) return Math.min(0.95, current + 0.05);
  if (difference > 0.3) return Math.max(0.3, current - 0.1);
  return current;
}

export function blendBehavioralSignals(
  signals: AxisSignals,
  profile: JungianProfile,
  recentSignals: { extraversion: number[]; intuition: number[]; thinking: number[]; judging: number[] },
): JungianProfile {
  const ex = updateAxis(profile.extraversion, signals.extraversion, recentSignals.extraversion);
  const in_ = updateAxis(profile.intuition, signals.intuition, recentSignals.intuition);
  const th = updateAxis(profile.thinking, signals.thinking, recentSignals.thinking);
  const ju = updateAxis(profile.judging, signals.judging, recentSignals.judging);

  const cEx = updateAxisConfidence(profile.axisConfidence.extraversion, signals.extraversion, ex.preference);
  const cIn = updateAxisConfidence(profile.axisConfidence.intuition, signals.intuition, in_.preference);
  const cTh = updateAxisConfidence(profile.axisConfidence.thinking, signals.thinking, th.preference);
  const cJu = updateAxisConfidence(profile.axisConfidence.judging, signals.judging, ju.preference);

  return {
    extraversion: ex, intuition: in_, thinking: th, judging: ju,
    confidence: (cEx + cIn + cTh + cJu) / 4,
    axisConfidence: { extraversion: cEx, intuition: cIn, thinking: cTh, judging: cJu },
    source: 'blended',
  };
}
