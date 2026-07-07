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
