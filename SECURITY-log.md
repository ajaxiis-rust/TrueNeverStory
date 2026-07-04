# Security Change Log

Track all security-related changes to TrueNeverStory.

---

## 2026-07-04 — Security Hardening

Based on security audit (security.md). All HIGH and MEDIUM findings addressed.

| Task | Finding | Fix | File(s) |
|------|---------|-----|---------|
| T1 | H1: WebSocket auth bypass | Validate session token, not just cookie presence | `src/index.ts`, `src/middleware/auth.ts` |
| T2 | H2: Static file path traversal | Add path containment check | `src/app.ts` |
| T3 | H3: Chapter filename traversal | Validate filename regex | `src/routes/worlds.ts` |
| T4 | L6: World name traversal | Validate world names against `[a-zA-Z0-9_-]` | `src/routes/worlds.ts` |
| T5 | M3: Missing Secure cookie flag | Add `Secure` to Set-Cookie | `src/middleware/auth.ts` |
| T6 | M4: Rate limiter IP spoofing | Shared `getClientIp` helper | `src/middleware/auth.ts`, `src/middleware/rate-limiter.ts` |
| T7 | M5: CSP unsafe-inline | Add `base-uri` and `form-action` restrictions | `src/middleware/security-headers.ts` |
| T8 | L1: Plaintext password storage | Already handled — exported `hashPassword` for reuse | `src/middleware/auth.ts` |
| T9 | L2: Error message leakage | Generic error messages to clients | `src/routes/chat.ts`, `src/routes/worlds.ts` |
| T10 | L3: Unbounded login attempts | Periodic cleanup of stale entries | `src/middleware/auth.ts` |
| T11 | L4: Missing CSRF on login | CSRF token with cookie double-submit | `src/middleware/auth.ts` |
| T12 | M2: In-memory sessions | SQLite-backed session store with auto-cleanup | `src/lib/session-store.ts`, `src/middleware/auth.ts`, `src/index.ts` |

### Not addressed (deferred)

- **M5 full: Remove unsafe-inline** — Requires HTML refactoring; tracked for future
- **L5: Persist lockout state** — Requires SQLite schema change; tracked for future

---
