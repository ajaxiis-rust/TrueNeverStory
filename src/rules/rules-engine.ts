/**
 * Rules Engine — loads and executes social/economic rules for worlds.
 * Rules are data (JSON), not code. Worlds change via JSON config.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("rules-engine");

export interface EnforcedRule {
  rule: string;
  penalty: string;
}

export interface SocialRules {
  id: string;
  name: string;
  description: string;
  social: {
    hierarchy: string[];
    mobility: string;
    education: string;
    military_service: string;
    marriage: string;
    law: string;
  };
  economy: {
    currency: string;
    tax_rate: number;
    tax_collector?: string;
    trade: string;
    property: string;
    labor: string;
    inflation?: number;
  };
  politics?: {
    succession: string;
    council: string;
    justice: string;
    rebellion: string;
  };
  enforced_rules: EnforcedRule[];
}

export interface RulesConfig {
  primary: string;
  modifiers?: string[];
}

const RULES_DIR = join(process.cwd(), "src", "rules", "social");
const ECONOMY_DIR = join(process.cwd(), "src", "rules", "economy");

const _rulesCache = new Map<string, SocialRules>();

function loadRule(id: string): SocialRules {
  const cached = _rulesCache.get(id);
  if (cached) return cached;

  const socialPath = join(RULES_DIR, `${id}.json`);
  const economyPath = join(ECONOMY_DIR, `${id}.json`);

  let rules: SocialRules;

  if (existsSync(socialPath)) {
    rules = readJsonFileSync<SocialRules>(socialPath)!;
  } else if (existsSync(economyPath)) {
    rules = readJsonFileSync<SocialRules>(economyPath)!;
  } else {
    throw new Error(`Rule not found: ${id}`);
  }

  _rulesCache.set(id, rules);
  return rules;
}

export class RulesEngine {
  private _primary: SocialRules;
  private _modifiers: SocialRules[];
  private _merged: SocialRules | null = null;

  constructor(config: RulesConfig) {
    this._primary = loadRule(config.primary);
    this._modifiers = (config.modifiers ?? []).map((id) => loadRule(id));
  }

  get primary(): SocialRules {
    return this._primary;
  }

  get modifiers(): SocialRules[] {
    return this._modifiers;
  }

  getRules(): SocialRules {
    if (this._merged) return this._merged;

    const merged: SocialRules = {
      ...this._primary,
      social: { ...this._primary.social },
      economy: { ...this._primary.economy },
      enforced_rules: [...this._primary.enforced_rules],
    };

    if (this._primary.politics) {
      merged.politics = { ...this._primary.politics };
    }

    for (const mod of this._modifiers) {
      if (mod.social) merged.social = { ...merged.social, ...mod.social };
      if (mod.economy) merged.economy = { ...merged.economy, ...mod.economy };
      if (mod.politics && merged.politics) {
        merged.politics = { ...merged.politics, ...mod.politics };
      }

      for (const rule of mod.enforced_rules) {
        if (!merged.enforced_rules.find((r) => r.rule === rule.rule)) {
          merged.enforced_rules.push(rule);
        }
      }
    }

    this._merged = merged;
    return merged;
  }

  canAct(action: string): boolean {
    const rules = this.getRules();
    const rule = rules.enforced_rules.find((r) => r.rule === action);
    return rule ? rule.penalty !== "none" : true;
  }

  getPenalty(action: string): string | null {
    const rules = this.getRules();
    const rule = rules.enforced_rules.find((r) => r.rule === action);
    return rule?.penalty ?? null;
  }

  canCommand(superiorClass: string, subordinateClass: string): boolean {
    const rules = this.getRules();
    const superiorRank = rules.social.hierarchy.indexOf(superiorClass);
    const subordinateRank = rules.social.hierarchy.indexOf(subordinateClass);
    if (superiorRank === -1 || subordinateRank === -1) return false;
    return superiorRank < subordinateRank;
  }

  getHierarchyLevel(socialClass: string): number {
    const rules = this.getRules();
    return rules.social.hierarchy.indexOf(socialClass);
  }

  canTrade(): boolean {
    const rules = this.getRules();
    return rules.economy.trade !== "none";
  }

  getTaxRate(): number {
    return this.getRules().economy.tax_rate;
  }

  static listAvailableRules(): string[] {
    const rules: string[] = [];
    const { readdirSync } = require("node:fs");
    if (existsSync(RULES_DIR)) {
      for (const f of readdirSync(RULES_DIR)) {
        if (f.endsWith(".json")) rules.push(f.replace(".json", ""));
      }
    }
    if (existsSync(ECONOMY_DIR)) {
      for (const f of readdirSync(ECONOMY_DIR)) {
        if (f.endsWith(".json")) rules.push(f.replace(".json", ""));
      }
    }
    return rules;
  }
}
