/**
 * World rule validation with relationship pre-checks.
 * Replaces world_intelligence/rule_checker.py.
 */

import type { GraphStore } from "../services/graph-store";
import type { EntityNode } from "../models/entity";
import { getLogger } from "../utils/logger";

const log = getLogger("rule-checker");

interface RuleViolation {
  uid: string;
  name: string;
  type: string;
  description: string;
  severity: string;
  source: string;
  suggestion?: string;
}

/**
 * Fast, non-LLM sanity checks on relationship consistency.
 */
function validateRelationshipSanity(
  srcEntity: EntityNode,
  relType: string,
  targetEntity: EntityNode,
): string[] {
  const issues: string[] = [];
  const srcType = srcEntity.entityType;
  const tgtType = targetEntity.entityType;

  if (relType === "parent_of" || relType === "child_of") {
    const srcAge = srcEntity.profile.l1.age ?? srcEntity.profile.l2.age;
    const tgtAge = targetEntity.profile.l1.age ?? targetEntity.profile.l2.age;
    if (srcAge && tgtAge && typeof srcAge === "number" && typeof tgtAge === "number") {
      if (relType === "parent_of" && srcAge <= tgtAge) {
        issues.push(`parent_of: source ${srcEntity.name} age ${srcAge} <= target ${targetEntity.name} age ${tgtAge}`);
      } else if (relType === "child_of" && srcAge >= tgtAge) {
        issues.push(`child_of: source ${srcEntity.name} age ${srcAge} >= target ${targetEntity.name} age ${tgtAge}`);
      }
    }
  }

  if (relType === "located_at" || relType === "located_in") {
    if (tgtType !== "Location") {
      issues.push(`located_at/in target must be a Location, got ${tgtType}`);
    }
  }

  if (relType === "controls") {
    if (srcType !== "Faction" && srcType !== "Character") {
      issues.push(`controls: source ${srcType} is not a Faction/Character`);
    }
    if (tgtType !== "Location") {
      issues.push(`controls: target must be a Location, got ${tgtType}`);
    }
  }

  return issues;
}

export class RuleChecker {
  private _store: GraphStore;

  constructor(store: GraphStore) {
    this._store = store;
  }

  /**
   * Run fast, non-LLM relationship pre-checks.
   */
  precheckRelationships(): RuleViolation[] {
    const conflicts: RuleViolation[] = [];
    const entities = this._store.entityStore.allNodes();

    for (const entity of entities) {
      const rels = entity.profile.relationships;
      for (const rel of rels) {
        const targetRef = rel.target as string;
        if (!targetRef) continue;
        const targetNode = this._store.entityStore.getByName(targetRef);
        if (!targetNode) continue;

        const relType = (rel.type as string) ?? "";
        const issues = validateRelationshipSanity(entity, relType, targetNode);
        for (const issue of issues) {
          conflicts.push({
            uid: entity.uid,
            name: entity.name,
            type: entity.entityType,
            description: issue,
            severity: "warning",
            source: "precheck",
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Run world rule checks on all entities.
   */
  async checkAll(autoFix = false): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];
    const entities = this._store.entityStore.allNodes();
    const worldRules = this._store.entityStore.allNodes()
      .filter((n) => n.entityType === "WorldRule")
      .map((n) => ({ name: n.name, description: n.profile.summary }));

    for (const entity of entities) {
      if (entity.entityType === "WorldRule") continue;
      for (const rule of worldRules) {
        const violation = this._checkEntityRule(entity, rule);
        if (violation) violations.push(violation);
      }
    }

    // Add pre-check conflicts
    violations.push(...this.precheckRelationships());

    log.info({ violations: violations.length }, "Rule check complete");
    return violations;
  }

  private _checkEntityRule(
    entity: EntityNode,
    rule: { name: string; description: string },
  ): RuleViolation | null {
    // Validate that entity's relationships don't violate world rules
    const rels = entity.profile.relationships;
    for (const rel of rels) {
      const targetRef = rel.target as string;
      if (!targetRef) continue;
      const targetNode = this._store.entityStore.getByName(targetRef);
      if (!targetNode) continue;

      const relType = (rel.type as string) ?? "";
      const issues = validateRelationshipSanity(entity, relType, targetNode);
      if (issues.length > 0) {
        return {
          uid: entity.uid,
          name: entity.name,
          type: entity.entityType,
          description: issues.join("; "),
          severity: "warning",
          source: "rule_check",
        };
      }
    }

    return null;
  }
}
