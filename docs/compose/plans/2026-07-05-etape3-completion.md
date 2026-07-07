# Etape 3 Completion — Neon River Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining items from Etape 3 of the neon-river architectural improvement plan — add missing rules, synergy matrix, tech dependencies, happiness modifiers, rule validator, and cultural drift.

**Architecture:** Add JSON rule definitions and TypeScript utility modules to `src/rules/`. All rules are data (JSON), not code. The RulesEngine class already handles loading and merging.

**Tech Stack:** TypeScript, Bun, JSON, Zod (for validation)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/rules/social/mercantilism.json` | Mercantilism social rules |
| `src/rules/social/tribalism.json` | Tribalism social rules |
| `src/rules/social/theocracy.json` | Theocracy social rules |
| `src/rules/social/communism.json` | Communism social rules |
| `src/rules/economy/silver-economy.json` | Silver-based economy rules |
| `src/rules/synergy-matrix.json` | Rule combination synergies |
| `src/rules/tech-dependency.json` | Technology prerequisites |
| `src/rules/happiness-modifiers.json` | Population happiness effects |
| `src/rules/rule-validator.ts` | Validate rule JSON files |
| `src/rules/cultural-drift.ts` | Cultural resistance/change over time |
| `src/rules/rules-engine.test.ts` | Updated tests |

---

### Task 1: Add Missing Social Rules

**Covers:** Social Rules Engine completion

**Files:**
- Create: `src/rules/social/mercantilism.json`
- Create: `src/rules/social/tribalism.json`
- Create: `src/rules/social/theocracy.json`
- Create: `src/rules/social/communism.json`
- Test: `src/rules/rules-engine.test.ts`

- [ ] **Step 1: Write mercantilism.json**

```json
{
  "id": "mercantilism",
  "name": "Меркантилизм",
  "description": "Экономическая система, основанная на накоплении золота и контроле торговли",
  "social": {
    "hierarchy": ["merchant_prince", "guildmaster", "merchant", "artisan", "laborer"],
    "mobility": "through_wealth",
    "education": "merchant_only",
    "military_service": "hired_mercenaries",
    "marriage": "strategic_alliances",
    "law": "merchant_council"
  },
  "economy": {
    "currency": "gold",
    "tax_rate": 0.20,
    "tax_collector": "merchant_prince",
    "trade": "state_controlled",
    "property": "merchant_ownership",
    "labor": "wage_labor"
  },
  "politics": {
    "succession": "wealth_based",
    "council": "merchant_council",
    "justice": "merchant_court",
    "rebellion": "merchant_uprising"
  },
  "enforced_rules": [
    {"rule": "trade_requires_license", "penalty": "fine"},
    {"rule": "gold_accumulation_mandatory", "penalty": "confiscation"},
    {"rule": "foreign_trade_state_controlled", "penalty": "imprisonment"},
    {"rule": "guild_membership_required", "penalty": "exile"}
  ]
}
```

- [ ] **Step 2: Write tribalism.json**

```json
{
  "id": "tribalism",
  "name": "Племенной строй",
  "description": "Общество, основанное на племенных кланах и родовых связях",
  "social": {
    "hierarchy": ["elder", "warrior", "hunter", "gatherer", "youth"],
    "mobility": "through_deeds",
    "education": "oral_tradition",
    "military_service": "all_able_bodied",
    "marriage": "clan_approved",
    "law": "elder_council"
  },
  "economy": {
    "currency": "barter",
    "tax_rate": 0,
    "tax_collector": "none",
    "trade": "inter_tribal",
    "property": "communal",
    "labor": "shared"
  },
  "politics": {
    "succession": "elder_elected",
    "council": "elder_council",
    "justice": "tribal_custom",
    "rebellion": "schism"
  },
  "enforced_rules": [
    {"rule": "clan_loyalty_required", "penalty": "exile"},
    {"rule": "share_with_tribe", "penalty": "ostracism"},
    {"rule": "respect_elders", "penalty": "punishment"},
    {"rule": "hunt_for_group", "penalty": "reduced_rations"}
  ]
}
```

- [ ] **Step 3: Write theocracy.json**

```json
{
  "id": "theocracy",
  "name": "Теократия",
  "description": "Религиозная власть, закон = религиозные тексты",
  "social": {
    "hierarchy": ["high_priest", "priest", "acolyte", "faithful", "heathen"],
    "mobility": "religious_dedication",
    "education": "religious_only",
    "military_service": "holy_warriors",
    "marriage": "church_approved",
    "law": "religious_law"
  },
  "economy": {
    "currency": "gold",
    "tax_rate": 0.30,
    "tax_collector": "church",
    "trade": "temple_controlled",
    "property": "church_ownership",
    "labor": "tithe_based"
  },
  "politics": {
    "succession": "divine_selection",
    "council": "council_of_priests",
    "justice": "religious_trial",
    "rebellion": "heresy"
  },
  "enforced_rules": [
    {"rule": "tithe_payment_mandatory", "penalty": "excommunication"},
    {"rule": "obey_priesthood", "penalty": "punishment"},
    {"rule": "no_heresy", "penalty": "execution"},
    {"rule": "holy_days_observed", "penalty": "fine"},
    {"rule": "church_property_sacred", "penalty": "excommunication"}
  ]
}
```

- [ ] **Step 4: Write communism.json**

```json
{
  "id": "communism",
  "name": "Коммунизм",
  "description": "Общественная собственность, равенство, отсутствие классов",
  "social": {
    "hierarchy": ["party_secretary", "cadre", "citizen"],
    "mobility": "party_loyalty",
    "education": "universal",
    "military_service": "mandatory",
    "marriage": "free_choice",
    "law": "party_decides"
  },
  "economy": {
    "currency": "none",
    "tax_rate": 1.0,
    "tax_collector": "collective",
    "trade": "none",
    "property": "collective_ownership",
    "labor": "assigned_by_need"
  },
  "politics": {
    "succession": "party_election",
    "council": "workers_council",
    "justice": "people_tribunal",
    "rebellion": "counter_revolution"
  },
  "enforced_rules": [
    {"rule": "no_private_property", "penalty": "confiscation"},
    {"rule": "contribute_to_collective", "penalty": "reassignment"},
    {"rule": "share_equally", "penalty": "punishment"},
    {"rule": "party_loyalty_required", "penalty": "re_education"},
    {"rule": "no_exploitation", "penalty": "imprisonment"}
  ]
}
```

- [ ] **Step 5: Write silver-economy.json**

```json
{
  "id": "silver-economy",
  "name": "Серебряная экономика",
  "description": "Экономика на основе серебра, двухметаллическая система",
  "social": {
    "hierarchy": ["silver_lord", "merchant", "artisan", "laborer"],
    "mobility": "through_wealth",
    "education": "merchant_only",
    "military_service": "hired_mercenaries",
    "marriage": "strategic_alliances",
    "law": "merchant_council"
  },
  "economy": {
    "currency": "silver",
    "tax_rate": 0.15,
    "tax_collector": "silver_lord",
    "trade": "free_market",
    "property": "private_ownership",
    "labor": "wage_labor",
    "inflation": 0.02
  },
  "politics": {
    "succession": "wealth_based",
    "council": "silver_council",
    "justice": "merchant_court",
    "rebellion": "merchant_uprising"
  },
  "enforced_rules": [
    {"rule": "silver_payment_mandatory", "penalty": "fine"},
    {"rule": "trade_recording_required", "penalty": "confiscation"},
    {"rule": "no_silver_hoarding", "penalty": "fine"}
  ]
}
```

- [ ] **Step 6: Add tests for new rules**

```typescript
// Add to src/rules/rules-engine.test.ts

