import { describe, test, expect } from "bun:test";
import { isoNow, plusMinutes, plusHours, minusHours, minusDays } from "./time";

describe("isoNow", () => {
  test("returns valid ISO string", () => {
    const result = isoNow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(result).toISOString()).toBe(result);
  });
});

describe("plusMinutes", () => {
  test("adds minutes to date", () => {
    const base = new Date("2026-01-01T12:00:00Z");
    const result = plusMinutes(base, 30);
    expect(result.toISOString()).toBe("2026-01-01T12:30:00.000Z");
  });

  test("handles negative minutes", () => {
    const base = new Date("2026-01-01T12:00:00Z");
    const result = plusMinutes(base, -15);
    expect(result.toISOString()).toBe("2026-01-01T11:45:00.000Z");
  });
});

describe("plusHours", () => {
  test("adds hours to date", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const result = plusHours(base, 5);
    expect(result.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });
});

describe("minusHours", () => {
  test("subtracts hours from date", () => {
    const base = new Date("2026-01-01T10:00:00Z");
    const result = minusHours(base, 3);
    expect(result.toISOString()).toBe("2026-01-01T07:00:00.000Z");
  });
});

describe("minusDays", () => {
  test("subtracts days from date", () => {
    const base = new Date("2026-01-15T12:00:00Z");
    const result = minusDays(base, 10);
    expect(result.toISOString()).toBe("2026-01-05T12:00:00.000Z");
  });
});
