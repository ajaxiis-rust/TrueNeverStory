import { describe, it, expect } from "bun:test";
import { safeEval } from "./probability-expression";

describe("safeEval", () => {
  it("evaluates simple arithmetic", () => {
    expect(safeEval("2 + 3", {})).toBe(5);
    expect(safeEval("10 - 4", {})).toBe(6);
    expect(safeEval("3 * 7", {})).toBe(21);
    expect(safeEval("10 / 2", {})).toBe(5);
    expect(safeEval("10 % 3", {})).toBe(1);
  });

  it("evaluates exponentiation", () => {
    expect(safeEval("2 ** 3", {})).toBe(8);
    expect(safeEval("3 ** 2", {})).toBe(9);
  });

  it("evaluates with variables", () => {
    expect(safeEval("x + y", { x: 3, y: 4 })).toBe(7);
    expect(safeEval("health * 2", { health: 0.5 })).toBe(1);
  });

  it("evaluates parenthesized expressions", () => {
    expect(safeEval("(2 + 3) * 4", {})).toBe(20);
    expect(safeEval("((1 + 2) * (3 + 4))", {})).toBe(21);
  });

  it("evaluates unary minus", () => {
    expect(safeEval("-5", {})).toBe(-5);
    expect(safeEval("-(3 + 2)", {})).toBe(-5);
  });

  it("evaluates allowed functions", () => {
    expect(safeEval("abs(-5)", {})).toBe(5);
    expect(safeEval("min(3, 7)", {})).toBe(3);
    expect(safeEval("max(3, 7)", {})).toBe(7);
    expect(safeEval("round(3.7)", {})).toBe(4);
    expect(safeEval("floor(3.7)", {})).toBe(3);
    expect(safeEval("ceil(3.2)", {})).toBe(4);
    expect(safeEval("sqrt(9)", {})).toBe(3);
    expect(safeEval("pow(2, 3)", {})).toBe(8);
  });

  it("evaluates nested function calls", () => {
    expect(safeEval("max(abs(-5), 3)", {})).toBe(5);
    expect(safeEval("min(round(3.7), 4)", {})).toBe(4);
  });

  it("handles operator precedence", () => {
    expect(safeEval("2 + 3 * 4", {})).toBe(14);
    expect(safeEval("(2 + 3) * 4", {})).toBe(20);
    expect(safeEval("2 * 3 + 4 * 5", {})).toBe(26);
  });

  it("returns 0 for empty/null expression", () => {
    expect(safeEval("", {})).toBe(0);
    expect(safeEval("   ", {})).toBe(0);
    expect(safeEval(null as unknown as string, {})).toBe(0);
  });

  it("throws on division by zero", () => {
    expect(() => safeEval("10 / 0", {})).toThrow("Division by zero");
  });

  it("throws on unknown variable", () => {
    expect(() => safeEval("unknown_var", {})).toThrow("Unknown variable");
  });

  it("throws on unknown function", () => {
    expect(() => safeEval("evil_func(1)", {})).toThrow("Unknown function");
  });

  it("throws on unsafe expressions (injection)", () => {
    expect(() => safeEval("require('child_process')", {})).toThrow("Unsafe expression");
    expect(() => safeEval("import('fs')", {})).toThrow("Unsafe expression");
    expect(() => safeEval("eval('code')", {})).toThrow("Unsafe expression");
    expect(() => safeEval("this", {})).toThrow("Unsafe expression");
    expect(() => safeEval("process.exit()", {})).toThrow("Unsafe expression");
    expect(() => safeEval("Function('return this')()", {})).toThrow("Unsafe expression");
    expect(() => safeEval("{ }", {})).toThrow("Unsafe expression");
    expect(() => safeEval("[1]", {})).toThrow("Unsafe expression");
    expect(() => safeEval("a; b", {})).toThrow("Unsafe expression");
  });

  it("throws on trailing characters", () => {
    expect(() => safeEval("1 + 2 abc", {})).toThrow("Unexpected character");
  });

  it("throws on unmatched parentheses", () => {
    expect(() => safeEval("(1 + 2", {})).toThrow();
    expect(() => safeEval("1 + 2)", {})).toThrow();
  });
});
