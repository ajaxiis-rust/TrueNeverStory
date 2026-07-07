/**
 * Feature Flags — A/B testing, gradual rollout, conditional behavior.
 */

import { readJsonFileSync, atomicWriteJson } from "./atomic-io";
import { getConfig } from "../config/env";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("feature-flags");

export interface FlagCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "contains";
  value: unknown;
}

export interface FlagVariant {
  id: string;
  name: string;
  weight: number;
  payload?: Record<string, unknown>;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  percentage: number;
  conditions: FlagCondition[];
  variants: FlagVariant[];
  createdAt: string;
  updatedAt: string;
}

interface FlagStore {
  flags: FeatureFlag[];
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    id: "narrative-v2",
    name: "Narrative V2",
    description: "New narrative generation algorithm",
    enabled: false,
    percentage: 0,
    conditions: [],
    variants: [
      { id: "control", name: "Control", weight: 50 },
      { id: "treatment", name: "Treatment", weight: 50 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "npc-memory-v2",
    name: "NPC Memory V2",
    description: "Enhanced NPC memory system",
    enabled: false,
    percentage: 0,
    conditions: [],
    variants: [
      { id: "basic", name: "Basic Memory", weight: 50 },
      { id: "enhanced", name: "Enhanced Memory", weight: 50 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class FeatureFlagManager {
  private _flags: Map<string, FeatureFlag> = new Map();
  private _configPath: string;
  private _exposures: Map<string, number> = new Map();

  constructor() {
    const cfg = getConfig();
    this._configPath = join(cfg.CONF_PATH, "feature-flags.json");
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._configPath)) {
      for (const flag of DEFAULT_FLAGS) {
        this._flags.set(flag.id, flag);
      }
      return;
    }

    try {
      const data = readJsonFileSync<FlagStore>(this._configPath);
      if (data?.flags) {
        for (const flag of data.flags) {
          this._flags.set(flag.id, flag);
        }
      }
    } catch (err) {
      log.warn({ err }, "Failed to load feature flags");
    }
  }

  private _save(): void {
    const dir = join(getConfig().CONF_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const store: FlagStore = {
      flags: Array.from(this._flags.values()),
    };
    atomicWriteJson(this._configPath, store);
  }

  isEnabled(flagId: string, context?: Record<string, unknown>): boolean {
    const flag = this._flags.get(flagId);
    if (!flag) return false;
    if (!flag.enabled) return false;

    if (flag.percentage < 100) {
      const hash = this._hash(flagId, context);
      if (hash * 100 > flag.percentage) return false;
    }

    if (flag.conditions.length > 0 && context) {
      for (const cond of flag.conditions) {
        if (!this._evaluateCondition(cond, context)) return false;
      }
    }

    return true;
  }

  getVariant(flagId: string, context?: Record<string, unknown>): string | null {
    const flag = this._flags.get(flagId);
    if (!flag || !flag.enabled) return null;
    if (flag.variants.length === 0) return null;

    const hash = this._hash(flagId, context);
    let cumulative = 0;
    for (const variant of flag.variants) {
      cumulative += variant.weight;
      if (hash * 100 <= cumulative) return variant.id;
    }

    return flag.variants[flag.variants.length - 1]!.id;
  }

  getVariantPayload(flagId: string, context?: Record<string, unknown>): Record<string, unknown> | null {
    const variantId = this.getVariant(flagId, context);
    if (!variantId) return null;

    const flag = this._flags.get(flagId);
    const variant = flag?.variants.find((v) => v.id === variantId);
    return variant?.payload ?? null;
  }

  trackExposure(flagId: string, variantId: string, userId?: string): void {
    const key = `${flagId}:${variantId}`;
    this._exposures.set(key, (this._exposures.get(key) ?? 0) + 1);
    log.debug({ flagId, variantId, userId }, "Feature flag exposure tracked");
  }

  getExposures(): Record<string, number> {
    return Object.fromEntries(this._exposures);
  }

  getAll(): FeatureFlag[] {
    return Array.from(this._flags.values());
  }

  get(flagId: string): FeatureFlag | undefined {
    return this._flags.get(flagId);
  }

  create(flag: Omit<FeatureFlag, "createdAt" | "updatedAt">): FeatureFlag {
    const newFlag: FeatureFlag = {
      ...flag,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._flags.set(flag.id, newFlag);
    this._save();
    log.info({ id: flag.id }, "Feature flag created");
    return newFlag;
  }

  update(flagId: string, updates: Partial<FeatureFlag>): boolean {
    const flag = this._flags.get(flagId);
    if (!flag) return false;

    Object.assign(flag, updates, { updatedAt: new Date().toISOString() });
    this._save();
    log.info({ id: flagId }, "Feature flag updated");
    return true;
  }

  delete(flagId: string): boolean {
    const removed = this._flags.delete(flagId);
    if (removed) {
      this._save();
      log.info({ id: flagId }, "Feature flag deleted");
    }
    return removed;
  }

  private _hash(flagId: string, context?: Record<string, unknown>): number {
    const input = flagId + (context?.userId ?? context?.id ?? "anonymous");
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) / 2147483647;
  }

  private _evaluateCondition(cond: FlagCondition, context: Record<string, unknown>): boolean {
    const value = context[cond.field];
    switch (cond.operator) {
      case "eq": return value === cond.value;
      case "neq": return value !== cond.value;
      case "gt": return Number(value) > Number(cond.value);
      case "lt": return Number(value) < Number(cond.value);
      case "contains": return String(value).includes(String(cond.value));
      default: return true;
    }
  }
}

let _manager: FeatureFlagManager | null = null;

export function getFeatureFlagManager(): FeatureFlagManager {
  if (!_manager) {
    _manager = new FeatureFlagManager();
  }
  return _manager;
}

export function resetFeatureFlagManager(): void {
  _manager = null;
}
