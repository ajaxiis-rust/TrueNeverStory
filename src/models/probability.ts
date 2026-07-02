/**
 * Probability system models (replaces world_core/probability/models.py).
 */

export enum ModifierType {
  ADD = "add",
  MULTIPLY = "multiply",
  REPLACE = "replace",
}

export enum OutcomeQuality {
  CRITICAL_FAILURE = "critical_failure",
  FAILURE = "failure",
  MARGINAL_FAILURE = "marginal_failure",
  MARGINAL_SUCCESS = "marginal_success",
  SUCCESS = "success",
  CRITICAL_SUCCESS = "critical_success",
}

export function isOutcomeSuccess(q: OutcomeQuality): boolean {
  return q === OutcomeQuality.MARGINAL_SUCCESS || q === OutcomeQuality.SUCCESS || q === OutcomeQuality.CRITICAL_SUCCESS;
}

export function isOutcomeCritical(q: OutcomeQuality): boolean {
  return q === OutcomeQuality.CRITICAL_FAILURE || q === OutcomeQuality.CRITICAL_SUCCESS;
}

export enum ParameterType {
  STATIC = "static",
  DYNAMIC = "dynamic",
  RELATIONSHIP = "relationship",
  EXTERNAL = "external",
}

export enum StackingRule {
  STACK = "stack",
  TAKE_HIGHEST = "highest",
  TAKE_LOWEST = "lowest",
  OVERRIDE = "override",
}

export interface ProbabilityModifierData {
  parameter_name: string;
  value: number;
  modifier_type: ModifierType;
  duration_seconds?: number | null;
  source?: string;
  stacking_rule?: StackingRule;
  expires_at?: number | null;
  description?: string;
}

export class ProbabilityModifier {
  parameterName: string;
  value: number;
  modifierType: ModifierType;
  durationSeconds: number | null;
  source: string;
  stackingRule: StackingRule;
  expiresAt: number | null;
  description: string;

  constructor(data: ProbabilityModifierData) {
    this.parameterName = data.parameter_name;
    this.value = data.value;
    this.modifierType = data.modifier_type;
    this.durationSeconds = data.duration_seconds ?? null;
    this.source = data.source ?? "";
    this.stackingRule = data.stacking_rule ?? StackingRule.STACK;
    this.expiresAt = data.expires_at ?? null;
    this.description = data.description ?? "";
  }

  isExpired(currentTime?: number): boolean {
    if (!this.expiresAt) return false;
    return (currentTime ?? Date.now() / 1000) >= this.expiresAt;
  }

  toDict(): ProbabilityModifierData {
    return {
      parameter_name: this.parameterName,
      value: this.value,
      modifier_type: this.modifierType,
      duration_seconds: this.durationSeconds,
      source: this.source,
      stacking_rule: this.stackingRule,
      expires_at: this.expiresAt,
      description: this.description,
    };
  }

  static fromDict(d: Record<string, unknown>): ProbabilityModifier {
    return new ProbabilityModifier({
      parameter_name: d.parameter_name as string,
      value: d.value as number,
      modifier_type: d.modifier_type as ModifierType,
      duration_seconds: d.duration_seconds as number | null,
      source: d.source as string,
      stacking_rule: d.stacking_rule as StackingRule,
      expires_at: d.expires_at as number | null,
      description: d.description as string,
    });
  }
}

export interface ProbabilityParameterData {
  name: string;
  base_value?: number;
  weight?: number;
  param_type?: ParameterType;
  dynamic_source?: string | null;
  min_value?: number;
  max_value?: number;
  type?: ParameterType;
  formula?: string | null;
}

export class ProbabilityParameter {
  name: string;
  baseValue: number;
  weight: number;
  paramType: ParameterType;
  dynamicSource: string | null;
  minValue: number;
  maxValue: number;

  constructor(data: ProbabilityParameterData) {
    this.name = data.name;
    this.baseValue = data.base_value ?? 0.5;
    this.weight = data.weight ?? 1.0;
    this.paramType = data.param_type ?? data.type ?? ParameterType.STATIC;
    this.dynamicSource = data.dynamic_source ?? data.formula ?? null;
    this.minValue = data.min_value ?? 0;
    this.maxValue = data.max_value ?? 1;
  }