describe("New social rules", () => {
  it("loads mercantilism rules", () => {
    const engine = new RulesEngine({ primary: "mercantilism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("mercantilism");
    expect(rules.social.hierarchy[0]).toBe("merchant_prince");
    expect(rules.economy.trade).toBe("state_controlled");
  });

  it("loads tribalism rules", () => {
    const engine = new RulesEngine({ primary: "tribalism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("tribalism");
    expect(rules.economy.currency).toBe("barter");
    expect(rules.economy.tax_rate).toBe(0);
  });

  it("loads theocracy rules", () => {
    const engine = new RulesEngine({ primary: "theocracy" });
    const rules = engine.getRules();
    expect(rules.id).toBe("theocracy");
    expect(rules.economy.tax_rate).toBe(0.30);
    expect(rules.enforced_rules.length).toBe(5);
  });

  it("loads communism rules", () => {
    const engine = new RulesEngine({ primary: "communism" });
    const rules = engine.getRules();
    expect(rules.id).toBe("communism");
    expect(rules.economy.currency).toBe("none");
    expect(rules.economy.tax_rate).toBe(1.0);
  });

  it("loads silver-economy rules", () => {
    const engine = new RulesEngine({ primary: "silver-economy" });
    const rules = engine.getRules();
    expect(rules.id).toBe("silver-economy");
    expect(rules.economy.currency).toBe("silver");
    expect(rules.economy.inflation).toBe(0.02);
  });

  it("lists all available rules", () => {
    const rules = RulesEngine.listAvailableRules();
    expect(rules).toContain("feudalism");
    expect(rules).toContain("mercantilism");
    expect(rules).toContain("tribalism");
    expect(rules).toContain("theocracy");
    expect(rules).toContain("communism");
    expect(rules).toContain("silver-economy");
    expect(rules.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `bun test src/rules/rules-engine.test.ts`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/rules/social/*.json src/rules/economy/*.json src/rules/rules-engine.test.ts
git commit -m "feat(rules): add missing social and economic rules"
```

---

### Task 2: Add Synergy Matrix

**Covers:** Rule combination synergies

**Files:**
- Create: `src/rules/synergy-matrix.json`
- Test: `src/rules/rules-engine.test.ts`

- [ ] **Step 1: Write synergy-matrix.json**

```json
{
  "synergies": [
    {
      "rules": ["feudalism", "mercantilism"],
      "type": "positive",
      "effect": "Wealthy merchants gain political influence, creating a rising middle class",
      "modifiers": {
        "social_mobility": 0.2,
        "trade_efficiency": 0.15,
        "tax_revenue": 0.1
      }
    },
    {
      "rules": ["feudalism", "theocracy"],
      "type": "positive",
      "effect": "Church and nobility form a powerful alliance, stabilizing society",
      "modifiers": {
        "stability": 0.25,
        "education": 0.1,
        "rebellion_chance": -0.15
      }
    },
    {
      "rules": ["democracy", "capitalism"],
      "type": "positive",
      "effect": "Free markets thrive under democratic governance",
      "modifiers": {
        "trade_efficiency": 0.2,
        "innovation": 0.15,
        "social_mobility": 0.1
      }
    },
    {
      "rules": ["feudalism", "communism"],
      "type": "negative",
      "effect": "Class conflict between nobles and peasants intensifies",
      "modifiers": {
        "stability": -0.2,
        "rebellion_chance": 0.3,
        "social_mobility": -0.1
      }
    },
    {
      "rules": ["anarchy", "any"],
      "type": "negative",
      "effect": "Anarchy conflicts with organized systems",
      "modifiers": {
        "stability": -0.3,
        "trade_efficiency": -0.2
      }
    },
    {
      "rules": ["capitalism", "socialism"],
      "type": "negative",
      "effect": "Mixed economy creates tensions between private and state control",
      "modifiers": {
        "stability": -0.15,
        "trade_efficiency": -0.1,
        "social_mobility": 0.05
      }
    },
    {
      "rules": ["tribalism", "anarchy"],
      "type": "positive",
      "effect": "Tribal self-governance aligns with anarchist principles",
      "modifiers": {
        "stability": 0.1,
        "social_mobility": 0.1
      }
    },
    {
      "rules": ["theocracy", "communism"],
      "type": "positive",
      "effect": "Religious communalism creates strong social bonds",
      "modifiers": {
        "stability": 0.2,
        "tax_revenue": 0.1
      }
    }
  ],
  "resistances": [
    {
      "rules": ["feudalism", "democracy"],
      "type": "strong_resistance",
      "effect": "Democratic ideals clash with feudal hierarchy",
      "drift_speed": 0.1
    },
    {
      "rules": ["theocracy", "anarchy"],
      "type": "strong_resistance",
      "effect": "Religious authority opposes lawlessness",
      "drift_speed": 0.15
    }
  ]
}
```

- [ ] **Step 2: Add test for synergy matrix**

```typescript
// Add to src/rules/rules-engine.test.ts

describe("Synergy Matrix", () => {
  it("loads synergy matrix", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const matrix = readJsonFileSync(join(__dirname, "synergy-matrix.json"));
    expect(matrix.synergies.length).toBeGreaterThan(0);
    expect(matrix.resistances.length).toBeGreaterThan(0);
  });

  it("finds synergy between feudalism and mercantilism", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const matrix = readJsonFileSync(join(__dirname, "synergy-matrix.json"));
    const synergy = matrix.synergies.find(
      (s: any) => s.rules.includes("feudalism") && s.rules.includes("mercantilism")
    );
    expect(synergy).toBeDefined();
    expect(synergy.type).toBe("positive");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test src/rules/rules-engine.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/rules/synergy-matrix.json src/rules/rules-engine.test.ts
git commit -m "feat(rules): add synergy matrix for rule combinations"
```

---

### Task 3: Add Tech Dependencies

**Covers:** Technology prerequisites for rules

**Files:**
- Create: `src/rules/tech-dependency.json`
- Test: `src/rules/rules-engine.test.ts`

- [ ] **Step 1: Write tech-dependency.json**

```json
{
  "dependencies": {
    "feudalism": {
      "prerequisites": [],
      "unlocks": ["castle_construction", "serfdom", "guild_system"],
      "description": "Basic hierarchical society"
    },
    "democracy": {
      "prerequisites": ["literacy_rate_above_50"],
      "unlocks": ["voting_system", "constitutional_law", "public_education"],
      "description": "Requires educated populace"
    },
    "capitalism": {
      "prerequisites": ["banking_system", "currency_standard"],
      "unlocks": ["stock_market", "corporations", "insurance"],
      "description": "Requires financial infrastructure"
    },
    "socialism": {
      "prerequisites": ["industrial_base", "bureaucracy"],
      "unlocks": ["state_planning", "welfare_system", "public_healthcare"],
      "description": "Requires industrial capacity"
    },
    "communism": {
      "prerequisites": ["industrial_base", "class_consciousness"],
      "unlocks": ["collective_ownership", "planned_economy"],
      "description": "Requires class conflict"
    },
    "theocracy": {
      "prerequisites": ["organized_religion"],
      "unlocks": ["religious_law", "holy_wars", "temple_economy"],
      "description": "Requires established religion"
    },
    "mercantilism": {
      "prerequisites": ["maritime_capability", "trade_routes"],
      "unlocks": ["colonialism", "trade_monopolies", "naval_power"],
      "description": "Requires trade infrastructure"
    },
    "tribalism": {
      "prerequisites": [],
      "unlocks": ["clan_system", "oral_tradition", "hunt_cooperation"],
      "description": "Basic tribal organization"
    },
    "anarchy": {
      "prerequisites": [],
      "unlocks": ["mutual_aid", "direct_action", "voluntary_association"],
      "description": "No state organization"
    },
    "slavery": {
      "prerequisites": ["military_superiority"],
      "unlocks": ["slave_labor", "plantation_economy", "slave_trade"],
      "description": "Requires ability to subjugate"
    }
  },
  "technology_tree": {
    "agriculture": [],
    "bronze_working": ["agriculture"],
    "iron_working": ["bronze_working"],
    "currency": ["agriculture"],
    "banking": ["currency", "writing"],
    "writing": ["agriculture"],
    "literacy": ["writing"],
    "maritime": ["agriculture", "woodworking"],
    "gunpowder": ["alchemy", "metalworking"],
    "industrial_base": ["iron_working", "coal_mining", "steam_engine"],
    "steam_engine": ["iron_working"],
    "coal_mining": ["iron_working"],
    "electricity": ["industrial_base"],
    "organised_religion": ["writing", "agriculture"],
    "class_consciousness": ["industrial_base", "literacy"],
    "bureaucracy": ["writing", "literacy"]
  }
}
```

- [ ] **Step 2: Add test for tech dependencies**

```typescript
// Add to src/rules/rules-engine.test.ts

describe("Tech Dependencies", () => {
  it("loads tech dependencies", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const tech = readJsonFileSync(join(__dirname, "tech-dependency.json"));
    expect(tech.dependencies.feudalism).toBeDefined();
    expect(tech.dependencies.democracy.prerequisites.length).toBeGreaterThan(0);
  });

  it("democracy requires literacy", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const tech = readJsonFileSync(join(__dirname, "tech-dependency.json"));
    expect(tech.dependencies.democracy.prerequisites).toContain("literacy_rate_above_50");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test src/rules/rules-engine.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/rules/tech-dependency.json src/rules/rules-engine.test.ts
git commit -m "feat(rules): add technology dependency tree"
```

---

### Task 4: Add Happiness Modifiers

**Covers:** Population happiness effects

**Files:**
- Create: `src/rules/happiness-modifiers.json`
- Test: `src/rules/rules-engine.test.ts`

- [ ] **Step 1: Write happiness-modifiers.json**

```json
{
  "base_happiness": 50,
  "modifiers": {
    "feudalism": {
      "nobles": 70,
      "peasants": 30,
      "modifiers": {
        "tax_rate_high": -20,
        "tax_rate_low": 10,
        "military_victory": 15,
        "military_defeat": -25,
        "harvest_good": 20,
        "harvest_bad": -30
      }
    },
    "democracy": {
      "citizens": 50,
      "modifiers": {
        "freedom_of_speech": 10,
        "election_won": 15,
        "election_lost": -5,
        "economic_prosperity": 20,
        "economic_recession": -20,
        "public_services": 10
      }
    },
    "anarchy": {
      "default": 40,
      "modifiers": {
        "personal_freedom": 20,
        "violence_nearby": -30,
        "community_support": 15,
        "isolation": -10
      }
    },
    "theocracy": {
      "faithful": 60,
      "heathen": 20,
      "modifiers": {
        "religious_festival": 15,
        "heresy_punished": 10,
        "religious_persecution": -20,
        "tithe_burden": -10
      }
    },
    "communism": {
      "party_member": 55,
      "citizen": 45,
      "modifiers": {
        "equality_achieved": 15,
        "resource_shortage": -25,
        "propaganda_success": 10,
        "repression": -20
      }
    },
    "tribalism": {
      "default": 50,
      "modifiers": {
        "successful_hunt": 20,
        "famine": -30,
        "tribal_victory": 15,
        "tribal_defeat": -20,
        "elder_approval": 10
      }
    },
    "capitalism": {
      "bourgeoisie": 70,
      "working_class": 35,
      "modifiers": {
        "economic_boom": 20,
        "economic_bust": -25,
        "social_mobility": 10,
        "inequality_high": -15
      }
    },
    "socialism": {
      "party_official": 60,
      "citizen": 45,
      "modifiers": {
        "welfare_provided": 15,
        "shortage": -20,
        "propaganda_success": 10,
        "repression": -25
      }
    },
    "mercantilism": {
      "merchant_prince": 75,
      "merchant": 55,
      "artisan": 40,
      "laborer": 30,
      "modifiers": {
        "trade_profit": 15,
        "trade_embargo": -20,
        "gold_accumulated": 10,
        "inflation": -15
      }
    },
    "slavery": {
      "master": 80,
      "slave": 10,
      "modifiers": {
        "slave_revolt": -40,
        "successful_trade": 15,
        "abolition_movement": -10
      }
    }
  },
  "happiness_effects": {
    "above_80": {
      "productivity": 1.2,
      "rebellion_chance": 0.01,
      "birth_rate": 1.1,
      "description": "Prosperous society"
    },
    "above_60": {
      "productivity": 1.0,
      "rebellion_chance": 0.05,
      "birth_rate": 1.0,
      "description": "Stable society"
    },
    "above_40": {
      "productivity": 0.9,
      "rebellion_chance": 0.15,
      "birth_rate": 0.95,
      "description": "Content society"
    },
    "above_20": {
      "productivity": 0.7,
      "rebellion_chance": 0.30,
      "birth_rate": 0.85,
      "description": "Unhappy society"
    },
    "below_20": {
      "productivity": 0.5,
      "rebellion_chance": 0.60,
      "birth_rate": 0.70,
      "description": "Desperate society"
    }
  }
}
```

- [ ] **Step 2: Add test for happiness modifiers**

```typescript
// Add to src/rules/rules-engine.test.ts

describe("Happiness Modifiers", () => {
  it("loads happiness modifiers", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const happiness = readJsonFileSync(join(__dirname, "happiness-modifiers.json"));
    expect(happiness.base_happiness).toBe(50);
    expect(happiness.modifiers.feudalism).toBeDefined();
    expect(happiness.happiness_effects.above_80.productivity).toBe(1.2);
  });

  it("has effects for all social rules", () => {
    const { readJsonFileSync } = require("../lib/atomic-io");
    const { join } = require("node:path");
    const happiness = readJsonFileSync(join(__dirname, "happiness-modifiers.json"));
    const socialRules = ["feudalism", "democracy", "anarchy", "theocracy", "communism", "tribalism", "capitalism", "socialism", "mercantilism", "slavery"];
    for (const rule of socialRules) {
      expect(happiness.modifiers[rule]).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test src/rules/rules-engine.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/rules/happiness-modifiers.json src/rules/rules-engine.test.ts
git commit -m "feat(rules): add happiness modifiers for social systems"
```

---

### Task 5: Add Rule Validator

**Covers:** Rule validation utility

**Files:**
- Create: `src/rules/rule-validator.ts`
- Test: `src/rules/rule-validator.test.ts`

- [ ] **Step 1: Write rule-validator.ts**

```typescript
/**
 * Rule Validator — validates rule JSON files against schema.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("rule-validator");

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const REQUIRED_FIELDS = ["id", "name", "description", "social", "economy", "enforced_rules"];

const VALID_HIERARCHY_FIELDS = ["hierarchy", "mobility", "education", "military_service", "marriage", "law"];

const VALID_ECONOMY_FIELDS = ["currency", "tax_rate", "trade", "property", "labor"];

const VALID_CURRENCIES = ["gold", "silver", "coin", "barter", "none"];

const VALID_TRADE_TYPES = ["free_market", "controlled", "state_controlled", "none", "inter_tribal", "temple_controlled", "slave_trade_allowed", "free"];

export function validateRule(rule: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!rule || typeof rule !== "object") {
    errors.push({ path: "root", message: "Rule must be an object", severity: "error" });
    return { valid: false, errors, warnings };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in rule)) {
      errors.push({ path: field, message: `Missing required field: ${field}`, severity: "error" });
    }
  }

  // Validate id
  if (rule.id && typeof rule.id !== "string") {
    errors.push({ path: "id", message: "id must be a string", severity: "error" });
  }

  // Validate social
  if (rule.social && typeof rule.social === "object") {
    if (!Array.isArray(rule.social.hierarchy)) {
      errors.push({ path: "social.hierarchy", message: "hierarchy must be an array", severity: "error" });
    }
    for (const field of VALID_HIERARCHY_FIELDS) {
      if (!(field in rule.social)) {
        warnings.push({ path: `social.${field}`, message: `Missing social field: ${field}`, severity: "warning" });
      }
    }
  }

  // Validate economy
  if (rule.economy && typeof rule.economy === "object") {
    if (rule.economy.currency && !VALID_CURRENCIES.includes(rule.economy.currency)) {
      warnings.push({ path: "economy.currency", message: `Unknown currency: ${rule.economy.currency}`, severity: "warning" });
    }
    if (rule.economy.trade && !VALID_TRADE_TYPES.includes(rule.economy.trade)) {
      warnings.push({ path: "economy.trade", message: `Unknown trade type: ${rule.economy.trade}`, severity: "warning" });
    }
    if (typeof rule.economy.tax_rate !== "number" || rule.economy.tax_rate < 0 || rule.economy.tax_rate > 1) {
      errors.push({ path: "economy.tax_rate", message: "tax_rate must be a number between 0 and 1", severity: "error" });
    }
  }

  // Validate enforced_rules
  if (Array.isArray(rule.enforced_rules)) {
    for (let i = 0; i < rule.enforced_rules.length; i++) {
      const r = rule.enforced_rules[i];
      if (!r.rule || typeof r.rule !== "string") {
        errors.push({ path: `enforced_rules[${i}].rule`, message: "rule must be a string", severity: "error" });
      }
      if (!r.penalty || typeof r.penalty !== "string") {
        errors.push({ path: `enforced_rules[${i}].penalty`, message: "penalty must be a string", severity: "error" });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateRuleFile(filePath: string): ValidationResult {
  if (!existsSync(filePath)) {
    return {
      valid: false,
      errors: [{ path: filePath, message: "File not found", severity: "error" }],
      warnings: [],
    };
  }

  try {
    const rule = readJsonFileSync(filePath);
    return validateRule(rule);
  } catch (e) {
    return {
      valid: false,
      errors: [{ path: filePath, message: `Failed to parse JSON: ${e}`, severity: "error" }],
      warnings: [],
    };
  }
}

export function validateAllRules(rulesDir: string): { rule: string; result: ValidationResult }[] {
  const results: { rule: string; result: ValidationResult }[] = [];
  const { readdirSync } = require("node:fs");

  if (!existsSync(rulesDir)) return results;

  const files = readdirSync(rulesDir).filter((f: string) => f.endsWith(".json"));
  for (const file of files) {
    const filePath = join(rulesDir, file);
    const result = validateRuleFile(filePath);
    results.push({ rule: file.replace(".json", ""), result });
  }

  return results;
}
```

- [ ] **Step 2: Write rule-validator.test.ts**

```typescript
/**
 * Rule Validator tests
 */

import { describe, it, expect } from "bun:test";
import { validateRule, validateRuleFile, validateAllRules } from "./rule-validator";
import { join } from "node:path";

describe("RuleValidator", () => {
  it("validates a valid rule", () => {
    const rule = {
      id: "test",
      name: "Test Rule",
      description: "A test rule",
      social: {
        hierarchy: ["a", "b"],
        mobility: "full",
        education: "universal",
        military_service: "volunteer",
        marriage: "free",
        law: "codified",
      },
      economy: {
        currency: "gold",
        tax_rate: 0.15,
        trade: "free_market",
        property: "private",
        labor: "wage",
      },
      enforced_rules: [
        { rule: "test_rule", penalty: "fine" },
      ],
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("fails for missing required fields", () => {
    const rule = { id: "test" };
    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails for invalid tax_rate", () => {
    const rule = {
      id: "test",
      name: "Test",
      description: "Test",
      social: { hierarchy: [] },
      economy: { currency: "gold", tax_rate: 1.5, trade: "free", property: "private", labor: "wage" },
      enforced_rules: [],
    };
    const result = validateRule(rule);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "economy.tax_rate")).toBe(true);
  });

  it("validates real feudalism rule file", () => {
    const filePath = join(__dirname, "social", "feudalism.json");
    const result = validateRuleFile(filePath);
    expect(result.valid).toBe(true);
  });

  it("validates all rules in directory", () => {
    const socialDir = join(__dirname, "social");
    const results = validateAllRules(socialDir);
    expect(results.length).toBeGreaterThan(0);
    const invalid = results.filter((r) => !r.result.valid);
    expect(invalid.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test src/rules/rule-validator.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/rules/rule-validator.ts src/rules/rule-validator.test.ts
git commit -m "feat(rules): add rule validator for JSON validation"
```

---

### Task 6: Add Cultural Drift

**Covers:** Cultural resistance/change over time

**Files:**
- Create: `src/rules/cultural-drift.ts`
- Test: `src/rules/cultural-drift.test.ts`

- [ ] **Step 1: Write cultural-drift.ts**

```typescript
/**
 * Cultural Drift — models cultural resistance and change over time.
 * Rules don't change instantly; societies resist rapid transformation.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("cultural-drift");

export interface DriftConfig {
  resistance: number;      // 0-1, how much culture resists change (1 = max resistance)
  adaptationSpeed: number; // 0-1, how fast society adapts to new rules (1 = instant)
  stabilityBonus: number;  // bonus for long-established rules
  generationsToAdapt: number; // generations needed for full adaptation
}

export interface CulturalState {
  currentRule: string;
  establishedTurns: number;
  loyalty: number;         // 0-1, how loyal population is to current system
  adaptationProgress: number; // 0-1, how adapted to current system
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  resistance: 0.7,
  adaptationSpeed: 0.1,
  stabilityBonus: 0.2,
  generationsToAdapt: 5,
};

const RULE_RESISTANCE: Record<string, number> = {
  feudalism: 0.8,        // Old systems resist change strongly
  theocracy: 0.9,        // Religious systems are very resistant
  tribalism: 0.85,       // Traditional systems resist
  democracy: 0.5,        // Modern systems adapt faster
  capitalism: 0.6,
  socialism: 0.65,
  communism: 0.7,
  mercantilism: 0.75,
  anarchy: 0.3,          // Anarchy changes easily
  slavery: 0.85,         // Entrenched systems resist abolition
};

export class CulturalDrift {
  private _config: DriftConfig;
  private _states: Map<string, CulturalState> = new Map();

  constructor(config: Partial<DriftConfig> = {}) {
    this._config = { ...DEFAULT_DRIFT_CONFIG, ...config };
  }

  /**
   * Initialize cultural state for a world
   */
  initWorld(worldId: string, initialRule: string): void {
    this._states.set(worldId, {
      currentRule: initialRule,
      establishedTurns: 0,
      loyalty: 0.8,
      adaptationProgress: 1.0,
    });
  }

  /**
   * Check if a rule change is accepted by the population
   * Returns: acceptance probability (0-1)
   */
  checkChangeAcceptance(worldId: string, newRule: string): number {
    const state = this._states.get(worldId);
    if (!state) return 0.5;

    const resistance = this.getResistance(state.currentRule);
    const loyaltyFactor = state.loyalty * resistance;
    const adaptationFactor = state.adaptationProgress * this._config.adaptationSpeed;

    // Change is harder when:
    // - Current system is well-established (high loyalty)
    // - Current system has high resistance
    // - New system is very different
    const changeDifficulty = loyaltyFactor + (1 - adaptationFactor);

    // Change is easier when:
    // - Society is unhappy (low loyalty)
    // - New system is similar to old
    const changeEase = (1 - state.loyalty) * 0.5;

    const acceptance = Math.max(0, Math.min(1, 1 - changeDifficulty + changeEase));

    log.info(`Change acceptance for ${worldId}: ${state.currentRule} → ${newRule}: ${acceptance.toFixed(2)}`);
    return acceptance;
  }

  /**
   * Apply rule change if accepted
   */
  applyChange(worldId: string, newRule: string, accepted: boolean): void {
    const state = this._states.get(worldId);
    if (!state) return;

    if (accepted) {
      state.currentRule = newRule;
      state.establishedTurns = 0;
      state.loyalty = 0.5; // Reset loyalty after change
      state.adaptationProgress = 0.1;
      log.info(`Rule changed for ${worldId}: → ${newRule}`);
    } else {
      // Rejection strengthens loyalty to current system
      state.loyalty = Math.min(1, state.loyalty + 0.1);
      log.info(`Rule change rejected for ${worldId}: loyalty increased to ${state.loyalty}`);
    }
  }

  /**
   * Advance one turn — increase adaptation, loyalty, etc.
   */
  advanceTurn(worldId: string): void {
    const state = this._states.get(worldId);
    if (!state) return;

    state.establishedTurns++;

    // Adaptation increases over time
    const maxAdaptation = 1.0;
    state.adaptationProgress = Math.min(
      maxAdaptation,
      state.adaptationProgress + this._config.adaptationSpeed * (1 - state.adaptationProgress)
    );

    // Loyalty increases with stability
    const stabilityBonus = Math.min(
      this._config.stabilityBonus,
      state.establishedTurns * 0.02
    );
    state.loyalty = Math.min(1, state.loyalty + stabilityBonus * 0.1);
  }

  /**
   * Get resistance level for a rule
   */
  getResistance(rule: string): number {
    return RULE_RESISTANCE[rule] ?? this._config.resistance;
  }

  /**
   * Get current state
   */
  getState(worldId: string): CulturalState | undefined {
    return this._states.get(worldId);
  }

  /**
   * Calculate drift effect on happiness
   */
  getDriftEffect(worldId: string): { happinessModifier: number; description: string } {
    const state = this._states.get(worldId);
    if (!state) return { happinessModifier: 0, description: "No cultural state" };

    if (state.establishedTurns < 3) {
      return {
        happinessModifier: -5,
        description: "Cultural transition period",
      };
    } else if (state.adaptationProgress > 0.8) {
      return {
        happinessModifier: 5,
        description: "Well-adapted society",
      };
    }

    return {
      happinessModifier: 0,
      description: "Adapting to new system",
    };
  }
}
```

- [ ] **Step 2: Write cultural-drift.test.ts**

```typescript
/**
 * Cultural Drift tests
 */

import { describe, it, expect } from "bun:test";
import { CulturalDrift } from "./cultural-drift";

describe("CulturalDrift", () => {
  it("initializes world state", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const state = drift.getState("world1");
    expect(state).toBeDefined();
    expect(state!.currentRule).toBe("feudalism");
    expect(state!.loyalty).toBe(0.8);
  });

  it("checks change acceptance", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const acceptance = drift.checkChangeAcceptance("world1", "democracy");
    expect(acceptance).toBeGreaterThanOrEqual(0);
    expect(acceptance).toBeLessThanOrEqual(1);
  });

  it("applies accepted change", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    drift.applyChange("world1", "democracy", true);
    const state = drift.getState("world1");
    expect(state!.currentRule).toBe("democracy");
    expect(state!.loyalty).toBe(0.5);
  });

  it("increases loyalty on rejected change", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const beforeLoyalty = drift.getState("world1")!.loyalty;
    drift.applyChange("world1", "democracy", false);
    const afterLoyalty = drift.getState("world1")!.loyalty;
    expect(afterLoyalty).toBeGreaterThan(beforeLoyalty);
  });

  it("advances turn correctly", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    drift.advanceTurn("world1");
    const state = drift.getState("world1");
    expect(state!.establishedTurns).toBe(1);
  });

  it("returns resistance for known rules", () => {
    const drift = new CulturalDrift();
    expect(drift.getResistance("feudalism")).toBe(0.8);
    expect(drift.getResistance("anarchy")).toBe(0.3);
  });

  it("calculates drift effect", () => {
    const drift = new CulturalDrift();
    drift.initWorld("world1", "feudalism");
    const effect = drift.getDriftEffect("world1");
    expect(effect.happinessModifier).toBe(-5); // Transition period
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test src/rules/cultural-drift.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/rules/cultural-drift.ts src/rules/cultural-drift.test.ts
git commit -m "feat(rules): add cultural drift for rule change resistance"
```

---

### Task 7: Run All Tests and Verify

**Covers:** Final verification

**Files:**
- `src/rules/rules-engine.test.ts`
- `src/rules/rule-validator.test.ts`
- `src/rules/cultural-drift.test.ts`

- [ ] **Step 1: Run all rules tests**

Run: `bun test src/rules/`
Expected: All tests pass

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: All tests pass (759+ tests)

- [ ] **Step 3: Verify rules count**

Run: `bun -e "const {RulesEngine} = require('./src/rules/rules-engine'); console.log(RulesEngine.listAvailableRules())"`
Expected: Output shows 10+ rules (feudalism, democracy, anarchy, theocracy, communism, tribalism, capitalism, socialism, mercantilism, slavery, silver-economy, gold-standard, barter, command-economy)

---

## Summary

| Task | Files Created | Tests Added |
|------|---------------|-------------|
| 1. Missing Social Rules | 5 JSON files | 6 tests |
| 2. Synergy Matrix | 1 JSON file | 2 tests |
| 3. Tech Dependencies | 1 JSON file | 2 tests |
| 4. Happiness Modifiers | 1 JSON file | 2 tests |
| 5. Rule Validator | 1 TS file | 5 tests |
| 6. Cultural Drift | 1 TS file | 7 tests |
| 7. Verification | - | Final run |

**Total:** 9 files created, 24 tests added
