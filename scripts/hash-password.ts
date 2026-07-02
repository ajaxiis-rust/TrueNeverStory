#!/usr/bin/env bun
/**
 * Generate pbkdf2 hash for AUTH_PASSWORD_HASH.
 * Usage: bun scripts/hash-password.ts <password>
 * Output: paste into .env as AUTH_PASSWORD_HASH=salt:hash
 */
import { randomBytes, pbkdf2Sync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: bun scripts/hash-password.ts <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");

console.log(`AUTH_PASSWORD_HASH=${salt}:${hash}`);
