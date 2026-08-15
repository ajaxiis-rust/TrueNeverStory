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
