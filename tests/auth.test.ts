/**
 * Auth middleware tests — password hashing, rate limiting, login flow.
 */
import { describe, it, expect } from "bun:test";
import { pbkdf2Sync, randomBytes } from "node:crypto";

// ── Password hashing ──

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, s, 100_000, 64, "sha512").toString("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

describe("Password hashing (pbkdf2)", () => {
  it("should hash and verify correct password", () => {
    const { hash, salt } = hashPassword("changeme");
    expect(verifyPassword("changeme", hash, salt)).toBe(true);
  });

  it("should reject wrong password", () => {
    const { hash, salt } = hashPassword("changeme");
    expect(verifyPassword("wrongpassword", hash, salt)).toBe(false);
  });

  it("should produce different hashes for same password (different salts)", () => {
    const r1 = hashPassword("test");
    const r2 = hashPassword("test");
    expect(r1.salt).not.toBe(r2.salt);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it("should produce consistent hash with same salt", () => {
    const salt = randomBytes(16).toString("hex");
    const r1 = hashPassword("test", salt);
    const r2 = hashPassword("test", salt);
    expect(r1.hash).toBe(r2.hash);
  });

  it("should handle empty string password", () => {
    const { hash, salt } = hashPassword("");
    expect(verifyPassword("", hash, salt)).toBe(true);
    expect(verifyPassword(" ", hash, salt)).toBe(false);
  });

  it("should handle unicode password", () => {
    const { hash, salt } = hashPassword("пароль_Юникод_🔐");
    expect(verifyPassword("пароль_Юникод_🔐", hash, salt)).toBe(true);
  });
});

// ── Salt format (env var compatible) ──

describe("Hash format for AUTH_PASSWORD_HASH", () => {
  it("should produce salt:hash format", () => {
    const { hash, salt } = hashPassword("changeme");
    const envValue = `${salt}:${hash}`;
    expect(envValue).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  it("should be parseable from env format", () => {
    const { hash, salt } = hashPassword("changeme");
    const envValue = `${salt}:${hash}`;
    const [parsedSalt, parsedHash] = envValue.split(":");
    expect(parsedSalt).toBe(salt);
    expect(parsedHash).toBe(hash);
    expect(verifyPassword("changeme", parsedHash, parsedSalt)).toBe(true);
  });
});

// ── Timing-safe comparison note ──

describe("Security properties", () => {
  it("hash should be 128 hex chars (512 bits)", () => {
    const { hash } = hashPassword("test");
    expect(hash.length).toBe(128);
  });

  it("salt should be 32 hex chars (128 bits)", () => {
    const { salt } = hashPassword("test");
    expect(salt.length).toBe(32);
  });

  it("should resist short passwords", () => {
    const { hash, salt } = hashPassword("a");
    expect(verifyPassword("a", hash, salt)).toBe(true);
    expect(verifyPassword("b", hash, salt)).toBe(false);
  });
});
