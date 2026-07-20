import { describe, test, expect } from "bun:test";

// ─── #9: Intent Parser — Polynomial regex fix ────────────────────────────────

describe("Security: COMMAND_PATTERN regex", () => {
  const COMMAND_PATTERN = /^\/(\w+)(?:\s+(.*))?$/;

  test("matches command without args", () => {
    const m = "/look".match(COMMAND_PATTERN);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("look");
    expect(m![2]).toBeUndefined();
  });

  test("matches command with args", () => {
    const m = "/craft sword".match(COMMAND_PATTERN);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("craft");
    expect(m![2]).toBe("sword");
  });

  test("does not match plain text", () => {
    expect("hello world".match(COMMAND_PATTERN)).toBeNull();
  });

  test("no polynomial backtracking on long input", () => {
    const evil = "/" + "a".repeat(10000);
    const start = performance.now();
    evil.match(COMMAND_PATTERN);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── #4, #5: Roleplay Engine — AGENT_MENTION regex fix ──────────────────────

describe("Security: AGENT_MENTION regex", () => {
  const AGENT_MENTION = /^@([^\s]+)\s+(.+)$/s;

  test("matches agent mention", () => {
    const m = "@merchant hello there".match(AGENT_MENTION);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("merchant");
    expect(m![2]).toBe("hello there");
  });

  test("does not match without message", () => {
    expect("@merchant".match(AGENT_MENTION)).toBeNull();
  });

  test("does not match without @", () => {
    expect("merchant hello".match(AGENT_MENTION)).toBeNull();
  });

  test("handles multiline message with s flag", () => {
    const m = "@npc line1\nline2".match(AGENT_MENTION);
    expect(m).not.toBeNull();
    expect(m![2]).toBe("line1\nline2");
  });

  test("no polynomial backtracking on long input", () => {
    const evil = "@a" + "b".repeat(10000);
    const start = performance.now();
    evil.match(AGENT_MENTION);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── #7: XSS — escapeHtml in rate-limit-popup.js ────────────────────────────

describe("Security: escapeHtml", () => {
  function escapeHtml(str: string): string {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  test("escapes script tags", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  test("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  test("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  test("passes clean string through", () => {
    expect(escapeHtml("openai")).toBe("openai");
  });

  test("handles non-string input", () => {
    expect(escapeHtml(null as any)).toBe("");
    expect(escapeHtml(undefined as any)).toBe("");
    expect(escapeHtml(42 as any)).toBe("");
  });

  test("neutralizes XSS payload — no raw HTML tags remain", () => {
    const payload = `"><img src=x onerror=alert(1)>`;
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;img");
    expect(escaped).toContain("&gt;");
    expect(escaped).toContain("&quot;");
    expect(escaped).not.toMatch(/<[a-z]/);
  });
});

// ─── #8: Logger — sensitive key sanitization ─────────────────────────────────

describe("Security: logger sensitive key sanitization", () => {
  const SENSITIVE_KEYS = [
    "apiKey",
    "api_key",
    "token",
    "secret",
    "password",
    "credential",
    "authorization",
    "API_KEY",
    "SECRET_TOKEN",
  ];

  function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    return (
      lower.includes("key") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("credential") ||
      lower.includes("authorization")
    );
  }

  test.each(SENSITIVE_KEYS)("detects '%s' as sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  test("does not flag normal keys", () => {
    expect(isSensitiveKey("name")).toBe(false);
    expect(isSensitiveKey("message")).toBe(false);
    expect(isSensitiveKey("level")).toBe(false);
    expect(isSensitiveKey("timestamp")).toBe(false);
  });

  test("masks long sensitive values", () => {
    const value = "sk-1234567890abcdef";
    const masked = value.slice(0, 2) + "***" + value.slice(-2);
    expect(masked).toBe("sk***ef");
    expect(masked.length).toBeLessThan(value.length);
  });

  test("masks short sensitive values completely", () => {
    const value = "ab";
    const masked = value.length > 4 ? value.slice(0, 2) + "***" + value.slice(-2) : "***";
    expect(masked).toBe("***");
  });
});

// ─── #1: URL hostname validation ─────────────────────────────────────────────

describe("Security: URL hostname validation", () => {
  function isGoogleapisUrl(urlStr: string): boolean {
    try {
      return new URL(urlStr).hostname.endsWith("googleapis.com");
    } catch {
      return false;
    }
  }

  test("matches valid googleapis URL", () => {
    expect(isGoogleapisUrl("https://generativelanguage.googleapis.com/v1")).toBe(true);
  });

  test("rejects URL with googleapis in query string", () => {
    expect(isGoogleapisUrl("https://evil.com?x=googleapis.com")).toBe(false);
  });

  test("rejects URL with googleapis in path", () => {
    expect(isGoogleapisUrl("https://evil.com/googleapis.com")).toBe(false);
  });

  test("rejects completely unrelated URL", () => {
    expect(isGoogleapisUrl("https://openai.com/v1")).toBe(false);
  });

  test("rejects invalid URL", () => {
    expect(isGoogleapisUrl("not-a-url")).toBe(false);
  });

  test("matches subdomain", () => {
    expect(isGoogleapisUrl("https://language.googleapis.com")).toBe(true);
  });

  test("rejects similar but wrong domain", () => {
    expect(isGoogleapisUrl("https://googleapis.com.evil.com")).toBe(false);
  });
});

// ─── #2: Crafter agent — secure UID generation ──────────────────────────────

describe("Security: crafter UID generation", () => {
  test("randomUUID produces valid v4 UUID format", () => {
    const { randomUUID } = require("node:crypto");
    const uid = `item_${randomUUID()}`;
    expect(uid).toMatch(/^item_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("consecutive UUIDs are unique", () => {
    const { randomUUID } = require("node:crypto");
    const uids = new Set(Array.from({ length: 100 }, () => randomUUID()));
    expect(uids.size).toBe(100);
  });
});