  toDict(): ProbabilityParameterData {
    return {
      name: this.name,
      base_value: this.baseValue,
      weight: this.weight,
      param_type: this.paramType,
      dynamic_source: this.dynamicSource,
      min_value: this.minValue,
      max_value: this.maxValue,
    };
  }

  static fromDict(d: Record<string, unknown>): ProbabilityParameter {
    return new ProbabilityParameter({
      name: d.name as string,
      base_value: d.base_value as number,
      weight: d.weight as number,
      param_type: d.param_type as ParameterType,
      dynamic_source: d.dynamic_source as string,
      min_value: d.min_value as number,
      max_value: d.max_value as number,
    });
  }
}

export interface ProbabilityProfileData {
  name: string;
  parameters?: Record<string, ProbabilityParameterData>;
  parameters_array?: ProbabilityParameterData[];
  formula?: string;
  difficulty_modifier?: number;
  critical_success_threshold?: number;
  critical_failure_threshold?: number;
  description?: string;
}

export class ProbabilityProfile {
  name: string;
  formula: string;
  difficultyModifier: number;
  criticalSuccessThreshold: number;
  criticalFailureThreshold: number;
  parameters: Record<string, ProbabilityParameter>;

  constructor(data: ProbabilityProfileData) {
    this.name = data.name;
    this.formula = data.formula ?? "sum_weighted";
    this.difficultyModifier = data.difficulty_modifier ?? 1.0;
    this.criticalSuccessThreshold = data.critical_success_threshold ?? 0.9;
    this.criticalFailureThreshold = data.critical_failure_threshold ?? 0.1;

    if (data.parameters) {
      this.parameters = {};
      for (const [k, v] of Object.entries(data.parameters)) {
        this.parameters[k] = new ProbabilityParameter(v);
      }
    } else if (data.parameters_array) {
      this.parameters = {};
      for (const p of data.parameters_array) {
        this.parameters[p.name] = new ProbabilityParameter(p);
      }
    } else {
      this.parameters = {};
    }
  }

  getParamNames(): string[] {
    return Object.keys(this.parameters);
  }

  toDict(): ProbabilityProfileData {
    const params: Record<string, ProbabilityParameterData> = {};
    for (const [k, v] of Object.entries(this.parameters)) {
      params[k] = v.toDict();
    }
    return {
      name: this.name,
      parameters: params,
      formula: this.formula,
      difficulty_modifier: this.difficultyModifier,
      critical_success_threshold: this.criticalSuccessThreshold,
      critical_failure_threshold: this.criticalFailureThreshold,
    };
  }

  static fromDict(d: Record<string, unknown>): ProbabilityProfile {
    const params: Record<string, ProbabilityParameterData> = {};
    const rawParams = d.parameters as Record<string, Record<string, unknown>> | undefined;
    if (rawParams) {
      for (const [k, v] of Object.entries(rawParams)) {
        params[k] = v as unknown as ProbabilityParameterData;
      }
    }
    return new ProbabilityProfile({
      name: d.name as string,
      parameters: params,
      formula: d.formula as string,
      difficulty_modifier: d.difficulty_modifier as number,
      critical_success_threshold: d.critical_success_threshold as number,
      critical_failure_threshold: d.critical_failure_threshold as number,
    });
  }
}

export interface ProbabilityResultData {
  probability: number;
  roll: number;
  success: boolean;
  quality: OutcomeQuality;
  details?: Record<string, number>;
  narrative?: string;
}

export class ProbabilityResult {
  probability: number;
  roll: number;
  success: boolean;
  quality: OutcomeQuality;
  details: Record<string, number>;
  narrative: string;

  constructor(data: ProbabilityResultData) {
    this.probability = data.probability;
    this.roll = data.roll;
    this.success = data.success;
    this.quality = data.quality;
    this.details = data.details ?? {};
    this.narrative = data.narrative ?? "";
  }

  toString(): string {
    return `ProbabilityResult(prob=${(this.probability * 100).toFixed(1)}%, roll=${(this.roll * 100).toFixed(1)}%, outcome=${this.quality}, success=${this.success})`;
  }
}
